import { briefEvidence } from './daily-brief.mjs';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

function divergenceStatusFromScore(score) {
  if (!Number.isFinite(score)) return 'insufficient_data';
  if (score >= 71) return 'high_stress';
  if (score >= 51) return 'stress';
  if (score >= 31) return 'watch';
  return 'normal';
}

function divergenceCheckStatusFromScore(score) {
  const status = divergenceStatusFromScore(score);
  return status === 'high_stress' ? 'stress' : status;
}

function divergenceStateZh(state) {
  return {
    normal: '未见明显背离',
    watch: '背离观察',
    stress: '背离压力',
    high_stress: '高背离压力',
    insufficient_data: '数据不足'
  }[state] || '状态待确认';
}

function buildDivergenceCheck({ key, labelZh, category, score, summaryZh, evidence, dataUsed, limitations }) {
  const normalizedScore = Number.isFinite(score) ? clamp(score) : 0;
  const status = Number.isFinite(score) ? divergenceCheckStatusFromScore(normalizedScore) : 'insufficient_data';
  return {
    key,
    labelZh,
    category,
    status,
    score: normalizedScore,
    summaryZh,
    evidence: Array.isArray(evidence) ? evidence : [],
    dataUsed: Array.isArray(dataUsed) ? dataUsed : [],
    limitations: Array.isArray(limitations) ? limitations : []
  };
}

function buildEnergyPricingGapCheck(risk, realtimePayload, displayInputsBaseline) {
  const brent = Number(displayInputsBaseline.brent);
  const validation = realtimePayload?.brentValidation || {};
  const promotion = validation.promotion || {};
  const sourceDetails = realtimePayload?.sourceDetails?.brent || {};
  const hasValidationContext = !!(promotion.reason || promotion.moveStatus || sourceDetails.source || validation.consensus);
  if (!Number.isFinite(brent)) {
    return buildDivergenceCheck({
      key: 'energy_pricing_gap_watch',
      labelZh: '能源定价背离观察',
      category: 'energy_pricing',
      score: null,
      summaryZh: '数据不足，暂不足以判断能源定价背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.brent', 'brentValidation'],
      limitations: ['Brent 主值不可用。', 'Platts Dated Brent / 真实 Dated Brent 数据未接入。']
    });
  }
  const score = brent >= 110 ? 72 : brent >= 95 ? 52 : brent >= 85 ? 34 : 18;
  return buildDivergenceCheck({
    key: 'energy_pricing_gap_watch',
    labelZh: '能源定价背离观察',
    category: 'energy_pricing',
    score: hasValidationContext ? score : Math.max(20, score - 10),
    summaryZh: hasValidationContext
      ? '当前只是公开 Brent 价格验证层观察，不等同于 Platts Dated Brent，不能证明真实实物现货溢价；它只提示能源价格来源之间是否存在验证压力或确认压力。'
      : '当前只有 Brent 主值可用，验证层信息不足，暂按低置信观察处理。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'brent', '布伦特', brent, `布伦特主显示值为 ${brent.toFixed(1)}。`),
      briefEvidence('brentValidation', 'promotion.moveStatus', 'Brent promotion 状态', promotion.moveStatus || null, `moveStatus=${promotion.moveStatus || '暂不足以判断'}。`),
      briefEvidence('sourceDetails', 'brent.source', 'Brent 来源说明', sourceDetails.source || null, sourceDetails.source ? `来源：${sourceDetails.source}。` : 'Brent sourceDetails 不足。')
    ],
    dataUsed: ['displayInputsBaseline.brent', 'brentValidation.promotion', 'sourceDetails.brent'],
    limitations: ['不等同于 Platts Dated Brent。', '不能证明真实实物现货溢价。', '不改变 values.brent 或 Brent promotion。']
  });
}

function buildRatesAssetsCheck(risk, displayInputsBaseline) {
  const us10y = Number(displayInputsBaseline.us10y);
  const real10y = Number(displayInputsBaseline.real10y);
  const spx = Number(displayInputsBaseline.spx);
  const vix = Number(displayInputsBaseline.vix);
  if (![us10y, real10y, spx, vix].some(Number.isFinite)) {
    return buildDivergenceCheck({
      key: 'rates_vs_risk_assets',
      labelZh: '长端利率与风险资产背离',
      category: 'rates_assets',
      score: null,
      summaryZh: '数据不足，暂不足以判断长端利率与风险资产背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.us10y', 'displayInputsBaseline.real10y', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix'],
      limitations: ['利率或风险资产输入不足。']
    });
  }
  const rateStress = (Number.isFinite(us10y) && us10y >= 4.8) || (Number.isFinite(real10y) && real10y >= 2.3);
  const rateWatch = rateStress || (Number.isFinite(us10y) && us10y >= 4.5) || (Number.isFinite(real10y) && real10y >= 2.0);
  const assetOptimism = Number.isFinite(spx) && spx >= 5000 && Number.isFinite(vix) && vix <= 18;
  const score = rateStress && assetOptimism ? 72 : rateWatch && assetOptimism ? 58 : rateWatch ? 44 : assetOptimism ? 34 : 18;
  return buildDivergenceCheck({
    key: 'rates_vs_risk_assets',
    labelZh: '长端利率与风险资产背离',
    category: 'rates_assets',
    score,
    summaryZh: rateWatch && assetOptimism
      ? '长端利率压力与风险资产定价之间存在观察性背离，但这不是崩盘预测。'
      : '暂未形成明确的长端利率与风险资产背离。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', us10y, Number.isFinite(us10y) ? `美国10年期收益率 ${us10y.toFixed(2)}%。` : '美国10年期收益率数据不足。'),
      briefEvidence('displayInputsBaseline', 'real10y', '美国10年期实际利率', real10y, Number.isFinite(real10y) ? `美国10年期实际利率 ${real10y.toFixed(2)}%。` : '实际利率数据不足。'),
      briefEvidence('displayInputsBaseline', 'spx', '标普500', spx, Number.isFinite(spx) ? `标普500 ${spx.toFixed(0)}。` : '标普500数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。')
    ],
    dataUsed: ['displayInputsBaseline.us10y', 'displayInputsBaseline.real10y', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix'],
    limitations: ['只用于解释层观察。', '不改变 executionLock 或 positionGuidance。']
  });
}

function buildLiquidityCreditCheck(risk, displayInputsBaseline) {
  const dxy = Number(displayInputsBaseline.dxy);
  const us10y = Number(displayInputsBaseline.us10y);
  const hyOas = Number(displayInputsBaseline.hyOas);
  const vix = Number(displayInputsBaseline.vix);
  if (![dxy, us10y, hyOas, vix].some(Number.isFinite)) {
    return buildDivergenceCheck({
      key: 'liquidity_vs_credit_transmission',
      labelZh: '流动性与信用传导背离',
      category: 'liquidity_credit',
      score: null,
      summaryZh: '数据不足，暂不足以判断流动性与信用传导背离。',
      evidence: [],
      dataUsed: ['displayInputsBaseline.dxy', 'displayInputsBaseline.us10y', 'displayInputsBaseline.hyOas', 'displayInputsBaseline.vix'],
      limitations: ['流动性或信用输入不足。']
    });
  }
  const liquidityPressure = (Number.isFinite(dxy) && dxy >= 105) || (Number.isFinite(us10y) && us10y >= 4.5);
  const creditStress = (Number.isFinite(hyOas) && hyOas >= 4.5) || (Number.isFinite(vix) && vix >= 25);
  const score = liquidityPressure && creditStress ? 72 : liquidityPressure ? 54 : creditStress ? 50 : 22;
  return buildDivergenceCheck({
    key: 'liquidity_vs_credit_transmission',
    labelZh: '流动性与信用传导背离',
    category: 'liquidity_credit',
    score,
    summaryZh: liquidityPressure && !creditStress
      ? '美元或长端利率压力偏高，但信用利差和波动率尚未明显扩张，说明压力尚未明显扩散到信用/波动率。'
      : liquidityPressure && creditStress
        ? '流动性、信用和波动率压力正在被交叉验证。'
        : '暂未形成明确的流动性与信用传导背离。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', dxy, Number.isFinite(dxy) ? `广义美元指数 ${dxy.toFixed(2)}。` : '广义美元指数数据不足。'),
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', us10y, Number.isFinite(us10y) ? `美国10年期收益率 ${us10y.toFixed(2)}%。` : '美国10年期收益率数据不足。'),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, Number.isFinite(hyOas) ? `高收益债信用利差 ${hyOas.toFixed(2)}%。` : '高收益债信用利差数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。')
    ],
    dataUsed: ['displayInputsBaseline.dxy', 'displayInputsBaseline.us10y', 'displayInputsBaseline.hyOas', 'displayInputsBaseline.vix'],
    limitations: ['只说明压力是否扩散，不生成交易建议。']
  });
}

function buildRiskComplacencyCheck(risk, displayInputsBaseline) {
  const vix = Number(displayInputsBaseline.vix);
  const hyOas = Number(displayInputsBaseline.hyOas);
  const elevatedModules = Object.values(risk.modules || {}).filter((value) => value >= 70).length;
  if (!Number.isFinite(risk.score) || !Number.isFinite(vix) || !Number.isFinite(hyOas)) {
    return buildDivergenceCheck({
      key: 'risk_complacency_watch',
      labelZh: '风险定价低波动观察',
      category: 'risk_complacency',
      score: null,
      summaryZh: '数据不足，暂不足以判断风险定价是否偏平静。',
      evidence: [],
      dataUsed: ['score', 'modules', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
      limitations: ['综合风险或市场定价输入不足。']
    });
  }
  const highRiskBackdrop = risk.score >= 60 || elevatedModules >= 2;
  const calmPricing = vix < 20 && hyOas < 4;
  const score = highRiskBackdrop && calmPricing ? 62 : highRiskBackdrop ? 44 : calmPricing ? 30 : 18;
  return buildDivergenceCheck({
    key: 'risk_complacency_watch',
    labelZh: '风险定价低波动观察',
    category: 'risk_complacency',
    score,
    summaryZh: highRiskBackdrop && calmPricing
      ? '综合风险或多个模块偏高，但波动率和信用利差仍相对平静，存在观察性错配。'
      : '暂不足以判断市场风险定价存在明显错配。',
    evidence: [
      briefEvidence('score', 'score', '综合风险分数', risk.score, `综合风险分数 ${risk.score}。`),
      briefEvidence('modules', 'modules', '底层模块', elevatedModules, `根据现有 modules 字段，高于 70 的底层模块数量为 ${elevatedModules}。`),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, `VIX ${vix.toFixed(2)}。`),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, `高收益债信用利差 ${hyOas.toFixed(2)}%。`)
    ],
    dataUsed: ['score', 'modules', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
    limitations: ['不表示市场一定错误。', '只作为 audit-only / display-only 观察。']
  });
}

function buildConsumerAssetsCheck(risk, displayInputsBaseline, macroDrivers) {
  const consumer = macroDrivers?.consumer || {};
  const sourceStatus = consumer?.sourceStatus?.umichSentiment || 'missing';
  const sentiment = Number(consumer.umichSentiment);
  const threeMonthChange = Number(consumer.threeMonthChange);
  const spx = Number(displayInputsBaseline.spx);
  const vix = Number(displayInputsBaseline.vix);
  const hyOas = Number(displayInputsBaseline.hyOas);
  if (sourceStatus === 'missing' || !Number.isFinite(sentiment) || !Number.isFinite(threeMonthChange)) {
    return buildDivergenceCheck({
      key: 'consumer_vs_asset_pricing',
      labelZh: '消费者体感与风险资产背离',
      category: 'consumer_assets',
      score: null,
      summaryZh: '数据不足，暂不足以判断消费者体感与风险资产定价背离。',
      evidence: [],
      dataUsed: ['macroDrivers.consumer', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
      limitations: ['UMCSENT 为月频慢变量。', '该信号为非实时观察，不应作为实时交易信号。']
    });
  }

  const assetStillStrong = Number.isFinite(spx) && spx >= 5000;
  const pricingCalm = Number.isFinite(vix) && vix <= 18 && Number.isFinite(hyOas) && hyOas < 4;
  const pricingConfirmed = (Number.isFinite(vix) && vix >= 25) || (Number.isFinite(hyOas) && hyOas >= 4.5);
  const strongDeterioration = threeMonthChange <= -8;
  const mildDeterioration = threeMonthChange <= -4;
  const improvingOrStable = threeMonthChange >= -4;
  const score = strongDeterioration && assetStillStrong && pricingCalm
    ? 76
    : strongDeterioration && assetStillStrong
      ? 66
      : mildDeterioration && assetStillStrong
        ? 54
        : mildDeterioration
          ? 40
          : improvingOrStable ? 18 : 24;

  return buildDivergenceCheck({
    key: 'consumer_vs_asset_pricing',
    labelZh: '消费者体感与风险资产背离',
    category: 'consumer_assets',
    score,
    summaryZh: mildDeterioration && assetStillStrong && pricingCalm
      ? '消费者体感与风险资产定价之间存在观察性背离；该信号为月频慢变量，不应作为实时交易信号。'
      : mildDeterioration && pricingConfirmed
        ? '消费者压力已部分被信用或波动率确认，背离程度需要结合信用与波动率继续观察。'
        : improvingOrStable
          ? '消费者信心暂未显示明显走弱，暂未形成消费者体感与风险资产定价背离。'
          : '消费者信心变化与风险资产定价暂不足以形成明确背离。',
    evidence: [
      briefEvidence('macroDrivers.consumer', 'umichSentiment', '密歇根消费者信心', sentiment, `UMCSENT 当前值 ${sentiment.toFixed(1)}。`),
      briefEvidence('macroDrivers.consumer', 'threeMonthChange', '三个月变化', threeMonthChange, `UMCSENT 三个月变化 ${threeMonthChange.toFixed(1)}。`),
      briefEvidence('displayInputsBaseline', 'spx', '标普500', spx, Number.isFinite(spx) ? `标普500 ${spx.toFixed(0)}。` : '标普500数据不足。'),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', vix, Number.isFinite(vix) ? `VIX ${vix.toFixed(2)}。` : 'VIX 数据不足。'),
      briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', hyOas, Number.isFinite(hyOas) ? `高收益债信用利差 ${hyOas.toFixed(2)}%。` : '高收益债信用利差数据不足。')
    ],
    dataUsed: ['macroDrivers.consumer.umichSentiment', 'macroDrivers.consumer.threeMonthChange', 'displayInputsBaseline.spx', 'displayInputsBaseline.vix', 'displayInputsBaseline.hyOas'],
    limitations: ['UMCSENT 为月频慢变量，发布时间存在延迟。', '该信号为非实时解释层观察，不进入 scoring / decision。']
  });
}

export function buildDivergenceLayer({ risk, realtimePayload, displayInputsBaseline, macroDrivers, confidenceScore, generatedAt }) {
  const checks = [
    buildEnergyPricingGapCheck(risk, realtimePayload, displayInputsBaseline),
    buildRatesAssetsCheck(risk, displayInputsBaseline),
    buildLiquidityCreditCheck(risk, displayInputsBaseline),
    buildRiskComplacencyCheck(risk, displayInputsBaseline),
    buildConsumerAssetsCheck(risk, displayInputsBaseline, macroDrivers)
  ];
  const validChecks = checks.filter((check) => check.status !== 'insufficient_data');
  const score = validChecks.length ? clamp(avg(validChecks.map((check) => check.score))) : 0;
  const state = validChecks.length ? divergenceStatusFromScore(score) : 'insufficient_data';
  const primary = validChecks.length
    ? [...validChecks].sort((a, b) => b.score - a.score)[0]
    : null;
  const insufficientCount = checks.length - validChecks.length;
  const confidenceLevel = insufficientCount >= 2 ? 'low' : confidenceScore >= 75 && validChecks.length >= 3 ? 'medium' : 'low';
  return {
    contractVersion: 'v28.0I-3A',
    generatedAt,
    score,
    state,
    stateZh: divergenceStateZh(state),
    summaryZh: validChecks.length
      ? `当前背离层综合状态为${divergenceStateZh(state)}，仅用于实体压力与金融定价的 audit-only 观察。`
      : '当前数据不足以识别明确的实体压力与金融定价背离。',
    primaryDivergence: primary
      ? {
        key: primary.key,
        labelZh: primary.labelZh,
        status: primary.status,
        statusZh: divergenceStateZh(primary.status),
        summaryZh: primary.summaryZh,
        evidence: primary.evidence
      }
      : {
        key: 'no_clear_divergence',
        labelZh: '暂无明确主背离',
        status: 'insufficient_data',
        statusZh: '数据不足',
        summaryZh: '当前数据不足以识别明确的实体压力与金融定价背离。',
        evidence: []
      },
    checks,
    dataGaps: [
      'Platts Dated Brent / 真实 Dated Brent 数据未接入。',
      'Brent term structure 尚未正式接入。',
      'UMCSENT 为月频慢变量，存在发布延迟。'
    ],
    confidence: {
      level: confidenceLevel,
      score: confidenceLevel === 'medium' ? Math.min(70, confidenceScore) : Math.min(45, confidenceScore),
      reasonZh: `第一版背离层只使用现有数据，${insufficientCount} 个 check 数据不足，因此一般不设为高置信。`
    },
    boundaries: {
      displayOnly: true,
      auditOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}
