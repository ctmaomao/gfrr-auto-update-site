import test from 'node:test';
import assert from 'node:assert/strict';
import { transportAuditImpact } from '../../scripts/lib/check-script-helpers.mjs';

test('Offline Transport Shock audit impact retains its exact false fields, order and independent objects', () => {
  const expected = [
    'writesProductionData', 'modifiesFrontend', 'modifiesWorkerRuntime', 'modifiesWorkflow',
    'affectsValues', 'affectsDisplayInputsBaseline', 'affectsEffectiveDisplayInputs',
    'affectsScoring', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance',
    'affectsBrentPromotion', 'affectsOdpFinalBias', 'affectsMainJudgment', 'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ];
  const expectedJson = '{' + expected.map(key => `"${key}":false`).join(',') + '}';
  const first = transportAuditImpact();
  const second = transportAuditImpact();
  assert.equal(JSON.stringify(first), expectedJson);
  assert.equal(JSON.stringify(second), expectedJson);
  assert.notEqual(first, second);
  first.affectsScoring = true;
  delete first.affectsCrossValidation;
  assert.equal(JSON.stringify(second), expectedJson);
  assert.equal(JSON.stringify(transportAuditImpact()), expectedJson);
});
