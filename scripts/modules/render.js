import { $, fmtNumSafe, fmtSigned, trendClass, fmtDeltaSafe, deltaArrow } from './config.js';
import { buildRealtimeStatusLabel } from './freshness.js';
import { renderList } from './renderTables.js';

export {
  renderBars,
  renderHeatmap,
  renderLineChart,
  renderTransmission,
  wrapSvgText
} from './renderCharts.js';

export {
  renderActionLayer,
  renderAssetReturnMap,
  renderAssetTable,
  renderDiscipline,
  renderList,
  renderPositioning,
  renderRiskControl,
  renderWarningSystem
} from './renderTables.js';

export {
  renderScenarioTree
} from './renderAudit.js';

const MODULE_LABELS_CN = {
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
};

const STRATEGY_STATE_CN = {
  'Risk-On': '风险开启',
  'Balanced': '均衡',
  'Caution': '谨慎',
  'Defensive': '防守',
  'Crisis': '危机'
};

const FRESHNESS_CN = {
  fresh: '新鲜',
  aging: '老化中',
  stale: '已过期',
  unavailable: '不可用'
};

const BRENT_MOVE_STATUS_CN = {
  'no-previous': '首次确认',
  normal: '正常',
  'volatility-watch': '较大波动观察',
  'confirmed-extreme-move': '已确认极端波动',
  'unconfirmed-jump-hold': '未确认跳变，暂不采用新值'
};

function pickDisplayMetric(key, realtime, effectiveDisplayInputs = null) {
  const effectiveValue = Number(effectiveDisplayInputs?.[key]);
  if (Number.isFinite(effectiveValue)) return effectiveValue;
  const realtimeValue = Number(realtime?.values?.[key]);
  return Number.isFinite(realtimeValue) ? realtimeValue : null;
}

function includesSourceText(value, needle) {
  return typeof value === 'string' && value.toLowerCase().includes(needle);
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : null;
}

function buildBrentSourceLabel(realtime) {
  const validation = realtime?.brentValidation;
  if (!validation || typeof validation !== 'object') return '布伦特来源：实时源';

  const promotion = validation.promotion || {};
  const audit = validation.audit || {};
  const sourceText = [
    promotion.selectedSource,
    audit.selectedSource,
    realtime?.sourceDetails?.brent?.source
  ].filter(Boolean).join(' ');

  if (promotion.moveStatus === 'unconfirmed-jump-hold') {
    return '布伦特来源：上一轮确认值';
  }
  if (promotion.applied === true || (
    includesSourceText(sourceText, 'yahoo') &&
    includesSourceText(sourceText, 'tradingeconomics')
  )) {
    return '布伦特来源：FRED 滞后，Yahoo + Trading Economics 双源确认';
  }
  if (includesSourceText(sourceText, 'fred')) {
    return '布伦特来源：FRED 日度锚点';
  }
  return '布伦特来源：实时源';
}

function buildBrentMoveLabel(realtime) {
  const promotion = realtime?.brentValidation?.promotion || {};
  const statusLabel = BRENT_MOVE_STATUS_CN[promotion.moveStatus] || null;
  const changeLabel = formatPercent(promotion.promotedChangePct);
  if (!statusLabel && !changeLabel) return '波动状态：--';
  if (!changeLabel) return `波动状态：${statusLabel}`;
  if (!statusLabel) return `相邻周期变化：${changeLabel}`;
  return `波动状态：${statusLabel}；相邻周期变化：${changeLabel}`;
}

export function renderRealtimeStrip(realtime, metadata = null, effectiveDisplayInputs = null) {
  if (!realtime || !realtime.values) return;
  $('realtime-updated-at').textContent = realtime.asOf || realtime.updatedAt || '--';
  $('rt-brent').textContent = fmtNumSafe(pickDisplayMetric('brent', realtime, effectiveDisplayInputs), 1);
  $('rt-dxy').textContent = fmtNumSafe(pickDisplayMetric('dxy', realtime, effectiveDisplayInputs), 2);
  $('rt-vix').textContent = fmtNumSafe(pickDisplayMetric('vix', realtime, effectiveDisplayInputs), 2);
  $('rt-hy').textContent = fmtNumSafe(pickDisplayMetric('hyOas', realtime, effectiveDisplayInputs), 2);
  $('rt-us10y').textContent = fmtNumSafe(pickDisplayMetric('us10y', realtime, effectiveDisplayInputs), 2);
  $('rt-gold').textContent = fmtNumSafe(pickDisplayMetric('gold', realtime, effectiveDisplayInputs), 1);
  $('rt-spx').textContent = fmtNumSafe(pickDisplayMetric('spx', realtime, effectiveDisplayInputs), 0);
  $('rt-source-mode').textContent = realtime.degradedMode ? '部分回退' : '实时覆盖';
  if (metadata?.realtimeUnavailable) {
    $('rt-source-mode').textContent = '仅基线模式';
  } else if (metadata) {
    const rawLevel = metadata.realtimeFreshnessLevel || realtime.freshnessLevel || 'fresh';
    const modeParts = [FRESHNESS_CN[rawLevel] || rawLevel];
    if (metadata.realtimeDegraded) modeParts.push('降级');
    if (metadata.realtimeFallbackUsed) modeParts.push('本地回退');
    if (metadata.realtimeCacheOnly) modeParts.push('缓存模式');
    $('rt-source-mode').textContent = modeParts.join(' / ');
  }
  $('rt-brent-delta').textContent = fmtSigned(realtime.changes?.brent1d || 0);
  $('rt-brent-source').textContent = buildBrentSourceLabel(realtime);
  $('rt-brent-move').textContent = buildBrentMoveLabel(realtime);
  $('rt-dxy-delta').textContent = fmtSigned(realtime.changes?.dxy1d || 0);
  $('rt-vix-delta').textContent = fmtSigned(realtime.changes?.vix1d || 0);
  $('rt-hy-delta').textContent = fmtSigned(realtime.changes?.hyOas1d || 0);
  renderList('realtime-notes', realtime.notes || []);
}

export function renderHealthDashboard(model) {
  const badge = $('health-level-badge');
  badge.textContent = model.overallLevel;
  badge.className = `badge ${model.healthTone.badgeTone} ${model.healthTone.badgeClass}`;
  $('health-overall-level').textContent = model.overallLevel;
  $('health-score').textContent = model.healthScore ?? '--';
  $('health-freshness').textContent = FRESHNESS_CN[model.freshness] || model.freshness;
  $('health-age').textContent = model.ageLabel;
  const sourceMap = {
    'worker-generated-preview': 'Worker独立生成',
    'github-realtime-data': 'GitHub realtime-data',
    'remote': '远程',
    'local-fallback': '本地回退',
    'none': '无'
  };
  $('health-source').textContent = sourceMap[model.realtimeSource] || model.realtimeSource;
  $('health-flags').textContent = model.flagsLabel;
  $('health-critical-missing').textContent = model.criticalMissing;
  $('health-source-summary').textContent = model.sourceSummaryLabel;
  $('health-summary-text').textContent = model.summary;
  renderList('health-issues', model.issues);
  renderList('health-source-list', model.sourceLines);
}

export function getDecisionHeaderBadgeClass(strategyState) {
  switch (strategyState) {
    case 'Risk-On': return 'decision-badge-risk-on';
    case 'Balanced': return 'decision-badge-balanced';
    case 'Caution': return 'decision-badge-caution';
    case 'Defensive': return 'decision-badge-defensive';
    case 'Crisis': return 'decision-badge-crisis';
    default: return 'neutral';
  }
}

export function describeStateChange(stateMeta = {}) {
  const delta = Number(stateMeta.recent3dDelta);
  const extremeCount = Number(stateMeta.extremeThresholdCount) || 0;
  const highRiskStreakDays = Number(stateMeta.highRiskStreakDays) || 0;
  if (delta >= 8) return '近3日持续上升';
  if (delta >= 3) return '近3日趋于走强';
  if (delta <= -8) return extremeCount > 0 || highRiskStreakDays >= 3 ? '高位但趋于缓解' : '近3日持续缓解';
  if (delta <= -3) return '趋于稳定';
  if (extremeCount > 0) return '维持高位';
  return '当前区间内平稳';
}

function mapDriverLabel(label) {
  if (!label) return '主导风险因子';
  return MODULE_LABELS_CN[label] || STRATEGY_STATE_CN[label] || label;
}

export function buildDecisionHeaderModel(decisionModel = {}, data = {}) {
  const strategyState = decisionModel.strategyState || 'Caution';
  const stateLabel = decisionModel.stateLabel || strategyState;
  const stateScore = Number.isFinite(decisionModel.stateScore)
    ? decisionModel.stateScore
    : Number.isFinite(data?.score) ? data.score : '--';
  const exposureBand = decisionModel?.positionGuidance?.totalExposureBand || '--';
  const coreAction = decisionModel?.actionQueue?.priorityActions?.[0]
    || decisionModel?.positionGuidance?.newExposurePolicy
    || '保持风险调整的节奏性与选择性。';
  const rawSources = Array.isArray(decisionModel?.dominantDrivers) && decisionModel.dominantDrivers.length
    ? decisionModel.dominantDrivers.slice(0, 3).map((item) => item.label || item.key).filter(Boolean)
    : Array.isArray(decisionModel?.stateDrivers)
      ? decisionModel.stateDrivers.slice(0, 3).map((item) => item.label || item.key).filter(Boolean)
      : [];
  const dominantRiskSources = rawSources.length
    ? rawSources.map(mapDriverLabel)
    : ['主导风险驱动因子不可用'];

  return {
    stateBadge: strategyState,
    stateLabel,
    scoreLabel: stateScore,
    exposureBand,
    coreAction,
    stateChange: describeStateChange(decisionModel.stateMeta || {}),
    title: `${STRATEGY_STATE_CN[strategyState] || strategyState} 决策概览`,
    reason: decisionModel.stateReason || data?.decisionLine || '当前宏观环境正由 v27 决策模型汇总中。',
    escalationLabel: decisionModel?.triggerMonitor?.escalationLevel
      ? `升级风险：${decisionModel.triggerMonitor.escalationLevel}`
      : '升级监控中',
    cashGuidance: decisionModel?.positionGuidance?.cashGuidance || '维持基础现金纪律。',
    newExposurePolicy: decisionModel?.positionGuidance?.newExposurePolicy || '仅允许分批调整敞口。',
    dominantRiskSources
  };
}

export function renderDecisionHeader(model) {
  const badge = $('decision-header-state-badge');
  badge.textContent = STRATEGY_STATE_CN[model.stateBadge] || model.stateBadge;
  badge.className = `badge ${getDecisionHeaderBadgeClass(model.stateBadge)}`;

  $('decision-header-escalation').textContent = model.escalationLabel;
  $('decision-header-title').textContent = model.title;
  $('decision-header-reason').textContent = model.reason;
  $('decision-header-action').textContent = model.coreAction;

  const displayLabel = String(model.stateLabel).replace(
    /^(Risk-On|Balanced|Caution|Defensive|Crisis)/,
    (m) => STRATEGY_STATE_CN[m] || m
  );
  $('decision-header-state-label').textContent = displayLabel;

  $('decision-header-score').textContent = model.scoreLabel;
  $('decision-header-exposure').textContent = model.exposureBand;
  $('decision-header-change').textContent = model.stateChange;
  $('decision-header-cash').textContent = model.cashGuidance;
  $('decision-header-policy').textContent = model.newExposurePolicy;

  const drivers = $('decision-header-drivers');
  drivers.innerHTML = '';
  (model.dominantRiskSources || ['主导风险驱动因子不可用']).forEach((driver) => {
    const chip = document.createElement('span');
    chip.className = 'decision-driver-chip';
    chip.textContent = driver;
    drivers.appendChild(chip);
  });
}

export function renderExecutionLock(lock) {
  $('execution-lock-tag').textContent = lock.tag;
  $('execution-status-level').textContent = lock.levelLabel;
  $('execution-status-title').textContent = lock.title;
  $('execution-status-desc').textContent = lock.description;
  const pill = $('execution-status-level');
  pill.classList.remove('green', 'yellow', 'red');
  if (lock.level === 'green') pill.classList.add('green');
  else if (lock.level === 'yellow') pill.classList.add('yellow');
  else pill.classList.add('red');
  renderList('execution-allow', lock.allow || []);
  renderList('execution-block', lock.block || []);
  renderList('execution-mandatory', lock.mandatory || []);
}

export function renderSignalEngine(signal) {
  $('signal-strength').textContent = signal.strength;
  $('signal-direction').textContent = signal.direction;
  $('signal-consistency').textContent = signal.consistency;
  $('signal-macro').textContent = signal.macroSignal;
  $('signal-liquidity-chain').textContent = `${signal.liquiditySignal} / ${signal.chainSignal}`;
  renderList('signal-notes', signal.notes || []);
}

export function renderNonCriticalSection(label, renderFn) {
  try {
    renderFn();
  } catch (error) {
    console.warn(`Non-critical section render failed: ${label}`, error);
  }
}
