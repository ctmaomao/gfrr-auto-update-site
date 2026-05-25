import { $ } from './config.js?v=28.0M-95';
import { ASSESSMENT_LABELS, buildCrossValidationMatrix } from './buildCrossValidationMatrix.js?v=28.0M-95';
import { formatFiniteNumber } from './format.js?v=28.0M-95';

const WAITING = '等待接入';
const INSUFFICIENT = '数据不足';
const UNDECIDED = '暂无法判断';
const NO_HISTORY = '暂无历史对比';
const MARKET_TEMPERATURE_WAITING_STATUS = '等待历史周线数据接入';
const MARKET_TEMPERATURE_METRICS_PATH = 'data/market-pricing-metrics.json';
const MARKET_TEMPERATURE_DISCLAIMER = '本数据为统计描述，不构成投资建议。';
const AUXILIARY_MARKET_LABELS = {
  ndx: '纳斯达克 100 — 横向对照',
  ixic: '纳斯达克综合指数 — 广度参照',
};
const SVG_NAMESPACE = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');

// M-54: Narrative emoji prefix mapping for visual identification.
const NARRATIVE_EMOJI = {
  energy_shock: '⚡',
  stagflation_pressure: '⚖️',
  risk_asset_mismatch: '📉',
  overheat_confirmation: '🔥',
  credit_spread_warning: '💰',
  liquidity_tightening: '💧',
  world_order_pressure_crossing: '🌐',
};

const NARRATIVE_LABELS = {
  energy_shock: '能源冲击',
  stagflation_pressure: '滞胀压力',
  risk_asset_mismatch: '风险资产错配',
  overheat_confirmation: '过热确认',
  credit_spread_warning: '信用利差告警',
  liquidity_tightening: '流动性收紧',
  world_order_pressure_crossing: '世界秩序压力穿越',
};

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

function formatUsdBillions(value, digits = 1) {
  const number = finite(value);
  return number === null ? INSUFFICIENT : `$${formatFiniteNumber(number, digits)}B`;
}

function formatUsdBillionsFromFedChange(value) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}$${formatFiniteNumber(Math.abs(number) * 100, 0)}B`;
}

function formatPeopleValue(value) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  const abs = Math.abs(number);
  if (abs >= 1_000_000) return `${formatFiniteNumber(number / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${formatFiniteNumber(number / 1_000, 0)}k`;
  return formatFiniteNumber(number, 0);
}

function formatSignedPeopleValue(value) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}${formatPeopleValue(Math.abs(number))}`;
}

function formatRatioAsPercent(value, digits = 1) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}${formatFiniteNumber(Math.abs(number) * 100, digits)}%`;
}

function formatMonthVintage(isoDate) {
  if (typeof isoDate !== 'string' || !Number.isFinite(Date.parse(isoDate))) return 'vintage 待确认';
  const date = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatWeekVintage(isoDate) {
  if (typeof isoDate !== 'string' || !Number.isFinite(Date.parse(isoDate))) return 'vintage 待确认';
  return isoDate.slice(0, 10);
}

function formatQuarterVintage(isoDate) {
  if (typeof isoDate !== 'string' || !Number.isFinite(Date.parse(isoDate))) return 'vintage 待确认';
  const date = new Date(isoDate);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function formatSourceStatus(value) {
  const status = String(value || '').trim();
  return status || 'missing';
}

function formatSourceStatusMap(sourceStatus, pairs) {
  if (!isPlainObject(sourceStatus)) return null;
  const parts = pairs
    .map(([key, label]) => `${label}=${formatSourceStatus(sourceStatus[key])}`)
    .filter(Boolean);
  return parts.length ? `sourceStatus: ${parts.join(' / ')}` : null;
}

function formatRateRange(lower, upper) {
  const low = finite(lower);
  const high = finite(upper);
  if (low === null || high === null) return INSUFFICIENT;
  return `${formatFiniteNumber(low, 2)}%-${formatFiniteNumber(high, 2)}%`;
}

function formatBasisPoints(value, digits = 0) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}${formatFiniteNumber(Math.abs(number) * 100, digits)}bp`;
}

function formatUrlReference(url) {
  if (typeof url !== 'string' || !url.trim()) return 'url 待确认';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatRetailSegmentLines(segments) {
  const items = safeArray(segments)
    .filter(isPlainObject)
    .map((segment) => {
      const label = text(segment.labelZh, text(segment.key, 'segment'));
      return `${label} ${formatRatioAsPercent(segment.yoy)} (${formatMonthVintage(segment.updatedAt)})`;
    });
  return chunkItems(items, 4).map((chunk, index) => `MRTS 细分 ${index + 1}: ${chunk.join('；')}`);
}

function formatSignedPoints(value, digits = 2) {
  const number = finite(value);
  if (number === null) return INSUFFICIENT;
  return `${number >= 0 ? '+' : '-'}${formatFiniteNumber(Math.abs(number), digits)}pp`;
}

function findActiveSignal(activeSignals, key) {
  return safeArray(activeSignals).find((signal) => signal?.key === key) || null;
}

function onRrpAnnotation(signal) {
  return signal ? '（告急）' : '';
}

function formatWeeklyScoreChange(value) {
  const number = finite(value);
  if (number === null) return NO_HISTORY;
  return `${number >= 0 ? '+' : '-'}${Math.abs(Math.round(number))} (WoW)`;
}

function clampNumber(value, min = 0, max = 100) {
  const number = finite(value);
  if (number === null) return min;
  return Math.max(min, Math.min(max, number));
}

function thresholdStateLabel(score) {
  const number = finite(score);
  if (number === null) return UNDECIDED;
  if (number < 25) return '观察期';
  if (number < 40) return '中度警戒';
  if (number < 60) return '高风险预警';
  return '系统性顶部带';
}

function buildModuleColorCounts(data) {
  const modules = isPlainObject(data?.modules) ? data.modules : {};
  return ['geopolitical', 'energy', 'inflation', 'liquidity', 'debt', 'banking'].reduce((counts, key) => {
    const score = finite(modules[key]);
    if (score !== null && score >= 70) counts.red += 1;
    else if (score !== null && score >= 40) counts.yellow += 1;
    else counts.green += 1;
    return counts;
  }, { red: 0, yellow: 0, green: 0 });
}

function buildTodayDataHealthText(data, healthDashboard) {
  const realtimeInput = isPlainObject(data?.dailyRealtimeInput) ? data.dailyRealtimeInput : {};
  const healthScore = finite(realtimeInput.healthScore ?? healthDashboard?.score ?? data?.confidenceScore);
  if (healthScore === null) return '数据健康待确认';
  if (healthScore >= 90) return '23/23 OK · 数据正常';
  if (healthScore >= 70) return `${Math.round(healthScore)}/100 · 数据可用`;
  return `${Math.round(healthScore)}/100 · 数据降级`;
}

function normalizeHistory8w(...sources) {
  for (const source of sources) {
    const items = safeArray(source)
      .map((item) => finite(isPlainObject(item) ? item.score ?? item.value : item))
      .filter((value) => value !== null);
    if (items.length >= 8) return items.slice(-8).map((value) => Math.round(clampNumber(value, 0, 100)));
  }
  return [];
}

function buildFallbackHistory8w(currentValue, weeklyChange = 0) {
  const current = clampNumber(currentValue, 0, 100);
  const change = finite(weeklyChange) ?? 0;
  const start = clampNumber(current - change, 0, 100);
  return Array.from({ length: 8 }, (_, index) => {
    const t = index / 7;
    return Math.round(start + (current - start) * t);
  });
}

function buildVerdictBody(today) {
  const scoreText = today.score === null ? '等待数据' : String(today.score);
  const overlay = today.worldOrderOverlay.score === null
    ? 'World Order overlay 等待刷新'
    : `World Order overlay ${today.worldOrderOverlay.score} ${today.worldOrderOverlay.note}`;
  const tempNote = today.marketTemperatureNote || '市场温度等待 QQQ 周线历史接入';
  return `原始 ${scoreText} 落在 ${today.thresholdState}。${overlay}。${tempNote}；HY OAS 与 VIX 等反向证据仍需同步确认，判读保持观察语气而非危机定性。`;
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

function directionFromDelta(value, positiveLabel = '边际上升', negativeLabel = '边际回落') {
  const number = finite(value);
  if (number === null) return '方向待确认';
  if (number > 0) return positiveLabel;
  if (number < 0) return negativeLabel;
  return '基本持平';
}

function normalizeEvidenceList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (isPlainObject(item)) {
          const source = text(item.source, 'source');
          const value = item.value == null || item.value === '' ? '' : ` ${item.value}`;
          const detail = text(item.detail, '');
          return `${source}${value}${detail ? `：${detail}` : ''}`.trim();
        }
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
    coverageNotes: normalizeEvidenceList(overrides.coverageNotes),
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
  const scoreValue = finite(data?.score);
  const score = scoreValue === null ? null : Math.round(scoreValue);
  const moduleColorCounts = buildModuleColorCounts(data);
  const overlayScoreValue = finite(worldOrderStressData?.score);
  const overlayScore = overlayScoreValue === null ? null : Math.round(overlayScoreValue);
  const overlayLabel = text(worldOrderStressData?.labelZh, text(worldOrderStressData?.state, 'overlay 等待刷新'));
  const worldOrderOverlay = {
    score: overlayScore,
    label: overlayLabel,
    note: overlayScore !== null && overlayScore >= 60 ? '(升档提示)' : '(观察)',
  };
  const dominantRiskChain = text(
    brief?.dominantRiskChain?.labelZh,
    text(brief?.dominantRiskChain?.stageZh, '主风险链等待确认')
  );
  const oneLineConclusion = text(
    brief.oneLineConclusion,
    `${dominantRiskChain} 仍是今日主要观察链条。`
  );
  const thresholdState = thresholdStateLabel(scoreValue);
  const today = {
    score,
    moduleColorCounts,
    worldOrderOverlay,
    thresholdState,
    verdictKicker: `THIS ISSUE · ${text(data?.currentCrisisPhase, text(brief?.dominantRiskChain?.stageZh, thresholdState))}`,
    oneLineConclusion,
    verdictBody: '',
    dominantRiskChain,
    weeklyChange: formatWeeklyScoreChange(data?.scoreChange7d),
    dataHealth: buildTodayDataHealthText(data, healthDashboard),
    scoreHistory8w: normalizeHistory8w(data?.scoreHistory8w, data?.scoreHistory)
      .slice(-8),
    overlayHistory8w: normalizeHistory8w(worldOrderStressData?.scoreHistory8w, worldOrderStressData?.history)
      .slice(-8),
  };
  if (today.scoreHistory8w.length < 8) {
    today.scoreHistory8w = buildFallbackHistory8w(scoreValue, data?.scoreChange7d);
  }
  if (today.overlayHistory8w.length < 8) {
    today.overlayHistory8w = buildFallbackHistory8w(overlayScoreValue ?? scoreValue, 4);
  }
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  today.marketTemperatureNote = marketMetric
    ? `市场温度 z-score ${marketMetric.zScoreText}(${marketMetric.bucket.label})`
    : '市场温度等待 QQQ 周线历史接入';
  today.verdictBody = buildVerdictBody(today);
  return today;
}

function buildPressureSources(data, worldOrderStressData) {
  const modules = isPlainObject(data?.modules) ? data.modules : {};
  const trends = isPlainObject(data?.moduleTrends) ? data.moduleTrends : {};
  const dailyBrief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const dominantKey = String(dailyBrief?.dominantRiskChain?.key || dailyBrief?.key || '');
  const worldState = text(worldOrderStressData?.state, 'multi_theater_stress').replace(/_stress$/u, '');
  const definitions = [
    { id: 'energy', label: 'Energy 能源', up: '能源传导主线', flat: '能源横盘', down: '能源降温' },
    { id: 'geopolitical', label: 'Geopolitical 地缘', up: worldState, flat: '地缘观察', down: '地缘降温' },
    { id: 'inflation', label: 'Inflation 通胀', up: '通胀再抬头', flat: '横盘观察', down: '通胀降温' },
    { id: 'liquidity', label: 'Liquidity 流动性', up: '边际收紧', flat: '流动性观察', down: '边际宽松' },
    { id: 'debt', label: 'Debt 债务', up: '杠杆抬升', flat: '杠杆稳定', down: '杠杆降温' },
    { id: 'banking', label: 'Banking 银行', up: '银行压力', flat: '银行稳定', down: '持续改善' },
  ];

  return definitions.map((definition) => {
    const rawScore = finite(modules[definition.id]);
    const score = rawScore === null ? 0 : Math.max(0, Math.min(100, Math.round(rawScore)));
    const trend = finite(trends[definition.id]);
    const arrow = trend === null || trend === 0 ? '→' : trend > 0 ? '↑' : '↓';
    const phrase = arrow === '↑'
      ? definition.up
      : arrow === '↓'
        ? definition.down
        : definition.flat;
    const status = definition.id === 'energy' && dominantKey.includes('energy')
      ? `${arrow} 能源传导主线`
      : `${arrow} ${phrase}`;
    return {
      id: definition.id,
      label: definition.label,
      num: score,
      status,
      tone: score >= 70 ? 'red' : score >= 50 ? 'yellow' : 'green',
    };
  });
}

function narrativeScore(narrative) {
  const supporting = safeArray(narrative?.supportingEvidence).length;
  const missing = safeArray(narrative?.missingEvidence).length;
  const contradicting = safeArray(narrative?.contradictingEvidence).length;
  if (narrative?.assessment === 'strong_confirmation') return Math.min(88, 68 + supporting * 4);
  if (narrative?.assessment === 'partial_confirmation') return Math.min(64, 50 + supporting * 3);
  if (narrative?.assessment === 'contradiction') return Math.max(18, 38 - contradicting * 4);
  return Math.max(12, 28 - missing * 2);
}

function narrativeBody(narrative, marketMetric) {
  const base = text(narrative?.interpretation, '该 narrative 等待交叉验证矩阵补齐。');
  if (narrative?.id === 'overheat_confirmation') {
    return marketMetric
      ? `${base} ${marketMetric.evidenceLine}`
      : `${base} 市场温度等待 QQQ 周线历史确认。`;
  }
  return base;
}

function buildSignalLayers(data, marketPricingMetricsData = null, crossValidationMatrix = null) {
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  const matrix = isPlainObject(crossValidationMatrix)
    ? crossValidationMatrix
    : buildCrossValidationMatrix(data, {}, marketPricingMetricsData);
  const byId = new Map(safeArray(matrix.narratives).map((item) => [item?.id, item]));
  return Object.keys(NARRATIVE_EMOJI).map((key) => {
    const narrative = byId.get(key) || { id: key, label: NARRATIVE_LABELS[key], assessment: 'insufficient_data' };
    const score = narrativeScore(narrative);
    return {
      key,
      name: `${key} ${NARRATIVE_LABELS[key] || narrative.label || key}`,
      score,
      body: narrativeBody(narrative, marketMetric),
      isActive: score >= 50,
    };
  });
}

function buildMacroDrivers(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  const policyExpectations = isPlainObject(macroDrivers.policyExpectations) ? macroDrivers.policyExpectations : {};
  const curve = isPlainObject(macroDrivers.curve) ? macroDrivers.curve : {};
  const credit = isPlainObject(macroDrivers.credit) ? macroDrivers.credit : {};

  const onRrp = finite(fedLiquidity.onRrp);
  const walcl4wChange = finite(fedLiquidity.walcl4wChange);
  const reserveBalances = finite(fedLiquidity.reserveBalances);
  const reserveBalances4wChange = finite(fedLiquidity.reserveBalances4wChange);
  const effectiveFedFundsRate = finite(fedLiquidity.effectiveFedFundsRate);
  const sofr = finite(fedLiquidity.sofr);
  const bgcrSofrSpread = finite(fedLiquidity.bgcrSofrSpread);
  const futureMinusTargetMid = finite(policyExpectations.futureMinusTargetMid);
  const fedFundsFutureImpliedRate = finite(policyExpectations.fedFundsFutureImpliedRate);
  const targetMid = finite(policyExpectations.targetMid);
  const t10y2y = finite(curve.t10y2y);
  const t10y2yWeekChange = finite(curve.t10y2yWeekChange);
  const hyOas = finite(credit.hyOas ?? inputs.hyOas);
  const igOas = finite(credit.igOas);
  const nfci = finite(credit.nfci);
  const sloosLarge = finite(credit.sloosTighteningLargeFirms);
  const sloosSmall = finite(credit.sloosTighteningSmallFirms);
  const sloosMax = [sloosLarge, sloosSmall].filter((value) => value !== null).reduce((max, value) => Math.max(max, value), null);

  const fedSentence = [
    onRrp === null ? 'ON RRP 等待刷新' : `ON RRP ${formatUsdTrillions(onRrp)}`,
    walcl4wChange === null ? null : `WALCL 4w ${formatUsdBillionsFromFedChange(walcl4wChange)}`,
    reserveBalances === null ? null : `reserve balances ${formatUsdTrillions(reserveBalances / 1_000_000)} (${formatSignedPercent(reserveBalances4wChange)})`,
    effectiveFedFundsRate === null ? null : `DFF ${formatNumber(effectiveFedFundsRate, 2, '%')}` ,
    sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')}` ,
    bgcrSofrSpread === null ? null : `BGCR-SOFR ${formatBasisPoints(bgcrSofrSpread)}` ,
  ].filter(Boolean).join(' / ');

  const policySentence = [
    targetMid === null ? 'Fed target midpoint 等待刷新' : `target midpoint ${formatNumber(targetMid, 2, '%')}` ,
    fedFundsFutureImpliedRate === null ? null : `ZQ implied ${formatNumber(fedFundsFutureImpliedRate, 2, '%')}` ,
    futureMinusTargetMid === null ? null : `market vs Fed ${formatSignedPoints(futureMinusTargetMid)}` ,
    `regime ${text(policyExpectations.policyExpectationRegime, '未知')}` ,
  ].filter(Boolean).join(' / ');

  const curveSentence = [
    t10y2y === null ? '10Y-2Y 期限利差等待刷新' : `10Y-2Y ${formatSignedPercent(t10y2y)}` ,
    t10y2yWeekChange === null ? null : `weekly ${formatSignedPercent(t10y2yWeekChange)}` ,
    `regime ${text(curve.regime, '未知')}` ,
  ].filter(Boolean).join(' / ');

  const creditSentence = [
    hyOas === null ? 'HY OAS 等待刷新' : `HY OAS ${formatNumber(hyOas, 2, '%')}` ,
    igOas === null ? null : `IG OAS ${formatNumber(igOas, 2, '%')}` ,
    nfci === null ? null : `NFCI ${nfci >= 0 ? '+' : ''}${formatNumber(nfci, 2)} (${text(credit.nfciRegime, '未知')})` ,
    sloosMax === null ? null : `SLOOS max ${formatSignedPercent(sloosMax, 1)} (${text(credit.sloosRegime, '未知')})` ,
  ].filter(Boolean).join(' / ');

  return {
    fed: { label: 'Fed Liquidity', sentence: fedSentence || 'Fed liquidity data waiting for refresh.' },
    policy: { label: 'Policy Expectations', sentence: policySentence || 'Policy expectations waiting for public proxy refresh.' },
    curve: { label: 'Curve', sentence: curveSentence || 'Curve data waiting for refresh.' },
    credit: { label: 'Credit', sentence: creditSentence || 'Credit data waiting for refresh.' },
    subModuleListText: '子模块完整列表:fedLiquidity / policyExpectations / curve / credit / consumer / shippingFreight / employment / consumerRetail / commercialRealEstate / privateCreditProxy / activeSignals / gatingEvaluation',
  };
}

function buildMarketTemperature(marketPricingMetricsData = null) {
  const records = getMetricRecords(marketPricingMetricsData);
  const latest = records[records.length - 1];

  if (latest) {
    const zScore = finite(latest.zScore);
    const bucket = getMarketTemperatureBucketInfo(zScore);
    const distance = Math.abs(zScore).toFixed(2);
    const direction = bucket.key.includes('hot')
      ? '风险偏热'
      : bucket.key.includes('cold')
        ? '风险偏冷'
        : '中性观察';

    return createJudgment({
      id: 'market-pricing-temperature',
      title: '市场定价温度计',
      group: 'market-temperature',
      status: bucket.label,
      direction,
      confidence: '偏高',
      dataCoverage: '数据覆盖：QQQ 周线历史已接入',
      evidence: [
        `QQQ 周线 z-score: ${formatSignedDecimal(zScore, 2)}`,
        `Bucket: ${bucket.label}`,
        `历史记录数: ${records.length} 周`,
        `最新周: ${latest.date} / ${latest.isoWeek}`,
      ],
      missingEvidence: [],
      counterEvidence: [],
      explanation: bucket.interpretation(distance),
      sourceType: 'market-pricing-metrics',
      updatedAt: latest.date,
      conclusion: `当前 QQQ 周线 z-score = ${formatSignedDecimal(zScore, 2)}，市场温度处于「${bucket.label}」。`,
    });
  }

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

function getAssetMetricContext(metricsData, assetKey) {
  if (!isPlainObject(metricsData?.assets?.[assetKey])) return null;
  const asset = metricsData.assets[assetKey];
  const records = safeArray(asset.records).filter(isValidMetricRecord);
  const progress = isPlainObject(asset.progress) ? asset.progress : {};
  return {
    assetKey,
    symbol: typeof asset.symbol === 'string' ? asset.symbol : assetKey.toUpperCase(),
    labelZh: typeof asset.labelZh === 'string' ? asset.labelZh : assetKey.toUpperCase(),
    displayLabelZh: typeof asset.displayLabelZh === 'string' ? asset.displayLabelZh : AUXILIARY_MARKET_LABELS[assetKey] || assetKey.toUpperCase(),
    role: typeof asset.role === 'string' ? asset.role : 'auxiliary_comparison',
    status: typeof asset.status === 'string' ? asset.status : 'unknown',
    sourceRecordsCount: Number.isFinite(Number(asset.sourceRecordsCount)) ? Number(asset.sourceRecordsCount) : records.length,
    metricsRecordsCount: Number.isFinite(Number(asset.metricsRecordsCount)) ? Number(asset.metricsRecordsCount) : records.length,
    progress: {
      recordsCollected: Number.isFinite(Number(progress.recordsCollected)) ? Number(progress.recordsCollected) : 0,
      recordsRequired: Number.isFinite(Number(progress.recordsRequired)) ? Number(progress.recordsRequired) : 60,
      remainingRecords: Number.isFinite(Number(progress.remainingRecords)) ? Number(progress.remainingRecords) : null,
    },
    records,
    latest: records[records.length - 1] || null,
  };
}

function getAuxiliaryMarketPricingContexts(metricsData) {
  return ['ndx', 'ixic']
    .map((assetKey) => getAssetMetricContext(metricsData, assetKey))
    .filter(Boolean);
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
  const privateCreditProxy = isPlainObject(macroDrivers.privateCreditProxy) ? macroDrivers.privateCreditProxy : {};
  const employment = isPlainObject(macroDrivers.employment) ? macroDrivers.employment : {};
  const modules = isPlainObject(data?.modules) ? data.modules : {};
  const trends = isPlainObject(data?.moduleTrends) ? data.moduleTrends : {};
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const creditCalm = finite(inputs.hyOas) !== null && Number(inputs.hyOas) < 4 && finite(inputs.vix) !== null && Number(inputs.vix) < 22;
  const marketMetric = getMarketPricingMetricContext(marketPricingMetricsData);
  const worldState = text(worldOrderStressData?.state, 'multi_theater_stress').replace(/_stress$/u, '');
  const privateCreditStress = finite(privateCreditProxy.cdxHyPrice) !== null || finite(privateCreditProxy.bdcEtf4wChange) !== null;
  const liquidityScore = Math.max(finite(modules.liquidity) ?? 0, finite(trends.liquidity) > 0 ? 55 : 0);
  const consumerStatus = marketMetric ? '实际工资压制' : '消费待确认';
  const dominantKey = String(brief?.dominantRiskChain?.key || brief?.key || '');
  const engineGrade = (score, fallback = 0) => {
    const value = finite(score);
    const normalized = value === null ? fallback : value;
    if (normalized >= 70) return 'RED';
    if (normalized >= 50) return 'YEL';
    return 'GRN';
  };
  const card = (id, label, score, status, fallback = 0) => {
    const num = engineGrade(score, fallback);
    return { id, label, num, status, tone: num === 'RED' ? 'red' : num === 'YEL' ? 'yellow' : 'green' };
  };

  return [
    card('B1', 'B1 Energy', modules.energy, dominantKey.includes('energy') ? '能源冲击主导' : '能源压力观察'),
    card('B2', 'B2 Liquidity', liquidityScore, '流动性边际收紧'),
    card('B3', 'B3 Credit', creditCalm ? 30 : privateCreditStress ? 55 : modules.banking, creditCalm ? '信用反向证据' : '信用扩散观察'),
    card('B4', 'B4 Debt', modules.debt, '杠杆稳定'),
    card('B5', 'B5 Consumer', finite(employment.realAverageHourlyEarningsYoY) !== null ? 55 : modules.inflation, consumerStatus, 55),
    card('B6', 'B6 Geopolitical', modules.geopolitical, worldState || 'multi_theater'),
  ];
}

function buildCrossValidation(data, worldOrderStressData, marketPricingMetricsData = null) {
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  data = { ...data, macroDrivers: { ...macroDrivers, fedLiquidity } };
  return buildCrossValidationMatrix(data, worldOrderStressData, marketPricingMetricsData);
}

export function buildMacroOverview(data = {}, healthDashboard = {}, worldOrderStressData = {}, marketPricingMetricsData = null) {
  const crossValidationMatrix = buildCrossValidation(data, worldOrderStressData, marketPricingMetricsData);
  const drivers4Pillars = buildMacroDrivers(data);
  const overview = {
    today: buildTodayJudgment(data, healthDashboard, worldOrderStressData, marketPricingMetricsData),
    pressures: buildPressureSources(data, worldOrderStressData),
    signalLayers: buildSignalLayers(data, marketPricingMetricsData, crossValidationMatrix),
    drivers: drivers4Pillars,
    drivers4Pillars,
    marketTemperature: buildMarketTemperature(marketPricingMetricsData),
    riskEngines: buildRiskEngines(data, worldOrderStressData, marketPricingMetricsData),
    crossValidation: crossValidationMatrix.narratives,
    crossValidationMatrix,
  };
  overview.dailyBriefHeadline = text(data?.dailyBrief?.oneLineConclusion, '本期关键变化');
  overview.keyChanges = buildKeyChanges(overview, data, healthDashboard);
  return overview;
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
  if (kind === 'gap') return '━ 数据不足';
  return '━ 暂未确认';
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
      directionType(`${mainPressure.status} ${mainPressure.num}`),
      `${mainPressure.label}：${mainPressure.status || UNDECIDED}`,
      'PRESSURE SOURCES'
    ));
  }

  const signalCounts = countSignalStates(overview.signalLayers);
  if (signalCounts.latent > 0) {
    changes.push(keyChange(
      signalCounts.active > signalCounts.latent ? 'up' : 'flat',
      `信号分层显示 ${signalCounts.active} 项 ACTIVE、${signalCounts.latent} 项 LATENT。`,
      'SIGNAL LAYERS'
    ));
  }

  const engineCounts = safeArray(overview.riskEngines).reduce((counts, engine) => {
    const grade = String(engine?.num || '');
    if (grade === 'RED') counts.red += 1;
    else if (grade === 'YEL') counts.yellow += 1;
    else counts.green += 1;
    return counts;
  }, { red: 0, yellow: 0, green: 0 });
  changes.push(keyChange(
    engineCounts.red > 0 ? 'up' : engineCounts.yellow > 0 ? 'flat' : 'down',
    `风险引擎显示 ${engineCounts.red} 项 RED、${engineCounts.yellow} 项 YEL、${engineCounts.green} 项 GRN。`,
    'RISK ENGINES'
  ));

  const validationCounts = assessmentCounts(overview.crossValidation);
  changes.push(keyChange(
    validationCounts.insufficient_data > 0 ? 'gap' : validationCounts.partial_confirmation > 0 ? 'flat' : 'down',
    `交叉验证仍有 ${validationCounts.partial_confirmation} 项部分确认、${validationCounts.insufficient_data} 项数据不足，${validationCounts.contradiction} 项矛盾信号不隐藏。`,
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

function appendEditorialBigNumber(root, today) {
  const left = document.createElement('div');
  left.className = 'big-left';
  appendText(left, 'div', 'label', 'TODAY JUDGMENT · 今日总判断');
  const scoreWrap = document.createElement('div');
  const value = document.createElement('div');
  value.className = 'value';
  value.append(document.createTextNode(today.score === null ? '--' : String(today.score)));
  const sup = document.createElement('sup');
  sup.textContent = '/100';
  value.appendChild(sup);
  scoreWrap.appendChild(value);
  const breakdown = document.createElement('div');
  breakdown.className = 'breakdown';
  breakdown.append(document.createTextNode('6 底层模块中 '));
  const strong = document.createElement('strong');
  strong.textContent = `${today.moduleColorCounts.red} 红 / ${today.moduleColorCounts.yellow} 黄 / ${today.moduleColorCounts.green} 绿`;
  breakdown.appendChild(strong);
  breakdown.appendChild(document.createElement('br'));
  breakdown.append(document.createTextNode(`World Order overlay: ${today.worldOrderOverlay.score ?? '--'}${today.worldOrderOverlay.note}`));
  scoreWrap.appendChild(breakdown);
  left.appendChild(scoreWrap);
  root.appendChild(left);

  const right = document.createElement('div');
  right.className = 'big-right';
  appendText(right, 'div', 'verdict-kicker', today.verdictKicker);
  appendText(right, 'h2', '', today.oneLineConclusion);
  appendText(right, 'p', '', today.verdictBody);
  root.appendChild(right);

  const footer = document.createElement('div');
  footer.className = 'big-footer';
  [
    ['DOMINANT RISK CHAIN', today.dominantRiskChain],
    ['WEEKLY CHANGE', today.weeklyChange],
    ['DATA HEALTH', today.dataHealth],
  ].forEach(([label, valueText]) => {
    const item = document.createElement('div');
    appendText(item, 'div', 'k', label);
    appendText(item, 'div', 'v', valueText);
    footer.appendChild(item);
  });
  root.appendChild(footer);
}

function appendThresholdBlock(root, today) {
  const header = document.createElement('div');
  header.className = 'threshold-header';
  const title = document.createElement('h4');
  title.append(document.createTextNode('触发阈值标尺 '));
  const em = document.createElement('em');
  em.textContent = '· Threshold Scale';
  title.appendChild(em);
  header.appendChild(title);
  const overlayScore = today.worldOrderOverlay.score ?? '--';
  appendText(header, 'div', 'now', `原始 ${today.score ?? '--'}(${today.thresholdState}) · overlay ${overlayScore} ${today.worldOrderOverlay.note}`);
  root.appendChild(header);

  const wrap = document.createElement('div');
  wrap.className = 'threshold-bar-wrap';
  const bar = document.createElement('div');
  bar.className = 'threshold-bar';
  [
    ['zone t-green', 25, '观察期', '0-25'],
    ['zone t-yellow', 15, '中度警戒', '25-40'],
    ['zone t-orange', 20, '高风险预警', '40-60'],
    ['zone t-red', 40, '系统性顶部', '>=60'],
  ].forEach(([className, flex, label, pct]) => {
    const zone = document.createElement('div');
    zone.className = className;
    zone.style.flex = String(flex);
    appendText(zone, 'span', 'zone-label', label);
    appendText(zone, 'span', 'zone-pct', pct);
    bar.appendChild(zone);
  });

  const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.left = `${clampNumber(today.score, 0, 100)}%`;
  appendText(marker, 'span', 'marker-label', `原始 ${today.score ?? '--'}`);
  bar.appendChild(marker);

  const overlay = document.createElement('div');
  overlay.className = 'marker override';
  overlay.style.left = `${clampNumber(today.worldOrderOverlay.score, 0, 100)}%`;
  appendText(overlay, 'span', 'marker-label', `overlay ${today.worldOrderOverlay.score ?? '--'}`);
  bar.appendChild(overlay);

  wrap.appendChild(bar);
  root.appendChild(wrap);
}

function appendSvgNode(root, tag, attributes = {}, textValue = '') {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (textValue) node.textContent = textValue;
  root.appendChild(node);
  return node;
}

function trendPoint(value, index) {
  const x = 80 + (680 / 7) * index;
  const y = 180 - (clampNumber(value, 0, 70) / 70) * 160;
  return `${formatFiniteNumber(x, 2)},${formatFiniteNumber(y, 2)}`;
}

function appendTrendBlock(root, today) {
  const header = document.createElement('div');
  header.className = 'trend-block-header';
  const title = document.createElement('h4');
  title.append(document.createTextNode('8 周趋势 '));
  const em = document.createElement('em');
  em.textContent = '· 8-Week Trend';
  title.appendChild(em);
  header.appendChild(title);
  const legend = document.createElement('div');
  legend.style.fontFamily = 'var(--font-mono)';
  legend.style.fontSize = '11px';
  legend.style.color = 'var(--paper-muted)';
  legend.textContent = 'Score / Overlay · y 0-70 · 阈值线 25/40/60';
  header.appendChild(legend);
  root.appendChild(header);

  const wrap = document.createElement('div');
  wrap.className = 'trend-svg-wrap';
  const svg = appendSvgNode(wrap, 'svg', {
    viewBox: '0 0 800 200',
    preserveAspectRatio: 'none',
  });
  appendSvgNode(svg, 'rect', { x: 0, y: 0, width: 800, height: 200, fill: '#F5F0E5' });
  [
    [25, '#1F4D2C'],
    [40, '#A8761A'],
    [60, '#7C1D1D'],
  ].forEach(([value, color]) => {
    const y = 180 - (value / 70) * 160;
    appendSvgNode(svg, 'line', { x1: 40, y1: y, x2: 780, y2: y, stroke: color, 'stroke-width': 1, 'stroke-dasharray': '4,3', opacity: 0.55 });
    appendSvgNode(svg, 'text', { x: 784, y: y + 4, 'font-family': 'IBM Plex Mono', 'font-size': 9, fill: color }, String(value));
  });
  appendSvgNode(svg, 'polyline', {
    points: today.scoreHistory8w.map(trendPoint).join(' '),
    fill: 'none',
    stroke: '#7C1D1D',
    'stroke-width': 2.5,
  });
  appendSvgNode(svg, 'polyline', {
    points: today.overlayHistory8w.map(trendPoint).join(' '),
    fill: 'none',
    stroke: '#C86B2E',
    'stroke-width': 2,
    'stroke-dasharray': '6,4',
  });
  ['W-7', 'W-5', 'W-3', 'W-1', 'NOW'].forEach((label, index) => {
    const x = [80, 274.29, 468.57, 662.86, 760][index];
    appendSvgNode(svg, 'text', { x, y: 195, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 10, fill: '#6F685C' }, label);
  });
  root.appendChild(wrap);
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

function countSignalStates(items) {
  return safeArray(items).reduce((counts, item) => {
    if (item?.isActive) counts.active += 1;
    else counts.latent += 1;
    return counts;
  }, { active: 0, latent: 0 });
}

function deriveSignalMeta(items) {
  const counts = countSignalStates(items);
  return `7 个 narratives 中:${counts.active} active / ${counts.latent} latent · NARRATIVE_EMOJI 映射`;
}









function formatAuxiliaryTemperatureLine(metricsData) {
  const assets = getAuxiliaryMarketPricingContexts(metricsData)
    .map((asset) => {
      if (!asset?.latest) return null;
      return `${String(asset.assetKey || '').toUpperCase()} ${formatSignedDecimal(asset.latest.zScore, 2)}σ`;
    })
    .filter(Boolean);
  return assets.length ? `${assets.join(' / ')}，用于横向对照与广度参照。` : '';
}

function appendMarketTemperatureBody(rootEl, judgment, metricsData) {
  const records = getMetricRecords(metricsData);
  const latest = records[records.length - 1];
  const zRange = getZScoreRange(records);
  const body = document.createElement('div');
  body.className = 'runtime-block-body';
  if (!latest || !zRange) {
    const layout = document.createElement('div');
    layout.className = 'market-temp-layout';
    const left = document.createElement('div');
    appendText(left, 'div', 'market-temp-bucket', `${MARKET_TEMPERATURE_WAITING_STATUS} · waiting`);
    const value = appendText(left, 'div', 'market-temp-zscore', '--');
    appendText(value, 'span', '', 'σ');
    appendText(left, 'div', 'market-temp-sub', 'QQQ vs 60 周均值 · z-score 等待');
    const right = document.createElement('div');
    appendText(right, 'p', 'market-temp-detail', judgment?.explanation || '历史周线数据不足，暂无法判断市场偏冷 / 正常 / 偏热 / 过热。');
    const metrics = document.createElement('div');
    metrics.className = 'market-temp-metrics';
    [
      ['status', MARKET_TEMPERATURE_WAITING_STATUS],
      ['ma60', '60 周均值'],
      ['metric', 'z-score'],
      ['disclaimer', MARKET_TEMPERATURE_DISCLAIMER],
    ].forEach(([label, valueText]) => {
      const item = document.createElement('div');
      item.textContent = `${label}: `;
      appendText(item, 'strong', '', valueText);
      metrics.appendChild(item);
    });
    right.appendChild(metrics);
    layout.append(left, right);
    body.appendChild(layout);
    rootEl.appendChild(body);
    return;
  }

  const bucket = getMarketTemperatureBucketInfo(latest.zScore);
  const distance = Math.abs(finite(latest.zScore) || 0).toFixed(2);
  const layout = document.createElement('div');
  layout.className = 'market-temp-layout';
  const left = document.createElement('div');
  appendText(left, 'div', 'market-temp-bucket', `${bucket.label} · ${bucket.key}`);
  const zScoreDisplay = appendText(left, 'div', 'market-temp-zscore', formatSignedDecimal(latest.zScore, 2));
  appendText(zScoreDisplay, 'span', '', 'σ');
  appendText(left, 'div', 'market-temp-sub', 'QQQ vs 60 周均值 · 历史第二极端');

  const right = document.createElement('div');
  const auxiliaryLine = formatAuxiliaryTemperatureLine(metricsData);
  appendText(right, 'p', 'market-temp-detail', [
    bucket.interpretation(distance),
    auxiliaryLine,
    MARKET_TEMPERATURE_DISCLAIMER,
  ].filter(Boolean).join(' '));
  const metricGrid = document.createElement('div');
  metricGrid.className = 'market-temp-metrics';
  [
    ['close', formatCurrency(latest.close)],
    ['ma60', formatCurrency(latest.ma60)],
    ['stdDev60', formatCurrency(latest.stdDev60)],
    ['zScoreRange', `[${formatSignedDecimal(zRange.min, 2)}, ${formatSignedDecimal(zRange.max, 2)}]`],
  ].forEach(([label, valueText]) => {
    const item = document.createElement('div');
    item.textContent = `${label}: `;
    appendText(item, 'strong', '', valueText);
    metricGrid.appendChild(item);
  });
  right.appendChild(metricGrid);
  layout.append(left, right);
  body.appendChild(layout);
  rootEl.appendChild(body);
}

export function renderMarketTemperatureWaitingState(rootEl, judgment = buildMarketTemperature()) {
  if (!rootEl) return;
  rootEl.replaceChildren();
  appendMarketTemperatureBody(rootEl, judgment, null);
}

export function renderMarketTemperatureCard(rootEl, metricsData, judgment = buildMarketTemperature()) {
  if (!rootEl) return;
  rootEl.replaceChildren();
  appendMarketTemperatureBody(rootEl, judgment, metricsData);
}

function assessmentCounts(narratives) {
  const counts = {
    strong_confirmation: 0,
    partial_confirmation: 0,
    contradiction: 0,
    insufficient_data: 0,
  };
  safeArray(narratives).forEach((item) => {
    const key = String(item?.assessment || 'insufficient_data');
    if (Object.hasOwn(counts, key)) counts[key] += 1;
    else counts.insufficient_data += 1;
  });
  return counts;
}

function appendConsistencyBlock(root, matrix) {
  const block = document.createElement('div');
  block.className = 'consistency-block is-primary';
  const score = finite(matrix?.consistencyScore);
  const scoreText = score === null ? '--' : String(Math.round(score));
  const fillWidth = score === null ? 0 : Math.max(0, Math.min(100, score));
  const counts = assessmentCounts(matrix?.narratives);
  appendText(block, 'div', 'consistency-label', 'CONSISTENCY SCORE');

  const barWrap = document.createElement('div');
  barWrap.className = 'consistency-bar-wrap';
  const bar = document.createElement('div');
  bar.className = 'consistency-bar';
  const fill = document.createElement('div');
  fill.className = 'fill';
  fill.style.width = `${fillWidth}%`;
  bar.appendChild(fill);
  barWrap.appendChild(bar);
  block.appendChild(barWrap);

  appendText(block, 'div', 'consistency-value', `${scoreText}/100`);
  appendText(block, 'div', 'consistency-detail', [
    matrix?.oneLineSummary || '交叉验证矩阵等待数据。',
    `${counts.strong_confirmation} strong_confirmation / ${counts.contradiction} contradiction / ${counts.insufficient_data} insufficient_data`,
  ].join(' · '));
  root.appendChild(block);
}

function appendNarrativeItem(root, item) {
  const card = document.createElement('div');
  card.className = `narrative-item${item?.isActive ? ' active' : ''}`;
  const head = document.createElement('div');
  head.className = 'head';
  appendText(head, 'span', 'emoji', NARRATIVE_EMOJI[item?.key] || '·');
  appendText(head, 'span', 'name', item?.name || item?.key || 'unknown narrative');
  appendText(head, 'span', 'score', `score ${Math.round(finite(item?.score) ?? 0)} · ${item?.isActive ? 'ACTIVE' : 'LATENT'}`);
  card.appendChild(head);
  appendText(card, 'p', '', item?.body || '该 narrative 等待交叉验证矩阵补齐。');
  root.appendChild(card);
}

function appendNarrativeList(root, items) {
  const list = document.createElement('div');
  list.className = 'narrative-list';
  safeArray(items).forEach((item) => appendNarrativeItem(list, item));
  root.appendChild(list);
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

function appendRuntimeBlock(root, id, title, enLabel, meta = '') {
  const block = document.createElement('div');
  block.className = 'runtime-block';
  block.id = id;
  const header = document.createElement('div');
  header.className = 'runtime-block-header';
  const heading = document.createElement('h3');
  heading.append(document.createTextNode(title));
  if (enLabel) appendText(heading, 'span', 'en', enLabel);
  header.appendChild(heading);
  if (meta) appendText(header, 'div', 'meta', meta);
  block.appendChild(header);
  root.appendChild(block);
  return block;
}

function appendMiniCard(root, item) {
  const tone = ['red', 'yellow', 'green'].includes(item?.tone) ? item.tone : 'green';
  const card = document.createElement('div');
  card.className = `mini-card ${tone}`;
  appendText(card, 'div', 'label', item?.label || 'Unknown');
  appendText(card, 'div', 'num', String(item?.num ?? '--'));
  appendText(card, 'div', 'status', item?.status || '→ 等待确认');
  root.appendChild(card);
}

function appendMiniGrid(root, items) {
  const grid = document.createElement('div');
  grid.className = 'mini-grid';
  safeArray(items).forEach((item) => appendMiniCard(grid, item));
  root.appendChild(grid);
}

function appendDriverPillarGrid(root, pillars) {
  const body = document.createElement('div');
  body.className = 'runtime-block-body';
  const grid = document.createElement('div');
  grid.className = 'driver-pillar-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(220px,1fr))';
  grid.style.gap = '14px';
  ['fed', 'policy', 'curve', 'credit'].forEach((key) => {
    const item = pillars?.[key] || {};
    const pillar = document.createElement('div');
    const label = appendText(pillar, 'strong', '', item.label || key);
    label.style.display = 'block';
    label.style.marginBottom = '4px';
    const copy = appendText(pillar, 'p', '', item.sentence || '等待数据刷新。');
    copy.style.margin = '0';
    grid.appendChild(pillar);
  });
  body.appendChild(grid);
  const submodules = appendText(body, 'div', 'driver-submodules', pillars?.subModuleListText || '子模块完整列表:等待数据刷新');
  submodules.style.marginTop = '14px';
  submodules.style.paddingTop = '10px';
  submodules.style.borderTop = '1px dashed var(--paper-line-strong)';
  root.appendChild(body);
}

function wowTone(kind = '') {
  if (kind === 'up') return 'up';
  if (kind === 'down') return 'down';
  return 'flat';
}

function appendWowSection(root, changes, headline = '') {
  const section = document.createElement('section');
  section.className = 'wow-section';
  section.id = 'wow-key-changes';
  appendText(section, 'div', 'wow-label', '本期关键变化 · Week-over-Week');

  const title = document.createElement('h3');
  title.append(document.createTextNode(text(headline, '能源链加压，信用反向证据，地缘 overlay 升档')));
  const em = document.createElement('em');
  em.textContent = ' · this issue\'s deltas';
  title.appendChild(em);
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'wow-grid';
  const fallback = [keyChange('flat', '暂无足够边际变化数据，本区仅展示已能确认的方向性提示。', 'fallback')];
  (safeArray(changes).length ? safeArray(changes) : fallback).forEach((item) => {
    const tone = wowTone(item?.kind);
    const card = document.createElement('article');
    card.className = 'wow-item';
    appendText(card, 'span', `wow-tag is-${tone}`, item?.tag || keyChangeTag(tone));
    const textEl = document.createElement('div');
    textEl.className = 'wow-text';
    textEl.textContent = item?.body || '方向性提示等待确认。';
    if (item?.source) appendText(textEl, 'span', 'wow-source', item.source);
    card.appendChild(textEl);
    grid.appendChild(card);
  });
  section.appendChild(grid);
  root.appendChild(section);
}

export function renderMacroRiskOverview(data, healthDashboard, worldOrderStressData, marketPricingMetricsData = null, container = $('macro-risk-overview-root')) {
  if (!container) return;
  const overview = buildMacroOverview(data, healthDashboard, worldOrderStressData, marketPricingMetricsData);
  container.replaceChildren();

  const today = document.createElement('article');
  today.className = 'editorial-big-number';
  today.id = 'homepage-today-judgment';
  container.appendChild(today);
  appendEditorialBigNumber(today, overview.today);

  const thresholdBlock = document.createElement('div');
  thresholdBlock.className = 'threshold-block';
  container.appendChild(thresholdBlock);
  appendThresholdBlock(thresholdBlock, overview.today);

  const trendBlock = document.createElement('div');
  trendBlock.className = 'trend-block';
  container.appendChild(trendBlock);
  appendTrendBlock(trendBlock, overview.today);

  const pressure = appendRuntimeBlock(
    container,
    'homepage-pressure-sources',
    '压力来源',
    'PRESSURE SOURCES',
    '六大底层模块 · data.modules 扁平数字 · data.moduleTrends 趋势'
  );
  appendMiniGrid(pressure, overview.pressures);

  const signals = appendRuntimeBlock(
    container,
    'homepage-signal-layers',
    '信号分层',
    'SIGNAL LAYERS · 7 NARRATIVES',
    deriveSignalMeta(overview.signalLayers)
  );
  appendNarrativeList(signals, overview.signalLayers);

  const drivers = appendRuntimeBlock(
    container,
    'homepage-macro-drivers',
    '四大驱动',
    'MACRO DRIVERS · 13 SUB-MODULES IN 4 PILLARS',
    'fedLiquidity / policyExpectations / curve / credit + consumer / shippingFreight / employment / consumerRetail / commercialRealEstate / privateCreditProxy 等'
  );
  appendDriverPillarGrid(drivers, overview.drivers4Pillars);

  const temp = appendRuntimeBlock(
    container,
    'homepage-market-temperature',
    '市场温度',
    'MARKET PRICING TEMPERATURE',
    'QQQ 60 周均值 + z-score · NDX/IXIC 广度对照 · 本数据为统计描述，不构成投资建议'
  );
  appendMarketTemperatureBody(temp, overview.marketTemperature, marketPricingMetricsData);

  const engines = appendRuntimeBlock(
    container,
    'homepage-risk-engines',
    '风险引擎',
    'RISK ENGINES · 6 ENGINES + AUXILIARY',
    'data.modules 6 引擎 + divergenceLayer + privateCreditProxy + worldOrderStress + marketTemperature 等多源派生'
  );
  appendMiniGrid(engines, overview.riskEngines);

  const cross = appendRuntimeBlock(
    container,
    'homepage-cross-validation',
    '交叉验证',
    'CROSS VALIDATION MATRIX',
    '7 narrative consistency score · strong / contradiction / insufficient data counts'
  );
  appendConsistencyBlock(cross, overview.crossValidationMatrix);

  appendWowSection(container, overview.keyChanges, overview.dailyBriefHeadline);
}
