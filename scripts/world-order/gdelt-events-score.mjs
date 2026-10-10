import calibration from '../../config/gdelt-events-conflict-calibration.json' with { type: 'json' };
import { parseTimestamp } from '../gdelt/events-candidate.mjs';

export const EVENTS_MODEL = Object.freeze({ version: calibration.modelVersion, calibrationId: calibration.id,
  comparableToLegacy: false, legacyFinancialChannelsRetained: true });
export const EVENTS_SOURCE_SCHEMA = 'gdelt-events-conflict-source-v1';
if (!(Number.isFinite(calibration.scaleLower) && Number.isFinite(calibration.scaleUpper) && calibration.scaleLower > 0 && calibration.scaleUpper >= calibration.scaleLower)) throw new Error('events_calibration_invalid');
export function intervalConflictScore(lower, upper) {
  if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower < 0 || upper < lower) throw new Error('events_count_invalid');
  return { lower: 100 * lower / (lower + calibration.scaleUpper), upper: 100 * upper / (upper + calibration.scaleLower) };
}
export function validateEventsSource(source, nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) throw new Error('gdelt_events_source_time_hold');
  const s = source?.summary;
  if (!['ok', 'partial', 'stale'].includes(source?.status) || s?.schemaVersion !== EVENTS_SOURCE_SCHEMA
    || s.calibrationId !== calibration.id || s.definitionId !== calibration.definitionId
    || s.downloadedFiles !== 672 || s.conflictingIds !== 0 || s.ambiguousIds !== 0
    || !Number.isSafeInteger(s.quarantinedRows) || s.quarantinedRows < 0
    || s.violenceUpper !== s.violenceLower + s.quarantinedRows) throw new Error('gdelt_events_publication_hold');
  const end = parseTimestamp(`${s.windowEndDay}234500`), start = parseTimestamp(`${s.windowStartDay}000000`);
  const latestEnd = Math.floor(nowMs / 86400000) * 86400000 - 900000;
  if (end - start !== 7 * 86400000 - 900000 || end > latestEnd || latestEnd - end > 72 * 3600000
    || (source.status !== 'stale' && end !== latestEnd)) throw new Error('gdelt_events_window_hold');
  const acquired = Date.parse(source.lastFetchedAt);
  if (!Number.isFinite(acquired) || acquired > nowMs || acquired < end || nowMs - acquired > 72 * 3600000) throw new Error('gdelt_events_source_time_hold');
  if (!Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 0.55) throw new Error('gdelt_events_confidence_invalid');
  const indexAge = nowMs - parseTimestamp(s.latestTimestamp);
  if (indexAge < 0 || (source.status !== 'stale' && indexAge > 3 * 3600000)) throw new Error('gdelt_events_index_time_hold');
  if (source.enabled !== true || typeof s.strictQualification !== 'boolean'
    || s.strictQualification !== (s.quarantinedRows === 0)
    || (source.status === 'ok' && s.quarantinedRows !== 0)
    || (source.status === 'partial' && s.quarantinedRows === 0)
    || (source.status === 'stale' && (source.confidence > 0.25 || s.usedCachedSummary !== true || typeof s.cacheReason !== 'string' || !s.cacheReason))) throw new Error('gdelt_events_quality_hold');
  const b = intervalConflictScore(s.violenceLower, s.violenceUpper);
  if (s.channelScoreLower !== b.lower || s.channelScoreUpper !== b.upper
    || Math.round(b.lower) !== Math.round(b.upper) || s.channelScore !== Math.round(b.lower)) throw new Error('gdelt_events_score_interval_hold');
  return s.channelScore;
}
export function eventsSourceFromWindow(window, { latestTimestamp, acquiredAt, nowMs = Date.now() }) {
  const age = nowMs - parseTimestamp(latestTimestamp);
  if (age < 0 || age > 3 * 3600000) throw new Error('gdelt_events_index_time_hold');
  const lower = window.validSubsetCounts.violence, upper = lower + window.quarantinedRows, bounds = intervalConflictScore(lower, upper);
  const source = { enabled: true, status: window.quarantinedRows ? 'partial' : 'ok', lastFetchedAt: acquiredAt,
    confidence: 0.55, summary: { schemaVersion: EVENTS_SOURCE_SCHEMA, calibrationId: calibration.id,
      definitionId: calibration.definitionId, windowStartDay: window.startDay, windowEndDay: window.endDay,
      downloadedFiles: window.downloadedFiles, quarantinedRows: window.quarantinedRows,
      conflictingIds: window.conflictingIds, ambiguousIds: window.ambiguousIds,
      violenceLower: lower, violenceUpper: upper, channelScoreLower: bounds.lower, channelScoreUpper: bounds.upper,
      channelScore: Math.round(bounds.lower), strictQualification: window.statisticallyQualified,
      verbalRecords: window.validSubsetCounts.verbal, broadMaterialRecords: window.validSubsetCounts.broadMaterial,
      unknownCountryRecords: window.validSubsetCounts.unknownCountry, countries: window.validSubsetCounts.countries,
      latestTimestamp, usedCachedSummary: false, cacheReason: null },
    warnings: ['免费来源统计的是新闻编码记录，不等于人工核实的冲突次数；仅进入世界秩序的两个冲突通道。'] };
  validateEventsSource(source, nowMs);
  return source;
}
export function previousEventsSource(previous, reason, nowMs = Date.now()) {
  const s = previous && { ...previous, status: 'stale', confidence: Math.min(previous.confidence || 0, 0.25),
    summary: { ...previous.summary, usedCachedSummary: true, cacheReason: reason },
    warnings: ['免费事件来源未完成最新窗口，沿用注明原日期的历史统计。'] };
  validateEventsSource(s, nowMs);
  return s;
}
