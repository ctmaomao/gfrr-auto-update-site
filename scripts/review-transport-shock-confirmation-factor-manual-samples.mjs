#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'transport-shock-confirmation-factor-manual-samples-review-v1';
const SAMPLE_REVIEW_SCHEMA = 'transport-shock-confirmation-factor-manual-sample-review-v1';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/manual-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 2;
const BUCKETS = [
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
];
const DIRECTIONS = ['tightening', 'easing', 'mixed', 'unavailable'];
const BOUNDARY = 'manual/local Transport Shock Confirmation Factor sample collection review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-manual-samples -- [options]

Options:
  --input <path>       Manual-sample review artifact. May be repeated.
  --input-dir <path>   Directory of manual-sample review JSON artifacts.
  --min-samples <n>    Minimum usable samples for readiness. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Ignored manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN or FAIL.
  --json               Print full JSON review to stdout.
  --no-output          Do not write ignored review artifact.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    minSamples: DEFAULT_MIN_SAMPLES,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
    strict: false,
    printJson: false,
    writeOutput: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
      continue;
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
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') options.inputs.push(nextValue());
    else if (arg === '--input-dir') options.inputDirs.push(nextValue());
    else if (arg === '--min-samples') options.minSamples = Number(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const abs = resolve(filePath);
  const rel = relative(process.cwd(), abs);
  if (rel === '' || rel.startsWith('..')) return null;
  return rel.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    if (!isSafeInputPath(inputDir)) throw new Error(`Refusing to read directory outside allowed sample paths: ${inputDir}`);
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json')
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}

function readInput(filePath) {
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read input outside allowed sample paths: ${filePath}`);
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return {
    filePath,
    safePath: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(resolve(filePath), 'utf8'))
  };
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function emptyBucketCounts() {
  return Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
}

function emptyDirectionCounts() {
  return Object.fromEntries(DIRECTIONS.map((direction) => [direction, 0]));
}

function productionImpactFalseMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsMainJudgment: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function artifactBlockers(artifact) {
  const blockers = [];
  if (artifact.schemaVersion !== SAMPLE_REVIEW_SCHEMA) blockers.push('schema_version_invalid');
  if (artifact.status !== 'dry_run_only') blockers.push('status_not_dry_run_only');
  if (artifact.promotionEligible !== false) blockers.push('promotion_eligible_claimed');
  if (artifact.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (artifact.shadowScoreApproved !== false) blockers.push('shadow_score_approved_claimed');
  if (artifact.frontendDisplayApproved !== false) blockers.push('frontend_display_approved_claimed');
  if (artifact.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (artifact.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (artifact.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  if (artifact.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (artifact.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (artifact.boundaries?.affectsScoring !== false) blockers.push('scoring_boundary_missing');
  if ((artifact.review?.acceptedObservations || []).some((row) => row.rawCitationStored !== false)) blockers.push('raw_citation_storage_claimed');
  return blockers;
}

function summarizeArtifact(input) {
  const artifact = input.data;
  const blockers = artifactBlockers(artifact);
  const accepted = Array.isArray(artifact.review?.acceptedObservations) ? artifact.review.acceptedObservations : [];
  const bucketCoverage = emptyBucketCounts();
  const directionCounts = emptyDirectionCounts();
  const sourceCoverage = {};
  for (const row of accepted) {
    if (bucketCoverage[row.bucketKey] !== undefined) bucketCoverage[row.bucketKey] += 1;
    if (directionCounts[row.direction] !== undefined) directionCounts[row.direction] += 1;
    if (typeof row.sourceKey === 'string') sourceCoverage[row.sourceKey] = (sourceCoverage[row.sourceKey] || 0) + 1;
  }
  return {
    sampleId: hashText(`${input.safePath}:${artifact.generatedAt || ''}`),
    sourcePath: input.safePath,
    generatedAt: isoOrNull(artifact.generatedAt),
    usable: blockers.length === 0 && accepted.length > 0,
    blockers,
    acceptedObservationCount: accepted.length,
    rejectedObservationCount: Number(artifact.review?.rejectedObservationCount || 0),
    bucketCoverage,
    directionCounts,
    sourceCoverage
  };
}

function mergeCounts(rows, key) {
  const result = {};
  for (const row of rows) {
    for (const [name, count] of Object.entries(row[key] || {})) {
      result[name] = (result[name] || 0) + count;
    }
  }
  return result;
}

function minMaxIso(values) {
  const sorted = values.filter(Boolean).sort();
  return { earliest: sorted[0] || null, latest: sorted.at(-1) || null };
}

function buildReview(inputs, options) {
  const sampleSummaries = inputs.map(summarizeArtifact);
  const usableSamples = sampleSummaries.filter((sample) => sample.usable);
  const bucketSampleCoverage = emptyBucketCounts();
  for (const sample of usableSamples) {
    for (const [bucket, count] of Object.entries(sample.bucketCoverage)) {
      if (count > 0) bucketSampleCoverage[bucket] += 1;
    }
  }
  const blockers = sampleSummaries.flatMap((sample) => sample.blockers.map((reason) => ({ sampleId: sample.sampleId, reason })));
  const warnings = [];
  const coveredBuckets = BUCKETS.filter((bucket) => bucketSampleCoverage[bucket] > 0);
  if (usableSamples.length < options.minSamples) warnings.push('collect_more_usable_samples');
  if (coveredBuckets.length < BUCKETS.length) warnings.push('bucket_coverage_incomplete');

  let status = 'warn';
  let recommendation = 'collect_more_manual_samples_keep_non_production';
  if (blockers.length > 0) {
    status = 'fail';
    recommendation = 'operator_cleanup_required_keep_non_production';
  } else if (usableSamples.length >= options.minSamples && coveredBuckets.length === BUCKETS.length) {
    status = 'pass';
    recommendation = 'manual_samples_review_ready_keep_non_production';
  }

  return {
    schemaVersion: REVIEW_VERSION,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    inputCount: inputs.length,
    sampleCount: sampleSummaries.length,
    usableSampleCount: usableSamples.length,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    shadowScoreApproved: false,
    frontendDisplayApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    sampleWindow: minMaxIso(usableSamples.map((sample) => sample.generatedAt)),
    bucketSampleCoverage,
    directionCounts: mergeCounts(usableSamples, 'directionCounts'),
    sourceCoverage: mergeCounts(usableSamples, 'sourceCoverage'),
    samples: sampleSummaries.map((sample) => ({
      sampleId: sample.sampleId,
      sourcePath: sample.sourcePath,
      generatedAt: sample.generatedAt,
      usable: sample.usable,
      acceptedObservationCount: sample.acceptedObservationCount,
      rejectedObservationCount: sample.rejectedObservationCount,
      bucketCoverage: sample.bucketCoverage,
      directionCounts: sample.directionCounts,
      blockers: sample.blockers
    })),
    blockers,
    warnings,
    productionImpact: productionImpactFalseMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawProviderResponseStored: true
    },
    boundary: BOUNDARY
  };
}

function buildEmptyReview(options) {
  return {
    schemaVersion: REVIEW_VERSION,
    status: options.allowEmpty ? 'empty' : 'fail',
    recommendation: 'provide_manual_samples_under_manual_artifacts',
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    inputCount: 0,
    sampleCount: 0,
    usableSampleCount: 0,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    shadowScoreApproved: false,
    frontendDisplayApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    productionImpact: productionImpactFalseMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noRawProviderResponseStored: true
    },
    boundary: BOUNDARY
  };
}

function writeJson(filePath, value) {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock Confirmation Factor manual samples review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`sampleCount: ${review.sampleCount}`);
  console.log(`usableSampleCount: ${review.usableSampleCount}`);
  console.log(`blockerCount: ${review.blockerCount ?? 0}`);
  console.log(`warningCount: ${review.warningCount ?? 0}`);
  console.log(`routeFreightConfirmation: ${review.routeFreightConfirmation}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputFiles = expandInputFiles(options);
    const review = inputFiles.length > 0
      ? buildReview(inputFiles.map(readInput), options)
      : buildEmptyReview(options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
    if (options.strict && ['warn', 'fail'].includes(review.status)) process.exitCode = 1;
    if (!options.allowEmpty && inputFiles.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
