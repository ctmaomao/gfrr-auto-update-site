export const MODULE_LABELS_CN = Object.freeze({
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行',
});

export function briefEvidence(source, key, labelZh, value, summaryZh) {
  return { source, key, labelZh, value, summaryZh };
}

function classifyDailyBriefConfidence(score, realtimePayload, allMacroMissing) {
  if (allMacroMissing || realtimePayload.cacheOnly || (realtimePayload.criticalMissing ?? 0) > 1 || score < 55) return 'low';
  if (realtimePayload.degradedMode || (realtimePayload.fallbackCount ?? 0) > 0 || score < 80) return 'medium';
  return 'high';
}

function selectDominantRiskChain(risk, displayInputsBaseline) {
  const highModules = Object.entries(risk.modules).filter(([, value]) => value >= 70);
  if (highModules.length >= 3) {
    return {
      key: 'broad_risk_resonance',
      labelZh: '多模块共振风险',
      stageZh: '多模块共振观察',
      summaryZh: `当前有 ${highModules.length} 个底层模块处于高风险区，主判断应优先观察风险是否继续扩散。`,
      evidence: highModules.slice(0, 4).map(([key, value]) => briefEvidence(
        'modules',
        key,
        MODULE_LABELS_CN[key] || key,
        value,
        `${MODULE_LABELS_CN[key] || key} 模块分数为 ${value}。`
      )),
    };
  }
  if (risk.modules.energy >= 65 || risk.modules.inflation >= 65 || risk.brent >= 95 || risk.breakeven >= 2.6 || risk.us10y >= 4.5) {
    return {
      key: 'energy_inflation_rates',
      labelZh: '能源 → 通胀 → 利率压力',
      stageZh: '能源与通胀向利率端传导',
      summaryZh: '能源、通胀或长端利率仍是今日最需要压缩观察的主链条。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'brent', '布伦特', displayInputsBaseline.brent, `布伦特 ${risk.brent.toFixed(1)}，用于观察能源压力。`),
        briefEvidence('displayInputsBaseline', 'breakeven10y', '10年盈亏平衡通胀', displayInputsBaseline.breakeven10y, `10年盈亏平衡通胀 ${risk.breakeven.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
      ],
    };
  }
  if (risk.modules.liquidity >= 65 || risk.modules.banking >= 65 || risk.modules.debt >= 65 || risk.dxy >= 105 || risk.hy >= 4 || risk.vix >= 25) {
    return {
      key: 'liquidity_credit_stress',
      labelZh: '流动性 → 信用 → 风险资产压力',
      stageZh: '融资条件与信用压力观察',
      summaryZh: '美元、信用利差或波动率构成主要观察链条，重点看压力是否向信用与银行风险扩散。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', displayInputsBaseline.dxy, `广义美元指数 ${risk.dxy.toFixed(2)}。`),
        briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', displayInputsBaseline.hyOas, `高收益债信用利差 ${risk.hy.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`),
      ],
    };
  }
  if ((risk.us10y >= 4.4 || risk.real10y >= 2) && risk.spx >= 5000) {
    return {
      key: 'rates_asset_repricing',
      labelZh: '长端利率 → 估值压力 → 资产重新定价',
      stageZh: '利率压力与风险资产定价观察',
      summaryZh: '长端利率压力仍高，但风险资产定价尚未充分同步反映，需要观察是否重新定价。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'real10y', '美国10年期实际利率', displayInputsBaseline.real10y, `美国10年期实际利率 ${risk.real10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'spx', '标普500', displayInputsBaseline.spx, `标普500 ${risk.spx.toFixed(0)}。`),
      ],
    };
  }
  return {
    key: 'baseline_observation',
    labelZh: '基线观察状态',
    stageZh: '等待更清晰主链条',
    summaryZh: '当前没有足够清晰的单一主导链条，暂按基线观察处理。',
    evidence: [
      briefEvidence('score', 'score', '综合风险分数', risk.score, `综合风险分数 ${risk.score}。`),
      briefEvidence('modules', 'topModules', '底层模块', null, '数据不足以确认单一主链条。'),
    ],
  };
}

function selectLargestDivergence(risk, realtimePayload, displayInputsBaseline) {
  const brentValidation = realtimePayload.brentValidation || {};
  const brentAuditText = [
    brentValidation?.promotion?.reason,
    brentValidation?.promotion?.moveStatus,
    realtimePayload?.sourceDetails?.brent?.source,
  ].filter(Boolean).join(' ');
  if (risk.brent >= 95 && /promotion|confirmed|yahoo|tradingeconomics|fred/iu.test(brentAuditText)) {
    return {
      key: 'energy_pricing_gap_watch',
      labelZh: '能源定价背离观察',
      statusZh: '验证层继续观察',
      summaryZh: '布伦特处于偏高区间，且现有 Brent audit / promotion 字段显示能源价格验证层仍需继续观察；本字段不等同于 Platts Dated Brent。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'brent', '布伦特', displayInputsBaseline.brent, `布伦特 ${risk.brent.toFixed(1)}。`),
        briefEvidence('brentValidation', 'promotion', 'Brent 验证层', brentValidation?.promotion?.applied ?? null, 'Brent promotion / confirmation 信息来自现有 realtime payload。'),
      ],
    };
  }
  if ((risk.us10y >= 4.4 || risk.real10y >= 2) && risk.spx >= 5000) {
    return {
      key: 'rates_vs_risk_assets',
      labelZh: '长端利率与风险资产背离',
      statusZh: '观察性背离',
      summaryZh: '长端利率压力与风险资产定价之间存在观察性背离，需要观察风险资产是否补跌或利率压力是否缓和。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'spx', '标普500', displayInputsBaseline.spx, `标普500 ${risk.spx.toFixed(0)}。`),
      ],
    };
  }
  if ((risk.dxy >= 105 || risk.us10y >= 4.4) && risk.hy < 4 && risk.vix < 25) {
    return {
      key: 'liquidity_vs_credit',
      labelZh: '流动性与信用压力背离',
      statusZh: '压力尚未全面扩散',
      summaryZh: '美元或长端利率压力偏高，但信用利差和波动率尚未同步恶化，说明压力暂未完全扩散。',
      evidence: [
        briefEvidence('displayInputsBaseline', 'dxy', '广义美元指数', displayInputsBaseline.dxy, `广义美元指数 ${risk.dxy.toFixed(2)}。`),
        briefEvidence('displayInputsBaseline', 'hyOas', '高收益债信用利差', displayInputsBaseline.hyOas, `高收益债信用利差 ${risk.hy.toFixed(2)}%。`),
        briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`),
      ],
    };
  }
  return {
    key: 'no_clear_divergence',
    labelZh: '暂无明确主背离',
    statusZh: '暂不足以判断',
    summaryZh: '现有数据暂不足以确认单一最大背离，继续观察利率、能源、信用和波动率的同步性。',
    evidence: [
      briefEvidence('displayInputsBaseline', 'us10y', '美国10年期收益率', displayInputsBaseline.us10y, `美国10年期收益率 ${risk.us10y.toFixed(2)}%。`),
      briefEvidence('displayInputsBaseline', 'vix', 'VIX', displayInputsBaseline.vix, `VIX ${risk.vix.toFixed(2)}。`),
    ],
  };
}

export function buildDailyBrief({
  risk,
  realtimePayload,
  macroState,
  phase,
  displayInputsBaseline,
  topRisks,
  activeSignals,
  allMacroMissing,
  confidenceScore,
  generatedAt,
}) {
  const dominantRiskChain = selectDominantRiskChain(risk, displayInputsBaseline);
  const largestDivergence = selectLargestDivergence(risk, realtimePayload, displayInputsBaseline);
  const highModules = Object.entries(risk.modules).filter(([, value]) => value >= 70);
  const dataGaps = [
    '消费者信心与资产价格背离仍缺少稳定月频输入。',
    'Brent 实物价格与期限结构尚未纳入本期数据。',
    '航运与运价压力已纳入本期观察。',
  ];
  if (allMacroMissing) dataGaps.unshift('结构性宏观驱动源当前不可用，相关判断只能低置信观察。');

  return {
    contractVersion: 'v28.0I-1',
    generatedAt,
    macroState: `${macroState} / ${phase}`,
    oneLineConclusion: `今日主线是${dominantRiskChain.labelZh}；最大背离为${largestDivergence.labelZh}。`,
    dominantRiskChain,
    largestDivergence,
    keyTriggers: [
      'Brent 继续上行并获得多源确认。',
      '美国10年期收益率继续上行。',
      'HY OAS 或 VIX 明显扩张。',
      highModules.length >= 2 ? '多个底层模块同时升至高风险区。' : '底层模块风险分数继续上行。',
      '数据健康状态下降。',
    ].slice(0, 5),
    invalidationSignals: [
      'Brent 回落且验证层不再提示压力。',
      '美国10年期收益率回落。',
      'VIX / HY OAS 未扩张且综合风险分数下降。',
      '多个模块趋势回落。',
      '数据健康恢复且风险判断不再获得交叉验证。',
    ],
    dataGaps: dataGaps.slice(0, 4),
    confidence: {
      level: classifyDailyBriefConfidence(confidenceScore, realtimePayload, allMacroMissing),
      score: confidenceScore,
      reasonZh: `基于现有 confidenceScore、数据健康和关键缺失项生成。当前关键缺失 ${realtimePayload.criticalMissing || 0}，fallback ${realtimePayload.fallbackCount || 0}。${activeSignals.length ? `结构信号：${activeSignals.map((signal) => signal.label).join('、')}。` : '结构信号未形成额外交叉验证。'}`,
    },
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
    },
    evidence: topRisks.map((item, index) => briefEvidence('topRisks', `topRisk${index + 1}`, '顶部风险摘要', null, item)).slice(0, 4),
  };
}

export function buildUnavailableDailyBrief(generatedAt) {
  return {
    contractVersion: 'v28.0I-1',
    generatedAt,
    macroState: '数据不足',
    oneLineConclusion: '实时快变量暂不可用，今日总判断层只能保留低置信观察。',
    dominantRiskChain: {
      key: 'baseline_observation',
      labelZh: '基线观察状态',
      stageZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断今日主导风险链。',
      evidence: [],
    },
    largestDivergence: {
      key: 'no_clear_divergence',
      labelZh: '暂无明确主背离',
      statusZh: '数据不足',
      summaryZh: '数据不足，暂不足以判断最大背离。',
      evidence: [],
    },
    keyTriggers: ['数据健康状态恢复后重新生成今日触发器。'],
    invalidationSignals: ['数据健康恢复且风险判断不再获得交叉验证。'],
    dataGaps: ['实时快变量暂不可用。', '消费者信心、Brent 实物价格与期限结构等仍未纳入。'],
    confidence: {
      level: 'low',
      score: 0,
      reasonZh: '实时快变量暂不可用，今日总判断只能作为低置信观察。',
    },
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
    },
  };
}
