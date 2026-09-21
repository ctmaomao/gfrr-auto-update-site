// Search-only fixtures inject the accounting boundary; budget tests exercise real reservations.
const budget = async (_context, request) => request();
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectProvider } from '../../scripts/macro-risk/collect-editorial-news.mjs';
import { EDITORIAL_TOPICS, validateNewsDiscovery } from '../../scripts/macro-risk/editorial-contract.mjs';
import { assessEditorialNewsReadiness, buildNewsDiscovery, describeProviderHealth, formatProviderHealth } from '../../scripts/macro-risk/editorial-news.mjs';
import { buildTavilyEditorialSearch, normalizeTavilyEditorialResults, officialReleaseDate } from '../../scripts/macro-risk/editorial-search-plan.mjs';

const fedUrl = 'https://www.federalreserve.gov/newsevents/speech/waller20260903a.htm';
const blsUrl = 'https://www.bls.gov/news.release/archives/empsit_09042026.htm';
const window = { generatedAt: '2026-09-06T04:27:23Z', windowStart: '2026-08-30', windowEnd: '2026-09-06' };
const healthy = Object.fromEntries(['tavily', 'brave'].map(provider => [provider, {
  status: 'ok', successCount: 6, failureCount: 0,
  queryRuns: EDITORIAL_TOPICS.map(topic => ({ topic, status: 'ok', resultCount: 1 }))
}]));
const row = (overrides = {}) => ({ provider: 'brave', topic: 'central_bank_inflation',
  title: 'Economic outlook and policy discussion', url: 'https://example.com/policy',
  publishedAt: '2026-09-03T10:00:00Z', ...overrides });
const discover = rawStories => buildNewsDiscovery({ ...window, sourceStatus: healthy, rawStories });

test('six slots retain broad news and allocate exactly two basic primary searches', () => {
  const plans = EDITORIAL_TOPICS.map(topic => buildTavilyEditorialSearch(topic, 'broad query'));
  assert.equal(plans.filter(p => p.topic === 'general').length, 2);
  assert.equal(plans.filter(p => p.topic === 'news').length, 4);
  for (const plan of plans) {
    assert.equal(plan.max_results, 5);
    assert.equal(plan.search_depth, 'basic');
    assert.equal(plan.time_range, 'week');
    assert.equal(plan.include_answer, false);
    assert.equal(plan.include_raw_content, false);
  }
  assert.deepEqual(plans[0].include_domains, ['federalreserve.gov']);
  assert.deepEqual(plans[3].include_domains, ['bls.gov']);
});

test('only exact official dated release paths yield publication dates', () => {
  assert.equal(officialReleaseDate(fedUrl), '2026-09-03T00:00:00.000Z');
  assert.equal(officialReleaseDate(blsUrl), '2026-09-04T00:00:00.000Z');
  assert.equal(officialReleaseDate('https://federalreserve.gov/newsevents/pressreleases/monetary20260902a.htm'), '2026-09-02T00:00:00.000Z');
  for (const url of [fedUrl.replace('20260903', '20260230'), fedUrl.replace('https:', 'http:'),
    fedUrl.replace('www.federalreserve.gov', 'federalreserve.gov.example.com'),
    fedUrl.replace('www.federalreserve.gov', 'user:password@www.federalreserve.gov'),
    'https://federalreserve.gov/newsevents/2026-speeches.htm',
    'https://bls.gov/news.release/empsit.nr0.htm?date=20260904',
    blsUrl.replace('09042026', '02302026'), 'not a url']) assert.equal(officialReleaseDate(url), null, url);
});

test('general results require registered domain and dated release, ignoring index update date', () => {
  const request = buildTavilyEditorialSearch('central_bank_inflation', 'broad');
  const rows = normalizeTavilyEditorialResults('central_bank_inflation', { results: [
    { url: fedUrl, title: 'Policy outlook', published_date: '2026-09-06', content: 'Bounded synthetic context' },
    { url: blsUrl, title: 'Wrong topic domain' },
    { url: 'https://federalreserve.gov/newsevents.htm', title: 'Updated landing page', published_date: '2026-09-06' }
  ] }, request);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishedAt, '2026-09-03T00:00:00.000Z');
});

test('discovery-only incident remains skipped; a current official release makes input eligible', () => {
  const incident = discover([row()]);
  assert.equal(assessEditorialNewsReadiness(incident).expectedSkip, true);
  const recovered = discover([row(), row({ provider: 'tavily', url: fedUrl })]);
  assert.equal(assessEditorialNewsReadiness(recovered).editorialReady, true);
  assert.equal(recovered.stories[0].evidenceStatus, 'official');
  assert.deepEqual(validateNewsDiscovery(recovered).errors, []);
});

test('old, future, undated releases cannot lend credibility to matching current commentary', () => {
  for (const publishedAt of ['2026-08-29T23:59:59Z', '2026-09-07T00:00:00Z', '2026-09-06T05:00:00Z', null, 'yesterday', 'invalid']) {
    const discovery = discover([row(), row({ url: fedUrl, publishedAt })]);
    assert.equal(discovery.stories.length, 1);
    assert.equal(discovery.stories[0].evidenceStatus, 'discovery_only');
    assert.equal(assessEditorialNewsReadiness(discovery).expectedSkip, true);
  }
});

test('two indexes of one publisher remain discovery-only', () => {
  const d = discover([row(), row({ provider: 'tavily' })]);
  assert.equal(d.stories.length, 1);
  assert.equal(d.stories[0].evidenceStatus, 'discovery_only');
  assert.equal(assessEditorialNewsReadiness(d).editorialReady, false);
});

test('invalid discovery windows fail closed', () => {
  for (const change of [{ windowStart: 'invalid' }, { generatedAt: 'invalid' }, { windowStart: '2026-09-07' }]) {
    assert.throws(() => buildNewsDiscovery({ ...window, ...change, rawStories: [], sourceStatus: healthy }), /invalid news discovery window/);
  }
});

test('actual Tavily collector uses six requests, recovers primary evidence without extra API calls', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.ok(init.signal instanceof AbortSignal);
    const body = JSON.parse(init.body); calls.push(body);
    const primaryUrl = body.include_domains?.[0] === 'federalreserve.gov' ? fedUrl : blsUrl;
    return new Response(JSON.stringify({ results: [{
      title: 'Synthetic current economic release', url: body.topic === 'general' ? primaryUrl : 'https://example.com/news',
      content: 'Synthetic bounded test snippet', ...(body.topic === 'general' ? {} : { published_date: '2026-09-03T10:00:00Z' })
    }] }));
  });
  const collected = await collectProvider('tavily', ['synthetic-test-key'], { budget });
  assert.equal(calls.length, 6);
  assert.equal(collected.status.status, 'ok');
  assert.equal(collected.rows.length, 6);
  const discovery = discover(collected.rows);
  assert.equal(assessEditorialNewsReadiness(discovery).officialCount, 2);
  assert.deepEqual(validateNewsDiscovery(discovery).errors, []);
  assert.equal(JSON.stringify(discovery).includes('synthetic-test-key'), false);
});

test('actual Brave collector keeps its six news searches', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url); calls++;
    assert.equal(parsed.pathname, '/res/v1/news/search');
    assert.equal(parsed.searchParams.get('count'), '5');
    assert.equal(parsed.searchParams.get('freshness'), 'pw');
    return new Response(JSON.stringify({ results: [] }));
  });
  const collected = await collectProvider('brave', ['synthetic-test-key']);
  assert.equal(calls, 6);
  assert.equal(collected.status.status, 'ok');
});

test('malformed responses and HTTP errors remain source-health failures, not expected skips', async (t) => {
  for (const response of [() => new Response('{}'), () => new Response('{}', { status: 432 })]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response());
    const collected = await collectProvider('tavily', ['synthetic-test-key'], { budget });
    assert.equal(collected.status.status, 'error');
    assert.equal(collected.status.failureCount, 6);
    const d = buildNewsDiscovery({ ...window, rawStories: collected.rows, sourceStatus: { ...healthy, tavily: collected.status } });
    assert.equal(assessEditorialNewsReadiness(d).expectedSkip, false);
    mock.mock.restore();
  }
});

test('without keys collector performs no network requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('unexpected request'); });
  const collected = await collectProvider('tavily', []);
  assert.equal(collected.status.status, 'not_configured');
});

// Shape of the 2026-09-21 production failure: the durable Tavily account budget
// refused the first query and stopped the session, so only Brave returned news
// and none of it was official or cross-checked.
function commentaryStories() {
  return EDITORIAL_TOPICS.map((topic, index) => ({ provider: 'brave', topic,
    title: `Commentary ${index} on current macro conditions`, url: `https://outlet-${index}.example.com/story`,
    publishedAt: '2026-09-03T10:00:00Z' }));
}
const healthyProviderStatus = () => ({ status: 'ok', successCount: 6, failureCount: 0,
  queryRuns: EDITORIAL_TOPICS.map((topic) => ({ topic, status: 'ok', resultCount: 1 })) });

function budgetHeldDiscovery() {
  return buildNewsDiscovery({ ...window, rawStories: commentaryStories(), sourceStatus: {
    tavily: { status: 'error', successCount: 0, failureCount: 6, queryRuns: EDITORIAL_TOPICS.map((topic, index) => ({
      topic, status: 'error', resultCount: 0,
      error: index === 0 ? 'tavily_budget_account_limit' : 'tavily_budget_session_stopped'
    })) },
    brave: healthyProviderStatus()
  } });
}

// Same empty outcome, but the index really failed: this must stay a hard failure.
function brokenProviderDiscovery(error = 'http_432_plan_limit') {
  return buildNewsDiscovery({ ...window, rawStories: commentaryStories(), sourceStatus: {
    tavily: { status: 'error', successCount: 0, failureCount: 6,
      queryRuns: EDITORIAL_TOPICS.map((topic) => ({ topic, status: 'error', resultCount: 0, error })) },
    brave: healthyProviderStatus()
  } });
}

test('degraded no-credible discovery reports bounded classified provider diagnostics', () => {
  const discovery = budgetHeldDiscovery();
  const readiness = assessEditorialNewsReadiness(discovery);
  assert.equal(discovery.status, 'insufficient');
  assert.deepEqual(validateNewsDiscovery(discovery).errors, []);
  assert.equal(readiness.editorialReady, false);
  assert.deepEqual(describeProviderHealth(discovery), [
    { provider: 'tavily', status: 'error', successCount: 0, failureCount: 6,
      errors: ['tavily_budget_account_limit', 'tavily_budget_session_stopped'] },
    { provider: 'brave', status: 'ok', successCount: 6, failureCount: 0, errors: [] }
  ]);
  assert.equal(formatProviderHealth(describeProviderHealth(discovery)),
    'tavily=error(failed=6, errors=tavily_budget_account_limit|tavily_budget_session_stopped); brave=ok(failed=0)');
});

test('provider diagnostics never echo unclassified or unbounded provider text', () => {
  const health = describeProviderHealth({ sourceStatus: {
    tavily: { status: 'HTTP 432 PRIVATE_BODY', successCount: 'x', failureCount: -1,
      queryRuns: [{ error: 'PRIVATE RAW BODY https://example.com/?key=secret' }, { error: 'http_432_plan_limit' }, { error: 42 }] },
    brave: { status: 'ok', successCount: 6, failureCount: 0, queryRuns: [] }
  } });
  assert.deepEqual(health[0], { provider: 'tavily', status: 'unrecognized', successCount: 0, failureCount: 0, errors: ['http_432_plan_limit'] });
  assert.deepEqual(health[1], { provider: 'brave', status: 'ok', successCount: 6, failureCount: 0, errors: [] });
  assert.deepEqual(describeProviderHealth(undefined).map(({ status }) => status), ['missing', 'missing']);
  assert.ok(!formatProviderHealth(health).includes('PRIVATE'));
});

// ADR-0060: a hold raised by our own budget guard before any request skips, while
// every real provider failure keeps the hard failure.
for (const error of ['http_432_plan_limit', 'http_429_rate_limited', 'request_timeout', 'invalid_json', 'network_error']) {
  test(`a real provider failure (${error}) stays a source-health hard failure`, () => {
    const readiness = assessEditorialNewsReadiness(brokenProviderDiscovery(error));
    assert.equal(readiness.editorialReady, false);
    assert.equal(readiness.expectedSkip, false);
    assert.equal(readiness.reason, 'news_source_health_incomplete');
  });
}

test('a pre-network budget hold with zero credible news becomes an explicit budget skip', () => {
  const readiness = assessEditorialNewsReadiness(budgetHeldDiscovery());
  assert.equal(readiness.editorialReady, false);
  assert.equal(readiness.expectedSkip, true);
  assert.equal(readiness.reason, 'search_budget_exhausted');
  assert.equal(readiness.credibleCount, 0);
});

test('a budget hold never masks a second real provider failure or a missing key', () => {
  const held = budgetHeldDiscovery();
  const withBrokenBrave = { ...held, sourceStatus: { ...held.sourceStatus, brave: { status: 'error' } } };
  assert.equal(assessEditorialNewsReadiness(withBrokenBrave).reason, 'news_source_health_incomplete');
  const withMixedTavily = { ...held, sourceStatus: { ...held.sourceStatus, tavily: {
    status: 'error', successCount: 0, failureCount: 6,
    queryRuns: [...held.sourceStatus.tavily.queryRuns.slice(1), { topic: EDITORIAL_TOPICS[0], status: 'error', resultCount: 0, error: 'http_401_unauthorized' }] } } };
  assert.equal(assessEditorialNewsReadiness(withMixedTavily).reason, 'news_source_health_incomplete');
  const withoutBraveKey = { ...held, sourceStatus: { ...held.sourceStatus, brave: { status: 'not_configured', successCount: 0, failureCount: 6, queryRuns: [] } } };
  assert.equal(assessEditorialNewsReadiness(withoutBraveKey).reason, 'news_source_health_incomplete');
});

test('a real provider failure fails closed naming the cause, not a generic input error', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'gfrr-macro-editorial-')), 'news-discovery.json');
  writeFileSync(file, JSON.stringify(brokenProviderDiscovery()));
  const result = spawnSync(process.execPath,
    ['scripts/macro-risk/build-editorial-input.mjs', '--discovery', file, '--allow-expected-news-skip'],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /news_source_health_incomplete/);
  assert.match(result.stderr, /http_432_plan_limit/);
  assert.doesNotMatch(result.stderr, /requires at least one official or cross_checked news story/);
  assert.doesNotMatch(result.stdout, /editorial input PASS/);
});

test('a budget hold skips green with its own classification and no artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gfrr-macro-editorial-'));
  const file = join(dir, 'news-discovery.json');
  writeFileSync(file, JSON.stringify(budgetHeldDiscovery()));
  const result = spawnSync(process.execPath,
    ['scripts/macro-risk/build-editorial-input.mjs', '--discovery', file, '--allow-expected-news-skip'],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SKIP \(classification=SKIPPED_SEARCH_BUDGET_EXHAUSTED, reason=search_budget_exhausted/);
  assert.match(result.stdout, /tavily_budget_account_limit/);
  assert.doesNotMatch(result.stdout, /editorial input PASS/);
  assert.doesNotMatch(result.stderr, /news_source_health_incomplete/);
});
