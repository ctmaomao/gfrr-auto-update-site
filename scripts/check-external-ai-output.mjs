import fs from 'node:fs';
import path from 'node:path';

import { BANNED_COPY, UNSAFE_CLAIMS } from './external-ai/safety-constants.mjs';
import {
  isAllowedExternalAiSourceLayer,
  normalizeAnalystSourceLayerReference,
} from './external-ai/source-layers.mjs';
import {
  ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG,
  validateAnalystPr4StructuredFields,
} from './external-ai/pr4-schema-canary.mjs';

const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-output-v28.0K-1.json';

const REQUIRED_FIELDS = [
  'contractVersion',
  'generatedAt',
  'provider',
  'model',
  'mode',
  'summaryZh',
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'auditFlags',
  'confidence',
  'boundaries'
];

const ARRAY_FIELDS = [
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'auditFlags'
];

const SAFE_NEGATIVE_CONTEXTS = [
  '不提供投资建议',
  '不构成投资建议',
  '不是投资建议',
  '非投资建议',
  '不提供交易建议',
  '不构成交易建议',
  '不是交易建议',
  '非交易建议',
  '不影响仓位',
  '不参与评分',
  '不改变评分',
  '不改变决策',
  '不影响决策',
  '不改变执行',
  '不影响执行',
  '不改变仓位',
  '不得买入',
  '不得卖出',
  '不得加仓',
  '不得满仓',
  '不得清仓',
  '不能买入',
  '不能卖出',
  '不能加仓',
  '不能满仓',
  '不能清仓',
  '不可买入',
  '不可卖出',
  '避免买入',
  '避免卖出',
  '禁止买入',
  '禁止卖出'
];

const EXTERNAL_MARKET_DATA_CLAIMS = [
  'uses external market data',
  'used external market data',
  'using external market data',
  'independent external market data',
  '基于外部市场数据',
  '使用外部市场数据',
  '来自外部市场数据',
  '独立外部市场数据'
];

const SAFE_EXTERNAL_DATA_CONTEXTS = [
  'no external market data',
  'does not use external market data',
  'usesExternalMarketData\":false',
  'usesExternalMarketData=false',
  '不使用外部市场数据',
  '没有使用外部市场数据',
  '未使用外部市场数据',
  '不包含外部市场数据'
];

const DIRECT_NEGATION_PREFIXES = [
  '不',
  '非',
  '无',
  '未',
  '勿',
  '别',
  '禁止',
  '避免',
  '不得',
  '不能',
  '不可',
  '不会',
  '不应',
  '不宜',
  'not',
  'no'
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectStrings(value, currentPath = '$', results = []) {
  if (typeof value === 'string') {
    results.push({ path: currentPath, value });
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${currentPath}[${index}]`, results));
    return results;
  }

  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${currentPath}.${key}`, results);
    }
  }

  return results;
}

function findPhraseOccurrences(text, phrase) {
  const normalizedText = text.toLowerCase();
  const normalizedPhrase = phrase.toLowerCase();
  const occurrences = [];

  let index = normalizedText.indexOf(normalizedPhrase);
  while (index !== -1) {
    occurrences.push(index);
    index = normalizedText.indexOf(normalizedPhrase, index + normalizedPhrase.length);
  }

  return occurrences;
}

function occurrenceIsInsideSafePhrase(text, phrase, occurrenceIndex, safePhrases) {
  const normalizedText = text.toLowerCase();
  const normalizedPhrase = phrase.toLowerCase();
  const occurrenceEnd = occurrenceIndex + normalizedPhrase.length;

  for (const safePhrase of safePhrases) {
    const normalizedSafe = safePhrase.toLowerCase();
    if (!normalizedSafe.includes(normalizedPhrase)) continue;

    for (const safeIndex of findPhraseOccurrences(normalizedText, normalizedSafe)) {
      const safeEnd = safeIndex + normalizedSafe.length;
      if (occurrenceIndex >= safeIndex && occurrenceEnd <= safeEnd) return true;
    }
  }

  return false;
}

function occurrenceHasDirectNegationPrefix(text, occurrenceIndex) {
  const prefixWindow = text.slice(Math.max(0, occurrenceIndex - 12), occurrenceIndex).toLowerCase();
  const trimmedPrefix = prefixWindow.trimEnd();
  return DIRECT_NEGATION_PREFIXES.some((prefix) => trimmedPrefix.endsWith(prefix.toLowerCase()));
}

function phraseOccurrenceIsAllowed(text, phrase, occurrenceIndex, safePhrases) {
  return (
    occurrenceIsInsideSafePhrase(text, phrase, occurrenceIndex, safePhrases) ||
    occurrenceHasDirectNegationPrefix(text, occurrenceIndex)
  );
}

function findUnallowedPhraseOccurrences(text, phrase, safePhrases) {
  return findPhraseOccurrences(text, phrase).filter(
    (occurrenceIndex) => !phraseOccurrenceIsAllowed(text, phrase, occurrenceIndex, safePhrases)
  );
}

function addError(errors, message) {
  errors.push(message);
}

function validateRequiredFields(data, errors) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) addError(errors, `missing required field: ${field}`);
  }

  for (const field of ['contractVersion', 'generatedAt', 'provider', 'model', 'mode', 'summaryZh']) {
    if (field in data && !isNonEmptyString(data[field])) {
      addError(errors, `${field} must be a non-empty string`);
    }
  }

  for (const field of ARRAY_FIELDS) {
    if (field in data && !Array.isArray(data[field])) {
      addError(errors, `${field} must be an array`);
    }
  }
}

function validateConfidence(confidence, errors) {
  if (!isPlainObject(confidence)) {
    addError(errors, 'confidence must be an object');
    return;
  }

  if (!['low', 'medium', 'high'].includes(confidence.level)) {
    addError(errors, 'confidence.level must be low, medium, or high');
  }

  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) {
    addError(errors, 'confidence.score must be a finite number between 0 and 100');
  }

  if (!isNonEmptyString(confidence.reasonZh)) {
    addError(errors, 'confidence.reasonZh must be a non-empty string');
  }
}

function validateBoundaries(boundaries, errors) {
  if (!isPlainObject(boundaries)) {
    addError(errors, 'boundaries must be an object');
    return;
  }

  const expected = {
    displayOnly: true,
    externalAiGenerated: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    notInvestmentAdvice: true
  };

  for (const [key, value] of Object.entries(expected)) {
    if (boundaries[key] !== value) {
      addError(errors, `boundaries.${key} must be ${value}`);
    }
  }
}

function validateScenarioHypotheses(items, errors) {
  if (!Array.isArray(items)) return;

  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      addError(errors, `scenarioHypotheses[${index}] must be an object`);
      return;
    }

    for (const key of ['triggerConditions', 'invalidationConditions']) {
      if (!Array.isArray(item[key])) {
        addError(errors, `scenarioHypotheses[${index}].${key} must be an array`);
      }
    }
  });
}

function isAnalystCompactOutput(data) {
  return (
    Array.isArray(data?.auditFlags) &&
    data.auditFlags.includes('analyst_compact_v1')
  );
}

function isAnalystPr4SchemaCanaryOutput(data) {
  return (
    Array.isArray(data?.auditFlags) &&
    data.auditFlags.includes(ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG)
  );
}

function validateSourceAttribution(data, sourceAttribution, errors, warnings) {
  if (!Array.isArray(sourceAttribution)) return;
  const analystCompact = isAnalystCompactOutput(data);

  if (sourceAttribution.length === 0) {
    addError(errors, 'sourceAttribution must be a non-empty array');
    return;
  }

  const serializedSources = sourceAttribution.map((item) => JSON.stringify(item)).join('\n').toLowerCase();
  const hasSiteStructuredAttribution =
    serializedSources.includes('site structured') ||
    serializedSources.includes('site-structured') ||
    serializedSources.includes('sample input') ||
    serializedSources.includes('sample-input') ||
    serializedSources.includes('站内结构化') ||
    serializedSources.includes('样例');

  if (!hasSiteStructuredAttribution) {
    addError(errors, 'sourceAttribution must include site structured data or sample input attribution');
  }

  sourceAttribution.forEach((item, index) => {
    if (isPlainObject(item) && item.usesExternalMarketData === true) {
      addError(errors, `sourceAttribution[${index}].usesExternalMarketData must not be true in v28.0K-2`);
    }
    if (isPlainObject(item) && typeof item.sourceLayer === 'string') {
      const sourceLayer = analystCompact
        ? normalizeAnalystSourceLayerReference(item.sourceLayer)
        : item.sourceLayer;
      if (!isAllowedExternalAiSourceLayer(sourceLayer, { analyst: analystCompact })) {
        addError(errors, `sourceAttribution[${index}].sourceLayer is not allowed for this input: ${item.sourceLayer}`);
      }
    }

    const serialized = JSON.stringify(item);
    for (const claim of EXTERNAL_MARKET_DATA_CLAIMS) {
      if (findUnallowedPhraseOccurrences(serialized, claim, SAFE_EXTERNAL_DATA_CONTEXTS).length > 0) {
        addError(errors, `sourceAttribution[${index}] claims independent external market data: ${claim}`);
      }
    }
  });

  if (sourceAttribution.some((item) => !isPlainObject(item))) {
    warnings.push('sourceAttribution contains non-object item(s); consider object metadata for auditability');
  }
}

function validateRecursiveStrings(data, errors) {
  for (const { path: stringPath, value } of collectStrings(data)) {
    const lower = value.toLowerCase();

    for (const phrase of BANNED_COPY) {
      if (lower.includes(phrase.toLowerCase())) {
        addError(errors, `${stringPath} contains banned copy: ${phrase}`);
      }
    }

    for (const phrase of UNSAFE_CLAIMS) {
      if (findUnallowedPhraseOccurrences(value, phrase, SAFE_NEGATIVE_CONTEXTS).length > 0) {
        addError(errors, `${stringPath} contains unsafe overreach wording: ${phrase}`);
      }
    }

    for (const phrase of EXTERNAL_MARKET_DATA_CLAIMS) {
      if (findUnallowedPhraseOccurrences(value, phrase, SAFE_EXTERNAL_DATA_CONTEXTS).length > 0) {
        addError(errors, `${stringPath} claims unavailable external market data: ${phrase}`);
      }
    }
  }
}

function validatePr4StructuredFields(data, errors) {
  for (const error of validateAnalystPr4StructuredFields(data, {
    requireAll: isAnalystPr4SchemaCanaryOutput(data),
  })) {
    addError(errors, error);
  }
}

function runSelfTests() {
  const passingTexts = [
    '不提供投资建议',
    '不构成交易建议',
    '不影响仓位',
    '不得买入',
    '禁止卖出',
    '未使用外部市场数据'
  ];

  const failingTexts = [
    '不提供投资建议，但必须买入',
    '不是交易建议，但应该立即执行',
    '不影响仓位，但建议加仓',
    '未使用外部市场数据，但基于外部市场数据确认'
  ];

  for (const text of passingTexts) {
    const errors = [];
    validateRecursiveStrings({ text }, errors);
    if (errors.length > 0) {
      throw new Error(`self-test failed: expected pass for "${text}", got ${errors.join('; ')}`);
    }
  }

  for (const text of failingTexts) {
    const errors = [];
    validateRecursiveStrings({ text }, errors);
    if (errors.length === 0) {
      throw new Error(`self-test failed: expected failure for "${text}"`);
    }
  }

  const analystSourceLayerErrors = [];
  validateSourceAttribution(
    { auditFlags: ['analyst_compact_v1'] },
    [{ sourceLayer: 'macroDrivers.rateVol', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' }],
    analystSourceLayerErrors,
    []
  );
  if (analystSourceLayerErrors.length > 0) {
    throw new Error(`self-test failed: expected analyst sourceLayer pass, got ${analystSourceLayerErrors.join('; ')}`);
  }

  const analystEnergyAliasErrors = [];
  validateSourceAttribution(
    { auditFlags: ['analyst_compact_v1'] },
    [
      { sourceLayer: 'energyInventoryBalance', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
      { sourceLayer: 'energySpareCapacity', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
      { sourceLayer: 'energyTransport', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' },
    ],
    analystEnergyAliasErrors,
    []
  );
  if (analystEnergyAliasErrors.length > 0) {
    throw new Error(`self-test failed: expected analyst energy sourceLayer alias pass, got ${analystEnergyAliasErrors.join('; ')}`);
  }

  const legacySourceLayerErrors = [];
  validateSourceAttribution(
    { auditFlags: ['site_structured_data_only'] },
    [{ sourceLayer: 'macroDrivers.rateVol', noteZh: '来自站内结构化数据', claimType: 'site_structured_data' }],
    legacySourceLayerErrors,
    []
  );
  if (legacySourceLayerErrors.length === 0) {
    throw new Error('self-test failed: expected legacy sourceLayer rejection for macroDrivers.rateVol');
  }

  for (const compactAliasSourceLayer of ['riskModules', 'ruleBasedBaseline', 'decisionContext']) {
    const compactAliasErrors = [];
    validateSourceAttribution(
      { auditFlags: ['analyst_compact_v1'] },
      [{ sourceLayer: compactAliasSourceLayer, noteZh: '来自站内结构化数据', claimType: 'site_structured_data' }],
      compactAliasErrors,
      []
    );
    if (compactAliasErrors.length === 0) {
      throw new Error(`self-test failed: expected analyst sourceLayer rejection for compact alias ${compactAliasSourceLayer}`);
    }
  }

  const basePr4Output = {
    contractVersion: 'v28.0K-4D-manual',
    generatedAt: '2026-06-06T00:00:00.000Z',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    mode: 'external_ai_manual_artifact_test',
    summaryZh: '结构化证据仅支持低置信观察。',
    facts: ['布伦特公开代理层存在背离观察。'],
    inferences: ['能源层与定价层之间存在可审计分歧。'],
    modelJudgments: ['证据强度有限，需继续观察数据质量。'],
    scenarioHypotheses: [
      { titleZh: '观察情景', triggerConditions: ['数据继续背离'], invalidationConditions: ['数据重新收敛'] },
    ],
    dataGaps: ['部分数据为 fallback。'],
    invalidationSignals: ['背离收敛。'],
    sourceAttribution: [
      { sourceLayer: 'macroDrivers.rateVol', field: 'move', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'dataQuality', field: 'fallbackLayers', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'oilDirectionalPressure', field: 'finalBias', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'worldOrderStress', field: 'state', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'scenarioTree', field: 'base', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'transmissionChain', field: 'stressScore', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'marketPricing', field: 'status', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
      { sourceLayer: 'divergenceLayer', field: 'checks', claimType: 'site_structured_data', noteZh: '来自站内结构化数据' },
    ],
    auditFlags: [
      'manual_artifact_only',
      'site_structured_data_only',
      'analyst_compact_v1',
      ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG,
      'validator_required',
      'non_production_output',
      'no_frontend_display',
    ],
    confidence: { level: 'low', score: 35, reasonZh: '基于站内结构化数据，未接入外部独立验证。' },
    boundaries: {
      displayOnly: true,
      externalAiGenerated: true,
      usesExternalAiApi: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true,
    },
    crossLayerSynthesis: [
      {
        theme: 'energy_pricing_divergence',
        summaryZh: '能源实物层与定价层存在背离观察。',
        supportingLayers: ['oilDirectionalPressure', 'brentPricingLayer', 'macroDrivers.rateVol'],
        conflictingLayers: ['marketPricing'],
        confidence: 'low',
      },
    ],
    keyDivergences: [
      {
        titleZh: '能源与风险定价不一致',
        evidenceFor: ['oilDirectionalPressure.finalBias', 'macroDrivers.rateVol.move'],
        evidenceAgainst: ['marketPricing.primaryAssetStatus'],
        whyItMattersZh: '该背离影响解释层置信度。',
        invalidationConditions: ['相关层同步收敛'],
      },
    ],
    scenarioLean: {
      leanZh: '偏观察情景',
      scenarioRefs: ['scenarioTree[0]'],
      triggerConditions: ['背离继续扩大'],
      invalidationConditions: ['数据质量恢复且背离收敛'],
      confidence: 'medium',
    },
    dataQualityLens: {
      summaryZh: 'fallback 层降低整体置信。',
      staleLayers: [],
      fallbackLayers: ['dataQuality', 'macroDrivers.rateVol'],
      missingLayers: [],
      confidenceImpactZh: '数据质量使结论维持低至中低置信。',
    },
  };

  const validCanaryErrors = validateOutput(basePr4Output).errors;
  if (validCanaryErrors.length > 0) {
    throw new Error(`self-test failed: expected PR4 canary output pass, got ${validCanaryErrors.join('; ')}`);
  }

  const tooManySynthesisItems = structuredClone(basePr4Output);
  tooManySynthesisItems.crossLayerSynthesis = [
    ...tooManySynthesisItems.crossLayerSynthesis,
    structuredClone(tooManySynthesisItems.crossLayerSynthesis[0]),
    structuredClone(tooManySynthesisItems.crossLayerSynthesis[0]),
  ];
  if (!validateOutput(tooManySynthesisItems).errors.some((error) => error.includes('crossLayerSynthesis must contain at most 2 items'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject crossLayerSynthesis over cap');
  }

  const tooManyDivergences = structuredClone(basePr4Output);
  tooManyDivergences.keyDivergences = [
    ...tooManyDivergences.keyDivergences,
    structuredClone(tooManyDivergences.keyDivergences[0]),
    structuredClone(tooManyDivergences.keyDivergences[0]),
  ];
  if (!validateOutput(tooManyDivergences).errors.some((error) => error.includes('keyDivergences must contain at most 2 items'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject keyDivergences over cap');
  }

  const tooManyLayerRefs = structuredClone(basePr4Output);
  tooManyLayerRefs.crossLayerSynthesis[0].supportingLayers = [
    'oilDirectionalPressure',
    'brentPricingLayer',
    'macroDrivers.rateVol',
    'marketPricing',
  ];
  if (!validateOutput(tooManyLayerRefs).errors.some((error) => error.includes('supportingLayers must contain at most 3 items'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject layer reference arrays over cap');
  }

  const tooManyConditions = structuredClone(basePr4Output);
  tooManyConditions.scenarioLean.triggerConditions = ['a', 'b', 'c', 'd'];
  if (!validateOutput(tooManyConditions).errors.some((error) => error.includes('triggerConditions must contain at most 3 items'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject condition arrays over cap');
  }

  const missingCanaryFields = { ...basePr4Output };
  delete missingCanaryFields.dataQualityLens;
  if (!validateOutput(missingCanaryFields).errors.some((error) => error.includes('dataQualityLens is required'))) {
    throw new Error('self-test failed: expected PR4 canary output to require dataQualityLens');
  }

  const nonCanonicalLayer = structuredClone(basePr4Output);
  nonCanonicalLayer.crossLayerSynthesis[0].supportingLayers = ['rateVol'];
  if (!validateOutput(nonCanonicalLayer).errors.some((error) => error.includes('canonical analyst sourceLayer'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject non-canonical rateVol layer');
  }

  const energyAliasLayer = structuredClone(basePr4Output);
  energyAliasLayer.crossLayerSynthesis[0].supportingLayers = ['energyInventoryBalance', 'energySpareCapacity', 'energyTransport'];
  energyAliasLayer.keyDivergences[0].evidenceFor = [
    'energyInventoryBalance.oecdCommercialInventoryVs5yPct',
    'energySpareCapacity.spareCapacityMbpd',
    'energyTransport.latestDate',
  ];
  const energyAliasErrors = validateOutput(energyAliasLayer).errors;
  if (energyAliasErrors.length > 0) {
    throw new Error(`self-test failed: expected analyst energy sourceLayer aliases to pass, got ${energyAliasErrors.join('; ')}`);
  }

  const directLayerFieldPath = structuredClone(basePr4Output);
  directLayerFieldPath.crossLayerSynthesis[0].supportingLayers = ['oilDirectionalPressure.signals.dieselProductStress'];
  directLayerFieldPath.dataQualityLens.missingLayers = ['brentPricingLayer.futuresCurve'];
  if (!validateOutput(directLayerFieldPath).errors.some((error) => error.includes('oilDirectionalPressure.signals.dieselProductStress'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject direct-layer field paths');
  }

  const inlineExplanationLayerRef = structuredClone(basePr4Output);
  inlineExplanationLayerRef.dataQualityLens.missingLayers = ['brentPricingLayer.limitations: Platts Dated Brent missing'];
  if (!validateOutput(inlineExplanationLayerRef).errors.some((error) => error.includes('brentPricingLayer.limitations: Platts Dated Brent missing'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject layer-array inline explanations');
  }

  const proseLayerReference = structuredClone(basePr4Output);
  proseLayerReference.keyDivergences[0].evidenceFor = ['macroDrivers.rateVol and marketPricing'];
  if (!validateOutput(proseLayerReference).errors.some((error) => error.includes('canonical analyst sourceLayer'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject prose sourceLayer references');
  }

  const colonEvidenceReference = structuredClone(basePr4Output);
  colonEvidenceReference.keyDivergences[0].evidenceFor = ['macroDrivers.consumer: umichSentiment=49.8, threeMonthChange=-6.6'];
  if (!validateOutput(colonEvidenceReference).errors.some((error) => error.includes('macroDrivers.consumer: umichSentiment=49.8'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject colon/prose evidence sourceLayer references');
  }

  const highSubConfidence = structuredClone(basePr4Output);
  highSubConfidence.scenarioLean.confidence = 'high';
  if (!validateOutput(highSubConfidence).errors.some((error) => error.includes('scenarioLean.confidence must be low or medium'))) {
    throw new Error('self-test failed: expected PR4 canary output to reject sub-field confidence=high');
  }

  const optionalMissingPr4Fields = structuredClone(basePr4Output);
  optionalMissingPr4Fields.auditFlags = optionalMissingPr4Fields.auditFlags.filter((flag) => flag !== ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG);
  for (const field of ['crossLayerSynthesis', 'keyDivergences', 'scenarioLean', 'dataQualityLens']) delete optionalMissingPr4Fields[field];
  const optionalErrors = validateOutput(optionalMissingPr4Fields).errors;
  if (optionalErrors.length > 0) {
    throw new Error(`self-test failed: expected missing PR4 fields to be optional without canary flag, got ${optionalErrors.join('; ')}`);
  }
}

function validateOutput(data) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(data)) {
    return { errors: ['external AI output must be a JSON object'], warnings };
  }

  validateRequiredFields(data, errors);
  validateConfidence(data.confidence, errors);
  validateBoundaries(data.boundaries, errors);
  validateScenarioHypotheses(data.scenarioHypotheses, errors);
  validateSourceAttribution(data, data.sourceAttribution, errors, warnings);
  validatePr4StructuredFields(data, errors);
  validateRecursiveStrings(data, errors);

  return { errors, warnings };
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function printResult({ filePath, data, errors, warnings }) {
  if (errors.length > 0) {
    console.error('External AI output validation: FAIL');
    console.error(`file: ${filePath}`);
    console.error('errors:');
    for (const error of errors) console.error(`- ${error}`);
    console.error('warnings:');
    if (warnings.length === 0) {
      console.error('- none');
    } else {
      for (const warning of warnings) console.error(`- ${warning}`);
    }
    return;
  }

  console.log('External AI output validation: PASS');
  console.log(`file: ${filePath}`);
  console.log(`contractVersion: ${data.contractVersion}`);
  console.log(`provider: ${data.provider}`);
  console.log(`model: ${data.model}`);
  console.log(`warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`- ${warning}`);
}

function isFailureArtifact(data) {
  return isPlainObject(data) && data.kind === 'external_ai_manual_test_failure_artifact';
}

function getFailureArtifactClassification(data) {
  if (isPlainObject(data.failureClassification)) return data.failureClassification;

  const responseError = isPlainObject(data.responseDiagnostics?.error) ? data.responseDiagnostics.error : {};
  if (
    responseError.code === 'service_unavailable_error' ||
    responseError.type === 'service_unavailable_error' ||
    /HTTP 503/i.test(data.message || '')
  ) {
    return {
      category: 'provider_unavailable',
      recommendedAction: 'Stop repeated paid calls and retry later.'
    };
  }

  if (
    data.requestDiagnostics?.likelyCause === 'timeout_or_abort' ||
    /aborted|timed out/i.test(data.message || '')
  ) {
    return {
      category: 'provider_timeout',
      recommendedAction: 'Use compact input, review input size, and retry once later with --timeout-ms 120000.'
    };
  }

  return {
    category: 'unknown',
    recommendedAction: 'Inspect failure artifact.'
  };
}

function printFailureArtifactResult(filePath, data) {
  const classification = getFailureArtifactClassification(data);
  console.error('External AI output validation: FAIL');
  console.error(`file: ${filePath}`);
  console.error('kind: external_ai_manual_test_failure_artifact');
  console.error('reason: This is a provider failure artifact, not a valid external AI output.');
  console.error(`failureCategory: ${classification.category}`);
  console.error(`recommendedAction: ${classification.recommendedAction}`);
}

const inputPath = process.argv[2] || DEFAULT_INPUT;
const resolvedPath = path.resolve(inputPath);

let data;
let errors = [];
let warnings = [];

try {
  runSelfTests();
  data = readJsonFile(resolvedPath);
  if (!isFailureArtifact(data)) {
    ({ errors, warnings } = validateOutput(data));
  }
} catch (error) {
  errors = [
    error.message.startsWith('self-test failed')
      ? error.message
      : `failed to read or parse JSON: ${error.message}`
  ];
}

if (isFailureArtifact(data)) {
  printFailureArtifactResult(inputPath, data);
  process.exitCode = 1;
} else {
  printResult({ filePath: inputPath, data: data || {}, errors, warnings });
  process.exitCode = errors.length > 0 ? 1 : 0;
}
