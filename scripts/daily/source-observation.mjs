// Strict source-observation date helpers. No network, no production writes.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

function calendarDate(text) {
  if (!DATE.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d ? text : null;
}

function isoParts(value) {
  const match = typeof value === 'string' ? ISO.exec(value) : null;
  if (!match) return null;
  const date = calendarDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (date === null || hour > 23 || minute > 59 || second > 59) return null;
  const offset = match[6];
  if (offset !== 'Z') {
    const [, , oh, om] = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    const offsetHour = Number(oh);
    const offsetMinute = Number(om);
    if (Number(oh) > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? { date, ms } : null;
}

// Parse a canonical observation clock without applying freshness/future policy.
export function parseObservationTimestamp(value) {
  if (typeof value !== 'string') return null;
  if (DATE.test(value)) return calendarDate(value) === null ? null : Date.parse(`${value}T00:00:00Z`);
  // Accept equivalent ISO spellings without permitting Date.parse rollover.
  const match = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return null;
  const zone = match[5].toUpperCase().replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  return isoParts(`${match[1]}T${match[2]}:${match[3] ?? '00'}${match[4] ?? ''}${zone}`)?.ms ?? null;
}

export function parseObservationDate(value, nowIso) {
  if (typeof value !== 'string') return null;
  const nowMs = typeof nowIso === 'string' ? Date.parse(nowIso) : NaN;
  if (!Number.isFinite(nowMs)) return null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (DATE.test(value)) {
    const date = calendarDate(value);
    return date !== null && date <= today ? date : null;
  }
  const parsed = isoParts(value);
  if (parsed === null || parsed.date > today || parsed.ms > nowMs) return null;
  return parsed.date;
}

function normalizedDay(value) {
  if (typeof value !== 'string') return null;
  if (DATE.test(value)) return calendarDate(value);
  return isoParts(value)?.date ?? null;
}

export function latestDatedObservation(rows, nowIso) {
  const last = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
  if (!last || typeof last !== 'object' || !Number.isFinite(last.value)) return { value: null, date: null };
  return {
    value: last.value,
    date: parseObservationDate(last.date, nowIso),
  };
}

export function fallbackObservation(prevValue, prevDate, nowIso) {
  if (!Number.isFinite(prevValue)) return { value: null, date: null };
  return {
    value: prevValue,
    date: parseObservationDate(prevDate, nowIso),
  };
}

export function sameObservationDay(a, b) {
  const left = normalizedDay(a);
  const right = normalizedDay(b);
  if (left === null || right === null) return null;
  return left === right;
}

// Credit changes require the named observation period, not the nearest available
// boundary. FRED NFCI is weekly; SLOOS observations use quarter-start dates.
export function creditPeriodChange(rows, period, nowIso) {
  const latest = latestDatedObservation(rows, nowIso);
  if (latest.value === null || latest.date === null || rows.at(-1).date !== latest.date
    || rows.filter(row => row?.date === latest.date).length !== 1) return null;
  const date = new Date(`${latest.date}T00:00:00Z`);
  if (period === 'fourWeeks') date.setUTCDate(date.getUTCDate() - 28);
  else if (period === 'quarter') {
    if (date.getUTCDate() !== 1 || date.getUTCMonth() % 3 !== 0) return null;
    date.setUTCMonth(date.getUTCMonth() - 3);
  } else return null;
  const referenceDate = date.toISOString().slice(0, 10);
  const matches = rows.filter(row => row?.date === referenceDate);
  if (matches.length !== 1 || !Number.isFinite(matches[0].value)) return null;
  return latest.value - matches[0].value;
}

// WRESBAL is a weekly average ending Wednesday, not a daily/Wed point level.
// A missing four-week endpoint cannot be replaced by the nearest available week.
export function reserveBalanceChange(rows, nowIso) {
  const missing = { change: null, reference: null };
  if (!Array.isArray(rows) || rows.length < 2) return missing;
  let priorDate = '';
  for (const row of rows) {
    if (typeof row?.date !== 'string' || parseObservationDate(row.date, nowIso) !== row.date
      || !DATE.test(row.date) || new Date(`${row.date}T00:00:00Z`).getUTCDay() !== 3
      || row.date <= priorDate || !Number.isFinite(row.value) || row.value < 0) return missing;
    priorDate = row.date;
  }
  const latest = rows.at(-1);
  const target = new Date(`${latest.date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() - 28);
  const reference = rows.find(row => row.date === target.toISOString().slice(0, 10));
  if (!reference || reference.value === 0) return missing;
  const change = +(((latest.value - reference.value) / reference.value) * 100).toFixed(3);
  return Number.isFinite(change) ? { change, reference: { date: reference.date, value: reference.value } } : missing;
}

export function cachedReserveBalanceChange(previous, nowIso) {
  const missing = { change: null, reference: null };
  if (!['live', 'fallback'].includes(previous?.sourceStatus?.reserveBalances)
    || !previous?.reserveBalances4wReference) return missing;
  const result = reserveBalanceChange([previous.reserveBalances4wReference,
    { date: previous.sourceObservedAt?.reserveBalances, value: previous.reserveBalances }], nowIso);
  return result.change !== null && result.change === previous.reserveBalances4wChange ? result : missing;
}

// H.8 CRE bank-loan balance is a Wednesday-ending stock, not a flow.
// Use exact endpoints 28 and 364 days earlier, independently: an interior
// missing week is immaterial, but a neighboring week is not a substitute.
export function creLoanBalanceDate(value, nowIso) {
  const day = parseObservationDate(value, nowIso);
  return day && new Date(`${day}T00:00:00Z`).getUTCDay() === 3 ? day : null;
}

export function creLoanBalanceSnapshot(rows, nowIso) {
  const empty = { value: null, date: null, fourWeekChange: null, yoy: null };
  const latest = Array.isArray(rows) ? rows.at(-1) : null;
  const date = creLoanBalanceDate(latest?.date, nowIso);
  if (date === null || date !== latest.date || !Number.isFinite(latest.value) || latest.value < 0
    || rows.filter(row => row?.date === date).length !== 1
    || rows.some(row => DATE.test(row?.date || '') && row.date > date)) return empty;
  const ratio = (days) => {
    const endpoint = new Date(`${date}T00:00:00Z`);
    endpoint.setUTCDate(endpoint.getUTCDate() - days);
    const referenceDate = endpoint.toISOString().slice(0, 10);
    const matches = rows.filter(row => row?.date === referenceDate);
    const reference = matches[0]?.value;
    if (matches.length !== 1 || !Number.isFinite(reference) || reference <= 0) return null;
    const change = +((latest.value - reference) / reference).toFixed(4);
    return Number.isFinite(change) ? change : null;
  };
  return { value: latest.value, date, fourWeekChange: ratio(28), yoy: ratio(364) };
}
