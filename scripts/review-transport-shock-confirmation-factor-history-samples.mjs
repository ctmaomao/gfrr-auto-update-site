#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath, writeJson } from './lib/check-script-helpers.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'transport-shock-confirmation-factor-history-samples-review-v1';
const SAMPLE_SCHEMA = 'transport-shock-confirmation-factor-history-sample-1';
const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const DEFAULT_INPUT_DIR = 'manual-artifacts/transport-shock-confirmation-factor/history-samples';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 2;
const BOUNDARY =
  'manual/local Transport Shock Confirmation Factor git-history sample review only; reads ignored history samples or fixtures; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-history-samples -- [options]

Options:
  --input <path>       History sample JSON. May be repeated.
  --input-dir <path>   Directory of history sample JSON files. Default: ${DEFAULT_INPUT_DIR}
  --min-samples <n>    Minimum usable samples for readiness. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Ignored manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN/EMPTY/FAIL.
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

  if (options.inputs.length === 0 && options.inputDirs.length === 0) options.inputDirs.push(DEFAULT_INPUT_DIR);
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
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
    if (!existsSync(absoluteDir)) continue;
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json')
      .filter((name) => !name.endsWith('.archive-meta.json'))
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function finiteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function falseBoundaryFlags(candidate) {
  const boundaries = candidate?.boundaries;
  if (!isPlainObject(boundaries)) return false;
  return [
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsWorldOrderWeights',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ].every((key) => boundaries[key] === false);
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

function impactBlockers(impact) {
  const required = productionImpactFalseMap();
  return Object.keys(required).filter((key) => impact?.[key] === true);
}

function candidateBlockers(candidate) {
  const blockers = [];
  if (!isPlainObject(candidate)) return ['candidate_missing_or_invalid'];
  if (candidate.contractVersion !== CONTRACT_VERSION) blockers.push('candidate_contract_version_invalid');
  if (!['unavailable', 'normal', 'watch', 'elevated_watch'].includes(candidate.status)) blockers.push('candidate_status_invalid');
  if (!finiteNumberOrNull(candidate.score)) blockers.push('candidate_score_invalid');
  if (Number.isFinite(candidate.score) && (candidate.score < 0 || candidate.score > 100)) blockers.push('candidate_score_out_of_range');
  if (!['none', 'low'].includes(candidate.confidence)) blockers.push('candidate_confidence_invalid');
  if (candidate.candidateOnly !== true) blockers.push('candidate_only_not_true');
  if (candidate.auditOnly !== true) blockers.push('audit_only_not_true');
  if (candidate.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  if (candidate.routeFreightConfirmation !== 'not_connected') blockers.push('route_freight_confirmation_connected');
  if (candidate.marketConfirmation !== 'not_connected') blockers.push('market_confirmation_connected');
  if (!isPlainObject(candidate.evidence)) blockers.push('candidate_evidence_missing');
  if (!Array.isArray(candidate.drivers)) blockers.push('candidate_drivers_missing');
  if (!Array.isArray(candidate.reasons) || candidate.reasons.length === 0) blockers.push('candidate_reasons_missing');
  if (!falseBoundaryFlags(candidate)) blockers.push('candidate_boundary_flags_not_false');
  return blockers;
}

function artifactBlockers(artifact) {
  const blockers = [];
  if (artifact.schemaVersion !== SAMPLE_SCHEMA) blockers.push('sample_schema_version_invalid');
  if (!isoOrNull(artifact.payloadUpdatedAt)) blockers.push('payload_updated_at_invalid');
  if (!isPlainObject(artifact.energyTransport)) blockers.push('energy_transport_missing');
  if (artifact.energyTransport?.redistributionCaveat !== true) blockers.push('redistribution_caveat_not_true');
  if (artifact.energyTransport?.usageTermsPinned !== 'imf_data_terms_pinned') blockers.push('usage_terms_not_pinned_to_imf');
  if (typeof artifact.energyTransport?.latestDate !== 'string') blockers.push('latest_date_missing');
  if (!Number.isFinite(artifact.energyTransport?.latestAgeDays)) blockers.push('latest_age_days_missing');
  blockers.push(...candidateBlockers(artifact.transportShockCandidate));
  blockers.push(...impactBlockers(artifact.productionImpact).map((key) => `production_impact_${key}_claimed`));
  if (artifact.boundary !== BOUNDARY && typeof artifact.boundary !== 'string') blockers.push('boundary_missing');
  return blockers;
}

function sourceStatusLabel(sourceStatus) {
  if (typeof sourceStatus === 'string') return sourceStatus;
  if (isPlainObject(sourceStatus) && typeof sourceStatus.chokepoints === 'string') return sourceStatus.chokepoints;
  return 'unknown';
}

function summarizeArtifact(input) {
  const artifact = input.data;
  const blockers = artifactBlockers(artifact);
  const candidate = artifact.transportShockCandidate;
  return {
    sampleId: hashText(`${input.safePath}:${artifact.payloadUpdatedAt || ''}`),
    sourcePath: input.safePath,
    usable: blockers.length === 0,
    blockers,
    payloadUpdatedAt: isoOrNull(artifact.payloadUpdatedAt),
    releaseVersion: artifact.releaseVersion ?? null,
    sourceStatus: sourceStatusLabel(artifact.energyTransport?.sourceStatus),
    latestDate: artifact.energyTransport?.latestDate ?? null,
    latestAgeDays: Number.isFinite(artifact.energyTransport?.latestAgeDays)
      ? artifact.energyTransport.latestAgeDays
      : null,
    candidateStatus: candidate?.status ?? null,
    candidateScore: Number.isFinite(candidate?.score) ? candidate.score : null,
    candidateConfidence: candidate?.confidence ?? null,
    driverCount: Array.isArray(candidate?.drivers) ? candidate.drivers.length : 0,
    reasonCount: Array.isArray(candidate?.reasons) ? candidate.reasons.length : 0
  };
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) {
    const value = row[key] ?? 'unknown';
    result[value] = (result[value] || 0) + 1;
  }
  return result;
}

function minMax(values) {
  const numeric = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { min: numeric[0] ?? null, max: numeric.at(-1) ?? null };
}

function minMaxIso(values) {
  const sorted = values.filter(Boolean).sort();
  return { earliest: sorted[0] || null, latest: sorted.at(-1) || null };
}

function buildReview(inputs, options) {
  const samples = inputs.map(summarizeArtifact);
  const usableSamples = samples.filter((sample) => sample.usable);
  const blockers = samples.flatMap((sample) => sample.blockers.map((reason) => ({ sampleId: sample.sampleId, reason })));
  const warnings = [];
  if (usableSamples.length < options.minSamples) warnings.push('collect_more_git_history_samples');
  if (usableSamples.some((sample) => sample.sourceStatus !== 'live')) warnings.push('non_live_source_status_observed');
  if (usableSamples.some((sample) => Number.isFinite(sample.latestAgeDays) && sample.latestAgeDays > 7)) {
    warnings.push('portwatch_latest_date_age_over_7_days');
  }

  let status = 'warn';
  let recommendation = 'collect_more_history_samples_keep_display_only';
  if (blockers.length > 0) {
    status = 'fail';
    recommendation = 'operator_cleanup_required_keep_non_production';
  } else if (usableSamples.length >= options.minSamples) {
    status = 'pass';
    recommendation = 'history_samples_review_ready_keep_display_only';
  }

  return {
    schemaVersion: REVIEW_VERSION,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    inputCount: inputs.length,
    sampleCount: samples.length,
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
    sampleWindow: minMaxIso(usableSamples.map((sample) => sample.payloadUpdatedAt)),
    latestDateWindow: minMaxIso(usableSamples.map((sample) => sample.latestDate)),
    latestAgeDays: minMax(usableSamples.map((sample) => sample.latestAgeDays)),
    candidateScore: minMax(usableSamples.map((sample) => sample.candidateScore)),
    sourceStatusCounts: countBy(usableSamples, 'sourceStatus'),
    candidateStatusCounts: countBy(usableSamples, 'candidateStatus'),
    candidateConfidenceCounts: countBy(usableSamples, 'candidateConfidence'),
    samples,
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
      noMainScoreEligibility: true
    },
    boundary: BOUNDARY
  };
}

function buildEmptyReview(options) {
  return {
    schemaVersion: REVIEW_VERSION,
    status: options.allowEmpty ? 'empty' : 'fail',
    recommendation: 'archive_history_samples_first',
    generatedAt: new Date().toISOString(),
    minSamples: options.minSamples,
    inputCount: 0,
    sampleCount: 0,
    usableSampleCount: 0,
    blockerCount: 0,
    warningCount: options.allowEmpty ? 1 : 0,
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
      noMainScoreEligibility: true
    },
    boundary: BOUNDARY
  };
}

function printSummary(review) {
  console.log(`Transport Shock Confirmation Factor history samples review: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`sampleCount: ${review.sampleCount}`);
  console.log(`usableSampleCount: ${review.usableSampleCount}`);
  console.log(`blockerCount: ${review.blockerCount ?? 0}`);
  console.log(`warningCount: ${review.warningCount ?? 0}`);
  console.log(`routeFreightConfirmation: ${review.routeFreightConfirmation}`);
  console.log(`eligibleForMainScore: ${review.eligibleForMainScore}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = expandInputFiles(options);
  const review = files.length > 0 ? buildReview(files.map(readInput), options) : buildEmptyReview(options);
  if (options.writeOutput) writeJson(options.output, review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else printSummary(review);
  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
