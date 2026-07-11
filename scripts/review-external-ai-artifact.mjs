import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { OPERATION_LANGUAGE_PHRASES } from './external-ai/safety-constants.mjs';
import {
  isAllowedExternalAiSourceLayer,
  normalizeAnalystSourceLayerReference,
} from './external-ai/source-layers.mjs';
import {
  ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG,
  summarizeAnalystPr4StructuredFields,
  validateAnalystPr4StructuredFields,
} from './external-ai/pr4-schema-canary.mjs';
import { assertManualArtifactWritePath } from './lib/check-script-helpers.mjs';

const REVIEW_VERSION = 'v28.0K-4F';
const DEFAULT_INPUT = 'manual-artifacts/external-ai/deepseek-output-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/external-ai-quality-review-latest.json';
const UNSUPPORTED_EXTERNAL_CLAIMS = [
  '已接入新闻验证',
  '已经外部验证',
  '外部市场数据确认',
  '实时新闻显示',
  'external news verified',
  'external market data confirms'
];
const REQUIRED_BOOLEAN_BOUNDARIES = {
  displayOnly: true,
  externalAiGenerated: true,
  usesExternalAiApi: true,
  affectsScoring: false,
  affectsDecisionModel: false,
  affectsExecutionLock: false,
  affectsPositionGuidance: false,
  notInvestmentAdvice: true
};
const PRODUCTION_IMPACT = {
  writesProductionData: false,
  modifiesFrontend: false,
  affectsScoring: false,
  affectsDecisionModel: false,
  affectsExecutionLock: false,
  affectsPositionGuidance: false
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--input') {
      options.input = nextValue();
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--strict') {
      options.strict = true;
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  return options;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function writeJsonFile(outputPath, value) {
  const resolvedOutput = assertManualArtifactWritePath(outputPath, 'manual-artifacts/external-ai/');
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  assertManualArtifactWritePath(resolvedOutput, 'manual-artifacts/external-ai/');
  await fs.writeFile(resolvedOutput, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function lowerIncludesAny(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

function getFailureClassification(data) {
  if (isPlainObject(data.failureClassification)) return data.failureClassification;

  const responseError = isPlainObject(data.responseDiagnostics?.error) ? data.responseDiagnostics.error : {};
  if (
    responseError.code === 'service_unavailable_error' ||
    responseError.type === 'service_unavailable_error' ||
    /HTTP 503/i.test(data.message || '')
  ) {
    return {
      category: 'provider_unavailable',
      recommendedAction: 'Stop repeated paid calls and retry later.'
    };
  }

  if (
    data.requestDiagnostics?.likelyCause === 'timeout_or_abort' ||
    /aborted|timed out/i.test(data.message || '')
  ) {
    return {
      category: 'provider_timeout',
      recommendedAction: 'Use compact input, review input size, and retry once later with --timeout-ms 120000.'
    };
  }

  return {
    category: 'provider_unknown_error',
    recommendedAction: 'Inspect failure artifact.'
  };
}

function runValidator(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/check-external-ai-output.mjs', inputPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function createBaseReview(inputPath, data) {
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      path: inputPath,
      contractVersion: typeof data.contractVersion === 'string' ? data.contractVersion : null,
      provider: typeof data.provider === 'string' ? data.provider : null,
      model: typeof data.model === 'string' ? data.model : null,
      kind: typeof data.kind === 'string' ? data.kind : null
    },
    status: 'fail',
    recommendation: 'reject_for_promotion',
    promotionEligible: false,
    important: 'This review does not promote output to production.',
    scores: {
      semanticIntegrity: 'pass',
      executionLanguageSafety: 'pass',
      unsupportedExternalClaims: 'pass',
      sourceAttributionCoverage: 'pass',
      confidenceReasonableness: 'pass',
      structureQuality: 'pass',
      pr4SchemaCanary: 'pass',
      incrementalValue: 'pass'
    },
    errors: [],
    warnings: [],
    notes: [],
    productionImpact: { ...PRODUCTION_IMPACT },
    nextAllowedStep: 'No promotion is allowed from this artifact. A later reviewed integration PR is required.'
  };
}

function classifySourceSemantics(data) {
  const sourceAttribution = Array.isArray(data.sourceAttribution) ? data.sourceAttribution : [];
  const serializedAttribution = JSON.stringify(sourceAttribution);
  const serializedAll = JSON.stringify({
    summaryZh: data.summaryZh,
    auditFlags: data.auditFlags,
    confidence: data.confidence,
    sourceAttribution
  });

  const hasSiteStructured =
    serializedAttribution.includes('site_structured_data') ||
    serializedAttribution.includes('站内结构化数据') ||
    serializedAll.includes('site_structured_data_only');
  const hasSample =
    serializedAttribution.includes('sample_input') ||
    serializedAttribution.includes('样例输入') ||
    serializedAttribution.includes('样例结构化输入') ||
    serializedAll.includes('sample_input_only');
  const isAnalystCompact =
    serializedAll.includes('analyst_compact_v1') ||
    serializedAll.includes('site_structured_analyst_evidence_pack');
  const isPr4SchemaCanary =
    serializedAll.includes(ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG);

  return {
    appearsSiteStructured: hasSiteStructured,
    appearsSample: hasSample,
    isAnalystCompact,
    isPr4SchemaCanary
  };
}

function markScore(review, scoreName, severity, message) {
  if (severity === 'fail') {
    review.scores[scoreName] = 'fail';
    review.errors.push(message);
    return;
  }

  if (severity === 'warn' && review.scores[scoreName] !== 'fail') {
    review.scores[scoreName] = 'warn';
    review.warnings.push(message);
  }
}

function reviewSemanticIntegrity(data, review, sourceSemantics, strings) {
  const allText = strings.map((item) => item.value).join('\n');
  if (sourceSemantics.appearsSiteStructured && /样例输入|样例结构化输入/.test(allText)) {
    markScore(review, 'semanticIntegrity', 'fail', 'Live/local site-structured output contains sample-input wording.');
  }
  if (sourceSemantics.appearsSiteStructured && allText.includes('未接入实时市场数据')) {
    markScore(review, 'semanticIntegrity', 'fail', 'Site-structured output says real-time market data is not connected.');
  }
  if (data.kind === 'external_ai_manual_test_failure_artifact') {
    markScore(review, 'semanticIntegrity', 'fail', 'Provider failure artifact must not be reviewed as valid output.');
  }
}

function reviewExecutionLanguageSafety(review, strings) {
  for (const { path: stringPath, value } of strings) {
    const matches = lowerIncludesAny(value, OPERATION_LANGUAGE_PHRASES);
    for (const phrase of matches) {
      markScore(review, 'executionLanguageSafety', 'fail', `${stringPath} contains operation-oriented language: ${phrase}`);
    }
  }
}

function runSelfTests() {
  for (const phrase of ['禁止新增', '新增仓位', '现金缓冲', '风险敞口', '敞口带', '总风险敞口', '执行交易']) {
    if (!OPERATION_LANGUAGE_PHRASES.includes(phrase)) {
      throw new Error(`self-test failed: operation language phrase missing from canonical safety constants: ${phrase}`);
    }
  }

  const review = createBaseReview('self-test.json', {});
  reviewExecutionLanguageSafety(review, [{ path: '$.summaryZh', value: '这里包含执行交易措辞' }]);
  if (review.scores.executionLanguageSafety !== 'fail') {
    throw new Error('self-test failed: operation language should fail quality review');
  }

  const analystReview = createBaseReview('self-test.json', {});
  reviewSourceAttributionCoverage(
    {
      sourceAttribution: [
        { sourceLayer: 'macroDrivers.rateVol', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'decisionContext.sanitized', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'marketPricing', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'scenarioTree', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'dataQuality', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'modules', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'worldOrderStress', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
        { sourceLayer: 'oilDirectionalPressure', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
      ],
    },
    analystReview,
    { appearsSiteStructured: true, appearsSample: false, isAnalystCompact: true }
  );
  if (analystReview.scores.sourceAttributionCoverage === 'fail') {
    throw new Error(`self-test failed: analyst sourceLayer coverage should not fail: ${analystReview.errors.join('; ')}`);
  }

  const pr4Review = createBaseReview('self-test.json', {});
  reviewPr4SchemaCanary(
    {
      auditFlags: ['analyst_compact_v1', ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG],
      crossLayerSynthesis: [
        {
          theme: 'energy_pricing_divergence',
          summaryZh: '能源实物层与定价层存在背离观察。',
          supportingLayers: ['oilDirectionalPressure', 'macroDrivers.rateVol'],
          conflictingLayers: ['marketPricing'],
          confidence: 'low',
        },
      ],
      keyDivergences: [
        {
          titleZh: '能源与风险定价不一致',
          evidenceFor: ['oilDirectionalPressure.finalBias', 'macroDrivers.rateVol.move'],
          evidenceAgainst: ['marketPricing.primaryAssetStatus'],
          whyItMattersZh: '该背离影响解释层置信度。',
          invalidationConditions: ['相关层同步收敛'],
        },
      ],
      scenarioLean: {
        leanZh: '偏观察情景',
        scenarioRefs: ['scenarioTree[0]'],
        triggerConditions: ['背离继续扩大'],
        invalidationConditions: ['数据质量恢复且背离收敛'],
        confidence: 'medium',
      },
      dataQualityLens: {
        summaryZh: 'fallback 层降低整体置信。',
        staleLayers: [],
        fallbackLayers: ['dataQuality', 'macroDrivers.rateVol'],
        missingLayers: [],
        confidenceImpactZh: '数据质量使结论维持低至中低置信。',
      },
    },
    pr4Review,
    { isPr4SchemaCanary: true }
  );
  if (pr4Review.scores.pr4SchemaCanary === 'fail') {
    throw new Error(`self-test failed: PR4 schema canary review should not fail: ${pr4Review.errors.join('; ')}`);
  }
  if (pr4Review.pr4SchemaCanaryMetrics.caps.itemCounts.crossLayerSynthesis !== 1) {
    throw new Error('self-test failed: PR4 schema canary review should report cap metrics');
  }

  const pr4CapReview = createBaseReview('self-test.json', {});
  const capOverflow = {
    auditFlags: ['analyst_compact_v1', ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG],
    crossLayerSynthesis: [
      {
        theme: 'energy_pricing_divergence',
        summaryZh: '能源实物层与定价层存在背离观察。',
        supportingLayers: ['oilDirectionalPressure', 'macroDrivers.rateVol', 'marketPricing', 'dataQuality'],
        conflictingLayers: ['marketPricing'],
        confidence: 'low',
      },
    ],
    keyDivergences: [],
    scenarioLean: {
      leanZh: '偏观察情景',
      scenarioRefs: ['scenarioTree[0]'],
      triggerConditions: ['背离继续扩大'],
      invalidationConditions: ['数据质量恢复且背离收敛'],
      confidence: 'medium',
    },
    dataQualityLens: {
      summaryZh: 'fallback 层降低整体置信。',
      staleLayers: [],
      fallbackLayers: ['dataQuality'],
      missingLayers: [],
      confidenceImpactZh: '数据质量使结论维持低置信。',
    },
  };
  reviewPr4SchemaCanary(capOverflow, pr4CapReview, { isPr4SchemaCanary: true });
  if (pr4CapReview.scores.pr4SchemaCanary !== 'fail' || !pr4CapReview.pr4SchemaCanaryMetrics.caps.anyCapViolation) {
    throw new Error('self-test failed: PR4 schema canary review should fail cap violations');
  }
}

function reviewUnsupportedExternalClaims(review, strings) {
  for (const { path: stringPath, value } of strings) {
    const matches = lowerIncludesAny(value, UNSUPPORTED_EXTERNAL_CLAIMS);
    for (const phrase of matches) {
      markScore(review, 'unsupportedExternalClaims', 'fail', `${stringPath} claims unsupported external verification: ${phrase}`);
    }
  }
}

function reviewSourceAttributionCoverage(data, review, sourceSemantics) {
  const sourceAttribution = Array.isArray(data.sourceAttribution) ? data.sourceAttribution : [];
  const minimumAttributions = sourceSemantics.isAnalystCompact ? 8 : 5;
  const minimumDistinctLayers = sourceSemantics.isAnalystCompact ? 5 : 3;

  if (sourceAttribution.length < minimumAttributions) {
    markScore(
      review,
      'sourceAttributionCoverage',
      'warn',
      `sourceAttribution has fewer than ${minimumAttributions} items.`
    );
  }

  const distinctLayers = new Set();
  for (const item of sourceAttribution) {
    if (isPlainObject(item) && typeof item.sourceLayer === 'string' && item.sourceLayer.length > 0) {
      const sourceLayer = sourceSemantics.isAnalystCompact
        ? normalizeAnalystSourceLayerReference(item.sourceLayer)
        : item.sourceLayer;
      distinctLayers.add(sourceLayer);
      if (!isAllowedExternalAiSourceLayer(sourceLayer, { analyst: sourceSemantics.isAnalystCompact })) {
        markScore(
          review,
          'sourceAttributionCoverage',
          'fail',
          `sourceAttribution contains unsupported sourceLayer for this input: ${item.sourceLayer}`
        );
      }
    }
  }
  if (distinctLayers.size < minimumDistinctLayers) {
    markScore(
      review,
      'sourceAttributionCoverage',
      'warn',
      `sourceAttribution covers fewer than ${minimumDistinctLayers} distinct sourceLayer values.`
    );
  }

  if (sourceSemantics.appearsSiteStructured && sourceAttribution.some((item) => item?.claimType === 'sample_input')) {
    markScore(review, 'sourceAttributionCoverage', 'warn', 'site-structured output still contains sample_input source attribution.');
  }

  if (
    sourceSemantics.appearsSiteStructured &&
    !sourceAttribution.some((item) => typeof item?.noteZh === 'string' && item.noteZh.includes('站内结构化数据'))
  ) {
    markScore(review, 'sourceAttributionCoverage', 'warn', 'site-structured output sourceAttribution.noteZh lacks 站内结构化数据.');
  }
}

function reviewConfidenceReasonableness(data, review, sourceSemantics) {
  const confidence = isPlainObject(data.confidence) ? data.confidence : {};
  const score = typeof confidence.score === 'number' ? confidence.score : null;
  const level = typeof confidence.level === 'string' ? confidence.level.toLowerCase() : null;
  const reasonZh = typeof confidence.reasonZh === 'string' ? confidence.reasonZh : '';
  const sourceAttribution = Array.isArray(data.sourceAttribution) ? data.sourceAttribution : [];
  const weakAttribution = sourceAttribution.length < 5 || new Set(sourceAttribution.map((item) => item?.sourceLayer).filter(Boolean)).size < 3;

  if (sourceSemantics.appearsSiteStructured && score === 0) {
    markScore(review, 'confidenceReasonableness', 'warn', 'confidence.score is 0 despite apparent live/local site-structured input.');
  }
  if (level === 'high' && weakAttribution) {
    markScore(review, 'confidenceReasonableness', 'fail', 'confidence.level is high while source attribution is weak.');
  }
  if (sourceSemantics.isAnalystCompact && level === 'high') {
    markScore(review, 'confidenceReasonableness', 'fail', 'analyst_compact_v1 output must not use confidence.level=high.');
  }
  if (sourceSemantics.isAnalystCompact && typeof score === 'number' && score > 45) {
    markScore(review, 'confidenceReasonableness', 'fail', 'analyst_compact_v1 confidence.score must be <= 45.');
  }
  if (sourceSemantics.isAnalystCompact && typeof score === 'number' && score > 40 && weakAttribution) {
    markScore(review, 'confidenceReasonableness', 'warn', 'analyst_compact_v1 confidence.score above 40 requires stronger source attribution.');
  }
  if (typeof score === 'number' && score > 60) {
    markScore(review, 'confidenceReasonableness', 'warn', 'confidence.score is above 60 without external independent verification.');
  }
  if (sourceSemantics.appearsSiteStructured && /样例输入|样例结构化输入/.test(reasonZh)) {
    markScore(review, 'confidenceReasonableness', 'warn', 'confidence.reasonZh mentions sample input for apparent site-structured output.');
  }
}

function reviewStructureQuality(data, review) {
  const minimums = [
    ['facts', 3],
    ['inferences', 2],
    ['modelJudgments', 2],
    ['scenarioHypotheses', 1],
    ['dataGaps', 1],
    ['invalidationSignals', 1]
  ];

  for (const [field, minimum] of minimums) {
    if (countArray(data[field]) < minimum) {
      markScore(review, 'structureQuality', 'warn', `${field} has fewer than ${minimum} item(s).`);
    }
  }

  const scenarios = Array.isArray(data.scenarioHypotheses) ? data.scenarioHypotheses : [];
  scenarios.forEach((scenario, index) => {
    if (!Array.isArray(scenario?.triggerConditions) || !Array.isArray(scenario?.invalidationConditions)) {
      markScore(review, 'structureQuality', 'warn', `scenarioHypotheses[${index}] is missing triggerConditions or invalidationConditions.`);
    }
  });
}

function reviewPr4SchemaCanary(data, review, sourceSemantics) {
  const summary = summarizeAnalystPr4StructuredFields(data);
  review.pr4SchemaCanaryMetrics = summary;

  const hasAnyPr4Field = summary.presentFields.length > 0;
  const requireAll = sourceSemantics.isPr4SchemaCanary === true;
  const validationErrors = validateAnalystPr4StructuredFields(data, { requireAll });

  for (const error of validationErrors) {
    markScore(review, 'pr4SchemaCanary', 'fail', `PR4 schema canary field error: ${error}`);
  }

  if (!requireAll && !hasAnyPr4Field) return;

  if (requireAll && summary.missingFields.length > 0) {
    markScore(
      review,
      'pr4SchemaCanary',
      'fail',
      `PR4 schema canary is missing fields: ${summary.missingFields.join(', ')}`
    );
  }

  if (summary.invalidLayerReferences.length > 0) {
    markScore(
      review,
      'pr4SchemaCanary',
      'fail',
      `PR4 schema canary contains non-canonical sourceLayer references: ${summary.invalidLayerReferences.join(', ')}`
    );
  }

  if (requireAll && summary.caps.anyCapViolation) {
    markScore(
      review,
      'pr4SchemaCanary',
      'fail',
      `PR4 schema canary exceeds output caps: ${summary.caps.capViolations.map((item) => `${item.path}=${item.length}/${item.max}`).join(', ')}`
    );
  }

  if (requireAll && summary.totalLayerReferences < 4) {
    markScore(review, 'pr4SchemaCanary', 'warn', 'PR4 schema canary has fewer than 4 layer references.');
  }
  if (requireAll && summary.distinctCanonicalLayers.length < 3) {
    markScore(review, 'pr4SchemaCanary', 'warn', 'PR4 schema canary covers fewer than 3 distinct canonical sourceLayer values.');
  }
  if (requireAll && countArray(data.crossLayerSynthesis) === 0) {
    markScore(review, 'pr4SchemaCanary', 'warn', 'PR4 schema canary crossLayerSynthesis is empty.');
  }
  if (requireAll && countArray(data.keyDivergences) === 0) {
    markScore(review, 'pr4SchemaCanary', 'warn', 'PR4 schema canary keyDivergences is empty.');
  }
}

function reviewBoundaries(data, review) {
  const boundaries = isPlainObject(data.boundaries) ? data.boundaries : {};
  const isSampleFixture =
    data.provider === 'sample' ||
    (typeof data.contractVersion === 'string' && data.contractVersion.includes('sample'));
  for (const [field, expected] of Object.entries(REQUIRED_BOOLEAN_BOUNDARIES)) {
    if (boundaries[field] !== expected) {
      if (isSampleFixture && (field === 'externalAiGenerated' || field === 'usesExternalAiApi')) {
        markScore(review, 'semanticIntegrity', 'warn', `sample fixture boundaries.${field} is ${boundaries[field]}; real provider output must be ${expected}.`);
        continue;
      }
      markScore(review, 'semanticIntegrity', 'fail', `boundaries.${field} must be ${expected}.`);
    }
  }
}

function reviewIncrementalValue(data, review, sourceSemantics) {
  const synthesisText = JSON.stringify({
    summaryZh: data.summaryZh,
    inferences: data.inferences,
    modelJudgments: data.modelJudgments,
    scenarioHypotheses: data.scenarioHypotheses
  });
  const layerSignals = [
    /brentPricingLayer|Brent|布伦特/i,
    /divergenceLayer|背离/i,
    /macroDrivers\.consumer|consumer|消费者/i,
    /worldOrderStress|world order|地缘|秩序/i,
    /marketConfirmation|market confirmation|市场确认/i,
    /dailyBrief|macroState|宏观/i,
    /dataHealth|freshness|数据健康|新鲜度/i,
    /rate|rates|利率|美债/i,
    /scenarioTree|情景|触发|证伪/i,
    /transmissionChain|传导/i,
    /regimeProbabilities|regime|概率/i,
    /marketPricing|定价/i,
    /oilDirectionalPressure|oilDirectional|ODP|原油方向/i,
    /worldOrderStress|worldOrder|秩序/i,
    /dataQuality|fallback|stale|missing|数据质量/i
  ];
  const layersMentioned = layerSignals.filter((pattern) => pattern.test(synthesisText)).length;
  const minimumEvidenceFamilies = sourceSemantics.isAnalystCompact ? 3 : 2;

  if (typeof data.summaryZh !== 'string' || data.summaryZh.trim().length === 0) {
    markScore(review, 'incrementalValue', 'warn', 'summaryZh is missing or empty.');
  }
  if (layersMentioned < minimumEvidenceFamilies) {
    markScore(review, 'incrementalValue', 'warn', 'artifact appears to repeat facts with limited cross-layer synthesis.');
  }
}

function finalizeReview(review) {
  const scores = Object.values(review.scores);
  const hasFail = scores.includes('fail');
  const hasWarn = scores.includes('warn');
  review.failedDimensions = Object.entries(review.scores)
    .filter(([, score]) => score === 'fail')
    .map(([dimension]) => dimension);
  review.warningDimensions = Object.entries(review.scores)
    .filter(([, score]) => score === 'warn')
    .map(([dimension]) => dimension);

  if (review.scores.executionLanguageSafety === 'fail' || review.scores.unsupportedExternalClaims === 'fail') {
    review.status = 'fail';
    review.recommendation = 'reject_for_promotion';
  } else if (hasFail) {
    review.status = 'fail';
    review.recommendation = 'needs_prompt_revision';
  } else if (hasWarn) {
    review.status = 'warn';
    review.recommendation = 'needs_prompt_revision';
  } else {
    review.status = 'pass';
    review.recommendation = 'pass_for_manual_review';
  }

  review.promotionEligible = false;
  return review;
}

function printReviewDetails(review, stream) {
  if (Array.isArray(review.failedDimensions) && review.failedDimensions.length > 0) {
    stream.write(`failedDimensions: ${review.failedDimensions.join(',')}\n`);
  }
  if (Array.isArray(review.warningDimensions) && review.warningDimensions.length > 0) {
    stream.write(`warningDimensions: ${review.warningDimensions.join(',')}\n`);
  }

  const errors = Array.isArray(review.errors) ? review.errors : [];
  errors.slice(0, 5).forEach((error, index) => {
    stream.write(`error[${index}]: ${error}\n`);
  });

  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  warnings.slice(0, 5).forEach((warning, index) => {
    stream.write(`warning[${index}]: ${warning}\n`);
  });
}

function createFailureArtifactReview(inputPath, data) {
  const classification = getFailureClassification(data);
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      path: inputPath,
      contractVersion: typeof data.contractVersion === 'string' ? data.contractVersion : null,
      provider: typeof data.provider === 'string' ? data.provider : null,
      model: typeof data.providerMetadata?.model === 'string' ? data.providerMetadata.model : null,
      kind: typeof data.kind === 'string' ? data.kind : null
    },
    status: 'provider_failure_only',
    recommendation: 'provider_failure_only',
    promotionEligible: false,
    important: 'This review does not promote output to production.',
    reasonZh: '该 artifact 是 provider failure artifact，不是有效 external AI 输出。',
    failureCategory: classification.category || 'provider_unknown_error',
    recommendedAction: classification.recommendedAction || 'Inspect failure artifact.',
    productionImpact: { ...PRODUCTION_IMPACT },
    nextAllowedStep: 'Inspect provider diagnostics. Do not retry repeatedly and do not promote this artifact.'
  };
}

async function reviewValidOutput(inputPath, outputPath, data) {
  const review = createBaseReview(inputPath, data);
  const validator = await runValidator(inputPath);
  if (validator.code !== 0) {
    review.scores.semanticIntegrity = 'fail';
    review.errors.push('check:external-ai-output failed; artifact is not a valid external AI output.');
    review.notes.push('Validator output is intentionally not embedded in full. Run check:external-ai-output manually for details.');
    return finalizeReview(review);
  }

  const strings = collectStrings(data);
  const sourceSemantics = classifySourceSemantics(data);

  reviewSemanticIntegrity(data, review, sourceSemantics, strings);
  reviewExecutionLanguageSafety(review, strings);
  reviewUnsupportedExternalClaims(review, strings);
  reviewSourceAttributionCoverage(data, review, sourceSemantics);
  reviewConfidenceReasonableness(data, review, sourceSemantics);
  reviewStructureQuality(data, review);
  reviewPr4SchemaCanary(data, review, sourceSemantics);
  reviewBoundaries(data, review);
  reviewIncrementalValue(data, review, sourceSemantics);

  review.notes.push(`reviewArtifactPath=${outputPath}`);
  if (sourceSemantics.appearsSiteStructured) review.notes.push('sourceSemantics=site_structured_data');
  if (sourceSemantics.appearsSample) review.notes.push('sourceSemanticsIncludesSampleMarkers=true');
  if (sourceSemantics.isAnalystCompact) review.notes.push('sourceSemantics=analyst_compact_v1');
  if (sourceSemantics.isPr4SchemaCanary) review.notes.push(`sourceSemantics=${ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG}`);

  return finalizeReview(review);
}

function printReviewResult(review, outputPath) {
  if (review.recommendation === 'provider_failure_only') {
    console.log('External AI artifact quality review: PROVIDER_FAILURE_ONLY');
    console.log('recommendation: provider_failure_only');
    console.log('promotionEligible: false');
    console.log(`failureCategory: ${review.failureCategory}`);
    console.log(`output: ${outputPath}`);
    return;
  }

  if (review.status === 'pass') {
    console.log('External AI artifact quality review: PASS');
    console.log('recommendation: pass_for_manual_review');
    console.log('promotionEligible: false');
    console.log(`output: ${outputPath}`);
    return;
  }

  if (review.status === 'warn') {
    console.log('External AI artifact quality review: WARN');
    console.log('recommendation: needs_prompt_revision');
    console.log('promotionEligible: false');
    console.log(`warnings: ${review.warnings.length}`);
    printReviewDetails(review, process.stdout);
    console.log(`output: ${outputPath}`);
    return;
  }

  console.error('External AI artifact quality review: FAIL');
  console.error(`recommendation: ${review.recommendation}`);
  console.error('promotionEligible: false');
  console.error(`errors: ${review.errors.length}`);
  printReviewDetails(review, process.stderr);
  console.error(`output: ${outputPath}`);
}

async function main() {
  runSelfTests();

  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  try {
    assertManualArtifactWritePath(options.output, 'manual-artifacts/external-ai/');
  } catch (error) {
    fail(error.message);
    return;
  }

  let data;
  try {
    data = JSON.parse(await fs.readFile(options.input, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail('External AI artifact quality review: FAIL\nreason: input artifact not found');
      return;
    }
    fail(`External AI artifact quality review: FAIL\nreason: failed to read or parse input artifact: ${error.message}`);
    return;
  }

  const review = data?.kind === 'external_ai_manual_test_failure_artifact'
    ? createFailureArtifactReview(options.input, data)
    : await reviewValidOutput(options.input, options.output, data);

  try {
    await writeJsonFile(options.output, review);
  } catch (error) {
    fail(error.message);
    return;
  }

  printReviewResult(review, options.output);

  if (options.strict && review.recommendation !== 'pass_for_manual_review') {
    process.exitCode = 1;
    return;
  }
  if (review.status === 'fail') {
    process.exitCode = 1;
  }
}

await main();
