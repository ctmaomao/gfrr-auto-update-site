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
