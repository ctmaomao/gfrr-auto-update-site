// Read-only audit projection. Never used by selection, promotion or scoring.
import { createHash } from 'node:crypto';

export function finiteAuditNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const SOURCES = new Map([
  ['fred:dcoilbrenteu', ['fred', 'europe-brent-spot', 'DCOILBRENTEU']],
  ['fred-anchor', ['fred', 'europe-brent-spot', 'DCOILBRENTEU']],
  ['ice', ['ice', 'ice-brent-futures', null]],
  ['yahoo', ['yahoo', 'nymex-brent-futures', 'BZ=F']],
  ['yahoo:bz=f', ['yahoo', 'nymex-brent-futures', 'BZ=F']],
  ['google-finance:bzw00:nymex', ['google-finance', 'nymex-brent-futures-diagnostic', 'BZW00:NYMEX']],
  ['stooq', ['stooq', 'brent-futures-proxy', 'CB.F']],
  ['barchart', ['barchart', 'brent-futures-proxy', null]],
  ['marketwatch', ['marketwatch', 'brent-futures-proxy', null]],
  ['oilprice', ['oilprice', 'brent-web-proxy', null]],
  ['tradingeconomics:brent-crude-oil', ['tradingeconomics', 'brent-web-proxy', null]],
  ['yahoo:bz=f+tradingeconomics:brent-crude-oil-average', ['yahoo-tradingeconomics-average', 'derived-two-source-average', null]],
]);
const REASONS = new Set([
  'brent-validation-missing','fred-anchor-missing','fred-anchor-age-missing','fred-anchor-fresh-enough',
  'consensus-recommended-value-invalid','consensus-not-promotable','recommended-candidate-not-found',
  'promoted-stale-fred-anchor-with-fresh-public-consensus','promoted-stale-fred-anchor-with-guarded-two-source-consensus',
  'fred-anchor-not-ok','fred-anchor-not-positive-finite','fred-anchor-observedAt-invalid','fred-anchor-not-stale',
  'yahoo-confirmation-invalid','yahoo-observedAt-invalid','yahoo-confirmation-stale',
  'tradingeconomics-confirmation-invalid','tradingeconomics-observedAt-invalid','tradingeconomics-confirmation-stale',
  'confirmation-divergence-unavailable','confirmation-divergence-above-2pct','unconfirmed-jump-hold',
  'promoted-confirmed-extreme-move-with-fresh-yahoo-and-tradingeconomics-confirmation',
  'promoted-stale-fred-anchor-with-fresh-yahoo-and-tradingeconomics-confirmation',
  'unknown-source','out-of-range','observedAt-stale','google-finance-html-experimental-not-used-for-promotion',
  'unavailable','observedAt-missing','observedAt-invalid','fred-anchor','stale','stale-for-consensus',
]);
const reason = value => REASONS.has(value) ? value
  : typeof value === 'string' && /^observedAt-stale\(\d{1,9}m\)$/u.test(value) ? 'observedAt-stale' : 'unknown';
function identity(value) {
  const key = typeof value === 'string' ? value.toLowerCase()
    .replace(/:public-consensus-promoted$| promoted over stale fred anchor$| held after unconfirmed brent jump$/u, '') : '';
  const match = SOURCES.get(key);
  return match ? { source: match[0], instrument: match[1], symbol: match[2] } : { source: 'unknown', instrument: 'unknown', symbol: null };
}
function timestamp(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Reject normalized impossible calendar days, without stripping a timezone.
  const day = value.slice(0, 10);
  if (new Date(Date.parse(day)).toISOString().slice(0, 10) !== day) return null;
  return value;
}
function timeAudit(value, checkedAt, suppress = false) {
  const observedAt = suppress ? null : timestamp(value);
  const dateOnly = observedAt?.length === 10;
  const delta = observedAt && timestamp(checkedAt) ? Date.parse(checkedAt) - Date.parse(observedAt) : null;
  return {
    observedAt,
    timeType: observedAt ? (dateOnly ? 'observation-date' : 'reported-timestamp') : 'unknown',
    timeStatus: observedAt ? (delta === null ? 'unknown' : delta < 0 ? 'future' : 'valid') : 'unknown',
    // A calendar date has no intraday quote time. Do not invent midnight precision.
    ageMinutes: delta !== null && delta >= 0 && !dateOnly ? Math.round(delta / 60000) : null,
    ageDays: delta !== null && delta >= 0 && dateOnly ? Math.floor(delta / 86400000) : null,
  };
}
function observation(raw, checkedAt, suppress = false) {
  const id = identity(raw?.source);
  const contract = id.source === 'ice' && typeof raw?.contract === 'string' && /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{2}$/u.test(raw.contract) ? raw.contract : null;
  return { ...id, contract,
    value: finiteAuditNumber(raw?.value),
    ...timeAudit(raw?.observedAt ?? raw?.timestamp, checkedAt, suppress),
    fetchedAt: timestamp(raw?.fetchedAt),
    exclusionReason: reason(raw?.excludedFromConsensus ?? raw?.exclusionReason),
    participatesInConsensus: typeof raw?.participatesInConsensus === 'boolean' ? raw.participatesInConsensus : null,
  };
}
export function brentObservationAudit(payload, checkedAt) {
  const detail = payload?.sourceDetails?.brent || {};
  const validation = payload?.brentValidation || {};
  const promotion = validation.promotion || {};
  const candidates = (Array.isArray(validation.candidates) ? validation.candidates : []).slice(0, 16);
  const applied = typeof promotion.applied === 'boolean' ? promotion.applied : null;
  const id = identity(detail.source);
  const candidate = applied === true ? candidates.find(c => identity(c?.source).source === id.source) : null;
  // Realtime may substitute retrieval time for a date-only promoted candidate;
  // Worker hold may substitute the previous payload generation time. Neither is
  // a real observed quote time. A two-source average has no single observation.
  const held = detail.promotionHeld === true || promotion.moveStatus === 'unconfirmed-jump-hold';
  const derived = id.instrument === 'derived-two-source-average';
  const cachedFallback = applied !== true && detail.ok === false;
  const nonObservationTime = applied !== true && detail.timestampKind !== undefined
    && detail.timestampKind !== 'observation_date';
  const raw = applied === true
    ? { ...candidate, source: detail.source, value: payload?.values?.brent,
        observedAt: promotion.selectedCandidateObservedAt ?? candidate?.observedAt ?? candidate?.timestamp ?? null }
    : { source: cachedFallback ? null : detail.source, value: payload?.values?.brent, timestamp: detail.timestamp, fetchedAt: detail.fetchedAt };
  return {
    selected: observation(raw, checkedAt, held || derived || cachedFallback || nonObservationTime),
    selectedTimeLimitation: cachedFallback ? 'cached-input-identity-and-time-unknown' : nonObservationTime ? 'not-an-observation-clock' : held ? 'held-input-observation-unknown' : derived ? 'multiple-observation-times' : 'none',
    promotionApplied: applied,
    promotionReason: reason(promotion.reason ?? detail.promotionReason),
    candidates: candidates.map(c => observation(c, checkedAt)),
  };
}
export function inputIdentity(payload, commit = null) {
  return { payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    hashBasis: 'parsed-json-serialization',
    commit: typeof commit === 'string' && /^[a-f0-9]{40}$/u.test(commit) ? commit : null };
}
export function brentComparability(a, b) {
  if (!a || !b || a.value === null || b.value === null || a.instrument === 'unknown' || b.instrument === 'unknown') {
    return { status: 'unknown', reason: 'missing-value-or-instrument' };
  }
  if (a.instrument !== b.instrument) return { status: 'different-basis', reason: 'different-instruments' };
  if (a.source !== b.source) return { status: 'unknown', reason: 'cross-source-equivalence-unverified' };
  if (a.instrument.includes('futures') && (!a.contract || !b.contract)) return { status: 'unknown', reason: 'contract-unknown' };
  if (a.contract !== b.contract) return { status: 'different-basis', reason: 'different-contracts' };
  if (a.timeStatus !== 'valid' || b.timeStatus !== 'valid') return { status: 'unknown', reason: 'observation-time-unknown-or-future' };
  if (a.timeType !== b.timeType || a.observedAt !== b.observedAt) return { status: 'different-basis', reason: 'different-observation-times' };
  return { status: 'comparable', reason: 'same-source-instrument-contract-and-time' };
}
