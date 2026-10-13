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
import { requestWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-provider.mjs';
import { normalizeMediaClaimNames, diagnoseMediaClaims } from '../../scripts/bubble-watch/weekly-editorial-claim-diagnostics.mjs';
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
      assert.match(prompt, /EVERY numeric token.*EACH cited media title\/snippet/u);
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

test('site quantitative claims remain separate from qualitative media claims; mixed refs cannot excuse unsupported numbers', () => {
  const { input, output, story } = scenario();
  const item = output.categoryAnalysis[0];
  item.sourceRefIds = ['indicator:fed_policy'];
  item.sourceIndicatorIds = ['fed_policy'];
  item.detailZh = '站内固定 Core-23 记分卡采用既有规则，不因新闻解释改变；政策约束与估值压力仍需持续核对，不能据此推断市场转折。';
  assert.deepEqual(validateWeeklyEditorialOutput(output, input).errors, []);
  item.sourceRefIds.push(story.id);
  item.detailZh = `据Morningstar分析，${item.detailZh}`;
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

test('numeric diagnostics preserve monetary units but cannot approve a translated amount', () => {
  const { input, story } = scenario();
  story.title = 'Revenue report';
  story.snippet = 'Annualized revenue was roughly $50 billion at the end of September, according to the supplied public excerpt.';
  const output = { weeklyTimeline: [{ detailZh: '据Morningstar报道，年化收入约500亿美元。', sourceRefIds: [story.id] }] };
  const source = diagnoseMediaClaims(output, input).claims[0].sources[0];
  assert.deepEqual(source.claimNumberFacts, [{ number: '500', unit: '亿美元', dollarSign: false }]);
  assert.deepEqual(source.evidenceNumberFacts, [{ number: '50', unit: 'billion', dollarSign: true }]);
  assert.deepEqual(source.unsupportedNumbers, ['500']);
  assert.deepEqual(normalizeMediaClaimNames(output, input), output, 'diagnostic units must not alter or silently admit a numerical claim');
});
