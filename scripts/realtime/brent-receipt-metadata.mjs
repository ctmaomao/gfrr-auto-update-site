// Research-only, in-memory metadata. No collector, clock, persistence or network.
import { createHash } from 'node:crypto';
const LIMIT = Object.freeze({ attempts: 4, responseBytes: 32768, rows: 64 });
const SERIES = 'DCOILBRENTEU';
const keys = ['series', 'transport', 'requestStartedAt', 'classifiedAt', 'bodyReceivedAt', 'httpStatus', 'outcome', 'text'];
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
function utc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function plain(input) {
  return input && Object.getPrototypeOf(input) === Object.prototype
    && Reflect.ownKeys(input).length === keys.length
    && keys.every(key => Object.getOwnPropertyDescriptor(input, key)?.value !== undefined)
    && Reflect.ownKeys(input).every(key => keys.includes(key));
}
function summarize(text, transport) {
  let rows;
  if (transport === 'api') {
    const payload = JSON.parse(text);
    if (!Array.isArray(payload?.observations)) throw new Error('parse');
    rows = payload.observations.map(row => [row?.date, row?.value]);
  } else {
    const lines = text.trim().split(/\r?\n/);
    if (!['DATE,DCOILBRENTEU', 'observation_date,DCOILBRENTEU'].includes(lines.shift())) throw new Error('parse');
    if (lines.some(line => line.includes('"') || line.split(',').length !== 2)) throw new Error('parse');
    rows = lines.map(line => line.split(','));
  }
  if (rows.length > LIMIT.rows) return { parseStatus: 'row_limit', parsedRowCount: null, missingCount: null, invalidCount: null, duplicateCount: null, conflictingDateCount: null };
  let missingCount = 0; let invalidCount = 0; let duplicateCount = 0;
  const seen = new Map(); const conflicts = new Set();
  for (const [day, raw] of rows) {
    if (!date(day) || !['string', 'number'].includes(typeof raw)) { invalidCount++; continue; }
    const missing = typeof raw === 'string' && (raw.trim() === '' || raw === '.');
    const numeric = typeof raw === 'number' || /^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
    const value = missing ? null : Number(raw);
    if (!missing && (!numeric || !Number.isFinite(value) || value <= 0)) { invalidCount++; continue; }
    if (missing) missingCount++;
    if (seen.has(day)) {
      if (seen.get(day) === value) duplicateCount++; else conflicts.add(day);
    } else seen.set(day, value);
  }
  return { parseStatus: 'parsed', parsedRowCount: rows.length, missingCount, invalidCount, duplicateCount, conflictingDateCount: conflicts.size };
}
export function createBrentReceiptMetadata() {
  const receipts = []; let incomplete = false;
  return Object.freeze({
    record(input) {
      // Reject malformed/credential-bearing envelopes without retaining or reporting them.
      if (!plain(input)) { incomplete = true; return false; }
      const { series, transport, requestStartedAt, classifiedAt, bodyReceivedAt, httpStatus, outcome, text } = input;
      if (series !== SERIES || !['api', 'csv'].includes(transport)
        || !utc(requestStartedAt) || !utc(classifiedAt) || classifiedAt < requestStartedAt
        || !['body', 'http_error', 'network_error'].includes(outcome)
        || (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599))
        || (outcome === 'body' && (!utc(bodyReceivedAt) || bodyReceivedAt < requestStartedAt || bodyReceivedAt > classifiedAt || typeof text !== 'string' || httpStatus < 200 || httpStatus >= 300 || httpStatus === null))
        || (outcome !== 'body' && (bodyReceivedAt !== null || text !== null))
        || (outcome === 'network_error' && httpStatus !== null)
        || (outcome === 'http_error' && (httpStatus === null || (httpStatus >= 200 && httpStatus < 300)))) {
        incomplete = true; return false;
      }
      if (receipts.length >= LIMIT.attempts) { incomplete = true; return false; }
      const receipt = { series, transport, requestStartedAt, classifiedAt, bodyReceivedAt, httpStatus, outcome,
        decodedResponseTextSha256: null, decodedResponseUtf8Bytes: null, parseStatus: 'no_body', parsedRowCount: null,
        missingCount: null, invalidCount: null, duplicateCount: null, conflictingDateCount: null };
      if (outcome === 'body') {
        receipt.decodedResponseUtf8Bytes = Buffer.byteLength(text, 'utf8');
        if (receipt.decodedResponseUtf8Bytes > LIMIT.responseBytes) receipt.parseStatus = 'byte_limit';
        else {
          receipt.decodedResponseTextSha256 = createHash('sha256').update(text, 'utf8').digest('hex');
          try { Object.assign(receipt, summarize(text, transport)); } catch { receipt.parseStatus = 'invalid_response'; }
        }
        if (receipt.parseStatus !== 'parsed' || receipt.invalidCount || receipt.conflictingDateCount) incomplete = true;
      }
      receipts.push(receipt);
      return true;
    },
    snapshot() {
      return { schema: 'brent-receipt-metadata-v1', researchOnly: true, publicProbability: false, main: false,
        providerFirstSeen: null, crossRunFirstSeen: null, firstSeenUnknown: true, persistent: false,
        captureIncomplete: incomplete, responseScope: 'existing_response_only_not_complete_history',
        limits: { ...LIMIT }, receipts: receipts.map(receipt => ({ ...receipt })) };
    }
  });
}
// Synchronous bounded recorder expected. Never wait for third-party thenables.
// Cannot isolate a malicious synchronous infinite loop; this is not a sandbox.
export function observeBrentReceipt(observer, input) {
  try {
    const result = observer?.record(input);
    if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
  } catch { /* Metadata errors must not become source failures or retries. */ }
}
