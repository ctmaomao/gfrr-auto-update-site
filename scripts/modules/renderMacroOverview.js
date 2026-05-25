import { $ } from './config.js?v=28.0M-94';
import { ASSESSMENT_LABELS, buildCrossValidationMatrix } from './buildCrossValidationMatrix.js?v=28.0M-94';
import { formatFiniteNumber } from './format.js?v=28.0M-94';

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
// M-92A today-summary helper block start.
const TODAY_SUMMARY_STATE_PHRASES = Object.freeze({
  dataDegraded: '数据降级，维持观察',
  systemicRisk: '系统性风险观察',
  localShock: '局部冲击观察',
  pressureRising: '压力上升观察',
  marginalRelief: '压力边际缓和',
  maintainCurrent: '维持当前判断',
  normalWatch: '常态观察',
  insufficientEvidence: '证据不足，等待确认',
});
// M-92A today-summary helper block end.

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

// M-92A today-summary helper block start.
function formatCompactScoreChange(value) {
  const number = finite(value);
  if (number === null) return NO_HISTORY;
  if (number === 0) return '0';
  return `${number > 0 ? '+' : '-'}${Math.abs(number).toFixed(0)}`;
}

function compactSummaryText(value, maxLength = 72) {
  const source = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  if (!source) return '';
  return source.length > maxLength ? `${source.slice(0, maxLength - 3)}...` : source;
}

function formatTodayEvidenceLine(item) {
  if (typeof item === 'string') return compactSummaryText(item);
  if (!isPlainObject(item)) return '';
  const label = typeof item.labelZh === 'string' && item.labelZh.trim()
    ? item.labelZh.trim()
    : text(item.key, '证据');
  const summary = typeof item.summaryZh === 'string' && item.summaryZh.trim()
    ? item.summaryZh.trim()
    : '';
  if (!summary) return compactSummaryText(label);
  return compactSummaryText(summary.includes(label) ? summary : `${label}：${summary}`);
}

function buildTodayTopRisks(data, worldOrderStressData) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const dominantEvidence = safeArray(brief?.dominantRiskChain?.evidence)
    .map(formatTodayEvidenceLine)
    .filter(Boolean);
  if (dominantEvidence.length >= 3) return dominantEvidence.slice(0, 3);

  const pressureEvidence = buildPressureSources(data, worldOrderStressData)
    .slice(0, 3)
    .map((item) => {
      const evidence = normalizeEvidenceList(item.evidence)[0];
      return compactSummaryText(`${item.title}：${item.status}${evidence ? `；${evidence}` : ''}`);
    })
    .filter(Boolean);
  return (dominantEvidence.length ? dominantEvidence : pressureEvidence).slice(0, 3);
}

function buildTodayNoiseDivergences(data, marketPricingMetricsData) {
  const brief = isPlainObject(data?.dailyBrief) ? data.dailyBrief : {};
  const divergenceLayer = isPlainObject(data?.divergenceLayer) ? data.divergenceLayer : {};
  const seen = new Set();
  const items = [];
  const pushItem = (key, value) => {
    const normalized = compactSummaryText(value, 86);
    const identity = key || normalized;
    if (!normalized || seen.has(identity)) return;
    seen.add(identity);
    items.push(normalized);
  };

  if (isPlainObject(brief.largestDivergence)) {
    pushItem(brief.largestDivergence.key, brief.largestDivergence.summaryZh);
  }
  safeArray(divergenceLayer.checks)
    .filter(isPlainObject)
    .sort((a, b) => (finite(b.score) ?? -Infinity) - (finite(a.score) ?? -Infinity))
    .forEach((check) => pushItem(check.key, check.summaryZh));

  if (items.length < 3) {
    const noiseLayer = buildSignalLayers(data, marketPricingMetricsData)
      .find((item) => item.id === 'signal-noise');
    safeArray(noiseLayer?.noiseWarning).forEach((warning) => pushItem(`noise:${warning}`, warning));
  }

  return items.slice(0, 3);
}

function timestampAgeHours(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / 36e5);
}

function formatUpdateTimeLabel(label, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return `${label}: ${value.replace(/\.\d{3}Z$/u, 'Z')}`;
}

function buildTodayDataHealth(data, healthDashboard, brief, marketPricingMetricsData) {
  const realtimeInput = isPlainObject(data?.dailyRealtimeInput) ? data.dailyRealtimeInput : {};
  const healthScore = finite(realtimeInput.healthScore ?? healthDashboard?.score);
  const primaryUpdatedAt = text(realtimeInput.updatedAt, text(realtimeInput.capturedAt, ''));
  const ageHours = timestampAgeHours(primaryUpdatedAt);
  let state = '降级';
  if (healthScore !== null && ageHours !== null && healthScore >= 90 && ageHours <= 36) {
    state = '良好';
  } else if (healthScore !== null && ageHours !== null && healthScore >= 70 && ageHours <= 72) {
    state = '一般';
  }

  const metricContext = getMarketPricingMetricContext(marketPricingMetricsData);
  const updates = [
    formatUpdateTimeLabel('Realtime', realtimeInput.updatedAt),
    formatUpdateTimeLabel('Daily', brief.generatedAt),
    metricContext?.latest ? `Market week: ${metricContext.latest.date} / ${metricContext.latest.isoWeek}` : null,
  ].filter(Boolean).slice(0, 3);

  return {
    state,
    score: healthScore,
    ageHours,
    tone: state === '良好' ? 'good' : state === '一般' ? 'watch' : 'degraded',
    summary: healthScore === null || ageHours === null
      ? '健康分或主更新时间待确认'
      : `健康分 ${Math.round(healthScore)}；主更新约 ${Math.round(ageHours)}h`,
    updates,
  };
}

function selectTodayStateConclusion(score, scoreChange7d, dataHealth) {
  const numericScore = finite(score);
  const weeklyChange = finite(scoreChange7d);
  if (dataHealth?.state === '降级') return TODAY_SUMMARY_STATE_PHRASES.dataDegraded;
  if (numericScore === null || weeklyChange === null) return TODAY_SUMMARY_STATE_PHRASES.insufficientEvidence;
  if (numericScore >= 85) return TODAY_SUMMARY_STATE_PHRASES.systemicRisk;
  if (numericScore >= 65) return TODAY_SUMMARY_STATE_PHRASES.localShock;
  if (numericScore >= 50 && weeklyChange > 0) return TODAY_SUMMARY_STATE_PHRASES.pressureRising;
  if (numericScore >= 50 && weeklyChange < 0) return TODAY_SUMMARY_STATE_PHRASES.marginalRelief;
  if (numericScore >= 50) return TODAY_SUMMARY_STATE_PHRASES.maintainCurrent;
  return TODAY_SUMMARY_STATE_PHRASES.normalWatch;
}
// M-92A today-summary helper block end.

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
  const confidence = isPlainObject(brief.confidence) ? brief.confidence : {};
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const shippingFreight = isPlainObject(macroDrivers.shippingFreight) ? macroDrivers.shippingFreight : {};
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
  const eiaBrentSpotProxy = isPlainObject(brentLayer.eiaBrentSpotProxy) ? brentLayer.eiaBrentSpotProxy : {};
  const eiaSpotLive = eiaBrentSpotProxy.sourceStatus === 'live' && finite(eiaBrentSpotProxy.price) !== null;
  const icePriceCurveLive = text(brentLayer.iceFuturesPriceCurve?.curveStatus, '') === 'live_delayed_priced';
  const freightLive = ['dirtyTanker', 'cleanTanker', 'dryBulk']
    .some((key) => text(shippingFreight.sourceStatus?.[key], '') === 'live');
  const publicEnergyCoverage = [
    eiaSpotLive ? 'EIA Brent spot proxy live' : null,
    icePriceCurveLive ? 'ICE delayed futures curve live' : null,
    freightLive ? 'StockQ BDTI/BCTI/BDI freight proxy live' : null,
  ].filter(Boolean);
  const dataCoverageText = Number.isFinite(Number(healthScore))
    ? `${Math.round(Number(healthScore))}%；${marketMetric ? '市场温度已接入' : '市场温度仍需补齐'}，${publicEnergyCoverage.length >= 2 ? '能源公开代理覆盖良好' : '能源公开代理部分覆盖'}`
    : '等待数据校准';
  const todayEvidence = [
    text(brief.oneLineConclusion, fallbackLine || '当前结论强度有限，仍需等待更多跨市场证据。'),
  ];
  if (marketMetric) todayEvidence.push(marketMetric.evidenceLine);
  const coverageNotes = [
    publicEnergyCoverage.length ? `公开能源代理已接入：${publicEnergyCoverage.join(' / ')}。` : null,
    '正式 Platts / official settlement / 实物成交证据仍作为边界说明，不作为当前缺失主信号。',
  ].filter(Boolean);
  const missingEvidence = marketMetric ? [] : ['市场温度历史数据尚未接入。'];
  const topRisks = buildTodayTopRisks(data, worldOrderStressData);
  const noiseDivergences = buildTodayNoiseDivergences(data, marketPricingMetricsData);
  const dataHealth = buildTodayDataHealth(data, healthDashboard, brief, marketPricingMetricsData);
  const scoreChange7d = finite(data?.scoreChange7d);
  const stateConclusion = selectTodayStateConclusion(score, scoreChange7d, dataHealth);

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
      coverageNotes,
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
    change1dCompact: formatCompactScoreChange(data?.scoreChange1d),
    change7dCompact: formatCompactScoreChange(data?.scoreChange7d),
    scoreChange7d,
    evidenceStrength,
    dataCoverage: dataCoverageText,
    topRisks: topRisks.length ? topRisks : ['数据不足，压力来源待确认'],
    noiseDivergences: noiseDivergences.length ? noiseDivergences : ['单一价格变化不足以形成强结论。'],
    dataHealth,
    stateConclusion,
  };
}

function buildPressureSources(data, worldOrderStressData) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const consumer = isPlainObject(data?.macroDrivers?.consumer) ? data.macroDrivers.consumer : {};
  const shippingFreight = isPlainObject(data?.macroDrivers?.shippingFreight) ? data.macroDrivers.shippingFreight : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const worldScore = finite(worldOrderStressData?.score);
  const hyOas = finite(inputs.hyOas);
  const vix = finite(inputs.vix);
  const brent = finite(inputs.brent);
  const us10y = finite(inputs.us10y);
  const real10y = finite(inputs.real10y);
  const dxy = finite(inputs.dxy);
  const dirtyTankerIndex = finite(shippingFreight.balticDirtyTankerIndex);
  const dirtyTankerChange = finite(shippingFreight.balticDirtyTankerDailyChangePct);
  const cleanTankerIndex = finite(shippingFreight.balticCleanTankerIndex);
  const dryBulkIndex = finite(shippingFreight.balticDryIndex);
  const crackSpread4wChange = finite(brentLayer.crackSpread4wChange);
  const eiaBrentSpotProxy = isPlainObject(brentLayer.eiaBrentSpotProxy) ? brentLayer.eiaBrentSpotProxy : {};
  const eiaBrentSpotPrice = finite(eiaBrentSpotProxy.price);
  const eiaBrentSpotDailyChange = finite(eiaBrentSpotProxy.dailyChange);
  const brentFuturesCurve = isPlainObject(brentLayer.futuresCurve) ? brentLayer.futuresCurve : {};
  const brentFuturesCurveContracts = safeArray(brentFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 3)
    .map((contract) => `${text(contract.contract, '--')}(${formatWeekVintage(contract.lastTrade)})`);
  const brentFuturesPriceCurve = isPlainObject(brentLayer.futuresPriceCurve) ? brentLayer.futuresPriceCurve : {};
  const brentFuturesPriceCurveContracts = safeArray(brentFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.price, 2)}`);
  const brentIceFuturesPriceCurve = isPlainObject(brentLayer.iceFuturesPriceCurve) ? brentLayer.iceFuturesPriceCurve : {};
  const brentIceFuturesPriceCurveContracts = safeArray(brentIceFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contract, '--')} ${formatNumber(contract.price, 2)}`);
  const energyProxyCoverage = [
    eiaBrentSpotPrice !== null ? 'EIA Brent Spot Price FOB live' : null,
    brentIceFuturesPriceCurveContracts.length ? 'ICE delayed Brent futures curve live' : null,
    brentFuturesPriceCurveContracts.length ? 'Yahoo Brent priced futures proxy live' : null,
    dirtyTankerIndex !== null ? 'StockQ BDTI tanker freight live' : null,
    cleanTankerIndex !== null ? 'StockQ BCTI clean tanker live' : null,
    dryBulkIndex !== null ? 'StockQ BDI dry bulk live' : null,
  ].filter(Boolean);
  const energyFormalBoundary = [
    'Platts Dated Brent / 正式 Dated Brent 未接入。official settlement / 实物成交证据仍是边界说明，不作为公开代理层的主缺失项。',
  ];
  const energyRefreshMissing = [
    eiaBrentSpotPrice === null ? 'EIA Brent spot proxy 等待刷新。' : null,
    !brentIceFuturesPriceCurveContracts.length && !brentFuturesPriceCurveContracts.length && !brentFuturesCurveContracts.length
      ? 'Brent futures curve 等待刷新。'
      : null,
    dirtyTankerIndex === null ? '油轮运费压力等待 BDTI 刷新。' : null,
  ].filter(Boolean);
  const worldFreshness = text(worldOrderStressData?.freshness, INSUFFICIENT);

  return [
    createJudgment({
      id: 'pressure-energy-inflation',
      title: '能源与通胀压力',
      group: 'pressure-source',
      status: brent === null ? INSUFFICIENT : brent >= 100 ? '主要压力' : '观察中',
      direction: brent === null ? '方向待确认' : brent >= 100 ? '压力上升' : '观察中',
      confidence: brent === null ? '偏低' : '中等',
      dataCoverage: energyProxyCoverage.length >= 4 ? '数据覆盖：公开能源代理覆盖良好' : energyProxyCoverage.length ? '数据覆盖：公开能源代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        `布伦特 ${formatNumber(brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`,
        eiaBrentSpotPrice === null
          ? null
          : `EIA Brent Spot Price FOB ${formatNumber(eiaBrentSpotPrice, 2)}；日变化 ${formatSignedDecimal(eiaBrentSpotDailyChange, 2)}（${formatWeekVintage(eiaBrentSpotProxy.updatedAt)}；status=${formatSourceStatus(eiaBrentSpotProxy.sourceStatus)}）`,
        dirtyTankerIndex === null
          ? null
          : `BDTI ${formatNumber(dirtyTankerIndex, 0)}；日变化 ${formatRatioAsPercent(dirtyTankerChange)}（${text(shippingFreight.tankerFreightRegime, '未知')}）`,
        cleanTankerIndex === null ? null : `BCTI ${formatNumber(cleanTankerIndex, 0)}（${text(shippingFreight.cleanTankerFreightRegime, '未知')}）`,
        dryBulkIndex === null ? null : `BDI ${formatNumber(dryBulkIndex, 0)}（${text(shippingFreight.dryBulkFreightRegime, '未知')}）`,
        brentLayer?.crackSpread === null || !Number.isFinite(brentLayer?.crackSpread)
          ? null
          : `柴油裂解价差 $${brentLayer.crackSpread.toFixed(1)}/桶；4周变化 ${formatSignedDecimal(crackSpread4wChange, 2)}`,
        brentFuturesCurveContracts.length
          ? `ICE Brent futuresCurve structure-only: ${brentFuturesCurveContracts.join(' / ')}；status=${text(brentFuturesCurve.curveStatus, 'missing')}`
          : null,
        brentIceFuturesPriceCurveContracts.length
          ? `ICE Brent public delayed price curve: ${brentIceFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentIceFuturesPriceCurve.frontMinusBack, 2)}`
          : null,
        brentFuturesPriceCurveContracts.length
          ? `Yahoo Brent priced futures proxy: ${brentFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentFuturesPriceCurve.frontMinusBack, 2)}`
          : null,
      ].filter(Boolean),
      coverageNotes: [...energyProxyCoverage, ...energyFormalBoundary],
      missingEvidence: energyRefreshMissing,
      explanation: energyProxyCoverage.length
        ? '公开现货、期货与运费代理已形成能源压力观察层；正式实物成交源作为边界保留。'
        : '能源压力仍需等待公开代理刷新。',
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
      dataCoverage: us10y !== null || real10y !== null || dxy !== null ? '数据覆盖：核心利率与美元代理已覆盖' : '数据覆盖：关键数据不足',
      evidence: [`10年期 ${formatNumber(us10y, 2, '%')}；实际利率 ${formatNumber(real10y, 2, '%')}；广义美元 ${formatNumber(dxy, 2)}`],
      coverageNotes: ['信用市场扩散确认属于交叉验证条件，不作为当前利率压力卡的数据缺失。'],
      missingEvidence: us10y !== null || real10y !== null || dxy !== null ? [] : ['利率与美元代理等待刷新。'],
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
      dataCoverage: hyOas !== null && vix !== null ? '数据覆盖：核心信用与波动率已覆盖' : '数据覆盖：关键数据不足',
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
      dataCoverage: finite(consumer.umichSentiment) === null ? '数据覆盖：关键数据不足' : '数据覆盖：消费者慢变量已覆盖',
      evidence: [
        finite(consumer.umichSentiment) === null
          ? 'UMCSENT 等待接入或刷新。'
          : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`,
        consumer.ismManufacturingPmi === null || !Number.isFinite(consumer.ismManufacturingPmi)
          ? null
          : `ISM 制造业 PMI ${formatNumber(consumer.ismManufacturingPmi, 1)} — ${consumer.ismManufacturingPmi >= 50 ? '扩张区间' : '收缩区间'}；3个月变化 ${formatNumber(consumer.ismManufacturingPmi3mChange, 1)}`,
      ].filter(Boolean),
      coverageNotes: ['细分零售品类已在 Macro Drivers 展示；本压力卡只保留消费者体感慢变量。'],
      missingEvidence: finite(consumer.umichSentiment) === null ? ['消费者体感慢变量等待刷新。'] : [],
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
  const shippingFreight = isPlainObject(data?.macroDrivers?.shippingFreight) ? data.macroDrivers.shippingFreight : {};
  const brentFuturesCurve = isPlainObject(brentLayer.futuresCurve) ? brentLayer.futuresCurve : {};
  const brentFuturesCurveContracts = safeArray(brentFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 3)
    .map((contract) => text(contract.contract, null))
    .filter(Boolean);
  const brentFuturesPriceCurve = isPlainObject(brentLayer.futuresPriceCurve) ? brentLayer.futuresPriceCurve : {};
  const brentFuturesPriceCurveContracts = safeArray(brentFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.price, 2)}`);
  const brentIceFuturesPriceCurve = isPlainObject(brentLayer.iceFuturesPriceCurve) ? brentLayer.iceFuturesPriceCurve : {};
  const brentIceFuturesPriceCurveContracts = safeArray(brentIceFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contract, '--')} ${formatNumber(contract.price, 2)}`);
  const eiaBrentSpotProxy = isPlainObject(brentLayer.eiaBrentSpotProxy) ? brentLayer.eiaBrentSpotProxy : {};
  const eiaBrentSpotPrice = finite(eiaBrentSpotProxy.price);
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
  pending.push('能源价格处于观察区间，公开代理已可观察，正式实物源作为边界继续标注。');
  const dataGapEvidence = [
    eiaBrentSpotPrice === null
      ? 'EIA Brent spot proxy 等待刷新；Platts 正式源作为边界保留。'
      : `EIA Brent Spot Price FOB 已显示 ${formatNumber(eiaBrentSpotPrice, 2)}；Platts 正式源作为边界保留。`,
    brentIceFuturesPriceCurveContracts.length
      ? `ICE Brent public delayed price curve 已显示 ${brentIceFuturesPriceCurveContracts.join(' / ')}；official settlement curve 作为边界保留。`
      : brentFuturesPriceCurveContracts.length
      ? `Yahoo Brent priced futures proxy 已显示 ${brentFuturesPriceCurveContracts.join(' / ')}；正式 settlement curve 作为边界保留。`
      : brentFuturesCurveContracts.length
        ? `ICE Brent futuresCurve structure-only 已显示 ${brentFuturesCurveContracts.join('/')}；priced proxy / 可验证结算价期限曲线作为边界保留。`
      : 'Brent futures curve structure 等待刷新。',
    finite(shippingFreight.balticDirtyTankerIndex) === null
      ? 'shipping / freight 等待 BDTI/BCTI/BDI 刷新。'
      : 'shipping / freight 已接入 BDTI/BCTI/BDI 公开代理。',
  ];
  if (!marketMetric) dataGapEvidence.unshift('Nasdaq / QQQ 周线历史尚未接入。');

  return [
    createJudgment({
      id: 'signal-verified',
      title: '已验证信号',
      group: 'signal-layer',
      status: verified.length ? '已有验证' : '暂无法判断',
      confidence: verified.length ? '中等' : '偏低',
      dataCoverage: verified.length ? '数据覆盖：核心信号与公开代理已覆盖' : '数据覆盖：关键数据不足',
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
      dataCoverage: '数据覆盖：待确认项，不等同于缺失源',
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
      dataCoverage: '数据覆盖：噪音提示为解释层说明',
      noiseWarning: [
        '单一价格变化不足以形成强结论。',
        '短期市场波动需要信用、利率、能源和风险资产之间的交叉确认。',
      ],
      conclusion: '暂无噪音提示。',
      sourceType: '数据推断',
    }),
    createJudgment({
      id: 'signal-data-gap',
      title: '正式源边界',
      group: 'signal-layer',
      status: '边界已标注',
      confidence: '中等',
      dataCoverage: '数据覆盖：公开代理已接入；正式源边界保留',
      evidence: dataGapEvidence,
      conclusion: '公开代理不冒充正式源。',
      sourceType: '边界说明',
    }),
  ];
}

function buildMacroDrivers(data) {
  const inputs = isPlainObject(data?.displayInputsBaseline) ? data.displayInputsBaseline : {};
  const macroDrivers = isPlainObject(data?.macroDrivers) ? data.macroDrivers : {};
  const consumer = isPlainObject(macroDrivers.consumer) ? macroDrivers.consumer : {};
  const employment = isPlainObject(macroDrivers.employment) ? macroDrivers.employment : {};
  const consumerRetail = isPlainObject(macroDrivers.consumerRetail) ? macroDrivers.consumerRetail : {};
  const commercialRealEstate = isPlainObject(macroDrivers.commercialRealEstate) ? macroDrivers.commercialRealEstate : {};
  const shippingFreight = isPlainObject(macroDrivers.shippingFreight) ? macroDrivers.shippingFreight : {};
  const policyExpectations = isPlainObject(macroDrivers.policyExpectations) ? macroDrivers.policyExpectations : {};
  const privateCreditProxy = isPlainObject(macroDrivers.privateCreditProxy) ? macroDrivers.privateCreditProxy : {};
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  const curve = isPlainObject(macroDrivers.curve) ? macroDrivers.curve : {};
  const credit = isPlainObject(macroDrivers.credit) ? macroDrivers.credit : {};
  const brentLayer = isPlainObject(data?.brentPricingLayer) ? data.brentPricingLayer : {};
  const onRrpSignal = findActiveSignal(macroDrivers.activeSignals, 'onRrpCritical');
  const hyOas = finite(inputs.hyOas);
  const igOas = finite(credit.igOas);
  const igHyRatio = finite(credit.igHyRatio);
  const t10y2y = finite(curve.t10y2y);
  const onRrp = finite(fedLiquidity.onRrp);
  const us10y = finite(inputs.us10y);
  const dxy = finite(inputs.dxy);
  const effectiveFedFundsRate = finite(fedLiquidity.effectiveFedFundsRate);
  const sofr = finite(fedLiquidity.sofr);
  const walcl4wChange = finite(fedLiquidity.walcl4wChange);
  const reserveBalances = finite(fedLiquidity.reserveBalances);
  const reserveBalances4wChange = finite(fedLiquidity.reserveBalances4wChange);
  const initialClaims = finite(employment.initialClaims);
  const initialClaims4wAverage = finite(employment.initialClaims4wAverage);
  const initialClaims4wChange = finite(employment.initialClaims4wChange);
  const continuingClaims = finite(employment.continuingClaims);
  const continuingClaims4wAverage = finite(employment.continuingClaims4wAverage);
  const joltsOpenings = finite(employment.joltsOpenings);
  const joltsOpeningsYoY = finite(employment.joltsOpeningsYoY);
  const claimsRegime = text(employment.claimsRegime, '未知');
  const joltsRegime = text(employment.joltsRegime, '未知');
  const averageHourlyEarnings = finite(employment.averageHourlyEarnings);
  const averageHourlyEarningsYoY = finite(employment.averageHourlyEarningsYoY);
  const u6Rate = finite(employment.u6Rate);
  const u6Rate3mChange = finite(employment.u6Rate3mChange);
  const industryPayrollDiffusionPct = finite(employment.industryPayrollDiffusionPct);
  const industryPayrollPositiveCount = finite(employment.industryPayrollPositiveCount);
  const industryPayrollSeriesCount = finite(employment.industryPayrollSeriesCount);
  const laborQualityRegime = text(employment.laborQualityRegime, '未知');
  const industryDiffusionRegime = text(employment.industryDiffusionRegime, '未知');
  const employmentQualityEvidenceCount = [
    averageHourlyEarnings,
    u6Rate,
    industryPayrollDiffusionPct
  ].filter((value) => value !== null).length;
  const cartsNominal = finite(consumerRetail.cartsNominal);
  const cartsNominalYoY = finite(consumerRetail.cartsNominalYoY);
  const cartsReal = finite(consumerRetail.cartsReal);
  const cartsRealYoY = finite(consumerRetail.cartsRealYoY);
  const retailSegmentDiffusionPct = finite(consumerRetail.segmentDiffusionPct);
  const retailSegmentPositiveCount = finite(consumerRetail.segmentPositiveCount);
  const retailSegmentSeriesCount = finite(consumerRetail.segmentSeriesCount);
  const strongestRetailSegment = isPlainObject(consumerRetail.strongestSegment) ? consumerRetail.strongestSegment : null;
  const weakestRetailSegment = isPlainObject(consumerRetail.weakestSegment) ? consumerRetail.weakestSegment : null;
  const retailSegmentLines = formatRetailSegmentLines(consumerRetail.retailSegments);
  const bofaCardSpendingYoY = finite(consumerRetail.bofaCardSpendingYoY);
  const bofaCardSpendingPriorYoY = finite(consumerRetail.bofaCardSpendingPriorYoY);
  const bofaCardSpendingExGasYoY = finite(consumerRetail.bofaCardSpendingExGasYoY);
  const redbookRetailSalesYoY = finite(consumerRetail.redbookRetailSalesYoY);
  const redbookHistoricalAverageYoY = finite(consumerRetail.redbookHistoricalAverageYoY);
  const retailRegime = text(consumerRetail.retailRegime, '未知');
  const creDelinquencyRate = finite(commercialRealEstate.creDelinquencyRate);
  const creDelinquencyRateQoQChange = finite(commercialRealEstate.creDelinquencyRateQoQChange);
  const creChargeOffRate = finite(commercialRealEstate.creChargeOffRate);
  const creChargeOffRateQoQChange = finite(commercialRealEstate.creChargeOffRateQoQChange);
  const sloosCreNonfarmNonresidentialTightening = finite(commercialRealEstate.sloosCreNonfarmNonresidentialTightening);
  const sloosCreConstructionTightening = finite(commercialRealEstate.sloosCreConstructionTightening);
  const sloosCreMultifamilyTightening = finite(commercialRealEstate.sloosCreMultifamilyTightening);
  const sloosCreTighteningMax = finite(commercialRealEstate.sloosCreTighteningMax);
  const creStressRegime = text(commercialRealEstate.creStressRegime, '未知');
  const reitEtfPrice = finite(commercialRealEstate.reitEtfPrice);
  const reitEtf4wChange = finite(commercialRealEstate.reitEtf4wChange);
  const mortgageReitEtfPrice = finite(commercialRealEstate.mortgageReitEtfPrice);
  const mortgageReitEtf4wChange = finite(commercialRealEstate.mortgageReitEtf4wChange);
  const cmbsEtfPrice = finite(commercialRealEstate.cmbsEtfPrice);
  const cmbsEtf4wChange = finite(commercialRealEstate.cmbsEtf4wChange);
  const creLoanBalance = finite(commercialRealEstate.creLoanBalance);
  const creLoanBalance4wChange = finite(commercialRealEstate.creLoanBalance4wChange);
  const creLoanBalanceYoY = finite(commercialRealEstate.creLoanBalanceYoY);
  const creLoanBalanceStatus = text(commercialRealEstate.creLoanBalanceStatus, formatSourceStatus(commercialRealEstate.sourceStatus?.creLoanBalance));
  const crePublicMarketProxyRegime = text(commercialRealEstate.crePublicMarketProxyRegime, '未知');
  const nonPublicCreStatus = text(commercialRealEstate.nonPublicCreStatus, formatSourceStatus(commercialRealEstate.sourceStatus?.nonPublicCre));
  const dirtyTankerIndex = finite(shippingFreight.balticDirtyTankerIndex);
  const dirtyTankerChange = finite(shippingFreight.balticDirtyTankerDailyChangePct);
  const cleanTankerIndex = finite(shippingFreight.balticCleanTankerIndex);
  const cleanTankerChange = finite(shippingFreight.balticCleanTankerDailyChangePct);
  const dryBulkIndex = finite(shippingFreight.balticDryIndex);
  const dryBulkChange = finite(shippingFreight.balticDryDailyChangePct);
  const targetLower = finite(policyExpectations.targetLower);
  const targetUpper = finite(policyExpectations.targetUpper);
  const targetMid = finite(policyExpectations.targetMid);
  const fedFundsFutureFrontPrice = finite(policyExpectations.fedFundsFutureFrontPrice);
  const fedFundsFutureImpliedRate = finite(policyExpectations.fedFundsFutureImpliedRate);
  const futureMinusTargetMid = finite(policyExpectations.futureMinusTargetMid);
  const fedFundsFuturesCurve = isPlainObject(policyExpectations.fedFundsFuturesCurve) ? policyExpectations.fedFundsFuturesCurve : {};
  const fedFundsFuturesCurveContracts = safeArray(fedFundsFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.impliedRate, 2, '%')}`);
  const sofrFuturesCurve = isPlainObject(policyExpectations.sofrFuturesCurve) ? policyExpectations.sofrFuturesCurve : {};
  const sofrFuturesCurveContracts = safeArray(sofrFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.impliedRate, 2, '%')}`);
  const oisForwardCurve = isPlainObject(policyExpectations.oisForwardCurve) ? policyExpectations.oisForwardCurve : {};
  const oisForwardCurveTenors = safeArray(oisForwardCurve.tenors)
    .filter(isPlainObject)
    .filter((item) => ['1Y', '2Y', '5Y', '10Y'].includes(text(item.tenor, '')))
    .map((item) => `${text(item.tenor, '--')} ${formatNumber(item.rate, 2, '%')}`);
  const dotPlotMedianCurrentYear = finite(policyExpectations.dotPlotMedianCurrentYear);
  const dotPlotMedianNextYear = finite(policyExpectations.dotPlotMedianNextYear);
  const dotPlotMedianTwoYearsOut = finite(policyExpectations.dotPlotMedianTwoYearsOut);
  const dotPlotMedianLongerRun = finite(policyExpectations.dotPlotMedianLongerRun);
  const hawkishTermCount = finite(policyExpectations.hawkishTermCount);
  const dovishTermCount = finite(policyExpectations.dovishTermCount);
  const minutesHawkishTermCount = finite(policyExpectations.minutesHawkishTermCount);
  const minutesDovishTermCount = finite(policyExpectations.minutesDovishTermCount);
  const policyTone = text(policyExpectations.policyTone, '未知');
  const minutesPolicyTone = text(policyExpectations.minutesPolicyTone, '未知');
  const policyExpectationRegime = text(policyExpectations.policyExpectationRegime, '未知');
  const bdcEtfPrice = finite(privateCreditProxy.bdcEtfPrice);
  const bdcEtf4wChange = finite(privateCreditProxy.bdcEtf4wChange);
  const pbdcEtfPrice = finite(privateCreditProxy.pbdcEtfPrice);
  const pbdcEtf4wChange = finite(privateCreditProxy.pbdcEtf4wChange);
  const seniorLoanEtfPrice = finite(privateCreditProxy.seniorLoanEtfPrice);
  const seniorLoanEtf4wChange = finite(privateCreditProxy.seniorLoanEtf4wChange);
  const intervalFundNavPrice = finite(privateCreditProxy.intervalFundNavPrice);
  const intervalFundNav4wChange = finite(privateCreditProxy.intervalFundNav4wChange);
  const intervalFundNavStatus = text(privateCreditProxy.intervalFundNavStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.intervalFundNav));
  const privateCreditIgOas = finite(privateCreditProxy.igOas);
  const privateCreditIgMinusHyOas = finite(privateCreditProxy.igMinusHyOas);
  const cdxHyPrice = finite(privateCreditProxy.cdxHyPrice);
  const cdxIgPrice = finite(privateCreditProxy.cdxIgPrice);
  const cdxHyStatus = text(privateCreditProxy.cdxHyStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.cdxHy));
  const cdxIgStatus = text(privateCreditProxy.cdxIgStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.cdxIg));
  const privateCreditMarksStatus = text(privateCreditProxy.privateCreditMarksStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.privateCreditMarks));
  const bgcr = finite(fedLiquidity.bgcr);
  const tgcr = finite(fedLiquidity.tgcr);
  const tgcrSofrSpread = finite(fedLiquidity.tgcrSofrSpread);
  const igOas1dChange = finite(credit.igOas1dChange);
  const sloosTighteningSmallFirms = finite(credit.sloosTighteningSmallFirms);
  const sloosTighteningLargeQoQ = finite(credit.sloosTighteningLargeQoQ);
  const sloosTighteningSmallQoQ = finite(credit.sloosTighteningSmallQoQ);
  const nfci4wChange = finite(credit.nfci4wChange);
  const eiaBrentSpotProxy = isPlainObject(brentLayer.eiaBrentSpotProxy) ? brentLayer.eiaBrentSpotProxy : {};
  const eiaBrentSpotPrice = finite(eiaBrentSpotProxy.price);
  const eiaBrentSpotDailyChange = finite(eiaBrentSpotProxy.dailyChange);
  const ulsdPrice = finite(brentLayer.ulsdPrice);
  const ulsd4wChange = finite(brentLayer.ulsd4wChange);
  const brentFuturesCurve = isPlainObject(brentLayer.futuresCurve) ? brentLayer.futuresCurve : {};
  const brentFuturesCurveContracts = safeArray(brentFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contract, '--')}(${formatWeekVintage(contract.lastTrade)})`);
  const brentFuturesPriceCurve = isPlainObject(brentLayer.futuresPriceCurve) ? brentLayer.futuresPriceCurve : {};
  const brentFuturesPriceCurveContracts = safeArray(brentFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 5)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.price, 2)}`);
  const brentIceFuturesPriceCurve = isPlainObject(brentLayer.iceFuturesPriceCurve) ? brentLayer.iceFuturesPriceCurve : {};
  const brentIceFuturesPriceCurveContracts = safeArray(brentIceFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 5)
    .map((contract) => `${text(contract.contract, '--')} ${formatNumber(contract.price, 2)}`);
  const vix = finite(inputs.vix);
  const creditCalm = hyOas !== null && hyOas < 4 && vix !== null && vix < 22;
  const policyProxyEvidence = [
    onRrp === null ? null : `ON RRP ${formatUsdTrillions(onRrp)}${onRrpAnnotation(onRrpSignal)} — 流动性紧`,
    us10y === null ? null : `10年期 ${formatNumber(us10y, 2, '%')} — 长端利率压力`,
    dxy === null ? null : `广义美元 ${formatNumber(dxy, 2)} — 美元强势`,
    effectiveFedFundsRate === null ? null : `联邦基金利率 ${formatNumber(effectiveFedFundsRate, 2, '%')} — 政策利率`,
    sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')} — 隔夜担保融资`,
    targetMid === null ? null : `Fed target range ${formatRateRange(targetLower, targetUpper)}；midpoint ${formatNumber(targetMid, 3, '%')}`,
    fedFundsFutureImpliedRate === null ? null : `ZQ front price ${formatNumber(fedFundsFutureFrontPrice, 3)}；implied ${formatNumber(fedFundsFutureImpliedRate, 2, '%')}；相对目标中点 ${formatSignedPoints(futureMinusTargetMid)}（${policyExpectationRegime}）`,
    fedFundsFuturesCurveContracts.length
      ? `ZQ monthly futures curve proxy: ${fedFundsFuturesCurveContracts.join(' / ')}；front-back ${formatSignedPoints(fedFundsFuturesCurve.frontMinusBack)}；status=${text(fedFundsFuturesCurve.curveStatus, 'missing')}`
      : null,
    sofrFuturesCurveContracts.length
      ? `SR3 SOFR futures proxy: ${sofrFuturesCurveContracts.join(' / ')}；front-back ${formatSignedPoints(sofrFuturesCurve.frontMinusBack)}；status=${text(sofrFuturesCurve.curveStatus, 'missing')}`
      : null,
    oisForwardCurveTenors.length
      ? `CheckMySwap USD OIS public curve: ${oisForwardCurveTenors.join(' / ')}；10Y-2Y ${formatSignedPoints(oisForwardCurve.tenMinusTwo)}；status=${text(oisForwardCurve.curveStatus, 'missing')}`
      : null,
    dotPlotMedianCurrentYear === null ? null : `SEP ${formatWeekVintage(policyExpectations.sepProjectionDate)} federal funds median: current ${formatNumber(dotPlotMedianCurrentYear, 2, '%')} / next ${formatNumber(dotPlotMedianNextYear, 2, '%')} / two-year ${formatNumber(dotPlotMedianTwoYearsOut, 2, '%')} / longer-run ${formatNumber(dotPlotMedianLongerRun, 2, '%')} (${formatUrlReference(policyExpectations.sepUrl)})`,
    policyTone === '未知' ? null : `FOMC ${formatWeekVintage(policyExpectations.statementDate)} statement tone: ${policyTone}；hawkish ${formatNumber(hawkishTermCount, 0)} / dovish ${formatNumber(dovishTermCount, 0)} (${formatUrlReference(policyExpectations.statementUrl)})`,
    minutesPolicyTone === '未知' ? null : `FOMC minutes ${formatWeekVintage(policyExpectations.minutesDate)} NLP tone: ${minutesPolicyTone}；hawkish ${formatNumber(minutesHawkishTermCount, 0)} / dovish ${formatNumber(minutesDovishTermCount, 0)} (${formatUrlReference(policyExpectations.minutesUrl)})`,
    isPlainObject(policyExpectations.minutesTopicCounts)
      ? `minutes topics: inflation=${formatNumber(policyExpectations.minutesTopicCounts.inflation, 0)} / labor=${formatNumber(policyExpectations.minutesTopicCounts.laborMarket, 0)} / financial=${formatNumber(policyExpectations.minutesTopicCounts.financialConditions, 0)} / risks=${formatNumber(policyExpectations.minutesTopicCounts.risks, 0)}`
      : null,
    formatSourceStatusMap(policyExpectations.sourceStatus, [['targetRange', 'target'], ['fedFundsFuture', 'ZQ'], ['fedFundsFuturesCurve', 'ZQ curve'], ['sofrFuturesCurve', 'SR3 SOFR futures'], ['sepDotPlot', 'SEP'], ['policyStatement', 'statement'], ['fomcMinutes', 'minutes'], ['oisForward', 'CheckMySwap OIS']]),
  ].filter(Boolean);
  const hasPolicyProxy = policyProxyEvidence.length > 1;
  const consumerPublicCoverage = [
    finite(consumer.umichSentiment) !== null ? 'UMCSENT public sentiment' : null,
    cartsNominal !== null ? 'Chicago Fed CARTS nominal nowcast' : null,
    cartsReal !== null ? 'Chicago Fed CARTSR real nowcast' : null,
    retailSegmentDiffusionPct !== null ? 'MRTS 13-segment retail basket' : null,
    bofaCardSpendingYoY !== null || bofaCardSpendingExGasYoY !== null ? 'BoA Consumer Checkpoint public summary' : null,
    redbookRetailSalesYoY !== null ? 'Redbook public HTML summary' : null,
  ].filter(Boolean);
  const employmentPublicCoverage = [
    initialClaims !== null ? 'ICSA weekly claims' : null,
    continuingClaims !== null ? 'CCSA continuing claims' : null,
    joltsOpenings !== null ? 'JOLTS openings' : null,
    averageHourlyEarnings !== null ? 'AHE wage growth proxy' : null,
    u6Rate !== null ? 'U-6 labor underutilization' : null,
    industryPayrollDiffusionPct !== null ? 'industry payroll diffusion basket' : null,
  ].filter(Boolean);
  const crePublicCoverage = [
    creDelinquencyRate !== null ? 'FRED CRE delinquency' : null,
    creChargeOffRate !== null ? 'FRED CRE charge-off' : null,
    sloosCreTighteningMax !== null ? 'SLOOS CRE lending standards' : null,
    reitEtfPrice !== null ? 'VNQ public REIT proxy' : null,
    mortgageReitEtfPrice !== null ? 'REM mortgage REIT proxy' : null,
    cmbsEtfPrice !== null ? 'CMBS ETF public proxy' : null,
    creLoanBalance !== null ? 'FRED aggregate CRE loan balance' : null,
  ].filter(Boolean);
  const privateCreditPublicCoverage = [
    bdcEtfPrice !== null ? 'BIZD listed BDC proxy' : null,
    pbdcEtfPrice !== null ? 'PBDC listed BDC proxy' : null,
    seniorLoanEtfPrice !== null ? 'SRLN senior loan proxy' : null,
    intervalFundNavPrice !== null ? 'CCLFX public interval-fund NAV proxy' : null,
    hyOas !== null ? 'HY OAS cash-bond proxy' : null,
    privateCreditIgOas !== null ? 'IG OAS cash-bond proxy' : null,
    cdxHyPrice !== null ? 'ICE CDX HY public settlement' : null,
    cdxIgPrice !== null ? 'ICE CDX IG public settlement' : null,
  ].filter(Boolean);
  const inflationPublicCoverage = [
    eiaBrentSpotPrice !== null ? 'EIA Brent Spot Price FOB public proxy' : null,
    ulsdPrice !== null ? 'ULSD public refined-products proxy' : null,
    brentLayer?.crackSpread === null || !Number.isFinite(brentLayer?.crackSpread) ? null : 'diesel crack spread proxy',
    brentIceFuturesPriceCurveContracts.length ? 'ICE delayed Brent futures curve' : null,
    brentFuturesPriceCurveContracts.length ? 'Yahoo Brent priced futures proxy' : null,
  ].filter(Boolean);
  const shippingPublicCoverage = [
    dirtyTankerIndex !== null ? 'StockQ BDTI dirty tanker' : null,
    cleanTankerIndex !== null ? 'StockQ BCTI clean tanker' : null,
    dryBulkIndex !== null ? 'StockQ BDI dry bulk' : null,
  ].filter(Boolean);
  const liquidityPublicCoverage = [
    onRrp !== null ? 'ON RRP' : null,
    bgcr !== null ? 'NY Fed BGCR' : null,
    tgcr !== null ? 'NY Fed TGCR' : null,
    sofr !== null ? 'SOFR' : null,
    reserveBalances !== null ? 'reserve balances' : null,
    credit?.nfci === null || !Number.isFinite(credit?.nfci) ? null : 'NFCI',
    sloosTighteningSmallFirms !== null ? 'SLOOS small firms' : null,
  ].filter(Boolean);
  const policyPublicCoverage = [
    targetMid !== null ? 'Fed target range' : null,
    fedFundsFutureImpliedRate !== null ? 'ZQ front Fed funds future proxy' : null,
    fedFundsFuturesCurveContracts.length ? 'ZQ monthly Fed funds futures curve proxy' : null,
    sofrFuturesCurveContracts.length ? 'SR3 SOFR futures curve proxy' : null,
    oisForwardCurveTenors.length ? 'CheckMySwap public OIS curve' : null,
    dotPlotMedianCurrentYear !== null ? 'Fed SEP dot plot medians' : null,
    policyTone !== '未知' ? 'FOMC statement keyword tone' : null,
    minutesPolicyTone !== '未知' ? 'FOMC minutes keyword tone' : null,
  ].filter(Boolean);

  return [
    createJudgment({
      id: 'driver-growth',
      title: '增长',
      group: 'macro-driver',
      status: finite(consumer.umichSentiment) === null ? WAITING : '慢变量观察中',
      direction: directionFromDelta(consumer.threeMonthChange),
      confidence: finite(consumer.umichSentiment) === null ? '偏低' : '中等',
      dataCoverage: consumerPublicCoverage.length ? '数据覆盖：公开消费代理已覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        finite(consumer.umichSentiment) === null
          ? '消费者信心数据不足。'
          : `UMCSENT ${formatNumber(consumer.umichSentiment, 1)}；三个月变化 ${formatNumber(consumer.threeMonthChange, 1)}`,
        consumer.ismManufacturingPmi === null || !Number.isFinite(consumer.ismManufacturingPmi)
          ? null
          : `ISM 制造业 PMI ${formatNumber(consumer.ismManufacturingPmi, 1)} — ${consumer.ismManufacturingPmi >= 50 ? '扩张区间' : '收缩区间'}；3个月变化 ${formatNumber(consumer.ismManufacturingPmi3mChange, 1)}`,
      ].filter(Boolean),
      coverageNotes: [
        ...consumerPublicCoverage,
        '盈利修正、BoA raw card feed 等非公开或授权消费证据仍待接入。此处作为边界说明保留，不作为当前公开代理缺失。',
      ],
      missingEvidence: consumerPublicCoverage.length ? [] : ['公开消费代理等待刷新。'],
      explanation: 'UMCSENT 是月频慢变量，只能提供体感背景，不能单独判断近端增长。',
      sourceType: finite(consumer.umichSentiment) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'driver-employment',
      title: '就业质量与广度 LABOR QUALITY',
      group: 'macro-driver',
      status: initialClaims === null && continuingClaims === null && joltsOpenings === null && employmentQualityEvidenceCount === 0 ? WAITING : '慢变量观察中',
      direction: claimsRegime === '明显走弱' || claimsRegime === '走弱' || joltsRegime === '走弱'
        ? '劳动力降温'
        : claimsRegime === '改善'
          ? '裁员压力改善'
          : laborQualityRegime === '工资韧性' || laborQualityRegime === '扩散改善'
            ? '质量韧性'
            : laborQualityRegime === '降温'
              ? '劳动力降温'
              : '观察中',
      confidence: initialClaims !== null && continuingClaims !== null && joltsOpenings !== null && employmentQualityEvidenceCount >= 2 ? '中等' : '偏低',
      dataCoverage: employmentPublicCoverage.length ? '数据覆盖：公开就业质量代理已覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        initialClaims === null
          ? 'ICSA 初请失业金人数等待接入或刷新。'
          : `ICSA ${formatPeopleValue(initialClaims)}；4w-MA ${formatPeopleValue(initialClaims4wAverage)}；Δ ${formatSignedPeopleValue(initialClaims4wChange)}（${claimsRegime}）`,
        continuingClaims === null
          ? null
          : `CCSA ${formatPeopleValue(continuingClaims)}；4w-MA ${formatPeopleValue(continuingClaims4wAverage)}`,
        joltsOpenings === null
          ? null
          : `JOLTS:${formatMonthVintage(employment.joltsUpdatedAt)} ${formatPeopleValue(joltsOpenings)}；YoY ${formatRatioAsPercent(joltsOpeningsYoY)}（${joltsRegime}）`,
        averageHourlyEarnings === null
          ? null
          : `平均时薪 $${formatNumber(averageHourlyEarnings, 2)}/小时；YoY ${formatRatioAsPercent(averageHourlyEarningsYoY)}（${laborQualityRegime}；${formatMonthVintage(employment.averageHourlyEarningsUpdatedAt)}；status=${formatSourceStatus(employment.sourceStatus?.ahe)}）`,
        u6Rate === null
          ? null
          : `U-6 ${formatNumber(u6Rate, 1, '%')}；3个月变化 ${formatSignedPoints(u6Rate3mChange)} — 劳动力低利用率（${formatMonthVintage(employment.u6UpdatedAt)}；status=${formatSourceStatus(employment.sourceStatus?.u6)}）`,
        industryPayrollDiffusionPct === null
          ? null
          : `行业就业扩散 ${formatNumber(industryPayrollDiffusionPct, 1, '%')}；${formatNumber(industryPayrollPositiveCount, 0)}/${formatNumber(industryPayrollSeriesCount, 0)} 个行业环比增加（${industryDiffusionRegime}；${formatMonthVintage(employment.industryPayrollUpdatedAt)}；status=${formatSourceStatus(employment.sourceStatus?.industryPayroll)}）`,
        formatSourceStatusMap(employment.sourceStatus, [['icsa', 'ICSA'], ['ccsa', 'CCSA'], ['jtsjol', 'JOLTS'], ['ahe', 'AHE'], ['u6', 'U-6'], ['industryPayroll', 'payroll diffusion']]),
      ].filter(Boolean),
      coverageNotes: [
        ...employmentPublicCoverage,
        'AHE / U-6 / industry payroll diffusion 是公开就业质量代理；职位质量细项和工时结构保留为边界说明。',
      ],
      missingEvidence: employmentPublicCoverage.length ? [] : ['公开就业质量代理等待 FRED 刷新。'],
      explanation: 'Claims 是周频裁员压力代理，JOLTS、平均时薪、U-6 与行业 payroll 扩散是月频慢变量；仅用于就业质量与广度观察。',
      sourceType: initialClaims === null && continuingClaims === null && joltsOpenings === null && employmentQualityEvidenceCount === 0 ? '数据不足' : '事实',
    }),
    createJudgment({
      id: 'driver-consumer-retail',
      title: '高频零售消费 CONSUMER RETAIL',
      group: 'macro-driver',
      status: cartsNominal === null && cartsReal === null ? WAITING : '周频观察中',
      direction: retailRegime === '明显走弱' || retailRegime === '走弱'
        ? '消费降温'
        : retailRegime === '改善' || retailRegime === '强劲'
          ? '消费改善'
          : '观察中',
      confidence: cartsNominal !== null && cartsReal !== null ? '中等' : '偏低',
      dataCoverage: consumerPublicCoverage.length ? '数据覆盖：公开零售消费代理已覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        cartsNominal === null
          ? 'CARTS 名义零售消费 nowcast 等待刷新。'
          : `CARTS 名义 ${formatUsdBillions(cartsNominal)}；4w-MA ${formatUsdBillions(consumerRetail.cartsNominal4wAverage)}；YoY ${formatRatioAsPercent(cartsNominalYoY)}（名义）`,
        cartsReal === null
          ? null
          : `CARTSR 实际 ${formatUsdBillions(cartsReal)}；4w-MA ${formatUsdBillions(consumerRetail.cartsReal4wAverage)}；YoY ${formatRatioAsPercent(cartsRealYoY)}（实际,通胀调整后；${retailRegime}）`,
        retailSegmentDiffusionPct === null
          ? null
          : `MRTS 细分零售扩散 ${formatNumber(retailSegmentDiffusionPct, 1, '%')}；${formatNumber(retailSegmentPositiveCount, 0)}/${formatNumber(retailSegmentSeriesCount, 0)} 个品类 YoY 为正（${text(consumerRetail.segmentRegime, '未知')}）`,
        strongestRetailSegment
          ? `最强品类：${text(strongestRetailSegment.labelZh, strongestRetailSegment.key)} ${formatRatioAsPercent(strongestRetailSegment.yoy)}；最弱品类：${text(weakestRetailSegment?.labelZh, weakestRetailSegment?.key)} ${formatRatioAsPercent(weakestRetailSegment?.yoy)}`
          : null,
        bofaCardSpendingYoY === null && bofaCardSpendingExGasYoY === null
          ? null
          : `BoA Consumer Checkpoint ${formatMonthVintage(consumerRetail.bofaReportDate)}: card spend YoY ${formatRatioAsPercent(bofaCardSpendingYoY)} / ex-gas ${formatRatioAsPercent(bofaCardSpendingExGasYoY)}；prior ${formatRatioAsPercent(bofaCardSpendingPriorYoY)}（status=${formatSourceStatus(consumerRetail.sourceStatus?.bofaConsumerCheckpoint)}；${formatUrlReference(consumerRetail.bofaReportUrl)}）`,
        redbookRetailSalesYoY === null
          ? null
          : `Redbook public HTML ${formatWeekVintage(consumerRetail.redbookRetailSalesDate)}: same-store sales YoY ${formatRatioAsPercent(redbookRetailSalesYoY)}；historical avg ${formatRatioAsPercent(redbookHistoricalAverageYoY)}（status=${formatSourceStatus(consumerRetail.sourceStatus?.redbookPublicHtml)}；${formatUrlReference(consumerRetail.redbookReportUrl)}）`,
        ...retailSegmentLines,
        formatSourceStatusMap(consumerRetail.sourceStatus, [['carts', 'CARTS'], ['cartsr', 'CARTSR'], ['retailSegments', 'MRTS'], ['bofaConsumerCheckpoint', 'BoA Consumer Checkpoint'], ['redbookPublicHtml', 'Redbook public HTML']]),
        `Chicago Fed CARTS:${formatWeekVintage(consumerRetail.updatedAt)}`,
      ].filter(Boolean),
      missingEvidence: [
        retailSegmentDiffusionPct === null ? 'MRTS 细分零售品类等待 FRED 月频刷新。' : null,
        bofaCardSpendingYoY === null && bofaCardSpendingExGasYoY === null ? 'BoA Consumer Checkpoint 公开页等待刷新。' : null,
        redbookRetailSalesYoY === null ? 'Redbook public HTML 等待刷新；当前不冒充 Redbook raw feed。' : null
      ].filter(Boolean),
      coverageNotes: [
        ...consumerPublicCoverage,
        'BoA Consumer Checkpoint / Redbook public HTML 是公开摘要代理，不冒充 raw card feed 或订阅 feed。',
      ],
      explanation: 'CARTS / CARTSR 是 Chicago Fed via FRED 的周频零售+餐饮 nowcast；MRTS 细分品类为月频公开零售结构观察；BoA Consumer Checkpoint 与 Redbook public HTML 是第三方公开消费证据。',
      sourceType: cartsNominal === null && cartsReal === null && retailSegmentDiffusionPct === null ? '数据不足' : '事实',
      updatedAt: `Chicago Fed CARTS:${formatWeekVintage(consumerRetail.updatedAt)}`,
    }),
    createJudgment({
      id: 'driver-cre',
      title: '商业地产信用 COMMERCIAL REAL ESTATE',
      group: 'macro-driver',
      status: creDelinquencyRate === null
        && creChargeOffRate === null
        && sloosCreNonfarmNonresidentialTightening === null
        && sloosCreConstructionTightening === null
        && sloosCreMultifamilyTightening === null
        && creLoanBalance === null ? WAITING : '季频观察中',
      direction: creStressRegime === '恶化'
        ? 'CRE 压力恶化'
        : creStressRegime === '紧绷'
          ? '信贷收紧'
          : creStressRegime === '改善' || creStressRegime === '宽松'
            ? '压力缓和'
            : '观察中',
      confidence: creDelinquencyRate !== null
        && creChargeOffRate !== null
        && sloosCreNonfarmNonresidentialTightening !== null
        && sloosCreConstructionTightening !== null
        && sloosCreMultifamilyTightening !== null
        && creLoanBalance !== null ? '中等' : '偏低',
      dataCoverage: crePublicCoverage.length >= 4 ? '数据覆盖：公开 CRE 代理覆盖良好' : crePublicCoverage.length ? '数据覆盖：公开 CRE 代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        creDelinquencyRate === null
          ? 'CRE 拖欠率等待 FRED 季频数据刷新。'
          : `CRE 拖欠率 ${formatNumber(creDelinquencyRate, 2, '%')}；QoQ Δ ${formatSignedPoints(creDelinquencyRateQoQChange)}（拖欠率）`,
        creChargeOffRate === null
          ? null
          : `CRE 核销率 ${formatNumber(creChargeOffRate, 2, '%')}；QoQ Δ ${formatSignedPoints(creChargeOffRateQoQChange)}（核销率）`,
        sloosCreTighteningMax === null
          ? null
          : `SLOOS CRE 非农非住宅 ${formatSignedPercent(sloosCreNonfarmNonresidentialTightening, 1)}；建设土地 ${formatSignedPercent(sloosCreConstructionTightening, 1)}；多户住宅 ${formatSignedPercent(sloosCreMultifamilyTightening, 1)}`,
        sloosCreTighteningMax === null
          ? null
          : `SLOOS CRE max ${formatSignedPercent(sloosCreTighteningMax, 1)}；${creStressRegime}`,
        reitEtfPrice === null
          ? null
          : `VNQ ${formatNumber(reitEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(reitEtf4wChange)} — 公开 REIT 代理（${crePublicMarketProxyRegime}；${formatWeekVintage(commercialRealEstate.reitEtfUpdatedAt)}）`,
        mortgageReitEtfPrice === null
          ? null
          : `REM ${formatNumber(mortgageReitEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(mortgageReitEtf4wChange)} — mortgage REIT 代理（${crePublicMarketProxyRegime}；${formatWeekVintage(commercialRealEstate.mortgageReitEtfUpdatedAt)}）`,
        cmbsEtfPrice === null
          ? null
          : `CMBS ${formatNumber(cmbsEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(cmbsEtf4wChange)} — commercial MBS ETF public proxy（${formatWeekVintage(commercialRealEstate.cmbsEtfUpdatedAt)}）`,
        creLoanBalance === null
          ? null
          : `CRE loan balance ${formatUsdTrillions(creLoanBalance / 1000)}；4周变化 ${formatRatioAsPercent(creLoanBalance4wChange)}；YoY ${formatRatioAsPercent(creLoanBalanceYoY)} — FRED public aggregate exposure proxy（${formatWeekVintage(commercialRealEstate.creLoanBalanceUpdatedAt)}；status=${formatSourceStatus(creLoanBalanceStatus)}）`,
        `non-public CRE loan tape status: ${nonPublicCreStatus}`,
        formatSourceStatusMap(commercialRealEstate.sourceStatus, [['delinquency', 'delinquency'], ['chargeOff', 'charge-off'], ['sloosNonfarmNonresidential', 'SLOOS NNR'], ['sloosConstruction', 'SLOOS construction'], ['sloosMultifamily', 'SLOOS multifamily'], ['reitEtf', 'VNQ'], ['mortgageReitEtf', 'REM'], ['cmbsEtf', 'CMBS'], ['creLoanBalance', 'CRE loan balance'], ['nonPublicCre', 'non-public CRE']]),
        `FRED 季频 Commercial Real Estate:${formatQuarterVintage(commercialRealEstate.updatedAt)}`,
      ].filter(Boolean),
      coverageNotes: [
        ...crePublicCoverage,
        'non-public CRE loan tape / private marks 是边界说明；FRED aggregate balance 不等于 loan tape。',
      ],
      missingEvidence: crePublicCoverage.length ? [] : ['公开 CRE 代理等待刷新。'],
      explanation: 'CRE 拖欠率、核销率与 SLOOS CRE 贷款标准为季频慢变量；FRED CRE loan balance 是公开 aggregate exposure proxy，VNQ/REM/CMBS 只是公开市场代理。',
      sourceType: creDelinquencyRate === null && creChargeOffRate === null && sloosCreTighteningMax === null && creLoanBalance === null ? '数据不足' : '事实',
      updatedAt: creLoanBalance !== null
        ? `FRED CRE loan balance:${formatWeekVintage(commercialRealEstate.creLoanBalanceUpdatedAt)}`
        : `FRED 季频 Commercial Real Estate:${formatQuarterVintage(commercialRealEstate.updatedAt)}`,
    }),
    createJudgment({
      id: 'driver-private-credit-proxy',
      title: '私募信用公开代理 PRIVATE CREDIT PROXY',
      group: 'macro-driver',
      status: bdcEtfPrice === null && hyOas === null ? WAITING : text(privateCreditProxy.privateCreditProxyRegime, '观察中'),
      direction: text(privateCreditProxy.privateCreditProxyRegime, '未知') === '压力上升'
        ? '信用压力上升'
        : text(privateCreditProxy.privateCreditProxyRegime, '未知') === '观察'
          ? '观察'
          : '相对平稳',
      confidence: bdcEtfPrice !== null && hyOas !== null ? '中等' : '偏低',
      dataCoverage: privateCreditPublicCoverage.length >= 4 ? '数据覆盖：公开信用代理覆盖良好' : privateCreditPublicCoverage.length ? '数据覆盖：公开信用代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        bdcEtfPrice === null
          ? 'BIZD listed BDC proxy 等待刷新。'
          : `BIZD ${formatNumber(bdcEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(bdcEtf4wChange)} — listed BDC proxy`,
        pbdcEtfPrice === null
          ? null
          : `PBDC ${formatNumber(pbdcEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(pbdcEtf4wChange)} — second listed BDC proxy`,
        seniorLoanEtfPrice === null
          ? null
          : `SRLN ${formatNumber(seniorLoanEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(seniorLoanEtf4wChange)} — senior loan ETF proxy`,
        intervalFundNavPrice === null
          ? `CCLFX interval-fund NAV proxy status: ${intervalFundNavStatus}`
          : `${text(privateCreditProxy.intervalFundNavSymbol, 'CCLFX')} ${formatNumber(intervalFundNavPrice, 2)}；4周变化 ${formatRatioAsPercent(intervalFundNav4wChange)} — public interval-fund NAV proxy（${formatWeekVintage(privateCreditProxy.intervalFundNavUpdatedAt)}；status=${intervalFundNavStatus}）`,
        hyOas === null ? null : `HY OAS ${formatNumber(hyOas, 2, '%')} — 公开信用利差代理`,
        privateCreditIgOas === null ? null : `IG OAS ${formatNumber(privateCreditIgOas, 2, '%')}；IG-HY ${formatSignedPoints(privateCreditIgMinusHyOas)} — cash-bond proxy`,
        cdxHyPrice === null
          ? `CDX HY status: ${cdxHyStatus}`
          : `ICE CDX HY ${formatNumber(cdxHyPrice, 4)}；${text(privateCreditProxy.cdxHyInstrument, 'CDX-NAHY-5Y')}（${formatWeekVintage(privateCreditProxy.cdxHyUpdatedAt)}；status=${cdxHyStatus}）`,
        cdxIgPrice === null
          ? `CDX IG status: ${cdxIgStatus}`
          : `ICE CDX IG ${formatNumber(cdxIgPrice, 4)}；${text(privateCreditProxy.cdxIgInstrument, 'CDX-NAIG-5Y')}（${formatWeekVintage(privateCreditProxy.cdxIgUpdatedAt)}；status=${cdxIgStatus}）`,
        `private credit marks status: ${privateCreditMarksStatus}`,
        formatSourceStatusMap(privateCreditProxy.sourceStatus, [['bdcEtf', 'BIZD'], ['pbdcEtf', 'PBDC'], ['seniorLoanEtf', 'SRLN'], ['intervalFundNav', 'CCLFX NAV'], ['hyOas', 'HY OAS'], ['igOas', 'IG OAS'], ['cdxHy', 'CDX HY'], ['cdxIg', 'CDX IG'], ['privateCreditMarks', 'private marks']]),
      ].filter(Boolean),
      coverageNotes: [
        ...privateCreditPublicCoverage,
        '私募信用 marks 需要 manual/licensed input；ICE CDX public settlement 不替代私募信用估值。',
      ],
      missingEvidence: privateCreditPublicCoverage.length ? [] : ['公开私募信用代理等待刷新。'],
      explanation: 'BIZD/PBDC、SRLN、CCLFX NAV、HY/IG OAS 与 ICE CDX public settlement 只提供公开压力观察，不能替代私募信用估值。',
      sourceType: bdcEtfPrice === null && hyOas === null ? '数据不足' : '代理信号',
      updatedAt: `Yahoo/FRED:${formatWeekVintage(privateCreditProxy.updatedAt)}`,
    }),
    createJudgment({
      id: 'driver-inflation',
      title: '通胀',
      group: 'macro-driver',
      status: finite(inputs.brent) === null ? INSUFFICIENT : Number(inputs.brent) >= 100 ? '压力上升' : '观察中',
      direction: finite(inputs.brent) !== null && Number(inputs.brent) >= 100 ? '压力上升' : '观察中',
      confidence: finite(inputs.brent) === null ? '偏低' : '中等',
      dataCoverage: inflationPublicCoverage.length >= 3 ? '数据覆盖：公开能源代理覆盖良好' : inflationPublicCoverage.length ? '数据覆盖：公开能源代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        `布伦特 ${formatNumber(inputs.brent, 1)}；盈亏平衡通胀 ${formatNumber(inputs.breakeven10y, 2, '%')}`,
        eiaBrentSpotPrice === null
          ? null
          : `EIA Brent Spot Price FOB ${formatNumber(eiaBrentSpotPrice, 2)}；日变化 ${formatSignedDecimal(eiaBrentSpotDailyChange, 2)}（${formatWeekVintage(eiaBrentSpotProxy.updatedAt)}；status=${formatSourceStatus(eiaBrentSpotProxy.sourceStatus)}）`,
        brentLayer?.crackSpread === null || !Number.isFinite(brentLayer?.crackSpread)
          ? null
          : `柴油裂解价差 $${brentLayer.crackSpread.toFixed(1)}/桶（${brentLayer.crackSpreadRegime}）`,
        ulsdPrice === null ? null : `ULSD ${formatNumber(ulsdPrice, 3)}；4周变化 ${formatSignedDecimal(ulsd4wChange, 3)} — 下游成品油压力`,
        brentFuturesCurveContracts.length
          ? `ICE Brent futuresCurve structure-only: ${brentFuturesCurveContracts.join(' / ')}；status=${text(brentFuturesCurve.curveStatus, 'missing')}`
          : null,
        brentIceFuturesPriceCurveContracts.length
          ? `ICE Brent public delayed price curve: ${brentIceFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentIceFuturesPriceCurve.frontMinusBack, 2)}；slope=${text(brentIceFuturesPriceCurve.slopeRegime, '未知')}`
          : null,
        brentFuturesPriceCurveContracts.length
          ? `Yahoo Brent priced futures proxy: ${brentFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentFuturesPriceCurve.frontMinusBack, 2)}；slope=${text(brentFuturesPriceCurve.slopeRegime, '未知')}`
          : null,
      ].filter(Boolean),
      coverageNotes: [
        ...inflationPublicCoverage,
        'Platts Dated Brent / official settlement / 原油库存细项保留为正式源边界说明。',
      ],
      missingEvidence: inflationPublicCoverage.length ? [] : ['公开能源代理等待刷新。'],
      explanation: 'Brent、EIA spot proxy、期货曲线和成品油代理可以提示能源压力，但不能单独证明广义通胀重新加速。',
      sourceType: finite(inputs.brent) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'driver-shipping-freight',
      title: '油轮运费与航运 SHIPPING FREIGHT',
      group: 'macro-driver',
      status: dirtyTankerIndex === null && cleanTankerIndex === null && dryBulkIndex === null ? WAITING : text(shippingFreight.freightStressRegime, '观察中'),
      direction: text(shippingFreight.tankerFreightRegime, '未知') === '高压'
        ? '油轮运费压力高'
        : text(shippingFreight.tankerFreightRegime, '未知') === '快速回落'
          ? '运费回落'
          : '观察中',
      confidence: dirtyTankerIndex !== null && cleanTankerIndex !== null ? '中等' : '偏低',
      dataCoverage: shippingPublicCoverage.length >= 3 ? '数据覆盖：StockQ BDTI/BCTI/BDI 已覆盖' : shippingPublicCoverage.length ? '数据覆盖：航运公开代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        dirtyTankerIndex === null
          ? 'BDTI dirty tanker index 等待刷新。'
          : `BDTI ${formatNumber(dirtyTankerIndex, 0)}；日变化 ${formatRatioAsPercent(dirtyTankerChange)}（${text(shippingFreight.tankerFreightRegime, '未知')}；${formatWeekVintage(shippingFreight.balticDirtyTankerUpdatedAt)}）`,
        cleanTankerIndex === null
          ? null
          : `BCTI ${formatNumber(cleanTankerIndex, 0)}；日变化 ${formatRatioAsPercent(cleanTankerChange)}（clean tanker，${text(shippingFreight.cleanTankerFreightRegime, '未知')}；${formatWeekVintage(shippingFreight.balticCleanTankerUpdatedAt)}）`,
        dryBulkIndex === null
          ? null
          : `BDI ${formatNumber(dryBulkIndex, 0)}；日变化 ${formatRatioAsPercent(dryBulkChange)}（dry bulk，${text(shippingFreight.dryBulkFreightRegime, '未知')}；${formatWeekVintage(shippingFreight.balticDryUpdatedAt)}）`,
        formatSourceStatusMap(shippingFreight.sourceStatus, [['dirtyTanker', 'BDTI'], ['cleanTanker', 'BCTI'], ['dryBulk', 'BDI']]),
      ].filter(Boolean),
      coverageNotes: [
        ...shippingPublicCoverage,
        '单船型/航线级别 tanker freight 与 Baltic 原始 licensed feed 是边界说明。',
      ],
      missingEvidence: shippingPublicCoverage.length ? [] : ['StockQ Baltic indices 等待刷新。'],
      explanation: 'BDTI/BCTI/BDI 是航运/油轮运费压力代理；只用于实物端压力观察，不改变 Brent promotion。',
      sourceType: dirtyTankerIndex === null && cleanTankerIndex === null && dryBulkIndex === null ? '数据不足' : '事实',
      updatedAt: `StockQ Baltic indices:${formatWeekVintage(shippingFreight.updatedAt)}`,
    }),
    createJudgment({
      id: 'driver-liquidity',
      title: '流动性',
      group: 'macro-driver',
      status: statusFromScore(data?.modules?.liquidity),
      direction: finite(inputs.dxy) !== null && Number(inputs.dxy) >= 105 ? '约束偏强' : '观察中',
      confidence: creditCalm ? '中等' : '偏低',
      dataCoverage: liquidityPublicCoverage.length >= 5 ? '数据覆盖：FRED + NY Fed repo + credit proxies 已覆盖' : liquidityPublicCoverage.length ? '数据覆盖：流动性公开代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        `广义美元 ${formatNumber(inputs.dxy, 2)}；10年期 ${formatNumber(inputs.us10y, 2, '%')}；10Y-2Y 期限利差 ${formatSignedPercent(t10y2y)}`,
        `ON RRP 余额 ${formatUsdTrillions(onRrp)}${onRrpAnnotation(onRrpSignal)}；Fed 资产负债表 4周变化 ${formatUsdBillionsFromFedChange(walcl4wChange)}`,
        `高收益利差 (HY OAS) ${formatNumber(hyOas, 2, '%')}；投资级利差 (IG OAS) ${formatNumber(igOas, 2, '%')}；1d ${formatSignedPoints(igOas1dChange)}；IG/HY 比率 ${formatNumber(igHyRatio, 2)}`,
        effectiveFedFundsRate === null ? null : `联邦基金利率 ${formatNumber(effectiveFedFundsRate, 2, '%')} — 当前官方政策利率`,
        sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')} — 隔夜担保融资利率`,
        reserveBalances === null ? null : `银行准备金 ${formatUsdTrillions(reserveBalances / 1_000_000)}；4周变化 ${formatSignedPercent(reserveBalances4wChange)} — 储备缓冲数量`,
        credit?.sloosTighteningLargeFirms === null || !Number.isFinite(credit?.sloosTighteningLargeFirms)
          ? null
          : `银行贷款标准 (SLOOS C&I 大型) ${formatSignedPercent(credit.sloosTighteningLargeFirms, 1)} / 小型 ${formatSignedPercent(sloosTighteningSmallFirms, 1)}；QoQ 大型 ${formatSignedPercent(sloosTighteningLargeQoQ, 1)} / 小型 ${formatSignedPercent(sloosTighteningSmallQoQ, 1)}（季度调查；${text(credit.sloosRegime, '未知')}）`,
        credit?.nfci === null || !Number.isFinite(credit?.nfci)
          ? null
          : `NFCI ${credit.nfci >= 0 ? '+' : ''}${formatNumber(credit.nfci, 2)}；4w ${formatSignedDecimal(nfci4wChange, 3)}（${text(credit.nfciRegime, '未知')}）`,
        fedLiquidity?.bgcrSofrSpread === null || !Number.isFinite(fedLiquidity?.bgcrSofrSpread)
          ? null
          : `回购利差 (BGCR-SOFR) ${formatBasisPoints(fedLiquidity.bgcrSofrSpread)} / TGCR-SOFR ${formatBasisPoints(tgcrSofrSpread)}；BGCR ${formatNumber(bgcr, 2, '%')} / TGCR ${formatNumber(tgcr, 2, '%')}（${fedLiquidity.repoSpreadRegime}；${text(fedLiquidity.repoRatesSource, 'repo source 待确认')}；BGCR ${formatWeekVintage(fedLiquidity.bgcrUpdatedAt)} / TGCR ${formatWeekVintage(fedLiquidity.tgcrUpdatedAt)}）`,
        formatSourceStatusMap(fedLiquidity.sourceStatus, [['walcl', 'WALCL'], ['onRrp', 'ON RRP'], ['effectiveFedFundsRate', 'DFF'], ['sofr', 'SOFR'], ['reserveBalances', 'reserves'], ['bgcr', 'BGCR'], ['tgcr', 'TGCR']]),
      ].filter(Boolean),
      coverageNotes: [
        ...liquidityPublicCoverage,
        '跨市场融资压力等待接入。此处作为边界说明保留；当前 FRED + NY Fed repo + credit proxies 已可用于公开代理观察。',
      ],
      missingEvidence: liquidityPublicCoverage.length ? [] : ['公开流动性代理等待刷新。'],
      counterEvidence: creditCalm ? ['信用与波动率尚未明显确认扩散。'] : [],
      explanation: creditCalm
        ? '长端利率和美元偏紧，但信用与波动率尚未明显确认扩散。'
        : '流动性压力需要与信用利差和波动率共同确认。',
    }),
    createJudgment({
      id: 'driver-policy',
      title: '政策',
      group: 'macro-driver',
      status: hasPolicyProxy ? `基于代理信号观察 / ${policyExpectationRegime}` : WAITING,
      direction: hasPolicyProxy ? (policyExpectationRegime === '降息预期' ? '政策预期转松' : '政策预期偏紧') : '方向待确认',
      confidence: hasPolicyProxy ? '中等' : '偏低',
      dataCoverage: hasPolicyProxy ? '数据覆盖：Fed statement / minutes / SEP / ZQ + SR3 + OIS 公开代理' : '数据覆盖：关键数据不足',
      evidence: hasPolicyProxy ? policyProxyEvidence : ['暂无直接 Fed 预期或政策路径指标。'],
      coverageNotes: [
        ...policyPublicCoverage,
        'CheckMySwap USD OIS public curve 已接入；proprietary dealer OIS forward 仍作为边界说明。',
      ],
      missingEvidence: hasPolicyProxy ? [] : ['政策预期公开代理等待刷新。'],
      explanation: hasPolicyProxy
        ? 'Fed target range、SEP median、FOMC statement/minutes 文本、Fed funds futures、SOFR futures 与 public OIS curve 已接入；proprietary dealer OIS 仍保留为边界插槽。'
        : '当前不伪造政策路径；除非接入 dot plot / forward rates 等明确前瞻数据，否则政策路径不是强驱动。',
      sourceType: hasPolicyProxy ? '事实 + 代理信号' : '数据不足',
    }),
  ];
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
  const fedLiquidity = isPlainObject(macroDrivers.fedLiquidity) ? macroDrivers.fedLiquidity : {};
  const credit = isPlainObject(macroDrivers.credit) ? macroDrivers.credit : {};
  const policyExpectations = isPlainObject(macroDrivers.policyExpectations) ? macroDrivers.policyExpectations : {};
  const shippingFreight = isPlainObject(macroDrivers.shippingFreight) ? macroDrivers.shippingFreight : {};
  const privateCreditProxy = isPlainObject(macroDrivers.privateCreditProxy) ? macroDrivers.privateCreditProxy : {};
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
  const bgcr = finite(fedLiquidity.bgcr);
  const tgcr = finite(fedLiquidity.tgcr);
  const tgcrSofrSpread = finite(fedLiquidity.tgcrSofrSpread);
  const igHyRatio = finite(credit.igHyRatio);
  const sloosTighteningSmallFirms = finite(credit.sloosTighteningSmallFirms);
  const nfci4wChange = finite(credit.nfci4wChange);
  const dirtyTankerIndex = finite(shippingFreight.balticDirtyTankerIndex);
  const cleanTankerIndex = finite(shippingFreight.balticCleanTankerIndex);
  const dryBulkIndex = finite(shippingFreight.balticDryIndex);
  const bdcEtfPrice = finite(privateCreditProxy.bdcEtfPrice);
  const bdcEtf4wChange = finite(privateCreditProxy.bdcEtf4wChange);
  const pbdcEtfPrice = finite(privateCreditProxy.pbdcEtfPrice);
  const pbdcEtf4wChange = finite(privateCreditProxy.pbdcEtf4wChange);
  const seniorLoanEtfPrice = finite(privateCreditProxy.seniorLoanEtfPrice);
  const seniorLoanEtf4wChange = finite(privateCreditProxy.seniorLoanEtf4wChange);
  const intervalFundNavPrice = finite(privateCreditProxy.intervalFundNavPrice);
  const intervalFundNav4wChange = finite(privateCreditProxy.intervalFundNav4wChange);
  const cdxHyPrice = finite(privateCreditProxy.cdxHyPrice);
  const cdxIgPrice = finite(privateCreditProxy.cdxIgPrice);
  const targetMid = finite(policyExpectations.targetMid);
  const fedFundsFutureImpliedRate = finite(policyExpectations.fedFundsFutureImpliedRate);
  const dotPlotMedianCurrentYear = finite(policyExpectations.dotPlotMedianCurrentYear);
  const fedFundsFuturesCurve = isPlainObject(policyExpectations.fedFundsFuturesCurve) ? policyExpectations.fedFundsFuturesCurve : {};
  const fedFundsFuturesCurveContracts = safeArray(fedFundsFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.impliedRate, 2, '%')}`);
  const sofrFuturesCurve = isPlainObject(policyExpectations.sofrFuturesCurve) ? policyExpectations.sofrFuturesCurve : {};
  const sofrFuturesCurveContracts = safeArray(sofrFuturesCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.impliedRate, 2, '%')}`);
  const oisForwardCurve = isPlainObject(policyExpectations.oisForwardCurve) ? policyExpectations.oisForwardCurve : {};
  const oisForwardCurveTenors = safeArray(oisForwardCurve.tenors)
    .filter(isPlainObject)
    .filter((item) => ['1Y', '2Y', '5Y', '10Y'].includes(text(item.tenor, '')))
    .map((item) => `${text(item.tenor, '--')} ${formatNumber(item.rate, 2, '%')}`);
  const eiaBrentSpotProxy = isPlainObject(brentLayer.eiaBrentSpotProxy) ? brentLayer.eiaBrentSpotProxy : {};
  const eiaBrentSpotPrice = finite(eiaBrentSpotProxy.price);
  const eiaBrentSpotDailyChange = finite(eiaBrentSpotProxy.dailyChange);
  const ulsdPrice = finite(brentLayer.ulsdPrice);
  const ulsd4wChange = finite(brentLayer.ulsd4wChange);
  const crackSpread4wChange = finite(brentLayer.crackSpread4wChange);
  const brentFuturesPriceCurve = isPlainObject(brentLayer.futuresPriceCurve) ? brentLayer.futuresPriceCurve : {};
  const brentFuturesPriceCurveContracts = safeArray(brentFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contractMonth, '--')} ${formatNumber(contract.price, 2)}`);
  const brentIceFuturesPriceCurve = isPlainObject(brentLayer.iceFuturesPriceCurve) ? brentLayer.iceFuturesPriceCurve : {};
  const brentIceFuturesPriceCurveContracts = safeArray(brentIceFuturesPriceCurve.contracts)
    .filter(isPlainObject)
    .slice(0, 4)
    .map((contract) => `${text(contract.contract, '--')} ${formatNumber(contract.price, 2)}`);
  const privateCreditIgOas = finite(privateCreditProxy.igOas);
  const privateCreditIgMinusHyOas = finite(privateCreditProxy.igMinusHyOas);
  const riskEnergyCoverage = [
    eiaBrentSpotPrice !== null ? 'EIA Brent Spot Price FOB public proxy' : null,
    brentLayer.crackSpread === null || !Number.isFinite(brentLayer.crackSpread) ? null : 'diesel crack spread proxy',
    ulsdPrice !== null ? 'ULSD public refined-products proxy' : null,
    brentIceFuturesPriceCurveContracts.length ? 'ICE delayed Brent futures curve' : null,
    brentFuturesPriceCurveContracts.length ? 'Yahoo Brent priced futures proxy' : null,
    dirtyTankerIndex !== null ? 'BDTI tanker freight proxy' : null,
    cleanTankerIndex !== null ? 'BCTI clean tanker proxy' : null,
    dryBulkIndex !== null ? 'BDI dry bulk proxy' : null,
  ].filter(Boolean);
  const riskRatesCoverage = [
    bgcr !== null ? 'NY Fed BGCR' : null,
    tgcr !== null ? 'NY Fed TGCR' : null,
    targetMid !== null ? 'Fed target range' : null,
    fedFundsFutureImpliedRate !== null ? 'ZQ front Fed funds future proxy' : null,
    fedFundsFuturesCurveContracts.length ? 'ZQ monthly futures curve proxy' : null,
    sofrFuturesCurveContracts.length ? 'SR3 SOFR futures curve proxy' : null,
    oisForwardCurveTenors.length ? 'CheckMySwap public OIS curve' : null,
  ].filter(Boolean);
  const riskPrivateCreditCoverage = [
    bdcEtfPrice !== null ? 'BIZD listed BDC proxy' : null,
    pbdcEtfPrice !== null ? 'PBDC listed BDC proxy' : null,
    seniorLoanEtfPrice !== null ? 'SRLN senior loan proxy' : null,
    intervalFundNavPrice !== null ? 'CCLFX public interval-fund NAV proxy' : null,
    privateCreditIgOas !== null ? 'IG OAS cash-bond proxy' : null,
    cdxHyPrice !== null ? 'ICE CDX HY public settlement' : null,
    cdxIgPrice !== null ? 'ICE CDX IG public settlement' : null,
  ].filter(Boolean);

  return [
    createJudgment({
      id: 'engine-energy-inflation-transmission',
      title: '能源与通胀传导',
      group: 'risk-engine',
      status: finite(inputs.brent) === null ? INSUFFICIENT : '压力上升',
      direction: finite(inputs.brent) === null ? '方向待确认' : '压力上升',
      confidence: evidenceStrengthFromConfidence(brentLayer.confidence, '中等'),
      dataCoverage: riskEnergyCoverage.length >= 5 ? '数据覆盖：公开能源代理覆盖良好' : riskEnergyCoverage.length ? '数据覆盖：公开能源代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        text(brentLayer.summaryZh, `布伦特 ${formatNumber(inputs.brent, 1)}，通胀预期 ${formatNumber(inputs.breakeven10y, 2, '%')}。`),
        eiaBrentSpotPrice === null
          ? null
          : `EIA Brent Spot Price FOB ${formatNumber(eiaBrentSpotPrice, 2)}；日变化 ${formatSignedDecimal(eiaBrentSpotDailyChange, 2)}（${formatWeekVintage(eiaBrentSpotProxy.updatedAt)}；status=${formatSourceStatus(eiaBrentSpotProxy.sourceStatus)}）`,
        brentLayer.crackSpread === null || !Number.isFinite(brentLayer.crackSpread)
          ? null
          : `柴油裂解价差 $${brentLayer.crackSpread.toFixed(1)}/桶；4周变化 ${formatSignedDecimal(crackSpread4wChange, 2)}（${brentLayer.crackSpreadRegime}，日度更新）`,
        ulsdPrice === null ? null : `ULSD ${formatNumber(ulsdPrice, 3)}；4周变化 ${formatSignedDecimal(ulsd4wChange, 3)} — 下游成品油压力`,
        brentIceFuturesPriceCurveContracts.length
          ? `ICE Brent public delayed price curve: ${brentIceFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentIceFuturesPriceCurve.frontMinusBack, 2)}`
          : null,
        brentFuturesPriceCurveContracts.length
          ? `Yahoo Brent priced futures proxy: ${brentFuturesPriceCurveContracts.join(' / ')}；front-back ${formatNumber(brentFuturesPriceCurve.frontMinusBack, 2)}`
          : null,
        dirtyTankerIndex === null
          ? null
          : `BDTI ${formatNumber(dirtyTankerIndex, 0)}（${text(shippingFreight.tankerFreightRegime, '未知')}）`,
        cleanTankerIndex === null ? null : `BCTI ${formatNumber(cleanTankerIndex, 0)}（${text(shippingFreight.cleanTankerFreightRegime, '未知')}）`,
        dryBulkIndex === null ? null : `BDI ${formatNumber(dryBulkIndex, 0)}（${text(shippingFreight.dryBulkFreightRegime, '未知')}）`,
      ].filter(Boolean),
      coverageNotes: [
        ...riskEnergyCoverage,
        'Platts Dated Brent / official settlement / 实物成交证据是正式源边界；公开代理不冒充正式源。',
      ],
      missingEvidence: riskEnergyCoverage.length ? [] : ['公开能源代理等待刷新。'],
      explanation: '当前已能观察公开价格、期限曲线、成品油和运费代理；正式实物供应冲击仍作为边界保留。',
      sourceType: finite(inputs.brent) === null ? '数据不足' : '数据推断',
    }),
    createJudgment({
      id: 'engine-rates-liquidity',
      title: '利率与流动性',
      group: 'risk-engine',
      status: text(ratesCheck.status, statusFromScore(data?.modules?.liquidity)),
      direction: '观察中',
      confidence: '中等',
      dataCoverage: riskRatesCoverage.length >= 5 ? '数据覆盖：利率与政策公开代理覆盖良好' : riskRatesCoverage.length ? '数据覆盖：利率与政策公开代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        text(ratesCheck.summaryZh, `10年期 ${formatNumber(inputs.us10y, 2, '%')}；实际利率 ${formatNumber(inputs.real10y, 2, '%')}；广义美元 ${formatNumber(inputs.dxy, 2)}。`),
        bgcr === null || tgcr === null
          ? null
          : `NY Fed repo rates: BGCR ${formatNumber(bgcr, 2, '%')} / TGCR ${formatNumber(tgcr, 2, '%')}；TGCR-SOFR ${formatBasisPoints(tgcrSofrSpread)}（${text(fedLiquidity.repoRatesSource, 'repo source 待确认')}）`,
        targetMid === null || fedFundsFutureImpliedRate === null
          ? null
          : `Policy path proxy: target midpoint ${formatNumber(targetMid, 3, '%')}；ZQ implied ${formatNumber(fedFundsFutureImpliedRate, 2, '%')}；SEP current median ${formatNumber(dotPlotMedianCurrentYear, 2, '%')}`,
        fedFundsFuturesCurveContracts.length
          ? `ZQ monthly futures curve proxy: ${fedFundsFuturesCurveContracts.join(' / ')}；front-back ${formatSignedPoints(fedFundsFuturesCurve.frontMinusBack)}`
          : null,
        sofrFuturesCurveContracts.length
          ? `SR3 SOFR futures proxy: ${sofrFuturesCurveContracts.join(' / ')}；front-back ${formatSignedPoints(sofrFuturesCurve.frontMinusBack)}`
          : null,
        oisForwardCurveTenors.length
          ? `CheckMySwap USD OIS public curve: ${oisForwardCurveTenors.join(' / ')}；10Y-2Y ${formatSignedPoints(oisForwardCurve.tenMinusTwo)}`
          : null,
      ].filter(Boolean),
      coverageNotes: [
        ...riskRatesCoverage,
        'dealer OIS / proprietary funding screens 是边界说明；public OIS curve 不冒充授权终端数据。',
      ],
      missingEvidence: riskRatesCoverage.length ? [] : ['利率与政策公开代理等待刷新。'],
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
      dataCoverage: marketMetric ? '数据覆盖：市场温度历史已覆盖' : '数据覆盖：关键数据不足',
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
      dataCoverage: hasPartialWorldOrder(worldOrderStressData) ? '数据覆盖：部分外部来源受限' : '数据覆盖：世界秩序公开源已覆盖',
      evidence: [finite(worldOrderStressData?.score) === null ? '世界秩序压力数据不足。' : `结构性压力分数 ${Math.round(Number(worldOrderStressData.score))}；freshness=${text(worldOrderStressData?.freshness, INSUFFICIENT)}`],
      missingEvidence: hasPartialWorldOrder(worldOrderStressData) ? ['SIPRI / ACLED 等来源仍需补全或配置。'] : [],
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
      dataCoverage: riskPrivateCreditCoverage.length >= 4 ? '数据覆盖：公开信用代理覆盖良好' : riskPrivateCreditCoverage.length ? '数据覆盖：公开信用代理部分覆盖' : '数据覆盖：关键数据不足',
      evidence: [
        text(liquidityCheck.summaryZh, `HY OAS ${formatNumber(inputs.hyOas, 2, '%')}；VIX ${formatNumber(inputs.vix, 2)}。`),
        `ON RRP ${formatUsdTrillions(onRrp)}${onRrpSignal ? '（历史低位告急）' : ''}`,
        `IG/HY 比率 ${formatNumber(igHyRatio, 2)}（信用层次性收缩）`,
        sofr === null ? null : `SOFR ${formatNumber(sofr, 2, '%')} — 隔夜担保融资压力`,
        reserveBalances === null ? null : `银行准备金 ${formatUsdTrillions(reserveBalances / 1_000_000)}，4 周变化 ${formatSignedPercent(reserveBalances4wChange)}（系统流动性缓冲）`,
        credit?.sloosTighteningLargeFirms === null || !Number.isFinite(credit?.sloosTighteningLargeFirms)
          ? null
          : `银行贷款标准 (SLOOS C&I) 大型 ${formatSignedPercent(credit.sloosTighteningLargeFirms, 1)} / 小型 ${formatSignedPercent(sloosTighteningSmallFirms, 1)}（信用环境${credit.sloosTighteningLargeFirms >= 20 ? '收紧确认' : credit.sloosTighteningLargeFirms >= 0 ? '温和收紧' : '放松'}）`,
        credit?.nfci === null || !Number.isFinite(credit?.nfci)
          ? null
          : `金融状况指数 (NFCI) ${credit.nfci >= 0 ? '+' : ''}${formatNumber(credit.nfci, 2)}；4w ${formatSignedDecimal(nfci4wChange, 3)}（${text(credit.nfciRegime, credit.nfci > 0 ? '偏紧' : credit.nfci < 0 ? '偏松' : '中性')}，周度更新）`,
        bdcEtfPrice === null
          ? null
          : `BIZD ${formatNumber(bdcEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(bdcEtf4wChange)}（listed BDC proxy）`,
        pbdcEtfPrice === null
          ? null
          : `PBDC ${formatNumber(pbdcEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(pbdcEtf4wChange)}（listed BDC proxy）`,
        seniorLoanEtfPrice === null
          ? null
          : `SRLN ${formatNumber(seniorLoanEtfPrice, 2)}；4周变化 ${formatRatioAsPercent(seniorLoanEtf4wChange)}（senior loan ETF proxy）`,
        intervalFundNavPrice === null
          ? null
          : `${text(privateCreditProxy.intervalFundNavSymbol, 'CCLFX')} NAV ${formatNumber(intervalFundNavPrice, 2)}；4周变化 ${formatRatioAsPercent(intervalFundNav4wChange)}（public interval-fund NAV proxy）`,
        privateCreditIgOas === null ? null : `IG OAS ${formatNumber(privateCreditIgOas, 2, '%')}；IG-HY ${formatSignedPoints(privateCreditIgMinusHyOas)}（cash-bond proxy）`,
        cdxHyPrice === null && cdxIgPrice === null
          ? `CDX/private marks status: HY=${text(privateCreditProxy.cdxHyStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.cdxHy))} / IG=${text(privateCreditProxy.cdxIgStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.cdxIg))} / marks=${text(privateCreditProxy.privateCreditMarksStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.privateCreditMarks))}`
          : `ICE CDX public settlement: HY ${formatNumber(cdxHyPrice, 4)} / IG ${formatNumber(cdxIgPrice, 4)}；marks=${text(privateCreditProxy.privateCreditMarksStatus, formatSourceStatus(privateCreditProxy.sourceStatus?.privateCreditMarks))}`,
      ].filter(Boolean),
      coverageNotes: [
        ...riskPrivateCreditCoverage,
        'private credit marks 是边界说明；CCLFX NAV 与 ICE CDX public settlement 不能替代 private marks。',
      ],
      missingEvidence: riskPrivateCreditCoverage.length ? [] : ['公开私募信用代理等待刷新。'],
      counterEvidence: creditCalm ? ['信用和波动率尚未显示系统性扩散。'] : [],
      explanation: creditCalm
        ? '信用和波动率尚未显示系统性扩散，金融脆弱性维持观察。'
        : '需要更细信用和银行压力数据才能提高结论强度。',
    }),
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
  const overview = {
    today: buildTodayJudgment(data, healthDashboard, worldOrderStressData, marketPricingMetricsData),
    pressures: buildPressureSources(data, worldOrderStressData),
    signalLayers: buildSignalLayers(data, marketPricingMetricsData),
    drivers: buildMacroDrivers(data),
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

function appendTodaySummaryList(root, items) {
  const list = document.createElement('ol');
  list.className = 'today-summary-list';
  const values = safeArray(items).filter((item) => typeof item === 'string' && item.trim()).slice(0, 3);
  (values.length ? values : ['数据不足，等待确认']).forEach((item) => appendText(list, 'li', '', item));
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
  if (identity.includes('增长') || identity.includes('消费') || identity.includes('growth') || identity.includes('retail')) return 'is-growth';
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
  appendEditorialDriverSublist(card, '公开代理覆盖', judgment.coverageNotes, 'is-evidence');
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
  appendEditorialEngineSublist(card, '公开代理覆盖', judgment.coverageNotes, 'is-evidence');
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
  const body = document.createElement('div');
  body.className = 'runtime-block-body';
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
  body.appendChild(block);
  root.appendChild(body);
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
  appendEditorialSignalSublist(card, '公开代理覆盖', judgment.coverageNotes, 'is-evidence');
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
  appendEditorialPressureSublist(card, '公开代理覆盖', judgment.coverageNotes, 'is-evidence');
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

  const today = appendSection(container, '今日总判断', 'macro-overview-hero editorial-first-fold', 'homepage-today-judgment');
  appendText(today, 'p', 'editorial-risk-overline', 'GLOBAL RISK SCORE / SYSTEMIC RISK STAGE');
  const summaryGrid = document.createElement('div');
  summaryGrid.className = 'today-summary-grid';

  const scoreTrend = document.createElement('article');
  scoreTrend.className = 'today-summary-cell today-summary-score';
  scoreTrend.setAttribute('data-today-summary-element', 'score-trend');
  appendText(scoreTrend, 'span', 'today-summary-label', 'GLOBAL RISK SCORE');
  const scoreRow = document.createElement('div');
  scoreRow.className = 'today-summary-score-row';
  appendText(scoreRow, 'strong', 'today-summary-score-value', overview.today.score);
  appendText(scoreRow, 'span', 'today-summary-score-stage', overview.today.stage || UNDECIDED);
  scoreTrend.appendChild(scoreRow);
  const trendRow = document.createElement('div');
  trendRow.className = 'today-summary-trend-row';
  const trend1d = appendText(trendRow, 'span', 'today-summary-trend-chip', `1日变化 ${overview.today.change1dCompact}`);
  trend1d.setAttribute('data-summary-metric', 'score-change-1d');
  const trend7d = appendText(trendRow, 'span', 'today-summary-trend-chip', `7日变化 ${overview.today.change7dCompact}`);
  trend7d.setAttribute('data-summary-metric', 'score-change-7d');
  scoreTrend.appendChild(trendRow);
  summaryGrid.appendChild(scoreTrend);

  const overallJudgment = document.createElement('article');
  overallJudgment.className = 'today-summary-cell today-summary-overall';
  overallJudgment.setAttribute('data-today-summary-element', 'overall-judgment');
  appendText(overallJudgment, 'span', 'today-summary-label', 'TODAY\'S VERDICT · 今日总判断');
  appendText(overallJudgment, 'h3', 'today-summary-title', overview.today.oneLine);
  appendText(overallJudgment, 'p', 'today-summary-copy', overview.today.macroState);
  summaryGrid.appendChild(overallJudgment);

  const dataHealth = document.createElement('article');
  dataHealth.className = `today-summary-cell today-summary-health is-${overview.today.dataHealth.tone}`;
  dataHealth.setAttribute('data-today-summary-element', 'data-health');
  appendText(dataHealth, 'span', 'today-summary-label', 'DATA HEALTH');
  appendText(dataHealth, 'strong', 'today-summary-health-pill', overview.today.dataHealth.state);
  appendText(dataHealth, 'p', 'today-summary-copy', overview.today.dataHealth.summary);
  const healthUpdates = document.createElement('ul');
  healthUpdates.className = 'today-summary-update-list';
  overview.today.dataHealth.updates.forEach((item) => appendText(healthUpdates, 'li', '', item));
  dataHealth.appendChild(healthUpdates);
  summaryGrid.appendChild(dataHealth);

  const topRisks = document.createElement('article');
  topRisks.className = 'today-summary-cell today-summary-risks';
  topRisks.setAttribute('data-today-summary-element', 'top-risks');
  appendText(topRisks, 'span', 'today-summary-label', 'TOP 3 RISKS');
  appendTodaySummaryList(topRisks, overview.today.topRisks);
  summaryGrid.appendChild(topRisks);

  const noiseDivergence = document.createElement('article');
  noiseDivergence.className = 'today-summary-cell today-summary-noise';
  noiseDivergence.setAttribute('data-today-summary-element', 'noise-divergence');
  appendText(noiseDivergence, 'span', 'today-summary-label', 'NOISE / DIVERGENCE');
  appendTodaySummaryList(noiseDivergence, overview.today.noiseDivergences);
  summaryGrid.appendChild(noiseDivergence);

  const stateConclusion = document.createElement('article');
  stateConclusion.className = 'today-summary-cell today-summary-state';
  stateConclusion.setAttribute('data-today-summary-element', 'state-conclusion');
  appendText(stateConclusion, 'span', 'today-summary-label', 'STATE CONCLUSION');
  appendText(stateConclusion, 'strong', 'today-summary-state-text', overview.today.stateConclusion);
  appendText(stateConclusion, 'p', 'today-summary-copy', `证据强度：${overview.today.evidenceStrength || '等待校准'}；更新：${overview.today.updatedAt || '等待数据校准'}`);
  summaryGrid.appendChild(stateConclusion);

  today.appendChild(summaryGrid);

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

  const temp = appendRuntimeBlock(
    container,
    'homepage-market-temperature',
    '市场温度',
    'MARKET PRICING TEMPERATURE',
    'QQQ 60 周均值 + z-score · NDX/IXIC 广度对照 · 本数据为统计描述，不构成投资建议'
  );
  appendMarketTemperatureBody(temp, overview.marketTemperature, marketPricingMetricsData);

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
