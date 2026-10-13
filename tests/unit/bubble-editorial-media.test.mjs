import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildNewsDiscovery, assessWeeklyEditorialNewsReadiness } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { validateNewsDiscovery, validateWeeklyEditorialOutput, visibleEditorialText } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { buildWeeklyEditorialSystemPrompt } from '../../scripts/bubble-watch/weekly-editorial-prompt.mjs';
import { requestWeeklyEditorial, buildWeeklyEditorialReplayCandidate } from '../../scripts/bubble-watch/weekly-editorial-provider.mjs';
import { normalizeMediaClaimNames, diagnoseMediaClaims } from '../../scripts/bubble-watch/weekly-editorial-claim-diagnostics.mjs';
import { claimNumericSupport } from '../../scripts/bubble-watch/weekly-editorial-numeric-grounding.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial, applyWeeklyEditorialProjection } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
const read = (path) => JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url)));
const sourceStatus = Object.fromEntries(['tavily', 'brave'].map((name) => [name, { status: 'ok', successCount: 6, failureCount: 0 }]));
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';
const row = (url = 'https://morningstar.com/bonds/ai-credit', extra = {}) => ({ provider: 'brave', topic: 'ai_financing_credit', title: 'AI financing credit assessment', url, snippet, publishedAt: '2026-10-02', ...extra });
const discoveryFor = (rows) => buildNewsDiscovery({ rawStories: rows, sourceStatus: structuredClone(sourceStatus), generatedAt: '2026-10-05T12:31:15Z', windowStart: '2026-09-26', windowEnd: '2026-10-05' });

function livePack(rows = [row()]) {
  const bubble = read('data/bubble-watch.json');
  const discovery = discoveryFor(rows);
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  return { bubble, discovery, input };
}

function runLiveCheck(pack) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-bubble-live-input-'));
  // Cleanup is limited to the private directory this test created under the OS temp root.
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  const files = { discovery: 'discovery.json', input: 'input.json', 'bubble-watch': 'bubble.json' };
  const values = { discovery: pack.discovery, input: pack.input, 'bubble-watch': pack.bubble };
  try {
    for (const [flag, name] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), JSON.stringify(values[flag]));
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('../../scripts/check-bubble-watch-weekly-editorial-live-input.mjs', import.meta.url)),
      ...Object.entries(files).flatMap(([flag, name]) => [`--${flag}`, path.join(directory, name)])
    ], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.deepEqual(fs.readdirSync(directory).sort(), Object.values(files).sort(), 'input checker must not generate provider/output artifacts');
    for (const [flag, name] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), JSON.stringify(values[flag]), 'input checker must not write its inputs');
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('actual live-input CLI admits media-only evidence and preserves official/cross-checked admission', () => {
  for (const rows of [[row()], [row('https://oag.ca.gov/news/press-releases/openai')], [row('https://example.org/news/ai'), row('https://example.net/news/ai')]]) {
    const pack = livePack(rows);
    assert.equal(pack.discovery.stories.length, 1);
    const result = runLiveCheck(pack);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /live input PASS.*credibleStories=1/u);
  }
});

test('actual live-input CLI rejects invalid media, discovery-only evidence and unhealthy search', () => {
  const cases = [
    [d => { d.stories[0].contentScope = 'title_only'; }, /dated excerpt/u],
    [d => { d.stories[0].snippet = 'Subscribe to unlock this article. '.repeat(5); }, /dated excerpt/u],
    [d => { d.stories[0].snippet = 'A headline'; }, /dated excerpt/u],
    [d => { d.stories[0].domain = 'morningstar.com.example.org'; d.stories[0].url = 'https://morningstar.com.example.org/news'; }, /reviewed publisher/u],
    [d => { d.stories[0].sourceName = 'Another publisher'; }, /matching URL/u],
    [d => { d.stories[0].publishedAt = '2025-10-02'; }, /outside the evidence window/u],
    [d => { d.stories[0].evidenceStatus = 'discovery_only'; }, /no_credible_news/u],
    [d => { d.sourceStatus.brave = { status: 'partial', successCount: 5, failureCount: 1 }; }, /search_provider_unhealthy/u]
  ];
  for (const [mutate, expected] of cases) {
    const pack = livePack();
    mutate(pack.discovery);
    pack.input = buildWeeklyEditorialInput({ bubbleWatch: pack.bubble, discovery: pack.discovery });
    const result = runLiveCheck(pack);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, expected);
  }
});

test('actual live-input CLI retains live-mode, date alignment, size and forbidden-field guards', () => {
  const cases = [
    [i => { i.fixtureOnly = true; i.inputMode = 'fixture_compact_evidence_pack'; }, /rejects fixture\/non-live input/u],
    [i => { i.asOfDate = '2026-01-01'; }, /asOfDate must match/u],
    [i => { i.narrativeBaseline.verdictDescZh = 'x'.repeat(65_000); }, /exceeds 60 KiB/u],
    [i => { i.contextSnapshots.authorization = 'fixture-only'; }, /forbidden keys: authorization/u]
  ];
  for (const [mutate, expected] of cases) {
    const pack = livePack();
    mutate(pack.input);
    const result = runLiveCheck(pack);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, expected);
  }
});
test('California DOJ is official; unrelated and lookalike domains stay untrusted', () => {
  const d = discoveryFor([row('https://oag.ca.gov/news/press-releases/openai')]);
  assert.equal(d.stories[0].evidenceStatus, 'official');
  assert.equal(assessWeeklyEditorialNewsReadiness(d).editorialReady, true);
  for (const url of ['https://oag.ca.gov.example.com/news', 'https://unreviewed.gov/news', 'https://morningstar.com.example.com/bonds/story']) {
    assert.equal(discoveryFor([row(url)]).stories[0].evidenceStatus, 'discovery_only');
  }
});
test('single reviewed media excerpt is usable without relabeling it as corroborated', () => {
  const d = discoveryFor([row()]);
  assert.equal(d.stories[0].evidenceStatus, 'attributed_media');
  assert.equal(d.stories[0].sourceName, 'Morningstar');
  assert.equal(d.status, 'partial');
  assert.equal(validateNewsDiscovery(d).ok, true);
  assert.equal(assessWeeklyEditorialNewsReadiness(d).editorialReady, true);
  const unhealthy = structuredClone(d); unhealthy.sourceStatus.brave.failureCount = 1;
  assert.equal(assessWeeklyEditorialNewsReadiness(unhealthy).editorialReady, false);
  assert.equal(assessWeeklyEditorialNewsReadiness(unhealthy).expectedSkip, false);
  const missing = structuredClone(d); delete missing.stories[0].snippet;
  assert.equal(validateNewsDiscovery(missing).ok, false);
});
test('paywall text, community pages, missing dates and tiny snippets cannot admit media', () => {
  for (const r of [row('https://ft.com/content/example', { snippet: 'Subscribe to unlock this article. Save 40% on Standard Digital. '.repeat(4) }), row('https://morningstar.com/community/thread'), row(undefined, { publishedAt: null }), row(undefined, { publishedAt: '2025-10-02' }), row(undefined, { publishedAt: '2027-10-02' }), row(undefined, { snippet: 'A headline' })]) {
    const d = discoveryFor([r]);
    assert.equal(d.stories[0].evidenceStatus, 'discovery_only');
    assert.equal(assessWeeklyEditorialNewsReadiness(d).expectedSkip, true);
  }
});
function scenario() {
  const bubble = read('data/bubble-watch.json');
  const discovery = discoveryFor([row()]);
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  const output = read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  const story = input.newsContext.stories[0];
  const replace = (v) => typeof v === 'string' && v.startsWith('news:') ? story.id : Array.isArray(v) ? v.map(replace) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, replace(x)])) : v;
  const adapted = replace(output);
  adapted.asOfDate = input.asOfDate;
  adapted.confidence = { level: 'medium', score: 60, reasonZh: '新闻证据有限，综合站内指标并保留覆盖限制。' };
  adapted.dataGaps = ['仅有一条专业媒体摘要，新闻覆盖有限，机构观点尚未独立确认。'];
  const claims = [...adapted.weeklyTimeline, ...adapted.keyTensions, ...adapted.categoryAnalysis, adapted.historicalComparison];
  for (const claim of claims) if (claim.sourceRefIds.includes(story.id)) {
    claim.titleZh = '融资条件与风险';
    claim.detailZh = '据Morningstar分析，人工智能基础设施融资可能改善信用获取，但需求与偿还风险仍存在。这属于机构观点，尚未独立核实。';
  }
  adapted.sourceAttribution = adapted.sourceAttribution.filter((a,i,all) => all.findIndex((b) => b.sourceRefId === a.sourceRefId) === i);
  return { input, output: adapted, bubble, story };
}
test('attributed media output passes review and production metadata roundtrip without excerpts', () => {
  const { input, output, bubble } = scenario();
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  const review = reviewWeeklyEditorial({ input, output });
  assert.equal(review.status, 'warn');
  const layer = projectWeeklyEditorial({ input, output, review });
  assert.ok(layer.sourceLedger.every((s) => !Object.hasOwn(s, 'snippet')));
  const next = applyWeeklyEditorialProjection(bubble, layer);
  delete next.summary.weekly_editorial;
  const before = structuredClone(bubble); delete before.summary.weekly_editorial;
  assert.deepEqual(next, before);
});
test('media attribution, invented numbers, quotes, unknown refs and title-only detail fail', () => {
  const { input, output, story } = scenario();
  for (const text of ['融资已获得全面确认。', '据Morningstar分析，融资达到999999亿美元。', '据Morningstar分析，“融资风险已经消失”。']) {
    const bad = structuredClone(output); bad.weeklyTimeline[0].sourceRefIds = [story.id]; bad.weeklyTimeline[0].detailZh = text;
    assert.equal(validateWeeklyEditorialOutput(bad, input).ok, false);
  }
  const bad = structuredClone(output); bad.weeklyTimeline[0].sourceRefIds = ['news:unknown'];
  assert.equal(validateWeeklyEditorialOutput(bad, input).ok, false);
  const titleOnly = structuredClone(input); titleOnly.newsContext.stories[0].contentScope = 'title_only';
  assert.equal(validateWeeklyEditorialOutput(output, titleOnly).ok, false);
});
test('limited edition omits unsupported sections, retains disclosures and confidence cap', () => {
  const { input, output, bubble } = scenario();
  output.weeklyTimeline = [];
  output.leadZh = '本期融资条件与需求存在张力，新闻证据有限，结合站内指标观察信用与估值的变化，保留不确定性。';
  output.scorecardSynthesisZh = '本期分数沿用固定规则，信用和需求证据共同支撑观察，不由人工智能重新计算或修改。';
  output.keyTensions = output.keyTensions.slice(0,1);
  output.categoryAnalysis = output.categoryAnalysis.slice(0,2);
  assert.ok(visibleEditorialText(output).length < 1200, `limited fixture should exercise the shorter band, got ${visibleEditorialText(output).length}`);
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  assert.equal(reviewWeeklyEditorial({ input, output }).frontendDisplayEligible, true);
  const layer = projectWeeklyEditorial({ input, output, review: reviewWeeklyEditorial({ input, output }) });
  assert.equal(layer.provenance.editorialFormat, 'limited');
  assert.doesNotThrow(() => applyWeeklyEditorialProjection(bubble, layer));
  const high = structuredClone(output); high.confidence.score = 95;
  assert.equal(validateWeeklyEditorialOutput(high, input).ok, false);
  const hidden = structuredClone(output); hidden.dataGaps = ['其他限制'];
  assert.equal(validateWeeklyEditorialOutput(hidden, input).ok, false);
});

test('limited system prompt reaches the provider without the conflicting long-form minimum', async () => {
  const { input, output } = scenario();
  assert.ok(buildWeeklyEditorialSystemPrompt(input).includes('Target 600-1,800'));
  let calls = 0;
  await requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async (_url, request) => {
    calls += 1;
    const body = JSON.parse(request.body);
    assert.ok(body.messages[0].content.includes('Target 600-1,800'));
    assert.ok(!body.messages[0].content.includes('Target 2,600-3,400'));
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
  } });
  assert.equal(calls, 1);
});

test('provider receives quantitative-source separation and complete length budgets in both formats', async () => {
  for (const full of [false, true]) {
    const { input, output } = scenario();
    if (full) {
      const second = { ...input.newsContext.stories[0], id: 'news:second-media', sourceName: 'Financial Times', domain: 'ft.com', url: 'https://ft.com/content/ai-credit' };
      input.newsContext.stories.push(second);
      input.sourceRefs.push({ ...input.sourceRefs.find(ref => ref.id === input.newsContext.stories[0].id), ...second });
    }
    let calls = 0;
    await requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async (_url, request) => {
      calls++;
      const messages = JSON.parse(request.body).messages;
      const prompt = messages[0].content;
      assert.match(prompt, /indicatorId AND matching indicator:\* sourceRefId are both cited in that same item/u);
      assert.match(prompt, /separate indicator-only item/u);
      assert.match(prompt, /In BOTH full and limited formats: each categoryAnalysis.detailZh <= 140/u);
      assert.match(prompt, /sourceRefIds, sourceIndicatorIds and confidence.level count too/u);
      assert.ok(prompt.includes(full ? 'Target 2,600-3,400' : 'Target 600-1,800'));
      assert.ok(messages[1].content.lastIndexOf('Final preflight before returning JSON') > messages[1].content.indexOf(JSON.stringify(input)), 'final constraints must follow the compact input');
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
    } });
    assert.equal(calls, 1);
  }
});

test('ordinary indicator codes produce review hints while mixed refs cannot excuse unsupported financial figures', () => {
  const { input, output, story } = scenario();
  const item = output.categoryAnalysis[0];
  item.sourceRefIds = ['indicator:fed_policy'];
  item.sourceIndicatorIds = ['fed_policy'];
  item.detailZh = '站内固定 Core-23 记分卡采用既有规则，不因新闻解释改变；政策约束与估值压力仍需持续核对，不能据此推断市场转折。';
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  item.sourceRefIds.push(story.id);
  item.detailZh = `据Morningstar分析，${item.detailZh}`;
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  assert.ok(validateWeeklyEditorialOutput(output, input).warnings.length);
  item.detailZh = '据Morningstar分析，收入达999999亿美元。';
  assert.ok(validateWeeklyEditorialOutput(output, input).errors.some(error => error.includes('adds numbers absent')));
  item.detailZh = '据Morningstar分析，融资可改善信用获取，但需求与偿还风险仍存在；结合站内政策约束作定性比较，机构观点尚未独立核实。';
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
});

test('provider rejects the incident-sized 6581-character response without truncation or a second call', async () => {
  const { input, output } = scenario();
  output.dataGaps.push('证据覆盖限制：');
  output.dataGaps[output.dataGaps.length - 1] += '限'.repeat(6581 - visibleEditorialText(output).length);
  assert.equal(visibleEditorialText(output).length, 6581);
  const snapshot = JSON.stringify(output);
  let calls = 0;
  await assert.rejects(requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }) };
  } }), error => {
    assert.equal(error.category, 'provider_output_contract_invalid');
    assert.equal(error.responseDiagnostics.contract.visibleTextLength, 6581);
    assert.ok(error.responseDiagnostics.contract.errors.some(message => message.includes('1200-6500')));
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(output), snapshot);
});

function wsjScenario() {
  const pack = scenario();
  Object.assign(pack.story, { sourceName: 'The Wall Street Journal', domain: 'wsj.com', url: 'https://wsj.com/finance/ai-credit' });
  Object.assign(pack.input.sourceRefs.find(ref => ref.id === pack.story.id), { sourceName: pack.story.sourceName, domain: pack.story.domain, url: pack.story.url });
  for (const claim of [...pack.output.weeklyTimeline, ...pack.output.keyTensions, ...pack.output.categoryAnalysis, pack.output.historicalComparison]) {
    if (claim.sourceRefIds.includes(pack.story.id)) claim.detailZh = claim.detailZh.replace('Morningstar', 'WSJ');
  }
  return pack;
}

test('provider canonicalizes only explicitly attributed aliases of the already cited media', async () => {
  for (const [name, alias, domain] of [
    ['The Wall Street Journal', 'WSJ', 'wsj.com'], ['The Wall Street Journal', '《华尔街日报》', 'wsj.com'],
    ['Financial Times', 'FT', 'ft.com'], ['Financial Times', '金融时报', 'ft.com'],
    ['Morningstar', '晨星', 'morningstar.com'], ['Reuters', '路透社', 'reuters.com'], ['Bloomberg', '彭博社', 'bloomberg.com']
  ]) {
    const { input, output, story } = wsjScenario();
    Object.assign(story, { sourceName: name, domain, url: `https://${domain}/finance/ai-credit` });
    Object.assign(input.sourceRefs.find(ref => ref.id === story.id), { sourceName: name, domain, url: story.url });
    for (const claim of [...output.weeklyTimeline, ...output.keyTensions, ...output.categoryAnalysis, output.historicalComparison]) claim.detailZh = claim.detailZh.replace('WSJ', alias);
    assert.ok(validateWeeklyEditorialOutput(output, input).errors.some(error => error.includes('must attribute')));
    const snapshot = JSON.stringify(output);
    let calls = 0;
    const result = await requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
    } });
    assert.equal(calls, 1);
    assert.deepEqual(validateWeeklyEditorialOutput(result.output, input).errors, []);
    assert.equal(JSON.stringify(output), snapshot);
    assert.ok(result.output.weeklyTimeline[0].detailZh.includes(`据${name}分析`));
    assert.deepEqual(result.output.weeklyTimeline[0].sourceRefIds, output.weeklyTimeline[0].sourceRefIds);
    assert.doesNotThrow(() => projectWeeklyEditorial({ input, output: result.output, review: reviewWeeklyEditorial({ input, output: result.output }) }));
  }
});

test('alias normalization cannot invent attribution, modify quotations, touch numbers or admit a lookalike name', () => {
  const { input, output, story } = wsjScenario();
  for (const text of ['融资条件改善，但需求风险仍存在。', '据WSJExample分析，信用条件改变。', '据Reuters分析，信用条件改变。', '“据WSJ分析，融资999999亿美元。”', '"据WSJ分析，融资999999亿美元。"']) {
    output.weeklyTimeline[0].detailZh = text;
    const next = normalizeMediaClaimNames(output, input);
    assert.equal(next.weeklyTimeline[0].detailZh, text);
    assert.equal(validateWeeklyEditorialOutput(next, input).ok, false);
  }
  output.weeklyTimeline[0].detailZh = '据WSJ分析，融资999999亿美元。';
  const next = normalizeMediaClaimNames(output, input);
  assert.equal(next.weeklyTimeline[0].detailZh, '据The Wall Street Journal分析，融资999999亿美元。');
  assert.ok(validateWeeklyEditorialOutput(next, input).errors.some(error => error.includes('adds numbers absent')));
  output.weeklyTimeline[0].sourceRefIds = ['news:unknown'];
  assert.equal(normalizeMediaClaimNames(output, input).weeklyTimeline[0].detailZh, output.weeklyTimeline[0].detailZh);
  assert.equal(validateWeeklyEditorialOutput(normalizeMediaClaimNames(output, input), input).ok, false);
  assert.ok(story.id.startsWith('news:'));
});

test('failure diagnostics identify claim path and offending numbers without provider prose, excerpts, unknown refs or credentials', async () => {
  const { input, output, story } = wsjScenario();
  const secret = '781236985401';
  output.weeklyTimeline[0].detailZh = `据WSJ分析，融资999999亿美元。 PRIVATE_PROSE_MARKER ${secret}`;
  output.weeklyTimeline[0].sourceRefIds.push('news:UNKNOWN_REF_PRIVATE_MARKER');
  let calls = 0;
  await assert.rejects(requestWeeklyEditorial({ input, apiKey: secret, fetchImpl: async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
  } }), error => {
    assert.equal(error.category, 'provider_output_contract_invalid');
    const diagnostics = error.responseDiagnostics.contract.mediaClaims;
    const first = diagnostics.claims.find(claim => claim.claimPath === 'weeklyTimeline[0]');
    assert.equal(first.claimIndex, 0);
    assert.equal(first.sources[0].sourceRefId, story.id);
    assert.equal(first.sources[0].sourceNamePresent, true);
    assert.deepEqual(first.sources[0].unsupportedNumbers, ['999999']);
    assert.deepEqual(first.sources[0].claimNumberFacts, [{ number: '999999', unit: '亿美元', dollarSign: false }]);
    const serialized = JSON.stringify(diagnostics);
    for (const hidden of [secret, 'PRIVATE_PROSE_MARKER', 'UNKNOWN_REF_PRIVATE_MARKER', input.newsContext.stories[0].snippet]) assert.equal(serialized.includes(hidden), false);
    return true;
  });
  assert.equal(calls, 1);
  const many = normalizeMediaClaimNames(output, input);
  many.weeklyTimeline = Array.from({ length: 100 }, () => structuredClone(many.weeklyTimeline[0]));
  const diagnostics = diagnoseMediaClaims(many, input, { secret });
  assert.equal(diagnostics.claims.length, 12);
  assert.equal(diagnostics.failedClaimCount, 100);
  const leakedInput = structuredClone(input);
  leakedInput.newsContext.stories[0].snippet += ` ${secret}`;
  assert.equal(JSON.stringify(diagnoseMediaClaims(output, leakedInput, { secret })).includes(secret), false);
});

test('numeric diagnostics allow exact monetary equivalence but retain units and reject unequal amounts', () => {
  const { input, story } = scenario();
  story.title = 'Revenue report';
  story.snippet = 'Annualized revenue was roughly $50 billion at the end of September, according to the supplied public excerpt.';
  const output = { weeklyTimeline: [{ detailZh: '据Morningstar报道，年化收入约501亿美元。', sourceRefIds: [story.id] }] };
  const source = diagnoseMediaClaims(output, input).claims[0].sources[0];
  assert.deepEqual(source.claimNumberFacts, [{ number: '501', unit: '亿美元', dollarSign: false }]);
  assert.deepEqual(source.evidenceNumberFacts, [{ number: '50', unit: 'billion', dollarSign: true }]);
  assert.deepEqual(source.unsupportedNumbers, ['501']);
  assert.deepEqual(normalizeMediaClaimNames(output, input), output, 'diagnostic units must not alter or silently admit a numerical claim');
  output.weeklyTimeline[0].detailZh = '据Morningstar报道，年化收入约500亿美元。';
  assert.equal(diagnoseMediaClaims(output, input).failedClaimCount, 0);
});

function numericProbe(claimText, evidence, extras = {}) {
  const story = { id: 'news:test', title: '', snippet: evidence, evidenceStatus: 'attributed_media', contentScope: 'excerpt' };
  return claimNumericSupport({ detailZh: claimText, sourceRefIds: [story.id], ...extras.claim }, { newsContext: { stories: [story] }, structuredFacts: [], ...extras.input });
}

test('typed numeric equivalence matrix covers money, scales, decimals, signs, rates, calendar and ranges', () => {
  const pairs = [
    ['500亿美元', '$50 billion'], ['500亿美元', 'USD 50.00 billion'], ['1,000万美元', '$10 million'],
    ['1万亿美元', 'US$1 trillion'], ['500亿元', 'CNY 50 billion'], ['5亿欧元', 'EUR 500 million'],
    ['5亿英镑', '£500 million'], ['500 亿 美元', 'usd 50 billion'], ['美元500亿', 'USD 50 billion'],
    ['1000', '1,000'], ['50.0%', '50%'], ['0.5%', '50 basis points'], ['50基点', '0.50%'],
    ['-0.5%', '−50bps'], ['+6.3%', '6.30%'], ['9月底', 'at the end of September'], ['9月', 'end of Sept.'],
    ['5月', 'in May'], ['3月', 'March 2026'], ['2026年', 'Q4 2026 outlook'],
    ['2026年10月12日', '2026-10-12'], ['10月', '2026-10-12'], ['50日', '50-day moving average'],
    ['35%与40%', '35-40%'], ['100亿至200亿美元', '$10-20 billion'],
    ['1999年和2000年', '1999-2000'], ['500亿美元', '＄５０ billion']
    , ['500亿美元', '$50bn'], ['500亿美元', '$50B'], ['1亿美元', '$100m'], ['1亿美元', '$100M'],
    ['1000美元', '$1k'], ['500亿港元', 'HK$50 billion'], ['500亿澳元', 'AUD 50 billion'],
    ['500亿日元', 'JPY 50 billion'], ['0.5个百分点', '50bps'], ['50基点', '0.5 percentage points'],
    ['5个百分点', '5 percentage points'], ['4季度', 'Q4 outlook'], ['S5FI', 'S5FI index'],
    ['GPT4', 'GPT-4'], ['2026年9月30日', 'September 30, 2026'], ['2026-09-30', '30 Sep 2026'],
    ['9月30日', '2026-09-30'], ['4.28%', '4.280%'], ['1000000000000000000美元', 'USD 1000000000000000000'],
    ['5000兆瓦', '5 GW'], ['5000 MW', '5 gigawatts'], ['5万千瓦', '50 MW'], ['1瓦', '1000 mW'],
    ['80 GB', '80GB'], ['5 MWh', '5MWh']
  ];
  for (const [claim, evidence] of pairs) assert.deepEqual(numericProbe(claim, evidence).unsupported, [], `${claim} <= ${evidence}`);
});

test('typed numeric rejection matrix rejects substring matches, missing units, currencies, rounding, signs, dates and evasion', () => {
  const pairs = [
    ['50', '150'], ['35%', '135%'], ['500亿美元', '$50 million'], ['500亿元', '$50 billion'],
    ['500亿美元', 'EUR 50 billion'], ['500亿美元', 'HK$50 billion'], ['500亿美元', 'A$50 billion'],
    ['500亿美元', 'Canadian revenue of $50 billion'], ['500亿美元', 'USD 50 billion EUR'],
    ['35%', '34.9%'], ['6.3%', '-6.3%'], ['0.5%', '50%'], ['5个百分点', '5%'],
    ['50%', '50 dollars'], ['50', '$50 billion'], ['500亿美元', '$51 billion'],
    ['9月', 'in October'], ['5月', 'may improve demand'], ['3月', 'stocks march higher'],
    ['2026年10月11日', '2026-10-12'], ['2026年2月30日', '2026-02-28'],
    ['50', '1,50'], ['1000', '1e3'], ['五百亿美元', '$50 billion'], ['百分之五十', '50%'],
    ['37%', '35-40%'], ['150亿美元', '$10-20 billion']
    , ['50美元', '$50bn'], ['50美元', '$50M'], ['5', 'S5FI index'], ['4', 'GPT-4'],
    ['3季度', 'Q4 outlook'], ['5%', '5 percentage points'], ['5个百分点', '5%'],
    ['50美元', '$50%'], ['50美元', '$50元'], ['500亿美元', 'Singapore $50 billion'],
    ['2026年9月29日', 'September 30, 2026'], ['2月30日', '2026-02-28'], ['1000000000000000001美元', 'USD 1000000000000000000'],
    ['50 GW', '50 MW'], ['50兆瓦', '50千瓦'], ['50 TB', '50 GB'], ['50 GB', '50 GiB'],
    ['50 MWh', '50 MW'], ['50美元', '$50MW'], ['5', '5 GB']
  ];
  for (const [claim, evidence] of pairs) assert.ok(numericProbe(claim, evidence).unsupported.length > 0, `${claim} must not borrow ${evidence}`);
});

test('mixed source numerical evidence requires the same claim paired indicator id and source ref; no global pooling', () => {
  const fact = { indicatorId: 'breadth_50d', factZh: '50日均线上方比例≈35%。', sourceRefIds: ['indicator:breadth_50d'] };
  const input = { structuredFacts: [fact] };
  const claim = { sourceRefIds: ['news:test', 'indicator:breadth_50d'], sourceIndicatorIds: ['breadth_50d'] };
  assert.deepEqual(numericProbe('站内50日广度35%', 'Market breadth remains poor.', { claim, input }).unsupported, []);
  for (const bad of [{ ...claim, sourceIndicatorIds: [] }, { ...claim, sourceRefIds: ['news:test'] }, { ...claim, sourceIndicatorIds: ['another_indicator'] }]) {
    assert.ok(numericProbe('35%', 'Market breadth remains poor.', { claim: bad, input }).unsupported.length);
  }
  assert.ok(numericProbe('35%', 'Market breadth remains poor.', { input }).unsupported.length);
  assert.ok(numericProbe('36%', 'Market breadth remains poor.', { claim, input }).unsupported.length);
  const discoveryOnly = { newsContext: { stories: [{ id: 'news:test', evidenceStatus: 'discovery_only', contentScope: 'excerpt', snippet: '35%', title: '' }] } };
  assert.ok(numericProbe('35%', '', { input: discoveryOnly }).unsupported.length);
  assert.ok(numericProbe('35%', 'breadth', { claim, input: { structuredFacts: [{ ...fact, sourceRefIds: ['indicator:another'] }] } }).unsupported.length);
});

test('full validator/provider/review/projection accepts equivalent revenue and explicitly cited site breadth without changing data', async () => {
  const { input, output, story, bubble } = scenario();
  // Pin fixture quantities: a normal future production-data refresh must not change this regression's expected figures.
  input.structuredFacts.find(fact => fact.indicatorId === 'breadth_50d').factZh = '50日均线上方比例约35%，证据仅为站内测试指标。';
  input.structuredFacts.find(fact => fact.indicatorId === 'spy_vs_rsp_6m').factZh = '市值加权相对等权重领先6.3%，证据仅为站内测试指标。';
  story.title = 'Revenue and breadth report';
  story.snippet = 'Annualized revenue was roughly $50 billion at the end of September. Market breadth remained poor, according to the supplied public excerpt.';
  output.weeklyTimeline[0].titleZh = '收入与需求';
  output.weeklyTimeline[0].detailZh = '据Morningstar报道，9月底年化收入约500亿美元，需求与持续投入仍需对照，摘要不能代替独立核实。';
  output.weeklyTimeline[0].sourceRefIds = [story.id];
  const item = output.categoryAnalysis[2];
  item.sourceRefIds = [story.id, 'indicator:breadth_50d', 'indicator:spy_vs_rsp_6m'];
  item.sourceIndicatorIds = ['breadth_50d', 'spy_vs_rsp_6m'];
  item.detailZh = '据Morningstar分析，市场广度偏弱；站内50日均线上方比例约35%，市值加权相对等权重领先6.3%，不同证据分别归因，保留摘要限制。';
  for (const id of item.sourceRefIds) if (!output.sourceAttribution.some(ref => ref.sourceRefId === id)) output.sourceAttribution.push({ sourceRefId: id, claimType: id.startsWith('indicator:') ? 'site_structured_data' : 'attributed_media_news_context', noteZh: '测试中的已引用来源。' });
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  let calls = 0;
  const result = await requestWeeklyEditorial({ input, apiKey: 'fixture-key', fetchImpl: async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
  } });
  assert.equal(calls, 1);
  const review = reviewWeeklyEditorial({ input, output: result.output });
  assert.equal(review.frontendDisplayEligible, true);
  const layer = projectWeeklyEditorial({ input, output: result.output, review });
  const next = applyWeeklyEditorialProjection(bubble, layer);
  delete next.summary.weekly_editorial;
  const before = structuredClone(bubble); delete before.summary.weekly_editorial;
  assert.deepEqual(next, before);
  const bad = structuredClone(output); bad.weeklyTimeline[0].detailZh = bad.weeklyTimeline[0].detailZh.replace('500', '501');
  assert.ok(validateWeeklyEditorialOutput(bad, input).errors.some(error => error.includes('adds numbers absent')));
});

test('literal quotations use only the same item cited evidence; multiple credited media do not need identical excerpts', () => {
  const { input, output, story } = scenario();
  story.snippet = 'This source states that financing remains costly while demand and repayment risks are unresolved. This is a public excerpt for a local fixture.';
  const second = { ...story, id: 'news:quote-second', sourceName: 'Financial Times', domain: 'ft.com', url: 'https://ft.com/content/quote', snippet: 'This other source states that demand remains uncertain and conclusions require further evidence. This is a local fixture public excerpt.' };
  input.newsContext.stories.push(second);
  input.sourceRefs.push({ ...input.sourceRefs.find(ref => ref.id === story.id), ...second });
  output.weeklyTimeline[0].sourceRefIds = [story.id, second.id];
  output.weeklyTimeline[0].detailZh = '据Morningstar分析，摘要称“financing remains costly”；Financial Times指出“demand remains uncertain”。分别归因于被引来源，保持摘要和机构观点限制。';
  output.sourceAttribution.push({ sourceRefId: second.id, claimType: 'attributed_media_news_context', noteZh: '测试中的第二条被引媒体。' });
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  const wrong = structuredClone(output); wrong.weeklyTimeline[0].detailZh += '“unsupported claim phrase”';
  assert.ok(validateWeeklyEditorialOutput(wrong, input).errors.some(error => error.includes('adds a quotation')));
  assert.ok(diagnoseMediaClaims(wrong, input).claims[0].sources[0].unsupportedQuoteCount > 0);
  const missing = structuredClone(output); missing.weeklyTimeline[0].sourceRefIds = [story.id];
  assert.ok(validateWeeklyEditorialOutput(missing, input).errors.some(error => error.includes('adds a quotation')));
});

test('compact evidence retains the collector excerpt tail rather than making it invisible to numeric proof', () => {
  const bubble = read('data/bubble-watch.json');
  const tail = ' Financing evidence at the end: USD 50 billion.';
  const discovery = discoveryFor([row(undefined, { snippet: 'A credible institutional financing discussion. '.repeat(5) + tail })]);
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  assert.ok(input.newsContext.stories[0].snippet.includes('USD 50 billion'));
  assert.ok(Buffer.byteLength(JSON.stringify(input)) <= 60 * 1024);
});

test('unsafe wording in visible source notes or other output text cannot bypass the commentary boundary', () => {
  const { input, output } = scenario();
  for (const mutate of [o => { o.sourceAttribution[0].noteZh = '建议买入。'; }, o => { o.extraExplanation = '一定会崩盘。'; }]) {
    const bad = structuredClone(output); mutate(bad);
    assert.ok(validateWeeklyEditorialOutput(bad, input).errors.some(error => error.includes('unsafe wording')));
  }
});

test('a rejected provider response retains a bounded redacted replay candidate without raw HTTP or automatic promotion', async () => {
  const { input, output, story } = scenario();
  const secret = 'fixture-private-781236985401';
  output.weeklyTimeline[0].sourceRefIds = [story.id];
  output.weeklyTimeline[0].detailZh = `据Morningstar报道，收入999999亿美元。${secret}`;
  output.headers = { authorization: secret };
  output.rawResponse = { body: 'PRIVATE_HTTP_ENVELOPE' };
  const snapshot = JSON.stringify(output);
  let calls = 0;
  await assert.rejects(requestWeeklyEditorial({ input, apiKey: secret, fetchImpl: async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
  } }), error => {
    const candidate = error.replayCandidate;
    assert.equal(candidate.replayOnly, true);
    assert.equal(candidate.productionEligible, false);
    assert.equal(candidate.redactionsApplied, true);
    assert.equal(candidate.omittedFields, 2);
    assert.equal(candidate.bounded, false);
    const serialized = JSON.stringify(candidate);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes('PRIVATE_HTTP_ENVELOPE'), false);
    assert.ok(serialized.includes('999999'));
    assert.equal(validateWeeklyEditorialOutput({ replayCandidate: candidate }, input).ok, false, 'failure envelope is never a production output');
    assert.ok(Buffer.byteLength(serialized) <= 128 * 1024);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(output), snapshot);
  const huge = { ...output, dataGaps: Array(9).fill('字'.repeat(20_000)) };
  assert.equal(buildWeeklyEditorialReplayCandidate(huge, input, secret), null, 'large replay candidate must not defeat artifact byte budget');
});

test('real replay CLI is read-only, input-digest bound and has no provider/write flags', () => {
  const { input, output } = scenario();
  const failure = { replayCandidate: buildWeeklyEditorialReplayCandidate(output, input) };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-bubble-replay-'));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  const inputPath = path.join(directory, 'input.json'), failurePath = path.join(directory, 'failure.json');
  const cli = fileURLToPath(new URL('../../scripts/bubble-watch/replay-weekly-editorial-failure.mjs', import.meta.url));
  const run = extra => spawnSync(process.execPath, [cli, '--input', inputPath, '--failure', failurePath, ...extra], { cwd: directory, encoding: 'utf8', timeout: 10_000 });
  try {
    fs.writeFileSync(inputPath, JSON.stringify(input)); fs.writeFileSync(failurePath, JSON.stringify(failure));
    const result = run([]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).apiCallCount, 0);
    assert.equal(JSON.parse(result.stdout).productionEligible, false);
    assert.equal(JSON.parse(result.stdout).exactReplay, true);
    assert.equal(run(['--allow-network']).status, 1);
    assert.equal(run(['--output', 'production.json']).status, 1);
    assert.equal(fs.readFileSync(inputPath, 'utf8'), JSON.stringify(input));
    assert.equal(fs.readFileSync(failurePath, 'utf8'), JSON.stringify(failure));
    assert.deepEqual(fs.readdirSync(directory).sort(), ['failure.json', 'input.json']);
    failure.replayCandidate.inputDigestShort = 'not-the-same-input';
    fs.writeFileSync(failurePath, JSON.stringify(failure));
    assert.equal(run([]).status, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('numeric display policy blocks financial inventions but treats stylistic and non-financial differences as review hints', () => {
  for (const [claim, evidence] of [['9月底', 'in September'], ['Core-23', 'Market conditions'], ['5个百分点', '5%'], ['5%', '5 percentage points'], ['五百亿美元', '$50 billion'], ['50 GW', '50 MW'], ['2026年2月30日', '2026-02-28']]) {
    assert.deepEqual(numericProbe(claim, evidence).blockers, [], claim);
  }
  for (const [claim, evidence] of [['500亿美元', '$51 billion'], ['500亿元', '$50 billion'], ['35%', '34.9%'], ['37%', '35-40%'], ['50美元', '$50MW']]) {
    assert.ok(numericProbe(claim, evidence).blockers.length, claim);
  }
  const { input, output } = scenario();
  output.weeklyTimeline[0].detailZh = '据Morningstar分析，Core-23框架支持观察；9月底的表达仍需核对原始日期，媒体观点尚未独立核实。';
  const validation = validateWeeklyEditorialOutput(output, input);
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.warnings.length);
  const review = reviewWeeklyEditorial({ input, output });
  assert.equal(review.frontendDisplayEligible, true);
  assert.equal(review.status, 'warn');
  assert.ok(review.warnings.some(warning => warning.includes('日期、代码')));
  const layer = projectWeeklyEditorial({ input, output, review });
  assert.ok(layer.qualityReview.warnings.some(warning => warning.includes('日期、代码')));
});
