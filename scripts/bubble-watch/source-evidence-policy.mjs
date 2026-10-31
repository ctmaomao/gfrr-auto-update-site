import { htmlToText } from './public-html-parsers.mjs';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

export function requireObservationDate(date, today, maxAgeDays, label) {
  const result = assessUnderlyingObservationFreshness({ observationDate: date, asOfDate: today, maxAgeDays });
  if (result.status !== 'fresh') throw new Error(`${label}_observation_stale: ${date} (${result.ageDays}d > ${maxAgeDays}d)`);
  return result;
}

export function vcObservationPeriod(post) {
  const text = `${post.title || ''} ${post.text || ''}`;
  const periods = [];
  for (const m of text.matchAll(/\b(Q[1-4]|H[12])\s*[-/]?\s*(20\d{2})\b/giu)) {
    const month = Number(m[1][1]) * (m[1][0].toUpperCase() === 'Q' ? 3 : 6);
    periods.push(new Date(Date.UTC(Number(m[2]), month, 0)).toISOString().slice(0, 10));
  }
  // A mixed-period article is not a machine-verifiable single observation.
  const unique = [...new Set(periods)];
  return unique.length === 1 ? unique[0] : null;
}

export function selectVcObservation(posts, parseShare, today, maxAgeDays = 120) {
  const qualified = [];
  for (const post of posts) {
    try {
      const articleDate = String(post.date || '').slice(0, 10);
      requireObservationDate(articleDate, today, maxAgeDays, 'vc_article');
      const observationDate = vcObservationPeriod(post);
      requireObservationDate(observationDate, today, maxAgeDays, 'vc_period');
      if (articleDate < observationDate) continue;
      const parsed = parseShare(post.text);
      if (!parsed || !/total global venture funding/iu.test(parsed.evidenceText)
          || !(parsed.aiFundingB > 0 && parsed.sharePct > 0 && parsed.sharePct <= 100)) continue;
      qualified.push({ post, parsed, articleDate, observationDate });
    } catch { /* Missing, future, old or ambiguous evidence falls back to dated research. */ }
  }
  qualified.sort((a, b) => b.observationDate.localeCompare(a.observationDate) || b.articleDate.localeCompare(a.articleDate));
  if (!qualified.length) throw new Error('vc_current_period_unconfirmed: no recent single-period global AI share evidence');
  return qualified[0];
}

export function articlePublishedDate(html) {
  const dates = [];
  for (const match of String(html).matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0];
    if (!/(?:property|name)=["'](?:article:published_time|datePublished)["']/iu.test(tag)) continue;
    const value = tag.match(/content=["']([^"']+)["']/iu)?.[1];
    if (value) dates.push(value.slice(0, 10));
  }
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const walk = value => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (!value || typeof value !== 'object') return;
        const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        if (types.some(type => ['Article', 'NewsArticle', 'BlogPosting'].includes(type)) && typeof value.datePublished === 'string') dates.push(value.datePublished.slice(0, 10));
        if (value['@graph']) walk(value['@graph']);
      };
      walk(JSON.parse(match[1]));
    } catch { /* Invalid metadata cannot confer current coverage. */ }
  }
  const unique = [...new Set(dates)];
  return unique.length === 1 ? unique[0] : null;
}

export function requireNeocloudCoverage(evidence, today, maxAgeDays = 21) {
  const companies = ['CoreWeave', 'Lambda', 'Crusoe', 'Nebius'];
  const qualified = evidence.filter(row => {
    try { requireObservationDate(row.publishedAt, today, maxAgeDays, 'neocloud'); return companies.includes(row.company); } catch { return false; }
  });
  const missing = companies.filter(company => !qualified.some(row => row.company === company));
  if (missing.length) throw new Error(`neocloud_current_coverage_unconfirmed: missing recent dated coverage for ${missing.join('/')}`);
  return qualified;
}

export function alignedBreadth(results, universeSize, today, maxAgeDays = 14) {
  const valid = results.filter(row => {
    try { requireObservationDate(row?.date, today, maxAgeDays, 'breadth'); return row?.above === 0 || row?.above === 1; } catch { return false; }
  });
  const latest = valid.map(row => row.date).sort().at(-1);
  const rows = valid.filter(row => row.date === latest);
  if (!rows.length || rows.length < Math.ceil(universeSize * 0.7)) throw new Error(`breadth_aligned_coverage_insufficient: ${rows.length}/${universeSize}`);
  const above = rows.reduce((sum, row) => sum + row.above, 0);
  return { date: latest, above, counted: rows.length, pct: above / rows.length * 100 };
}

export function breadthSourceLabel(indicator) {
  if (indicator.provenance?.mode !== 'auto') return '市场广度研究快照';
  const source = indicator.provenance?.detail?.source;
  if (source === 'Barchart:$S5FI') return 'Barchart $S5FI 市场广度';
  if (source === 'Yahoo Chart × Wikipedia constituents fallback') return 'Yahoo 行情与维基百科成份股名单实算';
  return '市场广度来源待核实';
}

export function parseRpoTable(html, label, parseNumber, today) {
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)].map(m => m[0]);
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(m => m[1]);
    const header = rows.find(row => /Period Ending/u.test(row));
    const headerCells = [...(header || '').matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/giu)].slice(1);
    const dates = headerCells.map(m => {
      const id = m[1].match(/\bid=["'](\d{4}-\d{2}-\d{2})["']/u)?.[1];
      if (id) return id;
      const text = htmlToText(m[2]);
      if (!/^[A-Za-z]{3,9} \d{1,2}, 20\d{2}$/u.test(text)) return null;
      const time = Date.parse(text + ' UTC');
      return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
    });
    for (const row of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map(m => htmlToText(m[1]));
      if (cells[0] !== label || cells.length - 1 !== dates.length || dates.length < 2 || dates.some(date => !date)) continue;
      return pairRpoPeriods(dates, cells.slice(1).map(value => parseNumber(value, 'money')), today);
    }
  }
  throw new Error('RPO dated value row is unavailable');
}

export function extractVcAiFundingShare(text) {
  const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
  const sentences = normalized
    .split(/(?<=[.!?。])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const preferred = sentences.find((sentence) => (
    /\bAI\b/iu.test(sentence)
    && /total global venture funding|global venture funding/iu.test(sentence)
    && /\bsector\b/iu.test(sentence)
  ));
  const preferredMatch = preferred?.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*billion[^.]{0,140}?([0-9]{1,3})%\s+of\s+total\s+global\s+venture\s+funding/iu);
  if (preferredMatch) {
    const sharePct = Number(preferredMatch[2]);
    const aiFundingB = Number(preferredMatch[1]);
    const totalFundingB = inferTotalVcFundingB(normalized, aiFundingB, sharePct);
    return { aiFundingB, sharePct, totalFundingB, evidenceText: preferred };
  }

  return null;
}

function inferTotalVcFundingB(text, aiFundingB, sharePct) {
  const totalMatch = String(text || '').match(/poured\s+\$?([0-9]+(?:\.[0-9]+)?)\s*billion/iu)
    || String(text || '').match(/global venture (?:investment|funding)[^.]{0,100}?\$?([0-9]+(?:\.[0-9]+)?)\s*billion/iu);
  if (totalMatch) return Number(totalMatch[1]);
  return aiFundingB / (sharePct / 100);
}


// The four registered cloud companies. Kept in one place so the coverage gate, the
// excluded-company disclosure and the builder iterate the same list.
export const RPO_COMPANIES = Object.freeze(['MSFT', 'ORCL', 'AMZN', 'GOOGL']);
export const MIN_RPO_COMPANIES = 2;

const RPO_REASON_LIMIT = 110;

function compactRpoReason(reason) {
  return String(reason || 'unavailable').replace(/\s+/gu, ' ').trim().slice(0, RPO_REASON_LIMIT);
}

// Auditable coverage line for a failed RPO chain: which company, which source tier and
// why. This only explains a fail-closed result; it never supplies or infers a value.
export function describeRpoCoverage({ companies = RPO_COMPANIES, used = [], failures = [] } = {}) {
  const rows = companies.map((ticker) => {
    if (used.includes(ticker)) return `${ticker}=ok`;
    const own = failures.filter((failure) => failure?.ticker === ticker);
    if (!own.length) return `${ticker}=unavailable`;
    return `${ticker}=${own.map((failure) => `${failure.source || 'source'}:${compactRpoReason(failure.reason)}`).join(' | ')}`;
  });
  return rows.join('; ').slice(0, 600);
}

export function assertRpoCoverage(rows, failures = []) {
  if (rows.length >= MIN_RPO_COMPANIES) return;
  const coverage = describeRpoCoverage({ used: rows.map((row) => row.ticker), failures });
  throw new Error(`RPO 可用公司不足 (${rows.length}/${RPO_COMPANIES.length}): ${coverage}`.slice(0, 800));
}

export function pairRpoPeriods(dates, values, today) {
  if (dates.length < 2 || dates.length !== values.length) throw new Error('RPO period/value count mismatch');
  for (const date of dates) requireObservationDate(date, today, Number.MAX_SAFE_INTEGER, 'RPO_period');
  if (new Set(dates).size !== dates.length || dates.some((date, index) => index && date >= dates[index - 1])) throw new Error('RPO periods must be unique and descending');
  const periodGap = (Date.parse(dates[0]) - Date.parse(dates[1])) / 86400000;
  if (periodGap < 60 || periodGap > 120) throw new Error('RPO adjacent quarterly period is missing or ambiguous');
  const paired = index => {
    const date = dates[index];
    const target = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
    const matches = dates.map((d, i) => ({ i, days: Math.abs(Date.parse(d) - Date.parse(target)) / 86400000 })).filter(x => x.days <= 7);
    if (matches.length !== 1) throw new Error('RPO prior-year period is unavailable or ambiguous');
    const value = values[index], prior = values[matches[0].i];
    // The two real gaps are reported separately: a not-yet-reported latest column is not
    // the same failure as a missing prior-year comparable, and neither may be skipped.
    if (!(Number.isFinite(value) && value > 0)) throw new Error(`RPO latest period value is unavailable (${date})`);
    if (!(Number.isFinite(prior) && prior > 0)) throw new Error(`RPO comparable value is missing (${date} vs ${target})`);
    return { value, prior };
  };
  requireObservationDate(dates[0], today, 120, 'RPO');
  const current = paired(0), previous = paired(1);
  return { currentValueUsd: current.value, priorYearValueUsd: current.prior,
    yoyPct: (current.value / current.prior - 1) * 100,
    prevPeriodValueUsd: previous.value, prevPeriodComparableUsd: previous.prior,
    prevYoyPct: (previous.value / previous.prior - 1) * 100,
    observationDate: dates[0], previousObservationDate: dates[1], parsedValues: values.filter(Number.isFinite).length };
}
// Search snippets are leads, not transcripts. Generic titles (including Executive
// Editor), analyst commentary and company names cannot establish CEO caution.
export function hasNamedCeoFinancialCaution(text) {
  const value = String(text || '');
  const names = '(?:Altman|Nadella|Huang|Musk|Zuckerberg|Pichai|Ellison|Hock Tan|Lisa Su|Dimon|Dalio|奥特曼|纳德拉|黄仁勋|马斯克|扎克伯格|皮查伊|埃里森|戴蒙|达利欧)';
  const financial = /\b(?:AI|artificial intelligence)\b.{0,80}\b(?:bubble|overbuild|overheated|irrational|mania|overinvestment)\b|\b(?:bubble|overbuild|overheated|irrational|mania|overinvestment)\b.{0,80}\b(?:AI|artificial intelligence)\b|(?:AI|人工智能).{0,40}(?:泡沫|过热|过度投资)/iu;
  const attributed = new RegExp(`${names}(?:\\s+(?:has|had|also|recently|publicly|reportedly)){0,3}\\s*(?:warn(?:s|ed)?|caution(?:s|ed)?|admit(?:s|ted)?|acknowledg(?:es?|ed)|警告|担忧|承认)`, 'iu');
  // Negated caution and recycled quotations cannot confer a current signal.
  const rejected = /\b(?:no|not|isn['’]?t|aren['’]?t)\s+(?:an?\s+)?(?:AI\s+)?bubble\b|\b(?:dismiss(?:es|ed)?|den(?:y|ies|ied))\b|\b(?:not worried|aren['’]?t worried|isn['’]?t worried|last year|old letter|previous letter)\b|(?:不担忧|否认|并非泡沫|不是泡沫|去年|旧信)/iu;
  return value.split(/[.!?。！？;；]+/u).some(sentence => {
    if (rejected.test(sentence)) return false;
    return sentence.split(/[,，:：]+|\b(?:while|whereas|but|although|however|and|as)\b|(?:但是|然而|而分析师|并且)/iu).some(clause => {
      const attribution = attributed.exec(clause);
      // Only the object of this named person's speech can qualify. A nearby
      // analyst's bubble warning must not attach to a CEO's safety/demand remark.
      if (attribution === null) return false;
      const object = clause.slice(attribution.index + attribution[0].length);
      const otherSpeaker = /\b(?:analysts?|commentators?|researchers?|experts?|critics?|investors?|reporters?)\b.{0,40}\b(?:warn(?:s|ed|ing)?|say(?:s|ing)?|said|believ(?:e|es|ed)|call(?:s|ed)?|describ(?:e|es|ed))\b|(?:分析师|评论员|研究员|投资者).{0,20}(?:警告|认为|表示|称)/iu;
      return !otherSpeaker.test(object) && financial.test(object);
    });
  });
}

export function classifyCeoCautionCounts(relevantCount, executiveHitCount) {
  if (relevantCount >= 12 && executiveHitCount >= 3) return { status: 'red', display: '普遍' };
  if (executiveHitCount >= 1) return { status: 'yellow', display: '部分' };
  return { status: 'green', display: '无' };
}
