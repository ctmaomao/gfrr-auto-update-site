#!/usr/bin/env node
// Protect all dated issues introduced into first-parent history, including deleted paths.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// This checked main commit predates this guard and fixes the known 2026-11-09 baseline.
const trustedAnchor = 'd2ceeb14a4b4dc88937f013e22e0e72dc036a6fd';
const protectedPath = /^(?:reports\/\d{4}-\d{2}-\d{2}\.html|weekly-reports\/\d{4}-\d{2}-\d{2}\.html|weekly-originals\/\d{4}-\d{2}-\d{2}\/(?:identity\.sha256|handoff\.json|[a-f0-9]{64}\.html))$/;
function git(cwd, args, encoding = 'utf8') {
  return execFileSync('git', args, { cwd, encoding, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
export function checkWeeklyHistory({ cwd = root, anchor = trustedAnchor } = {}) {
  if (!/^[a-f0-9]{40}$/.test(anchor)) throw new Error('A full trusted baseline SHA is required');
  if (git(cwd, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('Weekly history check requires complete Git history');
  if (!git(cwd, ['rev-list', '--first-parent', 'HEAD']).trim().split('\n').includes(anchor)) throw new Error('Trusted weekly history anchor is not on the first-parent chain');
  const baseline = git(cwd, ['ls-tree', '-r', '--name-only', anchor, '--', 'reports', 'weekly-reports', 'weekly-originals']);
  const introduced = new Map(baseline.split('\n').filter(path => protectedPath.test(path)).map(path => [path, anchor]));
  const log = git(cwd, ['log', '--first-parent', '-m', '--no-renames', '--diff-filter=A', '--format=COMMIT:%H', '--name-only', `${anchor}..HEAD`, '--', 'reports', 'weekly-reports', 'weekly-originals']);
  let commit;
  for (const line of log.split('\n')) {
    if (/^COMMIT:[a-f0-9]{40}$/.test(line)) commit = line.slice(7);
    else if (commit && protectedPath.test(line) && !baseline.split('\n').includes(line)) introduced.set(line, commit);
  }
  for (const [path, first] of introduced) {
    const original = git(cwd, ['show', `${first}:${path}`], null);
    let staged;
    try { staged = git(cwd, ['show', `:${path}`], null); }
    catch { throw new Error(`Historical weekly file missing from index: ${path} (baseline ${first})`); }
    if (!original.equals(staged)) throw new Error(`Historical weekly file changed in index: ${path} (baseline ${first}); use a separately versioned issue`);
    let current;
    try { current = readFileSync(resolve(cwd, path)); }
    catch { throw new Error(`Historical weekly file missing: ${path} (baseline ${first})`); }
    if (!original.equals(current)) throw new Error(`Historical weekly file changed: ${path} (baseline ${first}); use a separately versioned issue`);
  }
  return introduced.size;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Weekly historical files: PASS (${checkWeeklyHistory()} files)`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
