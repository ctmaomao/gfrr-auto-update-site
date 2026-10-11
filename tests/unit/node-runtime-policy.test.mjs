import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isSupportedNodeRuntime, NODE_ENGINE_RANGE } from '../../scripts/lib/node-runtime-policy.mjs';

test('runtime floor rejects old patches, different majors and prereleases', () => {
  for (const version of ['24.15.0', '24.19.9', '22.99.0', '25.0.0', '24.20.0-rc.1', '24', '', null]) {
    assert.equal(isSupportedNodeRuntime(version), false, String(version));
  }
  for (const version of ['24.20.0', 'v24.20.0', '24.20.1', '24.21.0']) {
    assert.equal(isSupportedNodeRuntime(version), true, version);
  }
});

function checkAction(actionRef) {
  const directory = mkdtempSync(path.join(tmpdir(), 'gfrr-node-runtime-'));
  try {
    mkdirSync(path.join(directory, 'scripts/lib'), { recursive: true });
    mkdirSync(path.join(directory, '.github/workflows'), { recursive: true });
    for (const file of ['scripts/check-node-runtime.mjs', 'scripts/lib/node-runtime-policy.mjs']) {
      copyFileSync(new URL(`../../${file}`, import.meta.url), path.join(directory, file));
    }
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ engines: { node: NODE_ENGINE_RANGE } }));
    for (const file of ['.nvmrc', '.node-version']) writeFileSync(path.join(directory, file), '24\n');
    writeFileSync(path.join(directory, '.github/workflows/fixture.yml'),
      `env:\n  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\njobs:\n  fixture:\n    steps:\n      - uses: ${actionRef}\n`);
    const result = spawnSync(process.execPath, ['scripts/check-node-runtime.mjs'], {
      cwd: directory, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('cache entry points require the reviewed immutable Node 24 action revision', () => {
  for (const action of ['actions/cache', 'actions/cache/restore', 'actions/cache/save']) {
    const approved = checkAction(`${action}@55cc8345863c7cc4c66a329aec7e433d2d1c52a9`);
    assert.equal(approved.status, 0, approved.stderr);
    assert.doesNotMatch(approved.stderr, /review unknown|verify the action runtime/u);
    for (const revision of ['0057852bfaa89a56745cba8c7296529d2fc39830', 'v6.1.0']) {
      const rejected = checkAction(`${action}@${revision}`);
      assert.equal(rejected.status, 1, `${action}@${revision}`);
      assert.match(rejected.stderr, /expected 55cc8345863c7cc4c66a329aec7e433d2d1c52a9/u);
    }
  }
});

test('unregistered actions retain the existing explicit review warning', () => {
  const result = checkAction('actions/unregistered-fixture@0123456789012345678901234567890123456789');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /verify the action runtime before relying on Node 24/u);
});
