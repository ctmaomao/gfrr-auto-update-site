import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPreparedWorldOrderV2 as build, validatePreparedWorldOrderV2 as validate, assertWorldOrderProductionVersion as productionGate } from '../../scripts/world-order/prepared-v2-contract.mjs';
const read = path => { const bytes = readFileSync(path); return { data: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }; };
const context = () => ({ world: read('data/world-order-stress.json'), radar: read('data/radar-data.json'), rules: JSON.parse(readFileSync('config/world-order-rules.json')) });
const now = new Date().toISOString();

test('real fixed snapshots produce all-unknown bound, never a current score or eligible V2', () => {
  const ctx = context(), result = build(ctx, now);
  assert.equal(validate(result, ctx), true);
  assert.equal(result.score, null); assert.equal(result.confidence, null);
  assert.equal(result.productionEligible, false);
  assert.equal(result.marketCompletion.scoreRange.lower, 0);
  assert.equal(result.marketCompletion.scoreRange.upper, 88);
  assert.equal(result.marketCompletion.criteria.every(x => x.status === 'unknown'), true);
  const fixed = result.fixedComponents;
  assert.equal(fixed.externalStructural.snapshotSha256, ctx.world.sha256);
  assert.equal(fixed.existingRiskModules.snapshotSha256, ctx.radar.sha256);
  assert.equal(result.scoreRange.lower, Math.round(fixed.externalStructural.score * .6 + fixed.existingRiskModules.score * .1));
  assert.equal(result.scoreRange.upper, Math.round(fixed.externalStructural.score * .6 + 88 * .3 + fixed.existingRiskModules.score * .1));
  assert.throws(() => productionGate(result), /not_activated/);
  assert.doesNotThrow(() => productionGate(ctx.world.data));
});

test('candidate cannot invent qualification, tamper intervals, omit source lineage or declare readiness', () => {
  const ctx = context();
  for (const change of [
    x => { x.marketCompletion.criteria[0] = { key: 'gold', status: 'qualified', lower: 18, upper: 18, evidenceRef: 'trust-me' }; },
    x => { x.scoreRange.lower++; }, x => { x.marketCompletion.scoreRange.upper = 100; },
    x => { delete x.fixedComponents.externalStructural.snapshotSha256; },
    x => { x.fixedComponents.existingRiskModules.asOf = now; },
    x => { x.fixedComponents.externalStructural.modelVersion = 'other'; },
    x => { x.productionEligible = true; }, x => { x.score = 0; },
    x => { x.decisionModifier = { riskBias: 'neutral' }; }, x => { x.extra = 'advice'; }
  ]) { const candidate = build(ctx, now); change(candidate); assert.throws(() => validate(candidate, ctx)); }
});

test('baseline drift, changed formula, future/invalid generation or missing components fail closed', () => {
  const ctx = context(), original = build(ctx, now);
  const drift = structuredClone(ctx); drift.world.sha256 = 'f'.repeat(64);
  assert.throws(() => validate(original, drift));
  for (const change of [x => { x.rules.scoreWeights.marketConfirmation = .4; }, x => { delete x.world.data.dimensions.peaceDividendRetreat; }, x => { x.radar.data.modules.energy = null; }, x => { x.world.data.updatedAt = '2099-01-01T00:00:00Z'; }, x => { x.world.sha256 = ''; }]) {
    const modified = structuredClone(ctx); change(modified); assert.throws(() => build(modified, now));
  }
  for (const at of ['invalid', '2099-01-01T00:00:00Z']) assert.throws(() => build(ctx, at));
  for (const version of ['', null, false, 'world-order-stress-v3']) assert.throws(() => productionGate({ contractVersion: version }));
});

test('real production checker exposes explicit prepared mode, without writing either baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gfrr-v2-validator-'));
  try {
    const ctx = context(); const file = join(dir, 'candidate.json');
    writeFileSync(file, JSON.stringify(build(ctx, now)));
    const ok = spawnSync(process.execPath, ['scripts/check-world-order-stress.mjs', '--validate-prepared-v2', file], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /NOT activated or publication-eligible/);
    const bad = build(ctx, now); bad.score = 0; writeFileSync(file, JSON.stringify(bad));
    assert.notEqual(spawnSync(process.execPath, ['scripts/check-world-order-stress.mjs', '--validate-prepared-v2', file]).status, 0);
    assert.notEqual(spawnSync(process.execPath, ['scripts/check-world-order-stress.mjs', '--validate-prepared-v2', 'data/world-order-stress.json']).status, 0);
    assert.deepEqual(context(), ctx);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
