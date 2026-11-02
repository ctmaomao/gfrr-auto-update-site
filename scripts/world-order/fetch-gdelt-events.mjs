import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseTimestamp, formatTimestamp } from '../gdelt/events-candidate.mjs';
import { downloadEventsResource, parseLatestEventsTimestamp } from '../gdelt/events-download.mjs';
import { readEventsZip } from '../gdelt/events-zip.mjs';
import { projectResearchFile, buildResearchDay, validateResearchDay, researchWindow } from '../gdelt/events-research.mjs';
import { eventsSourceFromWindow, previousEventsSource } from './gdelt-events-score.mjs';

export const EVENTS_CACHE_PATH = '.cache/gdelt-events-runtime/days.json';
const CACHE_SCHEMA = 'gdelt-events-runtime-cache-v1';
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const MAX_INDEX_WAIT_MS = 15 * 60 * 1000;
const REFRESH_BUDGET_MS = 20 * 60 * 1000;
export async function waitForEventsIndex(timestamp, { now, pause, started, diagnostics }) {
  const indexedAt = parseTimestamp(timestamp);
  diagnostics.indexTimestamp = timestamp;
  diagnostics.indexWaitMs = 0;
  while (true) {
    const current = now();
    if (!Number.isFinite(current)) throw new Error('gdelt_events_source_time_hold');
    const lead = indexedAt - current;
    if (lead <= 0) {
      if (-lead > 3 * 3600000) throw new Error('gdelt_events_index_time_hold');
      return;
    }
    if (lead > MAX_INDEX_WAIT_MS || diagnostics.indexWaitMs >= MAX_INDEX_WAIT_MS) throw new Error('gdelt_events_index_time_hold');
    const delay = Math.min(lead, 30000, MAX_INDEX_WAIT_MS - diagnostics.indexWaitMs);
    if (current - started + delay > REFRESH_BUDGET_MS) throw new Error('events_time_budget');
    await pause(delay);
    diagnostics.indexWaitMs += delay;
  }
}
function validateRuntimeDay(item, nowMs) {
  const p = validateResearchDay(item), acquired = Date.parse(p.provenance.acquiredAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(acquired) || acquired > nowMs
    || acquired < parseTimestamp(`${p.day}234500`)) throw new Error('events_runtime_cache_day');
  return p;
}
export function readEventsRuntimeCache(filename, nowMs = Date.now()) {
  if (!fs.existsSync(filename)) return new Map();
  if (fs.statSync(filename).size > MAX_CACHE_BYTES) throw new Error('events_runtime_cache_size');
  const a = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (a.schemaVersion !== CACHE_SCHEMA || !Array.isArray(a.days) || a.days.length > 7) throw new Error('events_runtime_cache_shape');
  const days = new Map();
  for (const item of a.days) {
    const p = validateRuntimeDay(item, nowMs);
    if (days.has(p.day)) throw new Error('events_runtime_cache_day');
    days.set(p.day, item);
  }
  return days;
}
function writeCache(filename, days, nowMs) {
  for (const [day, item] of days) if (validateRuntimeDay(item, nowMs).day !== day) throw new Error('events_runtime_cache_day');
  const text = `${JSON.stringify({ schemaVersion: CACHE_SCHEMA, days: [...days.values()] })}\n`;
  if (Buffer.byteLength(text) > MAX_CACHE_BYTES) throw new Error('events_runtime_cache_size');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, text, { flag: 'wx' });
  fs.renameSync(temporary, filename);
}
export async function fetchGdeltEvents({ config, previousSource, allowNetwork = true, root = process.cwd(),
  fetchImpl = globalThis.fetch, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!config?.enabled) return null;
  const diagnostics = { requests: 0, bytes: 0, cachedDays: 0, downloadedDays: 0, cacheWrites: 0, failures: [] };
  const filename = path.join(root, EVENTS_CACHE_PATH), started = now();
  try {
    const cached = readEventsRuntimeCache(filename, started);
    let projected = 0, failures = 0;
    const options = { fetchImpl, onBytes: n => {
      diagnostics.bytes += n;
      if (diagnostics.bytes > 128 * 1024 * 1024) throw new Error('events_total_byte_budget');
    } };
    if (!allowNetwork) throw new Error('events_source_free_refresh');
    diagnostics.requests++;
    const latestTimestamp = parseLatestEventsTimestamp((await downloadEventsResource(null, options)).toString('utf8'));
    await waitForEventsIndex(latestTimestamp, { now, pause, started, diagnostics });
    // Waiting may cross UTC midnight: select the latest complete day afterwards.
    const endMs = Math.floor(now() / 86400000) * 86400000 - 86400000, endDay = formatTimestamp(endMs).slice(0, 8);
    const startDay = formatTimestamp(endMs - 6 * 86400000).slice(0, 8);
    diagnostics.targetEndDay = endDay;
    const days = new Map([...cached].filter(([day]) => day >= startDay && day <= endDay));
    for (let offset = 6; offset >= 0; offset--) {
      const day = formatTimestamp(endMs - offset * 86400000).slice(0, 8);
      if (cached.has(day)) { days.set(day, cached.get(day)); diagnostics.cachedDays++; continue; }
      const files = [], digests = [];
      for (let i = 0; i < 96; i++) {
        if (now() - started > REFRESH_BUDGET_MS) throw new Error('events_time_budget');
        const timestamp = formatTimestamp(parseTimestamp(`${day}000000`) + i * 900000);
        try {
          diagnostics.requests++;
          const bytes = await downloadEventsResource(timestamp, options);
          const projection = projectResearchFile(readEventsZip(bytes, timestamp), timestamp);
          projected += projection.rows.length;
          if (projected > 2000000) throw new Error('events_record_budget');
          files.push({ timestamp, projection });
          digests.push({ timestamp, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
          failures = 0;
        } catch (error) {
          diagnostics.failures.push({ timestamp, reason: /^events_[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_file_failed' });
          if (++failures >= 3 || /budget/u.test(error.message)) throw new Error('events_download_hold');
        }
        await pause(100);
      }
      if (files.length !== 96) throw new Error('events_incomplete_day');
      const a = buildResearchDay(day, files, { acquiredAt: new Date(now()).toISOString(), files: digests });
      validateResearchDay(a);
      days.set(day, a); diagnostics.downloadedDays++;
      // Persist only complete, hash-validated days. This is collection progress,
      // never source qualification; the unchanged 672-file/score gates run below.
      writeCache(filename, days, now());
      diagnostics.cacheWrites++;
    }
    if (now() - started > REFRESH_BUDGET_MS) throw new Error('events_time_budget');
    const window = researchWindow(days, endDay);
    const source = eventsSourceFromWindow(window, { latestTimestamp,
      acquiredAt: days.get(endDay).payload.provenance.acquiredAt, nowMs: now() });
    // Cache comes from this dedicated producer, never from manual-artifacts.
    // A held window can retain complete days, but never qualifies publication.
    source.diagnostics = diagnostics;
    return source;
  } catch (error) {
    const reason = /^(?:events_|gdelt_events_)[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_source_failed';
    diagnostics.failureReason = reason;
    try { return { ...previousEventsSource(previousSource, reason, now()), diagnostics }; }
    catch (fallbackError) {
      diagnostics.previousSourceFailure = /^(?:events_|gdelt_events_)[a-z0-9_]+$/u.test(fallbackError.message) ? fallbackError.message : 'events_previous_source_failed';
      return { enabled: true, status: 'error', lastFetchedAt: null, confidence: 0,
      summary: { reason }, diagnostics, warnings: ['免费事件来源未取得完整且可用的统计窗口，本轮世界秩序发布暂停。'] }; }
  }
}
