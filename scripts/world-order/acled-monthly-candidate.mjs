import { createHash } from 'node:crypto';

// Offline artifact_sanitizer_layer only. Pins bind declared metadata and saved
// bytes, not an authenticated upstream revision or a reproducible API query.
export const ACLED_CANDIDATE_LIMITS = Object.freeze({ bytes: 1024 * 1024, rows: 100, inputBytes: 4 * 1024 * 1024 });
const RESOURCE = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
const DATASET = 'political-violence-events-and-fatalities';
const PIN_KEYS = ['schemaVersion', 'sampleSha256', 'metadataSha256', 'resourceId', 'resourceName',
  'resourceUpdatedAt', 'hapiUpdatedAt', 'asOfDate', 'fetchedAt', 'countries', 'months', 'requestLimit'];
const ROW_KEYS = ['location_code', 'location_name', 'admin1_code', 'admin1_name', 'admin2_code', 'admin2_name',
  'admin_level', 'resource_hdx_id', 'event_type', 'events', 'fatalities', 'reference_period_start', 'reference_period_end'];
class CandidateError extends Error {}
const fail = code => { throw new CandidateError(code); };
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail('date_invalid');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1997-01-01') fail('date_invalid');
  return value;
}

function utc(value) {
  // HAPI's stored timestamps are UTC even when the serialized suffix is absent.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?$/u.test(value)) fail('date_invalid');
  day(value.slice(0, 10));
  const parts = value.slice(11, 19).split(':').map(Number);
  if (parts[0] > 23 || parts[1] > 59 || parts[2] > 59) fail('date_invalid');
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  if (!Number.isFinite(date.getTime())) fail('date_invalid');
  const fraction = value.slice(19).replace(/Z$/u, '').replace(/^\./u, '');
  return `${value.slice(0, 19)}.${fraction.padEnd(6, '0')}Z`;
}

function parseBody(text, expectedHash) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > ACLED_CANDIDATE_LIMITS.bytes) fail('body_size');
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedHash) || sha(text) !== expectedHash) fail('hash_mismatch');
  let result;
  try { result = JSON.parse(text); } catch { fail('json_invalid'); }
  if (!exactKeys(result, ['data']) || !Array.isArray(result.data)) fail('body_schema');
  return result.data;
}

function scopeList(value, max, pattern) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max
    || value.some(item => typeof item !== 'string' || !pattern.test(item))
    || new Set(value).size !== value.length) fail('scope_invalid');
  return [...value].sort();
}

function candidate(input, now) {
  if (!exactKeys(input, ['pin', 'sampleJson', 'metadataJson']) || !exactKeys(input.pin, PIN_KEYS)) fail('input_schema');
  const pin = input.pin;
  if (pin.schemaVersion !== 'acled-hapi-pv-pin-v1' || pin.resourceId !== RESOURCE) fail('pin_identity');
  day(pin.asOfDate);
  if (pin.resourceName !== `${DATASET}_as-of-${pin.asOfDate}.xlsx`) fail('pin_identity');
  const updated = utc(pin.resourceUpdatedAt), synced = utc(pin.hapiUpdatedAt), fetched = utc(pin.fetchedAt);
  if (pin.asOfDate > updated.slice(0, 10) || updated > synced || synced > fetched || fetched > now) fail('date_order');
  const countries = scopeList(pin.countries, 10, /^[A-Z]{3}$/u);
  const months = scopeList(pin.months, 24, /^\d{4}-(?:0[1-9]|1[0-2])$/u);
  for (const month of months) {
    day(`${month}-01`);
    if (month > pin.asOfDate.slice(0, 7)) fail('period_after_source');
  }
  const expected = countries.length * months.length;
  if (expected > ACLED_CANDIDATE_LIMITS.rows || !Number.isInteger(pin.requestLimit)
    || pin.requestLimit < 1 || pin.requestLimit > ACLED_CANDIDATE_LIMITS.rows) fail('scope_invalid');
  if (typeof input.sampleJson !== 'string' || typeof input.metadataJson !== 'string'
    || Buffer.byteLength(input.sampleJson) + Buffer.byteLength(input.metadataJson) > ACLED_CANDIDATE_LIMITS.bytes) fail('body_size');
  const data = parseBody(input.sampleJson, pin.sampleSha256);
  const metadata = parseBody(input.metadataJson, pin.metadataSha256);
  if (metadata.length !== 1 || !metadata[0] || typeof metadata[0] !== 'object') fail('metadata_schema');
  const resource = metadata[0];
  if (resource.resource_hdx_id !== RESOURCE || resource.dataset_hdx_stub !== DATASET
    || resource.dataset_hdx_provider_stub !== 'acled' || resource.format !== 'xlsx'
    || resource.name !== pin.resourceName || utc(resource.update_date) !== updated
    || utc(resource.hapi_updated_date) !== synced) fail('metadata_mismatch');
  if (data.length > pin.requestLimit || data.length > ACLED_CANDIDATE_LIMITS.rows) fail('row_limit');
  const rows = new Map();
  let duplicates = 0;
  for (const row of data) {
    if (!exactKeys(row, ROW_KEYS)) fail('row_schema');
    if (row.resource_hdx_id !== RESOURCE || row.event_type !== 'political_violence' || row.admin_level !== 0
      || !countries.includes(row.location_code)) fail('row_scope');
    for (const field of ['location_name', 'admin1_name', 'admin2_name', 'admin1_code', 'admin2_code']) {
      if (row[field] !== null && (typeof row[field] !== 'string' || row[field].length > 512)) fail('row_schema');
    }
    if (typeof row.location_name !== 'string' || !row.location_name.trim()
      || (row.admin1_code !== null && row.admin1_code !== '') || (row.admin2_code !== null && row.admin2_code !== '')) fail('row_scope');
    for (const field of ['events', 'fatalities']) {
      if (row[field] !== null && (!Number.isSafeInteger(row[field]) || row[field] < 0)) fail('count_invalid');
    }
    const start = utc(row.reference_period_start), end = utc(row.reference_period_end);
    const month = start.slice(0, 7);
    if (!months.includes(month) || start !== `${month}-01T00:00:00.000000Z`) fail('row_period');
    const [year, number] = month.split('-').map(Number);
    const monthEnd = utc(new Date(Date.UTC(year, number, 1) - 1000).toISOString());
    if (end !== monthEnd) fail('row_period');
    const key = `${row.location_code}:${month}`;
    const normalized = ROW_KEYS.map(field => field === 'reference_period_start' ? start
      : field === 'reference_period_end' ? end : row[field]);
    if (rows.has(key)) {
      if (!same(rows.get(key).normalized, normalized)) fail('duplicate_conflict');
      duplicates++;
    } else rows.set(key, { events: row.events, normalized });
  }
  const missing = expected - rows.size;
  const nullEvents = [...rows.values()].filter(row => row.events === null).length;
  const partialMonths = months.filter(month => month >= pin.asOfDate.slice(0, 7)).length;
  const limitHit = data.length === pin.requestLimit;
  const complete = missing === 0 && nullEvents === 0 && partialMonths === 0 && !limitHit;
  return { rows, fetched, scope: { countries, months }, revision: [RESOURCE, pin.asOfDate, updated],
    sampleHash: pin.sampleSha256, metadataHash: pin.metadataSha256,
    report: { status: complete ? 'declared_scope_complete' : 'hold', rawRows: data.length, uniqueRows: rows.size,
      duplicateRows: duplicates, expectedRows: expected, missingRows: missing, nullEventRows: nullEvents,
      partialMonthCount: partialMonths, limitHit, sourceAsOf: pin.asOfDate, sourceUpdatedAt: updated,
      hapiUpdatedAt: synced, fetchedAt: fetched, pinnedBytesVerified: true } };
}

function compare(previous, current) {
  if (!previous) return { status: 'baseline_required' };
  if (previous.fetched > current.fetched) return { status: 'chronology_reversed' };
  if (!same(previous.scope, current.scope)) return { status: 'scope_mismatch' };
  if (previous.report.status !== 'declared_scope_complete' || current.report.status !== 'declared_scope_complete') return { status: 'incomplete_not_comparable' };
  let eventChanges = 0, rowChanges = 0;
  for (const [key, row] of current.rows) {
    const old = previous.rows.get(key);
    if (old.events !== row.events) eventChanges++;
    if (!same(old.normalized, row.normalized)) rowChanges++;
  }
  const revisionMatches = same(previous.revision, current.revision);
  const bytesMatch = previous.sampleHash === current.sampleHash && previous.metadataHash === current.metadataHash;
  return { status: !revisionMatches ? 'revision_difference' : rowChanges ? 'revision_conflict'
    : bytesMatch ? 'unchanged_saved_payload' : 'serialization_or_metadata_change',
    declaredRevisionMatches: revisionMatches, eventChangedRows: eventChanges, sourceRowChangedRows: rowChanges };
}

// Only sanitized aggregates leave this interface. No keys, values, arbitrary
// source strings, per-row hashes or caller-supplied approval fields are emitted.
export function reviewAcledMonthlyCandidate(input, { now = new Date().toISOString() } = {}) {
  const boundaries = { networkRequests: 0, writesFiles: false, productionWriteApproved: false,
    sourceCutoverApproved: false, sixMetricEquivalence: 'not_assessed', sourceAuthenticity: 'declared_metadata_only',
    globalCoverage: 'not_assessed', freshness: 'not_assessed', baselineUpdated: false };
  try {
    if (!exactKeys(input, ['current', 'baseline'])) fail('input_schema');
    const clock = utc(now);
    const current = candidate(input.current, clock);
    const previous = input.baseline === null ? null : candidate(input.baseline, clock);
    return { schemaVersion: 'acled-hapi-pv-review-v1', status: 'review_only', current: current.report,
      baseline: previous?.report ?? null, comparison: compare(previous, current), boundaries };
  } catch (error) {
    return { schemaVersion: 'acled-hapi-pv-review-v1', status: 'invalid',
      reason: error instanceof CandidateError ? error.message : 'input_invalid', boundaries };
  }
}
