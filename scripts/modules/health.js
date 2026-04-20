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
        summaryLabel: `${Math.max(0, statusEntries.length - failedCount)} healthy / ${fallbackCount} fallback / ${failedCount} failed`,
        issueLines: statusEntries.slice(0, 4).map(([key, status]) => `${key}: ${status}`)
      };
    }

    return {
      total: 0,
      okCount: 0,
      failedCount: 0,
      fallbackCount: 0,
      summaryLabel: 'No source detail available',
      issueLines: ['Source detail unavailable.']
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
      issueLines.push(`${key}: failed${detail?.error ? ` (${detail.error})` : ''}`);
    });

  entries
    .filter(([, detail]) => detail?.ok && detail?.fallbackUsed)
    .slice(0, Math.max(0, 4 - issueLines.length))
    .forEach(([key, detail]) => {
      issueLines.push(`${key}: fallback active via ${detail?.source || 'secondary source'}`);
    });

  if (!issueLines.length) {
    issueLines.push('All tracked realtime sources are currently healthy.');
  }

  return {
    total: entries.length,
    okCount,
    failedCount,
    fallbackCount,
    summaryLabel: `${okCount} healthy / ${fallbackCount} fallback / ${failedCount} failed`,
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
    issues.push('Realtime unavailable; rendering baseline only');
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    issues.push(`Realtime is stale (${metadata.realtimeAgeMinutes ?? '--'} min old)`);
  } else if (metadata.realtimeFreshnessLevel === 'aging') {
    issues.push(`Realtime is aging (${metadata.realtimeAgeMinutes ?? '--'} min old)`);
  }

  if (metadata.realtimeFallbackUsed) {
    flags.push('local fallback');
    issues.push('Local fallback is active');
  }
  if (metadata.realtimeCacheOnly) {
    flags.push('cache-only');
    issues.push('Cache-only mode active');
  }
  if (metadata.realtimeDegraded) {
    flags.push('degraded');
  }
  if (criticalMissing > 0) {
    issues.push(`${criticalMissing} critical source${criticalMissing > 1 ? 's' : ''} missing`);
  }
  if (sourceSummary.failedCount > 0) {
    issues.push(`${sourceSummary.failedCount} source${sourceSummary.failedCount > 1 ? 's' : ''} currently failing`);
  }
  if (!flags.length) {
    flags.push('normal');
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
    ? 'Baseline only due to unavailable realtime.'
    : overallLevel === 'Stale'
      ? 'Realtime is available but stale; use with caution.'
      : overallLevel === 'Degraded'
        ? 'Realtime is available with visible degradation.'
        : overallLevel === 'Watch'
          ? 'Realtime is aging or showing mild health drift.'
          : 'Realtime healthy and actively overlaying baseline.';

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
    issues: issues.length ? issues : ['Realtime healthy.'],
    sourceLines: sourceSummary.issueLines
  };
}
