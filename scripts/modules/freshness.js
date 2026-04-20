import { fmtNumSafe } from './config.js';

export const FRESHNESS_WINDOWS = {
  fresh: 30,
  aging: 90,
  stale: 360
};

export function parseTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

export function computeAgeMinutes(asOf) {
  const asOfTime = parseTimestamp(asOf);
  if (asOfTime === null) return null;
  return Math.max(0, Math.round((Date.now() - asOfTime) / 60000));
}

export function classifyFreshnessLevel(ageMinutes, hasRealtime) {
  if (!hasRealtime || ageMinutes === null) return 'unavailable';
  if (ageMinutes <= FRESHNESS_WINDOWS.fresh) return 'fresh';
  if (ageMinutes <= FRESHNESS_WINDOWS.aging) return 'aging';
  if (ageMinutes <= FRESHNESS_WINDOWS.stale) return 'stale';
  return 'unavailable';
}

export function buildRealtimeStatusLabel(metadata) {
  if (metadata.realtimeUnavailable) {
    return 'Realtime unavailable / baseline only';
  }

  const parts = [`Realtime ${metadata.realtimeFreshnessLevel}`];
  if (Number.isFinite(metadata.realtimeAgeMinutes)) parts.push(`${metadata.realtimeAgeMinutes}m old`);
  if (metadata.realtimeDegraded) parts.push('degraded');
  if (metadata.realtimeFallbackUsed) parts.push('local fallback');
  if (metadata.realtimeCacheOnly) parts.push('cache only');
  return parts.join(' / ');
}

export function shouldApplyRealtimeOverlay(metadata, realtimePayload) {
  return !!realtimePayload?.values && !metadata.realtimeUnavailable;
}
