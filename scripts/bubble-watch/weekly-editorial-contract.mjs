export const NEWS_DISCOVERY_SCHEMA = 'bubble-watch-weekly-news-discovery-v1';
export const INPUT_SCHEMA = 'bubble-watch-weekly-editorial-input-v1';
export const OUTPUT_SCHEMA = 'bubble-watch-weekly-editorial-output-v1';
export const REVIEW_SCHEMA = 'bubble-watch-weekly-editorial-review-v1';
export const PRODUCTION_SCHEMA = 'bubble-watch-weekly-editorial-production-v1';

export const EDITORIAL_TOPICS = Object.freeze([
  'ai_capex_earnings',
  'ai_financing_credit',
  'ai_demand_fundamentals',
  'market_structure_valuation',
  'macro_policy',
  'accounting_regulatory'
]);

export const EDITORIAL_CATEGORIES = Object.freeze([
  'valuation',
  'capital',
  'market_structure',
  'credit',
  'fundamentals',
  'macro'
]);

const TRUE_OUTPUT_BOUNDARIES = Object.freeze([
  'displayOnly',
  'commentaryOnly',
  'externalAiGenerated',
  'usesExternalAiApi',
  'notInvestmentAdvice'
]);

const FALSE_OUTPUT_BOUNDARIES = Object.freeze([
  'affectsBubbleWatchScoring',
  'affectsCore23',
  'affectsShadow4',
  'affectsStageTrigger',
  'affectsGfrrScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance'
]);

const FALSE_REVIEW_IMPACTS = Object.freeze([
  'modifiesBubbleWatchScoring',
  'modifiesCore23',
  'modifiesShadow4',
  'modifiesStageTrigger',
  'modifiesGfrrScoring',
  'modifiesDecisionModel',
  'modifiesExecutionLock',
  'modifiesPositionGuidance'
]);

const UNSAFE_TEXT_PATTERNS = Object.freeze([
  /(?:建议|应当|可以)(?:买入|卖出|加仓|减仓|建仓|清仓|做多|做空)/u,
  /(?:买入|卖出|加仓|减仓|建仓|清仓|做多|做空)(?:机会|信号|建议|点位)/u,
  /(?:目标价|止损位|仓位比例|现金仓位|风险敞口建议)/u,
  /(?:必然|一定|确定)(?:会)?(?:崩盘|破裂|暴跌)/u,
  /泡沫将于[^。；\n]{0,24}(?:破裂|崩盘)/u,
  /(?:guaranteed|certain)(?:ly)?\s+(?:crash|collapse)/iu
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label, errors) {
  if (!isRecord(value)) errors.push(`${label} must be an object`);
  return isRecord(value) ? value : {};
}

function requireString(value, label, errors, { min = 1, max = 10000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    errors.push(`${label} must be a string with length ${min}-${max}`);
  }
}

function requireArray(value, label, errors, { min = 0, max = 1000 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    errors.push(`${label} must be an array with length ${min}-${max}`);
    return [];
  }
  return value;
}

function requireExactBoolean(record, key, expected, label, errors) {
  if (record[key] !== expected) errors.push(`${label}.${key} must be ${expected}`);
}

function uniqueStrings(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${label} contains an invalid string`);
      continue;
    }
    if (seen.has(value)) errors.push(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
  return seen;
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (isRecord(value)) Object.values(value).forEach((item) => collectStrings(item, output));
  return output;
}

function collectClaims(output) {
  return [
    ...requireSafeArray(output.weeklyTimeline),
    ...requireSafeArray(output.keyTensions),
    ...requireSafeArray(output.categoryAnalysis),
    ...(isRecord(output.historicalComparison) ? [output.historicalComparison] : [])
  ];
}

function requireSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function visibleEditorialText(output) {
  const visible = {
    headlineZh: output?.headlineZh,
    leadZh: output?.leadZh,
    weeklyTimeline: output?.weeklyTimeline,
    scorecardSynthesisZh: output?.scorecardSynthesisZh,
    keyTensions: output?.keyTensions,
    categoryAnalysis: output?.categoryAnalysis,
    historicalComparison: output?.historicalComparison,
    watchNextWeek: output?.watchNextWeek,
    dataGaps: output?.dataGaps,
    confidence: output?.confidence
  };
  return collectStrings(visible).join('\n');
}

export function validateWeeklyEditorialInput(input) {
  const errors = [];
  const root = requireRecord(input, 'input', errors);
  if (root.schemaVersion !== INPUT_SCHEMA) errors.push(`input.schemaVersion must be ${INPUT_SCHEMA}`);
  requireString(root.generatedAt, 'input.generatedAt', errors, { max: 64 });
  requireString(root.asOfDate, 'input.asOfDate', errors, { min: 10, max: 10 });

  const scoring = requireRecord(root.scoringSnapshot, 'input.scoringSnapshot', errors);
  if (scoring.contractVersion !== 'bubble-watch-v2') errors.push('input scoring contract must remain bubble-watch-v2');
  if (scoring.coreIndicatorCount !== 23) errors.push('input coreIndicatorCount must be 23');
  if (scoring.shadowIndicatorCount !== 4) errors.push('input shadowIndicatorCount must be 4');

  const facts = requireArray(root.structuredFacts, 'input.structuredFacts', errors, { min: 1, max: 27 });
  const factIds = uniqueStrings(facts.map((fact) => fact?.id), 'input.structuredFacts ids', errors);
  const indicatorIds = uniqueStrings(facts.map((fact) => fact?.indicatorId), 'input indicator ids', errors);
  for (const [index, fact] of facts.entries()) {
    requireString(fact?.factZh, `input.structuredFacts[${index}].factZh`, errors, { min: 4, max: 500 });
    requireArray(fact?.sourceRefIds, `input.structuredFacts[${index}].sourceRefIds`, errors, { min: 1, max: 8 });
  }

  const news = requireRecord(root.newsContext, 'input.newsContext', errors);
  if (news.schemaVersion !== NEWS_DISCOVERY_SCHEMA) errors.push(`input.newsContext.schemaVersion must be ${NEWS_DISCOVERY_SCHEMA}`);
  const stories = requireArray(news.stories, 'input.newsContext.stories', errors, { max: 30 });
  const storyIds = uniqueStrings(stories.map((story) => story?.id), 'input news story ids', errors);
  for (const [index, story] of stories.entries()) {
    if (!EDITORIAL_TOPICS.includes(story?.topic)) errors.push(`input.newsContext.stories[${index}].topic is not registered`);
    if (!['official', 'cross_checked', 'discovery_only'].includes(story?.evidenceStatus)) errors.push(`input.newsContext.stories[${index}].evidenceStatus is invalid`);
    requireString(story?.url, `input.newsContext.stories[${index}].url`, errors, { min: 8, max: 2048 });
    if (typeof story?.url === 'string' && !story.url.startsWith('https://')) errors.push(`input.newsContext.stories[${index}].url must use https`);
  }

  const sourceRefs = requireArray(root.sourceRefs, 'input.sourceRefs', errors, { min: 1, max: 80 });
  const sourceRefIds = uniqueStrings(sourceRefs.map((source) => source?.id), 'input.sourceRefs ids', errors);
  for (const fact of facts) {
    for (const refId of requireSafeArray(fact?.sourceRefIds)) {
      if (!sourceRefIds.has(refId)) errors.push(`input fact ${fact?.id} references unknown source ${refId}`);
    }
  }
  for (const storyId of storyIds) {
    if (!sourceRefIds.has(storyId)) errors.push(`input news story ${storyId} has no sourceRefs entry`);
  }

  const boundaries = requireRecord(root.boundaries, 'input.boundaries', errors);
  for (const key of ['siteStructuredDataOnly', 'newsDiscoveryContextOnly', 'noSecrets', 'noRawArticleBody', 'readOnlyContext']) {
    requireExactBoolean(boundaries, key, true, 'input.boundaries', errors);
  }
  for (const key of ['affectsBubbleWatchScoring', 'affectsGfrrScoring']) {
    requireExactBoolean(boundaries, key, false, 'input.boundaries', errors);
  }

  return { ok: errors.length === 0, errors, factIds, indicatorIds, sourceRefIds };
}

export function validateWeeklyEditorialOutput(output, input) {
  const errors = [];
  const root = requireRecord(output, 'output', errors);
  const inputResult = validateWeeklyEditorialInput(input);
  errors.push(...inputResult.errors.map((error) => `input prerequisite: ${error}`));

  if (root.schemaVersion !== OUTPUT_SCHEMA) errors.push(`output.schemaVersion must be ${OUTPUT_SCHEMA}`);
  if (root.provider !== 'deepseek') errors.push('output.provider must be deepseek');
  if (root.mode !== 'external_ai_weekly_editorial') errors.push('output.mode must be external_ai_weekly_editorial');
  if (root.asOfDate !== input?.asOfDate) errors.push('output.asOfDate must equal input.asOfDate');
  requireString(root.headlineZh, 'output.headlineZh', errors, { min: 8, max: 80 });
  requireString(root.leadZh, 'output.leadZh', errors, { min: 40, max: 800 });
  requireString(root.scorecardSynthesisZh, 'output.scorecardSynthesisZh', errors, { min: 30, max: 1000 });

  const timeline = requireArray(root.weeklyTimeline, 'output.weeklyTimeline', errors, { min: 2, max: 8 });
  const tensions = requireArray(root.keyTensions, 'output.keyTensions', errors, { min: 2, max: 6 });
  const categories = requireArray(root.categoryAnalysis, 'output.categoryAnalysis', errors, { min: 4, max: 6 });
  requireArray(root.watchNextWeek, 'output.watchNextWeek', errors, { min: 2, max: 6 });
  requireArray(root.dataGaps, 'output.dataGaps', errors, { min: 1, max: 12 });
  const attributions = requireArray(root.sourceAttribution, 'output.sourceAttribution', errors, { min: 1, max: 80 });

  const categoryNames = uniqueStrings(categories.map((item) => item?.category), 'output category names', errors);
  for (const category of categoryNames) {
    if (!EDITORIAL_CATEGORIES.includes(category)) errors.push(`output category ${category} is not registered`);
  }

  const newsById = new Map(requireSafeArray(input?.newsContext?.stories).map((story) => [story.id, story]));
  const referencedSourceIds = new Set();
  for (const [index, claim] of collectClaims(root).entries()) {
    const refs = requireArray(claim?.sourceRefIds, `output factual claim[${index}].sourceRefIds`, errors, { min: 1, max: 12 });
    const indicators = requireSafeArray(claim?.sourceIndicatorIds);
    for (const refId of refs) {
      referencedSourceIds.add(refId);
      if (!inputResult.sourceRefIds.has(refId)) errors.push(`output references unknown source ${refId}`);
    }
    for (const indicatorId of indicators) {
      if (!inputResult.indicatorIds.has(indicatorId)) errors.push(`output references unknown indicator ${indicatorId}`);
    }
    const discoveryRefs = refs.filter((refId) => newsById.get(refId)?.evidenceStatus === 'discovery_only');
    const corroboratingRefs = refs.filter((refId) => !discoveryRefs.includes(refId));
    if (discoveryRefs.length > 0 && corroboratingRefs.length === 0 && indicators.length === 0) {
      errors.push(`output factual claim[${index}] relies only on discovery_only news`);
    }
  }

  const attributionIds = uniqueStrings(attributions.map((item) => item?.sourceRefId), 'output attribution ids', errors);
  for (const sourceRefId of attributionIds) {
    if (!inputResult.sourceRefIds.has(sourceRefId)) errors.push(`output attribution references unknown source ${sourceRefId}`);
  }
  for (const sourceRefId of referencedSourceIds) {
    if (!attributionIds.has(sourceRefId)) errors.push(`output source ${sourceRefId} lacks sourceAttribution`);
  }

  const confidence = requireRecord(root.confidence, 'output.confidence', errors);
  if (!['low', 'medium', 'high'].includes(confidence.level)) errors.push('output.confidence.level is invalid');
  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) errors.push('output.confidence.score must be 0-100');

  const boundaries = requireRecord(root.boundaries, 'output.boundaries', errors);
  for (const key of TRUE_OUTPUT_BOUNDARIES) requireExactBoolean(boundaries, key, true, 'output.boundaries', errors);
  for (const key of FALSE_OUTPUT_BOUNDARIES) requireExactBoolean(boundaries, key, false, 'output.boundaries', errors);

  const visibleText = visibleEditorialText(root);
  if (visibleText.length < 1200 || visibleText.length > 6500) errors.push('output visible editorial text must be 1200-6500 characters');
  for (const pattern of UNSAFE_TEXT_PATTERNS) {
    if (pattern.test(visibleText)) errors.push(`output contains unsafe wording matching ${pattern}`);
  }
  if (timeline.some((item) => typeof item?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) errors.push('output timeline dates must use YYYY-MM-DD');

  return { ok: errors.length === 0, errors, visibleTextLength: visibleText.length };
}

export function validateWeeklyEditorialReview(review) {
  const errors = [];
  const root = requireRecord(review, 'review', errors);
  if (root.schemaVersion !== REVIEW_SCHEMA) errors.push(`review.schemaVersion must be ${REVIEW_SCHEMA}`);
  if (root.inputSchemaVersion !== INPUT_SCHEMA) errors.push(`review.inputSchemaVersion must be ${INPUT_SCHEMA}`);
  if (root.outputSchemaVersion !== OUTPUT_SCHEMA) errors.push(`review.outputSchemaVersion must be ${OUTPUT_SCHEMA}`);
  if (!['pass', 'warn', 'fail'].includes(root.status)) errors.push('review.status must be pass, warn, or fail');
  if (root.promotionEligible !== false) errors.push('review.promotionEligible must remain false');
  if (root.status === 'fail' && root.frontendDisplayEligible !== false) errors.push('failed review cannot be frontend display eligible');
  const impact = requireRecord(root.productionImpact, 'review.productionImpact', errors);
  for (const key of FALSE_REVIEW_IMPACTS) requireExactBoolean(impact, key, false, 'review.productionImpact', errors);
  return { ok: errors.length === 0, errors };
}

export function assertValid(result, label) {
  if (!result.ok) throw new Error(`${label} failed:\n- ${result.errors.join('\n- ')}`);
  return result;
}
