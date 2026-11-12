import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNewsDiscovery, LIMITED_SEARCH_DISCLOSURE } from '../../scripts/bubble-watch/weekly-editorial-news.mjs';
import { buildWeeklyEditorialInput } from '../../scripts/bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial } from '../../scripts/bubble-watch/weekly-editorial-production.mjs';
import { buildWeeklyEditorialWriteResult } from '../../scripts/write-bubble-watch-weekly-editorial.mjs';
import { buildBubbleReceiptCandidate, serializeBubbleReceiptCandidate } from '../../scripts/prepare-bubble-receipt-candidate.mjs';
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
import { createHash, randomUUID } from 'node:crypto';
import { POLICY, POLICY_DIGEST, LEGACY_POLICY_DIGEST, digest } from '../../scripts/lib/deepseek-budget.mjs';
import { GRANT, VERIFICATION_GRANT, validateOneShotLedger } from '../../scripts/lib/deepseek-one-shot.mjs';
import { prepareReceiptLedger } from '../../scripts/lib/deepseek-receipt-grant.mjs';
import { prepareReviewedBubblePublication } from '../../scripts/prepare-reviewed-bubble-publication.mjs';
const NOW = Date.parse('2026-11-12T08:00:00.000Z');
const iso = n => new Date(n).toISOString();
const key = 'SYNTHETIC_RECEIPT_KEY';
function historic(policy, index) {
  const at = Date.parse(index ? '2026-11-11T02:00:00.000Z' : '2026-11-10T02:00:00.000Z');
  const review = { policyDigest: LEGACY_POLICY_DIGEST, verifiedAt: iso(at), expiresAt: iso(at + 86400000), evidenceSha256: digest('synthetic price') };
  const usages = index ? [[18120, 4127], [6302, 1823]] : [[17518, 4252], [7596, 1279]];
  const entries = usages.flatMap(([prompt, output], i) => {
    const id = randomUUID();
    return [{ id, kind: 'reserve', time: iso(at + i * 10000 + 1000), consumer: ['bubble-editorial', 'macro-editorial'][i], mode: 'manual',
      runId: String(index * 2 + i + 1), keyId: digest(key), requestDigest: digest(`request${index}${i}`), reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: digest(review) },
    { id: randomUUID(), kind: 'outcome', time: iso(at + i * 10000 + 2000), reservationId: id, status: 'complete_unreconciled',
      requestIdDigest: digest(`response${index}${i}`), usage: { prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output }, code: null }];
  });
  const ledger = { schemaVersion: 'deepseek-one-shot-v1', grant: { policy, authorizedAt: iso(at), authorizationEvidenceSha256: digest('synthetic authorization'), initializationParentSha: 'a'.repeat(40) }, reviews: [review], entries };
  validateOneShotLedger(ledger, NOW, policy.id);
  return { selection: policy.id, head: String(index + 1).repeat(40), genesisSha: String(index + 3).repeat(40), ledgerSha256: digest(ledger), ledger };
}
function input() {
  const snapshot = { observedAt: iso(NOW - 1000), calendarMonth: '2026-11', projectUtcOffsetMinutes: 0, exportUtcOffsetMinutes: 780,
    coveredFrom: '2026-10-31T11:00:00.000Z', coveredThrough: '2026-11-12T11:00:00.000Z', exportSha256: digest('synthetic export'),
    accountScopeEvidenceSha256: digest('synthetic all keys evidence'), accountSpendCny: '0.2643584', historicalDebitMicroCny: 2836985, keyId: digest(key),
    quiescenceEvidenceSha256: digest('synthetic all paths attestation'), unknownRequests: 0, allProjectPathsControlled: true,
    inventorySha256: digest('synthetic inventory'), earlyCompleted: [[17086,4740],[17188,5138],[17111,4845],null].map((u, i) => ({ runId: ['41526065601','41531578149','41534908718','41539541399'][i], completedAt: '2026-11-02T22:44:00.000Z', evidenceSha256: digest(`synthetic early${i}`), status: 'completed', usage: u ? { prompt_tokens:u[0], completion_tokens:u[1], total_tokens:u[0]+u[1] } : null })),
    legacy: [historic(GRANT, 0), historic(VERIFICATION_GRANT, 1)] };
  const grant = { policy: RECEIPT_GRANT, authorizedAt: iso(NOW - 500), expiresAt: iso(NOW + 3600000), authorizationEvidenceSha256: digest('synthetic one-call approval'), initializationParentSha: 'f'.repeat(40), snapshot };
  const review = { policyDigest: POLICY_DIGEST, verifiedAt: iso(NOW), expiresAt: iso(NOW + 86400000), evidenceSha256: digest('synthetic current price') };
  return { grant, review, approvedGrantDigest: digest(grant) };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function request() {
  const p = pack(), candidate = build(p);
  const candidateBytes = Buffer.from(serializeBubbleReceiptCandidate(candidate));
  // Synthetic archive bytes only: archive authentication/extraction is coordinator-owned.
  const archiveBytes = Buffer.from('SYNTHETIC ARCHIVE');
  const data = input(), ledger = prepareReceiptLedger(data, NOW);
  const reserve = { id: randomUUID(), kind: 'reserve', time: iso(NOW + 1000), consumer: 'bubble-editorial', mode: 'manual',
    runId: '123', keyId: digest(key), requestDigest: digest('synthetic payload'), reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: digest(data.review) };
  ledger.entries = [reserve, { id: randomUUID(), kind: 'outcome', time: iso(NOW + 120000), reservationId: reserve.id,
    status: 'complete_unreconciled', requestIdDigest: digest('synthetic provider id'), usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }, code: null }];
  const evidence = { run: { id: 123, repository: { full_name: 'ctmaomao/gfrr-auto-update-site' }, head_repository: { full_name: 'ctmaomao/gfrr-auto-update-site' },
    name: 'Bubble Watch Weekly Editorial Refresh', path: '.github/workflows/bubble-watch-weekly-editorial-refresh.yml', event: 'workflow_dispatch',
    head_branch: 'main', status: 'completed', conclusion: 'success', run_attempt: 1, head_sha: candidate.sourceCommit,
    created_at: '2026-11-12T08:00:00Z', updated_at: '2026-11-12T08:04:30Z' },
    artifacts: [{ id: 42, expired: false, name: 'bubble-receipt-review-candidate-123', workflow_run: { id: 123, head_sha: candidate.sourceCommit }, digest: `sha256:${hash(archiveBytes)}` }],
    ledger, archiveEntry: 'receipt-review-candidate.json', extractedContentSha256: hash(candidateBytes) };
  const bindings = { selection: RECEIPT_GRANT.id, repository: 'ctmaomao/gfrr-auto-update-site', runId: '123', runAttempt: 1,
    sourceCommit: candidate.sourceCommit, artifactId: 42, archiveSha256: hash(archiveBytes), candidateSha256: hash(candidateBytes),
    outputSha256: candidate.artifactDigest, inputSha256: candidate.inputDigest, sourceSnapshotSha256: candidate.sourceSnapshotDigest,
    evidenceSha256: hash(JSON.stringify(evidence)) };
  return { candidateBytes, archiveBytes, evidence, approval: { schemaVersion: 'bubble-independent-factual-approval-v1',
    decision: 'approve_exact_candidate', bindings, reviewReportSha256: digest('synthetic review report'), reviewedAt: iso(NOW + 280000) },
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
test('run, artifact, content, approval, ledger, current head and freshness mismatches HOLD', () => {
  for (const mutate of [
    r => { r.observedMain = 'c'.repeat(40); }, r => { r.now = '2026-11-14T00:00:00.000Z'; },
    r => { r.evidence.run.created_at = '2026-02-30T08:00:00Z'; }, r => { r.evidence.run.updated_at = '2026-11-12T08:04:30+00:00'; },
    r => { r.evidence.run.run_attempt = 2; }, r => { r.evidence.run.head_branch = 'other'; },
    r => { r.evidence.run.conclusion = 'failure'; }, r => { r.evidence.run.head_sha = 'c'.repeat(40); },
    r => { r.evidence.artifacts.push(r.evidence.artifacts[0]); }, r => { r.evidence.artifacts[0].expired = true; },
    r => { r.archiveBytes = Buffer.from('different archive'); }, r => { r.candidateBytes = Buffer.concat([r.candidateBytes, Buffer.from(' ')]); },
    r => { r.approval.decision = 'hold'; }, r => { r.approval.bindings.outputSha256 = '0'.repeat(64); },
    r => { r.evidence.ledger.entries.pop(); }, r => { r.evidence.ledger.entries[0].runId = '456'; },
    r => { const b = JSON.parse(r.currentBubbleBytes); b.as_of_date = '2026-11-13'; r.currentBubbleBytes = Buffer.from(JSON.stringify(b)); }
  ]) { const r = request(); mutate(r); assert.throws(() => prepareReviewedBubblePublication(r)); }
});
test('even a freshly rebound approval cannot bypass source rebuild or retained-review checks', () => {
  const r = request();
  r.radarData = { updatedAt: '2026-11-12T08:00:00.000Z', values: { spx: 123 } };
  assert.throws(() => prepareReviewedBubblePublication(r));
});
