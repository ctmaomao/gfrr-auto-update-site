import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDnav } from '../../tools/oil-directional/replay-eia-dnav-weekly.mjs';

const target='2026-11-20',cutoff='2026-11-26',id='WDIUPUS2';
const day=86400000, ms=Date.parse(target);
const date=value=>new Date(value).toISOString().slice(0,10);
function fixture() {
 const weeks=[...Array.from({length:5},(_,i)=>{
   const candidate=Date.parse((2021+i)+'-11-19');
   return [date(candidate+((5-new Date(candidate).getUTCDay()+7)%7)*day),String(1000+i)];
 }),...Array.from({length:14},(_,i)=>[date(ms-(13-i)*7*day),i===13?'3,917':String(3000+i)])];
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
