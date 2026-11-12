import { createHash } from 'node:crypto';
import { buildWeeklyEditorialInput } from './bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial } from './bubble-watch/weekly-editorial-production.mjs';
import { buildWeeklyEditorialWriteResult } from './write-bubble-watch-weekly-editorial.mjs';
import { RECEIPT_GRANT, validateReceiptLedger } from './lib/deepseek-receipt-grant.mjs';

// Pure preparation only: these inputs are NOT authenticated by this module.
// The coordinator must verify their origins and the independent approval before
// using a result. No CLI, environment override, network, file write or Git path.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const hold = () => { throw new Error('reviewed_bubble_publication_hold'); };
const must = value => { if (!value) hold(); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const githubTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
function parse(bytes, limit) {
  must(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit);
  return JSON.parse(bytes.toString('utf8'));
}

export function prepareReviewedBubblePublication({ candidateBytes, archiveBytes, evidence,
  approval, expectedMain, observedMain, currentBubbleBytes, radarData, oilNewsWatch, now }) {
  must(iso(now) && sha(expectedMain) && observedMain === expectedMain);
  const currentBubble = parse(currentBubbleBytes, 2 * 1024 * 1024);
  const candidate = parse(candidateBytes, 128 * 1024);
  must(Buffer.isBuffer(archiveBytes) && archiveBytes.length > 0 && archiveBytes.length <= 256 * 1024);
  must(candidate.schemaVersion === 'bubble-receipt-review-candidate-v1'
    && candidate.selection === RECEIPT_GRANT.id && candidate.publicationReady === false
    && candidate.purpose === 'independent_fact_review_before_publication'
    && candidate.replayEvidenceRetained === true && candidate.containsPrompt === false
    && candidate.containsProviderEnvelope === false && sha(candidate.sourceCommit));
  const { run, artifacts, ledger } = evidence;
  const repository = 'ctmaomao/gfrr-auto-update-site';
  must(run.repository?.full_name === repository && run.head_repository?.full_name === repository
    && run.name === 'Bubble Watch Weekly Editorial Refresh'
    && run.path === '.github/workflows/bubble-watch-weekly-editorial-refresh.yml'
    && run.event === 'workflow_dispatch' && run.head_branch === 'main'
    && run.status === 'completed' && run.conclusion === 'success' && run.run_attempt === 1
    && String(run.id) === candidate.runId && run.head_sha === candidate.sourceCommit
    && githubTime(run.created_at) && githubTime(run.updated_at)
    && Date.parse(run.created_at) <= Date.parse(candidate.generatedAt)
    && Date.parse(candidate.generatedAt) <= Date.parse(run.updated_at)
    && Date.parse(run.updated_at) <= Date.parse(now));
  must(Array.isArray(artifacts) && artifacts.length > 0);
  const matches = artifacts.filter(a => a.name?.startsWith('bubble-receipt-review-candidate-'));
  must(matches.length === 1);
  const artifact = matches[0];
  must(Number.isSafeInteger(artifact.id) && artifact.id > 0 && artifact.expired === false
    && artifact.name === `bubble-receipt-review-candidate-${candidate.runId}`
    && artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === candidate.sourceCommit
    && artifact.digest === `sha256:${hash(archiveBytes)}`);
  // Coordinator verifies the ZIP contains exactly this one regular entry, and
  // binds that extraction to the archive below. This is not a ZIP parser.
  must(evidence.archiveEntry === 'receipt-review-candidate.json'
    && evidence.extractedContentSha256 === hash(candidateBytes));
  validateReceiptLedger(ledger, Date.parse(now));
  must(ledger.entries.length === 2);
  const [reserve, outcome] = ledger.entries;
  must(reserve.runId === candidate.runId && reserve.consumer === RECEIPT_GRANT.consumer
    && outcome.status === 'complete_unreconciled' && outcome.reservationId === reserve.id
    && Date.parse(reserve.time) >= Date.parse(run.created_at)
    && Date.parse(outcome.time) <= Date.parse(run.updated_at));
  const projection = candidate.projection;
  const { input, review } = projection.writeEvidence;
  const layer = projection.weeklyEditorial;
  must(candidate.runId === String(layer.provenance.runId) && candidate.sourceCommit === layer.provenance.sourceCommit
    && candidate.generatedAt === layer.generatedAt && candidate.asOfDate === layer.asOfDate
    && candidate.sourceSnapshotDigest === input.sourceSnapshotDigest
    && candidate.inputDigest === digest(input) && candidate.inputDigest === layer.provenance.inputDigest
    && candidate.artifactDigest === digest(layer.output) && candidate.artifactDigest === layer.provenance.artifactDigest
    && hex(candidate.originalProjectionDigest)
    && candidate.automatedReviewStatus === layer.qualityReview.status);
  const bindings = { selection: RECEIPT_GRANT.id, repository, runId: candidate.runId, runAttempt: 1,
    sourceCommit: candidate.sourceCommit, artifactId: artifact.id,
    archiveSha256: hash(archiveBytes), candidateSha256: hash(candidateBytes),
    outputSha256: candidate.artifactDigest, inputSha256: candidate.inputDigest,
    sourceSnapshotSha256: candidate.sourceSnapshotDigest, evidenceSha256: digest(evidence) };
  must(Object.values(bindings).every(v => v !== undefined)
    && approval.schemaVersion === 'bubble-independent-factual-approval-v1'
    && approval.decision === 'approve_exact_candidate' && digest(approval.bindings) === digest(bindings)
    && hex(approval.reviewReportSha256) && iso(approval.reviewedAt)
    && Date.parse(approval.reviewedAt) >= Date.parse(run.updated_at)
    && Date.parse(approval.reviewedAt) <= Date.parse(now));
  const rebuilt = { ...buildWeeklyEditorialInput({ bubbleWatch: currentBubble, radarData, oilNewsWatch,
    discovery: input.newsContext, generatedAt: input.generatedAt }), newsContext: input.newsContext,
    dataGaps: input.dataGaps };
  must(digest(rebuilt) === digest(input));
  must(digest(reviewWeeklyEditorial({ input, output: layer.output, generatedAt: review.generatedAt })) === digest(review));
  const after = buildWeeklyEditorialWriteResult(currentBubble, projection, { now });
  const content = `${JSON.stringify(after, null, 2)}\n`;
  return { status: 'prepared_not_authorized', expectedMain, target: 'data/bubble-watch.json',
    beforeSha256: hash(currentBubbleBytes), afterSha256: hash(content), approvalSha256: digest(approval), content };
}
