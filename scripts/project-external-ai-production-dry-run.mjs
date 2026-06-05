import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT,
  EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT,
  EXTERNAL_AI_PRODUCTION_MODEL,
} from './external-ai/production-contract.mjs';
import { isAllowedExternalAiProductionSourceLayer } from './external-ai/source-layers.mjs';

const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-output-v28.0K-1.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/external-ai-production-projection-latest.json';

const REQUIRED_INPUT_FIELDS = [
  'contractVersion',
  'provider',
  'model',
  'summaryZh',
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'confidence',
  'boundaries',
  'auditFlags',
];

const ARRAY_INPUT_FIELDS = [
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'auditFlags',
];

const SECRET_MARKERS = [
  'DEEPSEEK_API_KEY',
  'Authorization',
  'Bearer',
  'GITHUB_TOKEN',
  '.env',
  'rawHeaders',
  'rawResponse',
  'requestHeaders',
  'responseHeaders',
];

const FORBIDDEN_OUTPUT_TARGETS = [
  'data',
  'realtime',
  'config',
  'workers',
  'scripts/modules',
  'scripts/app.js',
  'index.html',
];

const REQUIRED_BOUNDARIES = {
  displayOnly: true,
  externalAiGenerated: true,
  usesExternalAiApi: true,
  affectsScoring: false,
  affectsDecisionModel: false,
  affectsExecutionLock: false,
  affectsPositionGuidance: false,
  notInvestmentAdvice: true,
  productionWriteApproved: false,
  frontendDisplayApproved: false,
};

const DEFAULT_DISPLAY_STATE = {
  displayEnabled: false,
  frontendDisplayApproved: false,
  sourceDataUpdatedAt: null,
};

const FALLBACK_QUALITY_REVIEW = {
  status: 'pass',
  recommendation: 'pass_for_manual_review',
  promotionEligible: false,
  failedDimensions: [],
  warningDimensions: [],
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePathForReport(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    review: null,
    preserveDisplayStateFrom: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      options.input = argv[++index];
    } else if (arg === '--output') {
      options.output = argv[++index];
    } else if (arg === '--review') {
      options.review = argv[++index];
    } else if (arg === '--preserve-display-state-from') {
      options.preserveDisplayStateFrom = argv[++index];
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  for (const [key, value] of Object.entries(options)) {
    if (!['review', 'preserveDisplayStateFrom'].includes(key) && (typeof value !== 'string' || value.trim() === '')) {
      throw new Error(`--${key} must be a non-empty path`);
    }
  }

  return options;
}

function readDisplayStateFrom(filePath) {
  if (!filePath) return DEFAULT_DISPLAY_STATE;

  const data = readJson(filePath);
  const layer = data?.externalAiInterpretationLayer;
  const boundaries = layer?.boundaries;
  if (!isPlainObject(layer) || !isPlainObject(boundaries)) {
    throw new Error('--preserve-display-state-from requires externalAiInterpretationLayer with boundaries');
  }
  if (typeof layer.displayEnabled !== 'boolean' || typeof boundaries.frontendDisplayApproved !== 'boolean') {
    throw new Error('preserved display state must use boolean displayEnabled and frontendDisplayApproved');
  }
  if (layer.displayEnabled !== boundaries.frontendDisplayApproved) {
    throw new Error('preserved display state is invalid: displayEnabled and frontendDisplayApproved must match');
  }

  return {
    displayEnabled: layer.displayEnabled,
    frontendDisplayApproved: boundaries.frontendDisplayApproved,
    sourceDataUpdatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonWithRaw(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    raw,
    value: JSON.parse(raw),
  };
}

function collectStrings(value, currentPath = '$', results = []) {
  if (typeof value === 'string') {
    results.push({ path: currentPath, value });
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${currentPath}[${index}]`, results));
    return results;
  }

  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${currentPath}.${key}`, results);
    }
  }

  return results;
}

function assertNoSecretMarkers(value, label) {
  for (const { path: stringPath, value: text } of collectStrings(value)) {
    for (const marker of SECRET_MARKERS) {
      if (text.includes(marker)) {
        throw new Error(`${label}${stringPath} contains forbidden secret/header marker: ${marker}`);
      }
    }
  }
}

function assertSafeOutputPath(outputPath) {
  const repoRoot = process.cwd();
  const resolvedOutput = path.resolve(outputPath);
  const allowedRoot = path.resolve('manual-artifacts/external-ai');
  const relativeToRepo = normalizePathForReport(path.relative(repoRoot, resolvedOutput));

  if (relativeToRepo.startsWith('..') || path.isAbsolute(relativeToRepo)) {
    throw new Error('output must stay inside this repository');
  }

  for (const forbidden of FORBIDDEN_OUTPUT_TARGETS) {
    if (relativeToRepo === forbidden || relativeToRepo.startsWith(`${forbidden}/`)) {
      throw new Error(`refusing unsafe output path: ${relativeToRepo}`);
    }
  }

  const relativeToAllowed = path.relative(allowedRoot, resolvedOutput);
  if (relativeToAllowed.startsWith('..') || path.isAbsolute(relativeToAllowed)) {
    throw new Error('output must be under manual-artifacts/external-ai/');
  }

  return { resolvedOutput, relativeToRepo };
}

function validateInputArtifact(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    throw new Error('input external AI artifact must be a JSON object');
  }

  for (const field of REQUIRED_INPUT_FIELDS) {
    if (!(field in input)) errors.push(`missing required input field: ${field}`);
  }

  for (const field of ['contractVersion', 'provider', 'model', 'summaryZh']) {
    if (field in input && (typeof input[field] !== 'string' || input[field].trim() === '')) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of ARRAY_INPUT_FIELDS) {
    if (field in input && !Array.isArray(input[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  if (!isPlainObject(input.confidence)) errors.push('confidence must be an object');
  if (!isPlainObject(input.boundaries)) errors.push('boundaries must be an object');

  if (errors.length > 0) {
    throw new Error(`input validation failed:\n- ${errors.join('\n- ')}`);
  }

  assertNoSecretMarkers(input, 'input');
}

function textFromItem(item, fallbackLabel) {
  if (typeof item === 'string') return item;
  if (isPlainObject(item)) {
    for (const key of ['textZh', 'summaryZh', 'detailZh', 'conditionZh', 'interpretationZh', 'messageZh']) {
      if (typeof item[key] === 'string' && item[key].trim() !== '') return item[key];
    }
    if (typeof item.source === 'string' && item.source.trim() !== '') return item.source;
  }
  throw new Error(`${fallbackLabel} must be a string or an object with text metadata`);
}

function projectStringArray(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  return items.map((item, index) => textFromItem(item, `${label}[${index}]`));
}

function detectSourceMapping(input) {
  const serialized = JSON.stringify(input).toLowerCase();
  const auditFlags = Array.isArray(input.auditFlags) ? input.auditFlags : [];
  const sampleLike =
    input.provider === 'sample' ||
    input.contractVersion?.includes('sample') ||
    serialized.includes('sample_input_only') ||
    serialized.includes('sample input') ||
    serialized.includes('sample-input') ||
    serialized.includes('sample-output') ||
    serialized.includes('sample-output-contract');

  if (sampleLike) {
    return {
      sourceMode: 'manual_artifact',
      inputSource: 'fixture_sample',
      sourceSemantics: 'sample_fixture',
      schemaVersion: EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.schemaVersion,
      sourceFlags: ['sample_input_only'],
      forbiddenSourceFlag: 'site_structured_data_only',
      sourceLayer: 'fixture_sample',
      claimType: 'sample_input',
      note: 'Sample input only; non-production projection dry-run source.',
      preserveSourceLayer: false,
      fixture: true,
    };
  }

  const analystLike =
    auditFlags.includes('analyst_compact_v1') ||
    input.mode === 'analyst_compact_v1' ||
    serialized.includes('analyst_compact_v1') ||
    serialized.includes('site_structured_analyst_evidence_pack_v1');

  if (analystLike) {
    return {
      ...EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT,
      sourceFlags: EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.requiredAuditFlags,
      forbiddenSourceFlag: 'sample_input_only',
      sourceLayer: null,
      claimType: 'site_structured_data',
      note: '来自站内结构化数据',
      preserveSourceLayer: true,
      fixture: false,
    };
  }

  return {
    ...EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT,
    sourceFlags: EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.requiredAuditFlags,
    forbiddenSourceFlag: 'sample_input_only',
    sourceLayer: 'local_compact',
    claimType: 'site_structured_data',
    note: 'Site structured data only; non-production projection dry-run source.',
    preserveSourceLayer: false,
    fixture: false,
  };
}

function projectSourceAttribution(items, mapping) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('sourceAttribution must be a non-empty array');
  }

  return items.map((item, index) => {
    if (mapping.preserveSourceLayer) {
      if (!isPlainObject(item)) {
        throw new Error(`sourceAttribution[${index}] must be an object for analyst_compact_v1 projection`);
      }
      if (typeof item.sourceLayer !== 'string' || item.sourceLayer.trim() === '') {
        throw new Error(`sourceAttribution[${index}].sourceLayer is required for analyst_compact_v1 projection`);
      }
      if (!isAllowedExternalAiProductionSourceLayer(item.sourceLayer, { analyst: true })) {
        throw new Error(`sourceAttribution[${index}].sourceLayer is not allowed for analyst_compact_v1 projection: ${item.sourceLayer}`);
      }
      if (typeof item.field !== 'string' || item.field.trim() === '') {
        throw new Error(`sourceAttribution[${index}].field is required for analyst_compact_v1 projection`);
      }
      if (typeof item.claimType !== 'string' || item.claimType.trim() === '') {
        throw new Error(`sourceAttribution[${index}].claimType is required for analyst_compact_v1 projection`);
      }
      return {
        sourceLayer: item.sourceLayer,
        field: item.field,
        claimType: item.claimType,
        noteZh: mapping.note,
      };
    }

    if (isPlainObject(item)) {
      return {
        sourceLayer: mapping.sourceLayer,
        field: typeof item.field === 'string' && item.field.trim() !== '' ? item.field : `sourceAttribution[${index}]`,
        claimType:
          typeof item.claimType === 'string' && item.claimType.trim() !== '' ? item.claimType : mapping.claimType,
        noteZh: mapping.note,
      };
    }

    if (typeof item === 'string' && item.trim() !== '') {
      return {
        sourceLayer: mapping.sourceLayer,
        field: `sourceAttribution[${index}]`,
        claimType: mapping.claimType,
        noteZh: mapping.note,
      };
    }

    throw new Error(`sourceAttribution[${index}] must be an object or non-empty string`);
  });
}

function projectConfidence(confidence, mapping) {
  if (!isPlainObject(confidence)) throw new Error('confidence must be an object');
  if (!['low', 'medium', 'high'].includes(confidence.level)) {
    throw new Error('confidence.level must be low, medium, or high');
  }
  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) {
    throw new Error('confidence.score must be a number between 0 and 100');
  }
  if (mapping.sourceMode === 'manual_local_compact' && confidence.level === 'high') {
    throw new Error('confidence.level=high is not allowed for manual_local_compact projection');
  }
  if (mapping.inputSource === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.inputSource) {
    if (confidence.level === 'high') {
      throw new Error('confidence.level=high is not allowed for analyst_compact_v1 projection');
    }
    if (confidence.score > EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.maxConfidenceScore) {
      throw new Error(`confidence.score must be <= ${EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.maxConfidenceScore} for analyst_compact_v1 projection`);
    }
  }
  if (typeof confidence.reasonZh !== 'string' || confidence.reasonZh.trim() === '') {
    throw new Error('confidence.reasonZh must be a non-empty string');
  }

  return {
    level: confidence.level,
    score: confidence.score,
    reasonZh: confidence.reasonZh,
  };
}

function projectQualityReview(reviewPath, generatedAt, mapping) {
  if (!reviewPath) {
    if (mapping.inputSource !== 'fixture_sample') {
      throw new Error('non-fixture projection requires --review quality review artifact');
    }

    // Deterministic fixture dry-run only. Real production projection must map an actual quality review artifact.
    return {
      ...FALLBACK_QUALITY_REVIEW,
      failedDimensions: [],
      warningDimensions: [],
      reviewedAt: generatedAt,
    };
  }

  const review = readJson(reviewPath);
  assertNoSecretMarkers(review, 'review');
  const status = review.status ?? review.qualityReview?.status;
  const recommendation = review.recommendation ?? review.qualityReview?.recommendation;
  const promotionEligible = review.promotionEligible ?? review.qualityReview?.promotionEligible;
  const failedDimensions = review.failedDimensions ?? review.qualityReview?.failedDimensions ?? [];
  const warningDimensions = review.warningDimensions ?? review.qualityReview?.warningDimensions ?? [];
  const reviewedAt = review.reviewedAt ?? review.qualityReview?.reviewedAt ?? generatedAt;

  if (!['pass', 'warn', 'fail', 'not_run'].includes(status)) {
    throw new Error('quality review status must be pass, warn, fail, or not_run');
  }
  if (
    !['pass_for_manual_review', 'needs_prompt_revision', 'reject_for_promotion', 'provider_failure_only', null].includes(
      recommendation,
    )
  ) {
    throw new Error('quality review recommendation is unsupported');
  }
  if (promotionEligible !== false) {
    throw new Error('quality review promotionEligible must be false');
  }
  if (!Array.isArray(failedDimensions) || !Array.isArray(warningDimensions)) {
    throw new Error('quality review dimensions must be arrays');
  }
  if (status === 'fail' || status === 'not_run') {
    throw new Error('quality review must pass or warn before projection');
  }
  if (recommendation !== 'pass_for_manual_review') {
    throw new Error('quality review recommendation must be pass_for_manual_review before projection');
  }

  return {
    status,
    recommendation,
    promotionEligible: false,
    failedDimensions,
    warningDimensions,
    reviewedAt,
  };
}

function projectAuditFlags(mapping) {
  return [
    'manual_artifact_only',
    ...mapping.sourceFlags,
    'validator_required',
    'non_production_output',
    'no_frontend_display',
  ].filter((flag) => flag !== mapping.forbiddenSourceFlag);
}

function buildProvenance({ deepseekOutputJsonString, radarDataUpdatedAt }) {
  const runId = process.env.GITHUB_RUN_ID || null;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || null;
  const sourceCommit = process.env.GITHUB_SHA || null;
  const artifactName = runId ? `external-ai-production-refresh-${runId}` : null;
  const artifactId = runId && runAttempt ? `${runId}-${runAttempt}` : runId || null;
  const artifactDigest = deepseekOutputJsonString
    ? createHash('sha256').update(deepseekOutputJsonString).digest('hex')
    : null;

  return {
    runId,
    artifactName,
    artifactId,
    artifactDigest,
    sourceCommit,
    sourceDataUpdatedAt: radarDataUpdatedAt || null,
  };
}

function buildProjection({ input, inputPath, outputPath, reviewPath, generatedAt, displayState, deepseekOutputJsonString }) {
  const mapping = detectSourceMapping(input);
  const qualityReview = projectQualityReview(reviewPath, generatedAt, mapping);
  const facts = projectStringArray(input.facts, 'facts');
  const inferences = projectStringArray(input.inferences, 'inferences');
  const dataGaps = projectStringArray(input.dataGaps, 'dataGaps');
  const invalidationSignals = projectStringArray(input.invalidationSignals, 'invalidationSignals');
  const provenance = buildProvenance({
    deepseekOutputJsonString,
    radarDataUpdatedAt: displayState.sourceDataUpdatedAt,
  });

  const layer = {
    schemaVersion: mapping.schemaVersion,
    status: 'valid',
    displayEnabled: displayState.displayEnabled,
    generatedAt,
    updatedAt: generatedAt,
    sourceMode: mapping.sourceMode,
    provider: 'deepseek',
    model: input.provider === 'sample' ? EXTERNAL_AI_PRODUCTION_MODEL : input.model,
    inputSource: mapping.inputSource,
    sourceSemantics: mapping.sourceSemantics,
    summaryZh: input.summaryZh,
    facts,
    inferences,
    modelJudgments: input.modelJudgments,
    scenarioHypotheses: input.scenarioHypotheses,
    dataGaps,
    invalidationSignals,
    sourceAttribution: projectSourceAttribution(input.sourceAttribution, mapping),
    confidence: projectConfidence(input.confidence, mapping),
    qualityReview,
    provenance: {
      ...provenance,
      inputArtifactPath: normalizePathForReport(inputPath),
      outputArtifactPath: normalizePathForReport(outputPath),
      qualityReviewArtifactPath: reviewPath ? normalizePathForReport(reviewPath) : null,
      generatedBy: 'manual_workflow',
      humanApproved: false,
    },
    freshness: {
      artifactGeneratedAt: generatedAt,
      sourceDataUpdatedAt: null,
      maxAgeHours: 24,
      isStale: false,
      staleReasonZh: null,
    },
    boundaries: {
      ...REQUIRED_BOUNDARIES,
      frontendDisplayApproved: displayState.frontendDisplayApproved,
    },
    auditFlags: projectAuditFlags(mapping),
  };

  if (layer.model !== EXTERNAL_AI_PRODUCTION_MODEL) {
    throw new Error(`model must be ${EXTERNAL_AI_PRODUCTION_MODEL}`);
  }

  assertNoSecretMarkers(layer, 'projection');

  return {
    externalAiInterpretationLayer: layer,
  };
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function runRegressionChecks() {
  const analystMapping = {
    ...EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT,
    sourceFlags: EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.requiredAuditFlags,
    forbiddenSourceFlag: 'sample_input_only',
    sourceLayer: null,
    claimType: 'site_structured_data',
    note: '来自站内结构化数据',
    preserveSourceLayer: true,
    fixture: false,
  };
  const projectedAnalyst = projectSourceAttribution(
    [
      {
        sourceLayer: 'oilDirectionalPressure',
        field: 'signals.dieselProductStress',
        claimType: 'site_structured_data',
        noteZh: '来自站内结构化数据',
      },
    ],
    analystMapping,
  );
  if (projectedAnalyst[0].sourceLayer !== 'oilDirectionalPressure') {
    throw new Error('regression failed: analyst projection must preserve canonical sourceLayer');
  }
  assertThrows(
    () => projectSourceAttribution([{ field: 'x', claimType: 'site_structured_data' }], analystMapping),
    'regression failed: analyst projection accepted missing sourceLayer',
  );

  const legacyMapping = detectSourceMapping({ auditFlags: ['site_structured_data_only'] });
  const projectedLegacy = projectSourceAttribution(
    [
      {
        sourceLayer: 'oilDirectionalPressure',
        field: 'signals.dieselProductStress',
        claimType: 'site_structured_data',
      },
    ],
    legacyMapping,
  );
  if (projectedLegacy[0].sourceLayer !== 'local_compact') {
    throw new Error('regression failed: legacy projection must keep local_compact collapse');
  }
}

function main() {
  try {
    runRegressionChecks();
    const options = parseArgs(process.argv.slice(2));
    const { resolvedOutput, relativeToRepo } = assertSafeOutputPath(options.output);
    const resolvedInput = path.resolve(options.input);
    const resolvedReview = options.review ? path.resolve(options.review) : null;
    const { raw: deepseekOutputJsonString, value: input } = readJsonWithRaw(resolvedInput);
    const displayState = readDisplayStateFrom(options.preserveDisplayStateFrom);

    validateInputArtifact(input);

    const generatedAt = new Date().toISOString();
    const projection = buildProjection({
      input,
      inputPath: options.input,
      outputPath: relativeToRepo,
      reviewPath: options.review,
      generatedAt,
      displayState,
      deepseekOutputJsonString,
    });

    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(projection, null, 2)}\n`);

    const layer = projection.externalAiInterpretationLayer;
    console.log('External AI production projection dry-run: PASS');
    console.log(`input: ${normalizePathForReport(options.input)}`);
    console.log(`output: ${relativeToRepo}`);
    console.log(`status: ${layer.status}`);
    console.log('productionDataWritten: false');
    console.log('frontendDisplayChanged: false');
    console.log('artifactOnly: true');
    console.log(`promotionEligible: ${layer.qualityReview.promotionEligible}`);
  } catch (error) {
    console.error('External AI production projection dry-run: FAIL');
    console.error(error.message);
    process.exit(1);
  }
}

main();
