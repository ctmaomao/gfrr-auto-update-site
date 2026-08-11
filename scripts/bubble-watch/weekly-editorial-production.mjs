import { createHash } from 'node:crypto';

import {
  PRODUCTION_SCHEMA,
  assertValid,
  validateWeeklyEditorialOutput,
  validateWeeklyEditorialReview
} from './weekly-editorial-contract.mjs';
import { visibleEditorialText } from './weekly-editorial-contract.mjs';

const PRODUCTION_MAX_AGE_HOURS = 240;
const FALSE_PRODUCTION_BOUNDARIES = Object.freeze([
  'affectsBubbleWatchScoring',
  'affectsCore23',
  'affectsShadow4',
  'affectsStageTrigger',
  'affectsGfrrScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectReferenceValues(value, key, output = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectReferenceValues(item, key, output));
  else if (isRecord(value)) {
    for (const [field, item] of Object.entries(value)) {
      if (field === key && Array.isArray(item)) item.forEach((entry) => typeof entry === 'string' && output.add(entry));
      else collectReferenceValues(item, key, output);
    }
  }
  return output;
}

function compactProductionSource(source) {
  const base = {
    id: source.id,
    kind: source.kind,
    sourceName: source.sourceName,
    sourceClass: source.sourceClass
  };
  if (Array.isArray(source.indicatorIds)) base.indicatorIds = source.indicatorIds;
  if (typeof source.asOfDate === 'string') base.asOfDate = source.asOfDate;
  if (typeof source.title === 'string') base.title = source.title;
  if (typeof source.url === 'string') base.url = source.url;
  if (typeof source.domain === 'string') base.domain = source.domain;
  if (typeof source.publishedAt === 'string') base.publishedAt = source.publishedAt;
  if (typeof source.topic === 'string') base.topic = source.topic;
  if (Array.isArray(source.providers)) base.providers = source.providers;
  if (Array.isArray(source.supportingDomains)) base.supportingDomains = source.supportingDomains;
  return base;
}

export function reviewWeeklyEditorial({ input, output, generatedAt = new Date().toISOString() }) {
  const validation = validateWeeklyEditorialOutput(output, input);
  const warnings = [];
  const blockers = [...validation.errors];
  const dimensions = {
    structuralContract: validation.ok ? 'pass' : 'fail',
    sourceReferenceIntegrity: validation.ok ? 'pass' : 'fail',
    newsEvidenceQuality: 'pass',
    scoreBoundaryIntegrity: validation.ok ? 'pass' : 'fail',
    unsafeWording: validation.ok ? 'pass' : 'fail',
    incrementalEditorialValue: 'pass',
    fallbackReadiness: 'pass'
  };

  const newsById = new Map((input?.newsContext?.stories || []).map((story) => [story.id, story]));
  const referencedSources = collectReferenceValues(output, 'sourceRefIds');
  const referencedIndicators = collectReferenceValues(output, 'sourceIndicatorIds');
  const credibleNewsRefs = [...referencedSources].filter((refId) => ['official', 'cross_checked'].includes(newsById.get(refId)?.evidenceStatus));
  if (credibleNewsRefs.length < 1) {
    dimensions.newsEvidenceQuality = 'fail';
    blockers.push('at least one official/cross_checked news reference is required');
  } else if (credibleNewsRefs.length === 1) {
    dimensions.newsEvidenceQuality = 'warn';
    warnings.push('only one official/cross_checked news reference was used; remaining factual claims require site-indicator corroboration');
  }
  if (input?.newsContext?.status === 'partial') {
    dimensions.newsEvidenceQuality = 'warn';
    warnings.push('news discovery was partial; visible data gaps must retain this limitation');
  }
  if (referencedIndicators.size < 5) {
    dimensions.incrementalEditorialValue = 'fail';
    blockers.push('editorial must synthesize at least five distinct Bubble Watch indicators');
  }
  const categories = new Set((output?.categoryAnalysis || []).map((item) => item.category));
  if (categories.size < 5) {
    dimensions.incrementalEditorialValue = categories.size < 4 ? 'fail' : 'warn';
    (categories.size < 4 ? blockers : warnings).push(`category coverage is ${categories.size}/6`);
  }
  const visibleLength = visibleEditorialText(output).length;
  if (visibleLength < 1800 || visibleLength > 4200) {
    dimensions.incrementalEditorialValue = dimensions.incrementalEditorialValue === 'fail' ? 'fail' : 'warn';
    warnings.push(`visible editorial length ${visibleLength} is outside the 1800-4200 target`);
  }
  if (!Array.isArray(output?.weeklyTimeline) || output.weeklyTimeline.length < 3) {
    dimensions.incrementalEditorialValue = 'warn';
    warnings.push('weekly timeline has fewer than three evidence-backed items');
  }

  const status = blockers.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
  return {
    schemaVersion: 'bubble-watch-weekly-editorial-review-v1',
    generatedAt,
    inputSchemaVersion: input?.schemaVersion || null,
    outputSchemaVersion: output?.schemaVersion || null,
    status,
    recommendation: status === 'fail' ? 'reject_for_display' : 'approved_for_read_only_display',
    dimensions,
    warnings,
    blockers,
    promotionEligible: false,
    frontendDisplayEligible: status !== 'fail',
    metrics: {
      visibleTextLength: visibleLength,
      referencedIndicatorCount: referencedIndicators.size,
      credibleNewsReferenceCount: credibleNewsRefs.length,
      categoryCount: categories.size
    },
    productionImpact: {
      modifiesBubbleWatchScoring: false,
      modifiesCore23: false,
      modifiesShadow4: false,
      modifiesStageTrigger: false,
      modifiesGfrrScoring: false,
      modifiesDecisionModel: false,
      modifiesExecutionLock: false,
      modifiesPositionGuidance: false
    }
  };
}

export function projectWeeklyEditorial({ input, output, review, generatedAt = new Date().toISOString(), sourceCommit = null, runId = null }) {
  assertValid(validateWeeklyEditorialOutput(output, input), 'weekly editorial projection output');
  assertValid(validateWeeklyEditorialReview(review), 'weekly editorial projection review');
  if (!['pass', 'warn'].includes(review.status) || review.frontendDisplayEligible !== true) {
    throw new Error('weekly editorial projection requires display-eligible pass/warn review');
  }
  if (input.fixtureOnly === true) throw new Error('fixture input cannot be projected to production');

  const referencedSourceIds = new Set(collectReferenceValues(output, 'sourceRefIds'));
  for (const item of output.sourceAttribution || []) referencedSourceIds.add(item.sourceRefId);
  for (const indicatorId of collectReferenceValues(output, 'sourceIndicatorIds')) referencedSourceIds.add(`indicator:${indicatorId}`);
  const sourceLedger = (input.sourceRefs || [])
    .filter((source) => referencedSourceIds.has(source.id))
    .map(compactProductionSource);

  const artifactDigest = digest(output);
  return {
    schemaVersion: PRODUCTION_SCHEMA,
    status: 'valid',
    displayEnabled: true,
    generatedAt,
    updatedAt: generatedAt,
    asOfDate: input.asOfDate,
    provider: 'deepseek',
    model: output.model,
    mode: 'external_ai_weekly_editorial',
    sourceMode: 'weekly_news_and_site_structured_compact_v1',
    output,
    sourceLedger,
    validation: {
      validator: 'check:bubble-watch-weekly-editorial-contract',
      status: 'pass',
      validatedAt: generatedAt,
      artifactDigest
    },
    qualityReview: {
      status: review.status,
      recommendation: review.recommendation,
      promotionEligible: false,
      reviewedAt: review.generatedAt,
      dimensions: review.dimensions,
      warnings: review.warnings
    },
    provenance: {
      generatedBy: 'github_actions_workflow',
      humanApproved: false,
      inputDigest: digest(input),
      artifactDigest,
      sourceCommit,
      runId,
      newsDiscoveryStatus: input.newsContext?.status || null,
      liveNewsProviderCount: input.newsContext?.liveProviderCount ?? null
    },
    freshness: {
      artifactGeneratedAt: output.generatedAt,
      sourceAsOfDate: input.asOfDate,
      maxAgeHours: PRODUCTION_MAX_AGE_HOURS,
      isStale: false
    },
    fallback: {
      available: true,
      source: input.narrativeBaseline?.source || 'bubble-watch-narrative-v2',
      field: 'summary.verdict_desc'
    },
    boundaries: {
      displayOnly: true,
      commentaryOnly: true,
      externalAiGenerated: true,
      usesExternalAiApi: true,
      frontendDisplayApproved: true,
      affectsBubbleWatchScoring: false,
      affectsCore23: false,
      affectsShadow4: false,
      affectsStageTrigger: false,
      affectsGfrrScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true
    }
  };
}

function syntheticInputFromProduction(layer, bubbleWatch) {
  const referencedIndicators = collectReferenceValues(layer.output, 'sourceIndicatorIds');
  const indicatorSources = new Map(layer.sourceLedger.filter((source) => source.kind === 'indicator').map((source) => [source.id, source]));
  const structuredFacts = [...referencedIndicators].map((indicatorId) => {
    const indicator = bubbleWatch.indicators.find((item) => item.id === indicatorId);
    return {
      id: `fact:${indicatorId}`,
      indicatorId,
      category: indicator?.category || 'macro',
      status: indicator?.status || 'green',
      factZh: `${indicator?.name_zh || indicatorId}: ${indicator?.value_display || '已记录'}。`,
      sourceRefIds: [`indicator:${indicatorId}`]
    };
  });
  const newsStories = layer.sourceLedger.filter((source) => source.kind === 'news').map((source) => ({
    id: source.id,
    topic: source.topic,
    title: source.title,
    url: source.url,
    domain: source.domain,
    publishedAt: source.publishedAt,
    providers: source.providers,
    supportingDomains: source.supportingDomains,
    evidenceStatus: source.sourceClass
  }));
  const sourceRefs = layer.sourceLedger.filter((source) => source.kind !== 'indicator' || indicatorSources.has(source.id));
  return {
    schemaVersion: 'bubble-watch-weekly-editorial-input-v1',
    generatedAt: layer.generatedAt,
    asOfDate: layer.asOfDate,
    scoringSnapshot: {
      contractVersion: 'bubble-watch-v2',
      coreIndicatorCount: 23,
      shadowIndicatorCount: 4
    },
    structuredFacts,
    newsContext: {
      schemaVersion: 'bubble-watch-weekly-news-discovery-v1',
      generatedAt: layer.generatedAt,
      status: layer.provenance.newsDiscoveryStatus,
      windowStart: layer.asOfDate,
      windowEnd: layer.asOfDate,
      topicsQueried: 6,
      liveProviderCount: layer.provenance.liveNewsProviderCount,
      stories: newsStories,
      boundaries: {
        transientArtifactOnly: true,
        containsRawProviderResponse: false,
        containsHeaders: false,
        containsApiKeys: false,
        containsFullArticleBody: false,
        affectsBubbleWatchScoring: false,
        affectsGfrrScoring: false
      }
    },
    sourceRefs,
    boundaries: {
      siteStructuredDataOnly: true,
      newsDiscoveryContextOnly: true,
      noSecrets: true,
      noRawArticleBody: true,
      readOnlyContext: true,
      affectsBubbleWatchScoring: false,
      affectsGfrrScoring: false
    }
  };
}

export function validateWeeklyEditorialProduction(layer, bubbleWatch) {
  const errors = [];
  if (!isRecord(layer)) return { ok: false, errors: ['weekly editorial production layer must be an object'] };
  if (layer.schemaVersion !== PRODUCTION_SCHEMA) errors.push(`schemaVersion must be ${PRODUCTION_SCHEMA}`);
  if (layer.status !== 'valid') errors.push('status must be valid');
  if (layer.displayEnabled !== true) errors.push('displayEnabled must be true');
  if (layer.asOfDate !== bubbleWatch?.as_of_date) errors.push('asOfDate must match Bubble Watch as_of_date');
  if (layer.provider !== 'deepseek' || layer.mode !== 'external_ai_weekly_editorial') errors.push('provider/mode must identify DeepSeek weekly editorial');
  if (layer.validation?.status !== 'pass') errors.push('validation.status must be pass');
  if (!['pass', 'warn'].includes(layer.qualityReview?.status)) errors.push('qualityReview.status must be pass or warn');
  if (layer.qualityReview?.promotionEligible !== false) errors.push('qualityReview.promotionEligible must be false');
  if (layer.provenance?.humanApproved !== false) errors.push('provenance.humanApproved must be false');
  if (!/^[a-f0-9]{64}$/u.test(layer.provenance?.inputDigest || '')) errors.push('provenance.inputDigest must be SHA-256');
  if (!/^[a-f0-9]{64}$/u.test(layer.provenance?.artifactDigest || '')) errors.push('provenance.artifactDigest must be SHA-256');
  if (layer.freshness?.isStale !== false || layer.freshness?.maxAgeHours !== PRODUCTION_MAX_AGE_HOURS) errors.push('freshness contract is invalid');
  if (layer.boundaries?.displayOnly !== true || layer.boundaries?.frontendDisplayApproved !== true || layer.boundaries?.notInvestmentAdvice !== true) errors.push('visible display boundaries are invalid');
  for (const key of FALSE_PRODUCTION_BOUNDARIES) {
    if (layer.boundaries?.[key] !== false) errors.push(`boundaries.${key} must be false`);
  }
  const ledgerIds = new Set();
  for (const source of Array.isArray(layer.sourceLedger) ? layer.sourceLedger : []) {
    if (!source?.id || ledgerIds.has(source.id)) errors.push(`sourceLedger contains invalid/duplicate id ${source?.id}`);
    ledgerIds.add(source?.id);
    if (source?.kind === 'news' && (typeof source.url !== 'string' || !source.url.startsWith('https://'))) errors.push(`news source ${source.id} must use https`);
    if (Object.hasOwn(source || {}, 'snippet')) errors.push(`production source ${source.id} must not contain snippet`);
  }
  try {
    const syntheticInput = syntheticInputFromProduction(layer, bubbleWatch);
    const outputResult = validateWeeklyEditorialOutput(layer.output, syntheticInput);
    errors.push(...outputResult.errors.map((error) => `production output: ${error}`));
  } catch (error) {
    errors.push(`production output validation failed: ${error.message}`);
  }
  return { ok: errors.length === 0, errors };
}

export function applyWeeklyEditorialProjection(bubbleWatch, layer) {
  assertValid(validateWeeklyEditorialProduction(layer, bubbleWatch), 'weekly editorial production write');
  if (!isRecord(bubbleWatch?.summary)) throw new Error('Bubble Watch summary must be an object');
  const next = structuredClone(bubbleWatch);
  next.summary.weekly_editorial = layer;
  const beforeWithoutEditorial = structuredClone(bubbleWatch);
  const afterWithoutEditorial = structuredClone(next);
  delete beforeWithoutEditorial.summary.weekly_editorial;
  delete afterWithoutEditorial.summary.weekly_editorial;
  if (JSON.stringify(beforeWithoutEditorial) !== JSON.stringify(afterWithoutEditorial)) {
    throw new Error('writer guard detected a change outside summary.weekly_editorial');
  }
  return next;
}
