import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const base=JSON.parse(readFileSync('data/world-order-stress.json','utf8'));
for(const width of [1440,390])test(`legacy energy fallback uses event units at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});
  const world=structuredClone(base);
  world.externalSources.gdelt={status:'ok',lastFetchedAt:'2026-09-10T00:00:00Z',summary:{totalEvents:7,conflictEvents:7,totalArticles:999,regionsCovered:['Iran']}};
  await page.route('**/data/oil-news-event-watch.json*',route=>route.fulfill({status:404,body:''}));
  await page.route('**/data/world-order-stress.json*',route=>route.fulfill({json:world}));
  await page.goto('/');await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
  const counter=page.locator('#odp-news-event-window');
  await expect(counter).toContainText('7 起事件（按国家汇总）');
  await expect(counter).toContainText('去重报道数未知');
  await expect(counter).not.toContainText('999');
  await counter.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
