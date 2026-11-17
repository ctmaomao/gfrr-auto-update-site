#!/usr/bin/env node
// Preserve the reviewed bytes first; a date and digest must be supplied at every stage.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeeklyReports, splitIssues } from './build-weekly-reports.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function identity(date, sha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Expected a real YYYY-MM-DD issue date');
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('Expected a lowercase SHA-256 digest');
}
export function validateOriginal(bytes, date, sha) {
  identity(date, sha);
  if (hash(bytes) !== sha) throw new Error('Original SHA-256 does not match the explicitly expected digest');
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<base\b/i.test(html)) throw new Error('Report may not redefine the base URL');
  const [year, month, day] = date.split('-').map(Number);
  const title = html.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1] || '';
  if (!title.includes(date) && !title.includes(`${year}年${month}月${day}日`)) throw new Error('Report title does not identify the expected issue date');
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
export function saveOriginal({ root = defaultRoot, source, date, sha }) {
  const bytes = readFileSync(source);
  validateOriginal(bytes, date, sha);
  const dir = resolve(root, 'weekly-originals', date);
  // Claim the date before writing the content, so competing digests cannot both win.
  // An interrupted write may resume only with the same expected identity.
  immutableWrite(resolve(dir, 'identity.sha256'), Buffer.from(sha + '\n'));
  const dest = originalPath(root, date, sha);
  immutableWrite(dest, bytes);
  validateOriginal(readFileSync(dest), date, sha);
  return dest;
}
export function installOriginal({ root = defaultRoot, date, sha }) {
  identity(date, sha);
  if (readFileSync(resolve(root, 'weekly-originals', date, 'identity.sha256'), 'utf8') !== sha + '\n') throw new Error('Stored issue identity differs from expected digest');
  const bytes = readFileSync(originalPath(root, date, sha));
  validateOriginal(bytes, date, sha);
  const dest = resolve(root, 'reports', date + '.html');
  immutableWrite(dest, bytes);
  validateOriginal(readFileSync(dest), date, sha);
  return dest;
}
export function checkIssue({ root = defaultRoot, date, sha }) {
  identity(date, sha);
  if (readFileSync(resolve(root, 'weekly-originals', date, 'identity.sha256'), 'utf8') !== sha + '\n') throw new Error('Stored issue identity differs from expected digest');
  const bytes = readFileSync(originalPath(root, date, sha));
  validateOriginal(bytes, date, sha);
  if (!readFileSync(resolve(root, 'reports', date + '.html')).equals(bytes)) throw new Error('Fixed report differs from original');
  const latest = splitIssues(readdirSync(resolve(root, 'reports'))).recent[0];
  if (latest !== date + '.html') throw new Error('Expected issue is not the latest report');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, date, sha, source, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !['save', 'install', 'prepare', 'check'].includes(action) || (action === 'save' ? !source : source)) throw new Error('Usage: weekly-original.mjs save DATE SHA256 SOURCE | prepare DATE SHA256 | check DATE SHA256');
    if (action === 'save') console.log(saveOriginal({ source, date, sha }));
    else if (action === 'install') console.log(installOriginal({ date, sha }));
    else if (action === 'prepare') {
      const latest = splitIssues(readdirSync(resolve(defaultRoot, 'reports'))).recent[0];
      identity(date, sha);
      if (latest && latest > date + '.html') throw new Error('Expected issue would not be latest');
      installOriginal({ date, sha });
      buildWeeklyReports();
      checkIssue({ date, sha });
      buildWeeklyReports({ check: true });
    } else { checkIssue({ date, sha }); buildWeeklyReports({ check: true }); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
