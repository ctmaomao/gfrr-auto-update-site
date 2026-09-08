import { createHash } from 'node:crypto';
import { buildArticleIdentity } from './oil-news-story-identity.mjs';
import { normalizeAbsoluteNewsTime } from './oil-news-time.mjs';

export const PUBLICATION_EVIDENCE_LIMITS = Object.freeze({ bytes: 262144, candidates: 100, evidencePerCandidate: 16 });
export const PUBLICATION_EVIDENCE_KINDS = Object.freeze([
  'publisher_jsonld_date_published', 'publisher_meta_published_time', 'publisher_visible_published_time',
  'publisher_date_modified', 'feed_timestamp', 'search_reported_time',
  'toc_timestamp', 'dataset_observed_at', 'http_last_modified'
]);
const PUBLICATION_KINDS = new Set(['publisher_jsonld_date_published', 'publisher_meta_published_time', 'publisher_visible_published_time']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const fail = () => { throw new Error('publication_evidence_invalid'); };
const closed = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
};
const boundedString = (value, max) => typeof value === 'string' && value.length <= max;

export function publicationEvidenceBoundaries() {
  return { sourceAuthenticity: 'unverified', publicationFreshnessQualified: false,
    usedForQualityGates: false, productionEligible: false, baselineUpdated: false,
    networkCalls: 0, productionWrites: 0 };
}

function identity(rawUrl) {
  // The shared normalizer drops credentials; reject them BEFORE normalizing.
  // This is identity-only, never a network target or proof of publisher control.
  if (!boundedString(rawUrl, 4096) || !/^https:\/\//iu.test(rawUrl) || /[\s\u0000-\u001f\u007f\\]/u.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || url.port) return null;
    return buildArticleIdentity({ url: rawUrl }).canonicalUrlHash;
  } catch { return null; }
}

function reviewCandidate(candidate, reviewedAt) {
  closed(candidate, ['canonicalUrlHash', 'datasetObservedAt', 'evidence']);
  const datasetObservedAt = normalizeAbsoluteNewsTime(candidate.datasetObservedAt);
  if (!hash(candidate.canonicalUrlHash) || !datasetObservedAt || Date.parse(datasetObservedAt) > Date.parse(reviewedAt)
      || !Array.isArray(candidate.evidence) || candidate.evidence.length > PUBLICATION_EVIDENCE_LIMITS.evidencePerCandidate) fail();
  const rows = [], seen = new Map();
  for (const entry of candidate.evidence) {
    closed(entry, ['kind', 'articleUrl', 'value', 'capturedAt', 'contentSha256']);
    if (!PUBLICATION_EVIDENCE_KINDS.includes(entry.kind) || !boundedString(entry.articleUrl, 4096)
        || !(entry.value === null || boundedString(entry.value, 128))
        || !boundedString(entry.capturedAt, 128) || !hash(entry.contentSha256)) fail();
    const evidenceHash = sha256(JSON.stringify([entry.kind, entry.articleUrl, entry.value, entry.capturedAt, entry.contentSha256]));
    if (seen.has(evidenceHash)) { seen.get(evidenceHash).occurrences += 1; continue; }
    const articleUrlHash = identity(entry.articleUrl);
    const timestamp = normalizeAbsoluteNewsTime(entry.value);
    const capturedAt = normalizeAbsoluteNewsTime(entry.capturedAt);
    const publicationClaim = PUBLICATION_KINDS.has(entry.kind);
    const reasons = [];
    if (articleUrlHash !== candidate.canonicalUrlHash) reasons.push('article_identity_mismatch');
    if (!capturedAt) reasons.push('capture_time_invalid');
    else if (Date.parse(capturedAt) > Date.parse(reviewedAt)) reasons.push('capture_after_review');
    if (!timestamp) reasons.push('timestamp_missing_or_invalid');
    else if (capturedAt && Date.parse(timestamp) > Date.parse(capturedAt)) reasons.push('timestamp_after_capture');
    if (publicationClaim && timestamp && Date.parse(timestamp) > Date.parse(datasetObservedAt)) reasons.push('publication_after_dataset');
    const row = { evidenceHash, kind: entry.kind, articleUrlHash, contentSha256: entry.contentSha256,
      timestamp, capturedAt, publicationClaim, retrospective: capturedAt ? Date.parse(capturedAt) > Date.parse(datasetObservedAt) : null,
      occurrences: 1, reasons };
    rows.push(row); seen.set(evidenceHash, row);
  }
  const publisherRows = rows.filter(row => row.publicationClaim && !row.reasons.length);
  const claims = new Set(publisherRows.map(row => row.timestamp));
  const reasons = [...new Set(rows.flatMap(row => row.reasons))].sort();
  let status = 'no_publication_evidence';
  let publicationCandidateAt = null;
  if (claims.size > 1) { status = 'conflicting_publication_claims'; reasons.push('publisher_claims_conflict'); }
  else if (reasons.length) status = 'evidence_invalid';
  else if (claims.size === 1) {
    publicationCandidateAt = [...claims][0];
    status = publisherRows.every(row => row.retrospective)
      ? 'retrospective_publication_candidate' : 'publication_candidate_unverified';
  }
  // Even matching declarations are caller claims. Neither hashes nor an
  // operator-selected kind authenticate a publisher or backfill old cohorts.
  return { canonicalUrlHash: candidate.canonicalUrlHash, datasetObservedAt, status,
    publicationCandidateAt, reasons, evidence: rows, ...publicationEvidenceBoundaries() };
}

/** Closed, bounded JSON input. No HTML parsing, URL fetching, files or env reads. */
export function reviewPublicationEvidence(input) {
  if (typeof input !== 'string' && !Buffer.isBuffer(input)) fail();
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  if (bytes.length > PUBLICATION_EVIDENCE_LIMITS.bytes) fail();
  let packet;
  try { packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
  closed(packet, ['schemaVersion', 'reviewedAt', 'candidates']);
  const reviewedAt = normalizeAbsoluteNewsTime(packet.reviewedAt);
  if (packet.schemaVersion !== 'oil-news-publication-evidence-input-v1' || !reviewedAt
      || !Array.isArray(packet.candidates) || packet.candidates.length > PUBLICATION_EVIDENCE_LIMITS.candidates) fail();
  const candidates = packet.candidates.map(candidate => reviewCandidate(candidate, reviewedAt));
  if (new Set(candidates.map(candidate => candidate.canonicalUrlHash)).size !== candidates.length) fail();
  return { schemaVersion: 'oil-news-publication-evidence-review-v1',
    status: candidates.length ? 'review_complete_not_qualified' : 'no_candidates',
    assignedLayer: 'artifact_sanitizer_layer', inputSha256: sha256(bytes), reviewedAt, candidates,
    ...publicationEvidenceBoundaries() };
}
