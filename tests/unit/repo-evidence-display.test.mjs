import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  classifyRepoEvidence,
  repoEvidenceLabel,
  repoEvidenceNote,
  buildMacroOverviewNarrativePlan,
} from '../../scripts/modules/macroOverviewNarrative.js';
import * as narrativeModule from '../../scripts/modules/macroOverviewNarrative.js';
import * as configModule from '../../scripts/modules/config.js';
import * as displayHelpers from '../../scripts/modules/macroOverviewDisplayHelpers.js';
import * as matrixModule from '../../scripts/modules/buildCrossValidationMatrix.js';
import * as riskEditorialModule from '../../scripts/modules/renderMacroRiskEditorial.js';
import * as trendModule from '../../scripts/modules/renderMacroTrend.js';
import * as snapshotModule from '../../scripts/modules/snapshotFreshness.js';

const RENDER = fileURLToPath(new URL('../../scripts/modules/renderMacroOverview.js', import.meta.url));
const INDEX = fileURLToPath(new URL('../../index.html', import.meta.url));

// Inline fixed synthetic representative fixture; not a historical observation.
// Browser evidence uses the real old snapshot. Only fields the render/derive paths read.
const FIXTURE = {
  updatedAt: '2026-10-21T00:45:22.811Z',
  dailyRealtimeInput: { sourceMode: 'live', capturedAt: '2026-10-21T00:45:00Z', branch: 'fixture', commitSha: 'fixture', healthScore: 95 },
  decisionModel: { structuralSignals: [] },
  timeDimension: {},
  transmissionChain: {},
  assetReturnMap: { rows: [] },
  scenarioTree: [],
  recovery: {},
  warningSystem: {},
  modules: { energy: 84, inflation: 62, liquidity: 47 },
  displayInputsBaseline: { dxy: 99.5, gold: 2300, us10y: 4.2, brent: 85 },
  __effectiveDisplayInputs: { dxy: 99.5, gold: 2300, us10y: 4.2, brent: 85, hyOas: 3.29 },
  brentPricingLayer: { selectedBrent: { value: 85 }, crackSpread: 20.5, crackSpread4wChange: 1.2 },
  historyWindowFields: {},
  macroDrivers: {
    fedLiquidity: {
      regime: '平稳', walcl: 7100000, reserveBalances: 3620000, reserveBalances4wChange: 0.003,
      walcl4wChange: 0.001, sofr: 3.87, effectiveFedFundsRate: 3.88, bgcr: 3.85, tgcr: 3.85,
      bgcrSofrSpread: -0.02, tgcrSofrSpread: -0.02, repoSpreadRegime: '正常',
      repoSpreadDateStatus: { bgcrSofr: 'same_day', tgcrSofr: 'mismatch' },
      onRrp: 0.227, onRrpWeekChange: -0.175, onRrpLevel: '告急',
      repoRatesSource: 'NYFED:secured-rates-latest', sofrSource: 'FRED:SOFR',
    },
    credit: {
      hyOas: 3.29, igOas: 0.87, igOas1dChange: 0.01, igHyRatio: 0.264,
      nfci: -0.499, nfci4wChange: 0.037, nfciRegime: '温和宽松',
      sloosRegime: '中性', sloosTighteningLargeFirms: 0, sloosTighteningSmallFirms: 2,
    },
    policyExpectations: {
      futureMinusTargetMid: 0.045, policyTone: 'neutral', minutesPolicyTone: 'neutral',
      targetMid: 3.875, fedFundsFutureFrontPrice: 96.08, fedFundsFutureImpliedRate: 3.92,
      fedFundsFuturesCurve: { frontMinusBack: 0.01 }, sofrFuturesCurve: { frontMinusBack: 0.02 },
      oisForwardCurve: { oneYearRate: 4.5 }, dotPlotMedianCurrentYear: 4.1,
      oisForwardRate: 4.5, us10y: 4.2, real10y: 1.8, dxy: 99.5, onRrpLevel: '告急',
    },
    curve: { t10y2y: 0.35, t10y2yWeekChange: 0.02, regime: '正常', steepeningAlert: false },
    consumer: { umichSentiment: 68, ismManufacturingPmi: 49 },
    copperGold: { ratio: 0.0008, ratioChangePct: 0.01, sourceStatus: { ratio: 'live' }, copper: { price: 4.5 }, gold: { price: 2300 } },
    cfetsRmb: {},
  },
};

function fed(overrides = {}) {
  return { bgcrSofrSpread: null, repoSpreadRegime: null, repoSpreadDateStatus: null, ...overrides };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Real render module, with only the DOM sink and unrelated imported display helpers
// stubbed. Local numeric helpers (asNumber/currentValue/signedFixed...) and every
// local render function are evaluated from the actual source, so a missing dependency
// surfaces as a thrown error instead of being swallowed.
function buildRenderApi() {
  const source = fs.readFileSync(RENDER, 'utf8');
  const body = source
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export[ \t]+/gm, '');
  const importNames = [...source.matchAll(/^import\s+([\s\S]*?)from\s+['"][^'"]+['"];?[ \t]*$/gm)]
    .flatMap((match) => match[1].replace(/[{}]/g, '').split(',').map((name) => name.trim()).filter(Boolean));
  const elements = new Map();
  const fakeElement = (id) => ({
    id,
    textContent: '',
    innerHTML: '',
    hidden: false,
    className: '',
    style: {},
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    appendChild(child) { return child; },
    removeChild(child) { return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    focus() {},
  });
  const elementFor = (id) => {
    if (!elements.has(id)) elements.set(id, fakeElement(id));
    return elements.get(id);
  };
  const sandbox = {
    document: {
      getElementById: elementFor,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => fakeElement(`created-${tag}`),
    },
    $: elementFor,
    console: { error: (...args) => { throw new Error(`unexpected catch: ${args.map(String).join(' ')}`); } },
    setTimeout: () => {},
    clearTimeout: () => {},
    window: {},
  };
  const realBindings = {
    ...configModule,
    ...displayHelpers,
    ...matrixModule,
    ...narrativeModule,
    ...riskEditorialModule,
    ...trendModule,
    ...snapshotModule,
  };
  for (const name of importNames) {
    if (name === '$') {
      sandbox[name] = elementFor;
    } else if (name in realBindings) {
      sandbox[name] = realBindings[name];
    } else {
      throw new Error(`renderMacroOverview import has no real binding: ${name}`);
    }
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(`${body}\n({ renderDetailData, renderC2GlobalLiquidity, renderMacroDriversPillars, deriveNarratives, asNumber, currentValue, signedFixedWithZero, signedFixed })`, context, { filename: 'renderMacroOverview.vm.js' });
  const api = vm.runInContext('({ renderDetailData, renderC2GlobalLiquidity, renderMacroDriversPillars, deriveNarratives, asNumber, currentValue, signedFixedWithZero, signedFixed })', context);
  return { api, elements, elementFor };
}

function withRepo(overrides) {
  const data = clone(FIXTURE);
  Object.assign(data.macroDrivers.fedLiquidity, overrides);
  return data;
}

const SAME_DAY = { bgcrSofr: 'same_day', tgcrSofr: 'mismatch' };

test('repo helper keeps 0 valid and gates on date/regime; TGCR is independent', () => {
  assert.deepEqual(
    classifyRepoEvidence(fed({ bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'same_day', tgcrSofr: 'mismatch' } })),
    { status: 'confirmed_normal', spreadBp: 0, regime: '正常' }
  );
  assert.equal(classifyRepoEvidence(fed({ bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: { bgcrSofr: 'same_day' } })).status, 'confirmed_stress');
  for (const bad of [
    fed({ bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'mismatch' } }),
    fed({ bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'unknown' } }),
    fed({ bgcrSofrSpread: 0, repoSpreadRegime: '正常' }),
    fed({ bgcrSofrSpread: null, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'same_day' } }),
    fed({ bgcrSofrSpread: 0, repoSpreadRegime: '未知', repoSpreadDateStatus: { bgcrSofr: 'same_day' } }),
  ]) {
    assert.equal(classifyRepoEvidence(bad).status, 'pending');
  }
});

test('narrative policy text is pending/normal/stress scoped, not whole-market claim', () => {
  const pendingPlan = buildMacroOverviewNarrativePlan({ radarData: { macroDrivers: { fedLiquidity: fed() } } });
  const pending = pendingPlan.sections.find((s) => s.key === 'policy_liquidity');
  assert.match(pending.summaryZh, /不能确认隔夜压力/);
  assert.doesNotMatch(pending.summaryZh, /不是隔夜市场失序/);
  assert.doesNotMatch(pending.compactZh, /回购利差正常/);

  const normalPlan = buildMacroOverviewNarrativePlan({
    radarData: { macroDrivers: { fedLiquidity: fed({ bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'same_day' } }) } },
  });
  const normal = normalPlan.sections.find((s) => s.key === 'policy_liquidity');
  assert.match(normal.summaryZh, /该回购利差处于既有正常档/);
  assert.doesNotMatch(normal.summaryZh, /不是隔夜市场失序/);

  const stressPlan = buildMacroOverviewNarrativePlan({
    radarData: { macroDrivers: { fedLiquidity: fed({ bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: { bgcrSofr: 'same_day' } }) } },
  });
  const stress = stressPlan.sections.find((s) => s.key === 'policy_liquidity');
  assert.match(stress.summaryZh, /既有「压力」档/);
  assert.doesNotMatch(stress.summaryZh, /不是隔夜市场失序/);
});

test('real deriveNarratives keeps n1-n7 score/isActive and scopes the repo state', () => {
  const { api } = buildRenderApi();
  const baseline = api.deriveNarratives({
    radarData: clone(FIXTURE),
    worldOrderStressData: {},
    marketPricingMetricsData: {},
  });
  const states = [
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY },
    { bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: SAME_DAY },
    { bgcrSofrSpread: null, repoSpreadRegime: null, repoSpreadDateStatus: null },
    { bgcrSofrSpread: 0, repoSpreadRegime: '未知', repoSpreadDateStatus: { bgcrSofr: 'mismatch' } },
  ];
  for (const state of states) {
    const current = api.deriveNarratives({
      radarData: withRepo(state),
      worldOrderStressData: {},
      marketPricingMetricsData: {},
    });
    for (let index = 0; index < 7; index += 1) {
      assert.equal(current[index].score, baseline[index].score, `n${index + 1} score`);
      assert.equal(current[index].isActive, baseline[index].isActive, `n${index + 1} isActive`);
    }
  }
  const normal = api.deriveNarratives({ radarData: withRepo(states[0]), worldOrderStressData: {}, marketPricingMetricsData: {} }).find((n) => n.name === '流动性收紧');
  assert.match(normal.description, /该回购利差处于既有正常档/);
  assert.doesNotMatch(normal.description, /三层均无压力/);
  const stress = api.deriveNarratives({ radarData: withRepo(states[1]), worldOrderStressData: {}, marketPricingMetricsData: {} }).find((n) => n.name === '流动性收紧');
  assert.match(stress.description, /该回购利差处于既有「压力」档/);
  const pending = api.deriveNarratives({ radarData: withRepo(states[2]), worldOrderStressData: {}, marketPricingMetricsData: {} }).find((n) => n.name === '流动性收紧');
  assert.match(pending.description, /该回购利差待核验/);
  assert.doesNotMatch(pending.description, /三层均无压力|2019-09 信号目前不存在/);
});

test('real C2 and detail leaves render normal/stress/pending/zero repeatedly and clear stale state', () => {
  const { api, elementFor } = buildRenderApi();
  const sequence = [
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY },
    { bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: SAME_DAY },
    { bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: { bgcrSofr: 'mismatch' } },
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY },
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'unknown' } },
  ];
  for (const state of sequence) {
    const data = withRepo(state);
    api.renderC2GlobalLiquidity({ radarData: data });
    api.renderDetailData({ radarData: data });
    const evidence = classifyRepoEvidence(state);
    const expected = evidence.status === 'pending' ? '待核验' : evidence.regime;
    assert.equal(elementFor('c2-liquidity-repo-regime').textContent, expected);
    assert.equal(elementFor('detail-fed-repo-regime').textContent, expected);
    const note = elementFor('c2-liquidity-repo-note').textContent;
    if (evidence.status === 'pending') assert.match(note, /不能确认正常或压力/);
    else assert.match(note, /不代表三层整体或历史事件/);
  }
});

test('real pillar uses D0 strict conversion only when qualified and stays neutral otherwise', () => {
  const { api, elementFor } = buildRenderApi();
  const sequence = [
    { bgcrSofrSpread: -0.02, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY, expected: '-2bp' },
    { bgcrSofrSpread: 0.02, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY, expected: '+2bp' },
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY, expected: '+0bp' },
    { bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: SAME_DAY, expected: '+30bp' },
    { bgcrSofrSpread: 0.3, repoSpreadRegime: '压力', repoSpreadDateStatus: { bgcrSofr: 'mismatch' }, expected: '待核验' },
    { bgcrSofrSpread: -0.02, repoSpreadRegime: '正常', repoSpreadDateStatus: SAME_DAY, expected: '-2bp' },
    { bgcrSofrSpread: 0, repoSpreadRegime: '正常', repoSpreadDateStatus: { bgcrSofr: 'unknown' }, expected: '待核验' },
  ];
  for (const state of sequence) {
    api.renderMacroDriversPillars({ radarData: withRepo(state) });
    const text = elementFor('pillar-1-text').textContent;
    assert.match(text, new RegExp(`回购利差\\(BGCR-SOFR\\) ${state.expected.replace('+', '\\+')}`));
    assert.match(text, /需结合原始日期核验/);
    assert.doesNotMatch(text, /锚定/);
  }
});

test('appendix repo sentence is neutral and repo status is not fixed ok', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const start = html.indexOf('detail-fed-signal-active');
  const end = html.indexOf('</p>', start);
  assert.ok(start >= 0 && end > start);
  const segment = html.slice(start, end);
  assert.doesNotMatch(segment, /三层主流/);
  assert.doesNotMatch(segment, /锚定/);
  assert.match(segment, /美元流动性分项资料/);
  assert.match(segment, /SOFR\/EFFR\) 参考读数/);
  assert.match(segment, /id="detail-fed-repo-regime">待核验/);
  assert.doesNotMatch(segment, /class="ok" id="detail-fed-repo-regime"/);
});

