const AMOUNT = '\\$?(?<amount>\\d+(?:\\.\\d+)?)\\s*(?:billion|bn|b)\\b';
const METRIC = '(?:in\\s+)?(?:ARR|annualized revenue|annualized run-rate|run-rate revenue)\\b(?![-\\w])';
const CLAIM = new RegExp("\\bAnthropic(?:['’]s)?\\s*(?:(?:just|has|already|reportedly|says|it|now)\\s+)*(?:(?:hit|hits|reached|reaches|rocketed to|crossed|surpassed|passed|is at)\\s+)?" + AMOUNT + '\\s+' + METRIC, 'giu');
const UNSAFE_CONTEXT = /\b(?:OpenAI|Nvidia|SpaceX|Salesforce|Claude Code|valuation|funding|raised|projected|forecast|target|could|would|will|quarter|Q[1-4]|if|when|unless|not|never|false|untrue|denied|scenario|hypothetical|expected|expects|next|upcoming|equivalent|bookings)\b|n't\b/iu;

function sentences(text) {
  // A decimal point is not a sentence boundary.
  const parts = text.split(/((?<!\d)\.|\.(?!\d)|[!?;\n]+)/u);
  const result = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i].trim()) result.push({ text: parts[i].trim(), question: (parts[i + 1] || '').includes('?') });
  }
  return result;
}

function checkedValue(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 80) throw new Error('SaaStr Anthropic ARR amount out of range');
  return value;
}

function unsafeSentence(row, referenceYear) {
  return row.question || row.text.length > 600 || UNSAFE_CONTEXT.test(row.text)
    || [...row.text.matchAll(/\b(?:in|by|during|of)\s+(20\d{2})\b/giu)].some(match => Number(match[1]) > referenceYear);
}

function claims(text, referenceYear) {
  return sentences(text).flatMap(row => {
    if (unsafeSentence(row, referenceYear)) return [];
    const sentence = row.text;
    return [...sentence.matchAll(new RegExp(CLAIM.source, CLAIM.flags))].map(match => checkedValue(match.groups.amount));
  });
}

function uniqueValue(values) {
  if (new Set(values).size > 1) throw new Error('SaaStr Anthropic ARR claims conflict');
  return values[0] ?? null;
}

/** Existing, reviewed SaaStr company run-rate claims only; no source discovery. */
export function extractAnthropicArrB(post, { nowMs = Date.now() } = {}) {
  if (!post || typeof post.text !== 'string' || post.text.length > 200000
      || (post.title !== undefined && (typeof post.title !== 'string' || post.title.length > 1000))) {
    throw new Error('SaaStr Anthropic ARR text invalid');
  }
  const observationClock = post.date === undefined ? new Date(nowMs) : new Date(post.date + 'T00:00:00Z');
  if (!Number.isFinite(observationClock.getTime())
      || (post.date !== undefined && (typeof post.date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/u.test(post.date)
        || observationClock.toISOString().slice(0, 10) !== post.date))) {
    throw new Error('SaaStr Anthropic ARR publication date invalid');
  }
  const referenceYear = observationClock.getUTCFullYear();
  // A reviewed headline claim has precedence over retrospective body milestones.
  const headline = uniqueValue(claims(post.title || '', referenceYear));
  if (headline !== null) return headline;
  const values = claims(post.text, referenceYear);
  // This reviewed post uses a short continuation, not a new company/metric.
  // Pin the syntax, not the dollar value; no general cross-sentence borrowing.
  if (post.id === 325206) {
    const rows = sentences(post.text);
    for (let i = 0; i < rows.length - 2; i += 1) {
      if (!/^Anthropic margins went from \d+(?:\.\d+)?% to \d+(?:\.\d+)?%$/iu.test(rows[i].text)
          || !/^Profitable$/iu.test(rows[i + 1].text)
          || rows.slice(i, i + 3).some(row => unsafeSentence(row, referenceYear))
          || (i > 0 && /\b(?:scenario|hypothetical|forecast|projected|imagine)\b/iu.test(rows[i - 1].text))) continue;
      const match = rows[i + 2].text.match(new RegExp('^' + AMOUNT + '\\s+' + METRIC + '$', 'iu'));
      if (match) values.push(checkedValue(match.groups.amount));
    }
  }
  const result = uniqueValue(values);
  if (result === null) throw new Error('SaaStr post missing explicitly bound Anthropic ARR/run-rate claim');
  return result;
}
