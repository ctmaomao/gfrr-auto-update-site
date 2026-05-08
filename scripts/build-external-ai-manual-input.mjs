import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const INPUT_VERSION = 'v28.0K-4E-live-site-manual-input';
const DEFAULT_SOURCE = 'local';
const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/manual-input-latest.json';
const ALLOWED_SOURCE_URLS = new Set([
  'https://ctmaomao.github.io/gfrr-auto-update-site/data/radar-data.json',
  'https://radar.gfrfinradar.uk/data/radar-data.json'
]);
const UNSAFE_OUTPUT_DIRS = [
  'data',
  'realtime',
  'config',
  'workers',
  'scripts/modules',
  '.github/workflows'
];
const UNSAFE_OUTPUT_FILES = new Set([
  'index.html',
  'scripts/app.js'
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    sourceUrl: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--source') {
      options.source = nextValue();
    } else if (arg.startsWith('--source=')) {
      options.source = arg.slice('--source='.length);
    } else if (arg === '--input') {
      options.input = nextValue();
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--source-url') {
      options.sourceUrl = nextValue();
    } else if (arg.startsWith('--source-url=')) {
      options.sourceUrl = arg.slice('--source-url='.length);
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  if (options.sourceUrl) {
    if (options.source !== DEFAULT_SOURCE) throw new Error('--source-url cannot be combined with --source');
    if (options.input !== DEFAULT_INPUT) throw new Error('--source-url cannot be combined with --input');
  } else if (options.source !== 'local') {
    throw new Error(`unsupported source: ${options.source}`);
  }

  return options;
}

function toProjectRelativePath(value) {
  const absolutePath = path.resolve(value);
  const relativePath = path.relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.split(path.sep).join('/');
}

function normalizeProjectPath(value) {
  return value.toLowerCase();
}

function assertSafeOutputPath(outputPath) {
  const relativePath = toProjectRelativePath(outputPath);
  if (!relativePath) {
    throw new Error(`unsafe output path rejected outside project: ${outputPath}`);
  }

  const normalizedPath = normalizeProjectPath(relativePath);
  if (!normalizedPath.endsWith('.json')) {
    throw new Error(`unsafe output path rejected because it is not a JSON artifact: ${outputPath}`);
  }
  if (UNSAFE_OUTPUT_FILES.has(normalizedPath)) {
    throw new Error(`unsafe output path rejected: ${outputPath}`);
  }
  for (const unsafeDir of UNSAFE_OUTPUT_DIRS) {
    if (normalizedPath === unsafeDir || normalizedPath.startsWith(`${unsafeDir}/`)) {
      throw new Error(`unsafe output path rejected: ${outputPath}`);
    }
  }
}

function missingMarker(field) {
  return {
    missing: true,
    field,
    reason: 'not_present_in_source_radar_data'
  };
}

function getOwn(object, key) {
  if (!object || typeof object !== 'object' || !Object.hasOwn(object, key)) return undefined;
  return object[key];
}

function optionalField(object, key) {
  const value = getOwn(object, key);
  return value === undefined ? null : value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function extractRadarDataUpdatedAt(radarData) {
  return (
    optionalField(radarData, 'updatedAt') ||
    optionalField(radarData.metadata, 'updatedAt') ||
    optionalField(radarData.dailyRealtimeInput, 'updatedAt') ||
    null
  );
}

function buildDataHealth(radarData) {
  const direct = getOwn(radarData, 'dataHealth');
  if (direct !== undefined) return direct;

  const dailyRealtimeInput = getOwn(radarData, 'dailyRealtimeInput');
  const recovery = getOwn(radarData, 'recovery');
  if (!dailyRealtimeInput && !recovery) return missingMarker('dataHealth');

  return {
    derivedFrom: ['dailyRealtimeInput', 'recovery'],
    note: 'Read-only health summary derived from source radar data fields.',
    dailyRealtimeInput: dailyRealtimeInput || null,
    recovery: recovery || null
  };
}

function buildDecisionContext(radarData) {
  const direct = getOwn(radarData, 'decisionContext');
  if (direct !== undefined) return direct;

  const decisionModel = getOwn(radarData, 'decisionModel');
  const tradingSystem = getOwn(radarData, 'tradingSystem');
  const executionLock =
    getOwn(radarData, 'executionLock') ??
    getOwn(tradingSystem, 'executionLock') ??
    null;
  const positionGuidance =
    getOwn(radarData, 'positionGuidance') ??
    getOwn(decisionModel, 'positionGuidance') ??
    getOwn(tradingSystem, 'positioning') ??
    null;

  if (!decisionModel && !executionLock && !positionGuidance) return missingMarker('decisionContext');

  return {
    readOnly: true,
    note: 'Manual external AI input context only; does not change decision, execution, or position logic.',
    decisionModel: decisionModel || null,
    executionLock,
    positionGuidance
  };
}

function buildRiskModules(radarData) {
  const riskModules = getOwn(radarData, 'riskModules');
  if (riskModules !== undefined) return riskModules;

  const modules = getOwn(radarData, 'modules');
  const moduleTrends = getOwn(radarData, 'moduleTrends');
  if (!modules && !moduleTrends) return null;

  return {
    modules: modules || null,
    moduleTrends: moduleTrends || null
  };
}

function extractSiteData(radarData) {
  const macroDrivers = getOwn(radarData, 'macroDrivers') || {};
  return {
    dailyBrief: getOwn(radarData, 'dailyBrief') ?? missingMarker('dailyBrief'),
    divergenceLayer: getOwn(radarData, 'divergenceLayer') ?? missingMarker('divergenceLayer'),
    brentPricingLayer: getOwn(radarData, 'brentPricingLayer') ?? missingMarker('brentPricingLayer'),
    macroDrivers: {
      consumer: getOwn(macroDrivers, 'consumer') ?? missingMarker('macroDrivers.consumer')
    },
    aiInterpretationLayer: getOwn(radarData, 'aiInterpretationLayer') ?? missingMarker('aiInterpretationLayer'),
    externalAiInterpretationLayer: getOwn(radarData, 'externalAiInterpretationLayer') ?? missingMarker('externalAiInterpretationLayer'),
    dataHealth: buildDataHealth(radarData),
    decisionContext: buildDecisionContext(radarData),
    worldOrderStress: getOwn(radarData, 'worldOrderStress') ?? null,
    riskModules: buildRiskModules(radarData)
  };
}

function buildManualInputArtifact(radarData, source) {
  const radarDataUpdatedAt = extractRadarDataUpdatedAt(radarData);
  return {
    inputVersion: INPUT_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      type: source.type,
      path: source.path,
      url: source.url,
      radarDataUpdatedAt
    },
    siteData: extractSiteData(radarData),
    boundaries: {
      siteStructuredDataOnly: true,
      noExternalMarketData: true,
      noPrivateUserData: true,
      noSecrets: true,
      readOnlyContext: true,
      manualArtifactOnly: true,
      notProductionData: true,
      doesNotAffectScoring: true,
      doesNotAffectDecision: true,
      doesNotAffectExecution: true,
      doesNotAffectPosition: true
    },
    notesZh: [
      '该输入仅用于手动 external AI artifact 测试。',
      '该输入来自站内结构化数据，不包含 API key 或私人数据。',
      '该输入不得直接写入生产数据或前端展示。'
    ]
  };
}

async function readLocalRadarData(inputPath) {
  const text = await fs.readFile(inputPath, 'utf8');
  const radarData = JSON.parse(text);
  requireObject(radarData, inputPath);
  return radarData;
}

async function readAllowedLiveRadarData(sourceUrl) {
  if (!ALLOWED_SOURCE_URLS.has(sourceUrl)) {
    throw new Error(`source URL is not allowlisted: ${sourceUrl}`);
  }

  const response = await fetch(sourceUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`failed to fetch allowlisted source URL: HTTP ${response.status}`);

  const radarData = await response.json();
  requireObject(radarData, sourceUrl);
  return radarData;
}

async function writeArtifact(outputPath, artifact) {
  assertSafeOutputPath(outputPath);
  const absoluteOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  let radarData;
  let source;
  try {
    if (options.sourceUrl) {
      radarData = await readAllowedLiveRadarData(options.sourceUrl);
      source = {
        type: 'allowed_live_url',
        path: null,
        url: options.sourceUrl
      };
    } else {
      radarData = await readLocalRadarData(options.input);
      source = {
        type: 'local_file',
        path: options.input,
        url: null
      };
    }
  } catch (error) {
    fail(`failed to read radar data: ${error.message}`);
    return;
  }

  const artifact = buildManualInputArtifact(radarData, source);
  try {
    await writeArtifact(options.output, artifact);
  } catch (error) {
    fail(error.message);
    return;
  }

  console.log('External AI manual input artifact: PASS');
  console.log(`input: ${options.sourceUrl || options.input}`);
  console.log(`output: ${options.output}`);
  console.log(`sourceType: ${artifact.source.type}`);
  console.log(`radarDataUpdatedAt: ${artifact.source.radarDataUpdatedAt || 'null'}`);
  console.log('productionDataWritten: false');
  console.log('frontendDisplayChanged: false');
  console.log('secretsRead: false');
  console.log('apiCalled: false');
}

await main();
