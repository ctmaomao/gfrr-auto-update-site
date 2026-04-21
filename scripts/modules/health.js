import { fmtNumSafe, riskColor, trendClass } from './config.js';
import { classifyFreshnessLevel, computeAgeMinutes } from './freshness.js';

export function normalizeHealthLevel(level) {
  switch (level) {
    case 'Healthy':
      return { badgeClass: 'health-level-healthy', badgeTone: 'strong' };
    case 'Watch':
      return { badgeClass: 'health-level-watch', badgeTone: 'cautious' };
    case 'Degraded':
      return { badgeClass: 'health-level-degraded', badgeTone: 'neutral' };
    case 'Stale':
      return { badgeClass: 'health-level-stale', badgeTone: 'neutral' };
    default:
      return { badgeClass: 'health-level-baseline', badgeTone: 'underweight' };
  }
}

export function buildSourceSummary(sourceDetails = {}, sourceStatus = {}) {
  const entries = Object.entries(sourceDetails);
  if (!entries.length) {
    const statusEntries = Object.entries(sourceStatus);
    if (statusEntries.length) {
      const fallbackCount = statusEntries.filter(([, status]) => String(status).includes('fallback') || String(status).includes('secondary')).length;
      const failedCount = statusEntries.filter(([, status]) => String(status).includes('fallback:')).length;
      return {
        total: statusEntries.length,
        okCount: Math.max(0, statusEntries.length - failedCount),
        failedCount,
        fallbackCount,
        summaryLabel: `${Math.max(0, statusEntries.length - failedCount)} 正常 / ${fallbackCount} 回退 / ${failedCount} 失败`,
        issueLines: statusEntries.slice(0, 4).map(([key, status]) => `${key}: ${status}`)
      };
    }

    return {
      total: 0,
      okCount: 0,
      failedCount: 0,
      fallbackCount: 0,
      summaryLabel: '无数据源详情',
      issueLines: ['数据源详情不可用。']
    };
  }

  const okCount = entries.filter(([, detail]) => detail?.ok).length;
  const failedCount = entries.filter(([, detail]) => detail?.ok === false).length;
  const fallbackCount = entries.filter(([, detail]) => detail?.fallbackUsed).length;
  const issueLines = [];

  entries
    .filter(([, detail]) => detail?.ok === false)
    .slice(0, 4)
    .forEach(([key, detail]) => {
      issueLines.push(`${key}: 失败${detail?.error ? `（${detail.error}）` : ''}`);
    });

  entries
    .filter(([, detail]) => detail?.ok && detail?.fallbackUsed)
    .slice(0, Math.max(0, 4 - issueLines.length))
    .forEach(([key, detail]) => {
      issueLines.push(`${key}: 回退已激活，来源 ${detail?.source || '备用数据源'}`);
    });

  if (!issueLines.length) {
    issueLines.push('当前所有实时数据源均正常。');
  }

  return {
    total: entries.length,
    okCount,
    failedCount,
    fallbackCount,
    summaryLabel: `${okCount} 正常 / ${fallbackCount} 回退 / ${failedCount} 失败`,
    issueLines
  };
}

export function buildHealthDashboardModel(runtimeState) {
  const metadata = runtimeState.runtimeMetadata || {};
  const realtime = runtimeState.realtimePayload || null;
  const healthScore = Number.isFinite(realtime?.healthScore) ? Math.round(realtime.healthScore) : null;
  const criticalMissing = Number.isFinite(realtime?.criticalMissing) ? realtime.criticalMissing : 0;
  const sourceSummary = buildSourceSummary(metadata.realtimeSourceDetails, metadata.realtimeSourceStatus);
  const flags = [];
  const issues = [];

  if (metadata.realtimeUnavailable) {
    issues.push('实时数据不可用，当前仅渲染基线数据');
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    issues.push(`实时数据已过期（${metadata.realtimeAgeMinutes ?? '--'} 分钟前）`);
  } else if (metadata.realtimeFreshnessLevel === 'aging') {
    issues.push(`实时数据正在老化（${metadata.realtimeAgeMinutes ?? '--'} 分钟前）`);
  }

  if (metadata.realtimeFallbackUsed) {
    flags.push('本地回退');
    issues.push('本地回退已激活');
  }
  if (metadata.realtimeCacheOnly) {
    flags.push('缓存模式');
    issues.push('缓存模式已激活');
  }
  if (metadata.realtimeDegraded) {
    flags.push('降级');
  }
  if (criticalMissing > 0) {
    issues.push(`${criticalMissing} 个关键数据源缺失`);
  }
  if (sourceSummary.failedCount > 0) {
    issues.push(`${sourceSummary.failedCount} 个数据源当前失败`);
  }
  if (!flags.length) {
    flags.push('正常');
  }

  let overallLevel = 'Healthy';
  if (metadata.realtimeUnavailable) {
    overallLevel = 'Baseline Only';
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    overallLevel = 'Stale';
  } else if (
    metadata.realtimeDegraded
    || metadata.realtimeFallbackUsed
    || metadata.realtimeCacheOnly
    || criticalMissing > 0
    || sourceSummary.failedCount > 0
  ) {
    overallLevel = 'Degraded';
  } else if (
    metadata.realtimeFreshnessLevel === 'aging'
    || (healthScore !== null && healthScore < 95)
  ) {
    overallLevel = 'Watch';
  }

  const summary = overallLevel === 'Baseline Only'
    ? '实时数据不可用，当前仅使用基线数据。'
    : overallLevel === 'Stale'
      ? '实时数据可用但已过期，请谨慎使用。'
      : overallLevel === 'Degraded'
        ? '实时数据可用，但存在明显降级。'
        : overallLevel === 'Watch'
          ? '实时数据正在老化或出现轻微健康漂移。'
          : '实时数据健康，正在覆盖基线数据。';

  const healthTone = normalizeHealthLevel(overallLevel);

  return {
    overallLevel,
    healthTone,
    summary,
    healthScore,
    freshness: metadata.realtimeFreshnessLevel || 'unavailable',
    ageLabel: Number.isFinite(metadata.realtimeAgeMinutes) ? `${metadata.realtimeAgeMinutes} min` : '--',
    realtimeSource: metadata.realtimeSource || 'none',
    flagsLabel: flags.join(' / '),
    criticalMissing,
    sourceSummaryLabel: sourceSummary.summaryLabel,
    issues: issues.length ? issues : ['实时数据状态健康。'],
    sourceLines: sourceSummary.issueLines
  };
}
