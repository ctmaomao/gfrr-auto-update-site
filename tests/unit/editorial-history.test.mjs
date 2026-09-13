import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { preserveEditorialPreviousIssue, validateEditorialPreviousIssue } from '../../scripts/macro-risk/editorial-history.mjs';
import { validateEditorialProduction } from '../../scripts/macro-risk/editorial-production.mjs';
import { isMacroRiskEditorialVisible, isMacroRiskEditorialPreviousIssueVisible } from '../../scripts/modules/renderMacroRiskEditorial.js';
import { editorialHistoryFixture } from '../fixtures/macro-editorial-history.mjs';

const friday = '2026-09-11T01:00:00.000Z';
const saturday = '2026-09-12T02:00:00.000Z';
const at = date => new Date(date);

test('Daily retains exact qualified previous issue without changing current data or the input', () => {
  const old = { updatedAt: friday, macroRiskEditorialLayer: editorialHistoryFixture(friday), score: 42 };
  const next = { updatedAt: saturday, score: 68, decisionModel: { executionLock: true } };
  const oldBytes = JSON.stringify(old);
  const nextBytes = JSON.stringify(next);
  assert.equal(preserveEditorialPreviousIssue(next, old, at(saturday)).preserved, true);
  assert.deepEqual(next.macroRiskEditorialPreviousIssue, old.macroRiskEditorialLayer);
  assert.notEqual(next.macroRiskEditorialPreviousIssue, old.macroRiskEditorialLayer);
  assert.equal(next.macroRiskEditorialLayer, undefined);
  const { macroRiskEditorialPreviousIssue: history, ...untouched } = next;
  assert.equal(JSON.stringify(untouched), nextBytes);
  assert.equal(JSON.stringify(old), oldBytes);
  assert.equal(isMacroRiskEditorialVisible(history, next, at(saturday)), false);
  assert.equal(isMacroRiskEditorialPreviousIssueVisible(history, next, at(saturday)), true);
  assert.equal(validateEditorialProduction(history, next, at(saturday)).ok, false);
});

test('consecutive skips, weekends and extended outages retain dated history without refreshing its clocks', () => {
  let previous = { updatedAt: friday, macroRiskEditorialLayer: editorialHistoryFixture(friday) };
  const expected = structuredClone(previous.macroRiskEditorialLayer);
  for (const date of [saturday, '2026-09-13T02:00:00Z', '2026-09-14T02:00:00Z', '2026-10-12T02:00:00Z']) {
    const next = { updatedAt: date };
    preserveEditorialPreviousIssue(next, previous, at(date));
    assert.deepEqual(next.macroRiskEditorialPreviousIssue, expected);
    assert.equal(validateEditorialPreviousIssue(expected, next, at(date)).ok, true);
    assert.equal(isMacroRiskEditorialVisible(expected, next, at(date)), false);
    previous = next;
  }
});

test('newer qualified current issue replaces the retained issue on the next Daily build', () => {
  const previous = { updatedAt: saturday, macroRiskEditorialLayer: editorialHistoryFixture(saturday), macroRiskEditorialPreviousIssue: editorialHistoryFixture(friday) };
  const next = { updatedAt: '2026-09-13T02:00:00Z' };
  preserveEditorialPreviousIssue(next, previous, at(next.updatedAt));
  assert.deepEqual(next.macroRiskEditorialPreviousIssue, previous.macroRiskEditorialLayer);
  // A bad current issue cannot erase the last known qualified history.
  previous.macroRiskEditorialLayer.output.headlineZh += 'tampered';
  preserveEditorialPreviousIssue(next, previous, at(next.updatedAt));
  assert.deepEqual(next.macroRiskEditorialPreviousIssue, previous.macroRiskEditorialPreviousIssue);
});

const corruptions = {
  tamperedBody: layer => { layer.output.headlineZh += 'changed'; },
  digest: layer => { layer.validation.artifactDigest = 'b'.repeat(64); },
  future: layer => { layer.generatedAt = '2027-01-01T00:00:00Z'; },
  invalidTime: layer => { layer.output.generatedAt = null; },
  incompatibleClocks: layer => { layer.generatedAt = '2026-09-12T08:00:00Z'; },
  sourceAfterGeneration: layer => { layer.sourceDataUpdatedAt = saturday; },
  failedReview: layer => { layer.qualityReview.status = 'fail'; },
  scoring: layer => { layer.boundaries.affectsGfrrScoring = true; },
  odp: layer => { layer.boundaries.affectsOdp = true; },
  manualArtifact: layer => { layer.provenance.generatedBy = 'manual'; },
  noRun: layer => { layer.provenance.runId = null; },
  noCommit: layer => { layer.provenance.sourceCommit = null; },
  sourceLedger: layer => { layer.sourceLedger = []; },
  failedValidation: layer => { layer.validation.status = 'fail'; },
  alteredAgeGate: layer => { layer.freshness.maxAgeHours = 999; },
  missingInputDigest: layer => { layer.provenance.inputDigest = null; },
};
for (const [name, mutate] of Object.entries(corruptions)) {
  test(`rejects ${name} instead of promoting it to history`, () => {
    const layer = editorialHistoryFixture(friday);
    mutate(layer);
    const next = { updatedAt: saturday, macroRiskEditorialPreviousIssue: layer };
    const before = JSON.stringify(layer);
    assert.equal(validateEditorialPreviousIssue(layer, next, at('2026-09-14T00:00:00Z')).ok, false);
    preserveEditorialPreviousIssue(next, { updatedAt: friday, macroRiskEditorialLayer: layer }, at(saturday));
    assert.equal(Object.hasOwn(next, 'macroRiskEditorialPreviousIssue'), false);
    assert.equal(JSON.stringify(layer), before);
  });
}

test('mismatched source snapshot, rollback, missing, malformed and invalid inspection clocks fail closed', () => {
  const layer = editorialHistoryFixture(friday);
  for (const previous of [{}, null, { updatedAt: saturday, macroRiskEditorialLayer: layer }]) {
    const next = { updatedAt: saturday };
    assert.equal(preserveEditorialPreviousIssue(next, previous, at(saturday)).preserved, false);
  }
  assert.equal(validateEditorialPreviousIssue(layer, { updatedAt: '2026-09-10T00:00:00Z' }, at(saturday)).ok, false);
  assert.equal(validateEditorialPreviousIssue(layer, { updatedAt: saturday }, new Date('invalid')).ok, false);
  for (const value of [null, undefined, [], {}, false, 0, '']) {
    assert.equal(validateEditorialPreviousIssue(value, { updatedAt: saturday }, at(saturday)).ok, false);
  }
});

test('normal and degraded Daily paths both preserve history, and the required suite checks it', () => {
  const source = readFileSync('scripts/run-daily-pipeline.mjs', 'utf8');
  assert.match(source, /preserveEditorialPreviousIssue\(next, prevData, new Date\(isoNow\)\)/u);
  assert.match(source, /preserveEditorialPreviousIssue\(data, prevData, new Date\(isoNow\)\)/u);
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(scripts['check:macro-risk-editorial'], /npm run check:macro-risk-editorial-history/u);
});
