import {
  ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR,
  isAllowedExternalAiSourceLayer,
} from './source-layers.mjs';

export const ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG = 'analyst_pr4_schema_canary';

export const ANALYST_PR4_STRUCTURED_FIELDS = [
  'crossLayerSynthesis',
  'keyDivergences',
  'scenarioLean',
  'dataQualityLens',
];

export const MAX_CROSS_LAYER_SYNTHESIS_ITEMS = 2;
export const MAX_KEY_DIVERGENCE_ITEMS = 2;
export const MAX_PR4_LAYER_REFERENCES_PER_ARRAY = 3;
export const MAX_PR4_CONDITIONS_PER_ARRAY = 3;
export const MAX_PR4_SCENARIO_REFS = 3;

const PR4_SUBFIELD_CONFIDENCE_LEVELS = new Set(['low', 'medium']);
const MACRO_DRIVER_SOURCE_LAYER_PATTERN = /^(macroDrivers\.[A-Za-z][A-Za-z0-9_]*)(?:[.[].*)?$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isAnalystPr4SchemaCanaryOutput(data) {
  return (
    Array.isArray(data?.auditFlags) &&
    data.auditFlags.includes(ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG)
  );
}

export function extractCanonicalAnalystSourceLayer(reference) {
  if (!isNonEmptyString(reference)) return null;
  const value = reference.trim();
  if (isAllowedExternalAiSourceLayer(value, { analyst: true })) return value;

  const macroMatch = value.match(MACRO_DRIVER_SOURCE_LAYER_PATTERN);
  if (macroMatch && isAllowedExternalAiSourceLayer(macroMatch[1], { analyst: true })) {
    return macroMatch[1];
  }

  for (const layer of ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR) {
    if (value.startsWith(`${layer}.`) || value.startsWith(`${layer}[`)) return layer;
  }

  return null;
}

function addError(errors, message) {
  errors.push(message);
}

function validateRequiredString(value, path, errors) {
  if (!isNonEmptyString(value)) addError(errors, `${path} must be a non-empty string`);
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, `${path} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) addError(errors, `${path}[${index}] must be a non-empty string`);
  });
}

function validateArrayMaxLength(value, path, maxItems, errors) {
  if (Array.isArray(value) && value.length > maxItems) {
    addError(errors, `${path} must contain at most ${maxItems} items`);
  }
}

function validateLayerArray(value, path, errors, { allowFieldPath = false, maxItems = MAX_PR4_LAYER_REFERENCES_PER_ARRAY } = {}) {
  if (!Array.isArray(value)) {
    addError(errors, `${path} must be an array`);
    return;
  }
  validateArrayMaxLength(value, path, maxItems, errors);

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      addError(errors, `${path}[${index}] must be a non-empty string`);
      return;
    }
    const canonicalLayer = allowFieldPath
      ? extractCanonicalAnalystSourceLayer(item)
      : (isAllowedExternalAiSourceLayer(item.trim(), { analyst: true }) ? item.trim() : null);
    if (!canonicalLayer) {
      addError(errors, `${path}[${index}] must use a canonical analyst sourceLayer reference: ${item}`);
    }
  });
}

function validatePr4Confidence(value, path, errors) {
  if (!PR4_SUBFIELD_CONFIDENCE_LEVELS.has(value)) {
    addError(errors, `${path} must be low or medium`);
  }
}

function validateCrossLayerSynthesis(value, errors) {
  if (!Array.isArray(value)) {
    addError(errors, 'crossLayerSynthesis must be an array');
    return;
  }
  validateArrayMaxLength(value, 'crossLayerSynthesis', MAX_CROSS_LAYER_SYNTHESIS_ITEMS, errors);
  value.forEach((item, index) => {
    const path = `crossLayerSynthesis[${index}]`;
    if (!isPlainObject(item)) {
      addError(errors, `${path} must be an object`);
      return;
    }
    validateRequiredString(item.theme, `${path}.theme`, errors);
    validateRequiredString(item.summaryZh, `${path}.summaryZh`, errors);
    validateLayerArray(item.supportingLayers, `${path}.supportingLayers`, errors);
    validateLayerArray(item.conflictingLayers, `${path}.conflictingLayers`, errors);
    validatePr4Confidence(item.confidence, `${path}.confidence`, errors);
  });
}

function validateKeyDivergences(value, errors) {
  if (!Array.isArray(value)) {
    addError(errors, 'keyDivergences must be an array');
    return;
  }
  validateArrayMaxLength(value, 'keyDivergences', MAX_KEY_DIVERGENCE_ITEMS, errors);
  value.forEach((item, index) => {
    const path = `keyDivergences[${index}]`;
    if (!isPlainObject(item)) {
      addError(errors, `${path} must be an object`);
      return;
    }
    validateRequiredString(item.titleZh, `${path}.titleZh`, errors);
    validateLayerArray(item.evidenceFor, `${path}.evidenceFor`, errors, { allowFieldPath: true });
    validateLayerArray(item.evidenceAgainst, `${path}.evidenceAgainst`, errors, { allowFieldPath: true });
    validateRequiredString(item.whyItMattersZh, `${path}.whyItMattersZh`, errors);
    validateStringArray(item.invalidationConditions, `${path}.invalidationConditions`, errors);
    validateArrayMaxLength(item.invalidationConditions, `${path}.invalidationConditions`, MAX_PR4_CONDITIONS_PER_ARRAY, errors);
  });
}

function validateScenarioLean(value, errors) {
  if (!isPlainObject(value)) {
    addError(errors, 'scenarioLean must be an object');
    return;
  }
  validateRequiredString(value.leanZh, 'scenarioLean.leanZh', errors);
  validateStringArray(value.scenarioRefs, 'scenarioLean.scenarioRefs', errors);
  validateArrayMaxLength(value.scenarioRefs, 'scenarioLean.scenarioRefs', MAX_PR4_SCENARIO_REFS, errors);
  validateStringArray(value.triggerConditions, 'scenarioLean.triggerConditions', errors);
  validateArrayMaxLength(value.triggerConditions, 'scenarioLean.triggerConditions', MAX_PR4_CONDITIONS_PER_ARRAY, errors);
  validateStringArray(value.invalidationConditions, 'scenarioLean.invalidationConditions', errors);
  validateArrayMaxLength(value.invalidationConditions, 'scenarioLean.invalidationConditions', MAX_PR4_CONDITIONS_PER_ARRAY, errors);
  validatePr4Confidence(value.confidence, 'scenarioLean.confidence', errors);
}

function validateDataQualityLens(value, errors) {
  if (!isPlainObject(value)) {
    addError(errors, 'dataQualityLens must be an object');
    return;
  }
  validateRequiredString(value.summaryZh, 'dataQualityLens.summaryZh', errors);
  validateLayerArray(value.staleLayers, 'dataQualityLens.staleLayers', errors);
  validateLayerArray(value.fallbackLayers, 'dataQualityLens.fallbackLayers', errors);
  validateLayerArray(value.missingLayers, 'dataQualityLens.missingLayers', errors);
  validateRequiredString(value.confidenceImpactZh, 'dataQualityLens.confidenceImpactZh', errors);
}

export function validateAnalystPr4StructuredFields(data, options = {}) {
  const requireAll = options.requireAll === true;
  const errors = [];

  if (!isPlainObject(data)) return ['external AI output must be a JSON object'];

  if (requireAll) {
    for (const field of ANALYST_PR4_STRUCTURED_FIELDS) {
      if (!(field in data)) addError(errors, `${field} is required for ${ANALYST_PR4_SCHEMA_CANARY_AUDIT_FLAG}`);
    }
  }

  if ('crossLayerSynthesis' in data) validateCrossLayerSynthesis(data.crossLayerSynthesis, errors);
  if ('keyDivergences' in data) validateKeyDivergences(data.keyDivergences, errors);
  if ('scenarioLean' in data) validateScenarioLean(data.scenarioLean, errors);
  if ('dataQualityLens' in data) validateDataQualityLens(data.dataQualityLens, errors);

  return errors;
}

function collectLayerReferencesFromArray(value, { allowFieldPath = false } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isNonEmptyString)
    .map((reference) => ({
      reference,
      canonicalLayer: allowFieldPath
        ? extractCanonicalAnalystSourceLayer(reference)
        : (isAllowedExternalAiSourceLayer(reference.trim(), { analyst: true }) ? reference.trim() : null),
    }));
}

function collectArrayLengths(data) {
  const entries = [];
  const add = (path, value) => {
    if (Array.isArray(value)) entries.push({ path, length: value.length });
  };

  add('crossLayerSynthesis', data?.crossLayerSynthesis);
  if (Array.isArray(data?.crossLayerSynthesis)) {
    data.crossLayerSynthesis.forEach((item, index) => {
      add(`crossLayerSynthesis[${index}].supportingLayers`, item?.supportingLayers);
      add(`crossLayerSynthesis[${index}].conflictingLayers`, item?.conflictingLayers);
    });
  }

  add('keyDivergences', data?.keyDivergences);
  if (Array.isArray(data?.keyDivergences)) {
    data.keyDivergences.forEach((item, index) => {
      add(`keyDivergences[${index}].evidenceFor`, item?.evidenceFor);
      add(`keyDivergences[${index}].evidenceAgainst`, item?.evidenceAgainst);
      add(`keyDivergences[${index}].invalidationConditions`, item?.invalidationConditions);
    });
  }

  if (isPlainObject(data?.scenarioLean)) {
    add('scenarioLean.scenarioRefs', data.scenarioLean.scenarioRefs);
    add('scenarioLean.triggerConditions', data.scenarioLean.triggerConditions);
    add('scenarioLean.invalidationConditions', data.scenarioLean.invalidationConditions);
  }

  if (isPlainObject(data?.dataQualityLens)) {
    add('dataQualityLens.staleLayers', data.dataQualityLens.staleLayers);
    add('dataQualityLens.fallbackLayers', data.dataQualityLens.fallbackLayers);
    add('dataQualityLens.missingLayers', data.dataQualityLens.missingLayers);
  }

  return entries;
}

function expectedCapForPath(path) {
  if (path === 'crossLayerSynthesis') return MAX_CROSS_LAYER_SYNTHESIS_ITEMS;
  if (path === 'keyDivergences') return MAX_KEY_DIVERGENCE_ITEMS;
  if (path === 'scenarioLean.scenarioRefs') return MAX_PR4_SCENARIO_REFS;
  if (path.includes('triggerConditions') || path.includes('invalidationConditions')) return MAX_PR4_CONDITIONS_PER_ARRAY;
  return MAX_PR4_LAYER_REFERENCES_PER_ARRAY;
}

function summarizeCaps(data) {
  const arrayLengths = collectArrayLengths(data);
  const capViolations = arrayLengths
    .map((item) => ({ ...item, max: expectedCapForPath(item.path) }))
    .filter((item) => item.length > item.max);

  return {
    limits: {
      crossLayerSynthesisItems: MAX_CROSS_LAYER_SYNTHESIS_ITEMS,
      keyDivergenceItems: MAX_KEY_DIVERGENCE_ITEMS,
      layerReferencesPerArray: MAX_PR4_LAYER_REFERENCES_PER_ARRAY,
      conditionsPerArray: MAX_PR4_CONDITIONS_PER_ARRAY,
      scenarioRefs: MAX_PR4_SCENARIO_REFS,
    },
    itemCounts: {
      crossLayerSynthesis: Array.isArray(data?.crossLayerSynthesis) ? data.crossLayerSynthesis.length : 0,
      keyDivergences: Array.isArray(data?.keyDivergences) ? data.keyDivergences.length : 0,
    },
    arrayLengths,
    maxArrayLength: arrayLengths.reduce((max, item) => Math.max(max, item.length), 0),
    capViolations,
    anyCapViolation: capViolations.length > 0,
  };
}

export function summarizeAnalystPr4StructuredFields(data) {
  const presentFields = ANALYST_PR4_STRUCTURED_FIELDS.filter((field) => field in (data || {}));
  const missingFields = ANALYST_PR4_STRUCTURED_FIELDS.filter((field) => !(field in (data || {})));
  const validationErrors = validateAnalystPr4StructuredFields(data, { requireAll: false });
  const references = [];

  if (Array.isArray(data?.crossLayerSynthesis)) {
    data.crossLayerSynthesis.forEach((item) => {
      references.push(...collectLayerReferencesFromArray(item?.supportingLayers));
      references.push(...collectLayerReferencesFromArray(item?.conflictingLayers));
    });
  }
  if (Array.isArray(data?.keyDivergences)) {
    data.keyDivergences.forEach((item) => {
      references.push(...collectLayerReferencesFromArray(item?.evidenceFor, { allowFieldPath: true }));
      references.push(...collectLayerReferencesFromArray(item?.evidenceAgainst, { allowFieldPath: true }));
    });
  }
  if (isPlainObject(data?.dataQualityLens)) {
    references.push(...collectLayerReferencesFromArray(data.dataQualityLens.staleLayers));
    references.push(...collectLayerReferencesFromArray(data.dataQualityLens.fallbackLayers));
    references.push(...collectLayerReferencesFromArray(data.dataQualityLens.missingLayers));
  }

  const invalidLayerReferences = references.filter((item) => !item.canonicalLayer);
  const distinctCanonicalLayers = [...new Set(references.map((item) => item.canonicalLayer).filter(Boolean))];

  return {
    presentFields,
    missingFields,
    completenessRatio: presentFields.length / ANALYST_PR4_STRUCTURED_FIELDS.length,
    validationErrors,
    totalLayerReferences: references.length,
    validLayerReferences: references.length - invalidLayerReferences.length,
    invalidLayerReferences: invalidLayerReferences.map((item) => item.reference),
    distinctCanonicalLayers,
    caps: summarizeCaps(data),
  };
}
