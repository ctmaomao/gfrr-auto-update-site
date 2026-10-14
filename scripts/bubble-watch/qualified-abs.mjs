const gap = reason => ({ status: 'unknown', reasonCode: 'dc_abs_direct_spread_unavailable', qualificationFailure: reason });
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
function reviewedUrl(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && hosts.includes(url.hostname) && ![...url.searchParams.keys()].some(key => /key|token|authorization|secret/iu.test(key));
  } catch { return false; }
}
export function qualifyDataCenterSpread(input, today, approvedReviews = []) {
  const now = day(today);
  if (now === null) return gap('invalid_check_date');
  if (!input || input.subjectType !== 'US_DATA_CENTER_ABS' || input.currency !== 'USD') return gap('wrong_market_or_subject');
  const review = approvedReviews.find(row => row.id === input.sourceReviewId && row.approved === true && row.coreEligibilityApproved === true
    && row.indicatorId === 'dc_abs_spread' && row.subjectType === 'US_DATA_CENTER_ABS' && row.currency === 'USD');
  if (!review || !Array.isArray(review.allowedHosts) || !Array.isArray(review.bondIds)
    || !review.bondIds.includes(input.bondId)) return gap('source_review_missing');
  if (!input.tranche || !['US_TREASURY', 'USD_SWAP'].includes(input.benchmarkType)) return gap('comparison_definition_missing');
  const quotes = ['current', 'week4', 'week12'].map(key => input[key]);
  const parsed = [];
  for (const quote of quotes) {
    if (!quote || quote.bondId !== input.bondId || quote.tranche !== input.tranche
      || quote.currency !== 'USD' || quote.benchmarkType !== input.benchmarkType
      || quote.observationKind !== 'market_quote') return gap('mixed_or_nonmarket_quotes');
    const date = day(quote.observedAt);
    if (date === null || date > now || quote.benchmarkObservedAt !== quote.observedAt
      || !reviewedUrl(quote.sourceUrl, review.allowedHosts)
      || !reviewedUrl(quote.benchmarkSourceUrl, review.allowedHosts)) return gap('date_or_source_invalid');
    const { yieldPct, benchmarkYieldPct, tenorYears, benchmarkTenorYears } = quote;
    if (![yieldPct, benchmarkYieldPct, tenorYears, benchmarkTenorYears].every(value => typeof value === 'number' && Number.isFinite(value))
      || yieldPct < 0 || yieldPct > 100 || benchmarkYieldPct < -5 || benchmarkYieldPct > 100
      || tenorYears <= 0 || benchmarkTenorYears <= 0 || Math.abs(tenorYears - benchmarkTenorYears) > 0.1) return gap('yield_or_matched_tenor_missing');
    parsed.push({ date, spreadBp: (yieldPct - benchmarkYieldPct) * 100 });
  }
  const [current, week4, week12] = parsed;
  const ageDays = (now - current.date) / 86400000;
  const gap4 = (current.date - week4.date) / 86400000;
  const gap12 = (current.date - week12.date) / 86400000;
  if (ageDays > 21 || gap4 < 20 || gap4 > 40 || gap12 < 75 || gap12 > 95) return gap('observation_or_baseline_stale');
  const change4wBp = current.spreadBp - week4.spreadBp;
  const change12wBp = current.spreadBp - week12.spreadBp;
  const status = change4wBp >= 50 - 1e-10 ? 'red' : change12wBp <= -10 + 1e-10 ? 'green' : 'yellow';
  return {
    status, asOf: input.current.observedAt, ageDays,
    spreadBp: Number(current.spreadBp.toFixed(1)),
    change4wBp: Number(change4wBp.toFixed(1)), change12wBp: Number(change12wBp.toFixed(1)),
    sourceReviewId: input.sourceReviewId, bondId: input.bondId, tranche: input.tranche,
    policy: 'us_data_center_matched_spread_v1'
  };
}
