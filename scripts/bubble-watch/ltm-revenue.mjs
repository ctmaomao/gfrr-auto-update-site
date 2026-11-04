// Dated revenue qualification only. No new source, light threshold or model.
import { htmlToText } from './public-html-parsers.mjs';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

const DAY = 86400000;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const dayAfter = date => new Date(Date.parse(date) + DAY).toISOString().slice(0, 10);
function realDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 10) === value;
}
function finish(quarters, asOfDate) {
  if (!realDate(asOfDate) || quarters.length < 4) throw new Error('revenue_four_quarters_missing');
  const selected = quarters.slice(-4);
  for (let i = 0; i < selected.length; i++) {
    const q = selected[i];
    if (!realDate(q.end) || q.end > asOfDate || !Number.isFinite(q.value) || q.value <= 0
      || (i && (days(selected[i - 1].end, q.end) < 75 || days(selected[i - 1].end, q.end) > 105))
      || (i && q.start && q.start !== dayAfter(selected[i - 1].end))) throw new Error('revenue_quarters_not_contiguous');
  }
  const span = selected[0].start ? days(selected[0].start, selected.at(-1).end) + 1 : days(selected[0].end, selected.at(-1).end);
  if (selected[0].start ? span < 350 || span > 380 : span < 250 || span > 300) throw new Error('revenue_ltm_window_invalid');
  const freshness = assessUnderlyingObservationFreshness({ observationDate: selected.at(-1).end, asOfDate, maxAgeDays: 120 });
  if (freshness.status !== 'fresh') throw new Error('revenue_observation_stale');
  const value = selected.reduce((sum, q) => sum + q.value, 0);
  if (!(Number.isFinite(value) && value > 1e10)) throw new Error('revenue_ltm_invalid');
  return { value, observationDate: selected.at(-1).end, quarters: selected, freshness };
}

export function qualifiedEdgarLtmRevenue(units, asOfDate) {
  if (!realDate(asOfDate) || !Array.isArray(units)) throw new Error('revenue_input_invalid');
  const periods = new Map();
  for (const row of units) {
    // A recent filing can repeat an old period; freshness uses period end, never filed.
    if (!realDate(row.start) || !realDate(row.end) || !realDate(row.filed)
      || row.end > asOfDate || row.filed > asOfDate || row.filed < row.end
      || !['10-K', '10-Q', '10-K/A', '10-Q/A'].includes(row.form)) continue;
    const duration = days(row.start, row.end) + 1;
    if (duration < 75 || duration > 380) continue;
    const key = `${row.start}|${row.end}`, prior = periods.get(key);
    if (prior?.filed === row.filed && prior.val !== row.val) throw new Error('revenue_same_filing_conflict');
    if (!prior || row.filed > prior.filed) periods.set(key, row);
  }
  const rows = [...periods.values()], quarters = new Map();
  const put = q => {
    const prior = quarters.get(q.end);
    if (prior && (prior.start !== q.start || prior.value !== q.value)) throw new Error('revenue_quarter_conflict');
    quarters.set(q.end, q);
  };
  for (const row of rows) {
    if (days(row.start, row.end) + 1 <= 105) put({ start: row.start, end: row.end, value: row.val, filed: row.filed, derived: false });
  }
  // Derive Q2/Q3/Q4 from adjacent cumulative disclosures with exactly the same
  // fiscal start. Do not sum YTD values or bridge a missing quarterly period.
  for (const row of rows) {
    if (quarters.has(row.end)) continue;
    const previous = rows.filter(p => p.start === row.start && days(p.end, row.end) >= 75 && days(p.end, row.end) <= 105);
    if (previous.length > 1) throw new Error('revenue_cumulative_ambiguous');
    if (previous.length === 1) {
      const p = previous[0];
      put({ start: dayAfter(p.end), end: row.end, value: Number.isFinite(row.val) && Number.isFinite(p.val) ? row.val - p.val : null,
        filed: row.filed > p.filed ? row.filed : p.filed, derived: true });
    }
  }
  const ordered = [...quarters.values()].sort((a, b) => a.end.localeCompare(b.end));
  if (!rows.length || ordered.at(-1)?.end !== rows.map(r => r.end).sort().at(-1)) throw new Error('revenue_latest_period_incomplete');
  return finish(ordered, asOfDate);
}

export function qualifiedMirrorLtmRevenue(html, asOfDate) {
  // This is the existing quarterly income endpoint. Require its stated currency
  // scale and aligned period columns, rather than collecting arbitrary numbers.
  if (!/Financials in millions USD/iu.test(htmlToText(html))) throw new Error('revenue_mirror_units_unconfirmed');
  for (const table of String(html).match(/<table\b[^>]*>[\s\S]*?<\/table>/giu) || []) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(m => m[1]);
    const header = rows.find(row => /Period Ending/u.test(row));
    const dates = [...(header || '').matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/giu)].slice(1).map(m => {
      const id = m[1].match(/\bid=["'](\d{4}-\d{2}-\d{2})["']/u)?.[1];
      if (id) return id;
      // Responsive headers contain both "Jul '26" and "Jul 26, 2026".
      // Admit exactly one full date; the abbreviated label is not a period.
      const matches = [...htmlToText(m[2]).matchAll(/\b([A-Za-z]{3,9}) (\d{1,2}), (20\d{2})\b/gu)];
      if (matches.length !== 1) return null;
      const match = matches[0], ms = Date.parse(match[0] + ' UTC');
      return Number.isFinite(ms) && new Date(ms).getUTCDate() === Number(match[2])
        ? new Date(ms).toISOString().slice(0, 10) : null;
    });
    if (dates.length < 5 || dates.some(d => !realDate(d)) || dates.some((d, i) => i && d >= dates[i - 1])) continue;
    for (const row of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(m => htmlToText(
        m[1].replace(/<div\b[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/div>/giu, '')));
      if (cells[0] !== 'Revenue' || cells.length - 1 !== dates.length) continue;
      const quarters = dates.slice(0, 4).map((end, i) => {
        const cell = cells[i + 1].replace(/,/gu, '').trim();
        const value = /^\d+(?:\.\d+)?$/u.test(cell) ? Number(cell) * 1e6 : null;
        return { start: dayAfter(dates[i + 1]), end, value, derived: false };
      }).reverse();
      return finish(quarters, asOfDate);
    }
  }
  throw new Error('revenue_mirror_dated_row_missing');
}
