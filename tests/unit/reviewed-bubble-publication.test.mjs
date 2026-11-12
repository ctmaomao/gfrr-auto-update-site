import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNewsDiscovery, LIMITED_SEARCH_DISCLOSURE } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
import { buildBubbleReceiptCandidate, serializeBubbleReceiptCandidate } from '../../scripts/prepare-bubble-receipt-candidate.mjs';
import { PRIVATE_CLAIM_ID } from '../../scripts/lib/deepseek-private-claim.mjs';
import { RECEIPT_GRANT } from '../../scripts/lib/deepseek-receipt-grant.mjs';
const read = file => JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const healthy = { status: 'ok', successCount: 6, failureCount: 0 };
const failed = { status: 'error', successCount: 0, failureCount: 6 };
const snippet = 'Morningstar analysts believe AI infrastructure financing could improve credit access while leaving demand and repayment risks unresolved. This is an institutional opinion rather than independent confirmation.';
function pack() {
  const bubble = read('data/bubble-watch.json');
  const date = bubble.as_of_date;
  const discovery = buildNewsDiscovery({ rawStories: [{ provider: 'brave', topic: 'ai_financing_credit',
    title: 'AI financing credit assessment', url: 'https://morningstar.com/bonds/ai-credit', snippet, publishedAt: date }],
    sourceStatus: { tavily: failed, brave: healthy }, generatedAt: `2026-11-12T08:00:00.000Z`, windowStart: date, windowEnd: date });
  const input = buildWeeklyEditorialInput({ bubbleWatch: bubble, discovery, generatedAt: `2026-11-12T08:01:00.000Z` });
  const sample = read('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json');
  const story = input.newsContext.stories[0];
  const replace = value => typeof value === 'string' && value.startsWith('news:') ? story.id : Array.isArray(value) ? value.map(replace)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)])) : value;
  const output = replace(sample);
  output.asOfDate = date;
  output.generatedAt = `2026-11-12T08:02:00.000Z`;
  if (input.scoringSnapshot.contractVersion === 'bubble-watch-v3') output.scorecardSynthesisZh = input.scoringSnapshot.scorecardDisclosureZh;
  output.confidence = { level: 'medium', score: 60, reasonZh: '新闻证据有限，综合站内指标并保留覆盖限制。' };
  output.dataGaps = ['仅有一条专业媒体摘要，机构观点尚未独立核实。', LIMITED_SEARCH_DISCLOSURE];
  for (const claim of [...output.weeklyTimeline, ...output.keyTensions, ...output.categoryAnalysis, output.historicalComparison]) {
    if (claim.sourceRefIds.includes(story.id)) {
      claim.titleZh = '融资条件与风险';
      claim.detailZh = '据Morningstar分析，人工智能基础设施融资可能改善信用获取，但需求与偿还风险仍存在。这属于机构观点，尚未独立核实。';
    }
  }
  for (const event of output.weeklyTimeline) {
    event.date = story.publishedAt.slice(0, 10);
    event.titleZh = `报道：${event.titleZh}`;
    event.detailZh = `${event.date} 据媒体报道，${event.detailZh}`;
  }
  output.sourceAttribution = output.sourceAttribution.filter((row, i, all) => all.findIndex(other => other.sourceRefId === row.sourceRefId) === i);
  const review = reviewWeeklyEditorial({ input, output, generatedAt: `2026-11-12T08:03:00.000Z` });
  const layer = projectWeeklyEditorial({ input, output, review, generatedAt: `2026-11-12T08:04:00.000Z`, sourceCommit: 'a'.repeat(40), runId: '123' });
  const projection = { schemaVersion: 'bubble-watch-weekly-editorial-production-projection-v1', target: 'data/bubble-watch.json.summary.weekly_editorial', generatedAt: layer.generatedAt, weeklyEditorial: layer, writeEvidence: { input, review } };
  return { bubble, discovery, input, output, review, layer, projection, now: `2026-11-12T08:05:00.000Z` };
}


const env = { DEEPSEEK_BUDGET_SELECTION: RECEIPT_GRANT.id, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
  EDITORIAL_PROVIDER_OUTCOME: 'success', EDITORIAL_REVIEW_OUTCOME: 'success', GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'ctmaomao/gfrr-auto-update-site', GITHUB_WORKFLOW: 'Bubble Watch Weekly Editorial Refresh',
  GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', DEEPSEEK_API_KEY: 'test-secret-never-retained-12345' };
const build = (p, override = {}) => buildBubbleReceiptCandidate({ bubbleWatch: p.bubble, projection: p.projection, now: p.now, env, ...override });
import { createHash } from 'node:crypto';
import { prepareReviewedBubblePublication } from '../../scripts/prepare-reviewed-bubble-publication.mjs';
const NOW = Date.parse('2026-11-12T08:00:00.000Z');
const iso = n => new Date(n).toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function request() {
  const p = pack(), candidate = build(p);
  const candidateBytes = Buffer.from(serializeBubbleReceiptCandidate(candidate));
  // Synthetic archive bytes only: archive authentication/extraction is coordinator-owned.
  const archiveBytes = Buffer.from('SYNTHETIC ARCHIVE');
  const expectedClaimId = PRIVATE_CLAIM_ID, claimHead = 'd'.repeat(40), treeSha = 'e'.repeat(40);
  const marker = { schemaVersion: 'opaque-one-use-v1', state: 'consumed' };
  const markerBytes = Buffer.from(JSON.stringify(marker));
  const blobSha = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${markerBytes.length}\0`), markerBytes])).digest('hex');
  const evidence = { run: { id: 123, repository: { full_name: 'ctmaomao/gfrr-auto-update-site' }, head_repository: { full_name: 'ctmaomao/gfrr-auto-update-site' },
    name: 'Bubble Watch Weekly Editorial Refresh', path: '.github/workflows/bubble-watch-weekly-editorial-refresh.yml', event: 'workflow_dispatch',
    head_branch: 'main', status: 'completed', conclusion: 'success', run_attempt: 1, head_sha: candidate.sourceCommit,
    created_at: '2026-11-12T08:00:00Z', updated_at: '2026-11-12T08:04:30Z' },
    artifacts: [{ id: 42, expired: false, name: 'bubble-receipt-review-candidate-123', workflow_run: { id: 123, head_sha: candidate.sourceCommit }, digest: `sha256:${hash(archiveBytes)}` }],
    claim: { ref: { ref: `refs/heads/deepseek-once-${expectedClaimId}`, object: { type: 'commit', sha: claimHead } },
      commit: { sha: claimHead, parents: [], message: 'Record one-use claim', tree: { sha: treeSha } },
      tree: { sha: treeSha, truncated: false, tree: [{ path: 'claim.json', mode: '100644', type: 'blob', sha: blobSha }] },
      file: { sha: blobSha, encoding: 'base64', content: Buffer.from(JSON.stringify(marker)).toString('base64') } },
    jobs: [{ id: 456, run_id: 123, run_attempt: 1, head_sha: candidate.sourceCommit, name: 'bubble-watch-weekly-editorial-refresh',
      status: 'completed', conclusion: 'success', steps: [
        ...['Run one DeepSeek editorial call', 'Review and project display-only production layer',
          'Prepare receipt-grant review candidate', 'Upload receipt-grant review candidate'].map(name => ({ name, status: 'completed', conclusion: 'success' })),
        ...['Write weekly editorial field', 'Commit refreshed weekly editorial'].map(name => ({ name, status: 'completed', conclusion: 'skipped' }))] }],
    archiveEntry: 'receipt-review-candidate.json', extractedContentSha256: hash(candidateBytes) };
  const bindings = { selection: RECEIPT_GRANT.id, repository: 'ctmaomao/gfrr-auto-update-site', runId: '123', runAttempt: 1,
    sourceCommit: candidate.sourceCommit, artifactId: 42, archiveSha256: hash(archiveBytes), candidateSha256: hash(candidateBytes),
    outputSha256: candidate.artifactDigest, inputSha256: candidate.inputDigest, sourceSnapshotSha256: candidate.sourceSnapshotDigest,
    claimRef: evidence.claim.ref.ref, claimHead, evidenceSha256: hash(JSON.stringify(evidence)) };
  return { candidateBytes, archiveBytes, evidence, expectedClaimId, approval: { schemaVersion: 'bubble-independent-factual-approval-v1',
    decision: 'approve_exact_candidate', bindings, reviewReportSha256: hash('synthetic review report'), reviewedAt: iso(NOW + 280000) },
    expectedMain: 'b'.repeat(40), observedMain: 'b'.repeat(40), currentBubbleBytes: Buffer.from(JSON.stringify(p.bubble)), now: p.now };
}
test('pure preparation returns exact existing-writer result and no authenticated/publication claim', () => {
  const r = request(), before = structuredClone(r);
  const result = prepareReviewedBubblePublication(r);
  assert.equal(result.status, 'prepared_not_authorized');
  assert.equal(result.target, 'data/bubble-watch.json');
  assert.equal(result.expectedMain, r.expectedMain);
  assert.deepEqual(JSON.parse(result.content), buildWeeklyEditorialWriteResult(JSON.parse(r.currentBubbleBytes), JSON.parse(r.candidateBytes).projection, { now: r.now }));
  assert.deepEqual(structuredClone(r), before);
});
test('run, artifact, content, approval, opaque claim, current head and freshness mismatches HOLD', () => {
  for (const mutate of [
    r => { r.observedMain = 'c'.repeat(40); }, r => { r.now = '2026-11-14T00:00:00.000Z'; },
    r => { r.evidence.run.created_at = '2026-02-30T08:00:00Z'; }, r => { r.evidence.run.updated_at = '2026-11-12T08:04:30+00:00'; },
    r => { r.evidence.run.run_attempt = 2; }, r => { r.evidence.run.head_branch = 'other'; },
    r => { r.evidence.run.conclusion = 'failure'; }, r => { r.evidence.run.head_sha = 'c'.repeat(40); },
    r => { r.evidence.artifacts.push(r.evidence.artifacts[0]); }, r => { r.evidence.artifacts[0].expired = true; },
    r => { r.archiveBytes = Buffer.from('different archive'); }, r => { r.candidateBytes = Buffer.concat([r.candidateBytes, Buffer.from(' ')]); },
    r => { r.approval.decision = 'hold'; }, r => { r.approval.bindings.outputSha256 = '0'.repeat(64); },
    r => { r.expectedClaimId = '9'.repeat(64); }, r => { r.evidence.claim.ref.object.sha = '9'.repeat(40); },
    r => { r.evidence.claim.commit.parents.push({ sha: 'a'.repeat(40) }); }, r => { r.evidence.claim.commit.message = 'private'; },
    r => { r.evidence.claim.tree.tree.push({ path: 'private.json' }); },
    r => { r.evidence.claim.file.content = Buffer.from(JSON.stringify({ schemaVersion: 'opaque-one-use-v1', state: 'consumed', usage: 1 })).toString('base64'); },
    r => { r.evidence.jobs[0].steps[0].conclusion = 'failure'; }, r => { r.evidence.jobs[0].run_id = 999; },
    r => { r.evidence.jobs[0].steps.pop(); }, r => { r.evidence.ledger = { usage: 1 }; },
    r => { const b = JSON.parse(r.currentBubbleBytes); b.as_of_date = '2026-11-13'; r.currentBubbleBytes = Buffer.from(JSON.stringify(b)); }
  ]) { const r = request(); mutate(r); assert.throws(() => prepareReviewedBubblePublication(r)); }
});
test('even a freshly rebound approval cannot bypass source rebuild or retained-review checks', () => {
  const r = request();
  r.radarData = { updatedAt: '2026-11-12T08:00:00.000Z', values: { spx: 123 } };
  assert.throws(() => prepareReviewedBubblePublication(r));
});

test('fresh factual approval cannot legitimize failed provider, missing marker or a second artifact upload', () => {
  for (const mutate of [
    r => { r.evidence.jobs[0].steps[0].conclusion = 'failure'; },
    r => { r.evidence.jobs[0].steps.push({ ...r.evidence.jobs[0].steps[3] }); },
    r => { r.evidence.claim.file.content = Buffer.from('{}').toString('base64'); },
    r => { r.evidence.jobs[0].steps.at(-1).conclusion = 'success'; }
  ]) {
    const r = request(); mutate(r); r.approval.bindings.evidenceSha256 = hash(JSON.stringify(r.evidence));
    assert.throws(() => prepareReviewedBubblePublication(r));
  }
});
