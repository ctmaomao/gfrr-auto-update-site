import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_WORKFLOW_PATH, DETAIL_WORKFLOW_PATH, isReviewedAcledAuthWorkflow } from '../../scripts/acled-auth-workflow-policy.mjs';
const approved = readFileSync('tests/fixtures/acled-auth-workflow-approved.txt', 'utf8');
test('ACLED credential exception is exact-path/exact-content and tolerates only line endings', () => {
  assert.equal(isReviewedAcledAuthWorkflow(AUTH_WORKFLOW_PATH, approved), true);
  assert.equal(isReviewedAcledAuthWorkflow(AUTH_WORKFLOW_PATH, approved.replace(/\r?\n/gu, '\r\n')), true);
  assert.equal(isReviewedAcledAuthWorkflow('.github/workflows/refresh-world-order-stress.yml', approved), false);
  for (const [before, after] of [['default: false', 'default: true'], ['contents: read', 'contents: write'], ['workflow_dispatch:', 'schedule:'], ['ACLED_DOWNLOAD_PASSWORD', 'ACLED_API_KEY'], ['github.run_attempt == 1', 'true'], ['--live', '--live --retry']]) {
    assert.equal(isReviewedAcledAuthWorkflow(AUTH_WORKFLOW_PATH, approved.replace(before, after)), false);
  }
  assert.equal(isReviewedAcledAuthWorkflow(AUTH_WORKFLOW_PATH, approved + '\n# extra'), false);
});
test('detail discovery exception is independent, exact and non-transferable', () => {
  const detail = readFileSync('tests/fixtures/acled-detail-workflow-approved.txt', 'utf8');
  assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH, detail), true);
  assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH, detail.replace(/\r?\n/gu,'\r\n')), true);
  assert.equal(isReviewedAcledAuthWorkflow(AUTH_WORKFLOW_PATH, detail), false);
  assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH, approved), false);
  assert.equal(isReviewedAcledAuthWorkflow('.github/workflows/refresh-world-order-stress.yml', detail), false);
  for (const [before, after] of [['default: false','default: true'],['contents: read','contents: write'],
    ['workflow_dispatch:','schedule:'],['ACLED_DOWNLOAD_PASSWORD','ACLED_API_KEY'],
    ['github.run_attempt == 1','true'],['--live','--live --retry'],['timeout-minutes: 8','timeout-minutes: 80']]) {
    assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH,detail.replace(before,after)),false);
  }
  assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH,detail+'\n# extra'),false);
});
