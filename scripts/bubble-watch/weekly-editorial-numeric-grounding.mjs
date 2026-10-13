// Exact financial equivalence; other numeric differences are audit hints, never display blockers.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_INDEX = Object.fromEntries(MONTHS.flatMap((month, index) => [[month, index + 1], [month.slice(0, 3), index + 1]]).concat([['sept', 9]]));
const MONTH_PATTERN = Object.keys(MONTH_INDEX).sort((a, b) => b.length - a.length).join('|');
const SCALE = { trillion: 12, tn: 12, billion: 9, bn: 9, b: 9, million: 6, m: 6, thousand: 3, k: 3, 万亿: 12, 亿: 8, 百万: 6, 万: 4, 千: 3 };
function decimalKey(raw, power = 0) {
  const clean = raw.replaceAll(',', '');
  const [whole, fraction = ''] = clean.replace(/^\+/u, '').split('.');
  let value = BigInt(`${whole}${fraction}`);
  let exponent = power - fraction.length;
  if (value === 0n) return '0';
  while (value % 10n === 0n) { value /= 10n; exponent++; }
  return `${value}e${exponent}`;
}

export function numericEvidenceAtoms(text = '') {
  let normalized = String(text).normalize('NFKC').replace(/−/gu, '-');
  const atoms = [];
  // Spelled-out figures are not exactly parsed: disclose this limit without rejecting ordinary wording changes.
  for (const match of normalized.matchAll(/(?:百分之[零〇一二三四五六七八九十百千万亿两点]+|[零〇一二三四五六七八九两十百千][零〇一二三四五六七八九十百千万亿两点]*(?:美元|人民币|欧元|英镑|元))/gu)) {
    atoms.push({ key: `unparsed:${match[0]}`, number: match[0], kind: 'unparsed-financial' });
  }
  function dateAtom(raw, year, month, day) {
    const canonical = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const valid = Number.isFinite(Date.parse(`${canonical}T00:00:00Z`)) && new Date(`${canonical}T00:00:00Z`).toISOString().slice(0, 10) === canonical;
    atoms.push({ key: valid ? `date:${canonical}` : `invalid-date:${canonical}`, number: canonical, kind: valid ? 'date' : 'invalid' });
    if (valid) {
      atoms.push({ key: `year:${decimalKey(String(year))}`, number: String(year), kind: 'year' });
      atoms.push({ key: `month:${decimalKey(String(Number(month)))}`, number: String(Number(month)), kind: 'month' });
      atoms.push({ key: `month-day:${Number(month)}-${Number(day)}`, number: `${Number(month)}-${Number(day)}`, kind: 'month-day' });
    }
    return ' '.repeat(raw.length);
  }
  normalized = normalized.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/gu, dateAtom)
    .replace(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/gu, dateAtom);
  normalized = normalized.replace(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'giu'),
    (raw, month, day, year) => dateAtom(raw, year, MONTH_INDEX[month.toLowerCase()], day))
    .replace(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\.?\\s+(\\d{4})\\b`, 'giu'),
      (raw, day, month, year) => dateAtom(raw, year, MONTH_INDEX[month.toLowerCase()], day))
    .replace(/(\d{1,2})月\s*(\d{1,2})日/gu, (raw, month, day) => {
      const valid = Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= new Date(Date.UTC(2000, Number(month), 0)).getUTCDate();
      atoms.push({ key: `month-day:${Number(month)}-${Number(day)}`, number: raw, kind: valid ? 'month-day' : 'invalid' });
      if (valid) atoms.push({ key: `month:${decimalKey(String(Number(month)))}`, number: String(Number(month)), kind: 'month' });
      return ' '.repeat(raw.length);
    });
  // Share explicitly written units across range endpoints, never infer an interior value.
  normalized = normalized.replace(/(?<![\d.,])(US\$|USD|€|£|\$)?\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(trillion|billion|million|万亿|百万|亿|万)?\s*(?:–|—|-|至|到)\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(trillion|billion|million|万亿|百万|亿|万)?\s*(美元|人民币|欧元|英镑|元|USD|EUR|GBP|CNY|%|基点|bps)?(?![\d.,])/giu,
    (_raw, prefix = '', low, firstScale = '', high, scale = '', unit = '') => `${prefix} ${low} ${firstScale || scale}${unit} ; ${prefix} ${high} ${scale}${unit}`);
  const numberPattern = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/gu;
  for (const match of normalized.matchAll(numberPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    // Fail closed on malformed grouping, partial decimals and unsupported scientific notation.
    if (/\d$|\d[.,]$/u.test(normalized.slice(Math.max(0, start - 2), start)) || /^\d|^[.,]\d|^e[+-]?\d/iu.test(normalized.slice(end))) {
      atoms.push({ key: `invalid:${start}`, number: match[0], kind: /(?:[$€£]|美元|人民币|欧元|英镑|%|bps|基点)/iu.test(normalized.slice(Math.max(0, start - 8), end + 20)) ? 'invalid-financial' : 'invalid' }); continue;
    }
    const before = normalized.slice(Math.max(0, start - 30), start);
    const after = normalized.slice(end);
    let kind = 'number';
    let power = 0;
    let basisPoints = false;
    const scale = /^\s*(trillion|billion|million|thousand|tn|bn|b|m|k|万亿|百万|亿|万|千)(?![A-Za-z])/iu.exec(after);
    if (/^\s*%/u.test(after)) kind = 'percent';
    else if (/^\s*(?:basis points?|bps|bp|基点)(?![A-Za-z])/iu.test(after)) { kind = 'percent'; power = -2; basisPoints = true; }
    else if (/^\s*(?:percentage points?|pp|个百分点)(?![A-Za-z])/iu.test(after)) kind = 'percentage-point';
    else if (/^\s*月/u.test(after)) kind = 'month';
    else if (/^\s*(?:日|天|-?\s*days?\b)/iu.test(after)) kind = 'day';
    else if (/^\s*年/u.test(after)) kind = 'year';
    else if (/^\s*季度/u.test(after)) kind = 'quarter';
    if (scale) power = SCALE[scale[1].toLowerCase()];
    const afterScale = scale ? after.slice(scale[0].length) : after;
    // AI infrastructure quantities: explicit SI power conversion; other named dimensions stay literal, never borrowed as plain counts.
    const powerUnit = /^\s*(gigawatts?|megawatts?|kilowatts?|watts?|GW|MW|kW|mW|W|吉瓦|兆瓦|千瓦|瓦)(?![A-Za-z])/u.exec(afterScale);
    const powerExponents = { gigawatt: 9, gigawatts: 9, megawatt: 6, megawatts: 6, kilowatt: 3, kilowatts: 3, watt: 0, watts: 0, GW: 9, MW: 6, kW: 3, mW: -3, W: 0, 吉瓦: 9, 兆瓦: 6, 千瓦: 3, 瓦: 0 };
    const literalUnit = /^\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|kbps|Mbps|Gbps|km|kg|kWh|MWh|GWh)(?![A-Za-z])/u.exec(afterScale);
    if (powerUnit) { kind = 'power-W'; power += powerExponents[powerUnit[1]]; }
    else if (literalUnit) kind = `unit:${literalUnit[1]}`;
    const suffixCurrency = /^\s*(新西兰元|新加坡元|美元|人民币|欧元|英镑|港元|澳元|加元|日元|元|USD|US dollars?|U\.S\. dollars?|EUR|GBP|CNY|HKD|AUD|CAD|NZD|SGD|JPY)(?![A-Za-z])/iu.exec(afterScale);
    const prefixCurrency = /(US\$|U\.S\.\$|HK\$|AU\$|CA\$|NZ\$|A\$|C\$|S\$|USD|EUR|GBP|CNY|HKD|AUD|CAD|NZD|SGD|JPY|美元|人民币|欧元|英镑|\$|€|£)\s*$/iu.exec(before);
    const currencyLabels = { 新西兰元: 'NZD', 新加坡元: 'SGD', 港元: 'HKD', 澳元: 'AUD', 加元: 'CAD', 日元: 'JPY', HKD: 'HKD', AUD: 'AUD', CAD: 'CAD', NZD: 'NZD', SGD: 'SGD', JPY: 'JPY', 美元: 'USD', USD: 'USD', 'US dollars': 'USD', 'US dollar': 'USD', 'U.S. dollars': 'USD', 'U.S. dollar': 'USD', 元: 'CNY', 人民币: 'CNY', CNY: 'CNY', 欧元: 'EUR', EUR: 'EUR', '€': 'EUR', 英镑: 'GBP', GBP: 'GBP', '£': 'GBP', 'US$': 'USD', 'U.S.$': 'USD', 'HK$': 'HKD', 'A$': 'AUD', 'C$': 'CAD', 'AU$': 'AUD', 'CA$': 'CAD', 'NZ$': 'NZD', 'S$': 'SGD' };
    if (prefixCurrency || suffixCurrency) {
      const prefix = prefixCurrency?.[1];
      const canonicalCurrency = value => Object.entries(currencyLabels).find(([label]) => label.toLowerCase() === value?.toLowerCase())?.[1];
      let currency = canonicalCurrency(suffixCurrency?.[1]) || canonicalCurrency(prefix);
      // Bare $ follows US-financial-news notation only when no conflicting dollar currency is disclosed.
      if (!currency && prefix === '$') currency = /Australia|Australian|Canada|Canadian|Hong Kong|Singapore|New Zealand|\b(?:AUD|CAD|HKD|SGD|NZD)\b/iu.test(normalized) ? 'ambiguous-dollar' : 'USD';
      if (prefix && prefix !== '$' && suffixCurrency && canonicalCurrency(prefix) !== currency) currency = 'conflicting-currency';
      if (prefix === '$' && suffixCurrency && !['USD', 'AUD', 'CAD', 'HKD', 'SGD', 'NZD'].includes(currency)) currency = 'conflicting-currency';
      kind = kind !== 'number' ? 'invalid-financial' : `money:${currency || 'unknown'}`;
    } else if (scale && kind === 'number') kind = scale[1].length <= 2 && /^[A-Za-z]+$/u.test(scale[1]) ? 'invalid' : 'scaled-number';
    if (kind === 'number' && (/[A-Za-z]$/u.test(before) || /^[A-Za-z]/u.test(after))) {
      const left = /[A-Za-z][A-Za-z0-9_-]*$/u.exec(before)?.[0] || '';
      const right = /^[A-Za-z0-9_-]+/u.exec(after)?.[0] || '';
      const identifier = `${left}${match[0]}${right}`.toLowerCase().replace(/[-_]/gu, '');
      if (/^q[1-4]$/u.test(identifier)) kind = 'quarter';
      else { atoms.push({ key: `identifier:${identifier}`, number: match[0], kind: 'identifier' }); continue; }
    }
    if (kind === 'number' && /^\d{4}$/u.test(match[0]) && Number(match[0]) >= 1900 && Number(match[0]) <= 2199) kind = 'year';
    atoms.push({ key: `${kind}:${decimalKey(match[0], power)}`, number: match[0], kind,
      ...(basisPoints ? { alternateKey: `percentage-point:${decimalKey(match[0], power)}` } : {}) });
  }
  for (const [index, month] of MONTHS.entries()) {
    // Calendar context prevents modal "may" and the verb "march" becoming invented dates.
    const alias = `(?:${month}|${month.slice(0, 3)}${month === 'september' ? '|sept' : ''})`;
    if (new RegExp(`(?:\\b(?:in|of|during|by|since|through|for|this|last)\\s+${alias}\\b|\\b${alias}(?:\\.\\s*|\\s+)\\d{1,4}\\b)`, 'iu').test(normalized)) atoms.push({ key: `month:${decimalKey(String(index + 1))}`, number: month, kind: 'month' });
  }
  return atoms;
}

export function claimEvidenceTexts(claim, input) {
  const refs = new Set(Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : []);
  const indicators = new Set(Array.isArray(claim?.sourceIndicatorIds) ? claim.sourceIndicatorIds : []);
  const stories = (input?.newsContext?.stories || []).filter(story => refs.has(story.id)
    && ['official', 'cross_checked', 'attributed_media'].includes(story.evidenceStatus) && story.contentScope !== 'title_only' && typeof story.snippet === 'string');
  // An unrelated fact in the input is never support. Require the claim's matching indicator ID AND source ref.
  const facts = (input?.structuredFacts || []).filter(fact => indicators.has(fact.indicatorId)
    && refs.has(`indicator:${fact.indicatorId}`) && (fact.sourceRefIds || []).includes(`indicator:${fact.indicatorId}`) && typeof fact.factZh === 'string');
  return [...stories.map(story => `${story.title} ${story.snippet}`), ...facts.map(fact => fact.factZh)];
}

export function claimNumericSupport(claim, input) {
  const evidence = claimEvidenceTexts(claim, input);
  const supported = new Set(evidence.flatMap(numericEvidenceAtoms).filter(atom => !['invalid', 'money:unknown', 'money:ambiguous-dollar', 'money:conflicting-currency'].includes(atom.kind)).flatMap(atom => [atom.key, ...(atom.alternateKey ? [atom.alternateKey] : [])]));
  const text = [claim?.titleZh, claim?.detailZh].filter(value => typeof value === 'string').join(' ');
  const unsupported = numericEvidenceAtoms(text).filter(atom => atom.kind.startsWith('invalid') || (!supported.has(atom.key) && !supported.has(atom.alternateKey)));
  // Hard scope: parseable amounts/currencies and unsupported rates. Dates, identifiers,
  // non-financial quantities and unparsed wording remain visible review hints. Extending
  // the hard scope requires a separately reviewed policy, not another paid experiment.
  const equivalentRate = atom => ['percent', 'percentage-point'].includes(atom.kind)
    && supported.has(`${atom.kind === 'percent' ? 'percentage-point' : 'percent'}:${atom.key.split(':')[1]}`);
  const blockers = unsupported.filter(atom => atom.kind.startsWith('money:') || atom.kind === 'invalid-financial'
    || (['percent', 'percentage-point'].includes(atom.kind) && !equivalentRate(atom)));
  const hints = unsupported.filter(atom => !blockers.includes(atom));
  return { unsupported, blockers, hints, evidenceCount: evidence.length };
}
