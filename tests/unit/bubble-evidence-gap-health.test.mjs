import test from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE_GAP_POLICIES, checkVcSourceResponse, checkNeocloudSourceContent, evidenceGapError, isExpectedPolicyFallback, isExpectedPolicyFetchFailure } from '../../scripts/bubble-watch/source-health-policy.mjs';

const today = '2026-09-16';
function fixture(id) {
  const policy = EVIDENCE_GAP_POLICIES[id];
  const error = evidenceGapError(new Error(`${policy.reasonCode}: no qualifying observations`), id, policy.sources.map(source => ({ source, status: 'ok' })), today);
  return { id, as_of: '2026-09-13', stale: false, provenance: { mode: 'auto_fallback', asOfDate: '2026-09-13', ageDays: 3, maxAgeDays: id === 'vc_ai_share' ? 120 : 21, reason: `hybrid_live source failed: ${error.message}`, evidenceGate: error.evidenceGate } };
}
for (const id of Object.keys(EVIDENCE_GAP_POLICIES)) {
  test(`${id}: healthy source with fresh dated research is WARN-eligible`, () => {
    const row = fixture(id);
    assert.equal(isExpectedPolicyFallback(row, today), true);
    assert.equal(isExpectedPolicyFetchFailure({ id, reason: `hybrid_live_source_failed: ${EVIDENCE_GAP_POLICIES[id].reasonCode}: no qualifying observations` }, row, today), true);
  });
  test(`${id}: transport, malformed content, missing diagnostics and stale snapshots remain FAIL`, () => {
    const mutations = [
      r => { r.provenance.evidenceGate.checks[0].status = 'fetch_failed'; },
      r => { r.provenance.evidenceGate.checks[0].status = 'invalid_content'; },
      r => { r.provenance.evidenceGate.checks.pop(); },
      r => { r.provenance.evidenceGate.checks[0] = null; },
      r => { r.provenance.evidenceGate.checks.push(r.provenance.evidenceGate.checks[0]); },
      r => { r.provenance.evidenceGate.checks[0].source = 'unknown source'; },
      r => { delete r.provenance.evidenceGate; },
      r => { r.provenance.evidenceGate.checkedAt = '2026-09-15'; },
      r => { r.provenance.evidenceGate.policy = 'unknown'; },
      r => { r.provenance.evidenceGate.reasonCode = 'transport_error'; },
      r => { r.stale = true; },
      r => { r.provenance.ageDays = null; },
      r => { r.provenance.ageDays = 0; },
      r => { r.provenance.maxAgeDays = 2; },
      r => { r.provenance.maxAgeDays = null; },
      r => { r.provenance.asOfDate = '2026-02-30'; r.as_of = '2026-02-30'; },
      r => { r.provenance.asOfDate = '2026-09-17'; r.as_of = '2026-09-17'; },
      r => { r.as_of = '2026-09-12'; },
      r => { r.provenance.reason = 'hybrid_live source failed: HTTP 403'; },
      r => { r.provenance.mode = 'auto'; },
      r => { r.id = 'insider_sell_buy'; }
    ];
    for (const mutate of mutations) { const row = fixture(id); mutate(row); assert.equal(isExpectedPolicyFallback(row, today), false, mutate.toString()); }
    const row = fixture(id);
    assert.equal(isExpectedPolicyFetchFailure({ id, reason: 'HTTP 403' }, row, today), false);
    assert.equal(isExpectedPolicyFetchFailure({ id: 'other', reason: row.provenance.reason }, row, today), false);
    assert.equal(isExpectedPolicyFallback(row), false);
  });
}
test('Unrecognized errors cannot receive evidence-gap diagnostics', () => {
  for (const message of ['HTTP 403', 'This operation was aborted', 'parser changed']) {
    assert.equal(evidenceGapError(new Error(message), 'vc_ai_share', [], today).evidenceGate, undefined);
  }
});

test('Raw VC response content and metadata must be valid before a semantic gap can WARN', () => {
  const post = { id: 123, date: '2026-03-31T10:30:00', link: 'https://news.crunchbase.com/venture/global-funding/', title: { rendered: 'Older global venture funding report' }, content: { rendered: '<p>Global venture funding in the first quarter included significant AI investment. This historical article discusses the funding environment.</p>' } };
  const classify = rows => {
    const row = fixture('vc_ai_share');
    row.provenance.evidenceGate.checks = [checkVcSourceResponse(rows, today)];
    return isExpectedPolicyFallback(row, today);
  };
  assert.equal(classify([post]), true, 'valid older article is healthy source content');
  for (const mutation of [
    p => { delete p.content; },
    p => { p.content.rendered = '<p> </p>'; },
    p => { p.content.rendered = '<script>' + 'x'.repeat(200) + '</script>'; },
    p => { p.content.rendered = 'Verify you are human. '.repeat(10); },
    p => { p.date = 'bad-date'; },
    p => { p.date = '2026-02-30T12:00:00'; },
    p => { p.date = '2026-03-31T25:00:00'; },
    p => { p.date = '2026-09-17T10:00:00'; },
    p => { p.link = 'not-a-url'; },
    p => { p.link = 'https://example.com/article'; },
    p => { p.link = 'http://news.crunchbase.com/article'; },
    p => { p.id = null; },
    p => { p.title = null; }
  ]) {
    const bad = structuredClone(post); mutation(bad);
    assert.equal(classify([bad]), false, mutation.toString());
    assert.equal(classify([post, bad]), false, 'valid row cannot hide a malformed row');
  }
  for (const rows of [[], null, {}, [null]]) assert.equal(classify(rows), false);
});

test('Neocloud source diagnostics require each registered company and reject challenge pages', () => {
  const row = fixture('neocloud_credit');
  row.provenance.evidenceGate.checks = EVIDENCE_GAP_POLICIES.neocloud_credit.sources.map(source => {
    const company = source.match(/CoreWeave|Lambda|Crusoe|Nebius/u)[0];
    return checkNeocloudSourceContent(source, `${company} has published an official financing update describing its credit facility, terms and funding of additional infrastructure capacity.`);
  });
  assert.equal(isExpectedPolicyFallback(row, today), true);
  for (const text of ['Nebius financing update. '.repeat(10), 'CoreWeave: Verify you are human. '.repeat(10), 'CoreWeave', null]) {
    const bad = structuredClone(row);
    bad.provenance.evidenceGate.checks[0] = checkNeocloudSourceContent('PRNewswire:CoreWeave', text);
    assert.equal(isExpectedPolicyFallback(bad, today), false);
  }
});
