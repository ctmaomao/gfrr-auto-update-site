import { fmtNumSafe } from './config.js?v=bofa-report-review-1';

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

/**
 * Shared trust gate: whether realtime.values may drive runtime overlay, effective display inputs, or Daily baseline.
 * Keep in sync across frontend (realtime.js) and Daily pipeline (run-daily-pipeline.mjs).
 */
export function canUseRealtimePayloadValues(realtimePayload) {
  if (!realtimePayload || typeof realtimePayload !== 'object') {
    return false;
  }
  const values = realtimePayload.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return false;
  }
  if (realtimePayload.cacheOnly === true) {
    return false;
  }
  if (realtimePayload.sourceMode === 'cache-only') {
    return false;
  }
  if (realtimePayload.unavailable === true) {
    return false;
  }
  if (realtimePayload.degradedMode === true && realtimePayload.sourceMode !== 'live-with-fallback') {
    return false;
  }
  if (Number.isFinite(realtimePayload.healthScore) && realtimePayload.healthScore <= 0) {
    return false;
  }
  if (Number.isFinite(realtimePayload.criticalMissing) && realtimePayload.criticalMissing >= 4) {
    return false;
  }
  return true;
}

export function buildRealtimeStatusLabel(metadata) {
  if (metadata.realtimeUnavailable) {
    return '实时数据不可用 / 仅基线模式';
  }
  const sourceMap = {
    'worker-generated-preview': '主源 Worker独立生成',
    'github-realtime-data': '主源 GitHub realtime-data',
    'local-fallback': '主源 本地 fallback',
    'remote': '主源 远程'
  };
  const freshnessMap = {
    fresh: '新鲜',
    aging: '老化中',
    stale: '已过期',
    unavailable: '不可用'
  };
  const freshnessLabel = freshnessMap[metadata.realtimeFreshnessLevel] || metadata.realtimeFreshnessLevel;
  const parts = [sourceMap[metadata.realtimeSource] || '主源 未知', `实时数据 ${freshnessLabel}`];
  if (Number.isFinite(metadata.realtimeAgeMinutes)) parts.push(`${metadata.realtimeAgeMinutes} 分钟前`);
  if (metadata.realtimeDegraded) parts.push('降级');
  if (metadata.realtimeFallbackUsed) parts.push('本地回退');
  if (metadata.realtimeCacheOnly) parts.push('缓存模式');
  // B-worker soft warning: held Brent value older than the worker's age cap.
  // Display-only hint; does not change source selection, overlay use, or scoring.
  if (metadata.realtimeBrentHeldBeyondAgeCap) {
    const ageDays = Number.isFinite(metadata.realtimeBrentSelectedAgeHours)
      ? `~${Math.round(metadata.realtimeBrentSelectedAgeHours / 24)}天`
      : '';
    parts.push(`Brent旧值风险${ageDays ? `(held ${ageDays})` : '(held)'}`);
  }
  return parts.join(' / ');
}

export function shouldApplyRealtimeOverlay(metadata, realtimePayload) {
  return canUseRealtimePayloadValues(realtimePayload) && !metadata.realtimeUnavailable;
}
