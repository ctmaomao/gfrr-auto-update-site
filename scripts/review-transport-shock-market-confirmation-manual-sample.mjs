import { writeJson } from './lib/check-script-helpers.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_INPUT =
  'manual-artifacts/transport-shock-confirmation-factor/market-confirmation-manual-sample-input.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/market-confirmation-manual-sample-review-latest.json';
const SCHEMA_VERSION = 'transport-shock-market-confirmation-manual-sample-review-v1';
const CONTRACT_VERSION = 'transport-shock-market-confirmation-manual-sample-scaffold-v1';
const SOURCE_REVIEW_CONTRACT = 'transport-shock-confirmation-factor-market-confirmation-source-review-v1';

const ALLOWED_SOURCES = new Set([
  'brent_futures_price_curve_proxy',
  'ice_brent_futures_structure_context',
  'eia_brent_spot_proxy',
  'odp_brent_wti_price_reaction_proxy',
  'odp_crack_spread_proxy',
  'oil_news_market_reaction_bucket'
]);

const ALLOWED_BUCKETS = new Set([
  'brent_price_structure_confirmation',
  'oil_news_market_reaction_confirmation',
  'odp_market_stress_context'
]);

const ALLOWED_DIRECTIONS = new Set([
  'tightening',
  'easing',
  'market_reaction_present',
  'market_reaction_absent',
  'confirms_transport_stress',
  'diverges_from_transport_stress',
  'mixed',
  'unavailable'
]);

function usage() {
  console.log(`Usage:
  node scripts/review-transport-shock-market-confirmation-manual-sample.mjs [--input path] [--output path] [--no-output] [--json]

Boundary:
  dry-run-only Transport Shock market-confirmation manual sample scaffold.
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only ignored manual-artifacts/transport-shock-confirmation-factor/.
  noNetworkCall. noEnvironmentRead. noProductionWrite. noMarketConfirmationWrite. noScoreWrite.
`);
}

function safeRelativePath(inputPath) {
  return String(inputPath || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function isManualArtifactPath(inputPath) {
  return safeRelativePath(inputPath).startsWith('manual-artifacts/transport-shock-confirmation-factor/');
}

function isFixturePath(inputPath) {
  return safeRelativePath(inputPath).startsWith('docs/fixtures/transport-shock-confirmation-factor/');
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
    throw new Error(`Refusing to read input outside manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/transport-shock-confirmation-factor/: ${options.input}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function nowIso() {
  return new Date().toISOString();
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hostHint(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./u, '');
  } catch {
    return null;
  }
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function baseReview(inputPath, status) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    sourceReviewContract: SOURCE_REVIEW_CONTRACT,
    status,
    generatedAt: nowIso(),
    inputPath: safeRelativePath(inputPath),
    promotionEligible: false,
    productionWriteApproved: false,
    marketConfirmationWriteApproved: false,
    scoreWriteApproved: false,
    shadowScoreApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    review: {
      acceptedObservationCount: 0,
      rejectedObservationCount: 0,
      directionCounts: {},
      bucketCoverage: {
        brent_price_structure_confirmation: 0,
        oil_news_market_reaction_confirmation: 0,
        odp_market_stress_context: 0
      },
      sourceCoverage: {},
      acceptedObservations: [],
      rejectedObservations: []
    },
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noMarketConfirmationWrite: true,
      noScoreWrite: true,
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
    },
    limitationZh: '人工市场确认样本审查仅用于 Transport Shock Confirmation Factor 后续样本整理;不抓取外部源、不写生产数据、不改变 marketConfirmation、ODP finalBias 或今日总判断打分。'
  };
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function rejectObservation(review, observation, reason) {
  review.review.rejectedObservationCount += 1;
  review.review.rejectedObservations.push({
    sourceKey: observation?.sourceKey || null,
    bucketKey: observation?.bucketKey || null,
    reason
  });
}

function acceptObservation(review, observation) {
  const sourceKey = observation.sourceKey;
  const bucketKey = observation.bucketKey;
  const direction = observation.direction;
  review.review.acceptedObservationCount += 1;
  increment(review.review.directionCounts, direction);
  increment(review.review.sourceCoverage, sourceKey);
  review.review.bucketCoverage[bucketKey] = (review.review.bucketCoverage[bucketKey] || 0) + 1;
  review.review.acceptedObservations.push({
    sourceKey,
    bucketKey,
    observedAt: typeof observation.observedAt === 'string' ? observation.observedAt : null,
    direction,
    strength: finiteOrNull(observation.strength),
    value: finiteOrNull(observation.value),
    valueUnit: typeof observation.valueUnit === 'string' ? observation.valueUnit : null,
    citationHostHint: hostHint(observation.citationUrl),
    sourceCitationHash: hashText(observation.citationUrl),
    rawCitationStored: false
  });
}

function reviewInput(inputPath) {
  const absoluteInput = path.join(ROOT, inputPath);
  if (!fs.existsSync(absoluteInput)) {
    return baseReview(inputPath, 'input_missing_dry_run_only');
  }
  const input = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  const review = baseReview(inputPath, 'dry_run_only');
  if (input.schemaVersion !== 'transport-shock-market-confirmation-manual-sample-input-v1') {
    rejectObservation(review, {}, 'unsupported_schema_version');
    return review;
  }
  if (input.sourceReviewContract !== SOURCE_REVIEW_CONTRACT) {
    rejectObservation(review, {}, 'unsupported_source_review_contract');
    return review;
  }
  if (
    input.sourceRights?.liveFetchApproved !== false ||
    input.sourceRights?.productionWriteApproved !== false ||
    input.sourceRights?.marketConfirmationWriteApproved !== false ||
    input.sourceRights?.scoreApproved !== false
  ) {
    rejectObservation(review, {}, 'source_rights_claim_not_fail_closed');
    return review;
  }
  const observations = Array.isArray(input.observations) ? input.observations : [];
  for (const observation of observations) {
    if (!ALLOWED_SOURCES.has(observation?.sourceKey)) {
      rejectObservation(review, observation, 'unsupported_source');
    } else if (!ALLOWED_BUCKETS.has(observation?.bucketKey)) {
      rejectObservation(review, observation, 'unsupported_bucket');
    } else if (!ALLOWED_DIRECTIONS.has(observation?.direction)) {
      rejectObservation(review, observation, 'unsupported_direction');
    } else {
      acceptObservation(review, observation);
    }
  }
  return review;
}

function printSummary(review) {
  console.log(`Transport Shock market-confirmation manual sample review: ${review.status}`);
  console.log(`accepted: ${review.review.acceptedObservationCount}`);
  console.log(`rejected: ${review.review.rejectedObservationCount}`);
  console.log('boundary: market-confirmation manual sample scaffold only; no live fetch, no production write, no marketConfirmation write, no score write');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = reviewInput(options.input);
  if (options.writeOutput) writeJson(options.output, review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else printSummary(review);
}

main();
