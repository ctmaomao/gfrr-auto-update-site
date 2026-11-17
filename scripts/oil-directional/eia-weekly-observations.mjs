// Shared EIA weekly projection. Reject the whole response on an invalid row:
// filtering it out would bridge missing weeks in observation-offset changes.
export function parseEiaWeeklyObservations(data) {
  if (!Array.isArray(data) || !data.length) return { ok: false, reason: 'no_data' };
  const series = [];
  for (const row of data) {
    const period = row?.period, raw = row?.value;
    const value = typeof raw === 'number' ? raw
      : typeof raw === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    if (typeof period !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(period)
      || !Number.isFinite(Date.parse(period)) || new Date(period).toISOString().slice(0, 10) !== period
      || !Number.isFinite(value)) return { ok: false, reason: 'invalid_observation' };
    series.push({ period, value });
  }
  series.sort((a, b) => a.period.localeCompare(b.period));
  return { ok: true, series };
}
