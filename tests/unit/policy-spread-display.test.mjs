import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const RENDER_PATH = `${ROOT}/scripts/modules/renderMacroOverview.js`;
const RENDER_SOURCE = fs.readFileSync(RENDER_PATH, 'utf8');
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;

async function buildRenderApi() {
  const bindings = {};
  for (const match of RENDER_SOURCE.matchAll(IMPORT_RE)) {
    const module = await import(new URL(match[2], pathToFileURL(RENDER_PATH)).href);
    for (const name of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!(name in module)) throw new Error(`missing real export ${name} from ${match[2]}`);
      bindings[name] = module[name];
    }
  }
  const elements = new Map();
  const elementFor = (id) => {
    if (!elements.has(id)) {
      elements.set(id, { id, textContent: '', className: '', hidden: false, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
    }
    return elements.get(id);
  };
  const documentStub = { getElementById: elementFor, querySelector: () => null, querySelectorAll: () => [], createElement: (tag) => elementFor(`created-${tag}`) };
  globalThis.document = documentStub;
  const body = RENDER_SOURCE
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export[ \t]+/gm, '');
  const sandbox = {
    document: documentStub,
    console: { error: (...args) => { throw new Error(`unexpected catch: ${args.map(String).join(' ')}`); } },
    setTimeout: () => {}, clearTimeout: () => {}, window: {}, ...bindings,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(body, context, { filename: 'renderMacroOverview.vm.js' });
  return {
    api: vm.runInContext('({ renderC2GlobalLiquidity, renderWowSection, renderMacroDriversPillars, deriveNarratives })', context),
    elementFor,
  };
}

const originalDocument = globalThis.document;
const { api, elementFor } = await buildRenderApi();
after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

const FIXTURE = {
  updatedAt: '2026-10-25T00:26:37.771Z',
  score: 68,
  modules: { energy: 82, inflation: 62, sentiment: 50, liquidity: 46 },
  displayInputsBaseline: { dxy: 121.4, gold: 4166, us10y: 5.1, hyOas: 3.4 },
  historyWindowFields: {},
  macroDrivers: {
    credit: { hyOas: 3.4, igOas: 0.89, nfci: -0.496, nfci4wChange: 0.032, nfciRegime: '温和宽松' },
    fedLiquidity: { regime: '平稳', reserveBalances: 2962607, reserveBalances4wChange: 0.135, walcl: 6753604, walcl4wChange: 0.12, onRrp: 0.351, onRrpWeekChange: -0.2, sofr: 3.88, effectiveFedFundsRate: 3.88, bgcr: 3.86, tgcr: 3.86 },
    policyExpectations: {
      targetLower: 3.75, targetUpper: 4, targetMid: 3.875, effectiveFedFundsRate: 3.88,
      fedFundsFutureFrontPrice: 96.1175, fedFundsFutureImpliedRate: 3.882, futureMinusTargetMid: 0.007,
      fedFundsFuturesCurve: { frontMinusBack: -0.56 }, sofrFuturesCurve: { frontMinusBack: -0.5 },
      oisForwardCurve: { oneYearRate: 4.42 }, dotPlotMedianCurrentYear: 4.1,
      policyTone: '平衡', minutesPolicyTone: '偏鹰',
    },
    commercialRealEstate: { creDelinquencyRate: 1.53, creDelinquencyRateQoQChange: -0.03, creChargeOffRate: 0.14, sloosCreNonfarmNonresidentialTightening: -11.3, sloosCreConstructionTightening: -3.7, sloosCreMultifamilyTightening: -5.7, sloosCreTighteningMax: -3.7, creStressRegime: '稳定' },
    curve: {}, consumer: {}, employment: {}, privateCreditProxy: {}, energyTransport: {},
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (id) => elementFor(id).textContent;
const dataWithPolicy = (value) => {
  const data = clone(FIXTURE);
  data.macroDrivers.policyExpectations.futureMinusTargetMid = value;
  return data;
};
const renderC2 = (data) => api.renderC2GlobalLiquidity({ radarData: data });
const renderWow = (data) => api.renderWowSection({ radarData: data, worldOrderStressData: {} });
const renderPillar = (data) => api.renderMacroDriversPillars({ radarData: data });

async function loadMatrixThroughQuery() {
  const match = RENDER_SOURCE.match(/from\s+['"](\.\/buildCrossValidationMatrix\.js\?[^'"]+)['"]/u);
  assert.ok(match, 'matrix import with query not found');
  return import(new URL(match[1], pathToFileURL(RENDER_PATH)).href);
}

test('C2 Fed Path valid, zero, missing/invalid and repeated clears', () => {
  renderC2(dataWithPolicy(0.007));
  assert.equal(text('c2-fed-path-number'), '+0.7');
  assert.equal(text('c2-fed-path-aux'), '市场定价与目标中值差 · +0.7bp');
  assert.equal(text('c2-fed-path-target'), '3.88%');
  assert.equal(elementFor('c2-fed-path-status').className, 'status-bar green');
  renderC2(dataWithPolicy(-0.007));
  assert.equal(text('c2-fed-path-number'), '-0.7');
  assert.match(text('c2-fed-path-aux'), /-0\.7bp/);
  renderC2(dataWithPolicy(0));
  assert.equal(text('c2-fed-path-number'), '+0.0');
  assert.equal(text('c2-fed-path-aux'), '市场定价与目标中值差 · +0.0bp');
  for (const bad of [null, undefined, '', false, true, [], {}, '0.007', Number.NaN]) {
    renderC2(dataWithPolicy(bad));
    assert.equal(text('c2-fed-path-number'), '—', String(bad));
    assert.equal(text('c2-fed-path-aux'), '市场定价与目标中值差 · —', String(bad));
    assert.equal(elementFor('c2-fed-path-badge').textContent, '待核验');
    assert.doesNotMatch(text('c2-fed-path-aux'), /\+0\.0bp/);
  }
  renderC2(dataWithPolicy(0.007));
  renderC2(dataWithPolicy(null));
  assert.equal(text('c2-fed-path-number'), '—');
  assert.equal(elementFor('c2-fed-path-badge').textContent, '待核验');
});

test('WoW policy spread uses strict finite, preserves precision/zero, always rewrites', () => {
  renderWow(dataWithPolicy(0.007));
  assert.equal(text('wow-item-4-text'), '美联储(Fed)政策定价差 +0.7bp（近月期货隐含利率与目标区间中值差）。');
  assert.equal(text('wow-item-4-source'), '美联储(Fed)政策定价差');
  renderWow(dataWithPolicy(-0.007));
  assert.equal(text('wow-item-4-text'), '美联储(Fed)政策定价差 -0.7bp（近月期货隐含利率与目标区间中值差）。');
  renderWow(dataWithPolicy(0));
  assert.equal(text('wow-item-4-text'), '美联储(Fed)政策定价差 0.0bp（近月期货隐含利率与目标区间中值差）。');
  for (const bad of [null, undefined, '', false, true, [], {}, '0.007', Number.NaN]) {
    renderWow(dataWithPolicy(bad));
    assert.equal(text('wow-item-4-text'), '美联储(Fed)政策定价差 待核验（近月期货隐含利率与目标区间中值差）。', String(bad));
    assert.doesNotMatch(text('wow-item-4-text'), /\+0\.0bp/);
  }
  renderWow(dataWithPolicy(0.007));
  renderWow(dataWithPolicy(null));
  assert.match(text('wow-item-4-text'), /待核验/);
});

test('pillar-2 policy spread strict/null-safe and repeated clears', () => {
  renderPillar(dataWithPolicy(0.007));
  assert.match(text('pillar-2-text'), /近月联邦基金期货隐含利率与目标区间中值差 \+0\.7bp,政策基调: 平衡。/);
  renderPillar(dataWithPolicy(-0.007));
  assert.match(text('pillar-2-text'), /-0\.7bp,政策基调: 平衡。/);
  renderPillar(dataWithPolicy(0));
  assert.match(text('pillar-2-text'), /\+0\.0bp,政策基调: 平衡。/);
  for (const bad of [null, undefined, '', false, true, [], {}, '0.007', Number.NaN]) {
    renderPillar(dataWithPolicy(bad));
    assert.match(text('pillar-2-text'), /待核验,政策基调: 平衡。/, String(bad));
    assert.doesNotMatch(text('pillar-2-text'), /\+0\.0bp/);
  }
  renderPillar(dataWithPolicy(0.007));
  renderPillar(dataWithPolicy(undefined));
  assert.match(text('pillar-2-text'), /待核验/);
});

test('index static card/WoW copy and required source guard', () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  const cardStart = html.indexOf('id="card-c2-fed-path"');
  const card = html.slice(cardStart, html.indexOf('</article>', cardStart));
  assert.match(card, /美联储政策定价差\(Fed Path\)/);
  assert.match(card, /市场定价与目标中值差 · 待核验/);
  assert.match(card, /目标区间中值/);
  assert.match(card, /现行观察阈值 \|价差\|≥50bp 红/);
  assert.match(card, /以近月联邦基金期货隐含利率与当前目标区间中值比较/);
  assert.match(card, /status-bar pending/);
  assert.match(card, /badge pending/);
  assert.doesNotMatch(card, /1999-2000|2022|委员预期|市场比委员|政策路径分歧|阈值 \|分歧\|/);
  const wowStart = html.indexOf('wow-item-4-text');
  const wow = html.slice(wowStart - 180, wowStart + 420);
  assert.match(wow, /wow-tag is-flat/);
  assert.match(wow, /政策价差观察/);
  assert.match(wow, /近月期货隐含利率与目标区间中值差待核验/);
  assert.match(wow, /美联储\(Fed\)政策定价差/);
  assert.doesNotMatch(wow, /风险升高|市场比委员|政策路径分歧/);
  assert.ok(RENDER_SOURCE.includes('policySpread !== null ? policySpread * 100 : null'));
  assert.doesNotMatch(RENDER_SOURCE, /市场与委员分歧|policy.futureMinusTargetMid\) \?\? 0/);
});

test('input, main score, n1-n7 and matrix unchanged by rendering', async () => {
  const data = clone(FIXTURE);
  const beforeInput = JSON.stringify(data);
  const beforeN = api.deriveNarratives({ radarData: clone(data), worldOrderStressData: {}, marketPricingMetricsData: {} })
    .map(({ shortName, score, isActive }) => ({ shortName, score, isActive }));
  const { buildCrossValidationMatrix } = await loadMatrixThroughQuery();
  const beforeMatrix = buildCrossValidationMatrix(clone(data), {}, null);
  renderC2(data);
  renderWow(data);
  renderPillar(data);
  const afterN = api.deriveNarratives({ radarData: clone(data), worldOrderStressData: {}, marketPricingMetricsData: {} })
    .map(({ shortName, score, isActive }) => ({ shortName, score, isActive }));
  const afterMatrix = buildCrossValidationMatrix(clone(data), {}, null);
  assert.equal(JSON.stringify(data), beforeInput);
  assert.equal(data.score, 68);
  assert.equal(beforeN.length, 7);
  assert.deepEqual(afterN, beforeN);
  assert.deepEqual(afterMatrix, beforeMatrix);
});
