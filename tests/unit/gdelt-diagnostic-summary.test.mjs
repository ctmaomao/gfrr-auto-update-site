import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { summarizeGdeltResponse } from '../../scripts/diagnostics/gdelt-response-summary.mjs';

test('diagnostic output contains only status and aggregate counts', () => {
  const secret = 'SENTINEL_SECRET_DO_NOT_LOG';
  for (const [body, code] of [[secret, 403], [`{"secret":"${secret}",`, 200], [JSON.stringify({ error: secret }), 200], [JSON.stringify({ success: true, data: [{ id: secret, token: secret }] }), 200]]) {
    const output = summarizeGdeltResponse(body, code);
    assert.equal(JSON.stringify(output).includes(secret), false);
  }
  assert.equal(summarizeGdeltResponse('{"success":true,"data":[{},{}]}', 200).itemCount, 2);
  assert.equal(summarizeGdeltResponse('{"data":[{}]}', 200, 'summary').ok, true);
  assert.equal(summarizeGdeltResponse('x'.repeat(1024 * 1024 + 1), 200).status, 'response_too_large');
});

test('CLI rejects bad JSON without echoing stdin or parser errors', () => {
  const result = spawnSync(process.execPath, ['scripts/diagnostics/gdelt-response-summary.mjs', '--http-status', '200', '--kind', 'events'], { input: '{SENTINEL_SECRET', encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /invalid_json/);
  assert.doesNotMatch(result.stdout + result.stderr, /SENTINEL_SECRET/);
});

test('diagnostic workflow keeps bounded calls and sends bodies through sanitized stdin', () => {
  const workflow = readFileSync('.github/workflows/test-api-secrets.yml', 'utf8');
  assert.equal((workflow.match(/--connect-timeout 5 --max-time 20 --max-filesize 1048576/gu) || []).length, 2);
  assert.equal((workflow.match(/printf '%s' "\$body" \| node scripts\/diagnostics\/gdelt-response-summary.mjs/gu) || []).length, 2);
  assert.doesNotMatch(workflow, /Response preview|cut -c|Parse error:|Sample id/);
});
