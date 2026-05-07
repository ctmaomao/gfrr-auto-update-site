import {
  clampConfidence,
  clampScore,
  finiteOrNull,
  sanitizeEvidence
} from './normalize-world-order-inputs.mjs';

function pickDisplayValue(dataPayload, realtimePayload, key) {
  const realtimeValue = finiteOrNull(realtimePayload?.values?.[key]);
  if (realtimeValue !== null) return realtimeValue;
  const displayValue = finiteOrNull(dataPayload?.displayInputsBaseline?.[key]);
  if (displayValue !== null) return displayValue;
  return null;
}

function addEvidence(evidence, condition, item) {
  if (condition) evidence.push(item);
}

export function buildMarketConfirmation({ dataPayload = {}, realtimePayload = {}, rules = {} } = {}) {
  const config = rules.marketConfirmation || {};
  const values = {
    gold: pickDisplayValue(dataPayload, realtimePayload, 'gold'),
    brent: pickDisplayValue(dataPayload, realtimePayload, 'brent'),
    vix: pickDisplayValue(dataPayload, realtimePayload, 'vix'),
    dxy: pickDisplayValue(dataPayload, realtimePayload, 'dxy'),
    hyOas: pickDisplayValue(dataPayload, realtimePayload, 'hyOas'),
    spx: pickDisplayValue(dataPayload, realtimePayload, 'spx')
  };
  const availableCount = Object.values(values).filter((value) => value !== null).length;
  let score = 0;
  const evidence = [];

  addEvidence(evidence, values.gold !== null && values.gold >= (config.goldHigh ?? 2400), {
    labelZh: '黄金处于偏强区间',
    source: 'market:gold',
    summary: `黄金当前值 ${values.gold}，显示避险或实际利率压力定价。`,
    value: values.gold,
    direction: 'up',
    confidence: values.gold >= (config.goldVeryHigh ?? 3000) ? 0.75 : 0.55
  });
  if (values.gold !== null && values.gold >= (config.goldHigh ?? 2400)) score += values.gold >= (config.goldVeryHigh ?? 3000) ? 18 : 11;

  addEvidence(evidence, values.brent !== null && values.brent >= (config.brentPressure ?? 95), {
    labelZh: '能源价格压力偏高',
    source: 'market:brent',
    summary: `布伦特当前值 ${values.brent}，对地缘与供应风险有部分确认作用。`,
    value: values.brent,
    direction: 'up',
    confidence: values.brent >= (config.brentHighPressure ?? 110) ? 0.75 : 0.55
  });
  if (values.brent !== null && values.brent >= (config.brentPressure ?? 95)) score += values.brent >= (config.brentHighPressure ?? 110) ? 16 : 9;

  addEvidence(evidence, values.vix !== null && values.vix >= (config.vixElevated ?? 20), {
    labelZh: '波动率风险定价抬升',
    source: 'market:vix',
    summary: `VIX 当前值 ${values.vix}，显示风险资产对冲需求上升。`,
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
    summary: `HY OAS 当前值 ${values.hyOas}，显示信用风险溢价上升。`,
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
