import { expect, test } from '@playwright/test';

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

function capturePageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function captureConsoleErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('desktop smoke', () => {
  test.use({ viewport: DESKTOP });

  test('homepage renders the current data snapshot', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#issue-meta-issue')).toContainText('ISSUE v28.0.10');
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await expect(page.locator('#macro-thematic-cards')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('trend tolerates a missing weekly date without keeping the static placeholder', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);
    await page.route('**/data/radar-history.json*', async (route) => {
      const response = await route.fetch();
      const history = await response.json();
      history.at(-8).date = null;
      await route.fulfill({ response, json: history });
    });

    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#trend-line-score')).toHaveAttribute('aria-label', /Risk score trend/u);
    await expect(page.locator('#trend-line-score')).not.toHaveAttribute('aria-label', /null/u);
    expect(consoleErrors).toEqual([]);
  });

  test('Bubble Watch renders indicators and trend SVG', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#root .masthead')).toBeVisible();
    await expect(page.locator('#root .indicator').first()).toBeVisible();
    await expect(page.locator('#trend-chart-wrap svg')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('mobile smoke', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('homepage stays usable when ancillary data is missing and External AI is ineligible', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    let missingRequests = 0;
    for (const file of [
      'world-order-stress.json',
      'market-pricing-metrics.json',
      'radar-history.json',
      'oil-directional-pressure.json',
      'oil-thermal-watch.json',
      'oil-news-event-watch.json',
    ]) {
      await page.route(`**/data/${file}*`, async (route) => {
        missingRequests += 1;
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      });
    }
    await page.route('**/data/radar-data.json', async (route) => {
      const response = await route.fetch();
      const radarData = await response.json();
      radarData.externalAiInterpretationLayer = {
        ...radarData.externalAiInterpretationLayer,
        displayEnabled: false,
        status: 'fallback',
      };
      await route.fulfill({ response, json: radarData });
    });

    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await expect(page.locator('#external-ai-auxiliary')).toBeHidden();
    await expect(page.locator('#trend-line-score')).toHaveAttribute('points', '');
    await expect(page.locator('#trend-line-overlay')).toHaveAttribute('points', '');
    await expect(page.locator('#trend-dots-score circle')).toHaveCount(0);
    await expect(page.locator('#trend-dots-overlay circle')).toHaveCount(0);
    await expect(page.locator('#trend-overlay-mode')).toHaveText('升档层(Overlay)数据不足');
    expect(missingRequests).toBe(6);
    expect(pageErrors).toEqual([]);
  });

  test('Bubble Watch renders on a phone viewport', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#root .masthead')).toBeVisible();
    await expect(page.locator('#root .indicator').first()).toBeVisible();
    await expect(page.locator('#trend-chart-wrap svg')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
