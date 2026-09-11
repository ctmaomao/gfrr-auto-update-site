const DAY_MS = 86400000;

function dayTime(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : null;
}

// Calendar-day comparisons, never record-count offsets. Missing/ambiguous
// observations remain unknown; do not manufacture a zero or a previous-day row.
export function calendarScoreChanges(history, date, score) {
  const now = dayTime(date);
  const rows = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    const time = dayTime(row?.date);
    if (time === null) continue;
    const value = Number.isFinite(row?.score) && row.score >= 0 && row.score <= 100 ? row.score : null;
    rows.set(time, rows.has(time) ? null : value);
  }
  return Object.fromEntries([1, 7, 30].map(days => {
    const prior = now === null ? null : rows.get(now - days * DAY_MS);
    const change = now !== null && Number.isFinite(score) && score >= 0 && score <= 100 && Number.isFinite(prior)
      ? score - prior : null;
    return [`scoreChange${days}d`, change];
  }));
}

// Thirty calendar dates ending on the snapshot date; no interpolation or
// carry-forward across missing days. Ambiguous dates are excluded.
export function calendarScoreWindow(history, date, days = 30) {
  const now = dayTime(date);
  if (now === null || !Number.isInteger(days) || days < 1) throw new TypeError('Invalid score window');
  const rows = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    const time = dayTime(row?.date);
    if (time === null || time > now || time <= now - days * DAY_MS) continue;
    const score = Number.isFinite(row.score) && row.score >= 0 && row.score <= 100 ? row.score : null;
    rows.set(time, rows.has(time) ? null : score);
  }
  const scores = [...rows.values()].filter(Number.isFinite);
  return { avg30d: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    peak30d: scores.length ? Math.max(...scores) : null,
    trough30d: scores.length ? Math.min(...scores) : null };
}
