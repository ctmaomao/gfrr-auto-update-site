// Pure byte/receipt consistency check, not source authentication or historical-as-of proof.
import { createHash } from 'node:crypto';
const SERIES = 'DCOILBRENTEU', START = '2026-10-01', END = '2026-11-16';
const fail = message => { throw new Error(message); };
function exact(o, keys) {
  if (!o || Object.getPrototypeOf(o) !== Object.prototype || Reflect.ownKeys(o).length !== keys.length
    || !keys.every(k => Object.hasOwn(o, k) && 'value' in Object.getOwnPropertyDescriptor(o, k))) fail('invalid schema');
}
function date(s, utc = false) {
  const pattern = utc ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof s !== 'string' || !pattern.test(s) || !Number.isFinite(Date.parse(s))
    || (utc ? new Date(s).toISOString() : new Date(s).toISOString().slice(0, 10)) !== s) fail('invalid calendar/time');
  return Date.parse(s);
}
function request(url) {
  if (typeof url !== 'string') fail('invalid planned request');
  const u = new URL(url);
  if (u.origin !== 'https://fred.stlouisfed.org' || u.pathname !== '/graph/' + 'fredgraph.csv'
    || u.username || u.password || u.hash || [...u.searchParams].length !== 3
    || u.searchParams.get('id') !== SERIES || u.searchParams.get('cosd') !== START || u.searchParams.get('coed') !== END) fail('invalid planned request');
}
export function verifyBrentReceivedSnapshot(input) {
  exact(input, ['bytes', 'plan', 'receipt', 'snapshotReadAtUTC']);
  const { bytes, plan, receipt, snapshotReadAtUTC } = input;
  exact(plan, ['expectedUrl', 'seriesId', 'startDate', 'endDate', 'maxBytes', 'maxRows', 'frozenAtUTC']);
  exact(receipt, ['url', 'status', 'fetchStartedAtUTC', 'receivedAtUTC', 'sha256', 'bytes']);
  if (plan.seriesId !== SERIES || plan.startDate !== START || plan.endDate !== END) fail('fixed series/range required');
  request(plan.expectedUrl);
  if (!Number.isInteger(plan.maxBytes) || plan.maxBytes < 1 || plan.maxBytes > 1048576
    || !Number.isInteger(plan.maxRows) || plan.maxRows < 1 || plan.maxRows > 1000) fail('invalid plan bounds');
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > plan.maxBytes) fail('invalid bounded bytes');
  if (receipt.url !== plan.expectedUrl || receipt.status !== 200 || receipt.bytes !== bytes.length
    || typeof receipt.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.sha256)
    || createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) fail('receipt mismatch');
  const started = date(receipt.fetchStartedAtUTC, true), received = date(receipt.receivedAtUTC, true), read = date(snapshotReadAtUTC, true);
  const frozen = date(plan.frozenAtUTC, true);
  if (frozen >= started || started > received || received > read) fail('invalid reception/read chronology');
  // Narrow unquoted FRED CSV dialect. Unknown quoting/BOM/blank rows fail closed.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const lines = text.split(/\r?\n/); if (lines.at(-1) === '') lines.pop();
  if (!['observation_date,DCOILBRENTEU', 'DATE,DCOILBRENTEU'].includes(lines.shift())) fail('wrong series/header');
  if (!lines.length || lines.length > plan.maxRows) fail('invalid row count');
  const rows = []; let previous = null;
  for (const line of lines) {
    const fields = line.split(','); if (fields.length !== 2) fail('invalid CSV row');
    const [quoteDate, raw] = fields; date(quoteDate);
    if (quoteDate < START || quoteDate > END || (previous !== null && quoteDate <= previous)) fail('range/order/duplicate violation');
    const missing = raw === '' || raw === '.';
    if (!missing && !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) fail('invalid price field');
    const value = missing ? null : Number(raw);
    if (!missing && (!Number.isFinite(value) || value <= 0)) fail('positive finite price required');
    rows.push({ quoteDate, state: missing ? 'source_null' : 'numeric', value }); previous = quoteDate;
  }
  const flags = { receiptConsistencyVerified: true, inputAuthenticityVerified: false,
    quoteCalendarCompletenessVerified: false, historicalFeatureEligible: false, historicalLabelAvailabilityVerified: false,
    sourceInitialVersionVerified: false, eligibleForV2Fit: false, eligibleForEvaluation: false,
    eligibleForPublicProbability: false, eligibleForMainScore: false };
  const publicSummary = { schemaVersion: 'brent-received-snapshot-v1', seriesId: SERIES,
    purpose: 'posterior_snapshot_candidate_only', requestedStartDate: START, requestedEndDate: END,
    sha256: receipt.sha256, bytes: bytes.length, rowCount: rows.length,
    numericCount: rows.filter(r => r.state === 'numeric').length, missingCount: rows.filter(r => r.state === 'source_null').length,
    firstQuoteDate: rows[0].quoteDate, lastQuoteDate: rows.at(-1).quoteDate,
    planFrozenAtUTC: plan.frozenAtUTC, fetchStartedAtUTC: receipt.fetchStartedAtUTC, receivedAtUTC: receipt.receivedAtUTC, snapshotReadAtUTC, ...flags };
  return { privateResearch: { rows, purpose: 'posterior_snapshot_candidate_only', ...flags }, publicSummary };
}
