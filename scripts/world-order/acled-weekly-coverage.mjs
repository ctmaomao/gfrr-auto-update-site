// Canonical file regions, not the REGION column's source-specific labels.
export const ACLED_WEEKLY_REGIONS = Object.freeze([
  'Africa', 'Middle-East', 'Europe-Central-Asia', 'US-and-Canada',
  'Latin-America-the-Caribbean', 'Asia-Pacific'
]);

export function weeklyCoverageFailures(entries, label) {
  if (!Array.isArray(entries)) return [`${label} must be an array`];
  const regions = entries.map((entry) => entry?.region);
  const failures = [];
  if (regions.length !== ACLED_WEEKLY_REGIONS.length) failures.push(`${label} must contain exactly six regions`);
  for (const region of ACLED_WEEKLY_REGIONS) {
    const count = regions.filter((value) => value === region).length;
    if (count !== 1) failures.push(`${label}: ${region} must appear exactly once (found ${count})`);
  }
  if (regions.some((region) => !ACLED_WEEKLY_REGIONS.includes(region))) failures.push(`${label} contains an unknown region`);
  return failures;
}

export function selectWeeklyFiles(filenames, warn = () => {}) {
  const byRegion = new Map();
  for (const filename of filenames) {
    // Browser copy suffixes are metadata only; dates and region identity stay strict.
    const match = filename.match(/^([^/\\]+)_aggregated_data_up_to_week_of-(\d{4}-\d{2}-\d{2})(?:[_ -][^/\\]*)?\.xlsx$/iu);
    if (!match || !ACLED_WEEKLY_REGIONS.includes(match[1])) {
      warn(`unknown weekly filename skipped: ${filename}`);
      continue;
    }
    const [, region, fileWeek] = match;
    const parsed = new Date(`${fileWeek}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fileWeek) {
      throw new Error(`invalid weekly filename date: ${filename}`);
    }
    const entries = byRegion.get(region) || [];
    entries.push({ region, fileWeek, filename });
    byRegion.set(region, entries);
  }
  return ACLED_WEEKLY_REGIONS.flatMap((region) => {
    const entries = byRegion.get(region) || [];
    entries.sort((a, b) => b.fileWeek.localeCompare(a.fileWeek) || a.filename.localeCompare(b.filename));
    for (const skipped of entries.slice(1)) warn(`duplicate ${region} weekly file skipped in favor of ${entries[0].filename}: ${skipped.filename}`);
    return entries.slice(0, 1);
  });
}
