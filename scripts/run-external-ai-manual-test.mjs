import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_ENDPOINT,
  assertManualProviderAllowed,
  createExternalAiProviderAdapter,
  normalizeExternalAiProvider
} from './external-ai/provider-adapters.mjs';
import { OPERATION_LANGUAGE_PHRASES } from './external-ai/safety-constants.mjs';
import {
  ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR,
  formatSourceLayerAllowlist,
  getAnalystSourceLayersForInput,
  isAllowedExternalAiSourceLayer,
  LEGACY_EXTERNAL_AI_SOURCE_LAYERS,
  matchAnalystSourceLayerAliasPrefix,
} from './external-ai/source-layers.mjs';
import {
  ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG,
  MAX_CROSS_LAYER_SYNTHESIS_ITEMS,
  MAX_KEY_DIVERGENCE_ITEMS,
  MAX_PR4_CONDITIONS_PER_ARRAY,
  MAX_PR4_LAYER_REFERENCES_PER_ARRAY,
  MAX_PR4_SCENARIO_REFS,
} from './external-ai/pr4-schema-canary.mjs';
import { assertManualArtifactWritePath } from './lib/check-script-helpers.mjs';

const CONTRACT_VERSION = 'v28.0K-4D';
const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-input-v28.0K-1.json';
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 90000;
const MAX_DEEPSEEK_TIMEOUT_MS = 180000;
const DEFAULT_DEEPSEEK_MAX_TOKENS = 5000;
const ANALYST_PR4_SCHEMA_CANARY_MAX_TOKENS = 5000;
const EXTERNAL_AI_ARTIFACT_PREFIX = 'manual-artifacts/external-ai/';

const DECISION_CONTEXT_OUTPUT_RULES = [
  'decisionContext is read-only background only.',
  'Do not quote or repeat any raw decisionContext fields that contain execution, operation, position, exposure, cash, target band, light/status, or trading-action language.',
  'Do not put decisionContext terms into facts.',
  'Do not put decisionContext terms into summaryZh.',
  'Do not put decisionContext terms into inferences.',
  'Do not put decisionContext terms into modelJudgments.',
  'Do not put decisionContext terms into scenarioHypotheses.',
  'Do not put decisionContext terms into invalidationSignals.',
  'Do not put decisionContext terms into sourceAttribution noteZh.',
  'If decisionContext must be referenced, only use this neutral non-operational sentence: 决策上下文仅作为只读系统状态背景，不参与本解释层判断。',
  'Do not use the Chinese phrase 执行灯 anywhere in model output.',
  'Do not use the Chinese phrase 执行 anywhere in model output unless inside the boolean boundary key affectsExecutionLock, if required by schema.',
  'Do not use 仓位, 现金, 敞口, 交易, 买入, 卖出, 加仓, 减仓, 做多, 做空, 建仓, 平仓, 止损, 止盈 in any returned string field.',
  'Do not translate execution-light concepts into synonyms such as 操作信号, 行动信号, 交易信号, 配置建议, 风险动作, 风控动作.',
  'Safety boundaries must be expressed only through boolean fields: boundaries.displayOnly=true, boundaries.affectsScoring=false, boundaries.affectsDecisionModel=false, boundaries.affectsExecutionLock=false, boundaries.affectsPositionGuidance=false, boundaries.notInvestmentAdvice=true.'
];

const FACTS_OUTPUT_RULES = [
  'facts must contain only direct observations from non-decisionContext structured data layers, unless the fact is purely about data availability or metadata.',
  'facts must not include decisionContext execution/operation fields.',
  'For local_compact, facts should preferably cite dailyBrief, divergenceLayer, brentPricingLayer, macroDrivers.consumer, dataHealth, and aiInterpretationLayer.',
  'If decisionContext exists, do not report its raw status, lights, execution flags, exposure, cash, or position details as facts.'
];

const SOURCE_ATTRIBUTION_OUTPUT_RULES = [
  'sourceAttribution may include decisionContext only as background if needed.',
  'If sourceLayer=decisionContext is used, noteZh must be neutral and must not repeat operation words.',
  'Preferred noteZh for decisionContext: 只读系统状态背景，不作为解释层结论来源。',
  'Do not use sourceAttribution.noteZh phrases containing 执行灯, 执行, 仓位, 现金, 敞口, 交易, 买入, 卖出, 加仓, 减仓.'
];

const AUDIT_FLAGS_OUTPUT_RULES = [
  'auditFlags must be neutral diagnostic tags only.',
  'For local_compact, auditFlags should include manual_artifact_only, site_structured_data_only, validator_required, non_production_output, and no_frontend_display.',
  'auditFlags must not contain execution/operation/trading words.',
  'auditFlags must not contain prose.'
];

const LOCAL_COMPACT_SOURCE_SEMANTICS_RULES = [
  'For local_compact, auditFlags should include site_structured_data_only.',
  'For local_compact, auditFlags should not include sample_input_only.',
  'For local_compact, sourceSemantics should remain site_structured_data_compact_summary if available.',
  'For local_compact, confidence should remain low or low-medium.',
  'Do not claim external web/news/market verification.',
  'Do not invent external facts.',
  'Do not treat local_compact as a trading signal.'
];

const ANALYST_COMPACT_SOURCE_SEMANTICS_RULES = [
  'For analyst_compact_v1, auditFlags should include site_structured_data_only and analyst_compact_v1.',
  'For analyst_compact_v1, sourceSemantics should remain site_structured_analyst_evidence_pack_v1 if available.',
  'For analyst_compact_v1, use only the provided site-structured analyst evidence pack. Do not browse, fetch, or claim independent external verification.',
  'For analyst_compact_v1, write cross-layer synthesis into summaryZh and inferences using at least three evidence families when available.',
  'For analyst_compact_v1, detect abnormal divergences or cross-layer contradictions in modelJudgments and inferences, and name the sourceLayer values that conflict.',
  'For analyst_compact_v1, scenarioHypotheses should express scenario lean as watch conditions with triggerConditions and invalidationConditions, not predictions.',
  'For analyst_compact_v1, use dataQuality stale/fallback/missing evidence to lower confidence and to write specific dataGaps and confidence.reasonZh.',
  'For analyst_compact_v1, sourceAttribution should include at least 8 objects and at least 5 distinct sourceLayer values, with target coverage of 8 or more layers.',
  'For analyst_compact_v1, sourceAttribution.sourceLayer must use canonical allowlist sourceLayer names, not compact evidence-pack keys; map riskModules to modules, ruleBasedBaseline to aiInterpretationLayer, and decisionContext to decisionContext.sanitized.',
  'For analyst_compact_v1, keep confidence.score in the 25-40 range by default; score above 40 requires at least 5 distinct sourceLayer values and no critical stale/fallback layers; never exceed 45.',
];

const ANALYST_PR4_STRUCTURED_OUTPUT_RULES = [
  'For analyst_compact_v1, add crossLayerSynthesis, keyDivergences, scenarioLean, and dataQualityLens at the top level.',
  'crossLayerSynthesis must be an array of {theme, summaryZh, supportingLayers, conflictingLayers, confidence}.',
  'keyDivergences must be an array of {titleZh, evidenceFor, evidenceAgainst, whyItMattersZh, invalidationConditions}.',
  'scenarioLean must be an object with {leanZh, scenarioRefs, triggerConditions, invalidationConditions, confidence}.',
  'dataQualityLens must be an object with {summaryZh, staleLayers, fallbackLayers, missingLayers, confidenceImpactZh}.',
  `For PR4 structured output budget, crossLayerSynthesis must contain at most ${MAX_CROSS_LAYER_SYNTHESIS_ITEMS} items and keyDivergences must contain at most ${MAX_KEY_DIVERGENCE_ITEMS} items.`,
  `For PR4 structured output budget, each layer/evidence array must contain at most ${MAX_PR4_LAYER_REFERENCES_PER_ARRAY} items, each trigger/invalidation array at most ${MAX_PR4_CONDITIONS_PER_ARRAY} items, and scenarioRefs at most ${MAX_PR4_SCENARIO_REFS} items.`,
  `For PR4 structured output budget, if more than ${MAX_PR4_LAYER_REFERENCES_PER_ARRAY} layer/evidence references seem relevant, choose the ${MAX_PR4_LAYER_REFERENCES_PER_ARRAY} strongest canonical references and omit the rest.`,
  'For PR4 structured output budget, keep summaryZh, whyItMattersZh, and confidenceImpactZh as short sentences rather than long paragraphs.',
  'PR4 sub-field confidence values must be low or medium only; never high and never low-medium as a literal string.',
  'PR4 layer references must use canonical sourceLayer names from the analyst allowlist, for example macroDrivers.rateVol rather than rateVol.',
  'For PR4 layer-name arrays, crossLayerSynthesis.supportingLayers, crossLayerSynthesis.conflictingLayers, dataQualityLens.staleLayers, dataQualityLens.fallbackLayers, and dataQualityLens.missingLayers are machine-readable identifier lists: each element MUST be exactly one bare canonical sourceLayer string and nothing else.',
  'For PR4 layer-name arrays, each element MUST NOT contain a field path, a colon, any explanation, or any Chinese/natural-language text; write brentPricingLayer, not brentPricingLayer.limitations: Platts Dated Brent missing; write oilDirectionalPressure, not oilDirectionalPressure.signals.dieselProductStress; write modules, not riskModules.',
  'For PR4 layer-name arrays, put all reasons and explanations in dataQualityLens.summaryZh, dataQualityLens.confidenceImpactZh, or the relevant *Zh fields, never inside a layer array element.',
  'Never use externalAiInterpretationLayer as a PR4 layer reference; it is the output being generated, not an input evidence layer. Omit that self-reference.',
  'For keyDivergences evidenceFor/evidenceAgainst, use sourceLayer.field references with a canonical sourceLayer prefix.',
  'For keyDivergences evidenceFor/evidenceAgainst, each element must be a machine-readable sourceLayer.field reference and not prose; write macroDrivers.consumer.umichSentiment, not macroDrivers.consumer: umichSentiment=49.8.',
  'scenarioRefs may point to scenarioTree entries and are not sourceLayer references.',
];

const PR4_SOURCE_LAYER_ALIAS_MAP = new Map([
  ['riskModules', 'modules'],
  ['ruleBasedBaseline', 'aiInterpretationLayer'],
  ['decisionContext', 'decisionContext.sanitized'],
]);

const MACRO_DRIVER_SOURCE_LAYER_PREFIX = /^(macroDrivers\.[A-Za-z][A-Za-z0-9_]*)(.*)$/u;
const FIELD_TOKEN_AFTER_SEPARATOR = /^[\s:：,，;；-]*([A-Za-z][A-Za-z0-9_]*)/u;
const INLINE_EXPLANATION_SEPARATOR = /[:：\s]/u;

function hasSourceLayerBoundary(value, prefix) {
  const next = value[prefix.length];
  return (
    next === undefined ||
    next === '.' ||
    next === '[' ||
    next === ':' ||
    next === '：' ||
    next === ',' ||
    next === '，' ||
    next === ';' ||
    next === '；' ||
    /\s/u.test(next)
  );
}

function matchAnalystSourceLayerPrefix(reference) {
  if (typeof reference !== 'string') return null;
  const value = reference.trim();
  if (value === '') return null;

  if (isAllowedExternalAiSourceLayer(value, { analyst: true })) {
    return { sourceLayer: value, rest: '', matched: value };
  }

  const macroMatch = value.match(MACRO_DRIVER_SOURCE_LAYER_PREFIX);
  if (
    macroMatch &&
    isAllowedExternalAiSourceLayer(macroMatch[1], { analyst: true }) &&
    hasSourceLayerBoundary(value, macroMatch[1])
  ) {
    return { sourceLayer: macroMatch[1], rest: macroMatch[2] || '', matched: macroMatch[1] };
  }

  const analystAliasMatch = matchAnalystSourceLayerAliasPrefix(value);
  if (analystAliasMatch) return analystAliasMatch;

  for (const layer of [...ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR].sort((a, b) => b.length - a.length)) {
    if (value.startsWith(layer) && hasSourceLayerBoundary(value, layer)) {
      return { sourceLayer: layer, rest: value.slice(layer.length), matched: layer };
    }
  }

  for (const [alias, sourceLayer] of PR4_SOURCE_LAYER_ALIAS_MAP) {
    if (value.startsWith(alias) && hasSourceLayerBoundary(value, alias)) {
      return { sourceLayer, rest: value.slice(alias.length), matched: alias };
    }
  }

  return null;
}

function stripInlineExplanationFromFieldPath(reference) {
  const trimmed = reference.trim();
  const separatorIndex = trimmed.search(INLINE_EXPLANATION_SEPARATOR);
  if (separatorIndex === -1) return trimmed;
  return trimmed.slice(0, separatorIndex).trim();
}

function normalizeDirectPr4LayerReference(reference) {
  const match = matchAnalystSourceLayerPrefix(reference);
  return match ? match.sourceLayer : reference;
}

function normalizeEvidencePr4LayerReference(reference) {
  const match = matchAnalystSourceLayerPrefix(reference);
  if (!match) return reference;

  const rest = match.rest || '';
  if (rest === '') return match.sourceLayer;

  if (rest.startsWith('.') || rest.startsWith('[')) {
    return stripInlineExplanationFromFieldPath(`${match.sourceLayer}${rest}`);
  }

  const fieldMatch = rest.match(FIELD_TOKEN_AFTER_SEPARATOR);
  if (fieldMatch) return `${match.sourceLayer}.${fieldMatch[1]}`;
  return match.sourceLayer;
}

function enforcePr4ReferenceArrayCap(container, key, path, changes) {
  if (!container || !Array.isArray(container[key])) return;
  if (container[key].length <= MAX_PR4_LAYER_REFERENCES_PER_ARRAY) return;

  changes.push({
    path,
    mode: 'array_cap_enforced',
    originalCount: container[key].length,
    maxItems: MAX_PR4_LAYER_REFERENCES_PER_ARRAY,
    droppedCount: container[key].length - MAX_PR4_LAYER_REFERENCES_PER_ARRAY,
  });
  container[key] = container[key].slice(0, MAX_PR4_LAYER_REFERENCES_PER_ARRAY);
}

function normalizePr4ReferenceArray(container, key, path, changes, { allowFieldPath = false } = {}) {
  if (!container || !Array.isArray(container[key])) return;

  const seenStrings = new Set();
  const nextValues = [];
  container[key].forEach((item, index) => {
    if (typeof item !== 'string') {
      nextValues.push(item);
      return;
    }

    const input = item.trim();
    if (input.startsWith('externalAiInterpretationLayer')
      && hasSourceLayerBoundary(input, 'externalAiInterpretationLayer')) {
      changes.push({
        path: `${path}[${index}]`,
        mode: 'forbidden_self_reference_dropped',
      });
      return;
    }

    const normalized = allowFieldPath
      ? normalizeEvidencePr4LayerReference(item)
      : normalizeDirectPr4LayerReference(item);
    const trimmed = normalized.trim();
    if (trimmed !== item.trim()) {
      changes.push({
        path: `${path}[${index}]`,
        normalizedTo: trimmed,
        mode: allowFieldPath ? 'field_path_allowed' : 'bare_layer_only',
      });
    }
    if (!seenStrings.has(trimmed)) {
      seenStrings.add(trimmed);
      nextValues.push(trimmed);
    }
  });
  container[key] = nextValues;
  enforcePr4ReferenceArrayCap(container, key, path, changes);
}

function normalizePr4StructuredReferenceFields(output) {
  const changes = [];

  if (Array.isArray(output?.crossLayerSynthesis)) {
    output.crossLayerSynthesis.forEach((item, index) => {
      normalizePr4ReferenceArray(item, 'supportingLayers', `crossLayerSynthesis[${index}].supportingLayers`, changes);
      normalizePr4ReferenceArray(item, 'conflictingLayers', `crossLayerSynthesis[${index}].conflictingLayers`, changes);
    });
  }

  if (Array.isArray(output?.keyDivergences)) {
    output.keyDivergences.forEach((item, index) => {
      normalizePr4ReferenceArray(item, 'evidenceFor', `keyDivergences[${index}].evidenceFor`, changes, { allowFieldPath: true });
      normalizePr4ReferenceArray(item, 'evidenceAgainst', `keyDivergences[${index}].evidenceAgainst`, changes, { allowFieldPath: true });
    });
  }

  if (output?.dataQualityLens && typeof output.dataQualityLens === 'object' && !Array.isArray(output.dataQualityLens)) {
    normalizePr4ReferenceArray(output.dataQualityLens, 'staleLayers', 'dataQualityLens.staleLayers', changes);
    normalizePr4ReferenceArray(output.dataQualityLens, 'fallbackLayers', 'dataQualityLens.fallbackLayers', changes);
    normalizePr4ReferenceArray(output.dataQualityLens, 'missingLayers', 'dataQualityLens.missingLayers', changes);
  }

  return {
    applied: changes.length > 0,
    changeCount: changes.length,
    changedPaths: [...new Set(changes.map((change) => change.path))],
    normalizedValues: [...new Set(changes.map((change) => change.normalizedTo).filter(Boolean))],
    modes: [...new Set(changes.map((change) => change.mode))],
    cappedArrays: changes
      .filter((change) => change.mode === 'array_cap_enforced')
      .map((change) => ({
        path: change.path,
        originalCount: change.originalCount,
        maxItems: change.maxItems,
        droppedCount: change.droppedCount,
      })),
    note: 'PR4 sourceLayer references normalized to canonical machine identifiers before strict output validation.',
  };
}

const ANALYST_PR4_SCHEMA_CANARY_SOURCE_SEMANTICS_RULES = [
  `For analyst_compact_v1 PR4 schema canary, auditFlags must include ${ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG}.`,
  ...ANALYST_PR4_STRUCTURED_OUTPUT_RULES,
];

function formatUnsafeOutputPhrases() {
  return [...new Set(OPERATION_LANGUAGE_PHRASES)].join(', ');
}

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
    output: null,
    allowNetwork: false,
    validateOutput: false,
    timeoutMs: DEFAULT_DEEPSEEK_TIMEOUT_MS,
    analystPr4SchemaCanary: false
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
    } else if (arg === '--allow-network') {
      options.allowNetwork = true;
    } else if (arg === '--validate-output') {
      options.validateOutput = true;
    } else if (arg === '--analyst-pr4-schema-canary') {
      options.analystPr4SchemaCanary = true;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = parseTimeoutMs(nextValue());
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseTimeoutMs(arg.slice('--timeout-ms='.length));
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  return options;
}

function parseTimeoutMs(value) {
  if (!/^\d+$/.test(value)) throw new Error(`invalid --timeout-ms value: ${value}`);
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error(`invalid --timeout-ms value: ${value}`);
  if (timeoutMs > MAX_DEEPSEEK_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be <= ${MAX_DEEPSEEK_TIMEOUT_MS}`);
  }
  return timeoutMs;
}

function getDeepSeekMaxTokens(options = {}) {
  return options.analystPr4SchemaCanary === true
    ? ANALYST_PR4_SCHEMA_CANARY_MAX_TOKENS
    : DEFAULT_DEEPSEEK_MAX_TOKENS;
}

function getPr4SchemaCanaryCaps() {
  return {
    crossLayerSynthesisItems: MAX_CROSS_LAYER_SYNTHESIS_ITEMS,
    keyDivergenceItems: MAX_KEY_DIVERGENCE_ITEMS,
    layerReferencesPerArray: MAX_PR4_LAYER_REFERENCES_PER_ARRAY,
    conditionsPerArray: MAX_PR4_CONDITIONS_PER_ARRAY,
    scenarioRefs: MAX_PR4_SCENARIO_REFS,
  };
}

function assert(condition, errors, message) {
  if (!condition) errors.push(message);
}

function getPath(value, pathParts) {
  return pathParts.reduce((current, key) => (current && Object.hasOwn(current, key) ? current[key] : undefined), value);
}

function validateInput(input, options = {}) {
  const errors = [];

  assert(typeof input.inputVersion === 'string' && input.inputVersion.length > 0, errors, 'inputVersion must be a non-empty string');
  assert(typeof input.generatedAt === 'string' && input.generatedAt.length > 0, errors, 'generatedAt must be a non-empty string');
  assert(input.siteData && typeof input.siteData === 'object', errors, 'siteData must be an object');

  const requiredSiteDataFields = isAnalystCompactInput(input)
    ? [
      'dailyBrief',
      'macroDrivers',
      'riskModules',
      'regimeProbabilities',
      'scenarioTree',
      'transmissionChain',
      'heatmap',
      'divergenceLayer',
      'brentPricingLayer',
      'oilDirectionalPressure',
      'worldOrderStress',
      'marketPricing',
      'dataQuality',
      'ruleBasedBaseline',
      'decisionContext'
    ]
    : [
      'dailyBrief',
      'divergenceLayer',
      'brentPricingLayer',
      'aiInterpretationLayer',
      'dataHealth',
      'decisionContext'
    ];

  for (const field of requiredSiteDataFields) {
    assert(Boolean(getPath(input, ['siteData', field])), errors, `siteData.${field} is required`);
  }

  assert(Boolean(getPath(input, ['siteData', 'macroDrivers', 'consumer'])), errors, 'siteData.macroDrivers.consumer is required');

  const boundaries = input.boundaries || {};
  assert(boundaries.siteStructuredDataOnly === true, errors, 'boundaries.siteStructuredDataOnly must be true');
  assert(boundaries.noExternalMarketData === true, errors, 'boundaries.noExternalMarketData must be true');
  assert(boundaries.noPrivateUserData === true, errors, 'boundaries.noPrivateUserData must be true');
  assert(boundaries.noSecrets === true, errors, 'boundaries.noSecrets must be true');
  assert(boundaries.readOnlyContext === true, errors, 'boundaries.readOnlyContext must be true');
  if (options.analystPr4SchemaCanary === true) {
    assert(isAnalystCompactInput(input), errors, '--analyst-pr4-schema-canary requires analyst_compact_v1 input');
  }

  return errors;
}

function collectLayersAvailable(input) {
  const layers = [];
  const siteData = input.siteData || {};
  if (isAnalystCompactInput(input)) {
    return getAnalystSourceLayersForInput(input);
  }
  for (const field of ['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'aiInterpretationLayer', 'dataHealth', 'decisionContext']) {
    if (siteData[field]) layers.push(field);
  }
  if (siteData.macroDrivers?.consumer) layers.push('macroDrivers.consumer');
  return layers;
}

function isUnsafeOutputPath(outputPath) {
  try {
    assertManualArtifactWritePath(outputPath, EXTERNAL_AI_ARTIFACT_PREFIX);
    return false;
  } catch {
    return true;
  }
}

async function writeOutputFile(outputPath, text) {
  const resolvedOutput = assertManualArtifactWritePath(outputPath, EXTERNAL_AI_ARTIFACT_PREFIX);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  assertManualArtifactWritePath(resolvedOutput, EXTERNAL_AI_ARTIFACT_PREFIX);
  await fs.writeFile(resolvedOutput, text, 'utf8');
}

function buildDeepSeekSystemPrompt(input = null, promptOptions = {}) {
  const promptSemantics = input
    ? getInputPromptSemantics(input, promptOptions)
    : {
      sourceKind: 'site_structured_data',
      sourceSemanticsRules: LOCAL_COMPACT_SOURCE_SEMANTICS_RULES,
      sourceLayerAllowlist: LEGACY_EXTERNAL_AI_SOURCE_LAYERS.join(', ')
    };
  return [
    'You are a display-only external AI explanation layer for Global Financial Risk Radar manual testing.',
    'Use only the provided structured JSON input. Do not browse. Do not invent market data. Do not claim independent sources.',
    'Return valid JSON only.',
    'The entire response must be one JSON object.',
    'Return strict JSON only, with no markdown fences and no explanatory prose outside JSON.',
    'Do not output markdown.',
    'Do not output explanation outside JSON.',
    'User-facing text must be Chinese, professional, restrained, and non-sensational.',
    'Separate facts, inferences, modelJudgments, scenarioHypotheses, dataGaps, invalidationSignals, sourceAttribution, auditFlags, confidence, and boundaries.',
    'Do not provide investment advice, trading instructions, deterministic crisis claims, war probability, or world-war predictions.',
    `Global unsafe wording rule: the following Chinese phrases must not appear anywhere in any returned string field: ${formatUnsafeOutputPhrases()}.`,
    'This global unsafe wording rule applies to summaryZh, facts, inferences, modelJudgments, scenarioHypotheses, dataGaps, invalidationSignals, sourceAttribution.noteZh, auditFlags, confidence.reasonZh, and every other text field.',
    'Do not write disclaimer sentences using these unsafe phrases. Do not write 不构成交易建议 or 不构成投资建议 in any text field.',
    'Express safety boundaries only through boundaries.notInvestmentAdvice=true and the other boolean boundaries.',
    'auditFlags must contain short neutral diagnostic tags only, not prose sentences.',
    'Allowed auditFlags vocabulary includes manual_artifact_only, sample_input_only, site_structured_data_only, analyst_compact_v1, validator_required, non_production_output, and no_frontend_display.',
    'Use source-appropriate auditFlags only: sample fixture output may include sample_input_only, while live/local site structured output may include site_structured_data_only.',
    'Never include both sample_input_only and site_structured_data_only in the same output.',
    'The output is artifact-only and non-production. It must add incremental analytical value beyond restating the input fields.',
    'modelJudgments must discuss only evidence strength, data sufficiency, uncertainty, and whether a condition is watch, insufficient_data, or low_confidence.',
    'modelJudgments must not discuss trading, execution, portfolio action, exposure, cash targets, or position.',
    'decisionContext output requirements:',
    ...DECISION_CONTEXT_OUTPUT_RULES,
    'facts output requirements:',
    ...FACTS_OUTPUT_RULES,
    'sourceAttribution decisionContext requirements:',
    ...SOURCE_ATTRIBUTION_OUTPUT_RULES,
    'auditFlags output requirements:',
    ...AUDIT_FLAGS_OUTPUT_RULES,
    `${promptSemantics.sourceKind} source semantics requirements:`,
    ...promptSemantics.sourceSemanticsRules,
    'sourceAttribution must be an array of objects, not a string and not an array of strings.',
    'Each sourceAttribution object must include sourceLayer, field, claimType, and noteZh.',
    'Each sourceAttribution.noteZh must include validator-recognized attribution wording: 样例结构化输入, 站内结构化数据, or sample input.',
    'For local_file or allowed_live_url input with live-site inputVersion, use noteZh: 来自站内结构化数据 and prefer claimType: site_structured_data.',
    'Only sample fixture input may use noteZh: 来自提供的样例结构化输入 and claimType: sample_input.',
    'Do not call live site radar-data sample data. Do not write 样例输入 or 样例结构化输入 when input source is local_file or allowed_live_url.',
    'Do not use only 来自提供的结构化输入 because it may not satisfy validator attribution keyword detection.',
    'Keep claimType as one of site_structured_data, rule_based_interpretation, or sample_input.',
    `Every factual claim should map to one provided structured input layer from this allowlist: ${promptSemantics.sourceLayerAllowlist}.`,
    'sourceAttribution must cover the main factual claims and the main inference/model judgment claims.',
    'summaryZh should synthesize what the site-structured data suggests, what remains uncertain, and which evidence would invalidate the interpretation.',
    'scenarioHypotheses must be framed as watch conditions and invalidation logic, not predictions.',
    'dataGaps must be specific and useful for a reviewer.',
    'Do not claim external web, news, or market verification.',
    'generatedAt must be an ISO timestamp and is artifact metadata only. If you cannot know current time, use the input generatedAt; do not invent a market-data timestamp.',
    'Do not affect scoring, decisionModel, executionLock, positionGuidance, execution, or position.',
    'The JSON must match the external AI output contract and include boundaries.displayOnly=true, boundaries.externalAiGenerated=true, boundaries.usesExternalAiApi=true, boundaries.affectsScoring=false, boundaries.affectsDecisionModel=false, boundaries.affectsExecutionLock=false, boundaries.affectsPositionGuidance=false, boundaries.notInvestmentAdvice=true.',
    'If unsure, still return a JSON object using dataGaps and low confidence.',
    'If evidence is insufficient, state 数据不足 or 暂不足以判断.'
  ].join('\n');
}

function isAnalystCompactInput(input) {
  return (
    input?.inputSource === 'analyst_compact_v1' ||
    input?.sourceMode === 'manual_analyst_compact_v1' ||
    input?.sourceSemantics === 'site_structured_analyst_evidence_pack_v1' ||
    input?.source?.dataSemantics === 'site_structured_analyst_evidence_pack_v1' ||
    input?.compaction?.mode === 'analyst_compact_v1'
  );
}

function getInputPromptSemantics(input, promptOptions = {}) {
  const sourceType = input?.source?.type;
  const inputVersion = typeof input?.inputVersion === 'string' ? input.inputVersion : '';
  if (isAnalystCompactInput(input)) {
    const analystPr4SchemaCanary = promptOptions.analystPr4SchemaCanary === true;
    const sourceSemanticsRules = [
      ...ANALYST_COMPACT_SOURCE_SEMANTICS_RULES,
      ...(analystPr4SchemaCanary
        ? ANALYST_PR4_SCHEMA_CANARY_SOURCE_SEMANTICS_RULES
        : ANALYST_PR4_STRUCTURED_OUTPUT_RULES),
    ];
    const auditFlags = [
      'manual_artifact_only',
      'site_structured_data_only',
      'analyst_compact_v1',
      'validator_required',
      'non_production_output',
      'no_frontend_display'
    ];
    if (analystPr4SchemaCanary) auditFlags.splice(3, 0, ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG);
    return {
      sourceKind: 'site_structured_analyst_evidence_pack',
      claimType: 'site_structured_data',
      noteZh: '来自站内结构化数据',
      auditFlags,
      sourceSemanticsRules,
      sourceLayerAllowlist: formatSourceLayerAllowlist(input, { analyst: true }),
      defaultConfidence: {
        level: 'medium',
        score: 35
      },
      confidenceGuidance: 'For analyst_compact_v1 site-structured evidence packs without external independent verification, confidence.score should usually be 25-40. Use confidence.level low or medium only; treat medium as low-medium, never high. A score above 40 requires at least 5 distinct sourceLayer values, no critical stale/fallback layers, and no quality-review warning about weak attribution. Never exceed confidence.score 45. confidence.reasonZh should say 基于站内结构化数据的跨层证据包生成，未接入外部独立取数或新闻验证.'
    };
  }
  const isSiteRadarData = (
    sourceType === 'local_file' ||
    sourceType === 'allowed_live_url' ||
    input?.source?.dataSemantics === 'site_structured_data' ||
    inputVersion.includes('live-site')
  );
  if (isSiteRadarData) {
    return {
      sourceKind: 'site_structured_data',
      claimType: 'site_structured_data',
      noteZh: '来自站内结构化数据',
      auditFlags: [
        'manual_artifact_only',
        'site_structured_data_only',
        'validator_required',
        'non_production_output',
        'no_frontend_display'
      ],
      sourceSemanticsRules: LOCAL_COMPACT_SOURCE_SEMANTICS_RULES,
      sourceLayerAllowlist: LEGACY_EXTERNAL_AI_SOURCE_LAYERS.join(', '),
      defaultConfidence: {
        level: 'low',
        score: 30
      },
      confidenceGuidance: 'For live/local site structured input without external independent verification, confidence.score should usually be 20-40. Keep confidence.level low unless evidence is very strong. Do not use score 0 when structured input is usable. confidence.reasonZh should say 基于站内结构化数据，尚未接入外部独立验证.'
    };
  }
  return {
    sourceKind: 'sample_fixture',
    claimType: 'sample_input',
    noteZh: '来自提供的样例结构化输入',
    auditFlags: [
      'manual_artifact_only',
      'sample_input_only',
      'validator_required',
      'non_production_output',
      'no_frontend_display'
    ],
    sourceSemanticsRules: [],
    sourceLayerAllowlist: LEGACY_EXTERNAL_AI_SOURCE_LAYERS.join(', '),
    defaultConfidence: {
      level: 'low',
      score: 10
    },
    confidenceGuidance: 'For sample fixture input, confidence.score should usually be 10-30 when the structured fixture input is usable. Keep confidence.level low or low-medium. Do not use score 0 for usable structured fixture input, and do not overstate certainty. confidence.reasonZh may mention 样例结构化输入.'
  };
}

function buildDeepSeekUserPrompt(input, promptOptions = {}) {
  const promptSemantics = getInputPromptSemantics(input, promptOptions);
  return [
    'Return a JSON object with this shape:',
    JSON.stringify({
      contractVersion: 'v28.0K-4D-manual',
      generatedAt: 'ISO string',
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      mode: 'external_ai_manual_artifact_test',
      summaryZh: 'string',
      facts: [],
      inferences: [],
      modelJudgments: [],
      scenarioHypotheses: [
        {
          titleZh: 'string',
          triggerConditions: [],
          invalidationConditions: []
        }
      ],
      dataGaps: [],
      invalidationSignals: [],
      sourceAttribution: [
        {
          sourceLayer: 'dailyBrief',
          field: 'macroState',
          claimType: promptSemantics.claimType,
          noteZh: promptSemantics.noteZh
        }
      ],
      auditFlags: promptSemantics.auditFlags,
      confidence: {
        level: promptSemantics.defaultConfidence.level,
        score: promptSemantics.defaultConfidence.score,
        reasonZh: 'string'
      },
      boundaries: {
        displayOnly: true,
        externalAiGenerated: true,
        usesExternalAiApi: true,
        affectsScoring: false,
        affectsDecisionModel: false,
        affectsExecutionLock: false,
        affectsPositionGuidance: false,
        notInvestmentAdvice: true
      }
    }, null, 2),
    'generatedAt requirements:',
    '- generatedAt must be an ISO timestamp.',
    '- If current time is unavailable, use the input generatedAt.',
    '- Do not invent a market-data timestamp; generatedAt is artifact metadata only.',
    'global unsafe wording requirements:',
    `- The following Chinese phrases must not appear anywhere in any returned string field: ${formatUnsafeOutputPhrases()}.`,
    '- This includes summaryZh, facts, inferences, modelJudgments, scenarioHypotheses, dataGaps, invalidationSignals, sourceAttribution.noteZh, auditFlags, confidence.reasonZh, and every other text field.',
    '- Do not write disclaimer sentences using these phrases.',
    '- Do not write 不构成交易建议 or 不构成投资建议 in any text field.',
    '- Express all boundary semantics only through boundaries.notInvestmentAdvice=true, boundaries.affectsScoring=false, boundaries.affectsDecisionModel=false, boundaries.affectsExecutionLock=false, and boundaries.affectsPositionGuidance=false.',
    'modelJudgments requirements:',
    '- modelJudgments should discuss only evidence strength, data sufficiency, uncertainty, and whether a condition is watch, insufficient_data, or low_confidence.',
    '- modelJudgments must not discuss trading, execution, portfolio action, exposure, cash targets, or position.',
    'decisionContext output requirements:',
    ...DECISION_CONTEXT_OUTPUT_RULES.map((rule) => `- ${rule}`),
    'facts requirements:',
    ...FACTS_OUTPUT_RULES.map((rule) => `- ${rule}`),
    '- Good: 当前证据仅支持观察，不足以形成高置信度方向判断。',
    '- Good: 消费者慢变量与资产定价存在背离，但仍需更多数据确认。',
    '- Good: 该结论仅用于解释站内结构化数据，不改变任何系统判断。',
    '- Bad: any sentence containing 投资建议 or 交易建议.',
    '- Bad: any sentence containing 买入, 卖出, 加仓, 减仓, 仓位, or 执行.',
    'auditFlags requirements:',
    '- Use only short neutral diagnostic tags such as manual_artifact_only, sample_input_only, site_structured_data_only, analyst_compact_v1, validator_required, non_production_output, and no_frontend_display.',
    '- Use source-appropriate auditFlags only.',
    '- For sample fixture input, include sample_input_only and do not include site_structured_data_only.',
    '- For live/local site structured input, include site_structured_data_only and do not include sample_input_only.',
    '- Do not use prose sentences in auditFlags.',
    '- The global unsafe wording rule also applies to auditFlags.',
    '- Express safety boundaries only through boundaries.notInvestmentAdvice=true and other boolean boundaries.',
    ...AUDIT_FLAGS_OUTPUT_RULES.map((rule) => `- ${rule}`),
    ...promptSemantics.sourceSemanticsRules.map((rule) => `- ${rule}`),
    'sourceAttribution requirements:',
    '- sourceAttribution must be an array of objects, never a string and never an array of strings.',
    '- Each object must include sourceLayer, field, claimType, and noteZh.',
    `- sourceLayer must be one of: ${promptSemantics.sourceLayerAllowlist}.`,
    '- claimType must be one of site_structured_data, rule_based_interpretation, or sample_input.',
    '- noteZh must include validator-recognized attribution wording: 样例结构化输入, 站内结构化数据, or sample input.',
    `- This input source kind is ${promptSemantics.sourceKind}.`,
    `- For this input, use claimType: ${promptSemantics.claimType}.`,
    `- For this input, use sourceAttribution.noteZh wording: ${promptSemantics.noteZh}.`,
    '- If input source.type is local_file or allowed_live_url, do not call the input sample data.',
    '- If input source.type is local_file or allowed_live_url, do not write 样例输入 or 样例结构化输入 in any returned text field.',
    '- Use 站内结构化数据 for local/live radar-data input.',
    '- Only sample fixture input should use 来自提供的样例结构化输入 and claimType sample_input.',
    '- Do not use only 来自提供的结构化输入 because it may not satisfy validator attribution keyword detection.',
    ...SOURCE_ATTRIBUTION_OUTPUT_RULES.map((rule) => `- ${rule}`),
    '- Every factual claim should map to one of the provided non-decisionContext structured input layers unless the claim is purely about data availability or metadata.',
    `- Include enough sourceAttribution objects to cover the main facts plus the main inference/model judgment claims. Aim for at least ${promptSemantics.sourceKind === 'site_structured_analyst_evidence_pack' ? '8 sourceAttribution objects across at least 5 sourceLayer values' : 'five sourceAttribution objects across at least three sourceLayer values'} when the input supports it.`,
    '- Do not claim external web, news, or market verification.',
    'incremental value requirements:',
    '- Do not merely restate the input. Synthesize relationships across at least two provided layers when evidence exists.',
    '- summaryZh should state what the structured data suggests, what remains uncertain, and what evidence would invalidate the interpretation.',
    '- facts should be direct observations from the input.',
    '- inferences should be clearly labeled as interpretations of those facts.',
    '- modelJudgments should use evidence sufficiency language, not directional action language.',
    '- scenarioHypotheses should be watch conditions with triggerConditions and invalidationConditions, not predictions.',
    '- dataGaps should name specific missing or weak evidence.',
    'confidence requirements:',
    `- ${promptSemantics.confidenceGuidance}`,
    '- Keep confidence.level low unless evidence is very strong.',
    'Use only this structured input JSON:',
    JSON.stringify(input, null, 2)
  ].join('\n\n');
}

function buildPromptContractCheck(input, promptOptions = {}) {
  const promptSemantics = getInputPromptSemantics(input, promptOptions);
  const combinedPrompt = `${buildDeepSeekSystemPrompt(input, promptOptions)}\n\n${buildDeepSeekUserPrompt(input, promptOptions)}`;
  const requiredRules = [
    'decisionContext is read-only background only.',
    'Do not put decisionContext terms into facts.',
    'Do not put decisionContext terms into summaryZh.',
    'Do not put decisionContext terms into inferences.',
    'Do not put decisionContext terms into modelJudgments.',
    'Do not put decisionContext terms into scenarioHypotheses.',
    'Do not put decisionContext terms into invalidationSignals.',
    'Do not put decisionContext terms into sourceAttribution noteZh.',
    '决策上下文仅作为只读系统状态背景，不参与本解释层判断。',
    '执行灯',
    '操作信号',
    'site_structured_data_only',
    'facts must contain only direct observations from non-decisionContext structured data layers',
    'Preferred noteZh for decisionContext: 只读系统状态背景，不作为解释层结论来源。',
    'auditFlags must be neutral diagnostic tags only.'
  ];
  if (promptSemantics.sourceKind === 'site_structured_analyst_evidence_pack') {
    requiredRules.push(
      'site_structured_analyst_evidence_pack_v1',
      'cross-layer synthesis',
      'abnormal divergences',
      'scenario lean',
      'dataQuality stale/fallback/missing',
      'Never exceed confidence.score 45',
      'decisionContext.sanitized',
      'macroDrivers.<safeKey>',
      'crossLayerSynthesis',
      'keyDivergences',
      'scenarioLean',
      'dataQualityLens',
      'macroDrivers.rateVol rather than rateVol'
    );
    if (promptOptions.analystPr4SchemaCanary === true) {
      requiredRules.push(ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG);
    }
  } else if (promptSemantics.sourceKind === 'site_structured_data') {
    requiredRules.push('sourceSemantics should remain site_structured_data_compact_summary');
  }
  const missingRules = requiredRules.filter((rule) => !combinedPrompt.includes(rule));
  return {
    status: missingRules.length === 0 ? 'pass' : 'fail',
    checkedRules: requiredRules.length,
    missingRules
  };
}

async function runDeepSeekRequest({ input, apiKey, model, timeoutMs, maxTokens, promptOptions = {} }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}${DEEPSEEK_CHAT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildDeepSeekSystemPrompt(input, promptOptions) },
          { role: 'user', content: buildDeepSeekUserPrompt(input, promptOptions) }
        ]
      }),
      signal: controller.signal
    });

    const responseJson = await response.json();
    if (!response.ok) {
      const error = new Error(`DeepSeek API returned HTTP ${response.status}`);
      error.httpStatus = response.status;
      error.responseDiagnostics = buildResponseDiagnostics(responseJson, 'http_error');
      throw error;
    }

    return responseJson;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPromptModeSelfTestInput() {
  return {
    inputVersion: 'v28.0L-external-ai-analyst-input-v1',
    generatedAt: '2026-06-06T00:00:00.000Z',
    inputSource: 'analyst_compact_v1',
    sourceMode: 'manual_analyst_compact_v1',
    sourceSemantics: 'site_structured_analyst_evidence_pack_v1',
    boundaries: {
      siteStructuredDataOnly: true,
      noExternalMarketData: true,
      noPrivateUserData: true,
      noSecrets: true,
      readOnlyContext: true,
    },
    siteData: {
      dailyBrief: {},
      macroDrivers: { consumer: {}, rateVol: {} },
      riskModules: {},
      regimeProbabilities: {},
      scenarioTree: {},
      transmissionChain: {},
      heatmap: {},
      divergenceLayer: {},
      brentPricingLayer: {},
      oilDirectionalPressure: {},
      worldOrderStress: {},
      marketPricing: {},
      dataQuality: {},
      ruleBasedBaseline: {},
      decisionContext: {},
    },
  };
}

function runPr4ReferenceNormalizationSelfTests() {
  const sample = {
    crossLayerSynthesis: [
      {
        supportingLayers: ['oilDirectionalPressure.signals.dieselProductStress.extremeTight'],
        conflictingLayers: ['marketPricing.assets.qqq.status: risk appetite is elevated'],
      },
    ],
    keyDivergences: [
      {
        evidenceFor: ['macroDrivers.consumer: umichSentiment=49.8, threeMonthChange=-6.6'],
        evidenceAgainst: ['macroDrivers.credit: igOas=0.74, regime=wide'],
      },
    ],
    dataQualityLens: {
      staleLayers: ['ruleBasedBaseline: stale baseline note'],
      fallbackLayers: ['decisionContext: readonly background'],
      missingLayers: [
        'brentPricingLayer.limitations: Platts Dated Brent missing',
        'brentPricingLayer.limitations: Brent curve missing',
        'riskModules: module summary',
        'externalAiInterpretationLayer',
      ],
    },
    scenarioLean: {
      triggerConditions: ['keep this prose untouched'],
    },
  };

  const diagnostics = normalizePr4StructuredReferenceFields(sample);
  const expected = {
    supporting: 'oilDirectionalPressure',
    conflicting: 'marketPricing',
    evidenceFor: 'macroDrivers.consumer.umichSentiment',
    evidenceAgainst: 'macroDrivers.credit.igOas',
    stale: 'aiInterpretationLayer',
    fallback: 'decisionContext.sanitized',
    missing: ['brentPricingLayer', 'modules'],
  };

  if (sample.crossLayerSynthesis[0].supportingLayers[0] !== expected.supporting) {
    throw new Error('self-test failed: PR4 direct supportingLayers should normalize field paths to bare sourceLayer');
  }
  if (sample.crossLayerSynthesis[0].conflictingLayers[0] !== expected.conflicting) {
    throw new Error('self-test failed: PR4 direct conflictingLayers should strip inline explanations');
  }
  if (sample.keyDivergences[0].evidenceFor[0] !== expected.evidenceFor) {
    throw new Error('self-test failed: PR4 evidenceFor should normalize colon references to sourceLayer.field');
  }
  if (sample.keyDivergences[0].evidenceAgainst[0] !== expected.evidenceAgainst) {
    throw new Error('self-test failed: PR4 evidenceAgainst should normalize colon references to sourceLayer.field');
  }
  if (sample.dataQualityLens.staleLayers[0] !== expected.stale) {
    throw new Error('self-test failed: PR4 staleLayers should map ruleBasedBaseline to aiInterpretationLayer');
  }
  if (sample.dataQualityLens.fallbackLayers[0] !== expected.fallback) {
    throw new Error('self-test failed: PR4 fallbackLayers should map decisionContext to decisionContext.sanitized');
  }
  if (JSON.stringify(sample.dataQualityLens.missingLayers) !== JSON.stringify(expected.missing)) {
    throw new Error('self-test failed: PR4 missingLayers should normalize and dedupe bare sourceLayer references');
  }
  if (sample.scenarioLean.triggerConditions[0] !== 'keep this prose untouched') {
    throw new Error('self-test failed: PR4 reference normalization must not touch prose condition arrays');
  }
  if (!diagnostics.applied || diagnostics.changeCount < 8) {
    throw new Error('self-test failed: PR4 reference normalization diagnostics should record applied changes');
  }
  if (!diagnostics.modes.includes('forbidden_self_reference_dropped')) {
    throw new Error('self-test failed: PR4 self-reference removal should remain explicit in diagnostics');
  }

  const unknownReferenceSample = { dataQualityLens: { missingLayers: ['unknownLayer'] } };
  normalizePr4StructuredReferenceFields(unknownReferenceSample);
  if (unknownReferenceSample.dataQualityLens.missingLayers[0] !== 'unknownLayer') {
    throw new Error('self-test failed: unknown PR4 references must remain fail-closed for strict validation');
  }

  const overBudgetSample = {
    crossLayerSynthesis: [
      {
        supportingLayers: [
          'oilDirectionalPressure.signals.dieselProductStress.extremeTight',
          'brentPricingLayer',
          'macroDrivers.rateVol',
          'marketPricing',
        ],
        conflictingLayers: [],
      },
    ],
    keyDivergences: [
      {
        evidenceFor: [
          'dailyBrief.summaryZh',
          'divergenceLayer.primaryDivergence',
          'brentPricingLayer.futuresCurve',
          'macroDrivers.consumer.umichSentiment',
        ],
        evidenceAgainst: [],
      },
    ],
  };
  const capDiagnostics = normalizePr4StructuredReferenceFields(overBudgetSample);
  if (overBudgetSample.crossLayerSynthesis[0].supportingLayers.length !== MAX_PR4_LAYER_REFERENCES_PER_ARRAY) {
    throw new Error('self-test failed: PR4 supportingLayers should be capped before strict validation');
  }
  if (overBudgetSample.keyDivergences[0].evidenceFor.length !== MAX_PR4_LAYER_REFERENCES_PER_ARRAY) {
    throw new Error('self-test failed: PR4 evidenceFor should be capped before strict validation');
  }
  if (!capDiagnostics.cappedArrays.some((item) => item.path === 'crossLayerSynthesis[0].supportingLayers')) {
    throw new Error('self-test failed: PR4 cap diagnostics should record capped supportingLayers');
  }
  if (!capDiagnostics.modes.includes('array_cap_enforced')) {
    throw new Error('self-test failed: PR4 cap diagnostics should include array_cap_enforced mode');
  }
}

function runPromptModeSelfTests() {
  runPr4ReferenceNormalizationSelfTests();

  const input = buildPromptModeSelfTestInput();
  if (getDeepSeekMaxTokens({ analystPr4SchemaCanary: false }) !== DEFAULT_DEEPSEEK_MAX_TOKENS) {
    throw new Error('self-test failed: default analyst max_tokens must use production PR4 headroom');
  }
  if (getDeepSeekMaxTokens({ analystPr4SchemaCanary: true }) !== ANALYST_PR4_SCHEMA_CANARY_MAX_TOKENS) {
    throw new Error('self-test failed: PR4 schema canary max_tokens must use canary-only headroom');
  }

  const defaultPrompt = `${buildDeepSeekSystemPrompt(input)}\n\n${buildDeepSeekUserPrompt(input)}`;
  if (defaultPrompt.includes('do not add PR4-only fields')) {
    throw new Error('self-test failed: default analyst prompt must not keep PR4-only field ban');
  }
  if (defaultPrompt.includes(ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG)) {
    throw new Error('self-test failed: default analyst prompt must not include PR4 schema canary audit flag');
  }
  const canonicalAttributionMarkers = [
    'sourceAttribution.sourceLayer must use canonical allowlist sourceLayer names',
    'map riskModules to modules',
    'ruleBasedBaseline to aiInterpretationLayer',
    'decisionContext to decisionContext.sanitized',
  ];
  const pr4StructuredOutputMarkers = [
    'For analyst_compact_v1, add crossLayerSynthesis, keyDivergences, scenarioLean, and dataQualityLens at the top level.',
    'crossLayerSynthesis',
    'keyDivergences',
    'scenarioLean',
    'dataQualityLens',
    `crossLayerSynthesis must contain at most ${MAX_CROSS_LAYER_SYNTHESIS_ITEMS} items`,
    `keyDivergences must contain at most ${MAX_KEY_DIVERGENCE_ITEMS} items`,
    `each layer/evidence array must contain at most ${MAX_PR4_LAYER_REFERENCES_PER_ARRAY} items`,
    `choose the ${MAX_PR4_LAYER_REFERENCES_PER_ARRAY} strongest canonical references and omit the rest`,
    'each element MUST be exactly one bare canonical sourceLayer string and nothing else',
    'MUST NOT contain a field path, a colon, any explanation, or any Chinese/natural-language text',
    'write brentPricingLayer, not brentPricingLayer.limitations: Platts Dated Brent missing',
    'write oilDirectionalPressure, not oilDirectionalPressure.signals.dieselProductStress',
    'write modules, not riskModules',
    'put all reasons and explanations in dataQualityLens.summaryZh, dataQualityLens.confidenceImpactZh, or the relevant *Zh fields',
    'write macroDrivers.consumer.umichSentiment, not macroDrivers.consumer: umichSentiment=49.8',
  ];
  for (const marker of canonicalAttributionMarkers) {
    if (!defaultPrompt.includes(marker)) {
      throw new Error(`self-test failed: default analyst prompt missing canonical attribution marker ${marker}`);
    }
  }
  for (const marker of pr4StructuredOutputMarkers) {
    if (!defaultPrompt.includes(marker)) {
      throw new Error(`self-test failed: default analyst prompt missing PR4 structured output marker ${marker}`);
    }
  }

  const canaryPrompt = `${buildDeepSeekSystemPrompt(input, { analystPr4SchemaCanary: true })}\n\n${buildDeepSeekUserPrompt(input, { analystPr4SchemaCanary: true })}`;
  if (canaryPrompt.includes('do not add PR4-only fields')) {
    throw new Error('self-test failed: PR4 schema canary prompt must not keep the default PR4-only field ban');
  }
  for (const marker of [ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG, ...pr4StructuredOutputMarkers]) {
    if (!canaryPrompt.includes(marker)) {
      throw new Error(`self-test failed: PR4 schema canary prompt missing ${marker}`);
    }
  }
  for (const marker of canonicalAttributionMarkers) {
    if (!canaryPrompt.includes(marker)) {
      throw new Error(`self-test failed: PR4 schema canary prompt missing canonical attribution marker ${marker}`);
    }
  }
}

function sanitizedResponseError(responseJson) {
  const error = responseJson?.error;
  if (!error || typeof error !== 'object') return null;
  return {
    type: typeof error.type === 'string' ? error.type : null,
    code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null,
    message: typeof error.message === 'string' ? error.message : null
  };
}

function buildResponseDiagnostics(responseJson, errorType = 'provider_response') {
  const choices = Array.isArray(responseJson?.choices) ? responseJson.choices : [];
  const firstChoice = choices[0] || null;
  const message = firstChoice?.message && typeof firstChoice.message === 'object' ? firstChoice.message : null;
  const content = message?.content;
  const reasoningContent = message?.reasoning_content;
  const usage = responseJson?.usage && typeof responseJson.usage === 'object' ? responseJson.usage : null;
  const diagnostics = {
    responseId: typeof responseJson?.id === 'string' ? responseJson.id : null,
    responseModel: typeof responseJson?.model === 'string' ? responseJson.model : null,
    choicesLength: choices.length,
    firstChoiceFinishReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : null,
    firstChoiceIndex: typeof firstChoice?.index === 'number' ? firstChoice.index : null,
    firstChoiceMessageKeys: message ? Object.keys(message).sort() : [],
    hasMessage: Boolean(message),
    hasContent: typeof content === 'string' && content.length > 0,
    contentType: content === undefined ? null : typeof content,
    contentLength: typeof content === 'string' ? content.length : null,
    hasReasoningContent: typeof reasoningContent === 'string' && reasoningContent.length > 0,
    reasoningContentLength: typeof reasoningContent === 'string' ? reasoningContent.length : null,
    hasUsage: Boolean(usage),
    usageKeys: usage ? Object.keys(usage).sort() : [],
    usage: usage ? Object.fromEntries(
      Object.entries(usage).filter(([, value]) => typeof value === 'number' || typeof value === 'string' || value === null),
    ) : null,
    errorType
  };
  const responseError = sanitizedResponseError(responseJson);
  if (responseError) diagnostics.error = responseError;
  return diagnostics;
}

function extractProviderContent(responseJson) {
  const firstChoice = responseJson?.choices?.[0] || {};
  const finishReason = typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : 'unknown';
  const message = firstChoice.message && typeof firstChoice.message === 'object' ? firstChoice.message : null;
  const messageKeys = message ? Object.keys(message).sort().join(',') : 'none';
  const content = message?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }
  if (finishReason === 'length') {
    throw new Error(`DeepSeek response content missing or truncated; finish_reason=length. message_keys=${messageKeys}`);
  }
  if (finishReason === 'content_filter') {
    throw new Error(`DeepSeek response omitted by content_filter. message_keys=${messageKeys}`);
  }
  if (finishReason === 'insufficient_system_resource') {
    throw new Error(`DeepSeek response interrupted by insufficient_system_resource. message_keys=${messageKeys}`);
  }
  throw new Error(`DeepSeek response did not include message content; finish_reason=${finishReason}; message_keys=${messageKeys}`);
}

function buildFailureClassification(category, retryable, retryAfter, recommendedAction) {
  return {
    category,
    retryable,
    retryAfter,
    recommendedAction
  };
}

function classifyProviderFailure(error, responseDiagnostics = null, requestDiagnostics = null) {
  const message = error?.message || '';
  const finishReason = responseDiagnostics?.firstChoiceFinishReason || null;
  const responseErrorCode = responseDiagnostics?.error?.code || null;
  const responseErrorType = responseDiagnostics?.error?.type || null;
  const likelyCause = requestDiagnostics?.likelyCause || null;

  if (
    error?.httpStatus === 503 ||
    responseErrorCode === 'service_unavailable_error' ||
    responseErrorType === 'service_unavailable_error'
  ) {
    return buildFailureClassification(
      'provider_unavailable',
      true,
      'later',
      'Stop repeated paid calls and retry later.'
    );
  }

  if (isAbortError(error) || likelyCause === 'timeout_or_abort') {
    return buildFailureClassification(
      'provider_timeout',
      true,
      'later',
      'Use compact input, review input size, and retry once later with --timeout-ms 120000.'
    );
  }

  if (finishReason === 'content_filter' || /content_filter/i.test(message)) {
    return buildFailureClassification(
      'provider_content_filter',
      false,
      'prompt_review_required',
      'Review prompt/input. Do not retry unchanged.'
    );
  }

  if (finishReason === 'length' || /finish_reason=length/i.test(message) || /truncated/i.test(message)) {
    return buildFailureClassification(
      'provider_length_truncated',
      true,
      'after_compaction_or_token_adjustment',
      'Use compact input or reduce input before retry.'
    );
  }

  if (finishReason === 'insufficient_system_resource' || /insufficient_system_resource/i.test(message)) {
    return buildFailureClassification(
      'provider_insufficient_resource',
      true,
      'later',
      'Retry later.'
    );
  }

  if (error?.failureCategory === 'provider_invalid_json' || error instanceof SyntaxError) {
    return buildFailureClassification(
      'provider_invalid_json',
      false,
      'prompt_review_required',
      'Tighten prompt. Do not promote artifact.'
    );
  }

  if (
    responseDiagnostics &&
    responseDiagnostics.hasContent === false &&
    (/did not include message content/i.test(message) || /content missing/i.test(message))
  ) {
    return buildFailureClassification(
      'provider_empty_content',
      true,
      'later_or_prompt_review',
      'Review diagnostics and prompt before retrying.'
    );
  }

  if (responseDiagnostics?.errorType === 'http_error') {
    return buildFailureClassification(
      'provider_http_error',
      true,
      'later_or_manual_review',
      'Inspect HTTP diagnostics before retrying.'
    );
  }

  return buildFailureClassification(
    'provider_unknown_error',
    false,
    'manual_review_required',
    'Inspect failure artifact.'
  );
}

function runValidator(outputPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/check-external-ai-output.mjs', outputPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writeFailureArtifact(
  outputPath,
  stage,
  message,
  providerMetadata,
  responseDiagnostics = null,
  requestDiagnostics = null,
  failureClassification = null
) {
  const artifact = {
    contractVersion: CONTRACT_VERSION,
    kind: 'external_ai_manual_test_failure_artifact',
    generatedAt: new Date().toISOString(),
    provider: 'deepseek',
    status: 'failed',
    stage,
    message,
    providerMetadata,
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    note: 'Manual artifact only. Do not import into production data or frontend.',
    noteZh: '该 artifact 仅用于手动诊断，不得进入生产数据或前端展示。'
  };
  if (failureClassification) {
    artifact.failureClassification = {
      ...failureClassification,
      productionImpact: 'none',
      validatorAction: 'Do not run check:external-ai-output on failure artifacts; inspect diagnostics instead.'
    };
  }
  if (responseDiagnostics) artifact.responseDiagnostics = responseDiagnostics;
  if (requestDiagnostics) artifact.requestDiagnostics = requestDiagnostics;
  await writeOutputFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted/i.test(error?.message || '');
}

function buildRequestDiagnostics({ timeoutMs, maxTokens, inputText, model, provider, allowNetwork, validateOutput, outputPathSafe, likelyCause }) {
  return {
    timeoutMs,
    maxTokens,
    inputApproxBytes: Buffer.byteLength(inputText, 'utf8'),
    inputApproxChars: inputText.length,
    model,
    provider,
    allowNetwork,
    validateOutput,
    outputPathSafe,
    likelyCause
  };
}

async function runDeepSeekManualTest(options, provider, environmentProvider) {
  if (environmentProvider && environmentProvider !== 'none' && environmentProvider !== provider) {
    fail('Provider environment variables are intentionally ignored unless they match the explicit provider.');
    return;
  }

  if (options.dryRun) {
    fail('DeepSeek manual test is not dry-run. Use --provider deepseek with --allow-network, --validate-output, and --output.');
    return;
  }
  if (!options.allowNetwork) {
    fail('DeepSeek manual test requires --allow-network.');
    return;
  }
  if (!options.output) {
    fail('DeepSeek manual test requires --output to a safe artifact path.');
    return;
  }
  if (isUnsafeOutputPath(options.output)) {
    fail(`unsafe output path rejected: ${options.output}`);
    return;
  }
  if (!options.validateOutput) {
    fail('DeepSeek manual test requires --validate-output.');
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    fail('DeepSeek manual test requires DEEPSEEK_API_KEY.');
    return;
  }

  const providerAdapter = createExternalAiProviderAdapter({
    provider,
    model: options.model || DEFAULT_DEEPSEEK_MODEL,
    allowNetwork: true,
    apiKeyAvailable: true
  });
  providerAdapter.metadata.timeoutMs = options.timeoutMs;

  try {
    await providerAdapter.runManualTest();
  } catch (error) {
    fail(error.message);
    return;
  }

  let input;
  let inputText;
  try {
    inputText = await fs.readFile(options.input, 'utf8');
    input = JSON.parse(inputText);
  } catch (error) {
    fail(`failed to read input JSON: ${error.message}`);
    return;
  }

  const validationErrors = validateInput(input, options);
  if (validationErrors.length > 0) {
    fail(`invalid manual scaffold input:\n- ${validationErrors.join('\n- ')}`);
    return;
  }

  let providerOutput;
  let responseDiagnostics = null;
  const maxTokens = getDeepSeekMaxTokens(options);
  providerAdapter.metadata.maxTokens = maxTokens;
  try {
    const responseJson = await runDeepSeekRequest({
      input,
      apiKey,
      model: providerAdapter.model,
      timeoutMs: options.timeoutMs,
      maxTokens,
      promptOptions: options
    });
    responseDiagnostics = buildResponseDiagnostics(responseJson);
    const providerContent = extractProviderContent(responseJson);
    try {
      providerOutput = JSON.parse(providerContent);
    } catch (error) {
      error.failureCategory = 'provider_invalid_json';
      throw error;
    }
  } catch (error) {
    const aborted = isAbortError(error);
    const diagnostics = error.responseDiagnostics || responseDiagnostics;
    const requestDiagnostics = buildRequestDiagnostics({
      timeoutMs: options.timeoutMs,
      maxTokens,
      inputText,
      model: providerAdapter.model,
      provider,
      allowNetwork: options.allowNetwork,
      validateOutput: options.validateOutput,
      outputPathSafe: !isUnsafeOutputPath(options.output),
      likelyCause: aborted ? 'timeout_or_abort' : 'provider_response_error'
    });
    const message = aborted
      ? 'DeepSeek manual request timed out or was aborted'
      : error.message;
    const failureClassification = classifyProviderFailure(error, diagnostics, requestDiagnostics);
    await writeFailureArtifact(
      options.output,
      'provider_response',
      message,
      providerAdapter.metadata,
      diagnostics,
      requestDiagnostics,
      failureClassification
    );
    fail(`DeepSeek manual test failed before validation: ${message}`);
    return;
  }

  const pr4ReferenceNormalization = normalizePr4StructuredReferenceFields(providerOutput);

  providerOutput._manualDiagnostics = {
    providerMetadata: providerAdapter.metadata,
    responseDiagnostics,
    pr4ReferenceNormalization,
    requestDiagnostics: buildRequestDiagnostics({
      timeoutMs: options.timeoutMs,
      maxTokens,
      inputText,
      model: providerAdapter.model,
      provider,
      allowNetwork: options.allowNetwork,
      validateOutput: options.validateOutput,
      outputPathSafe: !isUnsafeOutputPath(options.output),
      likelyCause: null
    })
  };

  try {
    await writeOutputFile(options.output, `${JSON.stringify(providerOutput, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
    return;
  }

  const validator = await runValidator(options.output);
  if (validator.stdout) process.stdout.write(validator.stdout);
  if (validator.stderr) process.stderr.write(validator.stderr);
  if (validator.code !== 0) {
    fail('DeepSeek manual output failed check:external-ai-output validation. Artifact must remain hidden and non-production.');
    return;
  }

  console.log('DeepSeek manual API test: PASS');
  console.log(`artifact: ${options.output}`);
  console.log(`provider: ${providerAdapter.provider}`);
  console.log(`model: ${providerAdapter.model}`);
  console.log('productionDataWritten: false');
  console.log('frontendDisplayChanged: false');
}

async function main() {
  try {
    runPromptModeSelfTests();
  } catch (error) {
    fail(error.message);
    return;
  }

  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
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
  if (provider === 'deepseek') {
    await runDeepSeekManualTest(options, provider, normalizedEnvironmentProvider);
    return;
  }

  if (provider === 'openai') {
    fail('OpenAI manual tests are not supported in v28.0K-4D.');
    return;
  }

  if (!options.dryRun) {
    fail('K-4D provider=none only supports --dry-run. Use manual:external-ai:deepseek for explicit DeepSeek artifact tests.');
    return;
  }

  if (normalizedEnvironmentProvider !== 'none') {
    fail('K-4D is no-network for dry-run. Provider environment variables are intentionally ignored.');
    return;
  }

  try {
    assertManualProviderAllowed(provider);
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

  const validationErrors = validateInput(input, options);
  if (validationErrors.length > 0) {
    fail(`invalid manual scaffold input:\n- ${validationErrors.join('\n- ')}`);
    return;
  }

  const promptContractCheck = buildPromptContractCheck(input, options);
  if (promptContractCheck.status !== 'pass') {
    fail(`manual prompt contract check failed:\n- ${promptContractCheck.missingRules.join('\n- ')}`);
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
    promptMode: {
      analystPr4SchemaCanary: options.analystPr4SchemaCanary,
      auditFlag: options.analystPr4SchemaCanary ? ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG : null,
      maxTokens: getDeepSeekMaxTokens(options),
      outputBudgetCaps: options.analystPr4SchemaCanary ? getPr4SchemaCanaryCaps() : null
    },
    promptContractCheck,
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
    if (options.output) await writeOutputFile(options.output, outputText);
  } catch (error) {
    fail(error.message);
    return;
  }

  process.stdout.write(outputText);
}

await main();
