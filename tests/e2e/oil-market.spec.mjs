import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const thermal=JSON.parse(readFileSync('data/oil-thermal-watch.json','utf8'));

for(const width of [1440,390])test(`oil page ${width}: truthful evidence and usable navigation`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date('2026-11-15T21:00:00Z'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).not.toContainText('正在读取');
 await expect(page.locator('#oil-weekly tr')).toHaveCount(8);await expect(page.locator('#oil-routes article')).toHaveCount(8);
 await expect(page.locator('#oil-thermal-count')).toContainText(thermal.aggregate.rowCount.toLocaleString('zh-CN',{maximumFractionDigits:2}));await expect(page.locator('#oil-thermal-baseline')).toContainText('基线');

 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 const artifacts=testInfo.outputPath('oil-page');mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/oil-${width}.png`,fullPage:true});
 writeFileSync(`${artifacts}/styles-${width}.json`,JSON.stringify(await page.locator('body').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,font:s.fontFamily}})));
 await page.locator('summary').click();await expect(page.locator('#oil-facilities tr')).toHaveCount(thermal.facilities.length);await page.locator('summary').click();await expect(page.locator('#oil-facilities')).not.toBeVisible();
 await page.getByRole('link',{name:'返回全球雷达，查看同口径结论 →'}).click();await expect(page).toHaveURL(/index.html\?view=radar#oil-directional-pressure/);await expect(page.locator('#odp-verdict')).not.toHaveText('—');
 await page.goBack();await expect(page.locator('#oil-verdict')).not.toContainText('待读取');
});
test('oil data load failures never retain figures or imply safety',async({page})=>{await page.route('**/data/*.json',route=>route.abort());await page.goto('/oil-market.html');await expect(page.locator('#oil-load-status')).toContainText('部分数据未加载');await expect(page.locator('#oil-brent')).toHaveText('—');await expect(page.locator('#oil-thermal-count')).toHaveText('数据不可用');await expect(page.locator('#oil-verdict')).toContainText('数据不足');});
