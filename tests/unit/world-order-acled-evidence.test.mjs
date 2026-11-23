import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildCrossValidationMatrix } from '../../scripts/modules/buildCrossValidationMatrix.js';
import { applyAcledFreshness } from '../../scripts/world-order/acled-freshness.mjs';

const radar = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
const world = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
const worldOrderNarrative = input => {
  const before = JSON.stringify([radar, input]);
  const result = buildCrossValidationMatrix(radar, input).narratives.find(n => n.id === 'world_order_pressure_crossing');
  assert.equal(JSON.stringify([radar, input]), before);
  return result;
};

for (const status of ['partial', 'stale', 'error', 'disabled', 'manual_required', 'not_configured', 'unexpected', 'toString', null, undefined]) {
  test(`ACLED ${String(status)} is disclosed once and never confirms current pressure`, () => {
    const result = narrativeFor({ ...world.externalSources.acled, status });
    const missing = result.missingEvidence.filter(e => e.source === 'acled');
    assert.equal(missing.length, 1);
    assert.equal(result.supportingEvidence.filter(e => e.source === 'acled').length, 0);
    assert.match(missing[0].detail, /ACLED/u);
    assert.doesNotMatch(missing[0].detail, /真实周度数据已导入|\[object|undefined|unexpected|toString/u);
  });
}

test('absent ACLED is disclosed; healthy ACLED retains original supporting evidence', () => {
  assert.equal(narrativeFor(undefined).missingEvidence.filter(e => e.source === 'acled').length, 1);
  const result = narrativeFor({ ...world.externalSources.acled, status: 'ok' });
  assert.equal(result.missingEvidence.filter(e => e.source === 'acled').length, 0);
  assert.equal(result.supportingEvidence.filter(e => e.source === 'acled').length, 1);
});

const narrativeFor = source => {
  const input = structuredClone(world);
  input.externalSources.acled = source;
  return worldOrderNarrative(input);
};

function checkNarrativeDensity(input, evidenceOverride) {
  const bytes = readFileSync('data/world-order-stress.json');
  const child = `
    import fs from 'node:fs'; import path from 'node:path';
    import { registerHooks, syncBuiltinESMExports } from 'node:module';
    const { world, evidenceOverride } = JSON.parse(fs.readFileSync(0, 'utf8'));
    const read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      return typeof file === 'string' && path.resolve(file) === path.resolve('data/world-order-stress.json')
        ? JSON.stringify(world) : read.call(this, file, ...args);
    };
    syncBuiltinESMExports();
    if (evidenceOverride) {
      const builderUrl = new URL('./scripts/modules/buildCrossValidationMatrix.js', import.meta.url).href;
      const realBuilder = await import(builderUrl + '?unmodified');
      const { source, add } = evidenceOverride;
      globalThis.fixtureBuilder = (...args) => {
        const matrix = realBuilder.buildCrossValidationMatrix(...args);
        const narrative = matrix.narratives.find(n => n.id === 'world_order_pressure_crossing');
        if (add) {
          narrative.supportingEvidence.push({ source, detail: 'injected fixture evidence' });
        } else {
          narrative.supportingEvidence = narrative.supportingEvidence.filter(e => e.source !== source);
        }
        return matrix;
      };
      registerHooks({
        load(url, context, nextLoad) {
          if (url === builderUrl) {
            return { format: 'module', source: 'export const buildCrossValidationMatrix = globalThis.fixtureBuilder;', shortCircuit: true };
          }
          return nextLoad(url, context);
        },
      });
    }
    await import('./scripts/check-world-order-narrative-density.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
    input: JSON.stringify({ world: input, evidenceOverride }), encoding: 'utf8', windowsHide: true,
  });
  assert.deepEqual(readFileSync('data/world-order-stress.json'), bytes);
  return result;
}

test('the September 11 weekly age transition reaches the narrative checker', () => {
  const input = structuredClone(world);
  const source = { status: 'ok', confidence: 0.8, summary: { latestWeek: '2026-08-28', monthlyAsOfDate: '2026-08-21' }, evidence: [] };
  assert.equal(applyAcledFreshness(source, Date.parse('2026-09-10T00:49:30Z')).status, 'ok');
  input.externalSources.acled = applyAcledFreshness(source, Date.parse('2026-09-11T00:48:50Z'));
  assert.equal(input.externalSources.acled.status, 'partial');
  assert.equal(input.externalSources.acled.summary.sourceFreshness, 'aging');
  const result = checkNarrativeDensity(input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

function lowerPressureWorldOrder() {
  // Freeze the other evidence branches so this regression isolates the three
  // thresholded dimensions rather than inheriting the daily evidence floor.
  return {
    score: 43,
    state: 'bloc_fragmentation',
    freshness: 'fresh',
    confidence: 0.55,
    dominantDrivers: [{ key: 'multiTheaterConflict', score: 51 }],
    dimensions: {
      economicWeaponization: { score: 49 },
      capitalControlRisk: { score: 48 },
      blocFormation: { score: 47 },
      multiTheaterConflict: { score: 51 },
      marketConfirmation: { score: 51, state: 'confirmed' },
    },
    marketConfirmationInput: { source: 'worker-generated-preview' },
    externalSources: {
      gdelt: { status: 'stale' },
      ofac: { status: 'ok', summary: { recentActionsCount: 1 } },
      acled: { status: 'ok', summary: { latestWeek: '2026-11-13', eventsDelta4Vs12: 0.1, regionsTracked: 8 } },
      sipri: { status: 'manual_required' },
    },
  };
}

test('narrative density accepts the natural score-43 pattern when three dimensions are below 50', () => {
  const input = lowerPressureWorldOrder();
  const sources = worldOrderNarrative(input).supportingEvidence.map(e => e.source);
  for (const source of ['economic_weaponization', 'capital_control_risk', 'bloc_formation']) {
    assert.ok(!sources.includes(source), source);
  }
  const result = checkNarrativeDensity(input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('narrative density requires evidence at 50, but rejects forged evidence below 50', () => {
  const input = lowerPressureWorldOrder();
  input.dimensions.economicWeaponization.score = 50;
  const sources = worldOrderNarrative(input).supportingEvidence.map(e => e.source);
  assert.ok(sources.includes('economic_weaponization'));
  const valid = checkNarrativeDensity(input);
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);

  const omitted = checkNarrativeDensity(input, { source: 'economic_weaponization', add: false });
  assert.equal(omitted.status, 1, omitted.stdout + omitted.stderr);
  assert.match(omitted.stderr, /missing supporting evidence source: economic_weaponization/u);

  const forged = checkNarrativeDensity(input, { source: 'capital_control_risk', add: true });
  assert.equal(forged.status, 1, forged.stdout + forged.stderr);
  assert.match(forged.stderr, /unexpected supporting evidence source: capital_control_risk/u);
});
