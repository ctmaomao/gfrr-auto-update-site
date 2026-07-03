#!/usr/bin/env node
import { appendFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  gitJsonAtCommit,
  gitOutput,
  runTransportShockRefreshHistorySelfTests
} from './transport-shock-refresh-history.mjs';

const MONITOR_VERSION = 'transport-shock-score-impact-history-monitor-p54';
const IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1';
const RADAR_DATA_PATH = 'data/radar-data.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/score-impact-history-latest.json';
const DEFAULT_MAX_COMMITS = 40;
const DEFAULT_MAX_SAMPLES = 12;
const BOUNDARY =
  'artifact-only Transport Shock score-impact history monitor; reads committed data/radar-data.json git history only; writes ignored manual-artifacts and optional GitHub Summary/artifact only; does not trigger Daily, fetch network, write production data, calculate a new score, connect route/market confirmation, or affect ODP finalBias, Brent promotion, Global Risk Heatmap, cross-validation, or Bubble Watch';

function printUsage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-score-impact-history -- [options]

Options:
  --max-commits <n>   Recent radar-data commits to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>   Maximum valid score-impact samples to keep. Default: ${DEFAULT_MAX_SAMPLES}
  --output <path>     Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run           Do not write ignored artifacts.
  --no-output         Do not write the monitor artifact.
  --github-summary    Append a compact monitor summary to GITHUB_STEP_SUMMARY.
  --json              Print full JSON result.
  --help              Show this help.`);
}

function parsePositiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`);
  return n;
}

function parseArgs(argv) {
  const options = {
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
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
    if (arg === '--max-commits') {
      options.maxCommits = parsePositiveInteger(argv[index + 1], '--max-commits');
      index += 1;
      continue;
    }
    if (arg === '--max-samples') {
      options.maxSamples = parsePositiveInteger(argv[index + 1], '--max-samples');
      index += 1;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
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

function pathIsInside(basePath, targetPath) {
  const relativePath = relative(resolve(basePath), resolve(targetPath));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function validateGithubSummaryPath(summaryPath, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') return { ok: false, reason: 'github_actions_env_required' };
  if (!summaryPath) return { ok: false, reason: 'github_step_summary_missing' };
  if (!env.RUNNER_TEMP) return { ok: false, reason: 'runner_temp_missing' };
  if (!pathIsInside(env.RUNNER_TEMP, summaryPath)) return { ok: false, reason: 'summary_path_outside_runner_temp' };
  if (env.GITHUB_WORKSPACE && pathIsInside(env.GITHUB_WORKSPACE, summaryPath)) {
    return { ok: false, reason: 'summary_path_inside_workspace' };
  }
  return { ok: true, reason: null };
}

function readCommitRows(maxCommits) {
  const output = gitOutput([
    'log',
    `--max-count=${maxCommits}`,
    '--format=%H%x09%ct%x09%s',
    '--',
    RADAR_DATA_PATH
  ]);
  return (output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText, ...subjectParts] = line.split('\t');
      if (!/^[a-f0-9]{40}$/iu.test(hash)) throw new Error(`Unexpected git hash in log output: ${line}`);
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null,
        subject: subjectParts.join('\t')
      };
    });
}

function impactReasonLabel(reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text === 'candidate_not_eligible_zero_contribution') return 'candidate normal or not eligible';
  if (text === 'candidate_missing_zero_contribution') return 'candidate missing';
  if (text === 'candidate_not_live_zero_contribution') return 'PortWatch source not live';
  if (text === 'candidate_stale_zero_contribution') return 'PortWatch source stale';
  if (text === 'candidate_not_pressure_status_zero_contribution') return 'candidate not in pressure status';
  if (text === 'candidate_score_not_positive_zero_contribution') return 'candidate score not positive';
  if (text === 'base_score_missing_zero_contribution') return 'base score missing';
  if (text === 'candidate_score_below_contribution_threshold_zero_contribution') return 'candidate below contribution threshold';
  if (text === 'owner_approved_free_proxy_transport_pressure_low_weight_applied') return 'owner-approved free-proxy low-weight contribution applied';
  return text || 'impact reason missing';
}

function validateImpact(impact, label) {
  const failures = [];
  if (!isPlainObject(impact)) failures.push('impact must be an object');
  if (impact?.contractVersion !== IMPACT_CONTRACT_VERSION) failures.push('contractVersion mismatch');
  if (impact?.sourcePath !== 'macroDrivers.energyTransport.transportShockCandidate') failures.push('sourcePath mismatch');
  if (typeof impact?.applied !== 'boolean') failures.push('applied must be boolean');
  if (!Number.isFinite(impact?.contributionPct)) failures.push('contributionPct must be finite');
  if (impact?.contributionPct < 0 || impact?.contributionPct > 3) failures.push('contributionPct must be within 0..3');
  if (impact?.maxContributionPct !== 3) failures.push('maxContributionPct must be 3');
  if (impact?.direction !== 'transport_shock_pressure_only') failures.push('direction mismatch');
  if (typeof impact?.reason !== 'string' || !impact.reason) failures.push('reason missing');
  if (!isPlainObject(impact?.guards)) failures.push('guards missing');
  if (impact?.guards?.hardCapPct !== 3) failures.push('guards.hardCapPct must be 3');
  if (impact?.guards?.routeFreightConfirmationConnected !== false) {
    failures.push('routeFreightConfirmationConnected must be false');
  }
  if (impact?.guards?.marketConfirmationConnected !== false) {
    failures.push('marketConfirmationConnected must be false');
  }
  if (impact?.applied === true && impact?.contributionPct <= 0) failures.push('applied impact requires positive contribution');
  if (impact?.applied === false && impact?.contributionPct !== 0) failures.push('non-applied impact must have zero contribution');
  const before = finiteNumberOrNull(impact?.scoreBeforeTransport);
  const after = finiteNumberOrNull(impact?.scoreAfterTransport);
  if (impact?.applied === true && before !== null && after !== null && after < before) {
    failures.push('applied impact must not reduce score');
  }
  if (failures.length) throw new Error(`${label}: ${failures.join('; ')}`);
}

function summarizeImpact(radar, commit) {
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const impact = radar?.transportShockScoringImpact;
  if (impact === undefined) return null;
  validateImpact(impact, `${commit.hash}:${RADAR_DATA_PATH}`);
  const scoreBeforeTransport = finiteNumberOrNull(impact.scoreBeforeTransport);
  const scoreAfterTransport = finiteNumberOrNull(impact.scoreAfterTransport);
  return {
    commitHash: commit.hash,
    committedAt: commit.committedAt,
    subject: commit.subject,
    radarGeneratedAt: radar?.generatedAt ?? radar?.updatedAt ?? null,
    releaseVersion: radar?.releaseVersion ?? null,
    sourceStatus: impact.sourceStatus ?? energyTransport?.sourceStatus?.chokepoints ?? 'missing',
    latestDate: impact.latestDate ?? energyTransport?.latestDate ?? null,
    latestAgeDays: finiteNumberOrNull(impact.latestAgeDays ?? energyTransport?.latestAgeDays),
    candidateStatus: impact.candidateStatus ?? candidate?.status ?? null,
    candidateScore: finiteNumberOrNull(impact.candidateScore ?? candidate?.score),
    candidateEligibleForMainScore: candidate?.eligibleForMainScore === true,
    applied: impact.applied === true,
    contributionPct: impact.contributionPct,
    maxContributionPct: impact.maxContributionPct,
    reason: impact.reason,
    reasonLabel: impactReasonLabel(impact.reason),
    scoreBeforeTransport,
    scoreAfterTransport,
    scoreDelta:
      scoreBeforeTransport !== null && scoreAfterTransport !== null
        ? Number((scoreAfterTransport - scoreBeforeTransport).toFixed(4))
        : null,
    guards: {
      candidatePresent: impact.guards?.candidatePresent === true,
      sourceLive: impact.guards?.sourceLive === true,
      latestFresh: impact.guards?.latestFresh === true,
      eligibleForMainScore: impact.guards?.eligibleForMainScore === true,
      pressureStatus: impact.guards?.pressureStatus === true,
      hardCapPct: impact.guards?.hardCapPct,
      routeFreightConfirmationConnected: impact.guards?.routeFreightConfirmationConnected === true,
      marketConfirmationConnected: impact.guards?.marketConfirmationConnected === true
    }
  };
}

function increment(map, key) {
  const safeKey = key || 'missing';
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function buildTrend(samples) {
  const reasonCounts = {};
  const statusCounts = {};
  const contributionCounts = {};
  for (const sample of samples) {
    increment(reasonCounts, sample.reason);
    increment(statusCounts, sample.candidateStatus);
    increment(contributionCounts, String(sample.contributionPct));
  }
  const appliedSamples = samples.filter((sample) => sample.applied === true);
  const latest = samples[0] ?? null;
  return {
    sampleCount: samples.length,
    appliedCount: appliedSamples.length,
    zeroContributionCount: samples.filter((sample) => sample.contributionPct === 0).length,
    maxContributionObserved: samples.reduce((max, sample) => Math.max(max, sample.contributionPct), 0),
    reasonCounts,
    statusCounts,
    contributionCounts,
    latest
      : latest
        ? {
            commitHash: typeof latest.commitHash === 'string' ? latest.commitHash.slice(0, 8) : null,
            committedAt: latest.committedAt ?? null,
            sourceStatus: latest.sourceStatus,
            latestDate: latest.latestDate,
            latestAgeDays: latest.latestAgeDays,
            candidateStatus: latest.candidateStatus,
            candidateScore: latest.candidateScore,
            applied: latest.applied,
            contributionPct: latest.contributionPct,
            maxContributionPct: latest.maxContributionPct,
            reason: latest.reason,
            reasonLabel: latest.reasonLabel,
            scoreBeforeTransport: latest.scoreBeforeTransport,
            scoreAfterTransport: latest.scoreAfterTransport
          }
        : null
  };
}

function classifyStatus(samples, invalidCommits) {
  if (!samples.length) return invalidCommits > 0 ? 'no_valid_score_impact_history' : 'awaiting_score_impact_history';
  const latest = samples[0];
  if (latest.applied === true) return 'ok_nonzero_score_impact_observed';
  return 'ok_zero_score_impact_attributed';
}

function createMonitorResult(options) {
  const commits = readCommitRows(options.maxCommits);
  const samples = [];
  const invalid = [];
  let missingImpactCount = 0;

  for (const commit of commits) {
    if (samples.length >= options.maxSamples) break;
    try {
      const radar = gitJsonAtCommit(commit.hash, RADAR_DATA_PATH);
      const sample = summarizeImpact(radar, commit);
      if (!sample) {
        missingImpactCount += 1;
        continue;
      }
      samples.push(sample);
    } catch (error) {
      invalid.push({
        commitHash: commit.hash,
        committedAt: commit.committedAt,
        subject: commit.subject,
        reason: error.message
      });
    }
  }

  const status = classifyStatus(samples, invalid.length);
  const trend = buildTrend(samples);
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    dryRun: options.dryRun,
    artifactOnly: true,
    productionDataWriteApproved: false,
    input: {
      gitPath: RADAR_DATA_PATH,
      readMode: 'git_show_history',
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples,
      commitsInspected: commits.length,
      missingImpactCount,
      invalidCommitCount: invalid.length
    },
    trend,
    samples,
    invalid,
    manualAction: {
      requiredNow: status === 'no_valid_score_impact_history',
      recommendation:
        status === 'ok_nonzero_score_impact_observed'
          ? 'review_latest_nonzero_score_impact_and_keep_capped_boundary_visible'
          : status === 'ok_zero_score_impact_attributed'
            ? 'continue_monitoring_until_transport_pressure_candidate_triggers_nonzero_contribution'
            : 'wait_for_next_successful_daily_refresh_then_rerun_monitor',
      followUpCheck: 'npm run check:transport-shock-confirmation-factor-score-impact-history-monitor'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      triggersDaily: false,
      fetchesNetwork: false,
      calculatesNewScore: false,
      connectsRouteFreightConfirmation: false,
      connectsMarketConfirmation: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false,
      affectsBubbleWatch: false
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
  if (!validation.ok) throw new Error(`Refusing GitHub Summary path: ${validation.reason}`);
  const latest = result.trend.latest;
  const lines = [
    '## Transport Shock Score Impact History Monitor',
    '',
    `- Status: \`${result.status}\``,
    `- Samples: \`${result.trend.sampleCount}\``,
    `- Applied count: \`${result.trend.appliedCount}\``,
    `- Max contribution observed: \`${result.trend.maxContributionObserved}/3\``,
    `- Latest contribution: \`${latest ? `${latest.contributionPct}/${latest.maxContributionPct}` : 'missing'}\``,
    `- Latest reason: \`${latest?.reason ?? 'missing'}\``,
    `- Manual action required now: \`${result.manualAction.requiredNow}\``,
    `- Production data write approved: \`${result.productionDataWriteApproved}\``,
    '',
    `Boundary: ${result.boundary}`,
    ''
  ];
  appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function runMonitorSelfTests() {
  assertManualArtifactWritePath(DEFAULT_OUTPUT);
  const fakeSamples = [
    { applied: false, contributionPct: 0, reason: 'candidate_not_eligible_zero_contribution', candidateStatus: 'normal' },
    { applied: true, contributionPct: 3, reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied', candidateStatus: 'elevated_watch' }
  ];
  const trend = buildTrend(fakeSamples);
  if (trend.sampleCount !== 2 || trend.appliedCount !== 1 || trend.maxContributionObserved !== 3) {
    throw new Error('Score-impact history monitor self-test failed: trend aggregation');
  }
  if (impactReasonLabel('candidate_not_live_zero_contribution') !== 'PortWatch source not live') {
    throw new Error('Score-impact history monitor self-test failed: reason label');
  }
}

function assertMonitorBoundary(result) {
  const text = JSON.stringify(result);
  for (const forbidden of [
    'FIRMS_MAP_KEY',
    'TAVILY_API_KEY',
    'BRAVE_API_KEY',
    'Baltic Exchange TD',
    'scrape',
    'routeFreightConfirmationConnected":true',
    'marketConfirmationConnected":true'
  ]) {
    if (text.includes(forbidden)) throw new Error(`Monitor output contains forbidden marker: ${forbidden}`);
  }
}

function printSummary(result) {
  const latest = result.trend.latest;
  console.log(`Transport Shock score-impact history monitor: ${result.status}`);
  console.log(`samples: ${result.trend.sampleCount}`);
  console.log(`appliedCount: ${result.trend.appliedCount}`);
  console.log(`maxContributionObserved: ${result.trend.maxContributionObserved}/3`);
  if (latest) {
    console.log(`latestCommit: ${latest.commitHash}`);
    console.log(`latestSourceStatus: ${latest.sourceStatus ?? '—'}`);
    console.log(`latestCandidateStatus: ${latest.candidateStatus ?? '—'}`);
    console.log(`latestCandidateScore: ${latest.candidateScore ?? '—'}`);
    console.log(`latestContribution: ${latest.contributionPct}/${latest.maxContributionPct}`);
    console.log(`latestReason: ${latest.reason}`);
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
  if (result.status === 'no_valid_score_impact_history') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
