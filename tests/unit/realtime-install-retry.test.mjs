import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const bash = process.platform === 'win32'
  ? path.resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
  : 'bash';

function installationScript() {
  const source = readFileSync('.github/workflows/build-realtime-market.yml', 'utf8').replaceAll('\r\n', '\n');
  const start = source.indexOf('      - name: Install dependencies\n');
  assert.ok(start >= 0);
  const remaining = source.slice(start);
  const next = remaining.indexOf('\n      - name:', 1);
  assert.ok(next > 0);
  const step = remaining.slice(0, next);
  const marker = '        run: |\n';
  const run = step.indexOf(marker);
  assert.ok(run > 0);
  return step.slice(run + marker.length).split('\n').map((line) => {
    assert.ok(!line.trim() || line.startsWith('          '));
    return line.slice(10);
  }).join('\n');
}

function runInstallation(failures) {
  // Execute the actual tracked shell block. npm and sleep are synthetic functions:
  // no installation, network, credentials, files or production generation.
  const sandbox = `attempt_count=0\ntrap 'printf "ATTEMPTS=%s\\n" "$attempt_count"' EXIT\n`
    + `npm() { attempt_count=$((attempt_count + 1)); if [ "$attempt_count" -le ${failures} ]; then return 17; fi; return 0; }\n`
    + 'sleep() { :; }\n';
  const result = spawnSync(bash, ['-c', sandbox + installationScript()], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 65536,
  });
  assert.ifError(result.error);
  return result;
}

test('three failed installs propagate the npm exit code and stop after the bounded attempts', () => {
  const result = runInstallation(3);
  assert.equal(result.status, 17, result.stdout + result.stderr);
  assert.match(result.stdout, /ATTEMPTS=3/u);
});

test('installation stops at first success and can recover on the last permitted attempt', () => {
  for (const [failures, attempts] of [[0, 1], [2, 3]]) {
    const result = runInstallation(failures);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`ATTEMPTS=${attempts}`));
  }
});
