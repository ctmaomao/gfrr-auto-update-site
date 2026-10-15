import { test, expect } from '@playwright/test';
import { buildQualifiedAbsFixture } from '../helpers/bubble-qualified-builder.mjs';

for (const width of [1440,390]) for (const failed of [false,true]) {
  test(`insider sample attribution and missing amounts at ${width}px (${failed?'failed':'partial'})`,async({page})=>{
    const fixture=await buildQualifiedAbsFixture({revision:2,duplicateSymbol:'META',insiderHttpStatus:failed?403:200,clock:'2026-10-15T12:00:00Z'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});
    await page.route('**/data/bubble-watch.json*',route=>route.fulfill({json:fixture.output}));
    await page.goto('/bubble-watch.html');
    const card=page.locator('article.indicator').filter({hasText:'内部人交易30/90日样本'});
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('link',{name:'Data: XOOMAR'})).toHaveAttribute('href','https://xoomar.com/markets/api/insiders');
    await expect(card).toContainText('内部人交易数据来源：SEC');
    await expect(card).toContainText('完整性未核实');
    await expect(page.locator('body')).toContainText('本次核验数据中心ABS利差、内部人交易，其余25张卡沿用原观测日期');
    if(failed) {
      await expect(card.locator('.badge.unknown')).toHaveCount(1);
      await expect(card).toContainText('金额与倍数待确认');
      await expect(card).not.toContainText('买入0美元');
    } else {
      await expect(card).toContainText('取得11家合格返回');
      await expect(card).toContainText('1家公司样本暂不可用');
      await expect(card).toContainText('2026-10-14');
    }
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
