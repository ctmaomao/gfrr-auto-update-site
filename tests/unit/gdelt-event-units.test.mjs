import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fetchGdeltCloudSummary,parseGdeltCountryBuckets} from '../../scripts/world-order/fetch-gdelt-cloud.mjs';
import {renderLegacyOilEventNewsLayer} from '../../scripts/modules/renderOilDirectional.js';

test('live, legacy fresh/stale cache and fallback retain event units without inventing article totals',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-event-units-'));
  const originalFetch=globalThis.fetch, originalKey=process.env.GDELT_CLOUD_API_KEY;
  try {
    process.env.GDELT_CLOUD_API_KEY='test-only-not-a-real-key';
    let calls=0;
    globalThis.fetch=async()=>{calls++;return Response.json({success:true,data:[{key:'Iran',event_count:2,article_count:100},{key:'Russia',event_count:5,article_count:50}]});};
    const cachePath=path.join(directory,'cache.json');
    const live=await fetchGdeltCloudSummary({config:{cachePath}});
    assert.equal(live.status,'ok');assert.equal(calls,1);
    assert.equal(live.summary.totalEvents,7);assert.equal(live.summary.totalArticles,null);
    assert.equal(live.summary.queriesRun[0].eventCount,7);assert.equal(live.summary.queriesRun[0].articleCount,null);
    assert.equal(live.cacheArtifact.summary.totalArticles,null);
    const cache=structuredClone(live.cacheArtifact);cache.summary.totalArticles=7; // Legacy bug, not a verified article count.
    fs.writeFileSync(cachePath,JSON.stringify(cache));
    const fresh=await fetchGdeltCloudSummary({config:{cachePath}});
    assert.equal(calls,1);assert.equal(fresh.summary.totalArticles,null);assert.equal(fresh.cacheArtifact.summary.totalArticles,null);
    assert.equal(fresh.lastFetchedAt,live.lastFetchedAt);
    const old=new Date(Date.now()-30*3600000).toISOString();cache.generatedAt=old;cache.lastFetchedAt=old;
    fs.writeFileSync(cachePath,JSON.stringify(cache));delete process.env.GDELT_CLOUD_API_KEY;
    const stale=await fetchGdeltCloudSummary({config:{cachePath}});
    assert.equal(stale.status,'stale');assert.equal(stale.summary.totalEvents,7);assert.equal(stale.summary.totalArticles,null);
    assert.equal(stale.lastFetchedAt,old);assert.equal(stale.cacheArtifact.summary.totalArticles,null);assert.equal(calls,1);
    cache.generatedAt=live.lastFetchedAt;cache.lastFetchedAt=live.lastFetchedAt;cache.summary={...cache.summary,totalEvents:0,conflictEvents:0,regionsCovered:[],topCountries:[]};
    fs.writeFileSync(cachePath,JSON.stringify(cache));
    const zero=await fetchGdeltCloudSummary({config:{cachePath}});
    assert.equal(zero.status,'ok');assert.equal(zero.summary.totalEvents,0);assert.equal(calls,1);
    process.env.GDELT_CLOUD_API_KEY='test-only-not-a-real-key';
    globalThis.fetch=async()=>{calls++;return Response.json({success:true,data:[{key:'Canada',article_count:5}]});};
    const previous={...live,summary:{...live.summary,totalArticles:7}};
    const before=structuredClone(previous);
    const fallback=await fetchGdeltCloudSummary({config:{cachePath:path.join(directory,'missing.json')},previousSource:previous});
    assert.equal(fallback.status,'stale');assert.equal(fallback.summary.totalArticles,null);
    assert.equal(fallback.summary.totalEvents,7);assert.deepEqual(previous,before);assert.equal(calls,2);
    assert.match(fallback.summary.errors.join(' '),/event_count/);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.GDELT_CLOUD_API_KEY;else process.env.GDELT_CLOUD_API_KEY=originalKey;
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('country event parser rejects missing/malformed counts, accepts explicit zero and empty response',()=>{
  for(const data of [undefined,null,{},''])assert.throws(()=>parseGdeltCountryBuckets({data}),/must be an array/);
  for(const event_count of [undefined,null,'',false,-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>parseGdeltCountryBuckets({data:[{key:'Canada',event_count,article_count:5}]}),/event_count/);
  assert.deepEqual(parseGdeltCountryBuckets({data:[]}),[]);
  for(const event_count of [0,'0',5,'5'])assert.equal(parseGdeltCountryBuckets({data:[{key:'Canada',event_count}]} )[0].event_count,Number(event_count));
});

test('real World Order validator accepts the explicit unit migration and rejects unqualified nulls',()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-event-validator-'));
  try {
    fs.mkdirSync(path.join(fixture,'scripts'),{recursive:true});
    fs.mkdirSync(path.join(fixture,'scripts/lib'));fs.copyFileSync(new URL('../../scripts/lib/check-script-helpers.mjs',import.meta.url),path.join(fixture,'scripts/lib/check-script-helpers.mjs'));
    for(const name of ['check-world-order-stress.mjs','check-world-order-stress-review.mjs','review-world-order-stress.mjs'])fs.copyFileSync(new URL(`../../scripts/${name}`,import.meta.url),path.join(fixture,'scripts',name));
    fs.cpSync(new URL('../../scripts/world-order',import.meta.url),path.join(fixture,'scripts/world-order'),{recursive:true});
    fs.mkdirSync(path.join(fixture,'config'));fs.copyFileSync(new URL('../../config/gdelt-score-calibration.json',import.meta.url),path.join(fixture,'config/gdelt-score-calibration.json'));
    fs.mkdirSync(path.join(fixture,'data'));
    fs.copyFileSync(new URL('../../data/radar-data.json',import.meta.url),path.join(fixture,'data/radar-data.json'));
    fs.copyFileSync(new URL('../../config/world-order-rules.json',import.meta.url),path.join(fixture,'config/world-order-rules.json'));
    fs.copyFileSync(new URL('../../package.json',import.meta.url),path.join(fixture,'package.json'));
    fs.mkdirSync(path.join(fixture,'docs'));
    for(const name of ['DATA_CONTRACT.md','DATA_SOURCES.md','OPERATIONS.md','PROJECT_BACKLOG.md'])fs.copyFileSync(new URL(`../../docs/${name}`,import.meta.url),path.join(fixture,'docs',name));
    const dest=path.join(fixture,'data/world-order-stress.json');
    const run=payload=>{fs.writeFileSync(dest,JSON.stringify(payload));return spawnSync(process.execPath,[path.join(fixture,'scripts/check-world-order-stress.mjs')],{cwd:fixture,encoding:'utf8',timeout:10000});};
    const legacy=JSON.parse(fs.readFileSync(new URL('../../data/world-order-stress.json',import.meta.url)));
    // Pin the legacy quantity contract even after production migrates to event units.
    delete legacy.externalSources.gdelt.summary.countUnit;
    legacy.externalSources.gdelt.summary.totalArticles=7;
    legacy.externalSources.gdelt.summary.queriesRun=[{label:'legacy fixture',status:'ok',articleCount:7,error:null}];
    const legacyResult=run(legacy);assert.equal(legacyResult.status,0,legacyResult.stderr);
    const current=structuredClone(legacy),s=current.externalSources.gdelt.summary;
    s.countUnit='country_event_aggregate';s.totalArticles=null;s.totalEvents=7;s.articleCountReasonZh='事件不是报道。';
    s.queriesRun=[{label:'fixture',status:'ok',eventCount:7,articleCount:null,error:null}];
    const result=run(current);assert.equal(result.status,0,result.stderr);
    for(const change of [p=>delete p.externalSources.gdelt.summary.countUnit,p=>p.externalSources.gdelt.summary.totalArticles=7,p=>p.externalSources.gdelt.summary.queriesRun[0].articleCount=7,p=>delete p.externalSources.gdelt.summary.queriesRun[0].eventCount,p=>p.externalSources.gdelt.summary.queriesRun[0].eventCount=-1,p=>p.externalSources.gdelt.summary.queriesRun[0].eventCount=null]) {
      const bad=structuredClone(current);change(bad);assert.equal(run(bad).status,1);
    }
  } finally {fs.rmSync(fixture,{recursive:true,force:true});}
});

test('actual legacy renderer separates events, unknown article totals and genuine zero',()=>{
  const previous=globalThis.document,nodes=new Map();
  globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',className:'',classList:{add(){},remove(){}}});return nodes.get(id);}};
  try {
    for(const totalEvents of [7,0,null,-1]) {
      renderLegacyOilEventNewsLayer({externalSources:{gdelt:{status:'ok',summary:{totalEvents,conflictEvents:totalEvents,totalArticles:999}}}});
      const text=nodes.get('odp-news-event-window').textContent;
      assert.match(text,/去重报道数未知/);assert.doesNotMatch(text,/999|条报道代理/);
      if(totalEvents===null||totalEvents<0) {
        assert.match(text,/事件数未知/);assert.equal(nodes.get('odp-news-event-status').textContent,'事件计数缺失');
      } else {
        assert.ok(text.includes(`${totalEvents} 起事件`));
        if(totalEvents===0)assert.equal(nodes.get('odp-news-event-status').textContent,'事件计数不完整');
      }
    }
    renderLegacyOilEventNewsLayer({externalSources:{gdelt:{status:'ok',summary:{totalEvents:0,conflictEvents:0,sanctionsEvents:0,blockadeOrChokepointEvents:0}}}});
    assert.equal(nodes.get('odp-news-event-status').textContent,'未见事件压力');
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
