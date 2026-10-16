import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GAP_REASONS, replayEvidenceScores } from '../../scripts/bubble-watch/evidence-score-contract.mjs';
import {FED_MEETINGS,FED_CALENDAR_URL,fedQuotePlan,fedFutureSymbol,qualifyFedMarketPath} from '../../scripts/bubble-watch/qualified-fed-path.mjs';
import {FED_PATH_LABELS,FED_THRESHOLD_TEXT} from '../../scripts/bubble-watch/qualified-fed-publication.mjs';
import {capexEventEvidenceHold} from '../../scripts/bubble-watch/capex-event-evidence.mjs';
import {collectQuarterlyCapexPanel} from '../../scripts/bubble-watch/capex-quarterly-panel.mjs';
import {quarterlyCapexHold,QUARTERLY_CAPEX_LABELS,QUARTERLY_CAPEX_SOURCE,QUARTERLY_CAPEX_THRESHOLD} from '../../scripts/bubble-watch/capex-quarterly-publication.mjs';
import {transport as quarterlyTransport} from '../helpers/bubble-capex-quarterly-fixtures.mjs';
import { INSIDER_BASKET, insiderWindowUrl, qualifyInsiderWindows } from '../../scripts/bubble-watch/qualified-insider.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checkerUrl = new URL('../../scripts/check-bubble-watch.mjs', import.meta.url);
const checker = fs.readFileSync(checkerUrl, 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../../docs/fixtures/bubble-watch/legacy-contract-bundle.json', import.meta.url)));
const bindings = {};
for (const match of checker.matchAll(/import\s+([\s\S]*?)\s+from\s+'([^']+)';/gu)) {
  const module = await import(match[2].startsWith('.') ? new URL(match[2], checkerUrl).href : match[2]);
  if (match[1].trim().startsWith('{')) {
    for (const key of match[1].replace(/[{}]/gu, '').split(',').map(s => s.trim()).filter(Boolean)) { const [original, alias = original] = key.split(/\s+as\s+/u); bindings[alias] = module[original]; }
  } else bindings[match[1].trim()] = module.default;
}
function run(files, config = { contractVersion: 'bubble-qualified-methods-v1', activeRevision: 0, approvedAbsSourceReviews: [], absObservation: null }) {
  const logs = [];
  const RealDate = globalThis.Date;
  class FrozenDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-10-13T12:00:00Z'])); }
    static now() { return RealDate.parse('2026-10-13T12:00:00Z'); }
  }
  const fakeFs = { ...fs, readFileSync(file, ...args) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative === 'config/bubble-watch-methods.json') return JSON.stringify(config);
    if (Object.hasOwn(files, relative)) return JSON.stringify(files[relative]);
    return fs.readFileSync(file, ...args);
  } };
  let code = 0;
  try {
    globalThis.Date = FrozenDate;
    vm.runInNewContext(checker.replace(/import\s+[\s\S]*?\s+from\s+'[^']+';\s*/gu, '').replaceAll('import.meta.url', JSON.stringify(checkerUrl.href)), {
      ...bindings, fs: fakeFs, Date: FrozenDate, Buffer, URL,
      console: { log: line => logs.push(line), error: line => logs.push(line) },
      process: { env: {}, exit(value) { code = value; throw new Error('checker_exit'); } }
    }, { timeout: 10000 });
  } catch (error) { if (error.message !== 'checker_exit') throw error; }
  finally { globalThis.Date = RealDate; }
  return { code, logs: logs.join('\n') };
}
function pendingFiles() {
  const files = structuredClone(bundle.files);
  const data = files['data/bubble-watch.json'];
  const abs = data.indicators.find(i => i.id === 'dc_abs_spread');
  Object.assign(abs, { status: 'unknown', as_of: null, stale: false,
    evidence_gap: { reasonCode: GAP_REASONS.dc_abs_spread, policy: 'bubble-qualified-evidence-v1', checkedDate: data.as_of_date },
    provenance: { mode: 'auto', checkedAt: `${data.as_of_date}T13:22:04.262Z` } });
  const r = replayEvidenceScores(data.indicators, 1);
  data.contractVersion = 'bubble-watch-v3';
  Object.assign(data.summary, {
    primary_score_pct: r.primary, red_pct: r.primary, weighted_risk_score: r.pressure,
    primary_score_range_pct: r.primaryRange, weighted_risk_score_range: r.pressureRange,
    stage_score: r.stage, trigger_score: r.trigger, stage_score_range: r.stageRange, trigger_score_range: r.triggerRange,
    scoring_unknown_count: 1, unknown_count: 1, display_red_pct: null, display_weighted_risk_score: null,
    yellow_count: data.summary.yellow_count - 1, scoring_yellow_count: r.counts.yellow,
    category_scores: Object.fromEntries(Object.entries(r.categories).map(([k,v]) => [k,v.point])),
    category_score_ranges: Object.fromEntries(Object.entries(r.categories).map(([k,v]) => [k,{lower:v.lower,upper:v.upper}])),
    trigger_label: '待确认', trigger_label_en: 'Pending', momentum: { deteriorated:0, improved:0, net:0 }
  });
  data.summary.narrative_plan.evidenceGaps = r.unknownIds;
  data.summary.narrative_plan.evidenceHighlights = data.summary.narrative_plan.evidenceHighlights.filter(item=>!r.unknownIds.includes(item.id));
  data.summary.verdict_desc = '数据中心利差待确认。' + data.summary.verdict_desc;
  delete data.summary.weekly_editorial;
  Object.assign(data.scoring, { model_version:r.modelVersion, base_tier:r.baseTier, effective_tier:r.effectiveTier,
    override_active:r.overrideActive, two_axis_upgrade:r.twoAxisUpgrade, tier_range:r.tierRange, unknown_core_ids:r.unknownIds });
  const history = files['data/bubble-watch-history.json'];
  history.contractVersion = 'bubble-watch-history-v3';
  const last = structuredClone(history.entries.at(-1));
  Object.assign(last, { scoring_model_version:r.modelVersion, red_pct:null, risk_score:null, core_red_pct:null, core_risk_score:null,
    display_red_pct:null, display_risk_score:null, statuses:Object.fromEntries(data.indicators.map(i=>[i.id,i.status])) });
  Object.assign(last, { score_bounds: { primary:r.primaryRange, pressure:r.pressureRange, stage:r.stageRange, trigger:r.triggerRange },
    effective_tier:r.effectiveTier, tier_range:r.tierRange, unknown_core_ids:r.unknownIds,
    gap_metadata:{ dc_abs_spread: { as_of:abs.as_of, stale:abs.stale, evidence_gap:abs.evidence_gap, provenance:abs.provenance } } });
  history.entries.push(last);
  data.history_seed = [];
  return files;
}

test('real checker retains frozen v2 baseline and rejects changed score/shadow contracts', () => {
  const baseline = run(bundle.files);
  assert.equal(baseline.code, 0, baseline.logs);
  for (const mutate of [d => { d.summary.red_pct = 0; }, d => { d.scoring.shadow_policy = 'core'; }]) {
    const files = structuredClone(bundle.files); mutate(files['data/bubble-watch.json']);
    assert.equal(run(files).code, 1);
  }
});

test('real checker accepts registered v3 pending bounds and rejects false point/config/gap', () => {
  const files = pendingFiles();
  const config = { contractVersion:'bubble-qualified-methods-v1', activeRevision:1, approvedAbsSourceReviews:[], absObservation:null };
  const baseline = run(files, config);
  assert.equal(baseline.code, 0, baseline.logs);
  for (const mutate of [d=>{d.summary.narrative_plan.evidenceGaps=[];}, d=>{d.summary.primary_score_pct=0;}, d=>{d.summary.scoring_total_indicators=22;},
    d=>{d.summary.primary_score_range_pct.upper=30.4;}, d=>{d.indicators.find(i=>i.status==='unknown').as_of=d.as_of_date;}]) {
    const changed = structuredClone(files); mutate(changed['data/bubble-watch.json']);
    assert.equal(run(changed, config).code,1);
  }
  assert.equal(run(files).code,1);
  for (const mutate of [row=>{row.gap_metadata.dc_abs_spread.status='red';}, row=>{row.statuses.cape='green';}, row=>{row.score_bounds.primary.upper=0;}, row=>{row.gap_metadata.dc_abs_spread.provenance.checkedAt='2026-10-13T00:00:00Z';}]) {
    const changed=structuredClone(files); mutate(changed['data/bubble-watch-history.json'].entries.at(-1));
    assert.equal(run(changed,config).code,1);
  }
});

function insiderFiles() {
  const files=pendingFiles(), data=files['data/bubble-watch.json'], today=data.as_of_date;
  const checkedAt=`${today}T13:22:04.262Z`;
  const transaction=(code,value)=>({txDate:today,txCode:code,valueUsd:value,isOpenMarket:true,priceNote:null});
  const report=qualifyInsiderWindows(INSIDER_BASKET.map(symbol=>({symbol,responseTicker:symbol,
    sourceUrl:insiderWindowUrl(symbol,today),responseBuiltAt:checkedAt,
    transactions:[transaction('S','10000000'),transaction('P','1000000')]})),today,checkedAt);
  Object.assign(report,{sourceFailures:[],sourceAttribution:'Data: XOOMAR; Insider trade data: SEC.',sourceAttributionUrl:'https://xoomar.com',
    collectionPolicy:{actualRequests:12,maximumRequests:12,minimumStartSpacingMs:6500,requestTimeoutMs:12000,responseMaxBytes:1048576,applicationRetries:0}});
  const insider=data.indicators.find(row=>row.id==='insider_sell_buy');
  Object.assign(insider,{status:'yellow',as_of:today,stale:false,provenance:{mode:'auto',checkedAt,detail:report}});
  data.scoring.model_version='bubble-watch-v3-core23-shadow4-r2';
  files['data/bubble-watch-history.json'].entries.at(-1).scoring_model_version=data.scoring.model_version;
  return files;
}

test('real checker admits only activated r2 with replayable returned-sample proof', () => {
  const files=insiderFiles();
  const config={contractVersion:'bubble-qualified-methods-v1',activeRevision:2,approvedAbsSourceReviews:[],absObservation:null};
  const valid=run(files,config);assert.equal(valid.code,0,valid.logs);
  for(const mutate of [row=>{row.status='red';},row=>{row.provenance.detail.totals[30].ratio=999;},
    row=>{row.provenance.detail.companies[0].rawTransactions=[];},row=>{row.provenance.detail.collectionPolicy.applicationRetries=1;}]) {
    const changed=structuredClone(files);mutate(changed['data/bubble-watch.json'].indicators.find(row=>row.id==='insider_sell_buy'));
    const result=run(changed,config);assert.equal(result.code,1);assert.match(result.logs,/insider qualified source/u);
  }
  assert.equal(run(files,{...config,activeRevision:1}).code,1);
  const future=structuredClone(files);future['data/bubble-watch.json'].scoring.model_version='bubble-watch-v3-core23-shadow4-r5';
  const rejected=run(future,{...config,activeRevision:4});assert.equal(rejected.code,1);
  assert.match(rejected.logs,/not supported\/activated/u);
});


function capexFiles(){
  const files=insiderFiles(),d=files['data/bubble-watch.json'],today=d.as_of_date;
  const card=d.indicators.find(i=>i.id==='capex_reaction');
  Object.assign(card,{status:'unknown',as_of:null,stale:false,
    provenance:{mode:'auto',checkedAt:`${today}T13:22:04.262Z`,detail:capexEventEvidenceHold(today)},
    evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today}});
  d.summary.verdict_desc='资本开支事件待确认。'+d.summary.verdict_desc;
  applyFixtureRevision(files,3);
  return files;
}
function applyFixtureRevision(files,revision){
  const d=files['data/bubble-watch.json'];
  const r=replayEvidenceScores(d.indicators,revision),s=d.summary;
  Object.assign(s,{primary_score_pct:r.primary,red_pct:r.primary,weighted_risk_score:r.pressure,
    primary_score_range_pct:r.primaryRange,weighted_risk_score_range:r.pressureRange,
    stage_score:r.stage,trigger_score:r.trigger,stage_score_range:r.stageRange,trigger_score_range:r.triggerRange,
    scoring_unknown_count:r.counts.unknown,unknown_count:r.counts.unknown,
    scoring_red_count:r.counts.red,scoring_yellow_count:r.counts.yellow,scoring_green_count:r.counts.green,
    category_scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.point])),
    category_score_ranges:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,{lower:v.lower,upper:v.upper}]))});
  for(const status of ['red','yellow','green'])s[`${status}_count`]=d.indicators.filter(i=>i.status===status).length;
  s.narrative_plan.evidenceGaps=r.unknownIds;
  s.narrative_plan.evidenceHighlights=s.narrative_plan.evidenceHighlights.filter(i=>!r.unknownIds.includes(i.id));
  Object.assign(d.scoring,{model_version:r.modelVersion,base_tier:r.baseTier,effective_tier:r.effectiveTier,
    override_active:r.overrideActive,two_axis_upgrade:r.twoAxisUpgrade,tier_range:r.tierRange,unknown_core_ids:r.unknownIds});
  const last=files['data/bubble-watch-history.json'].entries.at(-1);
  Object.assign(last,{scoring_model_version:r.modelVersion,statuses:Object.fromEntries(d.indicators.map(i=>[i.id,i.status])),
    score_bounds:{primary:r.primaryRange,pressure:r.pressureRange,stage:r.stageRange,trigger:r.triggerRange},
    effective_tier:r.effectiveTier,tier_range:r.tierRange,unknown_core_ids:r.unknownIds,
    gap_metadata:Object.fromEntries(d.indicators.filter(i=>i.status==='unknown').map(i=>[i.id,{as_of:i.as_of,stale:i.stale,evidence_gap:i.evidence_gap,provenance:i.provenance}]))});
}

test('real checker admits r3 only as an activated fixed-four event gap and replays its bounds',()=>{
  const files=capexFiles();
  const config={contractVersion:'bubble-qualified-methods-v1',activeRevision:3,approvedAbsSourceReviews:[],absObservation:null};
  const valid=run(files,config);assert.equal(valid.code,0,valid.logs);
  for(const mutate of [c=>c.status='green',c=>c.provenance.detail.latestConfirmed=true,
    c=>c.provenance.detail.qualifiedEvents.push({symbol:'MSFT'}),c=>c.provenance.detail.companies.pop()]){
    const changed=structuredClone(files);mutate(changed['data/bubble-watch.json'].indicators.find(i=>i.id==='capex_reaction'));
    const result=run(changed,config);assert.equal(result.code,1);assert.match(result.logs,/capex qualified source/u);
  }
  assert.equal(run(files,{...config,activeRevision:2}).code,1);
});


function fedFiles(pending=false){
 const files=capexFiles(),data=files['data/bubble-watch.json'],today=data.as_of_date,checkedAt=`${today}T11:00:00Z`;
 const calendar={sourceUrl:FED_CALENDAR_URL,checkedAt,lastUpdated:'2026-10-07',years:Object.fromEntries(Object.entries(FED_MEETINGS).map(([y,days])=>[y,days.map(d=>`${y}-${d}`)]))};
 const plan=fedQuotePlan(today,calendar,checkedAt),quoteDate=new Date(Date.parse(`${today}T00:00:00Z`)-3*86400000).toISOString().slice(0,10);
 const input={calendar,baseline:{series:'DFF',sourceUrl:'https://fred.stlouisfed.org/series/DFF',observedAt:quoteDate,value:'4.00',checkedAt},
  quotes:plan.requiredMonths.map(month=>({month,symbol:fedFutureSymbol(month),sourceUrl:`https://query1.finance.yahoo.com/v8/finance/chart/${fedFutureSymbol(month)}?range=10d&interval=1d`,
   exchangeName:'CBT',instrumentType:'FUTURE',exchangeTimezoneName:'America/New_York',dataGranularity:'1d',timestamp:Date.parse(`${quoteDate}T04:00:00Z`)/1000,rawClose:95.8,reportedVolume:100}))};
 const report={policy:'fed_market_path_collection_v1',checkedAt,sourceEvidence:input,result:qualifyFedMarketPath(input,today,checkedAt),sourceFailures:[],qualityIssues:[],
  attemptedSources:['calendar','DFF',...plan.requiredMonths.map(fedFutureSymbol)],collectionPolicy:{actualRequests:plan.requiredMonths.length+2,maximumRequests:10,requestTimeoutMs:12000,calendarMaxBytes:1048576,csvMaxBytes:65536,quoteMaxBytes:1048576,applicationRetries:0,redirects:'error'}};
 if(pending){Object.assign(report,{sourceEvidence:{calendar:null,baseline:null,quotes:[]},sourceFailures:[{source:'calendar',reason:'http_403'}],attemptedSources:['calendar']});report.collectionPolicy.actualRequests=1;report.result=qualifyFedMarketPath(report.sourceEvidence,today,checkedAt);}
 const card=data.indicators.find(i=>i.id==='fed_policy');
 Object.assign(card,{status:report.result.status,as_of:pending?null:report.result.quoteLabelDate,stale:false,name_zh:'Fed 3/6个月市场路径',
  value_display:FED_PATH_LABELS[report.result.status],threshold_text:FED_THRESHOLD_TEXT,source_name:'联邦基金期货历史日线 · FRED实际EFFR',
  note:'纽约日期标签的历史日线价格代理，不是CME官方结算价，也不是下次会议概率。',provenance:{mode:'auto',checkedAt,detail:report}});
 if(pending){card.evidence_gap={policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today};data.summary.verdict_desc='Fed 3/6个月市场路径待确认。'+data.summary.verdict_desc;}
 applyFixtureRevision(files,4);return files;
}
test('real checker replays activated r4 proxy proof and refuses year-end/clock/rational/request tampering',()=>{
 const files=fedFiles(),config={contractVersion:'bubble-qualified-methods-v1',activeRevision:4,approvedAbsSourceReviews:[],absObservation:null};
 const valid=run(files,config);assert.equal(valid.code,0,valid.logs);
 for(const mutate of [c=>c.value_display='年末路径隐含加息',c=>c.provenance.detail.result.paths[0].delta.numerator='0',
 c=>c.provenance.detail.sourceEvidence.quotes[0].rawRows=[],c=>c.provenance.detail.collectionPolicy.applicationRetries=1,
 c=>{c.provenance.detail.checkedAt='2026-10-13T13:00:00Z';c.provenance.checkedAt=c.provenance.detail.checkedAt;}]){
  const changed=structuredClone(files);mutate(changed['data/bubble-watch.json'].indicators.find(i=>i.id==='fed_policy'));
  const result=run(changed,config);assert.equal(result.code,1);assert.match(result.logs,/fed qualified source/u);
 }
 assert.equal(run(files,{...config,activeRevision:3}).code,1);
 const pending=fedFiles(true),accepted=run(pending,config);assert.equal(accepted.code,0,accepted.logs);
 const falseZero=structuredClone(pending);falseZero['data/bubble-watch.json'].summary.primary_score_pct=0;
 assert.equal(run(falseZero,config).code,1);
});
test('real checker admits r5 quarterly replay only after explicit activation, retaining old r4 hold',async()=>{
 const files=fedFiles(),data=files['data/bubble-watch.json'],today=data.as_of_date;
 const t=quarterlyTransport(),report=await collectQuarterlyCapexPanel({allowNetwork:true,today,now:()=>Date.parse(today+'T11:00:00Z'),fetchFn:t.fetchFn});
 const card=data.indicators.find(i=>i.id==='capex_reaction');
 Object.assign(card,{status:report.decision.status,as_of:'2026-07-30',stale:false,value_display:QUARTERLY_CAPEX_LABELS[report.decision.status],source_name:QUARTERLY_CAPEX_SOURCE,threshold_text:QUARTERLY_CAPEX_THRESHOLD,provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report}});delete card.evidence_gap;
 applyFixtureRevision(files,5);
 const config={contractVersion:'bubble-qualified-methods-v1',activeRevision:5,approvedAbsSourceReviews:[],absObservation:null};
 const accepted=run(files,config);assert.equal(accepted.code,0,accepted.logs);
 assert.equal(run(files,{...config,activeRevision:4}).code,1);
 for(const mutate of [c=>c.status='red',c=>c.provenance.detail.decision.status='red',c=>c.provenance.detail.companies.pop(),c=>c.provenance.detail.requests[0].sha256='0'.repeat(64),c=>c.provenance.detail.rawBody='raw',c=>c.provenance.detail.companies[0].guidance.rawHtml='raw',c=>c.provenance.detail.requests[0].authorization='private']){
  const f=structuredClone(files);mutate(f['data/bubble-watch.json'].indicators.find(i=>i.id==='capex_reaction'));const rejected=run(f,config);assert.equal(rejected.code,1);assert.match(rejected.logs,/capex quarterly source/u);
 }
 const pending=structuredClone(files),p=pending['data/bubble-watch.json'].indicators.find(i=>i.id==='capex_reaction');
 Object.assign(p,{status:'unknown',as_of:null,value_display:QUARTERLY_CAPEX_LABELS.unknown,provenance:{mode:'auto',checkedAt:report.checkedAt,detail:quarterlyCapexHold(today)},evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today}});applyFixtureRevision(pending,5);
 const held=run(pending,config);assert.equal(held.code,0,held.logs);
 const falseProof=structuredClone(pending);falseProof['data/bubble-watch.json'].indicators.find(i=>i.id==='capex_reaction').provenance.detail.manualApproved=true;assert.equal(run(falseProof,config).code,1);
});
for(const status of ['red','green'])test(`real r5 checker replays ${status} capex into fixed Core23 and existing score bounds`,async()=>{
 const files=fedFiles(),data=files['data/bubble-watch.json'],today=data.as_of_date,t=quarterlyTransport({priceMode:status});
 const report=await collectQuarterlyCapexPanel({allowNetwork:true,today,now:()=>Date.parse(today+'T11:00:00Z'),fetchFn:t.fetchFn});assert.equal(report.decision.status,status);
 const c=data.indicators.find(i=>i.id==='capex_reaction');Object.assign(c,{status,as_of:'2026-07-30',value_display:QUARTERLY_CAPEX_LABELS[status],source_name:QUARTERLY_CAPEX_SOURCE,threshold_text:QUARTERLY_CAPEX_THRESHOLD,provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report}});delete c.evidence_gap;applyFixtureRevision(files,5);
 const accepted=run(files,{contractVersion:'bubble-qualified-methods-v1',activeRevision:5,approvedAbsSourceReviews:[],absObservation:null});assert.equal(accepted.code,0,accepted.logs);
});
