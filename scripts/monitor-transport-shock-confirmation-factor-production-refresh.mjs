#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-production-refresh-monitor-p10';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/production-refresh-monitor-latest.json';
const RADAR_DATA_PATH = 'data/radar-data.json';
const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const DAILY_REFRESH_SUBJECT = 'chore: refresh radar data';
const TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER =
  "transportShockCandidate: buildEnergyTransportShockCandidate(chokepoints, reroutingProxy, 'live')";
const TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO = '2026-06-28T02:48:22.000Z';
const MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES = 2;
const DAILY_REFRESH_SCHEDULE_UTC = {
  hour: 22,
  minute: 30
};
const BOUNDARY =
  'artifact-only Transport Shock Confirmation Factor production refresh monitor; reads committed data/radar-data.json only; writes ignored manual-artifacts and GitHub Summary/artifact only; does not trigger Daily, fetch network, write production data, or affect ODP finalBias, Brent promotion, scoring, decision, Global Risk Heatmap, or cross-validation';

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

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function gitHistoryTrustStatus() {
  const shallow = gitOutput(['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') return { trusted: false, reason: 'git_history_shallow' };
  if (shallow === null) return { trusted: false, reason: 'git_unavailable' };
  return { trusted: true, reason: null };
}

function countDailyScheduleSlotsSince(startIso, endIso) {
  const startMs = Date.parse(startIso || '');
  const endMs = Date.parse(endIso || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) return 0;

  const start = new Date(startMs);
  const dayMs = 24 * 60 * 60 * 1000;
  let cursorMs = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    DAILY_REFRESH_SCHEDULE_UTC.hour,
    DAILY_REFRESH_SCHEDULE_UTC.minute,
    0,
    0
  );
  if (cursorMs <= startMs) cursorMs += dayMs;

  let count = 0;
  while (cursorMs <= endMs) {
    count += 1;
    cursorMs += dayMs;
  }
  return count;
}

function countConsecutiveDailyRefreshesMissingCandidate(records) {
  let count = 0;
  for (const record of records) {
    if (record.candidatePresent === true) break;
    count += 1;
  }
  return count;
}

function findTransportShockWriterAnchor() {
  const trust = gitHistoryTrustStatus();
  if (!trust.trusted) {
    return {
      commit: null,
      committedAt: TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
      source: trust.reason,
      historyTrusted: false
    };
  }

  const output = gitOutput([
    'log',
    '--reverse',
    '--format=%H%x09%aI',
    `-S${TRANSPORT_SHOCK_CANDIDATE_WRITER_MARKER}`,
    '--',
    'scripts/run-daily-pipeline.mjs'
  ]);
  const first = output?.split(/\r?\n/u).find(Boolean);
  if (!first) {
    return {
      commit: null,
      committedAt: TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
      source: 'fallback_expected_after',
      historyTrusted: true
    };
  }
  const [commit, committedAt] = first.split('\t');
  return {
    commit,
    committedAt: committedAt || TRANSPORT_SHOCK_CANDIDATE_EXPECTED_AFTER_ISO,
    source: 'git_pickaxe',
    historyTrusted: true
  };
}

function summarizeMissingCandidateRefreshHistory(radar, energyTransport) {
  const anchor = findTransportShockWriterAnchor();
  const summary = {
    source: anchor.commit ? 'git_history' : 'updatedAt_schedule_fallback',
    anchorCommit: anchor.commit,
    anchorCommittedAt: anchor.committedAt,
    historyUnavailableReason: anchor.commit ? null : anchor.source,
    failAfterDailyRefreshes: MISSING_CANDIDATE_FAIL_AFTER_DAILY_REFRESHES,
    consecutiveDailyRefreshesMissingCandidate: 0,
    inspectedDailyRefreshes: [],
    historyAvailable: Boolean(anchor.commit && anchor.historyTrusted)
  };

  if (anchor.commit) {
    const output = gitOutput([
      'log',
      '--format=%H%x09%s',
      `${anchor.commit}..HEAD`,
      '--',
      RADAR_DATA_PATH
    ]);
    const dailyLines = (output || '')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [commit, subject] = line.split('\t');
        return { commit, subject };
      })
      .filter((row) => row.subject === DAILY_REFRESH_SUBJECT);

    for (const row of dailyLines) {
      try {
        const data = JSON.parse(execFileSync('git', ['show', `${row.commit}:${RADAR_DATA_PATH}`], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore']
        }));
        const recordEnergyTransport = data?.macroDrivers?.energyTransport;
        summary.inspectedDailyRefreshes.push({
          commit: row.commit.slice(0, 8),
          updatedAt: data?.updatedAt || null,
          sourceStatus: recordEnergyTransport?.sourceStatus?.chokepoints || 'missing',
          candidatePresent: recordEnergyTransport?.transportShockCandidate !== undefined
        });
      } catch {
        summary.inspectedDailyRefreshes.push({
          commit: row.commit.slice(0, 8),
          updatedAt: null,
          sourceStatus: 'unreadable',
          candidatePresent: false
        });
        break;
      }
    }
    summary.consecutiveDailyRefreshesMissingCandidate =
      countConsecutiveDailyRefreshesMissingCandidate(summary.inspectedDailyRefreshes);
    return summary;
  }

  const candidatePresent = energyTransport?.transportShockCandidate !== undefined;
  const scheduledSlotsCoveredByCurrentData = countDailyScheduleSlotsSince(anchor.committedAt, radar?.updatedAt);
  summary.scheduledSlotsCoveredByCurrentData = scheduledSlotsCoveredByCurrentData;
  summary.consecutiveDailyRefreshesMissingCandidate =
    candidatePresent === false && Number.isFinite(scheduledSlotsCoveredByCurrentData)
      ? scheduledSlotsCoveredByCurrentData
      : 0;
  return summary;
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

function summarizeCandidate(candidate) {
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
    boundaryFlagsAllFalse: falseBoundaryFlags(candidate),
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
  const summary = summarizeCandidate(candidate);
  if (
    summary?.contractVersion === CONTRACT_VERSION &&
    summary.candidateOnly === true &&
    summary.auditOnly === true &&
    summary.eligibleForMainScore === false &&
    summary.routeFreightConfirmation === 'not_connected' &&
    summary.marketConfirmation === 'not_connected' &&
    summary.boundaryFlagsAllFalse === true
  ) {
    return 'candidate_present_verified';
  }
  return 'candidate_present_contract_review_required';
}

function createMonitorResult(options) {
  const radar = readJson(RADAR_DATA_PATH);
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const missingCandidateRefreshHistory =
    candidate === undefined ? summarizeMissingCandidateRefreshHistory(radar, energyTransport) : null;
  const status = classifyStatus(energyTransport, missingCandidateRefreshHistory);
  const candidateSummary = summarizeCandidate(candidate);
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints ?? 'missing';

  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reminderOnly: true,
    dryRun: options.dryRun,
    productionDataWriteApproved: false,
    payload: {
      path: resolve(RADAR_DATA_PATH),
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
            ? 'production_candidate_available_for_display_only_frontend_card'
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
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function appendGithubSummary(options, result) {
  if (!options.githubSummary) return;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
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
