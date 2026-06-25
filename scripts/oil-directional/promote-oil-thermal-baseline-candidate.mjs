#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const PROMOTION_VERSION = 'oil-thermal-baseline-promotion-p49';
const DEFAULT_REVIEW = 'manual-artifacts/oil-thermal/oil-thermal-baseline-samples-review-latest.json';
const DEFAULT_READINESS = 'manual-artifacts/oil-thermal/oil-thermal-baseline-readiness-latest.json';
const DEFAULT_FACILITIES = 'config/oil-thermal-watch-facilities.json';
const DEFAULT_OUTPUT = 'config/oil-thermal-watch-baseline.json';
const DEFAULT_MIN_SAMPLES = 8;
const BOUNDARY =
  'production oil thermal rolling baseline config; display-only repeated-observation gate only; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';
const QUALITY_POLICY = {
  starterShortWindowMaxDays: 7,
  starterObservationWindowMaxDays: 30,
  qualityOrder: [
    'starter_short_window',
    'starter_observation_window',
    'established_observation_window'
  ]
};

const FULL_POLICY_DEFAULTS = {
  minSamplesPerFacility: 8,
  minRepeatSources: 2,
  rowCountP95Margin: 1,
  maxFrpP95Margin: 1,
  highConfidenceP95Margin: 0,
  frpOver50P95Margin: 0,
  elevatedMinFrp: 50,
  elevatedMinHighConfidenceCount: 2,
  elevatedMinFrpOver50Count: 1,
  elevatedMinFrpOver100Count: 1
};

function printUsage() {
  console.log(`Usage:
  npm run promote:oil-thermal-baseline-candidate -- [options]

Options:
  --review <path>                 P25 review artifact. Default: ${DEFAULT_REVIEW}
  --readiness <path>              P47 readiness artifact. Default: ${DEFAULT_READINESS}
  --facilities <path>             Production facility whitelist. Default: ${DEFAULT_FACILITIES}
  --output <path>                 Production baseline config. Default: ${DEFAULT_OUTPUT}
  --min-samples <n>               Required samples per facility. Default: ${DEFAULT_MIN_SAMPLES}
  --allow-warnings                Allow P25/P47 warning arrays during promotion.
  --write-production-baseline     Actually write config/oil-thermal-watch-baseline.json.
  --json                          Print full JSON result.
  --help                          Show this help.`);
}

function parseArgs(argv) {
  const options = {
    review: DEFAULT_REVIEW,
    readiness: DEFAULT_READINESS,
    facilities: DEFAULT_FACILITIES,
    output: DEFAULT_OUTPUT,
    minSamples: DEFAULT_MIN_SAMPLES,
    allowWarnings: false,
    writeProductionBaseline: false,
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

    if (arg === '--review') {
      options.review = nextValue();
    } else if (arg === '--readiness') {
      options.readiness = nextValue();
    } else if (arg === '--facilities') {
      options.facilities = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 365) {
    throw new Error('Invalid --min-samples. Expected integer 1..365.');
  }
  if (!isManualArtifactPath(options.review)) {
    throw new Error(`Refusing review artifact outside manual-artifacts/: ${options.review}`);
  }
  if (!isManualArtifactPath(options.readiness)) {
    throw new Error(`Refusing readiness artifact outside manual-artifacts/: ${options.readiness}`);
  }
  if (safeRelativePath(options.facilities) !== DEFAULT_FACILITIES) {
    throw new Error(`P49 only promotes against ${DEFAULT_FACILITIES}`);
  }
  if (safeRelativePath(options.output) !== DEFAULT_OUTPUT) {
    throw new Error(`P49 only writes ${DEFAULT_OUTPUT}`);
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
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing JSON artifact: ${filePath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function isoOrThrow(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function numberOrThrow(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return number;
}

function allProductionImpactFalse(map, label) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error(`${label}.productionImpact must be an object.`);
  }
  const truthy = Object.entries(map).filter(([, value]) => value === true).map(([key]) => key);
  if (truthy.length > 0) throw new Error(`${label}.productionImpact has true fields: ${truthy.join(', ')}`);
}

function ensureNoRawSensitiveText(payload, label) {
  const text = JSON.stringify(payload);
  if (text.includes('FIRMS_MAP_KEY') || /firms\.modaps\.eosdis\.nasa\.gov\/api\/area\/csv/u.test(text)) {
    throw new Error(`${label} contains a key marker or raw FIRMS Area API URL.`);
  }
}

function validateArtifacts({ review, readiness, facilitiesConfig, options }) {
  if (review.reviewVersion !== 'oil-thermal-baseline-samples-review-p25') {
    throw new Error(`Unsupported reviewVersion: ${review.reviewVersion}`);
  }
  if (readiness.prepVersion !== 'oil-thermal-baseline-readiness-p47') {
    throw new Error(`Unsupported prepVersion: ${readiness.prepVersion}`);
  }
  if (review.status !== 'pass') throw new Error(`P25 review must be pass, got ${review.status}`);
  if (readiness.status !== 'ok') throw new Error(`P47 readiness must be ok, got ${readiness.status}`);
  if (review.candidateBaseline?.candidateOnly !== true) {
    throw new Error('P25 candidateBaseline.candidateOnly must be true before P49 rolling promotion.');
  }
  if (review.candidateBaseline?.status !== 'established') {
    throw new Error(`P25 candidate baseline must be established, got ${review.candidateBaseline?.status}`);
  }
  if (readiness.recommendation !== 'baseline_candidate_ready_for_manual_promotion_review') {
    throw new Error(`P47 readiness recommendation is not promotion-ready: ${readiness.recommendation}`);
  }
  if (review.promotionEligible !== false || readiness.promotionEligible !== false) {
    throw new Error('P25/P47 artifacts must remain non-promotional review artifacts.');
  }
  if (review.summary?.productionBaselineWriteApproved !== false || readiness.productionBaselineWriteApproved !== false) {
    throw new Error('P25/P47 artifacts must not claim production baseline write approval.');
  }
  if (!options.allowWarnings) {
    const warningCount = (review.warnings?.length ?? 0) + (readiness.review?.warnings ?? 0);
    if (warningCount > 0) throw new Error(`Warnings present (${warningCount}); rerun with --allow-warnings only after manual review.`);
  }
  if ((review.blockers?.length ?? 0) > 0 || (readiness.review?.blockers ?? 0) > 0) {
    throw new Error('P25/P47 blockers are present.');
  }
  allProductionImpactFalse(review.productionImpact, 'P25 review');
  allProductionImpactFalse(readiness.productionImpact, 'P47 readiness');
  ensureNoRawSensitiveText(review, 'P25 review');
  ensureNoRawSensitiveText(readiness, 'P47 readiness');

  const facilities = Array.isArray(facilitiesConfig.facilities) ? facilitiesConfig.facilities : [];
  const candidateRows = Array.isArray(review.candidateBaseline?.facilities) ? review.candidateBaseline.facilities : [];
  if (facilities.length === 0) throw new Error('Production facility whitelist is empty.');
  if (candidateRows.length !== facilities.length) {
    throw new Error(`Candidate facility count ${candidateRows.length} does not match whitelist ${facilities.length}.`);
  }
  if ((readiness.notReadyFacilityIds?.length ?? 0) > 0) {
    throw new Error(`P47 not-ready facilities remain: ${readiness.notReadyFacilityIds.join(', ')}`);
  }
  if (review.summary?.sampleCount !== readiness.review?.sampleCount) {
    throw new Error('P25/P47 sample counts do not match.');
  }
  if (review.summary?.facilitiesReadyForBaseline !== facilities.length) {
    throw new Error('Not all whitelist facilities are ready for baseline.');
  }
}

function normalizePolicy(existingPolicy, candidatePolicy, minSamples) {
  const merged = { ...FULL_POLICY_DEFAULTS, ...(existingPolicy ?? {}), ...(candidatePolicy ?? {}) };
  merged.minSamplesPerFacility = minSamples;
  return Object.fromEntries(Object.entries(FULL_POLICY_DEFAULTS).map(([key, fallback]) => [
    key,
    numberOrThrow(merged[key] ?? fallback, `policy.${key}`)
  ]));
}

function baselineQuality(sampleWindowDays) {
  if (sampleWindowDays < QUALITY_POLICY.starterShortWindowMaxDays) return 'starter_short_window';
  if (sampleWindowDays < QUALITY_POLICY.starterObservationWindowMaxDays) return 'starter_observation_window';
  return 'established_observation_window';
}

function qualityRank(quality) {
  return QUALITY_POLICY.qualityOrder.indexOf(quality);
}

function previousBaselineSnapshot(existingBaseline) {
  const review = existingBaseline?.sourceReview;
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null;
  const baselineQualityValue = typeof review.baselineQuality === 'string' ? review.baselineQuality : null;
  return {
    promotionVersion: typeof review.promotionVersion === 'string' ? review.promotionVersion : null,
    promotionStage: typeof review.promotionStage === 'string' ? review.promotionStage : null,
    baselineQuality: baselineQualityValue,
    sampleCount: Number.isFinite(review.sampleCount) ? review.sampleCount : null,
    sampleWindowDays: Number.isFinite(review.sampleWindowDays) ? review.sampleWindowDays : null,
    lastSampleAt: typeof review.lastSampleAt === 'string' ? review.lastSampleAt : null
  };
}

function qualityTransition(previousBaseline, nextQuality) {
  const previousQuality = previousBaseline?.baselineQuality;
  const previousRank = qualityRank(previousQuality);
  const nextRank = qualityRank(nextQuality);
  if (previousRank < 0) return 'new';
  if (nextRank > previousRank) return 'upgraded';
  if (nextRank < previousRank) return 'downgraded';
  return 'unchanged';
}

function caveatsForQuality(quality) {
  const qualityCaveat = (() => {
    if (quality === 'starter_short_window') {
      return 'The current sample window is short (<7 days); repeated/elevated observations remain manual-review prompts, not incident or supply-disruption confirmation.';
    }
    if (quality === 'starter_observation_window') {
      return 'The current sample window is 7-30 days; the baseline is improving but is not a mature seasonal or long-history operating baseline.';
    }
    return 'The current sample window is 30+ days; the baseline is more durable, but repeated/elevated observations still require manual source review.';
  })();
  return [
    'Rolling baseline is derived from sanitized production watch samples only.',
    qualityCaveat,
    'P25/P47 artifacts remain non-promotional review packets; P49 rolling refresh is the separate explicit production-config promotion.'
  ];
}

function promoteRows({ candidateRows, facilities, minSamples }) {
  const rowsById = new Map(candidateRows.map((row) => [row.id, row]));
  return facilities.map((facility) => {
    const row = rowsById.get(facility.id);
    if (!row) throw new Error(`Missing candidate baseline row for ${facility.id}`);
    const sampleCount = Math.floor(numberOrThrow(row.sampleCount, `${facility.id}.sampleCount`));
    if (sampleCount < minSamples) {
      throw new Error(`${facility.id} sampleCount ${sampleCount} is below ${minSamples}`);
    }
    return {
      id: facility.id,
      label: facility.label,
      region: facility.region,
      assetType: facility.assetType,
      sampleCount,
      windowDays: numberOrThrow(row.windowDays, `${facility.id}.windowDays`),
      firstSampleAt: isoOrThrow(row.firstSampleAt, `${facility.id}.firstSampleAt`),
      lastSampleAt: isoOrThrow(row.lastSampleAt, `${facility.id}.lastSampleAt`),
      rowCountP95: numberOrThrow(row.rowCountP95, `${facility.id}.rowCountP95`),
      maxFrpP95: numberOrThrow(row.maxFrpP95, `${facility.id}.maxFrpP95`),
      highConfidenceCountP95: numberOrThrow(row.highConfidenceCountP95, `${facility.id}.highConfidenceCountP95`),
      frpOver50CountP95: numberOrThrow(row.frpOver50CountP95, `${facility.id}.frpOver50CountP95`),
      frpOver100CountP95: numberOrThrow(row.frpOver100CountP95, `${facility.id}.frpOver100CountP95`),
      sourcesWithDetectionsP95: numberOrThrow(row.sourcesWithDetectionsP95, `${facility.id}.sourcesWithDetectionsP95`)
    };
  });
}

function buildBaselineConfig({ review, readiness, facilitiesConfig, existingBaseline, options }) {
  const sampleWindowDays = numberOrThrow(review.summary?.sampleWindowDays, 'review.summary.sampleWindowDays');
  const quality = baselineQuality(sampleWindowDays);
  const previousBaseline = previousBaselineSnapshot(existingBaseline);
  const transition = qualityTransition(previousBaseline, quality);
  const facilities = facilitiesConfig.facilities;
  const promotedRows = promoteRows({
    candidateRows: review.candidateBaseline.facilities,
    facilities,
    minSamples: options.minSamples
  });

  return {
    schemaVersion: 'oil-thermal-baseline-production-v1',
    status: promotedRows.length === facilities.length ? 'established' : 'partial',
    establishedAt: isoOrThrow(review.generatedAt, 'review.generatedAt'),
    sourceReview: {
      promotionVersion: PROMOTION_VERSION,
      promotionStage: 'P49',
      baselineQuality: quality,
      qualityPolicy: QUALITY_POLICY,
      qualityTransition: transition,
      previousBaseline,
      reviewArtifact: DEFAULT_REVIEW,
      reviewVersion: review.reviewVersion,
      reviewGeneratedAt: isoOrThrow(review.generatedAt, 'review.generatedAt'),
      readinessArtifact: DEFAULT_READINESS,
      readinessVersion: readiness.prepVersion,
      readinessGeneratedAt: isoOrThrow(readiness.generatedAt, 'readiness.generatedAt'),
      sampleCount: numberOrThrow(review.summary.sampleCount, 'review.summary.sampleCount'),
      firstSampleAt: isoOrThrow(review.summary.firstSampleAt, 'review.summary.firstSampleAt'),
      lastSampleAt: isoOrThrow(review.summary.lastSampleAt, 'review.summary.lastSampleAt'),
      sampleWindowDays,
      facilityCount: facilities.length,
      facilitiesReadyForBaseline: numberOrThrow(review.summary.facilitiesReadyForBaseline, 'review.summary.facilitiesReadyForBaseline'),
      caveats: caveatsForQuality(quality)
    },
    notes: [
      'P49 rolling refresh promotes operator-reviewed p95 rows from P25/P47 sanitized oil-thermal-watch history samples.',
      'Baseline quality ages by sampleWindowDays: <7 days starter_short_window, 7-30 days starter_observation_window, 30+ days established_observation_window.',
      'Repeated observation still requires established facility baseline, multi-source repeatability, and above-baseline strength.',
      'This baseline file never stores MAP_KEY, raw FIRMS rows, raw URLs, outage claims, supply-disruption claims, or oil-price direction.',
      'Satellite thermal watch remains production read-only and does not enter ODP finalBias, scoring, decision, execution, position, Brent promotion, Global Risk Heatmap, or cross-validation.'
    ],
    policy: normalizePolicy(existingBaseline?.policy, review.candidateBaseline?.policy, options.minSamples),
    facilities: promotedRows,
    boundary: BOUNDARY
  };
}

function writeJson(filePath, payload) {
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
}

function printSummary(result) {
  console.log(`Oil thermal baseline candidate promotion: ${result.writeMode}`);
  console.log(`status: ${result.baseline.status}`);
  console.log(`baselineQuality: ${result.baseline.sourceReview.baselineQuality}`);
  console.log(`qualityTransition: ${result.baseline.sourceReview.qualityTransition}`);
  console.log(`previousBaselineQuality: ${result.baseline.sourceReview.previousBaseline?.baselineQuality ?? 'none'}`);
  console.log(`sampleCount: ${result.baseline.sourceReview.sampleCount}`);
  console.log(`sampleWindowDays: ${result.baseline.sourceReview.sampleWindowDays}`);
  console.log(`facilityCount: ${result.baseline.sourceReview.facilityCount}`);
  console.log(`facilities: ${result.baseline.facilities.length}`);
  console.log(`outputPath: ${result.outputPath ?? '(dry-run)'}`);
  console.log(`boundary: ${result.baseline.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = readJson(options.review);
  const readiness = readJson(options.readiness);
  const facilitiesConfig = readJson(options.facilities);
  const existingBaseline = readJson(options.output);
  validateArtifacts({ review, readiness, facilitiesConfig, options });
  const baseline = buildBaselineConfig({ review, readiness, facilitiesConfig, existingBaseline, options });
  ensureNoRawSensitiveText(baseline, 'P49 baseline config');
  const outputPath = options.writeProductionBaseline ? writeJson(options.output, baseline) : null;
  const result = {
    promotionVersion: PROMOTION_VERSION,
    generatedAt: new Date().toISOString(),
    writeMode: options.writeProductionBaseline ? 'wrote_production_baseline' : 'dry_run_no_write',
    outputPath,
    baseline
  };
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
