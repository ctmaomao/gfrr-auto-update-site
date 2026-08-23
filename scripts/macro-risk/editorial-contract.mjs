export const NEWS_DISCOVERY_SCHEMA = 'macro-risk-editorial-news-discovery-v1';
export const INPUT_SCHEMA = 'macro-risk-editorial-input-v1';
export const OUTPUT_SCHEMA = 'macro-risk-editorial-output-v1';
export const REVIEW_SCHEMA = 'macro-risk-editorial-review-v1';
export const PRODUCTION_SCHEMA = 'macro-risk-editorial-production-v1';

export const EDITORIAL_TOPICS = Object.freeze([
  'central_bank_inflation',
  'energy_geopolitics',
  'credit_liquidity',
  'growth_employment_consumer',
  'global_china_europe',
  'market_volatility_valuation'
]);

export const RISK_MODULES = Object.freeze([
  'energy',
  'geopolitical',
  'inflation',
  'liquidity',
  'debt',
  'banking'
]);

const TRUE_OUTPUT_BOUNDARIES = Object.freeze([
  'displayOnly',
  'commentaryOnly',
  'externalAiGenerated',
  'usesExternalAiApi',
  'notInvestmentAdvice'
]);

const FALSE_OUTPUT_BOUNDARIES = Object.freeze([
  'affectsGfrrScoring',
  'affectsRiskModules',
  'affectsTailRiskOverlay',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsWorldOrder',
  'affectsOdp',
  'affectsBubbleWatch'
]);

const UNSAFE_TEXT_PATTERNS = Object.freeze([
  /(?:建议|应当|可以)(?:买入|卖出|加仓|减仓|建仓|清仓|做多|做空)/u,
  /(?:买入|卖出|加仓|减仓|建仓|清仓|做多|做空)(?:机会|信号|建议|点位)/u,
  /(?:目标价|止损位|仓位比例|现金仓位|风险敞口建议)/u,
  /(?:必然|一定|确定)(?:会)?(?:危机|崩盘|衰退|战争|暴跌)/u,
  /(?:危机|战争|衰退|崩盘)(?:概率|几率)(?:为|是|达到)?\s*\d/u,
  /(?:guaranteed|certain)(?:ly)?\s+(?:crisis|war|recession|crash|collapse)/iu
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

function collectNamedStringArrays(value, fieldName, output = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectNamedStringArrays(item, fieldName, output));
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === fieldName && Array.isArray(item)) item.forEach((entry) => typeof entry === 'string' && output.add(entry));
      else collectNamedStringArrays(item, fieldName, output);
    }
  }
  return output;
}

function factualClaims(output) {
  return [
    ...(Array.isArray(output?.weeklyTimeline) ? output.weeklyTimeline : []),
    ...(isRecord(output?.scoreSynthesis) ? [output.scoreSynthesis] : []),
    ...(Array.isArray(output?.keyTensions) ? output.keyTensions : []),
    ...(Array.isArray(output?.moduleAnalysis) ? output.moduleAnalysis : []),
    ...(Array.isArray(output?.crossMarketAnalysis) ? output.crossMarketAnalysis : []),
    ...(isRecord(output?.historicalComparison) ? [output.historicalComparison] : []),
    ...(Array.isArray(output?.watchNext) ? output.watchNext : [])
  ];
}

function joinVisibleStrings(values) {
  return values.filter((value) => typeof value === 'string' && value.trim()).join('\n');
}

export function visibleEditorialSections(output) {
  return {
    headline: joinVisibleStrings([output?.headlineZh]),
    lead: joinVisibleStrings([output?.leadZh]),
    timeline: joinVisibleStrings((Array.isArray(output?.weeklyTimeline) ? output.weeklyTimeline : [])
      .flatMap((item) => [item?.date, item?.titleZh, item?.detailZh])),
    scoreSynthesis: joinVisibleStrings([output?.scoreSynthesis?.assessmentZh]),
    keyTensions: joinVisibleStrings((Array.isArray(output?.keyTensions) ? output.keyTensions : [])
      .flatMap((item) => [item?.titleZh, item?.detailZh])),
    modules: joinVisibleStrings((Array.isArray(output?.moduleAnalysis) ? output.moduleAnalysis : [])
      .flatMap((item) => [item?.labelZh, item?.assessmentZh])),
    crossMarket: joinVisibleStrings((Array.isArray(output?.crossMarketAnalysis) ? output.crossMarketAnalysis : [])
      .flatMap((item) => [item?.assetZh, item?.observationZh, item?.implicationZh])),
    historicalComparison: joinVisibleStrings([
      output?.historicalComparison?.periodZh,
      output?.historicalComparison?.similaritiesZh,
      output?.historicalComparison?.differencesZh
    ]),
    watchNext: joinVisibleStrings((Array.isArray(output?.watchNext) ? output.watchNext : [])
      .flatMap((item) => [item?.conditionZh, item?.whyItMattersZh, item?.invalidationZh])),
    dataGaps: joinVisibleStrings(Array.isArray(output?.dataGaps) ? output.dataGaps : []),
    confidence: joinVisibleStrings([output?.confidence?.reasonZh])
  };
}

export function visibleEditorialText(output) {
  return joinVisibleStrings(Object.values(visibleEditorialSections(output)));
}

export function validateNewsDiscovery(discovery) {
  const errors = [];
  const root = requireRecord(discovery, 'news discovery', errors);
  if (root.schemaVersion !== NEWS_DISCOVERY_SCHEMA) errors.push(`news discovery.schemaVersion must be ${NEWS_DISCOVERY_SCHEMA}`);
  if (!['ok', 'partial', 'insufficient'].includes(root.status)) errors.push('news discovery.status must be ok, partial, or insufficient');
  requireString(root.generatedAt, 'news discovery.generatedAt', errors, { max: 64 });
  requireString(root.windowStart, 'news discovery.windowStart', errors, { min: 10, max: 10 });
  requireString(root.windowEnd, 'news discovery.windowEnd', errors, { min: 10, max: 10 });
  if (root.topicsQueried !== EDITORIAL_TOPICS.length) errors.push(`news discovery.topicsQueried must be ${EDITORIAL_TOPICS.length}`);
  if (!Number.isInteger(root.liveProviderCount) || root.liveProviderCount < 0 || root.liveProviderCount > 2) errors.push('news discovery.liveProviderCount must be 0-2');
  const stories = requireArray(root.stories, 'news discovery.stories', errors, { max: 30 });
  uniqueStrings(stories.map((story) => story?.id), 'news discovery story ids', errors);
  const perTopic = new Map();
  for (const [index, story] of stories.entries()) {
    if (!EDITORIAL_TOPICS.includes(story?.topic)) errors.push(`news discovery.stories[${index}].topic is not registered`);
    perTopic.set(story?.topic, (perTopic.get(story?.topic) || 0) + 1);
    if (!['official', 'cross_checked', 'discovery_only'].includes(story?.evidenceStatus)) errors.push(`news discovery.stories[${index}].evidenceStatus is invalid`);
    requireString(story?.title, `news discovery.stories[${index}].title`, errors, { min: 4, max: 220 });
    requireString(story?.url, `news discovery.stories[${index}].url`, errors, { min: 8, max: 2048 });
    if (typeof story?.url === 'string' && !story.url.startsWith('https://')) errors.push(`news discovery.stories[${index}].url must use https`);
    const providers = requireArray(story?.providers, `news discovery.stories[${index}].providers`, errors, { min: 1, max: 2 });
    if (providers.some((provider) => !['tavily', 'brave'].includes(provider))) errors.push(`news discovery.stories[${index}].providers contains unsupported provider`);
    if (story?.evidenceStatus === 'cross_checked' && new Set(requireArray(story?.supportingDomains, `news discovery.stories[${index}].supportingDomains`, errors, { min: 2, max: 8 })).size < 2) {
      errors.push(`news discovery.stories[${index}] cross_checked requires two independent domains`);
    }
    if (typeof story?.snippet === 'string' && story.snippet.length > 360) errors.push(`news discovery.stories[${index}].snippet exceeds 360 characters`);
    for (const forbidden of ['raw', 'rawResponse', 'rawContent', 'headers', 'apiKey', 'authorization', 'fullArticleBody']) {
      if (Object.hasOwn(story || {}, forbidden)) errors.push(`news discovery.stories[${index}] contains forbidden field ${forbidden}`);
    }
  }
  for (const [topic, count] of perTopic.entries()) if (count > 5) errors.push(`news discovery topic ${topic} exceeds 5 stories`);
  const boundaries = requireRecord(root.boundaries, 'news discovery.boundaries', errors);
  if (boundaries.transientArtifactOnly !== true) errors.push('news discovery.boundaries.transientArtifactOnly must be true');
  for (const key of ['containsRawProviderResponse', 'containsHeaders', 'containsApiKeys', 'containsFullArticleBody', 'affectsGfrrScoring']) {
    if (boundaries[key] !== false) errors.push(`news discovery.boundaries.${key} must be false`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateEditorialInput(input) {
  const errors = [];
  const root = requireRecord(input, 'input', errors);
  if (root.schemaVersion !== INPUT_SCHEMA) errors.push(`input.schemaVersion must be ${INPUT_SCHEMA}`);
  requireString(root.generatedAt, 'input.generatedAt', errors, { max: 64 });
  requireString(root.sourceDataUpdatedAt, 'input.sourceDataUpdatedAt', errors, { max: 64 });
  const risk = requireRecord(root.riskSnapshot, 'input.riskSnapshot', errors);
  if (!Number.isFinite(risk.score) || risk.score < 0 || risk.score > 100) errors.push('input.riskSnapshot.score must be 0-100');
  const modules = requireArray(root.moduleSnapshot, 'input.moduleSnapshot', errors, { min: 6, max: 6 });
  const moduleNames = uniqueStrings(modules.map((item) => item?.module), 'input module names', errors);
  for (const module of RISK_MODULES) if (!moduleNames.has(module)) errors.push(`input is missing risk module ${module}`);
  const facts = requireArray(root.structuredFacts, 'input.structuredFacts', errors, { min: 12, max: 60 });
  uniqueStrings(facts.map((fact) => fact?.id), 'input fact ids', errors);
  for (const [index, fact] of facts.entries()) {
    requireString(fact?.factZh, `input.structuredFacts[${index}].factZh`, errors, { min: 4, max: 520 });
    requireArray(fact?.sourceRefIds, `input.structuredFacts[${index}].sourceRefIds`, errors, { min: 1, max: 8 });
  }
  const newsResult = validateNewsDiscovery(root.newsContext);
  errors.push(...newsResult.errors.map((error) => `input prerequisite: ${error}`));
  const credibleNewsCount = (root.newsContext?.stories || []).filter((story) => ['official', 'cross_checked'].includes(story.evidenceStatus)).length;
  if (credibleNewsCount < 1) errors.push('input requires at least one official or cross_checked news story');
  const refs = requireArray(root.sourceRefs, 'input.sourceRefs', errors, { min: 12, max: 120 });
  const refIds = uniqueStrings(refs.map((source) => source?.id), 'input source ref ids', errors);
  for (const fact of facts) for (const refId of fact?.sourceRefIds || []) if (!refIds.has(refId)) errors.push(`input fact ${fact?.id} references unknown source ${refId}`);
  for (const story of root.newsContext?.stories || []) if (!refIds.has(story.id)) errors.push(`input news story ${story.id} has no sourceRefs entry`);
  const boundaries = requireRecord(root.boundaries, 'input.boundaries', errors);
  for (const key of ['siteStructuredDataOnly', 'newsDiscoveryContextOnly', 'noSecrets', 'noRawArticleBody', 'readOnlyContext', 'excludesExistingAiLayers', 'excludesDecisionExecutionPositionFields']) {
    if (boundaries[key] !== true) errors.push(`input.boundaries.${key} must be true`);
  }
  for (const key of ['affectsGfrrScoring', 'affectsRiskModules', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance']) {
    if (boundaries[key] !== false) errors.push(`input.boundaries.${key} must be false`);
  }
  if (Buffer.byteLength(JSON.stringify(root), 'utf8') > 65_536) errors.push('input compact evidence pack must not exceed 64 KiB');
  return { ok: errors.length === 0, errors, sourceRefIds: refIds };
}

export function validateEditorialOutput(output, input) {
  const errors = [];
  const root = requireRecord(output, 'output', errors);
  const inputResult = validateEditorialInput(input);
  errors.push(...inputResult.errors.map((error) => `input prerequisite: ${error}`));
  if (root.schemaVersion !== OUTPUT_SCHEMA) errors.push(`output.schemaVersion must be ${OUTPUT_SCHEMA}`);
  if (root.provider !== 'deepseek') errors.push('output.provider must be deepseek');
  if (root.mode !== 'external_ai_macro_risk_editorial') errors.push('output.mode must be external_ai_macro_risk_editorial');
  if (root.sourceDataUpdatedAt !== input?.sourceDataUpdatedAt) errors.push('output.sourceDataUpdatedAt must equal input.sourceDataUpdatedAt');
  requireString(root.headlineZh, 'output.headlineZh', errors, { min: 8, max: 90 });
  requireString(root.leadZh, 'output.leadZh', errors, { min: 80, max: 900 });
  const timeline = requireArray(root.weeklyTimeline, 'output.weeklyTimeline', errors, { min: 3, max: 5 });
  const scoreSynthesis = requireRecord(root.scoreSynthesis, 'output.scoreSynthesis', errors);
  requireString(scoreSynthesis.assessmentZh, 'output.scoreSynthesis.assessmentZh', errors, { min: 80, max: 1000 });
  requireArray(root.keyTensions, 'output.keyTensions', errors, { min: 2, max: 4 });
  const modules = requireArray(root.moduleAnalysis, 'output.moduleAnalysis', errors, { min: 6, max: 6 });
  const moduleNames = uniqueStrings(modules.map((item) => item?.module), 'output module names', errors);
  for (const module of RISK_MODULES) if (!moduleNames.has(module)) errors.push(`output is missing risk module ${module}`);
  requireArray(root.crossMarketAnalysis, 'output.crossMarketAnalysis', errors, { min: 3, max: 5 });
  requireRecord(root.historicalComparison, 'output.historicalComparison', errors);
  requireArray(root.watchNext, 'output.watchNext', errors, { min: 3, max: 5 });
  requireArray(root.dataGaps, 'output.dataGaps', errors, { min: 1, max: 12 });
  const attributions = requireArray(root.sourceAttribution, 'output.sourceAttribution', errors, { min: 1, max: 120 });
  const newsById = new Map((input?.newsContext?.stories || []).map((story) => [story.id, story]));
  const referencedIds = collectNamedStringArrays(root, 'sourceRefIds');
  for (const [index, claim] of factualClaims(root).entries()) {
    const refs = requireArray(claim?.sourceRefIds, `output factual claim[${index}].sourceRefIds`, errors, { min: 1, max: 12 });
    for (const refId of refs) if (!inputResult.sourceRefIds.has(refId)) errors.push(`output references unknown source ${refId}`);
    const discoveryOnly = refs.filter((refId) => newsById.get(refId)?.evidenceStatus === 'discovery_only');
    if (discoveryOnly.length > 0 && refs.every((refId) => discoveryOnly.includes(refId))) errors.push(`output factual claim[${index}] relies only on discovery_only news`);
  }
  const attributionIds = uniqueStrings(attributions.map((item) => item?.sourceRefId), 'output attribution ids', errors);
  for (const refId of referencedIds) if (!attributionIds.has(refId)) errors.push(`output source ${refId} lacks sourceAttribution`);
  const confidence = requireRecord(root.confidence, 'output.confidence', errors);
  if (!['low', 'medium', 'high'].includes(confidence.level)) errors.push('output.confidence.level is invalid');
  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) errors.push('output.confidence.score must be 0-100');
  const boundaries = requireRecord(root.boundaries, 'output.boundaries', errors);
  for (const key of TRUE_OUTPUT_BOUNDARIES) if (boundaries[key] !== true) errors.push(`output.boundaries.${key} must be true`);
  for (const key of FALSE_OUTPUT_BOUNDARIES) if (boundaries[key] !== false) errors.push(`output.boundaries.${key} must be false`);
  const visibleSections = visibleEditorialSections(root);
  const visibleText = joinVisibleStrings(Object.values(visibleSections));
  if (visibleText.length < 2000 || visibleText.length > 6800) errors.push('output visible editorial text must be 2000-6800 characters');
  for (const pattern of UNSAFE_TEXT_PATTERNS) if (pattern.test(visibleText)) errors.push(`output contains unsafe wording matching ${pattern}`);
  if (timeline.some((item) => typeof item?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(item.date))) errors.push('output timeline dates must use YYYY-MM-DD');
  return {
    ok: errors.length === 0,
    errors,
    visibleTextLength: visibleText.length,
    visibleTextSectionLengths: Object.fromEntries(Object.entries(visibleSections).map(([key, value]) => [key, value.length])),
    referencedSourceCount: referencedIds.size
  };
}

export function validateEditorialReview(review) {
  const errors = [];
  const root = requireRecord(review, 'review', errors);
  if (root.schemaVersion !== REVIEW_SCHEMA) errors.push(`review.schemaVersion must be ${REVIEW_SCHEMA}`);
  if (root.inputSchemaVersion !== INPUT_SCHEMA) errors.push(`review.inputSchemaVersion must be ${INPUT_SCHEMA}`);
  if (root.outputSchemaVersion !== OUTPUT_SCHEMA) errors.push(`review.outputSchemaVersion must be ${OUTPUT_SCHEMA}`);
  if (!['pass', 'warn', 'fail'].includes(root.status)) errors.push('review.status must be pass, warn, or fail');
  if (root.promotionEligible !== false) errors.push('review.promotionEligible must remain false');
  if (root.status === 'fail' && root.frontendDisplayEligible !== false) errors.push('failed review cannot be frontend display eligible');
  const impact = requireRecord(root.productionImpact, 'review.productionImpact', errors);
  for (const key of ['modifiesGfrrScoring', 'modifiesRiskModules', 'modifiesTailRiskOverlay', 'modifiesDecisionModel', 'modifiesExecutionLock', 'modifiesPositionGuidance', 'modifiesWorldOrder', 'modifiesOdp', 'modifiesBubbleWatch']) {
    if (impact[key] !== false) errors.push(`review.productionImpact.${key} must be false`);
  }
  return { ok: errors.length === 0, errors };
}

export function assertValid(result, label) {
  if (!result.ok) throw new Error(`${label} failed:\n- ${result.errors.join('\n- ')}`);
  return result;
}
