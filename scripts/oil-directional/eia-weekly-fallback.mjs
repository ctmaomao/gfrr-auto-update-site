import { probeDnavCohort } from '../../tools/oil-directional/replay-eia-dnav-weekly.mjs';

// Verified schedule (all dates below are Eastern standard time):
// https://www.eia.gov/petroleum/supply/weekly/schedule.php
// End before the next unreviewed release. No extrapolation or retry.
const releases = [
  ['2026-11-20', '2026-11-25T15:30:00.000Z'],
  ['2026-11-27', '2026-12-02T15:30:00.000Z'],
  ['2026-12-04', '2026-12-09T15:30:00.000Z'],
  ['2026-12-11', '2026-12-16T15:30:00.000Z'],
  ['2026-12-18', '2026-12-23T15:30:00.000Z'],
  ['2026-12-25', '2026-12-30T15:30:00.000Z'],
];
const expires = Date.parse('2027-01-06T15:30:00.000Z');

export async function selectEiaWeeklyCohort(api, ids, now, probe = probeDnavCohort) {
  const primary = {seriesById: api, fallback: null};
  if (!Number.isFinite(now) || now >= expires) return primary;
  const pin = releases.findLast(([, releaseAt]) => Date.parse(releaseAt) <= now);
  if (!pin) return primary;
  const [week, releaseAt] = pin;
  const latest = id => api[id]?.series?.at(-1)?.period ?? '';
  // No downgrade if any API series is newer, or fetch if API has the whole week.
  if (ids.some(id => latest(id) > week) || ids.every(id => latest(id) === week)) return primary;
  try {
    const {byId} = await probe(week, releaseAt, {now, project: true});
    if (Object.keys(byId).length !== ids.length) return primary;
    const seriesById = {};
    for (const id of ids) {
      const row = byId[id];
      const backup = row?.observations;
      if (!backup || backup.at(-1)?.period !== week || !/^[a-f0-9]{64}$/.test(row.sha256)) return primary;
      // Refuse conflicting vintages, including older observations used by seasonality.
      const comparable = new Map(backup.map(({period, value}) => [period, value]));
      if (api[id]?.series?.some(({period,value}) => comparable.has(period) && comparable.get(period) !== value)) return primary;
      seriesById[id] = {ok: true, series: backup, dnavSha256: row.sha256};
    }
    return {seriesById, fallback: {asOfDate: week, scheduledReleaseAt: releaseAt}};
  } catch {
    return primary;
  }
}
