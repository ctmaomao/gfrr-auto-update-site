import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Representative real consumers cover direct includes/helper, keyed documents,
// per-file marker lists, shared constants and multi-authority loops.
const cases = [
  ['route-level-tanker-freight-source-rights-approval-gate', 'Route-level tanker freight source-rights approval gate'],
  ['transport-shock-confirmation-factor-source-review', 'Transport Shock Confirmation Factor source-review'],
  ['transport-shock-confirmation-factor-frontend-card', 'Transport Shock Confirmation Factor frontend card(2026-06-28,P-score-7 frontend display-only)'],
  ['transport-shock-confirmation-factor-production-refresh', 'P-score-8'],
  ['transport-shock-confirmation-factor-runtime-score-policy', 'transport-shock-confirmation-factor-runtime-score-policy-review-v1'],
  ['transport-shock-path-boundaries', 'transport-shock-path-boundary-review-v1']
];
for (const [name, marker] of cases) {
  for (const mode of ['concise', 'marker', 'missing']) {
    test(`${name}: ${mode} backlog/history isolation`, () => {
      const result = spawnSync(process.execPath, ['--import', './tests/fixtures/energy-record-read-override.mjs', `scripts/check-${name}.mjs`], {
        encoding: 'utf8', timeout: 30000,
        env: { ...process.env, ENERGY_RECORD_TEST_MODE: mode, ENERGY_RECORD_TEST_MARKER: marker }
      });
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      assert.equal(result.status, mode === 'concise' ? 0 : 1, output);
      if (mode !== 'concise') assert.match(output, /ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY|energyHistory missing marker/);
    });
  }
}
