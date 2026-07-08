import { readJson } from './lib/check-script-helpers.mjs';
import { readFileSync } from 'node:fs';

import { buildCrossValidationMatrix } from './modules/buildCrossValidationMatrix.js';

const errors = [];
function fail(message) {
  errors.push(message);
}

function readText(path) {
  return readFileSync(path, 'utf8');
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
    'market_confirmation_source',
    'ofac_recent_actions',
  ]) {
    if (!supportingSources.has(source)) {
      fail(`world_order_pressure_crossing missing supporting evidence source: ${source}`);
    }
  }

  // Hotfix: world_order_market_confirmation is conditional on marketConfirmation.state.
  // A weak / unconfirmed market does NOT confirm structural world-order stress, so the
  // builder (buildCrossValidationMatrix.js) only pushes it to supportingEvidence when the
  // marketConfirmation dimension is confirmed / partial_confirmed. This mirrors the M-51
  // gdelt_tone_proxy conditional; requiring it unconditionally fails whenever markets are calm.
  const marketConfirmationState = worldOrder?.dimensions?.marketConfirmation?.state;
  if (marketConfirmationState === 'confirmed' || marketConfirmationState === 'partial_confirmed') {
    if (!supportingSources.has('world_order_market_confirmation')) {
      fail('world_order_pressure_crossing missing supporting evidence source: world_order_market_confirmation (marketConfirmation confirmed/partial_confirmed)');
    }
  } else if (supportingSources.has('world_order_market_confirmation')) {
    fail("world_order_market_confirmation should NOT be in supportingEvidence when marketConfirmation.state is not confirmed/partial_confirmed");
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

    // M-59: when GDELT Cloud is healthy, four density branches in
    // buildWorldOrderNarrative may fire based on summary thresholds.
    // Track each independently against the actual summary values to ensure
    // the supporting branches are wired correctly.
    const gdeltSummary = worldOrder?.externalSources?.gdelt?.summary ?? {};
    const m59Gates = [
      ['gdelt_event_density', Number(gdeltSummary.totalEvents) >= 200],
      ['gdelt_multi_country', Number(gdeltSummary.countryCount) >= 30],
      ['gdelt_fatalities', Number(gdeltSummary.fatalities) >= 100],
      ['gdelt_key_regions', Array.isArray(gdeltSummary.keyConflictRegions) && gdeltSummary.keyConflictRegions.length >= 3],
    ];
    for (const [source, shouldFire] of m59Gates) {
      if (shouldFire && !supportingSources.has(source)) {
        fail(`${source} expected in supportingEvidence (GDELT ok + threshold met)`);
      }
    }
  } else if (gdeltStatus === 'stale') {
    if (supportingSources.has('gdelt_tone_proxy')) {
      fail("gdelt_tone_proxy should NOT be in supportingEvidence when GDELT status === 'stale'");
    }
    if (!missingSources.has('gdelt')) {
      fail("'gdelt' expected in missingEvidence when status === 'stale'");
    }
  }

  // M-63a fix-up: when ACLED status is 'ok', evidence appears as 'acled' in
  // supportingEvidence; otherwise it must appear in missingEvidence.
  const acledStatus = worldOrder?.externalSources?.acled?.status;
  if (acledStatus === 'ok') {
    if (!supportingSources.has('acled')) {
      fail('world_order_pressure_crossing missing acled supporting evidence (acledStatus ok but acled not in supportingEvidence)');
    }
  } else if (!missingSources.has('acled')) {
    fail('world_order_pressure_crossing missing source-status evidence: acled');
  }

  // M-61 fix-up: when SIPRI status is 'ok', evidence appears as sipri_* supporting
  // branches rather than a single 'sipri' missingEvidence item.
  const sipriStatusCheck = worldOrder?.externalSources?.sipri?.status;
  if (sipriStatusCheck === 'ok') {
    const sipriSupportingBranches = [...supportingSources].filter((s) => s.startsWith('sipri_'));
    if (sipriSupportingBranches.length === 0) {
      fail('world_order_pressure_crossing missing sipri supporting branches (sipriStatus ok but no sipri_* sources)');
    }
  } else if (!missingSources.has('sipri')) {
    fail('world_order_pressure_crossing missing source-status evidence: sipri');
  }

  // M-59 fix-up: decisionModifier.riskBias is conditional on upstream evidence
  // density. When GDELT/OFAC/world-order dimensions cross thresholds, the
  // modifier flips to 'upward' and the helper emits it as supportingEvidence;
  // otherwise it stays as missingEvidence boundary. This mirrors assertion B's
  // state-conditional pattern (M-51 fix-up).
  const riskBias = worldOrder?.decisionModifier?.riskBias;
  if (riskBias === 'upward') {
    if (!supportingSources.has('decision_modifier_risk_bias')) {
      fail("decision_modifier_risk_bias expected in supportingEvidence when riskBias === 'upward'");
    }
  } else if (typeof riskBias === 'string' && riskBias.length > 0) {
    if (!missingSources.has('decision_modifier_risk_bias')) {
      fail(`decision_modifier_risk_bias expected in missingEvidence when riskBias === '${riskBias}' (boundary state)`);
    }
  }

  const worldOrderScore = Number(worldOrder?.score);
  const mainScore = Number(radarData?.score);
  const expectsTransmissionGapContradiction =
    Number.isFinite(worldOrderScore) &&
    worldOrderScore >= 60 &&
    Number.isFinite(mainScore) &&
    mainScore < 40;
  const transmissionGapContradictions = narrative.contradictingEvidence
    .filter((item) => item.source === 'world_order_vs_main_score');
  const unexpectedContradictions = narrative.contradictingEvidence
    .filter((item) => item.source !== 'world_order_vs_main_score' || !expectsTransmissionGapContradiction);

  if (expectsTransmissionGapContradiction) {
    if (transmissionGapContradictions.length !== 1) {
      fail('world_order_pressure_crossing expected one world_order_vs_main_score contradiction when high world-order pressure has not transmitted to main score');
    }
  } else if (transmissionGapContradictions.length > 0) {
    fail('world_order_vs_main_score contradiction should only appear when worldOrder.score >= 60 and radar score < 40');
  }
  if (unexpectedContradictions.length !== 0) {
    fail('current world_order_pressure_crossing should not become contradiction from low-information dimensions');
  }

  if (narrative.supportingEvidence.length < 8) {
    fail(`world_order_pressure_crossing supporting evidence too thin: ${narrative.supportingEvidence.length}`);
  }

  const expectedAssessment = expectsTransmissionGapContradiction ? 'contradiction' : 'strong_confirmation';
  if (narrative.assessment !== expectedAssessment) {
    fail(`world_order_pressure_crossing expected ${expectedAssessment} after M-51 enrichment, got ${narrative.assessment}`);
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
