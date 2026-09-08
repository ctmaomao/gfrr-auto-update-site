import { createHash } from 'node:crypto';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

export const EPOCH_ARR_HEADERS = Object.freeze([
  'Id', 'Company', 'Date', 'Annualized revenue (USD)', 'Annualized revenue type',
  'Scope', 'Revenue amount (normalize to annual)', 'Period revenue', 'Period type',
  'Other revenue info', 'Confidence', 'Source 1', 'Source 2', 'Source 3', 'Notes',
  'Report date', 'Source type', 'Graph note'
]);
export const EPOCH_ARR_LIMITS = Object.freeze({ bytes: 1024 * 1024, rows: 1000, cellChars: 16384 });
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };

// Closed CSV dialect: quoted multiline cells and escaped quotes are supported;
// malformed quoting, schema drift and oversized input fail the entire artifact.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', state = 'plain', atStart = true;
  const endCell = () => {
    row.push(cell);
    if (row.length > EPOCH_ARR_HEADERS.length) fail('csv_column_count');
    cell = ''; state = 'plain'; atStart = true;
  };
  const endRow = () => {
    endCell(); rows.push(row); row = [];
    if (rows.length > EPOCH_ARR_LIMITS.rows + 1) fail('csv_row_limit');
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else state = 'closed';
      } else cell += char;
    } else if (char === ',') endCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else if (char === '"' && atStart && state === 'plain') {
      state = 'quoted'; atStart = false;
    } else {
      if (state === 'closed' || char === '"') fail('csv_quote_invalid');
      cell += char; atStart = false;
    }
    if (cell.length > EPOCH_ARR_LIMITS.cellChars) fail('csv_cell_limit');
  }
  if (state === 'quoted') fail('csv_quote_unclosed');
  if (cell.length || row.length || !atStart) endRow();
  if (!rows.length || JSON.stringify(rows[0]) !== JSON.stringify(EPOCH_ARR_HEADERS)) fail('csv_schema_mismatch');
  if (rows.some(values => values.length !== EPOCH_ARR_HEADERS.length)) fail('csv_column_count');
  return rows.slice(1);
}

function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : null;
}

function normalizeRow(values, csvRow, asOfDate) {
  const raw = Object.fromEntries(EPOCH_ARR_HEADERS.map((key, i) => [key, values[i]]));
  const holds = new Set([
    'observation_precision_unverified', 'amount_qualifier_unverified',
    'scenario_unverified', 'source_evidence_unverified', 'production_review_required'
  ]);
  const choose = (field, options, code) => {
    const value = options.get(raw[field].trim());
    if (!value) holds.add(code);
    return value || 'unknown';
  };
  const amount = (field, code) => {
    const value = raw[field].trim();
    if (!value) return null;
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) { holds.add(code); return null; }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed > Number.MAX_SAFE_INTEGER) { holds.add(code); return null; }
    if (parsed === 0) holds.add('zero_amount');
    return parsed;
  };
  const date = (field, code) => {
    const value = isoDate(raw[field].trim());
    if (!value) holds.add(code);
    else if (value > asOfDate) holds.add('future_date');
    return value;
  };
  const scope = choose('Scope', new Map([['Full company', 'full_company'], ['Product/division', 'product_division']]), 'scope_unknown');
  const metric = choose('Annualized revenue type', new Map([
    ['Annualized run rate', 'annualized_run_rate'], ['Annual recurring revenue (ARR)', 'annual_recurring_revenue']
  ]), 'annualized_metric_unknown');
  const periodType = raw['Period type'].trim() === '' ? null : choose('Period type',
    new Map([['Year', 'year'], ['Quarter', 'quarter']]), 'period_type_unknown');
  const confidence = choose('Confidence', new Map([
    ['Confident', 'confident'], ['Likely', 'likely'], ['Uncertain', 'uncertain']
  ]), 'confidence_unknown');
  const annualizedUsd = amount('Annualized revenue (USD)', 'annualized_amount_invalid');
  const normalizedAnnualUsd = amount('Revenue amount (normalize to annual)', 'normalized_amount_invalid');
  const periodRevenueUsd = amount('Period revenue', 'period_amount_invalid');
  if (annualizedUsd === null) holds.add('annualized_amount_missing_or_invalid');
  if (annualizedUsd !== null && (annualizedUsd < 1e9 || annualizedUsd > 80e9)) holds.add('outside_existing_runtime_range');
  if (scope !== 'full_company') holds.add('not_full_company');
  if (metric !== 'annualized_run_rate') holds.add('not_company_run_rate');
  if (periodType !== null || periodRevenueUsd !== null) holds.add('period_revenue_not_run_rate');
  const reportedDate = date('Date', 'observation_date_missing_or_invalid');
  const reportDate = date('Report date', 'report_date_missing_or_invalid');
  if (reportedDate && reportDate && reportedDate > reportDate) holds.add('observation_after_report');
  // Row-date age is only a diagnostic: unknown precision may conceal an older
  // month/quarter interval. Neither file date nor report date fills this field.
  const dateAgeDiagnostic = reportedDate && reportedDate <= asOfDate
    ? assessUnderlyingObservationFreshness({ observationDate: reportedDate, asOfDate, maxAgeDays: 45 }) : null;
  if (dateAgeDiagnostic?.status === 'stale') holds.add('row_date_stale');
  const roles = new Set();
  for (const role of raw['Source type'].split(',').map(value => value.trim())) {
    if (role === 'Company disclosure') roles.add('company_disclosure');
    else if (role === 'Media report') roles.add('media_report');
    else { roles.add('unknown'); holds.add('source_role_unknown'); }
  }
  const sourceRefHashes = new Set();
  for (const field of ['Source 1', 'Source 2', 'Source 3']) {
    const value = raw[field].trim();
    if (!value) continue;
    try {
      if (/[\u0000-\u0020\u007f\\]/u.test(value) || !/^https:\/\//iu.test(value)) throw new Error();
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error();
      // Keep path/query/fragment identity inside the hash; never export or fetch it.
      sourceRefHashes.add(digest(url.href));
    } catch { holds.add('source_url_invalid'); }
  }
  if (!sourceRefHashes.size) holds.add('source_reference_missing');
  if (!raw.Id.trim()) holds.add('source_id_missing');
  const rowHash = digest(JSON.stringify(values));
  return {
    rowHash, sourceKeyHash: raw.Id.trim() ? digest(JSON.stringify(['Anthropic', raw.Id.trim()])) : null,
    csvRows: [csvRow], company: 'Anthropic', scope, metric, periodType, confidence,
    amounts: { currency: 'USD', annualizedUsd, normalizedAnnualUsd, periodRevenueUsd, qualifier: 'unknown' },
    observation: { reportedDate, start: null, end: null, precision: 'unknown' },
    reportDate, dateAgeDiagnostic, measurementScenario: 'unknown',
    sourceRoles: [...roles].sort(), sourceRefHashes: [...sourceRefHashes].sort(),
    sourceIndependence: 'unverified', productionEligible: false, holds: [...holds].sort()
  };
}

/** Offline artifact only. Text is untrusted data, never an instruction or URL target. */
export function sanitizeEpochArrCsv(input, { asOfDate } = {}) {
  if (typeof asOfDate !== 'string' || !isoDate(asOfDate)) fail('as_of_date_invalid');
  if (typeof input !== 'string' && !Buffer.isBuffer(input)) fail('csv_input_type');
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  if (bytes.length > EPOCH_ARR_LIMITS.bytes) fail('csv_byte_limit');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('csv_utf8_invalid'); }
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  const rows = parseCsv(text);
  const candidates = [], byHash = new Map(), byKey = new Map(), byObservation = new Map();
  let excludedCompanyRows = 0, duplicateRows = 0;
  rows.forEach((values, i) => {
    if (values[1].trim() !== 'Anthropic') { excludedCompanyRows += 1; return; }
    const candidate = normalizeRow(values, i + 2, asOfDate);
    if (byHash.has(candidate.rowHash)) {
      byHash.get(candidate.rowHash).csvRows.push(i + 2); duplicateRows += 1; return;
    }
    candidates.push(candidate); byHash.set(candidate.rowHash, candidate);
    if (candidate.sourceKeyHash) {
      const group = byKey.get(candidate.sourceKeyHash) || [];
      group.push(candidate); byKey.set(candidate.sourceKeyHash, group);
    }
    // Possible duplicate observations are not additional independent evidence,
    // even when descriptive IDs, URLs or notes differ. No last-write-wins.
    const key = JSON.stringify([candidate.scope, candidate.metric, candidate.periodType,
      candidate.observation.reportedDate, candidate.amounts]);
    const group = byObservation.get(key) || [];
    group.push(candidate); byObservation.set(key, group);
  });
  for (const [groups, hold] of [[byKey, 'conflicting_source_key'], [byObservation, 'possible_duplicate_observation']]) {
    for (const group of groups.values()) if (group.length > 1) {
      for (const candidate of group) candidate.holds = [...new Set([...candidate.holds, hold])].sort();
    }
  }
  return {
    schemaVersion: 'epoch-arr-offline-candidate-v1', status: candidates.length ? 'candidate_review_required' : 'no_target_rows',
    assignedLayer: 'artifact_sanitizer_layer', asOfDate,
    input: { origin: 'caller_supplied_unverified', sha256: digest(bytes), bytes: bytes.length, rows: rows.length, excludedCompanyRows, duplicateRows },
    source: { publisher: 'Epoch AI', dataset: 'AI companies revenue reports', license: 'CC BY 4.0',
      attributionUrl: 'https://epoch.ai/data/ai-companies', modifications: 'Filtered and normalized; source text and URLs withheld.' },
    boundaries: { networkCalls: 0, productionWrites: 0, productionEligible: false, crossSnapshotRevisionReview: 'not_performed' },
    candidates
  };
}
