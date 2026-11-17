#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOriginal } from './weekly-original.mjs';
import { expectedWeeklyPages, splitIssues } from './build-weekly-reports.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sites = ['https://ctmaomao.github.io/gfrr-auto-update-site/', 'https://radar.gfrfinradar.uk/'];
const sha256 = data => createHash('sha256').update(data).digest('hex');
function gitFile(commit, path) { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 }); }
function gitNames(commit) { return execFileSync('git', ['ls-tree', '--name-only', `${commit}:reports`], { cwd: root, encoding: 'utf8' }).trim().split('\n'); }
function hrefs(body, base) {
  return [...body.matchAll(/\bhref="([^"]+)"/g)].map(m => new URL(m[1], base).href);
}
export async function verifyPublication({ date, sha, commit, read = gitFile, list = gitNames, fetcher = fetch }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-f0-9]{64}$/.test(sha)) throw new Error('Expected issue date and SHA-256 are required');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full source commit SHA is required');
  const original = read(commit, `weekly-originals/${date}/${sha}.html`);
  validateOriginal(original, date, sha);
  if (read(commit, `weekly-originals/${date}/identity.sha256`).toString() !== sha + '\n') throw new Error('Committed original identity mismatch');
  const paths = [`reports/${date}.html`, `weekly-reports/${date}.html`, 'weekly-reports.html', 'weekly-reports/index.html', 'reports/archive.html'];
  const committed = new Map(paths.map(path => [path, read(commit, path)]));
  if (!committed.get(paths[0]).equals(original) || !committed.get(paths[1]).equals(original)) throw new Error('Committed fixed reports do not match the reviewed original');
  const names = list(commit);
  if (splitIssues(names).recent[0] !== date + '.html') throw new Error('Expected issue is not latest in committed artifact');
  const generated = expectedWeeklyPages({ names, readFile: path => read(commit, path).toString('utf8') });
  for (const path of ['weekly-reports.html', 'weekly-reports/index.html', 'reports/archive.html', `weekly-reports/${date}.html`]) {
    if (committed.get(path).toString('utf8') !== generated.get(path)) throw new Error(`Committed generated page differs from complete issue and archive: ${path}`);
  }
  const receipts = [];
  for (const site of sites) {
    for (const path of paths) {
      const url = new URL(path, site);
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`${url.href}: HTTP ${response.status}`);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error(`${url.href}: response too large`);
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!body.equals(committed.get(path))) throw new Error(`${url.href}: bytes differ from committed artifact`);
      const links = hrefs(body.toString('utf8'), url);
      const contains = target => links.includes(new URL(target, site).href);
      if (path === 'weekly-reports.html' || path === 'weekly-reports/index.html') {
        if (!contains(`reports/${date}.html`) || !contains('reports/archive.html')) throw new Error(`${url.href}: latest/history links do not resolve to expected paths`);
      }
      if (path === 'reports/archive.html' && !contains('weekly-reports.html#history')) throw new Error(`${url.href}: history return link is wrong`);
      receipts.push({ url: url.href, sha256: sha256(body) });
    }
  }
  return receipts;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [date, sha, commit, ...extra] = process.argv.slice(2);
  if (extra.length || !date || !sha || !commit) { console.error('Usage: verify-weekly-publication.mjs DATE SHA256 SOURCE_COMMIT'); process.exitCode = 1; }
  else verifyPublication({ date, sha, commit }).then(result => console.log(JSON.stringify({ commit, date, receipts: result }, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
