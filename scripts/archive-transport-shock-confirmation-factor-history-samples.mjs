#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const ARCHIVE_VERSION = 'transport-shock-confirmation-factor-history-sample-archive-p10';
const RADAR_PATH = 'data/radar-data.json';
const CONTRACT_VERSION = 'transport-shock-candidate-v1';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/transport-shock-confirmation-factor/history-samples';
const DEFAULT_MAX_COMMITS = 80;
const DEFAULT_MAX_SAMPLES = 12;
const BOUNDARY =
  'manual git-history Transport Shock Confirmation Factor candidate sample archive only; writes ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run archive:transport-shock-confirmation-factor-history-samples -- [options]

Options:
  --output-dir <path>  Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --max-commits <n>    Most recent git commits touching ${RADAR_PATH} to inspect. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>    Maximum unique valid samples to archive. Default: ${DEFAULT_MAX_SAMPLES}
  --overwrite          Allow overwriting existing sample and sidecar files.
  --allow-empty        Exit 0 if git history has no candidate sample yet.
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
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function archiveTimestamp(value) {
  return value.replace(/[:.]/g, '-');
}

function contentHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortJson(value[key]);
      return acc;
    }, {});
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.error) throw new Error(`Failed to run git ${args.join(' ')}: ${result.error.message}`);
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
    RADAR_PATH
  ]);

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText] = line.split('\t');
      if (!/^[a-f0-9]{40}$/i.test(hash)) throw new Error(`Unexpected git hash in log output: ${line}`);
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null
      };
    });
}

function readRadarAtCommit(hash) {
  return runGit(['show', `${hash}:${RADAR_PATH}`]);
}

function hasValidBoundaryFlags(candidate) {
  const boundaries = candidate?.boundaries;
  if (!isPlainObject(boundaries)) return false;
  const runtimeScoringBoundaryKeys = new Set([
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance'
  ]);
  return [
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsWorldOrderWeights',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ].every((key) => {
    if (candidate.eligibleForMainScore === true && runtimeScoringBoundaryKeys.has(key)) {
      return boundaries[key] === true;
    }
    return boundaries[key] === false;
  });
}

function validateCandidate(candidate, sourceLabel, sourceStatus) {
  if (!isPlainObject(candidate)) throw new Error(`${sourceLabel} candidate is not an object.`);
  if (candidate.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`${sourceLabel} candidate contractVersion mismatch: ${candidate.contractVersion ?? '(missing)'}`);
  }
  if (!['unavailable', 'normal', 'watch', 'elevated_watch'].includes(candidate.status)) {
    throw new Error(`${sourceLabel} candidate has unsupported status: ${candidate.status ?? '(missing)'}`);
  }
  if (!isFiniteNumberOrNull(candidate.score)) {
    throw new Error(`${sourceLabel} candidate score must be finite number or null.`);
  }
  if (Number.isFinite(candidate.score) && (candidate.score < 0 || candidate.score > 100)) {
    throw new Error(`${sourceLabel} candidate score must be within 0..100.`);
  }
  if (!['none', 'low'].includes(candidate.confidence)) {
    throw new Error(`${sourceLabel} candidate confidence must be none/low.`);
  }
  if (candidate.candidateOnly !== true) throw new Error(`${sourceLabel} candidateOnly must be true.`);
  if (candidate.auditOnly !== true) throw new Error(`${sourceLabel} auditOnly must be true.`);
  if (typeof candidate.eligibleForMainScore !== 'boolean') throw new Error(`${sourceLabel} eligibleForMainScore must be boolean.`);
  if (candidate.eligibleForMainScore === true) {
    if (sourceStatus !== 'live') throw new Error(`${sourceLabel} eligibleForMainScore requires live source.`);
    if (!['watch', 'elevated_watch'].includes(candidate.status)) {
      throw new Error(`${sourceLabel} eligibleForMainScore requires watch/elevated_watch status.`);
    }
    if (!Number.isFinite(candidate.score) || candidate.score < 50) {
      throw new Error(`${sourceLabel} eligibleForMainScore requires score >= 50.`);
    }
  }
  if (candidate.routeFreightConfirmation !== 'not_connected') {
    throw new Error(`${sourceLabel} routeFreightConfirmation must stay not_connected.`);
  }
  if (candidate.marketConfirmation !== 'not_connected') {
    throw new Error(`${sourceLabel} marketConfirmation must stay not_connected.`);
  }
  if (!isPlainObject(candidate.evidence)) throw new Error(`${sourceLabel} evidence must be an object.`);
  if (!Array.isArray(candidate.drivers)) throw new Error(`${sourceLabel} drivers must be an array.`);
  if (!Array.isArray(candidate.reasons) || candidate.reasons.length === 0) {
    throw new Error(`${sourceLabel} reasons must be a non-empty array.`);
  }
  if (!hasValidBoundaryFlags(candidate)) throw new Error(`${sourceLabel} boundary flags must all be false.`);
}

function createSample(radar, commit, sourceLabel) {
  const energyTransport = radar?.macroDrivers?.energyTransport;
  if (!isPlainObject(energyTransport)) throw new Error(`${sourceLabel} missing macroDrivers.energyTransport.`);
  if (energyTransport.transportShockCandidate === undefined) return null;
  const candidate = energyTransport.transportShockCandidate;
  validateCandidate(candidate, sourceLabel, energyTransport.sourceStatus?.chokepoints);
  const payloadUpdatedAt =
    isoOrNull(radar.updatedAt) ||
    isoOrNull(energyTransport.fetchedAt) ||
    commit.committedAt ||
    new Date(0).toISOString();
  const sample = {
    schemaVersion: 'transport-shock-confirmation-factor-history-sample-1',
    archivedFrom: RADAR_PATH,
    payloadUpdatedAt,
    releaseVersion: radar.releaseVersion ?? null,
    energyTransport: {
      source: energyTransport.source ?? null,
      sourceStatus: energyTransport.sourceStatus ?? null,
      usageTermsPinned: energyTransport.usageTermsPinned ?? null,
      redistributionCaveat: energyTransport.redistributionCaveat === true,
      latestDate: energyTransport.latestDate ?? null,
      latestAgeDays: energyTransport.latestAgeDays ?? null,
      fetchedAt: energyTransport.fetchedAt ?? null
    },
    transportShockCandidate: candidate,
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
  return {
    sample,
    sampleKey: `${payloadUpdatedAt}:${energyTransport.latestDate ?? 'none'}:${candidate.status}:${candidate.score ?? 'null'}`,
    contentHash: contentHash(stableStringify(sample))
  };
}

function createTargetPaths(outputDir, payloadUpdatedAt, hash) {
  const fileBase = `${archiveTimestamp(payloadUpdatedAt)}-${hash.slice(0, 12)}`;
  return {
    samplePath: resolve(outputDir, `${fileBase}.json`),
    sidecarPath: resolve(outputDir, `${fileBase}.archive-meta.json`)
  };
}

function createSidecar(options, commit, targetPaths, validation) {
  const candidate = validation.sample.transportShockCandidate;
  return {
    archiveVersion: ARCHIVE_VERSION,
    archivedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    input: {
      gitPath: RADAR_PATH,
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      payloadUpdatedAt: validation.sample.payloadUpdatedAt,
      contentHash: validation.contentHash
    },
    output: {
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      overwrite: options.overwrite
    },
    sampleSummary: {
      sourceStatus: validation.sample.energyTransport.sourceStatus,
      latestDate: validation.sample.energyTransport.latestDate,
      latestAgeDays: validation.sample.energyTransport.latestAgeDays,
      candidateStatus: candidate.status,
      candidateScore: candidate.score,
      candidateConfidence: candidate.confidence,
      driverCount: Array.isArray(candidate.drivers) ? candidate.drivers.length : 0,
      reasonCount: Array.isArray(candidate.reasons) ? candidate.reasons.length : 0
    },
    productionImpact: validation.sample.productionImpact,
    boundary: BOUNDARY
  };
}

function writeSample(options, targetPaths, validation, sidecar) {
  if (options.dryRun) return;
  mkdirSync(dirname(targetPaths.samplePath), { recursive: true });
  writeFileSync(targetPaths.samplePath, `${JSON.stringify(validation.sample, null, 2)}\n`, 'utf8');
  writeFileSync(targetPaths.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
}

function archiveHistorySamples(options) {
  const commits = readCommitRows(options.maxCommits);
  const seenSampleKeys = new Set();
  const seenContentHashes = new Set();
  const result = {
    archiveVersion: ARCHIVE_VERSION,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    status: 'ok',
    mode: 'git_history',
    input: {
      gitPath: RADAR_PATH,
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
      skippedMissingCandidate: 0,
      skippedDuplicateSampleKey: 0,
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
    nextCommand: `npm run archive:transport-shock-confirmation-factor-history-samples -- --allow-empty`,
    boundary: BOUNDARY
  };

  for (const commit of commits) {
    if (result.summary.validUniqueSamples >= options.maxSamples) break;
    let text;
    try {
      text = readRadarAtCommit(commit.hash);
    } catch (error) {
      result.summary.invalidCommits += 1;
      result.invalid.push({ commitHash: commit.hash, committedAt: commit.committedAt, reason: error.message });
      continue;
    }

    let validation;
    try {
      const radar = JSON.parse(text);
      validation = createSample(radar, commit, `${commit.hash}:${RADAR_PATH}`);
      if (!validation) {
        result.summary.skippedMissingCandidate += 1;
        continue;
      }
    } catch (error) {
      result.summary.invalidCommits += 1;
      result.invalid.push({ commitHash: commit.hash, committedAt: commit.committedAt, reason: error.message });
      continue;
    }

    if (seenSampleKeys.has(validation.sampleKey)) {
      result.summary.skippedDuplicateSampleKey += 1;
      continue;
    }
    seenSampleKeys.add(validation.sampleKey);
    if (seenContentHashes.has(validation.contentHash)) {
      result.summary.skippedDuplicateContent += 1;
      continue;
    }
    seenContentHashes.add(validation.contentHash);
    result.summary.validUniqueSamples += 1;

    const targetPaths = createTargetPaths(
      options.outputDir,
      validation.sample.payloadUpdatedAt,
      validation.contentHash
    );
    const sidecar = createSidecar(options, commit, targetPaths, validation);
    const sample = {
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      payloadUpdatedAt: validation.sample.payloadUpdatedAt,
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
    if (targetsExist && options.overwrite) result.summary.writeConflicts += 1;

    writeSample(options, targetPaths, validation, sidecar);
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
    result.warning = 'No valid Transport Shock candidate samples were found in git history yet.';
  } else if (result.summary.archived === 0 && result.summary.dryRunWouldArchive === 0) {
    result.status = 'warn';
    result.warning = 'Valid Transport Shock candidate samples were found, but all were already archived.';
  }

  return result;
}

function printSummary(result) {
  console.log(`Transport Shock candidate git-history sample archive: ${result.status.toUpperCase()}`);
  console.log(`commitsInspected: ${result.input.commitsInspected}`);
  console.log(`validUniqueSamples: ${result.summary.validUniqueSamples}`);
  console.log(`skippedMissingCandidate: ${result.summary.skippedMissingCandidate}`);
  console.log(`archived: ${result.summary.archived}`);
  console.log(`alreadyArchived: ${result.summary.alreadyArchived}`);
  console.log(`dryRunWouldArchive: ${result.summary.dryRunWouldArchive}`);
  console.log(`invalidCommits: ${result.summary.invalidCommits}`);
  console.log(`outputDir: ${result.output.outputDir}`);
  console.log(`nextCommand: ${result.nextCommand}`);
  if (result.warning) console.log(`warning: ${result.warning}`);
  console.log(`boundary: ${result.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = archiveHistorySamples(options);
  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  if (result.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
