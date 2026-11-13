import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page = fs.readFileSync(new URL('../../bubble-watch.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf('function strictEvidenceDate('), page.indexOf('function evidenceFreshnessAtAudit('))
  + page.slice(page.indexOf('function technicalObservationLabel('), page.indexOf('function renderMarketTechnicalHeat('));
const { technicalObservationLabel: label } = vm.runInNewContext(`${code}; ({ technicalObservationLabel });`, { DAY: 86400000 });
const now = Date.parse('2026-11-13T23:59:00Z');
const panel = { status: 'green', as_of_date: '2026-11-09', generated_at: '2026-11-13T23:58:00Z', basket: { latestDate: '2026-11-09' } };
test('technical snapshot exposes its own observation date, not generated time or issue date', () => {
  assert.match(label(panel, now), /价格观察截至 2026-11-09 · 已过4天/);
  assert.match(label(panel, now + 86400000), /已过5天/);
  assert.match(label(panel, now), /非实时行情；灯色保留发布口径/);
});
test('unavailable, missing, invalid, future and conflicting dates do not look current', () => {
  assert.match(label({ ...panel, status: 'unavailable' }, now), /观测暂缺/);
  for (const date of [null, '', '2026-02-30', '2026-11-14', '2026-11-10']) {
    assert.match(label({ ...panel, basket: { latestDate: date } }, now), /待核验/);
  }
  assert.match(label(panel, NaN), /待核验/);
});
test('renderer and long-open tabs both expose observation clock, without advertising unconnected fallback', () => {
  assert.match(page, /technicalObservationLabel\(panel\)/);
  assert.match(page, /technicalObservationLabel\(lastData.market_technical_heat\)/);
  assert.match(page, /候选来源尚未接入，不代表已有多源确认/);
  assert.doesNotMatch(page, /备用口径: \$\{escapeHtml\('其它公开价格源'\)\}/);
});

test('credit proxy limits are visible text rather than hover-only titles', () => {
  assert.match(page, /<div class="credit-notice">美国广义公司债市场代理，并非 AI 企业或数据中心专属利差；独立日更，不改变上方周度评分。<\/div>/);
  assert.match(page, /desc: 'CCC 及以下市场代理'/);
  assert.match(page, /desc: '投资级公司债市场代理'/);
});
