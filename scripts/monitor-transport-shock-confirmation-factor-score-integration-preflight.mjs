#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { appendFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-score-integration-preflight-monitor-p43';
const PREFLIGHT_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-integration-preflight.mjs';
const DEFAULT_FREE_PROXY_GATE =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-latest.json';
const DEFAULT_CROSS_CONFIRMATION =
  'manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json';
const DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-bridge-preflight-latest.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-monitor-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock score-integration preflight monitor; runs local preflight only; writes ignored manual-artifacts and optional GitHub Summary only; does not fetch network, trigger Daily, write production data, change frontend/Worker, or affect ODP finalBias, Brent promotion, scoring, decision, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-score-integration-preflight -- [options]

Options:
  --free-proxy-gate <path>     P-score free-proxy readiness gate artifact. Default: ${DEFAULT_FREE_PROXY_GATE}
  --cross-confirmation <path>  P-score cross-confirmation artifact. Default: ${DEFAULT_CROSS_CONFIRMATION}
  --free-proxy-bridge-preflight <path>
                               Optional free-proxy bridge preflight artifact. Default: ${DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT}
  --output <path>              Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run                    Do not write ignored artifacts.
  --no-output                  Do not write the monitor artifact.
  --github-summary             Append compact result to GITHUB_STEP_SUMMARY.
  --json                       Print full JSON result.
  --help                       Show this help.

Boundary:
  No network, secrets, production data write, workflow trigger, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function isAllowedInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true
    || relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function parseArgs(argv) {
  const options = {
    freeProxyGate: DEFAULT_FREE_PROXY_GATE,
    crossConfirmation: DEFAULT_CROSS_CONFIRMATION,
    freeProxyBridgePreflight: DEFAULT_FREE_PROXY_BRIDGE_PREFLIGHT,
    output: DEFAULT_OUTPUT,
    dryRun: false,
    writeOutput: true,
    githubSummary: false,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
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
    if (arg === '--free-proxy-gate') options.freeProxyGate = nextValue();
    else if (arg === '--cross-confirmation') options.crossConfirmation = nextValue();
    else if (arg === '--free-proxy-bridge-preflight') options.freeProxyBridgePreflight = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isAllowedInputPath(options.freeProxyGate)) {
    throw new Error(`Refusing to read free-proxy gate outside allowed paths: ${options.freeProxyGate}`);
  }
  if (!isAllowedInputPath(options.crossConfirmation)) {
    throw new Error(`Refusing to read cross-confirmation outside allowed paths: ${options.crossConfirmation}`);
  }
  if (!isAllowedInputPath(options.freeProxyBridgePreflight)) {
    throw new Error(`Refusing to read free-proxy bridge preflight outside allowed paths: ${options.freeProxyBridgePreflight}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
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

function runPreflight(options) {
  const result = spawnSync(process.execPath, [
    PREFLIGHT_SCRIPT,
    '--free-proxy-gate',
    options.freeProxyGate,
    '--cross-confirmation',
    options.crossConfirmation,
    '--free-proxy-bridge-preflight',
    options.freeProxyBridgePreflight,
    '--no-output',
    '--json'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Score-integration preflight failed: ${result.stderr || result.stdout}`);
  return JSON.parse(String(result.stdout || ''));
}

function classifyHardBlocker(id) {
  const map = {
    route_freight_confirmation: {
      category: 'source_rights_or_authorized_route_freight_required',
      codeOnlyClearable: false,
      nextCondition: 'legal_route_level_tanker_freight_source_or_reviewed_free_proxy_policy_change'
    },
    high_frequency_physical_confirmation: {
      category: 'live_physical_confirmation_required',
      codeOnlyClearable: false,
      nextCondition: 'oil_thermal_baseline_and_elevated_repeated_observation_or_reviewed_physical_proxy_policy_change'
    },
    portwatch_physical_proxy_freshness: {
      category: 'refresh_or_portwatch_probe_required',
      codeOnlyClearable: true,
      nextCondition: 'run_portwatch_freshness_probe_then_cross_confirmation'
    },
    news_manual_gate: {
      category: 'operator_review_or_news_gate_required',
      codeOnlyClearable: true,
      nextCondition: 'refresh_news_claim_ledger_operator_review_and_news_manual_gate'
    },
    market_confirmation: {
      category: 'manual_market_projection_required',
      codeOnlyClearable: true,
      nextCondition: 'refresh_market_confirmation_display_projection_then_cross_confirmation'
    }
  };
  return {
    id,
    ...(map[id] ?? {
      category: 'contract_or_input_review_required',
      codeOnlyClearable: false,
      nextCondition: 'review_preflight_and_cross_confirmation_contract'
    })
  };
}

function classifyStatus(preflight, hardBlockers) {
  if (preflight?.scoreIntegrationPreflightPassed === true) {
    return 'score_integration_preflight_ready_requires_separate_review';
  }
  const nonCodeBlockers = hardBlockers.filter((item) => item.codeOnlyClearable === false);
  if (nonCodeBlockers.length > 0) return 'blocked_on_external_evidence_or_source_rights';
  if (hardBlockers.length > 0) return 'blocked_on_refreshable_manual_artifacts';
  return 'blocked_on_preflight_contract_or_free_proxy_gate';
}

function compactPreflight(preflight) {
  return {
    schemaVersion: preflight?.schemaVersion ?? null,
    status: preflight?.status ?? null,
    recommendation: preflight?.recommendation ?? null,
    generatedAt: preflight?.generatedAt ?? null,
    scoreIntegrationPreflightPassed: preflight?.scoreIntegrationPreflightPassed === true,
    blockerCount: preflight?.summary?.blockerCount ?? null,
    blockers: preflight?.summary?.blockers ?? [],
    crossConfirmationHardBlockerIds: preflight?.summary?.crossConfirmationHardBlockerIds ?? [],
    reclassifiedCrossConfirmationHardBlockerIds: preflight?.summary?.reclassifiedCrossConfirmationHardBlockerIds ?? [],
    remainingCrossConfirmationHardBlockerIds: preflight?.summary?.remainingCrossConfirmationHardBlockerIds ?? [],
    scoreWriteApproved: preflight?.scoreWriteApproved === true,
    productionWriteApproved: preflight?.productionWriteApproved === true,
    eligibleForMainScore: preflight?.eligibleForMainScore === true
  };
}

function createMonitor(options) {
  const preflight = runPreflight(options);
  const remainingHardBlockerIds = Array.isArray(preflight?.summary?.remainingCrossConfirmationHardBlockerIds)
    ? preflight.summary.remainingCrossConfirmationHardBlockerIds
    : (preflight?.summary?.crossConfirmationHardBlockerIds ?? []);
  const hardBlockers = remainingHardBlockerIds.map(classifyHardBlocker);
  const nonCodeBlockers = hardBlockers.filter((item) => item.codeOnlyClearable === false);
  const status = classifyStatus(preflight, hardBlockers);
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    dryRun: options.dryRun,
    inputPaths: {
      freeProxyGate: safeRelativePath(options.freeProxyGate),
      crossConfirmation: safeRelativePath(options.crossConfirmation),
      freeProxyBridgePreflight: safeRelativePath(options.freeProxyBridgePreflight)
    },
    preflight: compactPreflight(preflight),
    hardBlockers,
    codeOnlyCompletion: {
      complete: nonCodeBlockers.length === 0,
      remainingNonCodeBlockerIds: nonCodeBlockers.map((item) => item.id),
      conclusion: preflight?.scoreIntegrationPreflightPassed === true
        ? 'preflight_ready_requires_separate_review'
        : nonCodeBlockers.length === 0
        ? 'remaining_blockers_are_refreshable_or_preflight_ready'
        : 'cannot_clear_remaining_blockers_with_code_only_changes'
    },
    manualAction: {
      requiredBeforeMoreCode: preflight?.scoreIntegrationPreflightPassed === true ? false : nonCodeBlockers.length > 0,
      recommendation: status === 'score_integration_preflight_ready_requires_separate_review'
        ? 'open_separate_reviewed_score_design_pr_do_not_auto_wire'
        : status === 'blocked_on_external_evidence_or_source_rights'
          ? 'wait_for_authorized_route_freight_or_real_high_frequency_physical_confirmation_before_score_design'
          : 'refresh_manual_artifacts_then_rerun_cross_confirmation_and_preflight',
      followUpCheck: 'npm run review:transport-shock-confirmation-factor-score-integration-preflight -- --json'
    },
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
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

function writeJson(outputPath, payload) {
  assertManualArtifactWritePath(outputPath);
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendGithubSummary(monitor) {
  const validation = validateGithubSummaryPath(process.env.GITHUB_STEP_SUMMARY);
  if (!validation.ok) return validation;
  const lines = [
    '### Transport Shock Score-Integration Preflight Monitor',
    '',
    `- Status: ${monitor.status}`,
    `- Preflight: ${monitor.preflight.status}`,
    `- Hard blockers: ${monitor.hardBlockers.map((item) => item.id).join(', ') || 'none'}`,
    `- Code-only completion: ${monitor.codeOnlyCompletion.conclusion}`,
    `- Score write approved: ${monitor.scoreWriteApproved}`
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
  return { ok: true, reason: null };
}

function printSummary(monitor) {
  console.log(`Transport Shock score-integration preflight monitor: ${monitor.status}`);
  console.log(`preflight: ${monitor.preflight.status}`);
  console.log(`hardBlockers: ${monitor.hardBlockers.map((item) => item.id).join(', ') || 'none'}`);
  console.log(`codeOnlyCompletion: ${monitor.codeOnlyCompletion.conclusion}`);
  console.log(`recommendation: ${monitor.manualAction.recommendation}`);
  console.log(`boundary: ${monitor.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const monitor = createMonitor(options);
    if (options.writeOutput && !options.dryRun) writeJson(options.output, monitor);
    if (options.githubSummary) monitor.githubSummary = appendGithubSummary(monitor);
    if (options.printJson) console.log(JSON.stringify(monitor, null, 2));
    else printSummary(monitor);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
