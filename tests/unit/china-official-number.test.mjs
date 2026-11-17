import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs',import.meta.url),'utf8');
function extract(text,name) {const start=text.indexOf(`function ${name}(`);assert.ok(start>=0);return (text.slice(start-6,start)==='async '?'async ':'')+text.slice(start,text.indexOf('\n}',start)+2);}
const names=['parseChinaOfficialNumber','normalizePreviousChinaBondYield','normalizePreviousCfetsRmb','buildMissingChinaBond','buildMissingCfetsRmb','buildMissingChinaInflationLeaf','buildMissingChinaInflation','buildMissingChinaPmiLeaf','buildMissingChinaPmi','resolveChinaBond','resolveCfetsRmb','pickLatestChinaBondRow','pickLatestCfetsRecord'];
function harness(payload=null,fresh=true) {
  return vm.runInNewContext(names.map(n=>extract(source,n)).join('\n')+`\n({${names.join(',')}})`,{
    CHINA_BOND_SOURCE:'ChinaBond:MOF-yield-curve',CHINA_BOND_LEAF_SOURCE:'ChinaBond:MOF',CHINA_BOND_DISPLAY_NOTE:'test',CHINA_BOND_REFERER:'test',CHINA_BOND_FRESH_DAYS:7,
    CFETS_RMB_SOURCE:'ChinaMoney:CFETS-RmbIdx',CFETS_RMB_DISPLAY_NOTE:'test',CFETS_RMB_REFERER:'test',CFETS_RMB_FRESH_DAYS:14,
    CHINA_INFLATION_SOURCE:'test',CHINA_INFLATION_DISPLAY_NOTE:'test',CHINA_PMI_SOURCE:'test',CHINA_PMI_DISPLAY_NOTE:'test',MACRO_FETCH_TIMEOUT_MS:100,
    latestIsoDate:(...dates)=>dates.filter(Boolean).sort().at(-1)||null,dateOnlyIso:x=>x,dateOnlyToIso:x=>`${x}T00:00:00Z`,isFreshDateOnly:()=>fresh,
    buildChinaBondHistoryUrl:()=>'',buildCfetsRmbHistoryUrl:()=>'',officialJsonFetchOptions:()=>({}),stringifyFetchError:()=> 'offline',console:{warn:()=>{}},
    fetchJsonText:async()=>{if(payload===null)throw Error('offline');return payload;}
  });
}
const invalid=[null,undefined,'','  ','\n',true,false,[],[0],[1.63],{},NaN,Infinity,'n/a'];
test('China-only parser rejects missing/types without losing valid zero, negative or numeric strings',()=>{
  const h=harness();for(const x of invalid)assert.equal(h.parseChinaOfficialNumber(x),null);
  for(const [x,want] of [[0,0],['0',0],[-0.1,-0.1],[' 1.63 ',1.63],['104.43',104.43]])assert.equal(h.parseChinaOfficialNumber(x),want);
});
test('no-cache or missing-leaf network failures resolve missing, never throw or manufacture zero',async()=>{
  const h=harness();
  for(const previous of [null,undefined,{}, {yield10y:{}}, {yield10y:{value:null}}, {cfets:null}]){
    const bond=await h.resolveChinaBond(previous);assert.equal(bond.yield10y.value,null);assert.equal(bond.sourceStatus.yield10y,'missing');
    const cfets=await h.resolveCfetsRmb(previous);assert.equal(cfets.cfets,null);assert.equal(cfets.sourceStatus.cfets,'missing');
  }
  for(const x of invalid){
    const inflation=h.buildMissingChinaInflation({cpi:{yoy:x},ppi:{yoy:x}});assert.equal(inflation.cpi.yoy,null);assert.equal(inflation.ppi.yoy,null);assert.equal(inflation.sourceStatus.cpi,'missing');
    const pmi=h.buildMissingChinaPmi({pmi:{value:x}});assert.equal(pmi.pmi.value,null);assert.equal(pmi.sourceStatus.pmi,'missing');
  }
});
test('normal cache values, zeros and original clocks unchanged; missing optional indices remain null',async()=>{
  const h=harness();const stamp='2026-11-13T00:00:00Z';
  const cfets=await h.resolveCfetsRmb({cfets:104.43,bis:null,sdr:'',updatedAt:stamp,latestObsDate:stamp});
  assert.equal(cfets.cfets,104.43);assert.equal(cfets.bis,null);assert.equal(cfets.sdr,null);assert.equal(cfets.updatedAt,stamp);assert.equal(cfets.sourceStatus.cfets,'fallback');
  const bond=await h.resolveChinaBond({yield10y:{value:1.63,updatedAt:stamp,latestObsDate:stamp}});assert.equal(bond.yield10y.value,1.63);assert.equal(bond.updatedAt,stamp);
  const inflation=h.buildMissingChinaInflation({cpi:{yoy:0,updatedAt:stamp},ppi:{yoy:-0.01,updatedAt:stamp}});assert.equal(inflation.cpi.yoy,0);assert.equal(inflation.ppi.yoy,-0.01);assert.equal(inflation.cpi.sourceStatus,'fallback');
  assert.equal(h.buildMissingChinaPmi({pmi:{value:49.3}}).pmi.value,49.3);
});
test('actual live JSON selection rejects arrays and missing values, preserving ordinary numbers',async()=>{
  const h=harness({heList:[{workTime:'2026-11-16',tenYear:'1.63'}],records:[{showDate:'2026-11-13',cfetsIndexRate:'104.43',bisIndexRate:null,sdrIndexRate:''}]});
  const bond=await h.resolveChinaBond(null);assert.equal(bond.yield10y.value,1.63);assert.equal(bond.sourceStatus.yield10y,'live');
  const cfets=await h.resolveCfetsRmb(null);assert.equal(cfets.cfets,104.43);assert.equal(cfets.bis,null);assert.equal(cfets.sdr,null);
  const bad=harness({heList:[{workTime:'2026-11-16',tenYear:[1.63]}],records:[{showDate:'2026-11-13',cfetsIndexRate:[104.43]}]});
  assert.equal((await bad.resolveChinaBond(null)).sourceStatus.yield10y,'missing');assert.equal((await bad.resolveCfetsRmb(null)).sourceStatus.cfets,'missing');
});
test('actual CFETS and bond renderers show unavailable instead of zero or fabricated yield spread',async()=>{
  const text=fs.readFileSync(new URL('../../scripts/modules/renderMacroOverview.js',import.meta.url),'utf8');const cells={},signals=[];
  const render=vm.runInNewContext(['asNumber','renderCfetsRmbLeaf','renderChinaBondLeaf'].map(n=>extract(text,n)).join('\n')+'\n({renderCfetsRmbLeaf,renderChinaBondLeaf})',{
    setLeafText:(id,value)=>{cells[id]=value;},setObservationReaction:(_a,_b,_c,signal)=>{signals.push(signal);return null;},reactionText:(_r,t)=>t,currentValue:()=>4.3,signalFromChina10y:v=>v===null?'unavailable':'neutral',formatBps:()=>{throw Error('missing value must not derive spread');}
  });
  const h=harness();const cfets=await h.resolveCfetsRmb({cfets:null});const bond=await h.resolveChinaBond({yield10y:{value:null}});
  render.renderCfetsRmbLeaf('c2-cfets',cfets,{});render.renderChinaBondLeaf({radarData:{macroDrivers:{chinaBond:bond}}});
  assert.equal(cells['c2-cfets-number'],'—');assert.ok(cells['c2-cfets-aux'].includes('BIS — · SDR —'));assert.equal(cells['c6-china-10y-number'],'—');assert.ok(cells['c6-china-10y-aux'].endsWith('差 —'));assert.deepEqual(signals,['unavailable','unavailable']);
});

test('actual display-only aggregate survives failed China sources without previous cache',async()=>{
  const h=harness();const code=extract(source,'fetchDisplayOnlyMacroDrivers');const globals={...h};
  for(const name of code.match(/resolve\w+(?=\()/g)) if(!(name in globals))globals[name]=async()=>({unrelated:true});
  const aggregate=vm.runInNewContext(code+'\nfetchDisplayOnlyMacroDrivers',globals);
  const result=await aggregate(null);assert.equal(result.chinaBond.sourceStatus.yield10y,'missing');assert.equal(result.cfetsRmb.sourceStatus.cfets,'missing');assert.equal(result.worldEconomy.unrelated,true);
  // Also exercise the post-allSettled missing-builder branch directly.
  const rejected=vm.runInNewContext(code+'\nfetchDisplayOnlyMacroDrivers',{...globals,resolveChinaBond:async()=>{throw Error('rejected');},resolveCfetsRmb:async()=>{throw Error('rejected');}});
  assert.equal((await rejected(undefined)).chinaBond.yield10y.value,null);
});

test('latest invalid cell is filtered like existing nonnumeric cells, retaining the earlier source date',async()=>{
  const payload={heList:[{workTime:'2026-11-13',tenYear:'1.63'},{workTime:'2026-11-16',tenYear:null}],records:[{showDate:'2026-11-06',cfetsIndexRate:'104.43'},{showDate:'2026-11-13',cfetsIndexRate:' '}]};
  const h=harness(payload);const bond=await h.resolveChinaBond(null),cfets=await h.resolveCfetsRmb(null);
  assert.equal(bond.yield10y.value,1.63);assert.equal(bond.updatedAt,'2026-11-13T00:00:00Z');assert.equal(cfets.cfets,104.43);assert.equal(cfets.updatedAt,'2026-11-06T00:00:00Z');
  const stale=harness(payload,false);assert.equal((await stale.resolveChinaBond(null)).sourceStatus.yield10y,'missing');assert.equal((await stale.resolveCfetsRmb(null)).sourceStatus.cfets,'missing');
});
