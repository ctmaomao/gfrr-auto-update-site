function monthLabel(index) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function parseMonthlyEventCount(value, context = 'monthly EVENTS') {
  const text = String(value ?? '').replace(/,/gu, '').trim();
  if (text === '') throw new Error(`${context}: missing monthly event count`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${context}: invalid monthly event count`);
  return parsed;
}

export function completeMonthlyWindows(asOfDate) {
  const date = new Date(`${asOfDate}T00:00:00.000Z`);
  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(asOfDate)
      || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== asOfDate) {
    throw new Error('monthly trend requires a valid asOfDate');
  }
  // Conservative coverage: even a month-end publication does not establish
  // complete all-day ingestion. Always exclude the as-of month, not wall-clock month.
  const end = date.getUTCFullYear() * 12 + date.getUTCMonth() - 1;
  const months = Array.from({ length: 24 }, (_, i) => end - 23 + i);
  return {
    months,
    latest12mWindow: [monthLabel(end - 11), monthLabel(end)],
    prior12mWindow: [monthLabel(end - 23), monthLabel(end - 12)]
  };
}

export function buildMonthlyTrend(rows, asOfDate, warn = () => {}) {
  const windows = completeMonthlyWindows(asOfDate);
  const totals = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.year) || row.year < 1990 || row.year > 2100
        || !Number.isInteger(row.month) || row.month < 1 || row.month > 12
        || !Number.isSafeInteger(row.value) || row.value < 0) throw new Error('invalid monthly trend row');
    const index = row.year * 12 + row.month - 1;
    totals.set(index, (totals.get(index) ?? 0) + row.value);
  }
  const missing = windows.months.filter((index) => !totals.has(index));
  if (missing.length > 0) {
    warn(`monthly trend unavailable: missing complete calendar months ${missing.map(monthLabel).join(', ')}`);
    return null;
  }
  const sum = (keys) => keys.reduce((total, key) => total + totals.get(key), 0);
  const latest12mEvents = sum(windows.months.slice(12));
  const prior12mEvents = sum(windows.months.slice(0, 12));
  if (!Number.isSafeInteger(latest12mEvents) || !Number.isSafeInteger(prior12mEvents)) throw new Error('monthly trend total exceeds safe integer range');
  return {
    latest12mWindow: windows.latest12mWindow,
    prior12mWindow: windows.prior12mWindow,
    latest12mEvents,
    prior12mEvents,
    latest12mVsPrior12mDelta: prior12mEvents === 0 ? null : Number((latest12mEvents / prior12mEvents - 1).toFixed(6))
  };
}
