#!/usr/bin/env node
// Preserve the reviewed bytes first; a date and digest must be supplied at every stage.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildWeeklyReports, checkWeeklyPageSizes, expectedWeeklyPages, splitIssues } from './build-weekly-reports.mjs';
import { readRemoteHandoff } from './weekly-remote-handoff.mjs';
import { compareIssueKeys, issueKeyFromFilename, makeIssueReceipt, parseIssueKey, parseIssueReceipt, samePredecessor, validatePredecessor, validateSha } from './weekly-issue-identity.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_WEEKLY_BYTES = 2 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function identity(date, sha) {
  const issue = parseIssueKey(date);
  validateSha(sha);
  return issue;
}
// Recognize only the metadata syntax used by standalone weekly reports. A title in
// a comment, template, script, body/SVG, or a head-like fragment is not document identity.
const htmlSpace = String.raw`[\t\n\f\r ]`;
const attrName = '[A-Za-z_:][A-Za-z0-9_.:-]*';
const attrValue = String.raw`(?:"[^"\0]*"|'[^'\0]*'|[^\t\n\f\r "'=< >\x60\0]+)`;
const attribute = `${htmlSpace}+${attrName}(?:${htmlSpace}*=${htmlSpace}*${attrValue})?`;
const openTag = (name, voidTag = false) => `<${name}(?:${attribute})*${htmlSpace}*${voidTag ? '/?' : ''}>`;
const prolog = new RegExp(`^\uFEFF?${htmlSpace}*<!doctype${htmlSpace}+html${htmlSpace}*>${htmlSpace}*${openTag('html')}${htmlSpace}*${openTag('head')}`, 'i');
const headClose = new RegExp(`^</head${htmlSpace}*>`, 'i');
const bodyOpen = new RegExp(`^${openTag('body')}`, 'i');
const headMeta = new RegExp(`^${openTag('(?:meta|link)', true)}`, 'i');
const headStyleStart = new RegExp(`^${openTag('style')}`, 'i');
const possibleStyleEnd = new RegExp(`</style(?=${htmlSpace}|[/>])`, 'i');
const headStyleEnd = new RegExp(`^</style${htmlSpace}*>`, 'i');
const headTitle = new RegExp(`^${openTag('title')}([^<]*)</title${htmlSpace}*>`, 'i');
const unambiguousComment = /^<!--(?!-?>)(?:(?!--)[\s\S])*-->/;
const leadingHtmlSpace = new RegExp(`^${htmlSpace}*`);

export function weeklyDocumentBoundaries(html) {
  const start = prolog.exec(html);
  if (!start) throw new Error('Report requires one unambiguous document head before its identity title');
  let cursor = start[0].length;
  let title;
  while (cursor < html.length) {
    cursor += leadingHtmlSpace.exec(html.slice(cursor))[0].length;
    const rest = html.slice(cursor);
    const close = headClose.exec(rest);
    let bodyStart = cursor + (close?.[0].length ?? 0);
    if (close) bodyStart += leadingHtmlSpace.exec(html.slice(bodyStart))[0].length;
    const body = bodyOpen.exec(html.slice(bodyStart));
    if (body) {
      if (title === undefined) throw new Error('Report must have one identity title');
      return { title, headCloseStart: close ? cursor : null, bodyStart, bodyEnd: bodyStart + body[0].length };
    }
    const titleMatch = headTitle.exec(rest);
    const style = headStyleStart.exec(rest);
    if (style) {
      const css = rest.slice(style[0].length);
      const end = possibleStyleEnd.exec(css);
      const finish = end && headStyleEnd.exec(css.slice(end.index));
      if (!finish) throw new Error('Report head contains an ambiguous style terminator');
      cursor += style[0].length + end.index + finish[0].length;
      continue;
    }
    const token = titleMatch || unambiguousComment.exec(rest) || headMeta.exec(rest);
    if (!token) throw new Error('Report head has ambiguous or unsupported metadata before the body');
    if (titleMatch) {
      if (title !== undefined) throw new Error('Report must have one identity title');
      title = { text: titleMatch[1], start: cursor, end: cursor + titleMatch[0].length };
    }
    cursor += token[0].length;
  }
  throw new Error('Report head is incomplete');
}

function validateTitle(html, issue) {
  const title = weeklyDocumentBoundaries(html).title.text.normalize('NFKC').trim();
  const canonical = /^(?:(?:GFRR )?(?:全球金融系统性风险周报|周报)(?: *[|·] *| +))?(\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日)(?:(?: *[|·] *| +)第 *([1-9]\d?) *版(\(首次修订\))?)?$/u.exec(title);
  if (!canonical) throw new Error('Report title must identify one canonical issue date and revision');
  const [, titleDate, version, firstRevisionLabel] = canonical;
  const [year, month, day] = issue.date.split('-').map(Number);
  if (titleDate !== issue.date && titleDate !== `${year}年${month}月${day}日`) throw new Error('Report title does not identify the expected issue date');
  if (Number(version || 1) !== issue.revision || (firstRevisionLabel && issue.revision !== 2)) throw new Error('Report title does not identify the expected revision');
}
export function validateOriginal(bytes, date, sha) {
  const issue = identity(date, sha);
  if (bytes.length > MAX_WEEKLY_BYTES) throw new Error('Original exceeds weekly 2 MiB limit');
  if (hash(bytes) !== sha) throw new Error('Original SHA-256 does not match the explicitly expected digest');
  // Retain an optional UTF-8 BOM so validation and shell generation use the same offsets.
  const html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (/<base\b/i.test(html)) throw new Error('Report may not redefine the base URL');
  validateTitle(html, issue);
  if (!/^\s*<!doctype\s+html\s*>/i.test(html) || !/<html\b/i.test(html) || !/<head\b/i.test(html) || !/<body\b/i.test(html) || !/<main\b/i.test(html) || !/<\/main\s*>/i.test(html) || !/<\/body\s*>\s*<\/html\s*>\s*$/i.test(html)) throw new Error('Incomplete standalone HTML document');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] || '';
  const sections = [...main.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section\s*>/gi)];
  if (!sections.length || sections.some(match => !match[1].replace(/<[^>]*>/g, '').trim()) || (main.match(/<section\b/gi) || []).length !== sections.length) throw new Error('Report sections are missing, empty or incomplete');
  return html;
}
function immutableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (!readFileSync(path).equals(bytes)) throw new Error(`Refusing to overwrite ${path}`);
    return;
  }
  const temp = path + '.' + randomUUID() + '.tmp';
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(temp, path); } catch (error) {
    if (error.code !== 'EEXIST' || !readFileSync(path).equals(bytes)) throw error;
  } finally { unlinkSync(temp); }
  if (!readFileSync(path).equals(bytes)) throw new Error(`Readback mismatch: ${path}`);
}
function originalPath(root, date, sha) { return resolve(root, 'weekly-originals', date, sha + '.html'); }
function ensureNotOlder(latest, issue) {
  if (latest && compareIssueKeys(issueKeyFromFilename(latest), issue) > 0) throw new Error('Expected issue would not be latest');
}
export function readStoredPredecessor(root, issue, sha) {
  if (issue.revision === 1) return undefined;
  return validatePredecessor(issue, sha, JSON.parse(readFileSync(resolve(root, 'weekly-originals', issue.key, 'predecessor.json'), 'utf8')));
}
export function saveOriginal({ root = defaultRoot, source, date, sha, predecessor }) {
  const issue = identity(date, sha);
  const prior = validatePredecessor(issue, sha, predecessor);
  const bytes = readFileSync(source);
  validateOriginal(bytes, date, sha);
  const reportsDir = resolve(root, 'reports');
  const name = date + '.html';
  const names = existsSync(reportsDir) ? readdirSync(reportsDir) : [];
  const latest = splitIssues(names).recent[0];
  ensureNotOlder(latest, issue);
  for (const path of [resolve(reportsDir, name), resolve(root, 'weekly-reports', name)]) {
    if (existsSync(path) && !readFileSync(path).equals(bytes)) throw new Error(`Refusing to overwrite ${path}`);
  }
  const allNames = names.includes(name) ? names : [...names, name];
  const preview = expectedWeeklyPages({ names: allNames, readFile: path => path === `reports/${name}` ? bytes.toString('utf8') : readFileSync(resolve(root, path), 'utf8') });
  checkWeeklyPageSizes(preview);
  const dir = resolve(root, 'weekly-originals', date);
  // Claim this edition before writing the content, so competing digests cannot both win.
  // An interrupted write may resume only with the same expected identity and predecessor.
  if (prior) immutableWrite(resolve(dir, 'predecessor.json'), Buffer.from(JSON.stringify(prior) + '\n'));
  immutableWrite(resolve(dir, 'identity.sha256'), Buffer.from(sha + '\n'));
  const dest = originalPath(root, date, sha);
  immutableWrite(dest, bytes);
  validateOriginal(readFileSync(dest), date, sha);
  return dest;
}
function assertHandoffPin(receipt, pin) {
  if (pin && (receipt.commit !== pin.handoffCommit || !samePredecessor(receipt.predecessor, pin.predecessor))) {
    throw new Error('Remote revision differs from the explicitly pinned handoff or predecessor');
  }
}
function recoverHandoff({ root = defaultRoot, date, sha, readRemote, pin }) {
  const issue = identity(date, sha);
  if (issue.revision > 1 && !pin) throw new Error('Revision recovery requires the explicitly pinned handoff and predecessor');
  const receipt = readRemote({ date, sha });
  assertHandoffPin(receipt, pin);
  validateOriginal(receipt.bytes, date, sha);
  const { predecessor } = makeIssueReceipt(issue, sha, receipt.commit, receipt.predecessor);
  const dir = mkdtempSync(join(tmpdir(), 'gfrr-weekly-recovery-'));
  try {
    const input = join(dir, 'original.html');
    writeFileSync(input, receipt.bytes, { flag: 'wx' });
    saveOriginal({ root, source: input, date, sha, predecessor });
    return receipt;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
export function recoverRemoteOriginal(options) {
  return recoverHandoff(options).commit;
}
export function writeHandoffReceipt({ root = defaultRoot, date, sha, commit, predecessor }) {
  const receipt = makeIssueReceipt(identity(date, sha), sha, commit, predecessor);
  immutableWrite(resolve(root, 'weekly-originals', date, 'handoff.json'), Buffer.from(JSON.stringify(receipt) + '\n'));
}
function withPublicationLock(root, run) {
  const dir = resolve(root, 'weekly-originals');
  mkdirSync(dir, { recursive: true });
  const lock = resolve(dir, '.prepare.lock');
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another weekly prepare or identity write holds .prepare.lock; do not overwrite it');
    throw error;
  }
  try {
    writeFileSync(fd, process.pid + '\n');
    closeSync(fd);
    fd = undefined;
    return run();
  } finally {
    if (fd !== undefined) closeSync(fd);
    unlinkSync(lock);
  }
}
function writeExpectedIssueLocked({ root, date, sha, commit, predecessor }) {
  const issue = identity(date, sha);
  const receipt = makeIssueReceipt(issue, sha, commit, predecessor);
  const dir = resolve(root, 'weekly-originals');
  const target = resolve(dir, 'expected.json');
  if (existsSync(target)) {
    const previous = parseIssueReceipt(JSON.parse(readFileSync(target, 'utf8')));
    const comparison = compareIssueKeys(previous.issue, issue);
    if (comparison > 0 || (comparison === 0 && (previous.sha256 !== sha || previous.handoffCommit !== commit || !samePredecessor(previous.predecessor, receipt.predecessor)))) throw new Error('Refusing to replace conflicting expected issue');
  }
  const temp = target + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify(receipt) + '\n', { flag: 'wx' });
  try { renameSync(temp, target); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}
export function writeExpectedIssue(options) {
  const root = options.root ?? defaultRoot;
  return withPublicationLock(root, () => writeExpectedIssueLocked({ ...options, root }));
}
export function installOriginal({ root = defaultRoot, date, sha }) {
  readStoredPredecessor(root, identity(date, sha), sha);
  if (readFileSync(resolve(root, 'weekly-originals', date, 'identity.sha256'), 'utf8') !== sha + '\n') throw new Error('Stored issue identity differs from expected digest');
  const bytes = readFileSync(originalPath(root, date, sha));
  validateOriginal(bytes, date, sha);
  const dest = resolve(root, 'reports', date + '.html');
  immutableWrite(dest, bytes);
  validateOriginal(readFileSync(dest), date, sha);
  return dest;
}
export function checkIssue({ root = defaultRoot, date, sha }) {
  readStoredPredecessor(root, identity(date, sha), sha);
  if (readFileSync(resolve(root, 'weekly-originals', date, 'identity.sha256'), 'utf8') !== sha + '\n') throw new Error('Stored issue identity differs from expected digest');
  const bytes = readFileSync(originalPath(root, date, sha));
  validateOriginal(bytes, date, sha);
  if (!readFileSync(resolve(root, 'reports', date + '.html')).equals(bytes)) throw new Error('Fixed report differs from original');
  const latest = splitIssues(readdirSync(resolve(root, 'reports'))).recent[0];
  if (latest !== date + '.html') throw new Error('Expected issue is not the latest report');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, date, sha, ...args] = process.argv.slice(2);
  try {
    const usage = 'Usage: weekly-original.mjs save ISSUE SHA256 SOURCE [PREDECESSOR_SHA PREDECESSOR_COMMIT] | install ISSUE SHA256 | prepare/check ISSUE SHA256 [HANDOFF_COMMIT PREDECESSOR_SHA PREDECESSOR_COMMIT]';
    if (!['save', 'install', 'prepare', 'check'].includes(action)) throw new Error(usage);
    const issue = identity(date, sha);
    const revision = issue.revision > 1;
    const expectedArgs = action === 'save' ? (revision ? 3 : 1) : action !== 'install' && revision ? 3 : 0;
    if (args.length !== expectedArgs) throw new Error(usage);
    const [sourceOrCommit, predecessorSha, predecessorCommit] = args;
    const predecessor = revision ? { sha256: predecessorSha, handoffCommit: predecessorCommit } : undefined;
    const pin = revision && (action === 'prepare' || action === 'check') ? makeIssueReceipt(issue, sha, sourceOrCommit, predecessor) : undefined;
    if (action === 'save') {
      console.log(saveOriginal({ source: sourceOrCommit, date, sha, predecessor }));
    }
    else if (action === 'install') console.log(installOriginal({ date, sha }));
    else if (action === 'prepare') {
      withPublicationLock(defaultRoot, () => {
        const latest = splitIssues(readdirSync(resolve(defaultRoot, 'reports'))).recent[0];
        ensureNotOlder(latest, issue);
        const { commit: remoteCommit, predecessor } = recoverHandoff({ date, sha, readRemote: readRemoteHandoff, pin });
        console.log('Verified remote handoff commit: ' + remoteCommit);
        writeHandoffReceipt({ date, sha, commit: remoteCommit, predecessor });
        writeExpectedIssueLocked({ root: defaultRoot, date, sha, commit: remoteCommit, predecessor });
        installOriginal({ date, sha });
        buildWeeklyReports();
        checkIssue({ date, sha });
        buildWeeklyReports({ check: true });
      });
    } else {
      const receipt = readRemoteHandoff({ date, sha });
      assertHandoffPin(receipt, pin);
      checkIssue({ date, sha });
      const expected = parseIssueReceipt(JSON.parse(readFileSync(resolve(defaultRoot, 'weekly-originals/expected.json'), 'utf8')));
      if (expected.issue.key !== date || expected.sha256 !== sha || expected.handoffCommit !== receipt.commit ||
          !samePredecessor(expected.predecessor, receipt.predecessor) ||
          !samePredecessor(readStoredPredecessor(defaultRoot, expected.issue, sha), receipt.predecessor)) throw new Error('Expected issue does not match the remote handoff');
      if (!readFileSync(originalPath(defaultRoot, date, sha)).equals(receipt.bytes)) throw new Error('Remote handoff differs from local original');
      buildWeeklyReports({ check: true });
      console.log('Verified remote handoff commit: ' + receipt.commit);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
