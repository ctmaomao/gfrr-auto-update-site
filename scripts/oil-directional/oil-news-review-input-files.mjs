import { existsSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { WATCH_PATH } from './oil-news-watch-history.mjs';

export const DEFAULT_MAX_COMMITS = 30;
export const DEFAULT_MAX_SAMPLES = 12;
export const DEFAULT_MIN_SAMPLES = 2;

export function parseOilNewsReviewArgs(argv, { defaultOutput, outputLabel, printUsage }) {
  const options = {
    inputs: [],
    inputDirs: [],
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    output: defaultOutput,
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
    } else if (arg === '--max-commits') {
      options.maxCommits = Number(nextValue());
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

  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 500) {
    throw new Error('Invalid --max-commits. Expected integer 1..500.');
  }
  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 100) {
    throw new Error('Invalid --max-samples. Expected integer 1..100.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write ${outputLabel} outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === WATCH_PATH;
}

export function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath) || isProductionWatchPath(filePath);
}

export function expandInputFiles(options) {
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
  return [...new Set(files)];
}

export function validateNoForbiddenSerializedText(text, label) {
  for (const needle of [
    'TAVILY_API_KEY',
    'TAVILY_API_KEYS',
    'BRAVE_API_KEY',
    'BRAVE_API_KEYS',
    'Authorization',
    'X-Subscription-Token',
    'Bearer ',
    '"snippet"',
    '"body"',
    '"rawResponse"'
  ]) {
    if (text.includes(needle)) throw new Error(`${label} contains forbidden marker: ${needle}`);
  }
}
