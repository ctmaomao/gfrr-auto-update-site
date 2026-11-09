// Existing SEC / quarterly-mirror cash-flow sources, qualified before arithmetic.
// Never splice concepts, backdate to their intersection, or use retrieval time as
// the accounting period. The age limit is a data-quality gate, not a score rule.
import { htmlToText } from './public-html-parsers.mjs';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

export const CASH_FLOW_PERIOD_CONTRACT = 'cash-flow-complete-periods-v1';
export const CASH_FLOW_MAX_AGE_DAYS = 120;
export const CASH_CAPEX_TAGS = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'];
export const OPERATING_CASH_FLOW_TAGS = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'];
const DAY = 86400000;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const nextDay = d => new Date(Date.parse(d) + DAY).toISOString().slice(0, 10);
const realDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(d)
  && Number.isFinite(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;
const fail = reason => { throw new Error(`cash_flow_${reason}`); };

function finish(quarters, asOfDate, kind) {
  if (!realDate(asOfDate)) fail('clock_invalid');
  if (quarters.length < 8) fail('eight_quarters_missing');
  const selected = quarters.slice(-8);
  selected.forEach((q, i) => {
    if (!realDate(q.start) || !realDate(q.end) || q.end > asOfDate
      || days(q.start, q.end) + 1 < 75 || days(q.start, q.end) + 1 > 105
      || !Number.isFinite(q.value) || (kind === 'capex' && q.value < 0)
      || (i && q.start !== nextDay(selected[i - 1].end))) fail('quarters_not_contiguous_or_invalid');
  });
  for (const group of [selected.slice(0, 4), selected.slice(4)]) {
    const span = days(group[0].start, group.at(-1).end) + 1;
    if (span < 350 || span > 380) fail('ttm_window_invalid');
  }
  const observationDate = selected.at(-1).end;
  const freshness = assessUnderlyingObservationFreshness({ observationDate, asOfDate, maxAgeDays: CASH_FLOW_MAX_AGE_DAYS });
  if (freshness.status !== 'fresh') fail('period_stale');
  return { contractVersion: CASH_FLOW_PERIOD_CONTRACT, kind, currency: 'USD',
    periodStart: selected[4].start, periodEnd: observationDate, observationDate, quarters: selected, freshness };
}

function disclosedRows(units, asOfDate) {
  if (!realDate(asOfDate) || !Array.isArray(units)) fail('input_invalid');
  return units.filter(row => realDate(row?.start) && realDate(row?.end) && realDate(row?.filed)
    && row.filed <= asOfDate && row.end <= row.filed && row.end <= asOfDate
    && ['10-K', '10-Q', '10-K/A', '10-Q/A'].includes(row.form)
    && days(row.start, row.end) + 1 >= 75 && days(row.start, row.end) + 1 <= 380);
}

// Derive each concept on its own, without requiring enough quarters to qualify.
function deriveCashFlowQuarters(rows, minimumEnd = '') {
  const quarters = new Map();
  const put = q => {
    if (q.end < minimumEnd) return;
    const prior = quarters.get(q.end);
    if (prior && (prior.start !== q.start || prior.value !== q.value)) fail('quarter_conflict');
    quarters.set(q.end, q);
  };
  const facts = row => ({ start: row.start, end: row.end, value: row.val, filed: row.filed, accession: row.accn ?? null });
  for (const row of rows) {
    if (days(row.start, row.end) + 1 <= 105) put({ start: row.start, end: row.end, value: row.val, facts: [facts(row)] });
  }
  for (const row of rows) {
    if (row.end < minimumEnd || days(row.start, row.end) + 1 <= 105) continue;
    const previous = rows.filter(p => p.start === row.start && days(p.end, row.end) >= 75 && days(p.end, row.end) <= 105);
    if (previous.length > 1) fail('cumulative_ambiguous');
    if (previous.length === 1) {
      const p = previous[0];
      put({ start: nextDay(p.end), end: row.end,
        value: Number.isFinite(row.val) && Number.isFinite(p.val) ? row.val - p.val : null,
        facts: [facts(row), facts(p)] });
    }
  }
  return [...quarters.values()].sort((a, b) => a.end.localeCompare(b.end));
}

export function qualifyEdgarCashFlow(units, asOfDate, kind) {
  const disclosed = disclosedRows(units, asOfDate);
  const latestEnd = disclosed.map(row => row.end).sort().at(-1);
  if (!latestEnd) fail('disclosures_missing');
  if (assessUnderlyingObservationFreshness({ observationDate: latestEnd, asOfDate, maxAgeDays: CASH_FLOW_MAX_AGE_DAYS }).status !== 'fresh') fail('period_stale');
  const periods = new Map();
  for (const row of disclosed) {
    // Older restatements cannot affect the two trailing years. Keep enough
    // fiscal-year cumulative inputs to derive the earliest selected quarter.
    if (days(row.end, latestEnd) > 1100) continue;
    const key = `${row.start}|${row.end}`, prior = periods.get(key);
    if (prior?.filed === row.filed && prior.val !== row.val) fail('same_filing_conflict');
    if (!prior || row.filed > prior.filed) periods.set(key, row);
  }
  const ordered = deriveCashFlowQuarters([...periods.values()]);
  if (ordered.at(-1)?.end !== latestEnd) fail('latest_period_incomplete');
  return finish(ordered, asOfDate, kind);
}

export async function collectQualifiedCashFlowConcept({ cik, tags, kind, asOfDate, fetchConcept, observePeriod = () => {} }) {
  const allowed = kind === 'capex' ? CASH_CAPEX_TAGS : OPERATING_CASH_FLOW_TAGS;
  if (!/^\d{10}$/u.test(cik) || !tags?.length || tags.some(t => !allowed.includes(t))) fail('source_policy_invalid');
  const candidates = [], rejected = [], observedConcepts = [];
  let newestDisclosedEnd = '';
  for (const tag of tags) {
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
    try {
      const json = await fetchConcept(url);
      if (Number(json?.cik) !== Number(cik) || json?.tag !== tag || json?.taxonomy !== 'us-gaap') fail('concept_identity_invalid');
      const units = json?.units?.USD;
      const disclosed = disclosedRows(units, asOfDate);
      observedConcepts.push({ tag, disclosed });
      const latest = disclosed.map(row => row.end).sort().at(-1) || '';
      if (latest) observePeriod(latest);
      if (latest > newestDisclosedEnd) newestDisclosedEnd = latest;
      const qualified = qualifyEdgarCashFlow(units, asOfDate, kind);
      candidates.push({ ...qualified, source: { provider: 'SEC', url, tag, cik, unit: 'USD' } });
    } catch (error) { rejected.push({ tag, reason: error.message }); }
  }
  candidates.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const selected = candidates[0];
  if (!selected) fail(`no_qualified_concept: ${rejected.map(r => `${r.tag}:${r.reason}`).join('; ')}`);
  if (selected.periodEnd !== newestDisclosedEnd) fail('newer_concept_incomplete');
  // Completeness is not permission to discard contradictory evidence from a
  // shorter alternative concept. Compare each tag's latest original facts.
  const byPeriod = new Map(), byQuarter = new Map();
  for (const concept of observedConcepts) {
    const latestFacts = new Map();
    for (const row of concept.disclosed) {
      // Include only overlapping facts and the within-tag predecessors they
      // need. Conflicting predecessors must not be silently chosen either.
      if (row.end < selected.quarters[0].start && !concept.disclosed.some(current =>
        current.end >= selected.quarters[0].start && current.start === row.start
        && days(row.end, current.end) >= 75 && days(row.end, current.end) <= 105)) continue;
      const key = `${row.start}|${row.end}`, prior = latestFacts.get(key);
      if (!prior || row.filed > prior.filed) latestFacts.set(key, row);
      else if (row.filed === prior.filed && row.val !== prior.val) fail('same_filing_conflict');
    }
    for (const [key, row] of latestFacts) {
      if (row.end < selected.quarters[0].start) continue;
      if (byPeriod.has(key) && byPeriod.get(key) !== row.val) fail('same_period_concepts_disagree');
      byPeriod.set(key, row.val);
    }
    // Keep cumulative predecessors for the first overlapping quarter, but
    // never combine rows from different tags to derive or qualify a series.
    for (const q of deriveCashFlowQuarters([...latestFacts.values()], selected.quarters[0].start)) {
      const prior = byQuarter.get(q.end);
      if (prior && (prior.start !== q.start || prior.value !== q.value)) fail('same_period_concepts_disagree');
      byQuarter.set(q.end, q);
    }
  }

  const fingerprint = value => JSON.stringify(value.quarters.map(q => [q.start, q.end, q.value]));
  if (candidates.some(c => c.periodEnd === selected.periodEnd && fingerprint(c) !== fingerprint(selected))) fail('same_period_concepts_disagree');
  return { ...selected, rejectedConcepts: rejected };
}

export function requireCashFlowPeriodFloor(series, minimumEnd) {
  if (minimumEnd && (!realDate(minimumEnd) || series?.periodEnd < minimumEnd)) fail('mirror_older_than_sec_disclosure');
  return series;
}

export function alignCashFlowPeriods(ocf, capex) {
  if (ocf?.kind !== 'ocf' || capex?.kind !== 'capex' || ocf.currency !== 'USD' || capex.currency !== 'USD'
    || ocf.quarters?.length !== 8 || capex.quarters?.length !== 8
    || ocf.quarters.some((q, i) => q.start !== capex.quarters[i].start || q.end !== capex.quarters[i].end)) fail('ocf_capex_period_mismatch');
  return ocf.quarters.map((q, i) => ({ start: q.start, end: q.end, ocf: q.value, capex: capex.quarters[i].value }));
}

export function qualifyMirrorCashFlows(html, asOfDate, { requireOcf = true } = {}) {
  if (!/Financials in millions USD/iu.test(htmlToText(html))) fail('mirror_units_unconfirmed');
  const found = {};
  for (const table of String(html).match(/<table\b[^>]*>[\s\S]*?<\/table>/giu) || []) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(m => m[1]);
    const header = rows.find(row => /Period Ending/u.test(row));
    const dates = [...(header || '').matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/giu)].slice(1).map(m => {
      const id = m[1].match(/\bid=["'](\d{4}-\d{2}-\d{2})["']/u)?.[1];
      if (id) return id;
      const full = [...htmlToText(m[2]).matchAll(/\b([A-Za-z]{3,9}) (\d{1,2}), (20\d{2})\b/gu)];
      if (full.length !== 1) return null;
      const ms = Date.parse(full[0][0] + ' UTC');
      return Number.isFinite(ms) && new Date(ms).getUTCDate() === Number(full[0][2]) ? new Date(ms).toISOString().slice(0, 10) : null;
    });
    if (dates.length < 9 || dates.some(d => !realDate(d)) || dates.some((d, i) => i && d >= dates[i - 1])) continue;
    const parseRow = (label, kind) => {
      const matching = rows.map(row => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(m => htmlToText(
        m[1].replace(/<div\b[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/div>/giu, '')))).filter(c => c[0] === label);
      if (!matching.length) return null;
      if (matching.length !== 1 || matching[0].length - 1 !== dates.length) fail('mirror_dated_row_missing');
      const cells = matching[0];
      const quarters = dates.slice(0, 8).map((end, i) => {
        const text = cells[i + 1].replace(/,/gu, '').trim();
        const parsed = /^-?\d+(?:\.\d+)?$/u.test(text) ? Number(text) * 1e6 : null;
        return { start: nextDay(dates[i + 1]), end, value: parsed === null ? null : kind === 'capex' ? Math.abs(parsed) : parsed };
      }).reverse();
      return { ...finish(quarters, asOfDate, kind), source: { provider: 'StockAnalysis', row: label, unit: 'millions USD' } };
    };
    const capex = parseRow('Capital Expenditures', 'capex');
    const ocf = requireOcf ? parseRow('Operating Cash Flow', 'ocf') : null;
    for (const [kind, series] of Object.entries({ ocf, capex })) {
      if (!series) continue;
      if (found[kind]) fail('mirror_duplicate_series');
      found[kind] = series;
    }
  }
  if (!found.capex || (requireOcf && !found.ocf)) fail('mirror_dated_table_missing');
  if (requireOcf) alignCashFlowPeriods(found.ocf, found.capex);
  return { capex: found.capex, ocf: found.ocf ?? null };
}
