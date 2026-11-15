import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Offline fixture tests only. Never reads/downloads the real 3.42 GB source in CI.
test('OGIM research catalog Python contract fixtures', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', directory, '-p', 'test_ogim_catalog.py', '-v'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
