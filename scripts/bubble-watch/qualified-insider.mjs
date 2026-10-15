// Pure r2 source contract. A response window does not establish complete SEC coverage.
export const INSIDER_BASKET = Object.freeze([
  'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'ORCL',
  'AVGO', 'AMD', 'PLTR', 'CRM', 'NOW', 'SMCI'
]);
const DAY = 86400000;
const MONEY_SCALE = 10n ** 12n;
const MIN_BUY = 1_000_000n * MONEY_SCALE;
const MAX_TRADE = 1_000_000_000_000n * MONEY_SCALE;
export const INSIDER_ROW_LIMIT = 2000;
const POLICY = 'insider_fixed_12_30_90_v1';
const gap = reason => ({ status:'unknown', reasonCode:'insider_window_coverage_unconfirmed', qualificationFailure:reason });
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : null;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value.slice(0,10) ? time : NaN;
}
function money(value, max = MAX_TRADE * BigInt(INSIDER_ROW_LIMIT * INSIDER_BASKET.length)) {
  // Keep up to 12 fractional USD digits. No floating-point threshold comparisons.
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,16})(?:\.\d{1,12})?$/u.test(text)) return null;
  const [whole, fraction=''] = text.split('.');
  const units = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(12,'0'));
  return units <= max ? units : null;
}
function usd(units) {
  const fraction = (units % MONEY_SCALE).toString().padStart(12,'0').replace(/0+$/u,'');
  return `${units / MONEY_SCALE}${fraction ? `.${fraction}` : ''}`;
}
function windowStart(today, days) { return new Date(day(today) - (days-1)*DAY).toISOString().slice(0,10); }
export function insiderWindowUrl(symbol, today) {
  if (!INSIDER_BASKET.includes(symbol) || day(today) === null) throw new Error('Invalid fixed insider request');
  return `https://xoomar.com/api/markets/insiders/${symbol}?from=${windowStart(today,90)}&to=${today}&limit=${INSIDER_ROW_LIMIT}`;
}
function sourceMatches(value, symbol, today) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.hash && !url.port
      && url.origin === 'https://xoomar.com' && url.pathname === `/api/markets/insiders/${symbol}`
      && [...url.searchParams].length === 3 && url.searchParams.get('from') === windowStart(today,90)
      && url.searchParams.get('to') === today && url.searchParams.get('limit') === String(INSIDER_ROW_LIMIT);
  } catch { return false; }
}
function emptyWindow() { return {buyUsd:0n,sellUsd:0n,transactionCount:0,scheduledCount:0,scheduleUnknownCount:0}; }
function publicWindow(window) { return {...window,buyUsd:usd(window.buyUsd),sellUsd:usd(window.sellUsd)}; }
function amountsFitTransactions(buy,sell,count) {
  return count >= Number(buy > 0n)+Number(sell > 0n)
    && buy+sell <= BigInt(count)*MAX_TRADE
    && (buy+sell === 0n) === (count === 0);
}

export function qualifyInsiderWindows(samples, today, checkedAt) {
  const now = day(today), stamp = timestamp(checkedAt);
  if (now === null || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== today || !Array.isArray(samples)) return gap('invalid_check_clock');
  const identities = samples.map(sample=>sample?.symbol);
  if (new Set(identities).size !== identities.length || identities.some(symbol=>!INSIDER_BASKET.includes(symbol))) return gap('basket_identity_invalid');
  const starts = Object.fromEntries([30,90].map(n=>[n,now-(n-1)*DAY]));
  const companies = [], rejectedSamples = [];
  for (const sample of samples) {
    const {symbol,transactions:rows} = sample;
    const reject = reason => rejectedSamples.push({symbol,reason});
    if (sample.responseTicker !== symbol) { reject('response_ticker_mismatch'); continue; }
    const built = timestamp(sample.responseBuiltAt);
    if (!sourceMatches(sample.sourceUrl,symbol,today) || !Number.isFinite(built) || built > stamp || stamp-built > 48*3600000) {
      reject('response_clock_or_query_invalid'); continue;
    }
    if (!Array.isArray(rows) || rows.length > INSIDER_ROW_LIMIT) { reject('response_schema_or_local_cap'); continue; }
    const windows = {30:emptyWindow(),90:emptyWindow()}, seen = new Set();
    let oldest = Infinity, newest = -Infinity, last = Infinity, latestIncluded = null, invalid = null;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { invalid='transaction_schema_invalid'; break; }
      const date = day(row.txDate);
      if (date === null || date < starts[90] || date > now || date > last || date > day(sample.responseBuiltAt.slice(0,10))) {
        invalid='transaction_date_or_order_invalid'; break;
      }
      last=date; oldest=Math.min(oldest,date); newest=Math.max(newest,date);
      if (typeof row.isOpenMarket !== 'boolean' || typeof row.txCode !== 'string'
        || (row.isOpenMarket && !['P','S'].includes(row.txCode))
        || (['P','S'].includes(row.txCode) && !row.isOpenMarket)) { invalid='transaction_code_invalid'; break; }
      if (!row.isOpenMarket) continue;
      const amount = money(row.valueUsd,MAX_TRADE);
      if (amount === null || amount <= 0n || (row.priceNote !== null && row.priceNote !== undefined && row.priceNote !== '')) {
        invalid='transaction_amount_missing_or_approximate'; break;
      }
      const key = JSON.stringify([row.insiderName,row.txDate,row.txCode,row.shares,row.pricePerShare,usd(amount)]);
      if (seen.has(key)) { invalid='duplicate_transaction'; break; }
      seen.add(key);
      latestIncluded = latestIncluded === null || row.txDate > latestIncluded ? row.txDate : latestIncluded;
      for (const n of [30,90]) if (date >= starts[n]) {
        const window=windows[n]; window[row.txCode === 'P' ? 'buyUsd' : 'sellUsd'] += amount;
        window.transactionCount++;
        if (row.is10b51 === true) window.scheduledCount++;
        else if (row.is10b51 !== false) window.scheduleUnknownCount++;
      }
    }
    if (invalid) { reject(invalid); continue; }
    companies.push({symbol,sourceUrl:sample.sourceUrl,responseBuiltAt:sample.responseBuiltAt,returnedRecordCount:rows.length,
      oldestReturnedDate:rows.length ? new Date(oldest).toISOString().slice(0,10) : null,
      newestReturnedDate:rows.length ? new Date(newest).toISOString().slice(0,10) : null,
      latestIncludedTransactionDate:latestIncluded,localRecordLimitReached:rows.length === INSIDER_ROW_LIMIT,
      windows:{30:publicWindow(windows[30]),90:publicWindow(windows[90])}});
  }
  return {...qualifyInsiderCoverage(companies,today,checkedAt),rejectedSamples};
}

export function qualifyInsiderCoverage(companies, today, checkedAt) {
  const now=day(today), stamp=timestamp(checkedAt);
  if (now === null || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== today
    || !Array.isArray(companies) || companies.length > INSIDER_BASKET.length) return gap('invalid_capture');
  if (companies.some(company=>!company || typeof company !== 'object' || Array.isArray(company))) return gap('invalid_company_window_proof');
  if (new Set(companies.map(company=>company.symbol)).size !== companies.length) return gap('duplicate_company');
  for (const company of companies) {
    const count=company.returnedRecordCount, built=timestamp(company.responseBuiltAt);
    const oldest=day(company.oldestReturnedDate), newest=day(company.newestReturnedDate);
    if (!INSIDER_BASKET.includes(company.symbol) || !sourceMatches(company.sourceUrl,company.symbol,today)
      || !Number.isFinite(built) || built > stamp || stamp-built > 48*3600000
      || !Number.isInteger(count) || count < 0 || count > INSIDER_ROW_LIMIT
      || company.localRecordLimitReached !== (count === INSIDER_ROW_LIMIT)) return gap('invalid_company_window_proof');
    if (count === 0 ? company.oldestReturnedDate !== null || company.newestReturnedDate !== null
      : oldest === null || newest === null || oldest > newest || oldest < now-89*DAY || newest > now
        || newest > day(company.responseBuiltAt.slice(0,10))) return gap('invalid_company_dates');
    for (const n of [30,90]) {
      const window=company.windows?.[n], max=BigInt(count)*MAX_TRADE;
      const buy=money(window?.buyUsd,max), sell=money(window?.sellUsd,max);
      if (!window || buy === null || sell === null || typeof window.buyUsd !== 'string' || typeof window.sellUsd !== 'string'
        || !['transactionCount','scheduledCount','scheduleUnknownCount'].every(key=>Number.isInteger(window[key]) && window[key] >= 0 && window[key] <= count)
        || window.scheduledCount+window.scheduleUnknownCount > window.transactionCount
        || !amountsFitTransactions(buy,sell,window.transactionCount)) return gap('invalid_window_totals');
    }
    const latest=day(company.latestIncludedTransactionDate);
    if (company.windows[90].transactionCount === 0 ? company.latestIncludedTransactionDate !== null
      : latest === null || latest < oldest || latest > newest) return gap('invalid_included_transaction_date');
    if (latest !== null && (company.windows[30].transactionCount > 0) !== (latest >= now-29*DAY)) return gap('invalid_included_transaction_date');
    for (const key of ['buyUsd','sellUsd']) if (money(company.windows[30][key]) > money(company.windows[90][key])) return gap('nested_window_inconsistent');
    for (const key of ['transactionCount','scheduledCount','scheduleUnknownCount']) if (company.windows[30][key] > company.windows[90][key]) return gap('nested_window_inconsistent');
    const outsideCount=company.windows[90].transactionCount-company.windows[30].transactionCount;
    const outsideBuy=money(company.windows[90].buyUsd)-money(company.windows[30].buyUsd);
    const outsideSell=money(company.windows[90].sellUsd)-money(company.windows[30].sellUsd);
    const outsideFlags=company.windows[90].scheduledCount-company.windows[30].scheduledCount
      +company.windows[90].scheduleUnknownCount-company.windows[30].scheduleUnknownCount;
    if (!amountsFitTransactions(outsideBuy,outsideSell,outsideCount) || outsideFlags > outsideCount) return gap('nested_window_inconsistent');
  }
  const internal = {30:emptyWindow(),90:emptyWindow()};
  for (const company of companies) for (const n of [30,90]) {
    for (const key of ['buyUsd','sellUsd']) internal[n][key] += money(company.windows[n][key]);
    for (const key of ['transactionCount','scheduledCount','scheduleUnknownCount']) internal[n][key] += company.windows[n][key];
  }
  const totals=Object.fromEntries([30,90].map(n=>[n,{...publicWindow(internal[n]),
    ratio:internal[n].buyUsd >= MIN_BUY ? Number(internal[n].sellUsd)/Number(internal[n].buyUsd) : null,
    buyDenominatorSufficient:internal[n].buyUsd >= MIN_BUY}]));
  // A bounded query and a sub-limit response do not prove complete SEC enumeration.
  // Red/green require a future independently reviewed complete-source adapter.
  const sellDominant=[30,90].some(n=>internal[n].buyUsd >= MIN_BUY
    ? internal[n].sellUsd >= 5n*internal[n].buyUsd : internal[n].sellUsd >= 5n*MIN_BUY);
  const status=companies.length >= 8 && sellDominant ? 'yellow' : 'unknown';
  const latestDates=companies.map(company=>company.latestIncludedTransactionDate).filter(Boolean).sort();
  return {status,...(status === 'unknown' ? {reasonCode:'insider_window_coverage_unconfirmed',qualificationFailure:'returned_sample_direction_unconfirmed'} : {}),
    policy:POLICY,windowStartDate:windowStart(today,90),windowEndDate:today,basket:[...INSIDER_BASKET],checkedAt,
    latestTransactionDate:latestDates.at(-1) || null,coverageStatus:'returned_sample_completeness_unverified',
    validResponseSymbols:companies.map(company=>company.symbol),
    inWindowTradeSymbols:companies.filter(company=>company.windows[90].transactionCount > 0).map(company=>company.symbol),
    returnedEmptySymbols:companies.filter(company=>company.returnedRecordCount === 0).map(company=>company.symbol),
    missingSymbols:INSIDER_BASKET.filter(symbol=>!companies.some(company=>company.symbol === symbol)),companies,totals,
    denominatorFloorApplied:false,moneyArithmetic:'fixed_decimal_usd_12_places_ratio_display_approximate',
    coverageBasis:'explicit_90d_request_returned_records_only_completeness_unverified',
    responseClockMeaning:'response_generation_not_underlying_sec_refresh',
    schedulePolicy:'retain_reported_plan_flags_never_assume_unscheduled_or_discount_sales'};
}
