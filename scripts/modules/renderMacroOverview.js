import { $ } from './config.js?v=28.0M-1';

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
  return number === null ? INSUFFICIENT : `${Math.round(number)}`;
}

function formatChange(value) {
  const number = finite(value);
  if (number === null) return NO_HISTORY;
  if (number === 0) return '持平';
  return `${number > 0 ? '上升' : '回落'} ${Math.abs(number).toFixed(0)} 点`;
}

function evidenceStrengthFromConfidence(confidence) {
  const level = String(confidence?.level || '').toLowerCase();
  if (level === 'high') return '较强';
  if (level === 'medium') return '中等';
  if (level === 'low') return '偏低';
  const score = finite(confidence?.score);
  if (score === null) return '等待校准';
  if (score >= 75) return '较强';
  if (score >= 45) return '中等';
  return '偏低';
}

function statusFromScore(score) {
  const number = finite(score);
  if (number === null) return UNDECIDED;
  if (number >= 75) return '压力较高';
  if (number >= 55) return '压力观察中';
  if (number >= 35) return '温和观察';
  return '相对平稳';
}

function directionFromDelta(value) {
  const number = finite(value);
  if (number === null) return '方向待确认';
  if (number > 0) return '边际上升';
  if (number < 0) return '边际回落';
  return '基本持平';
}

function firstExisting(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function buildTodayJudgment(data, healthDashboard) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const decisionModel = isPlainObject(data?.decisionModel) ? data.decisionModel : {};
  const confidence = isPlainObject(brief.confidence) ? brief.confidence : {};
  const healthScore = firstExisting(
    healthDashboard?.score,
    data?.dailyRealtimeInput?.healthScore,
    data?.confidenceScore
  );

  return {
    macroState: text(brief.macroState, text(data?.currentMacroRegime)),
    oneLine: text(brief.oneLineConclusion, text(data?.decisionLine)),
    score: formatScore(data?.score),
    stage: text(data?.currentCrisisPhase, text(decisionModel.strategyState)),
    change: formatChange(data?.scoreChange1d),
    evidenceStrength: evidenceStrengthFromConfidence(confidence),
    dataCoverage: Number.isFinite(Number(healthScore)) ? `${Math.round(Number(healthScore))}%` : '等待数据校准',
  };
}

function buildPressureSources(data, worldOrderStressData) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const worldScore = finite(worldOrderStressData?.score);

  return [
    {
      title: '能源与通胀压力',
      status: finite(inputs.brent) !== null ? statusFromScore(data?.modules?.energy) : INSUFFICIENT,
      evidence: `布伦特 ${formatNumber(inputs.brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`,
      note: safeArray(brentLayer.dataGaps).length ? '实物端验证数据仍不足。' : '等待更多验证。',
    },
    {
      title: '长端利率与流动性',
      status: finite(inputs.us10y) !== null ? statusFromScore(data?.modules?.liquidity) : INSUFFICIENT,
      evidence: `10年期 ${formatNumber(inputs.us10y, 2, '%')}；实际利率 ${formatNumber(inputs.real10y, 2, '%')}；广义美元 ${formatNumber(inputs.dxy, 2)}`,
      note: '观察利率、美元与信用是否同向扩散。',
    },
    {
      title: '信用压力',
      status: finite(inputs.hyOas) !== null && Number(inputs.hyOas) < 4 ? '暂未明显扩散' : '观察中',
      evidence: `高收益利差 ${formatNumber(inputs.hyOas, 2, '%')}；VIX ${formatNumber(inputs.vix, 2)}`,
      note: '单一价格变化不足以形成强结论。',
    },
    {
      title: '世界秩序压力',
      status: worldScore === null ? INSUFFICIENT : statusFromScore(worldScore),
      evidence: worldScore === null ? '世界秩序压力数据不足。' : `结构性压力分数 ${Math.round(worldScore)}`,
      note: '仅作为结构性背景，不进入交易判断。',
    },
    {
      title: '消费者体感',
      status: finite(consumer.umichSentiment) === null ? WAITING : '月频慢变量观察中',
      evidence: finite(consumer.umichSentiment) === null ? 'UMCSENT 等待接入或刷新。' : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`,
      note: '月频数据只用于宏观体感证据。',
    },
  ];
}

function buildSignalLayers(data) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const macroSignals = safeArray(data?.macroDrivers?.activeSignals);
  const largestDivergence = isPlainObject(brief.largestDivergence) ? brief.largestDivergence : {};

  return [
    {
      title: '已验证信号',
      items: [
        ...macroSignals.slice(0, 2).map((signal) => `${text(signal.label, '结构信号')}：${text(signal.detail, '细节待确认')}`),
        finite(data?.displayInputsBaseline?.hyOas) !== null ? '信用压力暂未明显扩散。' : '',
      ].filter(Boolean),
      fallback: '暂无强验证信号。',
    },
    {
      title: '待验证信号',
      items: [
        largestDivergence.summaryZh || '',
        '能源价格观察中，但实物端验证数据仍不足。',
      ].filter(Boolean),
      fallback: '暂无待验证信号。',
    },
    {
      title: '噪音提示',
      items: [
        '单一价格变化不足以形成强结论。',
        '短期波动需等待跨市场确认。',
      ],
      fallback: '暂无噪音提示。',
    },
    {
      title: '数据不足',
      items: [
        '市场定价温度数据等待历史周线接入。',
        ...safeArray(brentLayer.dataGaps).slice(0, 2),
      ],
      fallback: '暂无额外数据缺口。',
    },
  ];
}

function buildMacroDrivers(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};

  return [
    {
      title: '增长',
      status: finite(consumer.umichSentiment) === null ? WAITING : text(consumer.regime, '观察中'),
      direction: directionFromDelta(consumer.threeMonthChange),
      evidence: finite(consumer.umichSentiment) === null ? '消费者信心数据不足。' : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`,
      missing: 'PMI、就业广度与盈利修正等待接入。',
      strength: finite(consumer.umichSentiment) === null ? '偏低' : '中等',
      explanation: '增长驱动当前主要依赖消费者体感慢变量，不能单独形成强结论。',
    },
    {
      title: '通胀',
      status: finite(inputs.brent) === null ? INSUFFICIENT : statusFromScore(data?.modules?.inflation),
      direction: finite(inputs.brent) !== null && Number(inputs.brent) >= 95 ? '压力上升' : '观察中',
      evidence: `布伦特 ${formatNumber(inputs.brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`,
      missing: '裂解价差、柴油压力与库存数据等待接入。',
      strength: finite(inputs.brent) === null ? '偏低' : '中等',
      explanation: '能源价格与通胀预期可形成观察线索，但仍需要实物端验证。',
    },
    {
      title: '流动性',
      status: statusFromScore(data?.modules?.liquidity),
      direction: finite(inputs.dxy) !== null && Number(inputs.dxy) >= 105 ? '约束偏强' : '观察中',
      evidence: `广义美元 ${formatNumber(inputs.dxy, 2)}；10年期 ${formatNumber(inputs.us10y, 2, '%')}；高收益利差 ${formatNumber(inputs.hyOas, 2, '%')}`,
      missing: '更多资金面和期限结构确认等待接入。',
      strength: '中等',
      explanation: '流动性判断来自美元、利率、信用与波动率的交叉观察。',
    },
    {
      title: '政策',
      status: WAITING,
      direction: '方向待确认',
      evidence: '暂无直接政策预期指标。',
      missing: 'Fed 预期、政策路径和市场隐含利率等待接入。',
      strength: '偏低',
      explanation: '本轮不伪造政策预期，只保留等待接入状态。',
    },
  ];
}

function buildMarketTemperature() {
  return {
    status: '等待历史周线数据接入',
    description: '该指标将用于识别市场相对中期趋势的冷热程度，不构成单独买卖信号。',
    requirements: ['Nasdaq / QQQ 周线历史', 'MA60', '标准差', 'z-score'],
    conclusion: UNDECIDED,
  };
}

function findDivergenceCheck(data, key) {
  return safeArray(data?.divergenceLayer?.checks).find((item) => item?.key === key) || {};
}

function buildRiskEngines(data, worldOrderStressData) {
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');
  const liquidityCheck = findDivergenceCheck(data, 'liquidity_vs_credit_transmission');

  return [
    {
      title: '能源与通胀传导',
      status: text(brentLayer.proxySpread?.statusZh, statusFromScore(data?.modules?.energy)),
      evidence: text(brentLayer.summaryZh, '能源证据等待接入。'),
      missing: safeArray(brentLayer.dataGaps).slice(0, 2).join('；') || '实物端证据等待接入。',
      strength: evidenceStrengthFromConfidence(brentLayer.confidence),
      explanation: '观察能源是否继续向通胀和利率端传导。',
    },
    {
      title: '利率与流动性',
      status: text(ratesCheck.status, statusFromScore(data?.modules?.liquidity)),
      evidence: text(ratesCheck.summaryZh, '利率与流动性证据等待接入。'),
      missing: safeArray(ratesCheck.limitations).slice(0, 1).join('；') || '反向证据等待接入。',
      strength: '中等',
      explanation: '关注长端利率、实际利率、美元和信用是否同向收紧。',
    },
    {
      title: '资产定价错配',
      status: text(pricingCheck.status, '观察中'),
      evidence: text(pricingCheck.summaryZh, '市场定价证据等待接入。'),
      missing: 'Nasdaq / QQQ 周线历史等待接入。',
      strength: '偏低',
      explanation: '当前不能计算市场定价温度，只能保留错配观察框架。',
    },
    {
      title: '世界秩序压力',
      status: worldOrderStressData?.labelZh || text(worldOrderStressData?.state, INSUFFICIENT),
      evidence: finite(worldOrderStressData?.score) === null ? '世界秩序压力数据不足。' : `结构性压力分数 ${Math.round(Number(worldOrderStressData.score))}`,
      missing: 'SIPRI / ACLED 等来源仍需补全或配置。',
      strength: finite(worldOrderStressData?.confidence) === null ? '偏低' : '偏低',
      explanation: '用于结构性背景识别，不构成事件预测。',
    },
    {
      title: '金融脆弱性',
      status: text(liquidityCheck.status, statusFromScore(data?.modules?.banking)),
      evidence: text(liquidityCheck.summaryZh, '金融脆弱性证据等待接入。'),
      missing: '银行压力、融资成本与更细信用指标等待接入。',
      strength: '中等',
      explanation: '观察信用、波动率和流动性压力是否扩散。',
    },
  ];
}

function buildCrossValidation(data) {
  const energyCheck = findDivergenceCheck(data, 'energy_pricing_gap_watch');
  const ratesCheck = findDivergenceCheck(data, 'rates_vs_risk_assets');
  const pricingCheck = findDivergenceCheck(data, 'risk_complacency_watch');

  return [
    {
      title: '能源冲击真实升级',
      status: text(energyCheck.status, '观察中'),
      verified: text(energyCheck.summaryZh, '能源价格观察中。'),
      missing: 'Platts Dated Brent、期限结构、裂解价差等待接入。',
      noise: '单一 Brent 读数不足以证明实物端冲击升级。',
      conclusion: '未进入强结论。',
    },
    {
      title: '滞胀压力上升',
      status: finite(data?.displayInputsBaseline?.brent) !== null ? '观察中' : INSUFFICIENT,
      verified: text(data?.dailyBrief?.dominantRiskChain?.summaryZh, '主链条等待确认。'),
      missing: '增长、通胀和政策预期的更多同步证据等待接入。',
      noise: '月频慢变量可能滞后。',
      conclusion: '保持观察，不扩大结论。',
    },
    {
      title: '风险资产错配',
      status: text(ratesCheck.status, '观察中'),
      verified: text(ratesCheck.summaryZh, '风险资产与利率证据等待接入。'),
      missing: 'Nasdaq / QQQ 周线温度计等待历史数据。',
      noise: '短期价格强弱不等于宏观确认。',
      conclusion: '暂无法判断过热程度。',
    },
    {
      title: '风险资产过热是否被宏观确认',
      status: text(pricingCheck.status, '观察中'),
      verified: text(pricingCheck.summaryZh, '宏观确认不足。'),
      missing: 'MA60、标准差、z-score 与更长历史等待接入。',
      noise: '单一市场定价信号需要跨资产验证。',
      conclusion: '等待历史周线数据接入。',
    },
  ];
}

export function buildMacroOverview(data = {}, healthDashboard = {}, worldOrderStressData = {}) {
  return {
    today: buildTodayJudgment(data, healthDashboard),
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

function appendCard(root, item) {
  const card = document.createElement('article');
  card.className = 'macro-overview-card';
  appendText(card, 'h3', '', item.title);
  appendText(card, 'p', 'macro-overview-status', item.status);
  appendText(card, 'p', '', item.evidence || item.verified || UNDECIDED);
  if (item.missing) appendText(card, 'p', 'macro-overview-muted', `缺失证据：${item.missing}`);
  if (item.noise) appendText(card, 'p', 'macro-overview-muted', `噪音提示：${item.noise}`);
  if (item.strength) appendText(card, 'p', 'macro-overview-muted', `证据强度：${item.strength}`);
  if (item.explanation) appendText(card, 'p', 'macro-overview-muted', item.explanation);
  if (item.conclusion) appendText(card, 'p', 'macro-overview-conclusion', item.conclusion);
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
    appendList(card, group.items, group.fallback);
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
  appendText(tempPanel, 'p', '', `说明：${overview.marketTemperature.description}`);
  appendList(tempPanel, overview.marketTemperature.requirements.map((item) => `数据需求：${item}`), '数据需求等待定义。');
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
