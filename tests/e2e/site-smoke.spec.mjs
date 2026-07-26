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

async function gotoBubbleWatch(page) {
  const dataResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/data/bubble-watch.json');
  });
  await page.goto('/bubble-watch.html');
  const dataResponse = await dataResponsePromise;
  expect(dataResponse.ok()).toBeTruthy();
  return dataResponse.json();
}

async function expectBubbleWatchContract(page, data) {
  await expect(page.locator('#root .masthead')).toBeVisible();
  await expect(page.locator('section.category')).toHaveCount(6);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  await expect(page.locator('.score-role.core')).toHaveCount(23);
  await expect(page.locator('.score-role.shadow')).toHaveCount(4);
  await expect(page.locator('.big-number .value')).toContainText(data.summary.red_pct.toFixed(1));
  await expect(page.locator('.big-number .footer')).toContainText(
    `${data.summary.scoring_red_count} / CORE-${data.summary.scoring_total_indicators}`
  );
  await expect(page.locator('.axes-header .now')).toContainText(
    `泡沫成熟度 ${data.summary.stage_score.toFixed(0)} · 破裂临近度 ${data.summary.trigger_score.toFixed(0)}`
  );
  await expect(page.locator('#trend-chart-wrap svg')).toHaveAttribute('aria-label', /Core-23/u);
  await expect(page.locator('body')).not.toContainText('undefined');
  await expect(page.locator('body')).not.toContainText('[object Object]');
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    trendWidth: document.querySelector('#trend-chart-wrap')?.getBoundingClientRect().width ?? 0,
    trendSvgWidth: document.querySelector('#trend-chart-wrap svg')?.getBoundingClientRect().width ?? 0
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.trendSvgWidth).toBeLessThanOrEqual(dimensions.trendWidth + 1);
}

async function bubbleGridColumns(page) {
  return page.evaluate(() => ({
    headlineColumns: getComputedStyle(document.querySelector('.headline')).gridTemplateColumns
      .split(/\s+/u).filter(Boolean).length,
    axesColumns: getComputedStyle(document.querySelector('.axes-grid')).gridTemplateColumns
      .split(/\s+/u).filter(Boolean).length
  }));
}

test.describe('desktop smoke', () => {
  test.use({ viewport: DESKTOP });

  test('homepage renders the current data snapshot', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.route('**/data/radar-data.json', async (route) => {
      const response = await route.fetch();
      const radarData = await response.json();
      const currentTimestamp = new Date().toISOString();
      radarData.externalAiInterpretationLayer = {
        ...radarData.externalAiInterpretationLayer,
        generatedAt: currentTimestamp,
        freshness: {
          ...radarData.externalAiInterpretationLayer?.freshness,
          artifactGeneratedAt: currentTimestamp,
          sourceDataUpdatedAt: currentTimestamp,
          isStale: false,
        },
      };
      await route.fulfill({ response, json: radarData });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#issue-meta-issue')).toContainText('ISSUE v28.0.10');
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await expect(page.locator('#macro-thematic-cards')).toBeVisible();
    await expect(page.locator('#external-ai-auxiliary')).toBeVisible();
    await page.locator('#external-ai-auxiliary').evaluate((element) => { element.open = true; });
    await expect(page.locator('#ext-ai-provider')).toHaveText('deepseek');
    await expect(page.locator('#ext-ai-structured-output')).toBeVisible();
    await expect(page.locator('#ext-ai-boundaries-text')).toContainText('不参与平台的风险打分与决策');
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
    const data = await gotoBubbleWatch(page);
    await expectBubbleWatchContract(page, data);
    await expectNoHorizontalOverflow(page);
    expect(await bubbleGridColumns(page)).toEqual({ headlineColumns: 2, axesColumns: 2 });
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
    const data = await gotoBubbleWatch(page);
    await expectBubbleWatchContract(page, data);
    await expectNoHorizontalOverflow(page);
    expect(await bubbleGridColumns(page)).toEqual({ headlineColumns: 1, axesColumns: 1 });
    expect(pageErrors).toEqual([]);
  });

  test('Bubble Watch fails closed when its dedicated JSON is unavailable', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.route('**/data/bubble-watch.json*', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#root .error')).toContainText('数据加载失败: HTTP 503');
    await expect(page.locator('section.category article.indicator')).toHaveCount(0);
    await expect(page.locator('#trend-chart-wrap svg')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
  });
});
