import { deriveRisk } from '../run-daily-pipeline.mjs';

// Historical inputs are proxies; calculation parity does not imply point-in-time data parity.
const SERIES_KEYS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y', 'spx', 'walcl', 'onRrp', 't10y2y', 'igOas', 'baa10y'];
// Audit-only calendar-day tolerances: daily series allow weekends/holidays;
// weekly WALCL allows one missed weekly observation. Not production freshness.
export const HISTORICAL_MAX_AGE_DAYS = Object.freeze(Object.fromEntries(
  SERIES_KEYS.map(key => [key, key === 'walcl' ? 14 : 7])
));
const daysBefore = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const changePct = (current, previous) => Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
  ? (current - previous) / previous * 100 : null;

export function latestHistoricalRow(rows = [], date) {
  let left = 0, right = rows.length - 1, found = null;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (rows[mid].date <= date) { found = rows[mid]; left = mid + 1; }
    else right = mid - 1;
  }
  return found;
}

export function historicalObservation(rows, date, key) {
  const row = latestHistoricalRow(rows, date);
  const ageDays = row ? (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${row.date}T00:00:00Z`)) / 86400000 : null;
  const maxAgeDays = HISTORICAL_MAX_AGE_DAYS[key];
  const status = !row || !Number.isFinite(row.value) ? 'missing'
    : Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxAgeDays ? 'available' : 'stale';
  return { observationDate: row?.date ?? null, ageDays, maxAgeDays, status, value: status === 'available' ? row.value : null };
}

export function prepareHistoricalValues(date, seriesRows, rules, valueOverrides = null) {
  const inputDiagnostics = Object.fromEntries(SERIES_KEYS.map(key => {
    const observation = historicalObservation(seriesRows[key], date, key);
    return [key, { ...observation, valueOrigin: observation.status === 'available' ? 'historical' : 'missing',
      effectiveValue: observation.value, effectiveSourceKey: key, effectiveObservationDate: observation.status === 'available' ? observation.observationDate : null }];
  }));
  const values = Object.fromEntries(SERIES_KEYS.map(key => [key, inputDiagnostics[key].value]));
  for (const [key, value] of Object.entries(valueOverrides || {})) {
    if (Object.hasOwn(values, key) && Number.isFinite(value)) {
      values[key] = value;
      Object.assign(inputDiagnostics[key], { valueOrigin: 'scenario_override', effectiveValue: value, effectiveObservationDate: null });
    }
  }
  const creditProxyUsed = !Number.isFinite(values.hyOas) && Number.isFinite(values.baa10y);
  if (creditProxyUsed) {
    values.hyOas = values.baa10y;
    Object.assign(inputDiagnostics.hyOas, { valueOrigin: 'proxy', effectiveValue: values.hyOas,
      effectiveSourceKey: 'baa10y', effectiveObservationDate: inputDiagnostics.baa10y.effectiveObservationDate });
  }
  const defaultedHistoricalInputs = [];
  for (const key of ['breakeven10y', 'spx']) if (!Number.isFinite(values[key])) {
    values[key] = rules.defaults[key];
    defaultedHistoricalInputs.push(key);
    Object.assign(inputDiagnostics[key], { valueOrigin: 'default', effectiveValue: values[key], effectiveSourceKey: null, effectiveObservationDate: null });
  }
  return { values, creditProxyUsed, inputDiagnostics, defaultedHistoricalInputs,
    missingRequiredInputs: ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y'].filter(key => !Number.isFinite(values[key])),
    unavailableHistoricalInputs: ['transportShockCandidate', ...SERIES_KEYS.filter(key => key !== 'baa10y' && inputDiagnostics[key].status !== 'available')] };
}

export function buildHistoricalScoreInputs(date, seriesRows, rules, valueOverrides = null) {
  const prepared = prepareHistoricalValues(date, seriesRows, rules, valueOverrides);
  if (prepared.missingRequiredInputs.length) return null;
  const { values, creditProxyUsed, inputDiagnostics, defaultedHistoricalInputs, unavailableHistoricalInputs } = prepared;
  const at = (key, when) => historicalObservation(seriesRows[key], when, key).value;
  const status = value => Number.isFinite(value) ? 'historical' : 'missing';
  const weekAgo = daysBefore(date, 7);
  const priorCurve = at('t10y2y', weekAgo);
  const weekChange = Number.isFinite(values.t10y2y) && Number.isFinite(priorCurve) ? values.t10y2y - priorCurve : null;
  const curveRules = rules.macroDrivers.curve;
  const brentRow = latestHistoricalRow(seriesRows.brent, date);
  const brentPrevious = brentRow ? at('brent', daysBefore(brentRow.date, 1)) : null;
  return {
    rt: { values, changes: { brent1d: changePct(values.brent, brentPrevious) } },
    macroDrivers: {
      fedLiquidity: {
        walcl4wChange: changePct(values.walcl, at('walcl', daysBefore(date, 28))),
        onRrp: values.onRrp,
        onRrpWeekChange: changePct(values.onRrp, at('onRrp', weekAgo)),
        sourceStatus: { walcl: status(values.walcl), onRrp: status(values.onRrp) }
      },
      curve: {
        t10y2y: values.t10y2y, t10y2yWeekChange: weekChange,
        steepeningAlert: Number.isFinite(values.t10y2y) && Number.isFinite(weekChange)
          && values.t10y2y < curveRules.inversionThreshold && weekChange >= curveRules.steepeningWeekChangeThreshold,
        sourceStatus: { t10y2y: status(values.t10y2y) }
      },
      credit: { igOas: values.igOas, sourceStatus: { igOas: status(values.igOas) } }
    },
    creditProxyUsed,
    inputDiagnostics, defaultedHistoricalInputs, unavailableHistoricalInputs,
    historicalProxyInputs: ['brent1d_from_fred_spot', ...(creditProxyUsed ? ['hyOas_from_baa10y'] : [])]
  };
}

export function deriveHistoricalRisk(date, seriesRows, rules, valueOverrides = null) {
  const input = buildHistoricalScoreInputs(date, seriesRows, rules, valueOverrides);
  if (!input) return null;
  const risk = deriveRisk(input.rt, input.macroDrivers, rules);
  return {
    date, score: risk.score, baseScore: risk.tailRiskOverlay.baseScore,
    overlayApplied: risk.tailRiskOverlay.applied, overlayFloor: risk.tailRiskOverlay.floor,
    overlayReasons: risk.tailRiskOverlay.reasons.map(reason => reason.key), modules: risk.modules,
    inputs: { brent: risk.brent, dxy: risk.dxy, vix: risk.vix, hyOas: risk.hy, creditProxyUsed: input.creditProxyUsed,
      us10y: risk.us10y, real10y: risk.real10y, breakeven10y: risk.breakeven, spx: risk.spx },
    components: Object.fromEntries(['oilRisk', 'dollarRisk', 'hyRisk', 'vixRisk', 'rateRisk', 'realRisk', 'inflationRisk', 'spxRisk',
      'fedAssetRisk', 'onRrpRisk', 'curveInversionRisk', 'curveSteepeningRisk', 'igOasRisk', 'nimPressureRisk', 'reservePressure'].map(key => [key, risk[key]])),
    transportShockScoringImpact: risk.transportShockScoringImpact,
    unavailableHistoricalInputs: input.unavailableHistoricalInputs, historicalProxyInputs: input.historicalProxyInputs,
    defaultedHistoricalInputs: input.defaultedHistoricalInputs, inputDiagnostics: input.inputDiagnostics
  };
}

export function buildHistoricalReplay(dates, seriesRows, rules) {
  const sampleRows = [], excludedSamples = [];
  for (const date of dates) {
    const row = deriveHistoricalRisk(date, seriesRows, rules);
    if (row) sampleRows.push(row);
    else {
      const input = prepareHistoricalValues(date, seriesRows, rules);
      excludedSamples.push({ date, reason: 'required_input_unavailable', missingRequiredInputs: input.missingRequiredInputs,
        inputDiagnostics: Object.fromEntries(input.missingRequiredInputs.map(key => [key, input.inputDiagnostics[key]])) });
    }
  }
  return { sampleRows, inputCoverage: { requestedRows: dates.length, evaluatedRows: sampleRows.length, excludedSamples } };
}
