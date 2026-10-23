import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const OVERVIEW_URL = pathToFileURL(`${ROOT}/scripts/modules/renderMacroOverview.js`);
const overviewSource = fs.readFileSync(OVERVIEW_URL, 'utf8');
const rendererSpecifier = /from\s+['"]([^'"]*renderFourLaneReadout\.js\?v=[^'"]+)['"]/.exec(overviewSource)?.[1];
assert.ok(rendererSpecifier, 'renderMacroOverview must import a versioned four-lane renderer');
const { renderFourLaneReadout } = await import(new URL(rendererSpecifier, OVERVIEW_URL).href);

const originalDocument = globalThis.document;
const host = {
  hidden: true,
  children: [],
  replaceChildren() { this.children = []; },
  append(...nodes) { this.children.push(...nodes); },
};
function node(tag = 'div') {
  return {
    tag,
    className: '',
    textContent: '',
    children: [],
    append(...children) { this.children.push(...children); },
  };
}
globalThis.document = {
  getElementById: (id) => (id === 'hero-four-lanes' ? host : null),
  createElement: (tag) => node(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
};
after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

const NOW = Date.parse('2026-10-23T08:00:00Z');
const BASE = {
  updatedAt: '2026-10-23T00:48:31.687Z',
  modules: { energy: 82, liquidity: 46 },
  displayInputsBaseline: { brent: 125.4, dxy: 121.4, vix: 16.46, hyOas: 3.29, us10y: 5.1, real10y: 2.78, breakeven10y: 2.35, gold: 4166, spx: 7659 },
  macroDrivers: {
    credit: { hyOas: 3.29, igOas: 0.87, nfci: -0.499, sourceObservedAt: { hyOas: '2026-10-21', igOas: '2026-10-21' } },
    energyTransport: { latestAgeDays: 7, guards: { latestFresh: true, sourceLive: true } },
  },
  tailRiskOverlay: { reasons: [{ key: 'energy_inflation_tail', labelZh: '能源与通胀尾部冲击', floor: 68 }] },
  transportShockScoringImpact: { applied: false, contributionPct: 0, reason: 'candidate_not_eligible_zero_contribution' },
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const render = (radarData, now = NOW) => {
  renderFourLaneReadout({ radarData, nowMs: now });
  return host.children.map((row) => ({
    label: row.children[0].textContent,
    status: row.children[1].textContent,
    detail: row.children[2].textContent,
  }));
};

test('renderer renders four rows, qualifies the old floor, and does not count blocked transport', () => {
  const rows = render(clone(BASE));
  assert.equal(host.hidden, false);
  assert.deepEqual(rows.map((row) => row.label), ['连续金融压力', '结构脆弱性', '独立冲击警报', '数据可信度']);
  assert.equal(rows[2].status, '1 条快照记录');
  assert.match(rows[2].detail, /原模型保底阈值 68/);
  assert.doesNotMatch(rows[2].detail, /尾部冲击 68（/);
  assert.match(rows[2].detail, /未触发\/阻塞，不计入警报/);
  assert.doesNotMatch(rows[2].status, /2 条/);

  const applied = clone(BASE);
  applied.transportShockScoringImpact = { applied: true, contributionPct: 2, reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied', guards: { latestFresh: true } };
  const appliedRows = render(applied);
  assert.equal(appliedRows[2].status, '2 条快照记录');
  assert.doesNotMatch(appliedRows[2].detail, /不计入警报/);
});

test('missing, invalid and valid-empty tail records stay distinct; null and repeated renders clear', () => {
  const missing = clone(BASE);
  delete missing.tailRiskOverlay;
  const missingRows = render(missing);
  assert.equal(missingRows[2].status, '冲击记录未知');
  assert.match(missingRows[2].detail, /尾部记录未知/);
  assert.doesNotMatch(missingRows[2].detail, /无风险/);

  const invalid = clone(BASE);
  invalid.tailRiskOverlay = { reasons: [{ key: 'unknown_key', floor: 68 }] };
  const invalidRows = render(invalid);
  assert.equal(invalidRows[2].status, '记录无法校验');
  assert.match(invalidRows[2].detail, /1 条尾部记录无法校验/);

  const validEmpty = clone(BASE);
  validEmpty.tailRiskOverlay = { reasons: [] };
  const emptyRows = render(validEmpty);
  assert.equal(emptyRows[2].status, '快照未记录触发');
  assert.match(emptyRows[2].detail, /快照未记录尾部触发/);
  assert.doesNotMatch(emptyRows[2].detail, /无风险/);

  render(null);
  assert.equal(host.children.length, 0);
  assert.equal(host.hidden, true);
  const afterNull = render(clone(BASE));
  assert.equal(afterNull.length, 4);
  assert.equal(host.hidden, false);
});

test('dates, zero values, stale labels and input/main-score preservation', () => {
  const zero = clone(BASE);
  zero.displayInputsBaseline.vix = 0;
  zero.macroDrivers.credit = { hyOas: 0, igOas: 0, nfci: 0, sourceObservedAt: {} };
  const zeroRows = render(zero);
  assert.match(zeroRows[0].detail, /高收益债利差 0\.00%/);
  assert.match(zeroRows[0].detail, /波动率指数 0\.00（观察日未知）/);
  assert.doesNotMatch(zeroRows[0].detail, /高收益债利差 —/);

  const invalidDate = clone(BASE);
  invalidDate.macroDrivers.credit.sourceObservedAt = { hyOas: '2026-10-24', igOas: '2026-02-30' };
  const dateRows = render(invalidDate);
  assert.match(dateRows[0].detail, /高收益债利差 3\.29%（观察日未知）/);
  assert.match(dateRows[0].detail, /投资级利差 0\.87%（观察日未知）/);

  const laterThanSnapshot = clone(BASE);
  laterThanSnapshot.updatedAt = '2026-10-21T00:48:31.687Z';
  laterThanSnapshot.macroDrivers.credit.sourceObservedAt = { hyOas: '2026-10-22', igOas: '2026-10-21' };
  const laterRows = render(laterThanSnapshot);
  assert.match(laterRows[0].detail, /高收益债利差 3\.29%（观察日未知）/);
  assert.match(laterRows[0].detail, /投资级利差 0\.87%（2026-10-21）/);

  const invalidValues = clone(BASE);
  invalidValues.displayInputsBaseline.vix = '16.46';
  invalidValues.macroDrivers.credit = { hyOas: null, igOas: '', nfci: false, sourceObservedAt: {} };
  const invalidRows = render(invalidValues);
  assert.match(invalidRows[0].detail, /高收益债利差 —/);
  assert.match(invalidRows[0].detail, /投资级利差 —/);
  assert.match(invalidRows[0].detail, /金融条件指数 —/);
  assert.match(invalidRows[0].detail, /波动率指数 —/);
  assert.doesNotMatch(invalidRows[0].detail, /高收益债利差 0\.00/);

  const invalidSnapshot = clone(BASE);
  invalidSnapshot.updatedAt = 'not-a-date';
  const invalidSnapshotRows = render(invalidSnapshot);
  assert.equal(invalidSnapshotRows[2].status, '冲击记录未知');
  assert.match(invalidSnapshotRows[2].detail, /运输 未知（快照无效，未列入警报）/);
  assert.doesNotMatch(invalidSnapshotRows[2].detail, /已记录触发|未记录触发/);

  const staleRows = render(clone(BASE), Date.parse('2026-10-25T08:00:00Z'));
  assert.equal(staleRows[2].status, '1 条快照记录');
  assert.match(staleRows[2].detail, /历史快照记录/);
  assert.match(staleRows[3].detail, /历史快照/);

  const input = clone(BASE);
  const before = JSON.stringify(input);
  render(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.modules, { energy: 82, liquidity: 46 });
});

test('partial/unknown records keep known counts but never claim full confirmation', () => {
  const emptyUnknown = clone(BASE);
  emptyUnknown.tailRiskOverlay = { reasons: [] };
  delete emptyUnknown.transportShockScoringImpact;
  const emptyUnknownRows = render(emptyUnknown);
  assert.equal(emptyUnknownRows[2].status, '冲击记录未知');
  assert.match(emptyUnknownRows[2].detail, /运输 未知/);

  const emptyBlocked = clone(BASE);
  emptyBlocked.tailRiskOverlay = { reasons: [] };
  const emptyBlockedRows = render(emptyBlocked);
  assert.equal(emptyBlockedRows[2].status, '快照未记录触发');
  assert.match(emptyBlockedRows[2].detail, /未触发\/阻塞，不计入警报/);

  const partialTail = clone(BASE);
  partialTail.tailRiskOverlay = {
    reasons: [
      { key: 'energy_inflation_tail', floor: 68 },
      { key: 'unknown_key', floor: 68 },
    ],
  };
  delete partialTail.transportShockScoringImpact;
  const partialRows = render(partialTail);
  assert.equal(partialRows[2].status, '1 条快照记录 · 部分记录待核验');
  assert.match(partialRows[2].detail, /1 条尾部记录无法校验/);
  assert.match(partialRows[2].detail, /运输 未知/);

  const partialTailKnownTransport = clone(partialTail);
  partialTailKnownTransport.transportShockScoringImpact = { applied: false, contributionPct: 0, reason: 'candidate_not_eligible_zero_contribution' };
  const knownTransportRows = render(partialTailKnownTransport);
  assert.equal(knownTransportRows[2].status, '1 条快照记录 · 部分记录待核验');
  assert.match(knownTransportRows[2].detail, /1 条尾部记录无法校验/);
});

test('hero host and hidden CSS contract are present', () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  const css = fs.readFileSync(`${ROOT}/assets/styles.css`, 'utf8');
  assert.match(html, /<dl id="hero-four-lanes" class="hero-four-lanes" hidden><\/dl>/);
  assert.match(css, /\.hero-four-lanes\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.hero-lane-row\s*\{/);
});
