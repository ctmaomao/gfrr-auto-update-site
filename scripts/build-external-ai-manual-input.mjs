import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { EXTERNAL_AI_BLOCKLIST_GROUPS } from './external-ai/safety-constants.mjs';

const INPUT_VERSION = 'v28.0K-4E-live-site-manual-input';
const COMPACT_INPUT_VERSION = 'v28.0K-4E-1-live-site-manual-input-compact';
const ANALYST_INPUT_VERSION = 'v28.0L-external-ai-analyst-input-v1';
const DEFAULT_SOURCE = 'local';
const DEFAULT_INPUT = 'data/radar-data.json';
const DEFAULT_OUTPUT = 'manual-artifacts/external-ai/manual-input-latest.json';
const DEFAULT_MAX_LIST_ITEMS = 3;
const ANALYST_TOP_N = 5;
const ANALYST_TARGET_BYTES = {
  min: 15 * 1024,
  max: 30 * 1024,
  warn: 40 * 1024,
  fail: 60 * 1024
};
const ANALYST_SIDECAR_PATHS = {
  oilDirectionalPressure: 'data/oil-directional-pressure.json',
  worldOrderStress: 'data/world-order-stress.json',
  marketPricing: 'data/market-pricing-metrics.json'
};
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
    compact: false,
    analystCompactV1: false
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
    } else if (arg === '--analyst-compact-v1') {
      options.analystCompactV1 = true;
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  if (options.compact && options.analystCompactV1) {
    throw new Error('--compact cannot be combined with --analyst-compact-v1');
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateString(value, maxLength = 220) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 18)}...[truncated]`;
}

const ANALYST_PRIORITY_FIELDS = [
  'schemaVersion',
  'contractVersion',
  'version',
  'kind',
  'module',
  'key',
  'id',
  'source',
  'sourceMode',
  'sourceStatus',
  'status',
  'state',
  'labelZh',
  'regime',
  'confidence',
  'freshness',
  'updatedAt',
  'generatedAt',
  'builtAt',
  'asOfDate',
  'observedAt',
  'latestObsDate',
  'latestMetricDate',
  'value',
  'score',
  'trend',
  'risk',
  'probability',
  'finalBias',
  'summary',
  'summaryZh',
  'oneLineConclusion',
  'interpretation',
  'limitations',
  'limitationZh',
  'notes',
  'warning',
  'warningsCount'
];

const ANALYST_OMIT_KEYS = new Set([
  'records',
  'history',
  'historical',
  'raw',
  'rawText',
  'rawHtml',
  'rawJson',
  'rawResponse',
  'rawProviderResponse',
  'rawHeaders',
  'requestHeaders',
  'responseHeaders',
  'headers',
  'apiKey',
  'authorization',
  'token',
  'secret',
  'html',
  'cache',
  'fullActionQueue',
  'actionQueue'
]);

function shouldOmitAnalystField(key) {
  const normalized = key.toLowerCase();
  if (ANALYST_OMIT_KEYS.has(key) || ANALYST_OMIT_KEYS.has(normalized)) return true;
  if (normalized.includes('header')) return true;
  if (normalized.includes('secret')) return true;
  if (normalized.includes('apikey') || normalized.includes('api_key')) return true;
  if (normalized.startsWith('raw') || normalized.endsWith('raw')) return true;
  return false;
}

function compactUnknownValue(value, options = {}) {
  const {
    depth = 0,
    maxDepth = 2,
    maxKeys = 14,
    maxListItems = DEFAULT_MAX_LIST_ITEMS,
    stringMaxLength = 220
  } = options;

  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return truncateString(value, stringMaxLength);
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.slice(0, maxListItems).map((item) => compactUnknownValue(item, {
      depth: depth + 1,
      maxDepth,
      maxKeys,
      maxListItems,
      stringMaxLength
    }));
  }

  if (depth >= maxDepth) {
    const shallow = {};
    for (const [key, item] of Object.entries(value)) {
      if (shouldOmitAnalystField(key)) continue;
      if (item === null || item === undefined || typeof item !== 'object') {
        shallow[key] = compactUnknownValue(item, {
          depth: depth + 1,
          maxDepth,
          maxKeys,
          maxListItems,
          stringMaxLength
        });
      }
      if (Object.keys(shallow).length >= maxKeys) break;
    }
    return Object.keys(shallow).length > 0 ? shallow : { omittedNestedObject: true };
  }

  const entries = Object.entries(value).filter(([key]) => !shouldOmitAnalystField(key));
  const priorityEntries = [];
  const scalarEntries = [];
  const objectEntries = [];

  for (const [key, item] of entries) {
    if (ANALYST_PRIORITY_FIELDS.includes(key)) {
      priorityEntries.push([key, item]);
    } else if (item === null || item === undefined || typeof item !== 'object') {
      scalarEntries.push([key, item]);
    } else {
      objectEntries.push([key, item]);
    }
  }

  const selected = [...priorityEntries, ...scalarEntries, ...objectEntries];
  const compact = {};
  for (const [key, item] of selected) {
    if (Object.hasOwn(compact, key)) continue;
    compact[key] = compactUnknownValue(item, {
      depth: depth + 1,
      maxDepth,
      maxKeys,
      maxListItems,
      stringMaxLength
    });
    if (Object.keys(compact).length >= maxKeys) break;
  }

  return compact;
}

function topArray(value, maxItems = ANALYST_TOP_N) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
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

function compactDailyBriefForAnalyst(radarData) {
  const dailyBrief = getOwn(radarData, 'dailyBrief');
  if (!dailyBrief) return missingMarker('dailyBrief');
  const compact = pickFields(dailyBrief, [
    'contractVersion',
    'macroState',
    'oneLineConclusion',
    'dominantRiskChain',
    'stage'
  ]) || {};
  compact.topRisks = compactUnknownValue(
    getOwn(dailyBrief, 'topRisks') ?? getOwn(radarData, 'topRisks'),
    { maxDepth: 1, maxKeys: 5, maxListItems: 2, stringMaxLength: 120 }
  );
  compact.triggers = compactUnknownValue(
    getOwn(dailyBrief, 'triggers') ?? getOwn(dailyBrief, 'keyTriggers'),
    { maxDepth: 1, maxKeys: 5, maxListItems: 2, stringMaxLength: 120 }
  );
  compact.invalidationSignals = compactUnknownValue(getOwn(dailyBrief, 'invalidationSignals'), {
    maxDepth: 1,
    maxKeys: 5,
    maxListItems: 2,
    stringMaxLength: 120
  });
  compact.evidence = compactUnknownValue(getOwn(dailyBrief, 'evidence'), {
    maxDepth: 1,
    maxKeys: 5,
    maxListItems: 3,
    stringMaxLength: 120
  });
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

function compactRuleBasedBaselineForAnalyst(radarData) {
  const layer = getOwn(radarData, 'aiInterpretationLayer');
  if (!layer) return missingMarker('aiInterpretationLayer');
  return {
    contractVersion: getOwn(layer, 'contractVersion') ?? null,
    mode: getOwn(layer, 'mode') ?? null,
    summary: truncateString(getOwn(layer, 'summary') ?? getOwn(layer, 'summaryZh') ?? '', 180),
    facts: compactUnknownValue(limitList(getOwn(layer, 'facts'), 2), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    modelJudgments: compactUnknownValue(limitList(getOwn(layer, 'modelJudgments'), 2), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    dataGaps: compactUnknownValue(limitList(getOwn(layer, 'dataGaps'), 2), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    invalidationSignals: compactUnknownValue(limitList(getOwn(layer, 'invalidationSignals'), 2), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    scenarioHypotheses: compactUnknownValue(limitList(getOwn(layer, 'scenarioHypotheses'), 1), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 1,
      stringMaxLength: 120
    })
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

function compactAllMacroDrivers(radarData) {
  const macroDrivers = getOwn(radarData, 'macroDrivers');
  if (!isPlainObject(macroDrivers)) return missingMarker('macroDrivers');
  return Object.fromEntries(
    Object.entries(macroDrivers).map(([key, value]) => [
      key,
      compactUnknownValue(value, {
        maxDepth: 0,
        maxKeys: 4,
        maxListItems: 1,
        stringMaxLength: 75
      })
    ])
  );
}

function compactRiskModulesForAnalyst(radarData) {
  const modules = getOwn(radarData, 'modules');
  const moduleTrends = getOwn(radarData, 'moduleTrends') || {};
  if (!isPlainObject(modules)) return missingMarker('modules');
  return Object.fromEntries(
    Object.entries(modules).map(([key, value]) => [
      key,
      {
        score: typeof value === 'number' ? value : getOwn(value, 'score') ?? null,
        state: isPlainObject(value) ? getOwn(value, 'state') ?? getOwn(value, 'status') ?? null : null,
        trend: getOwn(moduleTrends, key) ?? null,
        detail: typeof value === 'number' ? null : compactUnknownValue(value, {
          maxDepth: 1,
          maxKeys: 6,
          maxListItems: 2,
          stringMaxLength: 100
        })
      }
    ])
  );
}

function compactRegimeProbabilities(radarData) {
  const regimeProbabilities = getOwn(radarData, 'regimeProbabilities');
  if (!isPlainObject(regimeProbabilities)) return missingMarker('regimeProbabilities');
  return compactUnknownValue(regimeProbabilities, {
    maxDepth: 2,
    maxKeys: 12,
    maxListItems: 3,
    stringMaxLength: 160
  });
}

function compactScenarioTree(radarData) {
  const scenarioTree = getOwn(radarData, 'scenarioTree');
  if (!Array.isArray(scenarioTree)) return missingMarker('scenarioTree');
  return scenarioTree.slice(0, 4).map((scenario) => ({
    ...(pickFields(scenario, [
      'key',
      'name',
      'title',
      'titleZh',
      'probability',
      'probabilityPct',
      'confidence',
      'summary',
      'summaryZh'
    ]) || {}),
    triggers: compactUnknownValue(
      getOwn(scenario, 'triggers') ?? getOwn(scenario, 'triggerConditions'),
      { maxDepth: 1, maxKeys: 8, maxListItems: 3, stringMaxLength: 150 }
    ),
    invalidation: compactUnknownValue(
      getOwn(scenario, 'invalidation') ?? getOwn(scenario, 'invalidationConditions'),
      { maxDepth: 1, maxKeys: 8, maxListItems: 3, stringMaxLength: 150 }
    ),
    evidence: compactUnknownValue(getOwn(scenario, 'evidence'), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 3,
      stringMaxLength: 150
    })
  }));
}

function compactTransmissionChain(radarData) {
  const transmissionChain = getOwn(radarData, 'transmissionChain');
  if (!isPlainObject(transmissionChain)) return missingMarker('transmissionChain');
  return {
    ...(pickFields(transmissionChain, [
      'regimeTag',
      'stressScore',
      'leadShock',
      'pathConfidence',
      'dominantImpact',
      'summary'
    ]) || {}),
    nodes: compactUnknownValue(getOwn(transmissionChain, 'nodes'), {
      maxDepth: 1,
      maxKeys: 6,
      maxListItems: 3,
      stringMaxLength: 120
    }),
    layers: compactUnknownValue(getOwn(transmissionChain, 'layers'), {
      maxDepth: 1,
      maxKeys: 6,
      maxListItems: 3,
      stringMaxLength: 120
    }),
    decomposition: compactUnknownValue(getOwn(transmissionChain, 'decomposition'), {
      maxDepth: 1,
      maxKeys: 6,
      maxListItems: 3,
      stringMaxLength: 120
    }),
    assetImpacts: compactUnknownValue(getOwn(transmissionChain, 'assetImpacts'), {
      maxDepth: 1,
      maxKeys: 6,
      maxListItems: 3,
      stringMaxLength: 120
    })
  };
}

function compactHeatmap(radarData) {
  const heatmap = getOwn(radarData, 'heatmap');
  if (!Array.isArray(heatmap)) return missingMarker('heatmap');
  return heatmap.map((item) => compactUnknownValue(item, {
    maxDepth: 1,
    maxKeys: 8,
    maxListItems: 2,
    stringMaxLength: 110
  }));
}

function compactDivergenceLayerForAnalyst(radarData) {
  const divergenceLayer = getOwn(radarData, 'divergenceLayer');
  if (!divergenceLayer) return missingMarker('divergenceLayer');
  return {
    ...(pickFields(divergenceLayer, [
      'contractVersion',
      'state',
      'score',
      'primaryDivergence',
      'summary',
      'summaryZh'
    ]) || {}),
    checks: Array.isArray(getOwn(divergenceLayer, 'checks'))
      ? getOwn(divergenceLayer, 'checks').slice(0, 8).map((check) => ({
        ...(pickFields(check, [
          'id',
          'key',
          'category',
          'state',
          'status',
          'score'
        ]) || {}),
        summaryZh: truncateString(getOwn(check, 'summaryZh') ?? getOwn(check, 'summary') ?? '', 130),
        limitations: Array.isArray(getOwn(check, 'limitations'))
          ? getOwn(check, 'limitations').slice(0, 1).map((item) => truncateString(String(item), 120))
          : null
      }))
      : null
  };
}

function summarizeSourceStatusMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isPlainObject(item)
        ? {
          status: getOwn(item, 'status') ?? getOwn(item, 'sourceStatus') ?? null,
          state: getOwn(item, 'state') ?? null,
          updatedAt: getOwn(item, 'updatedAt') ?? getOwn(item, 'observedAt') ?? getOwn(item, 'builtAt') ?? null,
          freshness: getOwn(item, 'freshness') ?? null,
          confidence: getOwn(item, 'confidence') ?? null
        }
        : item
    ])
  );
}

function compactOilDirectionalPressure(sidecar) {
  if (!isPlainObject(sidecar)) return missingMarker('oilDirectionalPressure');
  return {
    ...(pickFields(sidecar, [
      'schemaVersion',
      'module',
      'builtAt',
      'finalBias',
      'interpretation'
    ]) || {}),
    ingestion: compactUnknownValue(getOwn(sidecar, 'ingestion'), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    seasonality: compactUnknownValue(getOwn(sidecar, 'seasonality'), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    signals: compactUnknownValue(getOwn(sidecar, 'signals'), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    evidenceTop: compactUnknownValue(topArray(getOwn(sidecar, 'evidence'), 3), {
      maxDepth: 1,
      maxKeys: 6,
      maxListItems: 3,
      stringMaxLength: 120
    })
  };
}

function compactWorldOrderSidecar(sidecar) {
  if (!isPlainObject(sidecar)) return missingMarker('worldOrderStress.sidecar');
  const externalSources = getOwn(sidecar, 'externalSources') || {};
  const gdelt = getOwn(externalSources, 'gdelt') || {};
  const gdeltSummary = getOwn(gdelt, 'summary') || {};
  return {
    ...(pickFields(sidecar, [
      'version',
      'updatedAt',
      'sourceMode',
      'score',
      'state',
      'labelZh',
      'confidence',
      'freshness'
    ]) || {}),
    marketConfirmationInput: compactUnknownValue(getOwn(sidecar, 'marketConfirmationInput'), {
      maxDepth: 1,
      maxKeys: 9,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    sourceStatuses: summarizeSourceStatusMap(getOwn(externalSources, 'sourceStatus') || externalSources),
    gdeltTopCountries: compactUnknownValue(topArray(getOwn(gdeltSummary, 'topCountries'), 3), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 3,
      stringMaxLength: 120
    }),
    dominantDrivers: compactUnknownValue(topArray(getOwn(sidecar, 'dominantDrivers'), 3), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 3,
      stringMaxLength: 140
    }),
    dimensions: compactUnknownValue(getOwn(sidecar, 'dimensions'), {
      maxDepth: 1,
      maxKeys: 5,
      maxListItems: 2,
      stringMaxLength: 100
    }),
    warningsCount: Array.isArray(getOwn(sidecar, 'warnings')) ? getOwn(sidecar, 'warnings').length : null
  };
}

function compactMarketPricingMetrics(sidecar) {
  if (!isPlainObject(sidecar)) return missingMarker('marketPricing');
  const assets = getOwn(sidecar, 'assets');
  const compactAssets = isPlainObject(assets)
    ? Object.fromEntries(
      Object.entries(assets).slice(0, 6).map(([key, value]) => [
        key,
        compactUnknownValue(value, {
          maxDepth: 1,
          maxKeys: 7,
          maxListItems: 2,
          stringMaxLength: 100
        })
      ])
    )
    : null;
  return {
    ...(pickFields(sidecar, [
      'contractVersion',
      'kind',
      'generatedAt',
      'asset',
      'windowSize',
      'sourceRecordsCount',
      'metricsRecordsCount',
      'earliestMetricDate',
      'latestMetricDate',
      'ma60Range',
      'stdDev60Range',
      'zScoreRange',
      'primaryAsset',
      'auxiliaryAssets',
      'assetOrder'
    ]) || {}),
    assets: compactAssets,
    boundaries: compactUnknownValue(getOwn(sidecar, 'boundaries'), {
      maxDepth: 1,
      maxKeys: 8,
      maxListItems: 2,
      stringMaxLength: 120
    }),
    omittedLargeFields: ['records']
  };
}

function extractStatusSummary(value) {
  if (!isPlainObject(value)) return { present: value !== null && value !== undefined };
  const status =
    getOwn(value, 'sourceStatus') ??
    getOwn(value, 'status') ??
    getOwn(value, 'state') ??
    getOwn(value, 'freshness') ??
    null;
  const source = getOwn(value, 'source') ?? getOwn(value, 'sourceMode') ?? null;
  const sourceLabel = typeof source === 'string'
    ? source
    : isPlainObject(source)
      ? getOwn(source, 'name') ?? getOwn(source, 'type') ?? getOwn(source, 'status') ?? 'object_source'
      : null;
  const summary = {
    status: typeof status === 'string' || typeof status === 'number' || typeof status === 'boolean' ? status : 'object_status',
    source: sourceLabel ? truncateString(sourceLabel, 70) : null,
    updatedAt: getOwn(value, 'updatedAt') ?? getOwn(value, 'observedAt') ?? getOwn(value, 'generatedAt') ?? null,
    staleOrFallback: typeof status === 'string'
      ? /stale|fallback|missing|manual_required|error|unavailable/iu.test(status)
      : null
  };
  return Object.fromEntries(Object.entries(summary).filter(([, item]) => item !== null));
}

function buildAnalystDataQuality(radarData, sidecars) {
  const macroDrivers = getOwn(radarData, 'macroDrivers');
  const macroDriverMap = isPlainObject(macroDrivers)
    ? Object.fromEntries(Object.entries(macroDrivers).map(([key, value]) => {
      const summary = extractStatusSummary(value);
      return [
        key,
        Object.fromEntries(
          Object.entries({
            status: summary.status,
            staleOrFallback: summary.staleOrFallback
          }).filter(([, item]) => item !== undefined && item !== null)
        )
      ];
    }))
    : missingMarker('macroDrivers');

  return {
    source: 'derived_from_site_structured_layers',
    radarDataUpdatedAt: extractRadarDataUpdatedAt(radarData),
    macroDrivers: macroDriverMap,
    regimeProbabilities: extractStatusSummary(getOwn(radarData, 'regimeProbabilities')),
    scenarioTree: {
      present: Array.isArray(getOwn(radarData, 'scenarioTree')),
      count: Array.isArray(getOwn(radarData, 'scenarioTree')) ? getOwn(radarData, 'scenarioTree').length : 0
    },
    transmissionChain: extractStatusSummary(getOwn(radarData, 'transmissionChain')),
    heatmap: {
      present: Array.isArray(getOwn(radarData, 'heatmap')),
      count: Array.isArray(getOwn(radarData, 'heatmap')) ? getOwn(radarData, 'heatmap').length : 0
    },
    divergenceLayer: extractStatusSummary(getOwn(radarData, 'divergenceLayer')),
    sidecars: Object.fromEntries(
      Object.entries(sidecars).map(([key, value]) => [key, extractStatusSummary(value)])
    )
  };
}

function compactDecisionContextForAnalyst(radarData) {
  const decisionModel = getOwn(radarData, 'decisionModel');
  const tradingSystem = getOwn(radarData, 'tradingSystem');
  if (!decisionModel && !tradingSystem && !getOwn(radarData, 'executionLock') && !getOwn(radarData, 'positionGuidance')) {
    return missingMarker('decisionContext');
  }
  return {
    readOnly: true,
    rawControlFieldsOmitted: true,
    allowedFields: {
      strategyState: getOwn(decisionModel, 'strategyState') ?? null,
      stateLabel: getOwn(decisionModel, 'stateLabel') ?? null,
      stateScore: getOwn(decisionModel, 'stateScore') ?? null,
      riskControlStatus: getOwn(getOwn(tradingSystem, 'riskControl'), 'status') ?? null
    },
    omissionReason: 'control-like text fields are removed before analyst input construction'
  };
}

function extractAnalystSiteDataV2(radarData, sidecars) {
  return {
    dailyBrief: compactDailyBriefForAnalyst(radarData),
    macroDrivers: compactAllMacroDrivers(radarData),
    riskModules: compactRiskModulesForAnalyst(radarData),
    regimeProbabilities: compactRegimeProbabilities(radarData),
    scenarioTree: compactScenarioTree(radarData),
    transmissionChain: compactTransmissionChain(radarData),
    heatmap: compactHeatmap(radarData),
    divergenceLayer: compactDivergenceLayerForAnalyst(radarData),
    brentPricingLayer: compactBrentPricingLayer(radarData),
    oilDirectionalPressure: compactOilDirectionalPressure(getOwn(sidecars, 'oilDirectionalPressure')),
    worldOrderStress: compactWorldOrderSidecar(getOwn(sidecars, 'worldOrderStress')),
    marketPricing: compactMarketPricingMetrics(getOwn(sidecars, 'marketPricing')),
    dataQuality: buildAnalystDataQuality(radarData, sidecars),
    ruleBasedBaseline: compactRuleBasedBaselineForAnalyst(radarData),
    externalAiInterpretationLayer: compactExternalAiInterpretationLayer(radarData),
    decisionContext: compactDecisionContextForAnalyst(radarData)
  };
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

function inputVersionForOptions(options) {
  if (options.analystCompactV1) return ANALYST_INPUT_VERSION;
  return options.compact ? COMPACT_INPUT_VERSION : INPUT_VERSION;
}

function inputSourceForOptions(options) {
  if (options.analystCompactV1) return 'analyst_compact_v1';
  return options.compact ? 'local_compact' : 'local_full';
}

function sourceModeForOptions(options) {
  if (options.analystCompactV1) return 'manual_analyst_compact_v1';
  return options.compact ? 'manual_local_compact' : 'manual_local_full';
}

function sourceSemanticsForOptions(options) {
  if (options.analystCompactV1) return 'site_structured_analyst_evidence_pack_v1';
  return options.compact ? 'site_structured_data_compact_summary' : 'site_structured_data';
}

function buildAnalystSourceLayerMap(siteData) {
  const macroDrivers = getOwn(siteData, 'macroDrivers');
  const macroDriverKeys = isPlainObject(macroDrivers) ? Object.keys(macroDrivers) : [];

  return {
    dailyBrief: 'dailyBrief',
    macroDrivers: 'macroDrivers.<safeKey>',
    macroDriverKeys,
    riskModules: 'modules',
    regimeProbabilities: 'regimeProbabilities',
    scenarioTree: 'scenarioTree',
    transmissionChain: 'transmissionChain',
    heatmap: 'heatmap',
    divergenceLayer: 'divergenceLayer',
    brentPricingLayer: 'brentPricingLayer',
    oilDirectionalPressure: 'odp',
    worldOrderStress: 'worldOrder',
    marketPricing: 'marketPricing',
    dataQuality: 'dataQuality',
    ruleBasedBaseline: 'aiInterpretationLayer',
    externalAiInterpretationLayer: 'externalAiInterpretationLayer',
    decisionContext: 'decisionContext.sanitized'
  };
}

function collectStringValues(value, currentPath = '$', results = []) {
  if (typeof value === 'string') {
    results.push({ path: currentPath, value });
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringValues(item, `${currentPath}[${index}]`, results));
    return results;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStringValues(item, `${currentPath}.${key}`, results);
    }
  }
  return results;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function redactText(text, summary, pathLabel) {
  let redacted = text;
  for (const group of EXTERNAL_AI_BLOCKLIST_GROUPS) {
    const phrases = [...group.phrases].sort((left, right) => right.length - left.length);
    for (const phrase of phrases) {
      const pattern = new RegExp(escapeRegExp(phrase), 'giu');
      const matches = redacted.match(pattern);
      if (!matches) continue;
      redacted = redacted.replace(pattern, `[redacted_${group.className}]`);
      summary.replacements += matches.length;
      summary.classCounts[group.className] = (summary.classCounts[group.className] || 0) + matches.length;
      summary.rewrittenPaths.add(pathLabel);
    }
  }
  return redacted;
}

function redactUnsafeStrings(value, summary, currentPath = '$') {
  if (typeof value === 'string') {
    return redactText(value, summary, currentPath);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactUnsafeStrings(item, summary, `${currentPath}[${index}]`));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactUnsafeStrings(item, summary, `${currentPath}.${key}`)
      ])
    );
  }
  return value;
}

function findBlockedString(value) {
  for (const { path: stringPath, value: text } of collectStringValues(value)) {
    for (const group of EXTERNAL_AI_BLOCKLIST_GROUPS) {
      for (const phrase of group.phrases) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          return { path: stringPath, className: group.className };
        }
      }
    }
  }
  return null;
}

function finalizeAnalystArtifact(artifact) {
  const summary = {
    enabled: true,
    blocklistSource: 'scripts/external-ai/safety-constants.mjs',
    blocklistGroups: EXTERNAL_AI_BLOCKLIST_GROUPS.map((group) => group.className),
    stringsRewritten: 0,
    replacements: 0,
    classCounts: {},
    rewrittenPaths: new Set(),
    blockedPhrasesPresentAfterRedaction: null
  };

  const redacted = redactUnsafeStrings(artifact, summary);
  summary.stringsRewritten = summary.rewrittenPaths.size;
  summary.rewrittenPaths = [...summary.rewrittenPaths].slice(0, 40);
  summary.blockedPhrasesPresentAfterRedaction = false;
  redacted.redaction = summary;

  const residual = findBlockedString(redacted);
  if (residual) {
    throw new Error(`analyst input redaction failed; residual blocked ${residual.className} at ${residual.path}`);
  }

  return redacted;
}

function siteDataForOptions(radarData, options, sidecars) {
  if (options.analystCompactV1) return extractAnalystSiteDataV2(radarData, sidecars);
  return options.compact ? extractCompactSiteData(radarData) : extractSiteData(radarData);
}

function buildManualInputArtifact(radarData, source, options, sidecars = {}) {
  const radarDataUpdatedAt = extractRadarDataUpdatedAt(radarData);
  const siteData = siteDataForOptions(radarData, options, sidecars);
  const artifact = {
    inputVersion: inputVersionForOptions(options),
    sourceMode: sourceModeForOptions(options),
    inputSource: inputSourceForOptions(options),
    sourceSemantics: sourceSemanticsForOptions(options),
    generatedAt: new Date().toISOString(),
    source: {
      type: source.type,
      path: source.path,
      url: source.url,
      radarDataUpdatedAt,
      dataSemantics: sourceSemanticsForOptions(options),
      isSample: false,
      isLiveSiteData: source.type === 'allowed_live_url',
      isLocalSiteData: source.type === 'local_file'
    },
    siteData,
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
  if (options.compact || options.analystCompactV1) {
    artifact.compaction = {
      enabled: true,
      mode: options.analystCompactV1 ? 'analyst_compact_v1' : 'local_compact',
      maxListItems: options.analystCompactV1 ? ANALYST_TOP_N : DEFAULT_MAX_LIST_ITEMS,
      sourceSemantics: sourceSemanticsForOptions(options),
      omittedLargeFields: [
        'history',
        'charts',
        'raw_dumps',
        'verbose_diagnostics',
        'action_queues'
      ],
      noteZh: '该输入已压缩，仅保留手动外部 AI 解释所需的站内结构化摘要。'
    };
  }
  if (options.analystCompactV1) {
    artifact.compaction.targetBytes = ANALYST_TARGET_BYTES;
    artifact.compaction.sidecarSources = ANALYST_SIDECAR_PATHS;
    artifact.compaction.sourceLayerMap = buildAnalystSourceLayerMap(siteData);
    artifact.compaction.redactionRequired = true;
    artifact.notesZh.push('该 analyst evidence-pack 只用于 PR2 canary 前的本地人工输入构造。');
    return finalizeAnalystArtifact(artifact);
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

async function readOptionalJson(filePath, field) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    requireObject(parsed, filePath);
    return parsed;
  } catch (error) {
    return {
      ...missingMarker(field),
      reason: `sidecar_unavailable: ${error.message}`
    };
  }
}

async function readAnalystSidecars(options) {
  if (options.sourceUrl) {
    return Object.fromEntries(
      Object.keys(ANALYST_SIDECAR_PATHS).map((key) => [
        key,
        {
          ...missingMarker(key),
          reason: 'local_sidecar_not_loaded_for_allowed_live_url'
        }
      ])
    );
  }

  return {
    oilDirectionalPressure: await readOptionalJson(
      ANALYST_SIDECAR_PATHS.oilDirectionalPressure,
      'oilDirectionalPressure'
    ),
    worldOrderStress: await readOptionalJson(
      ANALYST_SIDECAR_PATHS.worldOrderStress,
      'worldOrderStress'
    ),
    marketPricing: await readOptionalJson(
      ANALYST_SIDECAR_PATHS.marketPricing,
      'marketPricing'
    )
  };
}

async function writeArtifact(outputPath, artifact) {
  assertSafeOutputPath(outputPath);
  const absoluteOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

function buildAnalystSizeBreakdown(artifact) {
  const siteData = isPlainObject(artifact.siteData) ? artifact.siteData : {};
  return Object.entries(siteData)
    .map(([key, value]) => ({
      key,
      bytes: Buffer.byteLength(JSON.stringify(value), 'utf8')
    }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 6)
    .map((item) => `${item.key}:${item.bytes}`)
    .join(', ');
}

function assertAnalystArtifactSize(outputText, artifact) {
  const byteLength = Buffer.byteLength(outputText, 'utf8');
  if (byteLength > ANALYST_TARGET_BYTES.fail) {
    throw new Error(
      `analyst input artifact exceeds fail budget: ${byteLength} bytes; largestSiteData=${buildAnalystSizeBreakdown(artifact)}`
    );
  }
  return {
    byteLength,
    warning: byteLength > ANALYST_TARGET_BYTES.warn
      ? `analyst input artifact exceeds warning budget: ${byteLength} bytes`
      : null
  };
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

  const sidecars = options.analystCompactV1 ? await readAnalystSidecars(options) : {};
  let artifact;
  try {
    artifact = buildManualInputArtifact(radarData, source, options, sidecars);
  } catch (error) {
    fail(error.message);
    return;
  }

  const outputText = `${JSON.stringify(artifact, null, 2)}\n`;
  let sizeDiagnostics = null;
  if (options.analystCompactV1) {
    try {
      sizeDiagnostics = assertAnalystArtifactSize(outputText, artifact);
    } catch (error) {
      fail(error.message);
      return;
    }
  }

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
  console.log(`compact: ${options.compact ? 'true' : 'false'}`);
  console.log(`analystCompactV1: ${options.analystCompactV1 ? 'true' : 'false'}`);
  if (options.compact || options.analystCompactV1) {
    console.log(`approxBytes: ${Buffer.byteLength(outputText, 'utf8')}`);
    console.log(`minifiedBytes: ${Buffer.byteLength(JSON.stringify(artifact), 'utf8')}`);
    console.log(`approxChars: ${outputText.length}`);
  }
  if (sizeDiagnostics?.warning) console.log(`warning: ${sizeDiagnostics.warning}`);
  console.log('productionDataWritten: false');
  console.log('frontendDisplayChanged: false');
  console.log('secretsRead: false');
  console.log('apiCalled: false');
}

await main();
