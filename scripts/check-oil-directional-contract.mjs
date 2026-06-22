// check:oil-directional-contract — structural contract for data/oil-directional-pressure.json.
// Field / type / unit / enum completeness. PR1 leaves signals/finalBias/interpretation
// unpopulated (model lands in PR3); this check forbids them being populated early.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLOBAL_OVERLAY_EFFECT_VALUES, GLOBAL_OVERLAY_STATUS_VALUES } from './oil-directional/odp-classifier.mjs';

const errors = [];
const fail = (m) => errors.push(m);
const numOrNull = (v) => v === null || Number.isFinite(v);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));

const EIA_KEYS = [
  'crudeStocksExSpr', 'sprStocks', 'distillateStocks', 'gasolineStocks',
  'refineryUtilization', 'refinerCrudeInputs', 'demandGasolineSupplied', 'demandDistillateSupplied',
];
const REUSE_PRICE_KEYS = ['wtiPrice', 'brentPrice', 'crackSpread'];
const UNITS = new Set(['thousand barrels', 'thousand barrels per day', 'percent', '$/bbl']);
const LATENCY_TIERS = new Set(['T1_daily_market_proxy', 'T2_weekly_official_anchor']);

function validateTimingFields(e, path, expectedTier) {
  if (!LATENCY_TIERS.has(e.latencyTier)) fail(`${path}.latencyTier unsupported: ${e.latencyTier}`);
  if (expectedTier && e.latencyTier !== expectedTier) fail(`${path}.latencyTier must be ${expectedTier}, got: ${e.latencyTier}`);
  for (const field of ['latencyTierZh', 'timelinessZh', 'sourceRole', 'directionalUse', 'calibrationNoteZh']) {
    if (typeof e[field] !== 'string' || !e[field]) fail(`${path}.${field} must be a non-empty string`);
  }
  if (!/校准|确认|背离|锚点/u.test(e.directionalUse + e.calibrationNoteZh)) {
    fail(`${path}.directionalUse/calibrationNoteZh must describe calibration/confirmation semantics`);
  }
}

if (data.schemaVersion !== 'odp-1') fail(`schemaVersion must be 'odp-1', got: ${data.schemaVersion}`);
if (data.module !== 'oil-directional-pressure') fail(`module must be 'oil-directional-pressure', got: ${data.module}`);
if (typeof data.boundary !== 'string' || !data.boundary.includes('audit-only')) {
  fail('boundary must be a string declaring audit-only/display-only');
}
if (typeof data.builtAt !== 'string' || Number.isNaN(Date.parse(data.builtAt))) fail('builtAt must be an ISO timestamp');
if (!data.ingestion || typeof data.ingestion !== 'object') fail('ingestion metadata object missing');

const ev = data.evidence;
if (!ev || typeof ev !== 'object') {
  fail('evidence is missing or not an object');
} else {
  for (const k of [...EIA_KEYS, ...REUSE_PRICE_KEYS, 'curve']) {
    if (!(k in ev)) fail(`evidence.${k} missing`);
  }

  for (const k of EIA_KEYS) {
    const e = ev[k];
    if (!e || typeof e !== 'object') { fail(`evidence.${k} is not an object`); continue; }
    validateTimingFields(e, `evidence.${k}`, 'T2_weekly_official_anchor');
    if (!numOrNull(e.value)) fail(`evidence.${k}.value must be number|null`);
    if (!UNITS.has(e.unit)) fail(`evidence.${k}.unit unsupported: ${e.unit}`);
    if (typeof e.source !== 'string' || !e.source.startsWith('EIA:')) fail(`evidence.${k}.source must start with 'EIA:'`);
    if (typeof e.sourceUrl !== 'string') fail(`evidence.${k}.sourceUrl must be a string`);
    for (const f of ['change1w', 'change4w', 'change13w', 'vs5yAvgPct', 'fiveYrRangePosition']) {
      if (!numOrNull(e[f])) fail(`evidence.${k}.${f} must be number|null`);
    }
    if (!Number.isFinite(e.historyWeeks)) fail(`evidence.${k}.historyWeeks must be a number`);
    if (typeof e.signalGroup !== 'string') fail(`evidence.${k}.signalGroup must be a string`);
  }

  for (const k of REUSE_PRICE_KEYS) {
    const e = ev[k];
    if (!e || typeof e !== 'object') { fail(`evidence.${k} is not an object`); continue; }
    validateTimingFields(e, `evidence.${k}`, 'T1_daily_market_proxy');
    if (!numOrNull(e.value)) fail(`evidence.${k}.value must be number|null`);
    if (e.unit !== '$/bbl') fail(`evidence.${k}.unit must be '$/bbl'`);
    if (typeof e.source !== 'string' || !e.source.startsWith('radar-data:')) {
      fail(`evidence.${k}.source must start with 'radar-data:' (reuse, not re-fetch)`);
    }
  }

  const c = ev.curve;
  if (!c || typeof c !== 'object') {
    fail('evidence.curve is not an object');
  } else {
    validateTimingFields(c, 'evidence.curve', 'T1_daily_market_proxy');
    if (c.slopeRegime !== null && typeof c.slopeRegime !== 'string') fail('evidence.curve.slopeRegime must be string|null');
    if (!numOrNull(c.frontMinusBack)) fail('evidence.curve.frontMinusBack must be number|null');
    if (c.confidence !== 'low') fail("evidence.curve.confidence must be 'low' (public monthly proxy)");
    if (typeof c.source !== 'string' || !c.source.startsWith('radar-data:')) fail("evidence.curve.source must start with 'radar-data:'");
    if (typeof c.limitationZh !== 'string' || !c.limitationZh) fail('evidence.curve.limitationZh must be a non-empty string');
  }
}

// PR3 — model output is ALWAYS populated (the build writes a verdict; finalBias null
// = model regressed). Structural validation here; enum + consistency live in check:oil-directional-score.
if (typeof data.finalBias !== 'string') fail('finalBias must be a non-null string (null = model not produced)');
if (!(data.signals === null || (typeof data.signals === 'object' && !Array.isArray(data.signals)))) fail('signals must be object|null');
if (data.signals && typeof data.signals === 'object') {
  for (const g of ['inventoryDrawPressure', 'dieselProductStress', 'refineryConfirmation', 'sprBufferEffectiveness', 'demandDestructionRisk', 'priceContext']) {
    if (!(g in data.signals)) fail(`signals.${g} missing`);
  }
  const pc = data.signals.priceContext;
  if (!pc || typeof pc !== 'object') {
    fail('signals.priceContext must be an object');
  } else {
    if (!numOrNull(pc.brentChangePct4w)) fail('signals.priceContext.brentChangePct4w must be number|null');
    if (!(pc.curveSlopeRegime === null || typeof pc.curveSlopeRegime === 'string')) fail('signals.priceContext.curveSlopeRegime must be string|null');
    if (typeof pc.priceDirectionSource !== 'string') fail('signals.priceContext.priceDirectionSource must be a string');
  }
}
if (typeof data.interpretation !== 'object' || data.interpretation === null || Array.isArray(data.interpretation)) {
  fail('interpretation must be a non-null object (PR3 always writes it)');
} else {
  for (const f of ['physicalBias', 'finalBias', 'divergence', 'priceVsPhysical', 'dataSufficiency', 'note']) {
    if (typeof data.interpretation[f] !== 'string' || !data.interpretation[f]) fail(`interpretation.${f} must be a non-empty string`);
  }
  if (!Array.isArray(data.interpretation.drivers)) fail('interpretation.drivers must be an array');
  const go = data.interpretation.globalOverlay;
  if (go !== undefined && go !== null) {
    if (typeof go !== 'object' || Array.isArray(go)) {
      fail('interpretation.globalOverlay must be an object|null when present');
    } else {
      if (!GLOBAL_OVERLAY_STATUS_VALUES.includes(go.status)) fail(`interpretation.globalOverlay.status invalid: ${go.status}`);
      if (!GLOBAL_OVERLAY_EFFECT_VALUES.includes(go.effect)) fail(`interpretation.globalOverlay.effect invalid: ${go.effect}`);
      if (!Number.isFinite(go.confirmationCount)) fail('interpretation.globalOverlay.confirmationCount must be a number');
      if (!Array.isArray(go.drivers)) fail('interpretation.globalOverlay.drivers must be an array');
      if (!Array.isArray(go.reasons)) fail('interpretation.globalOverlay.reasons must be an array');
      if (typeof go.boundary !== 'string' || !/display-only|NOT in/i.test(go.boundary)) {
        fail('interpretation.globalOverlay.boundary must reaffirm display-only / NOT in scoring paths');
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure contract check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure contract check: PASS (${EIA_KEYS.length + REUSE_PRICE_KEYS.length + 1} evidence entries, schema ${data.schemaVersion})`);
