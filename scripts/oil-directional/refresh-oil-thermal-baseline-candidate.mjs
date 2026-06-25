#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const REFRESH_VERSION = 'oil-thermal-baseline-rolling-refresh-p49';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-thermal/watch-samples';
const DEFAULT_REVIEW_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json';
const DEFAULT_READINESS_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json';
const DEFAULT_FACILITIES = 'config/oil-thermal-watch-facilities.json';
const DEFAULT_BASELINE_OUTPUT = 'config/oil-thermal-watch-baseline.json';
const DEFAULT_MAX_COMMITS = 240;
const DEFAULT_MAX_SAMPLES = 100;
const DEFAULT_MIN_SAMPLES = 8;
const PREPARE_SCRIPT = 'scripts/oil-directional/prepare-oil-thermal-baseline-review.mjs';
const PROMOTE_SCRIPT = 'scripts/oil-directional/promote-oil-thermal-baseline-candidate.mjs';
const BOUNDARY =
  'manual/local oil thermal baseline rolling refresh; production config write only with --write-production-baseline; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run refresh:oil-thermal-baseline-candidate -- [options]

Options:
  --output-dir <path>             Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --review-output <path>          Ignored P25 review artifact. Default: ${DEFAULT_REVIEW_OUTPUT}
  --readiness-output <path>       Ignored P47 readiness artifact. Default: ${DEFAULT_READINESS_OUTPUT}
  --facilities <path>             Production facility whitelist. Default: ${DEFAULT_FACILITIES}
  --baseline-output <path>        Production baseline config. Default: ${DEFAULT_BASELINE_OUTPUT}
  --max-commits <n>               Recent git commits touching data/oil-thermal-watch.json. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>               Maximum unique valid history samples to archive. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>               Required samples per facility. Default: ${DEFAULT_MIN_SAMPLES}
  --allow-warnings                Pass through promotion warnings after manual review.
  --write-production-baseline     Write config/oil-thermal-watch-baseline.json after refresh.
  --dry-run                       Run preparation without writing ignored artifacts or production config.
  --json                          Print full JSON result.
  --help                          Show this help.`);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    reviewOutput: DEFAULT_REVIEW_OUTPUT,
    readinessOutput: DEFAULT_READINESS_OUTPUT,
    facilities: DEFAULT_FACILITIES,
    baselineOutput: DEFAULT_BASELINE_OUTPUT,
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    allowWarnings: false,
    writeProductionBaseline: false,
    dryRun: false,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-warnings') {
      options.allowWarnings = true;
      continue;
    }
    if (arg === '--write-production-baseline') {
      options.writeProductionBaseline = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
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

    if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg === '--review-output') {
      options.reviewOutput = nextValue();
    } else if (arg === '--readiness-output') {
      options.readinessOutput = nextValue();
    } else if (arg === '--facilities') {
      options.facilities = nextValue();
    } else if (arg === '--baseline-output') {
      options.baselineOutput = nextValue();
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

  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 500) {
    throw new Error('Invalid --max-commits. Expected integer 1..500.');
  }
  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 100) {
    throw new Error('Invalid --max-samples. Expected integer 1..100.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 365) {
    throw new Error('Invalid --min-samples. Expected integer 1..365.');
  }
  if (options.dryRun && options.writeProductionBaseline) {
    throw new Error('--dry-run cannot be combined with --write-production-baseline.');
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
  return parseJsonStdout('baseline readiness preparation', runNodeScript(PREPARE_SCRIPT, args).stdout);
}

function canRunPromotion(options) {
  return existsSync(resolve(options.reviewOutput)) && existsSync(resolve(options.readinessOutput));
}

function runPromotion(options) {
  const args = [
    '--review',
    options.reviewOutput,
    '--readiness',
    options.readinessOutput,
    '--facilities',
    options.facilities,
    '--output',
    options.baselineOutput,
    '--min-samples',
    String(options.minSamples),
    '--json'
  ];
  if (options.allowWarnings) args.push('--allow-warnings');
  if (options.writeProductionBaseline) args.push('--write-production-baseline');
  return parseJsonStdout('baseline production promotion', runNodeScript(PROMOTE_SCRIPT, args).stdout);
}

function summarizeRefresh({ options, previousBaseline, preparation, promotion }) {
  const nextReview = promotion?.baseline?.sourceReview ?? null;
  const previousReview = previousBaseline?.sourceReview ?? null;
  return {
    refreshVersion: REFRESH_VERSION,
    generatedAt: new Date().toISOString(),
    status: promotion ? 'ok' : 'prepared_no_promotion',
    writeMode: options.writeProductionBaseline ? 'wrote_production_baseline' : 'dry_run_no_production_write',
    preparation: {
      status: preparation.status,
      recommendation: preparation.recommendation,
      sampleCount: preparation.review?.sampleCount ?? null,
      sampleWindowDays: preparation.review?.sampleWindowDays ?? null,
      facilitiesReadyForBaseline: preparation.review?.facilitiesReadyForBaseline ?? null,
      facilityCount: preparation.review?.facilityCount ?? null,
      validUniqueSamples: preparation.archive?.validUniqueSamples ?? null,
      archived: preparation.archive?.archived ?? null,
      alreadyArchived: preparation.archive?.alreadyArchived ?? null
    },
    baselineAging: {
      previousQuality: previousReview?.baselineQuality ?? null,
      nextQuality: nextReview?.baselineQuality ?? null,
      qualityTransition: nextReview?.qualityTransition ?? null,
      previousSampleCount: previousReview?.sampleCount ?? null,
      nextSampleCount: nextReview?.sampleCount ?? null,
      previousSampleWindowDays: previousReview?.sampleWindowDays ?? null,
      nextSampleWindowDays: nextReview?.sampleWindowDays ?? null,
      previousLastSampleAt: previousReview?.lastSampleAt ?? null,
      nextLastSampleAt: nextReview?.lastSampleAt ?? null
    },
    outputPath: promotion?.outputPath ?? null,
    promotionVersion: promotion?.promotionVersion ?? null,
    productionImpact: {
      writesProductionData: options.writeProductionBaseline,
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
    promotion,
    boundary: BOUNDARY
  };
}

function printSummary(result) {
  console.log(`Oil thermal baseline rolling refresh: ${result.status}`);
  console.log(`writeMode: ${result.writeMode}`);
  console.log(`preparation: ${result.preparation.status} / ${result.preparation.recommendation}`);
  console.log(`sampleCount: ${result.baselineAging.previousSampleCount ?? 'none'} -> ${result.baselineAging.nextSampleCount ?? 'none'}`);
  console.log(`sampleWindowDays: ${result.baselineAging.previousSampleWindowDays ?? 'none'} -> ${result.baselineAging.nextSampleWindowDays ?? 'none'}`);
  console.log(`baselineQuality: ${result.baselineAging.previousQuality ?? 'none'} -> ${result.baselineAging.nextQuality ?? 'none'}`);
  console.log(`qualityTransition: ${result.baselineAging.qualityTransition ?? 'not_evaluated'}`);
  console.log(`outputPath: ${result.outputPath ?? '(no production write)'}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const previousBaseline = readJsonIfExists(options.baselineOutput);
  const preparation = runPrepare(options);
  const promotion = canRunPromotion(options) ? runPromotion(options) : null;
  const result = summarizeRefresh({ options, previousBaseline, preparation, promotion });
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
