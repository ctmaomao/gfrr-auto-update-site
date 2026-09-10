import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';
import { buildCommonWeeklyWindow, weeklyWindowProblem, applyAcledWeeklyWindowGuard } from '../../scripts/world-order/acled-weekly-window.mjs';
import { scoreWorldOrderStress } from '../../scripts/world-order/score-world-order-stress.mjs';

const endMs=Math.floor(Date.now()/86400000)*86400000-7*86400000;
const week=n=>new Date(endMs+n*7*86400000).toISOString().slice(0,10);
const aggregates=()=>ACLED_WEEKLY_REGIONS.map((region,index)=>({region,weekRange:[week(-11),week(index<3?0:-2)],rowCount:index<3?12:10,
  rows:Array.from({length:index<3?14:12},(_,i)=>({week:week(i-13),country:region,admin1:region,eventType:'Violence against civilians',events:i>=12?1000:10,fatalities:1}))}));

test('six regions require a common continuous grid, not latest four rows per region',()=>{
  const input=aggregates(), before=structuredClone(input);
  const result=buildCommonWeeklyWindow(input);
  assert.equal(result.latestWeek,week(-2));
  assert.deepEqual(result.weeks12,Array.from({length:12},(_,i)=>week(i-13)));
  assert.deepEqual(input,before);
  input[0].rows.splice(5,1);
  assert.throws(()=>buildCommonWeeklyWindow(input),/12 consecutive observed weeks/);
  assert.throws(()=>buildCommonWeeklyWindow(aggregates().slice(1)),/six/);
});

test('actual sanitizer output aligns global, regional and hotspots and preserves provenance',async()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-week-window-'));
  try {
    const parser=path.join(fixture,'node_modules/xlsx');fs.mkdirSync(parser,{recursive:true});
    fs.writeFileSync(path.join(parser,'package.json'),JSON.stringify({type:'module',exports:'./index.mjs'}));
    fs.writeFileSync(path.join(parser,'index.mjs'),"export function set_fs() {} export function readFile() { throw new Error('unexpected parser call'); }");
    for(const name of ['sanitize-acled-weekly.mjs','acled-weekly-coverage.mjs','acled-weekly-window.mjs','xlsx-input-guard.mjs']) {
      const dest=path.join(fixture,'scripts/world-order',name);fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.copyFileSync(new URL(`../../scripts/world-order/${name}`,import.meta.url),dest);
    }
    const {buildPayload}=await import(pathToFileURL(path.join(fixture,'scripts/world-order/sanitize-acled-weekly.mjs')));
    const input=aggregates().map(a=>({...a,weekRange:[week(-13),a.weekRange[1]],rowCount:a.rows.length}));
    const before=structuredClone(input), result=buildPayload(input,input.map(a=>({region:a.region,filename:`${a.region}.xlsx`})));
    assert.deepEqual(input,before);
    assert.equal(result.latestWeek,week(-2));
    assert.equal(result.global.eventsLast4Weeks,240);
    assert.equal(result.global.eventsLast12Weeks,720);
    assert.equal(result.global.eventsDelta4Vs12,0);
    assert.ok(result.regionalLast4Weeks.every(a=>a.events===40));
    assert.equal(result.hotZonesLast4Weeks.reduce((s,z)=>s+z.events,0),240);
    assert.equal(result.filesIngested[0].weekRange[1],week(0));
    assert.equal(weeklyWindowProblem(result),null);
    const malformed=structuredClone(result);malformed.quality.weeklyWindow.weeks12[0]=week(0);
    assert.match(weeklyWindowProblem(malformed),/non-contiguous/);
    for (const regions of [null,'Africa',42,{},[...ACLED_WEEKLY_REGIONS.slice(1),ACLED_WEEKLY_REGIONS[1]]]) {
      const bad=structuredClone(result);bad.quality.weeklyWindow.regions=regions;
      assert.match(weeklyWindowProblem(bad),/incomplete/);
      const guarded=applyAcledWeeklyWindowGuard({status:'ok',confidence:0.9,summary:{latestWeek:result.latestWeek}},bad);
      assert.equal(guarded.status,'partial');assert.equal(guarded.confidence,0);
      assert.equal(guarded.summary.weeklyWindowAligned,false);
    }
    const legacy=structuredClone(result);delete legacy.quality.weeklyWindow;
    const source={status:'ok',confidence:0.9,summary:{latestWeek:result.latestWeek,eventsLast4Weeks:999,fatalitiesLast4Weeks:999,eventsDelta4Vs12:1},evidence:[{source:'ACLED manual xlsx (weekly)',value:999}],warnings:[]};
    const guarded=applyAcledWeeklyWindowGuard(source,legacy);
    assert.equal(guarded.status,'partial');assert.equal(guarded.summary.eventsLast4Weeks,null);
    assert.equal(guarded.summary.reportedLatestWeek,result.latestWeek);assert.equal(guarded.summary.sourceFreshness,'expired');
    assert.equal(guarded.evidence.length,0);
    const scored=scoreWorldOrderStress({externalSources:{acled:guarded,gdelt:{status:'error'},ofac:{status:'error'},sipri:{status:'error'}},marketConfirmation:{score:0,evidence:[]},dataPayload:{modules:{}},rules:{}});
    assert.equal(scored.dimensions.peaceDividendRetreat.evidence[1].value,0);
    assert.equal(source.summary.eventsLast4Weeks,999);
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
});
