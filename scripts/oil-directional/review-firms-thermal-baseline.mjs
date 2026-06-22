#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'firms-thermal-baseline-review-p19';
const DEFAULT_INPUT = 'manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json';
const DEFAULT_BASELINE = 'manual-artifacts/oil-thermal/firms-thermal-baseline.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-baseline-review-latest.json';
const DEFAULT_MIN_BASELINE_SAMPLES = 5;
const DEFAULT_MIN_REPEAT_SOURCES = 2;
const BOUNDARY =
  'manual thermal-baseline review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:firms-thermal-baseline -- [options]

Options:
  --input <path>                 FIRMS facility diagnosis artifact. Default: ${DEFAULT_INPUT}
  --baseline <path>              Manual baseline JSON. Default: ${DEFAULT_BASELINE}
  --output <path>                Review artifact path. Default: ${DEFAULT_OUTPUT}
  --min-baseline-samples <n>     Minimum baseline samples before using p95 comparisons. Default: ${DEFAULT_MIN_BASELINE_SAMPLES}
  --min-repeat-sources <n>       Sources with detections needed for repeat-observation watch. Default: ${DEFAULT_MIN_REPEAT_SOURCES}
  --require-baseline             Treat missing baseline file or facility baseline as FAIL.
  --strict                       Exit non-zero on WARN or FAIL.
  --no-output                    Do not write the review artifact.
  --help                         Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    baseline: DEFAULT_BASELINE,
    output: DEFAULT_OUTPUT,
    minBaselineSamples: DEFAULT_MIN_BASELINE_SAMPLES,
    minRepeatSources: DEFAULT_MIN_REPEAT_SOURCES,
    requireBaseline: false,
    strict: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--require-baseline') {
      options.requireBaseline = true;
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

    if (arg === '--input') {
      options.input = nextValue();
    } else if (arg === '--baseline') {
      options.baseline = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--min-baseline-samples') {
      options.minBaselineSamples = Number(nextValue());
    } else if (arg === '--min-repeat-sources') {
      options.minRepeatSources = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.minBaselineSamples) || options.minBaselineSamples < 1 || options.minBaselineSamples > 365) {
    throw new Error('Invalid --min-baseline-samples. Expected 1..365.');
  }
  if (!Number.isInteger(options.minRepeatSources) || options.minRepeatSources < 1 || options.minRepeatSources > 4) {
    throw new Error('Invalid --min-repeat-sources. Expected 1..4.');
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

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBaselineFile(rawBaseline) {
  const rawFacilities = Array.isArray(rawBaseline?.facilities)
    ? rawBaseline.facilities
    : Object.entries(rawBaseline?.facilitiesById ?? {}).map(([id, value]) => ({ id, ...value }));
  const facilities = new Map();

  for (const item of rawFacilities) {
    const id = String(item?.id ?? '').trim();
    if (!id) {
      continue;
    }
    facilities.set(id, {
      id,
      sampleCount: finiteNumber(item.sampleCount ?? item.samples),
      rowCountP95: finiteNumber(item.rowCountP95),
      maxFrpP95: finiteNumber(item.maxFrpP95),
      highConfidenceCountP95: finiteNumber(item.highConfidenceCountP95),
      sourcesWithDetectionsP95: finiteNumber(item.sourcesWithDetectionsP95),
      frpOver50CountP95: finiteNumber(item.frpOver50CountP95),
      lastUpdatedAt: item.lastUpdatedAt ?? null
    });
  }

  return {
    schemaVersion: typeof rawBaseline?.schemaVersion === 'string' ? rawBaseline.schemaVersion : null,
    generatedAt: typeof rawBaseline?.generatedAt === 'string' ? rawBaseline.generatedAt : null,
    baselineWindowDays: finiteNumber(rawBaseline?.baselineWindowDays),
    facilities
  };
}

function loadBaseline(options) {
  if (!existsSync(resolve(options.baseline))) {
    return {
      status: 'missing_file',
      baseline: null
    };
  }
  return {
    status: 'loaded',
    baseline: normalizeBaselineFile(readJsonFile(options.baseline))
  };
}

function createBaseReview(options, diagnosis, baselineResolution) {
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      path: resolve(options.input),
      schemaVersion: typeof diagnosis.schemaVersion === 'string' ? diagnosis.schemaVersion : null,
      mode: typeof diagnosis.mode === 'string' ? diagnosis.mode : null,
      manualArtifactPath: isManualArtifactPath(options.input)
    },
    baseline: {
      path: resolve(options.baseline),
      status: baselineResolution.status,
      schemaVersion: baselineResolution.baseline?.schemaVersion ?? null,
      baselineWindowDays: baselineResolution.baseline?.baselineWindowDays ?? null,
      minBaselineSamples: options.minBaselineSamples,
      minRepeatSources: options.minRepeatSources,
      requireBaseline: options.requireBaseline
    },
    status: 'pass',
    recommendation: 'baseline_ok_no_repeated_signal',
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
    summary: {},
    facilities: [],
    blockers: [],
    warnings: [],
    boundary: BOUNDARY
  };
}

function addBlocker(review, message) {
  review.blockers.push(message);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function aboveBaseline(currentValue, baselineValue) {
  if (currentValue === null || baselineValue === null) {
    return false;
  }
  return currentValue > baselineValue;
}

function evaluateFacility(facility, baselineItem, options) {
  const aggregate = isPlainObject(facility.aggregate) ? facility.aggregate : {};
  const current = {
    rowCount: finiteNumber(aggregate.rowCount) ?? 0,
    maxFrp: finiteNumber(aggregate.maxFrp),
    highConfidenceCount: finiteNumber(aggregate.highConfidenceCount) ?? 0,
    frpOver50Count: finiteNumber(aggregate.frpOver50Count) ?? 0,
    sourcesWithDetections: finiteNumber(aggregate.sourcesWithDetections) ?? 0,
    anomalyLevel: aggregate.anomalyLevel ?? null,
    sourceAgreement: aggregate.sourceAgreement ?? null
  };

  if (!baselineItem) {
    return {
      id: facility.id,
      label: facility.label ?? null,
      baselineStatus: 'missing_facility_baseline',
      current,
      repeatedObservation: false,
      aboveBaseline: {},
      reviewLevel: current.rowCount > 0 ? 'manual_review_no_baseline' : 'no_signal_no_baseline',
      reason: current.rowCount > 0
        ? 'Detections exist but no facility baseline is available.'
        : 'No detections and no facility baseline is available.'
    };
  }

  const enoughSamples = (baselineItem.sampleCount ?? 0) >= options.minBaselineSamples;
  const above = {
    rowCount: enoughSamples && aboveBaseline(current.rowCount, baselineItem.rowCountP95),
    maxFrp: enoughSamples && aboveBaseline(current.maxFrp, baselineItem.maxFrpP95),
    highConfidenceCount:
      enoughSamples && aboveBaseline(current.highConfidenceCount, baselineItem.highConfidenceCountP95),
    sourcesWithDetections:
      enoughSamples && aboveBaseline(current.sourcesWithDetections, baselineItem.sourcesWithDetectionsP95),
    frpOver50Count: enoughSamples && aboveBaseline(current.frpOver50Count, baselineItem.frpOver50CountP95)
  };
  const strengthAboveBaseline = above.rowCount || above.maxFrp || above.highConfidenceCount || above.frpOver50Count;
  const repeatedObservation = current.sourcesWithDetections >= options.minRepeatSources && strengthAboveBaseline;
  const elevated = repeatedObservation && (current.maxFrp >= 50 || current.highConfidenceCount >= 2 || above.sourcesWithDetections);

  let reviewLevel = 'baseline_ok_no_repeated_signal';
  let reason = 'Current observation is not above the manual baseline or lacks source repeatability.';
  if (!enoughSamples) {
    reviewLevel = current.rowCount > 0 ? 'manual_review_weak_baseline' : 'weak_baseline_no_signal';
    reason = `Facility baseline has fewer than ${options.minBaselineSamples} samples.`;
  } else if (elevated) {
    reviewLevel = 'elevated_repeated_watch';
    reason = 'Multiple FIRMS sources detected activity and at least one strength metric is above baseline.';
  } else if (repeatedObservation) {
    reviewLevel = 'repeated_watch';
    reason = 'Multiple FIRMS sources detected activity above at least one baseline metric.';
  } else if (current.rowCount > 0) {
    reviewLevel = 'single_pass_or_baseline_noise';
    reason = 'Detections exist, but repeatability or baseline exceedance is insufficient.';
  }

  return {
    id: facility.id,
    label: facility.label ?? null,
    baselineStatus: enoughSamples ? 'baseline_ready' : 'baseline_weak',
    baseline: baselineItem,
    current,
    repeatedObservation,
    aboveBaseline: above,
    reviewLevel,
    reason
  };
}

function reviewBaseline(options, diagnosis, baselineResolution) {
  const review = createBaseReview(options, diagnosis, baselineResolution);
  if (diagnosis.schemaVersion !== 'firms-facility-thermal-diagnosis-1' || diagnosis.mode !== 'facility_batch') {
    addBlocker(review, 'Baseline review requires a firms-facility-thermal-diagnosis-1 facility_batch artifact.');
    return finalizeReview(review);
  }
  if (!Array.isArray(diagnosis.facilities) || diagnosis.facilities.length === 0) {
    addBlocker(review, 'Diagnosis artifact has no facility results.');
    return finalizeReview(review);
  }
  if (baselineResolution.status === 'missing_file') {
    const message = `Baseline file not found: ${options.baseline}`;
    if (options.requireBaseline) {
      addBlocker(review, message);
    } else {
      addWarning(review, message);
    }
  }
  if (!review.input.manualArtifactPath && !safeRelativePath(options.input)?.startsWith('docs/fixtures/')) {
    addWarning(review, 'Input path is not under manual-artifacts/; keep live diagnosis artifacts ignored.');
  }

  const baselineMap = baselineResolution.baseline?.facilities ?? new Map();
  const facilityReviews = diagnosis.facilities.map((facility) =>
    evaluateFacility(facility, baselineMap.get(facility.id), options)
  );
  const repeated = facilityReviews.filter((facility) => facility.repeatedObservation);
  const elevated = facilityReviews.filter((facility) => facility.reviewLevel === 'elevated_repeated_watch');
  const missingBaseline = facilityReviews.filter((facility) => facility.baselineStatus === 'missing_facility_baseline');
  const weakBaseline = facilityReviews.filter((facility) => facility.baselineStatus === 'baseline_weak');

  review.facilities = facilityReviews;
  review.summary = {
    facilityCount: facilityReviews.length,
    repeatedObservationCount: repeated.length,
    elevatedRepeatedWatchCount: elevated.length,
    missingBaselineCount: missingBaseline.length,
    weakBaselineCount: weakBaseline.length,
    reviewLevels: facilityReviews.reduce((counts, facility) => {
      counts[facility.reviewLevel] = (counts[facility.reviewLevel] ?? 0) + 1;
      return counts;
    }, {})
  };

  if (missingBaseline.length > 0 && options.requireBaseline) {
    addBlocker(review, `Facility baseline missing for: ${missingBaseline.map((facility) => facility.id).join(', ')}`);
  } else if (missingBaseline.length > 0) {
    addWarning(review, `Facility baseline missing for: ${missingBaseline.map((facility) => facility.id).join(', ')}`);
  }
  if (weakBaseline.length > 0) {
    addWarning(review, `Facility baseline has too few samples for: ${weakBaseline.map((facility) => facility.id).join(', ')}`);
  }
  if (elevated.length > 0) {
    addWarning(review, `Elevated repeated thermal watch: ${elevated.map((facility) => facility.id).join(', ')}`);
  } else if (repeated.length > 0) {
    addWarning(review, `Repeated thermal watch: ${repeated.map((facility) => facility.id).join(', ')}`);
  }

  return finalizeReview(review);
}

function finalizeReview(review) {
  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'reject_baseline_review';
  } else if ((review.summary?.elevatedRepeatedWatchCount ?? 0) > 0) {
    review.status = 'warn';
    review.recommendation = 'elevated_manual_review_required';
  } else if ((review.summary?.repeatedObservationCount ?? 0) > 0) {
    review.status = 'warn';
    review.recommendation = 'manual_review_required';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = 'baseline_cleanup_recommended';
  } else {
    review.status = 'pass';
    review.recommendation = 'baseline_ok_no_repeated_signal';
  }

  review.promotionEligible = false;
  return review;
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
  console.log(`FIRMS thermal baseline review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log('promotionEligible: false');
  console.log(`facilityCount: ${review.summary.facilityCount ?? 'unknown'}`);
  console.log(`repeatedObservationCount: ${review.summary.repeatedObservationCount ?? 'unknown'}`);
  console.log(`elevatedRepeatedWatchCount: ${review.summary.elevatedRepeatedWatchCount ?? 'unknown'}`);
  console.log(`missingBaselineCount: ${review.summary.missingBaselineCount ?? 'unknown'}`);
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
  const diagnosis = readJsonFile(options.input);
  const baselineResolution = loadBaseline(options);
  const review = reviewBaseline(options, diagnosis, baselineResolution);
  const outputPath = options.writeOutput ? writeReview(options.output, review) : null;
  printReview(review, outputPath);

  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('FIRMS thermal baseline review: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
