import { test, expect } from '@playwright/test';
/* global nvdaDisplayState */
import { validateNvdaRatioRecord } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
import { nvdaEvidenceFixture as fixture } from '../helpers/nvda-evidence-fixture.mjs';

for (const width of [1440,390]) test(`actual single-file NVIDIA policy agrees with backend at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.clock.install({time:new Date('2026-11-04T12:00:00Z')});
  await page.goto('/bubble-watch.html');
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  const cases=[{name:'29 days',record:fixture('2026-10-06'),expected:true},
    {name:'30 days',record:fixture('2026-10-05'),expected:true},
    {name:'31 days after previously qualifying',record:fixture('2026-10-04','2026-11-03'),expected:false},
    {name:'fresh prior-day proof carried unchanged',record:fixture('2026-11-01','2026-11-03'),expected:true},
    {name:'revenue day 120',record:fixture('2026-11-20','2026-11-22'),auditDate:'2026-11-23',expected:true},
    {name:'revenue day 121',record:fixture('2026-11-20','2026-11-22'),auditDate:'2026-11-24',expected:false},
    {name:'future proof',record:fixture('2026-11-01','2026-11-05'),expected:false}];
  for(const limit of [undefined,9000]) {
    const record=fixture('2026-11-01');record.provenance.detail.numerator.freshness.maxAgeDays=limit;
    cases.push({name:`payload policy ${limit}`,record,expected:false});
  }
  const old=fixture('2026-11-01'),n=old.provenance.detail.numerator;
  n.asOfDate='2026-07-28';n.freshness={observationDate:n.asOfDate,asOfDate:'2026-11-04',ageDays:99,maxAgeDays:9000,status:'fresh'};
  cases.push({name:'99 days forged 9000',record:old,expected:false});
  const forged=structuredClone(old);forged.provenance.detail.numerator.freshness.maxAgeDays=30;forged.provenance.detail.numerator.freshness.ageDays=0;
  cases.push({name:'99 days forged fresh age',record:forged,expected:false});
  const changed=fixture('2026-11-01','2026-11-03');changed.provenance.detail.revenue.freshness.ageDays=0;
  cases.push({name:'changed original revenue age',record:changed,expected:false});
  const frontend=await page.evaluate(cases=>cases.map(({record,auditDate='2026-11-04'})=>nvdaDisplayState(record,Date.parse(auditDate+'T12:00:00Z')).qualified),cases);
  for(const [index,c] of cases.entries()) {
    expect(validateNvdaRatioRecord(c.record,c.auditDate??'2026-11-04').length===0,c.name).toBe(c.expected);
    expect(frontend[index],c.name).toBe(c.expected);
  }
});
