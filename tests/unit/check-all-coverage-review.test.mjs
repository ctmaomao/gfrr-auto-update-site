import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildCoverageReport } from '../../scripts/review-check-all-coverage.mjs';

test('coverage review expands suite members including an unquoted suite key', () => {
  const report = buildCoverageReport({
    scripts: {
      'check:all': 'npm run check:brent',
      'check:brent': 'node scripts/check-suite.mjs brent',
      'check:brent-promotion-audit-fields': 'node --check fixture.mjs',
      'check:outside': 'node --check outside.mjs'
    },
    suites: { brent: ['check:brent-promotion-audit-fields'] }
  });
  assert.deepEqual(report.reachable, ['check:all', 'check:brent', 'check:brent-promotion-audit-fields']);
  assert.deepEqual(report.unreachable, ['check:outside']);
});

test('coverage review command is observational and always exits zero', () => {
  const result = spawnSync(process.execPath, ['scripts/review-check-all-coverage.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /可达：\d+ \/ \d+/u);
  assert.match(result.stdout, /未达：\d+/u);
});
