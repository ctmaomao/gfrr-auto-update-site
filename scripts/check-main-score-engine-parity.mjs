#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { deriveMainScoreRisk } from './main-score/main-score-engine.mjs';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8'));
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} parity mismatch\nexpected=${expectedJson}\nactual=${actualJson}`);
  }
}

const rules = readJson('config/rules.json');
const snapshot = readJson('data/radar-data.json');
const baseline = snapshot.displayInputsBaseline || {};
const realtimePayload = {
  values: {
    brent: baseline.brent,
    dxy: baseline.dxy,
    vix: baseline.vix,
    hyOas: baseline.hyOas,
    us10y: baseline.us10y,
    real10y: baseline.real10y,
    breakeven10y: baseline.breakeven10y,
    spx: baseline.spx,
    gold: baseline.gold
  },
  // The production snapshot intentionally does not persist market-return inputs.
  // Its current energy module is identical for every non-positive brent1d value,
  // so zero is the unique neutral reconstruction needed for parity checking.
  changes: { brent1d: 0 }
};
const macroDrivers = snapshot.macroDrivers || {};
const before = JSON.stringify({ realtimePayload, macroDrivers, rules });
const derived = deriveMainScoreRisk(realtimePayload, macroDrivers, rules);

assertDeepEqual(derived.score, snapshot.score, 'score');
assertDeepEqual(derived.modules, snapshot.modules, 'modules');
assertDeepEqual(derived.riskCalibration, snapshot.riskCalibration, 'riskCalibration');
assertDeepEqual(derived.tailRiskOverlay, snapshot.tailRiskOverlay, 'tailRiskOverlay');
assertDeepEqual(
  derived.transportShockScoringImpact,
  snapshot.transportShockScoringImpact,
  'transportShockScoringImpact'
);
assertDeepEqual(JSON.stringify({ realtimePayload, macroDrivers, rules }), before, 'input immutability');

console.log(`[check-main-score-engine-parity] PASS score=${derived.score}`);
