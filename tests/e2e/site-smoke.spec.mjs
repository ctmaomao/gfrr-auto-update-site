import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const SAMPLE_WEEKLY_EDITORIAL_OUTPUT = JSON.parse(
  readFileSync('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json', 'utf8'),
);

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

function buildApprovedVisibleExternalAiLayer(layer, currentTimestamp) {
  return {
    ...layer,
    schemaVersion: 'v28.0L-external-ai-production-analyst-1',
    status: 'valid',
    displayEnabled: true,
    sourceMode: 'manual_analyst_compact_v1',
    inputSource: 'analyst_compact_v1',
    sourceSemantics: 'site_structured_analyst_evidence_pack_v1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    generatedAt: currentTimestamp,
    boundaries: {
      ...layer?.boundaries,
      frontendDisplayApproved: true,
      displayOnly: true,
      externalAiGenerated: true,
      usesExternalAiApi: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true,
      productionWriteApproved: false,
    },
    qualityReview: {
      ...layer?.qualityReview,
      status: 'pass',
      recommendation: 'pass_for_manual_review',
      promotionEligible: false,
    },
    provenance: {
      ...layer?.provenance,
      humanApproved: false,
    },
    freshness: {
      ...layer?.freshness,
      artifactGeneratedAt: currentTimestamp,
      sourceDataUpdatedAt: currentTimestamp,
      maxAgeHours: 24,
      isStale: false,
    },
    dataQualityLens: layer?.dataQualityLens || {
      summaryZh: '站内结构化数据质量满足展示测试要求。',
      confidenceImpactZh: '仅验证只读解释层的展示边界。',
      staleLayers: [],
      fallbackLayers: [],
      missingLayers: [],
    },
  };
}

function buildApprovedBubbleWeeklyEditorial(data, currentTimestamp) {
  const output = {
    ...SAMPLE_WEEKLY_EDITORIAL_OUTPUT,
    generatedAt: currentTimestamp,
    asOfDate: data.as_of_date,
  };
  return {
    schemaVersion: 'bubble-watch-weekly-editorial-production-v1',
    status: 'valid',
    displayEnabled: true,
    generatedAt: currentTimestamp,
    updatedAt: currentTimestamp,
    asOfDate: data.as_of_date,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    mode: 'external_ai_weekly_editorial',
    sourceMode: 'weekly_news_and_site_structured_compact_v1',
    output,
    sourceLedger: [
      { id: 'indicator:cape', kind: 'indicator', sourceName: 'Bubble Watch CAPE', sourceClass: 'site_structured' },
      { id: 'news:earnings-sample', kind: 'news', sourceName: 'Issuer', sourceClass: 'official', title: 'Fixture issuer earnings', url: 'https://issuer.example/earnings-sample', domain: 'issuer.example' },
      { id: 'news:financing-sample', kind: 'news', sourceName: 'News A', sourceClass: 'cross_checked', title: 'Fixture financing context', url: 'https://news-a.example/ai-financing-sample', domain: 'news-a.example' },
    ],
    validation: { status: 'pass' },
    qualityReview: { status: 'pass', promotionEligible: false, warnings: [] },
    provenance: { humanApproved: false },
    freshness: { artifactGeneratedAt: currentTimestamp, sourceAsOfDate: data.as_of_date, maxAgeHours: 240, isStale: false },
    boundaries: {
      displayOnly: true,
      frontendDisplayApproved: true,
      affectsBubbleWatchScoring: false,
      affectsCore23: false,
      affectsShadow4: false,
      affectsStageTrigger: false,
      affectsGfrrScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
    },
  };
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
      radarData.externalAiInterpretationLayer = buildApprovedVisibleExternalAiLayer(
        radarData.externalAiInterpretationLayer,
        currentTimestamp,
      );
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
    await page.locator('#oil-directional-pressure .odp-after-verdict-fold').evaluate((element) => { element.open = true; });
    await expect(page.locator('#odp-thermal-request-health')).toContainText('请求完成 126/126');
    await expect(page.locator('#odp-thermal-request-health')).toContainText('最终失败 0');
    await expect(page.locator('#odp-thermal-request-health')).toContainText('仅显示脱敏分类计数');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('自动下载源正常');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('命中');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('文档');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('不用于当前新闻信号');
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
    await page.route('**/data/bubble-watch.json*', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.summary.weekly_editorial = buildApprovedBubbleWeeklyEditorial(data, new Date().toISOString());
      await route.fulfill({ response, json: data });
    });
    const data = await gotoBubbleWatch(page);
    await expectBubbleWatchContract(page, data);
    await expect(page.locator('#weekly-editorial')).toBeVisible();
    await expect(page.locator('.verdict h2')).toHaveText(data.summary.weekly_editorial.output.headlineZh);
    await expect(page.locator('.editorial-timeline-item')).toHaveCount(3);
    await expect(page.locator('.editorial-category-grid .editorial-plain-item')).toHaveCount(6);
    await expect(page.locator('.editorial-source')).toHaveCount(3);
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
    await page.route('**/data/bubble-watch.json*', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.summary.weekly_editorial = buildApprovedBubbleWeeklyEditorial(data, new Date().toISOString());
      await route.fulfill({ response, json: data });
    });
    const data = await gotoBubbleWatch(page);
    await expectBubbleWatchContract(page, data);
    await expect(page.locator('#weekly-editorial')).toBeVisible();
    const editorialColumns = await page.locator('.editorial-category-grid').evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/u).filter(Boolean).length,
    );
    expect(editorialColumns).toBe(1);
    await expectNoHorizontalOverflow(page);
    expect(await bubbleGridColumns(page)).toEqual({ headlineColumns: 1, axesColumns: 1 });
    expect(pageErrors).toEqual([]);
  });

  test('Bubble Watch falls back to deterministic verdict when weekly editorial is stale', async ({ page }) => {
    const pageErrors = capturePageErrors(page);
    await page.route('**/data/bubble-watch.json*', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const staleTimestamp = new Date(Date.now() - 241 * 60 * 60 * 1000).toISOString();
      data.summary.weekly_editorial = buildApprovedBubbleWeeklyEditorial(data, staleTimestamp);
      await route.fulfill({ response, json: data });
    });
    const data = await gotoBubbleWatch(page);
    await expect(page.locator('#weekly-editorial')).toHaveCount(0);
    await expect(page.locator('.verdict h2')).toHaveText(data.summary.verdict_label);
    await expect(page.locator('.verdict p')).toHaveText(data.summary.verdict_desc);
    await expectNoHorizontalOverflow(page);
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
