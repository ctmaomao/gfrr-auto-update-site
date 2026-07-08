#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath, shortHash, writeJson } from './lib/check-script-helpers.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'route-level-tanker-freight-production-display-projection-review-v1';
const PROJECTION_VERSION = 'route-level-tanker-freight-production-display-projection-v1';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-production-display-projection-review-latest.json';
const DEFAULT_MIN_PROJECTIONS = 1;
const BOUNDARY = 'manual/local route-level tanker freight production display projection review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-production-display-projections -- [options]

Options:
  --input <path>            Production display projection artifact. May be repeated.
  --input-dir <path>        Directory of projection JSON artifacts. Files are read alphabetically.
  --min-projections <n>     Minimum usable projection count. Default: ${DEFAULT_MIN_PROJECTIONS}
  --output <path>           Ignored review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty             Exit 0 if no projection exists.
  --strict                  Exit non-zero on WARN or FAIL.
  --json                    Print full JSON review to stdout.
  --no-output               Do not write the ignored review artifact.
  --help                    Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    minProjections: DEFAULT_MIN_PROJECTIONS,
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
    else if (arg === '--min-projections') options.minProjections = Number(nextValue());
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.minProjections) || options.minProjections < 1 || options.minProjections > 100) {
    throw new Error('Invalid --min-projections. Expected integer 1..100.');
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
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

function projectionBlockers(projection) {
  const blockers = [];
  if (projection.schemaVersion !== PROJECTION_VERSION) blockers.push('schema_version_invalid');
  if (projection.status !== 'dry_run_only') blockers.push('status_not_dry_run_only');
  if (projection.displayCandidate?.directDisplayApproved !== false) blockers.push('direct_display_approved_claimed');
  if (projection.displayCandidate?.rawHeadlineOrSourceTextDisplayed !== false) blockers.push('raw_source_text_displayed_claimed');
  if (projection.currentProductionState?.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (projection.currentProductionState?.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (projection.currentProductionState?.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  for (const [key, value] of Object.entries(projection.approvals || {})) {
    if (value !== false) blockers.push(`approval_${key}_claimed`);
  }
  for (const [key, value] of Object.entries(projection.productionImpact || {})) {
    if (value !== false) blockers.push(`production_impact_${key}_claimed`);
  }
  if (projection.boundaries?.noNetworkCall !== true) blockers.push('no_network_boundary_missing');
  if (projection.boundaries?.noProductionWrite !== true) blockers.push('no_production_write_boundary_missing');
  if (projection.boundaries?.notProductionData !== true) blockers.push('not_production_data_boundary_missing');
  return blockers;
}

function summarizeProjection(input) {
  const projection = input.data;
  const blockers = projectionBlockers(projection);
  const repeatedRoutes = Array.isArray(projection.displayCandidate?.routeSummary?.repeatedRoutes)
    ? projection.displayCandidate.routeSummary.repeatedRoutes
    : [];
  return {
    projectionId: shortHash({ path: input.safePath, generatedAt: projection.generatedAt }),
    sourcePath: input.safePath,
    generatedAt: isoOrNull(projection.generatedAt),
    status: projection.status || null,
    projectionState: projection.projectionState || null,
    usable: blockers.length === 0 && projection.projectionState === 'manual_review_ready_non_production',
    blockers,
    sampleCount: Number(projection.input?.sampleCount || 0),
    usableSampleCount: Number(projection.input?.usableSampleCount || 0),
    repeatedRouteCount: Number(projection.displayCandidate?.routeSummary?.repeatedRouteCount || 0),
    observedRouteCount: Number(projection.displayCandidate?.routeSummary?.observedRouteCount || 0),
    repeatedRoutes: repeatedRoutes.map((route) => ({
      routeCode: route.routeCode,
      bucketKey: route.bucketKey,
      sampleCount: Number(route.sampleCount || 0),
      assessmentDateCount: Number(route.assessmentDateCount || 0),
      latestWeeklyChangePct: Number.isFinite(Number(route.latestWeeklyChangePct)) ? Number(route.latestWeeklyChangePct) : null
    }))
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key] || 'unknown'] = (counts[item[key] || 'unknown'] || 0) + 1;
  return counts;
}

function buildRouteCoverage(projections) {
  const routeMap = new Map();
  for (const projection of projections.filter((item) => item.usable)) {
    for (const route of projection.repeatedRoutes) {
      if (!routeMap.has(route.routeCode)) {
        routeMap.set(route.routeCode, {
          routeCode: route.routeCode,
          bucketKey: route.bucketKey,
          projectionCount: 0,
          maxSampleCount: 0,
          maxAssessmentDateCount: 0,
          latestWeeklyChangePct: null
        });
      }
      const row = routeMap.get(route.routeCode);
      row.projectionCount += 1;
      row.maxSampleCount = Math.max(row.maxSampleCount, route.sampleCount);
      row.maxAssessmentDateCount = Math.max(row.maxAssessmentDateCount, route.assessmentDateCount);
      row.latestWeeklyChangePct = route.latestWeeklyChangePct;
    }
  }
  return [...routeMap.values()].sort((a, b) => a.routeCode.localeCompare(b.routeCode));
}

function buildReview(inputs, options) {
  const projections = inputs.map(summarizeProjection);
  const usableProjections = projections.filter((projection) => projection.usable);
  const blockers = projections.flatMap((projection) => projection.blockers.map((reason) => ({ projectionId: projection.projectionId, reason })));
  const warnings = [];
  if (usableProjections.length < options.minProjections) warnings.push('collect_more_usable_display_projections');
  if (usableProjections.every((projection) => projection.repeatedRouteCount === 0)) warnings.push('no_repeated_route_projection');

  let status = 'warn';
  let recommendation = 'collect_more_projection_artifacts_keep_non_production';
  if (blockers.length > 0) {
    status = 'fail';
    recommendation = 'operator_cleanup_required_keep_non_production';
  } else if (usableProjections.length >= options.minProjections && warnings.length === 0) {
    status = 'pass';
    recommendation = 'projection_review_ready_for_human_display_design_keep_non_production';
  }

  return {
    schemaVersion: REVIEW_VERSION,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    minProjections: options.minProjections,
    inputCount: inputs.length,
    projectionCount: projections.length,
    usableProjectionCount: usableProjections.length,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    directDisplayApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    projectionStateCounts: countBy(projections, 'projectionState'),
    routeCoverage: buildRouteCoverage(projections),
    projections: projections.map((projection) => ({
      projectionId: projection.projectionId,
      sourcePath: projection.sourcePath,
      generatedAt: projection.generatedAt,
      projectionState: projection.projectionState,
      usable: projection.usable,
      sampleCount: projection.sampleCount,
      usableSampleCount: projection.usableSampleCount,
      repeatedRouteCount: projection.repeatedRouteCount,
      observedRouteCount: projection.observedRouteCount,
      blockers: projection.blockers
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
      noRawProviderResponseStored: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function buildEmptyReview(options) {
  return {
    schemaVersion: REVIEW_VERSION,
    status: options.allowEmpty ? 'empty' : 'fail',
    recommendation: 'provide_projection_artifacts_under_manual_artifacts',
    generatedAt: new Date().toISOString(),
    minProjections: options.minProjections,
    inputCount: 0,
    projectionCount: 0,
    usableProjectionCount: 0,
    promotionEligible: false,
    productionWriteApproved: false,
    productionDisplayApproved: false,
    directDisplayApproved: false,
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
      noRawProviderResponseStored: true,
      notProductionData: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(review) {
  console.log(`Route-level tanker freight production display projection review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`projectionCount: ${review.projectionCount}`);
  console.log(`usableProjectionCount: ${review.usableProjectionCount}`);
  console.log(`blockerCount: ${review.blockerCount ?? 0}`);
  console.log(`warningCount: ${review.warningCount ?? 0}`);
  console.log(`directDisplayApproved: ${review.directDisplayApproved}`);
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
