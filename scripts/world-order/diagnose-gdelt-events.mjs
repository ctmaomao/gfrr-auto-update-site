import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { planEventsWindow, parseEventsTsv, aggregateEventsFiles } from '../gdelt/events-candidate.mjs';
import { downloadEventsResource, parseLatestEventsTimestamp } from '../gdelt/events-download.mjs';
import { readEventsZip } from '../gdelt/events-zip.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
let allowNetwork = false, noOutput = false, maxFiles = 4, end;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow-network') allowNetwork = true;
  else if (args[i] === '--no-output') noOutput = true;
  else if (args[i] === '--max-files') maxFiles = Number(args[++i]);
  else if (args[i] === '--end') {
    end = args[++i];
    if (!end) throw new Error('events_end_required');
  }
  else throw new Error('events_unknown_option');
}
if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 672) throw new Error('events_file_budget_invalid');
const nowMs = Date.now(), window = planEventsWindow(nowMs, end);
const diagnostics = { networkApproved: allowNetwork, maxFiles, requests: 0, compressedBytes: 0,
  projectedRecords: 0, elapsedMs: 0, fileDigests: [], failures: [], stoppedEarly: false };
const files = []; let latestTimestamp = null;
const started = Date.now();
if (allowNetwork) {
  let consecutiveFailures = 0;
  const options = { onBytes: n => {
    diagnostics.compressedBytes += n;
    if (diagnostics.compressedBytes > 128 * 1024 * 1024) throw new Error('events_total_byte_budget');
  } };
  try {
    diagnostics.requests++;
    latestTimestamp = parseLatestEventsTimestamp((await downloadEventsResource(null, options)).toString('utf8'));
    for (const timestamp of window.timestamps.slice(-maxFiles)) {
      if (Date.now() - started > 20 * 60 * 1000) { diagnostics.stoppedEarly = true; break; }
      try {
        diagnostics.requests++;
        const bytes = await downloadEventsResource(timestamp, options);
        const records = parseEventsTsv(readEventsZip(bytes, timestamp), timestamp);
        if (diagnostics.projectedRecords + records.length > 2000000) throw new Error('events_total_record_budget');
        diagnostics.projectedRecords += records.length;
        files.push({ timestamp, records }); consecutiveFailures = 0;
        diagnostics.fileDigests.push({ timestamp, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      } catch (error) {
        diagnostics.failures.push({ timestamp, reason: /^events_[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_request_failed' });
        consecutiveFailures++;
        if (consecutiveFailures >= 3 || /budget/u.test(error.message)) { diagnostics.stoppedEarly = true; break; }
      }
      // Bound public-file load; no parallel requests, retry or provider fallback.
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    diagnostics.failures.push({ reason: /^events_[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_request_failed' });
    diagnostics.stoppedEarly = true;
  }
}
diagnostics.elapsedMs = Date.now() - started;
const report = aggregateEventsFiles(files, window, { latestTimestamp, nowMs: Date.now(), diagnostics });
if (allowNetwork && !noOutput) {
  const dir = path.join(root, 'manual-artifacts/world-order/gdelt-events');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'candidate-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (allowNetwork && diagnostics.failures.length) process.exitCode = 1;
