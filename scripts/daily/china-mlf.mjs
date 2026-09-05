const DAY_MS = 86400000;
const MAX_AGE_DAYS = 45;
const MAX_TEXT_LENGTH = 200000;
const TERM_NUMBER = '\\d+(?:\\.\\d+)?|[一二三四五六七八九十六零两]+';
const GROSS = new RegExp(`开展\\s*(?<amount>\\d+(?:\\.\\d+)?)\\s*(?<unit>万亿元|亿元|万亿|亿)\\s*(?:[（(][^）)]{0,30}[）)])?\\s*(?:(?<term>${TERM_NUMBER})\\s*(?<termUnit>年|个月)\\s*期?\\s*)?(?:中期借贷便利(?:\\s*[（(]\\s*MLF\\s*[）)])?|MLF(?:\\s*[（(]\\s*中期借贷便利\\s*[）)])?)\\s*操作`, 'giu');
const DATE = /(?:(?<year>\d{4})年)?(?<month>\d{1,2})月(?<day>\d{1,2})日/gu;
const OTHER_TOOL = /(?:买断式)?逆回购|国债买卖|常备借贷便利|\bSLF\b|再贷款|再贴现/giu;
const NEW_OPERATION = /(?:开展|实施|进行)/gu;
const CONTINUATION = /^(?:(?:本次|此次|该次|本轮)(?:MLF|中期借贷便利)?(?:操作)?|该操作|其)?(?:操作)?(?:期限|中标利率|操作利率|均为)/iu;

function fail(message) { throw new Error(`eastmoney:mlf ${message}`); }
function matches(pattern, text) { return [...text.matchAll(new RegExp(pattern.source, pattern.flags))]; }

function realDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

function validDateOnly(value) {
  const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/u) : null;
  return m && realDate(Number(m[1]), Number(m[2]), Number(m[3])) === value;
}

function validTimestamp(value, nowMs) {
  const m = typeof value === 'string'
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u) : null;
  return Boolean(m && realDate(Number(m[1]), Number(m[2]), Number(m[3]))
    && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= nowMs);
}

function todayInChina(nowMs) { return new Date(nowMs + 8 * 3600000).toISOString().slice(0, 10); }
function validClock(nowMs) { return Number.isFinite(nowMs) && Number.isFinite(new Date(nowMs + 8 * 3600000).getTime()); }

/** Operation freshness is never replaced by a newer publication timestamp. */
export function isFreshMlfDates(opDate, publishedAt, nowMs = Date.now()) {
  if (!validClock(nowMs) || !validDateOnly(opDate)) return false;
  if (publishedAt !== null && publishedAt !== undefined && !validTimestamp(publishedAt, nowMs)) return false;
  const age = (Date.parse(todayInChina(nowMs)) - Date.parse(opDate)) / DAY_MS;
  return age >= 0 && age <= MAX_AGE_DAYS;
}

function normalize(value) {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) fail('missing or oversized text');
  return value.replace(/\r\n?/gu, '\n').replace(/(\d)\s*\.\s*(\d)/gu, '$1.$2')
    .replace(/[^\S\n]+/gu, ' ').replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '').replace(/％/gu, '%').trim();
}

function integerTerm(value, unit) {
  const digit = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let number;
  if (/^\d+$/u.test(value)) number = Number(value);
  else if (Object.hasOwn(digit, value)) number = digit[value];
  else {
    const m = value.match(/^([一二三四五六])?十([一二三四五六七八九])?$/u);
    if (m) number = (m[1] ? digit[m[1]] : 1) * 10 + (m[2] ? digit[m[2]] : 0);
  }
  const months = unit === '年' ? number * 12 : number;
  if (!Number.isInteger(months) || months < 1 || months > 60) fail('missing or implausible term');
  return months;
}

function singleValue(values, label, optional = false) {
  if (new Set(values).size > 1) fail(`conflicting ${label} in operation`);
  if (!values.length && !optional) fail(`missing ${label} in operation`);
  return values[0] ?? null;
}

function operationDate(prefix, publishedAt) {
  const found = matches(DATE, prefix).at(-1);
  if (found) {
    const { year, month, day } = found.groups;
    if (year) {
      const result = realDate(Number(year), Number(month), Number(day));
      if (!result) fail('invalid operation calendar date');
      return result;
    }
    if (!publishedAt) fail('operation year unavailable');
    const publicationYear = Number(publishedAt.slice(0, 4));
    const publicationDay = Date.parse(publishedAt.slice(0, 10));
    const dates = [publicationYear - 1, publicationYear, publicationYear + 1]
      .map(y => realDate(y, Number(month), Number(day))).filter(Boolean)
      .map(date => ({ date, distance: Math.abs(Date.parse(date) - publicationDay) / DAY_MS }))
      .filter(row => row.distance <= MAX_AGE_DAYS).sort((a, b) => a.distance - b.distance);
    if (!dates.length || (dates[1] && dates[0].distance === dates[1].distance)) fail('operation year ambiguous or outside publication window');
    return dates[0].date;
  }
  if (/(?:今日|今天|当日)/u.test(prefix) && publishedAt) return publishedAt.slice(0, 10);
  fail('missing operation-associated date');
}

function boundedTail(text) {
  // A different tool's inline tenor can precede its name: cut its entire
  // comma-delimited clause, not merely the tool name after "6个月期".
  const toolStarts = matches(OTHER_TOOL, text).map(row => {
    const prefix = text.slice(0, row.index);
    return Math.max(prefix.lastIndexOf(','), prefix.lastIndexOf('，'), 0);
  });
  const end = Math.min(...[text.length,
    ...toolStarts,
    ...matches(NEW_OPERATION, text).map(row => row.index),
    ...matches(DATE, text).map(row => row.index),
    ...matches(GROSS, text).map(row => row.index)]);
  return text.slice(0, end);
}

function parseAnchor(sentences, sentenceIndex, anchors, anchorIndex, publishedAt, nowMs) {
  const sentence = sentences[sentenceIndex];
  const anchor = anchors[anchorIndex];
  const priorAnchor = anchors[anchorIndex - 1];
  const earlierTools = matches(OTHER_TOOL, sentence.slice(0, anchor.index));
  const lastTool = earlierTools.at(-1);
  const prefixStart = Math.max(priorAnchor ? priorAnchor.index + priorAnchor[0].length : 0,
    lastTool ? lastTool.index + lastTool[0].length : 0);
  const prefix = sentence.slice(prefixStart, anchor.index);
  const opDate = operationDate(prefix, publishedAt);
  if (!isFreshMlfDates(opDate, publishedAt, nowMs)) fail('stale, future or invalid operation date');
  const amount = Number(anchor.groups.amount) * (anchor.groups.unit.startsWith('万') ? 10000 : 1);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) fail('missing or implausible gross amount');
  const after = sentence.slice(anchor.index + anchor[0].length);
  let context = boundedTail(after);
  // Extend only if this operation actually reaches the end of its sentence.
  if (context.length === after.length && anchorIndex === anchors.length - 1) {
    for (let i = 1; i <= 2; i += 1) {
      const next = sentences[sentenceIndex + i];
      if (!next || next.length > 200 || !CONTINUATION.test(next) || matches(DATE, next).length || matches(GROSS, next).length) break;
      const part = boundedTail(next);
      context += ` ${part}`;
      if (part.length !== next.length) break;
    }
  }
  const terms = anchor.groups.term ? [integerTerm(anchor.groups.term, anchor.groups.termUnit)] : [];
  const termPatterns = [new RegExp(`(?:期限(?:为)?|均为)\\s*(?<term>${TERM_NUMBER})\\s*(?<unit>年|个月)`, 'gu'),
    new RegExp(`(?<term>${TERM_NUMBER})\\s*(?<unit>年|个月)期`, 'gu')];
  for (const pattern of termPatterns) for (const m of matches(pattern, context)) terms.push(integerTerm(m.groups.term, m.groups.unit));
  const termMonths = singleValue(terms, 'term');
  const rates = matches(/(?:中标利率|操作利率)\s*(?:为|:|：)?\s*(\d+(?:\.\d+)?)\s*%/gu, context).map(m => Number(m[1]) / 100);
  if (rates.some(rate => !Number.isFinite(rate) || rate < 0.005 || rate > 0.05)) fail('rate out of plausible range');
  const mlfRate = singleValue(rates, 'rate', true);
  return { opDate, publishedAt, updatedAt: publishedAt || `${opDate}T00:00:00Z`,
    operationAmountYi: Number(amount.toFixed(2)), termMonths, mlfRate: mlfRate === null ? null : Number(mlfRate.toFixed(6)) };
}

/** Parse each dated gross MLF operation in isolation, never splice instruments. */
export function parseMlfOperation(plain, link, { nowMs = Date.now() } = {}) {
  if (!validClock(nowMs)) fail('invalid observation clock');
  const publishedAt = link?.publishedAt ?? null;
  if (publishedAt !== null && !validTimestamp(publishedAt, nowMs)) fail('invalid or future publication timestamp');
  const sentences = normalize(plain).split(/[。！？;；\n]+/u).map(value => value.trim()).filter(Boolean);
  const records = [];
  let lastError = null;
  for (let i = 0; i < sentences.length; i += 1) {
    const anchors = matches(GROSS, sentences[i]);
    for (let j = 0; j < anchors.length; j += 1) {
      try { records.push(parseAnchor(sentences, i, anchors, j, publishedAt, nowMs)); }
      catch (error) { lastError = error; }
    }
  }
  if (!records.length) throw lastError || new Error('eastmoney:mlf no valid dated gross MLF operation');
  const byDate = new Map();
  for (const record of records) {
    const previous = byDate.get(record.opDate);
    if (previous && ['operationAmountYi', 'termMonths', 'mlfRate'].some(key => previous[key] !== record[key])) fail('conflicting same-day MLF operations');
    byDate.set(record.opDate, record);
  }
  return [...byDate.values()].sort((a, b) => b.opDate.localeCompare(a.opDate))[0];
}

function safeCandidate(row) {
  if (!row || typeof row !== 'object' || typeof row.url !== 'string'
    || !/^https:\/\/finance\.eastmoney\.com\/a\/\d{13,40}\.html$/u.test(row.url)) return null;
  if (typeof row.summaryText !== 'string' || row.summaryText.length > 12000
    || (row.title !== undefined && (typeof row.title !== 'string' || row.title.length > 1000))) return null;
  return { code: typeof row.code === 'string' ? row.code.slice(0, 40) : null, url: row.url,
    title: row.title ?? '', summaryText: row.summaryText, publishedAt: row.publishedAt ?? null };
}

function priority(a, b) {
  const titleMlf = candidate => /MLF|中期借贷便利/iu.test(candidate.title) ? 1 : 0;
  return titleMlf(b) - titleMlf(a) || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0);
}

/** At most two searches and six unique article attempts across both searches. */
export async function findMlfCandidate({ keywords, search, fetchArticle, parseCandidate, maxArticleFetch = 6 }) {
  if (!Array.isArray(keywords) || !keywords.length || keywords.length > 2
    || keywords.some(key => typeof key !== 'string' || !key.trim() || key.length > 100)) fail('expected one or two bounded search keywords');
  if (![search, fetchArticle, parseCandidate].every(fn => typeof fn === 'function')) fail('missing resolver callback');
  if (!Number.isInteger(maxArticleFetch) || maxArticleFetch < 0 || maxArticleFetch > 6) fail('article budget must be 0..6');
  const candidates = new Map();
  let lastError = null;
  const tryParse = (plain, candidate) => {
    try {
      if (typeof plain !== 'string' || plain.length > MAX_TEXT_LENGTH) fail('missing or oversized candidate text');
      const result = parseCandidate(plain, candidate);
      if (!result || typeof result !== 'object' || typeof result.opDate !== 'string'
        || !Number.isFinite(result.operationAmountYi) || !Number.isInteger(result.termMonths)) fail('invalid parsed candidate');
      return result;
    } catch (error) { lastError = error; return null; }
  };
  for (const keyword of new Set(keywords)) {
    let rows;
    try { rows = await search(keyword); } catch (error) { lastError = error; continue; }
    if (!Array.isArray(rows)) { lastError = new Error('eastmoney:mlf invalid search response'); continue; }
    const safeRows = rows.slice(0, 20).map(safeCandidate).filter(Boolean);
    const parsed = [];
    for (const candidate of safeRows) {
      const existing = candidates.get(candidate.url);
      if (!existing || priority(candidate, existing) < 0) candidates.set(candidate.url, candidate);
      const result = tryParse(candidate.summaryText, candidate);
      if (result) parsed.push(result);
    }
    if (parsed.length) return parsed.sort((a, b) => b.opDate.localeCompare(a.opDate))[0];
  }
  for (const candidate of [...candidates.values()].sort(priority).slice(0, maxArticleFetch)) {
    try {
      const result = tryParse(await fetchArticle(candidate), candidate);
      if (result) return result;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('eastmoney:mlf no valid operation among bounded candidates');
}
