import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildCrossValidationMatrix } from '../../scripts/modules/buildCrossValidationMatrix.js';
import { applyAcledFreshness } from '../../scripts/world-order/acled-freshness.mjs';

const radar = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
const world = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
const narrativeFor = source => {
  const input = structuredClone(world);
  input.externalSources.acled = source;
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

test('the September 11 weekly age transition reaches the unchanged narrative checker', () => {
  const input = structuredClone(world);
  const source = { status: 'ok', confidence: 0.8, summary: { latestWeek: '2026-08-28', monthlyAsOfDate: '2026-08-21' }, evidence: [] };
  assert.equal(applyAcledFreshness(source, Date.parse('2026-09-10T00:49:30Z')).status, 'ok');
  input.externalSources.acled = applyAcledFreshness(source, Date.parse('2026-09-11T00:48:50Z'));
  assert.equal(input.externalSources.acled.status, 'partial');
  assert.equal(input.externalSources.acled.summary.sourceFreshness, 'aging');
  const bytes = readFileSync('data/world-order-stress.json');
  const child = `
    import fs from 'node:fs'; import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    const payload = fs.readFileSync(0, 'utf8'), read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      return typeof file === 'string' && path.resolve(file) === path.resolve('data/world-order-stress.json')
        ? payload : read.call(this, file, ...args);
    };
    syncBuiltinESMExports(); await import('./scripts/check-world-order-narrative-density.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readFileSync('data/world-order-stress.json'), bytes);
});
