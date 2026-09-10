import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('data/radar-data.json','utf8'));
for(const width of [1440,390]) test(`snapshot warning advances while page stays open at ${width}px`,async({page})=>{
  const now=Date.parse('2026-09-12T00:00:00Z');
  const payload={...fixture,updatedAt:new Date(now-(36*60-1)*60000).toISOString(),dailyRealtimeInput:{...fixture.dailyRealtimeInput,healthScore:100}};
  await page.setViewportSize({width,height:950});
  await page.clock.install({time:new Date(now)});
  await page.route('**/data/radar-data.json*',route=>route.fulfill({json:payload}));
  await page.goto('/');await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
  await expect(page.locator('#issue-meta-cache')).toContainText('本期快照');
  const score=await page.locator('#homepage-today-judgment .value').innerText();
  await page.clock.fastForward(2*60000);
  await expect(page.locator('#issue-meta-cache')).toContainText('更新延迟 · 历史快照');
  await expect(page.locator('#hero-data-health')).toContainText('采集时健康度 100/100');
  await expect(page.locator('#hero-data-health')).toContainText('历史快照');
  await expect(page.locator('#homepage-today-judgment .value')).toHaveText(score);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('missing captured health does not leave static healthy defaults',async({page})=>{
  await page.route('**/data/radar-data.json*',route=>route.fulfill({json:{...fixture,dailyRealtimeInput:{...fixture.dailyRealtimeInput,healthScore:null}}}));
  await page.goto('/');await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
  for(const id of ['hero-data-health','detail-health-score','detail-health-score-dd'])await expect(page.locator(`#${id}`)).toContainText('采集时健康度 未知');
  await expect(page.locator('#detail-health-state-word')).toContainText('需关注');
});
