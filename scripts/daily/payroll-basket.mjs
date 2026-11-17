import { parseObservationDate } from './source-observation.mjs';

export const PAYROLL_BASKET_METHOD = 'custom-overlapping-11-series-mom-v1';
const SIZE = 11;
const monthDate = (value, nowIso) => typeof value === 'string' && /^\d{4}-\d{2}-01$/.test(value)
  && parseObservationDate(value, nowIso) === value;
const empty = () => ({ industryPayrollDiffusionPct: null, industryPayrollPositiveCount: null,
  industryPayrollSeriesCount: null, industryPayrollUpdatedAt: null, industryPayrollMethod: null, positiveSeries: [] });

// Existing equal-series >0 share, not the BLS diffusion index: the retail
// component overlaps trade/transport/utilities and unchanged observations get no half vote.
export function calculatePayrollBasket(results, series, nowIso) {
  const missing = empty();
  if (!Array.isArray(series) || series.length !== SIZE || series.some(item => typeof item?.id !== 'string' || !item.id) || new Set(series.map(item => item.id)).size !== SIZE
    || !Array.isArray(results) || results.length !== SIZE) return missing;
  let month = null;
  const positiveSeries = [];
  for (let index = 0; index < SIZE; index++) {
    const result = results[index];
    const rows = result?.value;
    if (result?.status !== 'fulfilled' || !Array.isArray(rows) || rows.length < 2) return missing;
    let previousDate = '';
    for (const row of rows) {
      if (!monthDate(row?.date, nowIso) || !Number.isFinite(row?.value) || row.value < 0 || row.date <= previousDate) return missing;
      previousDate = row.date;
    }
    const current = rows.at(-1);
    if (month !== null && current.date !== month) return missing;
    month = current.date;
    const [year, number] = month.split('-').map(Number);
    const referenceDate = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 10);
    const previous = rows.find(row => row.date === referenceDate);
    if (!previous) return missing;
    if (current.value > previous.value) positiveSeries.push(series[index].id);
  }
  return { industryPayrollDiffusionPct: +(positiveSeries.length / SIZE * 100).toFixed(1),
    industryPayrollPositiveCount: positiveSeries.length, industryPayrollSeriesCount: SIZE,
    industryPayrollUpdatedAt: `${month}T00:00:00Z`, industryPayrollMethod: PAYROLL_BASKET_METHOD, positiveSeries };
}

// Never turn legacy/mixed-period aggregates into verified new-method history.
export function verifiedPayrollBasketFallback(snapshot, nowIso) {
  const count = snapshot?.industryPayrollPositiveCount;
  const date = snapshot?.industryPayrollUpdatedAt;
  if (snapshot?.industryPayrollMethod !== PAYROLL_BASKET_METHOD || snapshot.industryPayrollSeriesCount !== SIZE
    || !Number.isInteger(count) || count < 0 || count > SIZE
    || snapshot.industryPayrollDiffusionPct !== +(count / SIZE * 100).toFixed(1)
    || typeof date !== 'string' || date !== `${date.slice(0, 10)}T00:00:00Z` || !monthDate(date.slice(0, 10), nowIso)
    || !['live', 'fallback'].includes(snapshot?.sourceStatus?.industryPayroll)) return empty();
  return { industryPayrollDiffusionPct: snapshot.industryPayrollDiffusionPct, industryPayrollPositiveCount: count,
    industryPayrollSeriesCount: SIZE, industryPayrollUpdatedAt: date, industryPayrollMethod: PAYROLL_BASKET_METHOD, positiveSeries: [] };
}
