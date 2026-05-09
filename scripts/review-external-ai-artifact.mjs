import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'v28.0K-4F';
const DEFAULT_INPUT = 'manual-artifacts/external-ai/deepseek-output-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/external-ai-quality-review-latest.json';
const UNSAFE_OUTPUT_DIRS = [
  'data',
  'realtime',
  'config',
  'workers',
  'scripts/modules',
  '.github/workflows'
];
const UNSAFE_OUTPUT_FILES = new Set([
  'index.html',
  'scripts/app.js'
]);
const OPERATION_LANGUAGE_PHRASES = [
  '执行灯',
  '禁止新增',
  '新增仓位',
  '现金缓冲',
  '风险敞口',
  '敞口带',
  '总风险敞口',
  '仓位',
  '买入',
  '卖出',
  '加仓',
  '减仓',
  '满仓',
  '清仓',
  '立即执行',
  '执行交易'
];
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

function isUnsafeOutputPath(outputPath) {
  const absoluteOutput = path.resolve(outputPath);
  const cwd = process.cwd();
  const relative = path.relative(cwd, absoluteOutput);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return true;

  const normalizedRelative = relative.split(path.sep).join('/');
  if (!normalizedRelative.startsWith('manual-artifacts/')) return true;

  return (
    UNSAFE_OUTPUT_FILES.has(normalizedRelative) ||
    UNSAFE_OUTPUT_DIRS.some((unsafeDir) => normalizedRelative === unsafeDir || normalizedRelative.startsWith(`${unsafeDir}/`))
  );
}

async function writeJsonFile(outputPath, value) {
  if (isUnsafeOutputPath(outputPath)) {
    throw new Error(`unsafe output path rejected: ${outputPath}`);
  }
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

  return {
    appearsSiteStructured: hasSiteStructured,
    appearsSample: hasSample
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
  if (sourceAttribution.length < 5) {
    markScore(review, 'sourceAttributionCoverage', 'warn', 'sourceAttribution has fewer than 5 items.');
  }

  const distinctLayers = new Set();
  for (const item of sourceAttribution) {
    if (isPlainObject(item) && typeof item.sourceLayer === 'string' && item.sourceLayer.length > 0) {
      distinctLayers.add(item.sourceLayer);
    }
  }
  if (distinctLayers.size < 3) {
    markScore(review, 'sourceAttributionCoverage', 'warn', 'sourceAttribution covers fewer than 3 distinct sourceLayer values.');
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

function reviewIncrementalValue(data, review) {
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
    /rate|rates|利率|美债/i
  ];
  const layersMentioned = layerSignals.filter((pattern) => pattern.test(synthesisText)).length;

  if (typeof data.summaryZh !== 'string' || data.summaryZh.trim().length === 0) {
    markScore(review, 'incrementalValue', 'warn', 'summaryZh is missing or empty.');
  }
  if (layersMentioned < 2) {
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
  reviewBoundaries(data, review);
  reviewIncrementalValue(data, review);

  review.notes.push(`reviewArtifactPath=${outputPath}`);
  if (sourceSemantics.appearsSiteStructured) review.notes.push('sourceSemantics=site_structured_data');
  if (sourceSemantics.appearsSample) review.notes.push('sourceSemanticsIncludesSampleMarkers=true');

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
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  if (isUnsafeOutputPath(options.output)) {
    fail(`unsafe output path rejected: ${options.output}`);
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
