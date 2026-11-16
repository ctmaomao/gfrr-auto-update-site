import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = new URL('../../scripts/lib/check-script-helpers.mjs', import.meta.url).href;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-manual-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'manual-artifacts'));
  fs.mkdirSync(path.join(root, 'outside'));
  return root;
}
function check(root, file, pass, prefix = 'manual-artifacts/') {
  const code = `import { assertManualArtifactWritePath } from ${JSON.stringify(helper)}; console.log(assertManualArtifactWritePath(${JSON.stringify(file)}, ${JSON.stringify(prefix)}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  if (pass) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), path.resolve(root, file));
  } else {
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /Refusing output/);
  }
}

test('ordinary new and existing JSON paths retain behavior and the guard never writes', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'manual-artifacts/existing.json'), 'original');
  check(root, 'manual-artifacts/nested/new.json', true);
  check(root, 'manual-artifacts/existing.json', true);
  assert.equal(fs.existsSync(path.join(root, 'manual-artifacts/nested')), false);
  assert.equal(fs.readFileSync(path.join(root, 'manual-artifacts/existing.json'), 'utf8'), 'original');
  for (const file of ['outside/new.json', 'manual-artifacts/../outside/new.json', 'manual-artifacts/new.txt']) check(root, file, false);
  check(root, 'manual-artifacts/scoped/new.json', true, 'manual-artifacts/scoped/');
  check(root, 'manual-artifacts/new.json', false, 'manual-artifacts/scoped/');
});
for (const dangling of [false, true]) {
  test(`file symlinks are rejected even when target ${dangling ? 'is absent' : 'exists'}`, t => {
    const root = fixture(t), target = path.join(root, 'outside/target.json');
    if (!dangling) fs.writeFileSync(target, 'original');
    fs.symlinkSync(target, path.join(root, 'manual-artifacts/link.json'), 'file');
    check(root, 'manual-artifacts/link.json', false);
    assert.equal(fs.existsSync(target), !dangling);
    if (!dangling) assert.equal(fs.readFileSync(target, 'utf8'), 'original');
  });
  test(`directory links are rejected even when target ${dangling ? 'is absent' : 'exists'}`, t => {
    const root = fixture(t), target = path.join(root, 'outside/directory');
    if (!dangling) fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(root, 'manual-artifacts/link'), 'junction');
    check(root, 'manual-artifacts/link/new.json', false);
    assert.equal(fs.existsSync(path.join(target, 'new.json')), false);
  });
}
