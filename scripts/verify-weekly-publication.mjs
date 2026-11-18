#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity, MAX_WEEKLY_BYTES, validateOriginal } from './weekly-original.mjs';
import { expectedWeeklyPages, splitIssues } from './build-weekly-reports.mjs';
import { PUBLISHED_SITE_BASES, readPublishedBytes } from './lib/published-site-read.mjs';
import { issueKeyFromFilename, parseIssueReceipt, samePredecessor, validatePredecessor } from './weekly-issue-identity.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sites = Object.values(PUBLISHED_SITE_BASES);
const readbackErrors = { request_timeout: 'response timed out', body_too_large: 'response too large',
  unexpected_url: 'unexpected response URL', empty_body: 'response body unavailable', network_error: 'request failed' };
const sha256 = data => createHash('sha256').update(data).digest('hex');
function gitFile(commit, path) { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 }); }
function gitNames(commit) { return execFileSync('git', ['ls-tree', '--name-only', `${commit}:reports`], { cwd: root, encoding: 'utf8' }).trim().split('\n'); }
function hrefs(body, base) {
  return [...body.matchAll(/\bhref="([^"]+)"/g)].map(m => new URL(m[1], base).href);
}
export async function verifyPublication({ date, sha, commit, read = gitFile, list = gitNames, fetcher = fetch }) {
  const issue = identity(date, sha);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full source commit SHA is required');
  const original = read(commit, `weekly-originals/${date}/${sha}.html`);
  validateOriginal(original, date, sha);
  if (read(commit, `weekly-originals/${date}/identity.sha256`).toString() !== sha + '\n') throw new Error('Committed original identity mismatch');
  if (issue.revision > 1) {
    const readJson = path => JSON.parse(read(commit, path).toString('utf8'));
    const receipt = parseIssueReceipt(readJson(`weekly-originals/${date}/handoff.json`));
    const expected = parseIssueReceipt(readJson('weekly-originals/expected.json'));
    const predecessor = validatePredecessor(issue, sha, readJson(`weekly-originals/${date}/predecessor.json`));
    if (receipt.issue.key !== date || expected.issue.key !== date || receipt.sha256 !== sha || expected.sha256 !== sha ||
        receipt.handoffCommit !== expected.handoffCommit || !samePredecessor(receipt.predecessor, predecessor) ||
        !samePredecessor(expected.predecessor, predecessor)) throw new Error('Committed revision identity or predecessor does not match the expected issue');
  }
  const names = list(commit);
  const { recent, archived } = splitIssues(names);
  if (recent[0] !== date + '.html') throw new Error('Expected issue is not latest in committed artifact');
  const shellPaths = ['weekly-reports.html', 'weekly-reports/index.html', 'reports/archive.html'];
  const otherPublishedVersions = [...recent, ...archived].filter(name => name !== date + '.html' && issueKeyFromFilename(name).date === issue.date);
  const priorPaths = otherPublishedVersions.flatMap(name => ['reports/' + name, 'weekly-reports/' + name]);
  const paths = [`reports/${date}.html`, `weekly-reports/${date}.html`, ...shellPaths, ...priorPaths];
  const committed = new Map(paths.map(path => [path, read(commit, path)]));
  if (!committed.get(paths[0]).equals(original) || !committed.get(paths[1]).equals(original)) throw new Error('Committed fixed reports do not match the reviewed original');
  const generated = expectedWeeklyPages({ names, readFile: path => read(commit, path).toString('utf8') });
  for (const path of [...shellPaths, `weekly-reports/${date}.html`, ...otherPublishedVersions.map(name => 'weekly-reports/' + name)]) {
    if (committed.get(path).toString('utf8') !== generated.get(path)) throw new Error(`Committed generated page differs from complete issue and archive: ${path}`);
  }
  const receipts = [];
  for (const site of sites) {
    for (const path of paths) {
      const url = new URL(path, site);
      const { bytes: body, error, httpStatus } = await readPublishedBytes(url, fetcher, 15000, MAX_WEEKLY_BYTES);
      if (error) throw new Error(`${url.href}: ${error === 'http_error' ? `HTTP ${httpStatus}` : readbackErrors[error]}`);
      if (!body.equals(committed.get(path))) throw new Error(`${url.href}: bytes differ from committed artifact`);
      const links = hrefs(body.toString('utf8'), url);
      const contains = target => links.includes(new URL(target, site).href);
      if (path === 'weekly-reports.html' || path === 'weekly-reports/index.html') {
        if (!contains(`reports/${date}.html`) || !contains('reports/archive.html')) throw new Error(`${url.href}: latest/history links do not resolve to expected paths`);
      }
      if (shellPaths.includes(path)) {
        const toolbar = /<nav class="weekly-shell-actions"[^>]*>([\s\S]*?)<\/nav>/.exec(body.toString('utf8'))?.[1] || '';
        const download = /<a href="([^"]+)" download="([^"]+)">下载单文件HTML<\/a>/.exec(toolbar);
        if (!download || new URL(download[1], url).href !== new URL(paths[0], site).href || download[2] !== `GFRR_Weekly_${date}.html` ||
            !hrefs(toolbar, url).includes(new URL('weekly-reports.html#history', site).href)) throw new Error(`${url.href}: weekly shell links or download identity are wrong`);
      }
      if (path === 'reports/archive.html' && !contains('weekly-reports.html#history')) throw new Error(`${url.href}: history return link is wrong`);
      receipts.push({ url: url.href, sha256: sha256(body) });
    }
  }
  return receipts;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [date, sha, commit, ...extra] = process.argv.slice(2);
  if (extra.length || !date || !sha || !commit) { console.error('Usage: verify-weekly-publication.mjs ISSUE SHA256 SOURCE_COMMIT'); process.exitCode = 1; }
  else verifyPublication({ date, sha, commit }).then(result => console.log(JSON.stringify({ comparison_commit: commit, date, deployment_source: 'not_verified', receipts: result }, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
