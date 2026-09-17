import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACLED_MONTHLY_SLUGS, validateAcledDownloadManifest } from '../../scripts/world-order/acled-download-manifest.mjs';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';

const prefix = 'https://acleddata.com/system/files/2026-09/';
const fixture = () => [
  ...ACLED_WEEKLY_REGIONS.map(r => `${prefix}${r}_aggregated_data_up_to_week_of-2026-09-05.xlsx`),
  ...ACLED_MONTHLY_SLUGS.map(s => `${prefix}number_of_${s}_as-of-04Sep2026.xlsx`),
]; // Synthetic links only; these fixtures do not assert real file availability.
const invalid = urls => assert.throws(() => validateAcledDownloadManifest(urls),
  { message: 'invalid_acled_download_manifest' });

test('twelve identities, deterministic order, no authorization or content inference', () => {
  const urls = fixture(); const before = [...urls];
  const result = validateAcledDownloadManifest(urls);
  assert.equal(result.entries.length, 12);
  assert.equal(result.networkRequests, 0);
  assert.equal(result.productionEligible, false);
  assert.equal(result.contentValidated, false);
  assert.deepEqual(result, validateAcledDownloadManifest([...urls].reverse()));
  assert.deepEqual(urls, before);
});
test('monthly identities track the existing sanitizer contract', () => {
  const source = readFileSync(new URL('../../scripts/world-order/sanitize-acled-monthly.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/slug: '([^']+)'/gu)].map(m => m[1]).sort(), [...ACLED_MONTHLY_SLUGS].sort());
});
test('reject missing, duplicate and unknown identities', () => {
  invalid(null); invalid(fixture().slice(1)); invalid([...fixture(), fixture()[0]]);
  const duplicate = fixture(); duplicate[1] = duplicate[0]; invalid(duplicate);
  const unknown = fixture(); unknown[6] = unknown[6].replace('demonstration_events', 'unknown_events'); invalid(unknown);
});
test('reject unsafe or ambiguous URLs without echoing inputs', () => {
  for (const value of [null, 'https://evil.example/private-secret.xlsx',
    fixture()[0].replace('https:', 'http:'), fixture()[0] + '?token=PRIVATE',
    fixture()[0] + '#fragment', fixture()[0].replace('acleddata.com', 'user:pass@acleddata.com'),
    fixture()[0].replace('/2026-09/', '/2026-13/'), fixture()[0].replace('/2026-09/', '/2026-09/../2026-09/'),
    fixture()[0].replace('Africa', '%41frica'), ' ' + fixture()[0]]) {
    const urls = fixture(); urls[0] = value; invalid(urls);
  }
});
test('monthly dates must agree; impossible dates reject; weekly dates may differ', () => {
  const mixed = fixture(); mixed[6] = mixed[6].replace('04Sep', '28Aug'); invalid(mixed);
  const bad = fixture(); bad[0] = bad[0].replace('2026-09-05', '2026-02-30'); invalid(bad);
  const badMonth = fixture(); badMonth[6] = badMonth[6].replace('04Sep', '31Sep'); invalid(badMonth);
  const weekly = fixture(); weekly[0] = weekly[0].replace('2026-09-05', '2026-08-29');
  assert.equal(validateAcledDownloadManifest(weekly).contentValidated, false);
});
