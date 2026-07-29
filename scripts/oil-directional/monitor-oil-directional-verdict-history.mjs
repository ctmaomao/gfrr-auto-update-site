#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { FINAL_BIAS_VALUES } from './odp-classifier.mjs';

export const MONITOR_VERSION = 'oil-directional-verdict-history-monitor-p64';
export const ODP_PATH = 'data/oil-directional-pressure.json';
export const DEFAULT_OUTPUT =
  'manual-artifacts/oil-directional/oil-directional-verdict-history-monitor-latest.json';
const DEFAULT_MAX_COMMITS = 60;
const DEFAULT_MAX_SAMPLES = 30;
const RECENT_WINDOW = 7;
const BOUNDARY =
  'artifact-only ODP verdict history and drift monitor; reads committed data/oil-directional-pressure.json git history only; writes ignored manual-artifacts and optional GitHub Summary/artifact only; does not fetch network, rebuild ODP, write production data, calculate a new verdict or score, or affect values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';
const FINAL_BIAS_SET = new Set(FINAL_BIAS_VALUES);

function printUsage() {
  console.log(`Usage:
  npm run monitor:oil-directional-verdict-history -- [options]

Options:
  --max-commits <n>   Recent ODP commits to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>   Maximum valid verdict samples to keep. Default: ${DEFAULT_MAX_SAMPLES}
  --output <path>     Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --dry-run           Do not write ignored artifacts.
  --no-output         Do not write the monitor artifact.
  --github-summary    Append a compact monitor summary to GITHUB_STEP_SUMMARY.
  --json              Print full JSON result.
  --help              Show this help.`);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
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
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-output') options.writeOutput = false;
    else if (arg === '--github-summary') options.githubSummary = true;
    else if (arg === '--json') options.printJson = true;
    else if (arg === '--max-commits') {
      options.maxCommits = positiveInteger(argv[index + 1], arg);
      index += 1;
    } else if (arg === '--max-samples') {
      options.maxSamples = positiveInteger(argv[index + 1], arg);
      index += 1;
    } else if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --output');
      options.output = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/: ${options.output}`);
  }
  if (!options.output.toLowerCase().endsWith('.json')) {
    throw new Error(`Monitor output must be a JSON file: ${options.output}`);
  }
  return options;
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true
  }).trim();
}

function readCommitRows(maxCommits) {
  const output = gitOutput(['log', `--max-count=${maxCommits}`, '--format=%H%x09%ct%x09%s', '--', ODP_PATH]);
  return (output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText, ...subjectParts] = line.split('\t');
      if (!/^[a-f0-9]{40}$/iu.test(hash)) throw new Error(`Unexpected git hash: ${line}`);
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null,
        subject: subjectParts.join('\t')
      };
    });
}

function readJsonAtCommit(hash) {
  return JSON.parse(gitOutput(['show', `${hash}:${ODP_PATH}`]));
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function verdictFamily(finalBias) {
  if (['strong_bullish', 'moderate_bullish', 'product_crisis', 'false_down_physical_stress'].includes(finalBias)) {
    return 'upward_physical_pressure';
  }
  if (['bearish', 'false_up_unconfirmed'].includes(finalBias)) return 'downward_or_unconfirmed_pressure';
  if (finalBias === 'neutral_range') return 'neutral_range';
  return 'insufficient_data';
}

export function summarizeOdpArtifact(artifact, commit = {}) {
  if (artifact?.schemaVersion !== 'odp-1' || artifact?.module !== 'oil-directional-pressure') {
    throw new Error('ODP schema/module mismatch');
  }
  const interpretation = artifact.interpretation;
  if (!interpretation || typeof interpretation !== 'object') throw new Error('interpretation missing');
  if (!FINAL_BIAS_SET.has(artifact.finalBias)) throw new Error(`invalid finalBias: ${artifact.finalBias}`);
  if (interpretation.finalBias !== artifact.finalBias) throw new Error('interpretation.finalBias mismatch');
  if (!FINAL_BIAS_SET.has(interpretation.physicalBias)) {
    throw new Error(`invalid physicalBias: ${interpretation.physicalBias}`);
  }
  if (typeof interpretation.divergence !== 'string' || !interpretation.divergence) {
    throw new Error('interpretation.divergence missing');
  }
  if (typeof interpretation.confidence !== 'string' || !interpretation.confidence) {
    throw new Error('interpretation.confidence missing');
  }
  if (typeof interpretation.dataSufficiency !== 'string' || !interpretation.dataSufficiency) {
    throw new Error('interpretation.dataSufficiency missing');
  }

  const evidence = artifact.evidence && typeof artifact.evidence === 'object' ? Object.values(artifact.evidence) : [];
  if (!evidence.length) throw new Error('evidence missing');
  const evidenceStatusCounts = {};
  let maxEvidenceAgeDays = null;
  let degradedEvidenceCount = 0;
  for (const row of evidence) {
    const status = typeof row?.sourceStatus === 'string' ? row.sourceStatus : 'missing';
    evidenceStatusCounts[status] = (evidenceStatusCounts[status] || 0) + 1;
    const ageDays = finiteNumberOrNull(row?.ageDays);
    const maxAgeDays = finiteNumberOrNull(row?.maxAgeDays);
    if (ageDays !== null) maxEvidenceAgeDays = maxEvidenceAgeDays === null ? ageDays : Math.max(maxEvidenceAgeDays, ageDays);
    if (status !== 'live' || ageDays === null || maxAgeDays === null || ageDays > maxAgeDays) degradedEvidenceCount += 1;
  }

  const overlay = interpretation.globalOverlay;
  return {
    commitHash: commit.hash ?? null,
    committedAt: commit.committedAt ?? null,
    subject: commit.subject ?? null,
    builtAt: artifact.builtAt ?? null,
    finalBias: artifact.finalBias,
    verdictFamily: verdictFamily(artifact.finalBias),
    physicalBias: interpretation.physicalBias,
    divergence: interpretation.divergence,
    divergenceActive: interpretation.divergence !== 'none' || artifact.finalBias !== interpretation.physicalBias,
    priceVsPhysical: interpretation.priceVsPhysical ?? null,
    confidence: interpretation.confidence,
    dataSufficiency: interpretation.dataSufficiency,
    evidenceCount: evidence.length,
    maxEvidenceAgeDays,
    degradedEvidenceCount,
    evidenceStatusCounts,
    globalOverlay: {
      status: overlay?.status ?? 'missing',
      effect: overlay?.effect ?? 'missing',
      confidenceAdjustment: overlay?.confidenceAdjustment ?? 'missing',
      confirmationCount: finiteNumberOrNull(overlay?.confirmationCount)
    }
  };
}

function increment(record, key) {
  const safeKey = key || 'missing';
  record[safeKey] = (record[safeKey] || 0) + 1;
}

export function buildVerdictTrend(samples) {
  const finalBiasCounts = {};
  const physicalBiasCounts = {};
  const confidenceCounts = {};
  const dataSufficiencyCounts = {};
  const overlayEffectCounts = {};
  for (const sample of samples) {
    increment(finalBiasCounts, sample.finalBias);
    increment(physicalBiasCounts, sample.physicalBias);
    increment(confidenceCounts, sample.confidence);
    increment(dataSufficiencyCounts, sample.dataSufficiency);
    increment(overlayEffectCounts, sample.globalOverlay.effect);
  }

  const transitions = [];
  let familyTransitionCount = 0;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const newer = samples[index];
    const older = samples[index + 1];
    if (newer.finalBias === older.finalBias) continue;
    const familyChanged = newer.verdictFamily !== older.verdictFamily;
    if (familyChanged) familyTransitionCount += 1;
    transitions.push({
      atCommit: newer.commitHash,
      committedAt: newer.committedAt,
      from: older.finalBias,
      to: newer.finalBias,
      familyChanged
    });
  }

  const recentSamples = samples.slice(0, RECENT_WINDOW);
  let recentVerdictTransitionCount = 0;
  let recentFamilyTransitionCount = 0;
  for (let index = 0; index < recentSamples.length - 1; index += 1) {
    if (recentSamples[index].finalBias !== recentSamples[index + 1].finalBias) recentVerdictTransitionCount += 1;
    if (recentSamples[index].verdictFamily !== recentSamples[index + 1].verdictFamily) recentFamilyTransitionCount += 1;
  }

  let currentVerdictStreak = samples.length ? 1 : 0;
  while (
    currentVerdictStreak < samples.length
    && samples[currentVerdictStreak].finalBias === samples[0].finalBias
  ) {
    currentVerdictStreak += 1;
  }

  return {
    sampleCount: samples.length,
    finalBiasCounts,
    physicalBiasCounts,
    confidenceCounts,
    dataSufficiencyCounts,
    overlayEffectCounts,
    verdictTransitionCount: transitions.length,
    familyTransitionCount,
    recentWindowSamples: recentSamples.length,
    recentVerdictTransitionCount,
    recentFamilyTransitionCount,
    currentVerdictStreak,
    divergenceSampleCount: samples.filter((sample) => sample.divergenceActive).length,
    degradedEvidenceSampleCount: samples.filter((sample) => sample.degradedEvidenceCount > 0).length,
    maxEvidenceAgeDaysObserved: samples.reduce(
      (maximum, sample) => Math.max(maximum, sample.maxEvidenceAgeDays ?? 0),
      0
    ),
    transitions,
    latest: samples[0] ?? null
  };
}

export function classifyVerdictMonitorStatus(trend, invalidCommitCount = 0) {
  if (!trend.sampleCount) return invalidCommitCount ? 'no_valid_verdict_history' : 'awaiting_verdict_history';
  const latest = trend.latest;
  if (latest.finalBias === 'insufficient_data' || latest.dataSufficiency !== 'full') {
    return 'watch_latest_data_insufficient';
  }
  if (latest.degradedEvidenceCount > 0) return 'watch_latest_evidence_degraded';
  if (latest.divergenceActive) return 'watch_active_price_physical_divergence';
  if (trend.recentVerdictTransitionCount >= 3 || trend.recentFamilyTransitionCount >= 2) {
    return 'watch_recent_verdict_churn';
  }
  return 'stable_current_verdict';
}

function createMonitorResult(options) {
  const commits = readCommitRows(options.maxCommits);
  const samples = [];
  const invalid = [];
  let preVerdictSchemaCount = 0;
  for (const commit of commits) {
    if (samples.length >= options.maxSamples) break;
    try {
      const artifact = readJsonAtCommit(commit.hash);
      if (!artifact?.finalBias || !artifact?.interpretation?.physicalBias) {
        preVerdictSchemaCount += 1;
        continue;
      }
      samples.push(summarizeOdpArtifact(artifact, commit));
    } catch (error) {
      invalid.push({
        commitHash: commit.hash,
        committedAt: commit.committedAt,
        subject: commit.subject,
        reason: error.message
      });
    }
  }

  const trend = buildVerdictTrend(samples);
  const status = classifyVerdictMonitorStatus(trend, invalid.length);
  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    dryRun: options.dryRun,
    artifactOnly: true,
    productionDataWriteApproved: false,
    input: {
      gitPath: ODP_PATH,
      readMode: 'git_show_history',
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples,
      commitsInspected: commits.length,
      preVerdictSchemaCount,
      invalidCommitCount: invalid.length
    },
    trend,
    samples,
    invalid,
    manualAction: {
      requiredNow: status.startsWith('watch_') || status === 'no_valid_verdict_history',
      recommendation:
        status === 'stable_current_verdict'
          ? 'continue_read_only_monitoring'
          : status === 'watch_active_price_physical_divergence'
            ? 'review_price_vs_physical_divergence_without_changing_classifier'
            : status === 'watch_recent_verdict_churn'
              ? 'review_recent_evidence_timestamps_and_transition_context'
              : status === 'watch_latest_evidence_degraded'
                ? 'review_latest_source_status_and_freshness_before_interpretation'
                : status === 'watch_latest_data_insufficient'
                  ? 'wait_for_complete_odp_refresh_and_review_missing_evidence'
                  : 'wait_for_valid_odp_history_then_rerun_monitor',
      followUpCheck: 'npm run check:oil-directional-verdict-history-monitor'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      triggersOdpRefresh: false,
      fetchesNetwork: false,
      calculatesNewVerdict: false,
      calculatesNewScore: false,
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

function manualArtifactWritePathChain(filePath) {
  if (!isManualArtifactPath(filePath)) throw new Error(`Refusing output outside manual-artifacts/: ${filePath}`);
  const outputPath = resolve(filePath);
  const rootPath = resolve('manual-artifacts');
  const outputDir = dirname(outputPath);
  const relativeDir = relative(rootPath, outputDir);
  const paths = [rootPath];
  let cursor = rootPath;
  for (const segment of relativeDir.split(/[\\/]+/u).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    paths.push(cursor);
  }
  paths.push(outputPath);
  return paths;
}

function assertManualArtifactWritePath(filePath) {
  for (const existingPath of manualArtifactWritePathChain(filePath)) {
    if (!existsSync(existingPath)) continue;
    if (lstatSync(existingPath).isSymbolicLink()) {
      throw new Error(`Refusing output through symlink/junction: ${safeRelativePath(existingPath) || existingPath}`);
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

function writeMonitorArtifact(options, result) {
  if (options.dryRun || !options.writeOutput) return;
  const outputPath = resolve(options.output);
  assertManualArtifactWritePath(outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function appendGithubSummary(options, result) {
  if (!options.githubSummary) return;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const validation = validateGithubSummaryPath(summaryPath);
  if (!validation.ok) throw new Error(`Refusing GitHub Summary path: ${validation.reason}`);
  const latest = result.trend.latest;
  const lines = [
    '## ODP Verdict History Monitor',
    '',
    `- Status: \`${result.status}\``,
    `- Samples: \`${result.trend.sampleCount}\``,
    `- Latest verdict: \`${latest?.finalBias ?? 'missing'}\``,
    `- Latest physical bias: \`${latest?.physicalBias ?? 'missing'}\``,
    `- Current verdict streak: \`${result.trend.currentVerdictStreak}\``,
    `- Recent verdict transitions: \`${result.trend.recentVerdictTransitionCount}/${result.trend.recentWindowSamples}\``,
    `- Active divergence: \`${latest?.divergenceActive ?? false}\``,
    `- Latest max evidence age: \`${latest?.maxEvidenceAgeDays ?? 'missing'} days\``,
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
  for (const forbidden of ['EIA_API_KEY', 'FIRMS_MAP_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'sourceUrl']) {
    if (text.includes(forbidden)) throw new Error(`Monitor output contains forbidden marker: ${forbidden}`);
  }
  for (const value of Object.values(result.productionImpact)) {
    if (value !== false) throw new Error('Monitor productionImpact must remain all false');
  }
}

function printSummary(result) {
  const latest = result.trend.latest;
  console.log(`ODP verdict history monitor: ${result.status}`);
  console.log(`samples: ${result.trend.sampleCount}`);
  console.log(`latestVerdict: ${latest?.finalBias ?? '—'}`);
  console.log(`latestPhysicalBias: ${latest?.physicalBias ?? '—'}`);
  console.log(`currentVerdictStreak: ${result.trend.currentVerdictStreak}`);
  console.log(`recentVerdictTransitions: ${result.trend.recentVerdictTransitionCount}/${result.trend.recentWindowSamples}`);
  console.log(`activeDivergence: ${latest?.divergenceActive ?? false}`);
  console.log(`latestMaxEvidenceAgeDays: ${latest?.maxEvidenceAgeDays ?? '—'}`);
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
  if (options.printJson) console.log(JSON.stringify(result, null, 2));
  else printSummary(result);
  if (result.status === 'no_valid_verdict_history') process.exitCode = 1;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
