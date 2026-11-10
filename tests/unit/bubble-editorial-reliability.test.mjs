import { fixtureDeepSeekBudget } from '../helpers/deepseek-budget-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildNewsDiscovery, assessWeeklyEditorialNewsReadiness, LIMITED_SEARCH_DISCLOSURE } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { validateNewsDiscovery, validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from '../../scripts/bubble-watch/weekly-editorial-contract.mjs';
import { normalizeWeeklyEditorialProviderOutput, requestWeeklyEditorial, parseWeeklyEditorialProviderContent } from '../../scripts/bubble-watch/weekly-editorial-provider.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial, validateWeeklyEditorialProduction } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { validateWeeklyEditorialWriteEvidence, assertWeeklyEditorialWriterContext } from '../../scripts/bubble-watch/weekly-editorial-write-evidence.mjs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
import { classifyRun, hasCurrentEditorial, PROVIDER_STEP } from '../../scripts/bubble-watch/editorial-followup.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
const failed = { status: 'error', successCount: 0, failureCount: 6 };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';
function pack() {
  const bubble = read('data/bubble-watch.json');
  const date = bubble.as_of_date;
  const discovery = buildNewsDiscovery({ rawStories: [{ provider: 'brave', topic: 'ai_financing_credit',
    title: 'AI financing credit assessment', url: 'https://morningstar.com/bonds/ai-credit', snippet, publishedAt: date }],
    sourceStatus: { tavily: failed, brave: healthy }, generatedAt: `${date}T00:00:00.000Z`, windowStart: date, windowEnd: date });
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery, generatedAt: `${date}T00:01:00.000Z` });
  const sample = read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  const story = input.newsContext.stories[0];
  const replace = value => typeof value === 'string' && value.startsWith('news:') ? story.id : Array.isArray(value) ? value.map(replace)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)])) : value;
  const output = replace(sample);
  output.asOfDate = date;
  output.generatedAt = `${date}T00:02:00.000Z`;
  if (input.scoringSnapshot.contractVersion === 'bubble-watch-v3') output.scorecardSynthesisZh = input.scoringSnapshot.scorecardDisclosureZh;
  output.confidence = { level: 'medium', score: 60, reasonZh: '新闻证据有限，综合站内指标并保留覆盖限制。' };
  output.dataGaps = ['仅有一条专业媒体摘要，机构观点尚未独立核实。', LIMITED_SEARCH_DISCLOSURE];
  for (const claim of [...output.weeklyTimeline, ...output.keyTensions, ...output.categoryAnalysis, output.historicalComparison]) {
    if (claim.sourceRefIds.includes(story.id)) {
      claim.titleZh = '融资条件与风险';
      claim.detailZh = '据Morningstar分析，人工智能基础设施融资可能改善信用获取，但需求与偿还风险仍存在。这属于机构观点，尚未独立核实。';
    }
  }
  output.sourceAttribution = output.sourceAttribution.filter((row, i, all) => all.findIndex(other => other.sourceRefId === row.sourceRefId) === i);
  const review = reviewWeeklyEditorial({ input, output, generatedAt: `${date}T00:03:00.000Z` });
  const layer = projectWeeklyEditorial({ input, output, review, generatedAt: `${date}T00:04:00.000Z`, sourceCommit: 'a'.repeat(40), runId: '123' });
  const projection = { schemaVersion: 'bubble-watch-weekly-editorial-production-projection-v1', target: 'data/bubble-watch.json.summary.weekly_editorial', generatedAt: layer.generatedAt, weeklyEditorial: layer, writeEvidence: { input, review } };
  return { bubble, discovery, input, output, review, layer, projection, now: `${date}T00:05:00.000Z` };
}

test('one healthy search channel admits only bounded reliable evidence as a disclosed limited edition', () => {
  const p = pack();
  assert.equal(assessWeeklyEditorialNewsReadiness(p.discovery).editorialReady, true);
  assert.equal(p.input.newsContext.coverageMode, 'limited_single_search');
  assert.equal(p.input.newsContext.stories[0].evidenceStatus, 'attributed_media');
  assert.equal(p.review.status, 'warn');
  assert.equal(p.layer.provenance.editorialFormat, 'limited');
  assert.equal(validateWeeklyEditorialProduction(p.layer, p.bubble).ok, true);
  assert.equal(validateWeeklyEditorialWriteEvidence({ bubbleWatch: p.bubble, projection: p.projection, now: p.now }).ok, true);
  const next = buildWeeklyEditorialWriteResult(p.bubble, p.projection, { now: p.now });
  const before = structuredClone(p.bubble); delete before.summary.weekly_editorial;
  const after = structuredClone(next); delete after.summary.weekly_editorial;
  assert.deepEqual(after, before);
  assert.ok(p.layer.sourceLedger.every(source => !Object.hasOwn(source, 'snippet')));
});

test('single-channel admission rejects untrusted, stale, title-only and unhealthy evidence', () => {
  const { discovery } = pack();
  for (const mutate of [d => { d.sourceStatus.brave = failed; d.liveProviderCount = 0; }, d => { d.sourceStatus.brave = { ...healthy, failureCount: 1 }; },
    d => { d.stories[0].providers = ['tavily']; }, d => { d.stories[0].snippet = 'short'; }, d => { d.stories[0].contentScope = 'title_only'; },
    d => { d.stories[0].publishedAt = '2020-01-01'; }, d => { d.stories[0].publishedAt = 'invalid'; }, d => { d.stories[0].evidenceStatus = 'discovery_only'; },
    d => { d.stories[0].evidenceStatus = 'official'; d.stories[0].domain = 'official.example'; }, d => { d.liveProviderCount = 2; },
    d => { d.stories[0].url = 'https://lookalike.example/story'; }, d => { d.stories = []; }]) {
    const d = structuredClone(discovery); mutate(d);
    const result = assessWeeklyEditorialNewsReadiness(d);
    assert.equal(result.editorialReady, false); assert.equal(result.expectedSkip, false);
  }
});

test('limited edition cannot hide discovery limits, boost confidence or invent financial evidence', () => {
  const { input, output } = pack();
  for (const mutate of [o => { o.dataGaps = ['数据仍待积累']; }, o => { o.confidence.score = 71; }, o => { o.confidence.level = 'high'; },
    o => { o.weeklyTimeline[0].detailZh += '收入达到9999亿美元。'; }, o => { o.weeklyTimeline[0].detailZh += '原话是：“完全没有偿还风险”。'; },
    o => { o.weeklyTimeline[0].sourceRefIds = ['news:invented']; }, o => { o.boundaries.affectsBubbleWatchScoring = true; }]) {
    const o = structuredClone(output); mutate(o); assert.equal(validateWeeklyEditorialOutput(o, input).ok, false);
  }
});

test('safe deterministic format repair never discards invalid attributions or changes financial prose', () => {
  const { input, output } = pack();
  const malformed = structuredClone(output); malformed.sourceAttribution.push({ sourceRefId: 'news:invented', noteZh: 'untrusted' });
  const repaired = normalizeWeeklyEditorialProviderOutput(malformed, input).output;
  assert.ok(repaired.sourceAttribution.some(row => row.sourceRefId === 'news:invented'));
  assert.equal(validateWeeklyEditorialOutput(repaired, input).ok, false);
  const duplicate = structuredClone(output); duplicate.sourceAttribution.push(duplicate.sourceAttribution[0]);
  assert.equal(validateWeeklyEditorialOutput(normalizeWeeklyEditorialProviderOutput(duplicate, input).output, input).ok, false);
  const missing = structuredClone(output); missing.sourceAttribution.pop(); missing.confidence.score = 0.6; missing.dataGaps = ['媒体摘要尚未充分核实。'];
  const fixed = normalizeWeeklyEditorialProviderOutput(missing, input).output;
  assert.equal(fixed.confidence.score, 60); assert.ok(fixed.dataGaps.includes(LIMITED_SEARCH_DISCLOSURE));
  assert.deepEqual(fixed.weeklyTimeline, output.weeklyTimeline);
  assert.deepEqual(normalizeWeeklyEditorialProviderOutput(fixed, input).output, fixed);
  assert.deepEqual(parseWeeklyEditorialProviderContent('```json\n' + JSON.stringify(output) + '\n```'), output);
  assert.throws(() => parseWeeklyEditorialProviderContent(JSON.stringify(output).slice(0, -1)));
});

test('writer rejects missing, tampered, stale, future, re-dated and changed-source evidence', () => {
  const p = pack();
  for (const mutate of [q => { delete q.writeEvidence; }, q => { q.writeEvidence.input.structuredFacts[0].factZh += '改写'; },
    q => { q.weeklyEditorial.sourceLedger[0].sourceName = 'forged'; }, q => { q.writeEvidence.review.status = 'pass'; },
    q => { q.weeklyEditorial.output.leadZh += '改写'; }, q => { q.weeklyEditorial.freshness.artifactGeneratedAt = p.now; },
    q => { q.weeklyEditorial.provenance.runId = null; }, q => { q.generatedAt = p.now; },
    q => { q.writeEvidence.input.generatedAt = p.now; }, q => { q.writeEvidence.input.newsContext.generatedAt = '2026-02-30T00:00:00Z'; },
    q => { delete q.writeEvidence.input.newsContext.coverageMode; }, q => { q.writeEvidence.input.newsContext.stories[0].snippet = 'Subscribe to unlock'; }]) {
    const q = structuredClone(p.projection); mutate(q);
    assert.throws(() => buildWeeklyEditorialWriteResult(p.bubble, q, { now: p.now }), /write evidence/);
  }
  const changed = structuredClone(p.bubble); changed.indicators[0].value_display += ' changed';
  assert.throws(() => buildWeeklyEditorialWriteResult(changed, p.projection, { now: p.now }), /snapshot/);
  const later = new Date(Date.parse(p.now) + 31 * 3600000).toISOString();
  assert.throws(() => buildWeeklyEditorialWriteResult(p.bubble, p.projection, { now: later }), /30-hour/);
  assert.throws(() => buildWeeklyEditorialWriteResult(p.bubble, p.projection, { now: `${p.input.asOfDate}T00:00:00.000Z` }), /clocks/);
});

test('writer re-grounds the original excerpt even if candidate digests have been recomputed', () => {
  const p = pack(), q = structuredClone(p.projection);
  q.weeklyEditorial.output.weeklyTimeline[0].detailZh += '融资规模9999亿美元。';
  const sha = digest(q.weeklyEditorial.output);
  q.weeklyEditorial.provenance.artifactDigest = sha; q.weeklyEditorial.validation.artifactDigest = sha;
  q.writeEvidence.review.artifactDigest = sha;
  assert.throws(() => buildWeeklyEditorialWriteResult(p.bubble, q, { now: p.now }), /numbers absent/);
});

test('publication status requires the actual matching article; cost suppression stays conservative', () => {
  const p = pack();
  assert.equal(validateWeeklyEditorialProduction({}, p.bubble).ok, false);
  const run = { id: 123, status: 'completed', conclusion: 'success', run_attempt: 1 };
  const steps = [{ name: PROVIDER_STEP, started_at: p.now, conclusion: 'success' }, { name: 'Commit refreshed weekly editorial', conclusion: 'success' }];
  const data = structuredClone(p.bubble); data.summary.weekly_editorial = p.layer;
  const args = { run, steps, discovery: p.discovery, asOfDate: p.input.asOfDate, data };
  assert.equal(classifyRun(args).reason, 'published');
  assert.equal(classifyRun({ ...args, data: null }).reason, 'unverified');
  data.summary.weekly_editorial = { asOfDate: p.input.asOfDate };
  assert.notEqual(classifyRun(args).reason, 'published');
  assert.equal(hasCurrentEditorial(data, p.now), true);
});

test('trusted writer context is required and offline provider path remains one-call/no-retry', async () => {
  const p = pack();
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_WORKFLOW: 'Bubble Watch Weekly Editorial Refresh', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123' };
  assert.doesNotThrow(() => assertWeeklyEditorialWriterContext(p.layer, env));
  for (const field of Object.keys(env)) assert.throws(() => assertWeeklyEditorialWriterContext(p.layer, { ...env, [field]: 'wrong' }));
  let calls = 0;
  const result = await requestWeeklyEditorial({ budget: fixtureDeepSeekBudget, input: p.input, apiKey: 'offline-only', now: () => new Date(p.output.generatedAt), fetchImpl: async () => {
    calls++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(p.output) } }] }) };
  } });
  assert.equal(calls, 1); assert.equal(result.diagnostics.retryCount, 0);
});


test('unhealthy search rows cannot donate snippets or corroborating domains through clustering', () => {
  const { discovery } = pack();
  const common = { topic: 'ai_financing_credit', title: 'Identical financing story title', publishedAt: discovery.windowEnd };
  const d = buildNewsDiscovery({ rawStories: [
    { ...common, provider: 'tavily', url: 'https://sec.gov/filing', snippet },
    { ...common, provider: 'brave', url: 'https://unknown.example/filing', snippet: 'short' }
  ], sourceStatus: { tavily: { status: 'partial', successCount: 1, failureCount: 5 }, brave: healthy },
  generatedAt: discovery.generatedAt, windowStart: discovery.windowStart, windowEnd: discovery.windowEnd });
  assert.equal(assessWeeklyEditorialNewsReadiness(d).editorialReady, false);
  assert.equal(d.stories[0].domain, 'unknown.example');
  const historicalMerged = structuredClone(discovery); historicalMerged.stories[0].providers.push('tavily');
  assert.equal(assessWeeklyEditorialNewsReadiness(historicalMerged).editorialReady, false);
});


test('writer recomputes indicator and news attribution rather than trusting a new self-consistent digest', () => {
  for (const kind of ['indicator', 'news']) {
    const p = pack();
    const input = structuredClone(p.input);
    input.sourceRefs.find(source => source.kind === kind).sourceName = 'Forged source publisher';
    const review = reviewWeeklyEditorial({ input, output: p.output, generatedAt: p.review.generatedAt });
    const layer = projectWeeklyEditorial({ input, output: p.output, review, generatedAt: p.layer.generatedAt,
      sourceCommit: p.layer.provenance.sourceCommit, runId: p.layer.provenance.runId });
    const projection = { ...p.projection, weeklyEditorial: layer, writeEvidence: { input, review } };
    assert.throws(() => buildWeeklyEditorialWriteResult(p.bubble, projection, { now: p.now }), /source references/);
  }
});

function corroborationDiscovery(extra = {}) {
  const row = { provider: 'brave', topic: 'ai_financing_credit', title: 'AI credit financing outlook',
    url: 'https://unknown-a.example/story', publishedAt: '2026-11-03', snippet };
  return buildNewsDiscovery({ rawStories: [row, { ...row, url: 'https://unknown-b.example/story', snippet: 'Separate reporting describes potential AI infrastructure funding benefits while emphasizing unresolved repayment and demand uncertainty. This does not establish a systemic credit event.', ...extra }],
    sourceStatus: { brave: healthy, tavily: failed }, generatedAt: '2026-11-03T01:00:00Z',
    windowStart: '2026-10-27', windowEnd: '2026-11-03' });
}

test('single-channel corroboration excludes stale, future, undated, short and paywall hits before trust upgrades', () => {
  for (const extra of [{ publishedAt: '2020-01-01', snippet: 'Subscribe to read' },
    { publishedAt: '2020-01-01' }, { publishedAt: '2026-11-04' }, { publishedAt: null },
    { snippet: 'short' }, { snippet: `Subscribe to read ${snippet}` },
    { url: 'https://sec.gov/story', publishedAt: '2020-01-01' }]) {
    const discovery = corroborationDiscovery(extra);
    assert.equal(validateNewsDiscovery(discovery).ok, true);
    assert.ok(discovery.stories.every(story => story.evidenceStatus === 'discovery_only'));
    assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, false);
    assert.equal(assessWeeklyEditorialNewsReadiness(discovery).expectedSkip, false);
  }
});

test('valid single-channel cross-domain excerpts remain qualified with consistent compact evidence', () => {
  const discovery = corroborationDiscovery();
  assert.equal(validateNewsDiscovery(discovery).ok, true);
  assert.equal(discovery.stories.length, 1);
  assert.equal(discovery.stories[0].evidenceStatus, 'cross_checked');
  assert.deepEqual(discovery.stories[0].supportingDomains, ['unknown-a.example', 'unknown-b.example']);
  assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, true);
  const bubble = read('data/bubble-watch.json');
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
  assert.equal(validateWeeklyEditorialInput(input).ok, true);
  assert.equal(assessWeeklyEditorialNewsReadiness(input.newsContext).editorialReady, true);
  assert.deepEqual(input.newsContext.stories[0], discovery.stories[0]);
  for (const domains of [[], ['unknown-a.example'], ['unknown-a.example', 'unknown-a.example'], ['other-a.example', 'other-b.example']]) {
    const damaged = structuredClone(discovery);
    damaged.stories[0].supportingDomains = domains;
    assert.equal(assessWeeklyEditorialNewsReadiness(damaged).editorialReady, false);
  }
  const duplicate = corroborationDiscovery({ url: 'https://unknown-a.example/story' });
  assert.equal(assessWeeklyEditorialNewsReadiness(duplicate).editorialReady, false);
  assert.equal(validateNewsDiscovery(duplicate).ok, true);
  const rejectedDuplicate = corroborationDiscovery({ url: 'https://unknown-a.example/story', snippet: 'short' });
  assert.equal(validateNewsDiscovery(rejectedDuplicate).ok, true);
  assert.equal(rejectedDuplicate.stories.length, 1);
});


// Synthetic benign shapes only; no external diagnostic excerpts belong in fixtures.
const navigationExcerpt = 'Markets and technology. Most Read: The city garden opens this weekend. Related stories: A museum extends its summer hours.';
const newsletterAgenda = 'Welcome to Private Markets, this is our weekly newsletter about capital. Today, we look at gardens, museum schedules and transport plans.';
const scriptAnalysis = 'Some observers expect durable AI demand, but construction delays can pressure project cash flows and increase financing uncertainty. This is commentary, not a reported company transaction.';
function evidenceDiscovery(snippets, dual = false) {
  return buildNewsDiscovery({ rawStories: snippets.map((snippet, index) => ({ provider: 'brave',
    topic: ['market_structure_valuation', 'ai_financing_credit', 'ai_capex_earnings'][index % 3],
    title: ['Market concentration outlook', 'Software credit sentiment improves', 'Broadcast script'][index % 3],
    url: `https://${['ft.com', 'bloomberg.com', 'cnbc.com'][index % 3]}/news/story-${index}`, snippet, publishedAt: '2026-11-09' })),
  sourceStatus: { brave: healthy, tavily: dual ? healthy : failed }, generatedAt: '2026-11-10T00:00:00Z', windowStart: '2026-11-03', windowEnd: '2026-11-10' });
}

test('navigation and newsletter agenda cannot become article evidence, while script commentary survives', () => {
  for (const dual of [false, true]) {
    const discovery = evidenceDiscovery([navigationExcerpt, newsletterAgenda, scriptAnalysis], dual);
    assert.equal(validateNewsDiscovery(discovery).ok, true);
    const readiness = assessWeeklyEditorialNewsReadiness(discovery);
    assert.equal(readiness.editorialReady, true);
    assert.equal(readiness.credibleCount, 1);
    assert.equal(readiness.coverageMode, dual ? 'dual_search' : 'limited_single_search');
    assert.equal(discovery.stories.find(s => s.domain === 'cnbc.com').evidenceStatus, 'attributed_media');
    for (const story of discovery.stories.filter(s => s.domain !== 'cnbc.com')) {
      assert.equal(story.evidenceStatus, 'discovery_only');
      assert.equal(story.contentScope, 'title_only');
      assert.equal(story.snippet, null);
    }
    const bubble = read('data/bubble-watch.json');
    const before = digest(bubble);
    const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery });
    assert.equal(validateWeeklyEditorialInput(input).ok, true);
    assert.equal(digest(bubble), before);
    assert.ok(!JSON.stringify(input).includes(navigationExcerpt));
    assert.ok(!JSON.stringify(input).includes(newsletterAgenda));
    assert.ok(JSON.stringify(input).includes(scriptAnalysis));
    assert.equal(input.newsContext.stories.filter(s => s.evidenceStatus === 'attributed_media').length, 1);
    const clean = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery: evidenceDiscovery([scriptAnalysis], dual) });
    assert.equal(input.sourceSnapshotDigest, clean.sourceSnapshotDigest);
    assert.deepEqual(input.scoringSnapshot, clean.scoringSnapshot);
    assert.deepEqual(input.structuredFacts, clean.structuredFacts);
  }
});

test('forged excerpt and media labels do not bypass readiness or compact-input sanitization', () => {
  for (const dual of [false, true]) for (const snippet of [navigationExcerpt, newsletterAgenda]) {
    const discovery = evidenceDiscovery([scriptAnalysis], dual);
    discovery.stories[0].snippet = snippet;
    discovery.stories[0].contentScope = 'excerpt';
    discovery.stories[0].evidenceStatus = 'attributed_media';
    assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, false);
    assert.equal(validateNewsDiscovery(discovery).ok, false);
    const input = buildWeeklyEditorialInput({ bubbleWatch: read('data/bubble-watch.json'), discovery });
    assert.ok(!JSON.stringify(input).includes(snippet));
    assert.ok(input.newsContext.stories.every(s => s.snippet === null && s.evidenceStatus === 'discovery_only'));
    assert.ok(input.sourceRefs.filter(s => s.kind === 'news').every(s => s.sourceClass === 'discovery_only'));
  }
});

test('contaminated rows cannot donate corroboration or official trust under either search mode', () => {
  for (const dual of [false, true]) {
    const d = evidenceDiscovery([scriptAnalysis], dual);
    const common = { provider: 'brave', topic: 'ai_financing_credit', title: 'AI infrastructure funding outlook', publishedAt: '2026-11-09' };
    const discovery = buildNewsDiscovery({ ...d, rawStories: [
      { ...common, url: 'https://unknown.example/report', snippet: scriptAnalysis },
      { ...common, url: 'https://sec.gov/report', snippet: navigationExcerpt }
    ] });
    assert.ok(discovery.stories.every(s => s.evidenceStatus === 'discovery_only'));
    assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, false);
  }
});

test('substantive newsletters remain usable and navigation after the length cap is rejected before truncation', () => {
  const substantive = 'Welcome to our newsletter. Analysts argue that delayed construction can weaken cash flows despite durable AI demand; financing risks remain uncertain.';
  assert.equal(assessWeeklyEditorialNewsReadiness(evidenceDiscovery([substantive])).editorialReady, true);
  const discovery = evidenceDiscovery([scriptAnalysis.repeat(3) + ' Most Read: garden opening hours']);
  assert.equal(discovery.stories[0].snippet, null);
  assert.equal(assessWeeklyEditorialNewsReadiness(discovery).editorialReady, false);
});


test('page-furniture detection preserves popular/recommended analytical prose but rejects repeated navigation', () => {
  for (const snippet of [
    'The most popular AI models saw revenue growth slow this quarter, according to the company published earnings report; analysts caution that demand remains uncertain.',
    'Analysts recommended articles on financing risk because these explain why project delays can pressure cash flows even while demand remains robust.'
  ]) assert.equal(assessWeeklyEditorialNewsReadiness(evidenceDiscovery([snippet])).editorialReady, true);
  const navigation = 'CompaniesShow more Companies Energy Financials Retail Technology TechShow more Tech Artificial intelligence Semiconductors Cyber Security';
  assert.equal(assessWeeklyEditorialNewsReadiness(evidenceDiscovery([navigation])).editorialReady, false);
  assert.equal(evidenceDiscovery([navigation]).stories[0].snippet, null);
});
