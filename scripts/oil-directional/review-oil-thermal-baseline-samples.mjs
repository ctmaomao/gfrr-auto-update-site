#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'oil-thermal-baseline-samples-review-p25';
const DEFAULT_INPUT = 'data/oil-thermal-watch.json';
const DEFAULT_BASELINE_POLICY = 'config/oil-thermal-watch-baseline.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 8;
const DEFAULT_PERCENTILE = 0.95;
const BOUNDARY =
  'manual baseline sample review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:oil-thermal-baseline-samples -- [options]

Options:
  --input <path>              Oil thermal watch artifact. May be repeated. Default: ${DEFAULT_INPUT}
  --input-dir <path>          Directory of oil thermal watch JSON artifacts. Files are read alphabetically.
  --baseline-policy <path>    Production baseline policy file to mirror. Default: ${DEFAULT_BASELINE_POLICY}
  --output <path>             Manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --min-samples <n>           Samples required per facility before candidate baseline rows are ready. Default: ${DEFAULT_MIN_SAMPLES}
  --percentile <n>            Percentile used for candidate p-metrics. Default: ${DEFAULT_PERCENTILE}
  --strict                    Exit non-zero on WARN or FAIL.
  --json                      Print full JSON review to stdout instead of a compact summary.
  --no-output                 Do not write the review artifact.
  --help                      Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    baselinePolicy: DEFAULT_BASELINE_POLICY,
    output: DEFAULT_OUTPUT,
    minSamples: DEFAULT_MIN_SAMPLES,
    percentile: DEFAULT_PERCENTILE,
    strict: false,
    writeOutput: true,
    printJson: false
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
    if (arg === '--json') {
      options.printJson = true;
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
      options.inputs.push(nextValue());
    } else if (arg === '--input-dir') {
      options.inputDirs.push(nextValue());
    } else if (arg === '--baseline-policy') {
      options.baselinePolicy = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else if (arg === '--percentile') {
      options.percentile = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.inputs.length === 0 && options.inputDirs.length === 0) {
    options.inputs.push(DEFAULT_INPUT);
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 365) {
    throw new Error('Invalid --min-samples. Expected integer 1..365.');
  }
  if (!Number.isFinite(options.percentile) || options.percentile <= 0 || options.percentile > 1) {
    throw new Error('Invalid --percentile. Expected 0 < n <= 1.');
  }

  return options;
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

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === DEFAULT_INPUT;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath) || isProductionWatchPath(filePath);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function readJsonWithText(filePath) {
  const text = readFileSync(filePath, 'utf8');
  return {
    text,
    json: JSON.parse(text)
  };
}

function readOptionalJson(filePath) {
  if (!existsSync(resolve(filePath))) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function expandInputs(options) {
  const paths = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) {
      throw new Error(`Input directory does not exist: ${inputDir}`);
    }
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    paths.push(...jsonFiles);
  }

  return [...new Set(paths)];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricNumber(value, fallback = 0) {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : parsed;
}

function parseSourcesWithDetections(facility) {
  const fromComparison = finiteNumber(facility?.baselineComparison?.sourcesWithDetections);
  if (fromComparison !== null) {
    return fromComparison;
  }
  const agreement = typeof facility?.sourceAgreement === 'string' ? facility.sourceAgreement.trim() : '';
  const match = agreement.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

function percentile(values, p) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.ceil(clean.length * p) - 1);
  return round(clean[index], 3);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function isoOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function dateDiffDays(startIso, endIso) {
  if (!startIso || !endIso) {
    return null;
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return round(Math.max(0, end - start) / (24 * 60 * 60 * 1000), 2);
}

function extractPolicy(rawPolicy) {
  const policy = isPlainObject(rawPolicy?.policy) ? rawPolicy.policy : {};
  return {
    minSamplesPerFacility: metricNumber(policy.minSamplesPerFacility, DEFAULT_MIN_SAMPLES),
    minRepeatSources: metricNumber(policy.minRepeatSources, 2),
    rowCountP95Margin: metricNumber(policy.rowCountP95Margin, 1),
    maxFrpP95Margin: metricNumber(policy.maxFrpP95Margin, 1),
    elevatedMinFrp: metricNumber(policy.elevatedMinFrp, 50),
    elevatedMinHighConfidenceCount: metricNumber(policy.elevatedMinHighConfidenceCount, 2),
    elevatedMinFrpOver50Count: metricNumber(policy.elevatedMinFrpOver50Count, 1),
    elevatedMinFrpOver100Count: metricNumber(policy.elevatedMinFrpOver100Count, 1)
  };
}

function extractFacilitySample(facility, sample) {
  const id = typeof facility?.id === 'string' ? facility.id.trim() : '';
  if (!id) {
    return null;
  }
  return {
    id,
    label: typeof facility.label === 'string' ? facility.label : null,
    region: typeof facility.region === 'string' ? facility.region : null,
    assetType: typeof facility.assetType === 'string' ? facility.assetType : null,
    sampleGeneratedAt: sample.generatedAt,
    latestAcqAt: isoOrNull(facility.latestAcqAt),
    rowCount: metricNumber(facility.rowCount, 0),
    maxFrp: metricNumber(facility.maxFrp, 0),
    highConfidenceCount: metricNumber(facility.highConfidenceCount, 0),
    frpOver50Count: metricNumber(facility.frpOver50Count, 0),
    frpOver100Count: metricNumber(facility.frpOver100Count, 0),
    sourcesWithDetections: metricNumber(parseSourcesWithDetections(facility), 0)
  };
}

function addBlocker(review, message) {
  review.blockers.push(message);
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function createReview(options, inputPaths, rawPolicy) {
  const policy = extractPolicy(rawPolicy);
  if (options.minSamples !== DEFAULT_MIN_SAMPLES) {
    policy.minSamplesPerFacility = options.minSamples;
  }

  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'pass',
    recommendation: 'ready_for_manual_baseline_candidate_review',
    promotionEligible: false,
    input: {
      paths: inputPaths.map((filePath) => resolve(filePath)),
      inputCount: inputPaths.length,
      safeInputPaths: inputPaths.every(isSafeInputPath),
      baselinePolicyPath: resolve(options.baselinePolicy),
      baselinePolicySchemaVersion:
        typeof rawPolicy?.schemaVersion === 'string' ? rawPolicy.schemaVersion : null
    },
    policy: {
      minSamplesPerFacility: policy.minSamplesPerFacility,
      percentile: options.percentile,
      mirroredProductionPolicy: policy
    },
    summary: {},
    candidateBaseline: {
      schemaVersion: 'oil-thermal-baseline-production-v1',
      candidateOnly: true,
      status: 'not_established',
      generatedAt: new Date().toISOString(),
      baselineWindowDays: null,
      policy,
      facilities: [],
      notes: [
        'Candidate rows are generated from sanitized oil-thermal-watch artifacts only.',
        'This artifact is for human review and must not be copied into production baseline config without a separate reviewed change.',
        'The script never reads FIRMS MAP_KEY, never fetches network data, and never writes production data.'
      ]
    },
    facilities: [],
    blockers: [],
    warnings: [],
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
    boundary: BOUNDARY
  };
}

function loadSamples(inputPaths, review) {
  const samples = [];

  for (const inputPath of inputPaths) {
    const absolutePath = resolve(inputPath);
    if (!existsSync(absolutePath)) {
      addBlocker(review, `Input file does not exist: ${inputPath}`);
      continue;
    }
    if (!isSafeInputPath(inputPath)) {
      addWarning(review, `Input path is outside data/manual-artifacts/docs/fixtures review surfaces: ${inputPath}`);
    }

    let payload;
    try {
      payload = readJsonWithText(inputPath);
    } catch (error) {
      addBlocker(review, `Failed to parse input JSON ${inputPath}: ${error.message}`);
      continue;
    }

    if (payload.text.includes('firms.modaps.eosdis.nasa.gov/api/area/csv/')) {
      addBlocker(review, `Input contains raw FIRMS API URL and is not a sanitized watch artifact: ${inputPath}`);
      continue;
    }

    const artifact = payload.json;
    const generatedAt = isoOrNull(artifact.generatedAt);
    if (artifact.schemaVersion !== 'oil-thermal-watch-1') {
      addBlocker(review, `Unsupported schemaVersion in ${inputPath}: ${artifact.schemaVersion ?? '(missing)'}`);
      continue;
    }
    if (artifact.module !== 'oil-thermal-watch') {
      addBlocker(review, `Unsupported module in ${inputPath}: ${artifact.module ?? '(missing)'}`);
      continue;
    }
    if (!generatedAt) {
      addBlocker(review, `Invalid generatedAt in ${inputPath}`);
      continue;
    }
    if (!Array.isArray(artifact.facilities)) {
      addBlocker(review, `Missing facilities[] in ${inputPath}`);
      continue;
    }

    const productionImpact = isPlainObject(artifact.productionImpact) ? artifact.productionImpact : null;
    if (!productionImpact) {
      addWarning(review, `Missing productionImpact map in ${inputPath}`);
    } else {
      const truthyImpact = Object.entries(productionImpact)
        .filter(([, value]) => value === true)
        .map(([key]) => key);
      if (truthyImpact.length > 0) {
        addBlocker(review, `Input ${inputPath} has productionImpact=true fields: ${truthyImpact.join(', ')}`);
        continue;
      }
    }

    samples.push({
      path: resolve(inputPath),
      generatedAt,
      status: artifact.status ?? null,
      signalState: artifact.signalState ?? null,
      facilities: artifact.facilities
    });
  }

  return samples;
}

function buildFacilityRows(samples, review, minSamples, percentileValue) {
  const byFacility = new Map();
  for (const sample of samples) {
    for (const facility of sample.facilities) {
      const facilitySample = extractFacilitySample(facility, sample);
      if (!facilitySample) {
        addWarning(review, `Skipped facility row with missing id in ${sample.path}`);
        continue;
      }
      if (!byFacility.has(facilitySample.id)) {
        byFacility.set(facilitySample.id, []);
      }
      byFacility.get(facilitySample.id).push(facilitySample);
    }
  }

  const facilities = [];
  for (const [id, rows] of [...byFacility.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.sort((a, b) => Date.parse(a.sampleGeneratedAt) - Date.parse(b.sampleGeneratedAt));
    const first = rows[0];
    const last = rows[rows.length - 1];
    const readyForBaseline = rows.length >= minSamples;
    const row = {
      id,
      label: first.label ?? last.label ?? null,
      region: first.region ?? last.region ?? null,
      assetType: first.assetType ?? last.assetType ?? null,
      sampleCount: rows.length,
      readyForBaseline,
      firstSampleAt: first.sampleGeneratedAt,
      lastSampleAt: last.sampleGeneratedAt,
      windowDays: dateDiffDays(first.sampleGeneratedAt, last.sampleGeneratedAt),
      metrics: {
        rowCountP95: percentile(rows.map((item) => item.rowCount), percentileValue),
        maxFrpP95: percentile(rows.map((item) => item.maxFrp), percentileValue),
        highConfidenceCountP95: percentile(rows.map((item) => item.highConfidenceCount), percentileValue),
        frpOver50CountP95: percentile(rows.map((item) => item.frpOver50Count), percentileValue),
        frpOver100CountP95: percentile(rows.map((item) => item.frpOver100Count), percentileValue),
        sourcesWithDetectionsP95: percentile(rows.map((item) => item.sourcesWithDetections), percentileValue),
        maxObservedFrp: round(Math.max(...rows.map((item) => item.maxFrp)), 3),
        maxObservedRowCount: Math.max(...rows.map((item) => item.rowCount)),
        samplesWithDetections: rows.filter((item) => item.rowCount > 0).length,
        samplesWithMultiSourceDetections: rows.filter((item) => item.sourcesWithDetections >= 2).length
      },
      warnings: []
    };
    if (!readyForBaseline) {
      row.warnings.push(`Need ${minSamples - rows.length} more samples before this facility has a candidate baseline.`);
    }
    facilities.push(row);
  }

  return facilities;
}

function finalizeReview(review, samples, facilityRows) {
  const readyFacilities = facilityRows.filter((facility) => facility.readyForBaseline);
  const allSampleTimes = samples.map((sample) => sample.generatedAt).sort();
  const firstSampleAt = allSampleTimes[0] ?? null;
  const lastSampleAt = allSampleTimes[allSampleTimes.length - 1] ?? null;

  review.facilities = facilityRows;
  review.candidateBaseline.facilities = readyFacilities.map((facility) => ({
    id: facility.id,
    label: facility.label,
    region: facility.region,
    assetType: facility.assetType,
    sampleCount: facility.sampleCount,
    windowDays: facility.windowDays,
    firstSampleAt: facility.firstSampleAt,
    lastSampleAt: facility.lastSampleAt,
    rowCountP95: facility.metrics.rowCountP95,
    maxFrpP95: facility.metrics.maxFrpP95,
    highConfidenceCountP95: facility.metrics.highConfidenceCountP95,
    frpOver50CountP95: facility.metrics.frpOver50CountP95,
    frpOver100CountP95: facility.metrics.frpOver100CountP95,
    sourcesWithDetectionsP95: facility.metrics.sourcesWithDetectionsP95
  }));
  review.candidateBaseline.status =
    readyFacilities.length === 0
      ? 'not_established'
      : readyFacilities.length === facilityRows.length
        ? 'established'
        : 'partial';
  review.candidateBaseline.baselineWindowDays =
    readyFacilities.length === 0
      ? null
      : round(Math.max(...readyFacilities.map((facility) => facility.windowDays ?? 0)), 2);

  review.summary = {
    sampleCount: samples.length,
    firstSampleAt,
    lastSampleAt,
    sampleWindowDays: dateDiffDays(firstSampleAt, lastSampleAt),
    facilityCount: facilityRows.length,
    totalFacilitySamples: facilityRows.reduce((sum, facility) => sum + facility.sampleCount, 0),
    facilitiesReadyForBaseline: readyFacilities.length,
    facilitiesNeedingMoreSamples: facilityRows.length - readyFacilities.length,
    candidateBaselineStatus: review.candidateBaseline.status,
    productionBaselineWriteApproved: false
  };

  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'fix_sample_artifacts_before_baseline_review';
    return;
  }
  if (samples.length === 0 || facilityRows.length === 0) {
    addWarning(review, 'No usable oil thermal watch samples were found.');
  }
  for (const facility of facilityRows) {
    if (!facility.readyForBaseline) {
      addWarning(review, `${facility.id} has ${facility.sampleCount} samples; needs ${review.policy.minSamplesPerFacility}.`);
    }
  }
  if (readyFacilities.length === 0) {
    review.status = 'warn';
    review.recommendation = 'collect_more_samples_before_baseline_candidate_review';
  } else if (readyFacilities.length < facilityRows.length) {
    review.status = 'warn';
    review.recommendation = 'partial_baseline_candidate_ready_manual_review_required';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = 'baseline_candidate_ready_with_warnings';
  }
}

function writeReview(review, options) {
  if (!options.writeOutput) {
    return;
  }
  if (!isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.output}`);
  }
  const absoluteOutput = resolve(options.output);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  review.outputPath = absoluteOutput;
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Oil thermal baseline samples review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`promotionEligible: ${review.promotionEligible}`);
  console.log(`sampleCount: ${review.summary.sampleCount ?? 0}`);
  console.log(`facilityCount: ${review.summary.facilityCount ?? 0}`);
  console.log(`facilitiesReadyForBaseline: ${review.summary.facilitiesReadyForBaseline ?? 0}`);
  console.log(`candidateBaselineStatus: ${review.summary.candidateBaselineStatus ?? 'unknown'}`);
  console.log(`productionBaselineWriteApproved: ${review.summary.productionBaselineWriteApproved}`);
  if (review.outputPath) {
    console.log(`outputPath: ${review.outputPath}`);
  }
  console.log(`warnings: ${review.warnings.length}`);
  for (const [index, warning] of review.warnings.slice(0, 5).entries()) {
    console.log(`warning[${index}]: ${warning}`);
  }
  if (review.warnings.length > 5) {
    console.log(`warning[more]: ${review.warnings.length - 5} additional warnings omitted`);
  }
  console.log(`blockers: ${review.blockers.length}`);
  for (const [index, blocker] of review.blockers.slice(0, 5).entries()) {
    console.log(`blocker[${index}]: ${blocker}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPaths = expandInputs(options);
  const rawPolicy = readOptionalJson(options.baselinePolicy);
  const review = createReview(options, inputPaths, rawPolicy);

  if (!rawPolicy) {
    addWarning(review, `Baseline policy file not found: ${options.baselinePolicy}`);
  }
  const samples = loadSamples(inputPaths, review);
  const facilityRows = buildFacilityRows(
    samples,
    review,
    review.policy.minSamplesPerFacility,
    review.policy.percentile
  );
  finalizeReview(review, samples, facilityRows);
  writeReview(review, options);

  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    printSummary(review);
  }

  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
