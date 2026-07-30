#!/usr/bin/env node
import { isManualArtifactPath } from '../lib/check-script-helpers.mjs';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  OIL_THERMAL_BASELINE_QUALITY_ORDER,
  oilThermalBaselineQualityForDays
} from './oil-thermal-baseline-quality.mjs';
import {
  OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS,
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES,
  OIL_THERMAL_BASELINE_TARGET_DAYS,
  validateOilThermalHistoryWindow
} from './oil-thermal-history-window.mjs';

const MONITOR_VERSION = 'oil-thermal-baseline-quality-monitor-p68';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-quality-monitor-latest.json';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-thermal/watch-samples';
const DEFAULT_REVIEW_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json';
const DEFAULT_READINESS_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json';
const DEFAULT_BASELINE = 'config/oil-thermal-watch-baseline.json';
const DEFAULT_MAX_COMMITS = OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS;
const DEFAULT_MAX_SAMPLES = OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES;
const DEFAULT_MIN_SAMPLES = 8;
const PREPARE_SCRIPT = 'scripts/oil-directional/prepare-oil-thermal-baseline-review.mjs';
const QUALITY_ORDER = OIL_THERMAL_BASELINE_QUALITY_ORDER;
const QUALITY_THRESHOLDS = [
  { quality: 'starter_short_window', minDays: 0, maxDays: 7 },
  {
    quality: 'starter_observation_window',
    minDays: 7,
    maxDays: OIL_THERMAL_BASELINE_TARGET_DAYS
  },
  {
    quality: 'established_observation_window',
    minDays: OIL_THERMAL_BASELINE_TARGET_DAYS,
    maxDays: null
  }
];
const BOUNDARY =
  'artifact-only oil thermal baseline quality reminder; writes ignored manual-artifacts and GitHub artifact/Summary only; does not write production baseline config; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run monitor:oil-thermal-baseline-quality -- [options]

Options:
  --output <path>             Ignored monitor artifact. Default: ${DEFAULT_OUTPUT}
  --output-dir <path>         Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --review-output <path>      Ignored P26 health-gated review artifact. Default: ${DEFAULT_REVIEW_OUTPUT}
  --readiness-output <path>   Ignored P47 readiness artifact. Default: ${DEFAULT_READINESS_OUTPUT}
  --baseline <path>           Production baseline config to read. Default: ${DEFAULT_BASELINE}
  --max-commits <n>           Recent commits touching data/oil-thermal-watch.json. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>           Maximum unique history samples to archive. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>           Samples required per facility. Default: ${DEFAULT_MIN_SAMPLES}
  --dry-run                   Do not write ignored artifacts.
  --no-output                 Do not write the monitor artifact.
  --github-summary            Append a compact reminder summary to GITHUB_STEP_SUMMARY.
  --json                      Print full JSON result.
  --help                      Show this help.`);
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    reviewOutput: DEFAULT_REVIEW_OUTPUT,
    readinessOutput: DEFAULT_READINESS_OUTPUT,
    baseline: DEFAULT_BASELINE,
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
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

    if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg === '--review-output') {
      options.reviewOutput = nextValue();
    } else if (arg === '--readiness-output') {
      options.readinessOutput = nextValue();
    } else if (arg === '--baseline') {
      options.baseline = nextValue();
    } else if (arg === '--max-commits') {
      options.maxCommits = Number(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  validateOilThermalHistoryWindow(options.maxCommits, options.maxSamples);
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 365) {
    throw new Error('Invalid --min-samples. Expected integer 1..365.');
  }

  for (const [label, filePath] of [
    ['output', options.output],
    ['output-dir', options.outputDir],
    ['review-output', options.reviewOutput],
    ['readiness-output', options.readinessOutput]
  ]) {
    if (!isManualArtifactPath(filePath)) {
      throw new Error(`Refusing ${label} outside manual-artifacts/: ${filePath}`);
    }
  }

  return options;
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  if (result.error) throw new Error(`Failed to run ${scriptPath}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${scriptPath} failed with exit ${result.status}: ${stderr.trim() || stdout.trim()}`);
  }
  return { stdout, stderr };
}

function parseJsonStdout(label, stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not return JSON stdout: ${error.message}`);
  }
}

function readJsonIfExists(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function qualityRank(quality) {
  return QUALITY_ORDER.indexOf(quality);
}

function nextQualityThreshold(sampleWindowDays) {
  if (!Number.isFinite(sampleWindowDays)) {
    return { targetDays: 7, targetQuality: 'starter_observation_window', daysRemaining: null };
  }
  if (sampleWindowDays < 7) {
    return {
      targetDays: 7,
      targetQuality: 'starter_observation_window',
      daysRemaining: round(7 - sampleWindowDays, 2)
    };
  }
  if (sampleWindowDays < OIL_THERMAL_BASELINE_TARGET_DAYS) {
    return {
      targetDays: OIL_THERMAL_BASELINE_TARGET_DAYS,
      targetQuality: 'established_observation_window',
      daysRemaining: round(OIL_THERMAL_BASELINE_TARGET_DAYS - sampleWindowDays, 2)
    };
  }
  return null;
}

function classifyStatus({
  currentQuality,
  candidateQuality,
  candidateEffectiveQualityWindowDays,
  preparationStatus,
  preparationRecommendation,
  promotionHealthGate
}) {
  if (preparationStatus === 'fail') return 'review_failed';
  if (promotionHealthGate?.satisfied === false) {
    return promotionHealthGate.reasons?.includes('post_policy_healthy_sample_missing')
      ? 'observe_post_policy_health_sample'
      : 'candidate_health_gate_hold';
  }
  if (preparationStatus === 'warn') return preparationRecommendation === 'collect_more_samples_before_baseline_candidate_review'
    ? 'collect_more_samples'
    : 'candidate_health_gate_hold';
  if (!candidateQuality) return 'collect_more_samples';
  const currentRank = qualityRank(currentQuality);
  const candidateRank = qualityRank(candidateQuality);
  if (currentRank === -1) return 'baseline_quality_candidate_ready';
  if (candidateRank > currentRank) return 'baseline_quality_threshold_ready';
  if (candidateRank < currentRank) return 'candidate_quality_below_current_baseline';
  const nextThreshold = nextQualityThreshold(candidateEffectiveQualityWindowDays);
  if (nextThreshold) return `collect_until_${nextThreshold.targetDays}d_quality_gate`;
  return 'mature_baseline_observing';
}

function runPrepare(options) {
  const args = [
    '--output-dir',
    options.outputDir,
    '--review-output',
    options.reviewOutput,
    '--output',
    options.readinessOutput,
    '--max-commits',
    String(options.maxCommits),
    '--max-samples',
    String(options.maxSamples),
    '--min-samples',
    String(options.minSamples),
    '--json'
  ];
  if (options.dryRun) args.push('--dry-run', '--no-output');
  return parseJsonStdout('baseline quality preparation', runNodeScript(PREPARE_SCRIPT, args).stdout);
}

function createMonitorResult(options, baseline, preparation) {
  const currentReview = baseline?.sourceReview ?? {};
  const prepReview = preparation?.review ?? {};
  const currentQuality = currentReview.baselineQuality ?? null;
  const currentEffectiveQualityWindowDays = Number.isFinite(currentReview.effectiveQualityWindowDays)
    ? currentReview.effectiveQualityWindowDays
    : Number.isFinite(currentReview.sampleWindowDays)
      ? currentReview.sampleWindowDays
      : null;
  const candidateSampleWindowDays = Number.isFinite(prepReview.sampleWindowDays)
    ? prepReview.sampleWindowDays
    : null;
  const candidateEffectiveQualityWindowDays = Number.isFinite(prepReview.effectiveQualityWindowDays)
    ? prepReview.effectiveQualityWindowDays
    : candidateSampleWindowDays;
  const candidateQuality = oilThermalBaselineQualityForDays(candidateEffectiveQualityWindowDays);
  const nextThreshold = nextQualityThreshold(candidateEffectiveQualityWindowDays);
  const status = classifyStatus({
    currentQuality,
    candidateQuality,
    candidateEffectiveQualityWindowDays,
    preparationStatus: preparation?.status ?? null,
    preparationRecommendation: preparation?.recommendation ?? null,
    promotionHealthGate: preparation?.sampleHealth?.promotionGate ?? null
  });
  const qualityTransition = (() => {
    const currentRank = qualityRank(currentQuality);
    const candidateRank = qualityRank(candidateQuality);
    if (candidateRank === -1) return 'not_evaluated';
    if (currentRank === -1 && candidateRank !== -1) return 'new';
    if (candidateRank > currentRank) return 'upgraded';
    if (candidateRank < currentRank) return 'downgraded';
    if (candidateRank === currentRank && candidateRank !== -1) return 'unchanged';
    return 'not_evaluated';
  })();

  return {
    monitorVersion: MONITOR_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    reminderOnly: true,
    dryRun: options.dryRun,
    productionBaselineWriteApproved: false,
    baseline: {
      path: resolve(options.baseline),
      schemaVersion: baseline?.schemaVersion ?? null,
      status: baseline?.status ?? 'missing',
      establishedAt: baseline?.establishedAt ?? null,
      currentQuality,
      sampleCount: currentReview.sampleCount ?? null,
      sampleWindowDays: currentReview.sampleWindowDays ?? null,
      effectiveQualityWindowDays: currentEffectiveQualityWindowDays,
      baselineQualityBasis: currentReview.baselineQualityBasis ?? 'global_sample_window_days_legacy',
      lastSampleAt: currentReview.lastSampleAt ?? null,
      qualityTransition: currentReview.qualityTransition ?? null
    },
    candidate: {
      preparationStatus: preparation?.status ?? null,
      recommendation: preparation?.recommendation ?? null,
      candidateQuality,
      qualityTransition,
      sampleCount: prepReview.sampleCount ?? null,
      sampleWindowDays: candidateSampleWindowDays,
      minimumFacilityWindowDays: prepReview.minimumFacilityWindowDays ?? null,
      maximumFacilityWindowDays: prepReview.maximumFacilityWindowDays ?? null,
      effectiveQualityWindowDays: candidateEffectiveQualityWindowDays,
      baselineQualityBasis: 'minimum_facility_window_days',
      qualityTargetDays: prepReview.qualityTargetDays ?? OIL_THERMAL_BASELINE_TARGET_DAYS,
      facilitiesMeetingQualityTarget: prepReview.facilitiesMeetingQualityTarget ?? null,
      facilitiesBelowQualityTarget: prepReview.facilitiesBelowQualityTarget ?? null,
      facilitiesReadyForBaseline: prepReview.facilitiesReadyForBaseline ?? null,
      facilityCount: prepReview.facilityCount ?? null,
      validUniqueSamples: preparation?.archive?.validUniqueSamples ?? null,
      archived: preparation?.archive?.archived ?? null,
      alreadyArchived: preparation?.archive?.alreadyArchived ?? null,
      sampleHealth: preparation?.sampleHealth ?? null,
      nextQualityThreshold: nextThreshold
    },
    thresholds: QUALITY_THRESHOLDS,
    manualAction: {
      requiredNow:
        preparation?.status === 'ok'
        && (status === 'baseline_quality_threshold_ready' || status === 'baseline_quality_candidate_ready'),
      recommendedReviewCommand:
        'npm run refresh:oil-thermal-baseline-candidate',
      productionPromotionCommand:
        'npm run refresh:oil-thermal-baseline-candidate -- --write-production-baseline',
      note:
        'Promotion command is informational only; P68 never runs it automatically, never commits config changes, and keeps manual action false until the effective facility-window quality gate is ready.'
    },
    artifacts: {
      outputPath: options.dryRun || !options.writeOutput ? null : resolve(options.output),
      sampleArchiveDir: resolve(options.outputDir),
      reviewOutput: options.dryRun ? null : resolve(options.reviewOutput),
      readinessOutput: options.dryRun ? null : resolve(options.readinessOutput)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
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

function assertNoSensitiveOutput(result) {
  const text = JSON.stringify(result);
  for (const forbidden of [
    'FIRMS_MAP_KEY',
    'firms.modaps.eosdis.nasa.gov/api/area/csv/',
    '/api/area/csv/<',
    '/api/area/csv/$'
  ]) {
    if (text.includes(forbidden)) {
      throw new Error(`Monitor output contains forbidden sensitive marker: ${forbidden}`);
    }
  }
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
  const candidate = result.candidate;
  const threshold = candidate.nextQualityThreshold;
  const thresholdText = threshold
    ? `${threshold.targetQuality} at ${threshold.targetDays}d; ${threshold.daysRemaining ?? 'unknown'}d remaining`
    : 'mature window already reached';
  const lines = [
    '## Oil Thermal Baseline Quality Reminder',
    '',
    `- Status: \`${result.status}\``,
    `- Current quality: \`${result.baseline.currentQuality ?? 'missing'}\` (${result.baseline.sampleCount ?? 'n/a'} samples / effective ${result.baseline.effectiveQualityWindowDays ?? 'n/a'}d; global ${result.baseline.sampleWindowDays ?? 'n/a'}d)`,
    `- Candidate quality: \`${candidate.candidateQuality ?? 'missing'}\` (${candidate.sampleCount ?? 'n/a'} samples / effective ${candidate.effectiveQualityWindowDays ?? 'n/a'}d; global ${candidate.sampleWindowDays ?? 'n/a'}d)`,
    `- Facility quality target: \`${candidate.facilitiesMeetingQualityTarget ?? 'n/a'}/${candidate.facilityCount ?? 'n/a'}\` at ${candidate.qualityTargetDays ?? OIL_THERMAL_BASELINE_TARGET_DAYS}d`,
    `- Candidate health: \`${candidate.sampleHealth?.eligibleSampleCount ?? 'n/a'}\` eligible / \`${candidate.sampleHealth?.inputSampleCount ?? 'n/a'}\` input; promotion gate \`${candidate.sampleHealth?.promotionGate?.satisfied ?? false}\``,
    `- Next threshold: ${thresholdText}`,
    `- Manual action required now: \`${result.manualAction.requiredNow}\``,
    `- Production write approved by this workflow: \`${result.productionBaselineWriteApproved}\``,
    '',
    `Boundary: ${result.boundary}`,
    ''
  ];
  appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function printSummary(result) {
  console.log(`Oil thermal baseline quality monitor: ${result.status}`);
  console.log(`currentQuality: ${result.baseline.currentQuality ?? 'missing'}`);
  console.log(`candidateQuality: ${result.candidate.candidateQuality ?? 'missing'}`);
  console.log(`globalSampleWindowDays: ${result.baseline.sampleWindowDays ?? 'none'} -> ${result.candidate.sampleWindowDays ?? 'none'}`);
  console.log(`effectiveQualityWindowDays: ${result.baseline.effectiveQualityWindowDays ?? 'none'} -> ${result.candidate.effectiveQualityWindowDays ?? 'none'}`);
  console.log(`facilitiesMeetingQualityTarget: ${result.candidate.facilitiesMeetingQualityTarget ?? 'none'}/${result.candidate.facilityCount ?? 'none'}`);
  console.log(`qualityTransition: ${result.candidate.qualityTransition}`);
  console.log(`eligibleSampleCount: ${result.candidate.sampleHealth?.eligibleSampleCount ?? 'none'} / ${result.candidate.sampleHealth?.inputSampleCount ?? 'none'}`);
  console.log(`sampleHealthPromotionGate: ${result.candidate.sampleHealth?.promotionGate?.satisfied ?? false}`);
  console.log(`manualAction.requiredNow: ${result.manualAction.requiredNow}`);
  console.log(`productionBaselineWriteApproved: ${result.productionBaselineWriteApproved}`);
  if (result.artifacts.outputPath) console.log(`outputPath: ${result.artifacts.outputPath}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseline = readJsonIfExists(options.baseline);
  const preparation = runPrepare(options);
  const result = createMonitorResult(options, baseline, preparation);
  assertNoSensitiveOutput(result);
  writeMonitorArtifact(options, result);
  appendGithubSummary(options, result);
  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
