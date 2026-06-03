// ODP physical-chain directional classifier (PR2) — PRE-REGISTERED, LOCKED logic.
//
// Pure, look-ahead-safe: classifyAt(history, period) uses ONLY data points with
// period <= the target week. Physical-only — the EIA 8-series chain. The
// price-divergence verdicts (false_up_unconfirmed / false_down_physical_stress)
// require price and are NOT produced here; they land in PR3 on live data. The
// futures-curve confirmation is likewise not used in the historical backtest.
//
// Thresholds below are PRE-REGISTERED (locked before running the backtest, to
// prevent fitting the model to the known windows). Do NOT tune them to make a
// backtest window pass; if a window fails, rethink the logic on economic grounds
// and re-register, or accept the limitation. See docs/PROJECT_BACKLOG.md P3-19.

export const ODP_THRESHOLDS = Object.freeze({
  VS5Y_TIGHT: -5,        // vs 5y same-week mean, percent
  VS5Y_LOOSE: 5,
  RANGEPOS_TIGHT: 0.25,  // position within 5y same-week [min,max]
  RANGEPOS_EXTREME: 0,   // below the 5y same-week floor
  REFINERY_HIGH: 90,     // utilization avg4w, percent
  REFINERY_LOW: 85,
  SPR_RELEASE_4W: -3000, // thousand barrels over 4 weeks (meaningful SPR draw)
  DEMAND_FALLING: 0.95,  // suppliedAvg4w / suppliedAvg13w
  DEMAND_DESTRUCTION: 0.90,
});

const T = ODP_THRESHOLDS;
const DAY_MS = 86400000;
const REQUIRED_STOCKS = ['crudeStocksExSpr', 'distillateStocks', 'sprStocks'];

function idxAtOrBefore(points, targetMs) {
  let lo = -1;
  for (let i = 0; i < points.length; i++) {
    if (Date.parse(`${points[i].period}T00:00:00Z`) <= targetMs) lo = i; else break;
  }
  return lo;
}

function stockMetrics(points, idx) {
  if (idx < 0) return null;
  const cur = points[idx].value;
  const change4w = idx >= 4 ? cur - points[idx - 4].value : null;
  const change13w = idx >= 13 ? cur - points[idx - 13].value : null;
  // 5y same-week: nearest point within +/-10d of (current - k years), k=1..5
  const curMs = Date.parse(`${points[idx].period}T00:00:00Z`);
  const picks = [];
  for (let k = 1; k <= 5; k++) {
    const target = curMs - k * 365.2425 * DAY_MS;
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i <= idx; i++) {
      const diff = Math.abs(Date.parse(`${points[i].period}T00:00:00Z`) - target);
      if (diff < bestDiff) { bestDiff = diff; best = points[i]; }
    }
    if (best && bestDiff <= 10 * DAY_MS) picks.push(best.value);
  }
  const mean = picks.length ? picks.reduce((a, b) => a + b, 0) / picks.length : null;
  const min = picks.length ? Math.min(...picks) : null;
  const max = picks.length ? Math.max(...picks) : null;
  return {
    value: cur,
    change4w,
    change13w,
    drawPerWeek4w: change4w != null ? change4w / 4 : null,
    drawPerWeek13w: change13w != null ? change13w / 13 : null,
    vs5yPct: mean ? ((cur - mean) / mean) * 100 : null,
    rangePos: (min != null && max != null && max > min) ? (cur - min) / (max - min) : null,
    sameWeekYears: picks.length,
  };
}

function trailingAvg(points, idx, weeks) {
  if (idx < weeks - 1) return null;
  let sum = 0;
  for (let i = idx - weeks + 1; i <= idx; i++) sum += points[i].value;
  return sum / weeks;
}

// ---- locked predicates ----
const tightStock = (m) => !!m && ((m.vs5yPct != null && m.vs5yPct <= T.VS5Y_TIGHT) || (m.rangePos != null && m.rangePos <= T.RANGEPOS_TIGHT));
const extremeTightStock = (m) => !!m && m.rangePos != null && m.rangePos < T.RANGEPOS_EXTREME;
const looseStock = (m) => !!m && m.change4w != null && m.change4w > 0 && m.vs5yPct != null && m.vs5yPct >= T.VS5Y_LOOSE;
const drawAccel = (m) => !!m && m.change4w != null && m.change13w != null && (m.change4w / 4) < (m.change13w / 13) && m.change4w < 0;

export function classifyAt(history, period) {
  const targetMs = Date.parse(`${period}T00:00:00Z`);
  const s = history && history.series ? history.series : {};
  const at = (key) => {
    const ser = s[key];
    if (!ser || ser.sourceStatus !== 'live' || !Array.isArray(ser.points)) return { idx: -1, points: [] };
    return { idx: idxAtOrBefore(ser.points, targetMs), points: ser.points };
  };

  const crudeAt = at('crudeStocksExSpr');
  const distAt = at('distillateStocks');
  const sprAt = at('sprStocks');
  const utilAt = at('refineryUtilization');
  const gasSupAt = at('demandGasolineSupplied');
  const distSupAt = at('demandDistillateSupplied');

  const crude = stockMetrics(crudeAt.points, crudeAt.idx);
  const distillate = stockMetrics(distAt.points, distAt.idx);
  const spr = stockMetrics(sprAt.points, sprAt.idx);

  // insufficient: a required stock missing, < 13w lookback, or < 5y same-week baseline
  const insufficient = REQUIRED_STOCKS.some((k) => {
    const m = { crudeStocksExSpr: crude, distillateStocks: distillate, sprStocks: spr }[k];
    return !m || m.change13w == null || m.sameWeekYears < 5;
  });

  // total crude (commercial + SPR) 4w change for buffer-effectiveness
  let totalChange4w = null;
  if (crudeAt.idx >= 4 && sprAt.idx >= 4) {
    const totCur = crudeAt.points[crudeAt.idx].value + sprAt.points[sprAt.idx].value;
    const totPrev = crudeAt.points[crudeAt.idx - 4].value + sprAt.points[sprAt.idx - 4].value;
    totalChange4w = totCur - totPrev;
  }
  const bufferInsufficient = spr && spr.change4w != null && spr.change4w <= T.SPR_RELEASE_4W
    && crude && crude.change4w != null && crude.change4w < 0
    && totalChange4w != null && totalChange4w < 0;

  const utilAvg4w = trailingAvg(utilAt.points, utilAt.idx, 4);
  const refineryHigh = utilAvg4w != null && utilAvg4w >= T.REFINERY_HIGH;
  const refineryLow = utilAvg4w != null && utilAvg4w <= T.REFINERY_LOW;

  const gasS4 = trailingAvg(gasSupAt.points, gasSupAt.idx, 4);
  const gasS13 = trailingAvg(gasSupAt.points, gasSupAt.idx, 13);
  const distS4 = trailingAvg(distSupAt.points, distSupAt.idx, 4);
  const distS13 = trailingAvg(distSupAt.points, distSupAt.idx, 13);
  const sup4 = (gasS4 != null && distS4 != null) ? gasS4 + distS4 : null;
  const sup13 = (gasS13 != null && distS13 != null) ? gasS13 + distS13 : null;
  const demandFalling = sup4 != null && sup13 != null && sup4 < T.DEMAND_FALLING * sup13;
  const demandDestruction = sup4 != null && sup13 != null && sup4 < T.DEMAND_DESTRUCTION * sup13;

  const signals = {
    inventoryDrawPressure: crude ? { drawAccel: drawAccel(crude), tight: tightStock(crude), extremeTight: extremeTightStock(crude), loose: looseStock(crude), vs5yPct: crude.vs5yPct, rangePos: crude.rangePos, change4w: crude.change4w } : null,
    dieselProductStress: distillate ? { tight: tightStock(distillate), extremeTight: extremeTightStock(distillate), drawing: distillate.change4w != null && distillate.change4w < 0, vs5yPct: distillate.vs5yPct, rangePos: distillate.rangePos } : null,
    refineryConfirmation: { utilAvg4w, high: refineryHigh, low: refineryLow },
    sprBufferEffectiveness: { bufferInsufficient, sprChange4w: spr ? spr.change4w : null, totalChange4w },
    demandDestructionRisk: { demandFalling, demandDestruction, suppliedAvg4w: sup4, suppliedAvg13w: sup13 },
    futuresCurveConfirmation: 'not_used_in_backtest',
  };

  let bias;
  if (insufficient) {
    bias = 'insufficient_data';
  } else if (drawAccel(crude) && crude.vs5yPct <= T.VS5Y_TIGHT && (tightStock(distillate) || bufferInsufficient) && refineryHigh && !demandDestruction) {
    bias = 'strong_bullish';
  } else if (extremeTightStock(distillate) && crude.rangePos != null && crude.rangePos >= 0 && (refineryLow || (distillate.change4w != null && distillate.change4w < 0))) {
    bias = 'product_crisis';
  } else if ((demandDestruction && looseStock(crude) && !extremeTightStock(distillate))
    || (looseStock(crude) && demandFalling && !tightStock(distillate))) {
    bias = 'bearish';
  } else if (tightStock(crude) || (tightStock(distillate) && bufferInsufficient)) {
    bias = 'moderate_bullish';
  } else {
    bias = 'neutral_range';
  }

  return { period, bias, signals };
}

// ===========================================================================
// PR3 — price-divergence reconciliation ("物理>金融"). PURE ADDITION: classifyAt
// and ODP_THRESHOLDS above are LOCKED (PR2 backtest GATE replays them unchanged).
// This layer takes the locked physical bias + a LOW-CONFIDENCE price/curve picture
// and produces the two price-divergence verdicts the physical chain alone cannot
// (false_down_physical_stress / false_up_unconfirmed). Thresholds are PRE-REGISTERED
// and grounded in OIL_DIRECTIONAL_PRESSURE_SOURCE_REVIEW.md §5; do NOT cherry-tune.
// ===========================================================================

export const FINAL_BIAS_VALUES = Object.freeze([
  'strong_bullish', 'moderate_bullish', 'neutral_range', 'bearish',
  'false_down_physical_stress', 'false_up_unconfirmed', 'product_crisis', 'insufficient_data',
]);

export const ODP_PRICE_THRESHOLDS = Object.freeze({
  PRICE_DOWN_PCT: -3, // Brent ~4w % change <= -3% counts as "price down"
  PRICE_UP_PCT: 3,    // Brent ~4w % change >= +3% counts as "price up"
});

const TP = ODP_PRICE_THRESHOLDS;

function primaryDriversFor(bias) {
  switch (bias) {
    case 'strong_bullish': return ['inventoryDrawPressure', 'refineryConfirmation', 'sprBufferEffectiveness'];
    case 'moderate_bullish': return ['inventoryDrawPressure'];
    case 'product_crisis': return ['dieselProductStress', 'refineryConfirmation'];
    case 'bearish': return ['demandDestructionRisk', 'inventoryDrawPressure'];
    default: return [];
  }
}

// physical = { bias, signals } from classifyAt; price = low-confidence context:
//   { changePct4w:number|null, curveSlopeRegime:string|null }
// Returns the reconciliation record (physicalBias kept for audit; finalBias is the
// display verdict). When the price direction is unknown, NO false_* is emitted —
// the physical bias stands (fail-safe, consistent with 数据不足→不硬判).
export function finalizeBias(physical, price) {
  const out = {
    physicalBias: physical && physical.bias ? physical.bias : 'insufficient_data',
    finalBias: physical && physical.bias ? physical.bias : 'insufficient_data',
    divergence: 'none',
    priceVsPhysical: 'unknown',
    drivers: [],
  };
  if (!physical || physical.bias === 'insufficient_data') {
    out.finalBias = 'insufficient_data';
    out.priceVsPhysical = 'insufficient_data';
    return out;
  }

  const s = physical.signals || {};
  const inv = s.inventoryDrawPressure || {};
  const dist = s.dieselProductStress || {};
  const physicallyTight = !!(inv.tight || inv.drawAccel || inv.extremeTight);
  const physicallyLoose = !!inv.loose;
  const distillateTight = !!(dist.tight || dist.extremeTight);
  const distillateImproving = dist.drawing === false; // present and not drawing => building/improving

  const chg = price && Number.isFinite(price.changePct4w) ? price.changePct4w : null;
  const priceDown = chg !== null && chg <= TP.PRICE_DOWN_PCT;
  const priceUp = chg !== null && chg >= TP.PRICE_UP_PCT;
  const backwardation = !!price && price.curveSlopeRegime === 'backwardation';
  const curveWeak = !!price && price.curveSlopeRegime === 'contango';

  // ① price fell BUT physical still tight + backwardation + diesel still low (§5).
  if (priceDown && physicallyTight && backwardation && distillateTight) {
    out.finalBias = 'false_down_physical_stress';
    out.divergence = 'false_down_physical_stress';
    out.priceVsPhysical = 'price_down_physical_tight';
    out.drivers = ['inventoryDrawPressure', 'dieselProductStress', 'futuresCurveConfirmation'];
    return out;
  }
  // ② price rose BUT physical loose + curve weakening + diesel improving (§5).
  if (priceUp && physicallyLoose && curveWeak && distillateImproving) {
    out.finalBias = 'false_up_unconfirmed';
    out.divergence = 'false_up_unconfirmed';
    out.priceVsPhysical = 'price_up_physical_loose';
    out.drivers = ['inventoryDrawPressure', 'demandDestructionRisk', 'futuresCurveConfirmation'];
    return out;
  }

  // No divergence -> the physical bias stands ("物理>金融" with price agreeing/flat/unknown).
  out.priceVsPhysical = chg === null ? 'unknown' : (priceDown ? 'price_down' : (priceUp ? 'price_up' : 'price_flat'));
  out.drivers = primaryDriversFor(physical.bias);
  return out;
}
