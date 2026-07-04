#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'gdelt-web-ngrams-samples-review-p43';
const SAMPLE_SCHEMA_VERSION = 'gdelt-web-ngrams-diagnosis-p41';
const DEFAULT_INPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-samples-review-latest.json';
const DEFAULT_MIN_SAMPLES = 2;
const DEFAULT_MAX_SAMPLES = 20;
const BUCKETS = [
  'chokepoint',
  'middle_east_risk',
  'tanker_shipping',
  'market_reaction',
  'sanctions',
  'supply_disruption',
  'facility_event'
];
const BOUNDARY =
  'manual GDELT Web NGrams sample review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-web-ngrams-samples -- [options]

Options:
  --input <path>       GDELT Web NGrams diagnosis artifact. May be repeated.
  --input-dir <path>   Directory of diagnosis JSON artifacts. Files are read alphabetically.
  --max-samples <n>    Maximum valid samples to review. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>    Minimum usable samples for readiness. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN or FAIL.
  --json               Print full JSON review to stdout.
  --no-output          Do not write the review artifact.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
    strict: false,
    printJson: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
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
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') {
      options.inputs.push(nextValue());
    } else if (arg === '--input-dir') {
      options.inputDirs.push(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 200) {
    throw new Error('Invalid --max-samples. Expected integer 1..200.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
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

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function range(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return { min: null, max: null };
  return {
    min: Math.min(...finite),
    max: Math.max(...finite)
  };
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function productionImpactFalseMap() {
  return {
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
  };
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  if (!files.length && existsSync(resolve(DEFAULT_INPUT))) files.push(DEFAULT_INPUT);
  return [...new Set(files)];
}

function readInputFile(filePath) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing unsafe input path: ${filePath}`);
  return {
    text: readFileSync(filePath, 'utf8'),
    source: {
      type: 'file',
      path: resolve(filePath),
      safeInputPath: true
    }
  };
}

function assertProductionImpactFalse(sample, errors, path) {
  const impact = sample.productionImpact || {};
  for (const key of Object.keys(productionImpactFalseMap())) {
    if (key === 'writesProductionData' || key === 'modifiesFrontend') continue;
    if (impact[key] !== false) errors.push(`${path}.productionImpact.${key} must be false`);
  }
}

function validateSample(sample, source) {
  const errors = [];
  const path = safeRelativePath(source.path) || source.path || 'sample';
  if (!sample || typeof sample !== 'object') errors.push(`${path} must be object`);
  if (sample.diagnosisVersion !== SAMPLE_SCHEMA_VERSION) {
    errors.push(`${path}.diagnosisVersion must be ${SAMPLE_SCHEMA_VERSION}`);
  }
  if (!['dry_run', 'ok', 'ok_no_oil_terms_observed', 'source_unavailable'].includes(sample.status)) {
    errors.push(`${path}.status invalid: ${sample.status}`);
  }
  if (sample.promotionEligible !== false) errors.push(`${path}.promotionEligible must be false`);
  if (sample.productionDisplayApproved !== false) errors.push(`${path}.productionDisplayApproved must be false`);
  assertProductionImpactFalse(sample, errors, path);
  const serialized = JSON.stringify(sample);
  for (const forbidden of ['"url":', '"finalUrl":', '"requestUrl":', 'https://', 'http://', 'rawResponse', 'rawProviderResponse', 'bodyText', 'articleTitle', 'newsUrl']) {
    if (serialized.includes(forbidden)) errors.push(`${path} contains forbidden marker ${forbidden}`);
  }
  if (sample.status !== 'dry_run' && (!sample.summary || typeof sample.summary !== 'object')) {
    errors.push(`${path}.summary missing for non-dry-run sample`);
  }
  return errors;
}

function normalizeSample(sample, source) {
  const errors = validateSample(sample, source);
  const summary = sample.summary || {};
  const discovery = sample.discovery || {};
  const selectedFile = sample.selectedFile || {};
  const terms = Array.isArray(summary.terms) ? summary.terms : [];
  return {
    valid: errors.length === 0,
    errors,
    source: {
      type: source.type,
      path: source.path ? safeRelativePath(source.path) || source.path : null
    },
    generatedAt: sample.generatedAt || null,
    status: sample.status,
    mode: sample.mode || null,
    selectedTimestamp: selectedFile.timestamp || discovery.selectedTimestamp || null,
    discoveryFound: discovery.found === true || Boolean(selectedFile.timestamp),
    discoveryAttemptedCount: finiteNumber(discovery.attemptedCount, Array.isArray(sample.attempts) ? sample.attempts.length : 0),
    discoveryCandidateCount: finiteNumber(discovery.candidateCount, sample.input?.candidateTimestamps?.length || 0),
    contentLength: finiteNumber(selectedFile.contentLength ?? discovery.contentLength, null),
    parsedLineCount: finiteNumber(summary.parsedLineCount, null),
    totalHitCount: finiteNumber(summary.totalHitCount, 0),
    totalMentionCount: finiteNumber(summary.totalMentionCount, 0),
    uniqueDocCount: finiteNumber(summary.uniqueDocCount, 0),
    bucketCounts: BUCKETS.reduce((acc, bucket) => {
      acc[bucket] = finiteNumber(summary.bucketCounts?.[bucket], 0);
      return acc;
    }, {}),
    terms: terms.map((term) => ({
      termId: String(term.termId || ''),
      labelZh: String(term.labelZh || ''),
      hitCount: finiteNumber(term.hitCount, 0),
      totalCount: finiteNumber(term.totalCount, 0),
      uniqueDocCount: finiteNumber(term.uniqueDocCount, 0),
      buckets: Array.isArray(term.buckets) ? term.buckets.filter(Boolean).sort() : []
    })).filter((term) => term.termId)
  };
}

function loadSamples(options) {
  const files = expandInputFiles(options);
  const samples = [];
  for (const file of files) {
    const raw = readInputFile(file);
    let parsed = null;
    try {
      parsed = JSON.parse(raw.text);
    } catch (error) {
      samples.push({
        valid: false,
        errors: [`${safeRelativePath(file) || file} JSON parse failed: ${error.message}`],
        source: raw.source
      });
      continue;
    }
    samples.push(normalizeSample(parsed, raw.source));
  }
  return samples.slice(0, options.maxSamples);
}

function aggregateTerms(samples) {
  const byTerm = new Map();
  for (const sample of samples) {
    for (const term of sample.terms || []) {
      const current = byTerm.get(term.termId) || {
        termId: term.termId,
        labelZh: term.labelZh,
        samplesWithHits: 0,
        totalHitCount: 0,
        totalMentionCount: 0,
        totalUniqueDocCount: 0,
        buckets: new Set()
      };
      if (term.hitCount > 0) current.samplesWithHits += 1;
      current.totalHitCount += term.hitCount;
      current.totalMentionCount += term.totalCount;
      current.totalUniqueDocCount += term.uniqueDocCount;
      for (const bucket of term.buckets) current.buckets.add(bucket);
      byTerm.set(term.termId, current);
    }
  }
  return [...byTerm.values()].map((term) => ({
    termId: term.termId,
    labelZh: term.labelZh,
    samplesWithHits: term.samplesWithHits,
    totalHitCount: term.totalHitCount,
    totalMentionCount: term.totalMentionCount,
    totalUniqueDocCount: term.totalUniqueDocCount,
    buckets: [...term.buckets].sort()
  })).sort((a, b) => b.totalMentionCount - a.totalMentionCount || a.termId.localeCompare(b.termId));
}

function buildReview(samples, options) {
  const validSamples = samples.filter((sample) => sample.valid);
  const usableSamples = validSamples.filter((sample) => ['ok', 'ok_no_oil_terms_observed'].includes(sample.status) && sample.discoveryFound);
  const liveHitSamples = usableSamples.filter((sample) => sample.totalHitCount > 0);
  const warnings = [];
  const blockers = [];
  for (const sample of samples) {
    if (!sample.valid) blockers.push(...sample.errors);
  }
  if (!validSamples.length) {
    if (!options.allowEmpty) blockers.push('No valid GDELT Web NGrams diagnosis samples were available.');
  } else if (usableSamples.length < options.minSamples) {
    warnings.push(`Need at least ${options.minSamples} usable Web NGrams samples before stability review; found ${usableSamples.length}.`);
  }
  const sourceUnavailableCount = validSamples.filter((sample) => sample.status === 'source_unavailable').length;
  if (sourceUnavailableCount > 0) {
    warnings.push(`${sourceUnavailableCount} sample(s) could not discover a Web NGrams file; keep this path manual-only.`);
  }
  if (usableSamples.length >= options.minSamples && liveHitSamples.length < options.minSamples) {
    warnings.push('Usable samples exist but too few contain oil-news term hits; collect more before display-only fallback review.');
  }

  const status = blockers.length ? 'fail' : warnings.length ? 'warn' : usableSamples.length >= options.minSamples ? 'pass' : 'warn';
  const recommendation = blockers.length
    ? 'fix_or_replace_invalid_web_ngrams_samples'
    : usableSamples.length < options.minSamples
      ? 'collect_more_web_ngrams_samples'
      : warnings.length
        ? 'continue_manual_sampling_before_display_only_fallback'
        : 'ready_for_manual_web_ngrams_stability_review';

  const hitCounts = usableSamples.map((sample) => sample.totalHitCount);
  const docCounts = usableSamples.map((sample) => sample.uniqueDocCount);
  const probeCounts = usableSamples.map((sample) => sample.discoveryAttemptedCount);
  const bucketSummary = {};
  for (const bucket of BUCKETS) {
    const values = usableSamples.map((sample) => sample.bucketCounts[bucket]);
    bucketSummary[bucket] = {
      sampleHitCount: values.filter((value) => value > 0).length,
      totalCount: values.reduce((sum, value) => sum + value, 0),
      average: round(average(values), 2),
      range: range(values)
    };
  }

  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    recommendation,
    sampleSchemaVersion: SAMPLE_SCHEMA_VERSION,
    sampleCount: samples.length,
    validSampleCount: validSamples.length,
    usableSampleCount: usableSamples.length,
    liveHitSampleCount: liveHitSamples.length,
    sourceUnavailableCount,
    readiness: {
      state: recommendation,
      minimumSamplesRequired: options.minSamples,
      readyForProductionDisplayFallback: false,
      readyForScoring: false,
      reasonZh: usableSamples.length >= options.minSamples && !warnings.length && !blockers.length
        ? '样本数量足够进入人工稳定性复核,但仍不是生产展示或入分授权。'
        : '样本数量或可用性仍需继续累计,不得升级生产展示或入分。'
    },
    stability: {
      selectedTimestamps: [...new Set(usableSamples.map((sample) => sample.selectedTimestamp).filter(Boolean))],
      hitCountRange: range(hitCounts),
      uniqueDocCountRange: range(docCounts),
      averageHitCount: round(average(hitCounts), 2),
      averageUniqueDocCount: round(average(docCounts), 2),
      averageDiscoveryProbeCount: round(average(probeCounts), 2),
      bucketSummary,
      termSummary: aggregateTerms(usableSamples)
    },
    sampleOutcomes: validSamples.map((sample) => ({
      source: sample.source,
      generatedAt: sample.generatedAt,
      status: sample.status,
      selectedTimestamp: sample.selectedTimestamp,
      discoveryFound: sample.discoveryFound,
      discoveryAttemptedCount: sample.discoveryAttemptedCount,
      totalHitCount: sample.totalHitCount,
      totalMentionCount: sample.totalMentionCount,
      uniqueDocCount: sample.uniqueDocCount,
      bucketCounts: sample.bucketCounts
    })),
    warnings,
    blockers,
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    boundary: BOUNDARY
  };
}

function writeJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

function shouldExitNonZero(review, options) {
  return review.status === 'fail' || (options.strict && review.status !== 'pass');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const samples = loadSamples(options);
  const review = buildReview(samples, options);
  if (options.writeOutput) {
    review.outputPath = writeJson(options.output, review);
  }
  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    console.log(`GDELT Web NGrams samples review: ${review.status.toUpperCase()}`);
    console.log(`recommendation: ${review.recommendation}`);
    console.log(`sampleCount: ${review.sampleCount}`);
    console.log(`usableSampleCount: ${review.usableSampleCount}`);
    console.log(`liveHitSampleCount: ${review.liveHitSampleCount}`);
    console.log(`warnings: ${review.warnings.length}`);
    console.log(`blockers: ${review.blockers.length}`);
    if (review.outputPath) console.log(`outputPath: ${safeRelativePath(review.outputPath) || review.outputPath}`);
  }
  if (shouldExitNonZero(review, options)) process.exitCode = 1;
}

main();
