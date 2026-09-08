import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reviewPublicationEvidence, PUBLICATION_EVIDENCE_KINDS } from '../../scripts/oil-directional/oil-news-publication-evidence.mjs';
import { buildArticleIdentity } from '../../scripts/oil-directional/oil-news-story-identity.mjs';

const url = 'https://publisher.example/article?item=1';
const evidence = (change = {}) => ({ kind: 'publisher_jsonld_date_published', articleUrl: url,
  value: '2026-09-08T07:00:00Z', capturedAt: '2026-09-08T08:00:00Z', contentSha256: 'a'.repeat(64), ...change });
const packet = (entries = [evidence()]) => ({ schemaVersion: 'oil-news-publication-evidence-input-v1',
  reviewedAt: '2026-09-08T10:00:00Z', candidates: [{ canonicalUrlHash: buildArticleIdentity({ url }).canonicalUrlHash,
    datasetObservedAt: '2026-09-08T09:00:00Z', evidence: entries }] });
const review = value => reviewPublicationEvidence(JSON.stringify(value));
const candidate = entries => review(packet(entries)).candidates[0];
function unqualified(value) {
  for (const key of ['productionEligible', 'publicationFreshnessQualified', 'usedForQualityGates', 'baselineUpdated']) assert.equal(value[key], false);
  assert.equal(value.sourceAuthenticity, 'unverified');
  assert.equal(value.networkCalls, 0); assert.equal(value.productionWrites, 0);
}

test('publisher declaration is a candidate, never qualification or authenticity', () => {
  const result = review(packet()); unqualified(result); unqualified(result.candidates[0]);
  assert.equal(result.candidates[0].status, 'publication_candidate_unverified');
  assert.equal(result.candidates[0].publicationCandidateAt, '2026-09-08T07:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('publisher.example'), false);
});
test('every non-publication clock stays non-publication; no precedence shortcut', () => {
  for (const kind of PUBLICATION_EVIDENCE_KINDS.slice(3)) {
    const result = candidate([evidence({ kind })]);
    assert.equal(result.status, 'no_publication_evidence'); assert.equal(result.publicationCandidateAt, null); unqualified(result);
  }
});
test('all supported publisher kinds and equivalent offsets agree', () => {
  const result = candidate(PUBLICATION_EVIDENCE_KINDS.slice(0, 3).map(kind => evidence({ kind, value: '2026-09-08T15:00:00+08:00' })));
  assert.equal(result.status, 'publication_candidate_unverified'); unqualified(result);
});
test('conflicting publisher declarations do not choose earliest or newest', () => {
  const result = candidate([evidence(), evidence({ kind: 'publisher_meta_published_time', value: '2026-09-08T06:00:00Z' })]);
  assert.equal(result.status, 'conflicting_publication_claims'); assert.equal(result.publicationCandidateAt, null);
});
test('same title is irrelevant; credentials and distinct article identity are rejected before canonicalization', () => {
  for (const articleUrl of ['https://publisher.example/article?item=2', 'https://user:secret@publisher.example/article?item=1',
    'http://publisher.example/article?item=1', 'https://publisher.example:123/article?item=1', `${url}\nPRIVATE`, 'file:///private']) {
    const result = candidate([evidence({ articleUrl })]); assert.equal(result.status, 'evidence_invalid');
    assert.ok(result.reasons.includes('article_identity_mismatch')); assert.equal(result.publicationCandidateAt, null);
    assert.ok(!JSON.stringify(result).includes('PRIVATE')); assert.ok(!JSON.stringify(result).includes('secret'));
  }
  assert.equal(candidate([evidence({ articleUrl: `${url}&utm_source=tracking#section` })]).status, 'publication_candidate_unverified');
});
test('invalid, missing, relative and timezone-free dates never fill from another clock', () => {
  for (const value of [null, '', 'today PRIVATE', '2026-09-08', '2026-09-08T07:00:00', '2026-02-30T07:00:00Z', '2026-09-08T07:00:00+24:00']) {
    const result = candidate([evidence({ value })]); assert.equal(result.publicationCandidateAt, null);
    assert.ok(result.reasons.includes('timestamp_missing_or_invalid')); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('future capture and publication clocks fail closed', () => {
  for (const [change, reason] of [[{ capturedAt: 'bad' }, 'capture_time_invalid'],
    [{ capturedAt: '2026-09-08T11:00:00Z' }, 'capture_after_review'],
    [{ value: '2026-09-08T08:30:00Z' }, 'timestamp_after_capture'],
    [{ value: '2026-09-08T09:30:00Z', capturedAt: '2026-09-08T10:00:00Z' }, 'publication_after_dataset']]) {
    const result = candidate([evidence(change)]); assert.ok(result.reasons.includes(reason)); assert.equal(result.publicationCandidateAt, null);
  }
});
test('retrospective capture is explicit and cannot backfill a historical cohort', () => {
  const result = candidate([evidence({ capturedAt: '2026-09-08T09:30:00Z' })]);
  assert.equal(result.status, 'retrospective_publication_candidate'); assert.equal(result.evidence[0].retrospective, true); unqualified(result);
});
test('duplicate evidence is one declaration with occurrences; invalid additional evidence cannot be hidden', () => {
  const result = candidate([evidence(), evidence()]); assert.equal(result.evidence.length, 1); assert.equal(result.evidence[0].occurrences, 2);
  assert.equal(candidate([evidence(), evidence({ articleUrl: 'https://other.example/a' })]).status, 'evidence_invalid');
});
test('empty evidence/candidates are explicit and retain all closed gates', () => {
  assert.equal(candidate([]).status, 'no_publication_evidence');
  const input = packet(); input.candidates = []; const result = review(input);
  assert.equal(result.status, 'no_candidates'); unqualified(result);
});
test('schema, count and byte limits reject drift, duplicate candidates and forged approval fields', () => {
  const inputs = [];
  for (const target of ['root', 'candidate', 'evidence']) {
    const p = packet(); (target === 'root' ? p : target === 'candidate' ? p.candidates[0] : p.candidates[0].evidence[0]).productionEligible = true; inputs.push(p);
  }
  const duplicate = packet(); duplicate.candidates.push(duplicate.candidates[0]); inputs.push(duplicate);
  const tooMany = packet(); tooMany.candidates = Array(101).fill(tooMany.candidates[0]); inputs.push(tooMany);
  inputs.push(packet(Array(17).fill(evidence())), packet([evidence({ kind: 'approved_publication' })]), packet([evidence({ contentSha256: 'invalid' })]));
  const badDataset = packet(); badDataset.candidates[0].datasetObservedAt = '2026-09-09T00:00:00Z'; inputs.push(badDataset);
  for (const input of inputs) assert.throws(() => review(input), /publication_evidence_invalid/u);
  assert.throws(() => reviewPublicationEvidence(Buffer.alloc(262145)), /publication_evidence_invalid/u);
  assert.throws(() => reviewPublicationEvidence(Buffer.from([0xff])), /publication_evidence_invalid/u);
  assert.throws(() => reviewPublicationEvidence('{}'), /publication_evidence_invalid/u);
});
test('CLI stdin/stdout only, no fetch and no echo of invalid input or flags', () => {
  const cli = fileURLToPath(new URL('../../scripts/review-oil-news-publication-evidence.mjs', import.meta.url));
  const run = (input, args = []) => spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=()=>{throw new Error("NETWORK_FORBIDDEN")}', cli, ...args],
    { input, encoding: 'utf8', timeout: 10000, env: { SystemRoot: process.env.SystemRoot || '' } });
  const success = run(JSON.stringify(packet())); assert.equal(success.status, 0); unqualified(JSON.parse(success.stdout)); assert.equal(success.stderr, '');
  for (const [input, args] of [['PRIVATE invalid JSON', []], [JSON.stringify(packet()), ['--allow-network']], ['x'.repeat(262145), []]]) {
    const result = run(input, args); assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).code, 'publication_evidence_invalid'); assert.ok(!result.stdout.includes('PRIVATE')); unqualified(JSON.parse(result.stdout));
  }
});

test('exact capacity controls remain valid, and byte capacity counts UTF-8 bytes', () => {
  const p = packet(Array(16).fill(evidence()));
  assert.equal(review(p).candidates[0].evidence[0].occurrences, 16);
  p.candidates = Array.from({ length: 100 }, (_, i) => {
    const articleUrl = `https://publisher.example/article?item=${i}`;
    return { canonicalUrlHash: buildArticleIdentity({ url: articleUrl }).canonicalUrlHash,
      datasetObservedAt: '2026-09-08T09:00:00Z', evidence: [evidence({ articleUrl })] };
  });
  assert.equal(review(p).candidates.length, 100);
  const raw = JSON.stringify(packet());
  assert.equal(reviewPublicationEvidence(raw.padEnd(262144, ' ')).candidates.length, 1);
  assert.throws(() => reviewPublicationEvidence(raw.padEnd(262145, ' ')), /publication_evidence_invalid/u);
  assert.throws(() => reviewPublicationEvidence('汉'.repeat(100000)), /publication_evidence_invalid/u);
});

test('mixed retrospective evidence stays visibly retrospective and unqualified', () => {
  const result = candidate([evidence(), evidence({ kind: 'publisher_visible_published_time', capturedAt: '2026-09-08T09:30:00Z' })]);
  assert.equal(result.status, 'publication_candidate_unverified');
  assert.deepEqual(result.evidence.map(row => row.retrospective), [false, true]); unqualified(result);
});
