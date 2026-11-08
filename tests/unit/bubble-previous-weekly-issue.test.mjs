import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { projectWeeklyEditorial, reviewWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { preservePreviousWeeklyIssue, validatePreviousWeeklyIssue } from '../../scripts/bubble-watch/previous-weekly-issue.mjs';
import { verifyPreviousIssueDigests } from '../../scripts/modules/bubblePreviousIssue.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../../docs/fixtures/bubble-watch-weekly-editorial/${name}.json`,import.meta.url)));
function pack() {
  const input=read('sample-input-v1'); delete input.fixtureOnly;
  for (const source of input.sourceRefs) { const story=input.newsContext.stories.find(s=>s.id===source.id); if(story) Object.assign(source,{providers:story.providers,supportingDomains:story.supportingDomains}); }
  const output=read('sample-output-v1'), review=reviewWeeklyEditorial({input,output,generatedAt:output.generatedAt});
  const layer=projectWeeklyEditorial({input,output,review,generatedAt:output.generatedAt,sourceCommit:'a'.repeat(40),runId:'12345'});
  const previous={contractVersion:'bubble-watch-v2',as_of_date:input.asOfDate,
    summary:{verdict_label:'中度警戒',verdict_desc:'原期确定性判断',weekly_editorial:layer},
    scoring:{model_version:'bubble-watch-v2-core23-shadow4'},indicators:input.structuredFacts.map(f=>({id:f.indicatorId,category:f.category,status:f.status}))};
  const next={contractVersion:'bubble-watch-v3',as_of_date:'2026-11-08',summary:{verdict_desc:'本期确定性判断'}};
  return {previous,next};
}
const now=Date.parse('2026-11-08T12:00:00Z');
test('historical issue preserves original dates, original scores and deterministic current summary',async()=>{
  const {previous,next}=pack(), before=structuredClone(previous);
  assert.equal(preservePreviousWeeklyIssue(next,previous,now),true);
  const issue=next.summary.previous_weekly_editorial;
  assert.deepEqual(issue.editorial,before.summary.weekly_editorial);
  assert.equal(issue.sourceData.as_of_date,previous.as_of_date);
  assert.deepEqual(issue.sourceData.scoring,previous.scoring);
  assert.equal(next.summary.verdict_desc,'本期确定性判断');
  assert.equal(next.summary.weekly_editorial,undefined);
  assert.deepEqual(previous,before);
  assert.equal(await verifyPreviousIssueDigests(issue,next.as_of_date,now,webcrypto.subtle),true);
});
test('repeat refresh retains one original issue without recursive nesting or renewed dates',()=>{
  const {previous,next}=pack();preservePreviousWeeklyIssue(next,previous,now);
  const again={as_of_date:'2026-11-09',summary:{}};
  assert.equal(preservePreviousWeeklyIssue(again,next,now),true);
  assert.deepEqual(again.summary.previous_weekly_editorial,next.summary.previous_weekly_editorial);
  assert.equal(again.summary.previous_weekly_editorial.sourceData.summary.previous_weekly_editorial,undefined);
});
test('unproven manual origin, missing digests, future timestamps and altered text fail closed',()=>{
  for(const mutate of [l=>{l.provenance.generatedBy='manual';},l=>{l.provenance.sourceCommit=null;},l=>{l.provenance.runId=null;},
    l=>{delete l.validation.artifactDigest;},l=>{l.output.leadZh+='未经证实的修改';},l=>{l.generatedAt='2027-01-01T00:00:00Z';},
    l=>{l.freshness.artifactGeneratedAt='2026-11-08T00:00:00Z';},l=>{l.qualityReview.status='fail';}]) {
    const {previous,next}=pack();mutate(previous.summary.weekly_editorial);
    assert.equal(preservePreviousWeeklyIssue(next,previous,now),false);
    assert.equal(next.summary.previous_weekly_editorial,undefined);
  }
});
test('retained proof mutation fails on backend and browser',async()=>{
  const {previous,next}=pack();preservePreviousWeeklyIssue(next,previous,now);
  const issue=next.summary.previous_weekly_editorial;issue.sourceData.summary.verdict_label='篡改';
  assert.equal(validatePreviousWeeklyIssue(issue,next.as_of_date,now),false);
  assert.equal(await verifyPreviousIssueDigests(issue,next.as_of_date,now,webcrypto.subtle),false);
});
test('older valid history survives a failed new article and later dates never become current',()=>{
  const {previous,next}=pack();preservePreviousWeeklyIssue(next,previous,now);
  next.summary.weekly_editorial={status:'invalid'};
  const later={as_of_date:'2026-11-09',summary:{}};
  assert.equal(preservePreviousWeeklyIssue(later,next,now),true);
  assert.equal(later.summary.previous_weekly_editorial.editorial.asOfDate,previous.as_of_date);
  assert.equal(later.summary.weekly_editorial,undefined);
});



test('browser keeps current Hero eligibility separate and labels historical dates and scores',async()=>{
  const {previous,next}=pack();preservePreviousWeeklyIssue(next,previous,now);
  const html=fs.readFileSync(new URL('../../bubble-watch.html',import.meta.url),'utf8');
  const code=html.slice(html.indexOf('const CATEGORY_ORDER ='),html.indexOf('function statusBadge('));
  const context=vm.createContext({URL,Date,issue:next.summary.previous_weekly_editorial,data:next,now});
  vm.runInContext(code,context);
  assert.equal(vm.runInContext('eligibleWeeklyEditorial(data,now)',context),null);
  assert.equal(vm.runInContext('eligiblePreviousWeeklyEditorial(data,now)',context),null);
  assert.equal(await verifyPreviousIssueDigests(context.issue,next.as_of_date,now,webcrypto.subtle),true);
  vm.runInContext('verifiedPreviousIssues.add(issue)',context);
  const historical=vm.runInContext('eligiblePreviousWeeklyEditorial(data,now)',context);
  assert.equal(historical.asOfDate,previous.as_of_date);
  const rendered=vm.runInContext('renderWeeklyEditorial(eligiblePreviousWeeklyEditorial(data,now),true)',context);
  assert.match(rendered,/上一期 AI 判读/u);assert.match(rendered,/不代表本期判断/u);
  assert.ok(rendered.includes(previous.as_of_date));
  assert.ok(rendered.includes(previous.summary.weekly_editorial.output.scorecardSynthesisZh));
  assert.equal(vm.runInContext('eligibleWeeklyEditorial(data,now)',context),null);
});

test('damaged retained history, disabled original, illegal/future original dates are rejected',async()=>{
  for(const mutate of [i=>{i.editorial.displayEnabled=false;},i=>{i.editorial.asOfDate='2026-02-30';},
    i=>{i.editorial.asOfDate='2027-01-01';},i=>{i.editorial.output.leadZh='伪造';},
    i=>{i.sourceData.indicators=[];},i=>{i.editorial.status='invalid';},i=>{i.sourceDataDigest='0'.repeat(64);}]) {
    const {previous,next}=pack();preservePreviousWeeklyIssue(next,previous,now);
    mutate(next.summary.previous_weekly_editorial);
    next.summary.weekly_editorial={status:'invalid',displayEnabled:false};
    const later={as_of_date:'2026-11-09',summary:{}};
    assert.equal(preservePreviousWeeklyIssue(later,next,now),false);
    assert.equal(later.summary.previous_weekly_editorial,undefined);
  }
});

test('v3 history keeps original null/ranges and qualified proof across new scoring snapshots',()=>{
  const previous=JSON.parse(fs.readFileSync(new URL('../../data/bubble-watch.json',import.meta.url)));
  delete previous.summary.weekly_editorial;delete previous.summary.previous_weekly_editorial;
  const fixture=read('sample-input-v1'),output=read('sample-output-v1');
  const input=buildWeeklyEditorialInput({bubbleWatch:previous,discovery:fixture.newsContext,generatedAt:`${previous.as_of_date}T12:00:00Z`});
  output.asOfDate=input.asOfDate;output.generatedAt=input.generatedAt;output.scorecardSynthesisZh=input.scoringSnapshot.scorecardDisclosureZh;
  const review=reviewWeeklyEditorial({input,output,generatedAt:output.generatedAt});
  previous.summary.weekly_editorial=projectWeeklyEditorial({input,output,review,generatedAt:output.generatedAt,sourceCommit:'a'.repeat(40),runId:'12345'});
  const later=Date.parse(input.generatedAt)+30*86400000;
  const next={as_of_date:new Date(later).toISOString().slice(0,10),summary:{primary_score_pct:0},scoring:{model_version:'different-current-model'}};
  assert.equal(preservePreviousWeeklyIssue(next,previous,later),true);
  assert.deepEqual(next.summary.previous_weekly_editorial.editorial.sourceScoringSnapshot,input.scoringSnapshot);
  assert.deepEqual(next.summary.previous_weekly_editorial.sourceData.summary.primary_score_range_pct,previous.summary.primary_score_range_pct);
  assert.equal(next.summary.primary_score_pct,0);
  next.summary.previous_weekly_editorial.editorial.sourceScoringSnapshot.primaryScorePct=99;
  assert.equal(validatePreviousWeeklyIssue(next.summary.previous_weekly_editorial,next.as_of_date,later),false);
});
