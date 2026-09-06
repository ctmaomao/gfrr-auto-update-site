import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateAgentDomainLinks } from '../../scripts/lib/agent-doc-authority.mjs';

test('delegation accepts arbitrary labels and root prose, but requires a real destination', () => {
  assert.deepEqual(validateAgentDomainLinks('[任意标题](docs/AGENT_DOMAIN_BOUNDARIES.md#energy)', '<a id="energy"></a>'), []);
  assert.ok(validateAgentDomainLinks('No delegation', 'domain text').length);
  assert.ok(validateAgentDomainLinks('[rules](docs/AGENT_DOMAIN_BOUNDARIES.md)', '').length);
  assert.ok(validateAgentDomainLinks('[rules](docs/AGENT_DOMAIN_BOUNDARIES.md#energy)', '<a id="runtime"></a>').length);
});

// Each distinct existing authority-read/assertion shape has a real failure probe.
const cases = [
  ['macro-drivers-employment', 'FRED CES0500000003 平均时薪'],
  ['route-level-tanker-freight-source-rights-approval-gate', 'route-level tanker freight source-rights approval gate'],
  ['transport-shock-confirmation-factor-source-review', 'Transport Shock Confirmation Factor source-review'],
  ['transport-shock-confirmation-factor-frontend-card', 'Transport Shock Confirmation Factor frontend card 只是 P-score-7'],
  ['transport-shock-confirmation-factor-production-refresh', 'transport-shock-confirmation-factor-production-refresh-v1'],
  ['transport-shock-confirmation-factor-runtime-score-policy', 'transport-shock-confirmation-factor-runtime-score-policy-review-v1']
];
for (const [name, marker] of cases) {
  for (const mode of ['marker', 'missing']) {
    test(`${name} fails on ${mode} loss even if root retains every domain rule`, () => {
      const result = spawnSync(process.execPath, ['--import', './tests/fixtures/agent-domain-read-override.mjs', `scripts/check-${name}.mjs`], {
        encoding: 'utf8', timeout: 30000,
        env: { ...process.env, AGENT_DOC_TEST_MODE: mode, AGENT_DOC_TEST_MARKER: marker }
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout + result.stderr, /AGENT_DOMAIN_BOUNDARIES|agents missing marker/);
    });
  }
}
