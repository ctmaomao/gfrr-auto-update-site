import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
import { buildBubbleReceiptCandidate, serializeBubbleReceiptCandidate } from '../../scripts/prepare-bubble-receipt-candidate.mjs';
import { RECEIPT_GRANT } from '../../scripts/lib/deepseek-receipt-grant.mjs';
import { buildLimitedBubbleEditorialPack as pack } from '../helpers/bubble-limited-editorial-pack.mjs';

const env = { DEEPSEEK_BUDGET_SELECTION: RECEIPT_GRANT.id, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
  EDITORIAL_PROVIDER_OUTCOME: 'success', EDITORIAL_REVIEW_OUTCOME: 'success', GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_WORKFLOW: 'Bubble Watch Weekly Editorial Refresh',
  GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', DEEPSEEK_API_KEY: 'test-secret-never-retained-12345' };
const build = (p, override = {}) => buildBubbleReceiptCandidate({ bubbleWatch: p.bubble, projection: p.projection, now: p.now, env, ...override });
test('successful selected candidate preserves exact validated replay evidence without provider envelope', () => {
  const p = pack(), candidate = build(p);
  assert.equal(candidate.publicationReady, false);
  assert.equal(candidate.replayEvidenceRetained, true);
  assert.deepEqual(candidate.projection.writeEvidence.input, p.input);
  assert.deepEqual(candidate.projection.writeEvidence.review, p.review);
  assert.deepEqual(buildWeeklyEditorialWriteResult(p.bubble, candidate.projection, { now: p.now }), buildWeeklyEditorialWriteResult(p.bubble, p.projection, { now: p.now }));
  assert.equal(JSON.stringify(candidate).includes(env.DEEPSEEK_API_KEY), false);
  assert.equal(Object.hasOwn(candidate, 'headers'), false);
});
test('default, failed, cancelled, mismatched and stale candidates never package', () => {
  for (const change of [{ DEEPSEEK_BUDGET_SELECTION: 'monthly' }, { EDITORIAL_PROVIDER_OUTCOME: 'failure' },
    { EDITORIAL_REVIEW_OUTCOME: 'cancelled' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_RUN_ID: '456' }, { DEEPSEEK_API_KEY: '' }]) {
    assert.throws(() => build(pack(), { env: { ...env, ...change } }));
  }
  const p = pack(); p.bubble.as_of_date = '2020-01-01'; assert.throws(() => build(p));
});
test('unknown input, candidate and nested news fields are never retained', () => {
  for (const mutate of [p => { p.input.privateField = 'PRIVATE'; }, p => { p.output.providerEnvelope = 'PRIVATE'; },
    p => { p.input.newsContext.stories[0].headers = 'PRIVATE'; }, p => { p.layer.sourceLedger[0].secret = 'PRIVATE'; }]) {
    const p = pack(); mutate(p); assert.throws(() => build(p));
  }
});
test('actual credential anywhere in retained source data holds without changing the source', () => {
  const p = pack();
  const value = p.output.headlineZh;
  assert.throws(() => build(p, { env: { ...env, DEEPSEEK_API_KEY: value } }));
  assert.equal(p.output.headlineZh, value);
});
test('candidate grant never writes or pushes; exact successful artifact is short-retention', () => {
  const text = fs.readFileSync('.github/workflows/bubble-watch-weekly-editorial-refresh.yml', 'utf8');
  const steps = text.split('\n      - name:');
  for (const name of ['Write weekly editorial field', 'Protected path assertion', 'Commit refreshed weekly editorial']) {
    assert.ok(steps.find(s => s.startsWith(` ${name}\n`)).includes(`inputs.budget_selection != '${RECEIPT_GRANT.id}'`));
  }
  const candidate = steps.find(s => s.startsWith(' Upload receipt-grant review candidate\n'));
  assert.ok(candidate.includes(`inputs.budget_selection == '${RECEIPT_GRANT.id}' && steps.receipt_candidate.outcome == 'success'`));
  assert.ok(candidate.includes('path: manual-artifacts/bubble-watch-weekly-editorial/receipt-review-candidate.json\n'));
  assert.ok(candidate.includes('retention-days: 3'));
});

test('retention cap measures exact pretty-printed file bytes including trailing newline', () => {
  const overhead = Buffer.byteLength(serializeBubbleReceiptCandidate({ text: '' }));
  const value = { text: 'x'.repeat(128 * 1024 - overhead) };
  assert.equal(Buffer.byteLength(serializeBubbleReceiptCandidate(value)), 128 * 1024);
  assert.throws(() => serializeBubbleReceiptCandidate({ text: value.text + 'x' }), /bubble_receipt_candidate_hold/);
});
