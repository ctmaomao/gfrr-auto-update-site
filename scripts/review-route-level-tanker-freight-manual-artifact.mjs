#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const CONTRACT_VERSION = 'route-level-tanker-freight-manual-artifact-scaffold-v1';
const INPUT_SCHEMA = 'route-level-tanker-freight-manual-input-v1';
const OUTPUT_SCHEMA = 'route-level-tanker-freight-proof-review-v1';
const DEFAULT_INPUT = 'manual-artifacts/route-level-tanker-freight/manual-input.json';
const DEFAULT_OUTPUT = 'manual-artifacts/route-level-tanker-freight/route-level-tanker-freight-proof-review-latest.json';
const BOUNDARY = 'dry-run-only route-level tanker freight manual artifact review; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const ROUTE_TO_BUCKET = new Map([
  ['TD3C', 'hormuz_meg_crude'],
  ['TD2', 'hormuz_meg_crude'],
  ['TD8', 'hormuz_meg_crude'],
  ['TD34', 'hormuz_meg_crude'],
  ['TC1', 'meg_clean_products'],
  ['TC5', 'meg_clean_products'],
  ['TC20', 'meg_clean_products'],
  ['TD15', 'red_sea_suez_cape_rerouting'],
  ['TD20', 'red_sea_suez_cape_rerouting'],
  ['TD22', 'red_sea_suez_cape_rerouting'],
  ['TD25', 'red_sea_suez_cape_rerouting'],
  ['BDTI', 'aggregate_context_only'],
  ['BCTI', 'aggregate_context_only'],
  ['BDI', 'aggregate_context_only']
]);

const ROUTE_LEVEL_BUCKETS = new Set([
  'hormuz_meg_crude',
  'meg_clean_products',
  'red_sea_suez_cape_rerouting'
]);

const ALLOWED_UNITS = new Set([
  'worldscale',
  'ws',
  'usd/ton',
  'usd/day',
  'time_charter_equivalent',
  'time-charter equivalent',
  'futures_settlement_unit'
]);

function usage() {
  console.log(`Usage:
  npm run review:route-level-tanker-freight-manual-artifact -- [options]

Options:
  --input <path>   Manual input JSON. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored review artifact path. Default: ${DEFAULT_OUTPUT}
  --dry-run        Accepted for explicitness; this scaffold is always dry-run only.
  --json           Print full JSON review to stdout.
  --no-output      Do not write the ignored manual review artifact.
  --help           Show this help.`);
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/') === true;
}

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, writeOutput: true, printJson: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--dry-run') continue;
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isManualArtifactPath(options.input) && !isFixturePath(options.input)) {
    throw new Error(`Refusing to read input outside manual-artifacts/ or docs/fixtures/: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function nowIso() {
  return new Date().toISOString();
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function hashText(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
}

function hostHint(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\bhttps?:\/\/([^/\s?#]+)/iu);
  return match ? match[1].replace(/^www\./iu, '').toLowerCase() : null;
}

function emptyBucketCoverage() {
  return {
    hormuz_meg_crude: 0,
    meg_clean_products: 0,
    red_sea_suez_cape_rerouting: 0,
    aggregate_context_only: 0
  };
}

function emptyRejectionsByReason() {
  return {
    schema_version_invalid: 0,
    prepared_at_invalid: 0,
    source_review_missing: 0,
    license_or_redistribution_claim_not_accepted: 0,
    routes_not_array: 0,
    route_code_unknown: 0,
    bucket_mismatch: 0,
    aggregate_context_not_route_confirmation: 0,
    assessment_date_invalid: 0,
    unit_invalid: 0,
    value_invalid: 0,
    change_pct_invalid: 0,
    citation_missing: 0
  };
}

function baseReview(options) {
  return {
    schemaVersion: OUTPUT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    status: 'dry_run_only',
    recommendation: 'manual_artifact_scaffold_only_collect_operator_input',
    generatedAt: nowIso(),
    inputPath: safeRelativePath(options.input),
    outputPath: options.writeOutput ? safeRelativePath(options.output) : null,
    dryRunOnly: true,
    promotionEligible: false,
    productionWriteApproved: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    eligibleForMainScore: false,
    sourceReviewState: {
      sourceRightsAccepted: false,
      complianceReviewRequired: true,
      licenseReviewedClaimed: false,
      redistributionApprovedClaimed: false,
      operatorAttestationHash: null
    },
    review: {
      acceptedRouteCount: 0,
      contextOnlyCount: 0,
      rejectedRouteCount: 0,
      rejectedInputLevelIssueCount: 0,
      bucketCoverage: emptyBucketCoverage(),
      rejectionsByReason: emptyRejectionsByReason(),
      acceptedRoutes: [],
      contextOnlyRoutes: [],
      rejectedRoutes: [],
      inputLevelIssues: []
    },
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
    },
    boundary: BOUNDARY
  };
}

function inc(review, reason) {
  review.review.rejectionsByReason[reason] = (review.review.rejectionsByReason[reason] || 0) + 1;
}

function inputIssue(review, reason, detail) {
  inc(review, reason);
  review.review.rejectedInputLevelIssueCount += 1;
  review.review.inputLevelIssues.push({ reason, detail });
}

function rejectRoute(review, index, route, reason, detail) {
  inc(review, reason);
  review.review.rejectedRouteCount += 1;
  review.review.rejectedRoutes.push({
    index,
    routeCode: typeof route?.routeCode === 'string' ? route.routeCode.toUpperCase() : null,
    bucketKey: typeof route?.bucketKey === 'string' ? route.bucketKey : null,
    reason,
    detail
  });
}

function sanitizedRoute(route, bucketKey, role) {
  const citation = typeof route.sourceCitation === 'string' ? route.sourceCitation : '';
  return {
    routeCode: route.routeCode.toUpperCase(),
    bucketKey,
    role,
    assessmentDate: route.assessmentDate,
    unit: String(route.unit).trim(),
    value: round(Number(route.value), 4),
    dailyChangePct: round(numberOrNull(route.dailyChangePct), 3),
    weeklyChangePct: round(numberOrNull(route.weeklyChangePct), 3),
    sourceCitationHash: hashText(citation),
    sourceCitationHostHint: hostHint(citation),
    rawCitationStored: false
  };
}

function reviewRoute(review, route, index) {
  const routeCode = typeof route?.routeCode === 'string' ? route.routeCode.toUpperCase().trim() : '';
  const expectedBucket = ROUTE_TO_BUCKET.get(routeCode);
  if (!expectedBucket) return rejectRoute(review, index, route, 'route_code_unknown', 'Unknown route code.');
  if (route.bucketKey !== expectedBucket) return rejectRoute(review, index, route, 'bucket_mismatch', `Expected ${expectedBucket}.`);
  if (!isIsoDate(route.assessmentDate)) return rejectRoute(review, index, route, 'assessment_date_invalid', 'Expected YYYY-MM-DD.');
  if (!ALLOWED_UNITS.has(String(route.unit || '').trim().toLowerCase())) return rejectRoute(review, index, route, 'unit_invalid', 'Unit is not explicit.');
  const value = numberOrNull(route.value);
  if (!Number.isFinite(value) || value <= 0) return rejectRoute(review, index, route, 'value_invalid', 'Value must be positive finite number.');
  for (const field of ['dailyChangePct', 'weeklyChangePct']) {
    if (route[field] !== null && route[field] !== undefined && !Number.isFinite(numberOrNull(route[field]))) {
      return rejectRoute(review, index, route, 'change_pct_invalid', `${field} must be numeric or null.`);
    }
  }
  if (typeof route.sourceCitation !== 'string' || route.sourceCitation.trim().length < 6) {
    return rejectRoute(review, index, route, 'citation_missing', 'Citation hint is required and will be hashed.');
  }

  const role = ROUTE_LEVEL_BUCKETS.has(expectedBucket) ? 'route_level_candidate' : 'aggregate_context_only';
  const row = sanitizedRoute(route, expectedBucket, role);
  review.review.bucketCoverage[expectedBucket] += 1;
  if (role === 'aggregate_context_only') {
    inc(review, 'aggregate_context_not_route_confirmation');
    review.review.contextOnlyCount += 1;
    review.review.contextOnlyRoutes.push(row);
  } else {
    review.review.acceptedRouteCount += 1;
    review.review.acceptedRoutes.push(row);
  }
  return null;
}

function reviewInput(input, options) {
  const review = baseReview(options);
  if (input.schemaVersion !== INPUT_SCHEMA) inputIssue(review, 'schema_version_invalid', `Expected ${INPUT_SCHEMA}.`);
  if (!isoOrNull(input.preparedAt)) inputIssue(review, 'prepared_at_invalid', 'preparedAt must be ISO timestamp.');
  if (!input.sourceReview || typeof input.sourceReview !== 'object') {
    inputIssue(review, 'source_review_missing', 'sourceReview object is required.');
  } else {
    review.sourceReviewState.licenseReviewedClaimed = input.sourceReview.licenseReviewed === true;
    review.sourceReviewState.redistributionApprovedClaimed = input.sourceReview.redistributionApproved === true;
    review.sourceReviewState.operatorAttestationHash = hashText(input.sourceReview.operatorAttestation || '');
    if (input.sourceReview.licenseReviewed === true || input.sourceReview.redistributionApproved === true) {
      inputIssue(review, 'license_or_redistribution_claim_not_accepted', 'Separate compliance review is required.');
    }
  }
  if (!Array.isArray(input.routes)) {
    inputIssue(review, 'routes_not_array', 'routes must be an array.');
  } else {
    input.routes.forEach((route, index) => reviewRoute(review, route, index));
  }
  if (review.review.acceptedRouteCount > 0 && review.review.rejectedInputLevelIssueCount === 0 && review.review.rejectedRouteCount === 0) {
    review.recommendation = 'manual_artifact_reviewable_keep_dry_run_only';
  } else if (review.review.rejectedInputLevelIssueCount > 0 || review.review.rejectedRouteCount > 0) {
    review.recommendation = 'manual_artifact_needs_operator_cleanup_keep_dry_run_only';
  }
  return review;
}

function missingInputReview(options) {
  const review = baseReview(options);
  review.status = 'input_missing_dry_run_only';
  review.recommendation = 'create_manual_input_under_manual_artifacts_then_rerun';
  inputIssue(review, 'routes_not_array', `Input file not found: ${options.input}`);
  return review;
}

function printSummary(review) {
  console.log(`Route-level tanker freight manual artifact scaffold: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`acceptedRouteCount: ${review.review.acceptedRouteCount}`);
  console.log(`contextOnlyCount: ${review.review.contextOnlyCount}`);
  console.log(`rejectedRouteCount: ${review.review.rejectedRouteCount}`);
  console.log(`rejectedInputLevelIssueCount: ${review.review.rejectedInputLevelIssueCount}`);
  console.log(`outputPath: ${review.outputPath || '(no-output)'}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputPath = resolve(options.input);
    const review = existsSync(inputPath)
      ? reviewInput(JSON.parse(readFileSync(inputPath, 'utf8')), options)
      : missingInputReview(options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
