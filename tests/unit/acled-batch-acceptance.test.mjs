import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { acceptAcledBatch, batchExecutionAllowed } from '../../scripts/world-order/acled-batch-acceptance.mjs';
import { BATCH_WORKFLOW_PATH, isReviewedAcledAuthWorkflow } from '../../scripts/acled-auth-workflow-policy.mjs';
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_WORKFLOW_REF: 'ctmaomao/gfrr-auto-update-site/.github/workflows/acled-private-batch-acceptance.yml@refs/heads/main' };
const candidate = key => ({ [key]: '2026-09-11', preparedAt: 'PRIVATE_CLOCK',
  filesIngested: Array.from({ length: 6 }, () => ({ rowCount: 10 })), privateRows: 'PRIVATE_CONTENT' });
const batch = () => ({ report: { status: 'authenticated_zip_batch_read', logout: 'confirmed', sessionMayRemain: false }, workbooks: [Buffer.from('PRIVATE_FILE')] });
test('exact execution environment and reviewed workflow; default CLI performs no requests', () => {
  assert.equal(batchExecutionAllowed(env), true);
  for (const key of Object.keys(env)) assert.equal(batchExecutionAllowed({ ...env, [key]: 'wrong' }), false);
  assert.equal(isReviewedAcledAuthWorkflow(BATCH_WORKFLOW_PATH, readFileSync(BATCH_WORKFLOW_PATH, 'utf8')), true);
  for (const args of [[], ['--dry-run'], ['--live'], ['--invalid']]) {
    const r = spawnSync(process.execPath, ['scripts/accept-acled-batch.mjs', ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' } });
    const out = JSON.parse(r.stdout); assert.equal(out.requestCount, 0);
    assert.equal(r.status, !args.length || args[0] === '--dry-run' ? 0 : 1);
  }
});
test('failed collection or unconfirmed logout never starts private validation', async () => {
  for (const report of [{ status: 'stopped', logout: 'confirmed' }, { status: 'authenticated_zip_batch_read', logout: 'unconfirmed' }]) {
    const r = await acceptAcledBatch({ collect: async () => ({ report, workbooks: [] }), validate: () => assert.fail() });
    assert.equal(r.status, 'collection_failed'); assert.equal(r.productionWritten, false);
  }
});
test('validation and cleanup failures cannot emit successful summaries', async () => {
  for (const report of [{ status: 'stopped', cleanupConfirmed: true }, { status: 'private_validation_passed', cleanupConfirmed: false }]) {
    const b = batch();
    const r = await acceptAcledBatch({ collect: async () => b, validate: () => ({ report, candidates: {} }) });
    assert.equal(r.status, 'validation_failed'); assert.equal(r.weekly, undefined); assert.equal(b.workbooks, null);
  }
});
test('successful output exposes counts/dates/hash only, releases raw and derived buffers', async () => {
  const b = batch(), v = { report: { status: 'private_validation_passed', cleanupConfirmed: true }, candidates: {
    'world-order-acled-regional-weekly.json': candidate('latestWeek'), 'world-order-acled-global-monthly.json': candidate('asOfDate') } };
  const r = await acceptAcledBatch({ collect: async () => b, validate: () => v });
  assert.equal(r.status, 'validated_not_published'); assert.equal(r.weekly.rows, 60); assert.equal(r.monthly.files, 6);
  assert.equal(r.productionWritten, false); assert.match(r.weekly.sha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE|filesIngested|privateRows/u);
  assert.equal(b.workbooks, null); assert.equal(v.candidates, null);
});
test('unexpected failures never disclose original exception text', async () => {
  const r = await acceptAcledBatch({ collect: async () => { throw new Error('PRIVATE'); } });
  assert.equal(r.status, 'stopped'); assert.equal(r.sessionMayRemain, true); assert.doesNotMatch(JSON.stringify(r), /PRIVATE/u);
});
