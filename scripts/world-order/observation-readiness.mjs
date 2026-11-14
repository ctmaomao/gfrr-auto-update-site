import { MARKET_PROVENANCE_KEYS } from './market-input-provenance.mjs';

// Offline migration preflight only. Recognizing a registered source label is
// not verification of the upstream response, freshness, permissions or a rule.
const SOURCES = Object.freeze({
  brent: ['fred:DCOILBRENTEU'],
  gold: ['goldapi:XAU', 'https://api.gold-api.com/price/XAU'],
  vix: ['fred:VIXCLS'], dxy: ['fred:DTWEXBGS'],
  hyOas: ['fred:BAMLH0A0HYM2'], us10y: ['fred:DGS10'],
  real10y: ['fred:DFII10'], spx: ['fred:SP500']
});
const LEGS = Object.freeze({ gold: ['gold'], brent: ['brent'], vix: ['vix'],
  dollarGold: ['dxy', 'gold'], hyOas: ['hyOas'], spxGold: ['spx', 'gold'] });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sourceLabel = value => typeof value === 'string' ? value.trim().replace(/^FRED:/u, 'fred:') : null;

// Deliberately narrow accepted clock syntax: an actual calendar date or UTC ISO
// timestamp. Date.parse alone normalizes impossible days such as February 30.
export function parseReadinessTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/u.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return ms;
}

export function auditWorldOrderObservationReadiness({ values = {}, sourceDetails = {}, checkedAt } = {}) {
  const now = parseReadinessTimestamp(checkedAt);
  if (now === null || !record(values) || !record(sourceDetails)) throw new Error('world_order_readiness_input_invalid');
  const observations = Object.fromEntries(MARKET_PROVENANCE_KEYS.map(key => {
    const value = Number.isFinite(values[key]) ? values[key] : null;
    const d = sourceDetails[key];
    const source = sourceLabel(d?.source);
    const sourceRecognized = SOURCES[key].includes(source);
    const valueMatched = value !== null && record(d) && d.ok === true && Number.isFinite(d.value) && d.value === value;
    const timestamp = parseReadinessTimestamp(d?.timestamp);
    const reasons = [];
    if (value === null) reasons.push('selected_value_missing');
    if (!record(d)) reasons.push('raw_source_record_missing');
    else {
      if (!valueMatched) reasons.push('selected_value_not_bound_to_source_record');
      if (!sourceRecognized) reasons.push('source_instrument_unverified');
      if (timestamp === null) reasons.push('source_timestamp_invalid_or_missing');
      else if (timestamp > now) reasons.push('source_timestamp_future');
      if (d.timestampKind !== 'observation_date') reasons.push('timestamp_is_not_explicit_observation');
      // This provider field is acquisition time even if a caller relabels it.
      if (key === 'gold') reasons.push('gold_provider_time_is_not_quote_observation');
      if (d.fallbackUsed === true || d.held === true) reasons.push('fallback_or_held_observation');
      else if (d.fallbackUsed !== false) reasons.push('fallback_status_unknown');
      if (d.held !== true && d.held !== false) reasons.push('held_status_unknown');
    }
    if (key === 'dxy') reasons.push('broad_dollar_is_not_ice_dxy', 'dollar_series_rule_not_calibrated');
    if (key === 'brent') reasons.push('brent_spot_futures_rule_identity_not_reviewed');
    reasons.push('source_observation_semantics_not_certified', 'publication_calendar_not_reviewed');
    const observationClaimUsable = valueMatched && sourceRecognized && timestamp !== null && timestamp <= now
      && d.timestampKind === 'observation_date' && d.fallbackUsed === false && d.held === false && key !== 'gold';
    return [key, {
      selectedValue: value,
      sourceLabel: source,
      sourceRecognized,
      valueMatched,
      reportedTimestamp: typeof d?.timestamp === 'string' ? d.timestamp : null,
      reportedObservationAt: observationClaimUsable ? d.timestamp : null,
      qualifiedObservedAt: null,
      qualification: 'not_qualified',
      reasons
    }];
  }));
  const criteria = Object.fromEntries(Object.entries(LEGS).map(([key, legs]) => [key, {
    status: 'unknown',
    reason: [...new Set(legs.flatMap(leg => observations[leg].reasons.map(reason => `${leg}:${reason}`)))].join(';')
  }]));
  return {
    contractVersion: 'world-order-observation-readiness-v1',
    lifecycle: 'prepared_not_activated', productionEligible: false,
    checkedAt, observations, criteria,
    qualification: 'not_qualified',
    score: null,
    boundary: 'Metadata preflight only; no threshold evaluation, freshness certification or production eligibility.'
  };
}
