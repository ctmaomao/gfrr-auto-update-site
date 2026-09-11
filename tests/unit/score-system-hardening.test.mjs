import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveRisk, mainScoreInputFallbackNeed, activeStructuralSignals, evaluateStructuralGating,
  isAllStructuralSourcesMissing, resolveRateVol, resolveCurve, lockEngine, buildTransportShockScoringImpact, regimeProb } from '../../scripts/run-daily-pipeline.mjs';
import { calendarScoreWindow } from '../../scripts/daily/score-change.mjs';
import { buildExposureGuidance } from '../../scripts/daily/exposure-guidance.mjs';
import { buildAiInterpretationLayer } from '../../scripts/daily/rule-based-interpretation.mjs';
import { deriveDecisionState, createCalendarScoreSeries, buildStrategyStateMeta } from '../../scripts/modules/decision.js';
import { requireStructuralObservation, structuralObservationUsable, requireStructuralContinuity, structuralLagValue } from '../../scripts/daily/structural-freshness.mjs';

const rules = JSON.parse(readFileSync('config/rules.json'));
const fixtures = JSON.parse(readFileSync('tests/fixtures/main-score-production-baseline.json'));
const normal = fixtures.cases.find(c => c.name === 'normal');
const clone = value => structuredClone(value);

test('configured module composition and defaults are actually consumed without mutating rules', () => {
  const r = clone(rules);
  r.moduleComposition.geopolitical = { oilRisk: 0, vixRisk: 1 };
  const before = JSON.stringify(r);
  const risk = deriveRisk(normal.rt, normal.macroDrivers, r);
  assert.equal(risk.modules.geopolitical, risk.vixRisk);
  assert.equal(JSON.stringify(r), before);
  Object.assign(r.defaults, { breakeven10y: 2.9, spx: 6000, gold: 3000 });
  const fallback = deriveRisk({ values: {} }, {}, r);
  assert.equal(fallback.breakeven, 2.9);
  assert.equal(fallback.spx, 6000);
  assert.equal(fallback.gold, 3000);
});

test('invalid weights cannot silently corrupt or renormalize the score', () => {
  for (const mutate of [r => {r.moduleWeights.energy = -0.1;}, r => {r.moduleWeights.energy = NaN;},
    r => {r.moduleComposition.geopolitical.oilRisk = 0.9;}, r => {delete r.moduleComposition.banking.hyRisk;},
    r => {r.moduleSubWeights.debt.unknown = 0;}]) {
    const r = clone(rules); mutate(r);
    assert.throws(() => deriveRisk(normal.rt, normal.macroDrivers, r), /weights/u);
  }
});

test('nonfinite and malformed supplied values are rejected; null retains explicit default policy', () => {
  for (const key of Object.keys(rules.defaults).filter(k => !k.startsWith('_'))) {
    for (const value of [NaN, Infinity, -Infinity, '', false, '18']) {
      const rt = clone(normal.rt); rt.values[key] = value;
      assert.throws(() => deriveRisk(rt, normal.macroDrivers), /Invalid score input/u);
    }
  }
  assert.equal(deriveRisk({ values: { us10y: 0, real10y: 0, breakeven10y: null } }, {}).us10y, 0);
  assert.equal(deriveRisk({ values: {} }, {}).breakeven, rules.defaults.breakeven10y);
  assert.throws(() => deriveRisk({ ...normal.rt, changes: { brent1d: Infinity } }, {}), /brent1d/u);
});

test('missing core leaf cannot be classified as an available zero-valued primary', () => {
  for (const value of [null, undefined, '', ' ', false, NaN, Infinity]) {
    assert.equal(mainScoreInputFallbackNeed({ values: { brent: value }, sourceStatus: {brent:'fred'} }, 'brent').needed, true);
  }
  assert.equal(mainScoreInputFallbackNeed({ values: { real10y: 0 }, sourceStatus: {real10y:'fred'} }, 'real10y').needed, false);
});

const structural = status => ({ fedLiquidity: {onRrp:20,walcl4wChange:-3,sourceStatus:{onRrp:status,walcl:status}},
  curve:{t10y2y:-1,t10y2yWeekChange:1,steepeningAlert:true,sourceStatus:{t10y2y:status}},
  credit:{igOas:3,sourceStatus:{igOas:status}} });
test('structural scoring, signals and gates consistently reject unavailable provenance', () => {
  for (const status of ['missing','stale','error',null,undefined,'unexpected']) {
    const md = structural(status);
    const risk = deriveRisk(normal.rt, md);
    assert.equal(risk.onRrpRisk, null);
    assert.equal(risk.igOasRisk, null);
    assert.equal(risk.curveInversionRisk, null);
    assert.deepEqual(activeStructuralSignals(md), []);
    assert.equal(evaluateStructuralGating(md).structuralRed, false);
    assert.equal(evaluateStructuralGating(md).structuralYellow, false);
    assert.equal(isAllStructuralSourcesMissing(md), true);
  }
  for (const status of ['live','fallback']) assert.equal(evaluateStructuralGating(structural(status)).structuralRed, true);
  assert.equal(evaluateStructuralGating(structural('historical')).structuralRed, false);
});

test('MOVE live and fallback paths reject future observations and retain five-day boundary', async t => {
  const now = Date.parse('2026-09-11T12:00:00Z'); t.mock.method(Date, 'now', () => now);
  const payload = age => ({chart:{result:[{meta:{instrumentType:'INDEX'},timestamp:[(now-age*86400000)/1000],indicators:{quote:[{close:[170]}]}}]}});
  for (const age of [-1, 0, 5, 5.01]) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload(age)), {status:200}));
    const result = await resolveRateVol(null); fetchMock.mock.restore();
    assert.equal(result.move, age >= 0 && age <= 5 ? 170 : null);
    assert.equal(evaluateStructuralGating({rateVol:result}).structuralRed, age >= 0 && age <= 5);
  }
  t.mock.method(globalThis, 'fetch', async () => {throw new Error('offline fixture');});
  for (const age of [-1, 0, 5, 5.01]) {
    const result = await resolveRateVol({move:170,moveUpdatedAt:new Date(now-age*86400000).toISOString()});
    assert.equal(result.move, age >= 0 && age <= 5 ? 170 : null);
  }
});

test('structurally reduced bands contain the target and all target instructions agree', () => {
  const risk = deriveRisk(normal.rt, normal.macroDrivers);
  for (const [score, level] of [[83,'red'],[66,'yellow'],[0,'green']]) {
    const lock = lockEngine(score, {brent:60,hy:2,vix:12}, {}, {structuralRed:false,structuralYellow:false});
    assert.equal(lock.level, level);
    const original = JSON.stringify(lock);
    for (let shift = -15; shift <= 0; shift++) {
      const result = buildExposureGuidance(lock, shift), target = Number.parseFloat(result.lock.gross);
      assert.ok(target >= result.lower && target <= result.upper);
      if (result.lock.gross !== lock.gross) {
        assert.ok(result.lock.mandatory[0].includes(result.lock.gross));
        assert.ok(result.lock.allow.every(text => !text.includes(lock.gross)));
      }
    }
    assert.equal(JSON.stringify(lock), original);
  }
  const lock = lockEngine(83, risk, {}, {structuralRed:false,structuralYellow:false});
  assert.equal(buildExposureGuidance(lock, -13).lock.gross, '34%');
  assert.equal(buildExposureGuidance(lock, -13).totalExposureBand, '14%-34%');
});

test('thirty-day statistics exclude older/future/duplicate/invalid observations and preserve zero', () => {
  const rows=[{date:'2026-08-12',score:100},{date:'2026-08-13',score:0},{date:'2026-09-11',score:60},
    {date:'2026-09-12',score:100},{date:'2026-09-05',score:90},{date:'2026-09-05',score:90},{date:'invalid',score:99}];
  assert.deepEqual(calendarScoreWindow(rows,'2026-09-11'),{avg30d:30,peak30d:60,trough30d:0});
  assert.deepEqual(calendarScoreWindow([...rows].reverse(),'2026-09-11'),calendarScoreWindow(rows,'2026-09-11'));
  assert.deepEqual(calendarScoreWindow([],'2026-09-11'),{avg30d:null,peak30d:null,trough30d:null});
});

test('missing consumer change produces no directional inference; true zero stays observable', () => {
  for (const value of [null,undefined,'',false,NaN]) {
    const result=buildAiInterpretationLayer({macroDrivers:{consumer:{threeMonthChange:value}}},'2026-09-11T00:00:00Z');
    assert.equal(result.dataInferences.some(x=>x.key==='consumer_margin_observation'),false);
  }
  for (const value of [0,-1]) {
    const result=buildAiInterpretationLayer({macroDrivers:{consumer:{threeMonthChange:value}}},'2026-09-11T00:00:00Z');
    assert.equal(result.dataInferences.some(x=>x.key==='consumer_margin_observation'),true);
  }
});

test('frozen decision fallback does not turn absent risk into Risk-On', () => {
  for (const score of [null,undefined,'',false,NaN]) assert.notEqual(deriveDecisionState({score},[],{},{}).strategyState,'Risk-On');
});

test('out-of-range transport candidate cannot contribute to the main score', () => {
  const md = clone(fixtures.cases.find(c=>c.name==='transport').macroDrivers.energyTransport);
  md.transportShockCandidate.score=101;
  assert.equal(buildTransportShockScoringImpact(md,40).contributionPct,0);
});

test('structural freshness uses original observation dates and never refreshes a cache clock', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  for (const [key, days] of [['walcl',14],['onRrp',7],['t10y2y',7],['igOas',7]]) {
    for (const age of [-1,0,days,days+1]) {
      const date = new Date(now-age*86400000).toISOString().slice(0,10);
      assert.equal(structuralObservationUsable(date,key,now),age>=0 && age<=days);
      const rows=[{date,value:key==='walcl' ? 1 : 0}];
      if (age>=0 && age<=days) assert.equal(requireStructuralObservation(rows,key,now),date);
      else assert.throws(()=>requireStructuralObservation(rows,key,now),/unavailable/);
    }
    for (const date of [undefined,null,'','2026-02-30','2026-09-11T00:00:00Z']) assert.equal(structuralObservationUsable(date,key,now),false);
    assert.throws(()=>requireStructuralObservation([{date:'2026-09-11',value:null}],key,now));
  }
});

test('losing previously usable structural evidence holds publication rather than relaxing protection', () => {
  const paths=[['fedLiquidity','walcl'],['fedLiquidity','onRrp'],['curve','t10y2y'],['credit','igOas'],['rateVol','move']];
  const previous={};
  for(const [group,key] of paths) {
    previous[group]??={sourceStatus:{}};
    previous[group][key]=key==='t10y2y' ? -1 : 20;
    previous[group].sourceStatus[key]='live';
  }
  const before=JSON.stringify(previous);
  for(const [group,key] of paths) {
    const current=clone(previous);
    current[group][key]=null; current[group].sourceStatus[key]='missing';
    assert.throws(()=>requireStructuralContinuity(previous,current),new RegExp(`publication_hold:${key}`));
    current[group][key]=previous[group][key]; current[group].sourceStatus[key]='fallback';
    assert.doesNotThrow(()=>requireStructuralContinuity(previous,current));
  }
  assert.throws(()=>requireStructuralContinuity({},{}),/all_unavailable/);
  for(const [group,derived] of [['fedLiquidity','walcl4wChange'],['fedLiquidity','onRrpWeekChange'],['curve','t10y2yWeekChange']]) {
    const prior=clone(previous); prior[group][derived]=-3;
    const current=clone(prior); current[group][derived]=null;
    assert.throws(()=>requireStructuralContinuity(prior,current),new RegExp(`publication_hold:${derived}`));
  }
  const prior=clone(previous); prior.fedLiquidity.onRrpWeekChange=-10;
  for(const value of [0,10]) {
    const current=clone(prior); current.fedLiquidity.onRrp=value;
    current.fedLiquidity.onRrpWeekChange=null;
    current.fedLiquidity.onRrpWeekChangeStatus='undefined_zero_baseline';
    assert.doesNotThrow(()=>requireStructuralContinuity(prior,current));
    current.fedLiquidity.onRrpWeekChangeStatus='missing';
    assert.throws(()=>requireStructuralContinuity(prior,current),/onRrpWeekChange/);
  }
  assert.equal(JSON.stringify(previous),before);
  const producer=readFileSync('scripts/run-daily-pipeline.mjs','utf8');
  const build=producer.slice(producer.indexOf('async function build()'));
  assert.ok(build.indexOf('requireStructuralContinuity(')<build.indexOf('resolveMainScoreRuntimeSource('));
  assert.match(build,/if \(!canUseRealtimePayloadValues\(realtime\)\) throw new Error\('main_score_input_publication_hold:realtime_unavailable'\)/);
});

test('structural changes require a nearby historical observation, not any available row', () => {
  const rows=[{date:'2026-09-10',value:90},{date:'2026-09-11',value:100}];
  assert.equal(structuralLagValue(rows,28,7),null);
  assert.equal(structuralLagValue(rows,7,3),null);
  assert.equal(structuralLagValue([{date:'2026-08-14',value:80},...rows],28,7),80);
  assert.equal(structuralLagValue([{date:'2026-09-04',value:0},...rows],7,3),0);
});

test('calendar decision history requires consecutive unique dates and counts unchanged days', () => {
  const date='2026-09-11T04:00:00Z';
  const rows=[{date:'2026-09-08',score:60},{date:'2026-09-09',score:70},{date:'2026-09-10',score:70}];
  assert.deepEqual(createCalendarScoreSeries(rows,70,date),[60,70,70,70]);
  const meta=buildStrategyStateMeta({score:70,updatedAt:date},rows,{},{});
  assert.equal(meta.recent3dDelta,10); assert.equal(meta.highRiskStreakDays,3);
  const sparse=buildStrategyStateMeta({score:70,updatedAt:date},[rows[0]],{},{});
  assert.equal(sparse.recent3dDelta,null); assert.equal(sparse.highRiskStreakDays,1);
  assert.deepEqual(createCalendarScoreSeries([...rows,rows[2]],70,date),[70]);
  assert.deepEqual(createCalendarScoreSeries(rows,70,undefined),[]);
});

test('risk axis stress remains bounded and monotone across production fixture environments', () => {
  const axes={brent:[0,60,80,100,110,200],dxy:[50,95,110,130,170],hyOas:[0,2.5,4,6,10],vix:[0,12,20,35,80],
    us10y:[-1,0,2.5,5,10],real10y:[-3,0,2,5,10],breakeven10y:[-1,0,1.5,3,8]};
  for(const fixture of fixtures.cases) for(const [key,values] of Object.entries(axes)) {
    let previous=-1;
    for(const value of values) {
      const rt=clone(fixture.rt); rt.values??={}; rt.values[key]=value;
      const result=deriveRisk(rt,fixture.macroDrivers);
      assert.ok(Number.isFinite(result.score) && result.score>=previous && result.score<=100,`${fixture.name}/${key}/${value}`);
      previous=result.score;
    }
  }
});

test('regime weights total exactly 100 and keep every rounded share within one point', () => {
  for(let oil=0;oil<=100;oil+=20) for(let inflation=Math.round(oil*.35);inflation<=100;inflation+=20)
    for(let hy=0;hy<=100;hy+=20) for(let vix=0;vix<=100;vix+=20) {
      const risk={oilRisk:oil,inflationRisk:inflation,hyRisk:hy,vixRisk:vix,dollarRisk:20,realRisk:60,spxRisk:50};
      const weights=regimeProb(50,risk);
      assert.equal(Object.values(weights).reduce((a,b)=>a+b,0),100);
      assert.ok(Object.values(weights).every(x=>Number.isInteger(x) && x>=0 && x<=100));
    }
  const risk={oilRisk:0,inflationRisk:0,hyRisk:0,vixRisk:20,dollarRisk:20,realRisk:60,spxRisk:50};
  const raw={disinflationaryGrowth:120,liquidityBull:75,stagflationShock:1,crisisLiquiditySqueeze:40,monetaryDebasement:40,deflationaryBust:70};
  const result=regimeProb(50,risk), sum=Object.values(raw).reduce((a,b)=>a+b,0);
  for(const [key,value] of Object.entries(raw)) assert.ok(Math.abs(result[key]-100*value/sum)<1);
});

test('actual FRED curve resolver preserves original dates and rejects undated/future/expired caches', async t => {
  t.mock.method(Date,'now',()=>Date.parse('2026-09-11T00:00:00Z'));
  let rows=[{date:'2026-09-04',value:-0.2},{date:'2026-09-11',value:-1}];
  t.mock.method(globalThis,'fetch',async url => new Response(String(url).includes('api.stlouisfed.org')
    ? JSON.stringify({observations:rows.map(row=>({...row,value:String(row.value)}))})
    : ['DATE,T10Y2Y',...rows.map(row=>`${row.date},${row.value}`)].join('\n'),{status:200}));
  const live=await resolveCurve({});
  assert.equal(live.sourceStatus.t10y2y,'live');
  assert.equal(live.sourceObservedAt.t10y2y,'2026-09-11');
  assert.equal(live.t10y2yWeekChange,-0.8);
  rows=[{date:'2026-08-01',value:1},{date:'2026-08-08',value:1}];
  const cached=await resolveCurve(live);
  assert.equal(cached.sourceStatus.t10y2y,'fallback');
  assert.equal(cached.sourceObservedAt.t10y2y,live.sourceObservedAt.t10y2y);
  for(const date of [undefined,'2026-09-12','2026-09-03']) {
    const prior={...live,sourceObservedAt:{t10y2y:date}};
    const unavailable=await resolveCurve(prior);
    assert.equal(unavailable.t10y2y,null); assert.equal(unavailable.sourceStatus.t10y2y,'missing');
    assert.throws(()=>requireStructuralContinuity({curve:live},{curve:unavailable}),/publication_hold:t10y2y/);
  }
});
