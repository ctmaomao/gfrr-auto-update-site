import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('bubble-watch.html', 'utf8');
const source = html.slice(html.indexOf('const CREDIT_PANELS ='), html.indexOf('function creditSectionHtml('));
const leaves = Object.fromEntries(['hy','ccc','ig'].map(key => [`credit-notice-${key}`, {}]));
const context = vm.createContext({ Date, document: { getElementById: id => leaves[id] } });
const { creditNotice, refreshCreditNotices } = vm.runInContext(source + '; ({ creditNotice, refreshCreditNotices });', context);
function fixture() {
  return { contractVersion:'bubble-credit-spreads-v1', boundary:'display_only_no_score_impact',
    series:Object.fromEntries(['hy','ccc','ig'].map(k=>[k,Array.from({length:6},(_,i)=>({date:`2026-01-0${i+1}`,bps:300+i}))])),
    sources:{hy:{status:'ok'},ccc:{status:'ok'},ig:{status:'ok'}} };
}
test('credit notices cross the existing ten-day boundary without mutating observations',()=>{
 const d=fixture(), old=structuredClone(d), boundary=Date.parse('2026-01-16T00:00:00Z');
 assert.equal(creditNotice(d,'hy',boundary),'');
 assert.match(creditNotice(d,'hy',boundary+1),/已超过 10 天/);
 d.sources.hy.status='fallback';
 assert.match(creditNotice(d,'hy',boundary),/更新未完成，沿用/);
 assert.doesNotMatch(creditNotice(d,'hy',boundary),/已超过/);
 assert.match(creditNotice(d,'hy',boundary+1),/已超过 10 天/);
 d.sources.hy.status='ok';assert.deepEqual(d,old);
});
test('source stale is not fabricated as elapsed age; missing and uneven dates stay explicit',()=>{
 const d=fixture(), now=Date.parse('2026-01-10T00:00:00Z');d.sources.hy.status='stale';
 assert.match(creditNotice(d,'hy',now),/来源标记为陈旧/);assert.doesNotMatch(creditNotice(d,'hy',now),/已超过/);
 d.sources.hy.status='ok';d.series.ccc=[];
 assert.match(creditNotice(d,'hy',now),/观测 2026-01-06/);assert.match(creditNotice(d,'ccc',now),/数据暂缺/);
});
test('refresh updates existing leaves and never fetches or redraws charts',()=>{
 const d=fixture();refreshCreditNotices(d);assert.match(leaves['credit-notice-hy'].textContent,/已超过/);assert.equal(leaves['credit-notice-hy'].hidden,false);
 const refresh=html.slice(html.indexOf('function refreshDisplayAge()'),html.indexOf('function scoreText('));
 assert.match(refresh,/refreshCreditNotices\(lastData.credit_spreads\)/);
 const fn=html.slice(html.indexOf('function refreshCreditNotices('),html.indexOf('function creditSectionHtml('));assert.doesNotMatch(fn,/fetch\(|innerHTML|drawCreditTrend/);
});
