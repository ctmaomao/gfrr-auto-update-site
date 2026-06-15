// scripts/modules/macroOverviewNarrative.js
// Local, display-only narrative planner for Macro Risk Overview.
// It turns existing site data into a compact evidence pack and verdict prose;
// it never writes data, calls external AI, or affects scoring / decisions.

export const MACRO_OVERVIEW_NARRATIVE_VERSION = 'macro-overview-narrative-v1';
export const MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET = Object.freeze({
  min: 900,
  max: 2200,
});

const MODULE_LABELS_ZH = {
  geopolitical: '地缘',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行',
};

const FINAL_BIAS_ZH = {
  strong_bullish: '物理链强紧张',
  moderate_bullish: '物理链偏紧',
  neutral_range: '物理链中性',
  bearish: '物理链偏松',
  false_down_physical_stress: '价格下跌未获物理确认',
  false_up_unconfirmed: '价格上涨缺物理确认',
  product_crisis: '成品油压力主导',
  insufficient_data: '数据不足暂不判断',
};

const PHYSICAL_BIAS_ZH = {
  strong_bullish: '物理链强紧张',
  moderate_bullish: '物理链偏紧',
  neutral_range: '物理链中性',
  bearish: '物理链偏松',
  product_crisis: '成品油压力主导',
  insufficient_data: '数据不足',
};

const GLOBAL_OVERLAY_EFFECT_ZH = {
  confirms_false_down: '全球慢变量确认价格下跌背离',
  confirms_physical_tightness: '全球慢变量确认物理偏紧',
  caps_confidence_demand_watch: '需求放缓限制置信度',
  event_risk_watch: '咽喉事件风险观察',
  neutral: '全球慢变量中性',
  unavailable: '全球慢变量不可用',
  insufficient_physical_data: '物理链数据不足',
};

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function fixed(value, digits = 1) {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(digits);
}

function signed(value, digits = 1) {
  const n = finite(value);
  if (n === null) return '—';
  const formatted = n.toFixed(digits);
  return n > 0 ? `+${formatted}` : formatted;
}

function signedBp(value, digits = 0) {
  const n = finite(value);
  return n === null ? '—' : `${signed(n * 100, digits)}bp`;
}

function percent(value, digits = 1) {
  const n = finite(value);
  return n === null ? '—' : `${signed(n, digits)}%`;
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function compactJoin(items, sep = '、') {
  return items.filter(Boolean).join(sep);
}

function latestRecord(records) {
  return Array.isArray(records) && records.length > 0 ? records[records.length - 1] : null;
}

function riskBandZh(score) {
  const n = finite(score);
  if (n === null) return '数据待确认';
  if (n >= 60) return '系统性顶部';
  if (n >= 40) return '高风险预警';
  if (n >= 25) return '中度警戒';
  return '观察期';
}

function moduleTone(score) {
  const n = finite(score);
  if (n === null) return null;
  if (n >= 70) return 'red';
  if (n >= 50) return 'yellow';
  return 'green';
}

function moduleToneZh(tone) {
  if (tone === 'red') return '红';
  if (tone === 'yellow') return '黄';
  if (tone === 'green') return '绿';
  return '—';
}

function moduleBreakdown(modules) {
  const keys = ['geopolitical', 'energy', 'inflation', 'liquidity', 'debt', 'banking'];
  let red = 0;
  let yellow = 0;
  let green = 0;
  const rows = [];
  for (const key of keys) {
    const score = finite(modules?.[key]);
    const tone = moduleTone(score);
    if (tone === 'red') red += 1;
    if (tone === 'yellow') yellow += 1;
    if (tone === 'green') green += 1;
    rows.push({ key, labelZh: MODULE_LABELS_ZH[key] || key, score, tone });
  }
  const top = rows
    .filter((row) => row.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return { red, yellow, green, rows, top };
}

function scoreChangeText(value) {
  const n = finite(value);
  if (n === null) return '周变化待确认';
  if (Math.abs(n) < 0.5) return '较上周基本持平';
  return `较上周 ${signed(n, 0)}`;
}

function evidence(key, labelZh, value, summaryZh, source, tone = 'neutral') {
  return { key, labelZh, value, summaryZh, source, tone };
}

function normalizeOilDirectional(oilDirectionalData) {
  const oil = oilDirectionalData && typeof oilDirectionalData === 'object' ? oilDirectionalData : null;
  const signals = oil?.signals && typeof oil.signals === 'object' ? oil.signals : {};
  const interpretation = oil?.interpretation && typeof oil.interpretation === 'object' ? oil.interpretation : {};
  const evidenceMap = oil?.evidence && typeof oil.evidence === 'object' ? oil.evidence : {};
  const priceContext = signals.priceContext && typeof signals.priceContext === 'object' ? signals.priceContext : {};
  const globalOverlay = interpretation.globalOverlay && typeof interpretation.globalOverlay === 'object'
    ? interpretation.globalOverlay
    : null;

  const finalBias = textValue(oil?.finalBias);
  const physicalBias = textValue(interpretation.physicalBias);
  const dataSufficiency = textValue(interpretation.dataSufficiency);
  const confidence = textValue(interpretation.confidence);
  const crude = evidenceMap.crudeStocksExSpr || {};
  const distillate = evidenceMap.distillateStocks || {};
  const refinery = signals.refineryConfirmation || {};
  const demand = signals.demandDestructionRisk || {};

  return {
    available: Boolean(oil && finalBias),
    finalBias,
    finalBiasZh: FINAL_BIAS_ZH[finalBias] || '油价方向待确认',
    physicalBias,
    physicalBiasZh: PHYSICAL_BIAS_ZH[physicalBias] || '物理链待确认',
    dataSufficiency: dataSufficiency || 'unknown',
    confidence: confidence || 'unknown',
    brentChangePct4w: finite(priceContext.brentChangePct4w),
    crackChange4w: finite(priceContext.crackChange4w),
    curveSlopeRegime: textValue(priceContext.curveSlopeRegime),
    crudeVs5yPct: finite(crude.vs5yAvgPct),
    crudeChange4w: finite(crude.change4w),
    distillateVs5yPct: finite(distillate.vs5yAvgPct),
    refineryUtilAvg4w: finite(refinery.utilAvg4w),
    demandFalling: Boolean(demand.demandFalling),
    demandDestruction: Boolean(demand.demandDestruction),
    asOfDate: textValue(crude.asOfDate),
    globalOverlay: globalOverlay ? {
      status: textValue(globalOverlay.status),
      effect: textValue(globalOverlay.effect),
      effectZh: GLOBAL_OVERLAY_EFFECT_ZH[textValue(globalOverlay.effect)] || '全球慢变量观察',
      confirmationCount: finite(globalOverlay.confirmationCount),
      confidenceAdjustment: textValue(globalOverlay.confidenceAdjustment),
      demandState: textValue(globalOverlay.demandState),
      supplyBuffer: textValue(globalOverlay.supplyBuffer),
      inventoryBalance: textValue(globalOverlay.inventoryBalance),
    } : null,
  };
}

export function buildMacroOverviewEvidencePack({
  radarData,
  worldOrderStressData,
  marketPricingMetricsData,
  oilDirectionalData,
} = {}) {
  const modules = moduleBreakdown(radarData?.modules);
  const baseline = radarData?.__effectiveDisplayInputs || radarData?.displayInputsBaseline || {};
  const macroDrivers = radarData?.macroDrivers || {};
  const dailyBrief = radarData?.dailyBrief || {};
  const brentLayer = radarData?.brentPricingLayer || {};
  const qqq = latestRecord(marketPricingMetricsData?.assets?.qqq?.records);
  const ndx = latestRecord(marketPricingMetricsData?.assets?.ndx?.records);
  const ixic = latestRecord(marketPricingMetricsData?.assets?.ixic?.records);
  const oil = normalizeOilDirectional(oilDirectionalData);

  const score = finite(radarData?.score);
  const woScore = finite(worldOrderStressData?.score);
  const woLabel = textValue(worldOrderStressData?.labelZh) || textValue(worldOrderStressData?.state) || '状态待确认';
  const brent = finite(baseline.brent ?? brentLayer.selectedBrent?.value);
  const vix = finite(baseline.vix);
  const hyOas = finite(baseline.hyOas ?? macroDrivers.credit?.hyOas);
  const us10y = finite(baseline.us10y);
  const real10y = finite(baseline.real10y);
  const dxy = finite(baseline.dxy);
  const crack = finite(brentLayer.crackSpread);
  const crack4w = finite(brentLayer.crackSpread4wChange);
  const qqqZ = finite(qqq?.zScore);
  const ndxZ = finite(ndx?.zScore);
  const ixicZ = finite(ixic?.zScore);
  const fed = macroDrivers.fedLiquidity || {};
  const policy = macroDrivers.policyExpectations || {};
  const curve = macroDrivers.curve || {};
  const credit = macroDrivers.credit || {};

  const evidenceHighlights = [
    evidence('score', '综合风险分', score, `综合风险分 ${score ?? '—'} / 100`, 'radar-data.score', score !== null && score >= 60 ? 'red' : score !== null && score >= 40 ? 'yellow' : 'green'),
    evidence('module_breakdown', '六大模块计数', `${modules.red}/${modules.yellow}/${modules.green}`, `${modules.red} 红 / ${modules.yellow} 黄 / ${modules.green} 绿`, 'radar-data.modules'),
    evidence('world_order_overlay', '世界秩序压力', woScore, `世界秩序压力 ${woScore ?? '—'}(${woLabel})`, 'data/world-order-stress.json', woScore !== null && woScore >= 65 ? 'red' : 'yellow'),
    evidence('oil_directional', '油价方向压力研判', oil.finalBiasZh, `ODP: ${oil.finalBiasZh}`, 'oil-directional-pressure', oil.finalBias === 'insufficient_data' ? 'neutral' : 'yellow'),
    evidence('brent_price', '布伦特', brent, `布伦特 ${fixed(brent, 1)}`, 'displayInputsBaseline.brent'),
    evidence('oil_physical_inventory', '商业原油库存', oil.crudeVs5yPct, `商业原油库存较 5 年同期 ${percent(oil.crudeVs5yPct)}`, 'oil-directional-pressure'),
    evidence('oil_distillate_inventory', '馏分油库存', oil.distillateVs5yPct, `馏分油库存较 5 年同期 ${percent(oil.distillateVs5yPct)}`, 'oil-directional-pressure'),
    evidence('credit_spread', '高收益债利差', hyOas, `高收益债利差 ${fixed(hyOas, 2)}%`, 'macroDrivers.credit.hyOas', hyOas !== null && hyOas >= 5 ? 'red' : hyOas !== null && hyOas >= 3.5 ? 'yellow' : 'green'),
    evidence('vix', '波动率指数', vix, `VIX ${fixed(vix, 1)}`, 'displayInputsBaseline.vix', vix !== null && vix >= 28 ? 'red' : vix !== null && vix >= 20 ? 'yellow' : 'green'),
    evidence('qqq_zscore', '成长股温度', qqqZ, `QQQ ${signed(qqqZ, 2)}σ`, 'market-pricing-metrics.qqq', qqqZ !== null && qqqZ >= 2 ? 'red' : qqqZ !== null && qqqZ >= 1 ? 'yellow' : 'green'),
    evidence('policy_path', '政策路径', finite(policy.futureMinusTargetMid), `期货隐含与目标中值差 ${signedBp(policy.futureMinusTargetMid, 1)}`, 'macroDrivers.policyExpectations'),
    evidence('repo_spread', '回购利差', finite(fed.bgcrSofrSpread), `BGCR-SOFR ${signedBp(fed.bgcrSofrSpread, 0)}`, 'macroDrivers.fedLiquidity'),
    evidence('us10y', '美国10年期收益率', us10y, `10Y ${fixed(us10y, 2)}%`, 'displayInputsBaseline.us10y'),
    evidence('real10y', '实际利率', real10y, `实际利率 ${fixed(real10y, 2)}%`, 'displayInputsBaseline.real10y'),
    evidence('dxy', '美元指数', dxy, `DXY ${fixed(dxy, 1)}`, 'displayInputsBaseline.dxy'),
  ];

  return {
    version: MACRO_OVERVIEW_NARRATIVE_VERSION,
    sourceMode: 'local_frontend_evidence_pack',
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsCrossValidation: false,
      affectsGlobalRiskHeatmap: false,
      usesExternalAi: false,
    },
    scorecard: {
      score,
      bandZh: riskBandZh(score),
      scoreChange7d: finite(radarData?.scoreChange7d),
      scoreChangeText: scoreChangeText(radarData?.scoreChange7d),
      moduleBreakdown: modules,
      macroState: textValue(dailyBrief.macroState),
      oneLineConclusion: textValue(dailyBrief.oneLineConclusion),
      dominantRiskChain: dailyBrief.dominantRiskChain || null,
      largestDivergence: dailyBrief.largestDivergence || null,
    },
    energyOil: {
      brent,
      crack,
      crack4w,
      oil,
      brentLayerSource: textValue(brentLayer.selectedBrent?.source),
    },
    marketCredit: {
      vix,
      hyOas,
      igOas: finite(credit.igOas),
      nfci: finite(credit.nfci),
      nfciRegime: textValue(credit.nfciRegime),
      qqqZ,
      ndxZ,
      ixicZ,
    },
    policyLiquidity: {
      dxy,
      us10y,
      real10y,
      breakeven10y: finite(baseline.breakeven10y),
      policyTone: textValue(policy.policyTone),
      minutesPolicyTone: textValue(policy.minutesPolicyTone),
      futureMinusTargetMid: finite(policy.futureMinusTargetMid),
      oisForwardRate: finite(policy.oisForwardRate),
      t10y2y: finite(curve.t10y2y),
      curveRegime: textValue(curve.regime),
      onRrpLevel: textValue(fed.onRrpLevel),
      repoSpreadRegime: textValue(fed.repoSpreadRegime),
      bgcrSofrSpread: finite(fed.bgcrSofrSpread),
    },
    worldOrder: {
      score: woScore,
      labelZh: woLabel,
      state: textValue(worldOrderStressData?.state),
      confidence: finite(worldOrderStressData?.confidence),
    },
    triggers: Array.isArray(dailyBrief.keyTriggers) ? dailyBrief.keyTriggers.filter((item) => typeof item === 'string') : [],
    invalidationSignals: Array.isArray(dailyBrief.invalidationSignals) ? dailyBrief.invalidationSignals.filter((item) => typeof item === 'string') : [],
    evidenceHighlights,
  };
}

function topModuleText(modules) {
  return modules.top
    .map((row) => `${row.labelZh} ${row.score}`)
    .join('、');
}

function buildSections(pack) {
  const score = pack.scorecard;
  const counts = score.moduleBreakdown;
  const scoreSection = {
    key: 'scorecard',
    titleZh: '总分与广度',
    sourceIndicators: ['radar-data.score', 'radar-data.modules', 'data/world-order-stress.json'],
    summaryZh: `本期原始风险分 ${score.score ?? '—'}/100,${score.scoreChangeText},落在「${score.bandZh}」;六大模块 ${counts.red} 红 / ${counts.yellow} 黄 / ${counts.green} 绿,主压力集中在 ${topModuleText(counts)}。世界秩序压力 ${pack.worldOrder.score ?? '—'}(${pack.worldOrder.labelZh})让有效语气仍偏谨慎。`,
    compactZh: `原始风险分 ${score.score ?? '—'}/100,${score.scoreChangeText};六大模块 ${counts.red} 红 / ${counts.yellow} 黄 / ${counts.green} 绿,世界秩序压力 ${pack.worldOrder.score ?? '—'}(${pack.worldOrder.labelZh})维持谨慎语气。`,
  };

  const oil = pack.energyOil.oil;
  const oilOverlay = oil.globalOverlay;
  const oilSection = {
    key: 'oil_directional_pressure',
    titleZh: '油价方向压力',
    sourceIndicators: ['displayInputsBaseline.brent', 'brentPricingLayer', 'oil-directional-pressure'],
    summaryZh: oil.available
      ? `油价是本期主叙事的关键证据:布伦特 ${fixed(pack.energyOil.brent, 1)},近 4 周 ${percent(oil.brentChangePct4w)},但 ODP 判为「${oil.finalBiasZh}」,物理层为「${oil.physicalBiasZh}」。商业原油库存较 5 年同期 ${percent(oil.crudeVs5yPct)},馏分油库存 ${percent(oil.distillateVs5yPct)},炼厂 4 周开工 ${fixed(oil.refineryUtilAvg4w, 1)}%;${oilOverlay ? `${oilOverlay.effectZh}(${oilOverlay.confirmationCount ?? 0} 项确认)` : '全球慢变量待确认'}。这意味着油价回落不能直接当作能源风险解除。`
      : `油价方向压力研判暂不可用,能源链条仅保留布伦特 ${fixed(pack.energyOil.brent, 1)} 与裂解价差 ${fixed(pack.energyOil.crack, 1)} 的公开代理观察。`,
    compactZh: oil.available
      ? `油价表面近 4 周 ${percent(oil.brentChangePct4w)},但 ODP 为「${oil.finalBiasZh}」;商业原油库存 ${percent(oil.crudeVs5yPct)}、馏分油 ${percent(oil.distillateVs5yPct)},油价回落不能直接视为能源风险解除。`
      : `ODP 暂不可用,能源链条仅保留布伦特与裂解价差观察。`,
  };

  const market = pack.marketCredit;
  const marketSection = {
    key: 'market_credit_confirmation',
    titleZh: '市场与信用确认',
    sourceIndicators: ['market-pricing-metrics.qqq', 'displayInputsBaseline.vix', 'macroDrivers.credit'],
    summaryZh: `反向证据主要来自信用与波动:高收益债利差 ${fixed(market.hyOas, 2)}%,投资级利差 ${fixed(market.igOas, 2)}%,金融条件指数 ${signed(market.nfci, 2)}(${market.nfciRegime || '—'}),VIX ${fixed(market.vix, 1)}。成长股温度仍偏高:QQQ ${signed(market.qqqZ, 2)}σ,NDX ${signed(market.ndxZ, 2)}σ,IXIC ${signed(market.ixicZ, 2)}σ;说明资产定价偏热,但信用端尚未给出恐慌式确认。`,
    compactZh: `信用与波动仍是托底反证:HY OAS ${fixed(market.hyOas, 2)}%、VIX ${fixed(market.vix, 1)}未显示恐慌;QQQ ${signed(market.qqqZ, 2)}σ仍偏热,但未被信用全面验证。`,
  };

  const policy = pack.policyLiquidity;
  const policyTone = policy.minutesPolicyTone || policy.policyTone || '—';
  const policySection = {
    key: 'policy_liquidity',
    titleZh: '政策与流动性',
    sourceIndicators: ['macroDrivers.policyExpectations', 'macroDrivers.fedLiquidity', 'displayInputsBaseline.us10y'],
    summaryZh: `政策端仍不宽松:美联储语气 ${policyTone},期货隐含与目标中值差 ${signedBp(policy.futureMinusTargetMid, 1)},OIS 1 年 ${fixed(policy.oisForwardRate, 2)}%;10 年美债 ${fixed(policy.us10y, 2)}%,实际利率 ${fixed(policy.real10y, 2)}%,DXY ${fixed(policy.dxy, 1)}。流动性层面,逆回购水位为「${policy.onRrpLevel || '—'}」,但 BGCR-SOFR ${signedBp(policy.bgcrSofrSpread, 0)}、回购状态「${policy.repoSpreadRegime || '—'}」,更像资金水位偏紧,不是隔夜市场失序。`,
    compactZh: `政策端仍偏紧:美联储语气 ${policyTone},10Y ${fixed(policy.us10y, 2)}%、实际利率 ${fixed(policy.real10y, 2)}%、DXY ${fixed(policy.dxy, 1)};逆回购偏低但回购利差正常,不是隔夜失序。`,
  };

  const triggerText = pack.triggers.slice(0, 2).map((item) => item.replace(/[。；;\s]+$/u, '')).join('；');
  const invalidationText = pack.invalidationSignals.slice(0, 2).map((item) => item.replace(/[。；;\s]+$/u, '')).join('；');
  const conclusionSection = {
    key: 'conclusion',
    titleZh: '结论与观察',
    sourceIndicators: ['dailyBrief.keyTriggers', 'dailyBrief.invalidationSignals'],
    summaryZh: `结论不是信用断裂式危机,而是能源物理链、世界秩序压力与偏紧政策共同抬高尾部风险,信用和波动仍暂时托底。后续若 ${triggerText || '能源、利率或信用压力继续扩张'},高风险语气会增强;若 ${invalidationText || '油价与利率同步回落且信用未扩张'},本轮压力可回到普通观察。`,
    compactZh: `结论更像高风险观察而非信用断裂:能源物理链与政策利率抬高尾部风险,信用和波动暂时托底;后续看 Brent/10Y/HY OAS/VIX 是否同步扩张。`,
  };

  return [scoreSection, oilSection, marketSection, policySection, conclusionSection];
}

export function buildMacroOverviewNarrativePlan(inputs = {}) {
  const evidencePack = buildMacroOverviewEvidencePack(inputs);
  const sections = buildSections(evidencePack);
  return {
    version: MACRO_OVERVIEW_NARRATIVE_VERSION,
    sourceMode: evidencePack.sourceMode,
    budget: MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET,
    boundaries: evidencePack.boundaries,
    sections,
    evidenceHighlights: evidencePack.evidenceHighlights,
    evidencePack,
  };
}

export function buildMacroOverviewHeadline(inputs = {}) {
  const pack = buildMacroOverviewEvidencePack(inputs);
  const rawBand = pack.scorecard.bandZh || '数据待确认';
  const worldOrderScore = finite(pack.worldOrder.score);
  if ((rawBand === '观察期' || rawBand === '中度警戒') && worldOrderScore !== null && worldOrderScore >= 65) {
    return '高风险预警';
  }
  return rawBand === '数据待确认' ? '判读待确认' : rawBand;
}

export function buildMacroOverviewVerdictBodyFromPlan(plan) {
  const sections = Array.isArray(plan?.sections) ? plan.sections : [];
  const detailed = sections.map((section) => section.summaryZh).filter(Boolean).join('');
  const compact = sections.map((section) => section.compactZh || section.summaryZh).filter(Boolean).join('');
  if (byteLength(detailed) <= MACRO_OVERVIEW_NARRATIVE_BYTE_BUDGET.max) return detailed;
  return compact;
}

export function buildMacroOverviewVerdictBody(inputs = {}) {
  return buildMacroOverviewVerdictBodyFromPlan(buildMacroOverviewNarrativePlan(inputs));
}
