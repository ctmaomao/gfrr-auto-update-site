import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedPagesArtifactFile } from '../../scripts/build-pages-artifact.mjs';

test('Pages artifact allowlist rejects nested configuration and unexpected types', () => {
  for (const file of [
    'index.html',
    'bubble-watch.html',
    'assets/styles.css',
    'assets/favicon.svg',
    'data/radar-data.json',
    'realtime/market.json',
    'scripts/app.js',
    'scripts/modules/config.js',
  ]) assert.equal(isAllowedPagesArtifactFile(file), true, file);

  for (const file of [
    'assets/.env',
    'assets/token.txt',
    'data/.dev.vars',
    'data/radar-data.js',
    'scripts/modules/package.json',
    'scripts/modules/.secret.js',
    '.codex/config.toml',
  ]) assert.equal(isAllowedPagesArtifactFile(file), false, file);
});
