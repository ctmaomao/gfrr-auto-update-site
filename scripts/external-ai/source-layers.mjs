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
