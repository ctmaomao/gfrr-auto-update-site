#!/usr/bin/env node
import { isManualArtifactPath } from '../lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const ARCHIVE_VERSION = 'oil-thermal-watch-history-sample-archive-p27';
const WATCH_PATH = 'data/oil-thermal-watch.json';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-thermal/watch-samples';
const DEFAULT_MAX_COMMITS = 40;
const DEFAULT_MAX_SAMPLES = 8;
const BOUNDARY =
  'manual git-history oil thermal watch sample archive only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run archive:oil-thermal-watch-history-samples -- [options]

Options:
  --output-dir <path>  Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --max-commits <n>    Most recent git commits touching ${WATCH_PATH} to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>    Maximum unique valid samples to archive. Default: ${DEFAULT_MAX_SAMPLES}
  --overwrite          Allow overwriting existing sample and sidecar files.
  --allow-empty        Exit 0 if git history has no valid watch sample.
  --dry-run            Validate and report target paths without writing files.
  --json               Print full JSON result instead of compact summary.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    overwrite: false,
    allowEmpty: false,
    dryRun: false,
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
    } else if (arg === '--max-commits') {
      options.maxCommits = Number(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
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
  if (!isManualArtifactPath(options.outputDir)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.outputDir}`);
  }

  return options;
}

function isoOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function archiveTimestamp(generatedAt) {
  return generatedAt.replace(/[:.]/g, '-');
}

function contentHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Failed to run git ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || `exit ${result.status}`}`);
  }

  return String(result.stdout ?? '');
}

function readCommitRows(maxCommits) {
  const output = runGit([
    'log',
    `--max-count=${maxCommits}`,
    '--format=%H%x09%ct',
    '--',
    WATCH_PATH
  ]);

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText] = line.split('\t');
      if (!/^[a-f0-9]{40}$/i.test(hash)) {
        throw new Error(`Unexpected git hash in log output: ${line}`);
      }
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null
      };
    });
}

function readWatchAtCommit(hash) {
  return runGit(['show', `${hash}:${WATCH_PATH}`]);
}

function validateWatchText(text, sourceLabel) {
  if (text.includes('firms.modaps.eosdis.nasa.gov/api/area/csv/')) {
    throw new Error(`${sourceLabel} contains a raw FIRMS Area API URL; archive only sanitized watch artifacts.`);
  }

  const artifact = JSON.parse(text);
  if (artifact.schemaVersion !== 'oil-thermal-watch-1') {
    throw new Error(`${sourceLabel} has unsupported schemaVersion: ${artifact.schemaVersion ?? '(missing)'}`);
  }
  if (artifact.module !== 'oil-thermal-watch') {
    throw new Error(`${sourceLabel} has unsupported module: ${artifact.module ?? '(missing)'}`);
  }
  const generatedAt = isoOrNull(artifact.generatedAt);
  if (!generatedAt) {
    throw new Error(`${sourceLabel} has invalid or missing generatedAt.`);
  }
  if (!Array.isArray(artifact.facilities)) {
    throw new Error(`${sourceLabel} is missing facilities[].`);
  }
  if (artifact.facilities.length === 0) {
    throw new Error(`${sourceLabel} has no facility rows; history archive only stores baseline-usable watch samples.`);
  }
  const productionImpact = isPlainObject(artifact.productionImpact) ? artifact.productionImpact : null;
  if (!productionImpact) {
    throw new Error(`${sourceLabel} is missing productionImpact map.`);
  }
  const truthyImpact = Object.entries(productionImpact)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (truthyImpact.length > 0) {
    throw new Error(`${sourceLabel} has productionImpact=true fields: ${truthyImpact.join(', ')}`);
  }

  return {
    artifact,
    generatedAt,
    contentHash: contentHash(text)
  };
}

function createTargetPaths(outputDir, generatedAt) {
  const fileBase = archiveTimestamp(generatedAt);
  return {
    samplePath: resolve(outputDir, `${fileBase}.json`),
    sidecarPath: resolve(outputDir, `${fileBase}.archive-meta.json`)
  };
}

function createSampleSummary(artifact) {
  return {
    status: artifact.status ?? null,
    signalState: artifact.signalState ?? null,
    sourceStatus: artifact.sourceStatus ?? null,
    baselineStatus: artifact.aggregate?.baselineStatus ?? artifact.baseline?.status ?? null,
    facilityCount: Array.isArray(artifact.facilities) ? artifact.facilities.length : 0,
    rowCount: artifact.aggregate?.rowCount ?? null,
    latestAcqAt: artifact.aggregate?.latestAcqAt ?? artifact.freshness?.latestAcqAt ?? null,
    repeatedObservationCount: artifact.aggregate?.repeatedObservationCount ?? null,
    elevatedRepeatedObservationCount: artifact.aggregate?.elevatedRepeatedObservationCount ?? null
  };
}

function createSidecar(options, commit, targetPaths, validation) {
  const artifact = validation.artifact;
  return {
    archiveVersion: ARCHIVE_VERSION,
    archivedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    input: {
      gitPath: WATCH_PATH,
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      schemaVersion: artifact.schemaVersion,
      module: artifact.module,
      generatedAt: validation.generatedAt,
      contentHash: validation.contentHash
    },
    output: {
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      overwrite: options.overwrite
    },
    sampleSummary: createSampleSummary(artifact),
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
    nextCommand: `npm run review:oil-thermal-baseline-samples -- --input-dir ${options.outputDir.replace(/\\/g, '/')}`,
    boundary: BOUNDARY
  };
}

function writeSample(options, targetPaths, text, sidecar) {
  if (options.dryRun) {
    return;
  }
  mkdirSync(dirname(targetPaths.samplePath), { recursive: true });
  writeFileSync(targetPaths.samplePath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  writeFileSync(targetPaths.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
}

function archiveHistorySamples(options) {
  const commits = readCommitRows(options.maxCommits);
  const seenGeneratedAt = new Set();
  const seenContentHashes = new Set();
  const result = {
    archiveVersion: ARCHIVE_VERSION,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    status: 'ok',
    mode: 'git_history',
    input: {
      gitPath: WATCH_PATH,
      commitsInspected: commits.length,
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples
    },
    output: {
      outputDir: resolve(options.outputDir),
      overwrite: options.overwrite
    },
    summary: {
      validUniqueSamples: 0,
      archived: 0,
      alreadyArchived: 0,
      dryRunWouldArchive: 0,
      skippedDuplicateGeneratedAt: 0,
      skippedDuplicateContent: 0,
      invalidCommits: 0,
      writeConflicts: 0
    },
    samples: [],
    invalid: [],
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
    nextCommand: `npm run review:oil-thermal-baseline-samples -- --input-dir ${options.outputDir.replace(/\\/g, '/')}`,
    boundary: BOUNDARY
  };

  for (const commit of commits) {
    if (result.summary.validUniqueSamples >= options.maxSamples) {
      break;
    }

    let text;
    try {
      text = readWatchAtCommit(commit.hash);
    } catch (error) {
      result.summary.invalidCommits += 1;
      result.invalid.push({
        commitHash: commit.hash,
        committedAt: commit.committedAt,
        reason: error.message
      });
      continue;
    }

    let validation;
    try {
      validation = validateWatchText(text, `${commit.hash}:${WATCH_PATH}`);
    } catch (error) {
      result.summary.invalidCommits += 1;
      result.invalid.push({
        commitHash: commit.hash,
        committedAt: commit.committedAt,
        reason: error.message
      });
      continue;
    }

    if (seenGeneratedAt.has(validation.generatedAt)) {
      result.summary.skippedDuplicateGeneratedAt += 1;
      continue;
    }
    seenGeneratedAt.add(validation.generatedAt);

    if (seenContentHashes.has(validation.contentHash)) {
      result.summary.skippedDuplicateContent += 1;
      continue;
    }
    seenContentHashes.add(validation.contentHash);
    result.summary.validUniqueSamples += 1;

    const targetPaths = createTargetPaths(options.outputDir, validation.generatedAt);
    const sidecar = createSidecar(options, commit, targetPaths, validation);
    const sample = {
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      generatedAt: validation.generatedAt,
      contentHash: validation.contentHash,
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      sampleSummary: sidecar.sampleSummary,
      archiveStatus: 'archived'
    };

    const targetsExist = existsSync(targetPaths.samplePath) || existsSync(targetPaths.sidecarPath);
    if (targetsExist && !options.overwrite) {
      sample.archiveStatus = 'already_archived';
      result.summary.alreadyArchived += 1;
      result.samples.push(sample);
      continue;
    }
    if (targetsExist && options.overwrite) {
      result.summary.writeConflicts += 1;
    }

    writeSample(options, targetPaths, text, sidecar);
    if (options.dryRun) {
      sample.archiveStatus = 'dry_run_would_archive';
      result.summary.dryRunWouldArchive += 1;
    } else {
      result.summary.archived += 1;
    }
    result.samples.push(sample);
  }

  if (result.summary.validUniqueSamples === 0) {
    result.status = options.allowEmpty ? 'warn' : 'fail';
    result.warning = 'No valid unique oil thermal watch samples were found in git history.';
  } else if (result.summary.archived === 0 && result.summary.dryRunWouldArchive === 0) {
    result.status = 'warn';
    result.warning = 'Valid samples were found, but all were already archived.';
  }

  return result;
}

function printSummary(result) {
  console.log(`Oil thermal watch git-history sample archive: ${result.status.toUpperCase()}`);
  console.log(`commitsInspected: ${result.input.commitsInspected}`);
  console.log(`validUniqueSamples: ${result.summary.validUniqueSamples}`);
  console.log(`archived: ${result.summary.archived}`);
  console.log(`alreadyArchived: ${result.summary.alreadyArchived}`);
  console.log(`dryRunWouldArchive: ${result.summary.dryRunWouldArchive}`);
  console.log(`invalidCommits: ${result.summary.invalidCommits}`);
  console.log(`outputDir: ${result.output.outputDir}`);
  console.log(`nextCommand: ${result.nextCommand}`);
  if (result.warning) {
    console.log(`warning: ${result.warning}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = archiveHistorySamples(options);

  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }

  if (result.status === 'fail') {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
