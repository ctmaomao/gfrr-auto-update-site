import { $, fmtNumSafe, trendClass, fmtDeltaSafe, deltaArrow, riskColor } from './config.js?v=28.0M-82V';
import { buildRealtimeStatusLabel } from './freshness.js?v=28.0M-82V';
import { renderList } from './renderTables.js?v=28.0M-82V';

export {
  renderBars,
  renderHeatmap,
  renderLineChart,
  renderTransmission,
  wrapSvgText
} from './renderCharts.js?v=28.0M-82V';

export {
  renderActionLayer,
  renderAssetReturnMap,
  renderAssetTable,
  renderDiscipline,
  renderList,
  renderPositioning,
  renderRiskControl,
  renderWarningSystem
} from './renderTables.js?v=28.0M-82V';

export {
  renderScenarioTree
} from './renderAudit.js?v=28.0M-82V';

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

const FRED_SERIES_CN = {
  brent: 'DCOILBRENTEU',
  dxy: 'DTWEXBGS',
  vix: 'VIXCLS',
  hyOas: 'BAMLH0A0HYM2',
  us10y: 'DGS10',
  gold: 'XAU',
  spx: 'SP500'
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
  market: '市场确认',
  worker: 'Worker 快变量',
  system: '系统',
  reliefweb: 'ReliefWeb',
  unknown: '来源待确认'
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

const WORLD_ORDER_TREND_CN = {
  rising: '上升',
  falling: '下降',
  stable: '稳定',
  watch: '观察',
  watching: '观察',
  unknown: '待确认'
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

export function formatWorldOrderTrend(trend) {
  return WORLD_ORDER_TREND_CN[String(trend || '').toLowerCase()] || '待确认';
}

export function formatWorldOrderDirection(direction) {
  return WORLD_ORDER_EVIDENCE_DIRECTION_CN[String(direction || '').toLowerCase()] || '方向待确认';
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
  limitations.push('ReliefWeb：API 被 bot 封锁（HTTP 406），已列为 P3，不参与评分。');
  return limitations.slice(0, 5);
}

function pushUniqueSource(sources, key) {
  if (!sources.includes(key)) sources.push(key);
}

function extractWorldOrderEvidenceSources(evidence = {}) {
  const value = `${evidence.source || ''} ${evidence.summary || ''}`.toLowerCase();
  const sources = [];
  if (value.includes('gdelt')) pushUniqueSource(sources, 'gdelt');
  if (value.includes('ofac')) pushUniqueSource(sources, 'ofac');
  if (value.includes('sipri')) pushUniqueSource(sources, 'sipri');
  if (value.includes('acled')) pushUniqueSource(sources, 'acled');
  if (value.includes('worker')) pushUniqueSource(sources, 'worker');
  if (value.includes('market')) pushUniqueSource(sources, 'market');
  if (value.includes('reliefweb')) pushUniqueSource(sources, 'reliefweb');
  if (sources.length === 0) pushUniqueSource(sources, 'system');
  return sources.slice(0, 3);
}

export function formatWorldOrderSource(evidence = {}) {
  return extractWorldOrderEvidenceSources(evidence)
    .map((source) => WORLD_ORDER_SOURCE_LABELS[source] || WORLD_ORDER_SOURCE_LABELS.unknown)
    .join(' + ');
}

export function formatWorldOrderEvidence(evidence = {}) {
  const confidence = worldOrderConfidencePercent(evidence.confidence);
  return {
    sourceLabel: formatWorldOrderSource(evidence),
    directionLabel: formatWorldOrderDirection(evidence.direction),
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

function fmtDeltaWithUnit(delta, options = {}) {
  const { prefix = '', suffix = '', digits = 2 } = options;
  if (delta == null || !Number.isFinite(Number(delta))) return '--';
  const numeric = Number(delta);
  const sign = numeric >= 0 ? '+' : '';
  return `${sign}${prefix}${numeric.toFixed(digits)}${suffix}`;
}

function buildGenericSourceLabel(displayName, key, realtime) {
  const detail = realtime?.sourceDetails?.[key];
  const sourceValue = detail?.source || realtime?.sourceStatus?.[key];
  if (!sourceValue) return `${displayName}来源：--`;
  const source = String(sourceValue).toLowerCase();
  if (source.includes('fred')) {
    const seriesId = FRED_SERIES_CN[key] || '';
    return seriesId ? `${displayName}来源：FRED ${seriesId}` : `${displayName}来源：FRED`;
  }
  if (source.includes('yahoo')) return `${displayName}来源：Yahoo`;
  if (source.includes('stooq')) return `${displayName}来源：Stooq`;
  if (source.includes('gold-api') || source.includes('gold')) return `${displayName}来源：Gold API`;
  if (source.includes('worker')) return `${displayName}来源：Worker`;
  if (source.includes('trading')) return `${displayName}来源：TradingEconomics`;
  return `${displayName}来源：${sourceValue}`;
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
  $('rt-brent-delta').textContent = fmtDeltaWithUnit(realtime.changes?.brent1d, { prefix: '$', digits: 2 });
  $('rt-brent-source').textContent = buildBrentSourceLabel(realtime);
  $('rt-brent-move').textContent = buildBrentMoveLabel(realtime);
  $('rt-dxy-delta').textContent = fmtDeltaWithUnit(realtime.changes?.dxy1d, { digits: 2 });
  $('rt-dxy-source').textContent = buildGenericSourceLabel('广义美元指数', 'dxy', realtime);
  $('rt-vix-delta').textContent = fmtDeltaWithUnit(realtime.changes?.vix1d, { digits: 2 });
  $('rt-vix-source').textContent = buildGenericSourceLabel('VIX', 'vix', realtime);
  $('rt-hy-delta').textContent = fmtDeltaWithUnit(realtime.changes?.hyOas1d, { suffix: '%', digits: 2 });
  $('rt-hy-source').textContent = buildGenericSourceLabel('高收益利差', 'hyOas', realtime);
  $('rt-us10y-delta').textContent = fmtDeltaWithUnit(realtime.changes?.us10y1d, { suffix: '%', digits: 2 });
  $('rt-us10y-source').textContent = buildGenericSourceLabel('美债10Y', 'us10y', realtime);
  $('rt-gold-delta').textContent = fmtDeltaWithUnit(realtime.changes?.gold1d, { prefix: '$', digits: 1 });
  $('rt-gold-source').textContent = buildGenericSourceLabel('黄金', 'gold', realtime);
  $('rt-spx-delta').textContent = fmtDeltaWithUnit(realtime.changes?.spx1d, { suffix: ' 点', digits: 0 });
  $('rt-spx-source').textContent = buildGenericSourceLabel('标普500', 'spx', realtime);
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

function setTextIfPresent(id, text) {
  const node = $(id);
  if (node) node.textContent = safeText(text, '暂不足以判断');
}

function renderListIfPresent(id, items, fallback = '暂不足以判断') {
  const root = $(id);
  if (!root) return;
  root.innerHTML = '';
  const values = safeArray(items).filter((item) => typeof item === 'string' && item.trim()).slice(0, 5);
  const list = values.length ? values : [fallback];
  list.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    root.appendChild(li);
  });
}

function formatDailyBriefEvidence(evidence) {
  const label = safeText(evidence?.labelZh, '证据');
  const summary = safeText(evidence?.summaryZh, '暂不足以判断');
  return `${label}：${summary}`;
}

function renderDailyBriefFallback() {
  setTextIfPresent('daily-brief-state', 'Daily Brief 待生成');
  setTextIfPresent('daily-brief-one-line', 'Daily Brief 将在下一次 Daily 数据构建后显示。当前仍可参考下方决策概览、盘中快变量和风险模块。');
  setTextIfPresent('daily-brief-chain-title', '主导风险链待生成');
  setTextIfPresent('daily-brief-chain-stage', '阶段：暂不足以判断');
  setTextIfPresent('daily-brief-chain-summary', '暂不足以判断。');
  renderListIfPresent('daily-brief-chain-evidence', [], '数据不足，暂不从前端反推主导风险链。');
  setTextIfPresent('daily-brief-divergence-title', '最大背离待生成');
  setTextIfPresent('daily-brief-divergence-status', '状态：暂不足以判断');
  setTextIfPresent('daily-brief-divergence-summary', '暂不足以判断。');
  renderListIfPresent('daily-brief-divergence-evidence', [], '数据不足，暂不从前端反推最大背离。');
  renderListIfPresent('daily-brief-triggers', [], '等待下一次 Daily 数据构建生成关键触发器。');
  renderListIfPresent('daily-brief-invalidations', [], '等待下一次 Daily 数据构建生成反证条件。');
  renderListIfPresent('daily-brief-data-gaps', [], 'Daily Brief 数据结构尚未出现在当前 baseline。');
  setTextIfPresent('daily-brief-confidence', '置信度：待确认');
  setTextIfPresent('daily-brief-boundary', '该区域仅为解释层展示，不参与评分、仓位、执行灯或交易建议。');
}

export function renderDailyBrief(dailyBrief) {
  if (!dailyBrief || typeof dailyBrief !== 'object' || dailyBrief.contractVersion !== 'v28.0I-1') {
    renderDailyBriefFallback();
    return;
  }

  setTextIfPresent('daily-brief-state', dailyBrief.macroState);
  setTextIfPresent('daily-brief-one-line', dailyBrief.oneLineConclusion);

  const chain = dailyBrief.dominantRiskChain && typeof dailyBrief.dominantRiskChain === 'object'
    ? dailyBrief.dominantRiskChain
    : {};
  setTextIfPresent('daily-brief-chain-title', chain.labelZh);
  setTextIfPresent('daily-brief-chain-stage', chain.stageZh ? `阶段：${chain.stageZh}` : '阶段：暂不足以判断');
  setTextIfPresent('daily-brief-chain-summary', chain.summaryZh);
  renderListIfPresent(
    'daily-brief-chain-evidence',
    safeArray(chain.evidence).slice(0, 3).map(formatDailyBriefEvidence),
    '数据不足，暂不足以判断主导风险链证据。'
  );

  const divergence = dailyBrief.largestDivergence && typeof dailyBrief.largestDivergence === 'object'
    ? dailyBrief.largestDivergence
    : {};
  setTextIfPresent('daily-brief-divergence-title', divergence.labelZh);
  setTextIfPresent('daily-brief-divergence-status', divergence.statusZh ? `状态：${divergence.statusZh}` : '状态：暂不足以判断');
  setTextIfPresent('daily-brief-divergence-summary', divergence.summaryZh);
  renderListIfPresent(
    'daily-brief-divergence-evidence',
    safeArray(divergence.evidence).slice(0, 3).map(formatDailyBriefEvidence),
    '数据不足，暂不足以判断最大背离证据。'
  );

  renderListIfPresent('daily-brief-triggers', safeArray(dailyBrief.keyTriggers).slice(0, 3), '暂未生成关键触发器。');
  renderListIfPresent('daily-brief-invalidations', safeArray(dailyBrief.invalidationSignals).slice(0, 3), '暂未生成反证条件。');
  renderListIfPresent('daily-brief-data-gaps', safeArray(dailyBrief.dataGaps).slice(0, 3), '当前未记录额外数据限制。');

  const confidence = dailyBrief.confidence && typeof dailyBrief.confidence === 'object' ? dailyBrief.confidence : {};
  const confidenceLevel = safeText(confidence.level, 'unknown');
  const confidenceScore = Number(confidence.score);
  const confidenceLabel = {
    low: '低',
    medium: '中',
    high: '高',
    unknown: '待确认'
  }[confidenceLevel] || '待确认';
  const scoreLabel = Number.isFinite(confidenceScore) ? ` / ${Math.round(confidenceScore)}` : '';
  setTextIfPresent('daily-brief-confidence', `置信度：${confidenceLabel}${scoreLabel}`);
  setTextIfPresent('daily-brief-boundary', `该区域仅为解释层展示，不参与评分、仓位、执行灯或交易建议。${safeText(confidence.reasonZh, '')}`);
}

const AI_CONFIDENCE_CN = {
  low: '低',
  medium: '中',
  high: '高',
  unknown: '待确认'
};

const AI_MODE_CN = {
  rule_based_structured_interpretation: '规则化结构解释'
};

const AI_MODEL_SOURCE_CN = {
  dailyBrief: '今日主判断',
  divergenceLayer: '背离校验层',
  brentPricingLayer: 'Brent 公开代理价格层',
  macroDrivers: '宏观驱动层',
  decisionModel: '决策模型',
  combined: '多层综合'
};

const AI_LAYER_CN = {
  dailyBrief: '今日主判断',
  divergenceLayer: '背离校验层',
  brentPricingLayer: 'Brent 公开代理价格层',
  macroDrivers: '宏观驱动层',
  decisionModel: '决策模型',
  healthDashboard: '数据健康状态',
  combined: '多层综合'
};

const AI_FIELD_CN = {
  'dailyBrief.contractVersion': 'Daily Brief 合约',
  'dailyBrief.oneLineConclusion': '一句话结论',
  'dailyBrief.macroState': '宏观状态',
  'divergenceLayer.boundaries': '背离层边界',
  'divergenceLayer.primaryDivergence': '主要背离',
  'divergenceLayer.checks': '背离检查',
  'brentPricingLayer.proxySpread': 'Brent 代理价差',
  'brentPricingLayer.promotionAudit': 'Brent 主值审计',
  'macroDrivers.consumer': '消费者慢变量',
  'decisionModel.strategyState': '策略状态',
  oneLineConclusion: '一句话结论',
  primaryDivergence: '主要背离',
  proxySpread: 'Brent 代理价差'
};

function formatAiConfidenceLabel(value) {
  return AI_CONFIDENCE_CN[String(value || '').toLowerCase()] || '待确认';
}

function formatAiConfidence(confidence = {}) {
  const level = formatAiConfidenceLabel(confidence.level);
  const score = Number(confidence.score);
  const scoreLabel = Number.isFinite(score) ? ` / ${Math.round(score)}` : ' / --';
  return `置信度：${level}${scoreLabel}。${safeText(confidence.reasonZh, '暂不足以判断')}`;
}

function formatAiReference(value) {
  const key = String(value || '');
  if (AI_FIELD_CN[key]) return AI_FIELD_CN[key];
  const layerKey = key.split('.')[0];
  if (AI_LAYER_CN[layerKey]) return `${AI_LAYER_CN[layerKey]}结构字段`;
  return '站内结构化字段';
}

function formatAiReferenceList(values, fallback = '站内结构化数据') {
  const refs = safeArray(values).map(formatAiReference).filter(Boolean);
  return refs.length ? Array.from(new Set(refs)).join('、') : fallback;
}

function formatAiTextItem(item, referenceKey, referenceLabel) {
  const label = safeText(item?.labelZh, '解释项');
  const statement = safeText(item?.statementZh, '暂不足以判断');
  const confidence = formatAiConfidenceLabel(item?.confidence);
  const refs = formatAiReferenceList(item?.[referenceKey]);
  return `${label}：${statement}。${referenceLabel}：${refs}。置信度：${confidence}`;
}

function formatAiJudgment(item) {
  const label = safeText(item?.labelZh, '模型判断');
  const statement = safeText(item?.statementZh, '暂不足以判断');
  const modelSource = AI_MODEL_SOURCE_CN[String(item?.modelSource || '')] || '模型来源待确认';
  const confidence = formatAiConfidenceLabel(item?.confidence);
  return `${label}：${statement}。模型来源：${modelSource}。置信度：${confidence}`;
}

function renderAiScenarios(scenarios) {
  const root = $('ai-interpretation-scenarios');
  if (!root) return;
  root.innerHTML = '';
  const items = safeArray(scenarios).slice(0, 4);
  if (!items.length) {
    const fallback = document.createElement('p');
    fallback.textContent = '暂未生成情景假设；前端不会根据 raw values 反推解释层。';
    root.appendChild(fallback);
    return;
  }
  items.forEach((scenario) => {
    const card = document.createElement('div');
    card.className = 'metric-box compact';

    const title = document.createElement('div');
    title.className = 'metric-label';
    title.textContent = safeText(scenario?.labelZh, '情景假设');
    card.appendChild(title);

    const statement = document.createElement('p');
    statement.textContent = safeText(scenario?.statementZh, '暂不足以判断');
    card.appendChild(statement);

    const triggers = document.createElement('ul');
    triggers.className = 'bullet-list';
    safeArray(scenario?.triggerConditions).slice(0, 3).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `触发条件：${safeText(item, '暂不足以判断')}`;
      triggers.appendChild(li);
    });
    if (!triggers.children.length) {
      const li = document.createElement('li');
      li.textContent = '触发条件：暂不足以判断';
      triggers.appendChild(li);
    }
    card.appendChild(triggers);

    const invalidations = document.createElement('ul');
    invalidations.className = 'bullet-list';
    safeArray(scenario?.invalidationConditions).slice(0, 3).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `反证条件：${safeText(item, '暂不足以判断')}`;
      invalidations.appendChild(li);
    });
    if (!invalidations.children.length) {
      const li = document.createElement('li');
      li.textContent = '反证条件：暂不足以判断';
      invalidations.appendChild(li);
    }
    card.appendChild(invalidations);

    root.appendChild(card);
  });
}

function renderAiInterpretationFallback() {
  setTextIfPresent('ai-interpretation-summary', 'AI 解释层将在下一次 Daily 数据构建后显示。当前仍可参考今日主判断、背离校验层和数据健康状态。');
  setTextIfPresent('ai-interpretation-mode', '模式：规则化结构解释待生成；当前不调用外部 AI API。');
  setTextIfPresent('ai-interpretation-confidence', '置信度：待确认');
  setTextIfPresent('ai-interpretation-boundary', '该区域仅为解释层展示，不参与评分、仓位、执行灯或交易建议。');
  renderListIfPresent('ai-interpretation-facts', [], 'AI 解释层待生成，前端不会自行反推已验证事实。');
  renderListIfPresent('ai-interpretation-inferences', [], 'AI 解释层待生成，前端不会自行生成数据推断。');
  renderListIfPresent('ai-interpretation-judgments', [], 'AI 解释层待生成，前端不会自行生成模型判断。');
  renderAiScenarios([]);
  renderListIfPresent('ai-interpretation-gaps-invalidations', [], 'AI 解释层待生成，当前先参考数据健康状态。');
  renderListIfPresent('ai-interpretation-evidence-links', [], 'AI 解释层待生成，暂无可展示证据链接。');
}

export function renderAiInterpretationLayer(aiInterpretationLayer) {
  if (!aiInterpretationLayer || typeof aiInterpretationLayer !== 'object' || aiInterpretationLayer.contractVersion !== 'v28.0J-0') {
    renderAiInterpretationFallback();
    return;
  }

  const modeLabel = AI_MODE_CN[String(aiInterpretationLayer.mode || '')] || '规则化结构解释';
  setTextIfPresent('ai-interpretation-summary', safeText(aiInterpretationLayer.summaryZh, '暂不足以判断'));
  setTextIfPresent('ai-interpretation-mode', `模式：${modeLabel}。当前不调用外部 AI API，仅基于站内结构化数据生成解释。`);
  setTextIfPresent('ai-interpretation-confidence', formatAiConfidence(aiInterpretationLayer.confidence || {}));
  setTextIfPresent('ai-interpretation-boundary', '该区域仅为解释层展示，不参与评分、仓位、执行灯或交易建议。');

  renderListIfPresent(
    'ai-interpretation-facts',
    safeArray(aiInterpretationLayer.facts)
      .slice(0, 5)
      .map((item) => formatAiTextItem(item, 'sourceFields', '来源')),
    '暂未生成已验证事实。'
  );
  renderListIfPresent(
    'ai-interpretation-inferences',
    safeArray(aiInterpretationLayer.dataInferences)
      .slice(0, 5)
      .map((item) => formatAiTextItem(item, 'basedOn', '基于')),
    '暂未生成数据推断。'
  );
  renderListIfPresent(
    'ai-interpretation-judgments',
    safeArray(aiInterpretationLayer.modelJudgments)
      .slice(0, 5)
      .map(formatAiJudgment),
    '暂未生成模型判断。'
  );
  renderAiScenarios(aiInterpretationLayer.scenarioHypotheses);

  const gaps = safeArray(aiInterpretationLayer.dataGaps).slice(0, 5).map((item) => `数据缺口：${safeText(item, '暂不足以判断')}`);
  const invalidations = safeArray(aiInterpretationLayer.invalidationSignals).slice(0, 5).map((item) => `反证条件：${safeText(item, '暂不足以判断')}`);
  renderListIfPresent(
    'ai-interpretation-gaps-invalidations',
    gaps.concat(invalidations),
    '当前未记录额外数据缺口或反证条件。'
  );
  renderListIfPresent(
    'ai-interpretation-evidence-links',
    safeArray(aiInterpretationLayer.evidenceLinks)
      .slice(0, 6)
      .map((item) => {
        const layer = AI_LAYER_CN[String(item?.layer || '')] || '站内解释层';
        const field = formatAiReference(item?.field);
        return `${layer} / ${field}：${safeText(item?.noteZh, '暂不足以判断')}`;
      }),
    '暂未生成证据链接。'
  );
}

function formatDivergenceScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? String(Math.round(score)) : '--';
}

function formatDivergenceEvidence(evidence) {
  const label = safeText(evidence?.labelZh, '证据');
  const summary = safeText(evidence?.summaryZh, '暂不足以判断');
  return `${label}：${summary}`;
}

function formatDivergenceConfidence(confidence = {}) {
  const level = safeText(confidence.level, 'unknown');
  const levelLabel = {
    low: '低',
    medium: '中',
    high: '高',
    unknown: '待确认'
  }[level] || '待确认';
  const score = Number(confidence.score);
  const scoreLabel = Number.isFinite(score) ? ` / ${Math.round(score)}` : '';
  const reason = safeText(confidence.reasonZh, '暂不足以判断');
  return `置信度：${levelLabel}${scoreLabel}。${reason}`;
}

function formatDivergenceStatus(status) {
  return {
    normal: '未见明显背离',
    watch: '背离观察',
    stress: '背离压力',
    insufficient_data: '数据不足'
  }[String(status || '')] || '暂不足以判断';
}

function renderDivergenceChecks(checks) {
  const root = $('divergence-checks');
  if (!root) return;
  root.innerHTML = '';
  const items = safeArray(checks).slice(0, 5);
  if (!items.length) {
    const fallback = document.createElement('div');
    fallback.className = 'metric-box compact';
    fallback.textContent = '数据不足，暂不从前端反推背离检查。';
    root.appendChild(fallback);
    return;
  }
  items.forEach((check) => {
    const card = document.createElement('div');
    card.className = 'metric-box compact';

    const title = document.createElement('div');
    title.className = 'metric-label';
    title.textContent = safeText(check?.labelZh, '背离检查');
    card.appendChild(title);

    const status = document.createElement('div');
    status.className = 'metric-value small';
    status.textContent = `${safeText(check?.statusZh, formatDivergenceStatus(check?.status))} / ${formatDivergenceScore(check?.score)}`;
    card.appendChild(status);

    const summary = document.createElement('p');
    summary.textContent = safeText(check?.summaryZh, '暂不足以判断。');
    card.appendChild(summary);

    const evidenceList = document.createElement('ul');
    evidenceList.className = 'bullet-list';
    safeArray(check?.evidence).slice(0, 2).map(formatDivergenceEvidence).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      evidenceList.appendChild(li);
    });
    if (!evidenceList.children.length) {
      const li = document.createElement('li');
      li.textContent = '数据不足，暂不足以判断。';
      evidenceList.appendChild(li);
    }
    card.appendChild(evidenceList);

    const limitations = safeArray(check?.limitations).slice(0, 2);
    if (limitations.length) {
      const limitationList = document.createElement('ul');
      limitationList.className = 'bullet-list';
      limitations.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        limitationList.appendChild(li);
      });
      card.appendChild(limitationList);
    }

    root.appendChild(card);
  });
}

function renderDivergenceLayerFallback() {
  setTextIfPresent('divergence-layer-state', '背离层待生成');
  setTextIfPresent('divergence-layer-score', '--');
  setTextIfPresent('divergence-layer-summary', '背离校验层将在下一次 Daily 数据构建后显示。当前仍可参考盘中快变量、数据健康状态和风险模块。');
  setTextIfPresent('divergence-primary-title', '暂无明确主背离');
  setTextIfPresent('divergence-primary-status', '状态：暂不足以判断');
  setTextIfPresent('divergence-primary-summary', '暂不足以判断。');
  renderListIfPresent('divergence-primary-evidence', [], '数据不足，暂不从前端反推 divergenceLayer。');
  renderDivergenceChecks([]);
  renderListIfPresent('divergence-data-gaps', [], 'divergenceLayer 将在下一次 Daily 数据构建后显示。');
  setTextIfPresent('divergence-confidence', '置信度：待确认');
  setTextIfPresent('divergence-boundary', '该区域仅为解释层和审计层展示，不参与评分、仓位、执行灯或交易建议。');
}

export function renderDivergenceLayer(divergenceLayer) {
  if (!divergenceLayer || typeof divergenceLayer !== 'object' || divergenceLayer.contractVersion !== 'v28.0I-3A') {
    renderDivergenceLayerFallback();
    return;
  }

  setTextIfPresent('divergence-layer-state', divergenceLayer.stateZh);
  setTextIfPresent('divergence-layer-score', `背离分数：${formatDivergenceScore(divergenceLayer.score)}`);
  setTextIfPresent('divergence-layer-summary', divergenceLayer.summaryZh);

  const primary = divergenceLayer.primaryDivergence && typeof divergenceLayer.primaryDivergence === 'object'
    ? divergenceLayer.primaryDivergence
    : {};
  setTextIfPresent('divergence-primary-title', primary.labelZh);
  setTextIfPresent('divergence-primary-status', primary.statusZh ? `状态：${primary.statusZh}` : '状态：暂不足以判断');
  setTextIfPresent('divergence-primary-summary', primary.summaryZh);
  renderListIfPresent(
    'divergence-primary-evidence',
    safeArray(primary.evidence).slice(0, 3).map(formatDivergenceEvidence),
    '数据不足，暂不足以判断主要背离证据。'
  );

  renderDivergenceChecks(divergenceLayer.checks);
  renderListIfPresent('divergence-data-gaps', safeArray(divergenceLayer.dataGaps).slice(0, 4), '当前未记录额外数据缺口。');
  const confidence = divergenceLayer.confidence && typeof divergenceLayer.confidence === 'object' ? divergenceLayer.confidence : {};
  setTextIfPresent('divergence-confidence', formatDivergenceConfidence(confidence));
  setTextIfPresent('divergence-boundary', '该区域仅为解释层和审计层展示，不参与评分、仓位、执行灯或交易建议。');
}

function formatBrentValue(value, digits = 2) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '--';
}

function formatBrentStatus(status) {
  return {
    ok: '可用',
    fallback: '回退',
    missing: '缺失',
    excluded: '排除'
  }[String(status || '').toLowerCase()] || '待确认';
}

function formatBrentMode(mode) {
  return {
    public_proxy_observation: '公开代理观察'
  }[String(mode || '')] || '模式待确认';
}

function formatBrentRole(role) {
  return {
    anchor: '锚定源',
    futures_proxy: '期货代理',
    confirmation: '确认源',
    diagnostic: '诊断源'
  }[String(role || '')] || '角色待确认';
}

function formatBrentBoolean(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return '--';
}

function formatBrentMoveStatus(status) {
  return BRENT_MOVE_STATUS_CN[String(status || '')] || '状态待确认';
}

function formatBrentPromotionReason(reason) {
  return {
    'promoted-stale-fred-anchor-with-fresh-yahoo-and-tradingeconomics-confirmation': 'FRED 锚定值偏旧，但 Yahoo 与 Trading Economics 的新鲜确认支持采用公开代理主值。',
    'promoted-fresh-fred-anchor': 'FRED 锚定值仍在新鲜窗口内。',
    'promotion-not-applied': '未应用主值提升。',
    'candidate-missing': '候选价格不足，未应用主值提升。'
  }[String(reason || '')] || '提升原因待确认';
}

function formatBrentPriceNode(node = {}) {
  const value = formatBrentValue(node.value);
  const source = safeText(node.source, '--');
  const status = formatBrentStatus(node.status);
  const label = safeText(node.labelZh, '公开代理');
  return `${label}：${value} / 来源 ${source} / 状态 ${status}`;
}

function formatBrentFuturesCurve(curve = {}) {
  if (!curve || typeof curve !== 'object') return 'ICE 合约结构：待确认';
  const status = safeText(curve.curveStatus, 'missing');
  const contracts = safeArray(curve.contracts)
    .filter((contract) => contract && typeof contract === 'object')
    .slice(0, 4)
    .map((contract) => `${safeText(contract.contract, '--')}(${safeText(contract.lastTrade, '--').slice(0, 10)})`);
  if (!contracts.length) return `ICE 合约结构：${status}`;
  return `ICE futuresCurve structure-only：${contracts.join(' / ')}；status=${status}`;
}

function formatBrentFuturesPriceCurve(curve = {}) {
  if (!curve || typeof curve !== 'object') return 'Yahoo priced futures proxy：待确认';
  const status = safeText(curve.curveStatus, 'missing');
  const contracts = safeArray(curve.contracts)
    .filter((contract) => contract && typeof contract === 'object')
    .slice(0, 5)
    .map((contract) => `${safeText(contract.contractMonth, '--')} ${formatBrentValue(contract.price, 2)}`);
  if (!contracts.length) return `Yahoo priced futures proxy：${status}`;
  return `Yahoo priced futures proxy：${contracts.join(' / ')}；front-back ${formatBrentValue(curve.frontMinusBack, 2)}；slope=${safeText(curve.slopeRegime, '未知')}；status=${status}`;
}

function formatIceBrentFuturesPriceCurve(curve = {}) {
  if (!curve || typeof curve !== 'object') return 'ICE public delayed price curve：待确认';
  const status = safeText(curve.curveStatus, 'missing');
  const contracts = safeArray(curve.contracts)
    .filter((contract) => contract && typeof contract === 'object')
    .slice(0, 5)
    .map((contract) => `${safeText(contract.contract, '--')} ${formatBrentValue(contract.price, 2)}`);
  if (!contracts.length) return `ICE public delayed price curve：${status}`;
  return `ICE public delayed price curve：${contracts.join(' / ')}；front-back ${formatBrentValue(curve.frontMinusBack, 2)}；slope=${safeText(curve.slopeRegime, '未知')}；status=${status}`;
}

function formatBrentConfidence(confidence = {}) {
  const level = {
    low: '低',
    medium: '中',
    high: '高'
  }[String(confidence.level || '')] || '待确认';
  const score = Number(confidence.score);
  const scoreLabel = Number.isFinite(score) ? ` / ${Math.round(score)}` : '';
  return `置信度：${level}${scoreLabel}。${safeText(confidence.reasonZh, '暂不足以判断')}`;
}

function renderBrentConfirmationSources(sources) {
  const root = $('brent-confirmation-sources');
  if (!root) return;
  root.innerHTML = '';
  const items = safeArray(sources).slice(0, 5);
  if (!items.length) {
    const fallback = document.createElement('div');
    fallback.className = 'metric-box compact';
    fallback.textContent = '暂无可展示的 Brent 验证来源。';
    root.appendChild(fallback);
    return;
  }
  items.forEach((source) => {
    const card = document.createElement('div');
    card.className = 'metric-box compact';

    const title = document.createElement('div');
    title.className = 'metric-label';
    title.textContent = safeText(source?.labelZh, 'Brent 验证来源');
    card.appendChild(title);

    const value = document.createElement('div');
    value.className = 'metric-value small';
    value.textContent = `${formatBrentValue(source?.value)} / ${formatBrentStatus(source?.status)}`;
    card.appendChild(value);

    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `来源：${safeText(source?.source, '--')}；角色：${formatBrentRole(source?.role)}；参与主值提升：${formatBrentBoolean(source?.participatesInPromotion)}；观察时间：${safeText(source?.observedAt, '--')}。${safeText(source?.noteZh, '')}`;
    card.appendChild(meta);

    root.appendChild(card);
  });
}

function renderBrentPricingLayerFallback() {
  setTextIfPresent('brent-pricing-mode', '公开代理观察待生成');
  setTextIfPresent('brent-pricing-summary', 'Brent 公开代理价格层将在下一次 Daily 数据构建后显示。当前仍可参考盘中快变量、背离校验层和数据健康状态。');
  setTextIfPresent('brent-selected-value', '--');
  setTextIfPresent('brent-selected-source', '来源：--');
  setTextIfPresent('brent-selected-observed', '时间：--');
  setTextIfPresent('brent-selected-note', '暂不足以判断。');
  setTextIfPresent('brent-spot-proxy', '暂不足以判断。');
  setTextIfPresent('brent-futures-proxy', '暂不足以判断。');
  setTextIfPresent('brent-proxy-spread', '数据不足，暂不从前端反推 brentPricingLayer。');
  setTextIfPresent('brent-promotion-audit', '暂不足以判断。');
  renderBrentConfirmationSources([]);
  renderListIfPresent('brent-pricing-data-gaps', [], '等待下一次 Daily 数据构建生成 Brent 公开代理价格层。');
  renderListIfPresent('brent-pricing-limitations', [], '当前仅为公开代理价格观察，不等同于正式实物成交价。');
  setTextIfPresent('brent-pricing-confidence', '置信度：待确认');
  setTextIfPresent('brent-pricing-boundary', '该区域仅为 Brent 公开代理价格审计层，不改变 Brent 主值、评分、仓位、执行灯或交易建议。');
}

export function renderBrentPricingLayer(brentPricingLayer) {
  if (!brentPricingLayer || typeof brentPricingLayer !== 'object' || brentPricingLayer.contractVersion !== 'v28.0I-5A') {
    renderBrentPricingLayerFallback();
    return;
  }

  setTextIfPresent('brent-pricing-mode', formatBrentMode(brentPricingLayer.mode));
  setTextIfPresent('brent-pricing-summary', brentPricingLayer.summaryZh);

  const selected = brentPricingLayer.selectedBrent && typeof brentPricingLayer.selectedBrent === 'object' ? brentPricingLayer.selectedBrent : {};
  setTextIfPresent('brent-selected-value', formatBrentValue(selected.value));
  setTextIfPresent('brent-selected-source', `来源：${safeText(selected.source, '--')} / 状态：${formatBrentStatus(selected.status)}`);
  setTextIfPresent('brent-selected-observed', `时间：${safeText(selected.observedAt, '--')}`);
  setTextIfPresent('brent-selected-note', selected.noteZh);

  setTextIfPresent('brent-spot-proxy', formatBrentPriceNode(brentPricingLayer.publicSpotProxy || {}));
  setTextIfPresent(
    'brent-futures-proxy',
    `${formatBrentPriceNode(brentPricingLayer.futuresProxy || {})}；${formatBrentFuturesCurve(brentPricingLayer.futuresCurve || {})}；${formatIceBrentFuturesPriceCurve(brentPricingLayer.iceFuturesPriceCurve || {})}；${formatBrentFuturesPriceCurve(brentPricingLayer.futuresPriceCurve || {})}`
  );

  const spread = brentPricingLayer.proxySpread && typeof brentPricingLayer.proxySpread === 'object' ? brentPricingLayer.proxySpread : {};
  setTextIfPresent(
    'brent-proxy-spread',
    `现货-期货：${formatBrentValue(spread.spotMinusFutures)}；主值-期货：${formatBrentValue(spread.selectedMinusFutures)}；最大代理背离：${formatBrentValue(spread.maxProxyDivergencePct)}%；ULSD：${formatBrentValue(brentPricingLayer.ulsdPrice, 3)}；ULSD 4周变化：${formatBrentValue(brentPricingLayer.ulsd4wChange, 3)}；crack spread 4周变化：${formatBrentValue(brentPricingLayer.crackSpread4wChange)}；状态：${safeText(spread.statusZh, '暂不足以判断')}。${safeText(spread.interpretationZh, '')}`
  );

  const audit = brentPricingLayer.promotionAudit && typeof brentPricingLayer.promotionAudit === 'object' ? brentPricingLayer.promotionAudit : {};
  setTextIfPresent(
    'brent-promotion-audit',
    `是否应用主值提升：${formatBrentBoolean(audit.promotionApplied)}；移动状态：${formatBrentMoveStatus(audit.moveStatus)}；提升原因：${formatBrentPromotionReason(audit.promotionReason)}；选中来源：${safeText(audit.selectedSource, '--')}；锚定来源：${safeText(audit.anchorSource, '--')}；锚定价格年龄：${formatBrentValue(audit.anchorAgeHours, 1)} 小时。`
  );

  renderBrentConfirmationSources(brentPricingLayer.confirmationSources);
  renderListIfPresent('brent-pricing-data-gaps', safeArray(brentPricingLayer.dataGaps).slice(0, 4), '当前未记录额外数据缺口。');
  renderListIfPresent('brent-pricing-limitations', safeArray(brentPricingLayer.limitations).slice(0, 4), '当前仅为公开代理价格观察，不等同于正式实物成交价。');
  const confidence = brentPricingLayer.confidence && typeof brentPricingLayer.confidence === 'object' ? brentPricingLayer.confidence : {};
  setTextIfPresent('brent-pricing-confidence', formatBrentConfidence(confidence));
  setTextIfPresent('brent-pricing-boundary', '该区域仅为 Brent 公开代理价格审计层，不改变 Brent 主值、评分、仓位、执行灯或交易建议。');
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
    high_confirmed: '高确认'
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
  dataQualityBadge.textContent = dataQuality.label;
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
      : `趋势：${formatWorldOrderTrend(dimension.trend)}`;
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
    if (['market', 'worker', 'system', 'reliefweb', 'unknown'].includes(key)) return;
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
