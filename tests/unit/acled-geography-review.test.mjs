import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { COUNTRY_ALIASES, REFERENCE_LOCATIONS, reviewAcledGeography } from '../../scripts/world-order/acled-geography-review.mjs';

const now = '2026-09-16T00:00:00.000Z', id = '99a32d01-d0ca-4f57-a0f5-cb6b5f01f14f';
function fixture(locations = COUNTRY_ALIASES.map(([, code, name]) => [code, name])) {
  const metadataBefore = JSON.stringify({ data: [{ resource_hdx_id: id, dataset_hdx_stub: 'political-violence-events-and-fatalities',
    dataset_hdx_provider_stub: 'acled', format: 'xlsx', name: 'political-violence-events-and-fatalities_as-of-2026-08-28.xlsx',
    update_date: '2026-09-03T10:29:54', hapi_updated_date: '2026-09-07T01:33:17' }] });
  const partitions = [2022, 2024].map(year => JSON.stringify({ data: locations.flatMap(([code, name]) => Array.from({ length: 24 }, (_, i) => ({
    location_code: code, location_name: name, admin_level: 0, admin1_code: null, admin1_name: null, admin2_code: null, admin2_name: null,
    resource_hdx_id: id, event_type: 'political_violence', events: 0, fatalities: 0,
    reference_period_start: new Date(Date.UTC(year, i, 1)).toISOString().slice(0, 19),
    reference_period_end: new Date(Date.UTC(year, i + 1, 1) - 1000).toISOString().slice(0, 19)
  }))) }));
  return { metadataBefore, metadataAfter: metadataBefore, partitions, fetchedAt: now };
}
test('explicit unique aliases verify identity only, not territories, coverage or publication', () => {
  for (const col of [0, 1, 2]) assert.equal(new Set(COUNTRY_ALIASES.map(row => row[col])).size, 36);
  const snapshot = fixture(), before = JSON.stringify(snapshot), report = reviewAcledGeography(snapshot, now);
  assert.equal(report.aliases.exactCanonicalPairs, 36); assert.equal(report.referenceLocations.returned, 0);
  assert.deepEqual(report.referenceLocations.admin0NotReturnedCodes, REFERENCE_LOCATIONS);
  assert.equal(report.globalCoverage, 'admin0_reference_gap_confirmed');
  assert.equal(report.productionEligible, false); assert.equal(report.admin2.aggregation, 'not_authorized');
  assert.equal(report.admin2.crossLevelOverlap, 'not_tested'); assert.equal(report.unresolvedSourceLabels.length, 8);
  assert.equal(JSON.stringify(snapshot), before); assert.ok(!JSON.stringify(report).includes('fatalities'));
});
test('all sentinel codes present still cannot establish a global universe', () => {
  const report = reviewAcledGeography(fixture(REFERENCE_LOCATIONS.map(code => [code, `Synthetic ${code}`])), now);
  assert.equal(report.referenceLocations.returned, 24); assert.equal(report.globalCoverage, 'not_proven');
  assert.equal(report.aliases.missingCodes.length, 36); assert.equal(report.productionEligible, false);
});
test('canonical spelling drift remains mismatched, not fuzzy-normalized', () => {
  const report = reviewAcledGeography(fixture([['GBR', 'United Kingdom']]), now);
  assert.deepEqual(report.aliases.mismatchedCodes, ['GBR']); assert.equal(report.aliases.exactCanonicalPairs, 0);
});
test('one-to-many and cross-period names fail closed', () => {
  assert.throws(() => reviewAcledGeography(fixture([['AAA', 'Duplicate'], ['BBB', 'Duplicate']]), now), /identity/u);
  const snapshot = fixture([['AAA', 'Synthetic']]), body = JSON.parse(snapshot.partitions[1]);
  body.data[0].location_name = 'Other'; snapshot.partitions[1] = JSON.stringify(body);
  assert.throws(() => reviewAcledGeography(snapshot, now), /identity/u);
});
test('missing month and wrong layer cannot be hidden by country presence', () => {
  for (const change of [rows => rows.pop(), rows => { rows[0].admin_level = 2; }]) {
    const snapshot = fixture(), body = JSON.parse(snapshot.partitions[0]); change(body.data); snapshot.partitions[0] = JSON.stringify(body);
    assert.throws(() => reviewAcledGeography(snapshot, now));
  }
});
test('CLI rejects live, paths and arbitrary arguments without reading or requesting data', () => {
  const result = spawnSync(process.execPath, ['scripts/review-acled-geography.mjs', '--live'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { status: 'geography_review_unavailable', networkRequests: 0, productionEligible: false });
});
