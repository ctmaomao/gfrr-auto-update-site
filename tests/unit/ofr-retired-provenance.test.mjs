import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';

const now = '2026-11-01T12:00:00Z';
const retired = () => retireLegacyAdvice({ score: 68, updatedAt: now }, buildPublishedOfrComponent({ now }));
function run(payload) {
  return spawnSync(process.execPath, ['scripts/check-external-ai-provenance-completeness.mjs','-'], { input: JSON.stringify(payload), encoding: 'utf8' });
}
test('retired provenance accepts only the complete validated new publication contract', () => {
  const valid = run(retired()); assert.equal(valid.status, 0, valid.stderr); assert.match(valid.stdout, /strict OFR retirement contract/);
  for (const mutate of [d => delete d.mainPressureReadout, d => d.advicePolicy.ofrToPositionMapping = {}, d => d.tradingSystem.positioning.riskBudget = 30, d => d.externalAiInterpretationLayer = { provenance: {} }, d => d.mainPressureReadout.currentEligible = true]) {
    const d = retired(); mutate(d); assert.notEqual(run(d).status, 0);
  }
});
test('a bare retirement flag or missing legacy layer never bypasses old provenance rules', () => {
  for (const d of [{ score: 68 }, { score: 68, advicePolicy: { mode: 'retired' } }, { externalAiInterpretationLayer: { provenance: {} } }]) assert.notEqual(run(d).status, 0);
});
test('legacy provenance keeps its original required fields and digest, commit, clock and run-id guards', () => {
  const old = { externalAiInterpretationLayer: { provenance: { runId: '1', artifactName: 'sample', artifactId: '1', artifactDigest: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), sourceDataUpdatedAt: now } } };
  const valid = run(old); assert.equal(valid.status, 0, valid.stderr);
  for (const mutate of [p => delete p.artifactId, p => p.runId = 'bad', p => p.artifactDigest = 'bad', p => p.sourceCommit = 'bad', p => p.sourceDataUpdatedAt = 'bad']) {
    const d = structuredClone(old); mutate(d.externalAiInterpretationLayer.provenance); assert.notEqual(run(d).status, 0);
  }
});
