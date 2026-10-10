import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseTimestamp, formatTimestamp } from '../gdelt/events-candidate.mjs';
import { downloadEventsResource } from '../gdelt/events-download.mjs';
import { readEventsZip } from '../gdelt/events-zip.mjs';
import { projectResearchFile, buildResearchDay, validateResearchDay, prepareResearchCalibration } from '../gdelt/events-research.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'manual-artifacts/world-order/gdelt-events/research-v2');
let network = false, end = formatTimestamp(Date.now() - 86400000).slice(0, 8), count = 7;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow-network') network = true;
  else if (args[i] === '--end') end = args[++i];
  else if (args[i] === '--days') count = Number(args[++i]);
  else throw new Error('events_unknown_option');
}
if (!/^\d{8}$/u.test(end || '') || !Number.isInteger(count) || count < 1 || count > 7) throw new Error('events_research_options');
const endMs = parseTimestamp(`${end}000000`);
if (endMs >= Math.floor(Date.now() / 86400000) * 86400000) throw new Error('events_research_incomplete_utc_day');
const days = new Map(), diagnostics = { requests: 0, bytes: 0, failures: [], cachedDays: 0, archivedDays: 0 };
const readDay = day => {
  const filename = path.join(dir, `${day}.json`);
  if (!fs.existsSync(filename)) return null;
  if (fs.statSync(filename).size > 40 * 1024 * 1024) throw new Error('events_research_cache_size');
  const a = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (validateResearchDay(a).day !== day) throw new Error('events_research_cache_day');
  return a;
};
// Offline mode reads only existing sanitized archives and writes nothing.
for (let i = 48; i >= 0; i--) {
  const day = formatTimestamp(endMs - i * 86400000).slice(0, 8), a = readDay(day);
  if (a) { days.set(day, a); diagnostics.cachedDays++; }
}
const started = Date.now();
const options = { onBytes: n => {
  diagnostics.bytes += n;
  if (diagnostics.bytes > 128 * 1024 * 1024) throw new Error('events_total_byte_budget');
} };
let stop = false, consecutiveFailures = 0, projected = 0;
if (network) for (let offset = count - 1; offset >= 0 && !stop; offset--) {
  const day = formatTimestamp(endMs - offset * 86400000).slice(0, 8);
  if (days.has(day)) continue;
  const files = [], digests = [];
  for (let i = 0; i < 96; i++) {
    if (Date.now() - started > 20 * 60 * 1000) { stop = true; break; }
    const timestamp = formatTimestamp(parseTimestamp(`${day}000000`) + i * 900000);
    try {
      diagnostics.requests++;
      const bytes = await downloadEventsResource(timestamp, options);
      const projection = projectResearchFile(readEventsZip(bytes, timestamp), timestamp);
      projected += projection.rows.length;
      if (projected > 2000000) throw new Error('events_total_record_budget');
      files.push({ timestamp, projection });
      digests.push({ timestamp, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      consecutiveFailures = 0;
    } catch (error) {
      diagnostics.failures.push({ timestamp, reason: /^events_[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_request_failed' });
      if (++consecutiveFailures >= 3 || /budget/u.test(error.message)) { stop = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // Partial downloads never replace an existing daily archive or become complete days.
  if (files.length === 96) {
    const a = buildResearchDay(day, files, { acquiredAt: new Date().toISOString(), files: digests });
    validateResearchDay(a);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${day}.json`), `${JSON.stringify(a)}\n`, { flag: 'wx' });
    days.set(day, a); diagnostics.archivedDays++;
    console.log(JSON.stringify({ archivedDay: day, rows: a.payload.totalRows, quarantinedRows: a.payload.quarantinedRows }));
  }
}
const cloud = JSON.parse(fs.readFileSync(path.join(root, 'config/gdelt-score-calibration.json'), 'utf8'));
const report = prepareResearchCalibration(days, end, cloud.samples || []);
report.diagnostics = { ...diagnostics, elapsedMs: Date.now() - started, stoppedEarly: stop };
if (network) {
  fs.mkdirSync(dir, { recursive: true });
  // Unique reports preserve previous probes; no production/output-path option exists.
  fs.writeFileSync(path.join(dir, `review-${end}-${Date.now()}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}
console.log(JSON.stringify({ ...report, windows: undefined, cloudPairs: undefined }, null, 2));
if (diagnostics.failures.length || stop) process.exitCode = 1;
