#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION,
  sanitizeGdeltWebNgramsArtifact,
  stringifySanitizedArtifact
} from './sanitize-gdelt-web-ngrams-artifacts.mjs';

const ARCHIVE_VERSION = 'gdelt-web-ngrams-sample-archive-p44';
const SAMPLE_SCHEMA_VERSION = 'gdelt-web-ngrams-diagnosis-p41';
const DEFAULT_INPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-news/gdelt-web-ngrams-samples';
const DEFAULT_REVIEW_OUTPUT = 'manual-artifacts/oil-news/gdelt-web-ngrams-samples-review-latest.json';
const REVIEW_SCRIPT = 'scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs';
const DEFAULT_MAX_SAMPLES = 20;
const DEFAULT_MIN_REVIEW_SAMPLES = 4;
const BOUNDARY =
  'manual GDELT Web NGrams sample archive only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run archive:gdelt-web-ngrams-samples -- [options]

Options:
  --input <path>              GDELT Web NGrams diagnosis artifact. May be repeated.
  --input-dir <path>          Directory of diagnosis JSON artifacts. May be repeated.
  --output-dir <path>         Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --label <slug>              Optional filename suffix for operator notes.
  --max-samples <n>           Maximum valid samples to archive/review. Default: ${DEFAULT_MAX_SAMPLES}
  --min-review-samples <n>    Minimum usable samples before stable review. Default: ${DEFAULT_MIN_REVIEW_SAMPLES}
  --overwrite                 Allow overwriting existing archived samples.
  --allow-empty               Exit 0 if no valid input sample exists.
  --dry-run                   Validate and report target paths without writing files.
  --skip-review               Archive samples without invoking the P43 reviewer.
  --no-review-output          Run review without writing its review artifact.
  --review-output <path>      Ignored manual review artifact path. Default: ${DEFAULT_REVIEW_OUTPUT}
  --json                      Print full JSON result instead of compact summary.
  --help                      Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    outputDir: DEFAULT_OUTPUT_DIR,
    label: null,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minReviewSamples: DEFAULT_MIN_REVIEW_SAMPLES,
    overwrite: false,
    allowEmpty: false,
    dryRun: false,
    skipReview: false,
    noReviewOutput: false,
    reviewOutput: DEFAULT_REVIEW_OUTPUT,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--overwrite') {
      options.overwrite = true;
      continue;
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--skip-review') {
      options.skipReview = true;
      continue;
    }
    if (arg === '--no-review-output') {
      options.noReviewOutput = true;
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

    if (arg === '--input') {
      options.inputs.push(nextValue());
    } else if (arg === '--input-dir') {
      options.inputDirs.push(nextValue());
    } else if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg === '--label') {
      options.label = normalizeLabel(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
    } else if (arg === '--min-review-samples') {
      options.minReviewSamples = Number(nextValue());
    } else if (arg === '--review-output') {
      options.reviewOutput = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 200) {
    throw new Error('Invalid --max-samples. Expected integer 1..200.');
  }
  if (!Number.isInteger(options.minReviewSamples) || options.minReviewSamples < 1 || options.minReviewSamples > 100) {
    throw new Error('Invalid --min-review-samples. Expected integer 1..100.');
  }
  if (!isManualArtifactPath(options.outputDir)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.outputDir}`);
  }
  if (!options.noReviewOutput && !isManualArtifactPath(options.reviewOutput)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.reviewOutput}`);
  }
  return options;
}

function normalizeLabel(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('Invalid --label. Use at least one ASCII letter or number.');
  if (normalized.length > 48) throw new Error('Invalid --label. Expected 48 characters or fewer.');
  return normalized;
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

function archiveTimestamp(generatedAt) {
  return generatedAt.replace(/[:.]/g, '-');
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
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
    if (!isSafeInputPath(inputDir)) throw new Error(`Refusing unsafe input directory: ${inputDir}`);
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  if (!files.length && existsSync(resolve(DEFAULT_INPUT))) files.push(DEFAULT_INPUT);
  return [...new Set(files)].slice(0, options.maxSamples);
}

function assertProductionImpactFalse(sample, errors, path) {
  const impact = sample.productionImpact || {};
  for (const key of [
    'affectsValues',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsOdpFinalBias',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ]) {
    if (impact[key] !== false) errors.push(`${path}.productionImpact.${key} must be false`);
  }
}

function validateDiagnosisArtifact(inputPath) {
  const absoluteInput = resolve(inputPath);
  if (!existsSync(absoluteInput)) throw new Error(`Input file does not exist: ${inputPath}`);
  if (!isSafeInputPath(inputPath)) throw new Error(`Refusing unsafe input path: ${inputPath}`);

  const text = readFileSync(absoluteInput, 'utf8');
  const originalParsed = JSON.parse(text);
  const sanitized = sanitizeGdeltWebNgramsArtifact(originalParsed);
  const parsed = sanitized.artifact;
  const sanitizedText = stringifySanitizedArtifact(parsed);
  const errors = [];
  const path = safeRelativePath(inputPath) || inputPath;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) errors.push(`${path} must be object`);
  if (parsed.diagnosisVersion !== SAMPLE_SCHEMA_VERSION) {
    errors.push(`${path}.diagnosisVersion must be ${SAMPLE_SCHEMA_VERSION}`);
  }
  if (!['dry_run', 'ok', 'ok_no_oil_terms_observed', 'source_unavailable'].includes(parsed.status)) {
    errors.push(`${path}.status invalid: ${parsed.status}`);
  }
  if (!isoOrNull(parsed.generatedAt)) errors.push(`${path}.generatedAt invalid or missing`);
  if (parsed.promotionEligible !== false) errors.push(`${path}.promotionEligible must be false`);
  if (parsed.productionDisplayApproved !== false) errors.push(`${path}.productionDisplayApproved must be false`);
  assertProductionImpactFalse(parsed, errors, path);

  const serialized = JSON.stringify(parsed);
  for (const forbidden of ['"url":', '"finalUrl":', '"requestUrl":', 'https://', 'http://', 'rawResponse', 'rawProviderResponse', 'bodyText', 'articleTitle', 'newsUrl']) {
    if (serialized.includes(forbidden)) errors.push(`${path} contains forbidden marker ${forbidden}`);
  }

  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.validationErrors = errors;
    throw error;
  }

  return {
    text: sanitizedText,
    artifact: parsed,
    sanitizer: {
      version: GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION,
      removedPathCount: sanitized.removedPaths.length,
      removedPaths: sanitized.removedPaths.slice(0, 20)
    },
    generatedAt: isoOrNull(parsed.generatedAt),
    contentHash: hashText(sanitizedText),
    sourcePath: absoluteInput
  };
}

function createTargetPaths(options, validation) {
  const selectedTimestamp = validation.artifact.selectedFile?.timestamp || validation.artifact.discovery?.selectedTimestamp || null;
  const timestampSuffix = selectedTimestamp ? `-${selectedTimestamp}` : '';
  const labelSuffix = options.label ? `-${options.label}` : '';
  const fileBase = `${archiveTimestamp(validation.generatedAt)}${timestampSuffix}${labelSuffix}`;
  return {
    samplePath: resolve(options.outputDir, `${fileBase}.json`),
    sidecarPath: resolve(options.outputDir, `${fileBase}.archive-meta.json`)
  };
}

function createSampleSummary(artifact) {
  return {
    status: artifact.status ?? null,
    mode: artifact.mode ?? null,
    selectedTimestamp: artifact.selectedFile?.timestamp || artifact.discovery?.selectedTimestamp || null,
    discoveryFound: artifact.discovery?.found ?? Boolean(artifact.selectedFile?.timestamp),
    discoveryAttemptedCount: artifact.discovery?.attemptedCount ?? null,
    totalHitCount: artifact.summary?.totalHitCount ?? 0,
    totalMentionCount: artifact.summary?.totalMentionCount ?? 0,
    uniqueDocCount: artifact.summary?.uniqueDocCount ?? 0,
    bucketCounts: artifact.summary?.bucketCounts || {}
  };
}

function createSidecar(options, inputPath, targetPaths, validation) {
  const artifact = validation.artifact;
  return {
    archiveVersion: ARCHIVE_VERSION,
    archivedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    input: {
      path: resolve(inputPath),
      basename: basename(inputPath),
      diagnosisVersion: artifact.diagnosisVersion,
      generatedAt: validation.generatedAt,
      contentHash: validation.contentHash,
      safeInputPath: true
    },
    output: {
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      overwrite: options.overwrite
    },
    sampleSummary: createSampleSummary(artifact),
    sanitizer: validation.sanitizer,
    productionImpact: productionImpactFalseMap(),
    nextCommand: `npm run review:gdelt-web-ngrams-samples -- --input-dir ${options.outputDir.replace(/\\/g, '/')} --min-samples ${options.minReviewSamples}`,
    boundary: BOUNDARY
  };
}

function writeArchive(options, validation, targetPaths, sidecar) {
  if (options.dryRun) return;
  mkdirSync(dirname(targetPaths.samplePath), { recursive: true });
  writeFileSync(targetPaths.samplePath, validation.text, 'utf8');
  writeFileSync(targetPaths.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
}

function runReview(options, archivedSamplePaths) {
  if (options.skipReview) return null;
  const args = [
    REVIEW_SCRIPT,
    '--min-samples',
    String(options.minReviewSamples),
    '--max-samples',
    String(options.maxSamples)
  ];

  if (options.dryRun) {
    for (const samplePath of archivedSamplePaths) args.push('--input', samplePath);
  } else {
    args.push('--input-dir', options.outputDir);
  }

  if (options.noReviewOutput) {
    args.push('--no-output');
  } else {
    args.push('--output', options.reviewOutput);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    command: `${process.execPath} ${args.join(' ')}`,
    exitCode: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    ok: result.status === 0
  };
}

function deriveReadiness(result) {
  if (result.summary.validUniqueSamples < result.review.minimumSamplesRequired) {
    return {
      state: 'insufficient_samples',
      reasonZh: 'Web NGrams 样本数量不足,继续累计后再做稳定性复核。'
    };
  }
  if (!result.review.ok) {
    return {
      state: 'unstable_keep_manual_only',
      reasonZh: '样本归档已完成,但 P43 reviewer 仍未通过,继续保持 manual-only。'
    };
  }
  return {
    state: 'stable_manual_review_ready',
    reasonZh: '样本数量达到本地稳定性复核门槛,但仍不批准生产展示、入分或前端接线。'
  };
}

function archiveSamples(options) {
  const inputFiles = expandInputFiles(options);
  const seenHashes = new Set();
  const result = {
    archiveVersion: ARCHIVE_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'ok',
    mode: 'manual_sample_archive',
    dryRun: options.dryRun,
    input: {
      files: inputFiles.map((file) => safeRelativePath(file) || file),
      maxSamples: options.maxSamples
    },
    output: {
      outputDir: resolve(options.outputDir),
      reviewOutput: options.noReviewOutput ? null : resolve(options.reviewOutput),
      overwrite: options.overwrite
    },
    summary: {
      validUniqueSamples: 0,
      archived: 0,
      dryRunWouldArchive: 0,
      alreadyArchived: 0,
      skippedDuplicateContent: 0,
      invalidSamples: 0
    },
    samples: [],
    invalid: [],
    review: {
      skipped: options.skipReview,
      minimumSamplesRequired: options.minReviewSamples,
      ok: false,
      exitCode: null,
      stdout: null,
      stderr: null
    },
    readiness: {
      state: 'insufficient_samples',
      reasonZh: '尚未完成样本归档。'
    },
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    productionDisplayApproved: false,
    boundary: BOUNDARY
  };

  for (const inputPath of inputFiles) {
    let validation;
    try {
      validation = validateDiagnosisArtifact(inputPath);
    } catch (error) {
      result.summary.invalidSamples += 1;
      result.invalid.push({
        inputPath: safeRelativePath(inputPath) || inputPath,
        reason: error.validationErrors || [error.message]
      });
      continue;
    }

    if (seenHashes.has(validation.contentHash)) {
      result.summary.skippedDuplicateContent += 1;
      continue;
    }
    seenHashes.add(validation.contentHash);
    result.summary.validUniqueSamples += 1;

    const targetPaths = createTargetPaths(options, validation);
    const sidecar = createSidecar(options, inputPath, targetPaths, validation);
    const targetsExist = existsSync(targetPaths.samplePath) || existsSync(targetPaths.sidecarPath);
    const sample = {
      inputPath: safeRelativePath(inputPath) || inputPath,
      generatedAt: validation.generatedAt,
      contentHash: validation.contentHash,
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      sampleSummary: sidecar.sampleSummary,
      archiveStatus: 'archived'
    };

    if (targetsExist && !options.overwrite) {
      sample.archiveStatus = 'already_archived';
      result.summary.alreadyArchived += 1;
      result.samples.push(sample);
      continue;
    }

    writeArchive(options, validation, targetPaths, sidecar);
    if (options.dryRun) {
      sample.archiveStatus = 'dry_run_would_archive';
      result.summary.dryRunWouldArchive += 1;
    } else {
      result.summary.archived += 1;
    }
    result.samples.push(sample);
  }

  if (result.summary.validUniqueSamples === 0 && !options.allowEmpty) {
    result.status = 'fail';
    result.readiness = {
      state: 'insufficient_samples',
      reasonZh: '没有可归档的有效 Web NGrams diagnosis 样本。'
    };
    return result;
  }

  const reviewInputPaths = result.samples
    .filter((sample) => ['archived', 'already_archived', 'dry_run_would_archive'].includes(sample.archiveStatus))
    .map((sample) => options.dryRun ? sample.inputPath : sample.samplePath);
  const review = runReview(options, reviewInputPaths);
  if (review) {
    result.review = {
      skipped: false,
      minimumSamplesRequired: options.minReviewSamples,
      ok: review.ok,
      exitCode: review.exitCode,
      stdout: review.stdout,
      stderr: review.stderr
    };
  } else {
    result.review.ok = result.summary.validUniqueSamples >= options.minReviewSamples;
  }
  result.readiness = deriveReadiness(result);

  if (result.summary.invalidSamples > 0 || result.readiness.state !== 'stable_manual_review_ready') {
    result.status = result.status === 'fail' ? 'fail' : 'warn';
  }
  if (result.review.exitCode !== null && result.review.exitCode !== 0) {
    result.status = 'warn';
  }
  return result;
}

function printSummary(result) {
  const status = result.dryRun ? `${result.status.toUpperCase()} DRY_RUN` : result.status.toUpperCase();
  console.log(`GDELT Web NGrams sample archive: ${status}`);
  console.log(`validUniqueSamples: ${result.summary.validUniqueSamples}`);
  console.log(`archived: ${result.summary.archived}`);
  console.log(`alreadyArchived: ${result.summary.alreadyArchived}`);
  console.log(`dryRunWouldArchive: ${result.summary.dryRunWouldArchive}`);
  console.log(`invalidSamples: ${result.summary.invalidSamples}`);
  console.log(`readiness: ${result.readiness.state}`);
  if (!result.review.skipped) {
    console.log(`reviewExitCode: ${result.review.exitCode}`);
  }
  console.log(`outputDir: ${result.output.outputDir}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = archiveSamples(options);
  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  if (result.status === 'fail') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
