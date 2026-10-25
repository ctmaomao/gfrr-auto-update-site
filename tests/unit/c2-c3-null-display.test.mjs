import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const RENDER_URL = pathToFileURL(`${ROOT}/scripts/modules/renderMacroOverview.js`);
const RENDER_SOURCE = fs.readFileSync(RENDER_URL, 'utf8');
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;

async function buildRenderApi() {
  const bindings = {};
  for (const match of RENDER_SOURCE.matchAll(IMPORT_RE)) {
    const module = await import(new URL(match[2], RENDER_URL).href);
    for (const name of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!(name in module)) throw new Error(`missing real export ${name} from ${match[2]}`);
      bindings[name] = module[name];
    }
  }
  const elements = new Map();
  const elementFor = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        hidden: false,
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      });
    }
    return elements.get(id);
  };
  const documentStub = {
    getElementById: elementFor,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => elementFor(`created-${tag}`),
  };
  globalThis.document = documentStub;
  const body = RENDER_SOURCE
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export[ \t]+/gm, '');
  const sandbox = {
    document: documentStub,
    console: { error: (...args) => { throw new Error(`unexpected catch: ${args.map(String).join(' ')}`); } },
    setTimeout: () => {},
    clearTimeout: () => {},
    window: {},
    ...bindings,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(body, context, { filename: 'renderMacroOverview.vm.js' });
  return {
    api: vm.runInContext('({ renderC2GlobalLiquidity, renderC3CreditCorporate, deriveNarratives, asNumber })', context),
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
  updatedAt: '2026-10-23T00:48:31.687Z',
  modules: { energy: 82, inflation: 62, sentiment: 50, liquidity: 46 },
  __effectiveDisplayInputs: { hyOas: 3.29 },
  displayInputsBaseline: { dxy: 121.4, gold: 4166, us10y: 5.1, hyOas: 3.27 },
  historyWindowFields: { hyOasWoW: { windowStatus: 'ready', changeBp: 2, changePct: 0.006 } },
  macroDrivers: {
    credit: {
      hyOas: 3.27, igOas: 0.88, igOas1dChange: 0.01, igHyRatio: 0.269,
      nfci: -0.496, nfci4wChange: 0.032, nfciRegime: '温和宽松',
    },
    fedLiquidity: {
      regime: '平稳', reserveBalances: 2962607, reserveBalances4wChange: 0.135,
      walcl: 6753604, walcl4wChange: 0.12, onRrp: 0.351, onRrpWeekChange: -0.2,
      sofr: 3.88, effectiveFedFundsRate: 3.88, bgcr: 3.86, tgcr: 3.86,
    },
    policyExpectations: {
      futureMinusTargetMid: 0.025, targetMid: 4.1,
      fedFundsFutureFrontPrice: 96.1, fedFundsFutureImpliedRate: 3.9,
      fedFundsFuturesCurve: { frontMinusBack: -0.15 },
      sofrFuturesCurve: { frontMinusBack: -0.12 },
      oisForwardCurve: { oneYearRate: 3.75 }, dotPlotMedianCurrentYear: 4.1,
      policyTone: '中性', minutesPolicyTone: '中性',
    },
    commercialRealEstate: {
      creDelinquencyRate: 1.53, creDelinquencyRateQoQChange: -0.03, creChargeOffRate: 0.14,
      sloosCreNonfarmNonresidentialTightening: -11.3, sloosCreConstructionTightening: -3.7,
      sloosCreMultifamilyTightening: -5.7, sloosCreTighteningMax: -3.7, creStressRegime: '稳定',
    },
    curve: {}, consumer: {}, privateCreditProxy: {},
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const dataWith = (mutate = () => {}) => {
  const data = clone(FIXTURE);
  mutate(data);
  return data;
};
const text = (id) => elementFor(id).textContent;
const badge = (id) => elementFor(id);
const renderC2 = (data) => { api.renderC2GlobalLiquidity({ radarData: data }); };
const renderC3 = (data) => { api.renderC3CreditCorporate({ radarData: data }); };

function extractCreClassifier() {
  const source = fs.readFileSync(`${ROOT}/scripts/run-daily-pipeline.mjs`, 'utf8');
  const start = source.indexOf('function classifyCreStressRegime');
  const end = source.indexOf('\nfunction ', start + 10);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}\nclassifyCreStressRegime`, {});
}

test('CRE producer classifier and canonical/alias/pending tone mapping', () => {
  const classify = extractCreClassifier();
  assert.equal(classify(4, 0, 0), '恶化');
  assert.equal(classify(2, 0, 0), '紧绷');
  assert.equal(classify(1.53, 0.14, -3.7), '稳定');
  assert.equal(classify(0.9, 0.05, -10.5), '改善');
  assert.equal(classify(1.2, 0.1, -5), '宽松');
  assert.equal(classify(null, null, null), '未知');

  const cases = [
    ['恶化', 'red'], ['紧绷', 'yellow'], ['稳定', 'green'], ['改善', 'green'], ['宽松', 'green'],
    ['观察', 'yellow'], ['压力', 'red'],
  ];
  for (const [regime, tone] of cases) {
    renderC3(dataWith((data) => { data.macroDrivers.commercialRealEstate.creStressRegime = regime; }));
    assert.equal(badge('c3-cre-status').className, `status-bar ${tone}`, `${regime} status`);
    assert.equal(badge('c3-cre-badge').className, `badge ${tone}`, `${regime} badge`);
  }
  for (const unknown of ['未知', 'foo', '', null]) {
    renderC3(dataWith((data) => { data.macroDrivers.commercialRealEstate.creStressRegime = unknown; }));
    assert.equal(badge('c3-cre-status').className, 'status-bar pending');
    assert.equal(badge('c3-cre-badge').className, 'badge pending');
    assert.equal(badge('c3-cre-badge').textContent, '待核验');
  }
});

test('C2 all missing, partial legs, true zero and repeat clearing', () => {
  renderC2(dataWith((data) => {
    data.macroDrivers.fedLiquidity = {};
    data.macroDrivers.policyExpectations = {};
  }));
  assert.equal(badge('c2-liquidity-badge').textContent, '待核验');
  assert.equal(badge('c2-liquidity-status').className, 'status-bar pending');
  assert.equal(text('c2-liquidity-number'), '—');
  assert.equal(text('c2-liquidity-aux'), '银行准备金 · 状态: 待核验');
  assert.equal(text('c2-liquidity-walcl'), '— · 4w —');
  assert.equal(text('c2-liquidity-reserves'), '— · 4w —');
  assert.equal(text('c2-liquidity-rrp'), '— · WoW —');
  assert.equal(text('c2-liquidity-sofr-effr'), '— / —');
  assert.equal(text('c2-liquidity-bgcr-tgcr'), '— / —');
  assert.equal(badge('c2-fed-path-badge').textContent, '待核验');
  assert.equal(text('c2-fed-path-number'), '—');
  assert.equal(text('c2-fed-path-aux'), '市场定价与目标中值差 · —');
  assert.equal(text('c2-fed-path-target'), '—');
  assert.equal(text('c2-fed-path-front'), '— → —');
  assert.equal(text('c2-fed-path-zq'), 'front —');
  assert.equal(text('c2-fed-path-sr3'), 'front —');
  assert.equal(text('c2-fed-path-ois'), '—');
  assert.equal(text('c2-fed-path-dot'), '—');

  renderC2(dataWith((data) => {
    Object.assign(data.macroDrivers.fedLiquidity, {
      sofr: 3.88, effectiveFedFundsRate: null, bgcr: null, tgcr: 3.86,
      reserveBalances: 2962607, reserveBalances4wChange: null,
      walcl: 6753604, walcl4wChange: null, onRrp: 0.351, onRrpWeekChange: null,
    });
    Object.assign(data.macroDrivers.policyExpectations, {
      futureMinusTargetMid: null, targetMid: 4.1,
      fedFundsFutureFrontPrice: 96.1, fedFundsFutureImpliedRate: null,
      fedFundsFuturesCurve: { frontMinusBack: null }, sofrFuturesCurve: { frontMinusBack: -0.12 },
      oisForwardCurve: { oneYearRate: null }, dotPlotMedianCurrentYear: 4.1,
    });
  }));
  assert.equal(text('c2-liquidity-sofr-effr'), '3.88% / —');
  assert.equal(text('c2-liquidity-bgcr-tgcr'), '— / 3.86%');
  assert.match(text('c2-liquidity-reserves'), /· 4w —$/);
  assert.match(text('c2-liquidity-walcl'), /· 4w —$/);
  assert.match(text('c2-liquidity-rrp'), /· WoW —$/);
  assert.equal(text('c2-fed-path-target'), '4.10%');
  assert.equal(text('c2-fed-path-front'), '96.10 → —');
  assert.equal(text('c2-fed-path-zq'), 'front —');
  assert.match(text('c2-fed-path-sr3'), /^front /);
  assert.equal(text('c2-fed-path-ois'), '—');
  assert.equal(text('c2-fed-path-dot'), '4.10%');
  assert.equal(badge('c2-fed-path-badge').textContent, '待核验');

  renderC2(dataWith((data) => {
    Object.assign(data.macroDrivers.fedLiquidity, {
      reserveBalances: 0, reserveBalances4wChange: 0, walcl: 0, walcl4wChange: 0,
      onRrp: 0, onRrpWeekChange: 0, sofr: 0, effectiveFedFundsRate: 0, bgcr: 0, tgcr: 0,
    });
    Object.assign(data.macroDrivers.policyExpectations, {
      futureMinusTargetMid: 0, targetMid: 0, fedFundsFutureFrontPrice: 0,
      fedFundsFutureImpliedRate: 0, fedFundsFuturesCurve: { frontMinusBack: 0 },
      sofrFuturesCurve: { frontMinusBack: 0 }, oisForwardCurve: { oneYearRate: 0 },
      dotPlotMedianCurrentYear: 0,
    });
  }));
  assert.equal(text('c2-liquidity-sofr-effr'), '0.00% / 0.00%');
  assert.equal(text('c2-liquidity-bgcr-tgcr'), '0.00% / 0.00%');
  assert.equal(text('c2-fed-path-number'), '+0.0');
  assert.equal(text('c2-fed-path-target'), '0.00%');
  assert.equal(text('c2-fed-path-front'), '0.00 → 0.00%');
  assert.equal(text('c2-fed-path-ois'), '0.00%');
  assert.notEqual(badge('c2-liquidity-badge').textContent, '待核验');

  renderC2(dataWith((data) => {
    data.macroDrivers.fedLiquidity = {};
    data.macroDrivers.policyExpectations = {};
  }));
  assert.equal(text('c2-liquidity-sofr-effr'), '— / —');
  assert.equal(text('c2-fed-path-number'), '—');
  assert.equal(badge('c2-fed-path-badge').textContent, '待核验');
});

test('C3 all missing, HY fallback, partial legs, true zero and F preservation', () => {
  renderC3(dataWith((data) => {
    data.__effectiveDisplayInputs = {};
    data.displayInputsBaseline = {};
    data.macroDrivers.credit = {};
    data.macroDrivers.commercialRealEstate = {};
    data.historyWindowFields = {};
  }));
  assert.equal(badge('c3-hy-badge').textContent, '待核验');
  assert.equal(badge('c3-ig-badge').textContent, '待核验');
  assert.equal(badge('c3-cre-badge').textContent, '待核验');
  assert.equal(text('c3-hy-number'), '—');
  assert.equal(text('c3-ig-number'), '—');
  assert.equal(text('c3-cre-number'), '—');
  assert.match(text('c3-hy-aux'), /高收益债利差\(HY OAS\) —/);
  assert.equal(text('c3-ig-aux'), '1 日变化 — · 投资级/高收益比 —');
  assert.match(text('c3-cre-aux'), /QoQ — · 状态: 待核验/);
  for (const id of ['c3-cre-delinquency', 'c3-cre-chargeoff', 'c3-cre-sloos-nonfarm', 'c3-cre-sloos-construction', 'c3-cre-sloos-multifamily', 'c3-cre-sloos-max']) {
    assert.equal(text(id), '—', id);
  }

  const fallbackCases = [
    [{}, { hyOas: 3.27 }, 3.27, null],
    [{ hyOas: '' }, { hyOas: 0 }, 0, null],
    [{ hyOas: Number.NaN }, { hyOas: 3.27 }, 3.27, null],
    [{ hyOas: '3.29' }, { hyOas: 3.27 }, 3.27, null],
    [{ hyOas: 0 }, { hyOas: 3.27 }, 0, null],
    [{ hyOas: null }, { hyOas: null }, 3.27, 3.27],
  ];
  for (const [effective, baseline, expected, creditValue] of fallbackCases) {
    renderC3(dataWith((data) => {
      data.__effectiveDisplayInputs = effective;
      data.displayInputsBaseline = { ...data.displayInputsBaseline, ...baseline };
      if (creditValue === null) data.macroDrivers.credit.hyOas = undefined;
      data.macroDrivers.credit.igOas = undefined;
      data.macroDrivers.commercialRealEstate = {};
    }));
    assert.equal(text('c3-hy-number'), expected === null ? '—' : expected.toFixed(2), JSON.stringify({ effective, baseline }));
    assert.notEqual(badge('c3-hy-badge').textContent, '待核验');
  }

  renderC3(dataWith((data) => {
    data.macroDrivers.credit.igOas = null;
    Object.assign(data.macroDrivers.commercialRealEstate, {
      creStressRegime: '稳定', creChargeOffRate: null,
      sloosCreNonfarmNonresidentialTightening: null, sloosCreConstructionTightening: null,
      sloosCreMultifamilyTightening: null, sloosCreTighteningMax: null,
    });
  }));
  assert.equal(badge('c3-ig-badge').textContent, '待核验');
  assert.equal(text('c3-ig-number'), '—');
  assert.notEqual(badge('c3-cre-badge').textContent, '待核验');
  assert.equal(badge('c3-cre-status').className, 'status-bar green');
  assert.equal(text('c3-cre-number'), '1.53');
  assert.match(text('c3-cre-aux'), /QoQ -3bp · 状态: 稳定/);
  assert.equal(text('c3-cre-chargeoff'), '—');
  for (const id of ['c3-cre-sloos-nonfarm', 'c3-cre-sloos-construction', 'c3-cre-sloos-multifamily', 'c3-cre-sloos-max']) {
    assert.equal(text(id), '—', id);
  }

  renderC3(dataWith((data) => {
    data.__effectiveDisplayInputs = {};
    data.displayInputsBaseline = { ...data.displayInputsBaseline, hyOas: null };
    data.macroDrivers.credit.hyOas = 0;
    data.macroDrivers.credit.igOas = 0;
    data.macroDrivers.credit.igOas1dChange = 0;
    data.macroDrivers.credit.igHyRatio = 0;
    Object.assign(data.macroDrivers.commercialRealEstate, {
      creDelinquencyRate: 0, creDelinquencyRateQoQChange: 0, creChargeOffRate: 0,
      sloosCreNonfarmNonresidentialTightening: 0, sloosCreConstructionTightening: 0,
      sloosCreMultifamilyTightening: 0, sloosCreTighteningMax: 0,
    });
  }));
  assert.equal(text('c3-hy-number'), '0.00');
  assert.equal(text('c3-ig-number'), '0.00');
  assert.equal(text('c3-cre-number'), '0.00');
  assert.equal(text('c3-ig-aux'), '1 日变化 +0bp · 投资级/高收益比 0.00');
  for (const id of ['c3-cre-delinquency', 'c3-cre-chargeoff', 'c3-cre-sloos-nonfarm', 'c3-cre-sloos-construction', 'c3-cre-sloos-multifamily', 'c3-cre-sloos-max']) {
    assert.doesNotMatch(text(id), /—/, id);
  }

  const healthy = dataWith();
  renderC3(healthy);
  assert.equal(badge('c3-nfci-status').className, 'status-bar green');
  assert.equal(text('c3-nfci-number'), '-0.496');
  assert.match(text('c3-nfci-aux'), /4 周变化 \+0\.032 · 状态: 温和宽松/);

  const before = api.deriveNarratives({ radarData: clone(healthy), worldOrderStressData: {}, marketPricingMetricsData: {} })
    .map(({ shortName, score, isActive }) => ({ shortName, score, isActive }));
  assert.equal(before.length, 7);
  const beforeInput = JSON.stringify(healthy);
  renderC2(healthy);
  renderC3(healthy);
  const after = api.deriveNarratives({ radarData: clone(healthy), worldOrderStressData: {}, marketPricingMetricsData: {} })
    .map(({ shortName, score, isActive }) => ({ shortName, score, isActive }));
  assert.deepEqual(after, before);
  assert.equal(JSON.stringify(healthy), beforeInput);
});

test('HY ready window keeps each partial leg and true zero', () => {
  const cases = [
    [{ changeBp: 2, changePct: null }, /周变化\(WoW\) \+?2bp \/ —$/],
    [{ changeBp: null, changePct: 0.006 }, /周变化\(WoW\) — \/ \+?0\.6%$/],
    [{ changeBp: null, changePct: null }, /周变化\(WoW\) — \/ —$/],
    [{ changeBp: 0, changePct: 0 }, /周变化\(WoW\) \+?0bp \/ \+?0\.0%$/],
  ];
  for (const [change, expected] of cases) {
    renderC3(dataWith((data) => {
      data.historyWindowFields.hyOasWoW = { windowStatus: 'ready', ...change };
    }));
    assert.match(text('c3-hy-aux'), expected, JSON.stringify(change));
  }
});

test('static HY/IG notes are neutral and not fixed normal claims', () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  const cardText = (id) => {
    const start = html.indexOf(`id="${id}"`);
    return html.slice(start, html.indexOf('</article>', start));
  };
  const hyCard = cardText('card-c3-hy-oas');
  const igCard = cardText('card-c3-ig-oas');
  assert.match(hyCard, /高收益债利差用于观察企业融资风险，结合有效利差和周变化判读。/);
  assert.match(igCard, /投资级债利差用于观察优质企业融资条件，结合有效利差与投资级\/高收益比判读。/);
  for (const card of [hyCard, igCard]) assert.doesNotMatch(card, /企业信用风险可控|信用市场不验证恐慌|融资几乎无压力|最强反向证据/);
});

test('static CRE meta uses the existing composite tiers and no single-threshold claim', () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  const start = html.indexOf('id="card-c3-cre"');
  const end = html.indexOf('</article>', start);
  const card = html.slice(start, end);
  assert.match(card, /既有组合档位：违约 \/ 核销 \/ 信贷标准/);
  assert.doesNotMatch(card, /阈值 &gt;1\.5% 红/);
});
