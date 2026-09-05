import { fmtNumSafe, riskColor, trendClass } from './config.js?v=bofa-report-review-1';
import { classifyFreshnessLevel, computeAgeMinutes } from './freshness.js?v=bofa-report-review-1';

export function normalizeHealthLevel(level) {
  switch (level) {
    case '健康':
      return { badgeClass: 'health-level-healthy', badgeTone: 'strong' };
    case '观察中':
      return { badgeClass: 'health-level-watch', badgeTone: 'cautious' };
    case '降级':
      return { badgeClass: 'health-level-degraded', badgeTone: 'neutral' };
    case '已过期':
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
  const dailyRealtimeInput = runtimeState.data?.dailyRealtimeInput || runtimeState.baseline?.dailyRealtimeInput || {};
  const workerCandidate = metadata.workerGeneratedCandidate || null;
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

  const sourcePolicyLine = buildRealtimeSourcePolicyLine(metadata);
  const workerCandidateLine = buildWorkerRealtimeSourceLine(workerCandidate, metadata);

  let overallLevel = '健康';
  if (metadata.realtimeUnavailable) {
    overallLevel = '仅基线';
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    overallLevel = '已过期';
  } else if (
    metadata.realtimeDegraded
    || metadata.realtimeFallbackUsed
    || metadata.realtimeCacheOnly
    || criticalMissing > 0
    || sourceSummary.failedCount > 0
  ) {
    overallLevel = '降级';
  } else if (
    metadata.realtimeFreshnessLevel === 'aging'
    || (healthScore !== null && healthScore < 95)
  ) {
    overallLevel = '观察中';
  }

  const summary = overallLevel === '仅基线'
    ? '实时数据不可用，当前仅使用基线数据。'
    : overallLevel === '已过期'
      ? '实时数据可用但已过期，请谨慎使用。'
      : overallLevel === '降级'
        ? '实时数据可用，但存在明显降级。'
        : overallLevel === '观察中'
          ? '实时数据正在老化或出现轻微健康漂移。'
          : '实时数据健康，正在覆盖基线数据。';

  const healthTone = normalizeHealthLevel(overallLevel);

  return {
    overallLevel,
    healthTone,
    summary,
    healthScore,
    freshness: metadata.realtimeFreshnessLevel || 'unavailable',
    ageLabel: Number.isFinite(metadata.realtimeAgeMinutes) ? `${metadata.realtimeAgeMinutes} 分钟` : '--',
    realtimeSource: metadata.realtimeSource || '无',
    flagsLabel: flags.join(' / '),
    criticalMissing,
    sourceSummaryLabel: sourceSummary.summaryLabel,
    dailyInputBranch: dailyRealtimeInput.branch || '',
    dailyInputCommitSha: dailyRealtimeInput.commitSha || '',
    dailyInputCapturedAt: dailyRealtimeInput.capturedAt || '',
    issues: issues.length ? issues : ['实时数据状态健康。'],
    sourceLines: [
      ...sourceSummary.issueLines,
      ...(sourcePolicyLine ? [sourcePolicyLine] : []),
      ...(workerCandidateLine ? [workerCandidateLine] : [])
    ]
  };
}

function buildRealtimeSourcePolicyLine(metadata = {}) {
  const policy = metadata.realtimeSourcePolicy || {};
  const sourceMap = {
    'worker-generated-preview': 'Worker独立生成',
    'github-realtime-data': 'GitHub realtime-data',
    'local-fallback': '本地回退',
    none: '无可用实时源'
  };
  const current = sourceMap[metadata.realtimeSource] || sourceMap[policy.selected] || '未知';
  if (policy.workerFirstEnabled === false) {
    return `实时源策略：GitHub优先（Worker已由配置关闭）/ 当前主源：${current}`;
  }
  if (metadata.realtimeSource === 'worker-generated-preview') {
    return `实时源策略：Worker优先 / 当前主源：${current}`;
  }
  if (metadata.realtimeSource === 'github-realtime-data') {
    return `实时源策略：Worker优先 / Worker未通过安全闸门 / 当前主源：${current}`;
  }
  if (metadata.realtimeSource === 'local-fallback') {
    return `实时源策略：Worker优先 / Worker与GitHub未作为主源 / 当前主源：${current}`;
  }
  return `实时源策略：Worker优先 / 当前主源：${current}`;
}

function buildWorkerRealtimeSourceLine(candidate, metadata = {}) {
  if (metadata.realtimeSourcePolicy?.workerFirstEnabled === false) {
    return 'Worker实时源：已由配置关闭 / 当前使用 GitHub 优先；这不是 Worker 出错';
  }
  if (metadata.realtimeSource === 'worker-generated-preview' && candidate?.available) {
    const age = Number.isFinite(candidate.ageMinutes) ? candidate.ageMinutes : '--';
    const score = Number.isFinite(candidate.healthScore) ? Math.round(candidate.healthScore) : '--';
    return `Worker实时源：已启用 / 独立生成 / 更新约 ${age} 分钟前 / 健康度 ${score}`;
  }
  if (metadata.realtimeSource === 'github-realtime-data') {
    return `Worker实时源：未启用 / 已回退 GitHub（原因：${candidate?.rejectionReason || candidate?.status || 'unavailable'}）/ 当前数据不受影响`;
  }
  if (metadata.realtimeSource === 'local-fallback') {
    return 'Worker实时源：不可用；GitHub实时源不可用；当前使用本地 fallback';
  }
  if (!candidate || typeof candidate !== 'object') {
    return 'Worker实时源：未启用 / 候选不可用（原因：unavailable）/ 当前数据不受影响';
  }
  if (candidate.available) {
    const age = Number.isFinite(candidate.ageMinutes) ? candidate.ageMinutes : '--';
    const score = Number.isFinite(candidate.healthScore) ? Math.round(candidate.healthScore) : '--';
    return `Worker实时源：候选可用但未作为主源 / 独立生成 / 更新约 ${age} 分钟前 / 健康度 ${score}`;
  }
  if (candidate.status === 'timeout') {
    return 'Worker实时源：读取超时 / 未启用 / 当前数据不受影响';
  }
  return `Worker实时源：未启用 / 候选不可用（原因：${candidate.status || 'unavailable'}）/ 当前数据不受影响`;
}
