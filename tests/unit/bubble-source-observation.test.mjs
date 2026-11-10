import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SOURCE_OBSERVATION_CONTRACT, KPMG_ADOPTION_BASIS,
  syncUpstreamObservation, evaluateEnterpriseObservation, buildEnterpriseObservationProjection,
  validateEnterpriseObservationRecord
} from '../../scripts/bubble-watch/source-observation.mjs';

const CONFIG = JSON.parse(fs.readFileSync(new URL('../../config/bubble-watch-curated.json', import.meta.url)));
const TODAY = '2026-11-10';
function entry(id = 'enterprise_deploy') { return structuredClone(CONFIG.curated[id]); }
function upstream(id, local = entry(id)) {
  return {
    id, as_of: local.asOfDate, basis: local.sourceObservation.basis,
    source_url: local.sourceObservation.sourceUrl,
    value: id === 'enterprise_deploy' ? 44 : id === 'vc_ai_share' ? 64.2 : '披露序列减速',
    status: 'red', stale: false, freshness: 'current',
    note: 'Untrusted prose must not supply a new observation or overwrite reviewed evidence.',
    value_display: 'FORGED DISPLAY'
  };
}
function synchronize(id = 'enterprise_deploy', overrides = {}) {
  return syncUpstreamObservation({ id, entry: overrides.entry ?? entry(id), upstreamIndicator: overrides.upstreamIndicator ?? upstream(id),
    reportDate: '2026-11-09', today: TODAY, ...overrides });
}

test('curated migration restores three actual dates and preserves separate review dates', () => {
  for (const [id, asOfDate, maxAgeDays, ageDays] of [
    ['arr_2nd_deriv', '2026-07-31', 45, 102], ['vc_ai_share', '2026-10-05', 120, 36],
    ['enterprise_deploy', '2026-09-24', 120, 47]
  ]) {
    const e = entry(id);
    assert.equal(e.asOfDate, asOfDate);
    assert.equal(e.maxAgeDays, maxAgeDays);
    assert.equal(e.reviewAsOfDate, '2026-11-08');
    assert.equal(e.reportAsOfDate, '2026-11-08');
    assert.equal(e.sourceObservation.contract, SOURCE_OBSERVATION_CONTRACT);
    const result = synchronize(id);
    assert.equal(result.accepted, true);
    assert.equal(result.entry.asOfDate, asOfDate);
    assert.equal(result.ageDays, ageDays);
    assert.equal(result.entry.reviewAsOfDate, '2026-11-09');
  }
});

test('typed KPMG projection computes green from same-question 44 vs 23, not upstream red', () => {
  const e = entry();
  e.status = 'red';
  const result = buildEnterpriseObservationProjection(e, TODAY);
  assert.equal(result.valid, true);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'green');
  assert.equal(result.detail.changePp, 21);
  assert.equal(result.detail.basis, KPMG_ADOPTION_BASIS);
  assert.equal(result.value, 44);
  assert.equal(result.asOfDate, '2026-09-24');
  assert.equal(result.ageDays, 47);
  assert.match(result.name_zh, /员工/u);
  assert.match(result.source_name, /KPMG/u);
  assert.match(result.threshold_text, /≥\+3pp/u);
  assert.match(result.note, /314 位美国高管/u);
  assert.match(result.note, /2026-07-24 至 2026-08-25/u);
  assert.match(result.note, /不是 AI-agent 生产部署率/u);
  assert.equal(result.detail.productionDeployPct, undefined);
  const synced = synchronize('enterprise_deploy', { entry: e });
  assert.equal(synced.entry.status, 'green');
  assert.equal(synced.entry.value_display, '44%（QoQ +21pp）');
  assert.doesNotMatch(synced.entry.note, /Untrusted|FORGED/u);
});

test('KPMG threshold boundaries include +3 as green and -3 as yellow', () => {
  for (const [change, expected] of [[-3.0001, 'red'], [-3, 'yellow'], [0, 'yellow'], [2.9999, 'yellow'], [3, 'green'], [21, 'green']]) {
    const e = entry();
    e.sourceObservation.previousPct = 50;
    e.sourceObservation.currentPct = 50 + change;
    delete e.sourceObservation.changePp;
    assert.equal(evaluateEnterpriseObservation(e, TODAY).status, expected, String(change));
  }
  for (const currentPct of [0, 100]) {
    const e = entry();
    Object.assign(e.sourceObservation, { currentPct, previousPct: currentPct, changePp: 0 });
    assert.equal(evaluateEnterpriseObservation(e, TODAY).status, 'yellow');
  }
});

test('KPMG stale day 121 is unknown; day 120 remains valid without changing source date', () => {
  const e = entry();
  assert.equal(evaluateEnterpriseObservation(e, '2027-01-22').status, 'green');
  const stale = buildEnterpriseObservationProjection(e, '2027-01-23');
  assert.equal(stale.valid, true);
  assert.equal(stale.ok, false);
  assert.equal(stale.status, null);
  assert.equal(stale.historicalStatus, 'green');
  assert.equal(stale.ageDays, 121);
  assert.equal(stale.asOfDate, '2026-09-24');
  assert.match(stale.note, /当前灯色待确认/u);
});

test('KPMG rejects missing/unknown/mixed survey semantics and deceptive metadata', () => {
  const mutations = [
    e => { delete e.sourceObservation; },
    e => { e.sourceObservation.contract = 'future-contract'; },
    e => { e.sourceObservation.basis = 'google_cloud_agent_production'; },
    e => { e.sourceObservation.previousBasis = 'different_question'; },
    e => { e.sourceObservation.population = 'global_enterprises'; },
    e => { e.sourceObservation.currentQuarter = '2026Q3'; },
    e => { e.sourceObservation.previousQuarter = '2026-Q1'; },
    e => { e.sourceObservation.sourceUrl = 'https://kpmg.com.evil.test/us/en/media/news/q3-ai-pulse-2026.html'; },
    e => { e.sourceObservation.sourceUrl += '?current=44'; },
    e => { e.sourceObservation.sourceUrl = 'https://kpmg.com/us/en/media/news/q2-ai-pulse-2026.html'; },
    e => { e.sourceObservation.currentPct = '44'; },
    e => { e.sourceObservation.previousPct = null; },
    e => { e.sourceObservation.currentPct = Infinity; },
    e => { e.sourceObservation.currentPct = -1; },
    e => { e.sourceObservation.currentPct = 101; },
    e => { e.sourceObservation.sampleSize = 0; },
    e => { e.sourceObservation.sampleSize = 314.5; },
    e => { e.sourceObservation.changePp = 22; },
    e => { e.sourceObservation.observationDate = '2026-09-25'; },
    e => { e.sourceObservation.publicationDate = '2026-09-25'; },
    e => { e.sourceObservation.surveyStart = '2026-06-30'; },
    e => { e.sourceObservation.surveyEnd = '2026-10-01'; },
    e => { e.sourceObservation.surveyEnd = '2026-09-25'; },
    e => { e.sourceObservation.surveyEnd = '2026-07-23'; },
    e => { e.sourceObservation.surveyStart = '2026-02-30'; },
    e => { e.maxAgeDays = 121; }
  ];
  for (const mutate of mutations) {
    const e = entry();
    mutate(e);
    const result = buildEnterpriseObservationProjection(e, TODAY);
    assert.equal(result.valid, false, mutate.toString());
    assert.equal(result.status, null, mutate.toString());
    assert.equal(result.value_display, '待确认');
  }
});

test('all sync slots use observation dates, never weekly report dates', () => {
  const e = { status: 'yellow', value_display: 'old', note: 'prior source evidence', asOfDate: '2026-11-05', maxAgeDays: 14 };
  const up = { id: 'cape', status: 'red', value: 38.91, value_display: '38.91x', as_of: '2026-11-06', note: 'A sufficiently detailed new source observation note.' };
  const result = synchronize('cape', { entry: e, upstreamIndicator: up });
  assert.equal(result.accepted, true);
  assert.equal(result.entry.asOfDate, '2026-11-06');
  assert.equal(result.entry.reportAsOfDate, '2026-11-09');
  assert.equal(result.entry.status, 'red');
  assert.equal(result.ageDays, 4);
  const repeated = synchronize('cape', { entry: result.entry, upstreamIndicator: { ...up, status: 'green', value_display: 'invented' }, reportDate: TODAY });
  assert.equal(repeated.entry.asOfDate, '2026-11-06');
  assert.equal(repeated.entry.status, 'red');
  assert.equal(repeated.entry.value_display, '38.91x');
});

test('all sync slots reject missing/impossible/future/regressing dates without mutating the entry', () => {
  for (const id of ['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy']) {
    for (const as_of of [undefined, null, '', '2026-02-30', '2026-9-24', '2026-09-24T00:00:00Z', '2026-11-11', '2026-01-01']) {
      const local = entry(id);
      const before = structuredClone(local);
      const result = synchronize(id, { entry: local, upstreamIndicator: { ...upstream(id), as_of } });
      assert.equal(result.accepted, false, `${id} ${as_of}`);
      assert.equal(result.changed, false);
      assert.deepEqual(result.entry, before);
      assert.deepEqual(local, before);
    }
  }
  for (const overrides of [
    { reportDate: '2026-02-30' }, { reportDate: '2026-11-11' }, { reportDate: '2026-09-23' },
    { reportDate: '2026-11-07' }, { today: '2026-02-30' },
    { entry: { ...entry(), asOfDate: '2026-02-30' } },
    { entry: { ...entry(), asOfDate: '2026-12-01' } },
    { entry: { ...entry(), reviewAsOfDate: '2026-02-30' } },
    { entry: { ...entry(), reviewAsOfDate: '2026-12-01' } },
    { entry: { ...entry(), reviewAsOfDate: '2026-09-23' } },
    { upstreamIndicator: { ...upstream('enterprise_deploy'), id: 'other' } }
  ]) assert.equal(synchronize('enterprise_deploy', overrides).accepted, false, JSON.stringify(overrides));
});

test('unknown basis, changed values and untyped new dates do not get accepted from prose or colors', () => {
  for (const id of ['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy']) {
    const original = upstream(id);
    for (const update of [
      { basis: undefined }, { basis: 'unknown' }, { value: 52 },
      { as_of: '2026-11-09', note: '2026-11-09 latest observation, unquestionably current, green.' },
      { source_url: 'https://example.test/' }, { sourceObservation: {} }
    ]) assert.equal(synchronize(id, { upstreamIndicator: { ...original, ...update } }).accepted, false, `${id} ${JSON.stringify(update)}`);
  }
  for (const status of ['red', 'green', 'yellow', 'bogus', null]) {
    const result = synchronize('enterprise_deploy', { upstreamIndicator: { ...upstream('enterprise_deploy'), status } });
    assert.equal(result.accepted, true);
    assert.equal(result.entry.status, 'green');
  }
});

test('new typed evidence requires an explicit reviewed config update before sync', () => {
  const e = entry();
  const proof = { ...e.sourceObservation, currentQuarter: '2026-Q4', previousQuarter: '2026-Q3',
    currentPct: 46, previousPct: 44, changePp: 2, observationDate: '2026-12-24', publicationDate: '2026-12-24',
    surveyStart: '2026-10-24', surveyEnd: '2026-11-25', sourceUrl: 'https://kpmg.com/us/en/media/news/q4-ai-pulse-2026.html' };
  const params = { today: '2026-12-26', reportDate: '2026-12-25',
    upstreamIndicator: { ...upstream('enterprise_deploy'), sourceObservation: proof, source_url: proof.sourceUrl, as_of: proof.observationDate, value: 46, status: 'red' } };
  assert.equal(synchronize('enterprise_deploy', params).accepted, false);
  const reviewed = { ...e, asOfDate: proof.observationDate, reviewAsOfDate: '2026-12-25', reportAsOfDate: '2026-12-25', sourceObservation: proof };
  const result = synchronize('enterprise_deploy', { ...params, entry: reviewed });
  assert.equal(result.accepted, true); assert.equal(result.entry.status, 'yellow');
  assert.equal(result.entry.asOfDate, '2026-12-24');
});

test('coherent same-source date and value replacements cannot launder reviewed evidence', () => {
  for (const id of ['enterprise_deploy', 'vc_ai_share']) {
    const local = entry(id), up = upstream(id);
    for (const changeDate of [true, false]) {
      const proof = structuredClone(local.sourceObservation);
      if (changeDate) proof.observationDate = proof.publicationDate = '2026-11-08';
      else if (id === 'enterprise_deploy') { proof.currentPct = 0; proof.changePp = -proof.previousPct; }
      else proof.aiFundingUsdB = 0;
      const result = synchronize(id, { upstreamIndicator: { ...up, sourceObservation: proof,
        as_of: proof.observationDate, value: changeDate ? up.value : 0 } });
      assert.equal(result.accepted, false); assert.deepEqual(result.entry, local);
    }
  }
});

test('VC recomputes its ratio and threshold with no color/prose borrowing', () => {
  for (const [aiFundingUsdB, expected] of [[0, 'green'], [29.99, 'green'], [30, 'yellow'], [50, 'yellow'], [50.01, 'red'], [100, 'red']]) {
    const local = entry('vc_ai_share');
    Object.assign(local.sourceObservation, { aiFundingUsdB, totalFundingUsdB: 100 });
    const up = { ...upstream('vc_ai_share', local), value: Math.round(aiFundingUsdB * 10) / 10, status: 'green' };
    const result = synchronize('vc_ai_share', { entry: local, upstreamIndicator: up });
    assert.equal(result.accepted, true);
    assert.equal(result.entry.status, expected, String(aiFundingUsdB));
  }
  for (const patch of [
    { geography: 'us' }, { aiFundingUsdB: '102' }, { aiFundingUsdB: 160 }, { aiFundingUsdB: -1 },
    { totalFundingUsdB: 0 }, { totalFundingUsdB: null }, { periodEnd: '2026-09-29' },
    { publicationDate: '2026-11-08' }, { period: '2026-Q4' }
  ]) {
    const local = entry('vc_ai_share');
    Object.assign(local.sourceObservation, patch);
    assert.equal(synchronize('vc_ai_share', { entry: local }).accepted, false, JSON.stringify(patch));
  }
});

test('ARR historical observation stays July 31 even when upstream claims current and repeats wrong growth prose', () => {
  const result = synchronize('arr_2nd_deriv', { upstreamIndicator: { ...upstream('arr_2nd_deriv'),
    note: 'Latest current three-month growth went from 160% to 43.33%, green.', status: 'green' } });
  assert.equal(result.accepted, true);
  assert.equal(result.ageDays, 102);
  assert.equal(result.entry.asOfDate, '2026-07-31');
  assert.equal(result.entry.maxAgeDays, 45);
  assert.equal(result.entry.sourceObservation.productionEligible, false);
  assert.equal(result.entry.status, entry('arr_2nd_deriv').status);
  assert.doesNotMatch(result.entry.note, /160%|43\.33%|233\.33%|116\.67%/u);
  assert.match(result.entry.note, /金额含约数或下限/u);
  for (const mutate of [
    e => { e.sourceObservation.productionEligible = true; },
    e => { e.sourceObservation.anchors[2].amountUsdB = 66; },
    e => { e.sourceObservation.anchors[2].qualifier = 'exact'; },
    e => { e.sourceObservation.anchors[2].isForecast = true; },
    e => { e.sourceObservation.anchors[2].sourceDate = '2026-07-30'; },
    e => { e.sourceObservation.anchors[2].sourceDate = '2027-01-01'; },
    e => { e.sourceObservation.anchors[2].sourceUrl = 'https://example.test/'; },
    e => { e.sourceObservation.anchors.pop(); },
    e => { e.maxAgeDays = 46; }
  ]) {
    const local = entry('arr_2nd_deriv');
    mutate(local);
    assert.equal(synchronize('arr_2nd_deriv', { entry: local }).accepted, false, mutate.toString());
  }
});

test('pure sync/projection are input-immutable and identical review is idempotent', () => {
  for (const id of ['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy']) {
    const local = entry(id);
    const up = upstream(id);
    const before = structuredClone({ local, up });
    const first = synchronize(id, { entry: local, upstreamIndicator: up });
    const second = synchronize(id, { entry: first.entry, upstreamIndicator: up });
    assert.deepEqual({ local, up }, before);
    assert.deepEqual(second.entry, first.entry);
    assert.equal(second.changed, false);
    if (id === 'enterprise_deploy') {
      const projection = buildEnterpriseObservationProjection(local, TODAY);
      projection.detail.sourceObservation.currentPct = 0;
      assert.equal(local.sourceObservation.currentPct, 44);
    }
  }
});

test('calendar validation admits actual leap day and rejects normalized non-leap February 29', () => {
  const e = { status: 'yellow', asOfDate: '2024-02-28', maxAgeDays: 14 };
  const up = { id: 'cape', status: 'red', as_of: '2024-02-29', value: 38 };
  assert.equal(synchronize('cape', { entry: e, upstreamIndicator: up, reportDate: '2024-03-01', today: '2024-03-02' }).accepted, true);
  assert.equal(synchronize('cape', { entry: e, upstreamIndicator: { ...up, as_of: '2026-02-29' } }).accepted, false);
});

function enterpriseRecord(today = TODAY) {
  const e = entry();
  const p = buildEnterpriseObservationProjection(e, today);
  return {
    id: 'enterprise_deploy', name_en: p.name_en, name_zh: p.name_zh, threshold_text: p.threshold_text,
    source_name: p.source_name, value: p.value, value_display: p.value_display, note: p.note,
    status: p.status, as_of: p.asOfDate, stale: p.stale,
    provenance: { mode: 'curated', asOfDate: p.asOfDate, ageDays: p.ageDays, maxAgeDays: p.maxAgeDays, detail: p.detail }
  };
}

test('public record validation replays both the typed proof and every duplicated card fact', () => {
  const row = enterpriseRecord();
  assert.equal(validateEnterpriseObservationRecord(row, TODAY), true);
  const mutations = [
    r => { r.name_zh = '企业生产环境部署率'; },
    r => { r.name_en = 'Enterprise Production Deploy'; },
    r => { r.threshold_text = '<50%=红 / 50-65%=黄 / >65%=绿'; },
    r => { r.source_name = 'Google Cloud'; },
    r => { r.value_display = '52%'; },
    r => { r.value = 52; },
    r => { r.status = 'red'; },
    r => { r.note += ' Google 52% confirms this same observation.'; },
    r => { r.as_of = '2026-11-08'; },
    r => { r.stale = true; },
    r => { r.provenance.mode = 'auto'; },
    r => { r.provenance.asOfDate = '2026-11-08'; },
    r => { r.provenance.ageDays = 2; },
    r => { r.provenance.maxAgeDays = 121; },
    r => { r.provenance.detail.sourceObservation.basis = 'different_question'; },
    r => { r.provenance.detail.sourceObservation.currentPct = 52; },
    r => { r.provenance.detail.currentPct = 52; },
    r => { r.provenance.detail.previousPct = 22; },
    r => { r.provenance.detail.changePp = 22; },
    r => { r.provenance.detail.sampleSize = 315; },
    r => { delete r.provenance.detail.sourceObservation; },
    r => { delete r.provenance.detail.publicationDate; }
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(row);
    mutate(changed);
    assert.equal(validateEnterpriseObservationRecord(changed, TODAY), false, mutate.toString());
  }
  assert.equal(validateEnterpriseObservationRecord(null, TODAY), false);
  assert.equal(validateEnterpriseObservationRecord(row, '2026-02-30'), false);
  assert.equal(validateEnterpriseObservationRecord(row, '2026-09-23'), false);
});

test('source-health proof has no stale exemption or report-date age renewal', () => {
  assert.equal(validateEnterpriseObservationRecord(enterpriseRecord('2027-01-22'), '2027-01-22'), true);
  const stale = enterpriseRecord('2027-01-23');
  assert.equal(validateEnterpriseObservationRecord(stale, '2027-01-23'), false);
  stale.status = 'green';
  stale.stale = false;
  stale.provenance.ageDays = 1;
  stale.provenance.reviewAsOfDate = '2027-01-22';
  assert.equal(validateEnterpriseObservationRecord(stale, '2027-01-23'), false);
});

test('review and report metadata must each be valid and non-regressing', () => {
  for (const reportAsOfDate of ['2026-02-30', '2026-11-11', '2026-09-23', '2026-11-10']) {
    const result = synchronize('enterprise_deploy', { entry: { ...entry(), reportAsOfDate } });
    assert.equal(result.accepted, false, reportAsOfDate);
  }
});
