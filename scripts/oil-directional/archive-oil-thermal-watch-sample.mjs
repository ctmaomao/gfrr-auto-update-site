#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const ARCHIVE_VERSION = 'oil-thermal-watch-sample-archive-p26';
const DEFAULT_INPUT = 'data/oil-thermal-watch.json';
const DEFAULT_OUTPUT_DIR = 'manual-artifacts/oil-thermal/watch-samples';
const BOUNDARY =
  'manual oil thermal watch sample archive only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run archive:oil-thermal-watch-sample -- [options]

Options:
  --input <path>       Sanitized oil-thermal-watch artifact. Default: ${DEFAULT_INPUT}
  --output-dir <path>  Ignored sample archive directory. Default: ${DEFAULT_OUTPUT_DIR}
  --label <slug>       Optional filename suffix for operator notes.
  --overwrite          Allow overwriting the target sample and sidecar.
  --dry-run            Validate and report target paths without writing files.
  --json               Print full JSON result instead of compact summary.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    label: null,
    overwrite: false,
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

    if (arg === '--input') {
      options.input = nextValue();
    } else if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg === '--label') {
      options.label = normalizeLabel(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeLabel(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    throw new Error('Invalid --label. Use at least one ASCII letter or number.');
  }
  if (normalized.length > 48) {
    throw new Error('Invalid --label. Expected 48 characters or fewer.');
  }
  return normalized;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) {
    return null;
  }
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

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === DEFAULT_INPUT;
}

function isSafeInputPath(filePath) {
  return isProductionWatchPath(filePath) || isManualArtifactPath(filePath) || isFixturePath(filePath);
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

function validateWatchArtifact(inputPath) {
  const absoluteInput = resolve(inputPath);
  if (!existsSync(absoluteInput)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }
  if (!isSafeInputPath(inputPath)) {
    throw new Error(`Refusing unsafe input path outside data/manual-artifacts/docs/fixtures: ${inputPath}`);
  }

  const text = readFileSync(absoluteInput, 'utf8');
  if (text.includes('firms.modaps.eosdis.nasa.gov/api/area/csv/')) {
    throw new Error('Input contains a raw FIRMS Area API URL; archive only sanitized watch artifacts.');
  }

  const artifact = JSON.parse(text);
  if (artifact.schemaVersion !== 'oil-thermal-watch-1') {
    throw new Error(`Unsupported schemaVersion: ${artifact.schemaVersion ?? '(missing)'}`);
  }
  if (artifact.module !== 'oil-thermal-watch') {
    throw new Error(`Unsupported module: ${artifact.module ?? '(missing)'}`);
  }
  const generatedAt = isoOrNull(artifact.generatedAt);
  if (!generatedAt) {
    throw new Error('Invalid or missing generatedAt.');
  }
  if (!Array.isArray(artifact.facilities)) {
    throw new Error('Missing facilities[].');
  }
  const productionImpact = isPlainObject(artifact.productionImpact) ? artifact.productionImpact : null;
  if (!productionImpact) {
    throw new Error('Missing productionImpact map.');
  }
  const truthyImpact = Object.entries(productionImpact)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (truthyImpact.length > 0) {
    throw new Error(`Refusing artifact with productionImpact=true fields: ${truthyImpact.join(', ')}`);
  }

  return {
    text,
    artifact,
    generatedAt
  };
}

function archiveTimestamp(generatedAt) {
  return generatedAt.replace(/[:.]/g, '-');
}

function createTargetPaths(options, generatedAt) {
  if (!isManualArtifactPath(options.outputDir)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.outputDir}`);
  }
  const suffix = options.label ? `-${options.label}` : '';
  const fileBase = `${archiveTimestamp(generatedAt)}${suffix}`;
  const samplePath = resolve(options.outputDir, `${fileBase}.json`);
  return {
    samplePath,
    sidecarPath: resolve(options.outputDir, `${fileBase}.archive-meta.json`)
  };
}

function createMetadata(options, inputPath, targetPaths, validation) {
  const artifact = validation.artifact;
  return {
    archiveVersion: ARCHIVE_VERSION,
    archivedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    input: {
      path: resolve(inputPath),
      basename: basename(inputPath),
      schemaVersion: artifact.schemaVersion,
      module: artifact.module,
      generatedAt: validation.generatedAt,
      safeInputPath: isSafeInputPath(inputPath)
    },
    output: {
      samplePath: targetPaths.samplePath,
      sidecarPath: targetPaths.sidecarPath,
      overwrite: options.overwrite
    },
    sampleSummary: {
      status: artifact.status ?? null,
      signalState: artifact.signalState ?? null,
      sourceStatus: artifact.sourceStatus ?? null,
      baselineStatus: artifact.aggregate?.baselineStatus ?? artifact.baseline?.status ?? null,
      facilityCount: Array.isArray(artifact.facilities) ? artifact.facilities.length : 0,
      rowCount: artifact.aggregate?.rowCount ?? null,
      latestAcqAt: artifact.aggregate?.latestAcqAt ?? artifact.freshness?.latestAcqAt ?? null,
      repeatedObservationCount: artifact.aggregate?.repeatedObservationCount ?? null,
      elevatedRepeatedObservationCount: artifact.aggregate?.elevatedRepeatedObservationCount ?? null
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
    nextCommand: `npm run review:oil-thermal-baseline-samples -- --input-dir ${options.outputDir.replace(/\\/g, '/')}`,
    boundary: BOUNDARY
  };
}

function assertWritableTargets(targetPaths, overwrite) {
  for (const target of [targetPaths.samplePath, targetPaths.sidecarPath]) {
    if (existsSync(target) && !overwrite) {
      throw new Error(`Refusing to overwrite existing archive file without --overwrite: ${target}`);
    }
  }
}

function writeArchive(options, inputPath, targetPaths, metadata) {
  if (options.dryRun) {
    return;
  }
  mkdirSync(dirname(targetPaths.samplePath), { recursive: true });
  copyFileSync(resolve(inputPath), targetPaths.samplePath);
  writeFileSync(targetPaths.sidecarPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function printSummary(metadata) {
  const status = metadata.dryRun ? 'DRY_RUN' : 'OK';
  console.log(`Oil thermal watch sample archive: ${status}`);
  console.log(`inputGeneratedAt: ${metadata.input.generatedAt}`);
  console.log(`samplePath: ${metadata.output.samplePath}`);
  console.log(`sidecarPath: ${metadata.output.sidecarPath}`);
  console.log(`facilityCount: ${metadata.sampleSummary.facilityCount}`);
  console.log(`rowCount: ${metadata.sampleSummary.rowCount}`);
  console.log(`baselineStatus: ${metadata.sampleSummary.baselineStatus}`);
  console.log(`nextCommand: ${metadata.nextCommand}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const validation = validateWatchArtifact(options.input);
  const targetPaths = createTargetPaths(options, validation.generatedAt);
  assertWritableTargets(targetPaths, options.overwrite);
  const metadata = createMetadata(options, options.input, targetPaths, validation);
  writeArchive(options, options.input, targetPaths, metadata);

  if (options.printJson) {
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    printSummary(metadata);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
