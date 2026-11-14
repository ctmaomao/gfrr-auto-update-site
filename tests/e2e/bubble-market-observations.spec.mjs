import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('data/bubble-watch.json', 'utf8'));
const now = new Date();
const checkedAt = now.toISOString();
const observationDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
function fixture() {
  return { contractVersion:'bubble-market-observations-v1', boundary:'display_only_no_score_or_editorial_impact', checkedAt,
    observations:[
      { id:'cape', value:40.24, sourceUrl:'https://www.multpl.com/shiller-pe/atom' },
      { id:'top5_weight', value:27.77, sourceUrl:'https://stockanalysis.com/etf/spy/holdings/' },
      { id:'nvda_fpe', value:14.75, sourceUrl:'https://stockanalysis.com/stocks/nvda/statistics/' },
      { id:'spy_vs_rsp_6m', value:0, sourceUrl:'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=6mo&interval=1d' }
    ].map(row=>({ ...row, maxAgeDays:7, observationDate, fetchedAt:checkedAt, status:'fresh' })) };
}
async function setup(page) {
  await page.clock.install({ time:now });
  await page.route('**/data/bubble-watch.json*', route=>route.fulfill({json:baseline}));
  await page.route('**/data/bubble-watch-editorial-status.json*', route=>route.fulfill({status:404,body:''}));
}
for (const width of [1440,390]) test(`Independent market observations retain weekly issue at ${width}px`,async({page},testInfo)=>{
  await setup(page); await page.setViewportSize({width,height:1000});
  let release; const wait=new Promise(resolve=>{release=resolve;});
  await page.route('**/data/bubble-market-observations.json*', async route=>{await wait;await route.fulfill({json:fixture()});});
  await page.goto('/bubble-watch.html');
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  await expect(page.locator('#market-observations')).toContainText('待确认');
  const selectors=['.headline','.axes','#trend-chart-wrap','.issue-meta','section.category'];
  const before=await Promise.all(selectors.map(s=>page.locator(s).allInnerTexts()));
  release();
  await expect(page.locator('[data-market-id="cape"]')).toContainText('40.24 倍');
  await expect(page.locator('[data-market-id="spy_vs_rsp_6m"]')).toContainText('0.00 个百分点');
  await expect(page.locator('#market-observations')).toContainText(`周度评分依据：${baseline.as_of_date}`);
  await expect(page.locator('#market-observations')).toContainText(`观测 ${observationDate}`);
  await expect(page.locator('#market-observations')).toContainText('不改变本期评分、证据卡、期号或文章');
  expect(await Promise.all(selectors.map(s=>page.locator(s).allInnerTexts()))).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('#market-observations a')).toHaveCount(4);
  await page.locator('#market-observations').scrollIntoViewIfNeeded();
  const screenshotPath=testInfo.outputPath(`market-observations-${width}.png`);
  await page.screenshot({path:screenshotPath,fullPage:false});
  await testInfo.attach(`market-observations-${width}`, { path:screenshotPath, contentType:'image/png' });
  const styles=await page.locator('#market-observations').evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el.querySelector('h3')).fontFamily,background:getComputedStyle(document.body).backgroundColor}));
  const stylesPath=testInfo.outputPath(`market-observations-styles-${width}.json`);
  fs.writeFileSync(stylesPath,JSON.stringify(styles));
  await testInfo.attach(`market-observations-styles-${width}`, { path:stylesPath, contentType:'application/json' });
});
test('Market fallback keeps original date, ages on long-open tab, and missing fetch leaves weekly view usable',async({page})=>{
  await setup(page); const data=fixture();data.observations[0].status='fallback';
  await page.route('**/data/bubble-market-observations.json*',route=>route.fulfill({json:data}));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('[data-market-id="cape"]')).toContainText('沿用原观测');
  await page.clock.setSystemTime(new Date(now.getTime()+8*86400000));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('[data-market-id="cape"]')).toContainText('已超过 7 天');
  await expect(page.locator('[data-market-id="cape"]')).toContainText(observationDate);
  await expect(page.locator('[data-market-id="nvda_fpe"]')).toContainText('仅作历史参考');
  await page.unroute('**/data/bubble-market-observations.json*');
  await page.route('**/data/bubble-market-observations.json*',route=>route.fulfill({status:404,body:''}));
  await page.reload();
  await expect(page.locator('#market-observations')).toContainText('独立快照暂不可用');
  await expect(page.locator('.market-observation-value')).toHaveText(['待确认','待确认','待确认','待确认']);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
});
test('Unqualified values, dates and sources never become displayed numbers or executable links',async({page})=>{
  await setup(page);const data=fixture();
  data.observations[0].value=null;
  data.observations[1].value='27.77';
  data.observations[2].observationDate='2099-01-01';
  data.observations[3].sourceUrl='javascript:alert(1)';
  await page.route('**/data/bubble-market-observations.json*',route=>route.fulfill({json:data}));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('.market-observation-value')).toHaveText(['待确认','待确认','待确认','待确认']);
  await expect(page.locator('#market-observations a')).toHaveCount(0);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
});
test('Duplicate IDs fail that row while good rows survive; a wrong boundary rejects the snapshot',async({page})=>{
  await setup(page);const data=fixture(); data.observations.push({...data.observations[0]});
  await page.route('**/data/bubble-market-observations.json*',route=>route.fulfill({json:data}));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('[data-market-id="cape"]')).toContainText('待确认');
  await expect(page.locator('[data-market-id="nvda_fpe"]')).toContainText('14.75 倍');
  data.boundary='score_input'; await page.reload();
  await expect(page.locator('.market-observation-value')).toHaveText(['待确认','待确认','待确认','待确认']);
});

test('Known host with wrong instrument path and implausible numeric bounds remain unknown',async({page})=>{
  await setup(page);const data=fixture();
  data.observations[0].value=100;
  data.observations[1].value=60;
  data.observations[2].sourceUrl='https://stockanalysis.com/stocks/aapl/statistics/';
  data.observations[3].value=10000;
  await page.route('**/data/bubble-market-observations.json*',route=>route.fulfill({json:data}));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('.market-observation-value')).toHaveText(['待确认','待确认','待确认','待确认']);
  await expect(page.locator('#market-observations a')).toHaveCount(0);
});
