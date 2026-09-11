import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inspectRetainedEditorial } from '../../scripts/macro-risk/editorial-runtime-check.mjs';
import { validateEditorialProduction, applyEditorialProjection } from '../../scripts/macro-risk/editorial-production.mjs';
import { isMacroRiskEditorialVisible } from '../../scripts/modules/renderMacroRiskEditorial.js';

// Synthetic envelope, independent of the optional production snapshot. Full
// provider-output acceptance remains covered by the unchanged core suite.
const generated = '2026-09-01T00:00:00.000Z';
const later = hours => new Date(Date.parse(generated) + hours * 3600000);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function dataAtGeneration() {
  const output = {
    model: 'fixture', sourceDataUpdatedAt: generated, generatedAt: generated,
    headlineZh: '测试判读', leadZh: '仅用于过期边界回归',
    moduleAnalysis: Array.from({ length: 6 }, () => ({ sourceRefIds: ['site:test'] })),
    crossMarketAnalysis: Array.from({ length: 3 }, () => ({ sourceRefIds: ['site:test'] })),
    sourceAttribution: [{ sourceRefId: 'site:test' }]
  };
  return { updatedAt: generated, macroRiskEditorialLayer: {
    schemaVersion: 'macro-risk-editorial-production-v1', status: 'valid', displayEnabled: true,
    generatedAt: generated, sourceDataUpdatedAt: generated, provider: 'deepseek',
    mode: 'external_ai_macro_risk_editorial', model: 'fixture', output,
    validation: { status: 'pass', artifactDigest: hash(output) },
    qualityReview: { status: 'warn', promotionEligible: false },
    provenance: { humanApproved: false, inputDigest: hash({}), artifactDigest: hash(output) },
    freshness: { artifactGeneratedAt: generated, maxAgeHours: 30, isStale: false },
    sourceLedger: [{ id: 'site:test', kind: 'site' }],
    boundaries: { displayOnly: true, frontendDisplayApproved: true, notInvestmentAdvice: true,
      ...Object.fromEntries(['GfrrScoring', 'RiskModules', 'TailRiskOverlay', 'DecisionModel', 'ExecutionLock', 'PositionGuidance', 'WorldOrder', 'Odp', 'BubbleWatch'].map(key => [`affects${key}`, false])) }
  } };
}

test('same stored bytes remain valid at 30h, become hidden history after 30h, and stay rejected for new writes', () => {
  const data = dataAtGeneration();
  const before = JSON.stringify(data);
  for (const age of [0, 29.99, 30]) {
    assert.equal(inspectRetainedEditorial(data, later(age)).status, 'valid');
    assert.equal(isMacroRiskEditorialVisible(data.macroRiskEditorialLayer, data, later(age)), true);
  }
  for (const age of [30.0001, 48, 365 * 24]) {
    assert.equal(inspectRetainedEditorial(data, later(age)).status, 'expired_hidden');
    assert.equal(isMacroRiskEditorialVisible(data.macroRiskEditorialLayer, data, later(age)), false);
    assert.equal(validateEditorialProduction(data.macroRiskEditorialLayer, data, later(age)).ok, false);
    assert.throws(() => applyEditorialProjection(data, data.macroRiskEditorialLayer, later(age), {}), /timestamp/u);
  }
  assert.equal(JSON.stringify(data), before);
});

test('invalid, future, mixed or mutually incompatible generation clocks cannot become retained history', () => {
  for (const change of [
    layer => { layer.generatedAt = 'invalid'; },
    layer => { layer.generatedAt = null; },
    layer => { layer.generatedAt = later(49).toISOString(); },
    layer => { layer.generatedAt = later(47).toISOString(); },
    layer => { layer.generatedAt = later(-31).toISOString(); },
    layer => { layer.output.generatedAt = later(49).toISOString(); },
    layer => { layer.generatedAt = layer.output.generatedAt = later(49).toISOString(); },
  ]) {
    const data = dataAtGeneration();
    change(data.macroRiskEditorialLayer);
    // Keep envelope metadata/digests consistent so only the clock policy can
    // reject these cases, rather than an unrelated checksum mismatch.
    const layer = data.macroRiskEditorialLayer;
    layer.freshness.artifactGeneratedAt = layer.output.generatedAt;
    layer.provenance.artifactDigest = layer.validation.artifactDigest = hash(layer.output);
    assert.equal(inspectRetainedEditorial(data, later(48)).ok, false);
  }
  assert.equal(inspectRetainedEditorial(dataAtGeneration(), new Date('invalid')).ok, false);
});

const corruptions = {
  digest: layer => { layer.provenance.artifactDigest = 'a'.repeat(64); },
  inputDigest: layer => { layer.provenance.inputDigest = 'invalid'; },
  body: layer => { layer.output.headlineZh += ' altered'; },
  sourceMismatch: layer => { layer.sourceDataUpdatedAt = '2000-01-01T00:00:00Z'; },
  sourceMissing: layer => { layer.sourceLedger = []; },
  sourceDuplicate: layer => { layer.sourceLedger.push(layer.sourceLedger[0]); },
  snippet: layer => { layer.sourceLedger[0].snippet = 'must remain rejected'; },
  unsafeLink: layer => { layer.sourceLedger.push({ id: 'news:bad', kind: 'news', url: 'http://example.org' }); },
  review: layer => { layer.qualityReview.status = 'fail'; },
  validation: layer => { layer.validation.status = 'fail'; },
  scoring: layer => { layer.boundaries.affectsGfrrScoring = true; },
  odp: layer => { layer.boundaries.affectsOdp = true; },
  agePolicy: layer => { layer.freshness.maxAgeHours = 60; },
  staleFlag: layer => { layer.freshness.isStale = true; },
  output: layer => { layer.output = null; },
  schema: layer => { layer.schemaVersion = 'invalid'; },
};
for (const [name, mutate] of Object.entries(corruptions)) {
  test(`expired ${name} defect remains a failure, not an expiry exception`, () => {
    const data = dataAtGeneration();
    mutate(data.macroRiskEditorialLayer);
    const before = JSON.stringify(data);
    assert.equal(inspectRetainedEditorial(data, later(48)).ok, false);
    assert.equal(JSON.stringify(data), before);
  });
}

test('missing is optional but malformed present layers are not silently skipped', () => {
  assert.equal(inspectRetainedEditorial({}).status, 'missing');
  for (const layer of [false, 0, '', [], {}]) assert.equal(inspectRetainedEditorial({ macroRiskEditorialLayer: layer }).ok, false);
});

test('strict live CLI rejects this same expired snapshot; runtime CLI warns without writing', () => {
  const data = dataAtGeneration();
  const before = readFileSync('data/radar-data.json');
  const child = `
    import fs from 'node:fs'; import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    import { syncBuiltinESMExports } from 'node:module';
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [input.now])); }
      static now() { return RealDate.parse(input.now); }
    };
    const original = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      return typeof file === 'string' && path.resolve(file) === path.resolve('data/radar-data.json')
        ? JSON.stringify(input.data) : original.call(this, file, ...args);
    };
    syncBuiltinESMExports(); process.argv = ['node', input.script, ...input.flags];
    await import(pathToFileURL(path.resolve(input.script)).href);
  `;
  for (const [script, flags, exit] of [
    ['scripts/check-macro-risk-editorial-live.mjs', [], 1],
    ['scripts/check-macro-risk-editorial-live.mjs', ['--require-layer'], 1],
    ['scripts/check-macro-risk-editorial-runtime.mjs', [], 0],
    ['scripts/check-macro-risk-editorial-runtime.mjs', ['--require-layer'], 1],
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
      input: JSON.stringify({ data, script, flags, now: later(48).toISOString() }), encoding: 'utf8', windowsHide: true, timeout: 10000
    });
    assert.equal(result.status, exit, result.stderr);
    if (exit === 0) assert.match(result.stderr, /expired_hidden/u);
  }
  assert.deepEqual(readFileSync('data/radar-data.json'), before);
});

test('full suite inspects retained history while producer acceptance retains the strict live CLI', () => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(scripts['check:all'], /npm run check:macro-risk-editorial(?: &&|$)/u);
  assert.match(scripts['check:macro-risk-editorial'], /npm run check:macro-risk-editorial-runtime(?: &&|$)/u);
  assert.match(readFileSync('.github/workflows/macro-risk-editorial-refresh.yml', 'utf8'), /npm run check:macro-risk-editorial-live -- --require-layer/u);
});
