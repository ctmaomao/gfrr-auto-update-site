#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'route-level-tanker-freight-manual-samples-review-v1';
const PROOF_REVIEW_SCHEMA = 'route-level-tanker-freight-proof-review-v1';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-manual-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 2;
const BOUNDARY = 'manual/local route-level tanker freight sample collection review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';
const ROUTE_LEVEL_BUCKETS = [
  'hormuz_meg_crude',
  'meg_clean_products',
  'red_sea_suez_cape_rerouting'
];

function printUsage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-manual-samples -- [options]

Options:
  --input <path>       Proof-review artifact. May be repeated.
  --input-dir <path>   Directory of proof-review JSON artifacts. Files are read alphabetically.
  --min-samples <n>    Minimum usable samples for manual review readiness. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Ignored manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN or FAIL.
  --json               Print full JSON review to stdout.
  --no-output          Do not write the ignored review artifact.
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
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
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
    if (!isSafeInputPath(inputDir)) throw new Error(`Refusing to read directory outside manual-artifacts/ or docs/fixtures/: ${inputDir}`);
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
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing to read input outside manual-artifacts/ or docs/fixtures/: ${filePath}`);
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  return {
    filePath,
    safePath: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(resolve(filePath), 'utf8'))
  };
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
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
    affectsWorldOrderWeights: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function emptyBucketCounts() {
  return {
    hormuz_meg_crude: 0,
    meg_clean_products: 0,
    red_sea_suez_cape_rerouting: 0,
    aggregate_context_only: 0
  };
}

function artifactBlockers(artifact) {
  const blockers = [];
  if (artifact.schemaVersion !== PROOF_REVIEW_SCHEMA) blockers.push('schema_version_invalid');
  if (artifact.status !== 'dry_run_only') blockers.push('status_not_dry_run_only');
  if (artifact.promotionEligible !== false) blockers.push('promotion_eligible_claimed');
  if (artifact.productionWriteApproved !== false) blockers.push('production_write_approved_claimed');
  if (artifact.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (artifact.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (artifact.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  if (artifact.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (artifact.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (artifact.boundaries?.affectsScoring !== false) blockers.push('scoring_boundary_missing');
  const routes = [
    ...(artifact.review?.acceptedRoutes || []),
    ...(artifact.review?.contextOnlyRoutes || [])
  ];
  if (routes.some((route) => route.rawCitationStored !== false)) blockers.push('raw_citation_storage_claimed');
  return blockers;
}

function summarizeArtifact(input) {
  const artifact = input.data;
  const blockers = artifactBlockers(artifact);
  const acceptedRoutes = Array.isArray(artifact.review?.acceptedRoutes) ? artifact.review.acceptedRoutes : [];
  const contextOnlyRoutes = Array.isArray(artifact.review?.contextOnlyRoutes) ? artifact.review.contextOnlyRoutes : [];
  const bucketCoverage = emptyBucketCounts();
  for (const route of [...acceptedRoutes, ...contextOnlyRoutes]) {
    if (bucketCoverage[route.bucketKey] !== undefined) bucketCoverage[route.bucketKey] += 1;
  }
  return {
    sampleId: hashText(`${input.safePath}:${artifact.generatedAt || ''}`),
    sourcePath: input.safePath,
    generatedAt: isoOrNull(artifact.generatedAt),
    status: artifact.status || null,
    usable: blockers.length === 0 && acceptedRoutes.length > 0,
    blockers,
    acceptedRouteCount: acceptedRoutes.length,
    contextOnlyCount: contextOnlyRoutes.length,
    rejectedRouteCount: Number(artifact.review?.rejectedRouteCount || 0),
    rejectedInputLevelIssueCount: Number(artifact.review?.rejectedInputLevelIssueCount || 0),
    bucketCoverage,
    acceptedRoutes: acceptedRoutes.map((route) => ({
      routeCode: route.routeCode,
      bucketKey: route.bucketKey,
      assessmentDate: route.assessmentDate || null,
      unit: route.unit || null,
      value: Number.isFinite(Number(route.value)) ? Number(route.value) : null,
      dailyChangePct: Number.isFinite(Number(route.dailyChangePct)) ? Number(route.dailyChangePct) : null,
      weeklyChangePct: Number.isFinite(Number(route.weeklyChangePct)) ? Number(route.weeklyChangePct) : null,
      sourceCitationHash: route.sourceCitationHash || null,
      rawCitationStored: route.rawCitationStored === true
    }))
  };
}

function buildRouteCoverage(samples) {
  const routeMap = new Map();
  for (const sample of samples.filter((row) => row.usable)) {
    for (const route of sample.acceptedRoutes) {
      const key = route.routeCode;
      if (!routeMap.has(key)) {
        routeMap.set(key, {
          routeCode: key,
          bucketKey: route.bucketKey,
          sampleCount: 0,
          assessmentDates: new Set(),
          values: [],
          weeklyChanges: []
        });
      }
      const row = routeMap.get(key);
      row.sampleCount += 1;
      if (route.assessmentDate) row.assessmentDates.add(route.assessmentDate);
      if (Number.isFinite(route.value)) row.values.push(route.value);
      if (Number.isFinite(route.weeklyChangePct)) row.weeklyChanges.push(route.weeklyChangePct);
    }
  }
  return [...routeMap.values()]
    .map((row) => ({
      routeCode: row.routeCode,
      bucketKey: row.bucketKey,
      sampleCount: row.sampleCount,
      assessmentDateCount: row.assessmentDates.size,
      minValue: row.values.length ? round(Math.min(...row.values), 4) : null,
      maxValue: row.values.length ? round(Math.max(...row.values), 4) : null,
      latestWeeklyChangePct: row.weeklyChanges.length ? round(row.weeklyChanges.at(-1), 3) : null
    }))
    .sort((a, b) => a.routeCode.localeCompare(b.routeCode));
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
  const routeCoverage = buildRouteCoverage(sampleSummaries);
  const repeatedRoutes = routeCoverage.filter((row) => row.sampleCount >= Math.min(options.minSamples, usableSamples.length || options.minSamples));
  const coveredRouteBuckets = ROUTE_LEVEL_BUCKETS.filter((bucket) => bucketSampleCoverage[bucket] > 0);
  const blockers = sampleSummaries.flatMap((sample) => sample.blockers.map((reason) => ({ sampleId: sample.sampleId, reason })));
  const warnings = [];
  if (usableSamples.length < options.minSamples) warnings.push('collect_more_usable_samples');
  if (coveredRouteBuckets.length < ROUTE_LEVEL_BUCKETS.length) warnings.push('route_bucket_coverage_incomplete');
  if (repeatedRoutes.length === 0 && usableSamples.length >= options.minSamples) warnings.push('no_repeated_route_observation');

  let status = 'warn';
  let recommendation = 'collect_more_manual_samples_keep_dry_run_only';
  if (blockers.length > 0) {
    status = 'fail';
    recommendation = 'operator_cleanup_required_keep_non_production';
  } else if (
    usableSamples.length >= options.minSamples &&
    coveredRouteBuckets.length === ROUTE_LEVEL_BUCKETS.length &&
    repeatedRoutes.length > 0
  ) {
    status = 'pass';
    recommendation = 'manual_sample_review_ready_keep_non_production';
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
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    sampleWindow: minMaxIso(usableSamples.map((sample) => sample.generatedAt)),
    assessmentDateWindow: minMaxIso(usableSamples.flatMap((sample) => sample.acceptedRoutes.map((route) => route.assessmentDate))),
    bucketSampleCoverage,
    routeCoverage,
    repeatedRoutes,
    samples: sampleSummaries.map((sample) => ({
      sampleId: sample.sampleId,
      sourcePath: sample.sourcePath,
      generatedAt: sample.generatedAt,
      usable: sample.usable,
      acceptedRouteCount: sample.acceptedRouteCount,
      contextOnlyCount: sample.contextOnlyCount,
      rejectedRouteCount: sample.rejectedRouteCount,
      rejectedInputLevelIssueCount: sample.rejectedInputLevelIssueCount,
      bucketCoverage: sample.bucketCoverage,
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

function printSummary(review) {
  console.log(`Route-level tanker freight manual samples review: ${review.status}`);
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
