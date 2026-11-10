import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { excerptEligibility, evidenceEligibility, sanitizeNewsStory } from '../../scripts/lib/editorial-news-hygiene.mjs';
import { buildNewsDiscovery as bubbleDiscovery, assessWeeklyEditorialNewsReadiness } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildNewsDiscovery as macroDiscovery, assessEditorialNewsReadiness } from '../../scripts/macro-risk/editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { buildEditorialInput } from '../../scripts/macro-risk/editorial-input.mjs';
import { validateNewsDiscovery as validateBubble } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { validateNewsDiscovery as validateMacro } from '../../scripts/macro-risk/editorial-contract.mjs';
import { collectProvider as collectBubble } from '../../scripts/bubble-watch/collect-weekly-editorial-news.mjs';
import { collectProvider as collectMacro } from '../../scripts/macro-risk/collect-editorial-news.mjs';

// Entirely synthetic marker shapes. Never copy private diagnostic story text.
const coherent = 'Analysts caution that AI construction delays can pressure project cash flows even while long-term demand remains robust; financing outcomes remain uncertain.';
const independent = 'Separate reporting describes delayed infrastructure projects as a possible financing strain, while noting that continued customer demand could support later cash generation.';
const contaminated = [
  { snippet: 'Questions for our editor. ## More Related Content from Publisher ### Garden opening hours ### Museum holiday calendar', reason: 'related_content' },
  { snippet: 'Market newsletter introduction [...] Newsletters Follow company developments Video Catch up on programmes Content Subscribe Sign in Search Topics', reason: 'navigation_contamination' },
  { url: 'https://cnbc.com/video/2026/11/09/synthetic.html', snippet: "An analyst joins 'Squawk Box' to discuss the outlook and more. Watch the next garden opening video and the museum holiday calendar.", reason: 'video_intro_or_listing' },
  { url: 'https://cnbc.com/video/2026/11/09/synthetic.html', snippet: "An analyst joins CNBC's 'Squawk Box' with a look at market issues. Another guest weighs in on museum hours. New garden policy: here is what visitors need to know.", reason: 'video_intro_or_listing' }
];
const row = (extra = {}) => ({ provider: 'brave', topic: 'ai_financing_credit', title: 'AI financing outlook', url: 'https://morningstar.com/bonds/synthetic', publishedAt: '2026-11-09T12:00:00Z', snippet: coherent, ...extra });
const common = { sourceStatus: { brave: { status: 'ok', successCount: 6, failureCount: 0 }, tavily: { status: 'ok', successCount: 6, failureCount: 0 } }, generatedAt: '2026-11-10T00:00:00Z', windowStart: '2026-11-03', windowEnd: '2026-11-10' };
const pipelines = [
  ['Bubble', bubbleDiscovery, assessWeeklyEditorialNewsReadiness, validateBubble, 'ai_financing_credit'],
  ['Macro', macroDiscovery, assessEditorialNewsReadiness, validateMacro, 'credit_liquidity']
];

test('shared hygiene rejects entire mixed/navigation excerpts with bounded reasons', () => {
  for (const { reason, ...extra } of contaminated) {
    const story = row(extra), before = structuredClone(story);
    assert.deepEqual(excerptEligibility(story), { eligible: false, reason });
    assert.equal(sanitizeNewsStory(story).snippet, null);
    assert.deepEqual(story, before);
    assert.ok(!JSON.stringify(excerptEligibility(story)).includes(story.snippet));
  }
});

test('coherent transcripts, primary releases and analytical prose survive without event inference', () => {
  for (const extra of [
    { url: 'https://cnbc.com/video/2026/11/09/analysis.html' },
    { snippet: 'Related content can help explain financing risks, according to analysts; infrastructure delays may pressure cash flow despite resilient long-term demand.' },
    { snippet: 'The most popular models face financing risk. Analysts recommended articles discussing why project delays can pressure cash flows; quoted programme names alone do not establish a measurement.' },
    { snippet: "In a 'Squawk Box' transcript, analysts argue that construction delays can strain cash flow while long-term demand remains uncertain. This is a view, not a measured labour statistic." },
    { url: 'https://nvidia.com/news/official-release', snippet: '(BUSINESS WIRE) Synthetic issuer release: ' + coherent }
  ]) assert.equal(evidenceEligibility(row(extra)).eligible, true);
});

for (const [name, build, readiness, validate, topic] of pipelines) {
  test(`${name}: forward-looking prose remains intact on media and official HTML pages`, () => {
    for (const snippet of [
      "Analysts will watch next week's payroll release for evidence of labour demand, while emphasizing that the future figures are not yet available.",
      'The central bank says the questions up next include credit conditions and labour demand; policy will depend on future releases rather than programme titles.',
      "In the next video the analyst explains uncertainty around future payroll data; the current commentary supplies no measured employment result."
    ]) {
      for (const url of ['https://reuters.com/markets/synthetic-outlook', 'https://federalreserve.gov/newsevents/speech/synthetic']) {
        const d = build({ ...common, rawStories: [row({ topic, url, snippet })] });
        assert.equal(evidenceEligibility(d.stories[0]).eligible, true);
        assert.equal(d.stories[0].snippet, snippet);
        assert.equal(validate(d).ok, true);
        if (url.includes('federalreserve.gov')) {
          assert.equal(d.stories[0].evidenceStatus, 'official');
          assert.equal(readiness(d).credibleCount, 1);
        } else assert.equal(d.stories[0].evidenceStatus, name === 'Bubble' ? 'attributed_media' : 'discovery_only');
      }
    }
  });
  test(`${name}: explicit player headings and mixed-video listings still lose their entire excerpts`, () => {
    for (const snippet of [
      'A market discussion introduces the outlook. Watch next: Garden opening hours. Up next: Museum visitor schedules.',
      'Market discussion. ## Watch Next Garden opening hours ## Up Next Museum visitor schedules',
      'VIDEO 02:15 Market discussion VIDEO 03:10 Garden opening hours. These are separate programme listings.'
    ]) {
      const d = build({ ...common, rawStories: [row({ topic, url: 'https://cnbc.com/video/2026/11/09/synthetic-listing', snippet })] });
      assert.equal(d.stories[0].snippet, null);
      assert.equal(d.stories[0].evidenceStatus, 'discovery_only');
      assert.equal(readiness(d).credibleCount, 0);
    }
  });
  test(`${name}: polluted rows cannot donate official status, corroboration or provider text`, () => {
    for (const extra of contaminated) {
      const d = build({ ...common, rawStories: [row({ topic, url: 'https://unknown.example/report' }), row({ topic, ...extra, url: extra.url || 'https://sec.gov/report' })] });
      assert.equal(validate(d).ok, true);
      assert.equal(readiness(d).credibleCount, 0);
      assert.ok(d.stories.every(s => s.evidenceStatus === 'discovery_only'));
      assert.ok(!JSON.stringify(d).includes(extra.snippet));
    }
  });
  test(`${name}: wire mirrors and duplicate excerpts do not constitute independent confirmation`, () => {
    for (const rows of [
      [row({ topic, url: 'https://morningstar.com/news/business-wire/123/synthetic' }), row({ topic, url: 'https://markets.ft.com/data/announce/detail?dockey=synthetic', snippet: independent })],
      [row({ topic, url: 'https://one.example/report' }), row({ topic, url: 'https://two.example/report' })]
    ]) {
      const d = build({ ...common, rawStories: rows });
      assert.equal(validate(d).ok, true);
      assert.equal(readiness(d).credibleCount, 0);
      assert.ok(d.stories.every(s => s.evidenceStatus === 'discovery_only'));
    }
    const d = build({ ...common, rawStories: [row({ topic, url: 'https://one.example/report' }), row({ topic, url: 'https://two.example/report', snippet: independent })] });
    assert.equal(d.stories[0].evidenceStatus, 'cross_checked');
    assert.equal(readiness(d).credibleCount, 1);
    assert.equal(build({ ...common, rawStories: [row({ topic, url: 'https://federalreserve.gov/newsevents/pressreleases/synthetic' })] }).stories[0].evidenceStatus, 'official');
  });
  test(`${name}: forged labels cannot admit contaminated or syndicated original input`, () => {
    for (const extra of [...contaminated, { url: 'https://morningstar.com/news/business-wire/123/synthetic', snippet: coherent }]) {
      const d = build({ ...common, rawStories: [row({ topic, url: 'https://federalreserve.gov/newsevents/pressreleases/synthetic' })] });
      Object.assign(d.stories[0], extra, { contentScope: 'excerpt', evidenceStatus: 'cross_checked', supportingDomains: ['one.example', 'two.example'] });
      assert.equal(readiness(d).credibleCount, 0);
      assert.equal(validate(d).ok, false);
      const read = path => JSON.parse(fs.readFileSync(new URL(`../../data/${path}`, import.meta.url)));
      const input = name === 'Bubble' ? buildWeeklyEditorialInput({ bubbleWatch: read('bubble-watch.json'), discovery: d }) : buildEditorialInput({ radarData: read('radar-data.json'), discovery: d });
      assert.ok(input.newsContext.stories.every(s => s.snippet === null && s.evidenceStatus === 'discovery_only'));
      assert.ok(input.sourceRefs.filter(s => s.kind === 'news').every(s => s.sourceClass === 'discovery_only'));
    }
  });
}

for (const [name, collect] of [['Bubble', collectBubble], ['Macro', collectMacro]]) {
  test(`${name}: Brave supplementary fragments are not concatenated into an article`, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(JSON.stringify({ results: [{ title: 'Synthetic title', url: 'https://example.org/article', description: coherent, extra_snippets: ['RELATED_FRAGMENT_SENTINEL'], page_age: '2026-11-09' }] })); });
    const result = await collect('brave', ['offline-only'], { braveBudget: async (_context, request) => request() });
    assert.equal(calls, 6);
    assert.ok(result.rows.every(r => r.snippet === coherent));
    assert.ok(!JSON.stringify(result.rows).includes('RELATED_FRAGMENT_SENTINEL'));
  });
}
