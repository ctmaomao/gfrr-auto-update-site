import { INPUT_SCHEMA } from './weekly-editorial-contract.mjs';

const STATUS_ZH = Object.freeze({ red: '红灯', yellow: '黄灯', green: '绿灯' });
const MAX_INPUT_NEWS_PER_TOPIC = 2;
const MAX_INPUT_NEWS_STORIES = 12;

function compactText(value, maxLength = 360) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function compactList(values, maxItems, maxLength = 360) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compactText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildStructuredFacts(indicators) {
  return indicators.slice(0, 27).map((indicator) => ({
    id: `fact:${indicator.id}`,
    indicatorId: indicator.id,
    scoreRole: indicator.score_role,
    axis: indicator.axis,
    category: indicator.category,
    status: indicator.status,
    asOfDate: indicator.as_of || null,
    stale: indicator.stale === true,
    factZh: compactText(`${indicator.name_zh}: ${indicator.value_display}（${STATUS_ZH[indicator.status] || indicator.status}）。${indicator.note}`, 340),
    sourceRefIds: [`indicator:${indicator.id}`]
  }));
}

function buildIndicatorSourceRefs(indicators) {
  return indicators.slice(0, 27).map((indicator) => ({
    id: `indicator:${indicator.id}`,
    kind: 'indicator',
    sourceName: compactText(indicator.source_name, 160) || 'Bubble Watch structured indicator',
    sourceClass: 'site_structured',
    indicatorIds: [indicator.id],
    asOfDate: indicator.as_of || null,
    stale: indicator.stale === true,
    provenanceMode: indicator.provenance?.mode || null
  }));
}

function buildNewsSourceRefs(discovery) {
  return (Array.isArray(discovery?.stories) ? discovery.stories : []).map((story) => ({
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
}

function buildCompactNewsContext(discovery) {
  const topicCounts = new Map();
  const stories = (Array.isArray(discovery?.stories) ? discovery.stories : [])
    .filter((story) => {
      const count = topicCounts.get(story.topic) || 0;
      if (count >= MAX_INPUT_NEWS_PER_TOPIC) return false;
      topicCounts.set(story.topic, count + 1);
      return true;
    })
    .slice(0, MAX_INPUT_NEWS_STORIES)
    .map((story) => ({
      ...story,
      snippet: compactText(story.snippet, 180)
    }));
  const sourceStatus = Object.fromEntries(Object.entries(discovery?.sourceStatus || {}).map(([provider, status]) => [provider, {
    status: status?.status || 'unavailable',
    successCount: Number.isInteger(status?.successCount) ? status.successCount : 0,
    failureCount: Number.isInteger(status?.failureCount) ? status.failureCount : 0
  }]));
  return {
    ...discovery,
    sourceStatus,
    topics: (Array.isArray(discovery?.topics) ? discovery.topics : []).map((topic) => ({
      ...topic,
      storyCount: stories.filter((story) => story.topic === topic.id).length
    })),
    stories
  };
}

function buildRadarContext(radar) {
  if (!radar || typeof radar !== 'object') return null;
  return {
    sourceRefId: 'context:radar',
    releaseVersion: radar.releaseVersion || null,
    updatedAt: radar.updatedAt || null,
    score: Number.isFinite(radar.score) ? radar.score : null,
    scoreChange7d: Number.isFinite(radar.scoreChange7d) ? radar.scoreChange7d : null,
    currentMacroRegime: compactText(radar.currentMacroRegime, 100),
    confidenceLevel: compactText(radar.confidenceLevel, 80),
    topRisksZh: compactList(radar.topRisks, 4, 220),
    boundary: 'context_only_no_bubble_watch_score_impact'
  };
}

function buildOilNewsContext(oilNews) {
  if (!oilNews || typeof oilNews !== 'object') return null;
  const aggregate = oilNews.aggregate && typeof oilNews.aggregate === 'object' ? oilNews.aggregate : {};
  return {
    sourceRefId: 'context:oil-news',
    schemaVersion: oilNews.schemaVersion || null,
    generatedAt: oilNews.generatedAt || null,
    status: oilNews.status || null,
    signalState: oilNews.signalState || null,
    displayStatusZh: compactText(oilNews.displayStatusZh, 100),
    aggregate: {
      uniqueArticleCount: Number.isFinite(aggregate.uniqueArticleCount) ? aggregate.uniqueArticleCount : null,
      liveSourceCount: Number.isFinite(aggregate.liveSourceCount) ? aggregate.liveSourceCount : null,
      confidence: aggregate.confidence || null,
      reasonZh: compactText(aggregate.reasonZh, 240)
    },
    limitationsZh: compactList(oilNews.limitationsZh, 2, 260),
    boundary: 'context_only_not_supply_disruption_or_oil_direction_confirmation'
  };
}

function buildHistoricalContext(summary) {
  const similarity = Array.isArray(summary?.similarity) ? summary.similarity : [];
  const topSimilarity = [...similarity].sort((left, right) => Number(right.match_pct || 0) - Number(left.match_pct || 0))[0];
  return {
    topSimilarity: topSimilarity ? {
      period: topSimilarity.period,
      labelZh: topSimilarity.label_zh,
      matchPct: topSimilarity.match_pct,
      denominator: topSimilarity.denominator,
      basis: topSimilarity.basis
    } : null,
    comparisons: similarity.slice(0, 4).map((item) => ({
      period: item.period,
      labelZh: item.label_zh,
      matchPct: item.match_pct,
      denominator: item.denominator,
      basis: item.basis
    })),
    differencesZh: [
      '历史相似度只是当前 Core 颜色向量对照，不是破裂概率或时间预测。',
      '必须同时说明当前信用、市场结构与需求证据相对历史阶段的支持或背离。'
    ]
  };
}

export function buildWeeklyEditorialInput({ bubbleWatch, radarData, oilNewsWatch, discovery, generatedAt = new Date().toISOString(), fixtureOnly = false }) {
  if (bubbleWatch?.contractVersion !== 'bubble-watch-v2') throw new Error('Bubble Watch input must use bubble-watch-v2');
  if (!Array.isArray(bubbleWatch.indicators) || bubbleWatch.indicators.length !== 27) throw new Error('Bubble Watch input must contain 27 indicators');
  const summary = bubbleWatch.summary || {};
  const indicators = bubbleWatch.indicators;
  const radarContext = buildRadarContext(radarData);
  const oilContext = buildOilNewsContext(oilNewsWatch);
  const newsContext = buildCompactNewsContext(discovery);
  const staleIndicators = indicators.filter((indicator) => indicator.stale === true).map((indicator) => indicator.name_zh || indicator.id);
  const dataGaps = [
    ...(Array.isArray(discovery?.dataGaps) ? discovery.dataGaps : []),
    ...(staleIndicators.length > 0 ? [`过期指标: ${staleIndicators.join('、')}`] : []),
    ...compactList(summary.narrative_plan?.limitations, 5, 260),
    ...compactList(oilContext?.limitationsZh, 2, 260)
  ].filter(Boolean).slice(0, 12);

  const contextSourceRefs = [];
  if (radarContext) contextSourceRefs.push({
    id: 'context:radar',
    kind: 'context',
    sourceName: 'GFRR radar-data compact context',
    sourceClass: 'site_structured',
    asOfDate: radarData?.updatedAt || null
  });
  if (oilContext) contextSourceRefs.push({
    id: 'context:oil-news',
    kind: 'context',
    sourceName: 'GFRR oil-news-event-watch compact aggregate',
    sourceClass: 'site_structured_proxy',
    asOfDate: oilNewsWatch?.generatedAt || null
  });

  return {
    schemaVersion: INPUT_SCHEMA,
    generatedAt,
    asOfDate: bubbleWatch.as_of_date,
    inputMode: fixtureOnly ? 'fixture_compact_evidence_pack' : 'live_site_compact_evidence_pack',
    fixtureOnly,
    scoringSnapshot: {
      contractVersion: bubbleWatch.contractVersion,
      modelVersion: bubbleWatch.scoring?.model_version,
      coreIndicatorCount: summary.scoring_total_indicators,
      shadowIndicatorCount: indicators.filter((indicator) => indicator.score_role === 'shadow').length,
      coreRedCount: summary.scoring_red_count,
      coreYellowCount: summary.scoring_yellow_count,
      coreGreenCount: summary.scoring_green_count,
      primaryScorePct: summary.primary_score_pct,
      weightedRiskScore: summary.weighted_risk_score,
      stageScore: summary.stage_score,
      stageLabelZh: summary.stage_label,
      triggerScore: summary.trigger_score,
      triggerLabelZh: summary.trigger_label,
      verdictLabelZh: summary.verdict_label
    },
    narrativeBaseline: {
      source: summary.verdict_desc_source,
      verdictDescZh: compactText(summary.verdict_desc, 2800),
      upstreamVerdictIncluded: false,
      upstreamSummaryAdopted: false
    },
    structuredFacts: buildStructuredFacts(indicators),
    newsContext,
    contextSnapshots: {
      radar: radarContext,
      oilNews: oilContext
    },
    historicalContext: buildHistoricalContext(summary),
    sourceRefs: [
      ...buildIndicatorSourceRefs(indicators),
      ...buildNewsSourceRefs(newsContext),
      ...contextSourceRefs
    ],
    dataGaps,
    boundaries: {
      fixtureOnly,
      siteStructuredDataOnly: true,
      newsDiscoveryContextOnly: true,
      noSecrets: true,
      noRawArticleBody: true,
      readOnlyContext: true,
      excludesExistingWeeklyEditorial: true,
      excludesDecisionExecutionPositionFields: true,
      affectsBubbleWatchScoring: false,
      affectsGfrrScoring: false
    }
  };
}
