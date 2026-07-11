import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  EXTERNAL_AI_PRODUCTION_MODEL,
  resolveExternalAiProductionContract,
} from './external-ai/production-contract.mjs';

const REQUIRED_FLAGS = new Set(['--confirm-production-write', '--data-only', '--no-frontend-display']);
const OPTIONAL_FLAGS = new Set(['--preserve-visible-display']);
const SAFE_TARGET = 'data/radar-data.json';

const REQUIRED_FALSE_PATHS = [
  'qualityReview.promotionEligible',
  'boundaries.affectsScoring',
  'boundaries.affectsDecisionModel',
  'boundaries.affectsExecutionLock',
  'boundaries.affectsPositionGuidance',
];

const REQUIRED_TRUE_PATHS = [
  'boundaries.displayOnly',
  'boundaries.externalAiGenerated',
  'boundaries.usesExternalAiApi',
  'boundaries.notInvestmentAdvice',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = {
    input: null,
    target: null,
    flags: new Set(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      options.input = argv[++index];
    } else if (arg === '--target') {
      options.target = argv[++index];
    } else if (REQUIRED_FLAGS.has(arg) || OPTIONAL_FLAGS.has(arg)) {
      options.flags.add(arg);
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  for (const flag of REQUIRED_FLAGS) {
    if (!options.flags.has(flag)) throw new Error(`missing required flag: ${flag}`);
  }
  if (!options.input) throw new Error('missing required --input path');
  if (!options.target) throw new Error('missing required --target path');

  return options;
}

function getExpectedDisplayState(options) {
  const preserveVisibleDisplay = options.flags.has('--preserve-visible-display');
  return {
    displayEnabled: preserveVisibleDisplay,
    frontendDisplayApproved: preserveVisibleDisplay,
  };
}

function normalizeRepoPath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join('/');
}

function assertSafeTarget(targetPath) {
  const relativeTarget = normalizeRepoPath(targetPath);
  if (relativeTarget !== SAFE_TARGET) {
    throw new Error(`refusing unsafe target: ${relativeTarget}`);
  }
  return relativeTarget;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomically(filePath, value) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

function getPath(root, fieldPath) {
  let current = root;
  for (const field of fieldPath.split('.')) {
    if (!isPlainObject(current) || !(field in current)) return undefined;
    current = current[field];
  }
  return current;
}

function requirePathValue(root, fieldPath, expected) {
  const actual = getPath(root, fieldPath);
  if (actual !== expected) {
    throw new Error(`${fieldPath} must be ${expected}`);
  }
}

function validateProjectionWithContract(inputPath) {
  const result = spawnSync(process.execPath, ['scripts/check-external-ai-production-contract.mjs', inputPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
    throw new Error(`projection failed production contract validation${details ? `:\n${details}` : ''}`);
  }
}

function readProjection(inputPath, expectedDisplayState) {
  validateProjectionWithContract(inputPath);
  const projection = readJson(inputPath);
  if (!isPlainObject(projection) || !isPlainObject(projection.externalAiInterpretationLayer)) {
    throw new Error('projection must contain externalAiInterpretationLayer');
  }

  const layer = projection.externalAiInterpretationLayer;

  for (const fieldPath of REQUIRED_FALSE_PATHS) {
    requirePathValue(layer, fieldPath, false);
  }
  for (const fieldPath of REQUIRED_TRUE_PATHS) {
    requirePathValue(layer, fieldPath, true);
  }
  requirePathValue(layer, 'displayEnabled', expectedDisplayState.displayEnabled);
  requirePathValue(layer, 'boundaries.frontendDisplayApproved', expectedDisplayState.frontendDisplayApproved);

  const productionContract = resolveExternalAiProductionContract(layer);
  if (productionContract === null) throw new Error('schemaVersion/source contract is not an allowed external AI production contract');
  if (layer.status !== 'valid') throw new Error('status must be valid');
  if (layer.schemaVersion !== productionContract.schemaVersion) throw new Error(`schemaVersion must be ${productionContract.schemaVersion}`);
  if (layer.sourceMode !== productionContract.sourceMode) throw new Error(`sourceMode must be ${productionContract.sourceMode}`);
  if (layer.provider !== 'deepseek') throw new Error('provider must be deepseek');
  if (layer.model !== EXTERNAL_AI_PRODUCTION_MODEL) throw new Error(`model must be ${EXTERNAL_AI_PRODUCTION_MODEL}`);
  if (layer.inputSource !== productionContract.inputSource) throw new Error(`inputSource must be ${productionContract.inputSource}`);
  if (layer.sourceSemantics !== productionContract.sourceSemantics) throw new Error(`sourceSemantics must be ${productionContract.sourceSemantics}`);
  if (layer.freshness?.isStale !== false) throw new Error('freshness.isStale must be false');
  if (!['pass', 'warn'].includes(layer.qualityReview?.status)) {
    throw new Error('qualityReview.status must be pass or warn');
  }
  if (layer.qualityReview?.recommendation !== 'pass_for_manual_review') {
    throw new Error('qualityReview.recommendation must be pass_for_manual_review');
  }

  return layer;
}

export function targetDisplayStateAllowsWrite(data, expectedDisplayState) {
  const currentLayer = data.externalAiInterpretationLayer;
  const currentBoundaries = currentLayer?.boundaries;
  if (!isPlainObject(currentLayer) || !isPlainObject(currentBoundaries)) return false;
  const currentDisplayEnabled = currentLayer.displayEnabled;
  const currentFrontendApproved = currentBoundaries.frontendDisplayApproved;
  if (currentDisplayEnabled !== currentFrontendApproved) return false;
  if (
    currentDisplayEnabled === expectedDisplayState.displayEnabled
    && currentFrontendApproved === expectedDisplayState.frontendDisplayApproved
  ) return true;
  const dailyFallbackHidden = currentLayer.status === 'disabled'
    && currentLayer.fallback?.used === true
    && currentBoundaries.externalAiGenerated === false
    && currentBoundaries.usesExternalAiApi === false;
  return expectedDisplayState.displayEnabled === true
    && expectedDisplayState.frontendDisplayApproved === true
    && currentDisplayEnabled === false
    && currentFrontendApproved === false
    && dailyFallbackHidden;
}

function assertTargetDisplayStateAllowsWrite(data, expectedDisplayState) {
  if (!targetDisplayStateAllowsWrite(data, expectedDisplayState)) {
    throw new Error('target display state cannot transition to the requested production display state');
  }
}

function writeProductionData(targetPath, layer, expectedDisplayState) {
  const data = readJson(targetPath);
  if (!isPlainObject(data)) throw new Error('target data must be a JSON object');
  assertTargetDisplayStateAllowsWrite(data, expectedDisplayState);

  const nextData = {
    ...data,
    externalAiInterpretationLayer: layer,
  };

  writeJsonAtomically(targetPath, nextData);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const target = assertSafeTarget(options.target);
    const input = normalizeRepoPath(options.input);
    const expectedDisplayState = getExpectedDisplayState(options);
    const layer = readProjection(input, expectedDisplayState);

    writeProductionData(target, layer, expectedDisplayState);

    console.log('External AI production data write: PASS');
    console.log(`target: ${target}`);
    console.log('productionDataWritten: true');
    console.log('frontendDisplayChanged: false');
    console.log(`displayEnabled: ${layer.displayEnabled}`);
    console.log(`promotionEligible: ${layer.qualityReview.promotionEligible}`);
  } catch (error) {
    console.error('External AI production data write: FAIL');
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
