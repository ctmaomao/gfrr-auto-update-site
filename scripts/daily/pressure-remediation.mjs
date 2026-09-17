import { FEATURE_KEYS, replayPressureInputs, validateResearchProtocol } from './pressure-model.mjs';

// Local response tests in transformed-feature space, with calibration frozen.
// These describe model mechanics, not predictive accuracy or promotion readiness.
export function pressureRemediationDiagnostics(current, protocol) {
  validateResearchProtocol(protocol);
  const variants = protocol.variants.map(variant => {
    const candidate = current?.candidates?.find(row => row.variant === variant.id);
    if (!Number.isFinite(candidate?.score) || FEATURE_KEYS.some(key => !Number.isFinite(current?.features?.[key]))) {
      return { variant: variant.id, status: 'unavailable', responsive: null, sensitivities: null,
        reason: candidate?.status || 'missing_candidate_or_features' };
    }
    const parameters = { calibration: candidate.calibration, weights: candidate.weights };
    const baseScore = replayPressureInputs(current.features, parameters, variant);
    if (Math.abs(baseScore - candidate.score) > 1e-9) throw new Error('Remediation candidate replay mismatch');
    const sensitivities = Object.fromEntries(FEATURE_KEYS.map(key => {
      const scale = parameters.calibration[key].scale;
      const response = step => replayPressureInputs({ ...current.features,
        [key]: current.features[key] + step * scale }, parameters, variant) - baseScore;
      return [key, { tinyStepScoreChange: response(0.0001), oneScaleScoreChange: response(1) }];
    }));
    return { variant: variant.id, status: 'evaluated', baseScore, parametersHeldFixed: true,
      responsive: Object.values(sensitivities).every(row => row.tinyStepScoreChange > 0
        && row.tinyStepScoreChange < 0.01 && row.oneScaleScoreChange > 0), sensitivities,
      scaleFloors: FEATURE_KEYS.filter(key => parameters.calibration[key].minimumScaleApplied),
      energyInflationWeight: parameters.weights.energyInflation };
  });
  return { schemaVersion: 'pressure-remediation-diagnostics-v1', date: current?.date ?? null,
    productionReplacementEnabled: false, candidateSelection: null, baselineChangeUnit: 'USD_per_barrel',
    inputOwnership: Object.fromEntries(Object.entries(protocol.channels).map(([key, channel]) => [key, channel.inputs])),
    excludedFromCandidate: protocol.excludedFromScore, variants,
    allVariantsResponsive: variants.every(row => row.status === 'evaluated' && row.responsive),
    interpretation: 'Local transformed-feature response at frozen parameters; not global continuity proof, causal sensitivity or empirical validation.',
    unresolved: [
      'Production threshold floors, overlapping inputs and ON RRP treatment await evidence-gated model migration.',
      'Relative pressure is not calibrated crisis probability or absolute economic severity.',
      'Rolling calibration can normalize persistent stress without economic improvement.',
      'Dollar appreciation is a proxy, not a direct funding-market measurement.',
      'US benchmarks share inputs and do not independently validate global or portfolio risk.',
      'Historical release vintages, prospective evidence and independent model review remain required.'
    ] };
}
