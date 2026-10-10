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
export function readEventsRuntimeCache(filename, nowMs = Date.now()) {
  if (!fs.existsSync(filename)) return new Map();
  if (fs.statSync(filename).size > MAX_CACHE_BYTES) throw new Error('events_runtime_cache_size');
  const a = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (a.schemaVersion !== CACHE_SCHEMA || !Array.isArray(a.days) || a.days.length > 7) throw new Error('events_runtime_cache_shape');
  const days = new Map();
  for (const item of a.days) {
    const p = validateResearchDay(item);
    if (days.has(p.day) || !Number.isFinite(Date.parse(p.provenance.acquiredAt))
      || Date.parse(p.provenance.acquiredAt) > nowMs || Date.parse(p.provenance.acquiredAt) < parseTimestamp(`${p.day}234500`)) throw new Error('events_runtime_cache_day');
    days.set(p.day, item);
  }
  return days;
}
function writeCache(filename, days) {
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
  const diagnostics = { requests: 0, bytes: 0, cachedDays: 0, downloadedDays: 0, failures: [] };
  const filename = path.join(root, EVENTS_CACHE_PATH), started = now();
  const endMs = Math.floor(started / 86400000) * 86400000 - 86400000, endDay = formatTimestamp(endMs).slice(0, 8);
  try {
    const cached = readEventsRuntimeCache(filename, started), days = new Map();
    let projected = 0, failures = 0;
    const options = { fetchImpl, onBytes: n => {
      diagnostics.bytes += n;
      if (diagnostics.bytes > 128 * 1024 * 1024) throw new Error('events_total_byte_budget');
    } };
    if (!allowNetwork) throw new Error('events_source_free_refresh');
    diagnostics.requests++;
    const latestTimestamp = parseLatestEventsTimestamp((await downloadEventsResource(null, options)).toString('utf8'));
    const indexAge = now() - parseTimestamp(latestTimestamp);
    if (indexAge < 0 || indexAge > 3 * 3600000) throw new Error('gdelt_events_index_time_hold');
    for (let offset = 6; offset >= 0; offset--) {
      const day = formatTimestamp(endMs - offset * 86400000).slice(0, 8);
      if (cached.has(day)) { days.set(day, cached.get(day)); diagnostics.cachedDays++; continue; }
      const files = [], digests = [];
      for (let i = 0; i < 96; i++) {
        if (now() - started > 20 * 60 * 1000) throw new Error('events_time_budget');
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
    }
    if (now() - started > 20 * 60 * 1000) throw new Error('events_time_budget');
    const window = researchWindow(days, endDay);
    const source = eventsSourceFromWindow(window, { latestTimestamp,
      acquiredAt: days.get(endDay).payload.provenance.acquiredAt, nowMs: now() });
    // Cache comes from this dedicated producer, never from manual-artifacts.
    // A hold preserves the previous runtime cache rather than saving a partial week.
    writeCache(filename, days);
    source.diagnostics = diagnostics;
    return source;
  } catch (error) {
    const reason = /^(?:events_|gdelt_events_)[a-z0-9_]+$/u.test(error.message) ? error.message : 'events_source_failed';
    try { return { ...previousEventsSource(previousSource, reason, now()), diagnostics }; }
    catch { return { enabled: true, status: 'error', lastFetchedAt: null, confidence: 0,
      summary: { reason }, diagnostics, warnings: ['免费事件来源未取得完整且可用的统计窗口，本轮世界秩序发布暂停。'] }; }
  }
}
