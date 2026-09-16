import { pilotContact, pilotMetadata, pilotTime } from './acled-pilot.mjs';

// Independent one-off artifact_sanitizer_layer acceptance, not a global adapter.
export const ADMIN2 = Object.freeze({ id: 'acled-afg-admin2-20260916', requests: 3, bytes: 1048576,
  rows: 1002, sampleRows: 1000, timeoutMs: 15000, spacingMs: 1100, storageBytes: 1048576 + 65536 });
const RESOURCE = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const KEYS = ['location_code', 'location_name', 'admin1_code', 'admin1_name', 'admin2_code', 'admin2_name',
  'admin_level', 'resource_hdx_id', 'event_type', 'events', 'fatalities', 'reference_period_start', 'reference_period_end'];
class Stop extends Error {}
const fail = reason => { throw new Stop(reason); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
function parse(text, cap = ADMIN2.bytes) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > cap) fail('body_size');
  let value; try { value = JSON.parse(text); } catch { fail('json_invalid'); }
  if (!exact(value, ['data']) || !Array.isArray(value.data)) fail('body_schema');
  return value.data;
}
function inspectRows(text) {
  const rows = parse(text), identities = new Map(), reverse = new Map(), seen = new Set(), provinces = new Set();
  if (!rows.length || rows.length >= ADMIN2.sampleRows) fail('empty_or_limit_hit');
  const bind = (key, value) => { if (identities.has(key) && identities.get(key) !== value) fail('admin_identity_conflict'); identities.set(key, value); };
  for (const row of rows) {
    if (!exact(row, KEYS)) fail('row_schema');
    if (row.location_code !== 'AFG' || row.location_name !== 'Afghanistan' || row.admin_level !== 2
      || row.resource_hdx_id !== RESOURCE || row.event_type !== 'political_violence') fail('row_scope');
    for (const key of ['admin1_code', 'admin2_code', 'admin1_name', 'admin2_name'])
      if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 200 || /[\u0000-\u001f\u007f]/u.test(row[key])) fail('admin_identity_invalid');
    if (!Number.isSafeInteger(row.events) || row.events < 0
      || (row.fatalities !== null && (!Number.isSafeInteger(row.fatalities) || row.fatalities < 0))) fail('count_invalid');
    if (typeof row.reference_period_start !== 'string' || !/^2025-01-01T00:00:00(?:\.0{1,6})?Z?$/u.test(row.reference_period_start)
      || typeof row.reference_period_end !== 'string' || !/^2025-01-31T23:59:59(?:\.0{1,6})?Z?$/u.test(row.reference_period_end)) fail('row_period');
    bind(`p:${row.admin1_code}`, row.admin1_name);
    bind(`d:${row.admin2_code}`, JSON.stringify([row.admin1_code, row.admin2_name]));
    const reverseEntries = [[`p:${row.admin1_name}`, row.admin1_code], [JSON.stringify([row.admin1_code, row.admin2_name]), row.admin2_code]];
    for (const [key, value] of reverseEntries) { if (reverse.has(key) && reverse.get(key) !== value) fail('admin_identity_conflict'); reverse.set(key, value); }
    const key = JSON.stringify([row.admin1_code, row.admin2_code]);
    if (seen.has(key)) fail('duplicate_row'); seen.add(key); provinces.add(row.admin1_code);
  }
  return { validRows: rows.length, returnedAdmin1Codes: provinces.size, returnedAdmin2Codes: seen.size,
    country: 'AFG', month: '2025-01', layer: 2, rowLimitHit: false, geographicCompleteness: 'not_proven',
    administrativeCodes: 'source_declared_not_authoritatively_verified', nationalAggregation: 'not_performed' };
}
export function inspectAdmin2Snapshot(snapshot, now = new Date().toISOString()) {
  if (!exact(snapshot, ['metadataBefore', 'sampleJson', 'metadataAfter', 'fetchedAt'])) fail('snapshot_schema');
  if (pilotTime(snapshot.fetchedAt) > pilotTime(now)) fail('clock_invalid');
  const texts = [snapshot.metadataBefore, snapshot.sampleJson, snapshot.metadataAfter];
  if (texts.some(v => typeof v !== 'string') || texts.reduce((n, v) => n + Buffer.byteLength(v), 0) > ADMIN2.bytes) fail('body_size');
  const before = pilotMetadata(snapshot.metadataBefore, snapshot.fetchedAt), after = pilotMetadata(snapshot.metadataAfter, snapshot.fetchedAt);
  if (before.asOf < '2025-02-01') fail('source_period_incomplete');
  if (JSON.stringify(before.version) !== JSON.stringify(after.version)) fail('metadata_changed');
  return { ...inspectRows(snapshot.sampleJson), sourceAsOf: before.asOf, fetchedAt: snapshot.fetchedAt, atomicSnapshotProven: false };
}
export async function collectAdmin2(contact, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString()), tick = deps.tick ?? (() => performance.now());
  const wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))), fetcher = deps.fetchImpl ?? globalThis.fetch;
  const report = { schemaVersion: 'acled-admin2-receipt-v1', status: 'stopped', requestCount: 0, totalBytes: 0, totalRows: 0,
    calls: [], productionEligible: false, sourceCutoverApproved: false };
  let lastStart = -Infinity;
  try {
    const identifier = pilotContact(contact); pilotTime(now());
    async function request(stage, params, rowCap) {
      if (report.requestCount >= ADMIN2.requests) fail('request_budget');
      await wait(Math.max(0, ADMIN2.spacingMs - (tick() - lastStart))); lastStart = tick();
      report.requestCount++; const call = { stage }; report.calls.push(call);
      const controller = new AbortController(); let timer, reader;
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Stop('timeout')); }, ADMIN2.timeoutMs); });
      try {
        return await Promise.race([deadline, (async () => {
          const route = stage === 'sample' ? 'coordination-context/conflict-events' : 'metadata/resource';
          const response = await fetcher(new URL(`https://hapi.humdata.org/api/v2/${route}?${new URLSearchParams(params)}`), {
            redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json',
              'User-Agent': 'GFRR/isolated-admin2-acceptance', 'X-HDX-HAPI-APP-IDENTIFIER': identifier } });
          if (controller.signal.aborted) fail('timeout'); call.status = response.status;
          if (response.status !== 200) fail([401, 403, 429].includes(response.status) ? 'access_or_rate_pause' : 'http_failure');
          if (!/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) fail('content_type');
          const length = response.headers.get('content-length');
          if (length !== null && (!/^\d+$/u.test(length) || Number(length) > ADMIN2.bytes - report.totalBytes)) fail('byte_budget');
          if (!response.body) fail('body_missing'); reader = response.body.getReader(); const chunks = []; let size = 0;
          while (true) {
            const { value, done } = await reader.read(); if (controller.signal.aborted) fail('timeout'); if (done) break;
            size += value.byteLength; report.totalBytes += value.byteLength;
            if (report.totalBytes > ADMIN2.bytes || (stage !== 'sample' && size > 65536)) fail('byte_budget');
            chunks.push(value);
          }
          let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { fail('json_invalid'); }
          const rows = parse(text); report.totalRows += rows.length;
          if (rows.length > rowCap || report.totalRows > ADMIN2.rows) fail('row_budget');
          call.bytes = size; call.rows = rows.length; return text;
        })()]);
      } finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
    }
    const metadataParams = { resource_hdx_id: RESOURCE, limit: '100', offset: '0', output_format: 'json' };
    const metadataBefore = await request('metadata_before', metadataParams, 1), meta = pilotMetadata(metadataBefore, now());
    if (meta.asOf < '2025-02-01') fail('source_period_incomplete');
    if (pilotTime(now()) - Date.parse(`${meta.asOf}T00:00:00Z`) > 45 * 86400000) fail('source_stale');
    const sampleJson = await request('sample', { location_code: 'AFG', admin_level: '2', event_type: 'political_violence',
      start_date: '2025-01-01', end_date: '2025-01-31', limit: '1000', offset: '0', output_format: 'json' }, ADMIN2.sampleRows);
    inspectRows(sampleJson);
    const metadataAfter = await request('metadata_after', metadataParams, 1), snapshot = { metadataBefore, sampleJson, metadataAfter, fetchedAt: now() };
    report.coverage = inspectAdmin2Snapshot(snapshot, now()); report.status = 'candidate_ready';
    return { report, snapshot };
  } catch (error) { report.reason = error instanceof Stop ? error.message : 'request_or_validation_failure'; return { report, snapshot: null }; }
}
