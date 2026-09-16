import { pilotMetadata, pilotContact, pilotTime, digest } from './acled-pilot.mjs';
import { reviewAcledMonthlyCandidate } from './acled-monthly-candidate.mjs';

// Independent, owner-approved one-off artifact_sanitizer_layer acceptance.
// Never expand the existing one-country or four-slot budgets.
export const ANNUAL = Object.freeze({ id: 'acled-pv-annual-20260916', requests: 4, bytes: 16 * 1024 * 1024,
  rows: 20002, partitionRows: 10000, timeoutMs: 15000, spacingMs: 1100, storageBytes: 16 * 1024 * 1024 + 65536 });
const RESOURCE = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
class Stop extends Error {}
const stop = reason => { throw new Stop(reason); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const months = start => Array.from({ length: 24 }, (_, i) => `${start + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
function parse(text, cap) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap) stop('body_size');
  let value; try { value = JSON.parse(text); } catch { stop('json_invalid'); }
  if (!value || Object.keys(value).join('|') !== 'data' || !Array.isArray(value.data)) stop('body_schema');
  return value.data;
}
function inspectPartition(text, metadataJson, start, fetchedAt) {
  const rows = parse(text, ANNUAL.bytes), meta = pilotMetadata(metadataJson, fetchedAt), groups = new Map();
  if (!rows.length || rows.length >= ANNUAL.partitionRows) stop('partition_limit_or_empty');
  for (const row of rows) {
    if (!row || typeof row.location_code !== 'string' || !/^[A-Z]{3}$/u.test(row.location_code)) stop('row_scope');
    if (!groups.has(row.location_code)) groups.set(row.location_code, []);
    groups.get(row.location_code).push(row);
  }
  if (groups.size > 400) stop('country_limit');
  for (const [country, items] of groups) {
    const sampleJson = JSON.stringify({ data: items });
    const result = reviewAcledMonthlyCandidate({ current: { sampleJson, metadataJson,
      pin: { ...meta.pin, countries: [country], months: months(start), sampleSha256: digest(sampleJson) } }, baseline: null }, { now: fetchedAt });
    if (result.status !== 'review_only' || result.current.status !== 'declared_scope_complete'
      || result.current.duplicateRows !== 0) stop('partition_coverage_or_schema');
  }
  return { countries: [...groups.keys()].sort(), rows: rows.length };
}
export function inspectAnnualSnapshot(snapshot, now = new Date().toISOString()) {
  if (!snapshot || !same(Object.keys(snapshot).sort(), ['fetchedAt', 'metadataAfter', 'metadataBefore', 'partitions'].sort())
    || !Array.isArray(snapshot.partitions) || snapshot.partitions.length !== 2) stop('snapshot_schema');
  if (pilotTime(snapshot.fetchedAt) > pilotTime(now)) stop('clock_invalid');
  const values = [snapshot.metadataBefore, ...snapshot.partitions, snapshot.metadataAfter];
  if (values.some(v => typeof v !== 'string') || values.reduce((n, v) => n + Buffer.byteLength(v), 0) > ANNUAL.bytes) stop('body_size');
  const before = pilotMetadata(snapshot.metadataBefore, snapshot.fetchedAt), after = pilotMetadata(snapshot.metadataAfter, snapshot.fetchedAt);
  if (before.asOf < '2026-01-01') stop('source_period_incomplete');
  if (!same(before.version, after.version)) stop('metadata_changed');
  const parts = snapshot.partitions.map((text, i) => inspectPartition(text, snapshot.metadataBefore, 2022 + i * 2, snapshot.fetchedAt));
  // Equality against the union, not intersection: countries missing in either
  // partition must not silently disappear from the declared 48-month scope.
  const countries = new Set(parts.flatMap(p => p.countries));
  if (parts.some(p => p.countries.length !== countries.size)) stop('cross_partition_coverage');
  return { sourceAsOf: before.asOf, fetchedAt: snapshot.fetchedAt, returnedCountries: countries.size,
    sampleRows: parts.reduce((n, p) => n + p.rows, 0), completeYears: [2022, 2023, 2024, 2025],
    returnedScopeComplete: true, globalCoverage: 'not_proven', metricEquivalence: 'not_proven', atomicSnapshotProven: false };
}
export async function collectAnnualCandidate(contact, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString()), tick = deps.tick ?? (() => performance.now());
  const wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))), fetcher = deps.fetchImpl ?? globalThis.fetch;
  const report = { schemaVersion: 'acled-annual-receipt-v1', status: 'stopped', requestCount: 0, totalBytes: 0, totalRows: 0,
    calls: [], productionEligible: false, sourceCutoverApproved: false };
  let lastStart = -Infinity;
  try {
    const identifier = pilotContact(contact); pilotTime(now());
    async function request(stage, params, rowCap) {
      if (report.requestCount >= ANNUAL.requests) stop('request_budget');
      await wait(Math.max(0, ANNUAL.spacingMs - (tick() - lastStart))); lastStart = tick();
      report.requestCount++; const call = { stage }; report.calls.push(call);
      const controller = new AbortController(); let timer, reader;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Stop('timeout')); }, ANNUAL.timeoutMs); });
      try {
        return await Promise.race([deadline, (async () => {
          const route = stage.startsWith('metadata') ? 'metadata/resource' : 'coordination-context/conflict-events';
          const response = await fetcher(new URL(`https://hapi.humdata.org/api/v2/${route}?${new URLSearchParams(params)}`), {
            redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json',
              'User-Agent': 'GFRR/isolated-annual-acceptance', 'X-HDX-HAPI-APP-IDENTIFIER': identifier } });
          if (controller.signal.aborted) stop('timeout');
          call.status = response.status;
          if (response.status !== 200) stop([401, 403, 429].includes(response.status) ? 'access_or_rate_pause' : 'http_failure');
          if (!/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) stop('content_type');
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/u.test(length) || Number(length) > ANNUAL.bytes - report.totalBytes)) stop('byte_budget');
          if (!response.body) stop('body_missing');
          reader = response.body.getReader(); const chunks = []; let size = 0;
          while (true) {
            const { value, done } = await reader.read(); if (controller.signal.aborted) stop('timeout'); if (done) break;
            size += value.byteLength; report.totalBytes += value.byteLength;
            if (report.totalBytes > ANNUAL.bytes || (stage.startsWith('metadata') && size > 65536)) stop('byte_budget');
            chunks.push(value);
          }
          let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { stop('json_invalid'); }
          const rows = parse(text, ANNUAL.bytes); report.totalRows += rows.length;
          if (rows.length > rowCap || report.totalRows > ANNUAL.rows) stop('row_budget');
          call.bytes = size; call.rows = rows.length; return text;
        })()]);
      } finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
    }
    const metaParams = { resource_hdx_id: RESOURCE, limit: '100', offset: '0', output_format: 'json' };
    const metadataBefore = await request('metadata_before', metaParams, 1), meta = pilotMetadata(metadataBefore, now());
    if (meta.asOf < '2026-01-01') stop('source_period_incomplete');
    if (pilotTime(now()) - Date.parse(`${meta.asOf}T00:00:00Z`) > 45 * 86400000) stop('source_stale');
    const partitions = [];
    for (const year of [2022, 2024]) {
      const text = await request(`years_${year}_${year + 1}`, { event_type: 'political_violence', admin_level: '0',
        start_date: `${year}-01-01`, end_date: `${year + 1}-12-31`, limit: '10000', offset: '0', output_format: 'json' }, ANNUAL.partitionRows);
      inspectPartition(text, metadataBefore, year, now()); partitions.push(text);
    }
    const metadataAfter = await request('metadata_after', metaParams, 1);
    const snapshot = { metadataBefore, metadataAfter, partitions, fetchedAt: now() };
    report.coverage = inspectAnnualSnapshot(snapshot, now()); report.status = 'candidate_ready';
    return { report, snapshot };
  } catch (error) {
    report.reason = error instanceof Stop ? error.message : 'request_or_validation_failure';
    return { report, snapshot: null };
  }
}
