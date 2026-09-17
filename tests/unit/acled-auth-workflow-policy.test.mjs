import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_WORKFLOW_PATH, DETAIL_WORKFLOW_PATH, BATCH_WORKFLOW_PATH, AUTO_WORKFLOW_PATH, isReviewedAcledAuthWorkflow } from '../../scripts/acled-auth-workflow-policy.mjs';
const approved = readFileSync('tests/fixtures/acled-auth-workflow-approved.txt', 'utf8');

test('weekly automation policy is exact and never changes older one-use budgets', () => {
  const automatic = readFileSync('tests/fixtures/acled-auto-workflow-approved.txt', 'utf8');
  assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, automatic), true);
  assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, automatic.replace(/\r?\n/gu, '\r\n')), true);
  for (const file of [AUTH_WORKFLOW_PATH, DETAIL_WORKFLOW_PATH, BATCH_WORKFLOW_PATH, '.github/workflows/acled-weekly-refresh-reminder.yml']) assert.equal(isReviewedAcledAuthWorkflow(file, automatic), false);
  for (const fixture of ['auth', 'detail', 'batch']) assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, readFileSync(`tests/fixtures/acled-${fixture}-workflow-approved.txt`, 'utf8')), false);
  for (const [a,b] of [['default: false','default: true'], ['30 0 * * 1','30 0 * * *'], ['github.run_attempt == 1','true'], ['cancel-in-progress: false','cancel-in-progress: true'], ['persist-credentials: false','persist-credentials: true'], ['--ignore-scripts',''], ['--live','--live --retry'], ['timeout-minutes: 20','timeout-minutes: 200'], ['ACLED_DOWNLOAD_PASSWORD','ACLED_API_KEY']]) assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, automatic.replace(a,b)), false);
  assert.equal(isReviewedAcledAuthWorkflow(AUTO_WORKFLOW_PATH, automatic + '\n# changed'), false);
});

test('private batch exception is exact, isolated and cannot acquire write or schedule rights', () => {
  const batch = readFileSync('tests/fixtures/acled-batch-workflow-approved.txt', 'utf8');
  assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, batch), true);
  assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, batch.replace(/\r?\n/gu, '\r\n')), true);
  for (const file of [AUTH_WORKFLOW_PATH, DETAIL_WORKFLOW_PATH, '.github/workflows/refresh-world-order-stress.yml']) assert.equal(isReviewedAcledAuthWorkflow(file, batch), false);
  for (const old of [approved, readFileSync('tests/fixtures/acled-detail-workflow-approved.txt', 'utf8')]) assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, old), false);
  for (const [a,b] of [['default: false','default: true'],['contents: read','contents: write'],['workflow_dispatch:','schedule:'],['github.run_attempt == 1','true'],['--live','--live --retry'],['--ignore-scripts',''],['ACLED_DOWNLOAD_PASSWORD','ACLED_API_KEY'],['timeout-minutes: 15','timeout-minutes: 150']]) assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, batch.replace(a,b)), false);
  assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, batch + '\n# changed'), false);
});
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
