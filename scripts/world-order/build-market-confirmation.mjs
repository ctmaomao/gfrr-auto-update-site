import {
  clampConfidence,
  clampScore,
  fetchTextWithTimeout,
  finiteOrNull,
  safeJsonParse,
  sanitizeEvidence
} from './normalize-world-order-inputs.mjs';

export const WORKER_MARKET_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json';
const MARKET_INPUT_SOURCES = new Set(['worker-generated-preview', 'local-realtime', 'daily-baseline', 'unavailable']);
const MARKET_VALUE_KEYS = ['brent', 'gold', 'vix', 'dxy', 'hyOas', 'us10y', 'real10y', 'spx'];
const WORKER_MAX_AGE_MINUTES = 15;
const WORKER_MIN_HEALTH_SCORE = 85;
const WORKER_MAX_CRITICAL_MISSING = 1;
const WORKER_TIMEOUT_MS = 4500;

function parseIsoTime(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function ageMinutesFromUpdatedAt(updatedAt) {
  const timestamp = parseIsoTime(updatedAt);
  if (timestamp === null) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function normalizeValues(values = {}) {
  return Object.fromEntries(MARKET_VALUE_KEYS.map((key) => [key, finiteOrNull(values?.[key])]));
}

function extractBrentSource(payload) {
  const sourceDetails = payload?.sourceDetails?.brent;
  if (typeof sourceDetails?.source === 'string' && sourceDetails.source.trim()) return sourceDetails.source.trim();
  const promotion = payload?.brentValidation?.promotion || {};
  if (typeof promotion.selectedSource === 'string' && promotion.selectedSource.trim()) return promotion.selectedSource.trim();
  return null;
}

function extractPromotionReason(payload) {
  const promotion = payload?.brentValidation?.promotion || {};
  if (typeof promotion.reason === 'string' && promotion.reason.trim()) return promotion.reason.trim();
  if (typeof promotion.holdReason === 'string' && promotion.holdReason.trim()) return promotion.holdReason.trim();
  if (Array.isArray(promotion.reasons) && promotion.reasons.length) return promotion.reasons.map(String).join('; ');
  return null;
}

function buildMarketConfirmationInput({
  source,
  updatedAt = null,
  ageMinutes = null,
  healthScore = null,
  criticalMissing = null,
  values = {},
  brentValidation = null,
  sourceDetails = null,
  sourceUrl = null,
  path = null,
  fallbackReason = null
} = {}) {
  const normalizedValues = normalizeValues(values);
  const payloadForBrent = { brentValidation, sourceDetails };
  return {
    source: MARKET_INPUT_SOURCES.has(source) ? source : 'unavailable',
    sourceUrl,
    path,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : null,
    ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : null,
    healthScore: finiteOrNull(healthScore),
    criticalMissing: finiteOrNull(criticalMissing),
    brent: normalizedValues.brent,
    gold: normalizedValues.gold,
    vix: normalizedValues.vix,
    dxy: normalizedValues.dxy,
    hyOas: normalizedValues.hyOas,
    us10y: normalizedValues.us10y,
    real10y: normalizedValues.real10y,
    spx: normalizedValues.spx,
    brentSource: extractBrentSource(payloadForBrent),
    brentPromotionApplied: brentValidation?.promotion?.applied === true,
    brentPromotionReason: extractPromotionReason(payloadForBrent),
    fallbackReason: typeof fallbackReason === 'string' && fallbackReason.trim() ? fallbackReason.trim() : null
  };
}

function workerGateFailure(payload, httpStatus) {
  if (httpStatus !== 200) return `worker-http-${httpStatus}`;
  if (!payload || typeof payload !== 'object') return 'worker-invalid-payload';
  if (payload.sourceMode !== 'worker-generated-preview') return 'worker-source-mode-not-preview';
  if (payload.unavailable === true) return 'worker-unavailable';
  const healthScore = Number(payload.healthScore);
  if (!Number.isFinite(healthScore) || healthScore < WORKER_MIN_HEALTH_SCORE) return 'worker-health-score-low';
  const criticalMissing = Number(payload.criticalMissing);
  if (!Number.isFinite(criticalMissing) || criticalMissing > WORKER_MAX_CRITICAL_MISSING) return 'worker-critical-missing-high';
  const ageMinutes = ageMinutesFromUpdatedAt(payload.updatedAt);
  if (ageMinutes === null) return 'worker-updatedAt-invalid';
  if (ageMinutes > WORKER_MAX_AGE_MINUTES) return 'worker-stale';
  if (!payload.values || typeof payload.values !== 'object') return 'worker-values-missing';
  const brent = finiteOrNull(payload.values.brent);
  if (brent === null || brent <= 0) return 'worker-brent-invalid';
  return null;
}

async function fetchWorkerMarketInput() {
  try {
    const response = await fetchTextWithTimeout(WORKER_MARKET_PREVIEW_URL, WORKER_TIMEOUT_MS);
    if (!response.ok) return { input: null, reason: `worker-http-${response.status}` };
    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) return { input: null, reason: 'worker-json-parse-failed' };
    const payload = parsed.value;
    const gateReason = workerGateFailure(payload, response.status);
    if (gateReason) return { input: null, reason: gateReason };
    return {
      input: buildMarketConfirmationInput({
        source: 'worker-generated-preview',
        sourceUrl: WORKER_MARKET_PREVIEW_URL,
        updatedAt: payload.updatedAt,
        ageMinutes: ageMinutesFromUpdatedAt(payload.updatedAt),
        healthScore: payload.healthScore,
        criticalMissing: payload.criticalMissing,
        values: payload.values,
        brentValidation: payload.brentValidation,
        sourceDetails: payload.sourceDetails
      }),
      reason: null
    };
  } catch (error) {
    return { input: null, reason: error instanceof Error ? `worker-fetch-failed: ${error.message}` : 'worker-fetch-failed' };
  }
}

function buildLocalRealtimeInput(realtimePayload, fallbackReason) {
  const values = realtimePayload?.values;
  const brent = finiteOrNull(values?.brent);
  if (!values || typeof values !== 'object' || brent === null || brent <= 0) {
    return null;
  }
  return buildMarketConfirmationInput({
    source: 'local-realtime',
    path: 'realtime/market.json',
    updatedAt: typeof realtimePayload.updatedAt === 'string' ? realtimePayload.updatedAt : null,
    ageMinutes: ageMinutesFromUpdatedAt(realtimePayload.updatedAt),
    healthScore: realtimePayload.healthScore,
    criticalMissing: realtimePayload.criticalMissing,
    values,
    brentValidation: realtimePayload.brentValidation,
    sourceDetails: realtimePayload.sourceDetails,
    fallbackReason
  });
}

function buildDailyBaselineInput(dataPayload, fallbackReason) {
  const values = dataPayload?.displayInputsBaseline;
  const brent = finiteOrNull(values?.brent);
  if (!values || typeof values !== 'object' || brent === null || brent <= 0) {
    return null;
  }
  return buildMarketConfirmationInput({
    source: 'daily-baseline',
    path: 'data/radar-data.json',
    updatedAt: typeof dataPayload?.dailyRealtimeInput?.updatedAt === 'string'
      ? dataPayload.dailyRealtimeInput.updatedAt
      : typeof dataPayload?.updatedAt === 'string'
        ? dataPayload.updatedAt
        : null,
    ageMinutes: ageMinutesFromUpdatedAt(dataPayload?.dailyRealtimeInput?.updatedAt || dataPayload?.updatedAt),
    values,
    fallbackReason
  });
}

export async function selectMarketConfirmationInput({ dataPayload = {}, realtimePayload = {} } = {}) {
  const workerResult = await fetchWorkerMarketInput();
  if (workerResult.input) return workerResult.input;

  const localInput = buildLocalRealtimeInput(realtimePayload, workerResult.reason);
  if (localInput) return localInput;

  const dailyInput = buildDailyBaselineInput(dataPayload, localInput ? null : workerResult.reason || 'local-realtime-unavailable');
  if (dailyInput) return dailyInput;

  return buildMarketConfirmationInput({
    source: 'unavailable',
    fallbackReason: workerResult.reason || 'market-confirmation-input-unavailable'
  });
}

function addEvidence(evidence, condition, item) {
  if (condition) evidence.push(item);
}

function marketSourcePrefix(marketConfirmationInput) {
  if (marketConfirmationInput?.source === 'worker-generated-preview') return '基于 Worker 快变量';
  if (marketConfirmationInput?.source === 'local-realtime') return '基于 local realtime fallback';
  if (marketConfirmationInput?.source === 'daily-baseline') return '基于 Daily baseline';
  return '市场确认数据暂不可用';
}

function formatMarketValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function addPromotionEvidence(evidence, marketConfirmationInput) {
  if (marketConfirmationInput?.source !== 'worker-generated-preview') return;
  if (!marketConfirmationInput.brentPromotionApplied && !marketConfirmationInput.brentPromotionReason && !marketConfirmationInput.brentSource) return;
  evidence.push({
    labelZh: '布伦特来源确认',
    source: 'market:brent-validation',
    summary: `Worker Brent 来源：${marketConfirmationInput.brentSource || '未标注'}；promotion=${marketConfirmationInput.brentPromotionApplied ? '已应用' : '未应用'}${marketConfirmationInput.brentPromotionReason ? `；原因：${marketConfirmationInput.brentPromotionReason}` : ''}。`,
    value: marketConfirmationInput.brent,
    direction: marketConfirmationInput.brentPromotionApplied ? 'up' : 'neutral',
    confidence: marketConfirmationInput.brentPromotionApplied ? 0.65 : 0.45
  });
}

export function buildMarketConfirmation({ marketConfirmationInput = null, rules = {} } = {}) {
  const config = rules.marketConfirmation || {};
  const values = {
    gold: finiteOrNull(marketConfirmationInput?.gold),
    brent: finiteOrNull(marketConfirmationInput?.brent),
    vix: finiteOrNull(marketConfirmationInput?.vix),
    dxy: finiteOrNull(marketConfirmationInput?.dxy),
    hyOas: finiteOrNull(marketConfirmationInput?.hyOas),
    spx: finiteOrNull(marketConfirmationInput?.spx)
  };
  const availableCount = Object.values(values).filter((value) => value !== null).length;
  let score = 0;
  const evidence = [];
  const inputSource = marketConfirmationInput?.source || 'unavailable';
  const prefix = marketSourcePrefix(marketConfirmationInput);

  if (inputSource === 'unavailable') {
    return {
      score: 0,
      labelZh: '市场确认',
      state: 'not_confirmed',
      evidence: sanitizeEvidence([{
        labelZh: '市场确认数据暂不可用',
        source: 'market:unavailable',
        summary: '市场确认数据暂不可用，本轮不使用市场价格确认结构性压力。',
        value: null,
        direction: 'neutral',
        confidence: 0.05
      }], 'market'),
      confidence: 0.05
    };
  }

  addEvidence(evidence, values.gold !== null && values.gold >= (config.goldHigh ?? 2400), {
    labelZh: '黄金处于偏强区间',
    source: 'market:gold',
    summary: `${prefix}，黄金${inputSource === 'daily-baseline' ? '参考值' : '当前值'} ${formatMarketValue(values.gold)}，显示避险或实际利率压力定价。`,
    value: values.gold,
    direction: 'up',
    confidence: values.gold >= (config.goldVeryHigh ?? 3000) ? 0.75 : 0.55
  });
  if (values.gold !== null && values.gold >= (config.goldHigh ?? 2400)) score += values.gold >= (config.goldVeryHigh ?? 3000) ? 18 : 11;

  addEvidence(evidence, values.brent !== null && values.brent >= (config.brentPressure ?? 95), {
    labelZh: '能源价格压力偏高',
    source: 'market:brent',
    summary: `${prefix}，布伦特${inputSource === 'daily-baseline' ? '参考值' : '当前值'} ${formatMarketValue(values.brent)}，对地缘与供应风险有部分确认作用。`,
    value: values.brent,
    direction: 'up',
    confidence: values.brent >= (config.brentHighPressure ?? 110) ? 0.75 : 0.55
  });
  if (values.brent !== null && values.brent >= (config.brentPressure ?? 95)) score += values.brent >= (config.brentHighPressure ?? 110) ? 16 : 9;

  addEvidence(evidence, values.vix !== null && values.vix >= (config.vixElevated ?? 20), {
    labelZh: '波动率风险定价抬升',
    source: 'market:vix',
    summary: `${prefix}，VIX ${inputSource === 'daily-baseline' ? '参考值' : '当前值'} ${formatMarketValue(values.vix)}，显示风险资产对冲需求上升。`,
    value: values.vix,
    direction: 'up',
    confidence: values.vix >= (config.vixHigh ?? 30) ? 0.8 : 0.55
  });
  if (values.vix !== null && values.vix >= (config.vixElevated ?? 20)) score += values.vix >= (config.vixHigh ?? 30) ? 18 : 10;

  const dxyGoldBothStrong = values.dxy !== null && values.gold !== null &&
    values.dxy >= (config.dxyStrong ?? 105) &&
    values.gold >= (config.goldHigh ?? 2400);
  addEvidence(evidence, dxyGoldBothStrong, {
    labelZh: '美元与黄金同步偏强',
    source: 'market:dxy-gold',
    summary: '美元与黄金同步偏强时，可能反映安全资产需求与金融压力并存。',
    value: `${values.dxy}/${values.gold}`,
    direction: 'up',
    confidence: 0.6
  });
  if (dxyGoldBothStrong) score += 12;

  addEvidence(evidence, values.hyOas !== null && values.hyOas >= (config.hyOasElevated ?? 4), {
    labelZh: '信用利差压力抬升',
    source: 'market:hyOas',
    summary: `${prefix}，HY OAS ${inputSource === 'daily-baseline' ? '参考值' : '当前值'} ${formatMarketValue(values.hyOas)}，显示信用风险溢价上升。`,
    value: values.hyOas,
    direction: 'up',
    confidence: values.hyOas >= (config.hyOasHigh ?? 6) ? 0.75 : 0.55
  });
  if (values.hyOas !== null && values.hyOas >= (config.hyOasElevated ?? 4)) score += values.hyOas >= (config.hyOasHigh ?? 6) ? 18 : 10;

  const spxGoldDivergence = values.spx !== null && values.gold !== null &&
    values.spx >= (config.spxStrong ?? 6000) &&
    values.gold >= (config.goldHigh ?? 2400);
  addEvidence(evidence, spxGoldDivergence, {
    labelZh: '股市与黄金同步偏强',
    source: 'market:spx-gold',
    summary: '股市与黄金同步偏强更像市场分歧确认，说明结构性风险尚未完全进入风险资产定价。',
    value: `${values.spx}/${values.gold}`,
    direction: 'mixed',
    confidence: 0.45
  });
  if (spxGoldDivergence) score += 6;
  addPromotionEvidence(evidence, marketConfirmationInput);

  const normalizedScore = clampScore(score);
  const state = normalizedScore >= 70
    ? 'high_confirmed'
    : normalizedScore >= 45
      ? 'partial_confirmed'
      : normalizedScore >= 20
        ? 'weak'
        : 'not_confirmed';

  return {
    score: normalizedScore,
    labelZh: '市场确认',
    state,
    evidence: sanitizeEvidence(evidence, 'market'),
    confidence: clampConfidence(availableCount / 6)
  };
}
