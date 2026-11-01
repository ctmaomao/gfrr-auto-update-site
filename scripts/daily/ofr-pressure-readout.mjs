import { createHash } from 'node:crypto';

// Prepared adapter only. No Daily, browser, decision, execution or position import.
export const OFR_READOUT_CONTRACT = 'ofr-pressure-readout-preparation-v1';
export const OFR_CSV_URL = 'https://www.financialresearch.gov/financial-stress-index/data/fsi.csv';
export const OFR_SOURCE_URL = 'https://www.financialresearch.gov/financial-stress-index/';
export const OFR_LIMITS = Object.freeze({ maxBytes: 6000000, timeoutMs: 15000, maxRows: 20000, maxAgeDays: 7 });
export const OFR_COLUMNS = Object.freeze(['Date', 'OFR FSI', 'Credit', 'Equity valuation', 'Safe assets', 'Funding', 'Volatility', 'United States', 'Other advanced economies', 'Emerging markets']);
const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const rawSha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function strictOfrDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !strictOfrDate(value.slice(0, 10))) throw new Error('Invalid UTC timestamp');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')) throw new Error('Invalid UTC timestamp');
  return ms;
}
const dayMs = date => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, n) => new Date(dayMs(date) + n * DAY).toISOString().slice(0, 10);
function csvFields(line) {
  const fields = []; let text = '', quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { text += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else text += c;
    } else if (c === ',') { fields.push(text); text = ''; closed = false; }
    else if (c === '"' && text === '' && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Invalid CSV quoting'); text += c; }
  }
  if (quoted) throw new Error('Unclosed CSV field');
  fields.push(text); return fields;
}
function numberOrNull(value) {
  if (['', '.', 'NA', 'N/A', 'null'].includes(value)) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new Error('Invalid numeric CSV cell');
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Nonfinite CSV cell');
  return result;
}
export function validateOfrRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > OFR_LIMITS.maxRows) throw new Error('Invalid OFR row count');
  let previous = '';
  for (const row of rows) {
    if (!strictOfrDate(row?.date) || row.date <= previous || (row.value !== null && !finite(row.value))) throw new Error('Invalid/duplicate/unsorted OFR row');
    previous = row.date;
  }
  return true;
}
export function parseOfrCsv(csv) {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > OFR_LIMITS.maxBytes) throw new Error('CSV size limit');
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const header = csvFields(lines.shift() ?? '');
  if (JSON.stringify(header) !== JSON.stringify(OFR_COLUMNS)) throw new Error('OFR schema changed');
  const rows = lines.map(line => {
    const cells = csvFields(line);
    if (cells.length !== header.length) throw new Error('CSV column count');
    const values = Object.fromEntries(header.slice(1).map((k, i) => [k, numberOrNull(cells[i + 1])]));
    return { date: cells[0], value: values['OFR FSI'], contributions: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'OFR FSI')) };
  });
  validateOfrRows(rows); return rows;
}
function atOrBefore(rows, date) {
  let low = 0, high = rows.length;
  while (low < high) { const mid = (low + high) >> 1; if (rows[mid].date <= date) low = mid + 1; else high = mid; }
  return rows[low - 1] ?? null;
}
function windowStart(date, years) {
  const [year, month, day] = date.split('-').map(Number);
  // Feb29 becomes Feb28 in a non-leap start year; never rolls forward to March1.
  const candidate = `${year - years}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return strictOfrDate(candidate) ? candidate : `${year - years}-02-28`;
}
export function ofrHistoricalPercentile(rows, date, { years = 10, minimumRows = 2000 } = {}) {
  validateOfrRows(rows);
  if (!strictOfrDate(date) || !(years === null || (Number.isInteger(years) && years > 0)) || !Number.isInteger(minimumRows) || minimumRows < 2) throw new Error('Invalid percentile specification');
  const current = rows.find(row => row.date === date);
  const start = years === null ? rows[0].date : windowStart(date, years);
  const history = rows.filter(row => row.date >= start && row.date < date && finite(row.value));
  const maxGapDays = history.length < 2 ? null : Math.max(...history.slice(1).map((r, i) => (dayMs(r.date) - dayMs(history[i].date)) / DAY), (dayMs(date) - dayMs(history.at(-1).date)) / DAY);
  const reasons = [];
  if (!current || !finite(current.value)) reasons.push('current_value_missing');
  if (history.length < minimumRows) reasons.push('history_count_insufficient');
  if (!history.length || dayMs(history[0].date) - dayMs(start) > 7 * DAY) reasons.push('history_window_start_missing');
  if (maxGapDays === null || maxGapDays > 14) reasons.push('history_gap_exceeds_14_days');
  const lower = current && finite(current.value) ? history.filter(row => row.value < current.value).length : null;
  const equal = current && finite(current.value) ? history.filter(row => row.value === current.value).length : null;
  return { value: reasons.length ? null : 100 * (lower + 0.5 * equal) / history.length, method: 'strict_prior_midrank', years, minimumRows, startDate: start, endDateExclusive: date, historyRows: history.length, firstObservation: history[0]?.date ?? null, lastObservation: history.at(-1)?.date ?? null, maxGapDays, lower, equal, reasons, meaning: 'historical_relative_position_not_crisis_probability' };
}
export function compareOfrSnapshots(previousRows, rows) {
  validateOfrRows(previousRows); validateOfrRows(rows);
  const old = new Map(previousRows.map(r => [r.date, r.value]));
  const now = new Map(rows.map(r => [r.date, r.value]));
  return { overlappingDates: rows.filter(r => old.has(r.date)).length, changes: rows.filter(r => old.has(r.date) && old.get(r.date) !== r.value).map(r => ({ date: r.date, before: old.get(r.date), after: r.value, kind: old.get(r.date) === null || r.value === null ? 'availability_change' : 'numeric_revision' })), priorDatesNotReturned: previousRows.filter(r => !now.has(r.date)).map(r => r.date), missingDateMeaning: 'not_automatically_withdrawn_or_calm' };
}
export function buildOfrReadout(rows, { asOf, retrievedAt, snapshotSha256 }) {
  validateOfrRows(rows);
  const asOfMs = timestamp(asOf), receiptMs = timestamp(retrievedAt);
  if (receiptMs > asOfMs || typeof snapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(snapshotSha256)) throw new Error('Invalid source receipt');
  if (rows.at(-1).date > retrievedAt.slice(0, 10)) throw new Error('Future source observation');
  const current = atOrBefore(rows, asOf.slice(0, 10));
  if (!current) throw new Error('No observation available');
  const ageDays = (dayMs(asOf.slice(0, 10)) - dayMs(current.date)) / DAY;
  const status = !finite(current.value) ? 'missing_current' : ageDays > OFR_LIMITS.maxAgeDays ? 'stale' : 'available';
  const lastKnown = [...rows].reverse().find(r => r.date <= current.date && finite(r.value)) ?? null;
  const weekTarget = addDays(current.date, -7), previous = atOrBefore(rows, weekTarget);
  const weeklyValid = finite(current.value) && previous && finite(previous.value) && dayMs(weekTarget) - dayMs(previous.date) <= 4 * DAY;
  return { contractVersion: OFR_READOUT_CONTRACT, lifecycle: 'prepared_not_activated', productionEligible: false, source: { provider: 'Office of Financial Research', sourceUrl: OFR_SOURCE_URL, retrievedAt, snapshotSha256, observedDate: current.date, officialPublicationLagNote: 'current from two business days prior; exact first publication time not established', firstReleaseHistory: false }, asOf, status, index: { value: current.value, observedDate: current.date, ageDays, freshnessMaxCalendarDays: OFR_LIMITS.maxAgeDays }, relativeToAverage: finite(current.value) ? current.value > 0 ? 'above_historical_average' : current.value < 0 ? 'below_historical_average' : 'at_historical_average' : 'unknown', lastKnown: lastKnown ? { value: lastKnown.value, observedDate: lastKnown.date } : null, weeklyChange: { value: weeklyValid ? current.value - previous.value : null, fromDate: weeklyValid ? previous.date : null, toDate: current.date, targetDate: weekTarget, meaning: 'change_from_dated_observation_approximately_one_week_prior' }, percentile: ofrHistoricalPercentile(rows, current.date), contributions: current.contributions ?? null, boundaries: { calibratedProbability: false, crisisStateAssigned: false, oldThresholdsApplied: false, tailFloorAdded: false, worldOrderAdded: false, decisionMapping: null, positionMapping: null }, staleDisplayPolicy: 'preserve dated last observation; exclude from current headline eligibility; never substitute legacy risk score' };
}
export async function fetchOfrSnapshot({ fetchImpl = globalThis.fetch, clock = () => new Date().toISOString() } = {}) {
  const startedAt = clock(); let raw = null, receipt = { startedAt, requestUrl: OFR_CSV_URL, requestCount: 1, retry: 0, status: 'fetch_failed' };
  try {
    timestamp(startedAt);
    const response = await fetchImpl(OFR_CSV_URL, { redirect: 'error', signal: AbortSignal.timeout(OFR_LIMITS.timeoutMs), headers: { 'User-Agent': 'GFRR-OFR-Readout-Preparation/1.0' } });
    receipt.httpStatus = response.status;
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const chunks = []; let bytes = 0;
    if (!response.body) throw new Error('Response body missing');
    for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > OFR_LIMITS.maxBytes) throw new Error('Response size limit'); chunks.push(chunk); }
    raw = Buffer.concat(chunks); receipt = { ...receipt, bytes, rawSha256: rawSha256(raw), contentType: response.headers.get('content-type'), receivedAt: clock() };
    receipt.status = 'parse_failed';
    const rows = parseOfrCsv(raw.toString('utf8'));
    const readout = buildOfrReadout(rows, { asOf: receipt.receivedAt, retrievedAt: receipt.receivedAt, snapshotSha256: receipt.rawSha256 });
    receipt.status = 'received'; return { receipt, raw, rows, readout };
  } catch (error) {
    receipt = { ...receipt, receivedAt: clock(), error: error?.name === 'TimeoutError' ? 'timeout' : String(error.message) };
    return { receipt, raw, rows: null, readout: null };
  }
}
