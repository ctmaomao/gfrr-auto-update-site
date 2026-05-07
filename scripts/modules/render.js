import { $, fmtNumSafe, fmtSigned, trendClass, fmtDeltaSafe, deltaArrow, riskColor } from './config.js?v=28.0H-5';
import { buildRealtimeStatusLabel } from './freshness.js?v=28.0H-5';
import { renderList } from './renderTables.js?v=28.0H-5';

export {
  renderBars,
  renderHeatmap,
  renderLineChart,
  renderTransmission,
  wrapSvgText
} from './renderCharts.js?v=28.0H-5';

export {
  renderActionLayer,
  renderAssetReturnMap,
  renderAssetTable,
  renderDiscipline,
  renderList,
  renderPositioning,
  renderRiskControl,
  renderWarningSystem
} from './renderTables.js?v=28.0H-5';

export {
  renderScenarioTree
} from './renderAudit.js?v=28.0H-5';

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

const WORLD_ORDER_STATE_CN = {
  normal_globalization: '全球化正常期',
  friction_rising: '摩擦升温期',
  bloc_fragmentation: '阵营化与脱钩期',
  multi_theater_stress: '多战区压力期',
  war_economy_stress: '战争经济压力期'
};

const WORLD_ORDER_STATE_COLOR = {
  normal_globalization: '#2fd38a',
  friction_rising: '#ffd46a',
  bloc_fragmentation: '#ffb15d',
  multi_theater_stress: '#ff5e72',
  war_economy_stress: '#9b1c31'
};

const WORLD_ORDER_DIMENSION_KEYS = [
  'peaceDividendRetreat',
  'blocFormation',
  'multiTheaterConflict',
  'economicWeaponization',
  'capitalControlRisk',
  'marketConfirmation'
];

const WORLD_ORDER_SOURCE_LABELS = {
  gdelt: 'GDELT',
  ofac: 'OFAC',
  sipri: 'SIPRI',
  acled: 'ACLED',
  market: 'market',
  system: 'system'
};

const WORLD_ORDER_SOURCE_STATUS_CN = {
  ok: '已更新',
  partial: '部分更新',
  stale: '使用缓存 / 数据偏旧',
  error: '数据源异常',
  manual_required: '慢变量 / 需要手动导入',
  not_configured: '未配置，使用 GDELT 代理冲突事件层',
  disabled: '未启用'
};

const WORLD_ORDER_EVIDENCE_DIRECTION_CN = {
  risk_up: '风险上升',
  up: '风险上升',
  risk_down: '风险下降',
  down: '风险下降',
  neutral: '中性',
  unknown: '方向待确认',
  mixed: '方向待确认'
};

function clampDisplayScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function safeText(value, fallback = '--') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function worldOrderStatusLabel(status) {
  return WORLD_ORDER_SOURCE_STATUS_CN[status] || '状态待确认';
}

function worldOrderSources(payload) {
  return payload?.externalSources && typeof payload.externalSources === 'object' ? payload.externalSources : {};
}

function worldOrderConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.round(Math.min(1, Math.max(0, normalized)) * 100);
}

function statusIs(status, expected) {
  return String(status || '').toLowerCase() === expected;
}

export function buildWorldOrderConfidenceExplanation(payload) {
  if (!payload || typeof payload !== 'object' || payload.unavailable === true) {
    return '置信度反映当前外部数据完整度、数据新鲜度和市场确认一致性。当前 World Order 数据暂不可用，结论只能作为低置信观察信号。';
  }

  const sources = worldOrderSources(payload);
  const parts = ['置信度反映当前外部数据完整度、数据新鲜度和市场确认一致性。'];
  const gdeltStatus = sources.gdelt?.status;
  const sipriStatus = sources.sipri?.status;
  const acledStatus = sources.acled?.status;
  const marketSource = payload.marketConfirmationInput?.source;

  if (statusIs(gdeltStatus, 'stale')) {
    parts.push('GDELT 当前使用缓存，事件密度信号偏旧。');
  } else if (statusIs(gdeltStatus, 'partial')) {
    parts.push('GDELT 部分更新，部分查询失败或受限。');
  } else if (statusIs(gdeltStatus, 'error')) {
    parts.push('GDELT 当前异常，冲突新闻密度信号受限。');
  }
  if (statusIs(sipriStatus, 'manual_required')) {
    parts.push('SIPRI 军费慢变量尚未导入，因此和平红利退潮维度置信度较低。');
  }
  if (statusIs(acledStatus, 'not_configured')) {
    parts.push('ACLED 未配置，冲突事件层当前由 GDELT 代理估算。');
  }
  if (marketSource === 'worker-generated-preview') {
    parts.push('市场确认使用 Worker 快变量。');
  } else if (marketSource === 'local-realtime') {
    parts.push('市场确认使用本地 realtime fallback，可能滞后。');
  } else if (marketSource === 'daily-baseline') {
    parts.push('市场确认使用 Daily baseline，可能滞后。');
  } else {
    parts.push('市场确认来源待确认。');
  }

  return parts.join('');
}

export function classifyWorldOrderDataQuality(payload) {
  if (!payload || typeof payload !== 'object' || payload.unavailable === true) {
    return { label: '受限', tone: 'red' };
  }
  const confidence = Number(payload.confidence);
  const sources = worldOrderSources(payload);
  const statuses = Object.values(sources).map((source) => source?.status).filter(Boolean);
  const hasUnavailable = statuses.some((status) => ['error', 'unavailable'].includes(String(status)));
  const hasLowConfidenceStatus = statuses.some((status) => ['stale', 'manual_required', 'not_configured'].includes(String(status)));
  const hasPartial = statuses.some((status) => status === 'partial');

  if (hasUnavailable) return { label: '受限', tone: 'red' };
  if (!Number.isFinite(confidence) || confidence < 0.5 || hasLowConfidenceStatus) return { label: '低', tone: 'yellow' };
  if (confidence >= 0.7 && !hasPartial && statuses.every((status) => ['ok', 'fresh'].includes(String(status)))) {
    return { label: '高', tone: 'green' };
  }
  return { label: '中', tone: 'neutral' };
}

export function buildWorldOrderLimitations(payload) {
  if (!payload || typeof payload !== 'object' || payload.unavailable === true) {
    return ['World Order 数据暂不可用，当前仅能显示保守 fallback。'];
  }
  const sources = worldOrderSources(payload);
  const limitations = [];
  if (statusIs(sources.gdelt?.status, 'stale')) {
    limitations.push('GDELT：当前使用缓存，冲突新闻密度可能滞后。');
  } else if (statusIs(sources.gdelt?.status, 'partial')) {
    limitations.push('GDELT：部分更新，部分查询失败或受限。');
  } else if (statusIs(sources.gdelt?.status, 'error')) {
    limitations.push('GDELT：当前异常，冲突新闻密度信号受限。');
  }
  if (statusIs(sources.sipri?.status, 'manual_required')) {
    limitations.push('SIPRI：尚未导入真实军费慢变量，和平红利退潮判断采用低置信代理。');
  }
  if (statusIs(sources.acled?.status, 'not_configured')) {
    limitations.push('ACLED：未配置 API，冲突事件层由 GDELT 代理估算。');
  }
  const marketSource = payload.marketConfirmationInput?.source;
  if (marketSource === 'local-realtime' || marketSource === 'daily-baseline') {
    limitations.push('市场确认：当前使用 fallback / baseline，可能滞后。');
  }
  limitations.push('ReliefWeb：当前环境访问受限，备用公开源仍在评估中，不参与评分。');
  return limitations.slice(0, 5);
}

function normalizeWorldOrderEvidenceSource(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('gdelt')) return 'gdelt';
  if (value.includes('ofac')) return 'ofac';
  if (value.includes('sipri')) return 'sipri';
  if (value.includes('acled')) return 'acled';
  if (value.includes('market')) return 'market';
  return 'system';
}

export function formatWorldOrderEvidence(evidence = {}) {
  const sourceKey = normalizeWorldOrderEvidenceSource(evidence.source);
  const confidence = worldOrderConfidencePercent(evidence.confidence);
  return {
    sourceLabel: WORLD_ORDER_SOURCE_LABELS[sourceKey] || 'system',
    directionLabel: WORLD_ORDER_EVIDENCE_DIRECTION_CN[evidence.direction] || '方向待确认',
    confidenceLabel: confidence === null ? '置信度待确认' : `置信度 ${confidence}%`,
    summary: safeText(evidence.summary, safeText(evidence.labelZh, '证据摘要待补充'))
  };
}

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

export function renderWorldOrderStressOverlay(payload) {
  const unavailable = !payload || typeof payload !== 'object' || payload.unavailable === true;
  const score = clampDisplayScore(payload?.score);
  const state = safeText(payload?.state, 'unavailable');
  const stateLabel = unavailable
    ? '世界秩序压力层数据暂不可用'
    : safeText(payload?.labelZh, WORLD_ORDER_STATE_CN[state] || '状态待确认');
  const stateColor = unavailable ? '#8a93a5' : WORLD_ORDER_STATE_COLOR[state] || riskColor(score);
  const marketConfirmation = payload?.dimensions?.marketConfirmation || {};
  const marketScore = clampDisplayScore(marketConfirmation.score);
  const marketStateMap = {
    not_confirmed: '未确认',
    weak: '弱确认',
    partial_confirmed: '部分确认',
    high_confirmed: '高度确认'
  };

  $('world-order-state').textContent = unavailable ? '数据暂不可用' : `${stateLabel} / ${state}`;
  $('world-order-state').style.color = stateColor;
  $('world-order-score').textContent = unavailable ? '--' : `${score}`;
  $('world-order-score-bar').style.width = `${score}%`;
  $('world-order-score-bar').style.background = stateColor;
  $('world-order-market-confirmation').textContent = unavailable
    ? '--'
    : `${marketStateMap[marketConfirmation.state] || '状态待确认'} / ${marketScore}`;
  const confidence = Number(payload?.confidence);
  $('world-order-confidence').textContent = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '--';
  const dataQuality = classifyWorldOrderDataQuality(payload);
  const dataQualityBadge = $('world-order-data-quality');
  dataQualityBadge.textContent = `数据质量：${dataQuality.label}`;
  dataQualityBadge.className = `metric-value small ${dataQuality.tone}`;
  $('world-order-confidence-explanation').textContent = buildWorldOrderConfidenceExplanation(payload);
  $('world-order-updated-at').textContent = safeText(payload?.updatedAt, '--');

  const driversRoot = $('world-order-dominant-drivers');
  driversRoot.innerHTML = '';
  const drivers = safeArray(payload?.dominantDrivers);
  if (unavailable || drivers.length === 0) {
    const item = document.createElement('span');
    item.className = 'badge neutral';
    item.textContent = unavailable ? '数据暂不可用' : '暂无主导驱动';
    driversRoot.appendChild(item);
  } else {
    drivers.forEach((driver) => {
      const item = document.createElement('span');
      item.className = 'badge neutral';
      item.textContent = `${safeText(driver.labelZh, '未命名驱动')} ${clampDisplayScore(driver.score)}`;
      driversRoot.appendChild(item);
    });
  }

  const dimensionsRoot = $('world-order-dimensions');
  dimensionsRoot.innerHTML = '';
  const dimensions = payload?.dimensions && typeof payload.dimensions === 'object' ? payload.dimensions : {};
  WORLD_ORDER_DIMENSION_KEYS.forEach((key) => {
    const dimension = dimensions[key] || {};
    const card = document.createElement('div');
    card.className = 'metric-box compact';
    const title = document.createElement('div');
    title.className = 'metric-label';
    title.textContent = safeText(dimension.labelZh, key);
    const value = document.createElement('div');
    value.className = 'metric-value';
    value.textContent = unavailable ? '--' : `${clampDisplayScore(dimension.score)}`;
    const meta = document.createElement('div');
    meta.className = 'mini-delta';
    meta.textContent = key === 'marketConfirmation'
      ? `状态：${marketStateMap[dimension.state] || '状态待确认'}`
      : `趋势：${safeText(dimension.trend, '状态待确认')}`;
    const evidenceList = document.createElement('ul');
    evidenceList.className = 'bullet-list';
    const evidenceItems = safeArray(dimension.evidence).slice(0, 2);
    if (evidenceItems.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = unavailable ? '数据暂不可用' : '暂无证据摘要';
      evidenceList.appendChild(empty);
    } else {
      evidenceItems.forEach((evidence) => {
        const formatted = formatWorldOrderEvidence(evidence);
        const li = document.createElement('li');
        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'badge neutral';
        sourceBadge.textContent = formatted.sourceLabel;
        const text = document.createElement('span');
        text.textContent = ` ${formatted.directionLabel} / ${formatted.confidenceLabel}：${formatted.summary}`;
        li.append(sourceBadge, text);
        evidenceList.appendChild(li);
      });
    }
    card.append(title, value, meta, evidenceList);
    dimensionsRoot.appendChild(card);
  });

  const sourceRoot = $('world-order-source-status');
  sourceRoot.innerHTML = '';
  const sources = payload?.externalSources && typeof payload.externalSources === 'object' ? payload.externalSources : {};
  Object.entries(WORLD_ORDER_SOURCE_LABELS).forEach(([key, label]) => {
    if (key === 'market' || key === 'system') return;
    const li = document.createElement('li');
    const status = sources[key]?.status;
    li.textContent = `${label}：${worldOrderStatusLabel(status)}`;
    sourceRoot.appendChild(li);
  });
  renderList('world-order-limitations', buildWorldOrderLimitations(payload));

  $('world-order-interpretation').textContent = unavailable
    ? '世界秩序压力层数据暂不可用。'
    : safeText(payload?.systemInterpretationZh, '世界秩序压力层数据已生成，但当前解读文本不足，建议结合数据源状态和维度评分观察。');
  const warnings = safeArray(payload?.warnings);
  const defaultWarnings = ['该模块用于结构性风险识别，不构成战争预测或投资建议。'];
  const limitationWarning = '当数据源状态为缓存、未配置或手动导入时，结论应按低置信观察信号处理。';
  renderList('world-order-warnings', [...(warnings.length ? warnings : defaultWarnings), limitationWarning]);
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
