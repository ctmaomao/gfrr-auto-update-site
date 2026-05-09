import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_FLAGS = new Set(['--confirm-production-write', '--data-only', '--no-frontend-display']);
const SAFE_TARGET = 'data/radar-data.json';

const REQUIRED_FALSE_PATHS = [
  'displayEnabled',
  'qualityReview.promotionEligible',
  'boundaries.frontendDisplayApproved',
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
    } else if (REQUIRED_FLAGS.has(arg)) {
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

function readProjection(inputPath) {
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

  if (layer.schemaVersion !== 'v28.0L-external-ai-production-1') {
    throw new Error('schemaVersion must be v28.0L-external-ai-production-1');
  }
  if (layer.status !== 'valid') throw new Error('status must be valid');
  if (layer.sourceMode !== 'manual_local_compact') throw new Error('sourceMode must be manual_local_compact');
  if (layer.provider !== 'deepseek') throw new Error('provider must be deepseek');
  if (layer.model !== 'deepseek-v4-flash') throw new Error('model must be deepseek-v4-flash');
  if (layer.inputSource !== 'local_compact') throw new Error('inputSource must be local_compact');
  if (layer.sourceSemantics !== 'site_structured_data_compact_summary') {
    throw new Error('sourceSemantics must be site_structured_data_compact_summary');
  }
  if (layer.freshness?.isStale !== false) throw new Error('freshness.isStale must be false');
  if (!['pass', 'warn'].includes(layer.qualityReview?.status)) {
    throw new Error('qualityReview.status must be pass or warn');
  }
  if (layer.qualityReview?.recommendation !== 'pass_for_manual_review') {
    throw new Error('qualityReview.recommendation must be pass_for_manual_review');
  }

  return layer;
}

function writeProductionData(targetPath, layer) {
  const data = readJson(targetPath);
  if (!isPlainObject(data)) throw new Error('target data must be a JSON object');

  const nextData = {
    ...data,
    externalAiInterpretationLayer: layer,
  };

  fs.writeFileSync(targetPath, `${JSON.stringify(nextData, null, 2)}\n`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const target = assertSafeTarget(options.target);
    const input = normalizeRepoPath(options.input);
    const layer = readProjection(input);

    writeProductionData(target, layer);

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

main();
