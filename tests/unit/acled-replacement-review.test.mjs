import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewAcledReplacement, comparePilotToReference } from '../../scripts/world-order/acled-replacement-review.mjs';
import { pilotMetadata } from '../../scripts/world-order/acled-pilot.mjs';

const now = '2026-09-16T00:00:00.000Z';
function fixture() {
  const id = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
  const metadataJson = JSON.stringify({ data: [{ resource_hdx_id: id, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17' }] });
  const months = pilotMetadata(metadataJson, now).months;
  const data = months.map(month => {
    const [y, m] = month.split('-').map(Number);
    return { location_code: 'AAA', location_name: 'Synthetic', admin_level: 0, admin1_code: null, admin1_name: null,
      admin2_code: null, admin2_name: null, resource_hdx_id: id, event_type: 'political_violence', events: 7, fatalities: 3,
      reference_period_start: `${month}-01T00:00:00`, reference_period_end: new Date(Date.UTC(y, m, 1) - 1000).toISOString().slice(0, 19) };
  });
  return { snapshot: { sampleJson: JSON.stringify({ data }), metadataJson, fetchedAt: now },
    reference: { asOfDate: '2026-08-28', rows: months.map(month => ({ countryCode: 'AAA', month, events: 7 })) } };
}
test('24 months cannot satisfy annual four-year baseline or six metrics and weekly replacement', () => {
  const { snapshot } = fixture(), report = reviewAcledReplacement(snapshot, null, now);
  assert.deepEqual(report.requiredYears, [2022, 2023, 2024, 2025]);
  assert.deepEqual(report.completeYearsInCandidate, [2025]);
  assert.deepEqual(report.missingYears, [2022, 2023, 2024]);
  assert.equal(report.metrics.length, 6); assert.equal(report.productionEligible, false);
  assert.equal(report.metrics[0].numericalComparison, 'reference_missing');
  assert.equal(report.metrics[1].temporalCoverage, 'four_year_baseline_missing');
  assert.equal(report.metrics[4].definition, 'fatality_semantics_unproven');
  assert.equal(report.metrics[5].definition, 'no_proven_mapping');
  assert.equal(report.weekly.status, 'not_replaceable_by_monthly_data');
});
test('exact row equality never proves matching revision, definitions, global scope or publication', () => {
  const { snapshot, reference } = fixture(), before = JSON.stringify({ snapshot, reference });
  const report = reviewAcledReplacement(snapshot, reference, now);
  assert.equal(report.comparison.status, 'values_equal_revision_unproven');
  assert.equal(report.comparison.matchedRows, 24); assert.equal(report.productionEligible, false);
  assert.ok(report.metrics.every(m => m.geography === 'global_scope_unproven'));
  assert.equal(JSON.stringify({ snapshot, reference }), before);
  const encoded = JSON.stringify(report);
  for (const raw of ['AAA', 'Synthetic', 'reference_period_start', 'sampleJson', 'fatalities":3']) assert.ok(!encoded.includes(raw));
});
test('annual completeness requires actual non-null rows for every returned country', () => {
  for (const mutate of [rows => rows.filter(row => !row.reference_period_start.startsWith('2025-01')),
    rows => rows.map(row => row.reference_period_start.startsWith('2025-01') ? { ...row, events: null } : row)]) {
    const { snapshot } = fixture();
    snapshot.sampleJson = JSON.stringify({ data: mutate(JSON.parse(snapshot.sampleJson).data) });
    const report = reviewAcledReplacement(snapshot, null, now);
    assert.deepEqual(report.completeYearsInCandidate, []);
    assert.deepEqual(report.missingYears, [2022, 2023, 2024, 2025]);
    assert.equal(report.metrics[0].temporalCoverage, 'incomplete');
  }
});
test('opposite differences do not cancel, dates do not imply identical revisions', () => {
  const { snapshot, reference } = fixture(); reference.rows[0].events++; reference.rows[1].events--;
  const result = comparePilotToReference(snapshot, reference, now);
  assert.equal(result.changedRows, 2); assert.equal(result.status, 'values_differ_revision_unproven');
  reference.asOfDate = '2026-08-21';
  assert.equal(comparePilotToReference(snapshot, reference, now).status, 'source_date_mismatch');
});
test('missing and reference-only countries are not silently dropped; null is not zero', () => {
  const { snapshot, reference } = fixture(); reference.rows.pop(); reference.rows[0].events = null;
  reference.rows.push({ countryCode: 'BBB', month: '2026-07', events: 0 });
  const result = comparePilotToReference(snapshot, reference, now);
  assert.equal(result.status, 'coverage_indeterminate'); assert.equal(result.missingReference, 1);
  assert.equal(result.missingCandidate, 1); assert.equal(result.nullRows, 1);
});
test('malformed, duplicate, unsafe count, partial month and oversized reference rejected', () => {
  for (const mutate of [r => r.rows.push(r.rows[0]), r => r.rows[0].events = '', r => r.rows[0].events = -1,
    r => r.rows[0].events = Number.MAX_SAFE_INTEGER + 1, r => r.rows[0].month = '2026-08',
    r => r.rows[0].countryCode = 'NZ', r => r.rows[0].countryCode = ['AAA'], r => r.productionApproved = true,
    r => r.rows = Array(50001).fill(r.rows[0])]) {
    const { snapshot, reference } = fixture(); mutate(reference);
    assert.throws(() => comparePilotToReference(snapshot, reference, now));
  }
});
