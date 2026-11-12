import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';
import { decodeHtmlEntities, htmlToText } from './public-html-parsers.mjs';

export function requireDailyObservation(date, today, label) {
  const freshness = assessUnderlyingObservationFreshness({ observationDate: date, asOfDate: today, maxAgeDays: 7 });
  if (freshness.status !== 'fresh') throw new Error(`${label}_observation_stale`);
  return freshness;
}

export function parseCapeAtom(xml, today) {
  const entries = [...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gu)]
    .map(match => match[1]).filter(entry => /<title>Shiller PE Ratio<\/title>/u.test(entry));
  if (entries.length !== 1) throw new Error('cape_entry_ambiguous');
  const entry = entries[0];
  const clocks = [...entry.matchAll(/<updated>([^<]+)<\/updated>/gu)].map(match => match[1]);
  if (clocks.length !== 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/u.test(clocks[0]) || !Number.isFinite(Date.parse(clocks[0]))) throw new Error('cape_clock_invalid');
  const clockParts = clocks[0].match(/T(\d{2}):(\d{2}):(\d{2})(?:Z|([+-])(\d{2}):(\d{2}))$/u);
  if (!clockParts || Number(clockParts[1]) > 23 || Number(clockParts[2]) > 59 || Number(clockParts[3]) > 59 || Number(clockParts[5] || 0) > 14 || Number(clockParts[6] || 0) > 59 || (Number(clockParts[5]) === 14 && Number(clockParts[6]) !== 0)) throw new Error('cape_clock_invalid');
  const observationDate = clocks[0].slice(0,10);
  requireDailyObservation(observationDate, today, 'cape');
  if (!entry.includes(`/shiller-pe/${observationDate}/`)) throw new Error('cape_entry_date_mismatch');
  const content = entry.match(/<content\b[^>]*>([\s\S]*?)<\/content>/u)?.[1];
  const text = htmlToText(decodeHtmlEntities(content || ''));
  const match = text.match(/Current\s+Shiller PE Ratio\s*:\s*([0-9]{1,3}\.[0-9]{1,2})(?![0-9])/u);
  const value = Number(match?.[1]);
  if (!(value > 5 && value < 100)) throw new Error('cape_value_invalid');
  return { value, observationDate, sourceTimestamp: clocks[0] };
}

const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
export function parseStockAnalysisMetricDate(html, metric, today) {
  const text = htmlToText(html);
  const pattern = metric === 'holdings'
    ? /Top\s+\d+\s+Holdings\s+Updated\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(20\d{2})/gu
    : metric === 'statistics'
      ? /Last updated:\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(20\d{2})\s+Financial statistics are provided/gu
      : null;
  if (!pattern) throw new Error('stockanalysis_metric_unknown');
  const dates = [...text.matchAll(pattern)].map(m => `${m[3]}-${String(MONTHS[m[1]] || 0).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
  if (!dates.length || new Set(dates).size !== 1) throw new Error(`${metric}_source_date_missing_or_conflicting`);
  requireDailyObservation(dates[0],today,metric);
  return dates[0];
}

export function parseBubbleFredRows(rows, today) {
  if (!Array.isArray(rows)) throw new Error('fred_observations_invalid');
  const byDate = new Map();
  for (const row of rows) {
    const raw = row?.value;
    // Missing values are not zero; a genuine numeric/string zero remains valid.
    if (raw === null || raw === undefined || (typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '' || String(raw).trim() === '.') continue;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(String(raw).trim())) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    assessUnderlyingObservationFreshness({ observationDate: row.date, asOfDate: today, maxAgeDays: 100000 });
    if (byDate.has(row.date) && byDate.get(row.date) !== value) throw new Error('fred_duplicate_conflict');
    byDate.set(row.date,value);
  }
  return [...byDate].map(([date,value])=>({date,value})).sort((a,b)=>b.date.localeCompare(a.date));
}
