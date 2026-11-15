import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { deepseekKeyFingerprint } from '../../scripts/lib/deepseek-key-fingerprint.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const key = 'sk-syntheticsecretkey1234';
test('full identity and export masked projection match without revealing fragments', () => {
  const result = deepseekKeyFingerprint(key);
  assert.equal(result.keySha256, hash(key));
  assert.equal(result.maskedProjectionSha256, hash(`${key.slice(0, 8)}:${key.slice(-4)}`));
  const text = JSON.stringify(result);
  for (const secret of [key, key.slice(0, 8), key.slice(-4)]) assert.ok(!text.includes(secret));
  assert.notEqual(deepseekKeyFingerprint('sk-synthOTHERsecretkey1234').keySha256, result.keySha256);
  assert.equal(deepseekKeyFingerprint('sk-synthOTHERsecretkey1234').maskedProjectionSha256, result.maskedProjectionSha256);
});
test('invalid input yields a fixed safe error and no guessed identity', () => {
  for (const input of [undefined, '', 123, 'short', `${key}\n`, `${key} another`, 'sk-********1234'])
    assert.throws(() => deepseekKeyFingerprint(input), /^Error: deepseek_key_fingerprint_unavailable$/u);
  const run = spawnSync(process.execPath, ['scripts/review-deepseek-key.mjs'], { encoding: 'utf8', env: { DEEPSEEK_KEY_SCOPE: 'external-ai-production-refresh', DEEPSEEK_API_KEY: `${key}\n` } });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.ok(!run.stderr.includes(key));
});
test('CLI is offline and workflow isolates the secret to an explicit main-only diagnostic', () => {
  const run = spawnSync(process.execPath, ['scripts/review-deepseek-key.mjs'], { encoding: 'utf8', env: { DEEPSEEK_KEY_SCOPE: 'external-ai-production-refresh', DEEPSEEK_API_KEY: key } });
  assert.equal(run.status, 0);
  const row = JSON.parse(run.stdout); assert.equal(row.providerCalls, 0); assert.equal(row.ledgerReads, 0); assert.equal(row.writes, 0);
  const workflow = fs.readFileSync('.github/workflows/deepseek-key-identity.yml', 'utf8');
  assert.ok(workflow.includes("github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes('scope: [external-ai-production-refresh, external-ai-manual]'));
  assert.ok(workflow.includes('environment: ${{ matrix.scope }}'));
  assert.ok(workflow.includes('DEEPSEEK_KEY_SCOPE: ${{ matrix.scope }}'));
  assert.equal(row.environment, 'external-ai-production-refresh');
  assert.ok(workflow.includes('contents: read')); assert.doesNotMatch(workflow, /contents: write|schedule:|workflow_run:|DEEPSEEK_BUDGET_|--initialize/u);
  const code = fs.readFileSync('scripts/review-deepseek-key.mjs', 'utf8') + fs.readFileSync('scripts/lib/deepseek-key-fingerprint.mjs', 'utf8');
  assert.doesNotMatch(code, /fetch\(|https:\/\/|readFile|writeFile|process\.env\.(?!DEEPSEEK_API_KEY|DEEPSEEK_KEY_SCOPE)/u);
});
