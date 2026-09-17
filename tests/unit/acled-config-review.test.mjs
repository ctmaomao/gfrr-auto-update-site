import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { reviewAcledConfigPair, ACLED_CONFIG_REVIEW_LIMITS } from '../../scripts/world-order/acled-config-review.mjs';

const paths = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const saved = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const fixture = () => ({ baseline: { ...saved }, candidate: { ...saved }, expectedBaselineSha256: null });
function change(input, kind, fn, side = 'candidate') {
  const v = JSON.parse(input[side][kind]); fn(v); input[side][kind] = JSON.stringify(v);
}
const review = input => reviewAcledConfigPair(input);
const cli = input => spawnSync(process.execPath, ['scripts/review-acled-config-pair.mjs'], { input, encoding: 'utf8', timeout: 10000 });

test('ADR-0055 admits only exact automatic provenance, without content or date exceptions', () => {
  const input = fixture();
  for (const kind of ['weekly', 'monthly']) change(input, kind, v => { v.preparedBy = 'github-actions-acled-auto'; });
  assert.equal(review(input).status, 'review_required');
  assert.deepEqual(review(input).weekly.changedSections, ['preparedBy']);
  assert.equal(review(input).boundaries.productionEligible, false);
  for (const value of [null, '', 'automatic', 'github-actions', {}, ['manual']]) {
    const bad = structuredClone(input); change(bad, 'weekly', v => { v.preparedBy = value; });
    assert.equal(review(bad).status, 'invalid');
  }
  change(input, 'monthly', v => { v.quality.isRealData = false; });
  assert.equal(review(input).status, 'invalid');
});

test('both actual strict checkers accept automatic provenance and reject unknown provenance', t => {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'gfrr-provenance-test-'));
  t.after(() => {
    if (path.dirname(fs.realpathSync(root)) !== parent || !path.basename(root).startsWith('gfrr-provenance-test-')) throw new Error('unsafe cleanup');
    fs.rmSync(root, { recursive: true });
  });
  const files = ['check-world-order-acled-weekly.mjs', 'check-world-order-acled-monthly.mjs',
    'world-order/acled-weekly-coverage.mjs', 'world-order/acled-weekly-window.mjs',
    'world-order/acled-freshness.mjs', 'world-order/acled-monthly-trend.mjs',
    'world-order/sanitize-acled-weekly.mjs', 'world-order/sanitize-acled-monthly.mjs'];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, 'scripts', file)), { recursive: true });
    fs.copyFileSync(`scripts/${file}`, path.join(root, 'scripts', file));
  }
  fs.mkdirSync(path.join(root, 'config'));
  for (const kind of ['weekly', 'monthly']) {
    const data = JSON.parse(saved[kind]);
    for (const value of ['github-actions-acled-auto', 'unreviewed-automatic']) {
      data.preparedBy = value; fs.writeFileSync(path.join(root, paths[kind]), JSON.stringify(data));
      const run = spawnSync(process.execPath, [path.join(root, `scripts/check-world-order-acled-${kind}.mjs`)],
        { cwd: root, timeout: 10000, encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
      assert.equal(run.status, value === 'github-actions-acled-auto' ? 0 : 1, run.stderr);
      if (value !== 'github-actions-acled-auto') assert.match(run.stderr, /preparedBy must be approved/u);
    }
  }
});

test('unchanged pair ignores only preparedAt and object key ordering, preserving originals', () => {
  const input = fixture(), before = structuredClone(input);
  for (const kind of ['weekly', 'monthly']) {
    change(input, kind, v => { v.preparedAt = '2026-09-18T00:00:00Z'; });
    input.candidate[kind] = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(input.candidate[kind])).reverse()));
  }
  const snapshot = structuredClone(input), report = review(input);
  assert.equal(report.status, 'unchanged'); assert.deepEqual(report.weekly.changedSections, []);
  assert.notEqual(report.weekly.baselineByteSha256, report.weekly.candidateByteSha256);
  assert.equal(report.weekly.baselineSemanticSha256, report.weekly.candidateSemanticSha256);
  assert.deepEqual(input, snapshot);
  for (const [kind, p] of Object.entries(paths)) assert.equal(fs.readFileSync(p, 'utf8'), before.baseline[kind]);
  assert.deepEqual(report.boundaries, { networkRequests: 0, writesFiles: false, productionEligible: false,
    contentValidated: false, sourceRightsAssessed: false, freshnessAssessed: false, concurrencyProtected: false, baselineUpdated: false });
});

test('same-date values, metadata and ranked array changes require review, never promotion', () => {
  const input = fixture();
  change(input, 'weekly', v => { v.global.eventsLast4Weeks++; v.regionalLast4Weeks.reverse(); v.quality.confidence = 0.8; });
  const report = review(input);
  assert.equal(report.status, 'review_required'); assert.equal(report.weekly.status, 'same_date_revision');
  assert.deepEqual(report.weekly.changedSections, ['global', 'regionalLast4Weeks', 'quality']);
  assert.equal(report.weekly.metadataChanged, true);
  assert.equal(report.boundaries.productionEligible, false);
});

test('new monthly date and file row changes are distinguished from date regression', () => {
  const input = fixture();
  change(input, 'monthly', v => { v.asOfDate = '2099-01-01'; for (const f of v.filesIngested) f.asOfDate = v.asOfDate; v.filesIngested[0].rowCount++; });
  // Comparator intentionally does not grant freshness validation; even an advanced date is review-only.
  let report = review(input);
  assert.equal(report.monthly.status, 'date_advanced'); assert.equal(report.monthly.rowCountChanges, 1);
  assert.equal(report.status, 'review_required'); assert.equal(report.boundaries.freshnessAssessed, false);
  change(input, 'weekly', v => { v.latestWeek = '2000-01-01'; });
  report = review(input); assert.equal(report.status, 'date_regression_hold');
});

test('exact baseline pins detect concurrent bytes changes including whitespace and preparation time', () => {
  const input = fixture(), first = review(input);
  input.expectedBaselineSha256 = { weekly: first.weekly.baselineByteSha256, monthly: first.monthly.baselineByteSha256 };
  assert.equal(review(input).weekly.baselineMatchesPin, true);
  input.baseline.monthly += '\n';
  assert.equal(review(input).status, 'baseline_changed_hold');
  assert.equal(review(input).monthly.baselineMatchesPin, false);
  const result = cli(JSON.stringify(input)); assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'baseline_changed_hold');
});

test('partial pairs, invalid dates, duplicate or missing identities, invalid numbers and oversized input fail closed', () => {
  const mutations = [
    x => { delete x.candidate.monthly; }, x => { x.expectedBaselineSha256 = {}; },
    x => change(x, 'weekly', v => { v.latestWeek = '2026-02-30'; }),
    x => change(x, 'monthly', v => { v.filesIngested.pop(); }),
    x => change(x, 'weekly', v => { v.filesIngested[1] = v.filesIngested[0]; }),
    x => change(x, 'weekly', v => { v.filesIngested[0].rowCount = null; }),
    x => change(x, 'monthly', v => { v.quality.isRealData = false; }),
    x => change(x, 'weekly', v => { v.unexpected = 'secret'; }),
    x => {
      change(x, 'monthly', v => { v.quality.confidence = '__overflow_fixture__'; });
      x.candidate.monthly = x.candidate.monthly.replace('"__overflow_fixture__"', '1e999');
    },
    x => { x.candidate.weekly = ' '.repeat(ACLED_CONFIG_REVIEW_LIMITS.configBytes + 1); },
    x => { x.baseline.weekly = 'secret-invalid-json'; },
  ];
  for (const mutate of mutations) { const input = fixture(); mutate(input); const r = review(input); assert.equal(r.status, 'invalid'); assert.ok(!JSON.stringify(r).includes('secret')); }
});

test('CLI outputs summary only, rejects flags, invalid UTF8 and oversized envelopes without leaking input', () => {
  const result = cli(JSON.stringify(fixture())); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'unchanged'); assert.ok(!result.stdout.includes('methodologyNoteZh'));
  for (const input of ['secret-invalid-json', Buffer.from([0xff]), ' '.repeat(ACLED_CONFIG_REVIEW_LIMITS.inputBytes + 1)]) {
    const r = cli(input); assert.equal(r.status, 1); assert.equal(r.stderr, ''); assert.ok(!r.stdout.includes('secret'));
  }
  const flag = spawnSync(process.execPath, ['scripts/review-acled-config-pair.mjs', '--publish'], { encoding: 'utf8' });
  assert.equal(flag.status, 1); assert.equal(flag.stderr, '');
});

test('stalled stdin terminates within the fixed deadline', async () => {
  const child = spawn(process.execPath, ['scripts/review-acled-config-pair.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const timer = setTimeout(() => child.kill(), 8000);
  try {
    let out = '', err = ''; child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
    const code = await new Promise(resolve => child.on('close', resolve));
    assert.equal(code, 1); assert.equal(err, ''); assert.equal(JSON.parse(out).status, 'invalid');
  } finally { clearTimeout(timer); child.stdin.destroy(); }
});
