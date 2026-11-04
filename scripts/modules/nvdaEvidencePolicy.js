// Trusted contract policy. Published evidence may describe this policy, never set it.
// ADR-0084 / config/bubble-watch-curated.json: NVIDIA ledger 30d, revenue 120d.
export const NVDA_NUMERATOR_MAX_AGE_DAYS = 30;
export const NVDA_REVENUE_MAX_AGE_DAYS = 120;

function nvdaPolicyDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value ? at : null;
}

// First verify the unchanged proof at its original clock, then age that same
// observation at the caller's clock. A carry never rewrites its proof timestamp.
function nvdaEvidenceAgeAt(observationDate, freshness, asOfDate, maxAgeDays) {
  if (freshness?.maxAgeDays !== maxAgeDays) return null;
  const observed = nvdaPolicyDay(observationDate), audit = nvdaPolicyDay(asOfDate);
  const recorded = nvdaPolicyDay(freshness.asOfDate);
  if (observed === null || audit === null || recorded === null || observed > recorded || recorded > audit
    || freshness.observationDate !== observationDate) return null;
  const recordedAge = (recorded - observed) / 86400000;
  if (freshness.ageDays !== recordedAge || recordedAge > maxAgeDays || freshness.status !== 'fresh') return null;
  const ageDays = (audit - observed) / 86400000;
  return { observationDate, asOfDate, ageDays, maxAgeDays, status: ageDays > maxAgeDays ? 'stale' : 'fresh' };
}
export function nvdaNumeratorAgeAt(numerator, asOfDate) {
  return nvdaEvidenceAgeAt(numerator?.asOfDate, numerator?.freshness, asOfDate, NVDA_NUMERATOR_MAX_AGE_DAYS);
}
export function nvdaRevenueAgeAt(revenue, asOfDate) {
  return nvdaEvidenceAgeAt(revenue?.observationDate, revenue?.freshness, asOfDate, NVDA_REVENUE_MAX_AGE_DAYS);
}
export function nvdaRatioAgeAt(detail, asOfDate) {
  const proofDate = detail?.numerator?.freshness?.asOfDate;
  if (proofDate !== detail?.revenue?.freshness?.asOfDate) return null;
  const numerator = nvdaNumeratorAgeAt(detail?.numerator, asOfDate), revenue = nvdaRevenueAgeAt(detail?.revenue, asOfDate);
  return numerator && revenue ? { proofDate, numerator, revenue } : null;
}
