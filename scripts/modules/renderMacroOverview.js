import { $ } from './config.js?v=28.0M-7U';

const WAITING = '等待接入';
const INSUFFICIENT = '数据不足';
const UNDECIDED = '暂无法判断';
const NO_HISTORY = '暂无历史对比';

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
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
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

function buildTodayJudgment(data, healthDashboard, worldOrderStressData) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const confidence = isPlainObject(brief.confidence) ? brief.confidence : {};
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
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
    ? `${Math.round(Number(healthScore))}%；市场温度和实物能源证据仍需补齐`
    : '等待数据校准';

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
      evidence: [text(brief.oneLineConclusion, fallbackLine || '当前结论强度有限，仍需等待更多跨市场证据。')],
      missingEvidence: [
        '市场温度历史数据尚未接入。',
        '实物能源证据仍需补齐。',
      ],
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

function buildSignalLayers(data) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const largestDivergence = isPlainObject(brief.largestDivergence) ? brief.largestDivergence : {};
  const verified = [];
  const pending = [];

  if (hasValue(inputs.brent) && hasValue(inputs.breakeven10y) && hasValue(inputs.us10y)) {
    verified.push('能源、通胀预期与长端利率同时构成当前主观察链条。');
  }
  if (hasValue(inputs.hyOas) && hasValue(inputs.vix) && Number(inputs.hyOas) < 4 && Number(inputs.vix) < 22) {
    verified.push('信用利差和波动率暂未显示明显扩散。');
  }
  if (largestDivergence.summaryZh) pending.push(largestDivergence.summaryZh);
  pending.push('能源价格处于观察区间，但实物端验证数据仍不足。');

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
      evidence: [
        'Nasdaq / QQQ 周线历史尚未接入。',
        'Platts Dated Brent / 正式 Dated Brent 尚未接入。',
        'Brent 期限结构、crack spread / diesel stress、shipping / freight 仍待接入。',
        ...safeArray(brentLayer.dataGaps).slice(0, 1),
      ],
      conclusion: '暂无额外数据缺口。',
    }),
  ];
}

function buildMacroDrivers(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const hyOas = finite(inputs.hyOas);
  const vix = finite(inputs.vix);
  const creditCalm = hyOas !== null && hyOas < 4 && vix !== null && vix < 22;

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
      evidence: [`广义美元 ${formatNumber(inputs.dxy, 2)}；10年期 ${formatNumber(inputs.us10y, 2, '%')}；高收益利差 ${formatNumber(inputs.hyOas, 2, '%')}`],
      missingEvidence: ['资金面、期限结构和更多信用分层证据等待接入。'],
      counterEvidence: creditCalm ? ['信用与波动率尚未明显确认扩散。'] : [],
      explanation: creditCalm
        ? '长端利率和美元偏紧，但信用与波动率尚未明显确认扩散。'
        : '流动性压力需要与信用利差和波动率共同确认。',
    }),
    createDataGapJudgment({
      id: 'driver-policy',
      title: '政策',
      group: 'macro-driver',
      status: WAITING,
      direction: '方向待确认',
      evidence: ['暂无直接 Fed 预期或政策路径指标。'],
      missingEvidence: ['Fed 预期、政策路径、市场隐含利率和政策沟通证据等待接入。'],
      explanation: '当前不伪造政策立场；除非接入明确政策预期数据，否则政策不是强驱动。',
    }),
  ];
}

function buildMarketTemperature() {
  return createDataGapJudgment({
    id: 'market-pricing-temperature',
    title: '市场定价温度计',
    group: 'market-temperature',
    status: '等待历史周线数据接入',
    evidence: ['Nasdaq / QQQ 周线历史', 'MA60', '标准差', 'z-score'],
    missingEvidence: ['历史周线、MA60、标准差和 z-score 尚未接入。'],
    explanation: '该指标将用于识别市场相对中期趋势的冷热程度，不构成单独买卖信号。',
    conclusion: UNDECIDED,
  });
}

function findDivergenceCheck(data, key) {
  return safeArray(data?.divergenceLayer?.checks).find((item) => item?.key === key) || {};
}

function buildRiskEngines(data, worldOrderStressData) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');
  const liquidityCheck = findDivergenceCheck(data, 'liquidity_vs_credit_transmission');
  const creditCalm = finite(inputs.hyOas) !== null && Number(inputs.hyOas) < 4 && finite(inputs.vix) !== null && Number(inputs.vix) < 22;

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
      status: text(pricingCheck.status, '观察中'),
      direction: '方向待确认',
      confidence: '偏低',
      dataCoverage: '数据覆盖：关键数据不足',
      evidence: [text(pricingCheck.summaryZh, '风险资产定价仍需与利率、信用和历史温度框架交叉确认。')],
      missingEvidence: ['Nasdaq / QQQ 周线历史、MA60、标准差和 z-score 等待接入。'],
      explanation: '市场温度计尚未就绪，因此只能保留错配观察，不能给出冷热程度。',
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
      evidence: [text(liquidityCheck.summaryZh, '金融脆弱性证据等待接入。')],
      missingEvidence: ['银行压力、私募信贷、CRE、融资成本与更细信用指标等待接入。'],
      counterEvidence: creditCalm ? ['信用和波动率尚未显示系统性扩散。'] : [],
      explanation: creditCalm
        ? '信用和波动率尚未显示系统性扩散，金融脆弱性维持观察。'
        : '需要更细信用和银行压力数据才能提高结论强度。',
    }),
  ];
}

function buildCrossValidation(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const energyCheck = findDivergenceCheck(data, 'energy_pricing_gap_watch');
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};

  return [
    createJudgment({
      id: 'cross-energy-shock',
      title: '能源冲击真实升级',
      group: 'cross-validation',
      status: finite(inputs.brent) === null ? INSUFFICIENT : '观察中',
      direction: '待验证',
      confidence: '偏低',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [text(energyCheck.summaryZh, '公开 Brent 价格提示能源压力。')],
      missingEvidence: ['Platts Dated Brent、Brent 期限结构、裂解价差、库存和航运压力等待接入。'],
      noiseWarning: ['单一 Brent 或代理价格不足以证明实物端冲击升级。'],
      conclusion: '待验证，未进入明显验证。',
    }),
    createJudgment({
      id: 'cross-stagflation-pressure',
      title: '滞胀压力上升',
      group: 'cross-validation',
      status: finite(inputs.brent) !== null && finite(consumer.umichSentiment) !== null ? '观察中' : INSUFFICIENT,
      direction: '压力上升观察',
      confidence: '偏低',
      dataCoverage: '数据覆盖：部分缺口',
      evidence: [text(data?.dailyBrief?.dominantRiskChain?.summaryZh, '能源、增长和利率链条等待同步确认。')],
      missingEvidence: ['增长数据目前偏依赖 UMCSENT；PMI、就业和政策预期仍缺位。'],
      noiseWarning: ['月频慢变量可能滞后，不能单独确认滞胀。'],
      conclusion: '证据不完整，保持压力上升观察。',
    }),
    createJudgment({
      id: 'cross-risk-asset-mismatch',
      title: '风险资产错配',
      group: 'cross-validation',
      status: text(ratesCheck.status, '观察中'),
      direction: '方向待确认',
      confidence: '偏低',
      dataCoverage: '数据覆盖：关键数据不足',
      evidence: [text(ratesCheck.summaryZh, '风险资产与利率证据等待接入。')],
      missingEvidence: ['Nasdaq / QQQ 周线温度计和更长历史数据等待接入。'],
      noiseWarning: ['短期价格强弱不等于宏观确认。'],
      conclusion: '框架未完全就绪，暂不做强结论。',
    }),
    createDataGapJudgment({
      id: 'cross-overheat-confirmation',
      title: '风险资产过热是否被宏观确认',
      group: 'cross-validation',
      status: '数据不足',
      evidence: [text(pricingCheck.summaryZh, '宏观确认不足。')],
      missingEvidence: ['MA60、标准差、z-score 与更长历史等待接入。'],
      noiseWarning: ['没有 z-score 前不判断过热。'],
      conclusion: '等待历史周线数据接入。',
    }),
  ];
}

export function buildMacroOverview(data = {}, healthDashboard = {}, worldOrderStressData = {}) {
  return {
    today: buildTodayJudgment(data, healthDashboard, worldOrderStressData),
    pressures: buildPressureSources(data, worldOrderStressData),
    signalLayers: buildSignalLayers(data),
    drivers: buildMacroDrivers(data),
    marketTemperature: buildMarketTemperature(),
    riskEngines: buildRiskEngines(data, worldOrderStressData),
    crossValidation: buildCrossValidation(data),
  };
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

function stripLabelPrefix(value, label) {
  const prefix = `${label}：`;
  return typeof value === 'string' && value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function appendJudgmentList(root, label, values) {
  const items = normalizeEvidenceList(values);
  if (!items.length) return;
  appendText(root, 'p', 'macro-overview-muted', `${label}：${items.map((item) => stripLabelPrefix(item, label)).join('；')}`);
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

function appendSection(root, title, className = '') {
  const section = document.createElement('section');
  section.className = `macro-overview-block ${className}`.trim();
  appendText(section, 'h2', '', title);
  root.appendChild(section);
  return section;
}

export function renderMacroRiskOverview(data, healthDashboard, worldOrderStressData, container = $('macro-risk-overview-root')) {
  if (!container) return;
  const overview = buildMacroOverview(data, healthDashboard, worldOrderStressData);
  container.replaceChildren();

  const today = appendSection(container, '今日总判断', 'macro-overview-hero');
  appendText(today, 'p', 'macro-overview-kicker', overview.today.macroState);
  appendText(today, 'p', 'macro-overview-one-line', overview.today.oneLine);
  const todayGrid = document.createElement('div');
  todayGrid.className = 'macro-overview-mini-grid';
  appendMiniMetric(todayGrid, '全球系统性风险', overview.today.score);
  appendMiniMetric(todayGrid, '当前阶段', overview.today.stage);
  appendMiniMetric(todayGrid, '较昨日变化', overview.today.change);
  appendMiniMetric(todayGrid, '证据强度', overview.today.evidenceStrength);
  appendMiniMetric(todayGrid, '数据覆盖度', overview.today.dataCoverage);
  today.appendChild(todayGrid);

  const pressure = appendSection(container, '主要压力来源');
  const pressureGrid = document.createElement('div');
  pressureGrid.className = 'macro-overview-grid five-col';
  overview.pressures.forEach((item) => appendCard(pressureGrid, item));
  pressure.appendChild(pressureGrid);

  const signals = appendSection(container, '信号分层');
  const signalGrid = document.createElement('div');
  signalGrid.className = 'macro-overview-grid four-col';
  overview.signalLayers.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'macro-overview-card';
    appendText(card, 'h3', '', group.title);
    appendList(card, [...group.evidence, ...group.noiseWarning], group.conclusion || '暂无可显示信号。');
    signalGrid.appendChild(card);
  });
  signals.appendChild(signalGrid);

  const drivers = appendSection(container, '四大宏观驱动');
  const driverGrid = document.createElement('div');
  driverGrid.className = 'macro-overview-grid four-col';
  overview.drivers.forEach((item) => appendCard(driverGrid, item));
  drivers.appendChild(driverGrid);

  const temp = appendSection(container, '市场定价温度计');
  const tempPanel = document.createElement('article');
  tempPanel.className = 'macro-overview-card macro-temperature-card';
  appendText(tempPanel, 'p', 'macro-overview-status', `状态：${overview.marketTemperature.status}`);
  appendText(tempPanel, 'p', '', `说明：${overview.marketTemperature.explanation}`);
  appendList(tempPanel, overview.marketTemperature.evidence.map((item) => `数据需求：${item}`), '数据需求等待定义。');
  appendText(tempPanel, 'p', 'macro-overview-conclusion', `当前结论：${overview.marketTemperature.conclusion}`);
  temp.appendChild(tempPanel);

  const engines = appendSection(container, '五大风险引擎摘要');
  const engineGrid = document.createElement('div');
  engineGrid.className = 'macro-overview-grid five-col';
  overview.riskEngines.forEach((item) => appendCard(engineGrid, item));
  engines.appendChild(engineGrid);

  const cross = appendSection(container, '风险交叉验证');
  const crossGrid = document.createElement('div');
  crossGrid.className = 'macro-overview-grid four-col';
  overview.crossValidation.forEach((item) => appendCard(crossGrid, item));
  cross.appendChild(crossGrid);
}
