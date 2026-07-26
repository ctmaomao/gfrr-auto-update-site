#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  isTransportShockManualArtifactPath,
  safeRelativePath
} from './lib/check-script-helpers.mjs';

const SCHEMA_VERSION = 'transport-shock-path-boundary-review-v1';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/path-boundary-review-latest.json';
const CHILD_MONITORS = {
  productionRefresh: 'scripts/monitor-transport-shock-confirmation-factor-production-refresh.mjs',
  runtimeScorePolicy: 'scripts/monitor-transport-shock-confirmation-factor-runtime-score-policy.mjs',
  scoreReadiness: 'scripts/monitor-transport-shock-confirmation-factor-score-readiness.mjs'
};
const BOUNDARY =
  'read-only Transport Shock path-boundary synthesis; distinguishes the approved capped free-proxy runtime path from the separate route/market-confirmed readiness path; writes ignored manual-artifacts only; no network, production write, score change, source connection, frontend, Worker, workflow, ODP finalBias, Brent promotion, Heatmap, cross-validation, or Bubble Watch change';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-path-boundaries -- [options]

Options:
  --output <path>  Ignored review artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run        Do not write the ignored artifact.
  --no-output      Do not write the ignored artifact.
  --json           Print full JSON review.
  --help           Show this help.

Boundary:
  Synthesizes three existing read-only monitors. It does not change either approval path.`);
}

function parseArgs(argv) {
  const options = {
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
    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --output');
      options.output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isTransportShockManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function assertSafeOutputPath(filePath) {
  const outputPath = resolve(filePath);
  const manualArtifactsPath = resolve('manual-artifacts');
  const rootPath = resolve('manual-artifacts/transport-shock-confirmation-factor');
  const relativePath = relative(rootPath, outputPath);
  if (relativePath.startsWith('..')) throw new Error(`Unsafe output path: ${filePath}`);
  const segments = relativePath.split(/[\\/]+/u).filter(Boolean);
  for (const protectedPath of [manualArtifactsPath, rootPath]) {
    if (existsSync(protectedPath) && lstatSync(protectedPath).isSymbolicLink()) {
      throw new Error(`Refusing output through symlink/junction: ${safeRelativePath(protectedPath) || protectedPath}`);
    }
  }
  let cursor = rootPath;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Refusing output through symlink/junction: ${safeRelativePath(cursor) || cursor}`);
    }
  }
}

function runMonitor(label, scriptPath) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--dry-run', '--no-output', '--json'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  const stdout = String(result.stdout || '').trim();
  if (!stdout) throw new Error(`${label} produced empty stdout: ${String(result.stderr || '').trim()}`);
  let monitor;
  try {
    monitor = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not produce JSON: ${error.message}`);
  }
  return {
    monitor,
    exitStatus: result.status,
    stderr: String(result.stderr || '').trim()
  };
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function buildReview() {
  const production = runMonitor('production refresh monitor', CHILD_MONITORS.productionRefresh);
  const runtime = runMonitor('runtime score policy monitor', CHILD_MONITORS.runtimeScorePolicy);
  const readiness = runMonitor('score readiness monitor', CHILD_MONITORS.scoreReadiness);
  const candidate = production.monitor?.candidate?.summary ?? {};
  const observation = runtime.monitor?.currentObservation ?? {};
  const readinessState = readiness.monitor?.readiness ?? {};
  const contribution = finiteNumber(observation.contributionPct);
  const cap = finiteNumber(observation.maxContributionPct);
  const cappedPathActive = observation.applied === true && contribution !== null && contribution > 0;
  const cappedPathContractValid =
    production.exitStatus === 0
    && production.monitor?.status === 'candidate_present_verified'
    && runtime.exitStatus === 0
    && runtime.monitor?.review?.scorePolicyReviewPassed === true
    && cap !== null
    && cap <= 3
    && contribution !== null
    && contribution >= 0
    && contribution <= cap
    && (!cappedPathActive || candidate.eligibleForMainScore === true);
  const confirmedPathBlocked =
    readinessState.scoreReady !== true
    || readinessState.routeFreightConfirmation === 'not_connected'
    || readinessState.marketConfirmation === 'not_connected';
  const confirmedPathReady =
    readinessState.scoreReady === true
    && readinessState.routeFreightConfirmation !== 'not_connected'
    && readinessState.marketConfirmation !== 'not_connected';
  const childMonitorsHealthy =
    production.exitStatus === 0
    && runtime.exitStatus === 0
    && readiness.exitStatus === 0;
  const noContradiction =
    childMonitorsHealthy
    && cappedPathContractValid
    && (confirmedPathBlocked || confirmedPathReady);

  let status = 'boundary_review_required';
  if (!noContradiction) status = 'boundary_drift_detected';
  else if (confirmedPathReady) status = 'higher_confidence_path_ready_requires_separate_review';
  else if (cappedPathActive) status = 'active_capped_path_confirmed_higher_confidence_path_blocked';
  else status = 'capped_path_inactive_higher_confidence_path_blocked';

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reviewOnly: true,
    interpretation: noContradiction
      ? 'two_distinct_approval_layers_no_contradiction'
      : 'approval_layer_contracts_require_review',
    paths: {
      cappedFreeProxyRuntime: {
        approvalLayer: 'approved_capped_runtime_policy',
        state: cappedPathContractValid ? (cappedPathActive ? 'active' : 'inactive') : 'contract_review_required',
        productionCandidateStatus: candidate.status ?? null,
        productionCandidateScore: finiteNumber(candidate.score),
        eligibleForMainScore: candidate.eligibleForMainScore === true,
        policyReviewPassed: runtime.monitor?.review?.scorePolicyReviewPassed === true,
        contributionPct: contribution,
        maxContributionPct: cap,
        reason: observation.reason ?? null,
        sourceStatus: observation.sourceStatus ?? null
      },
      routeMarketConfirmedReadiness: {
        approvalLayer: 'route_market_confirmed_score_readiness',
        state: confirmedPathReady ? 'ready_requires_separate_review' : 'blocked',
        readinessStatus: readinessState.status ?? null,
        scoreReady: readinessState.scoreReady === true,
        hardBlockerIds: Array.isArray(readinessState.hardBlockerIds)
          ? readinessState.hardBlockerIds
          : [],
        routeFreightConfirmation: readinessState.routeFreightConfirmation ?? null,
        marketConfirmation: readinessState.marketConfirmation ?? null,
        promotionEligible: readinessState.promotionEligible === true,
        productionWriteApproved: readinessState.productionWriteApproved === true,
        scoreWriteApproved: readinessState.scoreWriteApproved === true
      }
    },
    consistency: {
      noContradiction,
      childMonitorsHealthy,
      cappedPathContractValid,
      confirmedPathBlocked,
      note:
        'A capped free-proxy runtime contribution may be active while the separate route/market-confirmed path remains blocked.'
    },
    sourceMonitors: {
      productionRefresh: {
        script: CHILD_MONITORS.productionRefresh,
        version: production.monitor?.monitorVersion ?? null,
        status: production.monitor?.status ?? null,
        exitStatus: production.exitStatus
      },
      runtimeScorePolicy: {
        script: CHILD_MONITORS.runtimeScorePolicy,
        version: runtime.monitor?.monitorVersion ?? null,
        status: runtime.monitor?.status ?? null,
        exitStatus: runtime.exitStatus
      },
      scoreReadiness: {
        script: CHILD_MONITORS.scoreReadiness,
        version: readiness.monitor?.monitorVersion ?? null,
        status: readiness.monitor?.status ?? null,
        exitStatus: readiness.exitStatus
      }
    },
    manualAction: {
      requiredNow:
        status === 'boundary_drift_detected'
        || status === 'higher_confidence_path_ready_requires_separate_review',
      recommendation:
        status === 'boundary_drift_detected'
          ? 'reconcile_existing_monitor_contracts_before_any_score_or_source_change'
          : status === 'higher_confidence_path_ready_requires_separate_review'
            ? 'open_separate_reviewed_change_do_not_auto_expand_score'
            : 'keep_capped_runtime_path_and_do_not_treat_blocked_confirmation_path_as_contradiction'
    },
    productionImpact: {
      writesProductionData: false,
      modifiesRuntimeScoring: false,
      expandsScoreCap: false,
      connectsRouteFreightConfirmation: false,
      connectsMarketConfirmation: false,
      modifiesFrontend: false,
      modifiesWorkerRuntime: false,
      modifiesWorkflow: false,
      fetchesNetwork: false,
      readsSecrets: false,
      affectsOdpFinalBias: false,
      affectsBrentPromotion: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false,
      affectsBubbleWatch: false
    },
    boundary: BOUNDARY
  };
}

function writeReview(options, review) {
  if (!options.writeOutput) return;
  assertSafeOutputPath(options.output);
  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  const capped = review.paths.cappedFreeProxyRuntime;
  const confirmed = review.paths.routeMarketConfirmedReadiness;
  console.log(`Transport Shock path boundary review: ${review.status}`);
  console.log(`cappedFreeProxyRuntime: ${capped.state} (${capped.contributionPct}/${capped.maxContributionPct})`);
  console.log(`routeMarketConfirmedReadiness: ${confirmed.state}`);
  console.log(`routeFreightConfirmation: ${confirmed.routeFreightConfirmation}`);
  console.log(`marketConfirmation: ${confirmed.marketConfirmation}`);
  console.log(`noContradiction: ${review.consistency.noContradiction}`);
  console.log(`recommendation: ${review.manualAction.recommendation}`);
  console.log(`boundary: ${review.boundary}`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const review = buildReview();
  writeReview(options, review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else printSummary(review);
  if (review.status === 'boundary_drift_detected') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
