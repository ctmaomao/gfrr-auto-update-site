import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Synthetic HTML only. No archive/PDF downloads or real source files in CI.
test('WPSR offline HTML metadata Python fixtures', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', fileURLToPath(new URL('.', import.meta.url)), '-p', 'test_wpsr_html_metadata.py', '-v'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
