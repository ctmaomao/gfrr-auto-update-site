import { parseObservationDate } from './source-observation.mjs';
const WEEK = 7 * 86400000;
const empty = () => ({ level: null, average: null, change: null, updatedAt: null, evidence: null });
const valid = (row, now) => typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
  && parseObservationDate(row.date, now) === row.date && Number.isFinite(row.value) && row.value >= 0;

// Claims only: CARTS has a 48-week calendar and must not use this helper.
export function claimsWindow(rows, now) {
  if (!Array.isArray(rows) || !rows.length || !valid(rows.at(-1), now)) return empty();
  const latest = rows.at(-1);
  const result = { ...empty(), level: latest.value, updatedAt: `${latest.date}T00:00:00Z` };
  const tail = rows.slice(-8);
  if (tail.some((row, i) => !valid(row, now) || (i && row.date <= tail[i - 1].date))) return result;
  const consecutive = values => values.length === 4 && values.every((row, i) => !i
    || Date.parse(row.date) - Date.parse(values[i - 1].date) === WEEK);
  const current = tail.slice(-4);
  if (!consecutive(current)) return result;
  result.average = Math.round(current.reduce((sum, row) => sum + row.value, 0) / 4);
  const prior = tail.slice(0, -4);
  const joined = prior.length === 4 && Date.parse(current[0].date) - Date.parse(prior.at(-1).date) === WEEK;
  if (joined && consecutive(prior)) {
    // Match the existing producer's three-decimal mean before whole-person delta.
    const mean = values => +(values.reduce((sum, row) => sum + row.value, 0) / 4).toFixed(3);
    result.change = +(mean(current) - mean(prior)).toFixed(0);
  }
  result.evidence = { method: 'claims-consecutive-weeks-v1', rows: (result.change === null ? current : tail).map(({date, value}) => ({date, value})) };
  return result;
}

export function cachedClaimsWindow(level, average, change, evidence, now) {
  const result = { ...empty(), level: Number.isFinite(level) && level >= 0 ? level : null };
  if (evidence?.method !== 'claims-consecutive-weeks-v1' || !Array.isArray(evidence.rows)
      || ![4, 8].includes(evidence.rows.length)) return result;
  const checked = claimsWindow(evidence.rows, now);
  if (checked.level !== level || checked.average !== average || checked.change !== change || !checked.evidence) return result;
  return checked;
}
