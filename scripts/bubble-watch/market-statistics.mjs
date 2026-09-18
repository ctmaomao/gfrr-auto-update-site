// Pure existing Bubble Watch statistics; formulas and missing-value behavior are preserved.
export function mean(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, v) => sum + v, 0) / nums.length : null;
}

export function standardDeviation(values) {
  const m = mean(values);
  if (!Number.isFinite(m) || values.length < 2) return null;
  const variance = values.reduce((sum, v) => sum + ((v - m) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function pctReturn(start, end) {
  if (!(start > 0 && end > 0)) return null;
  return ((end - start) / start) * 100;
}

export function closesByDate(rows) {
  return new Map(rows.map((row) => [row.date, row.close]));
}

export function commonDatesForSeries(seriesRows) {
  if (!seriesRows.length) return [];
  let dates = new Set(seriesRows[0].map((row) => row.date));
  for (const rows of seriesRows.slice(1)) {
    const rowDates = new Set(rows.map((row) => row.date));
    dates = new Set([...dates].filter((date) => rowDates.has(date)));
  }
  return [...dates].sort();
}

export function sliceCommonCloses(rows, dates) {
  const byDate = closesByDate(rows);
  return dates.map((date) => byDate.get(date)).filter((v) => Number.isFinite(v) && v > 0);
}

export function dailyReturnsFromCloses(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

export function covariance(a, b) {
  if (a.length !== b.length || a.length < 5) return null;
  const ma = mean(a);
  const mb = mean(b);
  if (!Number.isFinite(ma) || !Number.isFinite(mb)) return null;
  return a.reduce((sum, v, i) => sum + ((v - ma) * (b[i] - mb)), 0) / a.length;
}

export function correlation(a, b) {
  const cov = covariance(a, b);
  const sa = standardDeviation(a);
  const sb = standardDeviation(b);
  if (!Number.isFinite(cov) || !(sa > 0) || !(sb > 0)) return null;
  return cov / (sa * sb);
}

export function betaToBenchmark(assetReturns, benchmarkReturns) {
  const cov = covariance(assetReturns, benchmarkReturns);
  const benchmarkStdDev = standardDeviation(benchmarkReturns);
  const variance = Number.isFinite(benchmarkStdDev) ? benchmarkStdDev ** 2 : null;
  if (!Number.isFinite(cov) || !(variance > 0)) return null;
  return cov / variance;
}

export function rsi14(closes) {
  const window = closes.slice(-15);
  if (window.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < window.length; i++) {
    const diff = window[i] - window[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function bollingerPctB(closes) {
  const window = closes.slice(-20);
  if (window.length < 20) return null;
  const ma = mean(window);
  const sd = standardDeviation(window);
  if (!Number.isFinite(ma) || !(sd > 0)) return null;
  const upper = ma + (2 * sd);
  const lower = ma - (2 * sd);
  return (closes[closes.length - 1] - lower) / (upper - lower);
}
