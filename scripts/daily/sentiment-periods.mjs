import { parseObservationDate } from './source-observation.mjs';
const periods = { previousValue: 1, threeMonthChange: 3, sixMonthChange: 6 };
const empty = () => ({ umichSentiment: null, previousValue: null, threeMonthChange: null,
  sixMonthChange: null, updatedAt: null, sentimentReferences: null });
const valid = (row, now) => typeof row?.date === 'string' && /^\d{4}-\d{2}-01$/.test(row.date)
  && parseObservationDate(row.date, now) === row.date && Number.isFinite(row.value) && row.value >= 0;

// UMCSENT observations are calendar-month labels, not publication dates.
export function sentimentPeriods(rows, nowIso) {
  if (!Array.isArray(rows) || !rows.length) return empty();
  const current = rows.at(-1);
  if (!valid(current, nowIso)) return empty();
  const result = { ...empty(), umichSentiment: current.value, updatedAt: `${current.date}T00:00:00Z` };
  if (rows.some((row, i) => !valid(row, nowIso) || (i > 0 && row.date <= rows[i - 1].date))) return result;
  result.sentimentReferences = {};
  const [year, month] = current.date.split('-').map(Number);
  for (const [field, months] of Object.entries(periods)) {
    const date = new Date(Date.UTC(year, month - 1 - months, 1)).toISOString().slice(0, 10);
    const reference = rows.find(row => row.date === date);
    result.sentimentReferences[field] = reference ? { date, value: reference.value } : null;
    result[field] = reference ? (field === 'previousValue' ? reference.value : +(current.value - reference.value).toFixed(3)) : null;
  }
  return result;
}

// Legacy levels retain their original source month; unproven changes cannot
// be made current or classified as stable just because fetching failed.
export function cachedSentimentPeriods(previous, nowIso) {
  const current = { date: typeof previous?.updatedAt === 'string' ? previous.updatedAt.slice(0, 10) : null,
    value: previous?.umichSentiment };
  const level = sentimentPeriods([current], nowIso);
  if (level.updatedAt !== previous?.updatedAt) return { ...empty(), umichSentiment: level.umichSentiment };
  if (!['live', 'fallback'].includes(previous?.sourceStatus?.umichSentiment)
    || !previous?.sentimentReferences) return { ...level, sentimentReferences: null };
  const rows = [...Object.keys(periods).map(field => previous.sentimentReferences[field]).filter(Boolean), current].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const result = sentimentPeriods(rows, nowIso);
  if (result.umichSentiment !== level.umichSentiment || result.updatedAt !== level.updatedAt) return { ...level, sentimentReferences: null };
  for (const field of Object.keys(periods)) {
    const a = result.sentimentReferences?.[field], b = previous.sentimentReferences[field];
    if (result[field] !== previous[field] || (a?.date ?? null) !== (b?.date ?? null) || (a?.value ?? null) !== (b?.value ?? null)) {
      return { ...level, sentimentReferences: null };
    }
  }
  return result;
}
