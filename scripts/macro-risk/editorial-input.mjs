import { sanitizeNewsStory } from '../lib/editorial-news-hygiene.mjs';
import { strictOfrDate } from '../daily/ofr-pressure-readout.mjs';
import { buildOfrEditorialSnapshot, hasOfrEditorialMarkers, assessOfrEditorialPublication } from './editorial-ofr-snapshot.mjs';
import { INPUT_SCHEMA, OFR_INPUT_SCHEMA, RISK_MODULES } from './editorial-contract.mjs';

const MODULE_LABELS = Object.freeze({
  energy: '能源',
  geopolitical: '地缘政治',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
});

function compactText(value, maxLength = 420) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function fact(id, category, factZh, asOfDate, sourceClass = 'site_structured') {
  return {
    id: `fact:${id}`,
    category,
    factZh: compactText(factZh, 520),
    asOfDate: asOfDate || null,
    sourceRefIds: [`site:${id}`],
    sourceClass
  };
}

function sourceRefFromFact(item) {
  return {
    id: item.sourceRefIds[0],
    kind: 'site_structured',
    sourceName: 'GFRR 站内结构化数据',
    sourceClass: item.sourceClass,
    asOfDate: item.asOfDate,
    factIds: [item.id]
  };
}

function marketFacts(radarData) {
  const baseline = radarData?.displayInputsBaseline || {};
  const labels = {
    brent: ['布伦特原油', '美元/桶'],
    dxy: ['广义美元指数', ''],
    vix: ['VIX', ''],
    hyOas: ['美国高收益债 OAS', '%'],
    us10y: ['美国 10 年期收益率', '%'],
    real10y: ['美国 10 年期实际利率', '%'],
    breakeven10y: ['美国 10 年盈亏平衡通胀', '%'],
    gold: ['黄金', '美元'],
    spx: ['标普 500', '点']
  };
  return Object.entries(labels).flatMap(([key, [label, unit]]) => Number.isFinite(baseline[key])
    ? [fact(`market:${key}`, 'cross_market', `${label}为 ${baseline[key]}${unit}，用于跨资产压力与确认关系的只读观察。`, baseline.asOf || radarData?.updatedAt)]
    : []);
}

function moduleFacts(radarData) {
  return RISK_MODULES.map((module) => fact(
    `module:${module}`,
    'risk_module',
    `${MODULE_LABELS[module]}风险模块为 ${finite(radarData?.modules?.[module]) ?? '缺失'}/100；该数值是既有规则评分，外部 AI 仅解释、不改写。`,
    radarData?.updatedAt
  ));
}

function dailyBriefFacts(radarData) {
  const daily = radarData?.dailyBrief || {};
  const rows = [
    ['daily:conclusion', 'macro_state', `站内日度结论：${daily.oneLineConclusion || radarData?.summary || '暂无'}；宏观状态为 ${daily.macroState || radarData?.currentMacroRegime || '暂无'}。`],
    ['daily:risk-chain', 'transmission', `当前主风险链条：${daily.dominantRiskChain?.labelZh || '暂无'}。${daily.dominantRiskChain?.summaryZh || ''}`],
    ['daily:divergence', 'cross_market', `当前最大背离：${daily.largestDivergence?.labelZh || '暂无'}。${daily.largestDivergence?.summaryZh || ''}`],
    ['daily:triggers', 'watch', `既有触发条件：${(daily.keyTriggers || []).slice(0, 4).join('；') || '暂无'}。`],
    ['daily:invalidations', 'watch', `既有失效条件：${(daily.invalidationSignals || []).slice(0, 4).join('；') || '暂无'}。`]
  ];
  return rows.map(([id, category, text]) => fact(id, category, text, daily.generatedAt || radarData?.updatedAt));
}

function macroDriverFacts(radarData) {
  const drivers = radarData?.macroDrivers || {};
  const rows = [
    ['macro:liquidity', 'liquidity', `流动性：ON RRP ${finite(drivers.fedLiquidity?.onRrp) ?? '缺失'}，准备金 ${finite(drivers.fedLiquidity?.reserveBalances) ?? '缺失'}，NFCI ${finite(drivers.credit?.nfci) ?? '缺失'}，状态 ${drivers.fedLiquidity?.regime || '缺失'}。`],
    ['macro:policy', 'rates', `政策预期：联邦基金目标中值 ${finite(drivers.policyExpectations?.targetMid) ?? '缺失'}%，有效利率 ${finite(drivers.policyExpectations?.effectiveFedFundsRate) ?? '缺失'}%，前端期货隐含利率 ${finite(drivers.policyExpectations?.fedFundsFutureImpliedRate) ?? '缺失'}%。`],
    ['macro:credit', 'credit', `信用：HY OAS ${finite(drivers.credit?.hyOas) ?? '缺失'}%，IG OAS ${finite(drivers.credit?.igOas) ?? '缺失'}%，信用状态 ${drivers.credit?.regime || '缺失'}。`],
    ['macro:employment', 'growth', `就业：初请 ${finite(drivers.employment?.initialClaims) ?? '缺失'}，续请 ${finite(drivers.employment?.continuingClaims) ?? '缺失'}，U6 ${finite(drivers.employment?.u6Rate) ?? '缺失'}%，平均时薪同比 ${finite(drivers.employment?.averageHourlyEarningsYoY) ?? '缺失'}。`],
    ['macro:consumer', 'growth', `消费与制造：密歇根消费者信心 ${finite(drivers.consumer?.umichSentiment) ?? '缺失'}，ISM 制造业 PMI ${finite(drivers.consumer?.ismManufacturingPmi) ?? '缺失'}，CARTS 实际零售同比 ${finite(drivers.consumerRetail?.cartsRealYoY) ?? '缺失'}。`],
    ['macro:freight', 'energy', `运输：BDTI ${finite(drivers.shippingFreight?.balticDirtyTankerIndex) ?? '缺失'}，BCTI ${finite(drivers.shippingFreight?.balticCleanTankerIndex) ?? '缺失'}，BDI ${finite(drivers.shippingFreight?.balticDryIndex) ?? '缺失'}，综合状态 ${drivers.shippingFreight?.freightStressRegime || '缺失'}。`],
    ['macro:cre', 'credit', `商业地产：CRE 拖欠率 ${finite(drivers.commercialRealEstate?.creDelinquencyRate) ?? '缺失'}%，核销率 ${finite(drivers.commercialRealEstate?.creChargeOffRate) ?? '缺失'}%，CMBS ETF ${finite(drivers.commercialRealEstate?.cmbsEtfPrice) ?? '缺失'}。`],
    ['macro:private-credit', 'credit', `私募信贷公开代理：BDC ETF ${finite(drivers.privateCreditProxy?.bdcEtfPrice) ?? '缺失'}，PBDC ETF ${finite(drivers.privateCreditProxy?.pbdcEtfPrice) ?? '缺失'}，高级贷款 ETF ${finite(drivers.privateCreditProxy?.seniorLoanEtfPrice) ?? '缺失'}。`]
  ];
  return rows.map(([id, category, text]) => fact(id, category, text, radarData?.updatedAt));
}

function contextFacts({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews }) {
  const history = (Array.isArray(radarHistory) ? radarHistory : []).slice(-14);
  const scores = history.map((item) => item.score).filter(Number.isFinite);
  const historyText = scores.length > 0
    ? `最近 ${scores.length} 个日度样本的综合分数区间为 ${Math.min(...scores)}–${Math.max(...scores)}，最新为 ${scores.at(-1)}；这是同期压力轨迹，不是危机预测。`
    : '近期历史分数样本缺失。';
  const primaryAsset = marketPricing?.assets?.[marketPricing?.primaryAsset];
  const latestMarket = primaryAsset?.records?.at?.(-1);
  return [
    fact('context:world-order', 'geopolitical', `World Order Stress 为 ${finite(worldOrder?.score) ?? '缺失'}/100，状态 ${worldOrder?.labelZh || worldOrder?.state || '缺失'}，新鲜度 ${worldOrder?.freshness || '缺失'}；该层不进入六大模块评分。`, worldOrder?.updatedAt),
    fact('context:market-pricing', 'valuation', `${primaryAsset?.labelZh || 'QQQ'}最新收盘 ${finite(latestMarket?.close) ?? '缺失'}，60 期均线 ${finite(latestMarket?.ma60) ?? '缺失'}，Z 分数 ${finite(latestMarket?.zScore) ?? '缺失'}；仅为定价环境代理。`, latestMarket?.date || marketPricing?.generatedAt),
    fact('context:history', 'history', historyText, history.at(-1)?.date || radarData?.updatedAt),
    fact('context:odp', 'energy', `石油方向压力的物理链判读为 ${oilDirectional?.interpretation?.finalBias || oilDirectional?.finalBias || '缺失'}，置信度 ${oilDirectional?.interpretation?.confidence || '缺失'}，数据充分性 ${oilDirectional?.interpretation?.dataSufficiency || '缺失'}；只作展示确认。`, oilDirectional?.builtAt),
    fact('context:oil-news', 'energy', `石油新闻事件观察为 ${oilNews?.displayStatusZh || oilNews?.signalState || '缺失'}，状态 ${oilNews?.status || '缺失'}，唯一文章数 ${finite(oilNews?.aggregate?.uniqueArticleCount) ?? '缺失'}；新闻观察不等于供应中断确认。`, oilNews?.generatedAt)
  ];
}

function compactNews(discovery) {
  const perTopic = new Map();
  return (discovery?.stories || []).filter((story) => {
    const count = perTopic.get(story.topic) || 0;
    if (count >= 2) return false;
    perTopic.set(story.topic, count + 1);
    return true;
  }).slice(0, 12).map(sanitizeNewsStory).map((story) => ({ ...story, snippet: compactText(story.snippet, 280) }));
}

export function buildEditorialInput({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews, discovery, generatedAt = new Date().toISOString(), fixtureOnly = false }) {
  if (hasOfrEditorialMarkers(radarData)) return buildOfrInput({ radarData, discovery, generatedAt, fixtureOnly });
  if (!radarData?.updatedAt || !Number.isFinite(radarData?.score)) throw new Error('radar-data must contain updatedAt and score');
  const newsStories = compactNews(discovery);
  const newsContext = { ...discovery, stories: newsStories };
  const facts = [
    fact('score', 'main_score', `GFRR 综合风险分数为 ${radarData.score}/100，1 日变化 ${finite(radarData.scoreChange1d) ?? '缺失'}，7 日变化 ${finite(radarData.scoreChange7d) ?? '缺失'}，30 日变化 ${finite(radarData.scoreChange30d) ?? '缺失'}；分数识别当前压力，不代表未来危机概率。`, radarData.updatedAt),
    ...moduleFacts(radarData),
    ...marketFacts(radarData),
    ...dailyBriefFacts(radarData),
    ...macroDriverFacts(radarData),
    ...contextFacts({ radarData, worldOrder, marketPricing, radarHistory, oilDirectional, oilNews })
  ].filter((item) => item.factZh).slice(0, 60);
  const newsSourceRefs = newsStories.map((story) => ({
    id: story.id,
    kind: 'news',
    sourceName: story.domain,
    sourceClass: story.evidenceStatus,
    title: story.title,
    url: story.url,
    domain: story.domain,
    publishedAt: story.publishedAt,
    topic: story.topic,
    providers: story.providers,
    supportingDomains: story.supportingDomains
  }));
  return {
    schemaVersion: INPUT_SCHEMA,
    generatedAt,
    sourceDataUpdatedAt: radarData.updatedAt,
    inputMode: fixtureOnly ? 'fixture_compact_evidence_pack' : 'live_site_compact_evidence_pack',
    fixtureOnly,
    riskSnapshot: {
      score: radarData.score,
      scoreChange1d: finite(radarData.scoreChange1d),
      scoreChange7d: finite(radarData.scoreChange7d),
      scoreChange30d: finite(radarData.scoreChange30d),
      trendLabel: radarData.trendLabel || null,
      macroRegime: radarData.currentMacroRegime || radarData.dailyBrief?.macroState || null,
      crisisPhase: radarData.currentCrisisPhase || null,
      transitionRisk: radarData.transitionRisk || null,
      confidenceScore: finite(radarData.confidenceScore),
      confidenceLevel: radarData.confidenceLevel || null,
      topRisks: (radarData.topRisks || []).slice(0, 6)
    },
    moduleSnapshot: RISK_MODULES.map((module) => ({ module, labelZh: MODULE_LABELS[module], score: finite(radarData.modules?.[module]) })),
    structuredFacts: facts,
    newsContext,
    historicalContext: {
      recentScores: (Array.isArray(radarHistory) ? radarHistory : []).slice(-14).map((item) => ({ date: item.date, score: item.score })),
      interpretationBoundaryZh: '历史轨迹只用于比较当前压力位置，不构成提前预警、危机概率或时间预测。'
    },
    sourceRefs: [...facts.map(sourceRefFromFact), ...newsSourceRefs],
    dataGaps: [...(radarData.dailyBrief?.dataGaps || []), ...(discovery?.dataGaps || [])].filter(Boolean).slice(0, 12),
    boundaries: {
      fixtureOnly,
      siteStructuredDataOnly: true,
      newsDiscoveryContextOnly: true,
      noSecrets: true,
      noRawArticleBody: true,
      readOnlyContext: true,
      excludesExistingAiLayers: true,
      excludesDecisionExecutionPositionFields: true,
      affectsGfrrScoring: false,
      affectsRiskModules: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function buildOfrInput({ radarData, discovery, generatedAt, fixtureOnly }) {
  if (!radarData?.updatedAt || !Number.isFinite(Date.parse(radarData.updatedAt))) throw new Error('radar-data updatedAt missing');
  const pressureSnapshot = buildOfrEditorialSnapshot(radarData, generatedAt);
  const p = pressureSnapshot;
  const freshness = assessOfrEditorialPublication(radarData, generatedAt).freshness;
  const facts = [
    fact('ofr:pressure', 'main_pressure', `OFR 金融压力原值为 ${p.index.value ?? '缺失'}，实际观察日 ${p.index.observedDate ?? '缺失'}；来源状态 ${p.status}，观察日距输入生成日 ${freshness.ageHours === null ? '缺失' : freshness.ageHours / 24} 天，当前主判读资格 ${freshness.currentEligibleAtCheck ? '有效' : '不可用'}。原值不是0–100风险评分。`, p.index.observedDate),
    fact('ofr:weekly-change', 'main_pressure', `OFR 约一周变化 ${p.weeklyChange.value ?? '缺失'}，实际端点 ${p.weeklyChange.fromDate ?? '缺失'} 至 ${p.weeklyChange.toDate ?? '缺失'}。`, p.index.observedDate),
    fact('ofr:percentile', 'main_pressure', `OFR 严格过去十年历史百分位 ${p.percentile.value ?? '缺失'}，有效历史条数 ${p.percentile.historyRows}；百分位为历史相对位置，不是风险评分或危机概率。`, p.index.observedDate),

  ];
  // Only numeric macro observations are selected. Legacy qualitative regime,
  // dailyBrief, module scores, allocations and old radar history never cross.
  const metrics = [
    ['credit', 'igOas', '美国投资级债 OAS', '%'], ['credit', 'nfci', 'NFCI', '（指数）'],
    ['fedLiquidity', 'effectiveFedFundsRate', '有效联邦基金利率', '%'], ['fedLiquidity', 'sofr', 'SOFR', '%']
  ];
  for (const [group, key, label, unit] of metrics) {
    const source = radarData.macroDrivers?.[group];
    const value = source?.[key];
    const observed = source?.sourceObservedAt?.[key];
    if (!Number.isFinite(value) || !strictOfrDate(observed) || observed > generatedAt.slice(0, 10)) continue;
    const sourceStatus = ['live', 'cached', 'stale', 'missing', 'unavailable'].includes(source?.sourceStatus?.[key]) ? source.sourceStatus[key] : 'unknown';
    facts.push({ ...fact(`macro:${group}:${key}`, 'independent_context', `${label}为 ${value}${unit}；实际观察日 ${observed}，来源状态 ${sourceStatus}。独立结构观察，不是 OFR 分解。`, observed), sourceStatus });
  }
  const stories = compactNews(discovery);
  const sourceRefs = facts.map(item => ({ ...sourceRefFromFact(item),
    sourcePath: item.id.startsWith('fact:ofr:') ? 'radarData.mainPressureReadout' : item.id.startsWith('fact:market:') ? `radarData.displayInputsBaseline.${item.id.split(':').at(-1)}` : `radarData.macroDrivers.${item.id.split(':').slice(2).join('.')}`,
    ...(item.id.startsWith('fact:ofr:') ? { sourceName: p.source.provider, url: p.source.sourceUrl } : { interpretationBoundaryZh: '独立观察，不是 OFR 分解。' })
  }));
  sourceRefs.push(...stories.map(story => ({ id: story.id, kind: 'news', sourceName: story.domain, sourceClass: story.evidenceStatus, title: story.title, url: story.url, domain: story.domain, publishedAt: story.publishedAt, topic: story.topic, providers: story.providers, supportingDomains: story.supportingDomains })));
  return {
    schemaVersion: OFR_INPUT_SCHEMA, generatedAt, sourceDataUpdatedAt: radarData.updatedAt,
    inputMode: fixtureOnly ? 'fixture_compact_evidence_pack' : 'live_site_compact_evidence_pack', fixtureOnly,
    pressureSnapshot, pressureFreshness: freshness, structuredFacts: facts,
    historicalContext: { recentObservations: p.history, interpretationBoundaryZh: '仅同口径 OFR 历史，不拼接旧分，不构成危机概率或投资建议。' },
    newsContext: { ...discovery, stories }, sourceRefs,
    dataGaps: [...(freshness.currentEligibleAtCheck ? [] : ['OFR 当前主判读不可用；保留原观察日期与缺失/缓存/过期状态，不回退旧分。']), ...(p.percentile.value === null ? ['OFR 辅助百分位缺失。'] : []), ...(p.weeklyChange.value === null ? ['OFR 周变化缺失。'] : []), ...(discovery?.dataGaps || [])].slice(0, 12),
    boundaries: { fixtureOnly, siteStructuredDataOnly: true, newsDiscoveryContextOnly: true, noSecrets: true, noRawArticleBody: true, readOnlyContext: true, excludesExistingAiLayers: true, excludesDecisionExecutionPositionFields: true, affectsGfrrScoring: false, affectsRiskModules: false, affectsDecisionModel: false, affectsExecutionLock: false, affectsPositionGuidance: false }
  };
}
