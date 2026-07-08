#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { appendFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-score-readiness-monitor-p14';
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-readiness.mjs';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/score-readiness-monitor-latest.json';
const DEFAULT_RADAR = 'data/radar-data.json';
const DEFAULT_OIL_NEWS = 'data/oil-news-event-watch.json';
const DEFAULT_OIL_THERMAL = 'data/oil-thermal-watch.json';
const DEFAULT_OIL_DIRECTIONAL = 'data/oil-directional-pressure.json';
const DEFAULT_HISTORY_REVIEW =
  'manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json';
const DEFAULT_SCORE_INTEGRATION_PREFLIGHT =
  'manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock Confirmation Factor score-readiness monitor; runs local readiness review only; writes ignored manual-artifacts and GitHub Summary/artifact only; does not fetch network, trigger Daily, write production data, change frontend/Worker, or affect ODP finalBias, Brent promotion, scoring, decision, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-score-readiness -- [options]

Options:
  --radar <path>            Radar data JSON passed to readiness review. Default: ${DEFAULT_RADAR}
  --oil-news <path>         Oil news event watch JSON. Default: ${DEFAULT_OIL_NEWS}
  --oil-thermal <path>      Oil thermal watch JSON. Default: ${DEFAULT_OIL_THERMAL}
  --oil-directional <path>  ODP JSON. Default: ${DEFAULT_OIL_DIRECTIONAL}
  --history-review <path>   P-score-11 review JSON. Default: ${DEFAULT_HISTORY_REVIEW}
  --score-integration-preflight <path>
                            Optional score-integration preflight JSON. Default: ${DEFAULT_SCORE_INTEGRATION_PREFLIGHT}
  --output <path>           Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run                 Do not write ignored artifacts.
  --no-output               Do not write the monitor artifact.
  --github-summary          Append compact monitor result to GITHUB_STEP_SUMMARY.
  --json                    Print full JSON result.
  --help                    Show this help.

Boundary:
  No network, secrets, production data write, workflow trigger, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function parseArgs(argv) {
  const options = {
    radar: DEFAULT_RADAR,
    oilNews: DEFAULT_OIL_NEWS,
    oilThermal: DEFAULT_OIL_THERMAL,
    oilDirectional: DEFAULT_OIL_DIRECTIONAL,
    historyReview: DEFAULT_HISTORY_REVIEW,
    scoreIntegrationPreflight: DEFAULT_SCORE_INTEGRATION_PREFLIGHT,
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

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--radar') options.radar = nextValue();
    else if (arg === '--oil-news') options.oilNews = nextValue();
    else if (arg === '--oil-thermal') options.oilThermal = nextValue();
    else if (arg === '--oil-directional') options.oilDirectional = nextValue();
    else if (arg === '--history-review') options.historyReview = nextValue();
    else if (arg === '--score-integration-preflight') options.scoreIntegrationPreflight = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${filePath}`);
  }
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts', 'transport-shock-confirmation-factor');
  const outputDir = dirname(outputPath);
  const relativeDir = relative(rootPath, outputDir);
  const paths = [resolve('manual-artifacts'), rootPath];
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

function runReadinessReview(options) {
  const args = [
    REVIEW_SCRIPT,
    '--radar',
    options.radar,
    '--oil-news',
    options.oilNews,
    '--oil-thermal',
    options.oilThermal,
    '--oil-directional',
    options.oilDirectional,
    '--history-review',
    options.historyReview,
    '--score-integration-preflight',
    options.scoreIntegrationPreflight,
    '--no-output',
    '--json'
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Score-readiness review failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(String(result.stdout || ''));
}

function compactReadiness(readiness) {
  return {
    schemaVersion: readiness?.schemaVersion ?? null,
    status: readiness?.status ?? null,
    recommendation: readiness?.recommendation ?? null,
    generatedAt: readiness?.generatedAt ?? null,
    scoreReady: readiness?.scoreReady === true,
    hardBlockerCount: readiness?.summary?.hardBlockerCount ?? null,
    hardBlockerIds: Array.isArray(readiness?.summary?.hardBlockerIds)
      ? readiness.summary.hardBlockerIds
      : [],
    passCount: readiness?.summary?.passCount ?? null,
    reclassifiedCount: readiness?.summary?.reclassifiedCount ?? null,
    scoreReadyReason: readiness?.scoreReadyReason ?? null,
    scoreIntegrationPreflightStatus: readiness?.scoreIntegrationPreflight?.status ?? null,
    routeFreightConfirmation: readiness?.routeFreightConfirmation ?? null,
    marketConfirmation: readiness?.marketConfirmation ?? null,
    eligibleForMainScore: readiness?.eligibleForMainScore === true,
    promotionEligible: readiness?.promotionEligible === true,
    productionWriteApproved: readiness?.productionWriteApproved === true,
    scoreWriteApproved: readiness?.scoreWriteApproved === true,
    frontendDisplayApproved: readiness?.frontendDisplayApproved === true
  };
}

function classifyMonitor(readiness) {
  if (readiness?.scoreReady === true) return 'score_ready_requires_separate_review';
  if (readiness?.status === 'not_ready_for_score') return 'blockers_still_present';
  return 'readiness_contract_review_required';
}

function createMonitorResult(options) {
  const readiness = runReadinessReview(options);
  const compact = compactReadiness(readiness);
  const status = classifyMonitor(readiness);
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reminderOnly: true,
    dryRun: options.dryRun,
    productionDataWriteApproved: false,
    scoreWriteApproved: false,
    inputPaths: {
      radar: safeRelativePath(options.radar),
      oilNews: safeRelativePath(options.oilNews),
      oilThermal: safeRelativePath(options.oilThermal),
      oilDirectional: safeRelativePath(options.oilDirectional),
      historyReview: safeRelativePath(options.historyReview),
      scoreIntegrationPreflight: safeRelativePath(options.scoreIntegrationPreflight)
    },
    readiness: compact,
    manualAction: {
      requiredNow: status === 'score_ready_requires_separate_review' || status === 'readiness_contract_review_required',
      recommendation:
        status === 'score_ready_requires_separate_review'
          ? 'open_separate_reviewed_score_design_pr_do_not_auto_wire'
          : status === 'blockers_still_present'
            ? 'keep_display_only_and_monitor_hard_blockers_after_refreshes'
            : 'review_score_readiness_contract_before_continuing',
      followUpCheck: 'npm run review:transport-shock-confirmation-factor-score-readiness -- --json'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      modifiesWorkerRuntime: false,
      modifiesWorkflow: false,
      triggersDaily: false,
      fetchesNetwork: false,
      affectsValues: false,
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
  const lines = [
    '## Transport Shock Score-Readiness Monitor',
    '',
    `- Status: \`${result.status}\``,
    `- Readiness: \`${result.readiness.status}\``,
    `- Score ready: \`${result.readiness.scoreReady}\``,
    `- Hard blockers: \`${result.readiness.hardBlockerCount}\``,
    `- Hard blocker ids: \`${result.readiness.hardBlockerIds.join(', ') || 'none'}\``,
    `- Reclassified rows: \`${result.readiness.reclassifiedCount ?? 'n/a'}\``,
    `- Score-ready reason: \`${result.readiness.scoreReadyReason ?? 'missing'}\``,
    `- Route freight confirmation: \`${result.readiness.routeFreightConfirmation ?? 'missing'}\``,
    `- Market confirmation: \`${result.readiness.marketConfirmation ?? 'missing'}\``,
    `- Manual action required now: \`${result.manualAction.requiredNow}\``,
    `- Score write approved: \`${result.scoreWriteApproved}\``,
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
    throw new Error('Monitor self-test failed: GitHub Actions environment should be required');
  }
  assertManualArtifactWritePath(DEFAULT_OUTPUT);
}

function assertMonitorBoundary(result) {
  if (result.scoreWriteApproved !== false || result.productionDataWriteApproved !== false) {
    throw new Error('Score-readiness monitor must not approve production or score writes.');
  }
  const text = JSON.stringify(result);
  for (const forbidden of [
    'FIRMS_MAP_KEY',
    'TAVILY_API_KEY',
    'BRAVE_API_KEY',
    'Baltic Exchange TD',
    'scrape'
  ]) {
    if (text.includes(forbidden)) throw new Error(`Monitor output contains forbidden marker: ${forbidden}`);
  }
}

function printSummary(result) {
  console.log(`Transport Shock score-readiness monitor: ${result.status}`);
  console.log(`readiness: ${result.readiness.status}`);
  console.log(`scoreReady: ${result.readiness.scoreReady}`);
  console.log(`hardBlockerCount: ${result.readiness.hardBlockerCount}`);
  console.log(`hardBlockerIds: ${result.readiness.hardBlockerIds.join(', ') || 'none'}`);
  console.log(`reclassifiedCount: ${result.readiness.reclassifiedCount ?? 'n/a'}`);
  console.log(`scoreReadyReason: ${result.readiness.scoreReadyReason ?? 'missing'}`);
  console.log(`routeFreightConfirmation: ${result.readiness.routeFreightConfirmation ?? '—'}`);
  console.log(`marketConfirmation: ${result.readiness.marketConfirmation ?? '—'}`);
  console.log(`manualAction.requiredNow: ${result.manualAction.requiredNow}`);
  console.log(`recommendation: ${result.manualAction.recommendation}`);
  if (result.artifacts.outputPath) console.log(`outputPath: ${result.artifacts.outputPath}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  runMonitorSelfTests();
  const options = parseArgs(process.argv.slice(2));
  const result = createMonitorResult(options);
  assertMonitorBoundary(result);
  writeMonitorArtifact(options, result);
  appendGithubSummary(options, result);
  if (options.printJson) console.log(JSON.stringify(result, null, 2));
  else printSummary(result);
  if (result.status === 'readiness_contract_review_required') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
