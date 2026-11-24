/* global document, getComputedStyle */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

for (const width of [1440, 390]) {
  test(`retained source coverage remains visible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-23T23:00:00Z'));
    const data = JSON.parse(readFileSync('data/bubble-watch.json', 'utf8'));
    const row = data.indicators.find(item => item.id === 'neocloud_credit');
    // Deterministic diagnostics fixture; later production refreshes cannot erase this case.
    for (const [id, reasonCode] of [['neocloud_credit', 'neocloud_current_coverage_unconfirmed'], ['vc_ai_share', 'vc_current_period_unconfirmed']]) {
      const item = data.indicators.find(candidate => candidate.id === id);
      item.as_of = '2026-11-08';
      item.provenance = { ...item.provenance, mode: 'auto_fallback', evidenceGate: {
        policy: 'bubble-evidence-gap-v1', reasonCode, checkedAt: '2026-11-10', checks: [{ source: 'registered source', status: 'ok' }]
      } };
    }
    row.status = 'green'; row.value_display = '0 项已确认事件';
    const original = { status: row.status, value: row.value_display };
    await page.route('**/data/bubble-watch.json?*', route => route.fulfill({ json: data }));
    await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.fulfill({ status: 404, body: '' }));
    const card = page.locator('section.category article.indicator').filter({ has: page.locator('.name-en', { hasText: /^Neocloud Credit Events$/ }) });
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      const styles = await card.evaluate(el => { const s = getComputedStyle(el); return { background: s.backgroundColor, color: s.color, fontFamily: s.fontFamily, width: el.getBoundingClientRect().width }; });
      await writeFile(testInfo.outputPath(`${name}-${width}-styles.json`), JSON.stringify(styles, null, 2));
      await card.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`) });
    };
    const arr = data.indicators.find(item => item.id === 'arr_2nd_deriv');
    arr.status = 'unknown';
    arr.note = '自动候选最新里程碑 2026-05-28 也已过期（179 天）。';
    arr.evidence_gap = { policy: 'arr-observation-eligibility-v1' };
    data.as_of_date = '2026-11-23';
    await page.goto('/bubble-watch.html');
    const arrCard = page.locator('section.category article.indicator').filter({ has: page.locator('.name-en', { hasText: /^AI ARR 2nd Derivative$/ }) });
    await expect(arrCard.locator('.note').first()).toContainText('SaaStr 报道日期为 2026-05-28');
    await expect(arrCard.locator('.arr-issuer-context')).toContainText('2026-10-31，公司年化收入运行率约 810 亿美元');
    await expect(arrCard.locator('.status-bar')).toHaveClass('status-bar unknown');
    await expect(card.locator('.source-coverage-notice')).toContainText('0 项不代表当前已确认没有信用事件');
    await expect(card.locator('.source-coverage-notice')).toContainText('更新核验 2026-11-10');
    await expect(card.locator('.number')).toHaveText('本期覆盖待确认');
    await expect(card.locator('.note').first()).toContainText('历史快照（2026-11-08）：0 项已确认事件。已发布总分仍按该快照的绿灯计算');
    await expect(card.locator('.status-bar')).toHaveClass('status-bar retained-coverage');
    await expect(card.locator('.badge.retained-coverage')).toHaveText('覆盖待核');
    const vc = page.locator('section.category article.indicator').filter({ has: page.locator('.name-en', { hasText: /^AI \/ Total VC Funding$/ }) });
    await expect(vc.locator('.source-coverage-notice')).toContainText('同一期间的合格全球 AI 创投占比');
    await capture('coverage-fallback');
    await vc.screenshot({ path: testInfo.outputPath(`coverage-vc-${width}.png`) });
    // A subsequent successfully published observation must not inherit the warning.
    row.provenance.mode = 'auto';
    delete row.provenance.evidenceGate;
    data.as_of_date = '2026-11-18';
    await page.reload();
    await expect(arrCard.locator('.arr-issuer-context')).toHaveCount(0);
    await expect(card.locator('.source-coverage-notice')).toHaveCount(0);
    await expect(card.locator('.number')).toHaveText(original.value);
    await capture('coverage-normal');
  });
}
