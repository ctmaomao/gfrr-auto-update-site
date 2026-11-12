import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicationDay, validateTimelineDateBindings } from '../../scripts/bubble-watch/weekly-editorial-timeline-dates.mjs';
import { validateWeeklyEditorialOutput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
const read = name => JSON.parse(fs.readFileSync(new URL(`../../docs/fixtures/bubble-watch-weekly-editorial/${name}.json`, import.meta.url)));
function pack() {
  const input = read('sample-input-v1');
  const output = read('sample-output-v1');
  return { input, output };
}
test('publication days reject invalid calendars and arbitrary or retrieval-like values', () => {
  for (const value of [null, '', 'today', '2026-02-29', '2026-04-31', '2026-13-01', '2026-08-06garbage', '2026-08-06T25:00:00Z', '08/06/2026']) assert.equal(publicationDay(value), null);
  assert.equal(publicationDay('2024-02-29'), '2024-02-29');
  assert.equal(publicationDay('2026-08-06T23:30:00-05:00'), '2026-08-06');
});
test('new news timeline dates require an actually cited publication date and explicit visible reporting', () => {
  const {input, output} = pack();
  assert.equal(validateWeeklyEditorialOutput(output,input).ok,true);
  const row = output.weeklyTimeline[0];
  for (const mutate of [
    r => { r.date = '2026-08-10'; }, // refresh date, not publication
    r => { r.date = '2026-08-08'; }, // another uncited story
    r => { r.date = '2026-02-30'; },
    r => { r.detailZh = '公司于当日成立。'; },
    r => { r.detailZh = '2026-08-07 据媒体报道，公司夏季成立。'; },
    r => { r.titleZh = '公司成立'; },
    r => { r.sourceRefIds = []; },
    r => { r.sourceRefIds = ['news:unknown']; }
  ]) {
    const changed=structuredClone(row);mutate(changed);
    assert.ok(validateTimelineDateBindings([changed],input).length);
    const bad=structuredClone(output);bad.weeklyTimeline=[changed];
    assert.equal(validateWeeklyEditorialOutput(bad,input).ok,false);
  }
});
test('a November report about summer founding is a report-date entry, never a verified founding date', () => {
  const {input,output}=pack();
  const row=output.weeklyTimeline[0];
  const story=input.newsContext.stories.find(s=>row.sourceRefIds.includes(s.id));
  story.publishedAt='2026-11-09';
  story.snippet='Mavria was founded during the summer. This November article describes the company and its work, without specifying the date on which the company was established.';
  input.sourceRefs.find(s=>s.id===story.id).publishedAt=story.publishedAt;
  Object.assign(row,{date:'2026-11-09',titleZh:'媒体报道公司背景',detailZh:'2026-11-09 据媒体报道，该公司于夏季成立，具体成立日未获核实。'});
  assert.deepEqual(validateTimelineDateBindings([row],input),[]);
  const original=structuredClone(row);
  row.detailZh='2026-11-09 据媒体报道，该公司当日创办。';
  assert.ok(validateTimelineDateBindings([row],input).length);
  Object.assign(row,original);
  row.titleZh='公司于11月9日成立';
  assert.ok(validateTimelineDateBindings([row],input).length);
});
test('unusable news and mismatched ledger metadata cannot lend a publication day', () => {
  for (const mutate of [
    s=>{s.evidenceStatus='discovery_only';},s=>{s.contentScope='title_only';},s=>{delete s.snippet;},
    s=>{delete s.publishedAt;},s=>{s.publishedAt='2026-02-30';}
  ]) {
    const {input,output}=pack();const row=output.weeklyTimeline[0];
    mutate(input.newsContext.stories.find(s=>row.sourceRefIds.includes(s.id)));
    assert.ok(validateTimelineDateBindings([row],input).length);
  }
  const {input,output}=pack();input.sourceRefs.find(s=>s.id==='news:macro-sample').publishedAt='2026-08-10';
  assert.ok(validateTimelineDateBindings(output.weeklyTimeline,input).length);
});
test('structured-only timeline binds cited observation date, not the global refreshed date', () => {
  const {input}=pack();const fact=input.structuredFacts[0];fact.asOfDate='2026-08-05';
  input.sourceRefs.find(s=>s.id===fact.sourceRefIds[0]).asOfDate=fact.asOfDate;
  const row={sourceIndicatorIds:[fact.indicatorId],date:fact.asOfDate,titleZh:'站内观测',detailZh:'2026-08-05 的站内观测：估值处于高位。',sourceRefIds:fact.sourceRefIds};
  assert.deepEqual(validateTimelineDateBindings([row],input),[]);
  for(const mutate of [r=>{r.date=input.asOfDate;},r=>{r.sourceRefIds=[];},r=>{r.sourceIndicatorIds=[];},r=>{r.sourceIndicatorIds=['wrong'];},r=>{r.detailZh='估值当日升高。';},r=>{r.titleZh='估值当日升高';}]) {
    const bad=structuredClone(row);mutate(bad);assert.ok(validateTimelineDateBindings([bad],input).length);
  }
  delete fact.asOfDate;
  assert.ok(validateTimelineDateBindings([row],input).length);
});
test('historical metadata-only validation retains compatibility but full-input new writes fail closed', () => {
  const {input,output}=pack();
  output.weeklyTimeline[0].detailZh='旧稿没有新增报道日期前缀，原正文仍然保留。';
  assert.equal(validateWeeklyEditorialOutput(output,input).ok,false);
  for(const story of input.newsContext.stories) delete story.snippet;
  assert.equal(validateWeeklyEditorialOutput(output,input,{metadataOnly:true}).ok,true);
  assert.equal(validateWeeklyEditorialOutput(output,input).ok,false);
});
