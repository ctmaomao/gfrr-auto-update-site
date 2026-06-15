// P7 ODP global overlay replay harness.
//
// Purpose: make the P6B global/monthly overlay auditable without turning it into
// a new directional classifier. This harness replays the locked physical ODP
// history over pre-registered windows and runs deterministic global-context
// fixtures around the published P6B thresholds.
//
// It does NOT fetch network data, does NOT write data artifacts, and does NOT
// backtest oil-price returns. The invariant under review is narrower:
// evaluateGlobalOverlay() may confirm/cap/annotate, but it must not create or
// mutate the finalBias produced by classifyAt() + finalizeBias().

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FINAL_BIAS_VALUES,
  GLOBAL_OVERLAY_EFFECT_VALUES,
  GLOBAL_OVERLAY_STATUS_VALUES,
  ODP_GLOBAL_OVERLAY_THRESHOLDS,
  classifyAt,
  evaluateGlobalOverlay,
  finalizeBias,
} from './odp-classifier.mjs';
import { WINDOWS } from './backtest-oil-directional.mjs';

const GT = ODP_GLOBAL_OVERLAY_THRESHOLDS;

export const GLOBAL_OVERLAY_PRICE_FIXTURES = Object.freeze([
  { name: 'flat_backwardation', price: { changePct4w: 0, curveSlopeRegime: 'backwardation' } },
  { name: 'down_backwardation', price: { changePct4w: -4, curveSlopeRegime: 'backwardation' } },
  { name: 'up_contango', price: { changePct4w: 4, curveSlopeRegime: 'contango' } },
]);

function inventoryContext(overrides = {}) {
  return {
    sourceStatus: 'live',
    latestPeriod: 'fixture-2026-06',
    oecdCommercialInventoryVs5yPct: -8,
    oecdCommercialInventoryYoYMbbl: -220,
    globalInventoryDrawMbpd: 2,
    globalInventoryDraw3mAvgMbpd: 1.5,
    worldConsumptionYoYMbpd: 0,
    ...overrides,
  };
}

function spareContext(overrides = {}) {
  return {
    sourceStatus: 'live',
    latestPeriod: 'fixture-2026-06',
    spareCapacityMbpd: 0.7,
    bufferRegime: '偏低',
    ...overrides,
  };
}

function transportContext(overrides = {}) {
  return {
    sourceStatus: 'live',
    latestDate: 'fixture-2026-06-07',
    hormuzCapacityTankerVs30dPct: 0,
    hormuzTankerVs30dPct: 0,
    capeTankerVs30dPct: 0,
    reroutingRegime: 'normal',
    ...overrides,
  };
}

function globalContext(parts = {}) {
  return {
    inventoryBalance: parts.inventoryBalance ?? inventoryContext(),
    spareCapacity: parts.spareCapacity ?? spareContext(),
    transport: parts.transport ?? transportContext(),
  };
}

export const GLOBAL_OVERLAY_CONTEXT_FIXTURES = Object.freeze([
  {
    name: 'unavailable',
    context: globalContext({
      inventoryBalance: { sourceStatus: 'missing' },
      spareCapacity: { sourceStatus: 'missing' },
      transport: { sourceStatus: 'missing' },
    }),
  },
  {
    name: 'just_outside_thresholds',
    context: globalContext({
      inventoryBalance: inventoryContext({
        oecdCommercialInventoryVs5yPct: GT.OECD_VS5Y_TIGHT_PCT + 0.01,
        oecdCommercialInventoryYoYMbbl: GT.OECD_YOY_DRAW_MBBL + 0.01,
        globalInventoryDrawMbpd: GT.GLOBAL_DRAW_MBD - 0.01,
        globalInventoryDraw3mAvgMbpd: GT.GLOBAL_DRAW_3M_MBD - 0.01,
        worldConsumptionYoYMbpd: 0,
      }),
      spareCapacity: spareContext({
        spareCapacityMbpd: GT.SPARE_TIGHT_MBD + 0.01,
        bufferRegime: '正常',
      }),
    }),
  },
  {
    name: 'threshold_tight',
    context: globalContext({
      inventoryBalance: inventoryContext({
        oecdCommercialInventoryVs5yPct: GT.OECD_VS5Y_TIGHT_PCT,
        oecdCommercialInventoryYoYMbbl: GT.OECD_YOY_DRAW_MBBL,
        globalInventoryDrawMbpd: GT.GLOBAL_DRAW_MBD,
        globalInventoryDraw3mAvgMbpd: GT.GLOBAL_DRAW_3M_MBD,
        worldConsumptionYoYMbpd: 0,
      }),
      spareCapacity: spareContext({
        spareCapacityMbpd: GT.SPARE_TIGHT_MBD,
        bufferRegime: '偏低',
      }),
    }),
  },
  {
    name: 'threshold_tight_with_demand_cap',
    context: globalContext({
      inventoryBalance: inventoryContext({
        oecdCommercialInventoryVs5yPct: GT.OECD_VS5Y_TIGHT_PCT,
        oecdCommercialInventoryYoYMbbl: GT.OECD_YOY_DRAW_MBBL,
        globalInventoryDrawMbpd: GT.GLOBAL_DRAW_MBD,
        globalInventoryDraw3mAvgMbpd: GT.GLOBAL_DRAW_3M_MBD,
        worldConsumptionYoYMbpd: GT.DEMAND_DOWNSHIFT_MBD,
      }),
      spareCapacity: spareContext({
        spareCapacityMbpd: GT.SPARE_TIGHT_MBD,
        bufferRegime: '偏低',
      }),
    }),
  },
  {
    name: 'acute_extreme',
    context: globalContext({
      inventoryBalance: inventoryContext({
        oecdCommercialInventoryVs5yPct: -10,
        oecdCommercialInventoryYoYMbbl: -260,
        globalInventoryDrawMbpd: GT.GLOBAL_ACUTE_DRAW_MBD,
        globalInventoryDraw3mAvgMbpd: GT.GLOBAL_ACUTE_DRAW_MBD,
      }),
      spareCapacity: spareContext({
        spareCapacityMbpd: GT.SPARE_EXTREME_MBD,
        bufferRegime: '极低缓冲',
      }),
    }),
  },
  {
    name: 'transport_only_watch',
    context: globalContext({
      inventoryBalance: { sourceStatus: 'missing' },
      spareCapacity: { sourceStatus: 'missing' },
      transport: transportContext({
        hormuzCapacityTankerVs30dPct: GT.HORMUZ_CAPACITY_DROP_PCT,
        hormuzTankerVs30dPct: GT.HORMUZ_TANKER_DROP_PCT,
        capeTankerVs30dPct: GT.CAPE_TANKER_RISE_PCT,
        reroutingRegime: 'rerouting_watch',
      }),
    }),
  },
]);

const PHYSICAL_TIGHT = Object.freeze({
  period: 'fixture',
  bias: 'product_crisis',
  signals: {
    inventoryDrawPressure: { tight: true, drawAccel: true, extremeTight: false, loose: false },
    dieselProductStress: { tight: true, extremeTight: true, drawing: true },
    refineryConfirmation: { utilAvg4w: 94, high: true, low: false },
    sprBufferEffectiveness: { bufferInsufficient: true },
    demandDestructionRisk: { demandFalling: false, demandDestruction: false },
    futuresCurveConfirmation: 'not_used_in_backtest',
  },
});

const PHYSICAL_TIGHT_DEMAND_BREAK = Object.freeze({
  period: 'fixture',
  bias: 'moderate_bullish',
  signals: {
    inventoryDrawPressure: { tight: true, drawAccel: true, extremeTight: false, loose: false },
    dieselProductStress: { tight: false, extremeTight: false, drawing: false },
    refineryConfirmation: { utilAvg4w: 91, high: true, low: false },
    sprBufferEffectiveness: { bufferInsufficient: false },
    demandDestructionRisk: { demandFalling: true, demandDestruction: true },
    futuresCurveConfirmation: 'not_used_in_backtest',
  },
});

const PHYSICAL_NEUTRAL = Object.freeze({
  period: 'fixture',
  bias: 'neutral_range',
  signals: {
    inventoryDrawPressure: { tight: false, drawAccel: false, extremeTight: false, loose: false },
    dieselProductStress: { tight: false, extremeTight: false, drawing: false },
    refineryConfirmation: { utilAvg4w: 88, high: false, low: false },
    sprBufferEffectiveness: { bufferInsufficient: false },
    demandDestructionRisk: { demandFalling: false, demandDestruction: false },
    futuresCurveConfirmation: 'not_used_in_backtest',
  },
});

function periodsInRange(history, start, end, sample) {
  const pts = (history.series && history.series.crudeStocksExSpr && history.series.crudeStocksExSpr.points) || [];
  const inRange = pts.map((p) => p.period).filter((period) => period >= start && period <= end);
  return sample === 'biweekly' ? inRange.filter((_, idx) => idx % 2 === 0) : inRange;
}

function inc(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

function evaluateCase({ name, physical, price, context }) {
  const reconcile = finalizeBias(physical, price);
  const before = JSON.stringify(reconcile);
  const overlay = evaluateGlobalOverlay(reconcile, physical, price, context);
  const after = JSON.stringify(reconcile);
  return {
    name,
    physicalBias: reconcile.physicalBias,
    finalBias: reconcile.finalBias,
    effect: overlay.effect,
    status: overlay.status,
    confidenceAdjustment: overlay.confidenceAdjustment,
    confidence: overlay.confidence,
    supplyBuffer: overlay.supplyBuffer,
    inventoryBalance: overlay.inventoryBalance,
    demandState: overlay.demandState,
    transportRisk: overlay.transportRisk,
    confirmationCount: overlay.confirmationCount,
    reconcileMutated: before !== after,
    overlayHasFinalBias: Object.prototype.hasOwnProperty.call(overlay, 'finalBias')
      || Object.prototype.hasOwnProperty.call(overlay, 'physicalBias'),
  };
}

export function runGlobalOverlayFixtureChecks() {
  const cases = [
    {
      name: 'insufficient_physical_not_evaluated',
      physical: { period: 'fixture', bias: 'insufficient_data', signals: {} },
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[0].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[2].context,
      expect: { status: 'not_evaluated', effect: 'insufficient_physical_data' },
    },
    {
      name: 'unavailable_context',
      physical: PHYSICAL_TIGHT,
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[1].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[0].context,
      expect: { status: 'unavailable', effect: 'unavailable' },
    },
    {
      name: 'threshold_exact_confirms_false_down',
      physical: PHYSICAL_TIGHT,
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[1].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[3].context,
      expect: {
        status: 'active',
        effect: 'confirms_false_down',
        confidenceAdjustment: 'up_with_demand_cap',
        confidence: 'low',
        confirmationCount: 3,
      },
    },
    {
      name: 'just_outside_thresholds_neutral',
      physical: PHYSICAL_TIGHT,
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[1].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[1].context,
      expect: { status: 'active', effect: 'neutral', confirmationCount: 0 },
    },
    {
      name: 'demand_break_caps_confidence',
      physical: PHYSICAL_TIGHT_DEMAND_BREAK,
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[0].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[3].context,
      expect: {
        status: 'active',
        effect: 'caps_confidence_demand_watch',
        confidenceAdjustment: 'down',
        confidence: 'low',
      },
    },
    {
      name: 'transport_only_event_watch',
      physical: PHYSICAL_NEUTRAL,
      price: GLOBAL_OVERLAY_PRICE_FIXTURES[0].price,
      context: GLOBAL_OVERLAY_CONTEXT_FIXTURES[5].context,
      expect: {
        status: 'active',
        effect: 'event_risk_watch',
        transportRisk: 'chokepoint_watch_low_confidence',
        confirmationCount: 0,
      },
    },
  ];

  return cases.map(({ expect, ...testCase }) => ({
    ...evaluateCase(testCase),
    expected: expect,
  }));
}

export function runGlobalOverlayReplay(history) {
  const byEffect = {};
  const byStatus = {};
  const byFinalBias = {};
  const byScenario = {};
  const rows = [];

  for (const window of WINDOWS) {
    for (const period of periodsInRange(history, window.start, window.end, window.sample)) {
      const physical = classifyAt(history, period);
      for (const priceFixture of GLOBAL_OVERLAY_PRICE_FIXTURES) {
        const reconcile = finalizeBias(physical, priceFixture.price);
        const before = JSON.stringify(reconcile);
        for (const contextFixture of GLOBAL_OVERLAY_CONTEXT_FIXTURES) {
          const overlay = evaluateGlobalOverlay(reconcile, physical, priceFixture.price, contextFixture.context);
          const after = JSON.stringify(reconcile);
          const row = {
            window: window.name,
            period,
            priceFixture: priceFixture.name,
            contextFixture: contextFixture.name,
            physicalBias: reconcile.physicalBias,
            finalBias: reconcile.finalBias,
            status: overlay.status,
            effect: overlay.effect,
            confidenceAdjustment: overlay.confidenceAdjustment,
            confirmationCount: overlay.confirmationCount,
            reconcileMutated: before !== after,
            overlayHasFinalBias: Object.prototype.hasOwnProperty.call(overlay, 'finalBias')
              || Object.prototype.hasOwnProperty.call(overlay, 'physicalBias'),
          };
          rows.push(row);
          inc(byEffect, row.effect);
          inc(byStatus, row.status);
          inc(byFinalBias, row.finalBias);
          inc(byScenario, row.contextFixture);
        }
      }
    }
  }

  return {
    windows: WINDOWS.map((window) => window.name),
    totalRows: rows.length,
    byEffect,
    byStatus,
    byFinalBias,
    byScenario,
    rows,
  };
}

export function validateGlobalOverlayReplay({ fixtures, replay }) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const validStatus = new Set(GLOBAL_OVERLAY_STATUS_VALUES);
  const validEffect = new Set(GLOBAL_OVERLAY_EFFECT_VALUES);
  const validFinalBias = new Set(FINAL_BIAS_VALUES);

  for (const fx of fixtures) {
    if (!validStatus.has(fx.status)) fail(`${fx.name}: invalid status ${fx.status}`);
    if (!validEffect.has(fx.effect)) fail(`${fx.name}: invalid effect ${fx.effect}`);
    if (fx.reconcileMutated) fail(`${fx.name}: evaluateGlobalOverlay mutated reconcile`);
    if (fx.overlayHasFinalBias) fail(`${fx.name}: overlay must not expose finalBias/physicalBias`);
    for (const [key, expectedValue] of Object.entries(fx.expected || {})) {
      if (fx[key] !== expectedValue) fail(`${fx.name}: expected ${key}=${expectedValue}, got ${fx[key]}`);
    }
  }

  if (!replay || !Number.isFinite(replay.totalRows) || replay.totalRows <= 0) {
    fail('historical replay produced no rows');
  } else {
    for (const row of replay.rows) {
      if (!validFinalBias.has(row.finalBias)) fail(`${row.period}/${row.contextFixture}: invalid finalBias ${row.finalBias}`);
      if (!validStatus.has(row.status)) fail(`${row.period}/${row.contextFixture}: invalid status ${row.status}`);
      if (!validEffect.has(row.effect)) fail(`${row.period}/${row.contextFixture}: invalid effect ${row.effect}`);
      if (row.reconcileMutated) fail(`${row.period}/${row.contextFixture}: evaluateGlobalOverlay mutated reconcile`);
      if (row.overlayHasFinalBias) fail(`${row.period}/${row.contextFixture}: overlay must not expose finalBias/physicalBias`);
    }
  }

  if ((replay.byEffect && replay.byEffect.confirms_false_down || 0) <= 0) {
    fail('historical replay should include at least one confirms_false_down fixture outcome');
  }
  if ((replay.byEffect && replay.byEffect.caps_confidence_demand_watch || 0) <= 0) {
    fail('historical replay should include at least one demand-watch cap outcome');
  }
  if ((replay.byEffect && replay.byEffect.event_risk_watch || 0) <= 0) {
    fail('historical replay should include at least one event-risk-watch outcome');
  }
  if ((replay.byStatus && replay.byStatus.unavailable || 0) <= 0) {
    fail('historical replay should exercise unavailable global-context fallback');
  }

  return errors;
}

export function loadDefaultHistory() {
  return JSON.parse(readFileSync(resolve('data/oil-directional-history.json'), 'utf8'));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('oil-directional/replay-global-overlay.mjs')) {
  const history = loadDefaultHistory();
  const fixtures = runGlobalOverlayFixtureChecks();
  const replay = runGlobalOverlayReplay(history);
  const errors = validateGlobalOverlayReplay({ fixtures, replay });

  for (const fx of fixtures) {
    console.log(`[global-overlay:fixture] ${fx.name.padEnd(38)} status=${fx.status} effect=${fx.effect} confirmations=${fx.confirmationCount}`);
  }
  console.log(`[global-overlay:replay] rows=${replay.totalRows} effects=${JSON.stringify(replay.byEffect)} finalBias=${JSON.stringify(replay.byFinalBias)}`);
  if (errors.length) {
    console.error('[global-overlay:replay] FAILED');
    errors.forEach((error) => console.error('  -', error));
    process.exit(1);
  }
  console.log('[global-overlay:replay] PASS (display-only overlay; finalBias unchanged)');
}
