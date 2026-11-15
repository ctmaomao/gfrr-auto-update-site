import test from 'node:test';
import assert from 'node:assert/strict';
import { supplementBlsEmploymentExcerpt, robotsPermitExcerpt } from '../../scripts/macro-risk/bls-release-excerpt.mjs';
import { buildNewsDiscovery, assessEditorialNewsReadiness } from '../../scripts/macro-risk/editorial-news.mjs';

const url = 'https://bls.gov/news.release/archives/empsit_11062026.htm';
const heading = 'THE EMPLOYMENT SITUATION - OCTOBER 2026';
const header = 'Transmission of material in this news release is embargoed until USDL-00-0000 8:30 a.m. (ET) Friday, November 6, 2026 Technical information: [synthetic contact] Media contact: [synthetic contact] ';
const result = 'Total nonfarm payroll employment rose by 12,000, and the unemployment rate was unchanged at 4.2 percent.';
const body = `<html><nav>Do not use navigation as article text</nav><pre>${header}${heading}\n${result}</pre></html>`;
const row = { provider: 'tavily', topic: 'growth_employment_consumer', title: heading, url, publishedAt: '2026-11-06T00:00:00Z', snippet: header + heading };
const window = { generatedAt: '2026-11-10T12:00:00Z', windowStart: '2026-11-03', windowEnd: '2026-11-10' };
function response(url, text, { status = 200, type = 'text/html', headers = {}, finalUrl = url } = {}) {
  const r = new Response(text, { status, headers: { 'content-type': type, ...headers } });
  Object.defineProperty(r, 'url', { value: finalUrl });
  return r;
}
function mockFetch({ robots = 'User-agent: *\nAllow: /', html = body, robotsOptions = {}, bodyOptions = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'User-Agent']);
    return url.endsWith('/robots.txt') ? response(url, robots, { type: 'text/plain', ...robotsOptions }) : response(url, html, bodyOptions);
  };
  return { fetchImpl, calls };
}
const run = (mock, extra = {}) => supplementBlsEmploymentExcerpt({ rawStories: [row], ...window, fetchImpl: mock.fetchImpl, ...extra });

test('one discovered official release is supplemented without new attribution, dates or original mutations', async () => {
  const mock = mockFetch(), rawStories = [row, { ...row, provider: 'brave' }], before = structuredClone(rawStories);
  const got = await run(mock, { rawStories });
  assert.equal(got.diagnostics.status, 'available');
  assert.equal(got.diagnostics.requestCount, 2);
  assert.deepEqual(mock.calls.map(c => c.url), ['https://bls.gov/robots.txt', url]);
  assert.equal(got.diagnostics.releasedAt, '2026-11-06T13:30:00.000Z');
  assert.match(got.diagnostics.bodySha256, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(got.diagnostics).includes('synthetic contact'));
  assert.deepEqual(got.rawStories, rawStories.map(s => ({ ...s, snippet: result })));
  assert.deepEqual(rawStories, before);
  const d = buildNewsDiscovery({ rawStories: got.rawStories, ...window, sourceStatus: {} });
  assert.equal(d.stories.length, 1);
  assert.equal(d.stories[0].evidenceStatus, 'official');
  assert.deepEqual(d.stories[0].supportingDomains, ['bls.gov']);
  assert.equal(assessEditorialNewsReadiness(d).credibleCount, 1);
});

test('scope and date failures make zero public requests', async () => {
  const changes = [
    { url: url.replace('bls.gov', 'bls.gov.example.org') }, { url: url.replace('https:', 'http:') },
    { url: url + '?tracking=x' }, { url: url + '#body' }, { url: url.replace('bls.gov', 'user:password@bls.gov') },
    { url: url.replace('empsit_', 'cpi_') }, { url: 'https://bls.gov/news.release/empsit.htm' },
    { url: url.replace('11062026', '02302026') }, { publishedAt: '2026-11-05T00:00:00Z' },
    { topic: 'credit_liquidity' }, { snippet: result }, { snippet: '' }
  ];
  for (const change of changes) {
    const mock = mockFetch(), got = await run(mock, { rawStories: [{ ...row, ...change }] });
    assert.equal(mock.calls.length, 0); assert.equal(got.diagnostics.status, 'not_needed');
  }
  for (const change of [{ generatedAt: 'invalid' }, { generatedAt: '2026-11-05T12:00:00Z' }, { generatedAt: '2026-11-20T12:00:00Z' }, { windowStart: '2026-11-07' }]) {
    const mock = mockFetch(); await run(mock, change); assert.equal(mock.calls.length, 0);
  }
});

test('robots rules are respected, including wildcards, terminal matches and explicit restrictions', async () => {
  for (const robots of ['User-agent: *\nDisallow: /', 'User-agent: *\nDisallow: /news.release/*', 'User-agent: *\nCrawl-delay: 1', '<html>not robots</html>', 'Disallow: /', 'User-agent: *\nUnknown: rule']) {
    const mock = mockFetch({ robots }), got = await run(mock);
    assert.equal(mock.calls.length, 1); assert.equal(got.diagnostics.status, 'held');
    assert.deepEqual(got.rawStories, [row]);
  }
  assert.equal(robotsPermitExcerpt('User-agent: *\nDisallow: /news.release/\nAllow: /news.release/archives/', new URL(url).pathname).allowed, true);
  assert.equal(robotsPermitExcerpt('User-agent: *\nDisallow: /news.release$', new URL(url).pathname).allowed, true);
});

test('denial, rate limit, redirects, MIME and byte limits never retry or use another host', async () => {
  for (const stage of ['robotsOptions', 'bodyOptions']) for (const options of [
    { status: 403 }, { status: 429 }, { status: 500 }, { status: 302 },
    { finalUrl: url.replace('bls.gov', 'www.bls.gov') }, { type: 'application/json' },
    { headers: { 'content-length': String(513 * 1024) } }, { headers: { 'x-robots-tag': 'noai' } }
  ]) {
    const mock = mockFetch({ [stage]: options }), got = await run(mock);
    assert.equal(got.diagnostics.status, 'held');
    assert.equal(mock.calls.length, stage === 'robotsOptions' ? 1 : 2);
    assert.deepEqual(got.rawStories, [row]);
    assert.ok(mock.calls.every(c => new URL(c.url).hostname === 'bls.gov'));
  }
  for (const config of [{ robots: 'x'.repeat(65537) }, { html: 'x'.repeat(512 * 1024 + 1) }, { html: new Uint8Array([0xff]) }]) {
    const got = await run(mockFetch(config)); assert.equal(got.diagnostics.status, 'held');
  }
});

test('unsupported layouts, missing results, header-date mismatch and future embargo stay unusable', async () => {
  for (const html of [
    body.replaceAll('pre>', 'article>'), `<pre>${header}${heading}</pre>`,
    body.replace('November 6', 'November 5'), body.replace('Friday', 'Thursday'),
    body.replace('8:30 a.m.', '13:30 a.m.'), body.replace('8:30 a.m. (ET)', '8:30 a.m. (UTC)'),
    body.replace('</html>', '<meta name=robots content=noai></html>'),
    body.replace('</html>', '<meta name=robots content="no&#97;i"></html>'),
    body.replace('</html>', '<meta content="noarchive" name="robots"></html>')
  ]) {
    const mock = mockFetch({ html }), got = await run(mock);
    assert.equal(got.diagnostics.status, 'held'); assert.equal(mock.calls.length, 2);
    assert.deepEqual(got.rawStories, [row]);
  }
  const got = await run(mockFetch(), { generatedAt: '2026-11-06T13:29:59Z' });
  assert.equal(got.diagnostics.reason, 'future_embargo');
  assert.equal((await run(mockFetch(), { generatedAt: '2026-11-06T13:30:00Z' })).diagnostics.status, 'available');
});

test('exact discovered www host is preserved and pre containers beat their wrapping bodytext', async () => {
  const mock = mockFetch({ html: `<div id="bodytext">${body}<div>Footer</div></div>` });
  const got = await run(mock, { rawStories: [{ ...row, url: url.replace('bls.gov', 'www.bls.gov') }] });
  assert.equal(got.diagnostics.status, 'available');
  assert.ok(mock.calls.every(c => new URL(c.url).hostname === 'www.bls.gov'));
});

test('one failed attempt does not fall through to another candidate or expose exception text', async () => {
  let calls = 0;
  const got = await run({ fetchImpl: async () => { calls++; throw new Error('PRIVATE_ERROR_SENTINEL'); } }, { rawStories: [row, { ...row, url: url.replace('bls.gov', 'www.bls.gov') }] });
  assert.equal(calls, 1); assert.equal(got.diagnostics.reason, 'network_error');
  assert.ok(!JSON.stringify(got).includes('PRIVATE_ERROR_SENTINEL'));
});

test('timeout bounds include hung headers and hung response bodies', async () => {
  const hung = await run({ fetchImpl: () => new Promise(() => {}) }, { robotsTimeoutMs: 5 });
  assert.equal(hung.diagnostics.reason, 'request_timeout'); assert.equal(hung.diagnostics.requestCount, 1);
  const fetchImpl = async u => u.endsWith('/robots.txt') ? response(u, 'User-agent: *\nAllow: /', { type: 'text/plain' }) : response(u, new ReadableStream({ pull() { return new Promise(() => {}); } }));
  const got = await run({ fetchImpl }, { bodyTimeoutMs: 5 });
  assert.equal(got.diagnostics.reason, 'request_timeout'); assert.equal(got.diagnostics.requestCount, 2);
});


test('ET daylight saving release time is checked without using the observed report month', async () => {
  const summerUrl = url.replace('11062026', '09042026');
  const html = body.replace('November 6', 'September 4').replace('OCTOBER 2026', 'AUGUST 2026');
  const options = { rawStories: [{ ...row, url: summerUrl, publishedAt: '2026-09-04T00:00:00Z' }], windowStart: '2026-08-30', windowEnd: '2026-09-04' };
  const before = await run(mockFetch({ html }), { ...options, generatedAt: '2026-09-04T12:29:59Z' });
  assert.equal(before.diagnostics.reason, 'future_embargo');
  const got = await run(mockFetch({ html }), { ...options, generatedAt: '2026-09-04T12:30:00Z' });
  assert.equal(got.diagnostics.status, 'available');
  assert.equal(got.diagnostics.releasedAt, '2026-09-04T12:30:00.000Z');
});


test('inactive, nonarticle and forged body containers never supply release evidence', async () => {
  const pre = `<pre>${header}${heading} ${result}</pre>`;
  for (const html of [
    `<script>let s = '${pre}';</script>`, `<!-- ${pre} -->`,
    ...['nav', 'style', 'header', 'footer', 'aside', 'template', 'noscript'].map(tag => `<${tag}>${pre}</${tag}>`),
    `<nav><nav>Menu</nav>${pre}</nav>`, `<nav>${pre}`,
    `<div data-content="${pre}">Nothing</div>`, `<textarea>${pre}</textarea>`,
    '<div>'.repeat(129) + pre + '</div>'.repeat(129), '<br>'.repeat(20001) + pre,
    `<pre>${pre}`, `<div hidden>${pre}</div>`, `<div inert>${pre}</div>`,
    `<pre hidden>${header}${heading} ${result}</pre>`,
    `<pre>${header}${heading}<span hidden>Payrolls rose.</span></pre>`,
    `<pre>${header}${heading}<span data-note=">Payrolls rose.">No results available.</span></pre>`,
    `<pre>${header}${heading}<template>Payrolls rose.</template></pre>`,
    `<div id="bodytext">${header}${heading}<textarea>Payrolls rose.</textarea></div>`,
    `<div data-id="bodytext">${header}${heading} ${result}</div>`,
    `<div class=" id='bodytext' ">${header}${heading} ${result}</div>`
  ]) {
    const got = await run(mockFetch({ html }));
    assert.equal(got.diagnostics.status, 'held');
    assert.equal(got.diagnostics.reason, 'body_layout');
    assert.deepEqual(got.rawStories, [row]);
  }
  const got = await run(mockFetch({ html: `<script>let x = 1;</script><div id="bodytext">${header}${heading} ${result}</div>` }));
  assert.equal(got.diagnostics.status, 'available');
});


test('unsupported robots encodings and agent patterns hold rather than bypass restrictions', async () => {
  for (const robots of [
    'User-agent: *\nDisallow: /news%2Erelease/',
    'User-agent: *\nDisallow: /news.release/archives/%65mpsit_11062026.htm',
    'User-agent: gfrr*\nDisallow: /',
    'User-agent: *\nDisallow: /******************************never-match',
    'User-agent: gfrr-macro-risk-editorial/1.0\nDisallow: /'
  ]) {
    const mock = mockFetch({ robots }), got = await run(mock);
    assert.equal(got.diagnostics.status, 'held');
    assert.equal(mock.calls.length, 1);
    assert.deepEqual(got.rawStories, [row]);
  }
});


test('ordinary inline formatting and entities retain actual body observations', async () => {
  const html = `<pre>${header}${heading}<p>Total nonfarm payroll employment <strong>rose</strong> by <em>12,000,</em> and the unemployment rate was unchanged at <span data-note="formatting">4.2</span> percent.&nbsp;Hours &amp; earnings followed.</p></pre>`;
  const got = await run(mockFetch({ html }));
  assert.equal(got.diagnostics.status, 'available');
  assert.equal(got.rawStories[0].snippet, result + ' Hours & earnings followed.');
  const decimal = await run(mockFetch({ html: `<pre>${header}${heading}<p>The unemployment rate was 4.<b>2</b> percent.</p></pre>` }));
  assert.equal(decimal.rawStories[0].snippet, 'The unemployment rate was 4.2 percent.');
});
