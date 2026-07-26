#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'firms-thermal-review-p17';
const DEFAULT_INPUT = 'manual-artifacts/oil-thermal/firms-thermal-diagnosis-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/firms-thermal-review-latest.json';
const DEFAULT_MAX_ARTIFACT_AGE_HOURS = 48;
const BOUNDARY =
  'manual artifact review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:firms-thermal -- [options]

Options:
  --input <path>          FIRMS diagnostic artifact. Default: ${DEFAULT_INPUT}
  --output <path>         Review artifact path. Default: ${DEFAULT_OUTPUT}
  --max-age-hours <n>     Freshness warning threshold. Default: ${DEFAULT_MAX_ARTIFACT_AGE_HOURS}
  --strict                Exit non-zero on WARN or FAIL.
  --no-output             Do not write the review artifact.
  --help                  Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    maxAgeHours: DEFAULT_MAX_ARTIFACT_AGE_HOURS,
    strict: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
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
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--max-age-hours') {
      options.maxAgeHours = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0 || options.maxAgeHours > 1000000) {
    throw new Error('Invalid --max-age-hours. Expected >0.');
  }

  return options;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isSafeOutputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
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

function detectUnredactedFirmsUrls(strings) {
  return strings
    .filter(({ value }) => /firms\.modaps\.eosdis\.nasa\.gov\/api\/area\/csv\//i.test(value))
    .filter(({ value }) => !value.includes('<FIRMS_MAP_KEY>'))
    .map(({ path }) => path);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoAgeHours(isoString, now = new Date()) {
  if (!isoString) {
    return null;
  }
  const parsed = new Date(isoString);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) {
    return null;
  }
  return Math.max(0, (now.getTime() - time) / 36e5);
}

function roundOrNull(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createBaseReview(inputPath, artifact, options) {
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      path: resolve(inputPath),
      schemaVersion: typeof artifact.schemaVersion === 'string' ? artifact.schemaVersion : null,
      mode: typeof artifact.mode === 'string' ? artifact.mode : null,
      diagnosis: typeof artifact.diagnosis === 'string' ? artifact.diagnosis : null,
      artifactGeneratedAt: typeof artifact.generatedAt === 'string' ? artifact.generatedAt : null,
      artifactAgeHours: roundOrNull(isoAgeHours(artifact.generatedAt)),
      manualArtifactPath: isManualArtifactPath(inputPath),
      maxAgeHours: options.maxAgeHours
    },
    status: 'pass',
    recommendation: 'no_manual_signal_observed',
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
    blockers: [],
    warnings: [],
    nextAllowedStep:
      'Use this review only for manual source review. Production display or scheduled fetch still requires a separate reviewed PR.',
    boundary: BOUNDARY
  };
}

function addBlocker(review, message) {
  review.blockers.push(message);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function isExampleFacility(facility) {
  const text = `${facility?.id ?? ''} ${facility?.label ?? ''} ${facility?.sourceNote ?? ''}`.toLowerCase();
  return text.includes('example') || text.includes('replace with an operator-reviewed public coordinate source');
}

function collectFacilityReview(facilities) {
  const facilityList = Array.isArray(facilities) ? facilities : [];
  const exampleFacilities = facilityList.filter(isExampleFacility);
  const missingMetadata = facilityList
    .filter((facility) => !facility?.region || !facility?.assetType || !facility?.sourceNote)
    .map((facility) => facility?.id ?? '(missing-id)');
  const withDetections = facilityList.filter((facility) => finiteNumber(facility?.aggregate?.rowCount) > 0);
  const watchFacilities = facilityList.filter((facility) =>
    ['low_signal', 'watch', 'elevated_watch'].includes(facility?.aggregate?.anomalyLevel)
  );
  const elevatedFacilities = facilityList.filter((facility) => facility?.aggregate?.anomalyLevel === 'elevated_watch');

  return {
    facilityCount: facilityList.length,
    exampleFacilityCount: exampleFacilities.length,
    exampleFacilityIds: exampleFacilities.map((facility) => facility.id),
    missingMetadataIds: missingMetadata,
    facilitiesWithDetections: withDetections.map((facility) => facility.id),
    watchFacilityIds: watchFacilities.map((facility) => facility.id),
    elevatedFacilityIds: elevatedFacilities.map((facility) => facility.id)
  };
}

function reviewFacilityBatch(artifact, review) {
  const aggregate = isPlainObject(artifact.aggregate) ? artifact.aggregate : {};
  const requestDiagnostics = isPlainObject(aggregate.requestDiagnostics)
    ? aggregate.requestDiagnostics
    : null;
  const facilityReview = collectFacilityReview(artifact.facilities);
  const rowCount = finiteNumber(aggregate.rowCount) ?? 0;
  const maxFrp = finiteNumber(aggregate.maxFrp);
  const highConfidenceCount = finiteNumber(aggregate.highConfidenceCount) ?? 0;
  const sourceCount = Array.isArray(artifact.sources) ? artifact.sources.length : 0;
  const requestCount = finiteNumber(aggregate.requestCount) ?? 0;
  const requestErrorCount = finiteNumber(aggregate.requestErrorCount) ?? 0;

  review.summary = {
    type: 'facility_batch',
    sourcesChecked: sourceCount,
    dayRange: artifact.dayRange ?? null,
    rowCount,
    latestAcqAt: aggregate.latestAcqAt ?? null,
    maxFrp,
    highConfidenceCount,
    frpOver50Count: finiteNumber(aggregate.frpOver50Count) ?? 0,
    frpOver100Count: finiteNumber(aggregate.frpOver100Count) ?? 0,
    facilityCount: facilityReview.facilityCount,
    facilitiesWithDetections: finiteNumber(aggregate.facilitiesWithDetections) ?? 0,
    facilitiesByAnomalyLevel: aggregate.facilitiesByAnomalyLevel ?? {},
    requestCount,
    requestErrorCount,
    requestFailureCategories: requestDiagnostics?.failuresByCategory ?? {},
    requestRetryCount: finiteNumber(requestDiagnostics?.retryCount) ?? 0,
    requestRecoveredAfterRetryCount: finiteNumber(requestDiagnostics?.recoveredAfterRetryCount) ?? 0,
    requestRetryBudgetExhaustedCount: finiteNumber(requestDiagnostics?.retryBudgetExhaustedCount) ?? 0,
    exampleFacilityCount: facilityReview.exampleFacilityCount,
    watchFacilityIds: facilityReview.watchFacilityIds,
    elevatedFacilityIds: facilityReview.elevatedFacilityIds
  };

  if (facilityReview.facilityCount === 0) {
    addBlocker(review, 'Facility batch artifact has no facility results.');
  }
  if (sourceCount < 2) {
    addWarning(review, 'Facility batch checked fewer than two FIRMS sources.');
  }
  if (facilityReview.exampleFacilityCount > 0) {
    addWarning(
      review,
      `Facility list still contains example facility rows: ${facilityReview.exampleFacilityIds.join(', ')}`
    );
  }
  if (facilityReview.missingMetadataIds.length > 0) {
    addWarning(
      review,
      `Facility rows missing region, assetType or sourceNote: ${facilityReview.missingMetadataIds.join(', ')}`
    );
  }
  if (requestErrorCount > 0) {
    addWarning(
      review,
      `FIRMS request failures require source-health review: ${requestErrorCount}/${requestCount}; categories=${JSON.stringify(requestDiagnostics?.failuresByCategory ?? {})}`
    );
  }

  if (facilityReview.elevatedFacilityIds.length > 0) {
    review.recommendation = 'elevated_manual_review_required';
    addWarning(review, `Elevated heuristic watch in facilities: ${facilityReview.elevatedFacilityIds.join(', ')}`);
  } else if (facilityReview.watchFacilityIds.length > 0) {
    review.recommendation = 'manual_review_required';
    addWarning(review, `Thermal detections require manual review: ${facilityReview.watchFacilityIds.join(', ')}`);
  } else if (facilityReview.exampleFacilityCount === facilityReview.facilityCount && facilityReview.facilityCount > 0) {
    review.recommendation = 'replace_example_facilities_before_use';
  } else if (requestErrorCount > 0) {
    review.recommendation = requestErrorCount === requestCount
      ? 'source_unavailable_review_sanitized_failure_categories'
      : 'partial_source_health_review_required';
  } else {
    review.recommendation = rowCount > 0 ? 'manual_review_required' : 'no_manual_signal_observed';
  }
}

function bboxSpan(bbox) {
  if (!isPlainObject(bbox)) {
    return null;
  }
  const west = finiteNumber(bbox.west);
  const east = finiteNumber(bbox.east);
  const south = finiteNumber(bbox.south);
  const north = finiteNumber(bbox.north);
  if ([west, east, south, north].some((value) => value === null)) {
    return null;
  }
  return {
    width: east - west,
    height: north - south
  };
}

function reviewSingleBbox(artifact, review) {
  const summary = isPlainObject(artifact.summary) ? artifact.summary : {};
  const rowCount = finiteNumber(summary.rowCount) ?? 0;
  const span = bboxSpan(artifact.bbox);
  const isLargeBbox = Boolean(span && (span.width > 1.5 || span.height > 1.5));

  review.summary = {
    type: 'single_bbox',
    source: artifact.source ?? null,
    dayRange: artifact.dayRange ?? null,
    bbox: artifact.bbox ?? null,
    bboxSpan: span,
    rowCount,
    latestAcqAt: summary.latestAcqAt ?? null,
    maxFrp: finiteNumber(summary.maxFrp),
    highConfidenceCount: finiteNumber(summary.highConfidenceCount) ?? 0,
    anomalyLevel: artifact.anomalyLevel ?? null,
    regionSmokeOnly: true
  };

  addWarning(review, 'Single-bbox output is a bounded API smoke test, not facility-level evidence.');
  if (isLargeBbox) {
    addWarning(review, 'Single-bbox area is larger than the facility bbox limit; detections cannot be attributed to a facility.');
  }
  review.recommendation = rowCount > 0 ? 'region_smoke_detections_require_facility_batch' : 'api_smoke_ok_no_detections';
}

function reviewArtifactIntegrity(artifact, review, options) {
  const strings = collectStrings(artifact);
  const unredactedUrlPaths = detectUnredactedFirmsUrls(strings);

  if (unredactedUrlPaths.length > 0) {
    addBlocker(review, `FIRMS URL redaction failed at ${unredactedUrlPaths.join(', ')}`);
  }
  if (typeof artifact.boundary !== 'string' || !artifact.boundary.includes('manual diagnostic only')) {
    addBlocker(review, 'Diagnostic artifact is missing the manual-only boundary statement.');
  }
  if (!review.input.manualArtifactPath && safeRelativePath(options.input)?.startsWith('docs/fixtures/') !== true) {
    addWarning(review, 'Input path is not under manual-artifacts/; keep live diagnostic artifacts ignored.');
  }
  if (review.input.artifactAgeHours === null) {
    addWarning(review, 'Diagnostic artifact generatedAt is missing or invalid.');
  } else if (review.input.artifactAgeHours > options.maxAgeHours) {
    addWarning(
      review,
      `Diagnostic artifact is stale: ${review.input.artifactAgeHours}h > ${options.maxAgeHours}h.`
    );
  }
}

function finalizeReview(review) {
  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'reject_artifact';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
  } else {
    review.status = 'pass';
  }

  review.promotionEligible = false;
  return review;
}

function reviewArtifact(inputPath, artifact, options) {
  const review = createBaseReview(inputPath, artifact, options);
  const schemaVersion = artifact.schemaVersion;

  if (schemaVersion === 'firms-facility-thermal-diagnosis-1') {
    reviewFacilityBatch(artifact, review);
  } else if (schemaVersion === 'firms-thermal-diagnosis-1') {
    reviewSingleBbox(artifact, review);
  } else {
    addBlocker(review, `Unsupported FIRMS thermal artifact schemaVersion: ${schemaVersion ?? '(missing)'}`);
  }

  reviewArtifactIntegrity(artifact, review, options);
  return finalizeReview(review);
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
  const status = review.status.toUpperCase();
  const summary = review.summary ?? {};
  console.log(`FIRMS thermal artifact review: ${status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log('promotionEligible: false');
  console.log(`inputSchema: ${review.input.schemaVersion ?? 'unknown'}`);
  console.log(`mode: ${review.input.mode ?? summary.type ?? 'unknown'}`);
  console.log(`artifactAgeHours: ${review.input.artifactAgeHours ?? 'unknown'}`);
  console.log(`rowCount: ${summary.rowCount ?? 'unknown'}`);
  if (summary.facilityCount !== undefined) {
    console.log(`facilityCount: ${summary.facilityCount}`);
    console.log(`exampleFacilityCount: ${summary.exampleFacilityCount}`);
  }
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
  const artifact = readJsonFile(options.input);
  const review = reviewArtifact(options.input, artifact, options);
  const outputPath = options.writeOutput ? writeReview(options.output, review) : null;
  printReview(review, outputPath);

  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('FIRMS thermal artifact review: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
