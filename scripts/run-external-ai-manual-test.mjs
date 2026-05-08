import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  assertProviderDisabled,
  createExternalAiProviderAdapter,
  normalizeExternalAiProvider
} from './external-ai/provider-adapters.mjs';

const CONTRACT_VERSION = 'v28.0K-4C';
const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-input-v28.0K-1.json';
const UNSAFE_OUTPUT_DIRS = [
  'data',
  'realtime',
  'config',
  'workers',
  'scripts/modules',
  '.github/workflows'
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    input: DEFAULT_INPUT,
    provider: 'none',
    model: null,
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--input') {
      options.input = nextValue();
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
    } else if (arg === '--provider') {
      options.provider = nextValue();
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length);
    } else if (arg === '--model') {
      options.model = nextValue();
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  return options;
}

function assert(condition, errors, message) {
  if (!condition) errors.push(message);
}

function getPath(value, pathParts) {
  return pathParts.reduce((current, key) => (current && Object.hasOwn(current, key) ? current[key] : undefined), value);
}

function validateInput(input) {
  const errors = [];

  assert(typeof input.inputVersion === 'string' && input.inputVersion.length > 0, errors, 'inputVersion must be a non-empty string');
  assert(typeof input.generatedAt === 'string' && input.generatedAt.length > 0, errors, 'generatedAt must be a non-empty string');
  assert(input.siteData && typeof input.siteData === 'object', errors, 'siteData must be an object');

  for (const field of [
    'dailyBrief',
    'divergenceLayer',
    'brentPricingLayer',
    'aiInterpretationLayer',
    'dataHealth',
    'decisionContext'
  ]) {
    assert(Boolean(getPath(input, ['siteData', field])), errors, `siteData.${field} is required`);
  }

  assert(Boolean(getPath(input, ['siteData', 'macroDrivers', 'consumer'])), errors, 'siteData.macroDrivers.consumer is required');

  const boundaries = input.boundaries || {};
  assert(boundaries.siteStructuredDataOnly === true, errors, 'boundaries.siteStructuredDataOnly must be true');
  assert(boundaries.noExternalMarketData === true, errors, 'boundaries.noExternalMarketData must be true');
  assert(boundaries.noPrivateUserData === true, errors, 'boundaries.noPrivateUserData must be true');
  assert(boundaries.noSecrets === true, errors, 'boundaries.noSecrets must be true');
  assert(boundaries.readOnlyContext === true, errors, 'boundaries.readOnlyContext must be true');

  return errors;
}

function collectLayersAvailable(input) {
  const layers = [];
  const siteData = input.siteData || {};
  for (const field of ['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'aiInterpretationLayer', 'dataHealth', 'decisionContext']) {
    if (siteData[field]) layers.push(field);
  }
  if (siteData.macroDrivers?.consumer) layers.push('macroDrivers.consumer');
  return layers;
}

function isUnsafeOutputPath(outputPath) {
  const absoluteOutput = path.resolve(outputPath);
  const cwd = process.cwd();
  const relative = path.relative(cwd, absoluteOutput);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;

  const normalizedRelative = relative.split(path.sep).join('/');
  return UNSAFE_OUTPUT_DIRS.some((unsafeDir) => normalizedRelative === unsafeDir || normalizedRelative.startsWith(`${unsafeDir}/`));
}

async function writeOutputIfRequested(outputPath, text) {
  if (!outputPath) return;
  if (isUnsafeOutputPath(outputPath)) {
    throw new Error(`unsafe output path rejected: ${outputPath}`);
  }
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, text, 'utf8');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  if (!options.dryRun) {
    fail('K-4C only supports --dry-run. No provider calls are available in this version.');
    return;
  }

  let provider;
  try {
    provider = normalizeExternalAiProvider(options.provider);
  } catch (error) {
    fail(error.message);
    return;
  }

  const environmentProvider = process.env.EXTERNAL_AI_PROVIDER;
  let normalizedEnvironmentProvider;
  try {
    normalizedEnvironmentProvider = normalizeExternalAiProvider(environmentProvider);
  } catch (error) {
    fail(error.message);
    return;
  }
  if (normalizedEnvironmentProvider !== 'none') {
    fail('K-4C is no-network. Provider environment variables are intentionally ignored.');
    return;
  }

  try {
    assertProviderDisabled(provider);
  } catch (error) {
    fail(error.message);
    return;
  }

  const providerAdapter = createExternalAiProviderAdapter({ provider, model: options.model });

  let input;
  try {
    input = JSON.parse(await fs.readFile(options.input, 'utf8'));
  } catch (error) {
    fail(`failed to read input JSON: ${error.message}`);
    return;
  }

  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    fail(`invalid manual scaffold input:\n- ${validationErrors.join('\n- ')}`);
    return;
  }

  const report = {
    contractVersion: CONTRACT_VERSION,
    kind: 'external_ai_manual_test_scaffold_report',
    generatedAt: new Date().toISOString(),
    status: 'dry_run_only',
    provider: providerAdapter.provider,
    model: providerAdapter.model,
    providerMetadata: providerAdapter.metadata,
    networkAllowed: false,
    apiCalled: false,
    secretsRead: false,
    input: {
      path: options.input,
      inputVersion: input.inputVersion,
      siteStructuredDataOnly: input.boundaries.siteStructuredDataOnly,
      layersAvailable: collectLayersAvailable(input)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    nextAllowedStep: 'A later reviewed version may add real provider calls only behind an explicit environment gate.',
    notesZh: [
      '该命令仅为本地 dry-run scaffold。',
      '本版本不联网、不读取 API key、不调用外部 AI provider。',
      '该输出不是 external AI output，不能进入前端或生产数据。'
    ]
  };

  const outputText = `${JSON.stringify(report, null, 2)}\n`;
  try {
    await writeOutputIfRequested(options.output, outputText);
  } catch (error) {
    fail(error.message);
    return;
  }

  process.stdout.write(outputText);
}

await main();
