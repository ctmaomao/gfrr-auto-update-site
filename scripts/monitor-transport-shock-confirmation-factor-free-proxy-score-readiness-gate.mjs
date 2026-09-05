#!/usr/bin/env node
import { isTransportShockManualArtifactPath as isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MONITOR_VERSION = 'transport-shock-free-proxy-score-readiness-gate-monitor-p32';
const GATE_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-score-readiness-gate.mjs';
const DEFAULT_INPUT =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples-review-latest.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-monitor-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock free-proxy score-readiness gate monitor; runs P-score-31 gate only; writes ignored manual-artifacts only; does not fetch network, trigger Daily, write production data, change frontend/Worker, or affect ODP finalBias, Brent promotion, scoring, decision, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run monitor:transport-shock-confirmation-factor-free-proxy-score-readiness-gate -- [options]

Options:
  --input <path>      P-score-30 real-event sample-set review passed to P-score-31 gate. Default: ${DEFAULT_INPUT}
  --output <path>     Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run           Do not write ignored artifacts.
  --no-output         Do not write the monitor artifact.
  --json              Print full JSON result.
  --help              Show this help.

Boundary:
  No network, secrets, production data write, workflow trigger, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    dryRun: false,
    writeOutput: true,
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
  if (!isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
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

function runGate(options) {
  const result = spawnSync(process.execPath, [
    GATE_SCRIPT,
    '--input',
    options.input,
    '--no-output',
    '--json'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Score-readiness gate failed: ${result.stderr || result.stdout}`);
  return JSON.parse(String(result.stdout || ''));
}

function remaining(observed, threshold) {
  const left = Number(threshold || 0) - Number(observed || 0);
  return left > 0 ? left : 0;
}

function buildTargetGaps(gate) {
  const thresholds = gate.thresholds || {};
  const observed = gate.observed || {};
  return {
    realEventSamples: {
      observed: Number(observed.usableSampleCount || 0),
      target: Number(thresholds.minRealEventSamples || 0),
      remaining: remaining(observed.usableSampleCount, thresholds.minRealEventSamples)
    },
    knownDisruptionSamples: {
      observed: Number(observed.knownDisruptionSampleCount || 0),
      target: Number(thresholds.minKnownDisruptionSamples || 0),
      remaining: remaining(observed.knownDisruptionSampleCount, thresholds.minKnownDisruptionSamples)
    },
    zeroControlSamples: {
      observed: Number(observed.zeroControlSampleCount || 0),
      target: Number(thresholds.minZeroControlSamples || 0),
      remaining: remaining(observed.zeroControlSampleCount, thresholds.minZeroControlSamples)
    },
    falsePositiveRate: {
      observed: observed.falsePositiveRate ?? null,
      targetMax: thresholds.maxFalsePositiveRate ?? null,
      measurable: observed.falsePositiveRate !== null && observed.falsePositiveRate !== undefined
    },
    knownDisruptionDirectionalHitRate: {
      observed: observed.knownDisruptionDirectionalHitRate ?? null,
      targetMin: thresholds.minKnownDisruptionDirectionalHitRate ?? null,
      measurable: observed.knownDisruptionDirectionalHitRate !== null && observed.knownDisruptionDirectionalHitRate !== undefined
    }
  };
}

function buildPriorities(gaps) {
  const priorities = [];
  if (gaps.zeroControlSamples.remaining > 0) {
    priorities.push({
      id: 'collect_zero_control_real_event_samples',
      remaining: gaps.zeroControlSamples.remaining,
      reasonZh: '需要 headline-only / single-chokepoint noise / stale physical proxy / benign baseline 等零贡献控制样本,否则无法估计误报率。'
    });
  }
  if (gaps.knownDisruptionSamples.remaining > 0) {
    priorities.push({
      id: 'collect_known_disruption_real_event_samples',
      remaining: gaps.knownDisruptionSamples.remaining,
      reasonZh: '需要更多 known-disruption 样本证明方向命中,不能只靠单一扰动案例。'
    });
  }
  if (gaps.realEventSamples.remaining > 0) {
    priorities.push({
      id: 'collect_total_real_event_samples',
      remaining: gaps.realEventSamples.remaining,
      reasonZh: '真实事件样本总数未达最低门槛,继续补充 sanitized real-event sample archives。'
    });
  }
  if (priorities.length === 0 && !gaps.falsePositiveRate.measurable) {
    priorities.push({
      id: 'make_false_positive_rate_measurable',
      remaining: 0,
      reasonZh: '样本数量可能满足,但误报率仍不可测;检查 zero-control 样本族。'
    });
  }
  return priorities;
}

function falseImpactMap() {
  return {
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
  };
}

function createMonitorResult(options) {
  const gate = runGate(options);
  const targetGaps = buildTargetGaps(gate);
  const nextSamplePriorities = buildPriorities(targetGaps);
  const status = gate.gatePassed === true
    ? 'sample_targets_satisfied_requires_separate_score_review'
    : 'sample_targets_incomplete_collect_more';
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reminderOnly: true,
    contributionBasis: 'manual_review_not_model_backtest',
    historicalBacktestPerformed: false,
    limitationZh: '候选贡献与命中/误报统计仅来自人工样本标注，不是生产模型历史回测；满足样本目标不批准评分或生产写入。',
    dryRun: options.dryRun,
    inputPath: safeRelativePath(options.input),
    productionDataWriteApproved: false,
    scoreWriteApproved: false,
    scoreIntegrationApproved: false,
    eligibleForMainScore: false,
    gate: {
      schemaVersion: gate.schemaVersion ?? null,
      status: gate.status ?? null,
      recommendation: gate.recommendation ?? null,
      gatePassed: gate.gatePassed === true,
      blockerCount: gate.blockerCount ?? null,
      blockerIds: Array.isArray(gate.blockers) ? gate.blockers.map((blocker) => blocker.id) : []
    },
    targetGaps,
    nextSamplePriorities,
    manualAction: {
      requiredNow: status === 'sample_targets_satisfied_requires_separate_score_review',
      recommendation: status === 'sample_targets_satisfied_requires_separate_score_review'
        ? 'open_separate_reviewed_score_integration_design_no_auto_wire'
        : 'collect_real_event_samples_until_gate_targets_are_met',
      followUpCheck: 'npm run monitor:transport-shock-confirmation-factor-free-proxy-score-readiness-gate -- --json'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output)
    },
    productionImpact: falseImpactMap(),
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

function assertMonitorBoundary(result) {
  if (result.scoreWriteApproved !== false || result.productionDataWriteApproved !== false) {
    throw new Error('Free-proxy score-readiness gate monitor must not approve production or score writes.');
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
  console.log(`Transport Shock free-proxy score-readiness gate monitor: ${result.status}`);
  console.log(`gateStatus: ${result.gate.status}`);
  console.log(`gatePassed: ${result.gate.gatePassed}`);
  console.log(`contributionBasis: ${result.contributionBasis}; historicalBacktestPerformed=false`);
  console.log(`realEventSamplesRemaining: ${result.targetGaps.realEventSamples.remaining}`);
  console.log(`knownDisruptionSamplesRemaining: ${result.targetGaps.knownDisruptionSamples.remaining}`);
  console.log(`zeroControlSamplesRemaining: ${result.targetGaps.zeroControlSamples.remaining}`);
  console.log(`nextSamplePriorities: ${result.nextSamplePriorities.map((item) => item.id).join(', ') || 'none'}`);
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
