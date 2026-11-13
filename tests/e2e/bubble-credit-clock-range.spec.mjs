/* global document, getComputedStyle, innerWidth, lastData, drawTrend */
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = '555316a4c8555d5e2ba14ff711877796c77d024a';
for (const width of [1440, 390]) test(`credit clock and full trend range at ${width}px`, async ({page}, info)=>{
 await page.setViewportSize({width,height:1000});
 await page.clock.install({time:new Date('2026-11-20T23:59:30Z')});
 const data=JSON.parse(readFileSync('data/bubble-watch.json','utf8'));
 data.history_seed=[];
 for (const key of ['hy','ccc','ig']) {
  data.credit_spreads.sources[key].status='ok';
  data.credit_spreads.series[key]=Array.from({length:6},(_,i)=>({date:`2026-11-${String(i+6).padStart(2,'0')}`,bps:300+i}));
 }
 await page.route('**/data/bubble-watch.json*',r=>r.fulfill({json:data}));
 await page.route('**/data/bubble-watch-editorial-status.json*',r=>r.fulfill({status:404,body:''}));
 for (const variant of ['before','after']) {
  await page.clock.setSystemTime(new Date('2026-11-20T23:59:30Z'));
  if (variant==='before') await page.route('**/bubble-watch.html',r=>r.fulfill({contentType:'text/html',body:execFileSync('git',['show',`${BASE}:bubble-watch.html`])}));
  else await page.unroute('**/bubble-watch.html');
  await page.goto('/bubble-watch.html');
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  await expect(page.locator('#trend-chart-wrap svg')).toHaveCount(0);
  const capture=async(selector,name)=>{
   await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
   await page.locator(selector).screenshot({path:info.outputPath(`${variant}-${name}-${width}.png`)});
  };
  await capture('#credit-spreads','credit-fresh');
  const before=await page.locator('#credit-hy svg').getAttribute('aria-label');
  await page.clock.fastForward(60000);
  if(variant==='after') {
   await expect(page.locator('#credit-notice-hy')).toContainText('已超过 10 天');
   await expect(page.locator('#credit-notice-ccc')).toContainText('已超过 10 天');
   await expect(page.locator('#credit-hy svg')).toHaveAttribute('aria-label',before);
  }
  await capture('#credit-spreads','credit-aged');
  await page.evaluate(()=>drawTrend({...lastData,history_seed:[
   {week:'11-01',red_pct:0,risk_score:20},{week:'11-08',red_pct:70,risk_score:85},{week:'11-15',red_pct:100,risk_score:100}
  ]}));
  const chart=page.locator('#trend-chart-wrap');
  if(variant==='after') {
   await expect(chart).toContainText('100%');
   const ys=await chart.locator('circle').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('cy'))));
   expect(ys[4]).toBeGreaterThan(ys[5]); // 70 and 100 must not flatten together.
   expect(ys[1]).toBeGreaterThan(ys[2]); // 85 and 100 remain distinct too.
  }
  await capture('#trend-chart-wrap','trend-full-range');
  const styles=await page.locator('#credit-spreads').evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,fontFamily:s.fontFamily,width:el.getBoundingClientRect().width};});
  writeFileSync(info.outputPath(`${variant}-styles-${width}.json`),JSON.stringify(styles));
  await page.evaluate(()=>drawTrend({...lastData,history_seed:[]}));
  await expect(chart.locator('svg')).toHaveCount(0);
  await expect(chart).toContainText('完整可比观测待累计');
 }
});
