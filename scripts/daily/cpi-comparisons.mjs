// CPI is a monthly index: only the same calendar month one year ago and the
// immediately preceding month can support YoY/MoM. Never substitute nearby dates.
const METHOD = 'cpi-exact-calendar-month-v1';
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const change = (current, base) => Number.isFinite(current) && Number.isFinite(base) && base !== 0
  ? +((current - base) / base).toFixed(4) : null;
function targetMonth(date, months) {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1)).toISOString().slice(0, 7);
}
export function cpiComparisons(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let prior = '';
  for (const row of rows) {
    if (!day(row?.date) || row.date.slice(0, 7) <= prior) return null;
    prior = row.date.slice(0, 7);
  }
  const latest = rows.at(-1);
  if (!Number.isFinite(latest.value)) return null;
  const base = months => {
    const row = rows.find(r => r.date.slice(0, 7) === targetMonth(latest.date, months));
    return Number.isFinite(row?.value) ? { date: row.date, value: row.value } : null;
  };
  const yoyBase = base(12), momBase = base(1);
  return { index: +latest.value.toFixed(3), yoy: change(latest.value, yoyBase?.value),
    mom: change(latest.value, momBase?.value), updatedAt: `${latest.date}T00:00:00Z`,
    comparisonEvidence: { method: METHOD, latest: { date: latest.date, value: latest.value }, yoyBase, momBase } };
}
export function cachedCpiComparisons(previous, config) {
  const proof = previous?.comparisonEvidence?.[config.indexField];
  if (proof?.method !== METHOD) return null;
  const rows = [proof.yoyBase, proof.momBase, proof.latest].filter(Boolean);
  const result = cpiComparisons(rows);
  if (!result || result.index !== previous[config.indexField]
    || result.yoy !== previous[config.yoyField] || result.mom !== previous[config.momField]) return null;
  return result;
}
