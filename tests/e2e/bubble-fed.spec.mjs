import {test,expect}from'@playwright/test';
import {buildQualifiedAbsFixture}from'../helpers/bubble-qualified-builder.mjs';
for(const width of [1440,390])for(const pending of [false,true])test(`Fed 3/6-month ${pending?'pending':'known'} at ${width}px`,async({page})=>{
 const r=await buildQualifiedAbsFixture({revision:4,clock:'2026-10-15T12:00:00Z',fedOptions:pending?{statusSource:'calendar',status:403}:{}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:1000});
 await page.route('**/data/bubble-watch.json*',route=>route.fulfill({json:r.output}));
 await page.goto('/bubble-watch.html');
 const card=page.locator('article.indicator').filter({hasText:'Fed 3/6个月隐含路径'});
 await expect(card).toHaveCount(1);await expect(card.locator(`.badge.${pending?'unknown':'red'}`)).toHaveCount(1);
 await expect(card).toContainText('Yahoo联邦基金期货日线代理');
 await expect(card).toContainText('不是下次会议');
 if(pending){await expect(card).toContainText('路径数值待确认');await expect(card).toContainText('观测暂缺，核验于2026-10-15');}
 else{
  const proof=r.output.indicators.find(i=>i.id==='fed_policy').provenance.detail;
  await expect(card).toContainText(`同期实际有效联邦基金利率${proof.sourceEvidence.baseline.value}%`);
  for(const p of proof.result.paths){
   await expect(card).toContainText(p.targetDate);
   await expect(card).toContainText(`隐含有效利率约${p.expectedRatePct.toFixed(3)}%`);
   await expect(card).toContainText(`较同期实际利率${p.deltaBp>=0?'+':''}${p.deltaBp.toFixed(1)}基点`);
  }
  await expect(card).toContainText('2026-10-13');await expect(card).toContainText('期货风险溢价、临时会议');
 }
 const range=r.output.summary.primary_score_range_pct;
 await expect(page.locator('.headline .big-number .bound')).toHaveText([`${range.lower.toFixed(1)}%`,`${range.upper.toFixed(1)}%`]);
 await expect(page.locator('body')).toContainText('其余23张卡沿用原观测日期');
 await expect(page.locator('section.category article.indicator')).toHaveCount(27);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
