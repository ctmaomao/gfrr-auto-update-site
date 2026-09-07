// Artifact sanitizer only. No network, runtime imports, lamp or score projection.
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

const MAX_AGE_DAYS = 45;
const SOURCES = Object.freeze({
  anthropic_official_news: { url: 'https://www.anthropic.com/news/series-h', rights: 'automatic_collection_rights_unresolved' },
  sacra_research: { url: 'https://sacra.com/c/anthropic/', rights: 'written_permission_required' },
  bloomberg_reporting: { url: 'https://news.bloomberglaw.com/artificial-intelligence/anthropic-revenue-run-rate-surpasses-65-billion-ahead-of-ipo', rights: 'discovery_only_rights_unresolved' }
});
const FIELDS = ['id', 'sourceKey', 'sourceUrl', 'provenanceGroup', 'issuer', 'metric', 'valueB', 'valueQualifier', 'publishedDate', 'observationStart', 'observationEnd', 'datePrecision'];
const ID = /^[a-z][a-z0-9_-]{0,95}$/u;

function requireCondition(ok, code) {
  if (!ok) throw new Error(code);
}

function exactKeys(value, keys) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), 'arr_candidate_invalid_object');
  requireCondition(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), 'arr_candidate_invalid_fields');
}

function freshness(date, asOfDate) {
  try {
    return assessUnderlyingObservationFreshness({ observationDate: date, asOfDate: asOfDate, maxAgeDays: MAX_AGE_DAYS });
  } catch {
    // Never echo caller-controlled input, URLs, article text or exception details.
    throw new Error('arr_candidate_invalid_date');
  }
}

export function normalizeArrCandidate(record, { asOfDate }) {
  exactKeys(record, FIELDS);
  requireCondition(typeof record.id === 'string' && ID.test(record.id), 'arr_candidate_invalid_id');
  requireCondition(typeof record.sourceKey === 'string' && Object.hasOwn(SOURCES, record.sourceKey), 'arr_candidate_unknown_source');
  requireCondition(typeof record.provenanceGroup === 'string' && ID.test(record.provenanceGroup), 'arr_candidate_invalid_provenance');
  requireCondition(record.issuer === 'Anthropic' && record.metric === 'company_run_rate_revenue_usd_b', 'arr_candidate_incompatible_metric');
  requireCondition(typeof record.valueB === 'number' && Number.isFinite(record.valueB) && record.valueB >= 1 && record.valueB <= 80, 'arr_candidate_invalid_amount');
  requireCondition(['point', 'estimate', 'lower_bound'].includes(record.valueQualifier), 'arr_candidate_invalid_qualifier');
  requireCondition(['day', 'month', 'interval'].includes(record.datePrecision), 'arr_candidate_invalid_precision');
  const source = SOURCES[record.sourceKey];
  // Exact reviewed references only; no credential-bearing URLs or new endpoints.
  requireCondition(record.sourceUrl === source.url, 'arr_candidate_invalid_url');
  freshness(record.publishedDate, asOfDate);
  const oldest = freshness(record.observationStart, asOfDate);
  const newest = freshness(record.observationEnd, asOfDate);
  requireCondition(record.observationStart <= record.observationEnd && record.observationEnd <= record.publishedDate, 'arr_candidate_date_order');
  if (record.datePrecision === 'day') {
    requireCondition(record.observationStart === record.observationEnd, 'arr_candidate_precision_mismatch');
  } else {
    requireCondition(record.observationStart < record.observationEnd, 'arr_candidate_precision_mismatch');
    if (record.datePrecision === 'month') {
      const lastDay = new Date(Date.UTC(Number(record.observationStart.slice(0, 4)), Number(record.observationStart.slice(5, 7)), 0)).toISOString().slice(0, 10);
      requireCondition(record.observationStart.endsWith('-01') && record.observationEnd === lastDay, 'arr_candidate_precision_mismatch');
    }
  }
  const holds = ['source_rights_pending'];
  if (oldest.status === 'stale') holds.push('underlying_observation_stale');
  if (record.datePrecision !== 'day') holds.push('observation_date_not_exact');
  if (record.valueQualifier !== 'point') holds.push('value_not_point_measurement');
  return {
    ...record,
    sourceComplianceStatus: source.rights,
    ageDaysRange: { min: newest.ageDays, max: oldest.ageDays },
    freshnessStatus: oldest.status,
    holds
  };
}

export function reviewArrIndependentEvidence(input, { asOfDate }) {
  exactKeys(input, ['schemaVersion', 'records']);
  requireCondition(input.schemaVersion === 'arr-independent-evidence-v1', 'arr_candidate_invalid_schema');
  requireCondition(Array.isArray(input.records) && input.records.length > 0 && input.records.length <= 64, 'arr_candidate_invalid_count');
  const records = input.records.map((record) => normalizeArrCandidate(record, { asOfDate }))
    .sort((a, b) => a.observationStart.localeCompare(b.observationStart) || a.id.localeCompare(b.id));
  requireCondition(new Set(records.map((record) => record.id)).size === records.length, 'arr_candidate_duplicate_id');
  // A caller-supplied lineage label is evidence to review, not proven independence.
  const holds = new Set(['source_rights_pending', 'independent_runtime_review_required', 'lineage_review_required']);
  for (const record of records) {
    for (const hold of record.holds) if (hold !== 'underlying_observation_stale') holds.add(hold);
  }
  // Historical observations may be old. The latest underlying observation controls
  // series freshness; overlapping/ambiguous chronologies have their own review hold.
  const latest = [...records].sort((a, b) => b.observationEnd.localeCompare(a.observationEnd) || a.id.localeCompare(b.id))[0];
  if (latest.freshnessStatus === 'stale') holds.add('underlying_observation_stale');
  if (records.length < 4) holds.add('insufficient_series_observations');
  const overlappingClaims = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const a = records[i];
      const b = records[j];
      if (a.observationStart <= b.observationEnd && b.observationStart <= a.observationEnd) {
        overlappingClaims.push({ ids: [a.id, b.id], valuesDiffer: a.valueB !== b.valueB || a.valueQualifier !== b.valueQualifier });
      }
    }
  }
  if (overlappingClaims.length) holds.add('overlapping_claims_require_review');
  return {
    schemaVersion: 'arr-independent-review-v1',
    asOfDate,
    assignedLayer: 'artifact_sanitizer_layer',
    productionEligible: false,
    networkRequests: 0,
    productionWrites: 0,
    maxAgeDays: MAX_AGE_DAYS,
    latestObservationId: latest.id,
    claimedProvenanceGroups: [...new Set(records.map((record) => record.provenanceGroup))].sort(),
    independenceVerified: false,
    holds: [...holds].sort(),
    overlappingClaims,
    records
  };
}
