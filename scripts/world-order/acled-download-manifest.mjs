import { ACLED_WEEKLY_REGIONS, selectWeeklyFiles } from './acled-weekly-coverage.mjs';
import { parseAcledMonthlyFilename } from './acled-monthly-filename.mjs';

// Offline identity contract only: no discovery, requests, credentials or writer.
// These are the six existing monthly sanitizer inputs, not six monthly series.
export const ACLED_MONTHLY_SLUGS = Object.freeze([
  'demonstration_events_by_country-year',
  'events_targeting_civilians_by_country-year',
  'political_violence_events_by_country-month-year',
  'political_violence_events_by_country-year',
  'reported_civilian_fatalities_by_country-year',
  'reported_fatalities_by_country-year',
]);

function reject() { throw new Error('invalid_acled_download_manifest'); }

/** Accept links supplied by a separately reviewed discovery step; never invent URLs.
 * Identity validity is NOT provenance, freshness, source permission or content proof.
 * Conservative ASCII paths intentionally fail closed on new upstream naming schemes.
 */
export function validateAcledDownloadManifest(urls, { scope = 'pair' } = {}) {
  if (!['pair', 'weekly'].includes(scope) || !Array.isArray(urls) || urls.length !== (scope === 'pair' ? 12 : 6)) reject();
  const entries = [];
  const identities = new Set();
  for (const raw of urls) {
    if (typeof raw !== 'string' || raw.length > 1024
      || !/^https:\/\/acleddata\.com\/system\/files\/\d{4}-(?:0[1-9]|1[0-2])\/[A-Za-z0-9_.-]+\.xlsx$/u.test(raw)) reject();
    // Raw allowlist above rejects query strings, credentials, escapes and dot paths
    // before URL parsing can normalize away evidence of an unsafe input.
    const filename = raw.slice(raw.lastIndexOf('/') + 1);
    let entry;
    if (filename.startsWith('number_of_')) {
      const parsed = parseAcledMonthlyFilename(filename);
      if (!parsed || !ACLED_MONTHLY_SLUGS.includes(parsed.slug)) reject();
      entry = { kind: 'monthly', identity: parsed.slug, filename, url: raw, sourceDate: parsed.asOfDate };
    } else {
      let parsed;
      try { [parsed] = selectWeeklyFiles([filename]); } catch { reject(); }
      if (!parsed) reject();
      entry = { kind: 'weekly', identity: parsed.region, filename, url: raw, sourceDate: parsed.fileWeek };
    }
    const key = `${entry.kind}:${entry.identity}`;
    if (identities.has(key)) reject();
    identities.add(key);
    entries.push(entry);
  }
  for (const region of ACLED_WEEKLY_REGIONS) if (!identities.has(`weekly:${region}`)) reject();
  if (scope === 'pair') for (const slug of ACLED_MONTHLY_SLUGS) if (!identities.has(`monthly:${slug}`)) reject();
  const monthlyDates = new Set(entries.filter(e => e.kind === 'monthly').map(e => e.sourceDate));
  if (monthlyDates.size !== (scope === 'pair' ? 1 : 0)) reject();
  // Weekly dates may differ; only the existing content sanitizer proves a common window.
  return { schemaVersion: 'acled-download-manifest-v1', status: 'identities_validated_only',
    networkRequests: 0, productionEligible: false, contentValidated: false,
    entries: entries.sort((a, b) => `${a.kind}:${a.identity}`.localeCompare(`${b.kind}:${b.identity}`)) };
}
