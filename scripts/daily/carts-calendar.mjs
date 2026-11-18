import { parseObservationDate } from './source-observation.mjs';

// FRED represents the Chicago Fed's four intramonth slots with day labels
// 07, 14, 21 and 28. The final slot covers the rest of the month, not just
// through day 28. Rank slots, not elapsed days or surviving row positions.
function slotKey(date) {
  const match = typeof date === 'string' && /^(\d{4})-(0[1-9]|1[0-2])-(07|14|21|28)$/.exec(date);
  return match ? Number(match[1]) * 48 + (Number(match[2]) - 1) * 4 + Number(match[3]) / 7 - 1 : null;
}

export function cartsCalendarComparisons(rows, now) {
  const latest = Array.isArray(rows) ? rows.at(-1) : null;
  const currentKey = slotKey(latest?.date);
  if (currentKey === null || parseObservationDate(latest.date, now) !== latest.date) return { average: null, yoy: null };
  const slots = new Map();
  for (const row of rows) {
    const key = slotKey(row?.date);
    if (key === null) continue;
    // An ambiguous slot is unusable even when the values happen to match.
    slots.set(key, slots.has(key) || !Number.isFinite(row.value) || row.value < 0 ? null : row.value);
  }
  const current = slots.get(currentKey);
  const reference = slots.get(currentKey - 48);
  const window = [3, 2, 1, 0].map(back => slots.get(currentKey - back));
  return {
    average: window.every(Number.isFinite) ? +(window.reduce((sum, value) => sum + value, 0) / 4).toFixed(3) : null,
    yoy: Number.isFinite(current) && Number.isFinite(reference) && reference > 0
      ? +((current - reference) / reference).toFixed(4) : null
  };
}
