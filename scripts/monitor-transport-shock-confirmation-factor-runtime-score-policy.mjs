#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-runtime-score-policy-monitor-p56';
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-runtime-score-policy.mjs';
const REVIEW_SCHEMA_VERSION = 'transport-shock-confirmation-factor-runtime-score-policy-review-v1';
const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/runtime-score-policy-monitor-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock runtime score policy drift monitor; wraps P-score-55 policy review in no-output mode; writes ignored manual-artifacts only; no network, no production write, no runtime change, no score expansion, no route/market confirmation connection, and no effect on ODP finalBias, Brent promotion, Global Risk Heatmap, cross-validation, or Bubble Watch';

function usage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-runtime-score-policy -- [options]

Options:
  --input <path>   Production radar data or tracked fixture. Default: ${DEFAULT_INPUT}
  --output <path>  Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run        Do not write ignored artifact.
  --no-output      Do not write ignored artifact.
  --json           Print full JSON monitor result.
  --help           Show this help.

Boundary:
  Runs the P-score-55 policy replay review in no-output mode and watches for policy drift.
  It does not change Daily runtime, production data, frontend, Worker, ODP, Brent, Heatmap,
  cross-validation, or Bubble Watch.`);
}

function isProductionInputPath(filePath) {
  return safeRelativePath(filePath) === DEFAULT_INPUT;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isProductionInputPath(filePath) || isFixturePath(filePath);
}

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${filePath}`);
  }
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts/transport-shock-confirmation-factor');
  const outputDir = dirname(outputPath);
  const relativeDir = relative(rootPath, outputDir);
  const paths = [rootPath];
  let cursor = rootPath;
  if (relativeDir) {
    for (const segment of relativeDir.split(/[\\/]+/u).filter(Boolean)) {
      cursor = resolve(cursor, segment);
      paths.push(cursor);
    }
  }
  paths.push(outputPath);
  return paths;
}

function assertManualArtifactWritePath(filePath) {
  for (const existingPath of manualArtifactWritePathChain(filePath)) {
    if (!existsSync(existingPath)) continue;
    if (lstatSync(existingPath).isSymbolicLink()) {
      const displayPath = safeRelativePath(existingPath) || existingPath;
      throw new Error(`Refusing output through symlink/junction path segment: ${displayPath}`);
    }
  }
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--dry-run' || arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') options.input = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isSafeInputPath(options.input)) throw new Error(`Refusing input outside allowed paths: ${options.input}`);
  if (options.writeOutput) assertManualArtifactWritePath(options.output);
  return options;
}

function parseJsonStdout(stdout, label) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error(`${label} produced empty stdout`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not produce JSON: ${error.message}`);
  }
}

function runPolicyReview(inputPath) {
  const result = spawnSync(process.execPath, [REVIEW_SCRIPT, '--input', inputPath, '--no-output', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  const review = parseJsonStdout(result.stdout, 'P-score-55 runtime score policy review');
  return {
    review,
    reviewExitStatus: result.status,
    reviewStderr: String(result.stderr || '').trim()
  };
}

function classifyStatus(review, reviewExitStatus) {
  if (review?.schemaVersion !== REVIEW_SCHEMA_VERSION) return 'policy_review_schema_mismatch';
  if (review?.scorePolicyReviewPassed !== true || reviewExitStatus !== 0) return 'policy_drift_detected';
  if (review?.currentObservation?.applied === true) return 'nonzero_contribution_observed';
  return 'zero_contribution_observed';
}

function createMonitorResult(options) {
  const { review, reviewExitStatus, reviewStderr } = runPolicyReview(options.input);
  const status = classifyStatus(review, reviewExitStatus);
  const manualActionRequired = status === 'policy_drift_detected' || status === 'policy_review_schema_mismatch' || status === 'nonzero_contribution_observed';
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    artifactOnly: true,
    inputPath: safeRelativePath(options.input),
    review: {
      schemaVersion: review?.schemaVersion ?? null,
      status: review?.status ?? null,
      reviewExitStatus,
      reviewStderr,
      scorePolicyReviewPassed: review?.scorePolicyReviewPassed === true,
      blockerCount: Number.isFinite(review?.blockerCount) ? review.blockerCount : null,
      blockers: Array.isArray(review?.blockers) ? review.blockers : []
    },
    currentObservation: {
      applied: review?.currentObservation?.applied === true,
      contributionPct: Number.isFinite(review?.currentObservation?.contributionPct)
        ? review.currentObservation.contributionPct
        : null,
      maxContributionPct: Number.isFinite(review?.currentObservation?.maxContributionPct)
        ? review.currentObservation.maxContributionPct
        : null,
      reason: review?.currentObservation?.reason ?? null,
      expectedReason: review?.currentObservation?.expectedReason ?? null,
      sourceStatus: review?.currentObservation?.sourceStatus ?? null,
      latestAgeDays: Number.isFinite(review?.currentObservation?.latestAgeDays)
        ? review.currentObservation.latestAgeDays
        : null,
      candidateStatus: review?.currentObservation?.candidateStatus ?? null,
      candidateScore: Number.isFinite(review?.currentObservation?.candidateScore)
        ? review.currentObservation.candidateScore
        : null,
      scoreBeforeTransport: Number.isFinite(review?.currentObservation?.scoreBeforeTransport)
        ? review.currentObservation.scoreBeforeTransport
        : null,
      scoreAfterTransport: Number.isFinite(review?.currentObservation?.scoreAfterTransport)
        ? review.currentObservation.scoreAfterTransport
        : null
    },
    policySummary: {
      sourcePath: review?.policy?.sourcePath ?? 'macroDrivers.energyTransport.transportShockCandidate',
      maxContributionPct: review?.policy?.maxContributionPct ?? null,
      staleAfterDays: review?.policy?.staleAfterDays ?? null,
      direction: review?.policy?.direction ?? null,
      thresholds: Array.isArray(review?.policy?.thresholds) ? review.policy.thresholds : []
    },
    manualAction: {
      requiredNow: manualActionRequired,
      recommendation:
        status === 'policy_drift_detected' || status === 'policy_review_schema_mismatch'
          ? 'fix_transport_shock_runtime_score_policy_drift_before_next_score_change'
          : status === 'nonzero_contribution_observed'
            ? 'review_latest_nonzero_transport_shock_contribution_and_keep_cap_visible'
            : 'continue_monitoring_until_transport_pressure_candidate_triggers_nonzero_contribution',
      followUpCheck: 'npm run check:transport-shock-confirmation-factor-runtime-score-policy-monitor'
    },
    artifacts: {
      outputPath: options.writeOutput ? resolve(options.output) : null
    },
    productionImpact: {
      writesProductionData: false,
      modifiesRuntimeScoring: false,
      modifiesFrontend: false,
      modifiesWorkerRuntime: false,
      modifiesWorkflow: false,
      fetchesNetwork: false,
      readsSecrets: false,
      expandsScorePolicy: false,
      connectsRouteFreightConfirmation: false,
      connectsMarketConfirmation: false,
      affectsValues: false,
      affectsScoringByThisMonitor: false,
      affectsDecisionModelByThisMonitor: false,
      affectsExecutionLockByThisMonitor: false,
      affectsPositionGuidanceByThisMonitor: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false,
      affectsBubbleWatch: false
    },
    boundary: BOUNDARY
  };
}

function assertMonitorBoundary(result) {
  const text = JSON.stringify(result);
  for (const forbidden of [
    'FIRMS_MAP_KEY',
    'TAVILY_API_KEY',
    'BRAVE_API_KEY',
    'routeFreightConfirmationConnected":true',
    'marketConfirmationConnected":true'
  ]) {
    if (text.includes(forbidden)) throw new Error(`Monitor output contains forbidden marker: ${forbidden}`);
  }
}

function writeMonitorArtifact(options, result) {
  if (!options.writeOutput) return;
  assertManualArtifactWritePath(options.output);
  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function printSummary(result) {
  console.log(`Transport Shock runtime score policy monitor: ${result.status}`);
  console.log(`reviewStatus: ${result.review.status}`);
  console.log(`scorePolicyReviewPassed: ${result.review.scorePolicyReviewPassed}`);
  console.log(`currentContribution: ${result.currentObservation.contributionPct}/${result.currentObservation.maxContributionPct}`);
  console.log(`currentReason: ${result.currentObservation.reason}`);
  console.log(`expectedReason: ${result.currentObservation.expectedReason}`);
  console.log(`manualAction.requiredNow: ${result.manualAction.requiredNow}`);
  console.log(`recommendation: ${result.manualAction.recommendation}`);
  if (result.artifacts.outputPath) console.log(`outputPath: ${result.artifacts.outputPath}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = createMonitorResult(options);
    assertMonitorBoundary(result);
    writeMonitorArtifact(options, result);
    if (options.printJson) console.log(JSON.stringify(result, null, 2));
    else printSummary(result);
    if (result.status === 'policy_drift_detected' || result.status === 'policy_review_schema_mismatch') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
