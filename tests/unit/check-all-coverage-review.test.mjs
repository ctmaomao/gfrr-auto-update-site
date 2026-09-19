import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCoverageReport, parseSuiteObject } from '../../scripts/review-check-all-coverage.mjs';

test('suite parsing is brace-balanced and ignores literal markers elsewhere in the file', () => {
  // Regression: a marker-based slice between 'const SUITES' and a later literal broke
  // silently as soon as a comment ahead of the object mentioned that later literal,
  // producing an empty slice. The parser must depend only on brace balance.
  const adversarial = [
    '// a comment that mentions const suiteName before the object',
    "const OTHER = 'const SUITES';",
    'const SUITES = {',
    "  'alpha': [",
    "    'check:one'",
    '  ],',
    '  beta: [',
    "    'check:two'",
    '  ]',
    '};',
    'const suiteName = process.argv[2];',
    'SUITES'
  ].join('\n');
  const suites = parseSuiteObject(adversarial);
  assert.deepStrictEqual(Object.keys(suites), ['alpha', 'beta']);
  assert.deepStrictEqual(suites.beta, ['check:two']);
});

test('suite parsing tolerates braces inside string literals and fails loudly when unbalanced', () => {
  const bracesInStrings = "const SUITES = {\n  'a': ['check:brace']\n};\nconst suiteName = 1;\n";
  assert.deepStrictEqual(parseSuiteObject(bracesInStrings), { a: ['check:brace'] });
  assert.throws(() => parseSuiteObject('const SUITES = {'), /unbalanced braces/u);
  assert.throws(() => parseSuiteObject('const OTHER = {};'), /const SUITES/u);
});

test('suite parsing still handles the real repository file', () => {
  const suites = parseSuiteObject(readFileSync('scripts/check-suite.mjs', 'utf8'));
  assert.strictEqual(Object.keys(suites).length, 9);
  assert.ok(suites.brent.includes('check:brent-crack-spread'));
});

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
