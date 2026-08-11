const MONTH_NUMBER_BY_SHORT = new Map([
  ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6],
  ['jul', 7], ['aug', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]
]);

// Keep the stable ACLED dataset slug and as-of date mandatory, but tolerate
// common browser/download-manager suffixes such as `_0`, ` (1)`, or `-copy`.
const FILENAME_PATTERN = /^number_of_(?<slug>[a-z0-9_-]+?)_as-of-(?<day>\d{2})(?<mon>[a-z]{3})(?<year>\d{4})(?:[ _.-][a-z0-9 _().-]*)?\.xlsx$/iu;

export function parseAcledMonthlyFilename(filename) {
  const match = String(filename ?? '').match(FILENAME_PATTERN);
  if (!match) return null;

  const day = Number(match.groups.day);
  const month = MONTH_NUMBER_BY_SHORT.get(match.groups.mon.toLowerCase());
  const year = Number(match.groups.year);
  if (!month || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    slug: match.groups.slug.toLowerCase(),
    asOfDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}
