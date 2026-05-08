import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const INPUT_VERSION = 'v28.0K-4E-live-site-manual-input';
const COMPACT_INPUT_VERSION = 'v28.0K-4E-1-live-site-manual-input-compact';
const DEFAULT_SOURCE = 'local';
const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/manual-input-latest.json';
const DEFAULT_MAX_LIST_ITEMS = 3;
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
    sourceUrl: null,
    compact: false
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
    } else if (arg === '--compact') {
      options.compact = true;
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

function pickFields(object, fields) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  const picked = {};
  for (const field of fields) {
    const value = getOwn(object, field);
    if (value !== undefined) picked[field] = value;
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

function limitList(value, maxItems = DEFAULT_MAX_LIST_ITEMS) {
  if (!Array.isArray(value)) return value === undefined ? null : value;
  return value.slice(0, maxItems);
}

function compactObjectList(value, fields, maxItems = DEFAULT_MAX_LIST_ITEMS) {
  if (!Array.isArray(value)) return value === undefined ? null : value;
  return value.slice(0, maxItems).map((item) => pickFields(item, fields) || item);
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

function compactDailyBrief(radarData) {
  const dailyBrief = getOwn(radarData, 'dailyBrief');
  if (!dailyBrief) return missingMarker('dailyBrief');
  const compact = pickFields(dailyBrief, [
    'contractVersion',
    'macroState',
    'oneLineConclusion',
    'dominantRiskChain',
    'stage'
  ]) || {};
  compact.topRisks = limitList(getOwn(dailyBrief, 'topRisks') ?? getOwn(radarData, 'topRisks'), 3);
  compact.triggers = limitList(getOwn(dailyBrief, 'triggers') ?? getOwn(dailyBrief, 'keyTriggers'), 3);
  compact.invalidationSignals = limitList(getOwn(dailyBrief, 'invalidationSignals'), 3);
  compact.evidence = limitList(getOwn(dailyBrief, 'evidence'), 5);
  return compact;
}

function compactDivergenceLayer(radarData) {
  const divergenceLayer = getOwn(radarData, 'divergenceLayer');
  if (!divergenceLayer) return missingMarker('divergenceLayer');
  return {
    ...(pickFields(divergenceLayer, [
      'contractVersion',
      'state',
      'score',
      'primaryDivergence'
    ]) || {}),
    checks: compactObjectList(getOwn(divergenceLayer, 'checks'), [
      'id',
      'key',
      'category',
      'state',
      'status',
      'summary',
      'summaryZh',
      'score',
      'limitations'
    ], 5)
  };
}

function compactBrentProxy(value) {
  return pickFields(value, [
    'labelZh',
    'source',
    'value',
    'observedAt',
    'status',
    'limitationZh'
  ]);
}

function compactBrentPricingLayer(radarData) {
  const brentPricingLayer = getOwn(radarData, 'brentPricingLayer');
  if (!brentPricingLayer) return missingMarker('brentPricingLayer');
  return {
    contractVersion: getOwn(brentPricingLayer, 'contractVersion') ?? null,
    selectedBrent: getOwn(brentPricingLayer, 'selectedBrent') ?? null,
    publicSpotProxy: compactBrentProxy(getOwn(brentPricingLayer, 'publicSpotProxy')),
    futuresProxy: compactBrentProxy(getOwn(brentPricingLayer, 'futuresProxy')),
    proxySpread: getOwn(brentPricingLayer, 'proxySpread') ?? null,
    boundaries: getOwn(brentPricingLayer, 'boundaries') ?? null,
    limitations: limitList(getOwn(brentPricingLayer, 'limitations'), 4)
  };
}

function compactConsumerDriver(radarData) {
  const consumer = getOwn(getOwn(radarData, 'macroDrivers'), 'consumer');
  if (!consumer) return missingMarker('macroDrivers.consumer');
  return {
    source: getOwn(consumer, 'source') ?? null,
    status: getOwn(consumer, 'status') ?? getOwn(consumer, 'regime') ?? null,
    sourceStatus: getOwn(consumer, 'sourceStatus') ?? null,
    umichSentiment: getOwn(consumer, 'umichSentiment') ?? null,
    previous: getOwn(consumer, 'previous') ?? getOwn(consumer, 'previousValue') ?? null,
    threeMonthChange: getOwn(consumer, 'threeMonthChange') ?? null,
    sixMonthChange: getOwn(consumer, 'sixMonthChange') ?? null,
    limitations: getOwn(consumer, 'limitations') ?? getOwn(consumer, 'notes') ?? null
  };
}

function compactScenarioHypotheses(value) {
  if (!Array.isArray(value)) return value === undefined ? null : value;
  return value.slice(0, 2).map((scenario) => ({
    ...(pickFields(scenario, ['key', 'titleZh', 'summaryZh', 'confidence']) || {}),
    triggerConditions: limitList(getOwn(scenario, 'triggerConditions'), 3),
    invalidationConditions: limitList(getOwn(scenario, 'invalidationConditions'), 3)
  }));
}

function compactAiInterpretationLayer(radarData) {
  const layer = getOwn(radarData, 'aiInterpretationLayer');
  if (!layer) return missingMarker('aiInterpretationLayer');
  return {
    contractVersion: getOwn(layer, 'contractVersion') ?? null,
    mode: getOwn(layer, 'mode') ?? null,
    summary: getOwn(layer, 'summary') ?? getOwn(layer, 'summaryZh') ?? null,
    facts: limitList(getOwn(layer, 'facts'), 3),
    modelJudgments: limitList(getOwn(layer, 'modelJudgments'), 3),
    dataGaps: limitList(getOwn(layer, 'dataGaps'), 3),
    invalidationSignals: limitList(getOwn(layer, 'invalidationSignals'), 3),
    scenarioHypotheses: compactScenarioHypotheses(getOwn(layer, 'scenarioHypotheses'))
  };
}

function compactExternalAiInterpretationLayer(radarData) {
  const layer = getOwn(radarData, 'externalAiInterpretationLayer');
  if (!layer) return missingMarker('externalAiInterpretationLayer');
  return {
    contractVersion: getOwn(layer, 'contractVersion') ?? null,
    enabled: getOwn(layer, 'enabled') ?? null,
    status: getOwn(layer, 'status') ?? null,
    provider: getOwn(layer, 'provider') ?? null,
    mode: getOwn(layer, 'mode') ?? null,
    output: getOwn(layer, 'output') === undefined ? null : null,
    outputMarker: 'omitted_or_null_in_compact_manual_input',
    boundaries: getOwn(layer, 'boundaries') ?? null
  };
}

function compactDataHealth(radarData) {
  const dataHealth = getOwn(radarData, 'dataHealth');
  const dailyRealtimeInput = getOwn(radarData, 'dailyRealtimeInput') || {};
  return {
    status: getOwn(dataHealth, 'status') ?? getOwn(radarData, 'sourceMode') ?? null,
    freshness: getOwn(dataHealth, 'freshness') ?? null,
    source: getOwn(dataHealth, 'source') ?? getOwn(dailyRealtimeInput, 'sourceMode') ?? null,
    updatedAt: getOwn(dataHealth, 'updatedAt') ?? getOwn(radarData, 'updatedAt') ?? getOwn(dailyRealtimeInput, 'updatedAt') ?? null,
    healthScore: getOwn(dataHealth, 'healthScore') ?? getOwn(dailyRealtimeInput, 'healthScore') ?? getOwn(radarData, 'healthScore') ?? null
  };
}

function compactDecisionContext(radarData) {
  const decisionModel = getOwn(radarData, 'decisionModel') || {};
  const tradingSystem = getOwn(radarData, 'tradingSystem') || {};
  const executionLock = getOwn(tradingSystem, 'executionLock') || getOwn(radarData, 'executionLock') || null;
  const positioning = getOwn(tradingSystem, 'positioning') || null;
  const positionGuidance = getOwn(decisionModel, 'positionGuidance') || getOwn(radarData, 'positionGuidance') || positioning;
  return {
    readOnly: true,
    strategyState: getOwn(decisionModel, 'strategyState') ?? null,
    stateLabel: getOwn(decisionModel, 'stateLabel') ?? null,
    stateScore: getOwn(decisionModel, 'stateScore') ?? null,
    riskLevel: getOwn(tradingSystem, 'riskControl') ? getOwn(getOwn(tradingSystem, 'riskControl'), 'status') : null,
    executionLight: pickFields(executionLock, ['level', 'status', 'label', 'labelZh', 'reason', 'reasonZh']) || executionLock,
    positionGuidance: pickFields(positionGuidance, [
      'totalExposureBand',
      'riskAssetBias',
      'cashGuidance',
      'newExposurePolicy',
      'targetGrossExposure',
      'cashBufferTarget',
      'riskBudget'
    ])
  };
}

function compactWorldOrderStress(radarData) {
  const worldOrderStress = getOwn(radarData, 'worldOrderStress');
  if (!worldOrderStress) return null;
  const sources = getOwn(worldOrderStress, 'sources') || getOwn(worldOrderStress, 'sourceStatus') || {};
  return {
    score: getOwn(worldOrderStress, 'score') ?? null,
    state: getOwn(worldOrderStress, 'state') ?? null,
    confidence: getOwn(worldOrderStress, 'confidence') ?? null,
    freshness: getOwn(worldOrderStress, 'freshness') ?? null,
    marketConfirmationSource: getOwn(worldOrderStress, 'marketConfirmationSource') ?? getOwn(getOwn(worldOrderStress, 'marketConfirmationInput'), 'source') ?? null,
    sourceStatuses: Object.fromEntries(
      Object.entries(sources).map(([key, value]) => [key, typeof value === 'object' && value ? getOwn(value, 'status') ?? value : value])
    ),
    warningsCount: Array.isArray(getOwn(worldOrderStress, 'warnings')) ? getOwn(worldOrderStress, 'warnings').length : getOwn(worldOrderStress, 'warningsCount') ?? null
  };
}

function compactRiskModules(radarData) {
  const modules = getOwn(radarData, 'modules');
  const moduleTrends = getOwn(radarData, 'moduleTrends') || {};
  const source = modules && typeof modules === 'object' && !Array.isArray(modules) ? Object.entries(modules) : [];
  if (source.length === 0) return null;
  return source.map(([key, value]) => ({
    key,
    score: typeof value === 'number' ? value : getOwn(value, 'score') ?? null,
    state: typeof value === 'object' && value ? getOwn(value, 'state') ?? getOwn(value, 'status') ?? null : null,
    trend: getOwn(moduleTrends, key) ?? null
  }));
}

function extractCompactSiteData(radarData) {
  return {
    dailyBrief: compactDailyBrief(radarData),
    divergenceLayer: compactDivergenceLayer(radarData),
    brentPricingLayer: compactBrentPricingLayer(radarData),
    macroDrivers: {
      consumer: compactConsumerDriver(radarData)
    },
    aiInterpretationLayer: compactAiInterpretationLayer(radarData),
    externalAiInterpretationLayer: compactExternalAiInterpretationLayer(radarData),
    dataHealth: compactDataHealth(radarData),
    decisionContext: compactDecisionContext(radarData),
    worldOrderStress: compactWorldOrderStress(radarData),
    riskModules: compactRiskModules(radarData)
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

function buildManualInputArtifact(radarData, source, options) {
  const radarDataUpdatedAt = extractRadarDataUpdatedAt(radarData);
  const artifact = {
    inputVersion: options.compact ? COMPACT_INPUT_VERSION : INPUT_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      type: source.type,
      path: source.path,
      url: source.url,
      radarDataUpdatedAt,
      dataSemantics: 'site_structured_data',
      isSample: false,
      isLiveSiteData: source.type === 'allowed_live_url',
      isLocalSiteData: source.type === 'local_file'
    },
    siteData: options.compact ? extractCompactSiteData(radarData) : extractSiteData(radarData),
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
      '该输入来自站内结构化数据。',
      '该输入不包含 API key 或私人数据。',
      '该输入不得直接写入生产数据或前端展示。'
    ]
  };
  if (options.compact) {
    artifact.compaction = {
      enabled: true,
      maxListItems: DEFAULT_MAX_LIST_ITEMS,
      sourceSemantics: 'site_structured_data_compact_summary',
      omittedLargeFields: [
        'historical arrays',
        'chart arrays',
        'raw recovery dumps',
        'raw realtime dumps',
        'verbose source diagnostics',
        'full action queues'
      ],
      noteZh: '该输入已压缩，仅保留手动外部 AI 解释所需的站内结构化摘要。'
    };
  }
  return artifact;
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

  const artifact = buildManualInputArtifact(radarData, source, options);
  try {
    await writeArtifact(options.output, artifact);
  } catch (error) {
    fail(error.message);
    return;
  }

  const outputText = `${JSON.stringify(artifact, null, 2)}\n`;
  console.log('External AI manual input artifact: PASS');
  console.log(`input: ${options.sourceUrl || options.input}`);
  console.log(`output: ${options.output}`);
  console.log(`sourceType: ${artifact.source.type}`);
  console.log(`radarDataUpdatedAt: ${artifact.source.radarDataUpdatedAt || 'null'}`);
  console.log(`compact: ${options.compact ? 'true' : 'false'}`);
  if (options.compact) {
    console.log(`approxBytes: ${Buffer.byteLength(outputText, 'utf8')}`);
    console.log(`approxChars: ${outputText.length}`);
  }
  console.log('productionDataWritten: false');
  console.log('frontendDisplayChanged: false');
  console.log('secretsRead: false');
  console.log('apiCalled: false');
}

await main();
