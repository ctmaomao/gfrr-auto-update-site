import { deriveRisk } from '../run-daily-pipeline.mjs';

// Historical inputs are proxies; calculation parity does not imply point-in-time data parity.
const SERIES_KEYS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y', 'spx', 'walcl', 'onRrp', 't10y2y', 'igOas', 'baa10y'];
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

export function buildHistoricalScoreInputs(date, seriesRows, rules, valueOverrides = null) {
  const at = (key, when = date) => latestHistoricalRow(seriesRows[key], when)?.value ?? null;
  const values = Object.fromEntries(SERIES_KEYS.map(key => [key, at(key)]));
  for (const [key, value] of Object.entries(valueOverrides || {})) {
    if (Object.hasOwn(values, key) && Number.isFinite(value)) values[key] = value;
  }
  const creditProxyUsed = !Number.isFinite(values.hyOas) && Number.isFinite(values.baa10y);
  if (creditProxyUsed) values.hyOas = values.baa10y;
  if (['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y'].some(key => !Number.isFinite(values[key]))) return null;
  values.breakeven10y ??= rules.defaults.breakeven10y;
  values.spx ??= rules.defaults.spx;
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
    unavailableHistoricalInputs: ['transportShockCandidate'],
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
    unavailableHistoricalInputs: input.unavailableHistoricalInputs, historicalProxyInputs: input.historicalProxyInputs
  };
}
