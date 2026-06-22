#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'firms-thermal-watch-review-p20';
const DEFAULT_FACILITIES_REVIEW = 'manual-artifacts/oil-thermal/firms-facilities-review-latest.json';
const DEFAULT_THERMAL_REVIEW = 'manual-artifacts/oil-thermal/firms-thermal-review-latest.json';
const DEFAULT_BASELINE_REVIEW = 'manual-artifacts/oil-thermal/firms-thermal-baseline-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-watch-review-latest.json';
const BOUNDARY =
  'manual thermal watch readiness review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const REVIEW_INPUTS = [
  {
    key: 'facilities',
    label: 'facility-list review',
    optionKey: 'facilitiesReview',
    expectedReviewVersion: 'firms-facilities-review-p18',
    defaultPath: DEFAULT_FACILITIES_REVIEW,
    required: true
  },
  {
    key: 'thermal',
    label: 'thermal artifact review',
    optionKey: 'thermalReview',
    expectedReviewVersion: 'firms-thermal-review-p17',
    defaultPath: DEFAULT_THERMAL_REVIEW,
    required: true
  },
  {
    key: 'baseline',
    label: 'thermal baseline review',
    optionKey: 'baselineReview',
    expectedReviewVersion: 'firms-thermal-baseline-review-p19',
    defaultPath: DEFAULT_BASELINE_REVIEW,
    required: false
  }
];

const PRODUCTION_IMPACT_FIELDS = [
  'writesProductionData',
  'modifiesFrontend',
  'affectsValues',
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsBrentPromotion',
  'affectsOdpFinalBias',
  'affectsGlobalRiskHeatmap',
  'affectsCrossValidation'
];

function printUsage() {
  console.log(`Usage:
  npm run review:firms-thermal-watch -- [options]

Options:
  --facilities-review <path>       Facility-list review artifact. Default: ${DEFAULT_FACILITIES_REVIEW}
  --thermal-review <path>          FIRMS thermal artifact review. Default: ${DEFAULT_THERMAL_REVIEW}
  --baseline-review <path>         FIRMS thermal baseline review. Default: ${DEFAULT_BASELINE_REVIEW}
  --output <path>                  Combined watch review artifact. Default: ${DEFAULT_OUTPUT}
  --require-baseline-review        Treat a missing baseline review as FAIL instead of WARN.
  --strict                         Exit non-zero on WARN or FAIL.
  --no-output                      Do not write the combined review artifact.
  --help                           Show this help.`);
}

function parseArgs(argv) {
  const options = {
    facilitiesReview: DEFAULT_FACILITIES_REVIEW,
    thermalReview: DEFAULT_THERMAL_REVIEW,
    baselineReview: DEFAULT_BASELINE_REVIEW,
    output: DEFAULT_OUTPUT,
    requireBaselineReview: false,
    strict: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--require-baseline-review') {
      options.requireBaselineReview = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--facilities-review') {
      options.facilitiesReview = nextValue();
    } else if (arg === '--thermal-review') {
      options.thermalReview = nextValue();
    } else if (arg === '--baseline-review') {
      options.baselineReview = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) {
    return null;
  }
  return relativePath.replace(/\\/g, '/');
}

function isManualOrFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(
    relativePath &&
      (relativePath.startsWith('manual-artifacts/') || relativePath.startsWith('docs/fixtures/'))
  );
}

function isSafeOutputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function readOptionalJson(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return {
      status: 'missing',
      path: absolutePath,
      data: null
    };
  }

  return {
    status: 'loaded',
    path: absolutePath,
    data: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function trueProductionImpactFields(review) {
  const impact = isPlainObject(review?.productionImpact) ? review.productionImpact : null;
  if (!impact) {
    return ['productionImpact_missing'];
  }

  return PRODUCTION_IMPACT_FIELDS.filter((field) => impact[field] !== false);
}

function hasExpectedBoundary(review) {
  const boundary = String(review?.boundary ?? '');
  return (
    boundary.includes('not production data') &&
    boundary.includes('not in values') &&
    boundary.includes('scoring') &&
    boundary.includes('decision') &&
    boundary.includes('Brent promotion') &&
    boundary.includes('ODP finalBias') &&
    boundary.includes('Global Risk Heatmap') &&
    boundary.includes('cross-validation')
  );
}

function addBlocker(review, message) {
  review.blockers.push(message);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function createBaseReview(options) {
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    inputs: {},
    status: 'pass',
    recommendation: 'manual_watch_pack_ready_no_signal',
    signalState: 'no_signal_observed',
    manualReviewReadiness: 'ready_for_human_review',
    futureIntegrationGate: {
      frontendDisplayApproved: false,
      scheduledWorkflowApproved: false,
      productionDataWriteApproved: false,
      requiredBeforeDisplay: [
        'separate reviewed PR for production schema and UI copy',
        'operator-reviewed facility list with no example rows',
        'fresh redacted facility diagnosis artifact',
        'baseline review or explicit stale/missing fallback state',
        'fail-closed wording that does not confirm incidents, outages, supply interruptions, war probability or oil-price forecasts'
      ]
    },
    readiness: {
      facilities: 'unknown',
      thermal: 'unknown',
      baseline: 'unknown'
    },
    summary: {
      facilityCount: null,
      regionCount: null,
      assetTypeCount: null,
      rowCount: null,
      latestAcqAt: null,
      repeatedObservationCount: null,
      elevatedRepeatedWatchCount: null
    },
    humanNextSteps: [],
    promotionEligible: false,
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    blockers: [],
    warnings: [],
    options: {
      requireBaselineReview: options.requireBaselineReview
    },
    boundary: BOUNDARY
  };
}

function summarizeInput(inputSpec, loadedReview, combinedReview, options) {
  const inputSummary = {
    path: loadedReview.path,
    loadStatus: loadedReview.status,
    expectedReviewVersion: inputSpec.expectedReviewVersion,
    reviewVersion: null,
    status: null,
    recommendation: null,
    promotionEligible: null
  };
  combinedReview.inputs[inputSpec.key] = inputSummary;

  const missingIsFatal = inputSpec.required || (inputSpec.key === 'baseline' && options.requireBaselineReview);
  if (loadedReview.status === 'missing') {
    combinedReview.readiness[inputSpec.key] = 'missing';
    const message = `${inputSpec.label} artifact not found: ${loadedReview.path}`;
    if (missingIsFatal) {
      addBlocker(combinedReview, message);
    } else {
      addWarning(combinedReview, message);
    }
    return null;
  }

  const data = loadedReview.data;
  inputSummary.reviewVersion = data?.reviewVersion ?? null;
  inputSummary.status = data?.status ?? null;
  inputSummary.recommendation = data?.recommendation ?? null;
  inputSummary.promotionEligible = data?.promotionEligible ?? null;

  if (!isPlainObject(data)) {
    addBlocker(combinedReview, `${inputSpec.label} artifact is not a JSON object.`);
    combinedReview.readiness[inputSpec.key] = 'fail';
    return null;
  }
  if (data.reviewVersion !== inputSpec.expectedReviewVersion) {
    addBlocker(
      combinedReview,
      `${inputSpec.label} has unexpected reviewVersion ${data.reviewVersion ?? '(missing)'}`
    );
  }
  if (!['pass', 'warn', 'fail'].includes(data.status)) {
    addBlocker(combinedReview, `${inputSpec.label} has invalid status ${data.status ?? '(missing)'}.`);
  }
  if (data.status === 'fail') {
    addBlocker(combinedReview, `${inputSpec.label} status is FAIL.`);
  } else if (data.status === 'warn') {
    addWarning(combinedReview, `${inputSpec.label} status is WARN: ${data.recommendation ?? 'review_required'}.`);
  }
  if (data.promotionEligible !== false) {
    addBlocker(combinedReview, `${inputSpec.label} must keep promotionEligible=false.`);
  }
  const trueImpact = trueProductionImpactFields(data);
  if (trueImpact.length > 0) {
    addBlocker(combinedReview, `${inputSpec.label} has unsafe productionImpact fields: ${trueImpact.join(', ')}.`);
  }
  if (!hasExpectedBoundary(data)) {
    addBlocker(combinedReview, `${inputSpec.label} boundary does not preserve the manual-only ODP exclusions.`);
  }
  if (!isManualOrFixturePath(inputSpec.path)) {
    addWarning(combinedReview, `${inputSpec.label} path is not under manual-artifacts/ or docs/fixtures/.`);
  }

  combinedReview.readiness[inputSpec.key] = data.status === 'fail' ? 'fail' : data.status === 'warn' ? 'warn' : 'pass';
  return data;
}

function extractSummary(reviews, combinedReview) {
  const facilityCoverage = reviews.facilities?.coverage ?? {};
  const requestBudget = reviews.facilities?.requestBudget ?? {};
  const thermalSummary = reviews.thermal?.summary ?? {};
  const baselineSummary = reviews.baseline?.summary ?? {};

  combinedReview.summary = {
    facilityCount: finiteNumber(facilityCoverage.facilityCount ?? requestBudget.facilityCount),
    regionCount: finiteNumber(facilityCoverage.regionCount),
    assetTypeCount: finiteNumber(facilityCoverage.assetTypeCount),
    estimatedRequestsPerRun: finiteNumber(requestBudget.estimatedRequestsPerRun),
    rowCount: finiteNumber(thermalSummary.rowCount),
    latestAcqAt: thermalSummary.latestAcqAt ?? null,
    maxFrp: finiteNumber(thermalSummary.maxFrp),
    highConfidenceCount: finiteNumber(thermalSummary.highConfidenceCount),
    watchFacilityIds: Array.isArray(thermalSummary.watchFacilityIds) ? thermalSummary.watchFacilityIds : [],
    elevatedFacilityIds: Array.isArray(thermalSummary.elevatedFacilityIds) ? thermalSummary.elevatedFacilityIds : [],
    repeatedObservationCount: finiteNumber(baselineSummary.repeatedObservationCount),
    elevatedRepeatedWatchCount: finiteNumber(baselineSummary.elevatedRepeatedWatchCount),
    missingBaselineCount: finiteNumber(baselineSummary.missingBaselineCount)
  };
}

function inferSignalState(reviews, combinedReview) {
  const summary = combinedReview.summary;
  if (combinedReview.blockers.length > 0) {
    return 'blocked';
  }
  if ((summary.elevatedRepeatedWatchCount ?? 0) > 0) {
    return 'elevated_repeated_watch';
  }
  if ((summary.repeatedObservationCount ?? 0) > 0) {
    return 'repeated_watch';
  }
  if (summary.elevatedFacilityIds.length > 0 || reviews.thermal?.recommendation === 'elevated_manual_review_required') {
    return 'heuristic_elevated_without_baseline_confirmation';
  }
  if (summary.watchFacilityIds.length > 0 || (summary.rowCount ?? 0) > 0) {
    return 'single_pass_or_unbaselined_watch';
  }
  return 'no_signal_observed';
}

function deriveNextSteps(combinedReview) {
  const steps = [];
  if (combinedReview.blockers.length > 0) {
    steps.push('Fix blocking review artifacts before using this watch pack for human analysis.');
  }
  if (combinedReview.readiness.facilities === 'warn') {
    steps.push('Clean up the facility list: remove examples, confirm metadata, and keep each bbox small.');
  }
  if (combinedReview.readiness.baseline === 'missing' || (combinedReview.summary.missingBaselineCount ?? 0) > 0) {
    steps.push('Build or update the ignored manual baseline before treating repeated observations as meaningful.');
  }
  if (['elevated_repeated_watch', 'repeated_watch', 'heuristic_elevated_without_baseline_confirmation'].includes(combinedReview.signalState)) {
    steps.push('Manually cross-check facility operations, local incident reports, AIS/chokepoint context and market structure before writing narrative text.');
  }
  if (combinedReview.signalState === 'single_pass_or_unbaselined_watch') {
    steps.push('Treat detections as one-pass or unbaselined noise until repeatability and baseline exceedance are confirmed.');
  }
  steps.push('Open a separate reviewed PR before any production display, scheduled workflow, data contract, ODP build input, or frontend copy is added.');
  return [...new Set(steps)];
}

function finalizeReview(review) {
  review.signalState = inferSignalState(
    {
      facilities: review._sourceReviews?.facilities,
      thermal: review._sourceReviews?.thermal,
      baseline: review._sourceReviews?.baseline
    },
    review
  );

  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'reject_watch_pack';
    review.manualReviewReadiness = 'blocked';
  } else if (review.signalState === 'elevated_repeated_watch') {
    review.status = 'warn';
    review.recommendation = 'elevated_manual_review_required';
    review.manualReviewReadiness = 'ready_for_human_review';
  } else if (review.signalState === 'repeated_watch' || review.signalState === 'heuristic_elevated_without_baseline_confirmation') {
    review.status = 'warn';
    review.recommendation = 'manual_review_required';
    review.manualReviewReadiness = 'ready_for_human_review';
  } else if (review.signalState === 'single_pass_or_unbaselined_watch') {
    review.status = 'warn';
    review.recommendation = 'baseline_or_repeatability_cleanup_required';
    review.manualReviewReadiness = 'needs_cleanup';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = 'manual_cleanup_recommended';
    review.manualReviewReadiness = 'needs_cleanup';
  } else {
    review.status = 'pass';
    review.recommendation = 'manual_watch_pack_ready_no_signal';
    review.manualReviewReadiness = 'ready_for_human_review';
  }

  review.humanNextSteps = deriveNextSteps(review);
  delete review._sourceReviews;
  review.promotionEligible = false;
  return review;
}

function createWatchReview(options) {
  const combinedReview = createBaseReview(options);
  const sourceReviews = {};

  for (const inputSpec of REVIEW_INPUTS) {
    const path = options[inputSpec.optionKey];
    const loaded = readOptionalJson(path);
    const data = summarizeInput({ ...inputSpec, path }, loaded, combinedReview, options);
    if (data) {
      sourceReviews[inputSpec.key] = data;
    }
  }

  combinedReview._sourceReviews = sourceReviews;
  extractSummary(sourceReviews, combinedReview);
  return finalizeReview(combinedReview);
}

function writeReview(outputPath, review) {
  if (!isSafeOutputPath(outputPath)) {
    throw new Error(`Unsafe output path rejected: ${outputPath}`);
  }
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, `${JSON.stringify(review, null, 2)}\n`);
  return absoluteOutputPath;
}

function printReview(review, outputPath) {
  console.log(`FIRMS thermal watch review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`signalState: ${review.signalState}`);
  console.log(`manualReviewReadiness: ${review.manualReviewReadiness}`);
  console.log('promotionEligible: false');
  console.log(`facilityCount: ${review.summary.facilityCount ?? 'unknown'}`);
  console.log(`rowCount: ${review.summary.rowCount ?? 'unknown'}`);
  console.log(`repeatedObservationCount: ${review.summary.repeatedObservationCount ?? 'unknown'}`);
  console.log(`elevatedRepeatedWatchCount: ${review.summary.elevatedRepeatedWatchCount ?? 'unknown'}`);
  console.log(`warnings: ${review.warnings.length}`);
  review.warnings.slice(0, 5).forEach((warning, index) => {
    console.log(`warning[${index}]: ${warning}`);
  });
  console.log(`blockers: ${review.blockers.length}`);
  review.blockers.slice(0, 5).forEach((blocker, index) => {
    console.log(`blocker[${index}]: ${blocker}`);
  });
  if (outputPath) {
    console.log(`output: ${outputPath}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = createWatchReview(options);
  const outputPath = options.writeOutput ? writeReview(options.output, review) : null;
  printReview(review, outputPath);

  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('FIRMS thermal watch review: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
