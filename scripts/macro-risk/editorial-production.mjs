import { createHash } from 'node:crypto';

import {
  PRODUCTION_SCHEMA,
  REVIEW_SCHEMA,
  assertValid,
  validateEditorialOutput,
  validateEditorialReview,
  visibleEditorialText
} from './editorial-contract.mjs';

const PRODUCTION_MAX_AGE_HOURS = 30;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectReferenceValues(value, key = 'sourceRefIds', output = new Set()) {
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
  const output = {
    id: source.id,
    kind: source.kind,
    sourceName: source.sourceName,
    sourceClass: source.sourceClass
  };
  for (const key of ['asOfDate', 'title', 'url', 'domain', 'publishedAt', 'topic']) if (typeof source[key] === 'string') output[key] = source[key];
  for (const key of ['providers', 'supportingDomains', 'factIds']) if (Array.isArray(source[key])) output[key] = source[key];
  return output;
}

export function reviewEditorial({ input, output, generatedAt = new Date().toISOString() }) {
  const validation = validateEditorialOutput(output, input);
  const blockers = [...validation.errors];
  const warnings = [];
  const referenced = collectReferenceValues(output);
  const newsById = new Map((input?.newsContext?.stories || []).map((story) => [story.id, story]));
  const credibleNewsReferences = [...referenced].filter((id) => ['official', 'cross_checked'].includes(newsById.get(id)?.evidenceStatus));
  if (credibleNewsReferences.length < 1) blockers.push('至少需要引用 1 条 official 或 cross_checked 新闻');
  else if (credibleNewsReferences.length === 1) warnings.push('本期只引用 1 条可信新闻，其余段落依赖站内结构化证据');
  if (referenced.size < 12) blockers.push(`判读仅引用 ${referenced.size} 个来源，至少需要 12 个`);
  if (input?.newsContext?.status === 'partial') warnings.push('近 7 日新闻发现为 partial，页面必须保留数据限制');
  const visibleTextLength = visibleEditorialText(output).length;
  if (visibleTextLength < 2800 || visibleTextLength > 3800) warnings.push(`可见判读长度 ${visibleTextLength} 字，超出目标 2,800–3,800 字但仍在兼容范围`);
  const status = blockers.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
  return {
    schemaVersion: REVIEW_SCHEMA,
    generatedAt,
    inputSchemaVersion: input?.schemaVersion || null,
    outputSchemaVersion: output?.schemaVersion || null,
    status,
    recommendation: status === 'fail' ? 'reject_for_display' : 'approved_for_read_only_display',
    dimensions: {
      structuralContract: validation.ok ? 'pass' : 'fail',
      sourceReferenceIntegrity: validation.ok ? 'pass' : 'fail',
      newsEvidenceQuality: credibleNewsReferences.length < 1 ? 'fail' : credibleNewsReferences.length === 1 ? 'warn' : 'pass',
      scoringBoundaryIntegrity: validation.ok ? 'pass' : 'fail',
      unsafeWording: validation.ok ? 'pass' : 'fail',
      editorialDepth: referenced.size < 12 ? 'fail' : visibleTextLength < 2800 || visibleTextLength > 3800 ? 'warn' : 'pass',
      deterministicFallback: 'pass'
    },
    warnings,
    blockers,
    promotionEligible: false,
    frontendDisplayEligible: status !== 'fail',
    metrics: {
      visibleTextLength,
      referencedSourceCount: referenced.size,
      credibleNewsReferenceCount: credibleNewsReferences.length,
      moduleCount: Array.isArray(output?.moduleAnalysis) ? output.moduleAnalysis.length : 0,
      crossMarketCount: Array.isArray(output?.crossMarketAnalysis) ? output.crossMarketAnalysis.length : 0
    },
    productionImpact: {
      modifiesGfrrScoring: false,
      modifiesRiskModules: false,
      modifiesTailRiskOverlay: false,
      modifiesDecisionModel: false,
      modifiesExecutionLock: false,
      modifiesPositionGuidance: false,
      modifiesWorldOrder: false,
      modifiesOdp: false,
      modifiesBubbleWatch: false
    }
  };
}

export function projectEditorial({ input, output, review, generatedAt = new Date().toISOString(), sourceCommit = null, runId = null }) {
  assertValid(validateEditorialOutput(output, input), 'macro risk editorial projection output');
  assertValid(validateEditorialReview(review), 'macro risk editorial projection review');
  if (!['pass', 'warn'].includes(review.status) || review.frontendDisplayEligible !== true) throw new Error('macro risk editorial projection requires display-eligible pass/warn review');
  if (input.fixtureOnly === true) throw new Error('fixture input cannot be projected to production');
  const referenced = collectReferenceValues(output);
  for (const item of output.sourceAttribution || []) referenced.add(item.sourceRefId);
  const sourceLedger = (input.sourceRefs || []).filter((source) => referenced.has(source.id)).map(compactProductionSource);
  const artifactDigest = digest(output);
  return {
    schemaVersion: PRODUCTION_SCHEMA,
    status: 'valid',
    displayEnabled: true,
    generatedAt,
    updatedAt: generatedAt,
    sourceDataUpdatedAt: input.sourceDataUpdatedAt,
    provider: 'deepseek',
    model: output.model,
    mode: 'external_ai_macro_risk_editorial',
    sourceMode: 'near_7d_news_and_site_structured_compact_v1',
    output,
    sourceLedger,
    validation: {
      validator: 'check:macro-risk-editorial-contract',
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
      sourceDataUpdatedAt: input.sourceDataUpdatedAt,
      maxAgeHours: PRODUCTION_MAX_AGE_HOURS,
      isStale: false
    },
    fallback: {
      available: true,
      source: 'deterministic_macro_overview',
      target: '#macro-risk-overview'
    },
    boundaries: {
      displayOnly: true,
      commentaryOnly: true,
      externalAiGenerated: true,
      usesExternalAiApi: true,
      frontendDisplayApproved: true,
      affectsGfrrScoring: false,
      affectsRiskModules: false,
      affectsTailRiskOverlay: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsWorldOrder: false,
      affectsOdp: false,
      affectsBubbleWatch: false,
      notInvestmentAdvice: true
    }
  };
}

export function validateEditorialProduction(layer, radarData, now = new Date()) {
  const errors = [];
  if (!isRecord(layer)) return { ok: false, errors: ['macroRiskEditorialLayer must be an object'] };
  if (layer.schemaVersion !== PRODUCTION_SCHEMA) errors.push(`schemaVersion must be ${PRODUCTION_SCHEMA}`);
  if (layer.status !== 'valid' || layer.displayEnabled !== true) errors.push('production layer must be valid and displayEnabled');
  if (layer.sourceDataUpdatedAt !== radarData?.updatedAt) errors.push('sourceDataUpdatedAt must match radar-data.updatedAt');
  if (layer.provider !== 'deepseek' || layer.mode !== 'external_ai_macro_risk_editorial') errors.push('provider/mode must identify DeepSeek macro editorial');
  if (layer.validation?.status !== 'pass') errors.push('validation.status must be pass');
  if (!['pass', 'warn'].includes(layer.qualityReview?.status)) errors.push('qualityReview.status must be pass or warn');
  if (layer.qualityReview?.promotionEligible !== false || layer.provenance?.humanApproved !== false) errors.push('promotion/human approval boundaries are invalid');
  if (!/^[a-f0-9]{64}$/u.test(layer.provenance?.inputDigest || '') || !/^[a-f0-9]{64}$/u.test(layer.provenance?.artifactDigest || '')) errors.push('provenance digests must be SHA-256');
  if (layer.freshness?.maxAgeHours !== PRODUCTION_MAX_AGE_HOURS || layer.freshness?.isStale !== false) errors.push('freshness contract is invalid');
  const generatedAt = Date.parse(layer.generatedAt || '');
  if (!Number.isFinite(generatedAt) || now.getTime() - generatedAt > PRODUCTION_MAX_AGE_HOURS * 60 * 60 * 1000) errors.push('production layer is stale');
  const falseBoundaries = ['affectsGfrrScoring', 'affectsRiskModules', 'affectsTailRiskOverlay', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance', 'affectsWorldOrder', 'affectsOdp', 'affectsBubbleWatch'];
  if (layer.boundaries?.displayOnly !== true || layer.boundaries?.frontendDisplayApproved !== true || layer.boundaries?.notInvestmentAdvice !== true) errors.push('visible display boundaries are invalid');
  for (const key of falseBoundaries) if (layer.boundaries?.[key] !== false) errors.push(`boundaries.${key} must be false`);
  const ledgerIds = new Set();
  for (const source of Array.isArray(layer.sourceLedger) ? layer.sourceLedger : []) {
    if (!source?.id || ledgerIds.has(source.id)) errors.push(`sourceLedger contains invalid/duplicate id ${source?.id}`);
    ledgerIds.add(source?.id);
    if (source?.kind === 'news' && (typeof source.url !== 'string' || !source.url.startsWith('https://'))) errors.push(`news source ${source.id} must use https`);
    if (Object.hasOwn(source || {}, 'snippet')) errors.push(`production source ${source.id} must not contain snippet`);
  }
  return { ok: errors.length === 0, errors };
}

export function applyEditorialProjection(radarData, layer, now = new Date()) {
  assertValid(validateEditorialProduction(layer, radarData, now), 'macro risk editorial production write');
  const next = structuredClone(radarData);
  next.macroRiskEditorialLayer = layer;
  const before = structuredClone(radarData);
  const after = structuredClone(next);
  delete before.macroRiskEditorialLayer;
  delete after.macroRiskEditorialLayer;
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('writer guard detected a change outside macroRiskEditorialLayer');
  return next;
}
