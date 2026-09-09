// Pure deterministic interpretation; caller supplies the pipeline timestamp.
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

function confidenceLevelFromScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'low';
  if (value >= 75) return 'high';
  if (value >= 45) return 'medium';
  return 'low';
}

function aiConfidence(value) {
  return DAILY_AI_CONFIDENCE_LEVELS.has(value) ? value : 'low';
}

const DAILY_AI_CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);

function aiFact(key, labelZh, statementZh, sourceFields, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    sourceFields: Array.isArray(sourceFields) ? sourceFields : [],
    confidence: aiConfidence(confidence)
  };
}

function aiInference(key, labelZh, statementZh, basedOn, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    basedOn: Array.isArray(basedOn) ? basedOn : [],
    confidence: aiConfidence(confidence)
  };
}

function aiJudgment(key, labelZh, statementZh, modelSource, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    modelSource,
    confidence: aiConfidence(confidence)
  };
}

function aiScenario(key, labelZh, statementZh, triggerConditions, invalidationConditions, confidence = 'medium') {
  return {
    key,
    labelZh,
    statementZh,
    triggerConditions: Array.isArray(triggerConditions) ? triggerConditions : [],
    invalidationConditions: Array.isArray(invalidationConditions) ? invalidationConditions : [],
    confidence: aiConfidence(confidence)
  };
}

function aiEvidenceLink(layer, field, noteZh) {
  return { layer, field, noteZh };
}

export function buildAiInterpretationLayer(data, generatedAt) {
  const dailyBrief = data?.dailyBrief && typeof data.dailyBrief === 'object' ? data.dailyBrief : null;
  const divergenceLayer = data?.divergenceLayer && typeof data.divergenceLayer === 'object' ? data.divergenceLayer : null;
  const brentPricingLayer = data?.brentPricingLayer && typeof data.brentPricingLayer === 'object' ? data.brentPricingLayer : null;
  const macroDrivers = data?.macroDrivers && typeof data.macroDrivers === 'object' ? data.macroDrivers : {};
  const consumer = macroDrivers.consumer && typeof macroDrivers.consumer === 'object' ? macroDrivers.consumer : null;
  const decisionModel = data?.decisionModel && typeof data.decisionModel === 'object' ? data.decisionModel : null;
  const confidenceScore = Number.isFinite(data?.confidenceScore) ? clamp(data.confidenceScore) : 0;
  const confidenceLevel = confidenceLevelFromScore(confidenceScore);
  const primaryDivergence = divergenceLayer?.primaryDivergence || null;
  const brentSpread = brentPricingLayer?.proxySpread || null;
  const consumerCheck = Array.isArray(divergenceLayer?.checks)
    ? divergenceLayer.checks.find((check) => check?.key === 'consumer_vs_asset_pricing')
    : null;

  const facts = [
    dailyBrief
      ? aiFact('daily_brief_generated', 'Daily Brief 已生成', '当前 Daily Brief 已生成今日主判断，并以解释层形式展示。', ['dailyBrief.contractVersion', 'dailyBrief.oneLineConclusion'], 'high')
      : null,
    divergenceLayer
      ? aiFact('divergence_layer_audit_only', '背离层为审计层', 'divergenceLayer 当前为审计层和展示层，不参与评分或决策。', ['divergenceLayer.boundaries'], 'high')
      : null,
    brentPricingLayer
      ? aiFact('brent_proxy_observation_mode', 'Brent 公开代理观察', 'Brent 公开代理价格层处于公开代理观察模式，不等同于正式实物成交价。', ['brentPricingLayer.mode', 'brentPricingLayer.limitations'], 'high')
      : null,
    consumer
      ? aiFact('consumer_monthly_source', '消费者信心慢变量', '消费者信心数据来自 FRED:UMCSENT，属于 Daily 月频慢变量。', ['macroDrivers.consumer.source', 'macroDrivers.consumer.notes'], 'high')
      : null,
    aiFact('interpretation_layer_rule_based', '规则化解释层', '本层为规则化结构解释，不调用外部 AI API。', ['aiInterpretationLayer.mode', 'aiInterpretationLayer.boundaries'], 'high')
  ].filter(Boolean);

  const consumerChange = Number(consumer?.threeMonthChange);
  const dataInferences = [
    primaryDivergence
      ? aiInference(
        'primary_divergence_observation',
        '主要背离观察',
        `当前主背离来自 divergenceLayer.primaryDivergence：${primaryDivergence.labelZh || '暂不足以判断'}。该结论仍是观察性解释。`,
        ['divergenceLayer.primaryDivergence'],
        'medium'
      )
      : null,
    brentSpread
      ? aiInference(
        'brent_proxy_spread_observation',
        'Brent 代理价差观察',
        ['watch', 'stress'].includes(brentSpread.status)
          ? '公开 Brent 代理价格之间显示观察性价差，需要结合验证源继续跟踪。'
          : '公开 Brent 代理价格之间暂未显示需要升级处理的价差压力。',
        ['brentPricingLayer.proxySpread'],
        brentSpread.status === 'stress' ? 'medium' : 'low'
      )
      : null,
    Number.isFinite(consumerChange)
      ? aiInference(
        'consumer_margin_observation',
        '消费者体感边际观察',
        consumerChange < 0
          ? 'UMCSENT 三个月变化为负，消费者体感可能边际走弱。'
          : 'UMCSENT 三个月变化未转负，消费者体感暂未显示明确边际走弱。',
        ['macroDrivers.consumer.threeMonthChange'],
        'medium'
      )
      : null,
    consumerCheck
      ? aiInference(
        'consumer_asset_divergence_check',
        '消费者与资产背离检查',
        'consumer_vs_asset_pricing 只说明消费者体感与风险资产定价之间是否存在观察性错配。',
        ['divergenceLayer.checks.consumer_vs_asset_pricing'],
        'medium'
      )
      : null
  ].filter(Boolean);

  const modelJudgments = [
    dailyBrief
      ? aiJudgment('daily_brief_model_context', '主判断上下文', 'Daily Brief 提供今日主判断压缩，但不生成交易建议。', 'dailyBrief', 'medium')
      : null,
    aiJudgment('interpretation_layers_do_not_execute', '解释层不进入执行系统', '当前新增解释层均未进入评分、仓位或执行灯系统。', 'combined', 'high'),
    decisionModel
      ? aiJudgment('decision_context_separated', '决策上下文隔离', 'decisionModel 可作为解释证据来源，但 AI 解释层不能改写策略状态或仓位建议。', 'decisionModel', 'high')
      : null,
    divergenceLayer && brentPricingLayer
      ? aiJudgment('cross_layer_observation_priority', '跨层观察优先级', '若数据健康正常且多个背离层同向提示，可提高人工观察优先级，但不能自动改变仓位。', 'combined', 'medium')
      : null
  ].filter(Boolean);

  const scenarioHypotheses = [
    aiScenario(
      'energy_rates_asset_repricing_watch',
      '能源—利率—资产重新定价观察',
      '如果 Brent 公开代理价差扩大，同时 US10Y 上行、VIX 或 HY OAS 扩张，则能源—利率—资产重新定价链条需要升级观察。',
      ['brentPricingLayer.proxySpread.status 进入 watch 或 stress', 'displayInputsBaseline.us10y 上行', 'displayInputsBaseline.vix 或 displayInputsBaseline.hyOas 扩张'],
      ['Brent 公开代理价差收敛', 'US10Y 回落', 'VIX 与 HY OAS 未扩张'],
      'medium'
    ),
    aiScenario(
      'consumer_asset_divergence_deescalation',
      '消费者体感与风险资产背离降级条件',
      '如果消费者信心修复、长端利率回落、信用利差未扩张，则消费者体感与风险资产背离可降级观察。',
      ['macroDrivers.consumer.threeMonthChange 改善', 'displayInputsBaseline.us10y 回落', 'displayInputsBaseline.hyOas 未扩张'],
      ['UMCSENT 继续走弱', 'HY OAS 或 VIX 扩张', '风险资产定价继续与体感数据背离'],
      'medium'
    ),
    aiScenario(
      'data_health_guardrail',
      '数据健康保护条件',
      '如果数据健康下降或关键字段缺失增加，AI 解释层应降低置信度，并以 Daily Brief、背离层和数据健康状态为主。',
      ['dailyRealtimeInput.healthScore 下降', 'realtime criticalMissing 增加', '数据源进入 fallback 或 cache-only'],
      ['Worker Health 正常', 'realtime-data 处于 fresh 或 aging', '关键缺失项回落'],
      'high'
    )
  ];

  const dataGaps = [
    'Platts Dated Brent / 正式 Dated Brent 未接入。',
    'Brent term structure 尚未接入。',
    'shipping / freight stress 已进入 macroDrivers.shippingFreight 审计观察层。',
    '世界秩序外部源质量需单独查看 World Order 模块。'
  ];

  const invalidationSignals = Array.isArray(dailyBrief?.invalidationSignals) && dailyBrief.invalidationSignals.length
    ? dailyBrief.invalidationSignals.slice(0, 5)
    : [
      'Brent 公开代理价差收敛且验证层不再提示压力。',
      '美国10年期收益率回落。',
      'VIX / HY OAS 未扩张且综合风险分数下降。',
      '消费者信心边际修复。',
      '数据健康恢复且背离层不再获得交叉验证。'
    ];

  const evidenceLinks = [
    dailyBrief ? aiEvidenceLink('dailyBrief', 'oneLineConclusion', '今日主判断来自 Daily Brief。') : null,
    divergenceLayer ? aiEvidenceLink('divergenceLayer', 'primaryDivergence', '主要背离来自 divergenceLayer。') : null,
    brentPricingLayer ? aiEvidenceLink('brentPricingLayer', 'proxySpread', 'Brent 代理价差来自 brentPricingLayer。') : null,
    consumer ? aiEvidenceLink('macroDrivers.consumer', 'threeMonthChange', '消费者体感观察来自 FRED UMCSENT 月频数据。') : null,
    decisionModel ? aiEvidenceLink('decisionModel', 'strategyState', '策略状态仅作为上下文证据，不被 AI 解释层改写。') : null
  ].filter(Boolean);

  const missingCoreLayers = [dailyBrief, divergenceLayer, brentPricingLayer].filter((item) => !item).length;
  const finalConfidenceScore = clamp(confidenceScore - missingCoreLayers * 15);
  const finalConfidenceLevel = missingCoreLayers > 0 ? 'low' : confidenceLevel;

  return {
    contractVersion: 'v28.0J-0',
    generatedAt,
    mode: 'rule_based_structured_interpretation',
    summaryZh: missingCoreLayers > 0
      ? '当前数据不足以形成高置信解释，需以 Daily Brief、背离层和数据健康状态为主。本层不调用外部 AI。'
      : '当前 AI 解释层为规则化结构解释，不调用外部 AI。系统将事实、数据推断、模型判断和情景假设分离展示，避免把观察信号误写成确定性结论。',
    facts,
    dataInferences,
    modelJudgments,
    scenarioHypotheses,
    dataGaps,
    invalidationSignals,
    evidenceLinks,
    confidence: {
      level: finalConfidenceLevel,
      score: finalConfidenceScore,
      reasonZh: missingCoreLayers > 0
        ? '部分核心解释层缺失，因此 AI 解释层仅能低置信观察。'
        : '基于 Daily Brief、背离层、Brent 代理审计层、消费者慢变量和数据健康状态生成。'
    },
    boundaries: {
      displayOnly: true,
      interpretationOnly: true,
      generatedByExternalAi: false,
      usesExternalAiApi: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}
