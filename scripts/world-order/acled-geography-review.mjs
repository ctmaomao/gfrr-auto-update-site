import { inspectAnnualSnapshot } from './acled-annual-collector.mjs';
import { inspectAdmin2Snapshot } from './acled-admin2-collector.mjs';

// Identity crosswalk only, never proof of equivalent territorial/event coverage.
// Source labels: owner-held 21Aug2026 PV workbooks (hashes in source review).
// Canonical labels/codes: OCHA country taxonomy, pinned commit below.
export const TAXONOMY_REVISION = 'ee175764b5550de2169cb98ef1c1c945c4d1658a';
export const COUNTRY_ALIASES = Object.freeze([
  ['Bailiwick of Guernsey', 'GGY', 'Guernsey'],
  ['Bailiwick of Jersey', 'JEY', 'Jersey'],
  ['Bolivia', 'BOL', 'Bolivia (Plurinational State of)'],
  ['Brunei', 'BRN', 'Brunei Darussalam'],
  ['Cape Verde', 'CPV', 'Cabo Verde'],
  ['Caribbean Netherlands', 'BES', 'Bonaire, Sint Eustatius and Saba'],
  ['Curacao', 'CUW', 'Curaçao'],
  ['Czech Republic', 'CZE', 'Czechia'],
  ['East Timor', 'TLS', 'Timor-Leste'],
  ['Falkland Islands', 'FLK', 'Falkland Islands (Malvinas)'],
  ['Iran', 'IRN', 'Iran (Islamic Republic of)'],
  ['Ivory Coast', 'CIV', "Côte d'Ivoire"],
  ['Laos', 'LAO', "Lao People's Democratic Republic"],
  ['Micronesia', 'FSM', 'Micronesia (Federated States of)'],
  ['Moldova', 'MDA', 'Republic of Moldova'],
  ['Nauru', 'NRU', 'Naoero'],
  ['Netherlands', 'NLD', 'Netherlands (Kingdom of the)'],
  ['North Korea', 'PRK', "Democratic People's Republic of Korea"],
  ['Republic of Congo', 'COG', 'Congo'],
  ['Reunion', 'REU', 'Réunion'],
  ['Russia', 'RUS', 'Russian Federation'],
  ['Saint Helena, Ascension and Tristan da Cunha', 'SHN', 'Saint Helena'],
  ['Saint-Barthelemy', 'BLM', 'Saint Barthélemy'],
  ['Saint-Martin', 'MAF', 'Saint Martin (French part)'],
  ['Sint Maarten', 'SXM', 'Sint Maarten (Dutch part)'],
  ['South Korea', 'KOR', 'Republic of Korea'],
  ['Taiwan', 'TWN', 'Taiwan (Province of China)'],
  ['Tanzania', 'TZA', 'United Republic of Tanzania'],
  ['Turkey', 'TUR', 'Türkiye'],
  ['United Kingdom', 'GBR', 'United Kingdom of Great Britain and Northern Ireland'],
  ['United States', 'USA', 'United States of America'],
  ['Vatican City', 'VAT', 'Holy See'],
  ['Vietnam', 'VNM', 'Viet Nam'],
  ['Virgin Islands, U.S.', 'VIR', 'United States Virgin Islands'],
  ['Wallis and Futuna', 'WLF', 'Wallis and Futuna Islands'],
  ['eSwatini', 'SWZ', 'Eswatini']
].map(row => Object.freeze(row)));

// A bounded set of known local reference locations, NOT a global universe or
// the current HRP membership list. UN M49/OCHA identify these codes independently
// of whether this particular ACLED admin0 archive happens to return them.
export const REFERENCE_LOCATIONS = Object.freeze([
  'AFG', 'BFA', 'BDI', 'CMR', 'CAF', 'TCD', 'COL', 'COD', 'ETH', 'HTI', 'LBN', 'MLI',
  'MOZ', 'MMR', 'NER', 'NGA', 'PSE', 'SOM', 'SSD', 'SDN', 'SYR', 'UKR', 'VEN', 'YEM'
]);
// These are unresolved, not excluded/zero-filled. Oceans do not map to a country;
// Kosovo/territorial cases need source-specific treatment before any aggregation.
export const UNRESOLVED_LABELS = Object.freeze([
  'Akrotiri and Dhekelia', 'Atlantic Ocean', 'French Southern and Antarctic Lands',
  'Indian Ocean', 'Kosovo', 'Mediterranean Sea', 'Pacific Ocean', 'Southern Ocean'
]);

export function reviewAcledGeography(snapshot, now = new Date().toISOString(), admin2Snapshot = null) {
  const coverage = inspectAnnualSnapshot(snapshot, now), codes = new Map(), names = new Map();
  for (const partition of snapshot.partitions) for (const row of JSON.parse(partition).data) {
    const code = row.location_code, name = row.location_name;
    if (typeof name !== 'string' || !name.trim() || name.length > 200
      || (codes.has(code) && codes.get(code) !== name) || (names.has(name) && names.get(name) !== code))
      throw new Error('country_identity_ambiguous');
    codes.set(code, name); names.set(name, code);
  }
  const missingAliases = [], mismatchedAliases = [];
  for (const [, code, name] of COUNTRY_ALIASES) {
    if (!codes.has(code)) missingAliases.push(code);
    else if (codes.get(code) !== name) mismatchedAliases.push(code);
  }
  const notReturned = REFERENCE_LOCATIONS.filter(code => !codes.has(code));
  const admin2Evidence = admin2Snapshot === null ? null : inspectAdmin2Snapshot(admin2Snapshot, now);
  return { schemaVersion: 'acled-geography-review-v1', status: 'not_ready_for_global_replacement',
    networkRequests: 0, productionEligible: false, sourceAsOf: coverage.sourceAsOf,
    referenceInventoryAsOf: '2026-08-21', referenceScope: 'previously_audited_pv_workbook_names_only',
    taxonomyRevision: TAXONOMY_REVISION, returnedCountryCodes: codes.size,
    aliases: { registered: COUNTRY_ALIASES.length, exactCanonicalPairs: COUNTRY_ALIASES.length - missingAliases.length - mismatchedAliases.length,
      missingCodes: missingAliases, mismatchedCodes: mismatchedAliases, scope: 'identity_only_territorial_equivalence_unproven' },
    referenceLocations: { inspected: REFERENCE_LOCATIONS.length, returned: REFERENCE_LOCATIONS.length - notReturned.length,
      admin0NotReturnedCodes: notReturned, scope: 'bounded_reference_subset_not_global_universe' },
    unresolvedSourceLabels: [...UNRESOLVED_LABELS],
    admin2: { status: admin2Evidence === null ? 'not_loaded_for_review' : admin2Evidence.sourceAsOf === coverage.sourceAsOf
      ? 'single_country_month_sample_verified' : 'source_date_mismatch',
    ...(admin2Evidence === null ? {} : { evidence: admin2Evidence }),
    crossLevelOverlap: 'not_tested', aggregation: 'not_authorized' },
    numericalEquivalence: 'not_tested', globalCoverage: notReturned.length ? 'admin0_reference_gap_confirmed' : 'not_proven' };
}
