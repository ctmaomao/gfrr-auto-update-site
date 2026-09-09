import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedNodeRuntime } from '../../scripts/lib/node-runtime-policy.mjs';

test('runtime floor rejects old patches, different majors and prereleases', () => {
  for (const version of ['24.15.0', '24.19.9', '22.99.0', '25.0.0', '24.20.0-rc.1', '24', '', null]) {
    assert.equal(isSupportedNodeRuntime(version), false, String(version));
  }
  for (const version of ['24.20.0', 'v24.20.0', '24.20.1', '24.21.0']) {
    assert.equal(isSupportedNodeRuntime(version), true, version);
  }
});
