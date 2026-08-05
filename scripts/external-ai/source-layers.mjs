export const LEGACY_EXTERNAL_AI_SOURCE_LAYERS = [
  'dailyBrief',
  'divergenceLayer',
  'brentPricingLayer',
  'macroDrivers.consumer',
  'aiInterpretationLayer',
  'dataHealth',
  'decisionContext',
];

export const ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR = [
  'dailyBrief',
  'aiInterpretationLayer',
  'dataHealth',
  'modules',
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
  'decisionContext.sanitized',
];

const SAFE_MACRO_DRIVER_SOURCE_LAYER = /^macroDrivers\.[A-Za-z][A-Za-z0-9_]*$/u;
const LEGACY_PRODUCTION_SOURCE_LAYERS = ['local_compact', ...LEGACY_EXTERNAL_AI_SOURCE_LAYERS];
const FIXTURE_PRODUCTION_SOURCE_LAYERS = ['fixture_sample'];
const ANALYST_SOURCE_LAYER_ALIASES = new Map([
  ['energyInventoryBalance', 'macroDrivers.energyInventoryBalance'],
  ['energySpareCapacity', 'macroDrivers.energySpareCapacity'],
  ['energyTransport', 'macroDrivers.energyTransport'],
]);

export function isMacroDriverSourceLayer(sourceLayer) {
  return typeof sourceLayer === 'string' && SAFE_MACRO_DRIVER_SOURCE_LAYER.test(sourceLayer);
}

export function isAllowedExternalAiSourceLayer(sourceLayer, options = {}) {
  const analyst = options.analyst === true;
  if (analyst) {
    return (
      ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR.includes(sourceLayer) ||
      isMacroDriverSourceLayer(sourceLayer)
    );
  }
  return LEGACY_EXTERNAL_AI_SOURCE_LAYERS.includes(sourceLayer);
}

export function isAllowedExternalAiProductionSourceLayer(sourceLayer, options = {}) {
  if (options.fixture === true) return FIXTURE_PRODUCTION_SOURCE_LAYERS.includes(sourceLayer);
  if (options.analyst === true) return isAllowedExternalAiSourceLayer(sourceLayer, { analyst: true });
  return LEGACY_PRODUCTION_SOURCE_LAYERS.includes(sourceLayer);
}

export function normalizeAnalystSourceLayerReference(sourceLayer) {
  if (typeof sourceLayer !== 'string') return sourceLayer;
  const trimmed = sourceLayer.trim();
  return ANALYST_SOURCE_LAYER_ALIASES.get(trimmed) || trimmed;
}

function hasReferenceBoundary(value, prefix) {
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

export function matchAnalystSourceLayerAliasPrefix(reference) {
  if (typeof reference !== 'string') return null;
  const value = reference.trim();
  for (const [alias, sourceLayer] of ANALYST_SOURCE_LAYER_ALIASES) {
    if (value.startsWith(alias) && hasReferenceBoundary(value, alias)) {
      return {
        sourceLayer,
        rest: value.slice(alias.length),
        matched: alias,
      };
    }
  }
  return null;
}

export function getAnalystMacroDriverSourceLayers(input) {
  const macroDrivers = input?.siteData?.macroDrivers;
  if (!macroDrivers || typeof macroDrivers !== 'object' || Array.isArray(macroDrivers)) return [];
  return Object.keys(macroDrivers)
    .filter((key) => /^[A-Za-z][A-Za-z0-9_]*$/u.test(key))
    .map((key) => `macroDrivers.${key}`);
}

export function getAnalystSourceLayersForInput(input) {
  return [
    ...ANALYST_EXTERNAL_AI_SOURCE_LAYER_FLOOR,
    ...getAnalystMacroDriverSourceLayers(input),
  ];
}

export function formatSourceLayerAllowlist(input, options = {}) {
  const analyst = options.analyst === true;
  if (!analyst) return LEGACY_EXTERNAL_AI_SOURCE_LAYERS.join(', ');

  const analystLayers = getAnalystSourceLayersForInput(input);
  return [
    ...new Set(analystLayers),
    'macroDrivers.<safeKey>',
  ].join(', ');
}
