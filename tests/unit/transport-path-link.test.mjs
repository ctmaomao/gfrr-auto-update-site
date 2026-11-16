import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync(new URL('../../scripts/review-transport-shock-path-boundaries.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function assertSafeOutputPath('), end = source.indexOf('\nfunction runMonitor(', start);
assert.ok(start >= 0 && end > start, 'real guard boundary must remain identifiable');
const helper = new URL('../../scripts/lib/check-script-helpers.mjs', import.meta.url).href;
const prefix = 'manual-artifacts/transport-shock-confirmation-factor';
function check(root, output, pass) {
  const code = `import { existsSync, lstatSync } from 'node:fs'; import { resolve, relative } from 'node:path'; import { safeRelativePath } from ${JSON.stringify(helper)};\n${source.slice(start, end)}\nassertSafeOutputPath(${JSON.stringify(output)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, pass ? 0 : 1, result.stderr);
  if (!pass) assert.match(result.stderr, /Refusing output through symlink\/junction/);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-transport-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  fs.mkdirSync(path.join(root, 'outside'));
  return root;
}
for (const existing of [false, true]) {
  test(`transport guard rejects file links with ${existing ? 'existing' : 'missing'} targets`, t => {
    const root = fixture(t), target = path.join(root, 'outside/output.txt');
    if (existing) fs.writeFileSync(target, 'original');
    fs.symlinkSync(target, path.join(root, prefix, 'output.txt'), 'file');
    check(root, `${prefix}/output.txt`, false);
    assert.equal(fs.existsSync(target), existing);
    if (existing) assert.equal(fs.readFileSync(target, 'utf8'), 'original');
  });
  test(`transport guard rejects nested directory links with ${existing ? 'existing' : 'missing'} targets`, t => {
    const root = fixture(t), target = path.join(root, 'outside/nested');
    if (existing) fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(root, prefix, 'nested'), 'junction');
    check(root, `${prefix}/nested/output.json`, false);
    assert.equal(fs.existsSync(path.join(target, 'output.json')), false);
  });
}
test('both protected root links are checked, even when dangling', t => {
  for (const location of ['manual-artifacts', prefix]) {
    const root = fixture(t), target = path.join(root, 'outside/missing');
    fs.rmdirSync(path.join(root, prefix));
    if (location === 'manual-artifacts') fs.rmdirSync(path.join(root, 'manual-artifacts'));
    fs.symlinkSync(target, path.join(root, location), 'junction');
    check(root, `${prefix}/output.json`, false);
  }
});
test('ordinary new paths retain non-JSON report support without writing files', t => {
  const root = fixture(t);
  for (const name of ['output.json', 'output.txt', 'nested/output.json']) check(root, `${prefix}/${name}`, true);
  assert.deepEqual(fs.readdirSync(path.join(root, prefix)), []);
});
