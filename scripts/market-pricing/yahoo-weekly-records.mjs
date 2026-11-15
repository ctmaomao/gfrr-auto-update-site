// Shared Yahoo weekly normalization. Preserve source date labels; no network or file writes.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/u;

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function isoWeekFromDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function canonicalizeWeeklyRecords(config, chartJson, { today, range, interval }) {
  const chart = chartJson?.chart;
  if (chart?.error) {
    throw new Error(`yahoo_chart_error: ${chart.error.description || chart.error.code || 'unknown'}`);
  }

  const result = chart?.result?.[0];
  const meta = result?.meta || {};
  if (meta.symbol !== config.yahooSymbol) {
    throw new Error(`symbol_mismatch: expected ${config.yahooSymbol}, got ${meta.symbol || 'missing'}`);
  }

  if (meta.instrumentType !== config.expectedInstrumentType) {
    throw new Error(`instrument_type_invalid: expected ${config.expectedInstrumentType}, got ${meta.instrumentType || 'missing'}`);
  }

  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const byIsoWeek = new Map();

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const close = Number(closes[index]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (!DATE_PATTERN.test(date) || date > today) continue;
    if (close < config.plausibleClose.min || close > config.plausibleClose.max) continue;

    const isoWeek = isoWeekFromDate(date);
    const record = {
      date,
      isoWeek,
      close: round4(close),
      sourceFile: `yahoo-chart-${config.yahooEncodedSymbol}-${range}-${interval}.json`,
      sourceVendor: 'yahoo_chart'
    };
    const existing = byIsoWeek.get(isoWeek);
    if (!existing || record.date > existing.date) {
      byIsoWeek.set(isoWeek, record);
    }
  }

  const records = [...byIsoWeek.values()].sort((left, right) => left.date.localeCompare(right.date));
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!DATE_PATTERN.test(record.date) || !ISO_WEEK_PATTERN.test(record.isoWeek)) {
      throw new Error(`sanitized_record_invalid: ${config.assetKey} index ${index}`);
    }
    if (index > 0 && record.date <= records[index - 1].date) {
      throw new Error(`sanitized_record_order_invalid: ${config.assetKey} index ${index}`);
    }
  }

  return records;
}

export function buildCoverage(records) {
  return {
    weeklyRows: records.length,
    hasAtLeast60Weeks: records.length >= 60,
    oldestDate: records[0]?.date || null,
    latestDate: records.at(-1)?.date || null
  };
}
