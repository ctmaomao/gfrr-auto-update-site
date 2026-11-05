// Offline review of manually transcribed primary disclosures. This module is
// intentionally not imported by a builder, validator or frontend.
import { NVDA_REVENUE_MAX_AGE_DAYS } from '../modules/nvdaEvidencePolicy.js';

const DAY = 86400000;
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 10) === value;
const distance = (start, end) => (Date.parse(end) - Date.parse(start)) / DAY;
const fail = reason => { throw new Error(`nvda_primary_audit_${reason}`); };
const official = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.sec.gov', 'nvidianews.nvidia.com', 'investor.nvidia.com', 'openai.com', 'www.anthropic.com'].includes(url.hostname);
  } catch { return false; }
};

export function reviewNvdaPrimaryEvidence(input, asOfDate) {
  if (!day(asOfDate) || !day(input?.reviewedAt) || input.reviewedAt > asOfDate) fail('clock_invalid');
  if (input.schemaVersion !== 'nvda-primary-source-audit-v1' || input.issuer !== 'NVDA'
    || input.currency !== 'USD' || input.amountUnit !== 'USD_million_as_reported'
    || input.scope !== 'manual_primary_source_review_only_not_production_input') fail('identity_or_unit_invalid');
  const source = id => {
    const item = input.sources?.[id];
    if (!official(item?.url) || !day(item?.publishedAt) || item.publishedAt > input.reviewedAt
      || typeof item.locator !== 'string' || !item.locator.trim()) fail('source_invalid');
    return item;
  };
  const fact = row => {
    if (!day(row?.start) || !day(row.end) || row.start > row.end || row.end > asOfDate
      || !Number.isSafeInteger(row.revenueMillion) || row.revenueMillion <= 0
      || source(row.sourceId).publishedAt < row.end) fail('revenue_fact_invalid');
    return row.revenueMillion;
  };
  if (!Array.isArray(input.quarters) || input.quarters.length !== 4) fail('four_quarters_required');
  const quarters = input.quarters;
  const quarterSumMillion = quarters.reduce((sum, row, i) => {
    const amount = fact(row), length = distance(row.start, row.end) + 1;
    if (length < 75 || length > 105 || (i && distance(quarters[i - 1].end, row.start) !== 1)) fail('quarter_window_invalid');
    return sum + amount;
  }, 0);
  const first = quarters[0].start, last = quarters.at(-1).end;
  if (distance(first, last) + 1 < 350 || distance(first, last) + 1 > 380) fail('ltm_window_invalid');
  const { priorYear, priorHalf, currentHalf } = input.bridge ?? {};
  const bridgeMillion = fact(priorYear) - fact(priorHalf) + fact(currentHalf);
  if (priorYear.start !== priorHalf.start || distance(priorYear.end, currentHalf.start) !== 1
    || distance(priorHalf.end, first) !== 1 || currentHalf.end !== last
    || priorYear.end !== quarters[1].end || currentHalf.start !== quarters[2].start
    || distance(priorYear.start, priorYear.end) + 1 < 350 || distance(priorYear.start, priorYear.end) + 1 > 380
    || distance(priorHalf.start, priorHalf.end) + 1 < 150 || distance(priorHalf.start, priorHalf.end) + 1 > 210
    || distance(currentHalf.start, currentHalf.end) + 1 < 150 || distance(currentHalf.start, currentHalf.end) + 1 > 210
    || !Number.isSafeInteger(quarterSumMillion) || !Number.isSafeInteger(bridgeMillion)) fail('bridge_window_invalid');
  const ids = new Set();
  if (!Array.isArray(input.disclosures) || !input.disclosures.length) fail('disclosures_missing');
  const disclosures = input.disclosures.map(row => {
    if (typeof row.id !== 'string' || !row.id || ids.has(row.id) || !day(row.observedAt)
      || row.observedAt > asOfDate || row.observedAt > source(row.sourceId).publishedAt
      || !Number.isSafeInteger(row.amountMillion) || row.amountMillion <= 0
      || typeof row.basis !== 'string' || !row.basis || typeof row.exclusionReason !== 'string' || !row.exclusionReason) fail('disclosure_invalid');
    ids.add(row.id);
    // Retain each basis separately. Never aggregate holdings, guarantees, cash
    // purchases, future balances, ceilings or individual announcements.
    return { ...row, eligibleNumerator: false };
  });
  if (!Array.isArray(input.missingNumeratorEvidence) || !input.missingNumeratorEvidence.length
    || input.missingNumeratorEvidence.some(value => typeof value !== 'string' || !value.trim())) fail('gap_missing');
  const ageDays = distance(last, asOfDate);
  const differenceMillion = bridgeMillion - quarterSumMillion;
  return {
    schemaVersion: 'nvda-primary-source-audit-result-v1', asOfDate, reviewedAt: input.reviewedAt,
    sourceAuthenticity: 'manual_review_not_machine_certified',
    revenue: { currency: 'USD', amountUnit: input.amountUnit, periodStart: first, periodEnd: last,
      quarterSumMillion, bridgeMillion, differenceMillion,
      reconciliation: differenceMillion === 0 ? 'matched' : 'unresolved_disclosed_amount_difference',
      ageDays, maxAgeDays: NVDA_REVENUE_MAX_AGE_DAYS,
      timeStatus: ageDays <= NVDA_REVENUE_MAX_AGE_DAYS ? 'within_existing_age_limit' : 'stale',
      productionEligible: false },
    numerator: { status: 'unknown', value: null, coverage: 'not_established', disclosures,
      missingEvidence: [...input.missingNumeratorEvidence] },
    ratio: null, productionEligible: false, changesScore: false, networkCalls: 0, productionWrites: 0
  };
}
