import { fmtNumSafe, fmtDeltaSafe, trendClass, riskColor } from './config.js?v=bofa-report-review-1';
import { formatOnRrpYiUsd } from './format.js?v=bofa-report-review-1';

export const MODULE_LABELS = {
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
};

// v27 结构信号中文标签映射（仅文件内部使用）
const STRUCTURAL_SIGNAL_LABELS = {
  curveDeepInversion: '曲线深度倒挂',
  curveRapidSteepening: '曲线快速陡峭化',
  onRrpCritical: '逆回购准备金告急',
  fedRapidContraction: '美联储快速缩表',
  igOasStress: '投资级信用利差扩张',
  moveVolStress: '债券波动率告急（MOVE）'
};

// ============================================================
// 通用工具（保持原有导出签名）
// ============================================================

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

// ============================================================
// v27 新增：pipeline 输出读取器（优先级最高）
// ============================================================

function readPipelineDecision(data) {
  const pm = data?.decisionModel;
  if (!pm || typeof pm !== 'object') return null;
  const hasStrategyState = typeof pm.strategyState === 'string' && pm.strategyState.length > 0;
  const hasStateReason = typeof pm.stateReason === 'string' && pm.stateReason.trim().length > 0;
  if (!hasStrategyState && !hasStateReason) return null;
  return pm;
}

function readActiveStructuralSignals(data) {
  const md = data?.macroDrivers;
  if (!md) return [];
  if (Array.isArray(md.activeSignals) && md.activeSignals.length) {
    return md.activeSignals
      .map((s) => ({
        key: s?.key || '',
        label: s?.label || STRUCTURAL_SIGNAL_LABELS[s?.key] || s?.key || '',
        detail: s?.detail || '',
        reliability: s?.reliability || 'missing'
      }))
      .filter((s) => s.key && s.reliability !== 'missing');
  }
  const fed = md.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = md.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = md.credit || {};
  const creditStatus = credit.sourceStatus || {};
  const rateVol = md.rateVol || {};
  const rateVolStatus = rateVol.sourceStatus || {};
  const active = [];
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing' && curve.t10y2y <= -0.5) {
    active.push({ key: 'curveDeepInversion', label: STRUCTURAL_SIGNAL_LABELS.curveDeepInversion, detail: `10年-2年利差 ${curve.t10y2y.toFixed(2)}`, reliability: curveStatus.t10y2y });
  }
  if (Number.isFinite(curve.t10y2y) && curve.steepeningAlert && curveStatus.t10y2y !== 'missing') {
    active.push({ key: 'curveRapidSteepening', label: STRUCTURAL_SIGNAL_LABELS.curveRapidSteepening, detail: `周变化 ${curve.t10y2yWeekChange?.toFixed?.(2) ?? '--'}`, reliability: curveStatus.t10y2y });
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing' && fed.onRrp < 100) {
    active.push({ key: 'onRrpCritical', label: STRUCTURAL_SIGNAL_LABELS.onRrpCritical, detail: `ON RRP ${formatOnRrpYiUsd(fed.onRrp)}`, reliability: fedStatus.onRrp });
  }
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing' && fed.walcl4wChange <= -2) {
    active.push({ key: 'fedRapidContraction', label: STRUCTURAL_SIGNAL_LABELS.fedRapidContraction, detail: `4周变化 ${fed.walcl4wChange.toFixed(2)}%`, reliability: fedStatus.walcl });
  }
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing' && credit.igOas >= 1.8) {
    active.push({ key: 'igOasStress', label: STRUCTURAL_SIGNAL_LABELS.igOasStress, detail: `IG OAS ${credit.igOas.toFixed(2)}%`, reliability: creditStatus.igOas });
  }
  if (Number.isFinite(rateVol.move) && (rateVolStatus.move === 'live' || rateVolStatus.move === 'fallback') && rateVol.move >= 140) {
    active.push({ key: 'moveVolStress', label: STRUCTURAL_SIGNAL_LABELS.moveVolStress, detail: `MOVE ${rateVol.move.toFixed(1)}（${rateVol.move >= 160 ? '危机' : '应激'}）`, reliability: rateVolStatus.move });
  }
  return active;
}

function isAllStructuralSourcesMissing(data) {
  const md = data?.macroDrivers;
  if (!md) return true;
  if (md.allSourcesMissing === true) return true;
  const fed = md.fedLiquidity?.sourceStatus || {};
  const curve = md.curve?.sourceStatus || {};
  const credit = md.credit?.sourceStatus || {};
  const rateVol = md.rateVol?.sourceStatus || {};
  const statuses = [fed.walcl, fed.onRrp, curve.t10y2y, credit.igOas, rateVol.move];
  if (!statuses.length) return true;
  return statuses.every((s) => s === 'missing' || s === 'stale' || s == null);
}

// ============================================================
// Fallback 层（原有导出签名保留）
// ============================================================

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
    healthLevel: metadata.realtimeUnavailable ? '仅基线' : '未知',
    structuralSignalCount: 0,
    structuralSignalLabels: []
  };
  return {
    strategyState: fallbackState,
    stateLabel: `${fallbackState} / 回退`,
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
      ? ['逐步降低整体风险敞口。', '提高现金缓冲，避免扩大杠杆。', '仅允许防守型再平衡。']
      : ['保持新增敞口的选择性与分批原则。', '向目标敞口区间再平衡。', '维持基础防守缓冲仓位。'],
    watchItems: defensiveFallback
      ? ['关注波动率是否重新加速。', '监控信用与流动性压力是否升级。', '数据质量恢复前不放松防守姿态。']
      : ['加仓前先确认环境稳定性。', '关注波动率或利差是否重新走阔。', '扩大节奏前确认驱动因子持续性。'],
    blockedActions: defensiveFallback
      ? ['暂停激进新增风险敞口。', '避免扩大杠杆。', '高风险环境下避免提高集中度。']
      : ['避免单次大幅调整敞口。', '未经确认前避免扩大杠杆。', '未经确认前避免提高集中度。'],
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
    escalationLevel: metadata.realtimeUnavailable ? '高' : '中',
    signalConfidence: metadata.realtimeUnavailable ? '低' : '中'
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
    deescalationBias: metadata.realtimeUnavailable ? '低' : '中',
    signalConfidence: metadata.realtimeUnavailable ? '低' : '中'
  };
}

export function createDecisionFallback(data = {}, metadata = {}) {
  const fallbackLabel = metadata.realtimeUnavailable ? '基线 / 回退' : '不可用 / 回退';
  const stateFallback = buildStrategyStateFallback(data, metadata);
  return {
    contractVersion: 'v27.0',
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
    positionGuidance: {
      ...buildPositionGuidanceFallback(data, metadata, stateFallback.strategyState),
      stance: '维持当前防守型基线',
      riskBudget: data?.tradingSystem?.positioning?.riskBudget || '--',
      targetGrossExposure: data?.tradingSystem?.positioning?.targetGrossExposure || '--',
      cashBufferTarget: data?.tradingSystem?.positioning?.cashBufferTarget || '--',
      notes: ['回退模式已启用。', '决策模型恢复前，禁止扩大风险敞口。']
    },
    actionQueue: buildActionQueueFallback(data, metadata, stateFallback.strategyState),
    triggerMonitor: buildTriggerMonitorFallback(data, metadata, stateFallback.strategyState),
    invalidationRules: buildInvalidationRulesFallback(data, metadata, stateFallback.strategyState)
  };
}

// ============================================================
// Engine 层（保留原有导出签名，仅作为 pipeline 未写入时的兜底）
// ============================================================

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

const STRATEGY_STATE_DEFAULT_SCORE = 55;
const STRATEGY_STATE_SCORE_BUMPS = Object.freeze({
  recent3dDelta: [
    { min: 12, bump: 18 },
    { min: 6, bump: 10 },
    { min: 3, bump: 6 },
    { max: -12, bump: -14 },
    { max: -6, bump: -8 },
    { max: -3, bump: -4 }
  ],
  resonanceCount: [
    { min: 5, bump: 18 },
    { eq: 4, bump: 12 },
    { eq: 3, bump: 8 },
    { eq: 2, bump: 4 }
  ],
  severeResonanceCount: [
    { min: 3, bump: 10 },
    { eq: 2, bump: 6 }
  ],
  extremeThresholdCount: [
    { min: 3, bump: 24 },
    { min: 1, bump: 14 }
  ],
  highRiskStreakDays: [
    { min: 7, bump: 12 },
    { min: 5, bump: 8 },
    { min: 3, bump: 5 }
  ],
  healthLevel: Object.freeze({
    '仅基线': 6,
    '已过期': 8,
    '降级': 4,
    '健康': -2
  }),
  executionLevel: Object.freeze({
    red: 4,
    yellow: 2,
    green: -2
  }),
  realtimeFallbackUsed: 3
});

function scoreBumpFromRules(value, rules) {
  for (const rule of rules) {
    if ('min' in rule && value >= rule.min) return rule.bump;
    if ('max' in rule && value <= rule.max) return rule.bump;
    if ('eq' in rule && value === rule.eq) return rule.bump;
  }
  return 0;
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
  const pushExtreme = (condition, label) => { if (condition) extremeThresholds.push(label); };
  pushExtreme(totalRiskScore >= 85, '总分>=85');
  pushExtreme(moduleEntries.some((item) => item.value >= 90), '模块>=90');
  pushExtreme(severeResonanceCount >= 3, '三模块>=80');
  pushExtreme(data?.liquidityIndex?.score >= 75, '流动性>=75');
  pushExtreme(criticalAlertCount > 0, '关键预警触发');
  pushExtreme(metadata.realtimeCacheOnly, '缓存模式');
  pushExtreme(highRiskStreakDays >= 7, '高风险持续连streak');

  const activeSignals = readActiveStructuralSignals(data);
  const structuralSignalLabels = activeSignals.map((s) => s.label);
  if (activeSignals.some((s) => s.key === 'curveDeepInversion')) extremeThresholds.push('曲线深度倒挂');
  if (activeSignals.some((s) => s.key === 'onRrpCritical')) extremeThresholds.push('逆回购准备金告急');
  if (activeSignals.some((s) => s.key === 'igOasStress')) extremeThresholds.push('投资级信用利差扩张');
  if (activeSignals.some((s) => s.key === 'fedRapidContraction')) extremeThresholds.push('美联储快速缩表');
  if (activeSignals.some((s) => s.key === 'moveVolStress')) extremeThresholds.push('债券波动率告急（MOVE）');

  return {
    totalRiskScore, recent3dDelta, recent3dSpeed, resonanceCount, severeResonanceCount,
    extremeThresholdCount: extremeThresholds.length, extremeThresholds,
    elevatedRiskStreakDays, highRiskStreakDays, criticalAlertCount, warningCount,
    healthLevel: healthDashboard?.overallLevel,
    executionLevel: data?.tradingSystem?.executionLock?.level || 'unknown',
    structuralSignalCount: activeSignals.length,
    structuralSignalLabels,
    allStructuralSourcesMissing: isAllStructuralSourcesMissing(data)
  };
}

export function calculateStrategyStateEngine(data, history, metadata, healthDashboard) {
  const stateMeta = buildStrategyStateMeta(data, history, metadata, healthDashboard);
  const executionLevel = data?.tradingSystem?.executionLock?.level;
  let stateScore = Number.isFinite(stateMeta.totalRiskScore) ? stateMeta.totalRiskScore : STRATEGY_STATE_DEFAULT_SCORE;
  stateScore += scoreBumpFromRules(stateMeta.recent3dDelta, STRATEGY_STATE_SCORE_BUMPS.recent3dDelta);
  stateScore += scoreBumpFromRules(stateMeta.resonanceCount, STRATEGY_STATE_SCORE_BUMPS.resonanceCount);
  stateScore += scoreBumpFromRules(stateMeta.severeResonanceCount, STRATEGY_STATE_SCORE_BUMPS.severeResonanceCount);
  stateScore += scoreBumpFromRules(stateMeta.extremeThresholdCount, STRATEGY_STATE_SCORE_BUMPS.extremeThresholdCount);
  stateScore += scoreBumpFromRules(stateMeta.highRiskStreakDays, STRATEGY_STATE_SCORE_BUMPS.highRiskStreakDays);
  stateScore += STRATEGY_STATE_SCORE_BUMPS.healthLevel[stateMeta.healthLevel] ?? 0;
  stateScore += STRATEGY_STATE_SCORE_BUMPS.executionLevel[executionLevel] ?? 0;
  if (metadata.realtimeFallbackUsed) stateScore += STRATEGY_STATE_SCORE_BUMPS.realtimeFallbackUsed;

  const bumpFromPipeline = Number(data?.decisionModel?.structuralScoreBump);
  if (Number.isFinite(bumpFromPipeline)) {
    stateScore += bumpFromPipeline;
  }

  stateScore = clampNumber(Math.round(stateScore), 0, 100);
  const strategyState = deriveStrategyState(stateScore);
  const structuralDriverReason = stateMeta.structuralSignalCount
    ? `结构信号激活：${stateMeta.structuralSignalLabels.join('、')}。`
    : (stateMeta.allStructuralSourcesMissing ? '结构信号数据源全部不可用，门控已降级。' : '当前无结构信号激活。');

  const stateDrivers = [
    {
      key: 'total-risk',
      label: '总风险分数',
      impact: strategyState,
      reason: `当前总风险分数为 ${stateMeta.totalRiskScore ?? '--'}。`
    },
    {
      key: 'three-day-speed',
      label: '3日变化速度',
      impact: stateMeta.recent3dDelta > 0 ? '恶化中' : stateMeta.recent3dDelta < 0 ? '缓解中' : '平稳',
      reason: `近3日变化为 ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta}（每日 ${stateMeta.recent3dSpeed}）。`
    },
    {
      key: 'module-resonance',
      label: '模块共振',
      impact: stateMeta.resonanceCount >= 3 ? '广泛共振' : stateMeta.resonanceCount >= 2 ? '局部共振' : '未共振',
      reason: `${stateMeta.resonanceCount} 个模块分数达到或超过 70，其中 ${stateMeta.severeResonanceCount} 个达到或超过 80。`
    },
    {
      key: 'extreme-thresholds',
      label: '极端阈值',
      impact: stateMeta.extremeThresholdCount > 0 ? '已触发' : '未触发',
      reason: stateMeta.extremeThresholdCount
        ? `已触发：${stateMeta.extremeThresholds.join('、')}。`
        : '当前无极端阈值触发。'
    },
    {
      key: 'high-risk-streak',
      label: '高风险持续性',
      impact: stateMeta.highRiskStreakDays >= 3 ? '持续中' : '未持续',
      reason: `高风险连续天数：${stateMeta.highRiskStreakDays} 天；风险偏高连续天数：${stateMeta.elevatedRiskStreakDays} 天。`
    },
    {
      key: 'structural-signals',
      label: '结构信号',
      impact: stateMeta.structuralSignalCount > 0 ? '已激活' : (stateMeta.allStructuralSourcesMissing ? '数据源不可用' : '未激活'),
      reason: structuralDriverReason
    }
  ];

  const stateReason = [
    `策略状态判定为 ${({ Defensive: '防守(Defensive)', Caution: '谨慎(Caution)', Crisis: '危机(Crisis)', Neutral: '中性(Neutral)', Offensive: '进攻(Offensive)' })[strategyState] || strategyState}，状态分数 ${stateScore}。`,
    `总风险 ${stateMeta.totalRiskScore ?? '--'}，3日变化 ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta}，共振模块数 ${stateMeta.resonanceCount}。`,
    stateMeta.extremeThresholdCount
      ? `极端阈值已触发：${stateMeta.extremeThresholds.join('、')}。`
      : '当前无极端阈值触发。',
    structuralDriverReason
  ].join(' ');

  return { strategyState, stateLabel: getStrategyStateLabel(strategyState, stateScore), stateScore, stateReason, stateDrivers, stateMeta };
}

export function deriveDecisionState(data, history, metadata, healthDashboard) {
  // v27 修正：pipeline 已写入则优先采用，不再重算
  const pm = readPipelineDecision(data);
  if (pm) {
    const stateMeta = buildStrategyStateMeta(data, history, metadata, healthDashboard);
    return {
      strategyState: pm.strategyState,
      stateLabel: pm.stateLabel || getStrategyStateLabel(pm.strategyState, pm.stateScore),
      stateScore: Number.isFinite(pm.stateScore) ? pm.stateScore : (Number.isFinite(data?.score) ? data.score : 55),
      stateReason: pm.stateReason,
      stateDrivers: Array.isArray(pm.stateDrivers) && pm.stateDrivers.length ? pm.stateDrivers : [],
      stateMeta: { ...stateMeta, ...(pm.stateMeta || {}) }
    };
  }
  try {
    return calculateStrategyStateEngine(data, history, metadata, healthDashboard);
  } catch (error) {
    console.warn('Strategy state engine failed, using fallback.', error);
    return buildStrategyStateFallback(data, metadata);
  }
}

export function buildDominantDrivers(data, metadata) {
  // v27 修正：pipeline 已写入则优先复用
  const pm = readPipelineDecision(data);
  if (pm && Array.isArray(pm.dominantDrivers) && pm.dominantDrivers.length) {
    return pm.dominantDrivers.slice(0, 4);
  }
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
      reason: `${item.label} 分数 ${item.score}，趋势${item.trend > 0 ? '上升' : item.trend < 0 ? '缓解' : '平稳'}。`
    }));
  if (metadata.realtimeFallbackUsed) {
    moduleEntries.push({
      key: 'realtime-fallback',
      label: '实时回退',
      score: metadata.realtimeHealthScore ?? null,
      trend: 0,
      reason: '实时数据回退/本地模式已启用，决策置信度受限。'
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
        riskAssetBias: '在风险预算内超配',
        defensiveBias: '低',
        cashGuidance: '保持较轻现金缓冲（10%-18%）',
        newExposurePolicy: '允许正常分批加仓。',
        rebalancePosture: '逢回调向目标风险区间靠拢。',
        leveragePolicy: '避免激进杠杆；仅保留已有基础融资安排。',
        hedgePosture: '仅保留轻量战略对冲。'
      },
      Balanced: {
        totalExposureBand: '50%-70%',
        riskAssetBias: '中性至选择性配置',
        defensiveBias: '中等',
        cashGuidance: '保持均衡现金缓冲（15%-25%）',
        newExposurePolicy: '允许选择性加仓，但控制节奏。',
        rebalancePosture: '围绕目标再平衡，不追高。',
        leveragePolicy: '不新增杠杆。',
        hedgePosture: '维持基础对冲仓位。'
      },
      Caution: {
        totalExposureBand: '35%-55%',
        riskAssetBias: '选择性低配',
        defensiveBias: '中高',
        cashGuidance: '提高现金缓冲（20%-32%）',
        newExposurePolicy: '仅允许高度选择性小幅加仓。',
        rebalancePosture: '先减风险，再做再平衡。',
        leveragePolicy: '尽量降低杠杆；不新增杠杆。',
        hedgePosture: '保持对冲有效，偏向保护性配置。'
      },
      Defensive: {
        totalExposureBand: '20%-40%',
        riskAssetBias: '低配风险资产',
        defensiveBias: '高',
        cashGuidance: '维持较高现金缓冲（30%-45%）',
        newExposurePolicy: '暂停新增风险敞口；仅允许防守型再平衡。',
        rebalancePosture: '优先降风险并恢复缓冲仓位。',
        leveragePolicy: '不扩大杠杆；优先降杠杆。',
        hedgePosture: '维持防守型对冲与流动性缓冲。'
      },
      Crisis: {
        totalExposureBand: '0%-20%',
        riskAssetBias: '最低风险敞口',
        defensiveBias: '最高',
        cashGuidance: '维持最大现金/流动性缓冲（45%-70%）',
        newExposurePolicy: '暂停新增高风险敞口，直至状态恢复正常。',
        rebalancePosture: '资本保全优先。',
        leveragePolicy: '零杠杆；主动压缩总敞口。',
        hedgePosture: '保持最强防守姿态。'
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

    const pipelineShift = Number(data?.decisionModel?.positionGuidance?.structuralBandShift);
    if (Number.isFinite(pipelineShift)) {
      bandShift += pipelineShift;
    }

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
      guidance.riskAssetBias = strategyState === 'Crisis' ? '最低风险敞口' : '进一步压缩风险资产敞口';
      guidance.defensiveBias = strategyState === 'Risk-On' ? '中等' : '极高';
    } else if (bandShift >= 5) {
      guidance.riskAssetBias = strategyState === 'Risk-On' ? '在风险预算内积极配置' : '选择性配置，环境改善中';
      guidance.defensiveBias = strategyState === 'Defensive' ? '高但趋于稳定' : '中等';
    }

    const structuralLabels = stateMeta.structuralSignalLabels || [];
    if (structuralLabels.length) {
      const structSuffix = ` 结构性约束：${structuralLabels.join('、')}，仓位需额外保守。`;
      guidance.cashGuidance = `${guidance.cashGuidance}${structSuffix}`;
      guidance.newExposurePolicy = `${guidance.newExposurePolicy}${structSuffix}`;
    } else if (stateMeta.allStructuralSourcesMissing) {
      const missingSuffix = '（结构信号数据源不可用，结构门控已降级）';
      guidance.cashGuidance = `${guidance.cashGuidance}${missingSuffix}`;
    }

    return {
      ...guidance,
      stance: `${strategyState} 仓位指引`,
      riskBudget: positioning.riskBudget || '--',
      targetGrossExposure: positioning.targetGrossExposure || '--',
      cashBufferTarget: positioning.cashBufferTarget || '--',
      structuralBandShift: Number.isFinite(pipelineShift) ? pipelineShift : 0,
      adjustmentNotes: [
        `策略状态：${strategyState}（${decisionState?.stateLabel || '未标注'}）。`,
        `状态分数：${stateScore}。`,
        `3日变化：${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta || 0}；共振模块数：${stateMeta.resonanceCount || 0}。`,
        structuralLabels.length
          ? `结构信号：${structuralLabels.join('、')}。`
          : (stateMeta.allStructuralSourcesMissing ? '结构信号数据源全部不可用。' : '无结构信号激活。'),
        driverLabels.length ? `主导驱动因子：${driverLabels.join('、')}。` : '主导驱动因子不可用。'
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
    const healthLevel = stateMeta.healthLevel || '未知';
    const topDrivers = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色');
    const yellowAlerts = warningAlerts.filter((alert) => alert?.level !== '红色');
    const priorityActions = [];
    const watchItems = [];
    const blockedActions = [];
    const byState = {
      'Risk-On': {
        priority: ['仅允许分批新增风险敞口。', '将总敞口控制在当前目标区间内。', '再平衡时不追短期波动。'],
        blocked: ['避免超出基础水平扩大杠杆。', '未经确认前避免提高集中度。']
      },
      Balanced: {
        priority: ['保持敞口节奏的控制性与选择性。', '向目标区间中值再平衡。', '维持基础防守缓冲仓位。'],
        blocked: ['避免单次大幅调整敞口。', '未经确认前避免扩大杠杆。']
      },
      Caution: {
        priority: ['逐步压缩整体风险敞口。', '新增敞口须高度选择性且幅度小。', '将现金缓冲提升至指引区间。'],
        blocked: ['暂停激进新增风险敞口。', '避免扩大杠杆。', '高风险环境下避免提高集中度。']
      },
      Defensive: {
        priority: ['逐步压缩整体风险敞口。', '提高现金缓冲，将敞口控制在区间下沿。', '仅允许防守型再平衡。'],
        blocked: ['暂停激进新增风险敞口。', '避免扩大杠杆。', '高风险环境下避免提高集中度。']
      },
      Crisis: {
        priority: ['资本保全与流动性恢复优先。', '将整体风险敞口压缩至最低水平。', '仅保留防守型再平衡与对冲维护。'],
        blocked: ['暂停新增高风险敞口。', '避免使用或扩大杠杆。', '危机环境下避免提高集中度。']
      }
    };
    priorityActions.push(...(byState[strategyState]?.priority || byState.Caution.priority));
    blockedActions.push(...(byState[strategyState]?.blocked || byState.Caution.blocked));
    if ((stateMeta.extremeThresholdCount || 0) >= 2) {
      priorityActions.push('极端阈值未解除前，收紧执行节奏。');
      blockedActions.push('极端阈值有效期间，避免主观扩大风险。');
    }
    if ((stateMeta.recent3dDelta || 0) >= 8) {
      priorityActions.push('短期压力上升时，加快降风险节奏。');
      watchItems.push('关注3日风险是否进一步加速。');
    } else if ((stateMeta.recent3dDelta || 0) <= -8) {
      watchItems.push('近期缓解趋势持续后，再考虑放松防守姿态。');
    }
    if ((stateMeta.highRiskStreakDays || 0) >= 5) {
      priorityActions.push('高风险连续态势解除前，维持防守缓冲。');
    }
    if (metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly || healthLevel === '仅基线' || healthLevel === '已过期') {
      watchItems.push('数据质量与新鲜度恢复前，不放松管控。');
      blockedActions.push('避免仅凭降级或回退数据扩大风险。');
    }
    if ((positionGuidance?.newExposurePolicy || '').includes('暂停') || strategyState === 'Crisis') {
      blockedActions.push('暂停大范围新增风险敞口。');
    }
    if ((positionGuidance?.leveragePolicy || '').includes('零杠杆') || (positionGuidance?.leveragePolicy || '').includes('不新增')) {
      blockedActions.push('避免扩大杠杆。');
    }
    topDrivers.forEach((driver) => { watchItems.push(`监控 ${driver} 压力的升级或缓解情况。`); });
    criticalAlerts.slice(0, 2).forEach((alert) => { priorityActions.push(`立即响应 ${alert.title || '关键预警'}。`); });
    yellowAlerts.slice(0, 2).forEach((alert) => { watchItems.push(`关注 ${alert.title || '预警信号'} 是否恶化。`); });
    (Array.isArray(triggerPanel.watchlist) ? triggerPanel.watchlist : []).slice(0, 3).forEach((item) => { watchItems.push(`持续关注 ${item}。`); });
    (Array.isArray(triggerPanel.critical) ? triggerPanel.critical : []).slice(0, 2).forEach((item) => { watchItems.push(`追踪关键触发器 ${item}。`); });
    if (Array.isArray(riskControl.hardThresholds) && riskControl.hardThresholds.length) {
      watchItems.push('监控硬阈值是否触发升级。');
    }

    const activeSignals = readActiveStructuralSignals(data);
    activeSignals.forEach((s) => {
      priorityActions.push(`关注结构信号：${s.label}（${s.detail}）。`);
      watchItems.push(`追踪 ${s.label} 是否进一步恶化或缓解。`);
    });
    if (stateMeta.allStructuralSourcesMissing) {
      watchItems.push('结构信号数据源不可用，待恢复后重新评估结构门控。');
    }
    if (data?.tradingSystem?.executionLock?.structurallyTriggered) {
      blockedActions.push('结构信号触发的锁定期间，禁止主观覆盖系统判断。');
    }

    const queue = {
      priorityActions: uniqTexts(priorityActions).slice(0, 8),
      watchItems: uniqTexts(watchItems).slice(0, 8),
      blockedActions: uniqTexts(blockedActions).slice(0, 6),
      actionSummary: `${strategyState} 动作队列已与 ${positionGuidance?.totalExposureBand || '当前'} 敞口指引对齐。`,
      escalationHint: (stateMeta.extremeThresholdCount || 0) > 0
        ? '若极端阈值扩大或关键预警增加，立即升级防守。'
        : '若波动率、利差压力或数据质量恶化，应升级防守。',
      executionNotes: uniqTexts([
        `状态分数 ${stateScore}；敞口区间 ${positionGuidance?.totalExposureBand || '--'}。`,
        `现金指引：${positionGuidance?.cashGuidance || '--'}。`,
        topDrivers.length ? `主导因子：${topDrivers.join('、')}。` : '',
        healthLevel ? `健康状态：${healthLevel}。` : '',
        activeSignals.length ? `结构信号：${activeSignals.map(s => s.label).join('、')}。` : ''
      ]).slice(0, 5)
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
    const dominantLabels = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色').length;

    const md = data?.macroDrivers || {};
    const activeSignals = readActiveStructuralSignals(data);

    const upgradeTriggers = uniqTexts([
      '若状态分数从当前区间上升 8 点或以上，应升级。',
      '若3日变化转正并超过 +6，应升级。',
      '若共振扩大到 4 个或以上模块超过 70，应升级。',
      '若严重共振上升到 3 个或以上模块超过 80，应升级。',
      '若红色预警增加或出现新关键预警，应升级。',
      '若流动性/波动率/融资压力重新加速，应升级。',
      metadata.realtimeCacheOnly ? '若缓存模式持续到下一周期，应升级。' : '',
      metadata.realtimeFreshnessLevel === 'stale' || metadata.realtimeUnavailable ? '若过期/仅基线数据持续无法恢复，应升级。' : '',
      '若曲线倒挂扩大至 -0.8 以下且投资级信用利差达到 2.0% 以上，触发结构性红灯。',
      '若逆回购余额跌破 500 亿美元临界值，触发结构性红灯。',
      '若投资级信用利差突破 1.5% 应力阈值，触发结构性黄灯。',
      '若曲线深度倒挂叠加美联储快速缩表，触发结构性黄灯。'
    ]).slice(0, 12);

    const activeEscalationSignals = uniqTexts([
      stateScore >= 85 ? `状态分数 ${stateScore} 已接近危机升级区间。` : '',
      (stateMeta.recent3dDelta || 0) >= 6 ? `3日恶化信号已激活，变化 +${stateMeta.recent3dDelta}。` : '',
      (stateMeta.resonanceCount || 0) >= 4 ? `广泛共振已激活：${stateMeta.resonanceCount} 个模块超过 70。` : '',
      (stateMeta.severeResonanceCount || 0) >= 2 ? `严重共振已激活：${stateMeta.severeResonanceCount} 个模块超过 80。` : '',
      criticalAlerts > 0 ? `${criticalAlerts} 条红色预警激活中。` : '',
      metadata.realtimeCacheOnly ? '缓存模式已激活。' : '',
      metadata.realtimeUnavailable ? '实时数据不可用 / 仅基线模式。' : '',
      metadata.realtimeFreshnessLevel === 'stale' ? '实时数据新鲜度已过期。' : '',
      dominantLabels.length ? `主导压力驱动因子：${dominantLabels.join('、')}。` : '',
      Array.isArray(triggerPanel.critical) && triggerPanel.critical.length ? `关键触发器面板已激活：${triggerPanel.critical.slice(0, 2).join('、')}。` : '',
      ...activeSignals.map((s) => `${s.label}：${s.detail}${s.reliability === 'fallback' ? '（回退数据）' : ''}。`),
      stateMeta.allStructuralSourcesMissing ? '结构信号数据源全部不可用，结构门控已降级。' : ''
    ]).slice(0, 10);

    let escalationLevel = '中';
    if (stateScore >= 85 || (stateMeta.extremeThresholdCount || 0) >= 3 || criticalAlerts >= 2) escalationLevel = '严重';
    else if (stateScore >= 68 || (stateMeta.extremeThresholdCount || 0) >= 1 || criticalAlerts >= 1) escalationLevel = '高';
    if (md?.gatingEvaluation?.structuralRed) escalationLevel = '严重';
    else if (md?.gatingEvaluation?.structuralYellow && escalationLevel === '中') escalationLevel = '高';

    return {
      upgradeTriggers,
      activeEscalationSignals,
      triggerSummary: `${strategyState} 触发监控正在观察分数、共振、预警、数据质量与结构信号升级路径。`,
      escalationLevel,
      signalConfidence: metadata.realtimeUnavailable ? '中' : metadata.realtimeCacheOnly ? '中' : '高'
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
    const invalidationSignals = uniqTexts([
      '若总风险分数再上升 8 点，当前防守判断应视为失效。',
      '若3日趋势停止缓解并重新超过 +3，当前判断应视为失效。',
      '若共振广度再次扩大，当前判断应视为失效。',
      '若红色预警增加，当前判断应视为失效。',
      metadata.realtimeCacheOnly ? '若缓存模式持续且压力信号仍高，当前判断应视为失效。' : '',
      metadata.realtimeUnavailable ? '若仅基线模式持续且预警恶化，当前判断应视为失效。' : '',
      '若曲线倒挂进一步加深或投资级信用利差突破新高，当前判断应视为失效。',
      '若逆回购余额继续下滑至临界水平，当前判断应视为失效。'
    ]).slice(0, 8);
    const resetConditions = uniqTexts([
      '总风险分数下降并保持较低水平后，方可降级。',
      '3日趋势转平或转负后，方可降级。',
      '共振模块数降至 3 以下后，方可降级。',
      '严重共振缓解至 2 以下后，方可降级。',
      '红色预警消除且数据新鲜度恢复正常后，方可降级。',
      '曲线回到 0 以上且投资级信用利差 < 1.2%：方可解除结构性约束。',
      '逆回购余额回到 3000 亿美元以上：方可解除逆回购告急门控。',
      ...(Array.isArray(riskControl.resetThresholds) ? riskControl.resetThresholds.slice(0, 3).map((rule) => `复位参考：${rule}`) : [])
    ]).slice(0, 9);
    let deescalationBias = '中等';
    if ((stateMeta.recent3dDelta || 0) <= -8 && (stateMeta.resonanceCount || 0) <= 2 && (stateMeta.criticalAlertCount || 0) === 0 && (stateMeta.structuralSignalCount || 0) === 0) {
      deescalationBias = '改善中';
    } else if (metadata.realtimeUnavailable || metadata.realtimeCacheOnly || (stateMeta.extremeThresholdCount || 0) > 0 || (stateMeta.structuralSignalCount || 0) > 0) {
      deescalationBias = '低';
    }
    return {
      invalidationSignals,
      resetConditions,
      invalidationSummary: `${strategyState} 失效规则要求：分数压力降低、共振收窄、预警消除、数据质量改善、结构信号解除后，方可放松防守。`,
      deescalationBias,
      signalConfidence: metadata.realtimeUnavailable ? '中' : metadata.realtimeCacheOnly ? '中' : '高'
    };
  } catch (error) {
    console.warn('Invalidation rules engine failed, using fallback.', error);
    return buildInvalidationRulesFallback(data, metadata, decisionState?.strategyState);
  }
}

// ============================================================
// v27 新增辅助：以 pipeline 输出为基线的补齐函数
// ============================================================

function mergePositionGuidanceFromPipeline(data, metadata, decisionState, dominantDrivers) {
  const pm = readPipelineDecision(data);
  const pipelinePg = pm?.positionGuidance;
  const positioning = data?.tradingSystem?.positioning || {};

  // 优先使用 pipeline 已写入的 positionGuidance 字段作为 source of truth
  if (pipelinePg && typeof pipelinePg === 'object') {
    const engineSupplement = (() => {
      try {
        return buildPositionGuidanceEngine(data, metadata, decisionState, dominantDrivers);
      } catch (_e) {
        return buildPositionGuidanceFallback(data, metadata, decisionState?.strategyState);
      }
    })();
    const stateMeta = decisionState?.stateMeta || {};
    const structuralLabels = stateMeta.structuralSignalLabels || [];
    const driverLabels = Array.isArray(dominantDrivers)
      ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean)
      : [];
    const adjustmentNotes = [
      `策略状态：${decisionState?.strategyState || '--'}（${decisionState?.stateLabel || '未标注'}）。`,
      Number.isFinite(decisionState?.stateScore) ? `状态分数：${decisionState.stateScore}。` : '',
      Number.isFinite(pipelinePg.structuralBandShift) ? `结构信号仓位修正：${pipelinePg.structuralBandShift}。` : '',
      structuralLabels.length
        ? `结构信号：${structuralLabels.join('、')}。`
        : (stateMeta.allStructuralSourcesMissing ? '结构信号数据源全部不可用。' : ''),
      driverLabels.length ? `主导驱动因子：${driverLabels.join('、')}。` : ''
    ].filter(Boolean);

    return {
      // pipeline 优先
      totalExposureBand: pipelinePg.totalExposureBand || engineSupplement.totalExposureBand || '--',
      riskAssetBias: pipelinePg.riskAssetBias || engineSupplement.riskAssetBias || '--',
      cashGuidance: pipelinePg.cashGuidance || engineSupplement.cashGuidance || '--',
      newExposurePolicy: pipelinePg.newExposurePolicy || engineSupplement.newExposurePolicy || '--',
      targetGrossExposure: pipelinePg.targetGrossExposure || engineSupplement.targetGrossExposure || positioning.targetGrossExposure || '--',
      cashBufferTarget: pipelinePg.cashBufferTarget || engineSupplement.cashBufferTarget || positioning.cashBufferTarget || '--',
      riskBudget: pipelinePg.riskBudget || engineSupplement.riskBudget || positioning.riskBudget || clampPercent(data?.score),
      structuralBandShift: Number.isFinite(pipelinePg.structuralBandShift) ? pipelinePg.structuralBandShift : (engineSupplement.structuralBandShift ?? 0),
      // decision.js 仅作为补充的字段
      defensiveBias: engineSupplement.defensiveBias || '中等',
      rebalancePosture: engineSupplement.rebalancePosture || '围绕目标区间逐步再平衡。',
      leveragePolicy: engineSupplement.leveragePolicy || '不新增杠杆。',
      hedgePosture: engineSupplement.hedgePosture || '保持基础对冲仓位有效。',
      stance: `${decisionState?.strategyState || 'Caution'} 仓位指引`,
      adjustmentNotes
    };
  }
  // pipeline 未写入 → decision.js engine 自算
  try {
    return buildPositionGuidanceEngine(data, metadata, decisionState, dominantDrivers);
  } catch (_e) {
    return buildPositionGuidanceFallback(data, metadata, decisionState?.strategyState);
  }
}

function mergeActionQueueFromPipeline(data, metadata, decisionState, positionGuidance, dominantDrivers) {
  const pm = readPipelineDecision(data);
  const pipelineAq = pm?.actionQueue;

  if (pipelineAq && typeof pipelineAq === 'object') {
    // pipeline 写了则以 pipeline 为主，只补齐缺失字段和 items flatten
    const priorityActions = Array.isArray(pipelineAq.priorityActions) ? [...pipelineAq.priorityActions] : [];
    const watchItems = Array.isArray(pipelineAq.watchItems) ? [...pipelineAq.watchItems] : [];
    const blockedActions = Array.isArray(pipelineAq.blockedActions) ? [...pipelineAq.blockedActions] : [];

    // 若 pipeline 的某个桶为空，则从 engine 兜底补齐一次
    if (!priorityActions.length || !watchItems.length || !blockedActions.length) {
      try {
        const engineQueue = buildActionQueueEngine(data, metadata, decisionState, positionGuidance, dominantDrivers);
        if (!priorityActions.length) priorityActions.push(...(engineQueue.priorityActions || []));
        if (!watchItems.length) watchItems.push(...(engineQueue.watchItems || []));
        if (!blockedActions.length) blockedActions.push(...(engineQueue.blockedActions || []));
      } catch (_e) {
        const fb = buildActionQueueFallback(data, metadata, decisionState?.strategyState);
        if (!priorityActions.length) priorityActions.push(...(fb.priorityActions || []));
        if (!watchItems.length) watchItems.push(...(fb.watchItems || []));
        if (!blockedActions.length) blockedActions.push(...(fb.blockedActions || []));
      }
    }

    const queue = {
      priorityActions: uniqTexts(priorityActions).slice(0, 10),
      watchItems: uniqTexts(watchItems).slice(0, 10),
      blockedActions: uniqTexts(blockedActions).slice(0, 8),
      actionSummary: pipelineAq.actionSummary
        || `${decisionState?.strategyState || 'Caution'} 动作队列已与 ${positionGuidance?.totalExposureBand || '当前'} 敞口指引对齐。`,
      escalationHint: pipelineAq.escalationHint
        || '若波动率、利差压力或数据质量恶化，应升级防守。',
      executionNotes: Array.isArray(pipelineAq.executionNotes) && pipelineAq.executionNotes.length
        ? pipelineAq.executionNotes
        : uniqTexts([
          Number.isFinite(decisionState?.stateScore) ? `状态分数 ${decisionState.stateScore}；敞口区间 ${positionGuidance?.totalExposureBand || '--'}。` : '',
          `现金指引：${positionGuidance?.cashGuidance || '--'}。`
        ])
    };
    queue.items = flattenActionQueueItems(queue);
    return queue;
  }
  // pipeline 未写入 → decision.js engine 自算
  try {
    return buildActionQueueEngine(data, metadata, decisionState, positionGuidance, dominantDrivers);
  } catch (_e) {
    return buildActionQueueFallback(data, metadata, decisionState?.strategyState);
  }
}

function mergeTriggerMonitorFromPipeline(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  const pm = readPipelineDecision(data);
  const pipelineTm = pm?.triggerMonitor;

  // 若 pipeline 写了 upgradeTriggers 或 activeEscalationSignals，以 pipeline 为主
  if (pipelineTm && typeof pipelineTm === 'object'
    && (Array.isArray(pipelineTm.upgradeTriggers) || Array.isArray(pipelineTm.activeEscalationSignals))) {
    let engineTm = null;
    try {
      engineTm = buildTriggerMonitorEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers);
    } catch (_e) {
      engineTm = buildTriggerMonitorFallback(data, metadata, decisionState?.strategyState);
    }
    return {
      upgradeTriggers: Array.isArray(pipelineTm.upgradeTriggers) && pipelineTm.upgradeTriggers.length
        ? pipelineTm.upgradeTriggers
        : (engineTm.upgradeTriggers || []),
      activeEscalationSignals: Array.isArray(pipelineTm.activeEscalationSignals) && pipelineTm.activeEscalationSignals.length
        ? pipelineTm.activeEscalationSignals
        : (engineTm.activeEscalationSignals || []),
      triggerSummary: pipelineTm.triggerSummary || engineTm.triggerSummary
        || `${decisionState?.strategyState || 'Caution'} 触发监控已启用。`,
      escalationLevel: pipelineTm.escalationLevel || engineTm.escalationLevel || '中',
      signalConfidence: pipelineTm.signalConfidence || engineTm.signalConfidence || '中'
    };
  }
  try {
    return buildTriggerMonitorEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers);
  } catch (_e) {
    return buildTriggerMonitorFallback(data, metadata, decisionState?.strategyState);
  }
}

function mergeInvalidationRulesFromPipeline(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  const pm = readPipelineDecision(data);
  const pipelineIv = pm?.invalidationRules;

  if (pipelineIv && typeof pipelineIv === 'object'
    && (Array.isArray(pipelineIv.invalidationSignals) || Array.isArray(pipelineIv.resetConditions))) {
    let engineIv = null;
    try {
      engineIv = buildInvalidationRulesEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers);
    } catch (_e) {
      engineIv = buildInvalidationRulesFallback(data, metadata, decisionState?.strategyState);
    }
    return {
      invalidationSignals: Array.isArray(pipelineIv.invalidationSignals) && pipelineIv.invalidationSignals.length
        ? pipelineIv.invalidationSignals
        : (engineIv.invalidationSignals || []),
      resetConditions: Array.isArray(pipelineIv.resetConditions) && pipelineIv.resetConditions.length
        ? pipelineIv.resetConditions
        : (engineIv.resetConditions || []),
      invalidationSummary: pipelineIv.invalidationSummary || engineIv.invalidationSummary
        || `${decisionState?.strategyState || 'Caution'} 失效规则已启用。`,
      deescalationBias: pipelineIv.deescalationBias || engineIv.deescalationBias || '中等',
      signalConfidence: pipelineIv.signalConfidence || engineIv.signalConfidence || '中'
    };
  }
  try {
    return buildInvalidationRulesEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers);
  } catch (_e) {
    return buildInvalidationRulesFallback(data, metadata, decisionState?.strategyState);
  }
}

// ============================================================
// 主入口：pipeline 优先 → 补齐 → fallback 兜底
// ============================================================

export function buildDecisionModel(data, history, metadata, healthDashboard) {
  try {
    const state = deriveDecisionState(data, history, metadata, healthDashboard);
    const dominantDrivers = buildDominantDrivers(data, metadata);
    const position = data?.tradingSystem?.positioning || {};
    const actionLayer = data?.tradingSystem?.actionLayer || {};
    const executionLock = data?.tradingSystem?.executionLock || {};
    const driverLabels = dominantDrivers.map((item) => item.label).join('、') || '基线驱动因子';

    // v27 修正：pipeline 优先的字段合并
    const positionGuidance = mergePositionGuidanceFromPipeline(data, metadata, state, dominantDrivers);
    const actionQueue = mergeActionQueueFromPipeline(data, metadata, state, positionGuidance, dominantDrivers);
    const triggerMonitor = mergeTriggerMonitorFromPipeline(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);
    const invalidationRules = mergeInvalidationRulesFromPipeline(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);

    const pm = readPipelineDecision(data);
    const pipelineStructuralSignals = Array.isArray(pm?.structuralSignals) ? pm.structuralSignals : [];
    const pipelineStructuralScoreBump = Number.isFinite(pm?.structuralScoreBump) ? pm.structuralScoreBump : 0;
    const pipelineAllSourcesMissing = !!pm?.allStructuralSourcesMissing;

    return {
      contractVersion: pm?.contractVersion || 'v27.0',
      // pipeline 优先：strategyState / stateLabel / stateScore / stateReason
      strategyState: state.strategyState,
      stateLabel: state.stateLabel,
      stateReason: state.stateReason
        || `${executionLock.title || '当前交易系统状态'}；健康状态 ${healthDashboard?.overallLevel || '--'}；主导驱动因子：${driverLabels}。`,
      stateScore: state.stateScore,
      stateDrivers: state.stateDrivers || [],
      stateMeta: state.stateMeta || {},
      structuralSignals: pipelineStructuralSignals.length
        ? pipelineStructuralSignals
        : readActiveStructuralSignals(data),
      structuralScoreBump: pipelineStructuralScoreBump,
      allStructuralSourcesMissing: pipelineAllSourcesMissing || (state.stateMeta?.allStructuralSourcesMissing ?? false),
      dominantDrivers: dominantDrivers.length ? dominantDrivers : createDecisionFallback(data, metadata).dominantDrivers,
      positionGuidance: {
        ...positionGuidance,
        riskBudget: positionGuidance.riskBudget || position.riskBudget || clampPercent(data?.score),
        targetGrossExposure: positionGuidance.targetGrossExposure || position.targetGrossExposure || '--',
        cashBufferTarget: positionGuidance.cashBufferTarget || position.cashBufferTarget || '--',
        notes: [
          executionLock.description || '遵循当前执行锁定指令。',
          `健康状态：${healthDashboard?.overallLevel || '--'}。`,
          `实时状态：${metadata?.realtimeStatusLabel || '未知'}。`,
          (state.stateMeta?.structuralSignalLabels?.length)
            ? `结构信号：${state.stateMeta.structuralSignalLabels.join('、')}。`
            : (state.stateMeta?.allStructuralSourcesMissing ? '结构信号数据源不可用，结构门控已降级。' : '')
        ].filter(Boolean)
      },
      actionQueue: {
        ...actionQueue,
        notes: [
          executionLock.description || '遵循当前执行锁定指令。',
          actionLayer.todayAction || '以动作队列为主要执行依据。',
          executionLock.structurallyTriggered ? '当前锁定由结构信号门控触发。' : ''
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
