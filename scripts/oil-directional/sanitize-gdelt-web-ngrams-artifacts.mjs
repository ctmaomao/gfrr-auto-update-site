#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION = 'gdelt-web-ngrams-artifact-sanitizer-p48';

const DEFAULT_SAMPLE_DIR = 'manual-artifacts/oil-news/gdelt-web-ngrams-samples';
const URL_RE = /https?:\/\/[^\s"'<>\\]+/giu;
// P48 specifically removes legacy selectedFile.url exposure from ignored samples.
const SENSITIVE_KEY_RE = /^(?:url|finalUrl|requestUrl|newsUrl|articleUrl|sourceUrl|articleTitle|headline|title|body|bodyText|snippet|rawResponse|rawProviderResponse|rawBody|rawText|rawRows)$/iu;

function printUsage() {
  console.log(`Usage:
  npm run sanitize:gdelt-web-ngrams-artifacts -- [options]

Options:
  --input <path>       GDELT Web NGrams diagnosis/sample artifact. May be repeated.
  --input-dir <path>   Directory of diagnosis/sample JSON artifacts. May be repeated.
  --dry-run            Report changes without writing files.
  --fail-on-change     Exit non-zero if any file would change or changed.
  --allow-empty        Exit 0 if no input file exists.
  --json               Print full JSON result.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    dryRun: false,
    failOnChange: false,
    allowEmpty: false,
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
    if (arg === '--fail-on-change') {
      options.failOnChange = true;
      continue;
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.inputs.length && !options.inputDirs.length) options.inputDirs.push(DEFAULT_SAMPLE_DIR);
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

function canWritePath(filePath) {
  return isManualArtifactPath(filePath);
}

function cloneAndSanitize(value, path = '$', removedPaths = []) {
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneAndSanitize(item, `${path}[${index}]`, removedPaths));
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      if (SENSITIVE_KEY_RE.test(key)) {
        removedPaths.push(nestedPath);
        continue;
      }
      sanitized[key] = cloneAndSanitize(nestedValue, nestedPath, removedPaths);
    }
    return sanitized;
  }
  if (typeof value === 'string') {
    URL_RE.lastIndex = 0;
    if (URL_RE.test(value)) {
      URL_RE.lastIndex = 0;
      removedPaths.push(path);
      return value.replace(URL_RE, '<redacted_url>');
    }
  }
  return value;
}

export function sanitizeGdeltWebNgramsArtifact(artifact) {
  const removedPaths = [];
  const sanitized = cloneAndSanitize(artifact, '$', removedPaths);
  return {
    artifact: sanitized,
    removedPaths,
    changed: removedPaths.length > 0
  };
}

export function stringifySanitizedArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) continue;
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => {
        if (extname(name).toLowerCase() !== '.json') return false;
        if (name.endsWith('.archive-meta.json')) return false;
        if (name.includes('review')) return false;
        return true;
      })
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}

function sanitizeFile(filePath, options) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing unsafe input path: ${filePath}`);
  if (!options.dryRun && !canWritePath(filePath)) {
    throw new Error(`Refusing to rewrite outside manual-artifacts/: ${filePath}`);
  }
  const originalText = readFileSync(resolve(filePath), 'utf8');
  const parsed = JSON.parse(originalText);
  const sanitized = sanitizeGdeltWebNgramsArtifact(parsed);
  const sanitizedText = stringifySanitizedArtifact(sanitized.artifact);
  const changed = originalText !== sanitizedText;
  if (changed && !options.dryRun) {
    mkdirSync(dirname(resolve(filePath)), { recursive: true });
    writeFileSync(resolve(filePath), sanitizedText, 'utf8');
  }
  return {
    path: safeRelativePath(filePath) || filePath,
    changed,
    removedPathCount: sanitized.removedPaths.length,
    removedPaths: sanitized.removedPaths.slice(0, 20)
  };
}

function sanitizeFiles(options) {
  const inputFiles = expandInputFiles(options);
  const result = {
    sanitizerVersion: GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION,
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? 'dry_run' : 'rewrite_manual_artifacts',
    inputFileCount: inputFiles.length,
    changedFileCount: 0,
    removedPathCount: 0,
    files: [],
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
    promotionEligible: false,
    productionDisplayApproved: false,
    boundary:
      'manual GDELT Web NGrams artifact sanitizer only; rewrites ignored manual-artifacts only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation'
  };

  if (!inputFiles.length && !options.allowEmpty) throw new Error('No GDELT Web NGrams artifacts found to sanitize.');

  for (const inputFile of inputFiles) {
    const fileResult = sanitizeFile(inputFile, options);
    if (fileResult.changed) result.changedFileCount += 1;
    result.removedPathCount += fileResult.removedPathCount;
    result.files.push(fileResult);
  }
  return result;
}

function printSummary(result) {
  console.log(`GDELT Web NGrams artifact sanitizer: ${result.mode.toUpperCase()}`);
  console.log(`inputFileCount: ${result.inputFileCount}`);
  console.log(`changedFileCount: ${result.changedFileCount}`);
  console.log(`removedPathCount: ${result.removedPathCount}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = sanitizeFiles(options);
  if (options.printJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  if (options.failOnChange && result.changedFileCount > 0) process.exit(1);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main();
}
