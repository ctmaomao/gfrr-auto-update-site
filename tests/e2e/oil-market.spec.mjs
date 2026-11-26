import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const thermal=JSON.parse(readFileSync('data/oil-thermal-watch.json','utf8'));
// Freeze after the real snapshot and observation, never before a naturally refreshed artifact.
const snapshotNow=Math.max(Date.parse(thermal.generatedAt),Date.parse(thermal.aggregate.latestAcqAt) || 0)+1000;

for(const width of [1440,390])test(`oil page ${width}: truthful evidence and usable navigation`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date(snapshotNow));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).not.toContainText('正在读取');
 await expect(page.locator('#oil-thermal-meta')).toContainText('最近快照');
 await expect(page.locator('#odp-evidence-list .odp-evidence-row')).toHaveCount(11);await expect(page.locator('#oil-routes article')).toHaveCount(8);
 await expect(page.locator('#oil-thermal-count')).toContainText(thermal.aggregate.rowCount.toLocaleString('zh-CN',{maximumFractionDigits:2}));await expect(page.locator('#oil-thermal-baseline')).toContainText('基线');

 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 const artifacts=testInfo.outputPath('oil-page');mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/oil-${width}.png`,fullPage:true});
 writeFileSync(`${artifacts}/styles-${width}.json`,JSON.stringify(await page.locator('body').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,font:s.fontFamily}})));
 await page.locator('#oil-satellite summary').click();await expect(page.locator('#oil-facilities tr')).toHaveCount(thermal.facilities.length);await page.locator('#oil-satellite summary').click();await expect(page.locator('#oil-facilities')).not.toBeVisible();
 await page.getByRole('link',{name:'供需锚',exact:true}).click();await expect(page.locator('#oil-physical')).toHaveAttribute('open','');
 await page.locator('#oil-physical > summary').click();await expect(page.locator('#oil-physical')).not.toHaveAttribute('open','');
 await page.getByRole('link',{name:'供需锚',exact:true}).click();await expect(page.locator('#oil-physical')).toHaveAttribute('open','');
 await expect(page.locator('#odp-evidence-list')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#oil-directional-pressure').screenshot({path:`${artifacts}/oil-details-${width}.png`});
 const oilVerdict=await page.locator('#odp-verdict').textContent();
 await page.getByRole('link',{name:'返回全球雷达，查看同口径结论 →'}).click();await expect(page).toHaveURL(/index.html\?view=radar#oil-directional-pressure/);await expect(page.locator('#odp-verdict')).toHaveText(oilVerdict);await expect(page.locator('#odp-evidence-list')).toHaveCount(0);await expect(page.locator('.odp-after-verdict-fold')).toHaveCount(0);await page.locator('#oil-directional-pressure').screenshot({path:`${artifacts}/radar-conclusion-${width}.png`});
 await page.goBack();await expect(page.locator('#odp-verdict')).not.toContainText('待读取');
});
test('oil data load failures never retain figures or imply safety',async({page},testInfo)=>{await page.setViewportSize({width:390,height:1000});await page.route('**/data/*.json',route=>route.abort());await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).toContainText('部分数据未加载');await expect(page.locator('#oil-brent')).toHaveText('—');await expect(page.locator('#oil-thermal-count')).toHaveText('数据不可用');await expect(page.locator('#odp-verdict')).toHaveText('数据不可用');await expect(page.locator('#odp-headline')).toContainText('数据未能加载');await page.screenshot({path:testInfo.outputPath('oil-missing-390.png'),fullPage:true});});

test('expired thermal observations remain explicit history',async({page},testInfo)=>{await page.setViewportSize({width:390,height:1000});await page.clock.setFixedTime(new Date(snapshotNow+49*3600000));await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).not.toContainText('正在读取');await expect(page.locator('#oil-thermal-meta')).toContainText('历史／超龄');await expect(page.locator('#oil-thermal-meta')).toContainText('不作当前判断');await page.locator('#oil-satellite').screenshot({path:testInfo.outputPath('oil-expired-390.png')});});

for(const [label,estimate,observed,warning,width=390,tankers=1] of [
 ['source-zero',0,'2026-11-15','源报油轮运输量估计为0'],
 ['missing',null,'2026-11-15','油轮运输量估计缺失'],
 ['reported-mobile',15038,'2026-11-15',null],
 ['reported-desktop',15038,'2026-11-15',null,1440],
 ['reported-without-count',15038,'2026-11-15',null,390,null],
 ['stale-reported',15038,'2026-10-01',null],
 ['invalid-negative',-1,'2026-11-15','油轮运输量估计缺失'],
 ['stale-zero',0,'2026-10-01','源报油轮运输量估计为0'],
])test(`oil route ${label}: trade estimate is not available capacity`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.clock.setFixedTime(new Date('2026-11-16T00:00:00Z'));
 const radar=JSON.parse(readFileSync('data/radar-data.json','utf8'));
 radar.macroDrivers.energyTransport.chokepoints.hormuz={latest:{nTanker:tankers,capacityTanker:estimate,date:observed},avg30d:{nTanker:2},sourceStatus:'live'};
 await page.route('**/data/radar-data.json',route=>route.fulfill({json:radar}));
 await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).not.toContainText('正在读取');
 const route=page.locator('#oil-routes article').first();await expect(route).toContainText(tankers===null?'— 船次':'1 船次');
 if(warning)await expect(route.locator('.oil-warning')).toContainText(warning);else await expect(route.locator('.oil-warning')).toHaveCount(0);
 await expect(route).not.toContainText('运力代理为零');
 const volume=route.getByText('油轮运输量估计：15,038 公吨',{exact:true});
 if(estimate>0){
  await expect(volume).toBeVisible();
  await expect(volume.locator('xpath=following-sibling::p[1]')).toContainText(observed);
  await expect(volume.locator('xpath=following-sibling::p[1]')).toContainText(label.startsWith('stale')?'超龄':'来源可用');
 }else await expect(volume).toHaveCount(0);
 if(label==='stale-zero')await expect(route).toContainText('超龄');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [1440,390])test(`thermal baseline ${width}: established history is not a comparable snapshot`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.clock.setFixedTime(new Date('2026-11-19T12:00:00Z'));
 await page.route('**/data/oil-thermal-watch.json',route=>route.fulfill({json:{
  module:'oil-thermal-watch',status:'partial',generatedAt:'2026-11-19T11:00:00Z',
  aggregate:{facilityCount:42,facilitiesWithDetections:1,rowCount:1,latestAcqAt:'2026-11-19T10:00:00Z'},
  baseline:{status:'established',sourceReview:{lastSampleAt:'2026-09-05T04:33:15Z'}},
  facilities:Array.from({length:42},(_,i)=>({id:`fixture-${i}`,baselineComparison:{status:'established',reason:'source_coverage_incomplete_or_changed'}})),
 }}));
 await page.goto('/oil-market.html');
 const baseline=page.locator('#oil-thermal-baseline');
 await expect(baseline).toBeVisible();
 await expect(baseline).toContainText('历史基线：已建立（样本截至 2026-09-05 04:33:15 UTC）');
 await expect(baseline).toContainText('本快照可比监测区：0／42。来源不完整或组合改变，全轮基线比较暂停。');
 await expect(baseline).toContainText('比较状态不代表设施运行正常，热源记录也不确认事故。');
 await expect(page.locator('#oil-thermal-meta')).toContainText('来源不完整');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
