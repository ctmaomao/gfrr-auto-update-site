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
    return '实时数据不可用 / 仅基线模式';
  }
  const freshnessMap = {
    fresh: '新鲜',
    aging: '老化中',
    stale: '已过期',
    unavailable: '不可用'
  };
  const freshnessLabel = freshnessMap[metadata.realtimeFreshnessLevel] || metadata.realtimeFreshnessLevel;
  const parts = [`实时数据 ${freshnessLabel}`];
  if (Number.isFinite(metadata.realtimeAgeMinutes)) parts.push(`${metadata.realtimeAgeMinutes} 分钟前`);
  if (metadata.realtimeDegraded) parts.push('降级');
  if (metadata.realtimeFallbackUsed) parts.push('本地回退');
  if (metadata.realtimeCacheOnly) parts.push('缓存模式');
  return parts.join(' / ');
}

export function canUseRealtimePayloadValues(realtimePayload) {
  if (!realtimePayload?.values) return false;
  if (realtimePayload.cacheOnly === true) return false;
  if (realtimePayload.sourceMode === 'cache-only') return false;
  if (Number.isFinite(realtimePayload.healthScore) && realtimePayload.healthScore <= 0) return false;
  if (Number.isFinite(realtimePayload.criticalMissing) && realtimePayload.criticalMissing >= 4) return false;
  return true;
}

export function shouldApplyRealtimeOverlay(metadata, realtimePayload) {
  return canUseRealtimePayloadValues(realtimePayload) && !metadata.realtimeUnavailable;
}
