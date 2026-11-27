import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDnav, probeDnavCohort, projectDnavCohort, replayDnavCohort } from '../../tools/oil-directional/replay-eia-dnav-weekly.mjs';

const target='2026-11-20',cutoff='2026-11-26',id='WDIUPUS2';
const day=86400000, ms=Date.parse(target);
const date=value=>new Date(value).toISOString().slice(0,10);
function fixture(utilization = false) {
 const weeks=[...Array.from({length:5},(_,i)=>{
   const candidate=Date.parse((2021+i)+'-11-19');
   return [date(candidate+((5-new Date(candidate).getUTCDay()+7)%7)*day),utilization ? String(80+i) : String(1000+i)];
 }),...Array.from({length:14},(_,i)=>[date(ms-(13-i)*7*day),utilization ? (i===13?'97.5':String(84+i)) : (i===13?'3,917':String(3000+i))])];
 const months=new Map();
 for(const [d,v] of weeks){
  const key=d.slice(0,4)+'-'+new Date(d).toLocaleString('en',{month:'short',timeZone:'UTC'});
  if(!months.has(key))months.set(key,[]);
  months.get(key).push(d.slice(5).replace('-','/'),v);
 }
 const rows=[...months].map(([k,v])=>'<tr><td>'+k+'</td>'+[...v,...Array(10-v.length).fill('')].map(x=>'<td>'+x+'&nbsp;</td>').join('')+'</tr>').join('');
 return "<title>Weekly U.S. Product Supplied of Distillate Fuel Oil (Thousand Barrels per Day)</title><a href='../hist_xls/WDIUPUS2w.xls'>XLS</a><table class='FloatTitle'><tr><th>Year-Month</th><th>End Date</th></tr>"+rows+"</table><td>Release Date: 11/25/2026</td>";
}
const h=fixture();
test('weekly replay preserves the terminal week, three lags and the five-year references',()=>{
 const a=inspectDnav(h,id,target,cutoff);
 assert.equal(a.releaseDate,'2026-11-25');assert.equal(a.latest,3917);
 assert.equal(a.valuePrior,3012);assert.equal(a.change4w,908);assert.equal(a.change13w,917);
 assert.equal(a.seasonalReferences.length,5);assert.equal(a.points,19);
});
for(const [name,html,series,day,known,reason] of [
 ['wrong series',h,'WCRRIUS2',target,cutoff,/identity/],
 ['wrong unit',h.replace('Thousand Barrels per Day','Barrels per Day'),id,target,cutoff,/identity/],
 ['alternate frequency',h.replace('FloatTitle','AnotherTable'),id,target,cutoff,/table/],
 ['release not yet visible',h,id,target,'2026-11-24',/release/],
 ['older fallback',h,id,'2026-11-27','2026-12-03',/release|target/],
 ['future row',h,id,'2026-11-13',cutoff,/after target/],
 ['invalid date',h.replace('11/20','11/31'),id,target,cutoff,/calendar/],
 ['duplicate period',h.replace('11/20','11/13'),id,target,cutoff,/duplicate/],
 ['suppressed value',h.replace('3012','W'),id,target,cutoff,/incomplete/],
 ['bad numeric',h.replace('3,917','3,91'),id,target,cutoff,/malformed/],
 ['insufficient seasonal reference',h.replace('1000','W'),id,target,cutoff,/five-year/],
]){
 test('refuses '+name,()=>assert.throws(()=>inspectDnav(html,series,day,known),reason));
}

const cohortTitles = {
 WCESTUS1:'Weekly U.S. Ending Stocks excluding SPR of Crude Oil (Thousand Barrels)',
 WCSSTUS1:'Weekly U.S. Ending Stocks of Crude Oil in SPR (Thousand Barrels)',
 WDISTUS1:'Weekly U.S. Ending Stocks of Distillate Fuel Oil (Thousand Barrels)',
 WGTSTUS1:'Weekly U.S. Ending Stocks of Total Gasoline (Thousand Barrels)',
 WGFUPUS2:'Weekly U.S. Product Supplied of Finished Motor Gasoline (Thousand Barrels per Day)',
 WPULEUS3:'Weekly U.S. Percent Utilization of Refinery Operable Capacity (Percent)',
 WCRRIUS2:'Weekly U.S. Refiner Net Input of Crude Oil (Thousand Barrels per Day)',
 WDIUPUS2:'Weekly U.S. Product Supplied of Distillate Fuel Oil (Thousand Barrels per Day)',
};
const readFixture = key => Buffer.from(fixture(key==='WPULEUS3')
 .replace(/<title>[^<]+/, '<title>'+cohortTitles[key]).replace('WDIUPUS2w.xls',key+'w.xls'));
const release='2026-11-25';

test('one cohort returns exactly eight pinned sources with fingerprints',()=>{
 const group=replayDnavCohort(readFixture,target,release,cutoff);
 assert.equal(group.targetDay,target);
 assert.equal(group.releaseDate,release);
 assert.deepEqual(group.series.map(x=>x.id).sort(),Object.keys(cohortTitles).sort());
 assert.ok(group.series.every(x=>x.releaseDate===release && /^[a-f0-9]{64}$/.test(x.sha256)));
});
test('individually valid alternate release day cannot complete a cohort',()=>{
 assert.throws(()=>replayDnavCohort(key=>key===id
  ? Buffer.from(h.replace('11/25/2026','11/26/2026')) : readFixture(key),target,release,cutoff),/pinned release/);
});
test('one missing terminal value cannot produce a partial cohort',()=>{
 assert.throws(()=>replayDnavCohort(key=>key===id
  ? Buffer.from(h.replace('3,917','W')) : readFixture(key),target,release,cutoff),/incomplete/);
});
test('rejects a future pinned day before requesting any snapshot',()=>{
 assert.throws(()=>replayDnavCohort(()=>assert.fail('read before release'),target,'2026-11-27',cutoff),/outside replay/);
});

test('projection keys independent numeric series by ID, not response position',()=>{
 const group=projectDnavCohort(readFixture,target,release,cutoff);
 assert.equal(group.sourceFormat,'eia-dnav-html');
 assert.deepEqual(Object.keys(group.byId).sort(),Object.keys(cohortTitles).sort());
 const utilization=group.byId.WPULEUS3;
 assert.deepEqual(utilization.observations.at(-1),{period:target,value:97.5});
 assert.deepEqual(group.byId.WCRRIUS2.observations.at(-1),{period:target,value:3917});
 assert.equal(utilization.releaseDate,release);
 assert.equal(new URL(utilization.sourceUrl).searchParams.get('s'),'WPULEUS3');
 assert.equal(utilization.sha256,replayDnavCohort(readFixture,target,release,cutoff).series.find(x=>x.id==='WPULEUS3').sha256);
 assert.equal(utilization.observations.length,19);
 assert.ok(utilization.observations.every((x,i,a)=>!i||a[i-1].period<x.period));
});
test('projection cannot return observations from a partial or wrong-ID cohort',()=>{
 assert.throws(()=>projectDnavCohort(key=>readFixture(key===id?'WCRRIUS2':key),target,release,cutoff),/identity/);
 assert.throws(()=>projectDnavCohort(key=>key===id
  ? Buffer.from(h.replace('3012','W')) : readFixture(key),target,release,cutoff),/incomplete/);
});

const scheduled='2026-11-25T15:30:00.000Z';
const afterRelease=Date.parse(scheduled)+1;
const htmlHeaders={'content-type':'text/html; charset=utf-8'};
test('probe makes one request per fixed EIA ID and emits a complete pinned receipt',async()=>{
 const ids=[];
 const fetchImpl=async (address,{signal,redirect})=>{
  const url=new URL(address), key=url.searchParams.get('s');
  assert.equal(url.origin,'https://www.eia.gov');
  assert.equal(url.searchParams.get('f'),'W');
  assert.equal(redirect,'error');
  assert.ok(signal instanceof AbortSignal);
  ids.push(key);
  return new Response(readFixture(key),{headers:htmlHeaders});
 };
 const result=await probeDnavCohort(target,scheduled,{now:afterRelease,fetchImpl});
 assert.deepEqual(ids.sort(),Object.keys(cohortTitles).sort());
 assert.deepEqual(result,replayDnavCohort(readFixture,target,release,cutoff));
});
test('probe does not request data before the pinned release or with an invalid target',async()=>{
 const fetchImpl=()=>assert.fail('early request');
 await assert.rejects(probeDnavCohort(target,scheduled,{now:afterRelease-2,fetchImpl}),/release window/);
 await assert.rejects(probeDnavCohort('2026-11-19',scheduled,{now:afterRelease,fetchImpl}),/release window/);
});
test('probe rejects errors, excessive actual body bytes and wrong-period HTML as whole cohorts',async()=>{
 for(const [bad,reason] of [
  [()=>new Response('retry later',{status:503,headers:htmlHeaders}),/unexpected/],
  [()=>new Response(new Uint8Array(512*1024+1),{headers:htmlHeaders}),/too large/],
  [()=>new Response(h.replace('11/25/2026','11/26/2026'),{headers:htmlHeaders}),/release/],
 ]){
  await assert.rejects(probeDnavCohort(target,scheduled,{now:afterRelease,fetchImpl:async address=>{
   const key=new URL(address).searchParams.get('s');
   return key===id ? bad() : new Response(readFixture(key),{headers:htmlHeaders});
  }}),reason);
 }
});
