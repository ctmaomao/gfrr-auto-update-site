// Missing values retain the configured baseline policy. Malformed supplied
// values must not produce NaN scores or silently masquerade as observations.
export function scoreInput(values, key, defaults) {
  const value = values[key] ?? defaults[key];
  if (!Number.isFinite(value)) throw new TypeError(`Invalid score input: ${key}`);
  return value;
}

export function validateScoreWeights(rules) {
  const groups = [
    [rules.moduleWeights, ['geopolitical', 'energy', 'inflation', 'liquidity', 'debt', 'banking']],
    [rules.moduleComposition?.geopolitical, ['oilRisk', 'vixRisk']],
    [rules.moduleComposition?.liquidity, ['dollarRisk', 'hyRisk', 'vixRisk', 'rateRisk']],
    [rules.moduleComposition?.debt, ['realRisk', 'rateRisk', 'hyRisk']],
    [rules.moduleComposition?.banking, ['hyRisk', 'vixRisk', 'dollarRisk']],
    [rules.moduleSubWeights?.liquidity, ['baseWeight', 'fedAssetWeight', 'onRrpWeight']],
    [rules.moduleSubWeights?.debt, ['baseWeight', 'curveInversionWeight', 'curveSteepeningWeight']],
    [rules.moduleSubWeights?.banking, ['baseWeight', 'igOasWeight', 'nimPressureWeight', 'reservePressureWeight']],
  ];
  for (const [group, keys] of groups) {
    const values = keys.map(key => group?.[key]);
    if (Object.keys(group || {}).some(key => !key.startsWith('_') && !keys.includes(key))
      || values.some(value => !Number.isFinite(value) || value < 0 || value > 1)
      || Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9) {
      throw new TypeError('Score weights must be finite, nonnegative and sum to one');
    }
  }
}

export const structuralSourceUsable = status => status === 'live' || status === 'fallback';
