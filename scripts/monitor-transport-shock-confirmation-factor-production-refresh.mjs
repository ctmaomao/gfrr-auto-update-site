#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { appendFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

import { MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES, gitJsonAtCommit, runTransportShockRefreshHistorySelfTests, summarizeMissingCandidateRefreshHistory } from './transport-shock-refresh-history.mjs';

const MONITOR_VERSION = 'transport-shock-production-refresh-monitor-p10';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/production-refresh-monitor-latest.json';
const RADAR_DATA_PATH = 'data/radar-data.json';
const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const BOUNDARY =
  'artifact-only Transport Shock Confirmation Factor production refresh monitor; reads committed data/radar-data.json only; writes ignored manual-artifacts and GitHub Summary/artifact only; does not trigger Daily, fetch network, write production data, connect route/market confirmation, or affect ODP finalBias, Brent promotion, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-production-refresh -- [options]

Options:
  --output <path>     Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run           Do not write ignored artifacts.
  --no-output         Do not write the monitor artifact.
  --github-summary    Append a compact monitor summary to GITHUB_STEP_SUMMARY.
  --json              Print full JSON result.
  --help              Show this help.`);
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    dryRun: false,
    writeOutput: true,
    githubSummary: false,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--github-summary') {
      options.githubSummary = true;
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

  if (!isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/: ${options.output}`);
  }

  return options;
}

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) {
    throw new Error(`Refusing output outside manual-artifacts/: ${filePath}`);
  }
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts');
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

function readCommittedJson(filePath) {
  return gitJsonAtCommit('HEAD', filePath);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validBoundaryFlags(candidate, sourceStatus) {
  const boundaries = candidate?.boundaries;
  if (!isPlainObject(boundaries)) return false;
  const runtimeScoringBoundaryKeys = new Set([
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance'
  ]);
  const mayAffectRuntimeScoring =
    candidate?.eligibleForMainScore === true &&
    sourceStatus === 'live' &&
    ['watch', 'elevated_watch'].includes(candidate?.status);
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
  ].every((key) => {
    if (mayAffectRuntimeScoring && runtimeScoringBoundaryKeys.has(key)) return boundaries[key] === true;
    return boundaries[key] === false;
  });
}

function pathIsInside(basePath, targetPath) {
  const relativePath = relative(resolve(basePath), resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function validateGithubSummaryPath(summaryPath, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    return { ok: false, reason: 'github_actions_env_required' };
  }
  if (!summaryPath) {
    return { ok: false, reason: 'github_step_summary_missing' };
  }
  if (!env.RUNNER_TEMP) {
    return { ok: false, reason: 'runner_temp_missing' };
  }
  if (!pathIsInside(env.RUNNER_TEMP, summaryPath)) {
    return { ok: false, reason: 'summary_path_outside_runner_temp' };
  }
  if (env.GITHUB_WORKSPACE && pathIsInside(env.GITHUB_WORKSPACE, summaryPath)) {
    return { ok: false, reason: 'summary_path_inside_workspace' };
  }
  return { ok: true, reason: null };
}

function summarizeCandidate(candidate, sourceStatus) {
  if (!isPlainObject(candidate)) return null;
  return {
    contractVersion: candidate.contractVersion ?? null,
    status: candidate.status ?? null,
    score: Number.isFinite(candidate.score) ? candidate.score : null,
    confidence: candidate.confidence ?? null,
    candidateOnly: candidate.candidateOnly === true,
    auditOnly: candidate.auditOnly === true,
    eligibleForMainScore: candidate.eligibleForMainScore === true,
    routeFreightConfirmation: candidate.routeFreightConfirmation ?? null,
    marketConfirmation: candidate.marketConfirmation ?? null,
    boundaryFlagsValid: validBoundaryFlags(candidate, sourceStatus),
    reasonCount: Array.isArray(candidate.reasons) ? candidate.reasons.length : 0,
    driverCount: Array.isArray(candidate.drivers) ? candidate.drivers.length : 0
  };
}

function classifyStatus(energyTransport, missingCandidateRefreshHistory) {
  if (!isPlainObject(energyTransport)) return 'payload_missing_energy_transport';
  if (energyTransport.transportShockCandidate === undefined) {
    if (
      missingCandidateRefreshHistory?.historyAvailable === true
      &&
      missingCandidateRefreshHistory?.consecutiveDailyRefreshesMissingCandidate
        >= MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES
    ) {
      return 'missing_candidate_daily_refresh_threshold_exceeded';
    }
    return 'awaiting_production_refresh';
  }
  const candidate = energyTransport.transportShockCandidate;
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints ?? 'missing';
  const summary = summarizeCandidate(candidate, sourceStatus);
  const eligibleStateValid = summary.eligibleForMainScore === false || (
    sourceStatus === 'live' &&
    ['watch', 'elevated_watch'].includes(summary.status) &&
    Number.isFinite(summary.score) &&
    summary.score >= 50
  );
  if (
    summary?.contractVersion === CONTRACT_VERSION &&
    summary.candidateOnly === true &&
    summary.auditOnly === true &&
    eligibleStateValid &&
    summary.routeFreightConfirmation === 'not_connected' &&
    summary.marketConfirmation === 'not_connected' &&
    summary.boundaryFlagsValid === true
  ) {
    return 'candidate_present_verified';
  }
  return 'candidate_present_contract_review_required';
}

function createMonitorResult(options) {
  const radar = readCommittedJson(RADAR_DATA_PATH);
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const missingCandidateRefreshHistory =
    candidate === undefined ? summarizeMissingCandidateRefreshHistory(radar, energyTransport) : null;
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints ?? 'missing';
  const status = classifyStatus(energyTransport, missingCandidateRefreshHistory);
  const candidateSummary = summarizeCandidate(candidate, sourceStatus);

  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reminderOnly: true,
    dryRun: options.dryRun,
    productionDataWriteApproved: false,
    payload: {
      path: `HEAD:${RADAR_DATA_PATH}`,
      readMode: 'git_show_HEAD',
      releaseVersion: radar?.releaseVersion ?? null,
      generatedAt: radar?.generatedAt ?? radar?.lastUpdated ?? null,
      energyTransportPresent: isPlainObject(energyTransport),
      source: energyTransport?.source ?? null,
      sourceStatus,
      latestDate: energyTransport?.latestDate ?? null,
      latestAgeDays: energyTransport?.latestAgeDays ?? null,
      usageTermsPinned: energyTransport?.usageTermsPinned ?? null,
      redistributionCaveat: energyTransport?.redistributionCaveat === true
    },
    candidate: {
      present: candidate !== undefined,
      summary: candidateSummary,
      missingCandidateRefreshHistory,
      nextExpectedState:
        candidate === undefined ? 'candidate_present_verified_after_next_successful_daily_refresh' : null
    },
    manualAction: {
      requiredNow:
        status === 'payload_missing_energy_transport' ||
        status === 'missing_candidate_daily_refresh_threshold_exceeded' ||
        status === 'candidate_present_contract_review_required',
      recommendation:
        status === 'missing_candidate_daily_refresh_threshold_exceeded'
          ? 'review_daily_payload_and_transport_shock_candidate_writer_before_next_refresh'
          : status === 'awaiting_production_refresh'
          ? 'wait_for_next_successful_daily_refresh_then_rerun_monitor'
          : status === 'candidate_present_verified'
            ? 'production_candidate_available_for_frontend_card_and_capped_score_impact'
            : 'review_daily_payload_and_p_score_8_contract_before_continuing',
      followUpCheck: 'npm run check:transport-shock-confirmation-factor-production-refresh'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      triggersDaily: false,
      fetchesNetwork: false,
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

function writeMonitorArtifact(options, result) {
  if (options.dryRun || !options.writeOutput) return;
  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  assertManualArtifactWritePath(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function appendGithubSummary(options, result) {
  if (!options.githubSummary) return;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const validation = validateGithubSummaryPath(summaryPath);
  if (!validation.ok) {
    throw new Error(`Refusing GitHub Summary path: ${validation.reason}`);
  }
  const lines = [
    '## Transport Shock Production Refresh Monitor',
    '',
    `- Status: \`${result.status}\``,
    `- Source status: \`${result.payload.sourceStatus}\``,
    `- Latest date: \`${result.payload.latestDate ?? 'missing'}\``,
    `- Latest age days: \`${result.payload.latestAgeDays ?? 'missing'}\``,
    `- Candidate present: \`${result.candidate.present}\``,
    `- Missing candidate Daily streak: \`${result.candidate.missingCandidateRefreshHistory?.consecutiveDailyRefreshesMissingCandidate ?? 0}/${result.candidate.missingCandidateRefreshHistory?.failAfterDailyRefreshes ?? MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES}\``,
    `- Manual action required now: \`${result.manualAction.requiredNow}\``,
    `- Production data write approved: \`${result.productionDataWriteApproved}\``,
    '',
    `Boundary: ${result.boundary}`,
    ''
  ];
  appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function runMonitorSelfTests() {
  const runnerTemp = resolve('.tmp-runner-temp');
  const workspace = resolve('.tmp-workspace');
  const summaryPath = resolve(runnerTemp, '_runner_file_commands', 'step_summary');
  const workspacePath = resolve(workspace, 'summary.md');
  const env = {
    GITHUB_ACTIONS: 'true',
    RUNNER_TEMP: runnerTemp,
    GITHUB_WORKSPACE: workspace
  };
  if (!validateGithubSummaryPath(summaryPath, env).ok) {
    throw new Error('Monitor self-test failed: GitHub summary path inside RUNNER_TEMP should be allowed');
  }
  if (validateGithubSummaryPath(workspacePath, env).ok) {
    throw new Error('Monitor self-test failed: GitHub summary path inside workspace should be rejected');
  }
  if (validateGithubSummaryPath(summaryPath, { ...env, GITHUB_ACTIONS: 'false' }).ok) {
    throw new Error('Monitor self-test failed: GitHub summary path requires GitHub Actions environment');
  }
  if (validateGithubSummaryPath(resolve('manual-artifacts', 'summary.md'), env).ok) {
    throw new Error('Monitor self-test failed: GitHub summary path outside RUNNER_TEMP should be rejected');
  }
  assertManualArtifactWritePath(DEFAULT_OUTPUT);
}

function assertMonitorBoundary(result) {
  const text = JSON.stringify(result);
  for (const forbidden of [
    'FIRMS_MAP_KEY',
    'TAVILY_API_KEY',
    'BRAVE_API_KEY',
    'Baltic Exchange TD',
    'scrape'
  ]) {
    if (text.includes(forbidden)) {
      throw new Error(`Monitor output contains forbidden marker: ${forbidden}`);
    }
  }
}

function printSummary(result) {
  console.log(`Transport Shock production refresh monitor: ${result.status}`);
  console.log(`sourceStatus: ${result.payload.sourceStatus}`);
  console.log(`latestDate: ${result.payload.latestDate ?? '—'}`);
  console.log(`latestAgeDays: ${result.payload.latestAgeDays ?? '—'}`);
  console.log(`candidatePresent: ${result.candidate.present ? 'true' : 'false'}`);
  if (result.candidate.missingCandidateRefreshHistory) {
    const history = result.candidate.missingCandidateRefreshHistory;
    console.log(`missingCandidateRefreshHistory.source: ${history.source}`);
    console.log(`missingCandidateRefreshHistory.anchor: ${history.anchorCommit ? history.anchorCommit.slice(0, 8) : history.anchorCommittedAt}`);
    console.log(`missingCandidateRefreshHistory.historyAvailable: ${history.historyAvailable}`);
    if (history.historyUnavailableReason) console.log(`missingCandidateRefreshHistory.historyUnavailableReason: ${history.historyUnavailableReason}`);
    console.log(`missingCandidateRefreshHistory.consecutiveDailyRefreshesMissingCandidate: ${history.consecutiveDailyRefreshesMissingCandidate}/${history.failAfterDailyRefreshes}`);
  }
  if (result.candidate.summary) {
    console.log(`candidateStatus: ${result.candidate.summary.status ?? '—'}`);
    console.log(`candidateScore: ${result.candidate.summary.score ?? '—'}`);
  }
  console.log(`manualAction.requiredNow: ${result.manualAction.requiredNow}`);
  console.log(`recommendation: ${result.manualAction.recommendation}`);
  if (result.artifacts.outputPath) console.log(`outputPath: ${result.artifacts.outputPath}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  runTransportShockRefreshHistorySelfTests();
  runMonitorSelfTests();
  const options = parseArgs(process.argv.slice(2));
  const result = createMonitorResult(options);
  assertMonitorBoundary(result);
  writeMonitorArtifact(options, result);
  appendGithubSummary(options, result);
  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  if (
    result.status === 'payload_missing_energy_transport' ||
    result.status === 'missing_candidate_daily_refresh_threshold_exceeded' ||
    result.status === 'candidate_present_contract_review_required'
  ) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
