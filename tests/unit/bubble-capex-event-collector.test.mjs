import test from'node:test';import assert from'node:assert/strict';
import fs from'node:fs';import os from'node:os';import path from'node:path';import {fileURLToPath}from'node:url';import {spawnSync}from'node:child_process';
import {CAPEX_COMPANIES,collectCapexEventPanel,secRows,selectQuarterReports,earningsExhibit,parseRelease,compareGuidance,matchedPrices}from'../../scripts/bubble-watch/capex-event-collector.mjs';
import {cashEventWindow}from'../../scripts/bubble-watch/capex-event-session.mjs';
const today='2026-10-16',now=()=>Date.parse('2026-10-16T02:00:00Z');
function submissions(symbol){const cik=CAPEX_COMPANIES[symbol];const rows=[
 ['0001193125-26-999001','2026-07-31','2026-06-30','2026-07-31T16:00:00.000Z',symbol==='MSFT'?'10-K':'10-Q','','report.htm'],
 ['0001193125-26-999002','2026-07-29','2026-07-29','2026-07-29T20:10:00.000Z','8-K','2.02,9.01','eight.htm'],
 ['0001193125-26-999003','2026-04-30','2026-03-31','2026-04-30T16:00:00.000Z','10-Q','','report.htm'],
 ['0001193125-26-999004','2026-04-29','2026-04-29','2026-04-29T20:10:00.000Z','8-K','2.02,9.01','eight.htm'],
 ['0001193125-25-999005','2025-01-02','','2025-01-02T16:00:00.000Z','4','','old.htm']];
 const keys=['accessionNumber','filingDate','reportDate','acceptanceDateTime','form','items','primaryDocument'];return {cik:Number(cik),tickers:[symbol],fiscalYearEnd:symbol==='MSFT'?'0630':'1231',filings:{recent:Object.fromEntries(keys.map((k,i)=>[k,rows.map(r=>r[i])])),files:[]}};}
function transport(options={}){
 const calls=[];
 const fetchFn=async(url,opts)=>{
  calls.push(url);assert.equal(opts.redirect,'error');assert.ok(opts.signal);
  const host=new URL(url).hostname;
  if(options.blockHost===host)return new Response('',{status:403});
  if(host==='data.sec.gov'){
   const cik=url.match(/CIK(\d{10})/u)?.[1],symbol=Object.keys(CAPEX_COMPANIES).find(s=>CAPEX_COMPANIES[s]===cik),data=submissions(symbol);
   if(options.wrongIdentity)data.cik=1;
   if(options.truncated)for(const a of Object.values(data.filings.recent))a.pop();
   if(options.duplicate)data.filings.recent.accessionNumber[1]=data.filings.recent.accessionNumber[0];
   return Response.json(data);
  }
  if(host==='www.sec.gov'){
   if(url.endsWith('-index.html'))return new Response(`<table summary="Document Format Files"><tr><td>1</td><td>Release</td><td><a href="${options.foreignAttachment?'/Archives/edgar/data/1/000119312526999002/ex991.htm':'ex991.htm'}">ex991.htm</a></td><td>EX-99.1</td></tr></table>`,{headers:{'content-type':'text/html'}});
   const previous=url.includes('999004'),date=previous?'2026-04-29':'2026-07-29',period=previous?'March 31, 2026':'June 30, 2026';
   const html=`<h1>Quarterly Earnings Results</h1><p>Quarter ended ${period}</p>${options.noClock?'':`<meta property="article:published_time" content="${date}T20:05:00Z">`}<p>We expect calendar year 2026 capital expenditures including principal payments on finance leases of $${previous?'125-145':'130-145'} billion.</p>`;
   return new Response(html,{headers:{'content-type':'text/html'}});
  }
  assert.equal(host,'query1.finance.yahoo.com');const symbol=new URL(url).pathname.split('/').at(-1);
  return Response.json({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York',dataGranularity:'1d',instrumentType:symbol==='QQQ'?'ETF':'EQUITY'},timestamp:['2026-07-29','2026-07-30'].map(d=>Date.parse(d+'T13:30:00Z')/1000),indicators:{quote:[{close:[100,110],volume:[1000,1000]}],adjclose:[{adjclose:[100,symbol==='QQQ'?105:110]}]}}]}});
 };
 return {calls,fetchFn};
}
test('diagnostic defaults offline and never claims scoring or production readiness',async()=>{
 const r=await collectCapexEventPanel({today,now,fetchFn:()=>{throw Error('network forbidden');}});
 assert.equal(r.budget.actualRequests,0);assert.equal(r.companies.length,4);assert.equal(r.scoringEligible,false);assert.equal(r.productionEligible,false);
 assert.ok(r.companies.every(c=>c.status==='not_requested'&&c.gaps.includes('network_not_enabled')));
});
test('actual collector joins SEC quarter identities, original clocks and matched adjusted prices',async()=>{
 const t=transport(),r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn,sleep:async()=>{}});
 assert.equal(t.calls.length,28);assert.deepEqual(r.sourceFailures,[]);
 for(const c of r.companies){assert.equal(c.secFilingEnumerationComplete,true);assert.equal(c.latestSecReportConfirmed,true);assert.equal(c.reports[0].reportPeriod,'2026-06-30');assert.equal(c.reports[1].reportPeriod,'2026-03-31');assert.equal(c.guidanceComparison.status,'raised');assert.equal(c.releaseWindow.afterDate,'2026-07-30');assert.ok(Math.abs(c.prices.excessReturnPp-5)<1e-10);assert.ok(c.gaps.includes('guidance_first_disclosure_not_verified'));assert.equal(c.productionEligible,false);assert.equal(c.scoringEligible,false);assert.equal(c.reports[0].guidanceDiscoveryComplete,false);assert.ok(!JSON.stringify(c).includes('We expect'));}
});
test('host circuit avoids repeated SEC 403 requests across companies and child stages',async()=>{
 for(const host of ['data.sec.gov','www.sec.gov']){
  const t=transport({blockHost:host}),r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn,sleep:async()=>{}});
  assert.equal(t.calls.filter(u=>new URL(u).hostname===host).length,1);assert.equal(r.sourceFailures.length,1);assert.equal(r.sourceFailures[0].reason,'http_403');assert.equal(t.calls.length,host==='data.sec.gov'?1:5);assert.ok(r.companies.slice(1).every(c=>c.gaps.includes('source_host_circuit_not_requested')));
 }
});
test('coverage truncation, foreign identity and duplicate filings cannot claim latest evidence',async()=>{
 for(const options of [{truncated:true},{wrongIdentity:true},{duplicate:true}]){
  const t=transport(options),r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn,sleep:async()=>{}});
  assert.equal(t.calls.length,4);assert.ok(r.companies.every(c=>!c.secFilingEnumerationComplete&&!c.latestSecReportConfirmed));
 }
});
test('missing original clock never substitutes SEC acceptance or requests event prices',async()=>{
 const t=transport({noClock:true}),r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn,sleep:async()=>{}});
 assert.ok(r.companies.every(c=>c.gaps.includes('original_publication_time_missing')&&c.prices===null));assert.ok(!t.calls.some(u=>u.includes('yahoo')));
});
test('foreign archive attachment is never followed',async()=>{
 const t=transport({foreignAttachment:true}),r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:t.fetchFn,sleep:async()=>{}});
 assert.ok(r.companies.every(c=>c.gaps.includes('source_material_unusable')));assert.ok(!t.calls.some(u=>u.includes('/data/1/')));
});
test('source body caps, unsafe types, invalid JSON and timeouts are isolated and redacted',async()=>{
 for(const response of [()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'3145729'}}),()=>new Response('private',{headers:{'content-type':'text/html'}}),()=>new Response('{private',{headers:{'content-type':'application/json'}}),()=>{throw Object.assign(Error('private_key_must_not_echo'),{name:'AbortError'});}]){
  const r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn:async()=>response(),sleep:async()=>{}});assert.equal(r.sourceFailures.length,4);assert.ok(!JSON.stringify(r).includes('private'));
 }
});
test('quarter and exhibit selection refuses amendments, missing linkage and ambiguous attachments',()=>{
 const rows=secRows(submissions('MSFT').filings.recent,today);assert.equal(selectQuarterReports(rows,today)[0].earnings.accessionNumber,'0001193125-26-999002');
 assert.throws(()=>selectQuarterReports([...rows,{...rows[0],form:'10-K/A'}],today),/latest_report_amended/u);
 assert.throws(()=>selectQuarterReports(rows.filter(r=>r.form!=='8-K'),today),/earnings_8k_not_identified/u);
 assert.throws(()=>earningsExhibit('<table summary="Document Format Files"><tr><td>EX-99.1</td><td><a href="a.htm">a</a><a href="b.htm">b</a></td></tr></table>'),/ambiguous/u);
});
test('guidance comparisons retain range endpoints, period and lease scope',()=>{
 const g={year:2026,periodBasis:'calendar',currency:'USD',unit:'billion',lower:125,upper:145,leaseBasis:'includes_finance_lease_principal',basisChange:false};
 assert.equal(compareGuidance(g,{...g,lower:130}).status,'raised');assert.equal(compareGuidance(g,{...g,lower:130,upper:140}).status,'lowered_or_mixed');
 for(const patch of [{year:2027},{periodBasis:'fiscal'},{leaseBasis:'not_explicit'},{basisChange:true}])assert.equal(compareGuidance(g,{...g,...patch}).status,'unavailable');
 const p=parseRelease('<h1>Quarter earnings results</h1><p>Quarter ended June 30, 2026</p><p>We expect 2026 capital expenditures including finance leases in the range of $130–145 billion.</p>','2026-06-30',today,{fiscalYearEnd:'1231'});assert.equal(p.guidance.lower,130);assert.equal(p.guidance.upper,145);
});
test('first full session respects Nasdaq holidays, DST, intraday and early-close holds',()=>{
 assert.deepEqual([cashEventWindow('2026-07-02T20:05:00Z','2026-07-08T12:00:00Z').beforeDate,cashEventWindow('2026-07-02T20:05:00Z','2026-07-08T12:00:00Z').afterDate],['2026-07-02','2026-07-06']);
 assert.equal(cashEventWindow('2026-03-09T12:00:00Z','2026-03-11T12:00:00Z').afterDate,'2026-03-09');
 for(const time of ['2026-07-29T17:00:00Z','2026-11-25T21:05:00Z','2026-02-30T20:00:00Z','2026-07-29T24:00:00Z','2027-01-04T21:05:00Z'])assert.throws(()=>cashEventWindow(time,'2027-02-01T00:00:00Z'));
});

test('capex amount cannot come from adjacent revenue guidance or ambiguous metrics',()=>{
 const wrap=p=>`<h1>Quarterly earnings results</h1><p>Quarter ended June 30, 2026</p><p>${p}</p>`;
 for(const p of [
 'For calendar year 2026, capital expenditures including principal payments on finance leases are expected to increase. Revenue guidance is $150 billion.',
 'For calendar year 2026, we expect capital expenditures including finance leases to increase and revenue of $150 billion.',
 'We expect revenue of $150 billion alongside calendar year 2026 capital expenditures including finance leases.'
 ])assert.equal(parseRelease(wrap(p),'2026-06-30',today).guidance,null);
});
test('exhausted cumulative byte budget prevents every subsequent request',async()=>{
 const t=transport();let calls=0;
 const fetchFn=async(...args)=>{calls++;const r=await t.fetchFn(...args),text=await r.text();return new Response(text+' '.repeat(2621440-text.length),{headers:{'content-type':r.headers.get('content-type')}});};
 const r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn,sleep:async()=>{}});
 assert.equal(calls,8);assert.equal(r.budget.totalBudgetExhausted,true);assert.ok(r.budget.totalBytes>r.budget.totalMaxBytes);
 assert.ok(r.companies.slice(2).every(c=>c.gaps.includes('total_byte_budget_not_requested')));
});
test('all declared intersecting historical partitions are read, without invented day-gap continuity',async()=>{
 const t=transport(),parts=new Map();
 const fetchFn=async(url,opts)=>{
  if(!url.includes('data.sec.gov'))return t.fetchFn(url,opts);
  if(parts.has(url))return Response.json(parts.get(url));
  const r=await t.fetchFn(url,opts),d=await r.json(),recent=d.filings.recent;
  const first=Object.fromEntries(Object.entries(recent).map(([k,a])=>[k,a.slice(2,4)]));
  const second=Object.fromEntries(Object.entries(recent).map(([k,a])=>[k,a.slice(4)]));
  d.filings.recent=Object.fromEntries(Object.entries(recent).map(([k,a])=>[k,a.slice(0,2)]));
  d.filings.files=[{name:`CIK${String(d.cik).padStart(10,'0')}-submissions-001.json`,filingFrom:'2026-04-29',filingTo:'2026-04-30',filingCount:2},{name:`CIK${String(d.cik).padStart(10,'0')}-submissions-002.json`,filingFrom:'2025-01-02',filingTo:'2025-12-31',filingCount:2}];
  for(const [i,part]of [[0,first],[1,second]]){
   if(i===1)for(const [k,a]of Object.entries(part))a.push(k==='accessionNumber'?'0001193125-25-999006':k==='filingDate'?'2025-12-31':k==='form'?'4':k==='acceptanceDateTime'?'2025-12-31T16:00:00Z':k==='primaryDocument'?'old.htm':'');
   parts.set(`https://data.sec.gov/submissions/${d.filings.files[i].name}`,part);
  }
  return Response.json(d);
 };
 const r=await collectCapexEventPanel({allowNetwork:true,today,now,fetchFn,sleep:async()=>{}});
 assert.equal(r.budget.actualRequests,36);assert.ok(r.companies.every(c=>c.secFilingEnumerationComplete&&c.coverage.segments.length===3&&c.coverage.allDeclaredRequiredShardsRead));
});
test('new earnings filing after last quarterly report cannot silently select an older event',()=>{
 const rows=secRows(submissions('MSFT').filings.recent,today);
 assert.throws(()=>selectQuarterReports([...rows,{...rows[1],accessionNumber:'0001193125-26-999007',filingDate:'2026-10-15'}],today),/newer_unmatched_earnings_filing/u);
});

test('lease additions cannot masquerade as finance lease principal payments',()=>{
 const parse=lease=>parseRelease(`<h1>Quarter earnings results</h1><p>Quarter ended June 30, 2026</p><p>We expect calendar year 2026 capital expenditures including ${lease} of $130-145 billion.</p>`,'2026-06-30',today).guidance;
 const principal=parse('principal payments on finance leases');
 assert.equal(principal.leaseBasis,'includes_finance_lease_principal');
 for(const lease of ['finance leases','finance lease additions','finance leases and principal payments']){
  const g=parse(lease);assert.equal(g.leaseBasis,'not_explicit');assert.equal(compareGuidance(g,principal).status,'unavailable');
 }
});

test('manual workflow retains read-only main scope and uploads only derived panel',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/inspect-bubble-capex-events.yml',import.meta.url),'utf8');
 assert.match(workflow,/on:\s+workflow_dispatch:/u);assert.match(workflow,/contents: read/u);assert.match(workflow,/github.ref == 'refs\/heads\/main'/u);
 assert.match(workflow,/persist-credentials: false/u);assert.match(workflow,/node scripts\/collect-bubble-capex-events.mjs --allow-network --write/u);
 assert.match(workflow,/path: manual-artifacts\/bubble-capex-event-panel-latest.json/u);
 assert.doesNotMatch(workflow,/schedule:|push:|pull_request:|secrets\.|contents: write|id-token:|deepseek|build-bubble-watch|git push/iu);
 assert.equal((workflow.match(/uses: actions\/upload-artifact/gu)||[]).length,1);
});
test('CLI defaults to zero network and zero filesystem writes; unknown options fail safely',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-capex-cli-'));
 try{
  const script=fileURLToPath(new URL('../../scripts/collect-bubble-capex-events.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{cwd:directory,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const summary=JSON.parse(result.stdout);assert.equal(summary.requests,0);assert.equal(summary.networkEnabled,false);
  assert.deepEqual(fs.readdirSync(directory),[]);
  const bad=spawnSync(process.execPath,[script,'--private-test-secret'],{cwd:directory,encoding:'utf8'});
  assert.equal(bad.status,1);assert.ok(!bad.stderr.includes('private-test-secret'));assert.deepEqual(fs.readdirSync(directory),[]);
 }finally{fs.rmdirSync(directory);}
});
