import { createHash } from 'node:crypto';
import { reviewAcledMonthlyCandidate } from './acled-monthly-candidate.mjs';

// Separate artifact_sanitizer_layer policy; the original 100-row acceptance
// validator and its assertions are unchanged. No global totals are produced.
export const PILOT = Object.freeze({ id: 'acled-pv-four-slots-20260916', slots: 4, intervalMs: 7 * 86400000,
  requests: 3, bytes: 8 * 1024 * 1024, rows: 10002, sampleRows: 10000,
  timeoutMs: 15000, spacingMs: 1100, staleDays: 45, storageBytes: 64 * 1024 * 1024,
  reserveBytes: 8 * 1024 * 1024 + 65536 });
const RESOURCE = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
export const digest = text => createHash('sha256').update(text).digest('hex');
export class PilotStop extends Error {}
const stop = reason => { throw new PilotStop(reason); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
export function pilotTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) stop('clock_invalid');
  return Date.parse(value);
}
export function pilotContact(value) {
  if (!value || typeof value.application !== 'string' || !/^[A-Za-z0-9 ._-]{1,100}$/u.test(value.application)
    || typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/u.test(value.email)) stop('contact_invalid');
  return Buffer.from(`${value.application}:${value.email}`).toString('base64');
}
function parse(text, cap = PILOT.bytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap) stop('body_size');
  let value; try { value = JSON.parse(text); } catch { stop('json_invalid'); }
  if (!exact(value, ['data']) || !Array.isArray(value.data)) stop('body_schema');
  return value.data;
}
export function pilotMetadata(metadataJson, fetchedAt) {
  const resource = parse(metadataJson, 65536);
  if (resource.length !== 1) stop('metadata_invalid');
  const match = /^political-violence-events-and-fatalities_as-of-(\d{4}-\d{2}-\d{2})\.xlsx$/u.exec(resource[0]?.name);
  if (!match) stop('metadata_invalid');
  const asOf = match[1], months = [];
  const [year, month] = asOf.split('-').map(Number);
  for (let offset = 24; offset > 0; offset--) months.push(new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7));
  const pin = { schemaVersion: 'acled-hapi-pv-pin-v1', resourceId: RESOURCE, resourceName: resource[0].name,
    resourceUpdatedAt: resource[0].update_date, hapiUpdatedAt: resource[0].hapi_updated_date,
    asOfDate: asOf, fetchedAt, countries: ['AAA'], months, requestLimit: 100,
    sampleSha256: digest('{"data":[]}'), metadataSha256: digest(metadataJson) };
  const checked = reviewAcledMonthlyCandidate({ current: { pin, sampleJson: '{"data":[]}', metadataJson }, baseline: null }, { now: fetchedAt });
  if (checked.status !== 'review_only') stop('metadata_invalid');
  return { pin, months, asOf, updated: checked.current.sourceUpdatedAt, synced: checked.current.hapiUpdatedAt,
    version: [asOf, checked.current.sourceUpdatedAt, checked.current.hapiUpdatedAt] };
}
export function inspectPilotSnapshot(snapshot, now) {
  if (!exact(snapshot, ['sampleJson', 'metadataJson', 'fetchedAt'])) stop('snapshot_schema');
  pilotTime(snapshot.fetchedAt); if (pilotTime(snapshot.fetchedAt) > pilotTime(now)) stop('clock_invalid');
  if (Buffer.byteLength(snapshot.sampleJson ?? '') + Buffer.byteLength(snapshot.metadataJson ?? '') > PILOT.bytes) stop('body_size');
  const meta = pilotMetadata(snapshot.metadataJson, snapshot.fetchedAt), data = parse(snapshot.sampleJson);
  if (!data.length || data.length >= PILOT.sampleRows) stop('sample_limit_or_empty');
  const groups = new Map(), rows = new Map();
  for (const row of data) {
    if (!row || typeof row.location_code !== 'string' || !/^[A-Z]{3}$/u.test(row.location_code)) stop('row_scope');
    if (!groups.has(row.location_code)) groups.set(row.location_code, []);
    groups.get(row.location_code).push(row);
  }
  if (groups.size > 400) stop('country_limit');
  let missing = 0, nulls = 0, duplicates = 0;
  for (const [country, items] of groups) {
    const sampleJson = JSON.stringify({ data: items });
    const result = reviewAcledMonthlyCandidate({ current: { metadataJson: snapshot.metadataJson, sampleJson,
      pin: { ...meta.pin, countries: [country], sampleSha256: digest(sampleJson) } }, baseline: null }, { now });
    if (result.status !== 'review_only') stop('row_invalid');
    missing += result.current.missingRows; nulls += result.current.nullEventRows; duplicates += result.current.duplicateRows;
    if (result.current.limitHit) stop('country_row_limit');
    for (const row of items) {
      const key = `${country}:${row.reference_period_start.slice(0, 7)}`;
      // Dates have already been validated; normalize serialization differences.
      rows.set(key, JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(field => [field,
        field.startsWith('reference_period_') ? row[field].slice(0, 19) : row[field]]))));
    }
  }
  return { meta, rows, countries: [...groups.keys()].sort(), fetchedAt: snapshot.fetchedAt,
    summary: { returnedCountries: groups.size, rawRows: data.length, uniqueRows: rows.size, missingCountryMonths: missing,
      nullEventRows: nulls, duplicateRows: duplicates, observedCoverageComplete: missing === 0 && nulls === 0,
      globalCoverage: 'not_proven', sixMetricEquivalence: 'not_assessed', firstMonth: meta.months[0], lastMonth: meta.months.at(-1) } };
}
function compare(previous, current) {
  if (!previous) return { status: 'initial_candidate', changedRows: 0, addedMonths: 24, removedMonths: 0 };
  if (current.meta.asOf < previous.meta.asOf || current.meta.updated < previous.meta.updated || current.meta.synced < previous.meta.synced) stop('version_regression');
  if (previous.countries.some(country => !current.countries.includes(country))) stop('coverage_shrink');
  const common = previous.meta.months.filter(month => current.meta.months.includes(month));
  if (!common.length) stop('window_not_comparable');
  let changed = 0;
  for (const [key, value] of previous.rows) {
    if (!common.includes(key.slice(4))) continue;
    if (!current.rows.has(key)) stop('coverage_shrink');
    if (current.rows.get(key) !== value) changed++;
  }
  if (current.meta.asOf === previous.meta.asOf && current.meta.updated === previous.meta.updated
    && (changed || current.countries.some(country => !previous.countries.includes(country)))) stop('same_version_conflict');
  return { status: 'compared_overlap', changedRows: changed, addedCountries: current.countries.filter(c => !previous.countries.includes(c)).length,
    addedMonths: current.meta.months.length - common.length, removedMonths: previous.meta.months.length - common.length };
}
export async function runPilotCollection(contact, previousSnapshot = null, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString()), tick = deps.tick ?? (() => performance.now());
  const fetcher = deps.fetchImpl ?? globalThis.fetch, wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const report = { schemaVersion: 'acled-four-slot-report-v1', status: 'stopped', requestCount: 0, totalBytes: 0, totalRows: 0,
    calls: [], paused: false, productionWriteApproved: false, sourceCutoverApproved: false, atomicSnapshotProven: false };
  let lastStart = -Infinity;
  try {
    const identifier = pilotContact(contact); pilotTime(now());
    const previous = previousSnapshot ? inspectPilotSnapshot(previousSnapshot, now()) : null;
    if (previous && !previous.summary.observedCoverageComplete) stop('baseline_invalid');
    async function request(stage, params, rowCap) {
      if (report.requestCount >= PILOT.requests) stop('request_budget');
      await wait(Math.max(0, PILOT.spacingMs - (tick() - lastStart))); lastStart = tick();
      report.requestCount++; const call = { stage }; report.calls.push(call);
      const controller = new AbortController(); let timer, reader;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new PilotStop('timeout')); }, PILOT.timeoutMs); });
      try {
        return await Promise.race([deadline, (async () => {
          const route = stage === 'sample' ? 'coordination-context/conflict-events' : 'metadata/resource';
          const response = await fetcher(new URL(`https://hapi.humdata.org/api/v2/${route}?${new URLSearchParams(params)}`), {
            redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json',
              'User-Agent': 'GFRR/isolated-four-slot-pilot', 'X-HDX-HAPI-APP-IDENTIFIER': identifier } });
          if (controller.signal.aborted) stop('timeout');
          call.status = response.status;
          if ([401, 403, 429].includes(response.status)) { report.paused = true; stop('access_or_rate_pause'); }
          if (response.status !== 200) stop('http_failure');
          if (!/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) stop('content_type');
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/u.test(length) || Number(length) > PILOT.bytes - report.totalBytes)) stop('byte_budget');
          if (!response.body) stop('body_missing');
          reader = response.body.getReader(); const chunks = []; let size = 0;
          while (true) {
            const { value, done } = await reader.read(); if (controller.signal.aborted) stop('timeout'); if (done) break;
            size += value.byteLength; report.totalBytes += value.byteLength;
            if (report.totalBytes > PILOT.bytes || (stage !== 'sample' && size > 65536)) stop('byte_budget');
            chunks.push(value);
          }
          let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { stop('json_invalid'); }
          const rows = parse(text); report.totalRows += rows.length;
          if (rows.length > rowCap || report.totalRows > PILOT.rows) stop('row_budget');
          call.bytes = size; call.rows = rows.length; return text;
        })()]);
      } finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
    }
    const metaParams = { resource_hdx_id: RESOURCE, limit: '100', offset: '0', output_format: 'json' };
    const before = await request('metadata_before', metaParams, 1), meta = pilotMetadata(before, now());
    report.metadataCheckedAt = now(); report.sourceAsOf = meta.asOf;
    if (previous && (meta.asOf < previous.meta.asOf || meta.updated < previous.meta.updated || meta.synced < previous.meta.synced)) stop('version_regression');
    if (pilotTime(now()) - Date.parse(`${meta.asOf}T00:00:00Z`) > PILOT.staleDays * 86400000) {
      report.status = 'source_stale'; report.dataFetchedAt = previous?.fetchedAt ?? null; return { report, snapshot: null, metadataBefore: null };
    }
    if (previous && same(meta.version, previous.meta.version)) {
      report.status = 'metadata_only'; report.dataFetchedAt = previous.fetchedAt; return { report, snapshot: null, metadataBefore: null };
    }
    const [year, month] = meta.months.at(-1).split('-').map(Number);
    const sampleJson = await request('sample', { event_type: 'political_violence', admin_level: '0',
      start_date: `${meta.months[0]}-01`, end_date: new Date(Date.UTC(year, month, 1) - 86400000).toISOString().slice(0, 10),
      limit: String(PILOT.sampleRows), offset: '0', output_format: 'json' }, PILOT.sampleRows);
    const prechecked = inspectPilotSnapshot({ sampleJson, metadataJson: before, fetchedAt: now() }, now());
    report.coverage = prechecked.summary;
    if (!prechecked.summary.observedCoverageComplete) stop('coverage_incomplete');
    const after = await request('metadata_after', metaParams, 1);
    const snapshot = { sampleJson, metadataJson: after, fetchedAt: now() }, current = inspectPilotSnapshot(snapshot, now());
    if (!same(meta.version, current.meta.version)) stop('metadata_changed');
    report.comparison = compare(previous, current); report.status = 'candidate_ready'; report.dataFetchedAt = snapshot.fetchedAt;
    return { report, snapshot, metadataBefore: before };
  } catch (error) {
    report.reason = error instanceof PilotStop ? error.message : 'request_or_local_failure';
    if (['version_regression', 'same_version_conflict', 'coverage_shrink'].includes(report.reason)) report.paused = true;
    return { report, snapshot: null, metadataBefore: null };
  }
}
