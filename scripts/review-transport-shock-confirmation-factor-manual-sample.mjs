import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_INPUT = 'manual-artifacts/transport-shock-confirmation-factor/manual-sample-input.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/manual-sample-review-latest.json';
const SCHEMA_VERSION = 'transport-shock-confirmation-factor-manual-sample-review-v1';
const CONTRACT_VERSION = 'transport-shock-confirmation-factor-manual-sample-scaffold-v1';

const ALLOWED_SOURCES = new Set([
  'imf_portwatch_chokepoint_context',
  'iea_middle_east_chokepoint_monitor',
  'solactive_breakwave_wet_freight_futures_index',
  'cme_td3c_public_product_page',
  'ice_td3c_public_product_page',
  'baltic_weekly_tanker_report_public_route_signal',
  'stockq_aggregate_bdti_bcti_context'
]);

const ALLOWED_BUCKETS = new Set([
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
]);

const ALLOWED_DIRECTIONS = new Set(['tightening', 'easing', 'mixed', 'unavailable']);

function usage() {
  console.log(`Usage:
  node scripts/review-transport-shock-confirmation-factor-manual-sample.mjs [--input path] [--output path] [--no-output] [--json]

Boundary:
  dry-run-only Transport Shock Confirmation Factor manual sample scaffold.
  Reads only manual-artifacts/transport-shock-confirmation-factor/ or docs/fixtures/.
  outputOnlyToManualArtifacts. noNetworkCall. noEnvironmentRead. noProductionWrite.
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function baseReview(inputPath, status) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    status,
    generatedAt: nowIso(),
    inputPath: safeRelativePath(inputPath),
    promotionEligible: false,
    productionWriteApproved: false,
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
        free_route_linked_tanker_transport_pressure_proxy: 0,
        baltic_weekly_tanker_report_public_route_signal: 0
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
    limitationZh: '人工样本审查仅用于 Transport Shock Confirmation Factor 后续样本整理;不抓取外部源、不写生产数据、不进入 ODP finalBias 或今日总判断打分。'
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
    routeCode: typeof observation.routeCode === 'string' ? observation.routeCode : null,
    direction,
    strength: finiteOrNull(observation.strength),
    citationHostHint: hostHint(observation.citationUrl),
    sourceCitationHash: hashText(observation.citationUrl),
    rawCitationStored: false
  });
}

function reviewInput(inputPath) {
  if (!fs.existsSync(path.join(ROOT, inputPath))) {
    return baseReview(inputPath, 'input_missing_dry_run_only');
  }
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, inputPath), 'utf8'));
  const review = baseReview(inputPath, 'dry_run_only');
  if (input.schemaVersion !== 'transport-shock-confirmation-factor-manual-sample-input-v1') {
    rejectObservation(review, {}, 'unsupported_schema_version');
    return review;
  }
  if (input.sourceRights?.liveFetchApproved !== false || input.sourceRights?.productionWriteApproved !== false || input.sourceRights?.scoreApproved !== false) {
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

function writeJson(outputPath, review) {
  const absoluteOutput = path.join(ROOT, outputPath);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`);
}

function printSummary(review) {
  console.log(`Transport Shock Confirmation Factor manual sample review: ${review.status}`);
  console.log(`accepted: ${review.review.acceptedObservationCount}`);
  console.log(`rejected: ${review.review.rejectedObservationCount}`);
  console.log('boundary: manual sample scaffold only; no live fetch, no production write, no frontend, no shadow score, no ODP finalBias, no main judgment scoring');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = reviewInput(options.input);
  if (options.writeOutput) writeJson(options.output, review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else printSummary(review);
}

main();
