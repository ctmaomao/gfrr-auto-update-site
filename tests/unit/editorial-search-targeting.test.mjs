import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProvider as collectBubble } from '../../scripts/bubble-watch/collect-weekly-editorial-news.mjs';
import { collectProvider as collectMacro } from '../../scripts/macro-risk/collect-editorial-news.mjs';
import { EDITORIAL_SEARCH_DOMAINS, isOfficialDomain, publisherName } from '../../scripts/bubble-watch/editorial-evidence-policy.mjs';
import { EDITORIAL_TOPICS as BUBBLE_TOPICS } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { WEEKLY_EDITORIAL_QUERIES, buildNewsDiscovery, assessWeeklyEditorialNewsReadiness } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { EDITORIAL_TOPICS as MACRO_TOPICS } from '../../scripts/macro-risk/editorial-contract.mjs';
import { EDITORIAL_QUERIES } from '../../scripts/macro-risk/editorial-news.mjs';
import { buildTavilyEditorialSearch, normalizeTavilyEditorialResults, officialReleaseDate } from '../../scripts/macro-risk/editorial-search-plan.mjs';
import { createTavilyBudget, emptyLedger } from '../../scripts/lib/tavily-budget.mjs';

// Historical synthetic inputs only. No retained live articles or provider responses.
const key = 'synthetic-search-targeting-key';
const clock = Date.parse('2026-10-05T12:00:00Z');
const originalDomains = [
  'morningstar.com', 'ft.com', 'bloomberg.com', 'cnbc.com', 'reuters.com', 'wsj.com', 'theinformation.com',
  'sec.gov', 'justice.gov', 'oag.ca.gov', 'federalreserve.gov', 'nvidia.com', 'microsoft.com',
  'aboutamazon.com', 'amazon.com', 'abc.xyz', 'investor.fb.com', 'meta.com', 'openai.com',
  'anthropic.com', 'oracle.com', 'amd.com', 'broadcom.com'
];
const commonPayload = { search_depth: 'basic', max_results: 5, time_range: 'week',
  include_answer: false, include_raw_content: false, include_usage: true };
const primaryQueries = {
  central_bank_inflation: 'site:federalreserve.gov/newsevents/ monetary policy economic outlook speech press release',
  growth_employment_consumer: 'site:bls.gov/news.release/archives/ "Employment Situation" payroll unemployment'
};
const primaryDomains = { central_bank_inflation: 'federalreserve.gov', growth_employment_consumer: 'bls.gov' };
const usage = () => ({ account: { current_plan: 'Researcher', plan_usage: 100, plan_limit: 1000,
  paygo_usage: null, paygo_limit: null }, key: { usage: 100, limit: 1000 } });
function memoryStore() {
  let ledger = emptyLedger(), head = 0;
  return {
    async read() { return { head, ledger: structuredClone(ledger) }; },
    async write(previous, next) {
      if (previous.head !== head) return false;
      ledger = structuredClone(next); head++;
      return true;
    }
  };
}

// The snapshot guards the scope; runtime derives the list from the evidence policy.
test('Bubble retrieval domains are exactly the immutable existing reviewed policy', () => {
  assert.deepEqual(EDITORIAL_SEARCH_DOMAINS, originalDomains);
  assert.equal(Object.isFrozen(EDITORIAL_SEARCH_DOMAINS), true);
  assert.equal(new Set(EDITORIAL_SEARCH_DOMAINS).size, 23);
  for (const domain of EDITORIAL_SEARCH_DOMAINS) {
    assert.equal(typeof domain, 'string');
    assert.ok(publisherName(domain) || isOfficialDomain(domain), domain);
    assert.equal(domain.includes('*'), false);
  }
  assert.equal(publisherName('cnbc.com.example.org'), null);
  assert.equal(isOfficialDomain('amd.com.example.org'), false);
});

for (const [name, collect, topics, queries] of [
  ['bubble', collectBubble, BUBBLE_TOPICS, WEEKLY_EDITORIAL_QUERIES],
  ['macro', collectMacro, MACRO_TOPICS, EDITORIAL_QUERIES]
]) {
  test(`${name}: six actual Tavily payloads preserve free reservations and usage receipts`, async t => {
    const calls = [], contexts = [], store = memoryStore();
    const gate = createTavilyBudget({ store, readUsage: async () => usage(), now: () => clock });
    const budget = async (context, request) => {
      contexts.push(structuredClone(context));
      return gate(context, request);
    };
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(url, 'https://api.tavily.com/search');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      const payload = JSON.parse(init.body);
      const index = calls.length, topic = topics[index];
      const expected = name === 'bubble'
        ? { ...commonPayload, query: queries[topic], topic: 'news', include_domains: originalDomains }
        : { ...commonPayload, query: primaryQueries[topic] || queries[topic],
          topic: primaryDomains[topic] ? 'general' : 'news',
          ...(primaryDomains[topic] ? { include_domains: [primaryDomains[topic]] } : {}) };
      assert.deepEqual(payload, expected, topic);
      assert.deepEqual(contexts[index].payload, payload, 'budget and serialized request must match');
      assert.equal(contexts[index].consumer, `${name}-editorial`);
      const entries = (await store.read()).ledger.entries;
      assert.equal(entries.length, index + 1);
      assert.equal(entries.at(-1).state, 'reserved', 'reserve before the mocked request');
      calls.push(payload);
      return new Response(JSON.stringify({ results: [], usage: { credits: 1 } }));
    });
    const result = await collect('tavily', [key], { budget });
    assert.equal(calls.length, 6);
    assert.equal(result.status.status, 'ok');
    assert.equal(result.status.successCount, 6);
    assert.equal(result.status.failureCount, 0);
    assert.deepEqual(result.status.queryRuns.map(row => row.topic), topics);
    assert.deepEqual(result.rows, []);
    const entries = (await store.read()).ledger.entries;
    assert.equal(entries.length, 6);
    assert.ok(entries.every(row => row.state === 'success' && row.credits === 1 && row.reportedCredits === 1));
  });

  test(`${name}: changed payloads cannot bypass unknown free allowance`, async t => {
    const store = memoryStore();
    const budget = createTavilyBudget({ store, readUsage: async () => ({ account: {}, key: {} }), now: () => clock });
    t.mock.method(globalThis, 'fetch', async () => assert.fail('No request when free usage is unknown'));
    const result = await collect('tavily', [key], { budget });
    assert.equal(result.status.successCount, 0);
    assert.equal(result.status.failureCount, 6);
    assert.ok(result.status.queryRuns.every(row => row.error.startsWith('tavily_budget_')));
    assert.deepEqual((await store.read()).ledger.entries, []);
  });

  test(`${name}: Brave retains the same six broad news queries`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async url => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.search.brave.com');
      assert.equal(parsed.pathname, '/res/v1/news/search');
      assert.deepEqual(Object.fromEntries(parsed.searchParams), {
        q: queries[topics[calls.length]], freshness: 'pw', count: '5', country: 'US',
        search_lang: 'en', ui_lang: 'en-US', extra_snippets: 'true'
      });
      calls.push(url);
      return new Response(JSON.stringify({ results: [] }));
    });
    const result = await collect('brave', [key], { braveBudget: async (context, request) => {
      assert.equal(context.consumer, `${name}-editorial`);
      return request();
    } });
    assert.equal(calls.length, 6);
    assert.equal(result.status.status, 'ok');
  });
}

const snippet = 'Synthetic historical fixture: analysts discuss cloud infrastructure financing and demand uncertainty, without confirming any company event or financial outcome.';
const row = overrides => ({ provider: 'tavily', topic: 'ai_financing_credit',
  title: 'Synthetic historical cloud financing discussion', url: 'https://morningstar.com/bonds/synthetic-fixture',
  snippet, publishedAt: '2026-10-02T10:00:00Z', ...overrides });
const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
function discover(rows, dualSearch = false) {
  return buildNewsDiscovery({ rawStories: rows, generatedAt: new Date(clock).toISOString(),
    windowStart: '2026-09-26', windowEnd: '2026-10-05', sourceStatus: { tavily: healthy,
      brave: dualSearch ? healthy : { status: 'not_configured', successCount: 0, failureCount: 6 } } });
}

test('targeting never upgrades missing, contaminated, stale, undated or wrong-domain Bubble evidence', () => {
  const rejected = [
    { snippet: '' }, { snippet: 'Short excerpt' },
    { snippet: 'Subscribe to read this synthetic fixture in full.' },
    { snippet: `Most read: ${snippet}` },
    { snippet: 'Welcome to the newsletter. Today we discuss the upcoming cloud infrastructure agenda.' },
    { publishedAt: null }, { publishedAt: 'invalid' },
    { publishedAt: '2026-09-25' }, { publishedAt: '2026-10-06' },
    { url: 'https://morningstar.com/community/synthetic-fixture' },
    { url: 'https://morningstar.com.example.org/synthetic-fixture' },
    { url: 'https://amd.com.example.org/synthetic-fixture' },
    { url: 'https://unreviewed.example.org/synthetic-fixture' },
    { url: 'http://morningstar.com/bonds/synthetic-fixture' },
    { url: 'not a URL' },
    { url: 'https://amd.com/synthetic-fixture', snippet: '' }
  ];
  for (const overrides of rejected) {
    const discovery = discover([row(overrides)]);
    assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, false, JSON.stringify(overrides));
    assert.ok(discovery.stories.every(story => story.evidenceStatus === 'discovery_only'));
  }
});

test('targeted Bubble hits retain original attributed, official and cross-checked distinctions', () => {
  const media = discover([row()]);
  assert.equal(media.stories[0].evidenceStatus, 'attributed_media');
  assert.equal(assessWeeklyEditorialNewsReadiness(media).coverageMode, 'limited_single_search');
  const indexedTwice = discover([row(), row({ provider: 'brave' })], true);
  assert.equal(indexedTwice.stories.length, 1);
  assert.equal(indexedTwice.stories[0].evidenceStatus, 'attributed_media');
  assert.equal(discover([row({ url: 'https://amd.com/synthetic-fixture' })]).stories[0].evidenceStatus, 'official');
  const crossChecked = discover([row({ url: 'https://one.example.org/synthetic-fixture' }),
    row({ url: 'https://two.example.org/synthetic-fixture' })]);
  assert.equal(crossChecked.stories[0].evidenceStatus, 'cross_checked', 'retrieval list is not a new eligibility allowlist');
});

test('BLS targeting preserves dated HTML requirement and rejects PDFs, landing pages and spoofed hosts', () => {
  const request = buildTavilyEditorialSearch('growth_employment_consumer', 'broad');
  const valid = 'https://www.bls.gov/news.release/archives/empsit_09042026.htm';
  const invalid = [valid.replace('.htm', '.pdf'), valid.replace('bls.gov', 'bls.gov.example.org'),
    valid.replace('https:', 'http:'), valid.replace('09042026', '02302026'),
    'https://www.bls.gov/news.release/empsit.nr0.htm',
    'https://www.bls.gov/news.release/archives/?date=20260904'];
  for (const url of invalid) assert.equal(officialReleaseDate(url), null, url);
  const rows = normalizeTavilyEditorialResults('growth_employment_consumer', { results: [
    { url: valid, title: 'Synthetic historical release', published_date: '2026-10-05', content: snippet },
    ...invalid.map(url => ({ url, title: 'Synthetic invalid result', published_date: '2026-10-05', content: snippet }))
  ] }, request);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishedAt, '2026-09-04T00:00:00.000Z', 'never substitute crawl or query date');
});
