// Metadata preservation only: matching a provider record is not freshness,
// instrument identity, source permission or calibration certification.
export const MARKET_PROVENANCE_KEYS = Object.freeze(['brent', 'gold', 'vix', 'dxy', 'hyOas', 'us10y', 'real10y', 'spx']);
const TIMESTAMP_KINDS = ['unknown', 'provider_acquisition', 'observation_date', 'snapshot_acquisition', 'reported_candidate_time'];
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const date = value => text(value) && Number.isFinite(Date.parse(value));
const unknown = reason => ({ status: 'unknown', source: null, reportedTimestamp: null, reportedFallbackUsed: null, reason, qualification: 'not_assessed' });
export function buildMarketInputProvenance(values = {}, details = null) {
  return Object.fromEntries(MARKET_PROVENANCE_KEYS.map(key => {
    const d = details?.[key];
    if (!Number.isFinite(values[key])) return [key, unknown('selected_value_missing')];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return [key, unknown('source_metadata_missing')];
    if (d.ok !== true || !Number.isFinite(d.value) || d.value !== values[key]) return [key, unknown('source_value_not_matched')];
    if (!text(d.source) || !date(d.timestamp)) return [key, unknown('source_identity_or_timestamp_missing')];
    return [key, { status: 'matched_metadata', source: text(d.source), reportedTimestamp: text(d.timestamp), reportedTimestampKind: TIMESTAMP_KINDS.includes(d.timestampKind) ? d.timestampKind : 'unknown', reportedFallbackUsed: typeof d.fallbackUsed === 'boolean' ? d.fallbackUsed : null, reason: null, qualification: 'not_assessed' }];
  }));
}
export function validateMarketInputProvenance(provenance, values) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)
    || Object.keys(provenance).length !== MARKET_PROVENANCE_KEYS.length) throw new Error('market_provenance_invalid');
  for (const key of MARKET_PROVENANCE_KEYS) {
    const item = provenance[key];
    if (item && Object.hasOwn(item, 'reportedTimestampKind') && !TIMESTAMP_KINDS.includes(item.reportedTimestampKind)) throw new Error('market_provenance_timestamp_kind_invalid');
    if (!item || item.qualification !== 'not_assessed') throw new Error('market_provenance_qualification_invalid');
    if (item.status === 'matched_metadata') {
      if (!Number.isFinite(values?.[key]) || !text(item.source) || !date(item.reportedTimestamp) || item.reason !== null || ![true, false, null].includes(item.reportedFallbackUsed)) throw new Error('market_provenance_match_invalid');
    } else if ((Object.hasOwn(item, 'reportedTimestampKind') && item.reportedTimestampKind !== 'unknown') || item.status !== 'unknown' || item.source !== null || item.reportedTimestamp !== null || item.reportedFallbackUsed !== null
      || !['selected_value_missing', 'source_metadata_missing', 'source_value_not_matched', 'source_identity_or_timestamp_missing'].includes(item.reason)) throw new Error('market_provenance_unknown_invalid');
  }
  return true;
}
