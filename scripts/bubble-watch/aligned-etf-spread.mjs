import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

// Price returns (not dividend-adjusted total returns), on identical sessions.
export function alignedEtfSpread(spyRows, rspRows, asOfDate) {
  const normalize = (rows, symbol) => {
    if (!Array.isArray(rows)) throw new Error(`${symbol}_history_invalid`);
    const values = new Map();
    for (const row of rows) {
      if (!row || !(Number.isFinite(row.close) && row.close > 0)) throw new Error(`${symbol}_close_invalid`);
      assessUnderlyingObservationFreshness({ observationDate: row.date, asOfDate, maxAgeDays: 366 });
      if (values.has(row.date)) throw new Error(`${symbol}_duplicate_session`);
      values.set(row.date, row.close);
    }
    return values;
  };
  const spy = normalize(spyRows, 'SPY');
  const rsp = normalize(rspRows, 'RSP');
  const dates = [...spy.keys()].filter(date => rsp.has(date)).sort();
  if (dates.length < 100) throw new Error('etf_spread_common_sessions_insufficient');
  const startDate = dates[0];
  const observationDate = dates.at(-1);
  const spanDays = (Date.parse(observationDate) - Date.parse(startDate)) / 86400000;
  if (spanDays < 150 || spanDays > 200) throw new Error('etf_spread_six_month_window_invalid');
  const freshness = assessUnderlyingObservationFreshness({ observationDate, asOfDate, maxAgeDays: 7 });
  if (freshness.status !== 'fresh') throw new Error('etf_spread_observation_stale');
  const ret = values => ((values.get(observationDate) - values.get(startDate)) / values.get(startDate)) * 100;
  const spyRet = ret(spy);
  const rspRet = ret(rsp);
  const spread = spyRet - rspRet;
  if (![spyRet, rspRet, spread].every(Number.isFinite)) throw new Error('etf_spread_return_nonfinite');
  return { spyRet, rspRet, spread, startDate, observationDate,
    commonSessions: dates.length, priceBasis: 'unadjusted_close_price_return', freshness };
}
