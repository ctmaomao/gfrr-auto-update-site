// Prepared-only migration contract. No production importer or freshness policy.
// Bounds complete the fixed v1 formula; they are not calibrated probabilities.
export const MARKET_COMPLETION_CONTRACT = 'world-order-market-completion-range-v2';
const CONTRIBUTIONS = Object.freeze({
  gold: Object.freeze([0, 11, 18]),
  brent: Object.freeze([0, 9, 16]),
  vix: Object.freeze([0, 10, 18]),
  dollarGold: Object.freeze([0, 12]),
  hyOas: Object.freeze([0, 10, 18]),
  spxGold: Object.freeze([0, 6])
});
export const MARKET_CRITERIA = Object.freeze(Object.keys(CONTRIBUTIONS));

/**
 * Caller must independently qualify each criterion, including both legs of a
 * joint signal. A known-false leg may certify a zero joint contribution.
 * Unknown/absent criteria retain their full v1 contribution range. This helper
 * does not infer qualification from finite values, timestamps or source names.
 */
export function buildMarketCompletionRange(criteria = {}) {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) throw new Error('market_criteria_invalid');
  if (Object.keys(criteria).some(key => !MARKET_CRITERIA.includes(key))) throw new Error('market_criterion_unknown');
  const entries = MARKET_CRITERIA.map(key => {
    const item = criteria[key];
    const allowed = CONTRIBUTIONS[key];
    if (item === undefined) return { key, status: 'unknown', lower: 0, upper: allowed.at(-1), reason: 'qualification_missing' };
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`market_criterion_invalid:${key}`);
    if (item.status === 'qualified') {
      if (!Number.isFinite(item.contribution) || !allowed.includes(item.contribution)) throw new Error(`market_contribution_invalid:${key}`);
      if (typeof item.evidenceRef !== 'string' || !item.evidenceRef.trim()) throw new Error(`market_evidence_missing:${key}`);
      return { key, status: 'qualified', lower: item.contribution, upper: item.contribution, evidenceRef: item.evidenceRef.trim() };
    }
    if (item.status !== 'unknown' || typeof item.reason !== 'string' || !item.reason.trim()
      || Object.hasOwn(item, 'contribution')) throw new Error(`market_unknown_invalid:${key}`);
    return { key, status: 'unknown', lower: 0, upper: allowed.at(-1), reason: item.reason.trim() };
  });
  const lower = entries.reduce((sum, entry) => sum + entry.lower, 0);
  const upper = entries.reduce((sum, entry) => sum + entry.upper, 0);
  const complete = entries.every(entry => entry.status === 'qualified');
  return {
    contractVersion: MARKET_COMPLETION_CONTRACT,
    lifecycle: 'prepared_not_activated',
    productionEligible: false,
    status: complete ? 'complete' : 'incomplete',
    score: complete ? lower : null,
    scoreRange: { lower, upper, kind: 'conditional_v1_formula_outer_bound' },
    criteria: entries,
    uncertaintyScope: 'market_qualification_only_other_model_components_not_assessed',
    calibratedProbability: false,
    regimeClassification: null
  };
}
