import { readFileSync } from 'node:fs';

import { buildCrossValidationMatrix } from './modules/buildCrossValidationMatrix.js';

const errors = [];
function fail(message) {
  errors.push(message);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const helperText = readText('scripts/modules/buildCrossValidationMatrix.js');
const radarData = readJson('data/radar-data.json');
const worldOrder = readJson('data/world-order-stress.json');

const requiredStaticMarkers = [
  'dominantDriver',
  'economicWeaponization',
  'capitalControlRisk',
  'blocFormation',
  'multiTheaterConflict',
  'marketConfirmation',
  'gdeltToneProxy',
  'ofacRecentActionsCount',
  'decisionModifier',
  'riskBias',
  'world_order_state',
  'dominant_driver',
  'gdelt_tone_proxy',
  'ofac_recent_actions',
];

for (const marker of requiredStaticMarkers) {
  if (!helperText.includes(marker)) {
    fail(`buildCrossValidationMatrix missing M-51 world-order marker: ${marker}`);
  }
}

for (const narrativeName of [
  'buildEnergyShockNarrative',
  'buildStagflationNarrative',
  'buildRiskAssetMismatchNarrative',
  'buildOverheatNarrative',
  'buildCreditSpreadNarrative',
  'buildLiquidityTighteningNarrative',
]) {
  if (!helperText.includes(`function ${narrativeName}`)) {
    fail(`existing narrative function missing: ${narrativeName}`);
  }
}

const matrix = buildCrossValidationMatrix(radarData, worldOrder);
const narrative = matrix.narratives.find((item) => item.id === 'world_order_pressure_crossing');

if (!narrative) {
  fail('world_order_pressure_crossing narrative is missing');
} else {
  const supportingSources = new Set(narrative.supportingEvidence.map((item) => item.source));
  for (const source of [
    'world_order_state',
    'dominant_driver',
    'economic_weaponization',
    'capital_control_risk',
    'bloc_formation',
    'world_order_market_confirmation',
    'market_confirmation_source',
    'ofac_recent_actions',
  ]) {
    if (!supportingSources.has(source)) {
      fail(`world_order_pressure_crossing missing supporting evidence source: ${source}`);
    }
  }

  const missingSources = new Set(narrative.missingEvidence.map((item) => item.source));
  const gdeltStatus = worldOrder?.externalSources?.gdelt?.status;
  const gdeltTone = worldOrder?.externalSources?.gdelt?.summary?.toneProxy;

  // M-51 fix-up: gdelt_tone_proxy is conditional on healthy GDELT data.
  // Stale GDELT should only appear as missingEvidence, not supportingEvidence.
  if (gdeltStatus === 'ok') {
    if (typeof gdeltTone === 'number' && gdeltTone <= -0.3 && !supportingSources.has('gdelt_tone_proxy')) {
      fail('gdelt_tone_proxy expected in supportingEvidence (GDELT ok + toneProxy <= -0.3)');
    }
    if (missingSources.has('gdelt')) {
      fail("'gdelt' should NOT be in missingEvidence when status === 'ok'");
    }
  } else if (gdeltStatus === 'stale') {
    if (supportingSources.has('gdelt_tone_proxy')) {
      fail("gdelt_tone_proxy should NOT be in supportingEvidence when GDELT status === 'stale'");
    }
    if (!missingSources.has('gdelt')) {
      fail("'gdelt' expected in missingEvidence when status === 'stale'");
    }
  }

  for (const source of ['acled', 'sipri']) {
    if (!missingSources.has(source)) {
      fail(`world_order_pressure_crossing missing source-status evidence: ${source}`);
    }
  }
  if (!missingSources.has('decision_modifier_risk_bias')) {
    fail('world_order_pressure_crossing should expose neutral decisionModifier.riskBias as boundary evidence');
  }

  if (narrative.contradictingEvidence.length !== 0) {
    fail('current world_order_pressure_crossing should not become contradiction from low-information dimensions');
  }

  if (narrative.supportingEvidence.length < 8) {
    fail(`world_order_pressure_crossing supporting evidence too thin: ${narrative.supportingEvidence.length}`);
  }

  if (narrative.assessment !== 'strong_confirmation') {
    fail(`world_order_pressure_crossing expected strong_confirmation after M-51 enrichment, got ${narrative.assessment}`);
  }
}

for (const forbidden of [
  'fetchFredSeries',
  'FRED:',
  'writeFile',
  'data/world-order-stress.json',
]) {
  if (helperText.includes(forbidden)) {
    fail(`buildCrossValidationMatrix should not introduce ${forbidden}`);
  }
}

if (errors.length > 0) {
  console.error('World-order narrative density check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log('World-order narrative density check: PASS');
