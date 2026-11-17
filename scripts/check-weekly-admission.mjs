#!/usr/bin/env node
// Each new issue requires an explicitly pinned and remotely retrievable original.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity, validateOriginal } from './weekly-original.mjs';
import { readRemoteHandoffs } from './weekly-remote-handoff.mjs';
import { splitIssues } from './build-weekly-reports.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The 2026-11-09 report predates the remote handoff protocol and is protected by the history guard.
const legacy = '2026-11-09';
function parseReceipt(path) {
  if (!existsSync(path)) throw new Error('Missing explicitly expected weekly issue or handoff receipt');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'date,handoffCommit,sha256') throw new Error('Invalid expected issue manifest');
  identity(value.date, value.sha256);
  if (!/^[a-f0-9]{40}$/.test(value.handoffCommit)) throw new Error('Invalid handoff commit');
  return value;
}
export function checkWeeklyAdmission({ cwd = root, readRemote = readRemoteHandoffs } = {}) {
  const { recent, archived } = splitIssues(readdirSync(resolve(cwd, 'reports')));
  const names = [...recent, ...archived];
  if (!names.length) throw new Error('No dated weekly report');
  const expectedPath = resolve(cwd, 'weekly-originals/expected.json');
  const dates = names.map(name => name.slice(0, 10)).filter(date => date !== legacy);
  if (!dates.length && !existsSync(expectedPath)) return { status: 'legacy_only_no_expected_issue' };
  const expected = parseReceipt(expectedPath);
  if (names[0] !== expected.date + '.html') throw new Error('Expected issue does not match the latest report');
  const receipts = dates.map(date => {
    const receipt = parseReceipt(resolve(cwd, 'weekly-originals', date, 'handoff.json'));
    if (receipt.date !== date) throw new Error('Handoff receipt issue differs from report date');
    const identityFile = readFileSync(resolve(cwd, 'weekly-originals', date, 'identity.sha256'), 'utf8');
    if (identityFile !== receipt.sha256 + '\n') throw new Error('Handoff identity differs');
    const bytes = readFileSync(resolve(cwd, 'weekly-originals', date, receipt.sha256 + '.html'));
    validateOriginal(bytes, date, receipt.sha256);
    if (!bytes.equals(readFileSync(resolve(cwd, 'reports', date + '.html')))) throw new Error('Fixed report differs from original');
    return { ...receipt, bytes };
  });
  const current = receipts.find(receipt => receipt.date === expected.date);
  if (!current || current.sha256 !== expected.sha256 || current.handoffCommit !== expected.handoffCommit) throw new Error('Expected issue differs from its receipt');
  const remote = readRemote({ issues: receipts.map(({date,sha256}) => ({date,sha:sha256})) });
  if (!Array.isArray(remote) || remote.length !== receipts.length) throw new Error('Incomplete remote handoff readback');
  for (const receipt of receipts) {
    const verified = remote.find(item => item.date === receipt.date);
    if (!verified || verified.commit !== receipt.handoffCommit || !verified.bytes.equals(receipt.bytes)) throw new Error('Expected issue differs from remote handoff');
  }
  return { status: 'remote_originals_verified', date: expected.date, sha256: expected.sha256, handoffCommit: expected.handoffCommit, issues: receipts.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Weekly admission: ' + JSON.stringify(checkWeeklyAdmission())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
