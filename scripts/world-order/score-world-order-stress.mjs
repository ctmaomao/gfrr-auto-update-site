import { classifyWorldOrderState } from './classify-world-order-state.mjs';
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS_ZH,
  WORLD_ORDER_WARNING,
  clampConfidence,
  clampScore,
  sanitizeEvidence
} from './normalize-world-order-inputs.mjs';

function sourceScore(sourceKey, source) {
  const summary = source?.summary || {};
  if (sourceKey === 'gdelt') {
    if (source?.status === 'error') return 0;
    const statusMultiplier = source?.status === 'stale'
      ? 0.35
      : source?.status === 'partial'
        ? 0.75
        : 1;
    return clampScore(statusMultiplier * (
      (summary.conflictEvents || 0) * 1.4 +
      (summary.sanctionsEvents || 0) * 1.2 +
      (summary.blockadeOrChokepointEvents || 0) * 1.8 +
      (summary.regionsCovered?.length || 0) * 5
    ));
  }
  if (sourceKey === 'ofac') {
    return clampScore(
      (summary.recentActionsCount || 0) * 1.8 +
      (summary.listUpdatesCount || 0) * 4 +
      (summary.enforcementActionsCount || 0) * 3 +
      (summary.highRiskPrograms?.length || 0) * 5
    );
  }
  if (sourceKey === 'sipri') {
    if (source?.status === 'error') return 0;
    if (source?.status !== 'ok') return 10;
    const fiveYearGrowth = Number(summary.globalFiveYearGrowthPct);
    const tenYearGrowth = Number(summary.globalTenYearGrowthPct);
    const risingMajorPowers = Number(summary.risingMajorPowers);
    const risingRegions = Number(summary.risingRegions);
    const shareTrendBoost = summary.militarySpendShareOfGDPTrend === 'rising' ? 12 : 0;
    return clampScore(
      (Number.isFinite(fiveYearGrowth) ? Math.max(0, fiveYearGrowth) * 1.8 : 0) +
      (Number.isFinite(tenYearGrowth) ? Math.max(0, tenYearGrowth) * 0.8 : 0) +
      (Number.isFinite(risingMajorPowers) ? risingMajorPowers * 8 : 0) +
      (Number.isFinite(risingRegions) ? risingRegions * 5 : 0) +
      shareTrendBoost
    );
  }
  if (sourceKey === 'acled') {
    if (source?.status === 'error') return 0;
    if (source?.status === 'manual_required') return 10;
    if (source?.status === 'partial') return 30;  // reserved for PR β
    // status === 'ok'
    const s = source.summary || {};
    const deltaScore = Number.isFinite(s.eventsDelta4Vs12)
      ? Math.max(0, Math.min(40, s.eventsDelta4Vs12 * 100))
      : 0;
    const fatalitiesScore = Number.isFinite(s.fatalitiesLast4Weeks)
      ? Math.min(20, Math.log10(Math.max(1, s.fatalitiesLast4Weeks)) * 4)
      : 0;
    const civilianTargetingScore = Number.isFinite(s.civilianTargetingShareLast4Weeks)
      ? s.civilianTargetingShareLast4Weeks * 30
      : 0;
    return clampScore(deltaScore + fatalitiesScore + civilianTargetingScore);
  }
  return 0;
}

function trendFromScore(score) {
  if (score >= 60) return 'rising';
  if (score <= 20) return 'stable';
  return 'watching';
}

function buildEvidence(labelZh, source, summary, value, confidence) {
  return {
    labelZh,
    source,
    summary,
    value,
    direction: value >= 40 ? 'up' : 'neutral',
    confidence
  };
}

function buildSipriEvidence(source, sipriScore) {
  const summary = source?.summary || {};
  if (source?.status === 'ok') {
    const rising = summary.globalMilitarySpendTrend === 'rising' || summary.majorPowerMilitarySpendTrend === 'rising';
    return {
      labelZh: 'SIPRI 军费慢变量显示全球或主要大国军费趋势上升',
      source: 'sipri',
      summary: `SIPRI 手动标准化数据更新至 ${summary.updatedYear}，全球五年军费变化 ${summary.globalFiveYearGrowthPct ?? '--'}%，主要大国趋势 ${summary.majorPowerMilitarySpendTrend || 'unknown'}。`,
      value: sipriScore,
      direction: rising ? 'risk_up' : 'neutral',
      confidence: summary.confidence ?? source.confidence ?? 0.5
    };
  }
  if (source?.status === 'error') {
    return {
      labelZh: 'SIPRI 军费慢变量数据源异常',
      source: 'sipri',
      summary: 'SIPRI normalized 数据校验或解析异常，本轮不参与军费慢变量评分。',
      value: 0,
      direction: 'neutral',
      confidence: 0.05
    };
  }
  return {
    labelZh: '军费慢变量与地缘风险组合',
    source: 'SIPRI/GDELT/modules',
    summary: 'SIPRI 慢变量尚未导入，当前仅以 GDELT 与现有地缘模块低置信代理，不把 manual_required 当作真实军费上升证据。',
    value: sipriScore,
    direction: 'neutral',
    confidence: 0.25
  };
}

function buildAcledEvidence(source, acledScore) {
  const summary = source?.summary || {};
  if (source?.status === 'ok') {
    const delta = Number.isFinite(summary.eventsDelta4Vs12)
      ? `${Math.round(summary.eventsDelta4Vs12 * 100)}%`
      : '不可比';
    return {
      labelZh: 'ACLED 周度冲突事件显示和平红利退潮压力',
      source: 'acled',
      summary: `ACLED 手动周度聚合更新至 ${summary.latestWeek}，覆盖 ${summary.regionsTracked} 个区域，近 4 周事件相对 12 周均值变化 ${delta}。`,
      value: acledScore,
      direction: acledScore >= 30 ? 'risk_up' : 'neutral',
      confidence: source.confidence ?? 0.85
    };
  }
  if (source?.status === 'manual_required') {
    return {
      labelZh: 'ACLED 周度冲突事件待手动导入',
      source: 'acled',
      summary: 'ACLED Open-license xlsx 尚未由 operator 手动下载并 sanitize；当前只给低权重占位，不把缺失数据当作真实冲突上升证据。',
      value: acledScore,
      direction: 'neutral',
      confidence: 0.15
    };
  }
  if (source?.status === 'error') {
    return {
      labelZh: 'ACLED 周度冲突事件数据源异常',
      source: 'acled',
      summary: 'ACLED weekly normalized JSON 解析或校验异常，本轮不参与和平红利退潮评分。',
      value: 0,
      direction: 'neutral',
      confidence: 0.05
    };
  }
  if (source?.status === 'partial') {
    return {
      labelZh: 'ACLED 周度/月度数据部分可用',
      source: 'acled',
      summary: 'ACLED partial 状态预留给 M-63b：weekly 或 monthly 仅一侧可用时进入低置信观察。',
      value: acledScore,
      direction: 'neutral',
      confidence: source.confidence ?? 0.3
    };
  }
  return {
    labelZh: 'ACLED 周度冲突事件未配置',
    source: 'acled',
    summary: 'ACLED manual-xlsx importer 尚未产生可用数据，当前不作为真实事件层证据。',
    value: acledScore,
    direction: 'neutral',
    confidence: 0.1
  };
}

function existingRiskModuleScore(dataPayload) {
  const modules = dataPayload?.modules || {};
  const keys = ['geopolitical', 'energy', 'inflation', 'liquidity', 'debt', 'banking'];
  const values = keys.map((key) => Number(modules[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  const weighted = (
    (Number(modules.geopolitical) || 0) * 0.28 +
    (Number(modules.energy) || 0) * 0.2 +
    (Number(modules.inflation) || 0) * 0.14 +
    (Number(modules.liquidity) || 0) * 0.16 +
    (Number(modules.debt) || 0) * 0.12 +
    (Number(modules.banking) || 0) * 0.1
  );
  return clampScore(weighted);
}

function confidenceFromSources(externalSources, marketConfirmation) {
  const sourceConfidences = Object.values(externalSources).map((source) => Number(source.confidence) || 0);
  const base = sourceConfidences.length
    ? sourceConfidences.reduce((sum, value) => sum + value, 0) / sourceConfidences.length
    : 0;
  const freshnessBonus = Object.values(externalSources).filter((source) => ['ok', 'partial'].includes(source.status)).length * 0.06;
  const marketBonus = (marketConfirmation.confidence || 0) * 0.2;
  const missingPenalty = Object.values(externalSources).filter((source) => ['manual_required', 'not_configured', 'error'].includes(source.status)).length * 0.08;
  return clampConfidence(base + freshnessBonus + marketBonus - missingPenalty);
}

export function scoreWorldOrderStress({ externalSources, marketConfirmation, dataPayload, rules }) {
  const gdeltScore = sourceScore('gdelt', externalSources.gdelt);
  const ofacScore = sourceScore('ofac', externalSources.ofac);
  const sipriScore = sourceScore('sipri', externalSources.sipri);
  const acledScore = sourceScore('acled', externalSources.acled);
  const moduleScore = existingRiskModuleScore(dataPayload);

  const dimensions = {
    peaceDividendRetreat: {
      score: clampScore((sipriScore * 0.35) + (gdeltScore * 0.20) + (acledScore * 0.25) + (moduleScore * 0.20)),
      labelZh: DIMENSION_LABELS_ZH.peaceDividendRetreat,
      trend: 'watching',
      evidence: sanitizeEvidence([
        buildSipriEvidence(externalSources.sipri, sipriScore),
        buildAcledEvidence(externalSources.acled, acledScore)
      ])
    },
    blocFormation: {
      score: clampScore((gdeltScore * 0.45) + (ofacScore * 0.35) + (moduleScore * 0.2)),
      labelZh: DIMENSION_LABELS_ZH.blocFormation,
      trend: 'watching',
      evidence: sanitizeEvidence([
        buildEvidence('阵营化与关键通道压力', 'GDELT/OFAC', '由关键区域报道、制裁清单更新与高风险项目共同估算。', Math.max(gdeltScore, ofacScore), 0.55)
      ])
    },
    multiTheaterConflict: {
      score: clampScore((gdeltScore * 0.7) + (moduleScore * 0.3)),
      labelZh: DIMENSION_LABELS_ZH.multiTheaterConflict,
      trend: 'watching',
      evidence: sanitizeEvidence([
        buildEvidence('多区域冲突报道密度', 'GDELT/modules', '由 GDELT 与既有地缘模块估算；ACLED 仅进入和平红利退潮维度。', gdeltScore, 0.55)
      ])
    },
    economicWeaponization: {
      score: clampScore((ofacScore * 0.62) + (gdeltScore * 0.25) + (moduleScore * 0.13)),
      labelZh: DIMENSION_LABELS_ZH.economicWeaponization,
      trend: 'watching',
      evidence: sanitizeEvidence([
        buildEvidence('制裁与金融限制活动', 'OFAC/GDELT', '由 OFAC 近期行动与 GDELT 制裁主题共同估算。', ofacScore, 0.6)
      ])
    },
    capitalControlRisk: {
      score: clampScore((ofacScore * 0.35) + (gdeltScore * 0.25) + (moduleScore * 0.4)),
      labelZh: DIMENSION_LABELS_ZH.capitalControlRisk,
      trend: 'watching',
      evidence: sanitizeEvidence([
        buildEvidence('金融限制与流动性压力组合', 'OFAC/GDELT/modules', '用于识别资本管制、金融抑制或跨境限制风险的代理信号。', Math.max(ofacScore, moduleScore), 0.5)
      ])
    }
  };

  for (const key of DIMENSION_KEYS) {
    dimensions[key].trend = trendFromScore(dimensions[key].score);
  }

  dimensions.marketConfirmation = {
    score: clampScore(marketConfirmation.score),
    labelZh: DIMENSION_LABELS_ZH.marketConfirmation,
    state: marketConfirmation.state,
    evidence: sanitizeEvidence(marketConfirmation.evidence, 'market')
  };

  const weights = rules.dimensionWeights || {};
  const externalStructuralScore = clampScore(DIMENSION_KEYS.reduce(
    (sum, key) => sum + dimensions[key].score * (Number(weights[key]) || 0.2),
    0
  ));
  const scoreWeights = rules.scoreWeights || {};
  const finalScore = clampScore(
    externalStructuralScore * (Number(scoreWeights.externalStructural) || 0.6) +
    dimensions.marketConfirmation.score * (Number(scoreWeights.marketConfirmation) || 0.3) +
    moduleScore * (Number(scoreWeights.existingRiskModules) || 0.1)
  );
  const classification = classifyWorldOrderState(finalScore);
  const confidence = confidenceFromSources(externalSources, marketConfirmation);

  const dominantDrivers = DIMENSION_KEYS
    .map((key) => ({ key, labelZh: dimensions[key].labelZh, score: dimensions[key].score }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score >= 35)
    .slice(0, 3);

  const decisionModifier = {
    enabled: true,
    riskBias: 'neutral',
    maxStateBoost: 0,
    appliesWhen: '仅作为结构性解释层，不直接修改现有 decisionModel。'
  };
  if (finalScore >= 61 && finalScore <= 75 && ['partial_confirmed', 'high_confirmed'].includes(marketConfirmation.state)) {
    decisionModifier.riskBias = 'upward';
    decisionModifier.maxStateBoost = 1;
    decisionModifier.appliesWhen = '结构性压力进入多战区压力期，且市场至少部分确认时，未来可作为状态上修参考。';
  }
  if (finalScore > 75 && marketConfirmation.state === 'high_confirmed') {
    decisionModifier.riskBias = 'upward';
    decisionModifier.maxStateBoost = 1;
    decisionModifier.appliesWhen = '结构性压力进入战争经济压力期且市场高度确认时，未来可提示组合压力测试。';
  }

  return {
    score: finalScore,
    state: classification.state,
    labelZh: classification.labelZh,
    confidence,
    dimensions,
    dominantDrivers,
    systemInterpretationZh: dominantDrivers.length
      ? `世界秩序压力主要来自：${dominantDrivers.map((item) => item.labelZh).join('、')}。该层仅用于结构性风险识别。`
      : '世界秩序压力处于低位或证据不足，当前仅作为观察层保留。',
    decisionModifier,
    warnings: [WORLD_ORDER_WARNING]
  };
}
