// Strict absolute metadata parsing; never infer a timezone, publication date,
// or relative date from the machine clock. Used only by the Web shadow layer.
export function parseAbsoluteNewsTime(value) {
  const match = typeof value === 'string' ? value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|([+-])(\d{2}):(\d{2}))$/u
  ) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
      || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59
      || (match[7] && (Number(match[8]) > 23 || Number(match[9]) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAbsoluteNewsTime(value) {
  const time = parseAbsoluteNewsTime(value);
  return time === null ? null : new Date(time).toISOString();
}

export function parseNewsDatasetTimestamp(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u) : null;
  return match ? parseAbsoluteNewsTime(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`) : null;
}
