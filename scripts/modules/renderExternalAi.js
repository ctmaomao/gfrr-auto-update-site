import { $ } from './config.js?v=odp-thermal-facility-window-quality-1';
import { MODULE_LABELS } from './decision.js?v=odp-thermal-facility-window-quality-1';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function setLeafText(id, value) {
  const el = $(id);
  if (!el || value === null || value === undefined || value === '') return;
  el.textContent = String(value);
}

function setHidden(id, hidden) {
  const el = $(id);
  if (el) el.hidden = hidden;
}

function textValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function joinNonEmpty(parts, separator = ' · ') {
  return parts
    .map((part) => textValue(part))
    .filter(Boolean)
    .join(separator);
}

function formatBoolean(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === null || value === undefined) return null;
  return String(value);
}

function shortHash(value, length = 12) {
  const text = textValue(value);
  if (!text) return null;
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function orderedSentence(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const clean = items.map((item) => textValue(item)).filter(Boolean);
  if (clean.length === 0) return null;
  return clean.map((item, index) => `(${index + 1}) ${item}`).join(' ');
}

function formatUtcMinuteStage5d2(value) {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function scenarioText(scenario) {
  if (!scenario) return null;
  const title = externalAiDisplayText(scenario.titleZh);
  const triggers = Array.isArray(scenario.triggerConditions)
    ? scenario.triggerConditions.map((item) => externalAiDisplayText(item)).filter(Boolean).join('、')
    : null;
  const invalidations = Array.isArray(scenario.invalidationConditions)
    ? scenario.invalidationConditions.map((item) => externalAiDisplayText(item)).filter(Boolean).join('、')
    : null;
  const parts = [];
  if (title) parts.push(`${title}:`);
  if (triggers) parts.push(`若 ${triggers},则升级观察`);
  if (invalidations) parts.push(`若 ${invalidations},则降级/失效`);
  return parts.length > 0 ? parts.join('；') : null;
}

function externalAiListText(items, fallback = '—') {
  if (!Array.isArray(items)) return fallback;
  const clean = items.map((item) => externalAiDisplayText(item)).filter(Boolean);
  return clean.length > 0 ? clean.join(' / ') : fallback;
}

function externalAiDisplayText(value) {
  const text = textValue(value);
  if (!text) return null;
  return text
    .replace(/\bfalse_down_physical_stress\b/g, '假性下跌、物理压力仍强')
    .replace(/\boilDirectionalPressure\b/g, '油价方向压力')
    .replace(/\bbrentPricingLayer\b/g, '布伦特原油(Brent)定价层')
    .replace(/\bassets\.qqq\.latestMetricDate\b/g, '纳斯达克100 ETF(QQQ)最新温度日期')
    .replace(/\btopRisks\b/g, '每日简报主要风险')
    .replace(/\bfallback\b/g, '回退')
    .replace(/\bif-then\b/g, '条件式(if-then)')
    .replace(/(?<!\()(?<!波动率指数\()(?<!美国)波动率指数?\s*VIX\b/g, '波动率指数(VIX)')
    .replace(/(?<!\()(?<!波动率指数\()\bVIX\b/g, '波动率指数(VIX)')
    .replace(/(?<!\()(?<!高收益债利差\()\bHY OAS\b/g, '高收益债利差(HY OAS)')
    .replace(/(?<!\()(?<!投资级债利差\()(?<!投资级利差\()\bIG OAS\b/g, '投资级债利差(IG OAS)')
    .replace(/高收益利差/g, '高收益债利差(HY OAS)')
    .replace(/美国10年期收益率/g, '美国10年期国债收益率(US10Y)')
    .replace(/广义美元指数(?!\()/g, '广义美元指数(DXY)')
    .replace(/消费者信心指数(?!\()/g, '消费者信心指数(UMCSENT)')
    .replace(/(?<!\()(?<!美国10年期国债收益率\()\bUS10Y\b/g, '美国10年期国债收益率(US10Y)')
    .replace(/(?<!\()(?<!隔夜逆回购\()\bON RRP\b/g, '隔夜逆回购(ON RRP)')
    .replace(/布伦特(?!原油)(?!定价层)/g, '布伦特原油(Brent)')
    .replace(/(?<!\()(?<!布伦特原油\()\bBrent\b/g, '布伦特原油(Brent)')
    .replace(/(?<!\()(?<!纳斯达克100 ETF\()\bQQQ\b/g, '纳斯达克100 ETF(QQQ)')
    .replace(/(?<!\()(?<!标普500\()\bSPX\b/g, '标普500(SPX)')
    .replace(/(?<!\()(?<!纳指100\()\bNDX\b/g, '纳指100(NDX)')
    .replace(/(?<!\()(?<!纳指综合\()\bIXIC\b/g, '纳指综合(IXIC)')
    .replace(/(?<!\()(?<!中期借贷便利\()\bMLF\b/g, '中期借贷便利(MLF)')
    .replace(/(?<!\()(?<!消费者物价\()\bCPI\b/g, '消费者物价(CPI)')
    .replace(/(?<!\()(?<!工业品出厂价格\()\bPPI\b/g, '工业品出厂价格(PPI)')
    .replace(/(?<!\()(?<!密歇根消费信心\()\bUMCSENT\b/g, '密歇根消费信心(UMCSENT)')
    .replace(/(?<!\()\bz-score\b/g, '偏离度(z-score)');
}

const EXTERNAL_AI_MACRO_DRIVER_LABELS = {
  fedLiquidity: '美元流动性',
  policyExpectations: '政策预期',
  curve: '收益率曲线',
  credit: '信用压力',
  consumer: '消费者信心',
  shippingFreight: '航运运价',
  employment: '就业质量',
  consumerRetail: '零售消费',
  commercialRealEstate: '商业地产',
  privateCreditProxy: '私募信贷代理',
  worldEconomy: '世界经济',
  chinaEquity: '中国权益',
  inflationEnergy: '通胀与能源',
  copperGold: '铜金比',
  chinaBond: '中国债券',
  cfetsRmb: 'CFETS 人民币',
  chinaInflation: '中国通胀',
  chinaPmi: '中国采购经理指数(PMI)',
  euroVolatility: '欧元区波动率(V2X)',
  chinaPropertyPrice: '中国房价',
  chinaOmo: '中国公开市场操作',
  chinaTsf: '中国社融',
  chinaMlf: '中国中期借贷便利(MLF)',
  rateVol: '利率波动',
  activeSignals: '活跃信号',
  gatingEvaluation: '门控评估',
  allSourcesMissing: '缺失源汇总',
};

const EXTERNAL_AI_SOURCE_LAYER_LABELS = {
  topRisks: '每日简报 · 主要风险',
  checks: '检查项',
  signals: '信号层',
  score: '风险分数',
  stressScore: '压力分数',
  macroState: '宏观状态',
  onRrp: '隔夜逆回购(ON RRP)',
  proxySpread: '公开代理价差',
  umichSentiment: '密歇根消费信心(UMich)',
  geopolitical: '地缘风险',
  dailyBrief: '每日简报',
  aiInterpretationLayer: '规则基线解读',
  dataHealth: '数据健康',
  modules: '六大风险模块',
  regimeProbabilities: '情景概率',
  scenarioTree: '情景树',
  transmissionChain: '传导链',
  heatmap: '全球风险热力图',
  divergenceLayer: '背离检查层',
  brentPricingLayer: '布伦特原油(Brent)定价层',
  oilDirectionalPressure: '油价方向压力',
  worldOrderStress: '世界秩序压力',
  marketPricing: '市场定价',
  dataQuality: '数据质量',
  'decisionContext.sanitized': '只读系统状态',
  ...Object.fromEntries(
    Object.entries(EXTERNAL_AI_MACRO_DRIVER_LABELS).map(([key, label]) => [`macroDrivers.${key}`, label])
  ),
};

const EXTERNAL_AI_FIELD_PATH_LABELS = {
  consumer_vs_asset_pricing: '消费者体感与资产定价错配',
  'assets.qqq.latestMetricDate': '纳斯达克100 ETF(QQQ) · 最新温度日期',
  'marketPricing.assets.qqq.latestMetricDate': '纳斯达克100 ETF(QQQ) · 最新温度日期',
  'oilDirectionalPressure.signals.dieselProductStress.extremeTight': '柴油库存压力',
  'oilDirectionalPressure.signals.dieselProductStress': '柴油库存压力',
  'oilDirectionalPressure.signals.inventoryDrawPressure': '库存抽紧压力',
  'oilDirectionalPressure.signals.priceContext.brentChangePct4w': '布伦特原油(Brent)4 周变化',
  'brentPricingLayer.proxySpread.status': '现货期货价差状态',
  'brentPricingLayer.proxySpread': '现货期货价差',
  'dailyBrief.dominantRiskChain': '主导风险链',
  'macroDrivers.consumer.umichSentiment': '密歇根消费信心',
  'macroDrivers.credit.igOas': '投资级债利差(IG OAS)',
  'macroDrivers.credit.igHyRatio': '投资级/高收益利差比(IG/HY)',
  'macroDrivers.chinaMlf': '中国中期借贷便利(MLF)',
  'dailyBrief.dominantRiskChain.evidence[0].value': '主风险链证据',
  'macroDrivers.consumer.umichSentiment.threeMonthChange': '密歇根信心三月变化',
  'divergenceLayer.checks.consumer_vs_asset_pricing': '消费者体感与资产定价错配',
  'divergenceLayer.checks[4].status': '消费资产背离检查',
  'marketPricing.assets.qqq.status': '纳斯达克100 ETF(QQQ)状态',
  'marketPricing.assets.ndx.status': '纳指100(NDX)状态',
  'marketPricing.assets.ixic.status': '纳指综合(IXIC)状态',
};

const EXTERNAL_AI_SOURCE_VALUE_LABELS = {
  local_compact: '本地压缩输入',
  manual_local_compact: '手动本地压缩输入',
  manual_workflow: '手动工作流',
  analyst_compact_v1: '分析师压缩输入(v1)',
  manual_analyst_compact_v1: '手动分析师压缩输入(v1)',
};

const EXTERNAL_AI_AUDIT_FLAG_LABELS = {
  manual_artifact_only: '手动工作流制品',
  site_structured_data_only: '仅使用站内结构化数据',
  analyst_compact_v1: '分析师压缩输入(v1)',
  validator_required: '必须通过校验',
  non_production_output: '不作为生产决策输出',
  no_frontend_display: '不覆盖平台主结论',
};

const EXTERNAL_AI_SOURCE_LAYER_KEYS = Object.keys(EXTERNAL_AI_SOURCE_LAYER_LABELS)
  .sort((a, b) => b.length - a.length);

const EXTERNAL_AI_CONFIDENCE_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
};

function externalAiSourceLayerLabel(sourceLayer) {
  if (!sourceLayer) return null;
  if (sourceLayer === 'modules') return '六大风险模块';
  if (sourceLayer.startsWith('modules.')) {
    const moduleKey = sourceLayer.slice('modules.'.length).split(/[.\[\]]/u)[0];
    return MODULE_LABELS[moduleKey] ? `六大风险模块 · ${MODULE_LABELS[moduleKey]}` : '六大风险模块';
  }
  if (sourceLayer.startsWith('macroDrivers.')) {
    const key = sourceLayer.slice('macroDrivers.'.length);
    return EXTERNAL_AI_MACRO_DRIVER_LABELS[key] || `宏观驱动 · ${key}`;
  }
  return EXTERNAL_AI_SOURCE_LAYER_LABELS[sourceLayer] || sourceLayer;
}

function findExternalAiCanonicalSourceLayer(reference) {
  const value = textValue(reference);
  if (!value) return null;
  const macroMatch = value.match(/^(macroDrivers\.[A-Za-z][A-Za-z0-9_]*)(?:[.\[].*)?$/u);
  if (macroMatch) return macroMatch[1];
  return EXTERNAL_AI_SOURCE_LAYER_KEYS.find((key) => (
    value === key ||
    value.startsWith(`${key}.`) ||
    value.startsWith(`${key}[`)
  )) || null;
}

function externalAiFieldPathEntityLabel(reference, canonicalLayer) {
  const value = textValue(reference);
  if (!value || !canonicalLayer || value === canonicalLayer) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[value]) return EXTERNAL_AI_FIELD_PATH_LABELS[value];
  const tail = value.slice(canonicalLayer.length).replace(/^\./u, '');
  if (!tail) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[tail]) return EXTERNAL_AI_FIELD_PATH_LABELS[tail];
  if (canonicalLayer === 'modules') {
    const moduleKey = tail.split(/[.\[\]]/u)[0];
    if (MODULE_LABELS[moduleKey]) return MODULE_LABELS[moduleKey];
  }
  return tail;
}

function externalAiReferenceLabel(reference, { allowFieldPath = false } = {}) {
  const value = textValue(reference);
  if (!value) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[value]) return EXTERNAL_AI_FIELD_PATH_LABELS[value];
  if (EXTERNAL_AI_SOURCE_LAYER_LABELS[value]) return EXTERNAL_AI_SOURCE_LAYER_LABELS[value];
  const canonicalLayer = findExternalAiCanonicalSourceLayer(value);
  if (!canonicalLayer) return value;
  const sourceLabel = externalAiSourceLayerLabel(canonicalLayer);
  if (!allowFieldPath || value === canonicalLayer) return sourceLabel;
  const entityLabel = externalAiFieldPathEntityLabel(value, canonicalLayer);
  return entityLabel ? `${sourceLabel} · ${entityLabel}` : sourceLabel;
}

function externalAiAuditFlagText(flags) {
  if (!Array.isArray(flags)) return null;
  const clean = flags.map((flag) => textValue(flag)).filter(Boolean);
  if (!clean.length) return null;
  return clean.map((flag) => EXTERNAL_AI_AUDIT_FLAG_LABELS[flag] || flag).join(' / ');
}

function setExternalAiAuditFlags(flags) {
  const el = $('ext-ai-audit-flags');
  if (!el) return;
  const displayText = externalAiAuditFlagText(flags);
  if (!displayText) return;
  el.textContent = `审计标记：${displayText}。`;
  el.removeAttribute('title');
}

function externalAiSourceValueLabel(value) {
  const text = textValue(value);
  return text ? (EXTERNAL_AI_SOURCE_VALUE_LABELS[text] || externalAiDisplayText(text)) : null;
}

function externalAiReferenceListText(items, options = {}, fallback = '—') {
  if (!Array.isArray(items)) return fallback;
  const clean = items.map((item) => textValue(item)).filter(Boolean);
  if (clean.length === 0) return fallback;
  return clean
    .map((item) => externalAiReferenceLabel(item, options))
    .filter(Boolean)
    .join(' / ');
}

function setExternalAiReferenceListText(id, items, options = {}) {
  const el = $(id);
  if (!el) return;
  const displayText = externalAiReferenceListText(items, options);
  el.textContent = displayText;
  el.removeAttribute('title');
}

function externalAiTitleWithConfidence(title, confidence) {
  const confidenceLabel = EXTERNAL_AI_CONFIDENCE_LABELS[textValue(confidence)] || textValue(confidence);
  return joinNonEmpty([
    externalAiDisplayText(title),
    confidenceLabel ? `置信度:${confidenceLabel}` : null,
  ]);
}

function renderExternalAiSynthesisItem(item, index) {
  const blockId = `ext-ai-synthesis-${index}-block`;
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const title = externalAiTitleWithConfidence(item.theme, item.confidence);
  const summary = externalAiDisplayText(item.summaryZh);
  if (!title && !summary) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (title) setLeafText(`ext-ai-synthesis-${index}-theme`, title);
  if (summary) setLeafText(`ext-ai-synthesis-${index}-summary`, summary);
  setExternalAiReferenceListText(`ext-ai-synthesis-${index}-supporting`, item.supportingLayers);
  setExternalAiReferenceListText(`ext-ai-synthesis-${index}-conflicting`, item.conflictingLayers);
  return true;
}

function renderExternalAiDivergenceItem(item, index) {
  const blockId = `ext-ai-divergence-${index}-block`;
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const title = externalAiDisplayText(item.titleZh);
  const why = externalAiDisplayText(item.whyItMattersZh);
  if (!title && !why) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (title) setLeafText(`ext-ai-divergence-${index}-title`, title);
  if (why) setLeafText(`ext-ai-divergence-${index}-why`, why);
  setExternalAiReferenceListText(`ext-ai-divergence-${index}-for`, item.evidenceFor, { allowFieldPath: true });
  setExternalAiReferenceListText(`ext-ai-divergence-${index}-against`, item.evidenceAgainst, { allowFieldPath: true });
  setLeafText(`ext-ai-divergence-${index}-invalidations`, externalAiListText(item.invalidationConditions, '—'));
  return true;
}

function renderExternalAiScenarioLean(item) {
  const blockId = 'ext-ai-scenario-lean-block';
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const lean = externalAiTitleWithConfidence(item.leanZh, item.confidence);
  if (!lean) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  setLeafText('ext-ai-scenario-lean-text', lean);
  setLeafText('ext-ai-scenario-lean-refs', externalAiListText(item.scenarioRefs));
  setLeafText('ext-ai-scenario-lean-triggers', externalAiListText(item.triggerConditions));
  setLeafText('ext-ai-scenario-lean-invalidations', externalAiListText(item.invalidationConditions));
  return true;
}

function renderExternalAiDataQualityLens(item) {
  const blockId = 'ext-ai-data-quality-lens-block';
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const summary = externalAiDisplayText(item.summaryZh);
  const impact = externalAiDisplayText(item.confidenceImpactZh);
  if (!summary && !impact) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (summary) setLeafText('ext-ai-data-quality-summary', summary);
  setExternalAiReferenceListText('ext-ai-data-quality-stale', item.staleLayers);
  setExternalAiReferenceListText('ext-ai-data-quality-fallback', item.fallbackLayers);
  setExternalAiReferenceListText('ext-ai-data-quality-missing', item.missingLayers);
  if (impact) setLeafText('ext-ai-data-quality-impact', impact);
  return true;
}

function renderExternalAiStructuredFields(layer) {
  const shown = [
    renderExternalAiSynthesisItem(layer?.crossLayerSynthesis?.[0], 1),
    renderExternalAiSynthesisItem(layer?.crossLayerSynthesis?.[1], 2),
    renderExternalAiDivergenceItem(layer?.keyDivergences?.[0], 1),
    renderExternalAiDivergenceItem(layer?.keyDivergences?.[1], 2),
    renderExternalAiScenarioLean(layer?.scenarioLean),
    renderExternalAiDataQualityLens(layer?.dataQualityLens),
  ].some(Boolean);
  setHidden('ext-ai-structured-output', !shown);
}

function isExternalAiFreshForFrontend(freshness, nowMs = Date.now()) {
  if (!freshness || typeof freshness !== 'object' || Array.isArray(freshness)) return false;
  if (freshness.isStale !== false) return false;
  const maxAgeHours = Number(freshness.maxAgeHours);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false;
  const timestamps = [freshness.artifactGeneratedAt, freshness.sourceDataUpdatedAt]
    .filter((value) => typeof value === 'string' && value.trim() !== '');
  if (timestamps.length === 0) return false;
  return timestamps.every((timestamp) => {
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return false;
    const ageHours = (nowMs - parsed) / (60 * 60 * 1000);
    return ageHours >= -(5 / 60) && ageHours <= maxAgeHours;
  });
}

function isExternalAiVisibleForFrontend(layer, nowMs = Date.now()) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return false;
  const boundaries = layer.boundaries || {};
  const qualityReview = layer.qualityReview || {};
  const provenance = layer.provenance || {};

  const productionContract = layer.schemaVersion === 'v28.0L-external-ai-production-1'
    ? {
        sourceMode: 'manual_local_compact',
        inputSource: 'local_compact',
        sourceSemantics: 'site_structured_data_compact_summary',
      }
    : layer.schemaVersion === 'v28.0L-external-ai-production-analyst-1'
      ? {
          sourceMode: 'manual_analyst_compact_v1',
          inputSource: 'analyst_compact_v1',
          sourceSemantics: 'site_structured_analyst_evidence_pack_v1',
        }
      : null;

  if (layer.displayEnabled !== true) return false;
  if (layer.status !== 'valid') return false;
  if (!productionContract) return false;
  if (layer.sourceMode !== productionContract.sourceMode) return false;
  if (layer.inputSource !== productionContract.inputSource) return false;
  if (layer.sourceSemantics !== productionContract.sourceSemantics) return false;
  if (layer.provider !== 'deepseek') return false;
  if (layer.model !== 'deepseek-v4-flash') return false;
  if (provenance.humanApproved !== false) return false;
  if (boundaries.frontendDisplayApproved !== true) return false;
  if (boundaries.displayOnly !== true) return false;
  if (boundaries.externalAiGenerated !== true) return false;
  if (boundaries.usesExternalAiApi !== true) return false;
  if (boundaries.affectsScoring !== false) return false;
  if (boundaries.affectsDecisionModel !== false) return false;
  if (boundaries.affectsExecutionLock !== false) return false;
  if (boundaries.affectsPositionGuidance !== false) return false;
  if (boundaries.notInvestmentAdvice !== true) return false;
  if (boundaries.productionWriteApproved !== false) return false;
  if (!['pass', 'warn'].includes(qualityReview.status)) return false;
  if (qualityReview.recommendation !== 'pass_for_manual_review') return false;
  if (qualityReview.promotionEligible !== false) return false;
  if (!isExternalAiFreshForFrontend(layer.freshness, nowMs)) return false;
  return true;
}

export function renderExternalAiAuxiliary({ radarData }) {
  try {
    const layer = radarData?.externalAiInterpretationLayer;
    if (!isExternalAiVisibleForFrontend(layer)) {
      setHidden('external-ai-auxiliary', true);
      setHidden('ext-ai-structured-output', true);
      return;
    }
    setHidden('external-ai-auxiliary', false);

    if (textValue(layer.provider)) setLeafText('ext-ai-provider', layer.provider);
    if (textValue(layer.model)) setLeafText('ext-ai-model', layer.model);
    if (textValue(layer.qualityReview?.recommendation)) {
      const reviewZh = ({ pass_for_manual_review: '已通过人工复核' })[layer.qualityReview.recommendation] || layer.qualityReview.recommendation;
      setLeafText('ext-ai-quality', reviewZh);
    }
    const promotion = formatBoolean(layer.qualityReview?.promotionEligible);
    if (promotion) setLeafText('ext-ai-promotion', promotion);
    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-run-id', layer.provenance.runId);
    const generatedAt = formatUtcMinuteStage5d2(layer.generatedAt);
    if (generatedAt) setLeafText('ext-ai-generated-at', generatedAt);

    if (textValue(layer.summaryZh)) setLeafText('ext-ai-summary', externalAiDisplayText(layer.summaryZh));
    const factsText = orderedSentence(layer.facts);
    if (factsText) setLeafText('ext-ai-facts-text', externalAiDisplayText(factsText));
    const inferencesText = orderedSentence(layer.inferences);
    if (inferencesText) setLeafText('ext-ai-inferences-text', externalAiDisplayText(inferencesText));
    const judgmentsText = orderedSentence(layer.modelJudgments);
    if (judgmentsText) setLeafText('ext-ai-judgments-text', externalAiDisplayText(judgmentsText));

    if (Array.isArray(layer.scenarioHypotheses)) {
      for (let i = 0; i < 2; i += 1) {
        const text = scenarioText(layer.scenarioHypotheses[i]);
        if (text) setLeafText(`ext-ai-scenario-${i + 1}`, text);
      }
    }
    renderExternalAiStructuredFields(layer);

    const boundaries = layer.boundaries || {};
    const boundaryParts = [];
    if (boundaries.externalAiGenerated) boundaryParts.push('本 AI 解读层由外部 AI 生成');
    if (boundaries.displayOnly) boundaryParts.push('仅供展示参考,不参与平台的风险打分与决策');
    if (boundaries.notInvestmentAdvice) boundaryParts.push('不构成投资建议');
    const boundaryText = boundaryParts.length > 0 ? `${boundaryParts.join(';')}。` : '';
    if (boundaryText) setLeafText('ext-ai-boundaries-text', boundaryText);

    setExternalAiAuditFlags(layer.auditFlags);

    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-prov-run-id', layer.provenance.runId);
    if (textValue(layer.inputSource)) setLeafText('ext-ai-prov-input-source', externalAiSourceValueLabel(layer.inputSource));
    if (textValue(layer.sourceMode)) setLeafText('ext-ai-prov-source-mode', externalAiSourceValueLabel(layer.sourceMode));
    if (generatedAt) setLeafText('ext-ai-prov-generated-at', generatedAt);
    const digest = shortHash(layer.provenance?.artifactDigest, 12);
    if (digest) setLeafText('ext-ai-prov-artifact-digest', digest);
    const commit = shortHash(layer.provenance?.sourceCommit, 12);
    if (commit) setLeafText('ext-ai-prov-source-commit', commit);
    const humanApproved = formatBoolean(layer.provenance?.humanApproved);
    if (humanApproved) setLeafText('ext-ai-prov-human-approved', humanApproved);
    if (promotion) setLeafText('ext-ai-prov-promotion', promotion);
    const confidenceText = joinNonEmpty([
      EXTERNAL_AI_CONFIDENCE_LABELS[textValue(layer.confidence?.level)] || layer.confidence?.level,
      asNumber(layer.confidence?.score) !== null ? `${Math.round(layer.confidence.score)}/100` : null,
    ], ' ');
    if (confidenceText) setLeafText('ext-ai-prov-confidence', confidenceText);
  } catch (error) {
    console.error('[renderMacroOverview] renderExternalAiAuxiliary failed:', error);
  }
}
