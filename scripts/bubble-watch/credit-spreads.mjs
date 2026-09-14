// Independent display history; never feeds Bubble Watch scoring or AI inputs.
export const CREDIT_SERIES = Object.freeze({ hy: 'BAMLH0A0HYM2', ccc: 'BAMLH0A3HYC', ig: 'BAMLC0A0CM' });
const DAY = 86400000;

export function validCreditDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateCreditPoints(points, now = new Date()) {
  if (!Array.isArray(points) || points.length < 6 || points.length > 370) throw new Error('credit_history_incomplete');
  const today = now.toISOString().slice(0, 10);
  let previous = '';
  for (const point of points) {
    if (!validCreditDate(point?.date) || point.date > today || point.date <= previous
      || typeof point.bps !== 'number' || !Number.isFinite(point.bps) || point.bps < 0) throw new Error('credit_observation_invalid');
    previous = point.date;
  }
  return points;
}

export function parseCreditCsv(csv, id, now = new Date()) {
  const lines = csv.trim().split(/\r?\n/);
  if (!['observation_date', 'DATE'].includes(lines[0]?.split(',')[0]) || lines[0]?.split(',')[1] !== id) throw new Error('credit_csv_header_invalid');
  const cutoff = new Date(now.getTime() - 366 * DAY).toISOString().slice(0, 10);
  const points = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!validCreditDate(date) || date > now.toISOString().slice(0, 10)) throw new Error('credit_date_invalid');
    if (date < cutoff || raw === '.' || raw?.trim() === '') continue;
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(raw || '')) throw new Error('credit_value_invalid');
    points.push({ date, bps: Math.round(Number(raw) * 100) });
  }
  validateCreditPoints(points, now);
  if (points.length < 200 || Date.parse(points.at(-1).date) - Date.parse(points[0].date) < 300 * DAY) throw new Error('credit_year_coverage_incomplete');
  return points;
}

export async function collectCreditSpreads({ previous, now = new Date(), fetchImpl = fetch } = {}) {
  const series = {};
  const sources = {};
  const start = new Date(now.getTime() - 366 * DAY).toISOString().slice(0, 10);
  await Promise.all(Object.entries(CREDIT_SERIES).map(async ([key, id]) => {
    try {
      const response = await fetchImpl(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('credit_fetch_failed');
      const points = parseCreditCsv(await response.text(), id, now);
      let old = null;
      try { old = validateCreditPoints(previous?.series?.[key], now); } catch { /* No qualified historical series. */ }
      if (old && points.at(-1).date < old.at(-1).date) throw new Error('credit_source_regressed');
      series[key] = points;
      sources[key] = { seriesId: id, status: 'fresh', fetchedAt: now.toISOString(), observationDate: points.at(-1).date };
    } catch {
      // A source outage cannot erase validated history or relabel it as newly fetched.
      try {
        series[key] = validateCreditPoints(previous?.series?.[key], now);
        sources[key] = { seriesId: id, status: 'fallback', fetchedAt: previous?.sources?.[key]?.fetchedAt || null, observationDate: series[key].at(-1).date };
      } catch {
        series[key] = [];
        sources[key] = { seriesId: id, status: 'missing', fetchedAt: null, observationDate: null };
      }
    }
    if (sources[key].status === 'fresh' && now.getTime() - Date.parse(sources[key].observationDate) > 10 * DAY) sources[key].status = 'stale';
  }));
  return { contractVersion: 'bubble-credit-spreads-v1', boundary: 'display_only_no_score_impact', checkedAt: now.toISOString(), windowDays: 366, series, sources };
}
