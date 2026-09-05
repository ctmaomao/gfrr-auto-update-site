import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const SAMPLE_WEEKLY_EDITORIAL_OUTPUT = JSON.parse(
  readFileSync('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json', 'utf8'),
);
const OIL_THERMAL_WATCH = JSON.parse(
  readFileSync('data/oil-thermal-watch.json', 'utf8'),
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

function buildApprovedMacroRiskEditorial(data, currentTimestamp) {
  const sourceIds = ['site:score', 'site:module:energy', 'site:module:geopolitical', 'site:module:inflation', 'site:module:liquidity', 'site:module:debt', 'site:module:banking', 'site:market:brent', 'site:market:us10y', 'site:market:vix', 'site:market:hyOas', 'news:official'];
  const modules = ['energy', 'geopolitical', 'inflation', 'liquidity', 'debt', 'banking'];
  return {
    schemaVersion: 'macro-risk-editorial-production-v1',
    status: 'valid',
    displayEnabled: true,
    generatedAt: currentTimestamp,
    sourceDataUpdatedAt: data.updatedAt,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    mode: 'external_ai_macro_risk_editorial',
    output: {
      headlineZh: '风险缓和仍有条件：能源与利率链条尚未完成降温',
      leadZh: '综合分数回落说明广泛金融压力尚未同步扩张，但能源、长端利率与美元仍在高位，风险缓和仍带有明显条件。这里解释的是当前压力，不是危机概率或投资建议。',
      weeklyTimeline: [0, 1, 2].map((index) => ({ date: '2026-08-10', titleZh: `关键脉络 ${index + 1}`, detailZh: '新闻背景与站内结构化数据相互校验。', sourceRefIds: ['news:official', sourceIds[index]] })),
      scoreSynthesis: { assessmentZh: '总分处于近期区间内，能源、地缘与通胀高于信用和银行压力。', sourceRefIds: ['site:score', 'site:market:brent'] },
      keyTensions: [{ titleZh: '利率压力与风险资产韧性', detailZh: '金融条件偏紧但波动率与信用利差尚未全面扩张。', sourceRefIds: ['site:market:us10y', 'site:market:vix', 'site:market:hyOas'] }, { titleZh: '能源与通胀链条', detailZh: '能源压力仍需要物理链和市场价格共同确认。', sourceRefIds: ['site:market:brent', 'site:module:inflation'] }],
      moduleAnalysis: modules.map((module) => ({ module, labelZh: module, score: data.modules[module], assessmentZh: '既有规则分数的只读解释，不改变模块权重。', sourceRefIds: [`site:module:${module}`] })),
      crossMarketAnalysis: [{ assetZh: '原油与通胀', observationZh: '能源价格仍高。', implicationZh: '观察传导持续性。', sourceRefIds: ['site:market:brent'] }, { assetZh: '利率与波动率', observationZh: '长端利率偏高而波动率平稳。', implicationZh: '存在观察性背离。', sourceRefIds: ['site:market:us10y', 'site:market:vix'] }, { assetZh: '信用市场', observationZh: '信用利差尚未扩张。', implicationZh: '系统性确认不足。', sourceRefIds: ['site:market:hyOas'] }],
      historicalComparison: { periodZh: '最近 14 个日度样本', similaritiesZh: '分数仍在近期区间。', differencesZh: '比较只描述同步压力，不构成预测。', sourceRefIds: ['site:score'] },
      watchNext: [{ conditionZh: '能源继续上行', whyItMattersZh: '可能延长通胀压力。', invalidationZh: '油价与物理链同时转松。', sourceRefIds: ['site:market:brent'] }, { conditionZh: '长端利率维持高位', whyItMattersZh: '金融条件继续偏紧。', invalidationZh: '收益率持续回落。', sourceRefIds: ['site:market:us10y'] }, { conditionZh: '信用或波动率扩张', whyItMattersZh: '确认压力扩散。', invalidationZh: '两者保持平稳。', sourceRefIds: ['site:market:vix', 'site:market:hyOas'] }],
      dataGaps: ['新闻仅提供标题与摘要级上下文。'],
      confidence: { level: 'medium', score: 78, reasonZh: '站内结构化数据完整，新闻只用于背景校验。' },
    },
    sourceLedger: sourceIds.map((id) => id === 'news:official'
      ? { id, kind: 'news', sourceName: 'Federal Reserve', sourceClass: 'official', title: 'Official policy update', url: 'https://federalreserve.gov/example' }
      : { id, kind: 'site_structured', sourceName: 'GFRR 站内结构化数据', sourceClass: 'site_structured' }),
    validation: { status: 'pass' },
    qualityReview: { status: 'pass', promotionEligible: false },
    provenance: { humanApproved: false },
    freshness: { artifactGeneratedAt: currentTimestamp, sourceDataUpdatedAt: data.updatedAt, maxAgeHours: 30, isStale: false },
    boundaries: {
      frontendDisplayApproved: true,
      displayOnly: true,
      notInvestmentAdvice: true,
      affectsGfrrScoring: false,
      affectsRiskModules: false,
      affectsTailRiskOverlay: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
    }
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
    qualityReview: {
      status: 'pass',
      promotionEligible: false,
      warnings: ['only one official/cross_checked news reference was used; remaining factual claims require site-indicator corroboration'],
    },
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
      radarData.macroRiskEditorialLayer = buildApprovedMacroRiskEditorial(radarData, currentTimestamp);
      await route.fulfill({ response, json: radarData });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#issue-meta-issue')).toContainText('ISSUE v28.0.10');
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await expect(page.locator('#macro-thematic-cards')).toBeVisible();
    await expect(page.locator('#macro-risk-editorial')).toBeVisible();
    await expect(page.locator('#macro-editorial-title')).toContainText('风险缓和仍有条件');
    await expect(page.locator('.macro-editorial-module-card')).toHaveCount(6);
    await expect(page.locator('.macro-editorial-market-card')).toHaveCount(3);
    await expect(page.locator('#external-ai-auxiliary')).toHaveCount(0);
    const primaryOrder = await page.locator('.macro-overview-shell').evaluate((shell) => [...shell.children].map((element) => element.id || element.className));
    expect(primaryOrder.slice(0, 8)).toEqual([
      'homepage-today-judgment',
      'macro-risk-editorial',
      'wow-key-changes',
      'threshold-block',
      'trend-block',
      'homepage-macro-drivers',
      'homepage-market-temperature',
      'macro-professional-evidence',
    ]);
    const evidence = page.locator('#macro-professional-evidence');
    await expect(evidence).toHaveAttribute('data-editorial-state', 'editorial-visible');
    await expect(evidence).not.toHaveAttribute('open', '');
    await expect(page.locator('#homepage-pressure-sources')).toBeHidden();
    await evidence.locator('> summary').click();
    await expect(page.locator('#homepage-pressure-sources')).toBeVisible();
    await expect(page.locator('#homepage-signal-layers .narrative-item')).toHaveCount(7);
    await expect(page.locator('#homepage-risk-engines .mini-card')).toHaveCount(6);
    await expect(page.locator('#homepage-macro-coherence .mc-row')).toHaveCount(7);
    await page.locator('#oil-directional-pressure .odp-after-verdict-fold').evaluate((element) => { element.open = true; });
    const thermalRequestDiagnostics = OIL_THERMAL_WATCH.aggregate.requestDiagnostics;
    const completedThermalRequests = thermalRequestDiagnostics.logicalRequestCount
      - thermalRequestDiagnostics.failedRequestCount;
    await expect(page.locator('#odp-thermal-request-health')).toContainText(
      `请求完成 ${completedThermalRequests}/${thermalRequestDiagnostics.logicalRequestCount}`,
    );
    await expect(page.locator('#odp-thermal-request-health')).toContainText(
      `最终失败 ${thermalRequestDiagnostics.failedRequestCount}`,
    );
    await expect(page.locator('#odp-thermal-request-health')).toContainText('仅显示脱敏分类计数');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('自动下载源正常');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('命中');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('文档');
    await expect(page.locator('#odp-news-event-web-ngrams-health')).toContainText('不用于当前新闻信号');
    expect(pageErrors).toEqual([]);
  });

  for (const state of ['live', 'fallback', 'missing', 'future']) {
    test(`BoA spending exposes its report month and ${state} state`, async ({ page }) => {
      const now = new Date();
      const offset = state === 'fallback' ? -4 : state === 'future' ? 2 : 0;
      const reportDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString();
      await page.route('**/data/radar-data.json', async (route) => {
        const response = await route.fetch();
        const radarData = await response.json();
        radarData.macroDrivers.consumerRetail.bofaCardSpendingExGasYoY = state === 'missing' ? null : 0.043;
        radarData.macroDrivers.consumerRetail.bofaReportDate = state === 'missing' ? null : reportDate;
        radarData.macroDrivers.consumerRetail.bofaStatus = state === 'future' ? 'live' : state;
        await route.fulfill({ response, json: radarData });
      });
      await page.goto('/index.html');
      await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
      const text = page.locator('#c4-consumer-bofa');
      if (state === 'missing' || state === 'future') {
        await expect(text).toHaveText('— · 缺少可用报告');
      } else {
        await expect(text).toHaveText(`+4.3% YoY · ${reportDate.slice(0, 7)}报告 · ${state === 'fallback' ? '沿用旧值' : '已更新'}`);
      }
    });
  }

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
    await expect(page.locator('.weekly-editorial-meta')).toContainText('置信度 中等 · 58/100');
    await expect(page.locator('.weekly-editorial-meta')).toContainText('质量 通过');
    await expect(page.locator('.editorial-source .source-class').first()).toContainText('站内结构化');
    await expect(page.locator('.editorial-review-warning')).toContainText('本周期仅使用 1 条官方或交叉确认新闻');
    await expect(page.locator('#weekly-editorial')).not.toContainText('site_structured');
    await expect(page.locator('#weekly-editorial')).not.toContainText('cross_checked');
    await expect(page.locator('#weekly-editorial')).not.toContainText('only one official');
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

  test('homepage stays usable when ancillary data is missing and macro editorial is ineligible', async ({ page }) => {
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
      radarData.macroRiskEditorialLayer = {
        ...buildApprovedMacroRiskEditorial(radarData, new Date().toISOString()),
        displayEnabled: false,
        status: 'fallback',
      };
      await route.fulfill({ response, json: radarData });
    });

    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#homepage-today-judgment')).toBeVisible();
    await expect(page.locator('#macro-risk-editorial')).toBeHidden();
    await expect(page.locator('#external-ai-auxiliary')).toHaveCount(0);
    const evidence = page.locator('#macro-professional-evidence');
    await expect(evidence).toHaveAttribute('data-editorial-state', 'deterministic-fallback');
    await expect(evidence).toHaveAttribute('open', '');
    await expect(page.locator('#macro-professional-evidence-status')).toContainText('已展开确定性依据');
    await expect(page.locator('#homepage-pressure-sources')).toBeVisible();
    await expect(page.locator('#homepage-signal-layers')).toBeVisible();
    await expect(page.locator('#homepage-risk-engines')).toBeVisible();
    await expect(page.locator('#homepage-cross-validation')).toBeVisible();
    await expect(page.locator('#homepage-macro-coherence')).toBeVisible();
    await expect(page.locator('#trend-line-score')).toHaveAttribute('points', '');
    await expect(page.locator('#trend-line-overlay')).toHaveAttribute('points', '');
    await expect(page.locator('#trend-dots-score circle')).toHaveCount(0);
    await expect(page.locator('#trend-dots-overlay circle')).toHaveCount(0);
    await expect(page.locator('#trend-overlay-mode')).toHaveText('升档层(Overlay)数据不足');
    await expectNoHorizontalOverflow(page);
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
