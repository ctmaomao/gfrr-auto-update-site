import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildQualifiedAbsFixture} from '../helpers/bubble-qualified-builder.mjs';
import {verifyQualifiedRefresh} from '../../scripts/bubble-watch/qualified-refresh-release.mjs';
import {validateQuarterlyCapexPublication} from '../../scripts/bubble-watch/capex-quarterly-publication.mjs';
import {nvdaEvidenceFixture} from '../helpers/nvda-evidence-fixture.mjs';
import {validateNvdaRatioRecord} from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
const clock='2026-11-03T12:00:00Z',now=()=>Date.parse('2026-11-03T12:10:00Z');
const fedOptions={barTimes:['2026-10-29T04:00:00Z','2026-10-30T04:00:00Z','2026-11-02T05:00:00Z'],csv:'observation_date,DFF\n2026-10-29,4.00\n2026-10-30,4.00'};
const nextFedOptions={barTimes:['2026-10-30T04:00:00Z','2026-11-02T05:00:00Z','2026-11-03T05:00:00Z'],csv:'observation_date,DFF\n2026-10-30,4.00\n2026-11-02,4.00'};
for(const [recordDate,eligible]of[['2026-11-01',true],['2026-10-04',false]])test(`actual four-source refresh preserves NVIDIA proof; current eligibility=${eligible}`,async()=>{
 const before=await buildQualifiedAbsFixture({revision:5,clock,fedOptions});
 const index=before.output.indicators.findIndex(card=>card.id==='nvda_invest_revenue');
 assert.equal(before.output.indicators[index].status,'red');
 const proof={...before.output.indicators[index],...nvdaEvidenceFixture(recordDate,'2026-11-03',125e9)};
 before.output.indicators[index]=proof;const serialized=JSON.stringify(proof);
 const after=await buildQualifiedAbsFixture({revision:5,clock:'2026-11-04T12:00:00Z',baselineOutput:before.output,baselineHistory:before.history,fedOptions:nextFedOptions});
 const carried=after.output.indicators.find(card=>card.id==='nvda_invest_revenue');
 assert.equal(JSON.stringify(carried),serialized);
 assert.equal(after.networkCalls,36);assert.deepEqual(after.output.meta.fetch_failures,[]);
 assert.equal(after.output.summary.scoring_total_indicators,23);assert.equal(after.output.summary.scoring_unknown_count,1);
 assert.equal(after.output.indicators.find(card=>card.id==='dc_abs_spread').status,'unknown');
 assert.equal(validateNvdaRatioRecord(carried,'2026-11-04').length===0,eligible);
 const result=verifyQualifiedRefresh({before:before.output,beforeHistory:before.history,after:after.output,history:after.history,today:'2026-11-04',now:()=>Date.parse('2026-11-04T12:10:00Z')});
 assert.equal(result.ok,eligible,JSON.stringify(result));
 if(!eligible)assert.ok(result.errors.includes('score replay invalid'));
});
async function pair(options={}){
 const before=await buildQualifiedAbsFixture({revision:5,clock:'2026-10-15T12:00:00Z'});
 const after=await buildQualifiedAbsFixture({revision:5,clock,baselineOutput:before.output,baselineHistory:before.history,fedOptions,...options});
 return {before,after,input:{before:before.output,beforeHistory:before.history,after:after.output,history:after.history,today:'2026-11-03',now}};
}
for(const publish of[false,true])test(`r5 current-date builder freshly collects October proof and only four free sources (${publish?'publish':'candidate'})`,async()=>{
 const {before,after,input}=await pair({publish});
 assert.equal(after.networkCalls,36);assert.deepEqual(after.output.meta.fetch_failures,[]);
 const capex=after.output.indicators.find(card=>card.id==='capex_reaction');assert.equal(capex.status,'yellow');assert.equal(capex.as_of,'2026-10-29');
 assert.equal(capex.provenance.detail.schemaVersion,'bubble-quarterly-capex-panel-v2');assert.deepEqual(validateQuarterlyCapexPublication(capex,'2026-11-03',{now}),[]);
 assert.match(capex.note,/2027财年第一季度/u);assert.match(capex.note,/2026年第三季度/u);assert.match(capex.note,/第三方产能交付延后/u);assert.match(capex.note,/维持2200亿美元/u);assert.doesNotMatch(capex.note,/undefined|经济投入预期未变，租赁重分类/u);
 assert.deepEqual(verifyQualifiedRefresh(input),{ok:true,errors:[],paidCalls:0});
 assert.equal(after.output.meta.qualified_refresh.fullRefreshAsOfDate,before.output.meta.qualified_refresh.fullRefreshAsOfDate);
 assert.equal(after.output.meta.qualified_refresh.carriedObservationCount,23);assert.equal(after.output.summary.scoring_unknown_count,1);
 assert.equal(after.output.indicators.find(card=>card.id==='dc_abs_spread').status,'unknown');
 assert.deepEqual([...after.writes.keys()],publish?['data/bubble-watch.json','data/bubble-watch-history.json']:['manual-artifacts/bubble-qualified-refresh-candidate.json']);
 assert.deepEqual(after.output.credit_spreads,before.output.credit_spreads);assert.deepEqual(after.output.market_technical_heat,before.output.market_technical_heat);
});
test('release guard refuses incomplete capex, source failures and an existing known-source regression',async()=>{
 for(const quarterlyOptions of[{newQuarter:true},{blockHost:'stockanalysis.com'}]){
  const {input}=await pair({quarterlyOptions});assert.equal(input.after.indicators.find(card=>card.id==='capex_reaction').status,'unknown');assert.equal(verifyQualifiedRefresh(input).ok,false);
 }
 const {input}=await pair({insiderHttpStatus:403});assert.equal(verifyQualifiedRefresh(input).ok,false);
});
test('release guard seals source proof, original cards, date/anchor, history and old AI exclusion',async()=>{
 const {input}=await pair();assert.equal(verifyQualifiedRefresh(input).ok,true);
 const mutations=[
  p=>p.after.indicators.find(card=>card.id==='capex_reaction').provenance.detail.registryId='manual',
  p=>p.after.indicators.find(card=>card.id==='capex_reaction').as_of=p.today,
  p=>p.after.indicators.find(card=>card.id==='dc_abs_spread').status='green',
  p=>p.after.indicators.find(card=>card.id==='dc_abs_spread').evidence_gap.checkedDate='2026-11-02',
  p=>p.after.indicators.find(card=>card.id==='cape').note='replaced',
  p=>p.after.indicators.find(card=>card.id==='cape').as_of=p.today,
  p=>p.after.meta.qualified_refresh.fullRefreshAsOfDate=p.today,
  p=>p.after.meta.qualified_refresh.carriedObservationCount=24,
  p=>p.after.meta.qualified_refresh.paidCalls=1,
  p=>p.after.meta.paid_wind_fallback_count=1,
  p=>p.after.meta.fetch_failures.push({reason:'http_403'}),
  p=>p.after.summary.weekly_editorial={status:'valid'},
  p=>p.after.summary.red_pct=0,
  p=>p.after.generated_at='2026-11-04T00:00:00Z',
  p=>p.history.entries[0].date='2000-01-01',
  p=>p.after.market_technical_heat={replaced:true}
 ];
 for(const mutate of mutations){const copy={...input,before:structuredClone(input.before),beforeHistory:structuredClone(input.beforeHistory),after:structuredClone(input.after),history:structuredClone(input.history)};mutate(copy);assert.equal(verifyQualifiedRefresh(copy).ok,false,mutate.toString());}
});
test('production workflow is manual/main-only, secret-free and never dispatches paid editorial',()=>{
 const workflow=fs.readFileSync('.github/workflows/refresh-bubble-qualified-evidence.yml','utf8');
 assert.match(workflow,/workflow_dispatch:/u);assert.match(workflow,/github\.ref == 'refs\/heads\/main'/u);assert.match(workflow,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(workflow,/group: gfrr-main-writer-main/u);assert.match(workflow,/BUBBLE_WATCH_DISABLE_WIND: '1'/u);
 assert.match(workflow,/--refresh-qualified-only --publish-qualified/u);assert.match(workflow,/git add data\/bubble-watch\.json data\/bubble-watch-history\.json/u);
 assert.match(workflow,/git push origin HEAD:main/u);assert.doesNotMatch(workflow,/secrets\.|schedule:|cron:|acknowledge_cost|allow-paid/u);
 assert.ok(workflow.indexOf('npm run check:all')<workflow.indexOf('node scripts/verify-bubble-qualified-refresh.mjs'));
 assert.ok(workflow.indexOf('node scripts/verify-bubble-qualified-refresh.mjs')<workflow.indexOf('git commit'));
 assert.ok(fs.readFileSync('.github/workflows/deploy-static-site-to-pages.yml','utf8').includes('Refresh Bubble Qualified Evidence'));
 assert.match(workflow,/actions: write/u);assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/u);
 assert.deepEqual([...workflow.matchAll(/gh workflow run ([^\s]+)/gu)].map(match=>match[1]),['publish-edgeone-release.yml']);
 assert.match(workflow,/gh workflow run publish-edgeone-release\.yml --repo "\$GITHUB_REPOSITORY" --ref main/u);
 assert.ok(workflow.indexOf('git push origin HEAD:main')<workflow.indexOf('gh workflow run'));
 assert.ok(!fs.readFileSync('.github/workflows/bubble-watch-weekly-editorial-refresh.yml','utf8').includes('Refresh Bubble Qualified Evidence'));
});
test('actual Git CLI guard accepts only the two outputs and rejects extra tracked/staged/untracked writes',async t=>{
 const {input}=await pair();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-qualified-release-test-'));
 t.after(()=>{assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('gfrr-qualified-release-test-'));fs.rmSync(root,{recursive:true,force:true});});
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe']});
 fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'config'));
 const write=(file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data));
 write('data/bubble-watch.json',input.before);write('data/bubble-watch-history.json',input.beforeHistory);write('config/protected.json',{baseline:true});
 git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','core.hooksPath',path.join(root,'no-hooks'));git('add','.');git('commit','-m','baseline');
 write('data/bubble-watch.json',input.after);write('data/bubble-watch-history.json',input.history);
 // Only the external fixture preload supplies this fixed clock. Production
 // source, field admission and the actual Git/CLI path remain unchanged.
 const preload=path.join(root,'clock.cjs');fs.writeFileSync(preload,"const RealDate=Date;global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-11-03T12:10:00Z']));}static now(){return RealDate.parse('2026-11-03T12:10:00Z');}};");
 fs.writeFileSync(path.join(root,'.git/info/exclude'),'clock.cjs\n');
 const cli=fileURLToPath(new URL('../../scripts/verify-bubble-qualified-refresh.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,['--require',preload,cli],{cwd:root,encoding:'utf8'});
 const valid=run();assert.equal(valid.status,0,valid.stdout+valid.stderr);
 write('config/protected.json',{changed:true});assert.notEqual(run().status,0);git('add','config/protected.json');assert.notEqual(run().status,0);
 // Restore only this disposable fixture's owned file from its known baseline.
 write('config/protected.json',{baseline:true});git('add','config/protected.json');
 write('untracked.json',{unexpected:true});assert.notEqual(run().status,0);
});
