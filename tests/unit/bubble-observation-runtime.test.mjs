import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { requireFreshUnderlyingObservation } from '../../scripts/bubble-watch/observation-freshness.mjs';
import { ARR_MAX_AGE_DAYS, buildArrGap, validateArrGap } from '../../scripts/bubble-watch/arr-evidence.mjs';
import { syncUpstreamObservation, buildEnterpriseObservationProjection } from '../../scripts/bubble-watch/source-observation.mjs';
const source = fs.readFileSync(new URL('../../scripts/build-bubble-watch.mjs', import.meta.url), 'utf8');
const config = JSON.parse(fs.readFileSync(new URL('../../config/bubble-watch-curated.json', import.meta.url)));
const block = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const rows = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-28'].map((date, n) => ({ date, id: [315823, 322211, 323715, 325206][n], arrB: [2, 3, 5, 9][n], title: 'Synthetic bound company run-rate' }));
function arrCollector(today) {
  const calls = [];
  const context = vm.createContext({ fetchSaastrPost: async id => { calls.push(id); return rows.find(row => row.id === id); },
    extractAnthropicArrB: post => post.arrB, monthsBetweenIso: (a, b) => (Date.parse(b) - Date.parse(a)) / (30.4375 * 86400000),
    isoDate: () => today, ARR_MAX_AGE_DAYS, requireFreshUnderlyingObservation });
  vm.runInContext(block('async function fetchArrSecondDerivativeFromSaastr(', 'async function fetchEnterpriseDeployFromPublicReports(') + '\nglobalThis.collect=fetchArrSecondDerivativeFromSaastr;', context);
  return { collect: context.collect, calls };
}
test('actual ARR collector emits original milestone date, not current fetch date', async () => {
  const fixture = arrCollector('2026-07-12');
  const result = await fixture.collect({}, { maxAgeDays: 45 });
  assert.equal(result.as_of, '2026-05-28'); assert.equal(result.detail.underlyingObservationFreshness.ageDays, 45);
  assert.deepEqual(fixture.calls, [315823, 322211, 323715, 325206]);
});
test('actual stale exception preserves all parsed source identities for the registered unknown', async () => {
  const fixture = arrCollector('2026-11-10');
  let caught;
  try { await fixture.collect({}, { maxAgeDays: 45 }); } catch (error) { caught = error; }
  assert.match(caught.message, /166d old \(max 45d\)/u);
  const proof = JSON.parse(JSON.stringify(caught.arrRejectionEvidence));
  assert.deepEqual(proof.milestones, rows.map(({ date, id, arrB }) => ({ date, arrB, sourceId: id })));
  const base = { id: 'arr_2nd_deriv', score_role: 'core', axis: 'trigger', category: 'fundamentals' };
  const card = buildArrGap(base, config.curated.arr_2nd_deriv, '2026-11-10', caught.message, '2026-11-10T06:00:00Z', proof);
  assert.equal(validateArrGap(card, '2026-11-10'), true);
  const bad = structuredClone(card); bad.provenance.detail.rejectionEvidence.milestones[3].sourceId = 999;
  assert.equal(validateArrGap(bad, '2026-11-10'), false);
});
test('actual upstream sync invokes strict per-observation semantics for every unblocked slot', async () => {
  const current = structuredClone(config), original = structuredClone(current); let writes = 0;
  const indicators = ['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy'].map(id => ({ id, as_of: current.curated[id].asOfDate,
    source_url: current.curated[id].sourceObservation.sourceUrl, basis: current.curated[id].sourceObservation.basis,
    value: id === 'arr_2nd_deriv' ? '披露序列减速' : id === 'vc_ai_share' ? 64.2 : 44, status: 'red', note: 'wrong current prose' }));
  const context = vm.createContext({ fetchUpstreamReport: async () => ({ upstream: { as_of_date: '2026-11-09', indicators }, sourceUrl: 'fixture' }),
    UPSTREAM_SYNC_LOCAL_AUTHORITY_BLOCKLIST: new Set(['mag4_fcf_yoy']), syncUpstreamObservation, isoDate: () => '2026-11-10',
    fs: { writeFileSync: () => writes++ }, CONFIG_PATH: 'fixture', console: { log() {}, warn() {} } });
  vm.runInContext(block('async function syncCuratedFromUpstream(', '// ---------- 指标组装') + '\nglobalThis.sync=syncCuratedFromUpstream;', context);
  await context.sync(current);
  for (const id of indicators.map(row => row.id)) assert.equal(current.curated[id].asOfDate, original.curated[id].asOfDate);
  assert.equal(current.curated.enterprise_deploy.status, 'green'); assert.equal(writes, 1);
});
test('actual r6 enterprise branch never falls through to incompatible Google or Wind collectors', () => {
  const a = "    if (EVIDENCE_REVISION >= 6 && def.id === 'enterprise_deploy')";
  const b = "    if (def.mode === 'curated')";
  const code = block(a, b);
  assert.ok(code.includes('buildEnterpriseObservationProjection'));
  const indicators = [];
  const context = vm.createContext({ EVIDENCE_REVISION: 6, config, today: '2026-11-10', indicators,
    buildEnterpriseObservationProjection, baseIndicator: def => ({ ...def, score_role: 'core' }),
    defs: [{ id: 'enterprise_deploy' }], curatedCount: 0 });
  vm.runInContext(`for (const def of defs) { ${code} throw new Error('unrelated source collector reached'); }`, context);
  assert.equal(indicators.length, 1); assert.equal(indicators[0].as_of, '2026-09-24');
  assert.equal(indicators[0].status, 'green'); assert.equal(indicators[0].provenance.mode, 'curated');
});
