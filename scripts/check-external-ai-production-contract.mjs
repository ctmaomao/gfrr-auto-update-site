import fs from 'node:fs';

const DEFAULT_INPUT = 'docs/fixtures/external-ai/production-contract-valid-v28.0L.json';

const ALLOWED_STATUS = new Set(['disabled', 'unavailable', 'valid', 'rejected', 'stale', 'provider_failed']);
const ALLOWED_SOURCE_MODE = new Set(['manual_artifact', 'manual_local_compact', 'disabled']);
const ALLOWED_PROVIDER = new Set(['deepseek', null]);
const ALLOWED_INPUT_SOURCE = new Set(['local_compact', 'fixture_sample', null]);
const ALLOWED_SOURCE_SEMANTICS = new Set(['site_structured_data_compact_summary', 'sample_fixture', null]);
const ALLOWED_QUALITY_STATUS = new Set(['pass', 'warn', 'fail', 'not_run']);
const ALLOWED_RECOMMENDATION = new Set([
  'pass_for_manual_review',
  'needs_prompt_revision',
  'reject_for_promotion',
  'provider_failure_only',
  null,
]);
const ALLOWED_GENERATED_BY = new Set(['manual_workflow', 'disabled']);
const ALLOWED_CONFIDENCE_LEVEL = new Set(['low', 'medium', 'high']);
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const SHA1_HEX_PATTERN = /^[a-f0-9]{40}$/u;
const NUMERIC_STRING_PATTERN = /^\d+$/u;
const ISO_TIMESTAMP_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}T/u;

const REQUIRED_LAYER_FIELDS = [
  'schemaVersion',
  'status',
  'displayEnabled',
  'generatedAt',
  'updatedAt',
  'sourceMode',
  'provider',
  'model',
  'inputSource',
  'sourceSemantics',
  'summaryZh',
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'confidence',
  'qualityReview',
  'provenance',
  'freshness',
  'boundaries',
  'auditFlags',
];

const STRING_OR_NULL_FIELDS = ['generatedAt', 'updatedAt', 'summaryZh', 'model'];
const STRING_ARRAY_FIELDS = ['facts', 'inferences', 'dataGaps', 'invalidationSignals', 'auditFlags'];

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
};

const REQUIRED_PROVENANCE_FIELDS = [
  'runId',
  'artifactName',
  'artifactId',
  'artifactDigest',
  'sourceCommit',
  'sourceDataUpdatedAt',
  'inputArtifactPath',
  'outputArtifactPath',
  'qualityReviewArtifactPath',
  'generatedBy',
  'humanApproved',
];

const REQUIRED_FRESHNESS_FIELDS = [
  'artifactGeneratedAt',
  'sourceDataUpdatedAt',
  'maxAgeHours',
  'isStale',
  'staleReasonZh',
];

const REQUIRED_QUALITY_FIELDS = [
  'status',
  'recommendation',
  'promotionEligible',
  'failedDimensions',
  'warningDimensions',
  'reviewedAt',
];

const REQUIRED_SOURCE_ATTRIBUTION_FIELDS = ['sourceLayer', 'field', 'claimType', 'noteZh'];

const UNSAFE_CONTENT = [
  '执行灯',
  '执行',
  '仓位',
  '现金',
  '敞口',
  '交易',
  '买入',
  '卖出',
  '加仓',
  '减仓',
  '做多',
  '做空',
  '建仓',
  '平仓',
  '止损',
  '止盈',
  '操作信号',
  '行动信号',
  '交易信号',
  '配置建议',
  '风险动作',
  '风控动作',
];

const FORBIDDEN_SECRET_MARKERS = [
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

const REQUIRED_AUDIT_FLAGS = [
  'manual_artifact_only',
  'validator_required',
  'non_production_output',
  'no_frontend_display',
];

const PROSE_LIKE_AUDIT_FLAG = /[\s,.;:!?，。；：！？]/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value) {
  return typeof value === 'string' || value === null;
}

function addError(errors, message) {
  errors.push(message);
}

function validateOptionalStringPattern(value, pattern, message, errors) {
  if (value === null) return;
  if (typeof value !== 'string' || !pattern.test(value)) {
    addError(errors, message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function layerFromInput(input) {
  if (isPlainObject(input.externalAiInterpretationLayer)) return input.externalAiInterpretationLayer;
  return input;
}

function validateRequiredFields(layer, errors) {
  for (const field of REQUIRED_LAYER_FIELDS) {
    if (!(field in layer)) addError(errors, `missing required field: ${field}`);
  }

  if (typeof layer.schemaVersion !== 'string' || layer.schemaVersion.trim() === '') {
    addError(errors, 'schemaVersion must be a non-empty string');
  }

  if (!ALLOWED_STATUS.has(layer.status)) {
    addError(errors, `status must be one of ${[...ALLOWED_STATUS].join(', ')}`);
  }

  if (typeof layer.displayEnabled !== 'boolean') {
    addError(errors, 'displayEnabled must be boolean');
  }

  for (const field of STRING_OR_NULL_FIELDS) {
    if (field in layer && !isStringOrNull(layer[field])) {
      addError(errors, `${field} must be string or null`);
    }
  }

  if (!ALLOWED_SOURCE_MODE.has(layer.sourceMode)) {
    addError(errors, 'sourceMode must be manual_artifact, manual_local_compact, or disabled');
  }
  if (!ALLOWED_PROVIDER.has(layer.provider)) {
    addError(errors, 'provider must be deepseek or null');
  }
  if (!ALLOWED_INPUT_SOURCE.has(layer.inputSource)) {
    addError(errors, 'inputSource must be local_compact, fixture_sample, or null');
  }
  if (!ALLOWED_SOURCE_SEMANTICS.has(layer.sourceSemantics)) {
    addError(errors, 'sourceSemantics must be site_structured_data_compact_summary, sample_fixture, or null');
  }

  for (const field of STRING_ARRAY_FIELDS) {
    if (!Array.isArray(layer[field]) || !layer[field].every((item) => typeof item === 'string')) {
      addError(errors, `${field} must be an array of strings`);
    }
  }

  for (const field of ['modelJudgments', 'scenarioHypotheses']) {
    if (!Array.isArray(layer[field])) addError(errors, `${field} must be an array`);
  }
  if (!Array.isArray(layer.sourceAttribution) || !layer.sourceAttribution.every(isPlainObject)) {
    addError(errors, 'sourceAttribution must be an array of objects');
  }

  for (const field of ['confidence', 'qualityReview', 'provenance', 'freshness', 'boundaries']) {
    if (!isPlainObject(layer[field])) addError(errors, `${field} must be an object`);
  }
}

function validateBoundaries(boundaries, errors) {
  if (!isPlainObject(boundaries)) return;
  for (const [field, expected] of Object.entries(REQUIRED_BOUNDARIES)) {
    if (boundaries[field] !== expected) {
      addError(errors, `boundaries.${field} must be ${expected}`);
    }
  }
}

function validateDisplayApprovalPair(layer, errors) {
  if (!isPlainObject(layer.boundaries)) return;
  const frontendDisplayApproved = layer.boundaries.frontendDisplayApproved;

  if (typeof frontendDisplayApproved !== 'boolean') {
    addError(errors, 'boundaries.frontendDisplayApproved must be boolean');
    return;
  }

  if (layer.displayEnabled !== frontendDisplayApproved) {
    addError(errors, 'displayEnabled and boundaries.frontendDisplayApproved must be both false or both true');
    return;
  }

  if (layer.displayEnabled !== true) return;

  const qualityReview = isPlainObject(layer.qualityReview) ? layer.qualityReview : {};
  const freshness = isPlainObject(layer.freshness) ? layer.freshness : {};
  if (layer.status !== 'valid') {
    addError(errors, 'visible display requires status=valid');
  }
  if (!['pass', 'warn'].includes(qualityReview.status)) {
    addError(errors, 'visible display requires qualityReview.status pass or warn');
  }
  if (qualityReview.recommendation !== 'pass_for_manual_review') {
    addError(errors, 'visible display requires qualityReview.recommendation pass_for_manual_review');
  }
  if (qualityReview.promotionEligible !== false) {
    addError(errors, 'visible display requires qualityReview.promotionEligible=false');
  }
  if (freshness.isStale !== false) {
    addError(errors, 'visible display requires freshness.isStale=false');
  }
}

function validateQualityReview(layer, errors) {
  const qualityReview = layer.qualityReview;
  if (!isPlainObject(qualityReview)) return;

  for (const field of REQUIRED_QUALITY_FIELDS) {
    if (!(field in qualityReview)) addError(errors, `qualityReview.${field} is required`);
  }

  if (!ALLOWED_QUALITY_STATUS.has(qualityReview.status)) {
    addError(errors, 'qualityReview.status must be pass, warn, fail, or not_run');
  }
  if (!ALLOWED_RECOMMENDATION.has(qualityReview.recommendation)) {
    addError(errors, 'qualityReview.recommendation has an unsupported value');
  }
  if (qualityReview.promotionEligible !== false) {
    addError(errors, 'qualityReview.promotionEligible must be false');
  }
  if (!Array.isArray(qualityReview.failedDimensions)) {
    addError(errors, 'qualityReview.failedDimensions must be an array');
  }
  if (!Array.isArray(qualityReview.warningDimensions)) {
    addError(errors, 'qualityReview.warningDimensions must be an array');
  }
  if (!isStringOrNull(qualityReview.reviewedAt)) {
    addError(errors, 'qualityReview.reviewedAt must be string or null');
  }

  if (layer.status === 'valid' && !['pass', 'warn'].includes(qualityReview.status)) {
    addError(errors, 'status=valid requires qualityReview.status pass or warn');
  }
  if (layer.status === 'valid' && qualityReview.recommendation !== 'pass_for_manual_review') {
    addError(errors, 'status=valid requires qualityReview.recommendation pass_for_manual_review');
  }
  if (
    layer.status === 'valid' &&
    ['reject_for_promotion', 'needs_prompt_revision'].includes(qualityReview.recommendation)
  ) {
    addError(errors, 'status=valid is incompatible with reject_for_promotion or needs_prompt_revision');
  }
}

function validateProvenance(provenance, errors) {
  if (!isPlainObject(provenance)) return;

  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    if (!(field in provenance)) addError(errors, `provenance.${field} is required`);
  }

  for (const field of REQUIRED_PROVENANCE_FIELDS.filter((field) => field !== 'generatedBy' && field !== 'humanApproved')) {
    if (!isStringOrNull(provenance[field])) addError(errors, `provenance.${field} must be string or null`);
  }
  validateOptionalStringPattern(
    provenance.runId,
    NUMERIC_STRING_PATTERN,
    'provenance.runId must be a numeric string when present',
    errors,
  );
  validateOptionalStringPattern(
    provenance.artifactDigest,
    SHA256_HEX_PATTERN,
    'provenance.artifactDigest must be a 64-character lowercase SHA256 hex string when present',
    errors,
  );
  validateOptionalStringPattern(
    provenance.sourceCommit,
    SHA1_HEX_PATTERN,
    'provenance.sourceCommit must be a 40-character lowercase SHA1 hex string when present',
    errors,
  );
  validateOptionalStringPattern(
    provenance.sourceDataUpdatedAt,
    ISO_TIMESTAMP_PREFIX_PATTERN,
    'provenance.sourceDataUpdatedAt must be an ISO timestamp string when present',
    errors,
  );
  if (!ALLOWED_GENERATED_BY.has(provenance.generatedBy)) {
    addError(errors, 'provenance.generatedBy must be manual_workflow or disabled');
  }
  if (provenance.humanApproved !== false) {
    addError(errors, 'provenance.humanApproved must be false in this scaffold');
  }
}

function validateFreshness(layer, errors) {
  const freshness = layer.freshness;
  if (!isPlainObject(freshness)) return;

  for (const field of REQUIRED_FRESHNESS_FIELDS) {
    if (!(field in freshness)) addError(errors, `freshness.${field} is required`);
  }

  for (const field of ['artifactGeneratedAt', 'sourceDataUpdatedAt', 'staleReasonZh']) {
    if (!isStringOrNull(freshness[field])) addError(errors, `freshness.${field} must be string or null`);
  }
  if (!Number.isFinite(freshness.maxAgeHours)) {
    addError(errors, 'freshness.maxAgeHours must be a number');
  } else if (freshness.maxAgeHours > 24) {
    addError(errors, 'freshness.maxAgeHours must be <= 24');
  }
  if (typeof freshness.isStale !== 'boolean') {
    addError(errors, 'freshness.isStale must be boolean');
  }
  if (freshness.isStale === true && layer.status === 'valid') {
    addError(errors, 'stale artifacts must not have status=valid');
  }
  if (layer.status === 'stale' && freshness.isStale !== true) {
    addError(errors, 'status=stale requires freshness.isStale=true');
  }
}

function validateSourceAttribution(sourceAttribution, errors) {
  if (!Array.isArray(sourceAttribution)) return;

  for (const [index, item] of sourceAttribution.entries()) {
    if (!isPlainObject(item)) {
      addError(errors, `sourceAttribution[${index}] must be an object`);
      continue;
    }
    for (const field of REQUIRED_SOURCE_ATTRIBUTION_FIELDS) {
      if (typeof item[field] !== 'string' || item[field].trim() === '') {
        addError(errors, `sourceAttribution[${index}].${field} must be a non-empty string`);
      }
    }
    for (const phrase of UNSAFE_CONTENT) {
      if (typeof item.noteZh === 'string' && item.noteZh.includes(phrase)) {
        addError(errors, `sourceAttribution[${index}].noteZh contains unsafe wording: ${phrase}`);
      }
    }
  }
}

function validateConfidence(layer, errors) {
  const confidence = layer.confidence;
  if (!isPlainObject(confidence)) return;

  if (!ALLOWED_CONFIDENCE_LEVEL.has(confidence.level)) {
    addError(errors, 'confidence.level must be low, medium, or high');
  }
  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) {
    addError(errors, 'confidence.score must be a number between 0 and 100');
  }
  if (typeof confidence.reasonZh !== 'string' || confidence.reasonZh.trim() === '') {
    addError(errors, 'confidence.reasonZh must be a non-empty string');
  }
  if (confidence.level === 'high' && layer.sourceMode === 'manual_local_compact') {
    addError(errors, 'confidence.level=high is not allowed for manual_local_compact');
  }
}

function validateStatusBehavior(layer, errors) {
  if (layer.status === 'rejected' && layer.displayEnabled === true) {
    addError(errors, 'status=rejected must not have displayEnabled=true');
  }

  if (layer.status === 'provider_failed') {
    const contentFields = [
      layer.summaryZh,
      ...(Array.isArray(layer.facts) ? layer.facts : []),
      ...(Array.isArray(layer.inferences) ? layer.inferences : []),
      ...(Array.isArray(layer.modelJudgments) ? layer.modelJudgments : []),
      ...(Array.isArray(layer.scenarioHypotheses) ? layer.scenarioHypotheses : []),
    ];
    if (contentFields.some((item) => (typeof item === 'string' ? item.trim() !== '' : isPlainObject(item)))) {
      addError(errors, 'status=provider_failed must not carry provider output content as valid');
    }
  }
}

function collectStringValues(value, currentPath = '$', results = []) {
  if (typeof value === 'string') {
    results.push({ path: currentPath, value });
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringValues(item, `${currentPath}[${index}]`, results));
    return results;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStringValues(item, `${currentPath}.${key}`, results);
    }
  }
  return results;
}

function validateStringSafety(layer, errors) {
  for (const { path, value } of collectStringValues(layer)) {
    for (const phrase of UNSAFE_CONTENT) {
      if (value.includes(phrase)) addError(errors, `${path} contains unsafe wording: ${phrase}`);
    }
    for (const marker of FORBIDDEN_SECRET_MARKERS) {
      if (value.includes(marker)) addError(errors, `${path} contains forbidden secret/header marker: ${marker}`);
    }
  }
}

function validateAuditFlags(layer, errors) {
  const auditFlags = layer.auditFlags;
  if (!Array.isArray(auditFlags)) return;

  for (const flag of auditFlags) {
    if (typeof flag !== 'string') {
      addError(errors, 'auditFlags must contain strings only');
      continue;
    }
    if (PROSE_LIKE_AUDIT_FLAG.test(flag)) {
      addError(errors, `auditFlag must be a neutral tag, not prose: ${flag}`);
    }
    for (const phrase of UNSAFE_CONTENT) {
      if (flag.includes(phrase)) addError(errors, `auditFlag contains unsafe wording: ${phrase}`);
    }
  }

  for (const flag of REQUIRED_AUDIT_FLAGS) {
    if (!auditFlags.includes(flag)) addError(errors, `auditFlags must include ${flag}`);
  }

  if (layer.sourceMode === 'manual_local_compact' || layer.inputSource === 'local_compact') {
    if (!auditFlags.includes('site_structured_data_only')) {
      addError(errors, 'local_compact auditFlags must include site_structured_data_only');
    }
    if (auditFlags.includes('sample_input_only')) {
      addError(errors, 'local_compact auditFlags must not include sample_input_only');
    }
  }

  if (layer.inputSource === 'fixture_sample') {
    if (!auditFlags.includes('sample_input_only')) {
      addError(errors, 'fixture_sample auditFlags must include sample_input_only');
    }
    if (auditFlags.includes('site_structured_data_only')) {
      addError(errors, 'fixture_sample auditFlags must not include site_structured_data_only');
    }
  }
}

function validateLayer(layer) {
  const errors = [];

  if (!isPlainObject(layer)) {
    return ['externalAiInterpretationLayer must be an object'];
  }

  validateRequiredFields(layer, errors);
  validateBoundaries(layer.boundaries, errors);
  validateDisplayApprovalPair(layer, errors);
  validateQualityReview(layer, errors);
  validateProvenance(layer.provenance, errors);
  validateFreshness(layer, errors);
  validateSourceAttribution(layer.sourceAttribution, errors);
  validateConfidence(layer, errors);
  validateStatusBehavior(layer, errors);
  validateStringSafety(layer, errors);
  validateAuditFlags(layer, errors);

  return errors;
}

function parseArgs(argv) {
  const args = [...argv];
  const expectFail = args.includes('--expect-fail');
  const inputPath = args.filter((arg) => arg !== '--expect-fail')[0] ?? DEFAULT_INPUT;
  return { expectFail, inputPath };
}

function main() {
  const { expectFail, inputPath } = parseArgs(process.argv.slice(2));
  const input = readJson(inputPath);
  const errors = validateLayer(layerFromInput(input));

  if (expectFail) {
    if (errors.length === 0) {
      console.error('External AI production contract validation: expected failure but validation passed');
      process.exit(1);
    }
    console.log('External AI production contract validation: EXPECTED FAIL');
    return;
  }

  if (errors.length > 0) {
    console.error('External AI production contract validation: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('External AI production contract validation: PASS');
}

main();
