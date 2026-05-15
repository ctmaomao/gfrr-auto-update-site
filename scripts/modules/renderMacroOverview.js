import { $ } from './config.js?v=28.0M-42V';
import { ASSESSMENT_LABELS, buildCrossValidationMatrix } from './buildCrossValidationMatrix.js?v=28.0M-42V';
import { formatFiniteNumber } from './format.js?v=28.0M-42V';

const WAITING = '等待接入';
const INSUFFICIENT = '数据不足';
const UNDECIDED = '暂无法判断';
const NO_HISTORY = '暂无历史对比';
const MARKET_TEMPERATURE_WAITING_STATUS = '等待历史周线数据接入';
const MARKET_TEMPERATURE_METRICS_PATH = 'data/market-pricing-metrics.json';
const MARKET_TEMPERATURE_DISCLAIMER = '本数据为统计描述，不构成投资建议。';

const MARKET_TEMPERATURE_BUCKETS = {
  'extreme-hot': {
    label: '极度过热',
    interpretation: (distance) => `QQQ 当前价格距离 60 周均值 ${distance} 个标准差，处于历史第二极端区间。`,
  },
  hot: {
    label: '显著偏热',
    interpretation: (distance) => `QQQ 当前价格高于 60 周均值 ${distance} 个标准差，价格温度显著偏热。`,
  },
  neutral: {
    label: '中性区间',
    interpretation: (distance) => `QQQ 当前价格距离 60 周均值 ${distance} 个标准差，仍处于中性温度区间。`,
  },
  cold: {
    label: '显著偏冷',
    interpretation: (distance) => `QQQ 当前价格低于 60 周均值 ${distance} 个标准差，价格温度显著偏冷。`,
  },
  'extreme-cold': {
    label: '极度偏冷',
    interpretation: (distance) => `QQQ 当前价格低于 60 周均值 ${distance} 个标准差，处于历史低温极端区间。`,
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = UNDECIDED) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Number.isFinite(value)) return String(value);
  return fallback;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 1, suffix = '') {
  const number = finite(value);
  return number === null ? INSUFFICIENT : `${number.toFixed(digits)}${suffix}`;
}

function formatSignedPercent(value, digits = 2) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}${formatFiniteNumber(Math.abs(number), digits)}%`;
}

function formatUsdTrillions(value) {
  const number = finite(value);
  return number === null ? INSUFFICIENT : `$${formatFiniteNumber(number, 2)}T`;
}

function formatUsdBillionsFromFedChange(value) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}$${formatFiniteNumber(Math.abs(number) * 100, 0)}B`;
}

function findActiveSignal(activeSignals, key) {
  return safeArray(activeSignals).find((signal) => signal?.key === key) || null;
}

function onRrpAnnotation(signal) {
  return signal ? '（告急）' : '';
}

function formatScore(value) {
  const number = finite(value);
  return number === null ? '等待数据校准' : `${Math.round(number)}`;
}

function formatChange(value) {
  const number = finite(value);
  if (number === null) return NO_HISTORY;
  if (number === 0) return '基本持平';
  return `${number > 0 ? '上升' : '回落'} ${Math.abs(number).toFixed(0)} 点`;
}

function evidenceStrengthFromConfidence(confidence, fallback = '等待校准') {
  const level = String(confidence?.level || '').toLowerCase();
  if (level === 'high') return '较强';
  if (level === 'medium') return '中等';
  if (level === 'low') return '偏低';
  const score = finite(confidence?.score ?? confidence);
  if (score === null) return fallback;
  if (score > 1 && score >= 75) return '较强';
  if (score > 1 && score >= 45) return '中等';
  if (score > 1) return '偏低';
  if (score >= 0.7) return '较强';
  if (score >= 0.4) return '中等';
  return '偏低';
}

function statusFromScore(score) {
  const number = finite(score);
  if (number === null) return UNDECIDED;
  if (number >= 75) return '压力较高';
  if (number >= 55) return '压力上升';
  if (number >= 35) return '观察中';
  return '相对平稳';
}

function stageFromScore(score, explicitStage = '') {
  const explicit = String(explicitStage || '');
  if (explicit.includes('系统性危机')) return '系统性危机';
  const number = finite(score);
  if (number === null) return UNDECIDED;
  if (number >= 85) return '系统性风险观察';
  if (number >= 65) return '局部冲击观察';
  if (number >= 50) return '压力上升';
  return '正常观察';
}

function buildMacroStateText(score, stage) {
  if (score === null) return UNDECIDED;
  if (stage === '系统性危机') {
    return '当前阶段显示为系统性危机；该结论必须由上游模型和多项证据明确支持。';
  }
  if (stage === '系统性风险观察') {
    return '当前更接近系统性风险观察阶段，尚未进入系统性危机。';
  }
  return `当前更接近${stage}阶段，尚未进入系统性危机。`;
}

function directionFromDelta(value, positiveLabel = '边际上升', negativeLabel = '边际回落') {
  const number = finite(value);
  if (number === null) return '方向待确认';
  if (number > 0) return positiveLabel;
  if (number < 0) return negativeLabel;
  return '基本持平';
}

function firstExisting(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function hasValue(value) {
  return finite(value) !== null;
}

function hasPartialWorldOrder(worldOrderStressData) {
  return String(worldOrderStressData?.freshness || '').toLowerCase() === 'partial'
    || safeArray(worldOrderStressData?.warnings).length > 0;
}

function normalizeEvidenceList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (isPlainObject(item)) return formatStructuredEvidenceItem(item).trim();
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function confidenceLabel(value, fallback = '等待校准') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return evidenceStrengthFromConfidence(value, fallback);
}

function dataCoverageLabel(value = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '数据覆盖：等待校准';
}

function createJudgment(overrides = {}) {
  return {
    id: text(overrides.id, 'judgment'),
    title: text(overrides.title, '判断项'),
    group: text(overrides.group, 'macro-overview'),
    status: text(overrides.status, UNDECIDED),
    direction: text(overrides.direction, '方向待确认'),
    stage: text(overrides.stage, ''),
    score: overrides.score ?? null,
    confidence: confidenceLabel(overrides.confidence),
    dataCoverage: dataCoverageLabel(overrides.dataCoverage),
    evidence: normalizeEvidenceList(overrides.evidence),
    missingEvidence: normalizeEvidenceList(overrides.missingEvidence),
    counterEvidence: normalizeEvidenceList(overrides.counterEvidence),
    noiseWarning: normalizeEvidenceList(overrides.noiseWarning),
    explanation: text(overrides.explanation, ''),
    sourceType: text(overrides.sourceType, '数据推断'),
    updatedAt: typeof overrides.updatedAt === 'string' && overrides.updatedAt.trim() ? overrides.updatedAt.trim() : null,
    conclusion: text(overrides.conclusion, ''),
    priority: finite(overrides.priority),
  };
}

function createDataGapJudgment(overrides = {}) {
  return createJudgment({
    status: INSUFFICIENT,
    direction: '方向待确认',
    confidence: '偏低',
    dataCoverage: '数据覆盖：关键数据不足',
    sourceType: '数据不足',
    ...overrides,
  });
}

function normalizeJudgmentList(value) {
  return safeArray(value).map((item, index) => createJudgment({
    id: `judgment-${index + 1}`,
    title: `判断 ${index + 1}`,
    ...(isPlainObject(item) ? item : { evidence: item }),
  }));
}

function buildTodayJudgment(data, healthDashboard, worldOrderStressData, marketPricingMetricsData = null) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const confidence = isPlainObject(brief.confidence) ? brief.confidence : {};
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  const score = finite(data?.score);
  const healthScore = firstExisting(
    healthDashboard?.score,
    data?.dailyRealtimeInput?.healthScore,
    data?.confidenceScore
  );
  const dataGapCount = safeArray(brief.dataGaps).length + safeArray(brentLayer.dataGaps).length;
  const stage = stageFromScore(score, data?.currentCrisisPhase);
  const evidenceStrength = dataGapCount > 3 || hasPartialWorldOrder(worldOrderStressData)
    ? '中等'
    : evidenceStrengthFromConfidence(confidence, '中等');
  const macroState = buildMacroStateText(score, stage);
  const fallbackLine = [
    hasValue(inputs.brent) ? '能源压力仍是主线' : '',
    hasValue(inputs.us10y) ? '长端利率需要继续观察' : '',
    hasValue(inputs.hyOas) && Number(inputs.hyOas) < 4 ? '信用压力暂未明显扩散' : '',
  ].filter(Boolean).join('；');
  const dataCoverageText = Number.isFinite(Number(healthScore))
    ? `${Math.round(Number(healthScore))}%；${marketMetric ? '市场温度已接入' : '市场温度仍需补齐'}，实物能源证据仍需补齐`
    : '等待数据校准';
  const todayEvidence = [
    text(brief.oneLineConclusion, fallbackLine || '当前结论强度有限，仍需等待更多跨市场证据。'),
  ];
  if (marketMetric) todayEvidence.push(marketMetric.evidenceLine);
  const missingEvidence = marketMetric
    ? ['实物能源证据仍需补齐。']
    : ['市场温度历史数据尚未接入。', '实物能源证据仍需补齐。'];

  return {
    ...createJudgment({
      id: 'today-total-judgment',
      title: '今日总判断',
      group: 'today',
      status: macroState,
      direction: formatChange(data?.scoreChange1d),
      stage,
      score: score === null ? null : Math.round(score),
      confidence: evidenceStrength,
      dataCoverage: dataCoverageText,
      evidence: todayEvidence,
      missingEvidence,
      explanation: macroState,
      sourceType: '模型判断',
      updatedAt: text(brief.generatedAt, text(data?.updatedAt, '')),
    }),
    macroState,
    oneLine: text(brief.oneLineConclusion, fallbackLine || '当前结论强度有限，仍需等待更多跨市场证据。'),
    score: formatScore(score),
    stage,
    change: formatChange(data?.scoreChange1d),
    evidenceStrength,
    dataCoverage: dataCoverageText,
  };
}

function buildPressureSources(data, worldOrderStressData) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const worldScore = finite(worldOrderStressData?.score);
  const hyOas = finite(inputs.hyOas);
  const vix = finite(inputs.vix);
  const brent = finite(inputs.brent);
  const us10y = finite(inputs.us10y);
  const real10y = finite(inputs.real10y);
  const dxy = finite(inputs.dxy);
  const energyGaps = safeArray(brentLayer.dataGaps);
  const worldFreshness = text(worldOrderStressData?.freshness, INSUFFICIENT);

  return [
    createJudgment({
      id: 'pressure-energy-inflation',
      title: '能源与通胀压力',
      group: 'pressure-source',
      status: brent === null ? INSUFFICIENT : brent >= 100 ? '主要压力' : '观察中',
      direction: brent === null ? '方向待确认' : brent >= 100 ? '压力上升' : '观察中',
      confidence: brent === null ? '偏低' : '中等',
      dataCoverage: energyGaps.length ? '数据覆盖：部分缺口' : '数据覆盖：等待校准',
      evidence: [`布伦特 ${formatNumber(brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`],
      missingEvidence: energyGaps.length ? ['Dated Brent、期限结构和裂解价差仍待验证。'] : [],
      explanation: energyGaps.length
        ? '价格压力存在，但 Dated Brent、期限结构和裂解价差仍待验证。'
        : '能源压力仍需与通胀预期和实物端交叉确认。',
      sourceType: brent === null ? '数据不足' : '数据推断',
      priority: brent === null ? 4 : brent >= 100 ? 1 : 2,
    }),
    createJudgment({
      id: 'pressure-rates-liquidity',
      title: '长端利率与流动性',
      group: 'pressure-source',
      status: us10y === null && real10y === null && dxy === null ? INSUFFICIENT : '观察中',
      direction: us10y !== null && us10y >= 4.25 ? '压力上升' : '观察中',
      confidence: '中等',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [`10年期 ${formatNumber(us10y, 2, '%')}；实际利率 ${formatNumber(real10y, 2, '%')}；广义美元 ${formatNumber(dxy, 2)}`],
      missingEvidence: ['信用市场扩散确认仍需观察。'],
      explanation: '长端利率和美元偏紧需要信用市场继续确认。',
      priority: us10y !== null && us10y >= 4.25 ? 2 : 3,
    }),
    createJudgment({
      id: 'pressure-credit',
      title: '信用压力',
      group: 'pressure-source',
      status: hyOas === null && vix === null ? INSUFFICIENT : hyOas !== null && hyOas < 4 && vix !== null && vix < 22 ? '暂未扩散' : '观察中',
      direction: hyOas !== null && hyOas < 4 ? '基本平稳' : '方向待确认',
      confidence: hyOas !== null && vix !== null ? '中等' : '偏低',
      dataCoverage: hyOas !== null && vix !== null ? '数据覆盖：部分缺口' : '数据覆盖：关键数据不足',
      evidence: [`高收益利差 ${formatNumber(hyOas, 2, '%')}；VIX ${formatNumber(vix, 2)}`],
      counterEvidence: hyOas !== null && hyOas < 4 && vix !== null && vix < 22 ? ['信用和波动率尚未给出同步扩散确认。'] : [],
      explanation: '信用和波动率尚未给出同步扩散确认。',
      priority: hyOas !== null && hyOas < 4 ? 4 : 2,
    }),
    createJudgment({
      id: 'pressure-world-order',
      title: '世界秩序压力',
      group: 'pressure-source',
      status: worldScore === null ? INSUFFICIENT : hasPartialWorldOrder(worldOrderStressData) ? '观察中' : statusFromScore(worldScore),
      direction: hasPartialWorldOrder(worldOrderStressData) ? '方向待确认' : '观察中',
      confidence: evidenceStrengthFromConfidence(worldOrderStressData?.confidence, '偏低'),
      dataCoverage: hasPartialWorldOrder(worldOrderStressData) ? '数据覆盖：部分缺口' : '数据覆盖：等待校准',
      evidence: [worldScore === null ? '世界秩序压力数据不足。' : `结构性压力分数 ${Math.round(worldScore)}；freshness=${worldFreshness}`],
      missingEvidence: hasPartialWorldOrder(worldOrderStressData) ? ['部分外部来源仍为 stale / manual_required / not_configured。'] : [],
      explanation: '结构性背景有参考价值，但来源新鲜度仍不完整。',
      sourceType: worldScore === null ? '数据不足' : '数据推断',
      priority: worldScore === null ? 5 : 3,
    }),
    createJudgment({
      id: 'pressure-consumer',
      title: '消费者体感',
      group: 'pressure-source',
      status: finite(consumer.umichSentiment) === null ? WAITING : '观察中',
      direction: directionFromDelta(consumer.threeMonthChange),
      confidence: finite(consumer.umichSentiment) === null ? '偏低' : '中等',
      dataCoverage: finite(consumer.umichSentiment) === null ? '数据覆盖：关键数据不足' : '数据覆盖：部分缺口',
      evidence: [finite(consumer.umichSentiment) === null ? 'UMCSENT 等待接入或刷新。' : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`],
      missingEvidence: ['PMI、就业广度和高频消费证据仍待接入。'],
      explanation: '月频慢变量只说明体感背景，不足以单独判断增长拐点。',
      sourceType: finite(consumer.umichSentiment) === null ? '数据不足' : '事实',
      priority: 5,
    }),
  ].sort((a, b) => a.priority - b.priority).map(({ priority, ...item }) => item);
}

function buildSignalLayers(data, marketPricingMetricsData = null) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const largestDivergence = isPlainObject(brief.largestDivergence) ? brief.largestDivergence : {};
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  const verified = [];
  const pending = [];

  if (hasValue(inputs.brent) && hasValue(inputs.breakeven10y) && hasValue(inputs.us10y)) {
    verified.push('能源、通胀预期与长端利率同时构成当前主观察链条。');
  }
  if (hasValue(inputs.hyOas) && hasValue(inputs.vix) && Number(inputs.hyOas) < 4 && Number(inputs.vix) < 22) {
    verified.push('信用利差和波动率暂未显示明显扩散。');
  }
  if (marketMetric) {
    verified.push(`${marketMetric.evidenceLine} 市场温度已可作为当前主判断的价格层确认。`);
  }
  if (largestDivergence.summaryZh) pending.push(largestDivergence.summaryZh);
  pending.push('能源价格处于观察区间，但实物端验证数据仍不足。');
  const dataGapEvidence = [
    'Platts Dated Brent / 正式 Dated Brent 尚未接入。',
    'Brent 期限结构、crack spread / diesel stress、shipping / freight 仍待接入。',
    ...safeArray(brentLayer.dataGaps).slice(0, 1),
  ];
  if (!marketMetric) dataGapEvidence.unshift('Nasdaq / QQQ 周线历史尚未接入。');

  return [
    createJudgment({
      id: 'signal-verified',
      title: '已验证信号',
      group: 'signal-layer',
      status: verified.length ? '已有验证' : '暂无法判断',
      confidence: verified.length ? '中等' : '偏低',
      dataCoverage: verified.length ? '数据覆盖：部分缺口' : '数据覆盖：关键数据不足',
      evidence: verified,
      conclusion: '暂无强验证信号。',
      sourceType: verified.length ? '数据推断' : '数据不足',
    }),
    createJudgment({
      id: 'signal-pending',
      title: '待验证信号',
      group: 'signal-layer',
      status: pending.length ? '观察中' : '暂无法判断',
      confidence: '偏低',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: pending,
      conclusion: '暂无待验证信号。',
      sourceType: '数据推断',
    }),
    createJudgment({
      id: 'signal-noise',
      title: '噪音提示',
      group: 'signal-layer',
      status: '观察中',
      confidence: '中等',
      dataCoverage: '数据覆盖：部分缺口',
      noiseWarning: [
        '单一价格变化不足以形成强结论。',
        '短期市场波动需要信用、利率、能源和风险资产之间的交叉确认。',
      ],
      conclusion: '暂无噪音提示。',
      sourceType: '数据推断',
    }),
    createDataGapJudgment({
      id: 'signal-data-gap',
      title: '数据不足',
      group: 'signal-layer',
      evidence: dataGapEvidence,
      conclusion: '暂无额外数据缺口。',
    }),
  ];
}

function buildMacroDrivers(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const consumer = isPlainObject(macroDrivers.consumer) ? macroDrivers.consumer : {};
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  const curve = isPlainObject(macroDrivers.curve) ? macroDrivers.curve : {};
  const credit = isPlainObject(macroDrivers.credit) ? macroDrivers.credit : {};
  const onRrpSignal = findActiveSignal(macroDrivers.activeSignals, 'onRrpCritical');
  const hyOas = finite(inputs.hyOas);
  const igOas = finite(credit.igOas);
  const igHyRatio = finite(credit.igHyRatio);
  const t10y2y = finite(curve.t10y2y);
  const onRrp = finite(fedLiquidity.onRrp);
  const effectiveFedFundsRate = finite(fedLiquidity.effectiveFedFundsRate);
  const sofr = finite(fedLiquidity.sofr);
  const walcl4wChange = finite(fedLiquidity.walcl4wChange);
  const vix = finite(inputs.vix);
  const creditCalm = hyOas !== null && hyOas < 4 && vix !== null && vix < 22;
  const policyProxyEvidence = [
    onRrp === null ? null : `ON RRP ${formatUsdTrillions(onRrp)}${onRrpAnnotation(onRrpSignal)} — 流动性紧`,
    finite(inputs.us10y) === null ? null : `10年期 ${formatNumber(inputs.us10y, 2, '%')} — 长端利率压力`,
    finite(inputs.dxy) === null ? null : `广义美元 ${formatNumber(inputs.dxy, 2)} — 美元强势`,
    effectiveFedFundsRate === null ? null : `联邦基金利率 ${formatNumber(effectiveFedFundsRate, 2, '%')} — 政策利率`,
    sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')} — 隔夜担保融资`,
    '综合判断：隐含政策路径偏紧',
  ].filter(Boolean);
  const hasPolicyProxy = policyProxyEvidence.length > 1;

  return [
    createJudgment({
      id: 'driver-growth',
      title: '增长',
      group: 'macro-driver',
      status: finite(consumer.umichSentiment) === null ? WAITING : '慢变量观察中',
      direction: directionFromDelta(consumer.threeMonthChange),
      confidence: finite(consumer.umichSentiment) === null ? '偏低' : '中等',
      dataCoverage: finite(consumer.umichSentiment) === null ? '数据覆盖：关键数据不足' : '数据覆盖：部分缺口',
      evidence: [finite(consumer.umichSentiment) === null ? '消费者信心数据不足。' : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`],
      missingEvidence: ['PMI、就业广度、盈利修正与高频消费证据等待接入。'],
      explanation: 'UMCSENT 是月频慢变量，只能提供体感背景，不能单独判断近端增长。',
      sourceType: finite(consumer.umichSentiment) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'driver-inflation',
      title: '通胀',
      group: 'macro-driver',
      status: finite(inputs.brent) === null ? INSUFFICIENT : Number(inputs.brent) >= 100 ? '压力上升' : '观察中',
      direction: finite(inputs.brent) !== null && Number(inputs.brent) >= 100 ? '压力上升' : '观察中',
      confidence: finite(inputs.brent) === null ? '偏低' : '中等',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [`布伦特 ${formatNumber(inputs.brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`],
      missingEvidence: ['Dated Brent、期限结构、裂解价差、柴油压力与库存数据等待接入。'],
      explanation: 'Brent 偏高可以提示能源压力，但不能单独证明广义通胀重新加速。',
      sourceType: finite(inputs.brent) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'driver-liquidity',
      title: '流动性',
      group: 'macro-driver',
      status: statusFromScore(data?.modules?.liquidity),
      direction: finite(inputs.dxy) !== null && Number(inputs.dxy) >= 105 ? '约束偏强' : '观察中',
      confidence: creditCalm ? '中等' : '偏低',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [
        `广义美元 ${formatNumber(inputs.dxy, 2)}；10年期 ${formatNumber(inputs.us10y, 2, '%')}；10Y-2Y 期限利差 ${formatSignedPercent(t10y2y)}`,
        `ON RRP 余额 ${formatUsdTrillions(onRrp)}${onRrpAnnotation(onRrpSignal)}；Fed 资产负债表 4周变化 ${formatUsdBillionsFromFedChange(walcl4wChange)}`,
        `高收益利差 (HY OAS) ${formatNumber(hyOas, 2, '%')}；投资级利差 (IG OAS) ${formatNumber(igOas, 2, '%')}；IG/HY 比率 ${formatNumber(igHyRatio, 2)}`,
      ],
      missingEvidence: ['SLOOS、回购市场压力、银行准备金和跨市场融资压力等待接入。'],
      counterEvidence: creditCalm ? ['信用与波动率尚未明显确认扩散。'] : [],
      explanation: creditCalm
        ? '长端利率和美元偏紧，但信用与波动率尚未明显确认扩散。'
        : '流动性压力需要与信用利差和波动率共同确认。',
    }),
    createJudgment({
      id: 'driver-policy',
      title: '政策',
      group: 'macro-driver',
      status: hasPolicyProxy ? '基于代理信号观察' : WAITING,
      direction: hasPolicyProxy ? '隐含偏紧' : '方向待确认',
      confidence: hasPolicyProxy ? '中等' : '偏低',
      dataCoverage: hasPolicyProxy ? '数据覆盖：代理信号' : '数据覆盖：关键数据不足',
      evidence: hasPolicyProxy ? policyProxyEvidence : ['暂无直接 Fed 预期或政策路径指标。'],
      missingEvidence: ['Fed 官方预期声明 / dot plot、政策路径 / 市场隐含利率、政策沟通文本分析仍缺位。'],
      explanation: hasPolicyProxy
        ? '基于 ON RRP / 长端利率 / 美元强势等代理信号，当前隐含的政策路径偏紧。（注意：本项不基于官方 Fed 预期数据）'
        : '当前不伪造政策立场；除非接入明确政策预期数据，否则政策不是强驱动。',
      sourceType: hasPolicyProxy ? '代理信号' : '数据不足',
    }),
  ];
}

function buildMarketTemperature() {
  return createDataGapJudgment({
    id: 'market-pricing-temperature',
    title: '市场定价温度计',
    group: 'market-temperature',
    status: MARKET_TEMPERATURE_WAITING_STATUS,
    evidence: ['Nasdaq / QQQ 周线历史', '60 周均值', '标准差', 'z-score'],
    missingEvidence: ['历史周线、60 周均值、标准差和 z-score 尚未接入。'],
    explanation: '该指标将用于识别市场相对中期趋势的冷热程度，不构成单独买卖信号。',
    conclusion: UNDECIDED,
  });
}

export function classifyZScoreBucket(zScore) {
  const value = finite(zScore);
  if (value === null) return 'neutral';
  if (value >= 2) return 'extreme-hot';
  if (value >= 1) return 'hot';
  if (value <= -2) return 'extreme-cold';
  if (value <= -1) return 'cold';
  return 'neutral';
}

function getMarketTemperatureBucketInfo(zScore) {
  const key = classifyZScoreBucket(zScore);
  return {
    key,
    ...MARKET_TEMPERATURE_BUCKETS[key],
  };
}

function formatSignedDecimal(value, digits = 2) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

function formatCurrency(value) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `$${number.toFixed(2)}`;
}

function isValidMetricRecord(record) {
  return isPlainObject(record)
    && typeof record.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/u.test(record.date)
    && typeof record.isoWeek === 'string'
    && /^\d{4}-W\d{2}$/u.test(record.isoWeek)
    && finite(record.close) !== null
    && finite(record.ma60) !== null
    && finite(record.stdDev60) !== null
    && finite(record.zScore) !== null;
}

function getMetricRecords(metricsData) {
  if (!isPlainObject(metricsData)) return [];
  const records = safeArray(metricsData.records);
  if (!records.length || !records.every(isValidMetricRecord)) return [];
  return records;
}

function getZScoreRange(records) {
  const values = records.map((record) => finite(record.zScore)).filter((value) => value !== null);
  if (!values.length) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getMarketPricingMetricContext(marketPricingMetricsData) {
  const records = getMetricRecords(marketPricingMetricsData);
  const latest = records[records.length - 1];
  if (!latest) return null;
  const bucket = getMarketTemperatureBucketInfo(latest.zScore);
  const zScoreText = formatSignedDecimal(latest.zScore, 2);
  const distance = Math.abs(finite(latest.zScore) || 0).toFixed(2);
  return {
    records,
    latest,
    bucket,
    zScoreText,
    distance,
    evidenceLine: `QQQ 周线 z-score = ${zScoreText}（${bucket.label}），${bucket.interpretation(distance)}`,
    metricLine: `QQQ close ${formatCurrency(latest.close)}；60 周均值 ${formatCurrency(latest.ma60)}；z-score ${zScoreText}（${bucket.label}）。`,
  };
}

function findDivergenceCheck(data, key) {
  return safeArray(data?.divergenceLayer?.checks).find((item) => item?.key === key) || {};
}

function buildRiskEngines(data, worldOrderStressData, marketPricingMetricsData = null) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  const credit = isPlainObject(macroDrivers.credit) ? macroDrivers.credit : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');
  const liquidityCheck = findDivergenceCheck(data, 'liquidity_vs_credit_transmission');
  const creditCalm = finite(inputs.hyOas) !== null && Number(inputs.hyOas) < 4 && finite(inputs.vix) !== null && Number(inputs.vix) < 22;
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  const onRrpSignal = findActiveSignal(macroDrivers.activeSignals, 'onRrpCritical');
  const onRrp = finite(fedLiquidity.onRrp);
  const sofr = finite(fedLiquidity.sofr);
  const reserveBalances = finite(fedLiquidity.reserveBalances);
  const reserveBalances4wChange = finite(fedLiquidity.reserveBalances4wChange);
  const igHyRatio = finite(credit.igHyRatio);

  return [
    createJudgment({
      id: 'engine-energy-inflation-transmission',
      title: '能源与通胀传导',
      group: 'risk-engine',
      status: finite(inputs.brent) === null ? INSUFFICIENT : '压力上升',
      direction: finite(inputs.brent) === null ? '方向待确认' : '压力上升',
      confidence: evidenceStrengthFromConfidence(brentLayer.confidence, '中等'),
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [text(brentLayer.summaryZh, `布伦特 ${formatNumber(inputs.brent, 1)}，通胀预期 ${formatNumber(inputs.breakeven10y, 2, '%')}。`)],
      missingEvidence: safeArray(brentLayer.dataGaps).slice(0, 3).length
        ? safeArray(brentLayer.dataGaps).slice(0, 3)
        : ['实物端证据等待接入。'],
      explanation: '当前只能确认公开价格压力，尚不能确认真实实物供应冲击。',
      sourceType: finite(inputs.brent) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'engine-rates-liquidity',
      title: '利率与流动性',
      group: 'risk-engine',
      status: text(ratesCheck.status, statusFromScore(data?.modules?.liquidity)),
      direction: '观察中',
      confidence: '中等',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [text(ratesCheck.summaryZh, `10年期 ${formatNumber(inputs.us10y, 2, '%')}；实际利率 ${formatNumber(inputs.real10y, 2, '%')}；广义美元 ${formatNumber(inputs.dxy, 2)}。`)],
      missingEvidence: safeArray(ratesCheck.limitations).slice(0, 1).length
        ? safeArray(ratesCheck.limitations).slice(0, 1)
        : ['资金面和期限结构证据等待接入。'],
      counterEvidence: creditCalm ? ['信用市场尚未明显确认扩散。'] : [],
      explanation: creditCalm
        ? '长端压力存在，但信用市场尚未明显确认扩散。'
        : '需要观察利率、美元、信用和波动率是否同向收紧。',
    }),
    createJudgment({
      id: 'engine-asset-pricing-mismatch',
      title: '资产定价错配',
      group: 'risk-engine',
      status: marketMetric ? marketMetric.bucket.label : text(pricingCheck.status, '观察中'),
      direction: '方向待确认',
      confidence: marketMetric ? '中等' : '偏低',
      dataCoverage: marketMetric ? '数据覆盖：部分缺口' : '数据覆盖：关键数据不足',
      evidence: [
        text(pricingCheck.summaryZh, '风险资产定价仍需与利率、信用和历史温度框架交叉确认。'),
        ...(marketMetric ? [marketMetric.metricLine] : []),
      ],
      missingEvidence: marketMetric ? [] : ['Nasdaq / QQQ 周线历史、60 周均值、标准差和 z-score 等待接入。'],
      explanation: marketMetric
        ? `市场温度计已接入：QQQ 当前为${marketMetric.bucket.label}，可与信用、利率和波动率共同观察错配。`
        : '市场温度计尚未就绪，因此只能保留错配观察，不能给出冷热程度。',
    }),
    createJudgment({
      id: 'engine-world-order',
      title: '世界秩序压力',
      group: 'risk-engine',
      status: worldOrderStressData?.labelZh || text(worldOrderStressData?.state, INSUFFICIENT),
      direction: hasPartialWorldOrder(worldOrderStressData) ? '方向待确认' : '观察中',
      confidence: evidenceStrengthFromConfidence(worldOrderStressData?.confidence, '偏低'),
      dataCoverage: hasPartialWorldOrder(worldOrderStressData) ? '数据覆盖：部分缺口' : '数据覆盖：等待校准',
      evidence: [finite(worldOrderStressData?.score) === null ? '世界秩序压力数据不足。' : `结构性压力分数 ${Math.round(Number(worldOrderStressData.score))}；freshness=${text(worldOrderStressData?.freshness, INSUFFICIENT)}`],
      missingEvidence: ['SIPRI / ACLED 等来源仍需补全或配置。'],
      explanation: '该引擎只识别结构性背景压力，不预测具体事件。',
      sourceType: finite(worldOrderStressData?.score) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'engine-financial-fragility',
      title: '金融脆弱性',
      group: 'risk-engine',
      status: text(liquidityCheck.status, statusFromScore(data?.modules?.banking)),
      direction: creditCalm ? '观察中' : '方向待确认',
      confidence: creditCalm ? '偏低' : '中等',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [
        text(liquidityCheck.summaryZh, `HY OAS ${formatNumber(inputs.hyOas, 2, '%')}；VIX ${formatNumber(inputs.vix, 2)}。`),
        `ON RRP ${formatUsdTrillions(onRrp)}${onRrpSignal ? '（历史低位告急）' : ''}`,
        `IG/HY 比率 ${formatNumber(igHyRatio, 2)}（信用层次性收缩）`,
        sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')} — 隔夜担保融资压力`,
        reserveBalances === null ? null : `银行准备金 ${formatUsdTrillions(reserveBalances / 1_000_000)}，4 周变化 ${formatSignedPercent(reserveBalances4wChange)}（系统流动性缓冲）`,
      ].filter(Boolean),
      missingEvidence: ['SLOOS、私募信贷、CRE、bank-specific stress、CDX 与更细信用指标等待接入。'],
      counterEvidence: creditCalm ? ['信用和波动率尚未显示系统性扩散。'] : [],
      explanation: creditCalm
        ? '信用和波动率尚未显示系统性扩散，金融脆弱性维持观察。'
        : '需要更细信用和银行压力数据才能提高结论强度。',
    }),
  ];
}

function buildCrossValidation(data, worldOrderStressData, marketPricingMetricsData = null) {
  return buildCrossValidationMatrix(data, worldOrderStressData, marketPricingMetricsData);
}

export function buildMacroOverview(data = {}, healthDashboard = {}, worldOrderStressData = {}, marketPricingMetricsData = null) {
  const crossValidationMatrix = buildCrossValidation(data, worldOrderStressData, marketPricingMetricsData);
  return {
    today: buildTodayJudgment(data, healthDashboard, worldOrderStressData, marketPricingMetricsData),
    pressures: buildPressureSources(data, worldOrderStressData),
    signalLayers: buildSignalLayers(data, marketPricingMetricsData),
    drivers: buildMacroDrivers(data),
    marketTemperature: buildMarketTemperature(),
    riskEngines: buildRiskEngines(data, worldOrderStressData, marketPricingMetricsData),
    crossValidation: crossValidationMatrix.narratives,
    crossValidationMatrix,
  };
}

function uniqueStrings(values, limit = 6) {
  const seen = new Set();
  return safeArray(values)
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, limit);
}

function directionType(value = '') {
  const source = String(value || '');
  if (source.includes('数据不足') || source.includes('等待') || source.includes('缺口')) return 'gap';
  if (source.includes('回落') || source.includes('下降') || source.includes('降温') || source.includes('暂未扩散') || source.includes('相对平稳')) return 'down';
  if (source.includes('上升') || source.includes('升高') || source.includes('主要压力') || source.includes('系统性风险观察')) return 'up';
  return 'flat';
}

function keyChangeTag(kind) {
  if (kind === 'up') return '▲ 风险升高';
  if (kind === 'down') return '▼ 风险下降';
  if (kind === 'gap') return '数据不足';
  return '→ 暂未确认';
}

function keyChange(kind, body, source = '') {
  return {
    kind,
    tag: keyChangeTag(kind),
    body,
    source,
  };
}

function buildKeyChanges(overview, data = {}, healthDashboard = {}) {
  const changes = [];
  const scoreChange = overview.today.change || NO_HISTORY;
  if (scoreChange && scoreChange !== NO_HISTORY) {
    changes.push(keyChange(
      directionType(scoreChange),
      `总分边际${scoreChange}，当前阶段为${overview.today.stage || UNDECIDED}。`,
      'scoreChange1d / 今日总判断'
    ));
  } else {
    changes.push(keyChange('gap', '暂无足够边际变化数据，本区仅展示已能确认的方向性提示。', 'scoreChange1d'));
  }

  const mainPressure = safeArray(overview.pressures)[0];
  if (mainPressure) {
    changes.push(keyChange(
      directionType(`${mainPressure.status} ${mainPressure.direction}`),
      `${mainPressure.title}：${mainPressure.status || UNDECIDED}，${mainPressure.explanation || '等待更多交叉确认。'}`,
      mainPressure.sourceType || 'pressure-source'
    ));
  }

  const signalCounts = buildSignalCounts(overview.signalLayers);
  if (signalCounts.gap > 0 || signalCounts.pending > 0) {
    changes.push(keyChange(
      signalCounts.gap > 0 ? 'gap' : 'flat',
      `信号分层仍有 ${signalCounts.pending} 项待验证、${signalCounts.gap} 项数据不足，暂不放大结论强度。`,
      'SIGNAL LAYERS'
    ));
  }

  const engineCounts = buildEngineCounts(overview.riskEngines);
  changes.push(keyChange(
    engineCounts.rising > 0 ? 'up' : engineCounts.gap > 0 ? 'gap' : 'flat',
    `风险引擎显示 ${engineCounts.rising} 项压力上升 / 主要观察，${engineCounts.counter} 项反向证据，${engineCounts.gap} 项数据不足。`,
    'RISK ENGINES'
  ));

  const validationCounts = buildValidationCounts(overview.crossValidation);
  changes.push(keyChange(
    validationCounts.gap > 0 ? 'gap' : validationCounts.pending > 0 ? 'flat' : 'down',
    `交叉验证仍有 ${validationCounts.pending} 项待验证、${validationCounts.gap} 项数据不足，反向证据不隐藏。`,
    'CROSS VALIDATION'
  ));

  const healthScore = finite(healthDashboard?.score ?? data?.dailyRealtimeInput?.healthScore ?? data?.confidenceScore);
  if (healthScore !== null) {
    changes.push(keyChange(
      healthScore >= 80 ? 'down' : healthScore >= 60 ? 'flat' : 'gap',
      `数据健康约 ${Math.round(healthScore)}%，仍需结合缺失证据判断结论强度。`,
      'data health'
    ));
  }

  return changes.slice(0, 6);
}

function collectMissingEvidence(judgments, limit = 4) {
  return uniqueStrings(safeArray(judgments).flatMap((judgment) => normalizeEvidenceList(judgment?.missingEvidence)), limit);
}

function watchItem(group, title, desc, meta = '') {
  return { group, title, desc, meta };
}

function buildWatchList(overview, data = {}) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const triggers = uniqueStrings(brief.keyTriggers, 3);
  const invalidations = uniqueStrings(brief.invalidationSignals, 3);
  const pressureGaps = collectMissingEvidence(overview.pressures, 2);
  const engineGaps = collectMissingEvidence(overview.riskEngines, 2);
  const validationGaps = collectMissingEvidence(overview.crossValidation, 2);
  const counterSignals = uniqueStrings([
    ...safeArray(overview.pressures).flatMap((judgment) => normalizeEvidenceList(judgment.counterEvidence)),
    ...safeArray(overview.riskEngines).flatMap((judgment) => normalizeEvidenceList(judgment.counterEvidence)),
    ...safeArray(overview.crossValidation).flatMap((judgment) => normalizeEvidenceList(judgment.counterEvidence)),
  ], 3);

  const items = [];
  triggers.slice(0, 3).forEach((item) => {
    items.push(watchItem('up', '风险升级需要看到', item, 'Daily Brief keyTriggers'));
  });
  if (!triggers.length) {
    const fallback = uniqueStrings([
      ...pressureGaps,
      ...engineGaps,
      '信用利差是否扩散，并与 VIX / 风险资产形成同步确认。',
      '能源/实物端证据是否继续确认，而不是只依赖单一价格。',
    ], 3);
    fallback.forEach((item) => items.push(watchItem('up', '风险升级需要看到', item, 'missingEvidence / pending confirmation')));
  }

  invalidations.slice(0, 3).forEach((item) => {
    items.push(watchItem('down', '风险降温 / 反向验证需要看到', item, 'Daily Brief invalidationSignals'));
  });
  if (!invalidations.length) {
    const fallback = uniqueStrings([
      ...counterSignals,
      '信用与波动率继续不确认扩散。',
      'Market Pricing history 补齐前，价格温度仍保持等待而非结论。',
      ...validationGaps,
    ], 3);
    fallback.forEach((item) => items.push(watchItem('down', '风险降温 / 反向验证需要看到', item, 'counterEvidence / data gap')));
  }

  return items.slice(0, 6);
}

function appendText(root, tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value;
  root.appendChild(el);
  return el;
}

function appendList(root, items, fallback) {
  const list = document.createElement('ul');
  list.className = 'macro-overview-list';
  const values = safeArray(items).filter((item) => typeof item === 'string' && item.trim());
  (values.length ? values : [fallback]).forEach((item) => appendText(list, 'li', '', item));
  root.appendChild(list);
  return list;
}

function appendMiniMetric(root, label, value) {
  const box = document.createElement('div');
  box.className = 'macro-overview-mini';
  appendText(box, 'span', 'macro-overview-label', label);
  appendText(box, 'strong', '', value);
  root.appendChild(box);
}

function appendEditorialMeta(root, label, value) {
  const item = document.createElement('div');
  item.className = 'editorial-meta-item';
  appendText(item, 'span', 'editorial-meta-label', label);
  appendText(item, 'strong', 'editorial-meta-value', text(value, '等待数据校准'));
  root.appendChild(item);
}

function appendRiskStageScale(root, today) {
  const numericStages = [
    { label: '正常观察', start: 0, end: 50 },
    { label: '压力上升', start: 50, end: 65 },
    { label: '局部冲击观察', start: 65, end: 85 },
    { label: '系统性风险观察', start: 85, end: 100 },
  ];
  const score = finite(today.score);
  const scale = document.createElement('div');
  scale.className = 'editorial-threshold';

  const header = document.createElement('div');
  header.className = 'editorial-threshold-label';
  appendText(header, 'span', '', 'THRESHOLD-ALIGNED RISK STAGE SCALE');
  appendText(header, 'strong', '', today.stage || UNDECIDED);
  scale.appendChild(header);

  if (today.stage === '系统性危机') {
    appendText(scale, 'p', 'editorial-threshold-override', '显式阶段：系统性危机，不由本标尺单独推断');
  }

  if (score === null) {
    appendText(scale, 'p', 'editorial-threshold-caption', '数据不足，暂不绘制阶段位置');
    root.appendChild(scale);
    return;
  }

  const track = document.createElement('div');
  track.className = 'editorial-threshold-bar';
  numericStages.forEach(({ label, start, end }) => {
    const segment = document.createElement('span');
    segment.className = `editorial-threshold-zone${label === today.stage ? ' is-active' : ''}`;
    segment.style.flexBasis = `${end - start}%`;
    segment.setAttribute('title', `${label}：${start}-${end}`);
    segment.setAttribute('aria-label', `${label}：${start} 到 ${end}`);
    track.appendChild(segment);
  });

  const marker = document.createElement('span');
  marker.className = 'editorial-threshold-marker';
  marker.style.left = `${Math.max(0, Math.min(100, score))}%`;
  marker.setAttribute('aria-label', `当前分数 ${Math.round(score)}，${today.stage || UNDECIDED}`);
  appendText(marker, 'span', 'editorial-threshold-marker-label', `${Math.round(score)} · ${today.stage || UNDECIDED}`);
  track.appendChild(marker);
  scale.appendChild(track);

  const labels = document.createElement('div');
  labels.className = 'editorial-threshold-caption';
  numericStages.forEach(({ label, start, end }) => {
    const className = `editorial-threshold-caption-item${label === today.stage ? ' is-active' : ''}`;
    appendText(labels, 'span', className, `${label} ${start}-${end}`);
  });
  scale.appendChild(labels);
  root.appendChild(scale);
}

function stripLabelPrefix(value, label) {
  const prefix = `${label}：`;
  return typeof value === 'string' && value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function appendJudgmentList(root, label, values) {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  appendText(root, 'p', 'macro-overview-muted', `${label}：${items.map((item) => stripLabelPrefix(item, label)).join('；')}`);
}

function pressureStatusClass(judgment) {
  const status = String(judgment?.status || '');
  const direction = String(judgment?.direction || '');
  const sourceType = String(judgment?.sourceType || '');
  const combined = `${status} ${direction} ${sourceType}`;
  if (combined.includes('数据不足') || combined.includes('等待接入')) return 'is-gap';
  if (status.includes('主要压力') || status.includes('压力较高')) return 'is-major';
  if (status.includes('压力上升') || direction.includes('压力上升')) return 'is-rising';
  if (status.includes('暂未扩散') || status.includes('相对平稳') || direction.includes('基本平稳')) return 'is-calm';
  if (status.includes('观察中')) return 'is-watch';
  return 'is-neutral';
}

function buildPressureCounts(judgments) {
  const counts = {
    active: 0,
    watch: 0,
    calm: 0,
    gap: 0,
  };
  safeArray(judgments).forEach((judgment) => {
    const className = pressureStatusClass(judgment);
    if (className === 'is-major' || className === 'is-rising') counts.active += 1;
    else if (className === 'is-watch' || className === 'is-neutral') counts.watch += 1;
    else if (className === 'is-calm') counts.calm += 1;
    else if (className === 'is-gap') counts.gap += 1;
  });
  return counts;
}

function buildPressureCategorySummary(judgments) {
  const items = safeArray(judgments);
  if (!items.length) return '压力来源数据不足，暂不强行给出主线。';
  const classed = items.map((judgment) => ({ judgment, className: pressureStatusClass(judgment) }));
  const gaps = classed.filter(({ className }) => className === 'is-gap');
  const active = classed.filter(({ className }) => className === 'is-major' || className === 'is-rising' || className === 'is-watch');
  const calm = classed.filter(({ className }) => className === 'is-calm');
  if (gaps.length >= items.length) return '压力来源以数据缺口为主，当前不强行形成压力主线。';
  const activeTitles = active.slice(0, 2).map(({ judgment }) => `「${judgment.title}」`);
  const calmTitles = calm.slice(0, 2).map(({ judgment }) => `「${judgment.title}」`);
  const lines = [];
  lines.push(activeTitles.length
    ? `当前压力来源以${activeTitles.join('和')}为主要观察链条`
    : '当前压力来源尚未形成单一主线');
  if (calmTitles.length) lines.push(`${calmTitles.join('和')}作为反证保留`);
  if (gaps.length || items.some((judgment) => normalizeEvidenceList(judgment.missingEvidence).length)) {
    lines.push('部分证据仍不完整');
  }
  return `${lines.join('；')}。`;
}

function appendPressureCountPill(root, label, value) {
  const pill = document.createElement('span');
  pill.className = 'editorial-count-pill';
  appendText(pill, 'span', '', label);
  appendText(pill, 'strong', '', String(value));
  root.appendChild(pill);
}

function signalStatusClass(judgment) {
  const id = String(judgment?.id || '');
  const title = String(judgment?.title || '');
  const status = String(judgment?.status || '');
  const sourceType = String(judgment?.sourceType || '');
  const group = String(judgment?.group || '');
  const identity = `${id} ${title} ${group}`;
  if (identity.includes('verified') || identity.includes('已验证')) return 'is-verified';
  if (identity.includes('pending') || identity.includes('待验证')) return 'is-pending';
  if (identity.includes('noise') || identity.includes('噪音')) return 'is-noise';
  if (identity.includes('data-gap') || identity.includes('数据不足')) return 'is-gap';
  const combined = `${status} ${sourceType}`;
  if (combined.includes('数据不足') || combined.includes('等待接入')) return 'is-gap';
  return 'is-neutral';
}

function signalBucketLabel(judgment) {
  const className = signalStatusClass(judgment);
  if (className === 'is-verified') return '已验证';
  if (className === 'is-pending') return '待验证';
  if (className === 'is-noise') return '噪音提示';
  if (className === 'is-gap') return '数据不足';
  return '观察中';
}

function buildSignalCounts(judgments) {
  const counts = {
    verified: 0,
    pending: 0,
    noise: 0,
    gap: 0,
  };
  safeArray(judgments).forEach((judgment) => {
    const className = signalStatusClass(judgment);
    const evidenceCount = normalizeEvidenceList(judgment?.evidence).length;
    const noiseCount = normalizeEvidenceList(judgment?.noiseWarning).length;
    if (className === 'is-verified' && evidenceCount) counts.verified += 1;
    else if (className === 'is-pending' && evidenceCount) counts.pending += 1;
    else if (className === 'is-noise' && noiseCount) counts.noise += 1;
    else if (className === 'is-gap') counts.gap += 1;
  });
  return counts;
}

function buildSignalCategorySummary(judgments) {
  const items = safeArray(judgments);
  if (!items.length) return '信号分层数据不足，暂不强行形成证据结论。';
  const counts = buildSignalCounts(items);
  const gaps = items.filter((judgment) => signalStatusClass(judgment) === 'is-gap');
  const hasMissing = items.some((judgment) => normalizeEvidenceList(judgment.missingEvidence).length);
  const lines = [];
  if (counts.verified) {
    lines.push('已验证证据已有部分支持');
  } else {
    lines.push('已验证证据仍不足');
  }
  if (counts.pending || hasMissing) {
    lines.push('待验证线索和缺失证据需继续分开展示');
  }
  if (counts.noise) {
    lines.push('单一价格波动仍作为噪音提示处理');
  }
  if (gaps.length) {
    lines.push('数据缺口保留为独立约束');
  }
  return `${lines.join('；')}。`;
}

function driverTypeClass(judgment) {
  const identity = `${judgment?.id || ''} ${judgment?.title || ''} ${judgment?.group || ''}`.toLowerCase();
  if (identity.includes('增长') || identity.includes('growth')) return 'is-growth';
  if (identity.includes('通胀') || identity.includes('inflation')) return 'is-inflation';
  if (identity.includes('流动性') || identity.includes('liquidity')) return 'is-liquidity';
  if (identity.includes('政策') || identity.includes('policy')) return 'is-policy';
  return 'is-neutral';
}

function driverStatusClass(judgment) {
  const status = String(judgment?.status || '');
  const direction = String(judgment?.direction || '');
  const sourceType = String(judgment?.sourceType || '');
  const combined = `${status} ${direction} ${sourceType}`;
  if (combined.includes('数据不足') || combined.includes('等待接入')) return 'is-gap';
  if (combined.includes('压力上升') || combined.includes('约束偏强')) return 'is-rising';
  if (combined.includes('观察中') || combined.includes('慢变量观察中')) return 'is-watch';
  return 'is-neutral';
}

function driverTypeLabel(judgment) {
  const className = driverTypeClass(judgment);
  if (className === 'is-growth') return '增长';
  if (className === 'is-inflation') return '通胀';
  if (className === 'is-liquidity') return '流动性';
  if (className === 'is-policy') return '政策';
  return '宏观驱动';
}

function findDriverByType(judgments, className) {
  return safeArray(judgments).find((judgment) => driverTypeClass(judgment) === className) || null;
}

function appendDriverTypePill(root, label, judgment) {
  const pill = document.createElement('span');
  pill.className = 'editorial-count-pill editorial-driver-type-pill';
  appendText(pill, 'span', '', label);
  appendText(pill, 'strong', '', judgment?.status || '未呈现');
  root.appendChild(pill);
}

function buildDriverCategorySummary(judgments) {
  const items = safeArray(judgments);
  if (!items.length) return '四大宏观驱动数据不足，暂不强行形成驱动结论。';
  const classed = items.map((judgment) => ({
    judgment,
    typeClass: driverTypeClass(judgment),
    statusClass: driverStatusClass(judgment),
  }));
  const gaps = classed.filter(({ statusClass }) => statusClass === 'is-gap');
  const rising = classed.filter(({ statusClass }) => statusClass === 'is-rising');
  const watch = classed.filter(({ statusClass }) => statusClass === 'is-watch');
  const hasCounterEvidence = items.some((judgment) => normalizeEvidenceList(judgment.counterEvidence).length);
  if (gaps.length >= items.length) return '增长、通胀、流动性与政策证据均不足，当前不推断宏观驱动主线。';
  const lines = ['当前四大驱动将增长、通胀、流动性与政策分开展示'];
  if (rising.length) {
    const titles = rising.slice(0, 2).map(({ judgment }) => `「${judgment.title}」`);
    lines.push(`${titles.join('和')}显示压力或约束偏强，仅作为观察链条`);
  }
  if (watch.length) {
    const titles = watch.slice(0, 2).map(({ judgment }) => `「${judgment.title}」`);
    lines.push(`${titles.join('和')}维持观察`);
  }
  if (gaps.length) {
    const titles = gaps.slice(0, 2).map(({ judgment }) => `「${judgment.title}」`);
    lines.push(`${titles.join('和')}仍为等待接入或数据不足`);
  }
  if (hasCounterEvidence) lines.push('反向证据保留在对应卡片中');
  return `${lines.join('；')}。`;
}

function appendEditorialDriverSublist(root, label, values, modifier = '') {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-driver-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-driver-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-driver-evidence';
  items.forEach((item) => appendText(list, 'li', '', stripLabelPrefix(item, label)));
  group.appendChild(list);
  root.appendChild(group);
}

function appendEditorialDriverCard(root, judgment) {
  const typeClass = driverTypeClass(judgment);
  const statusClass = driverStatusClass(judgment);
  const card = document.createElement('article');
  card.className = `editorial-driver-card ${typeClass} ${statusClass}`;
  const strip = document.createElement('div');
  strip.className = 'editorial-driver-card-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  card.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-driver-card-head';
  appendText(head, 'span', 'editorial-driver-type', driverTypeLabel(judgment));
  appendText(head, 'h3', 'editorial-driver-card-title', judgment.title);
  appendText(head, 'span', 'editorial-driver-badge', judgment.status || UNDECIDED);
  card.appendChild(head);

  const direction = judgment.direction && judgment.direction !== '方向待确认'
    ? ` / ${judgment.direction}`
    : '';
  appendText(card, 'p', 'editorial-driver-main', `${judgment.status || UNDECIDED}${direction}`);
  const explanation = judgment.explanation || judgment.conclusion;
  if (explanation) appendText(card, 'p', 'editorial-driver-explanation', explanation);
  appendEditorialDriverSublist(card, '关键证据', judgment.evidence, 'is-evidence');
  appendEditorialDriverSublist(card, '缺失证据', judgment.missingEvidence, 'is-missing');
  appendEditorialDriverSublist(card, '反向证据', judgment.counterEvidence, 'is-counter');
  appendEditorialDriverSublist(card, '噪音提示', judgment.noiseWarning, 'is-noise');

  const footer = document.createElement('div');
  footer.className = 'editorial-driver-footer';
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  if (judgment.updatedAt) appendText(footer, 'span', '', `更新：${judgment.updatedAt}`);
  if (footer.childNodes.length) card.appendChild(footer);
  root.appendChild(card);
}

function buildMarketTemperatureSummary(judgment, metricsData) {
  const records = getMetricRecords(metricsData);
  const latest = records[records.length - 1];
  if (latest) {
    const bucket = getMarketTemperatureBucketInfo(latest.zScore);
    return `QQQ 最新周线 z-score 为 ${formatSignedDecimal(latest.zScore, 2)}，市场温度处于「${bucket.label}」；本区只展示统计描述，不进入评分或决策。`;
  }
  const status = judgment?.status || MARKET_TEMPERATURE_WAITING_STATUS;
  return `当前市场温度计仍处于${status}阶段；在 QQQ / Nasdaq 周线历史、60 周均值、标准差和 z-score 未形成前，不判断市场偏冷、正常、偏热或过热。`;
}

function appendMarketTemperatureChecklist(root, judgment) {
  const checklist = document.createElement('ul');
  checklist.className = 'editorial-market-temp-checklist';
  [
    'QQQ / Nasdaq 已验证周线历史',
    '60 周以上历史数据',
    '60 周均值',
    '标准差',
    'z-score',
  ].forEach((item) => appendText(checklist, 'li', '', item));
  normalizeEvidenceList(judgment?.missingEvidence).forEach((item) => {
    appendText(checklist, 'li', '', stripLabelPrefix(item, '缺失证据'));
  });
  root.appendChild(checklist);
}

function appendMarketTemperatureDisabledScale(root) {
  const scale = document.createElement('div');
  scale.className = 'editorial-market-temp-scale';
  appendText(scale, 'p', 'editorial-market-temp-scale-disabled', '数据不足，暂不绘制位置 / Waiting for validated weekly history');
  const track = document.createElement('div');
  track.className = 'editorial-market-temp-scale-track';
  ['偏冷', '正常', '偏热', '过热'].forEach((label) => {
    appendText(track, 'span', 'editorial-market-temp-scale-segment', label);
  });
  scale.appendChild(track);
  root.appendChild(scale);
}

function renderMarketTemperatureWaitingState(rootEl, judgment = buildMarketTemperature()) {
  rootEl.className = 'editorial-market-temp-panel macro-temperature-card';
  rootEl.setAttribute('data-market-temperature-fallback', 'true');
  rootEl.replaceChildren();

  const strip = document.createElement('div');
  strip.className = 'editorial-market-temp-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  rootEl.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-market-temp-head';
  appendText(head, 'span', 'editorial-market-temp-kicker', 'WAITING STATE');
  appendText(head, 'h3', 'editorial-market-temp-title', judgment.title || '市场定价温度计');
  appendText(head, 'span', 'editorial-market-temp-badge', judgment.status || MARKET_TEMPERATURE_WAITING_STATUS);
  rootEl.appendChild(head);

  appendText(rootEl, 'p', 'editorial-market-temp-main', '暂无法判断市场偏冷 / 正常 / 偏热 / 过热');
  appendText(rootEl, 'p', 'editorial-market-temp-note', judgment.explanation || '该模块用于未来识别市场相对中期趋势的冷热程度，但在历史周线和统计量不足前不能启用。');
  appendMarketTemperatureChecklist(rootEl, judgment);
  appendMarketTemperatureDisabledScale(rootEl);
  appendText(rootEl, 'p', 'editorial-market-temp-boundary', '当前不计算，不写历史，不触发数据抓取，不构成买卖信号。');

  const footer = document.createElement('div');
  footer.className = 'editorial-market-temp-footer';
  appendText(footer, 'span', '', `当前结论：${judgment.conclusion || UNDECIDED}`);
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  rootEl.appendChild(footer);
}

function appendMetricValue(root, label, value) {
  const item = document.createElement('span');
  appendText(item, 'small', '', label);
  appendText(item, 'strong', '', value);
  root.appendChild(item);
}

export function renderMarketTemperatureCard(rootEl, metricsData, judgment = buildMarketTemperature()) {
  if (!rootEl) return;
  const records = getMetricRecords(metricsData);
  const latest = records[records.length - 1];
  const zRange = getZScoreRange(records);
  if (!latest || !zRange) {
    renderMarketTemperatureWaitingState(rootEl, judgment);
    return;
  }

  const bucket = getMarketTemperatureBucketInfo(latest.zScore);
  const bucketClass = `market-temperature-bucket-${bucket.key}`;
  const distance = Math.abs(finite(latest.zScore) || 0).toFixed(2);
  rootEl.className = 'editorial-market-temp-panel macro-temperature-card market-temperature-card-active';
  rootEl.removeAttribute('data-market-temperature-fallback');
  rootEl.replaceChildren();

  const strip = document.createElement('div');
  strip.className = 'editorial-market-temp-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  rootEl.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-market-temp-head';
  appendText(head, 'span', 'editorial-market-temp-kicker', 'MARKET PRICING TEMPERATURE');
  appendText(head, 'h3', 'editorial-market-temp-title', '市场温度');
  appendText(head, 'span', `editorial-market-temp-badge ${bucketClass}`, bucket.label);
  rootEl.appendChild(head);

  appendText(rootEl, 'p', 'market-temperature-zscore-label', `LATEST WEEK · ${latest.date} · ${latest.isoWeek}`);
  appendText(rootEl, 'p', `market-temperature-zscore-large ${bucketClass}`, formatSignedDecimal(latest.zScore, 2));
  appendText(rootEl, 'p', 'editorial-market-temp-main', bucket.interpretation(distance));

  const metricGrid = document.createElement('div');
  metricGrid.className = 'market-temperature-secondary-metrics';
  appendMetricValue(metricGrid, 'Current close', formatCurrency(latest.close));
  appendMetricValue(metricGrid, '60 周均值', formatCurrency(latest.ma60));
  appendMetricValue(metricGrid, '60 周标准差', formatCurrency(latest.stdDev60));
  rootEl.appendChild(metricGrid);

  appendText(rootEl, 'p', 'market-temperature-history-range', `历史区间 [${formatSignedDecimal(zRange.min, 2)}, ${formatSignedDecimal(zRange.max, 2)}]`);

  const sparkline = document.createElement('div');
  sparkline.className = 'market-temperature-sparkline';
  records.slice(-7).forEach((record) => {
    appendText(sparkline, 'span', `market-temperature-bucket-${classifyZScoreBucket(record.zScore)}`, formatSignedDecimal(record.zScore, 2));
  });
  rootEl.appendChild(sparkline);

  const sourceCommit = typeof metricsData?.sourceCommit === 'string' && metricsData.sourceCommit.trim()
    ? metricsData.sourceCommit.trim()
    : 'unknown';
  appendText(rootEl, 'p', 'market-temperature-source-line', `${MARKET_TEMPERATURE_METRICS_PATH} · sourceCommit=${sourceCommit}`);
  appendText(rootEl, 'p', 'market-temperature-disclaimer', MARKET_TEMPERATURE_DISCLAIMER);
}

function appendEditorialMarketTemperature(root, judgment, metricsData) {
  const panel = document.createElement('div');
  panel.id = 'market-temperature-card-root';
  root.appendChild(panel);
  renderMarketTemperatureCard(panel, metricsData, judgment);
}

function engineTypeClass(judgment) {
  const identity = `${judgment?.id || ''} ${judgment?.title || ''} ${judgment?.group || ''}`.toLowerCase();
  if (identity.includes('energy') || identity.includes('inflation') || identity.includes('能源') || identity.includes('通胀')) return 'is-energy';
  if (identity.includes('rates') || identity.includes('liquidity') || identity.includes('利率') || identity.includes('流动性')) return 'is-rates';
  if (identity.includes('pricing') || identity.includes('mismatch') || identity.includes('定价') || identity.includes('资产')) return 'is-pricing';
  if (identity.includes('credit') || identity.includes('fragility') || identity.includes('信用') || identity.includes('脆弱')) return 'is-credit';
  if (identity.includes('world-order') || identity.includes('world order') || identity.includes('external') || identity.includes('世界秩序')) return 'is-world-order';
  return 'is-neutral';
}

function engineStatusClass(judgment) {
  const status = String(judgment?.status || '');
  const direction = String(judgment?.direction || '');
  const sourceType = String(judgment?.sourceType || '');
  const hasCounter = normalizeEvidenceList(judgment?.counterEvidence).length > 0;
  const combined = `${status} ${direction} ${sourceType}`;
  if (combined.includes('数据不足') || combined.includes('等待接入')) return 'is-gap';
  if (hasCounter || combined.includes('暂未扩散') || combined.includes('相对平稳')) return 'is-counter';
  if (combined.includes('主要压力') || combined.includes('压力上升') || combined.includes('压力较高')) return 'is-rising';
  if (combined.includes('观察中')) return 'is-watch';
  return 'is-neutral';
}

function engineTypeLabel(judgment) {
  const className = engineTypeClass(judgment);
  if (className === 'is-energy') return '能源 / 通胀';
  if (className === 'is-rates') return '利率 / 流动性';
  if (className === 'is-pricing') return '定价错配';
  if (className === 'is-credit') return '信用 / 脆弱性';
  if (className === 'is-world-order') return '世界秩序';
  return '风险机制';
}

function buildEngineCounts(judgments) {
  const counts = {
    rising: 0,
    watch: 0,
    counter: 0,
    gap: 0,
  };
  safeArray(judgments).forEach((judgment) => {
    const className = engineStatusClass(judgment);
    if (className === 'is-rising') counts.rising += 1;
    else if (className === 'is-counter') counts.counter += 1;
    else if (className === 'is-gap') counts.gap += 1;
    else counts.watch += 1;
  });
  return counts;
}

function buildEngineCategorySummary(judgments) {
  const items = safeArray(judgments);
  if (!items.length) return '风险引擎数据不足，暂不解释压力传导机制。';
  const counts = buildEngineCounts(items);
  const risingTitles = items
    .filter((judgment) => engineStatusClass(judgment) === 'is-rising')
    .slice(0, 2)
    .map((judgment) => `「${judgment.title}」`);
  const hasMissing = items.some((judgment) => normalizeEvidenceList(judgment.missingEvidence).length);
  const hasCounter = counts.counter > 0;
  const lines = ['当前风险引擎用于解释压力如何传导，不等同于交易信号'];
  if (risingTitles.length) lines.push(`${risingTitles.join('和')}存在观察信号，但仅按已有证据强度表达`);
  if (hasCounter) lines.push('信用、波动率或扩散不足的反向证据继续保留');
  if (hasMissing || counts.gap) lines.push('实物端、资金面或外部来源缺口仍需单独展示');
  return `${lines.join('；')}。`;
}

function appendEngineCountPill(root, label, value) {
  const pill = document.createElement('span');
  pill.className = 'editorial-count-pill editorial-engine-count-pill';
  appendText(pill, 'span', '', label);
  appendText(pill, 'strong', '', String(value));
  root.appendChild(pill);
}

function appendEditorialEngineSublist(root, label, values, modifier = '') {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-engine-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-engine-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-engine-evidence';
  items.forEach((item) => appendText(list, 'li', '', stripLabelPrefix(item, label)));
  group.appendChild(list);
  root.appendChild(group);
}

function appendEditorialEngineCard(root, judgment) {
  const typeClass = engineTypeClass(judgment);
  const statusClass = engineStatusClass(judgment);
  const card = document.createElement('article');
  card.className = `editorial-engine-card ${typeClass} ${statusClass}`;
  const strip = document.createElement('div');
  strip.className = 'editorial-engine-card-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  card.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-engine-card-head';
  appendText(head, 'span', 'editorial-engine-type', engineTypeLabel(judgment));
  appendText(head, 'h3', 'editorial-engine-card-title', judgment.title);
  appendText(head, 'span', 'editorial-engine-badge', judgment.status || UNDECIDED);
  card.appendChild(head);

  const direction = judgment.direction && judgment.direction !== '方向待确认'
    ? ` / ${judgment.direction}`
    : '';
  appendText(card, 'p', 'editorial-engine-main', `${judgment.status || UNDECIDED}${direction}`);
  const explanation = judgment.explanation || judgment.conclusion;
  if (explanation) appendText(card, 'p', 'editorial-engine-explanation', explanation);
  appendEditorialEngineSublist(card, '关键证据', judgment.evidence, 'is-evidence');
  appendEditorialEngineSublist(card, '缺失证据', judgment.missingEvidence, 'is-missing');
  appendEditorialEngineSublist(card, '反向证据', judgment.counterEvidence, 'is-counter');
  appendEditorialEngineSublist(card, '噪音提示', judgment.noiseWarning, 'is-noise');

  const footer = document.createElement('div');
  footer.className = 'editorial-engine-footer';
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  if (judgment.updatedAt) appendText(footer, 'span', '', `更新：${judgment.updatedAt}`);
  if (footer.childNodes.length) card.appendChild(footer);
  root.appendChild(card);
}

function validationStatusClass(judgment) {
  const assessment = String(judgment?.assessment || '');
  if (assessment === 'strong_confirmation') return 'is-confirmed';
  if (assessment === 'partial_confirmation') return 'is-pending';
  if (assessment === 'contradiction') return 'is-counter';
  if (assessment === 'insufficient_data') return 'is-gap';
  const id = String(judgment?.id || '');
  const title = String(judgment?.title || '');
  const status = String(judgment?.status || '');
  const direction = String(judgment?.direction || '');
  const sourceType = String(judgment?.sourceType || '');
  const hasCounter = normalizeEvidenceList(judgment?.counterEvidence).length > 0;
  const combined = `${id} ${title} ${status} ${direction} ${sourceType}`.toLowerCase();
  if (combined.includes('数据不足') || combined.includes('等待接入') || combined.includes('gap')) return 'is-gap';
  if (hasCounter || combined.includes('反向证据') || combined.includes('反证') || combined.includes('暂未扩散') || combined.includes('counter')) return 'is-counter';
  if (combined.includes('已验证') || combined.includes('互相验证') || combined.includes('相互确认') || combined.includes('confirmed') || combined.includes('validated')) return 'is-confirmed';
  if (combined.includes('待验证') || combined.includes('观察中') || combined.includes('pending') || combined.includes('watch')) return 'is-pending';
  return 'is-neutral';
}

function validationTypeLabel(judgment) {
  if (judgment?.assessment && ASSESSMENT_LABELS[judgment.assessment]) return ASSESSMENT_LABELS[judgment.assessment];
  const className = validationStatusClass(judgment);
  if (className === 'is-confirmed') return '相互确认';
  if (className === 'is-pending') return '待验证';
  if (className === 'is-counter') return '反向证据';
  if (className === 'is-gap') return '数据不足';
  return '交叉验证';
}

function buildValidationCounts(judgments) {
  const counts = {
    confirmed: 0,
    pending: 0,
    counter: 0,
    gap: 0,
  };
  safeArray(judgments).forEach((judgment) => {
    const className = validationStatusClass(judgment);
    if (className === 'is-confirmed') counts.confirmed += 1;
    else if (className === 'is-counter') counts.counter += 1;
    else if (className === 'is-gap') counts.gap += 1;
    else counts.pending += 1;
  });
  return counts;
}

function buildValidationCategorySummary(judgments) {
  const items = safeArray(judgments);
  if (!items.length) return '交叉验证数据不足，暂不强行形成确认结论。';
  const matrixItems = items.filter((judgment) => judgment?.assessment);
  if (matrixItems.length) {
    const confirmed = matrixItems.filter((judgment) => ['strong_confirmation', 'partial_confirmation'].includes(judgment.assessment));
    const contradictions = matrixItems.filter((judgment) => judgment.assessment === 'contradiction');
    const gaps = matrixItems.filter((judgment) => judgment.assessment === 'insufficient_data' || safeArray(judgment.missingEvidence).length);
    const lines = ['当前交叉验证以 7 个 narrative 形成结构化矩阵'];
    if (confirmed.length) lines.push(`${confirmed.slice(0, 3).map((item) => `「${item.label || item.title}」`).join('、')}提供确认`);
    if (contradictions.length) lines.push(`${contradictions.map((item) => `「${item.label || item.title}」`).join('、')}存在矛盾`);
    if (gaps.length) lines.push(`${gaps.length} 个 narrative 仍有数据缺口`);
    return `${lines.join('；')}。`;
  }
  const counts = buildValidationCounts(items);
  const pendingTitles = items
    .filter((judgment) => validationStatusClass(judgment) === 'is-pending')
    .slice(0, 2)
    .map((judgment) => `「${judgment.title}」`);
  const hasMissing = items.some((judgment) => normalizeEvidenceList(judgment.missingEvidence).length);
  const hasNoise = items.some((judgment) => normalizeEvidenceList(judgment.noiseWarning).length);
  const lines = ['当前交叉验证用于判断多个指标是否互相确认，而不是单独制造结论'];
  if (counts.confirmed) lines.push('已有部分互相确认信号，但仍按证据强度呈现');
  if (pendingTitles.length) lines.push(`${pendingTitles.join('和')}仍需保留为待验证`);
  if (counts.counter) lines.push('反向证据不隐藏');
  if (counts.gap || hasMissing) lines.push('Market Pricing 历史、实物能源或其他关键数据缺口继续单独展示');
  if (hasNoise) lines.push('噪音提示不转化为结论');
  return `${lines.join('；')}。`;
}

function appendValidationCountPill(root, label, value) {
  const pill = document.createElement('span');
  pill.className = 'editorial-count-pill editorial-validation-count-pill';
  appendText(pill, 'span', '', label);
  appendText(pill, 'strong', '', String(value));
  root.appendChild(pill);
}

function appendEditorialConsistencySummary(root, matrix) {
  if (!isPlainObject(matrix)) return;
  const summary = document.createElement('div');
  summary.className = 'editorial-consistency-summary';
  const scoreBox = document.createElement('div');
  scoreBox.className = 'editorial-consistency-score-display';
  appendText(scoreBox, 'span', '', 'CONSISTENCY SCORE');
  appendText(scoreBox, 'strong', '', String(matrix.consistencyScore ?? '--'));
  summary.appendChild(scoreBox);

  const body = document.createElement('div');
  appendText(body, 'p', 'editorial-consistency-state', matrix.consistencyState || '等待交叉验证');
  appendText(body, 'p', 'editorial-consistency-line', matrix.oneLineSummary || '交叉验证矩阵等待数据。');
  summary.appendChild(body);
  root.appendChild(summary);
}

function appendCrossValidationEducationParagraph(section, value, className = '') {
  return appendText(section, className === 'editorial-cross-validation-education-reminder' ? 'small' : 'p', className, value);
}

function appendCrossValidationEducationList(section, values) {
  const list = document.createElement('ul');
  values.forEach((item) => appendText(list, 'li', '', item));
  section.appendChild(list);
}

function appendCrossValidationEducationSection(root, heading, blocks, options = {}) {
  const section = document.createElement('section');
  section.className = `editorial-cross-validation-education-section${options.isBoundary ? ' is-boundary' : ''}`;
  appendText(section, 'h3', '', heading);
  blocks.forEach((block) => {
    if (block.type === 'list') {
      appendCrossValidationEducationList(section, block.items);
      return;
    }
    appendCrossValidationEducationParagraph(section, block.text, block.className || '');
  });
  root.appendChild(section);
}

function appendCrossValidationEducationAppendix(root) {
  const details = document.createElement('details');
  details.className = 'editorial-folded-content editorial-cross-validation-education';

  const summary = document.createElement('summary');
  summary.className = 'editorial-folded-summary';
  appendText(summary, 'span', 'fold-marker', '');
  appendText(summary, 'span', 'fold-label', '📖 信号一致性如何解读');
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'editorial-cross-validation-education-body';

  appendCrossValidationEducationSection(body, '一致性分数', [
    { text: '一致性分数衡量"多少个独立宏观信号在同向"。' },
    { text: '刻度参考：' },
    {
      type: 'list',
      items: [
        '>70：高度一致（多数信号同方向）',
        '40-70：中等一致（信号混杂，需要观察）',
        '<40：严重不一致（信号矛盾，方向不明）',
      ],
    },
    { text: '注意：高度一致不等于"市场风险高"或"应该担心"。分数只反映信号关系，不反映方向性结论。' },
    { text: '本说明不针对当前数据。', className: 'editorial-cross-validation-education-reminder' },
  ]);

  appendCrossValidationEducationSection(body, '信号同向的金融常识', [
    { text: '多个独立宏观信号同时确认在金融研究中通常被视为"趋势性较强"的特征。' },
    { text: '但任何单一信号都可能误判。综合多个信号的目的是减少"假信号"风险，不是替代研究判断。' },
    { text: '历史上，多信号同向之后市场结果不一致：' },
    {
      type: 'list',
      items: [
        '有时确认了趋势的延续',
        '有时遇到反向冲击导致快速逆转',
      ],
    },
    { text: '本说明不针对当前数据。', className: 'editorial-cross-validation-education-reminder' },
  ]);

  appendCrossValidationEducationSection(body, '矛盾信号的金融常识', [
    { text: '信号矩阵中如果出现一个 narrative 显示"背离"（contradiction），金融研究界对这种"背离"的常见分析框架是：' },
    {
      type: 'list',
      items: [
        '估值类指标过热 + 信用市场紧张：多类压力指标同步发出，研究界常用"系统性压力"描述这种状态',
        '估值类指标过热 + 信用市场平静：多类信号同向但信用市场未跟进，研究界常用"背离"（divergence）一词描述这种状态',
      ],
    },
    { text: '注意："背离"是描述性词汇，不是预测。背离出现后的市场结果在历史上不一致。信用市场的反应可能领先或滞后于其他信号。' },
    { text: '本说明不针对当前数据。', className: 'editorial-cross-validation-education-reminder' },
  ]);

  appendCrossValidationEducationSection(body, '数据缺口的影响', [
    { text: '当 narrative 列出"缺失证据"时，该 narrative 的评估状态（strong / partial / contradiction / insufficient）的可靠性会下降。' },
    { text: '数据缺口越多：' },
    {
      type: 'list',
      items: [
        '综合一致性分数的可靠性越低',
        '"强确认"或"背离"判断的局限性越大',
        '应该更谨慎地依赖这个综合分数',
      ],
    },
    { text: '本说明不针对当前数据。', className: 'editorial-cross-validation-education-reminder' },
  ]);

  appendCrossValidationEducationSection(body, '边界声明', [
    { text: '本说明仅介绍金融研究中的常见解读框架，不针对当前数据下结论。' },
    { text: '不构成对以下任何判断：' },
    {
      type: 'list',
      items: [
        '当前是否过热',
        '当前是否应该担心',
        '当前应否采取任何投资行动',
      ],
    },
    { text: '本网站从设计上就是"证据展示工具"，不是"投资判断工具"。' },
  ], { isBoundary: true });

  details.appendChild(body);
  root.appendChild(details);
}

function appendEditorialValidationSublist(root, label, values, modifier = '') {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-validation-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-validation-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-validation-evidence';
  items.forEach((item) => appendText(list, 'li', '', stripLabelPrefix(item, label)));
  group.appendChild(list);
  root.appendChild(group);
}

function formatStructuredEvidenceItem(item) {
  if (!isPlainObject(item)) return String(item || '');
  const source = text(item.source, 'source');
  const value = item.value == null || item.value === '' ? '' : ` ${item.value}`;
  const detail = text(item.detail, '');
  return `${source}${value}：${detail}`;
}

function appendEditorialValidationEvidenceItems(root, label, values, modifier = '') {
  const items = safeArray(values).filter((item) => item && (typeof item === 'string' || isPlainObject(item)));
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-validation-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-validation-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-validation-evidence';
  items.forEach((item) => appendText(list, 'li', '', formatStructuredEvidenceItem(item)));
  group.appendChild(list);
  root.appendChild(group);
}

function appendEditorialValidationCard(root, judgment) {
  const className = validationStatusClass(judgment);
  const isStructured = safeArray(judgment?.supportingEvidence).length
    || safeArray(judgment?.missingEvidence).length
    || safeArray(judgment?.contradictingEvidence).length;
  const card = document.createElement('article');
  const assessmentClass = judgment?.assessment
    ? `editorial-assessment-${String(judgment.assessment).replace(/_/gu, '-')}`
    : '';
  card.className = `editorial-validation-card ${className} ${assessmentClass}`.trim();
  const strip = document.createElement('div');
  strip.className = 'editorial-validation-card-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  card.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-validation-card-head';
  appendText(head, 'span', 'editorial-validation-type', validationTypeLabel(judgment));
  appendText(head, 'h3', 'editorial-validation-card-title', judgment.label || judgment.title);
  appendText(head, 'span', 'editorial-validation-badge', judgment.status || UNDECIDED);
  card.appendChild(head);

  const direction = judgment.direction && judgment.direction !== '方向待确认'
    ? ` / ${judgment.direction}`
    : '';
  appendText(card, 'p', 'editorial-validation-main', `${judgment.status || UNDECIDED}${direction}`);
  const explanation = judgment.interpretation || judgment.explanation || judgment.conclusion;
  if (explanation) appendText(card, 'p', 'editorial-validation-explanation', explanation);
  if (isStructured) {
    appendEditorialValidationEvidenceItems(card, '支持证据', judgment.supportingEvidence, 'editorial-evidence-supporting');
    appendEditorialValidationEvidenceItems(card, '缺失证据', judgment.missingEvidence, 'editorial-evidence-missing');
    appendEditorialValidationEvidenceItems(card, '矛盾证据', judgment.contradictingEvidence, 'editorial-evidence-contradicting');
  } else {
    appendEditorialValidationSublist(card, '关键证据', judgment.evidence, 'is-evidence');
    appendEditorialValidationSublist(card, '缺失证据', judgment.missingEvidence, 'is-missing');
    appendEditorialValidationSublist(card, '反向证据', judgment.counterEvidence, 'is-counter');
    appendEditorialValidationSublist(card, '噪音提示', judgment.noiseWarning, 'is-noise');
  }

  const footer = document.createElement('div');
  footer.className = 'editorial-validation-footer';
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  if (judgment.updatedAt) appendText(footer, 'span', '', `更新：${judgment.updatedAt}`);
  if (footer.childNodes.length) card.appendChild(footer);
  root.appendChild(card);
}

function appendEditorialSignalSublist(root, label, values, modifier = '') {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-signal-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-signal-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-signal-evidence';
  items.forEach((item) => appendText(list, 'li', '', stripLabelPrefix(item, label)));
  group.appendChild(list);
  root.appendChild(group);
}

function appendEditorialSignalCard(root, judgment) {
  const className = signalStatusClass(judgment);
  const card = document.createElement('article');
  card.className = `editorial-signal-card ${className}`;
  const strip = document.createElement('div');
  strip.className = 'editorial-signal-card-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  card.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-signal-card-head';
  appendText(head, 'span', 'editorial-signal-bucket', signalBucketLabel(judgment));
  appendText(head, 'h3', 'editorial-signal-card-title', judgment.title);
  appendText(head, 'span', 'editorial-signal-badge', judgment.status || UNDECIDED);
  card.appendChild(head);

  const direction = judgment.direction && judgment.direction !== '方向待确认'
    ? ` / ${judgment.direction}`
    : '';
  appendText(card, 'p', 'editorial-signal-main', `${judgment.status || UNDECIDED}${direction}`);
  const explanation = judgment.explanation || judgment.conclusion;
  if (explanation) appendText(card, 'p', 'editorial-signal-explanation', explanation);
  appendEditorialSignalSublist(card, '关键证据', judgment.evidence, 'is-evidence');
  appendEditorialSignalSublist(card, '缺失证据', judgment.missingEvidence, 'is-missing');
  appendEditorialSignalSublist(card, '反向证据', judgment.counterEvidence, 'is-counter');
  appendEditorialSignalSublist(card, '噪音提示', judgment.noiseWarning, 'is-noise');

  const footer = document.createElement('div');
  footer.className = 'editorial-signal-footer';
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  if (judgment.updatedAt) appendText(footer, 'span', '', `更新：${judgment.updatedAt}`);
  if (footer.childNodes.length) card.appendChild(footer);
  root.appendChild(card);
}

function appendEditorialPressureSublist(root, label, values, modifier = '') {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  const group = document.createElement('div');
  group.className = `editorial-pressure-sublist ${modifier}`.trim();
  appendText(group, 'span', 'editorial-pressure-sublist-label', label);
  const list = document.createElement('ul');
  list.className = 'editorial-pressure-evidence';
  items.forEach((item) => appendText(list, 'li', '', stripLabelPrefix(item, label)));
  group.appendChild(list);
  root.appendChild(group);
}

function appendEditorialPressureCard(root, judgment) {
  const className = pressureStatusClass(judgment);
  const card = document.createElement('article');
  card.className = `editorial-pressure-card ${className}`;
  const strip = document.createElement('div');
  strip.className = 'editorial-pressure-card-status-strip';
  strip.setAttribute('aria-hidden', 'true');
  card.appendChild(strip);

  const head = document.createElement('div');
  head.className = 'editorial-pressure-card-head';
  appendText(head, 'h3', 'editorial-pressure-card-title', judgment.title);
  appendText(head, 'span', 'editorial-pressure-badge', judgment.status || UNDECIDED);
  card.appendChild(head);

  const direction = judgment.direction && judgment.direction !== '方向待确认'
    ? ` / ${judgment.direction}`
    : '';
  appendText(card, 'p', 'editorial-pressure-main', `${judgment.status || UNDECIDED}${direction}`);
  if (judgment.explanation) appendText(card, 'p', 'editorial-pressure-explanation', judgment.explanation);
  appendEditorialPressureSublist(card, '关键证据', judgment.evidence, 'is-evidence');
  appendEditorialPressureSublist(card, '缺失证据', judgment.missingEvidence, 'is-missing');
  appendEditorialPressureSublist(card, '反向证据', judgment.counterEvidence, 'is-counter');
  appendEditorialPressureSublist(card, '噪音提示', judgment.noiseWarning, 'is-noise');

  const footer = document.createElement('div');
  footer.className = 'editorial-pressure-footer';
  if (judgment.confidence && judgment.confidence !== '等待校准') appendText(footer, 'span', '', `证据强度：${judgment.confidence}`);
  if (judgment.dataCoverage) appendText(footer, 'span', '', `数据覆盖：${stripLabelPrefix(judgment.dataCoverage, '数据覆盖')}`);
  if (judgment.sourceType) appendText(footer, 'span', '', `来源类型：${judgment.sourceType}`);
  if (judgment.updatedAt) appendText(footer, 'span', '', `更新：${judgment.updatedAt}`);
  if (footer.childNodes.length) card.appendChild(footer);
  root.appendChild(card);
}

function appendCard(root, item) {
  const card = document.createElement('article');
  card.className = 'macro-overview-card';
  appendText(card, 'h3', '', item.title);
  appendText(card, 'p', 'macro-overview-status', item.status || UNDECIDED);
  if (item.direction && item.direction !== '方向待确认') appendText(card, 'p', 'macro-overview-muted', `方向：${item.direction}`);
  appendJudgmentList(card, '关键证据', item.evidence);
  appendJudgmentList(card, '缺失证据', item.missingEvidence);
  appendJudgmentList(card, '反向证据', item.counterEvidence);
  appendJudgmentList(card, '噪音提示', item.noiseWarning);
  if (item.confidence && item.confidence !== '等待校准') appendText(card, 'p', 'macro-overview-muted', `证据强度：${item.confidence}`);
  if (item.dataCoverage) appendText(card, 'p', 'macro-overview-muted', `数据覆盖：${stripLabelPrefix(item.dataCoverage, '数据覆盖')}`);
  if (item.explanation) appendText(card, 'p', 'macro-overview-muted', item.explanation);
  if (item.conclusion) appendText(card, 'p', 'macro-overview-conclusion', `当前结论：${item.conclusion}`);
  root.appendChild(card);
}

function appendSection(root, title, className = '', id = '') {
  const section = document.createElement('section');
  section.className = `macro-overview-block ${className}`.trim();
  if (id) section.id = id;
  appendText(section, 'h2', '', title);
  root.appendChild(section);
  return section;
}

function appendEditorialKeyChanges(root, changes) {
  const items = safeArray(changes);
  const grid = document.createElement('div');
  grid.className = 'wow-grid';
  (items.length ? items : [keyChange('gap', '暂无足够边际变化数据，本区仅展示已能确认的方向性提示。', 'fallback')]).forEach((item) => {
    const card = document.createElement('article');
    const kind = item.kind || 'flat';
    const tone = kind === 'up' ? 'up' : kind === 'down' ? 'down' : 'flat';
    card.className = `wow-item is-${kind}`;
    appendText(card, 'span', `wow-tag ${tone} is-${kind}`, item.tag || keyChangeTag(item.kind));
    appendText(card, 'p', 'wow-text', item.body || '方向性提示等待确认。');
    if (item.source) appendText(card, 'span', 'wow-source', item.source);
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

function appendEditorialWatchList(root, items) {
  const values = safeArray(items);
  const section = document.createElement('section');
  section.className = 'macro-overview-block editorial-watch-list';
  appendText(section, 'p', 'editorial-watch-kicker', 'WHAT TO WATCH');
  appendText(section, 'h2', 'editorial-watch-title', '下一步验证清单');
  appendText(section, 'p', 'editorial-watch-summary', '验证清单只整理现有触发条件、反证条件、缺失证据和待确认项，不新增信号。');

  const grid = document.createElement('div');
  grid.className = 'editorial-watch-grid';
  const numbers = ['①', '②', '③', '④', '⑤', '⑥'];
  values.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = `editorial-watch-item is-${item.group || 'up'}`;
    appendText(card, 'span', 'editorial-watch-icon', numbers[index] || String(index + 1));
    const body = document.createElement('div');
    appendText(body, 'h3', 'editorial-watch-item-title', item.title || '下一步验证');
    appendText(body, 'p', 'editorial-watch-item-desc', item.desc || '等待更多证据确认。');
    if (item.meta) appendText(body, 'span', 'editorial-watch-item-meta', item.meta);
    card.appendChild(body);
    grid.appendChild(card);
  });
  section.appendChild(grid);
  root.appendChild(section);
}

export function renderMacroRiskOverview(data, healthDashboard, worldOrderStressData, marketPricingMetricsData = null, container = $('macro-risk-overview-root')) {
  if (!container) return;
  const overview = buildMacroOverview(data, healthDashboard, worldOrderStressData, marketPricingMetricsData);
  container.replaceChildren();

  const today = appendSection(container, '今日总判断', 'macro-overview-hero editorial-first-fold', 'homepage-today-judgment');
  appendText(today, 'p', 'editorial-risk-overline', 'GLOBAL RISK SCORE / SYSTEMIC RISK STAGE');
  const headline = document.createElement('div');
  headline.className = 'editorial-headline';
  const scorePanel = document.createElement('div');
  scorePanel.className = 'editorial-big-number';
  const headlineScore = finite(overview.today.score);
  const headlineScoreText = headlineScore === null ? '数据不足' : String(Math.round(headlineScore));
  const headlineCoverage = overview.today.dataCoverage
    ? stripLabelPrefix(overview.today.dataCoverage, '数据覆盖')
    : '等待校准';
  appendText(scorePanel, 'span', 'editorial-big-number-label', 'GLOBAL RISK SCORE');
  appendText(scorePanel, 'strong', 'editorial-big-number-value', headlineScoreText);
  const scoreBreakdown = document.createElement('div');
  scoreBreakdown.className = 'editorial-big-number-breakdown';
  appendText(scoreBreakdown, 'span', '', overview.today.stage || '暂无法判断');
  appendText(scoreBreakdown, 'span', '', `证据强度：${overview.today.evidenceStrength || '等待校准'}`);
  appendText(scoreBreakdown, 'span', '', `数据覆盖：${headlineCoverage}`);
  scorePanel.appendChild(scoreBreakdown);
  appendText(scorePanel, 'p', 'editorial-big-number-footer', `Updated: ${overview.today.updatedAt || '等待数据校准'}`);
  headline.appendChild(scorePanel);
  const conclusionPanel = document.createElement('div');
  conclusionPanel.className = 'editorial-verdict';
  appendText(conclusionPanel, 'span', 'editorial-verdict-label', 'TODAY\'S VERDICT · 今日总判断');
  appendText(conclusionPanel, 'h3', 'editorial-verdict-title', overview.today.oneLine);
  appendText(conclusionPanel, 'p', 'editorial-verdict-body', overview.today.macroState);
  const primaryPressure = overview.pressures[0];
  if (primaryPressure) {
    appendText(conclusionPanel, 'p', 'editorial-verdict-body', `主要压力：${primaryPressure.title} / ${primaryPressure.status}`);
  }
  const verdictMeta = document.createElement('div');
  verdictMeta.className = 'editorial-verdict-meta';
  appendEditorialMeta(verdictMeta, '证据强度', overview.today.evidenceStrength);
  appendEditorialMeta(verdictMeta, '数据覆盖', overview.today.dataCoverage);
  conclusionPanel.appendChild(verdictMeta);
  const missingNote = normalizeEvidenceList(overview.today.missingEvidence).slice(0, 2).join('；');
  if (missingNote) appendText(conclusionPanel, 'p', 'editorial-verdict-footnote', `不确定性：${missingNote}`);
  headline.appendChild(conclusionPanel);
  today.appendChild(headline);

  const metaGrid = document.createElement('div');
  metaGrid.className = 'editorial-meta-grid';
  appendEditorialMeta(metaGrid, '阶段', overview.today.stage);
  appendEditorialMeta(metaGrid, '1日变化', overview.today.change);
  appendEditorialMeta(metaGrid, '证据强度', overview.today.evidenceStrength);
  appendEditorialMeta(metaGrid, '数据覆盖', overview.today.dataCoverage);
  appendEditorialMeta(metaGrid, '更新时间', overview.today.updatedAt || '等待数据校准');
  today.appendChild(metaGrid);

  appendJudgmentList(today, '缺失证据', overview.today.missingEvidence);
  appendRiskStageScale(today, overview.today);

  const pressure = appendSection(container, '主要压力来源', 'editorial-category editorial-pressure-category', 'homepage-pressure-sources');
  appendText(pressure, 'p', 'editorial-category-kicker', 'PRESSURE SOURCES');
  appendText(pressure, 'p', 'editorial-category-summary', buildPressureCategorySummary(overview.pressures));
  const pressureCounts = buildPressureCounts(overview.pressures);
  const countGrid = document.createElement('div');
  countGrid.className = 'editorial-category-counts';
  appendPressureCountPill(countGrid, '主要压力 / 压力上升', pressureCounts.active);
  appendPressureCountPill(countGrid, '观察中', pressureCounts.watch);
  appendPressureCountPill(countGrid, '暂未扩散 / 相对平稳', pressureCounts.calm);
  appendPressureCountPill(countGrid, '数据不足 / 等待接入', pressureCounts.gap);
  pressure.appendChild(countGrid);
  const pressureGrid = document.createElement('div');
  pressureGrid.className = 'editorial-pressure-grid';
  overview.pressures.forEach((item) => appendEditorialPressureCard(pressureGrid, item));
  pressure.appendChild(pressureGrid);

  const signals = appendSection(container, '信号分层', 'editorial-category editorial-signal-category', 'homepage-signal-layers');
  appendText(signals, 'p', 'editorial-category-kicker', 'SIGNAL LAYERS');
  appendText(signals, 'p', 'editorial-category-summary', buildSignalCategorySummary(overview.signalLayers));
  const signalCounts = buildSignalCounts(overview.signalLayers);
  const signalCountGrid = document.createElement('div');
  signalCountGrid.className = 'editorial-category-counts';
  appendPressureCountPill(signalCountGrid, '已验证', signalCounts.verified);
  appendPressureCountPill(signalCountGrid, '待验证', signalCounts.pending);
  appendPressureCountPill(signalCountGrid, '噪音提示', signalCounts.noise);
  appendPressureCountPill(signalCountGrid, '数据不足', signalCounts.gap);
  signals.appendChild(signalCountGrid);
  const signalGrid = document.createElement('div');
  signalGrid.className = 'editorial-signal-grid';
  overview.signalLayers.forEach((group) => appendEditorialSignalCard(signalGrid, group));
  signals.appendChild(signalGrid);

  const drivers = appendSection(container, '四大宏观驱动', 'editorial-category editorial-driver-category', 'homepage-macro-drivers');
  appendText(drivers, 'p', 'editorial-category-kicker', 'MACRO DRIVERS');
  appendText(drivers, 'p', 'editorial-category-summary', buildDriverCategorySummary(overview.drivers));
  const driverCountGrid = document.createElement('div');
  driverCountGrid.className = 'editorial-category-counts';
  appendDriverTypePill(driverCountGrid, '增长', findDriverByType(overview.drivers, 'is-growth'));
  appendDriverTypePill(driverCountGrid, '通胀', findDriverByType(overview.drivers, 'is-inflation'));
  appendDriverTypePill(driverCountGrid, '流动性', findDriverByType(overview.drivers, 'is-liquidity'));
  appendDriverTypePill(driverCountGrid, '政策', findDriverByType(overview.drivers, 'is-policy'));
  drivers.appendChild(driverCountGrid);
  const driverGrid = document.createElement('div');
  driverGrid.className = 'editorial-driver-grid';
  overview.drivers.forEach((item) => appendEditorialDriverCard(driverGrid, item));
  drivers.appendChild(driverGrid);

  const temp = appendSection(container, '市场温度', 'editorial-category editorial-market-temp-category', 'homepage-market-temperature');
  appendText(temp, 'p', 'editorial-category-kicker', 'MARKET PRICING TEMPERATURE');
  appendText(temp, 'p', 'editorial-category-summary', buildMarketTemperatureSummary(overview.marketTemperature, marketPricingMetricsData));
  appendEditorialMarketTemperature(temp, overview.marketTemperature, marketPricingMetricsData);

  const engines = appendSection(container, '风险引擎', 'editorial-category editorial-engine-category', 'homepage-risk-engines');
  appendText(engines, 'p', 'editorial-category-kicker', 'RISK ENGINES');
  appendText(engines, 'p', 'editorial-category-summary', buildEngineCategorySummary(overview.riskEngines));
  const engineCounts = buildEngineCounts(overview.riskEngines);
  const engineCountGrid = document.createElement('div');
  engineCountGrid.className = 'editorial-category-counts';
  appendEngineCountPill(engineCountGrid, '压力上升 / 主要观察', engineCounts.rising);
  appendEngineCountPill(engineCountGrid, '观察中', engineCounts.watch);
  appendEngineCountPill(engineCountGrid, '反向证据', engineCounts.counter);
  appendEngineCountPill(engineCountGrid, '数据不足', engineCounts.gap);
  engines.appendChild(engineCountGrid);
  const engineGrid = document.createElement('div');
  engineGrid.className = 'editorial-engine-grid';
  overview.riskEngines.forEach((item) => appendEditorialEngineCard(engineGrid, item));
  engines.appendChild(engineGrid);

  const cross = appendSection(container, '风险交叉验证', 'editorial-category editorial-validation-category', 'homepage-cross-validation');
  appendText(cross, 'p', 'editorial-category-kicker', 'CROSS VALIDATION');
  appendText(cross, 'p', 'editorial-category-summary', buildValidationCategorySummary(overview.crossValidation));
  const validationCounts = buildValidationCounts(overview.crossValidation);
  const validationCountGrid = document.createElement('div');
  validationCountGrid.className = 'editorial-category-counts';
  appendValidationCountPill(validationCountGrid, '相互确认', validationCounts.confirmed);
  appendValidationCountPill(validationCountGrid, '待验证', validationCounts.pending);
  appendValidationCountPill(validationCountGrid, '反向证据', validationCounts.counter);
  appendValidationCountPill(validationCountGrid, '数据不足', validationCounts.gap);
  cross.appendChild(validationCountGrid);
  appendEditorialConsistencySummary(cross, overview.crossValidationMatrix);
  const crossGrid = document.createElement('div');
  crossGrid.className = 'editorial-validation-grid';
  overview.crossValidation.forEach((item) => appendEditorialValidationCard(crossGrid, item));
  cross.appendChild(crossGrid);
  appendCrossValidationEducationAppendix(cross);

  const keyChangesRoot = $('wow-key-changes-root');
  if (keyChangesRoot) {
    keyChangesRoot.replaceChildren();
    appendEditorialKeyChanges(keyChangesRoot, buildKeyChanges(overview, data, healthDashboard));
  } else {
    appendEditorialKeyChanges(container, buildKeyChanges(overview, data, healthDashboard));
  }
  appendEditorialWatchList(container, buildWatchList(overview, data));
}
