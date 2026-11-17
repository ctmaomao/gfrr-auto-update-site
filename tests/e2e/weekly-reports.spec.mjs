import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { splitIssues } from '../../scripts/build-weekly-reports.mjs';
const latest = splitIssues(fs.readdirSync('reports')).recent[0];
const latestDate = latest.slice(0, 10);
const fixedBytes = fs.readFileSync('reports/' + latest);
const latestHtml = fixedBytes.toString('utf8');
const originalBytes = latestDate === '2026-11-09' ? fixedBytes : fs.readFileSync(
  'weekly-originals/' + latestDate + '/' + fs.readFileSync('weekly-originals/' + latestDate + '/identity.sha256', 'utf8').trim() + '.html'
);
const latestSections = (latestHtml.match(/<section\b/gi) || []).length;
const actions = page => page.getByRole('navigation', {name:'周报操作',exact:true});
for (const width of [1440,390]) {
  test('weekly homepage and all four tabs preserve reader paths '+width, async ({page}) => {
    await page.setViewportSize({width,height:900});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');
    await expect(page).toHaveURL(/\/weekly-reports\.html$/);
    expect(latestSections).toBeGreaterThan(0);
    await expect(page.locator('main section:not(.weekly-archive)')).toHaveCount(latestSections);
    await expect(page.locator('.page-bookmarks a')).toHaveCount(4);
    await expect(page.locator('a[aria-current="page"]')).toHaveText('每周周报');
    const downloadLink = actions(page).getByRole('link',{name:'下载单文件HTML',exact:true});
    await expect(downloadLink).toBeVisible();
    await downloadLink.focus();
    await expect(downloadLink).toBeFocused();
    expect((await downloadLink.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/four-nav-weekly-'+width+'.png'});
    await page.locator('main section:not(.weekly-archive)').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/four-nav-markets-'+width+'.png'});
    await page.locator('.page-bookmarks a', {hasText:'全球雷达'}).click();
    await expect(page).toHaveURL(/index\.html\?view=radar$/);
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await page.screenshot({path:'test-results/four-nav-radar-'+width+'.png'});
    await page.locator('.page-bookmarks a', {hasText:'AI泡沫'}).click();
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    await page.screenshot({path:'test-results/four-nav-bubble-'+width+'.png'});
    await page.locator('.page-bookmarks a', {hasText:'油市观察'}).click();
    await expect(page).toHaveURL(/oil-market\.html$/);
    await expect(page.locator('.page-bookmarks a')).toHaveCount(4);
    await expect(page.locator('a[aria-current="page"]')).toHaveText('油市观察');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/four-nav-oil-'+width+'.png'});
    await page.locator('.page-bookmarks a', {hasText:'每周周报'}).click();
    await expect(page).toHaveURL(/weekly-reports\.html$/);
    await page.goBack();
    await expect(page).toHaveURL(/oil-market\.html$/);
    await page.goForward();
    await expect(page).toHaveURL(/weekly-reports\.html$/);
    expect(errors).toEqual([]);
  });
}
test('old anchors, old weekly paths and download remain usable', async ({page})=>{
  await page.goto('/index.html#oil-directional-pressure');
  await expect(page.locator('#oil-directional-pressure')).toBeVisible();
  expect(page.url()).toContain('index.html#oil-directional-pressure');
  await page.goto('/weekly-reports/index.html');
  await expect(page.locator('#history')).toBeAttached();
  const historyLink=actions(page).getByRole('link',{name:'历史周报',exact:true});
  await historyLink.focus();
  await historyLink.press('Enter');
  await expect(page).toHaveURL(/\/weekly-reports\.html#history$/);
  await page.goBack();
  const fixedResponsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/reports/'+latest && response.request().isNavigationRequest());
  await page.locator('#history a').filter({hasText:'阅读固定期次全文'}).first().click();
  await expect(page).toHaveURL(new RegExp('/reports/' + latest.replace('.', '\\.') + '$'));
  expect((await (await fixedResponsePromise).body()).equals(originalBytes),'fixed date route returns the original bytes').toBe(true);
  await expect(page.locator('main section')).toHaveCount(latestSections);
  const compatResponse=await page.goto('/weekly-reports/'+latest);
  expect((await compatResponse.body()).equals(originalBytes),'compatible date route returns the original bytes').toBe(true);
  await page.goto('/weekly-reports/2026-11-09.html');
  await expect(page.locator('.section')).toHaveCount(12);
});
for (const route of ['/weekly-reports.html','/weekly-reports/index.html','/reports/archive.html']) {
  test('weekly shell downloads the unchanged original from '+route, async ({page})=>{
    await page.goto(route);
    const toolbar=actions(page);
    await expect(toolbar.getByRole('link',{name:'历史周报',exact:true})).toBeVisible();
    const [download]=await Promise.all([
      page.waitForEvent('download'),
      toolbar.getByRole('link',{name:'下载单文件HTML',exact:true}).click(),
    ]);
    expect(download.suggestedFilename()).toBe('GFRR_Weekly_' + latestDate + '.html');
    const body=fs.readFileSync(await download.path());
    expect(body.equals(originalBytes),'download contains the exact archived original bytes').toBe(true);
    await expect(page).toHaveURL(new RegExp(route.replace('.', '\\.')+'$'));
  });
}
test('fixed report reads offline without any data service', async ({page})=>{
  await page.context().setOffline(true);
  await page.setContent(latestHtml);
  await expect(page.locator('main section')).toHaveCount(latestSections);
  await page.setContent(fs.readFileSync('reports/2026-11-09.html','utf8'));
  await expect(page.locator('.section')).toHaveCount(12);
  expect(await page.locator('body').evaluate(e=>e.ownerDocument.defaultView.getComputedStyle(e).backgroundColor)).toBe('rgb(251, 247, 240)');
});
