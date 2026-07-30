#!/usr/bin/env node
import { isManualArtifactPath } from '../lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS,
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES,
  validateOilThermalHistoryWindow
} from './oil-thermal-history-window.mjs';
import { evaluateOilThermalPromotionHealthGate } from './oil-thermal-sample-health.mjs';

const PREP_VERSION = 'oil-thermal-baseline-readiness-p47';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-thermal/watch-samples';
const DEFAULT_REVIEW_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json';
const DEFAULT_MAX_COMMITS = OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS;
const DEFAULT_MAX_SAMPLES = OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES;
const DEFAULT_MIN_SAMPLES = 8;
const ARCHIVE_SCRIPT = 'scripts/oil-directional/archive-oil-thermal-watch-history-samples.mjs';
const REVIEW_SCRIPT = 'scripts/oil-directional/review-oil-thermal-baseline-samples.mjs';
const BOUNDARY =
  'manual oil thermal baseline readiness preparation only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run prepare:oil-thermal-baseline-review -- [options]

Options:
  --output-dir <path>       Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --review-output <path>    Ignored baseline sample review artifact. Default: ${DEFAULT_REVIEW_OUTPUT}
  --output <path>           Ignored combined P47 readiness artifact. Default: ${DEFAULT_OUTPUT}
  --max-commits <n>         Recent git commits touching data/oil-thermal-watch.json to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>         Maximum unique valid history samples to archive. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>         Facility samples required before baseline candidate is ready. Default: ${DEFAULT_MIN_SAMPLES}
  --dry-run                 Do not write archive, review, or combined output artifacts.
  --no-output               Do not write the combined P47 readiness artifact.
  --strict                  Exit non-zero if baseline review is WARN/FAIL.
  --json                    Print full JSON result instead of compact summary.
  --help                    Show this help.`);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    reviewOutput: DEFAULT_REVIEW_OUTPUT,
    output: DEFAULT_OUTPUT,
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    dryRun: false,
    writeOutput: true,
    strict: false,
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
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg === '--review-output') {
      options.reviewOutput = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
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
    ['output-dir', options.outputDir],
    ['review-output', options.reviewOutput],
    ['output', options.output]
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
  if (result.error) {
    throw new Error(`Failed to run ${scriptPath}: ${result.error.message}`);
  }
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

function runArchive(options) {
  const args = [
    '--output-dir',
    options.outputDir,
    '--max-commits',
    String(options.maxCommits),
    '--max-samples',
    String(options.maxSamples),
    '--allow-empty',
    '--json'
  ];
  if (options.dryRun) args.push('--dry-run');

  return parseJsonStdout('history archive', runNodeScript(ARCHIVE_SCRIPT, args).stdout);
}

function runReview(options) {
  const args = [
    '--input-dir',
    options.outputDir,
    '--min-samples',
    String(options.minSamples),
    '--json'
  ];
  if (options.dryRun) {
    args.push('--no-output');
  } else {
    args.push('--output', options.reviewOutput);
  }

  return parseJsonStdout('baseline sample review', runNodeScript(REVIEW_SCRIPT, args).stdout);
}

function readExistingReview(options) {
  if (!existsSync(resolve(options.reviewOutput))) {
    return null;
  }
  return JSON.parse(readFileSync(resolve(options.reviewOutput), 'utf8'));
}

function summarizeFacilities(review) {
  const facilities = Array.isArray(review?.facilities) ? review.facilities : [];
  return facilities.map((facility) => ({
    id: facility.id,
    label: facility.label,
    region: facility.region,
    sampleCount: facility.sampleCount,
    readyForBaseline: facility.readyForBaseline,
    needsMoreSamples: Math.max(0, (review?.policy?.minSamplesPerFacility ?? DEFAULT_MIN_SAMPLES) - (facility.sampleCount ?? 0)),
    samplesWithDetections: facility.metrics?.samplesWithDetections ?? null,
    samplesWithMultiSourceDetections: facility.metrics?.samplesWithMultiSourceDetections ?? null,
    maxObservedFrp: facility.metrics?.maxObservedFrp ?? null,
    maxObservedRowCount: facility.metrics?.maxObservedRowCount ?? null
  }));
}

function createReadiness(options, archive, review) {
  const reviewSummary = review?.summary ?? {};
  const facilityReadiness = summarizeFacilities(review);
  const readyFacilities = facilityReadiness.filter((facility) => facility.readyForBaseline);
  const promotionHealthGate = evaluateOilThermalPromotionHealthGate({
    sampleHealth: review?.sampleHealth,
    candidateBaselineStatus: reviewSummary.candidateBaselineStatus,
    facilitiesReadyForBaseline: reviewSummary.facilitiesReadyForBaseline,
    facilityCount: reviewSummary.facilityCount
  });
  const recommendation = (() => {
    if (review?.status === 'fail') return 'fix_sample_artifacts_before_baseline_review';
    if (!promotionHealthGate.satisfied) {
      return promotionHealthGate.reasons.includes('post_policy_healthy_sample_missing')
        ? 'health_filtered_candidate_ready_post_policy_observation_required'
        : review?.recommendation ?? 'sample_health_gate_not_ready';
    }
    if (review?.status === 'warn') return review?.recommendation ?? 'manual_review_required';
    if ((reviewSummary.facilitiesReadyForBaseline ?? 0) === 0) return 'collect_more_samples';
    if ((reviewSummary.facilitiesReadyForBaseline ?? 0) < (reviewSummary.facilityCount ?? 0)) {
      return 'partial_baseline_candidate_ready_manual_review_required';
    }
    return 'baseline_candidate_ready_for_manual_promotion_review';
  })();

  return {
    prepVersion: PREP_VERSION,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    status:
      review?.status === 'fail'
        ? 'fail'
        : review?.status === 'warn'
          ? 'warn'
          : recommendation === 'collect_more_samples'
            ? 'warn'
            : 'ok',
    recommendation,
    promotionEligible: false,
    productionBaselineWriteApproved: false,
    commands: {
      archive: `npm run archive:oil-thermal-watch-history-samples -- --output-dir ${options.outputDir} --max-commits ${options.maxCommits} --max-samples ${options.maxSamples} --allow-empty`,
      review: `npm run review:oil-thermal-baseline-samples -- --input-dir ${options.outputDir} --min-samples ${options.minSamples}`,
      nextManualReview: 'Inspect manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json before any production baseline promotion.'
    },
    archive: {
      version: archive.archiveVersion ?? null,
      status: archive.status ?? null,
      commitsInspected: archive.input?.commitsInspected ?? null,
      validUniqueSamples: archive.summary?.validUniqueSamples ?? null,
      archived: archive.summary?.archived ?? null,
      alreadyArchived: archive.summary?.alreadyArchived ?? null,
      dryRunWouldArchive: archive.summary?.dryRunWouldArchive ?? null,
      invalidCommits: archive.summary?.invalidCommits ?? null,
      outputDir: archive.output?.outputDir ?? resolve(options.outputDir)
    },
    review: {
      version: review?.reviewVersion ?? null,
      status: review?.status ?? null,
      recommendation: review?.recommendation ?? null,
      sampleCount: reviewSummary.sampleCount ?? null,
      sampleWindowDays: reviewSummary.sampleWindowDays ?? null,
      totalSampleCount: reviewSummary.totalSampleCount ?? null,
      quarantinedSampleCount: reviewSummary.quarantinedSampleCount ?? null,
      facilityCount: reviewSummary.facilityCount ?? null,
      facilitiesReadyForBaseline: reviewSummary.facilitiesReadyForBaseline ?? null,
      facilitiesNeedingMoreSamples: reviewSummary.facilitiesNeedingMoreSamples ?? null,
      candidateBaselineStatus: reviewSummary.candidateBaselineStatus ?? null,
      facilityP95ChangedCountAfterQuarantine: reviewSummary.facilityP95ChangedCountAfterQuarantine ?? null,
      warnings: Array.isArray(review?.warnings) ? review.warnings.length : null,
      blockers: Array.isArray(review?.blockers) ? review.blockers.length : null,
      reviewOutput: options.dryRun ? null : resolve(options.reviewOutput)
    },
    sampleHealth: {
      gateVersion: review?.sampleHealth?.gateVersion ?? null,
      mode: review?.sampleHealth?.mode ?? null,
      inputSampleCount: review?.sampleHealth?.inputSampleCount ?? null,
      eligibleSampleCount: review?.sampleHealth?.eligibleSampleCount ?? null,
      quarantinedSampleCount: review?.sampleHealth?.quarantinedSampleCount ?? null,
      diagnosticsConfirmedEligibleSampleCount:
        review?.sampleHealth?.diagnosticsConfirmedEligibleSampleCount ?? null,
      legacyEligibleSampleCount: review?.sampleHealth?.legacyEligibleSampleCount ?? null,
      postPolicyObservationReady: review?.sampleHealth?.postPolicyObservationReady ?? false,
      failureCategoryCounts: review?.sampleHealth?.failureCategoryCounts ?? {},
      promotionGate: promotionHealthGate
    },
    facilityReadiness,
    readyFacilityIds: readyFacilities.map((facility) => facility.id),
    notReadyFacilityIds: facilityReadiness
      .filter((facility) => !facility.readyForBaseline)
      .map((facility) => facility.id),
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

function writeOutput(options, readiness) {
  if (options.dryRun || !options.writeOutput) {
    return;
  }
  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  readiness.outputPath = outputPath;
  writeFileSync(outputPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
}

function printSummary(readiness) {
  console.log(`Oil thermal baseline readiness prep: ${readiness.status.toUpperCase()}`);
  console.log(`recommendation: ${readiness.recommendation}`);
  console.log(`promotionEligible: ${readiness.promotionEligible}`);
  console.log(`productionBaselineWriteApproved: ${readiness.productionBaselineWriteApproved}`);
  console.log(`archive.validUniqueSamples: ${readiness.archive.validUniqueSamples}`);
  console.log(`archive.archived: ${readiness.archive.archived}`);
  console.log(`archive.alreadyArchived: ${readiness.archive.alreadyArchived}`);
  console.log(`review.sampleCount: ${readiness.review.sampleCount}`);
  console.log(`review.totalSampleCount: ${readiness.review.totalSampleCount}`);
  console.log(`review.quarantinedSampleCount: ${readiness.review.quarantinedSampleCount}`);
  console.log(`review.facilitiesReadyForBaseline: ${readiness.review.facilitiesReadyForBaseline}/${readiness.review.facilityCount}`);
  console.log(`review.candidateBaselineStatus: ${readiness.review.candidateBaselineStatus}`);
  console.log(`sampleHealth.postPolicyObservationReady: ${readiness.sampleHealth.postPolicyObservationReady}`);
  console.log(`sampleHealth.promotionGate: ${readiness.sampleHealth.promotionGate.satisfied}`);
  if (readiness.outputPath) console.log(`outputPath: ${readiness.outputPath}`);
  if (readiness.notReadyFacilityIds.length > 0) {
    console.log(`notReadyFacilityIds: ${readiness.notReadyFacilityIds.join(', ')}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const archive = runArchive(options);

  let review;
  try {
    review = runReview(options);
  } catch (error) {
    if (!options.dryRun) throw error;
    review = readExistingReview(options) ?? {
      reviewVersion: null,
      status: 'warn',
      recommendation: 'dry_run_no_review_artifact_available',
      summary: {
        sampleCount: 0,
        facilityCount: 0,
        facilitiesReadyForBaseline: 0,
        facilitiesNeedingMoreSamples: 0,
        candidateBaselineStatus: 'unknown',
        productionBaselineWriteApproved: false
      },
      facilities: [],
      warnings: [error.message],
      blockers: []
    };
  }

  const readiness = createReadiness(options, archive, review);
  writeOutput(options, readiness);

  if (options.printJson) {
    console.log(JSON.stringify(readiness, null, 2));
  } else {
    printSummary(readiness);
  }

  if (readiness.status === 'fail' || (options.strict && readiness.status !== 'ok')) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
