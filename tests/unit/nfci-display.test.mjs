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
  vm.runInContext(`${body}\n({ renderC3CreditCorporate, renderMacroDriversPillars, deriveNarratives, asNumber })`, context, { filename: 'renderMacroOverview.vm.js' });
  return {
    api: vm.runInContext('({ renderC3CreditCorporate, renderMacroDriversPillars, deriveNarratives, asNumber })', context),
    elements,
    elementFor,
  };
}

const originalDocument = globalThis.document;
const { api, elementFor } = await buildRenderApi();
after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

// Fixed synthetic representative fixture; not a historical observation.
// Real browser baseline (2026-10-23) has nfci4wChange +0.032; this fixture keeps 0.037 intentionally.
const FIXTURE = {
  updatedAt: '2026-10-23T00:48:31.687Z',
  modules: { energy: 82, inflation: 62, sentiment: 50, liquidity: 46 },
  displayInputsBaseline: { brent: 125.4, dxy: 121.4, vix: 16.68, us10y: 5.1, real10y: 2.78, breakeven10y: 2.35, gold: 4166, spx: 7659 },
  historyWindowFields: {},
  macroDrivers: {
    credit: {
      hyOas: 3.27, igOas: 0.88, nfci: -0.496, nfci4wChange: 0.037, nfciRegime: '温和宽松',
      igOas1dChange: 0.02, igHyRatio: 0.264,
    },
    fedLiquidity: { regime: '平稳', reserveBalances: 3022140, onRrpLevel: '告急' },
    policyExpectations: {},
    curve: {},
    consumer: {},
    commercialRealEstate: {},
    privateCreditProxy: {},
    energyTransport: { latestAgeDays: 7, guards: { latestFresh: true } },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
function dataWithNfci(value, regime = '温和宽松', change = 0.037) {
  const data = clone(FIXTURE);
  data.macroDrivers.credit.nfci = value;
  data.macroDrivers.credit.nfciRegime = regime;
  data.macroDrivers.credit.nfci4wChange = change;
  return data;
}
function renderC3(data) {
  api.renderC3CreditCorporate({ radarData: data });
  return {
    number: elementFor('c3-nfci-number'),
    aux: elementFor('c3-nfci-aux'),
    note: elementFor('c3-nfci-note'),
    status: elementFor('c3-nfci-status'),
    badge: elementFor('c3-nfci-badge'),
  };
}
function primeStatic() {
  const values = {
    'c3-nfci-number': '+0.18',
    'c3-nfci-aux': '4 周变化 +0.05 · 状态: 收紧',
    'c3-nfci-note': '方向反转：正值=收紧。当前刚转正，边际收紧。',
    'c3-nfci-status': 'status-bar yellow',
    'c3-nfci-badge': 'badge yellow YELLOW',
  };
  for (const [id, text] of Object.entries(values)) {
    const el = elementFor(id);
    if (id.includes('status')) el.className = text;
    else if (id.includes('badge')) { el.className = 'badge yellow'; el.textContent = 'YELLOW'; }
    else el.textContent = text;
  }
}

function extractProducerClassifier() {
  const source = fs.readFileSync(`${ROOT}/scripts/run-daily-pipeline.mjs`, 'utf8');
  const start = source.indexOf('function classifyNfciRegime');
  const end = source.indexOf('\nfunction ', start + 10);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}\nclassifyNfciRegime`, {});
}

test('real producer classifier and canonical/alias tone mapping', () => {
  const classify = extractProducerClassifier();
  assert.equal(classify(0.5), '显著收紧');
  assert.equal(classify(0.499), '温和收紧');
  assert.equal(classify(0.1), '温和收紧');
  assert.equal(classify(0.099), '中性');
  assert.equal(classify(0), '中性');
  assert.equal(classify(-0.1), '中性');
  assert.equal(classify(-0.1001), '温和宽松');
  assert.equal(classify(-0.5), '温和宽松');
  assert.equal(classify(-0.5001), '显著宽松');
  assert.equal(classify(null), '未知');
  assert.equal(classify(Number.NaN), '未知');
  assert.equal(classify('0.5'), '未知');

  const cases = [
    ['显著宽松', -0.6, 'green'], ['温和宽松', -0.3, 'green'], ['中性', 0, 'yellow'],
    ['温和收紧', 0.3, 'yellow'], ['显著收紧', 1, 'red'],
    ['宽松', -0.6, 'green'], ['边际收紧', 0.3, 'yellow'], ['收紧', 1, 'red'], ['紧张', 1, 'red'],
  ];
  for (const [regime, value, tone] of cases) {
    const out = renderC3(dataWithNfci(value, regime));
    assert.equal(out.status.className, `status-bar ${tone}`, `${regime} status`);
    assert.equal(out.badge.className, `badge ${tone}`, `${regime} badge`);
    assert.match(out.note.textContent, /正值表示较历史平均偏紧，负值表示偏松/);
    assert.doesNotMatch(out.note.textContent, /方向反转/);
  }
  for (const unknown of ['未知', 'foo', '', null]) {
    const out = renderC3(dataWithNfci(0.3, unknown));
    assert.equal(out.status.className, 'status-bar pending');
    assert.equal(out.badge.className, 'badge pending');
    assert.equal(out.badge.textContent, '待核验');
    assert.match(out.aux.textContent, /状态: 待核验/);
  }
});

test('C3 invalid values never become zero; true zero stays valid; repeated render clears', () => {
  for (const bad of [null, undefined, '', false, true, [], {}, '0.18', Number.NaN]) {
    const out = renderC3(dataWithNfci(bad, '温和宽松'));
    assert.equal(out.number.textContent, '—', `number for ${String(bad)}`);
    assert.doesNotMatch(out.number.textContent, /0\.000/);
    assert.equal(out.badge.className, 'badge pending');
    assert.equal(out.badge.textContent, '待核验');
    assert.equal(out.status.className, 'status-bar pending');
    assert.match(out.note.textContent, /待核验/);
  }

  const zero = renderC3(dataWithNfci(0, '中性', null));
  assert.equal(zero.number.textContent, '0.000');
  assert.equal(zero.status.className, 'status-bar yellow');
  assert.equal(zero.badge.className, 'badge yellow');
  assert.match(zero.aux.textContent, /4 周变化 — · 状态: 中性/);
  assert.match(zero.note.textContent, /当前 0\.000，中性/);

  primeStatic();
  const pending = renderC3(dataWithNfci(null, '温和宽松', null));
  assert.equal(pending.number.textContent, '—');
  assert.equal(pending.badge.className, 'badge pending');
  assert.match(pending.note.textContent, /当前读数缺失，待核验/);
  assert.doesNotMatch(pending.note.textContent, /方向反转/);
  const zeroAgain = renderC3(dataWithNfci(0, '中性'));
  assert.equal(zeroAgain.number.textContent, '0.000');
  assert.equal(zeroAgain.status.className, 'status-bar yellow');
  const missingAgain = renderC3(dataWithNfci(undefined, '温和宽松'));
  assert.equal(missingAgain.number.textContent, '—');
  assert.equal(missingAgain.badge.textContent, '待核验');
});

test('pillar and n6 display bindings are separate from score bindings', () => {
  const missing = dataWithNfci(null, '温和宽松');
  api.renderMacroDriversPillars({ radarData: missing });
  assert.match(elementFor('pillar-4-text').textContent, /金融条件指数\(NFCI\) — \(待核验\)/);
  assert.doesNotMatch(elementFor('pillar-4-text').textContent, /NFCI\) 0\.00/);

  api.renderMacroDriversPillars({ radarData: dataWithNfci(0, '中性') });
  assert.match(elementFor('pillar-4-text').textContent, /金融条件指数\(NFCI\) 0\.00 \(中性\)/);
  api.renderMacroDriversPillars({ radarData: dataWithNfci('0.18', '温和收紧') });
  assert.match(elementFor('pillar-4-text').textContent, /金融条件指数\(NFCI\) — \(待核验\)/);

  const baseline = api.deriveNarratives({ radarData: clone(FIXTURE), worldOrderStressData: {}, marketPricingMetricsData: {} })
    .find((item) => item.name === '信用利差告警');
  assert.equal(baseline.score, 32);
  assert.equal(baseline.isActive, false);
  assert.match(baseline.description, /金融条件指数\(NFCI\) -0\.50/);

  const cases = [null, undefined, '', false, true, [], {}, '0.18', Number.NaN, 0, -0.496, 0.3];
  for (const raw of cases) {
    const data = dataWithNfci(raw, '中性');
    const current = api.deriveNarratives({ radarData: data, worldOrderStressData: {}, marketPricingMetricsData: {} })
      .find((item) => item.name === '信用利差告警');
    const legacyNfci = api.asNumber(raw);
    const legacyScore = Math.round(Math.min(100, Math.max(0, ((3.27 - 2) * 25) + (((legacyNfci ?? -0.5) + 0.5) * 30))));
    assert.equal(current.score, legacyScore, `n6 score for ${String(raw)}`);
    assert.equal(current.isActive, legacyScore >= 50, `n6 isActive for ${String(raw)}`);
    if (Number.isFinite(raw)) assert.match(current.description, /金融条件指数\(NFCI\) /);
    else assert.match(current.description, /金融条件指数\(NFCI\) —/);
  }

  const input = dataWithNfci(null, '温和宽松');
  const before = JSON.stringify(input);
  api.renderC3CreditCorporate({ radarData: input });
  api.renderMacroDriversPillars({ radarData: input });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(input.modules, FIXTURE.modules);
});

test('static NFCI card is neutral and uses the canonical direction wording', () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  const start = html.indexOf('id="card-c3-nfci"');
  const end = html.indexOf('</article>', start);
  const card = html.slice(start, end);
  assert.match(card, /status-bar pending/);
  assert.match(card, /badge pending/);
  assert.match(card, /id="c3-nfci-number">—/);
  assert.match(card, /4 周变化 — · 状态: 待核验/);
  assert.match(card, /正值表示较历史平均偏紧，负值表示偏松/);
  assert.match(card, /显著宽松 \/ 温和宽松 \/ 中性 \/ 温和收紧 \/ 显著收紧/);
  assert.doesNotMatch(card, /\+0\.18|方向反转|当前刚转正|状态: 收紧/);
  assert.match(RENDER_SOURCE, /signedFixed\(nfci, 2\)/);
});
