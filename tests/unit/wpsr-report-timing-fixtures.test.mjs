import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateWpsrReportTimingFixtures as validate, WPSR_PROTOCOL_SHA256 } from '../../scripts/oil-directional/wpsr-report-timing-fixtures.mjs';
const sha = 'a'.repeat(64);
const cell = (supportId, quoteDate, state = 'numeric', value = 70) => ({ supportId, quoteDate, state, value: state === 'numeric' ? value : null });
const report = (reportId, date, cells) => ({ reportId, sha256: sha, officialReleaseDate: date, indexReleaseDate: date, noticeReleaseDate: null, dataWeekEnding: date,
  retrievedAtUTC: '2026-11-16T00:00:00.000Z', syntheticKnownAtUTC: `${date}T12:00:00.000Z`, httpLastModifiedRaw: 'not release authority', embeddedPDFDatesRaw: 'not release authority',
  layout: 'table11_brent_daily_verified_fixture', units: 'USD/barrel', cells });
function fixture() {
  const reports = [report('a', '2017-12-20', [cell('a1', '2017-12-18')]), report('b', '2017-12-22', [cell('b1', '2017-12-20')]),
    report('c', '2017-12-27', [cell('c1', '2017-12-25'), cell('c2', '2017-12-26')])];
  return { syntheticFixtureOnly: true, asOfUTC: '2026-11-16T00:00:00.000Z', reports,
    manifest: { batches: reports.map(r => ({ releaseDate: r.officialReleaseDate, members: [{ reportId: r.reportId, sha256: sha }] })),
      supportSpecs: [
        { specId: 'features', fromQuoteDate: '2017-12-18', toQuoteDate: '2017-12-18', throughReleaseDate: '2017-12-20', memberIds: ['a'], supportIds: ['a1'] },
        { specId: 'labels', fromQuoteDate: '2017-12-25', toQuoteDate: '2017-12-26', throughReleaseDate: '2017-12-27', memberIds: ['a', 'b', 'c'], supportIds: ['c1', 'c2'] }] },
    closures: [{ specId: 'features', knownAtUTC: '2017-12-22T12:00:00.000Z' }, { specId: 'labels', knownAtUTC: '2017-12-29T00:00:00.000Z' }],
    requests: [{ requestId: 'r', releaseDate: '2017-12-22', featureSpecId: 'features', featureSupportIds: ['a1'], labelSpecId: 'labels', labelSupportIds: ['c1', 'c2'], anchorSupportId: 'c1', endpointSupportId: 'c2' }] };
}
const result = f => validate(f).results[0];
test('frozen exact protocol; pure output only timing eligibility, not actual cases or source first publication', () => {
  assert.equal(createHash('sha256').update(readFileSync(new URL('../../config/wpsr-report-asof-synthetic-protocol.json', import.meta.url))).digest('hex'), WPSR_PROTOCOL_SHA256);
  const f = fixture(); const original = structuredClone(f); const out = validate(f); assert.deepEqual(f, original);
  assert.equal(out.results[0].syntheticTimingEligible, true); assert.equal(out.results[0].issueAt, '2017-12-24T00:00:00.000Z');
  assert.equal(out.results[0].cutoffAt, '2017-12-22T23:59:59.999Z'); assert.equal(out.results[0].labelMatureAt, '2017-12-29T00:00:00.000Z');
  assert.equal(out.caseConstructionVerified, false); assert.equal(out.eligibleForEvaluation, false); assert.equal(out.sourceFirstPublicationVerified, false);
  assert.ok(!JSON.stringify(out).includes('"value"'));
});
test('missing same-day member rejects whole batch; extra member pauses without rewriting manifest', () => {
  const f = fixture(); f.manifest.batches[2].members.push({ reportId: 'missing', sha256: sha });
  assert.ok(validate(f).batches[2].reasons.includes('missing_member')); assert.equal(result(f).syntheticTimingEligible, false);
  const extra = fixture(); extra.reports.push(report('new', '2017-12-27', [])); assert.equal(validate(extra).paused, true);
});
test('same-day numeric/null and numeric conflicts quarantine, same values remain one batch', () => {
  for (const [state, value] of [['numeric', 70], ['numeric', 71], ['source_null', null]]) {
    const f = fixture(); f.manifest.batches[2].members.push({ reportId: 'cOther', sha256: sha });
    f.reports.push(report('cOther', '2017-12-27', [cell('other', '2017-12-25', state, value)]));
    assert.equal(validate(f).batches[2].eligible, state === 'numeric' && value === 70);
  }
});
test('metadata dates cannot repair official dispute, layout averages or future quote', () => {
  for (const edit of [r => { r.indexReleaseDate = '2017-12-28'; }, r => { r.noticeReleaseDate = '2017-12-28'; }, r => { r.layout = 'weekly_average'; }, r => { r.cells[0].quoteDate = '2017-12-28'; }]) {
    const f = fixture(); edit(f.reports[2]); assert.equal(validate(f).batches[2].eligible, false);
  }
  const f = fixture(); f.reports[2].httpLastModifiedRaw = '2017-01-01'; assert.equal(result(f).syntheticTimingEligible, true);
});
test('unknown/quarantined support cannot be omitted from closure or path', () => {
  for (const state of ['unknown_support', 'quarantined']) {
    const f = fixture(); f.reports[2].cells.push(cell('unknown', '2017-12-25', state));
    assert.equal(result(f).syntheticTimingEligible, false); assert.ok(result(f).reasons.includes('label:support_set_incomplete'));
  }
  const f = fixture(); f.requests[0].labelSupportIds = ['c1']; assert.ok(result(f).reasons.includes('label:requested_support_omitted_or_replaced'));
  const missingMember = fixture(); missingMember.manifest.supportSpecs[1].memberIds = ['c']; assert.ok(result(missingMember).reasons.includes('label:support_set_incomplete'));
});
test('boolean/malformed/missing/future closure is pending, never inferred next-report completion', () => {
  for (const knownAtUTC of [true, null, '2017-02-30T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) {
    const f = fixture(); f.closures[1].knownAtUTC = knownAtUTC; assert.equal(result(f).labelMatureAt, null); assert.equal(result(f).syntheticTimingEligible, false);
  }
  const f = fixture(); f.closures.pop(); assert.equal(result(f).labelMatureAt, null);
});
test('full closure maturity crosses split despite both quote/report dates in train', () => {
  const f = fixture(); f.closures[1].knownAtUTC = '2018-01-01T00:00:00.000Z';
  assert.equal(result(f).labelMatureAt, '2018-01-01T00:00:00.000Z'); assert.equal(result(f).purged, true);
  f.asOfUTC = '2017-12-31T23:59:59.999Z'; assert.equal(result(f).labelMatureAt, null);
});
test('feature cutoff day end permitted, any later corroboration forbidden even before issue', () => {
  const f = fixture(); f.closures[0].knownAtUTC = '2017-12-22T23:59:59.999Z'; assert.equal(result(f).syntheticTimingEligible, true);
  f.closures[0].knownAtUTC = '2017-12-23T00:00:00.000Z'; assert.ok(result(f).reasons.includes('feature:closure_pending'));
});
test('later null-to-numeric changes invalidate closed support rather than reindex', () => {
  const f = fixture(); f.reports[2].cells.push(cell('gap', '2017-12-25', 'source_null'));
  // Use a distinct earlier null date within support to avoid same-day conflict.
  f.reports[2].cells.pop(); f.reports[2].cells.push(cell('gap', '2017-12-24', 'source_null'));
  f.manifest.supportSpecs[1].fromQuoteDate = '2017-12-24'; f.manifest.supportSpecs[1].supportIds.push('gap'); f.requests[0].labelSupportIds.push('gap');
  assert.equal(result(f).syntheticTimingEligible, true);
  f.manifest.batches.push({ releaseDate: '2018-01-03', members: [{ reportId: 'later', sha256: sha }] });
  f.reports.push(report('later', '2018-01-03', [cell('late', '2017-12-24')]));
  assert.ok(result(f).reasons.includes('label:late_null_to_numeric_pause')); assert.equal(result(f).labelMatureAt, null);
});
test('one request per report batch; backfill-only batch not new issuance; strict bounded schemas', () => {
  const f = fixture(); f.requests.push({ ...f.requests[0], requestId: 'duplicate' }); assert.throws(() => validate(f), /duplicate/);
  const backfill = fixture(); backfill.reports[1].cells[0].quoteDate = '2017-12-17'; assert.ok(result(backfill).reasons.includes('latest_quote_not_advanced'));
  const invalid = fixture(); invalid.reports[0].cells[0].value = 0; assert.throws(() => validate(invalid), /observation/);
  const sparse = fixture(); sparse.reports = Array(2); assert.throws(() => validate(sparse), /bounded/);
  const unsupported = fixture(); unsupported.syntheticFixtureOnly = false; assert.throws(() => validate(unsupported), /synthetic/);
});

test('same-issuance-date report support can close by D day end; D+2 applies to label maturity only', () => {
  const f = fixture();
  Object.assign(f.manifest.supportSpecs[0], { toQuoteDate: '2017-12-20', throughReleaseDate: '2017-12-22', memberIds: ['a', 'b'], supportIds: ['a1', 'b1'] });
  f.requests[0].featureSupportIds = ['a1', 'b1'];
  f.closures[0].knownAtUTC = '2017-12-22T23:59:59.999Z';
  assert.equal(result(f).syntheticTimingEligible, true);
  f.closures[0].knownAtUTC = '2017-12-21T23:59:59.999Z';
  assert.ok(result(f).reasons.includes('feature:closure_precedes_required_report_date'));
});

test('future null-to-numeric and newly discovered members only flag retrospective audit, not past as-of eligibility', () => {
  const f = fixture(); f.asOfUTC = '2017-12-31T23:59:59.999Z';
  f.reports[2].cells.push(cell('gap', '2017-12-24', 'source_null'));
  f.manifest.supportSpecs[1].fromQuoteDate = '2017-12-24'; f.manifest.supportSpecs[1].supportIds.push('gap'); f.requests[0].labelSupportIds.push('gap');
  const before = result(f);
  f.manifest.batches.push({ releaseDate: '2018-01-03', members: [{ reportId: 'later', sha256: sha }] });
  f.reports.push(report('later', '2018-01-03', [cell('late', '2017-12-24')]));
  const past = validate(f); assert.deepEqual(past.results[0], before); assert.equal(past.retrospectiveAuditPaused, true); assert.equal(past.paused, false);
  f.reports.push(report('new-member', '2018-01-03', []));
  assert.deepEqual(result(f), before); assert.equal(validate(f).retrospectiveAuditPaused, true);
  f.asOfUTC = '2018-01-04T00:00:00.000Z';
  assert.equal(validate(f).paused, true); assert.ok(result(f).reasons.includes('label:late_null_to_numeric_pause'));
});
test('member knowledge must precede closure and feature cutoff; retrieved metadata is not knowledge', () => {
  const f = fixture(); f.reports[0].syntheticKnownAtUTC = '2017-12-23T00:00:00.000Z';
  assert.ok(result(f).reasons.includes('feature:closure_precedes_member_knowledge'));
  f.closures[0].knownAtUTC = '2017-12-23T00:00:00.000Z';
  assert.ok(result(f).reasons.includes('feature:closure_pending'));
  const invalid = fixture(); invalid.reports[0].syntheticKnownAtUTC = '2017-12-19T23:59:59.999Z';
  assert.throws(() => validate(invalid), /knowledge precedes/);
  const future = fixture(); future.asOfUTC = '2017-12-31T23:59:59.999Z'; future.reports[2].syntheticKnownAtUTC = '2018-01-01T00:00:00.000Z';
  assert.equal(result(future).syntheticTimingEligible, false); assert.equal(result(future).labelMatureAt, null);
});
