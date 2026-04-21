import { fmtNumSafe, fmtDeltaSafe, trendClass, riskColor } from './config.js';

export const MODULE_LABELS = {
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
};

export function clampPercent(value, fallback = '--') {
  return Number.isFinite(value) ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : fallback;
}

export function clampNumber(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function countConsecutiveDays(values, predicate) {
  let streak = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (!predicate(values[i])) break;
    streak += 1;
  }
  return streak;
}

export function createScoreSeries(history = [], currentScore = null) {
  const historyScores = Array.isArray(history)
    ? history
      .map((item) => Number(item?.score))
      .filter((score) => Number.isFinite(score))
    : [];

  if (!Number.isFinite(currentScore)) return historyScores;
  if (!historyScores.length) return [currentScore];

  const lastScore = historyScores[historyScores.length - 1];
  if (lastScore === currentScore) return historyScores;

  return [...historyScores, currentScore];
}

export function buildStrategyStateFallback(data = {}, metadata = {}) {
  const fallbackState = metadata.realtimeUnavailable ? 'Defensive' : 'Caution';
  const fallbackMeta = {
    totalRiskScore: Number.isFinite(data.score) ? data.score : null,
    recent3dDelta: 0,
    recent3dSpeed: 0,
    resonanceCount: 0,
    severeResonanceCount: 0,
    extremeThresholdCount: 0,
    extremeThresholds: ['回退模式'],
    elevatedRiskStreakDays: 0,
    highRiskStreakDays: 0,
    criticalAlertCount: 0,
    healthLevel: metadata.realtimeUnavailable ? 'Baseline Only' : 'Unknown'
  };

  return {
    strategyState: fallbackState,
    stateLabel: `${fallbackState} / Fallback`,
    stateScore: fallbackState === 'Defensive' ? 72 : 55,
    stateReason: metadata.realtimeUnavailable
      ? '实时覆盖不可用，策略状态已回退到防守型基线。'
      : '策略状态引擎不可用，已回退到谨慎型基线。',
    stateDrivers: [{
      key: 'fallback',
      label: '回退保护',
      impact: fallbackState,
      reason: '回退模式确保系统输出安全的非空策略状态。'
    }],
    stateMeta: fallbackMeta
  };
}

export function buildPositionGuidanceFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  const defensiveFallback = metadata.realtimeUnavailable || strategyState === 'Defensive' || strategyState === 'Crisis';
  return {
    totalExposureBand: defensiveFallback ? '20%-40%' : '35%-55%',
    riskAssetBias: defensiveFallback ? '严格约束' : '选择性配置',
    defensiveBias: defensiveFallback ? '高' : '中等',
    cashGuidance: defensiveFallback ? '维持较高现金缓冲（30%-45%）' : '维持储备现金缓冲（20%-30%）',
    newExposurePolicy: defensiveFallback ? '暂停新增风险敞口，等待系统恢复。' : '仅允许选择性小幅加仓。',
    rebalancePosture: defensiveFallback ? '先降风险，再做再平衡。' : '围绕目标区间逐步再平衡。',
    leveragePolicy: '回退模式下禁止新增杠杆。',
    hedgePosture: defensiveFallback ? '维持防守型对冲与缓冲仓。' : '保持基础对冲仓位有效。',
    adjustmentNotes: [
      '回退仓位指引已启用。',
      Number.isFinite(data?.score) ? `参考风险分数：${data.score}。` : '参考风险分数不可用。'
    ]
  };
}

export function flattenActionQueueItems(queue = {}) {
  return [
    ...(Array.isArray(queue.priorityActions) ? queue.priorityActions.map((text) => ({ bucket: 'priority', text })) : []),
    ...(Array.isArray(queue.watchItems) ? queue.watchItems.map((text) => ({ bucket: 'watch', text })) : []),
    ...(Array.isArray(queue.blockedActions) ? queue.blockedActions.map((text) => ({ bucket: 'blocked', text })) : [])
  ];
}

export function buildActionQueueFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  const defensiveFallback = metadata.realtimeUnavailable || strategyState === 'Defensive' || strategyState === 'Crisis';
  const queue = {
    priorityActions: defensiveFallback
      ? [
          '逐步降低整体风险敞口。',
          '提高现金缓冲，避免扩大杠杆。',
          '仅允许防守型再平衡。'
        ]
      : [
          '保持新增敞口的选择性与分批原则。',
          '向目标敞口区间再平衡。',
          '维持基础防守缓冲仓位。'
        ],
    watchItems: defensiveFallback
      ? [
          '关注波动率是否重新加速。',
          '监控信用与流动性压力是否升级。',
          '数据质量恢复前不放松防守姿态。'
        ]
      : [
          '加仓前先确认环境稳定性。',
          '关注波动率或利差是否重新走阔。',
          '扩大节奏前确认驱动因子持续性。'
        ],
    blockedActions: defensiveFallback
      ? [
          '暂停激进新增风险敞口。',
          '避免扩大杠杆。',
          '高风险环境下避免提高集中度。'
        ]
      : [
          '避免单次大幅调整敞口。',
          '未经确认前避免扩大杠杆。',
          '未经确认前避免提高集中度。'
        ],
    actionSummary: defensiveFallback ? '防守型回退动作队列已启用。' : '谨慎型回退动作队列已启用。',
    escalationHint: defensiveFallback ? '若压力指标恶化或数据质量下降，应升级防守。' : '若状态分数或压力信号恶化，应升级防守。',
    executionNotes: [
      '回退动作队列已启用。',
      Number.isFinite(data?.score) ? `参考风险分数：${data.score}。` : '参考风险分数不可用。'
    ]
  };
  queue.items = flattenActionQueueItems(queue);
  return queue;
}

export function buildTriggerMonitorFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  return {
    upgradeTriggers: [
      '若总风险分数从当前基线继续上升，应升级。',
      '若未来3日短期恶化趋势重启，应升级。',
      '若预警强度或数据质量下降加剧，应升级。'
    ],
    activeEscalationSignals: [
      metadata.realtimeUnavailable ? '实时数据不可用 / 当前仅基线模式。' : '升级引擎无可靠输出，请使用基线监控。',
      Number.isFinite(data?.score) ? `参考风险分数：${data.score}。` : '参考风险分数不可用。'
    ],
    triggerSummary: `${strategyState} 回退触发监控已启用。`,
    escalationLevel: metadata.realtimeUnavailable ? 'high' : 'medium',
    signalConfidence: metadata.realtimeUnavailable ? 'low' : 'medium'
  };
}

export function buildInvalidationRulesFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  return {
    invalidationSignals: [
      '若风险明显加速恶化，当前判断应视为失效。',
      '若数据质量持续下降，当前判断应视为过期。',
      '若预警强度上升，当前判断需重新审视。'
    ],
    resetConditions: [
      '短期恶化趋势停止后，方可降级。',
      '风险广度收窄后，方可降级。',
      '数据新鲜度恢复正常后，方可降级。'
    ],
    invalidationSummary: `${strategyState} 回退失效规则已启用。`,
    deescalationBias: metadata.realtimeUnavailable ? 'low' : 'medium',
    signalConfidence: metadata.realtimeUnavailable ? 'low' : 'medium'
  };
}

export function createDecisionFallback(data = {}, metadata = {}) {
  const fallbackLabel = metadata.realtimeUnavailable ? 'BASELINE / FALLBACK' : 'UNAVAILABLE / FALLBACK';
  const stateFallback = buildStrategyStateFallback(data, metadata);
  return {
    contractVersion: 'v26.0A-final',
    // v26.0A canonical decision fields: the fields below are the stable contract
    // for state, guidance, action, trigger, and invalidation consumers.
    strategyState: stateFallback.strategyState,
    stateLabel: stateFallback.stateLabel || fallbackLabel,
    stateReason: stateFallback.stateReason || (metadata.realtimeUnavailable
      ? '实时覆盖不可用，决策模型已回退到基线。'
      : '决策模型已回退到安全默认值。'),
    stateScore: stateFallback.stateScore,
    stateDrivers: stateFallback.stateDrivers,
    stateMeta: stateFallback.stateMeta,
    dominantDrivers: [{
      key: 'fallback',
      label: '回退基线',
      score: Number.isFinite(data.score) ? data.score : null,
      trend: 0,
      reason: '决策生成恢复前，使用基线风险分数与现有模块输出。'
    }],
    // Legacy compatibility fields: keep these while legacy positioning cards still
    // read older exposure / cash / note fields directly.
    positionGuidance: {
      ...buildPositionGuidanceFallback(data, metadata, stateFallback.strategyState),
      stance: 'Preserve current defensive baseline',
      riskBudget: data?.tradingSystem?.positioning?.riskBudget || '--',
      targetGrossExposure: data?.tradingSystem?.positioning?.targetGrossExposure || '--',
      cashBufferTarget: data?.tradingSystem?.positioning?.cashBufferTarget || '--',
      notes: ['回退模式已启用。', '决策模型恢复前，禁止扩大风险敞口。']
    },
    // Legacy compatibility fields: `items` / `notes` are retained for transitional
    // renderers and debugging, even though the canonical queue is split by bucket.
    actionQueue: buildActionQueueFallback(data, metadata, stateFallback.strategyState),
    triggerMonitor: buildTriggerMonitorFallback(data, metadata, stateFallback.strategyState),
    invalidationRules: buildInvalidationRulesFallback(data, metadata, stateFallback.strategyState)
  };
}

export function getStrategyStateLabel(strategyState, stateScore) {
  const scoreLabel = Number.isFinite(stateScore) ? `S${Math.round(stateScore)}` : 'S--';
  return `${strategyState} / ${scoreLabel}`;
}

export function deriveStrategyState(stateScore) {
  if (stateScore >= 85) return 'Crisis';
  if (stateScore >= 68) return 'Defensive';
  if (stateScore >= 48) return 'Caution';
  if (stateScore >= 28) return 'Balanced';
  return 'Risk-On';
}

export function buildStrategyStateMeta(data, history, metadata, healthDashboard) {
  const totalRiskScore = Number(data?.score);
  const scoreSeries = createScoreSeries(history, totalRiskScore);
  const referenceScore = scoreSeries.length >= 4 ? scoreSeries[scoreSeries.length - 4] : scoreSeries[0];
  const recent3dDelta = Number.isFinite(referenceScore) && Number.isFinite(totalRiskScore) ? totalRiskScore - referenceScore : 0;
  const recent3dSpeed = Number.isFinite(recent3dDelta) ? Number((recent3dDelta / 3).toFixed(1)) : 0;
  const moduleEntries = Object.entries(data?.modules || {})
    .map(([key, value]) => ({ key, value: Number(value) }))
    .filter((item) => Number.isFinite(item.value));
  const resonanceCount = moduleEntries.filter((item) => item.value >= 70).length;
  const severeResonanceCount = moduleEntries.filter((item) => item.value >= 80).length;
  const elevatedRiskStreakDays = countConsecutiveDays(scoreSeries, (score) => score >= 60);
  const highRiskStreakDays = countConsecutiveDays(scoreSeries, (score) => score >= 70);
  const alertCriticalCount = Array.isArray(data?.warningSystem?.alerts)
    ? data.warningSystem.alerts.filter((alert) => alert?.level === '红色').length
    : 0;
  const criticalAlertCount = Math.max(
    Number.isFinite(data?.warningSystem?.criticalCount) ? data.warningSystem.criticalCount : 0,
    alertCriticalCount
  );
  const warningCount = Number.isFinite(data?.warningSystem?.warningCount) ? data.warningSystem.warningCount : 0;
  const extremeThresholds = [];
  const pushExtreme = (condition, label) => {
    if (condition) extremeThresholds.push(label);
  };

  pushExtreme(totalRiskScore >= 85, 'total-risk>=85');
  pushExtreme(moduleEntries.some((item) => item.value >= 90), 'module>=90');
  pushExtreme(severeResonanceCount >= 3, 'three-modules>=80');
  pushExtreme(data?.liquidityIndex?.score >= 75, 'liquidity>=75');
  pushExtreme(criticalAlertCount > 0, 'critical-alert');
  pushExtreme(metadata.realtimeCacheOnly, 'cache-only');
  pushExtreme(highRiskStreakDays >= 7, 'high-risk-streak');

  return {
    totalRiskScore,
    recent3dDelta,
    recent3dSpeed,
    resonanceCount,
    severeResonanceCount,
    extremeThresholdCount: extremeThresholds.length,
    extremeThresholds,
    elevatedRiskStreakDays,
    highRiskStreakDays,
    criticalAlertCount,
    warningCount,
    healthLevel: healthDashboard.overallLevel,
    executionLevel: data?.tradingSystem?.executionLock?.level || 'unknown'
  };
}

export function calculateStrategyStateEngine(data, history, metadata, healthDashboard) {
  const stateMeta = buildStrategyStateMeta(data, history, metadata, healthDashboard);
  const executionLevel = data?.tradingSystem?.executionLock?.level;
  let stateScore = Number.isFinite(stateMeta.totalRiskScore) ? stateMeta.totalRiskScore : 55;

  if (stateMeta.recent3dDelta >= 12) stateScore += 18;
  else if (stateMeta.recent3dDelta >= 6) stateScore += 10;
  else if (stateMeta.recent3dDelta >= 3) stateScore += 6;
  else if (stateMeta.recent3dDelta <= -12) stateScore -= 14;
  else if (stateMeta.recent3dDelta <= -6) stateScore -= 8;
  else if (stateMeta.recent3dDelta <= -3) stateScore -= 4;

  if (stateMeta.resonanceCount >= 5) stateScore += 18;
  else if (stateMeta.resonanceCount === 4) stateScore += 12;
  else if (stateMeta.resonanceCount === 3) stateScore += 8;
  else if (stateMeta.resonanceCount === 2) stateScore += 4;

  if (stateMeta.severeResonanceCount >= 3) stateScore += 10;
  else if (stateMeta.severeResonanceCount === 2) stateScore += 6;

  if (stateMeta.extremeThresholdCount >= 3) stateScore += 24;
  else if (stateMeta.extremeThresholdCount >= 1) stateScore += 14;

  if (stateMeta.highRiskStreakDays >= 7) stateScore += 12;
  else if (stateMeta.highRiskStreakDays >= 5) stateScore += 8;
  else if (stateMeta.highRiskStreakDays >= 3) stateScore += 5;

  if (stateMeta.healthLevel === 'Baseline Only') stateScore += 6;
  else if (stateMeta.healthLevel === 'Stale') stateScore += 8;
  else if (stateMeta.healthLevel === 'Degraded') stateScore += 4;
  else if (stateMeta.healthLevel === 'Healthy') stateScore -= 2;

  if (executionLevel === 'red') stateScore += 4;
  else if (executionLevel === 'yellow') stateScore += 2;
  else if (executionLevel === 'green') stateScore -= 2;

  if (metadata.realtimeFallbackUsed) stateScore += 3;

  stateScore = clampNumber(Math.round(stateScore), 0, 100);
  const strategyState = deriveStrategyState(stateScore);
  const stateDrivers = [
    {
      key: 'total-risk',
      label: 'Total risk score',
      impact: strategyState,
      reason: `Current total risk score is ${stateMeta.totalRiskScore ?? '--'}.`
    },
    {
      key: 'three-day-speed',
      label: '3-day speed',
      impact: stateMeta.recent3dDelta > 0 ? 'deteriorating' : stateMeta.recent3dDelta < 0 ? 'easing' : 'flat',
      reason: `Recent 3-day change is ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta} (${stateMeta.recent3dSpeed}/day).`
    },
    {
      key: 'module-resonance',
      label: 'Module resonance',
      impact: stateMeta.resonanceCount >= 3 ? 'broad' : stateMeta.resonanceCount >= 2 ? 'narrow' : 'contained',
      reason: `${stateMeta.resonanceCount} modules are at or above 70, with ${stateMeta.severeResonanceCount} at or above 80.`
    },
    {
      key: 'extreme-thresholds',
      label: 'Extreme thresholds',
      impact: stateMeta.extremeThresholdCount > 0 ? 'triggered' : 'clear',
      reason: stateMeta.extremeThresholdCount
        ? `Triggered: ${stateMeta.extremeThresholds.join(', ')}.`
        : 'No extreme thresholds are currently triggered.'
    },
    {
      key: 'high-risk-streak',
      label: 'High-risk persistence',
      impact: stateMeta.highRiskStreakDays >= 3 ? 'persistent' : 'not-persistent',
      reason: `High-risk streak: ${stateMeta.highRiskStreakDays} day(s); elevated-risk streak: ${stateMeta.elevatedRiskStreakDays} day(s).`
    }
  ];

  const stateReason = [
    `Strategy state resolved to ${strategyState} with state score ${stateScore}.`,
    `Total risk ${stateMeta.totalRiskScore ?? '--'}, 3-day delta ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta}, resonance ${stateMeta.resonanceCount}.`,
    stateMeta.extremeThresholdCount
      ? `Extreme thresholds active: ${stateMeta.extremeThresholds.join(', ')}.`
      : 'No extreme thresholds are active.'
  ].join(' ');

  return {
    strategyState,
    stateLabel: getStrategyStateLabel(strategyState, stateScore),
    stateScore,
    stateReason,
    stateDrivers,
    stateMeta
  };
}

export function deriveDecisionState(data, history, metadata, healthDashboard) {
  try {
    return calculateStrategyStateEngine(data, history, metadata, healthDashboard);
  } catch (error) {
    console.warn('Strategy state engine failed, using fallback.', error);
    return buildStrategyStateFallback(data, metadata);
  }
}

export function buildDominantDrivers(data, metadata) {
  const moduleEntries = Object.entries(data?.modules || {})
    .map(([key, score]) => ({
      key,
      label: MODULE_LABELS[key] || key,
      score: Number.isFinite(score) ? score : null,
      trend: Number.isFinite(data?.moduleTrends?.[key]) ? data.moduleTrends[key] : 0
    }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      reason: `${item.label} score ${item.score} with ${item.trend > 0 ? 'rising' : item.trend < 0 ? 'easing' : 'stable'} trend.`
    }));

  if (metadata.realtimeFallbackUsed) {
    moduleEntries.push({
      key: 'realtime-fallback',
      label: 'Realtime fallback',
      score: metadata.realtimeHealthScore ?? null,
      trend: 0,
      reason: 'Realtime fallback/local mode is active and should cap decision confidence.'
    });
  }

  return moduleEntries.slice(0, 4);
}

export function buildPositionGuidanceEngine(data, metadata, decisionState, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const positioning = data?.tradingSystem?.positioning || {};
    const driverLabels = Array.isArray(dominantDrivers)
      ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean)
      : [];

    const stateBandMap = {
      'Risk-On': {
        totalExposureBand: '65%-85%',
        riskAssetBias: 'Overweight within risk budget',
        defensiveBias: 'Low',
        cashGuidance: 'Run lighter cash buffer (10%-18%)',
        newExposurePolicy: 'Normal staged adds are allowed.',
        rebalancePosture: 'Lean into target risk bands on pullbacks.',
        leveragePolicy: 'Avoid aggressive leverage; only baseline financing if already embedded.',
        hedgePosture: 'Keep only light strategic hedges.'
      },
      Balanced: {
        totalExposureBand: '50%-70%',
        riskAssetBias: 'Neutral to selective',
        defensiveBias: 'Moderate',
        cashGuidance: 'Hold balanced cash buffer (15%-25%)',
        newExposurePolicy: 'Allow selective adds, but keep pacing controlled.',
        rebalancePosture: 'Rebalance around targets without chasing.',
        leveragePolicy: 'No new leverage expansion.',
        hedgePosture: 'Maintain baseline hedges.'
      },
      Caution: {
        totalExposureBand: '35%-55%',
        riskAssetBias: 'Selective underweight',
        defensiveBias: 'Moderately high',
        cashGuidance: 'Raise cash buffer (20%-32%)',
        newExposurePolicy: 'Only allow highly selective new exposure in small clips.',
        rebalancePosture: 'Trim risk first, then rebalance.',
        leveragePolicy: 'Reduce leverage where practical; do not add new leverage.',
        hedgePosture: 'Keep hedges active and bias toward protection.'
      },
      Defensive: {
        totalExposureBand: '20%-40%',
        riskAssetBias: 'Underweight risk assets',
        defensiveBias: 'High',
        cashGuidance: 'Keep elevated cash buffer (30%-45%)',
        newExposurePolicy: 'Pause broad new risk exposure; only defensive rebalancing is allowed.',
        rebalancePosture: 'Prioritize de-risking and restoring buffers.',
        leveragePolicy: 'No leverage expansion; favor leverage reduction.',
        hedgePosture: 'Maintain defensive hedges and liquidity buffers.'
      },
      Crisis: {
        totalExposureBand: '0%-20%',
        riskAssetBias: 'Minimum risk exposure',
        defensiveBias: 'Maximum',
        cashGuidance: 'Hold maximum cash / liquidity buffer (45%-70%)',
        newExposurePolicy: 'Suspend new high-risk exposure until state normalizes.',
        rebalancePosture: 'Capital preservation first.',
        leveragePolicy: 'No leverage; actively reduce gross exposure.',
        hedgePosture: 'Keep strongest defensive posture available.'
      }
    };

    const guidance = { ...(stateBandMap[strategyState] || stateBandMap.Caution) };
    let bandShift = 0;

    if (stateScore >= 90) bandShift -= 10;
    else if (stateScore >= 80) bandShift -= 5;
    else if (stateScore <= 20) bandShift += 8;
    else if (stateScore <= 35) bandShift += 5;

    if ((stateMeta.extremeThresholdCount || 0) >= 2) bandShift -= 5;
    if ((stateMeta.highRiskStreakDays || 0) >= 5) bandShift -= 5;
    if ((stateMeta.recent3dDelta || 0) <= -10 && strategyState !== 'Crisis') bandShift += 5;
    if ((stateMeta.recent3dDelta || 0) >= 8) bandShift -= 5;
    if (metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly) bandShift -= 5;

    const parseBand = (band) => {
      const match = String(band).match(/(\d+)%-(\d+)%/);
      if (!match) return null;
      return { min: Number(match[1]), max: Number(match[2]) };
    };
    const formatBand = (range) => `${range.min}%-${range.max}%`;
    const shiftBand = (band, shift, floor = 0, ceil = 100, minWidth = 15) => {
      const range = parseBand(band);
      if (!range) return band;
      let next = {
        min: clampNumber(range.min + shift, floor, ceil),
        max: clampNumber(range.max + shift, floor, ceil)
      };
      if (next.max - next.min < minWidth) {
        next.max = clampNumber(next.min + minWidth, floor, ceil);
        next.min = clampNumber(next.max - minWidth, floor, ceil);
      }
      return formatBand(next);
    };

    guidance.totalExposureBand = shiftBand(guidance.totalExposureBand, bandShift);

    if (bandShift <= -8) {
      guidance.riskAssetBias = strategyState === 'Crisis' ? 'Minimum risk exposure' : 'Further reduce risk asset exposure';
      guidance.defensiveBias = strategyState === 'Risk-On' ? 'Moderate' : 'Very high';
    } else if (bandShift >= 5) {
      guidance.riskAssetBias = strategyState === 'Risk-On' ? 'Constructive within risk budget' : 'Selective but improving';
      guidance.defensiveBias = strategyState === 'Defensive' ? 'High but stabilizing' : 'Moderate';
    }

    const existingRiskBudget = positioning.riskBudget || '--';
    const existingExposureTarget = positioning.targetGrossExposure || '--';
    const existingCashTarget = positioning.cashBufferTarget || '--';

    return {
      ...guidance,
      stance: `${strategyState} position guidance`,
      riskBudget: existingRiskBudget,
      targetGrossExposure: existingExposureTarget,
      cashBufferTarget: existingCashTarget,
      adjustmentNotes: [
        `Strategy state: ${strategyState} (${decisionState?.stateLabel || 'unlabeled'}).`,
        `State score: ${stateScore}.`,
        `3-day delta: ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta || 0}; resonance: ${stateMeta.resonanceCount || 0}.`,
        driverLabels.length ? `Dominant drivers: ${driverLabels.join(', ')}.` : 'Dominant drivers unavailable.'
      ]
    };
  } catch (error) {
    console.warn('Position guidance engine failed, using fallback.', error);
    return buildPositionGuidanceFallback(data, metadata, decisionState?.strategyState);
  }
}

export function uniqTexts(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

export function buildActionQueueEngine(data, metadata, decisionState, positionGuidance, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const triggerPanel = data?.triggerPanel || {};
    const healthLevel = stateMeta.healthLevel || 'Unknown';
    const topDrivers = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色');
    const yellowAlerts = warningAlerts.filter((alert) => alert?.level !== '红色');

    const priorityActions = [];
    const watchItems = [];
    const blockedActions = [];

    const byState = {
      'Risk-On': {
        priority: [
          'Add new risk exposure only in staged increments.',
          'Keep total exposure inside the current target band.',
          'Rebalance without chasing short-term moves.'
        ],
        blocked: [
          'Avoid leverage expansion beyond baseline.',
          'Avoid concentration increase without confirmation.'
        ]
      },
      Balanced: {
        priority: [
          'Keep exposure pacing controlled and selective.',
          'Rebalance toward the middle of the target band.',
          'Maintain baseline defensive buffers.'
        ],
        blocked: [
          'Avoid oversized single-step exposure changes.',
          'Avoid leverage expansion before confirmation.'
        ]
      },
      Caution: {
        priority: [
          'Reduce broad risk exposure incrementally.',
          'Keep new exposure highly selective and small.',
          'Raise cash buffer toward the guidance band.'
        ],
        blocked: [
          'Pause aggressive new risk deployment.',
          'Avoid leverage expansion.',
          'Avoid concentration increase under elevated regime.'
        ]
      },
      Defensive: {
        priority: [
          'Reduce broad risk exposure incrementally.',
          'Raise cash buffer and keep exposure inside the lower band.',
          'Only allow defensive rebalancing.'
        ],
        blocked: [
          'Pause aggressive new risk deployment.',
          'Avoid leverage expansion.',
          'Avoid concentration increase under elevated regime.'
        ]
      },
      Crisis: {
        priority: [
          'Prioritize capital preservation and liquidity restoration.',
          'Cut broad risk exposure toward minimum levels.',
          'Keep only defensive rebalancing and hedge maintenance.'
        ],
        blocked: [
          'Suspend new high-risk exposure.',
          'Avoid leverage use or expansion.',
          'Avoid concentration increase under crisis regime.'
        ]
      }
    };

    priorityActions.push(...(byState[strategyState]?.priority || byState.Caution.priority));
    blockedActions.push(...(byState[strategyState]?.blocked || byState.Caution.blocked));

    if ((stateMeta.extremeThresholdCount || 0) >= 2) {
      priorityActions.push('Tighten execution pace until extreme thresholds clear.');
      blockedActions.push('Avoid discretionary risk expansion while extreme thresholds remain active.');
    }
    if ((stateMeta.recent3dDelta || 0) >= 8) {
      priorityActions.push('Accelerate de-risking cadence while short-term stress is rising.');
      watchItems.push('Watch for further 3-day risk acceleration.');
    } else if ((stateMeta.recent3dDelta || 0) <= -8) {
      watchItems.push('Watch whether recent easing persists before relaxing posture.');
    }
    if ((stateMeta.highRiskStreakDays || 0) >= 5) {
      priorityActions.push('Maintain defensive buffers until the high-risk streak breaks.');
    }
    if (metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly || healthLevel === 'Baseline Only' || healthLevel === 'Stale') {
      watchItems.push('Monitor data quality and freshness before easing controls.');
      blockedActions.push('Avoid expanding risk using degraded or fallback data only.');
    }
    if ((positionGuidance?.newExposurePolicy || '').toLowerCase().includes('pause') || strategyState === 'Crisis') {
      blockedActions.push('Pause broad new risk deployment.');
    }
    if ((positionGuidance?.leveragePolicy || '').toLowerCase().includes('no leverage')) {
      blockedActions.push('Avoid leverage expansion.');
    }

    topDrivers.forEach((driver) => {
      watchItems.push(`Monitor ${driver} stress for escalation or relief.`);
    });

    criticalAlerts.slice(0, 2).forEach((alert) => {
      priorityActions.push(`Respond to ${alert.title || 'critical alert'} immediately.`);
    });
    yellowAlerts.slice(0, 2).forEach((alert) => {
      watchItems.push(`Watch ${alert.title || 'warning signal'} for deterioration.`);
    });

    (Array.isArray(triggerPanel.watchlist) ? triggerPanel.watchlist : []).slice(0, 3).forEach((item) => {
      watchItems.push(`Watch ${item}.`);
    });
    (Array.isArray(triggerPanel.critical) ? triggerPanel.critical : []).slice(0, 2).forEach((item) => {
      watchItems.push(`Track critical trigger ${item}.`);
    });

    if (Array.isArray(riskControl.hardThresholds) && riskControl.hardThresholds.length) {
      watchItems.push('Monitor hard thresholds for escalation.');
    }

    const queue = {
      priorityActions: uniqTexts(priorityActions).slice(0, 6),
      watchItems: uniqTexts(watchItems).slice(0, 6),
      blockedActions: uniqTexts(blockedActions).slice(0, 6),
      actionSummary: `${strategyState} queue aligned with ${positionGuidance?.totalExposureBand || 'current'} exposure guidance.`,
      escalationHint: (stateMeta.extremeThresholdCount || 0) > 0
        ? 'Escalate immediately if extreme thresholds widen or critical alerts increase.'
        : 'Escalate if volatility, spread stress, or data quality worsens.',
      executionNotes: uniqTexts([
        `State score ${stateScore}; exposure band ${positionGuidance?.totalExposureBand || '--'}.`,
        `Cash guidance: ${positionGuidance?.cashGuidance || '--'}.`,
        topDrivers.length ? `Driver focus: ${topDrivers.join(', ')}.` : '',
        healthLevel ? `Health: ${healthLevel}.` : ''
      ]).slice(0, 4)
    };
    queue.items = flattenActionQueueItems(queue);
    return queue;
  } catch (error) {
    console.warn('Action queue engine failed, using fallback.', error);
    return buildActionQueueFallback(data, metadata, decisionState?.strategyState);
  }
}

export function buildTriggerMonitorEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const triggerPanel = data?.triggerPanel || {};
    const moduleEntries = Object.entries(data?.modules || {})
      .map(([key, value]) => ({ key, value: Number(value) }))
      .filter((item) => Number.isFinite(item.value));
    const dominantLabels = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色').length;

    const upgradeTriggers = uniqTexts([
      'Upgrade if state score rises by 8 points or more from the current regime.',
      'Upgrade if the 3-day change turns positive and exceeds +6.',
      'Upgrade if resonance expands to 4 or more modules above 70.',
      'Upgrade if severe resonance rises to 3 or more modules above 80.',
      'Upgrade if red alerts increase or new critical alerts appear.',
      'Upgrade if liquidity / volatility / funding stress re-accelerates.',
      metadata.realtimeCacheOnly ? 'Upgrade if cache-only mode persists into the next cycle.' : '',
      metadata.realtimeFreshnessLevel === 'stale' || metadata.realtimeUnavailable ? 'Upgrade if stale / baseline-only data persists without recovery.' : ''
    ]).slice(0, 7);

    const activeEscalationSignals = uniqTexts([
      stateScore >= 85 ? `State score ${stateScore} is already near crisis escalation.` : '',
      (stateMeta.recent3dDelta || 0) >= 6 ? `3-day deterioration is active at +${stateMeta.recent3dDelta}.` : '',
      (stateMeta.resonanceCount || 0) >= 4 ? `Broad resonance active: ${stateMeta.resonanceCount} modules above 70.` : '',
      (stateMeta.severeResonanceCount || 0) >= 2 ? `Severe resonance active: ${stateMeta.severeResonanceCount} modules above 80.` : '',
      criticalAlerts > 0 ? `${criticalAlerts} red alert(s) active.` : '',
      metadata.realtimeCacheOnly ? 'Cache-only mode is active.' : '',
      metadata.realtimeUnavailable ? 'Realtime unavailable / baseline only.' : '',
      metadata.realtimeFreshnessLevel === 'stale' ? 'Realtime freshness is stale.' : '',
      dominantLabels.length ? `Dominant stress drivers: ${dominantLabels.join(', ')}.` : '',
      Array.isArray(triggerPanel.critical) && triggerPanel.critical.length ? `Critical trigger panel active: ${triggerPanel.critical.slice(0, 2).join(', ')}.` : ''
    ]).slice(0, 6);

    let escalationLevel = 'medium';
    if (stateScore >= 85 || (stateMeta.extremeThresholdCount || 0) >= 3 || criticalAlerts >= 2) escalationLevel = 'severe';
    else if (stateScore >= 68 || (stateMeta.extremeThresholdCount || 0) >= 1 || criticalAlerts >= 1) escalationLevel = 'high';

    return {
      upgradeTriggers,
      activeEscalationSignals,
      triggerSummary: `${strategyState} trigger monitor watching score, resonance, alerts, and data-quality escalation paths.`,
      escalationLevel,
      signalConfidence: metadata.realtimeUnavailable ? 'medium' : metadata.realtimeCacheOnly ? 'medium' : 'high'
    };
  } catch (error) {
    console.warn('Trigger monitor engine failed, using fallback.', error);
    return buildTriggerMonitorFallback(data, metadata, decisionState?.strategyState);
  }
}

export function buildInvalidationRulesEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const dominantLabels = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];

    const invalidationSignals = uniqTexts([
      'Invalidate the current defensive read if total risk score rises another 8 points from here.',
      'Invalidate the current read if the 3-day trend stops easing and turns back above +3.',
      'Invalidate the current read if resonance breadth expands again.',
      'Invalidate the current read if red alerts increase.',
      metadata.realtimeCacheOnly ? 'Invalidate the current read if cache-only mode persists and stress signals stay elevated.' : '',
      metadata.realtimeUnavailable ? 'Invalidate the current read if baseline-only mode persists while alerts worsen.' : ''
    ]).slice(0, 6);

    const resetConditions = uniqTexts([
      'Allow de-escalation after total risk score falls and holds lower.',
      'Allow de-escalation after the 3-day trend turns flat or negative.',
      'Allow de-escalation after resonance count drops below 3.',
      'Allow de-escalation after severe resonance eases below 2.',
      'Allow de-escalation after red alerts clear and data freshness normalizes.',
      ...(Array.isArray(riskControl.resetThresholds) ? riskControl.resetThresholds.slice(0, 3).map((rule) => `Reset reference: ${rule}`) : [])
    ]).slice(0, 6);

    let deescalationBias = 'medium';
    if ((stateMeta.recent3dDelta || 0) <= -8 && (stateMeta.resonanceCount || 0) <= 2 && (stateMeta.criticalAlertCount || 0) === 0) {
      deescalationBias = 'improving';
    } else if (metadata.realtimeUnavailable || metadata.realtimeCacheOnly || (stateMeta.extremeThresholdCount || 0) > 0) {
      deescalationBias = 'low';
    }

    return {
      invalidationSignals,
      resetConditions,
      invalidationSummary: `${strategyState} invalidation rules require lower score pressure, narrower resonance, cleaner alerts, and better data quality before easing.`,
      deescalationBias,
      signalConfidence: metadata.realtimeUnavailable ? 'medium' : metadata.realtimeCacheOnly ? 'medium' : 'high'
    };
  } catch (error) {
    console.warn('Invalidation rules engine failed, using fallback.', error);
    return buildInvalidationRulesFallback(data, metadata, decisionState?.strategyState);
  }
}

export function buildDecisionModel(data, history, metadata, healthDashboard) {
  try {
    const state = deriveDecisionState(data, history, metadata, healthDashboard);
    const dominantDrivers = buildDominantDrivers(data, metadata);
    const position = data?.tradingSystem?.positioning || {};
    const actionLayer = data?.tradingSystem?.actionLayer || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const executionLock = data?.tradingSystem?.executionLock || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色').slice(0, 3);
    const watchlist = Array.isArray(data?.triggerPanel?.watchlist) ? data.triggerPanel.watchlist.slice(0, 3) : [];
    const driverLabels = dominantDrivers.map((item) => item.label).join(', ') || 'baseline drivers';
    const positionGuidance = buildPositionGuidanceEngine(data, metadata, state, dominantDrivers);
    const actionQueue = buildActionQueueEngine(data, metadata, state, positionGuidance, dominantDrivers);
    const triggerMonitor = buildTriggerMonitorEngine(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);
    const invalidationRules = buildInvalidationRulesEngine(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);

    return {
      contractVersion: 'v26.0A-final',
      // v26.0A canonical decision fields.
      // These are the primary contract paths to extend in future work:
      // - strategyState / stateLabel / stateReason / stateScore
      // - stateDrivers / dominantDrivers / stateMeta
      // - positionGuidance.totalExposureBand / riskAssetBias / defensiveBias / cashGuidance / newExposurePolicy
      // - actionQueue.priorityActions / watchItems / blockedActions
      // - triggerMonitor.upgradeTriggers / activeEscalationSignals
      // - invalidationRules.invalidationSignals / resetConditions
      strategyState: state.strategyState,
      stateLabel: state.stateLabel,
      stateReason: state.stateReason || `${executionLock.title || 'Existing trading system state'}; health ${healthDashboard.overallLevel}; dominant drivers: ${driverLabels}.`,
      stateScore: state.stateScore,
      stateDrivers: state.stateDrivers || [],
      stateMeta: state.stateMeta || {},
      dominantDrivers: dominantDrivers.length ? dominantDrivers : createDecisionFallback(data, metadata).dominantDrivers,
      // Canonical position guidance fields are generated by the v26 engine above.
      // Legacy compatibility fields are retained below because older page sections
      // still read budget / target / note style properties directly.
      positionGuidance: {
        ...positionGuidance,
        riskBudget: positionGuidance.riskBudget || position.riskBudget || clampPercent(data?.score),
        targetGrossExposure: positionGuidance.targetGrossExposure || position.targetGrossExposure || '--',
        cashBufferTarget: positionGuidance.cashBufferTarget || position.cashBufferTarget || '--',
        notes: [
          executionLock.description || 'Follow current execution lock.',
          `Health: ${healthDashboard.overallLevel}.`,
          `Realtime: ${metadata.realtimeStatusLabel || 'unknown'}.`
        ].filter(Boolean)
      },
      // Canonical queue fields are priorityActions / watchItems / blockedActions.
      // Legacy compatibility fields such as `items` and `notes` are intentionally
      // preserved for transitional renderers and debugging.
      actionQueue: {
        ...actionQueue,
        notes: [
          executionLock.description || 'Follow current execution lock.',
          actionLayer.todayAction || 'Use the queue as the primary execution guide.'
        ].filter(Boolean)
      },
      triggerMonitor,
      invalidationRules
    };
  } catch (error) {
    console.warn('Decision model generation failed, using fallback.', error);
    return createDecisionFallback(data, metadata);
  }
}
