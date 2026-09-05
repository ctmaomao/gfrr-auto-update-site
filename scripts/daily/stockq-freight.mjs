// Public aggregate indices only. No route prices, obfuscation decoding or new source.
const TITLES = { BDI: 'Baltic Dry', BDTI: 'Baltic Dirty Tanker', BCTI: 'Baltic Clean Tanker' };
const DAY_MS = 86400000;

export function isFreightIndexValue(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isUsableFreightCache(value, updatedAt, change, nowMs = Date.now()) {
  if (!isFreightIndexValue(value) || typeof updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(updatedAt)) return false;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms) || ms > nowMs || new Date(ms).toISOString().slice(0, 10) !== updatedAt.slice(0, 10)) return false;
  // Signature of the retired return-table fallback: value and change came from
  // the same percentage cell. Quarantine it instead of inventing a market floor.
  return !Number.isFinite(change) || Math.abs(value - change * 100) > 1e-8;
}

function text(html) {
  if (/\b(?:data-sq|sq-obfuscated|hidden)(?:\s|[=>"'])|aria-hidden\s*=\s*["']true|display\s*:\s*none/iu.test(html)) return '';
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<[^>]*>/gu, ' ').replace(/&nbsp;|&#160;/giu, ' ').replace(/\s+/gu, ' ').trim();
}

function dateIso(value) {
  if (!/^\d{4}\/\d{2}\/\d{2}$/u.test(value)) return null;
  const day = value.replaceAll('/', '-');
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(day)
    ? new Date(ms).toISOString() : null;
}

export function parseStockqFreight(html, symbol, { nowMs = Date.now(), maxAgeDays = 7 } = {}) {
  const title = text(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] || '');
  if (!TITLES[symbol] || !title.toLowerCase().includes(`${TITLES[symbol]} index`.toLowerCase())) {
    throw new Error(`stockq:${symbol} unexpected page identity`);
  }
  const candidates = [];
  for (const [table] of String(html).matchAll(/<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/giu)) {
    const rows = [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu)].map(([row]) =>
      [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map(m => text(m[0])));
    const headerIndex = rows.findIndex(cells => cells.length >= 3 && cells.length % 3 === 0
      && cells.every((cell, i) => cell.toLowerCase() === ['date', 'index', 'change%'][i % 3]));
    if (headerIndex < 0) continue;
    const width = rows[headerIndex].length;
    for (const cells of rows.slice(headerIndex + 1)) {
      // Preserve empty cells: removing them shifts dates and percentages into value columns.
      if (cells.length !== width) throw new Error(`stockq:${symbol} unexpected history columns`);
      for (let i = 0; i < cells.length; i += 3) {
        const updatedAt = dateIso(cells[i]);
        if (!updatedAt) continue;
        const rawValue = cells[i + 1] || '';
        const value = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/u.test(rawValue)
          ? Number(rawValue.replaceAll(',', '')) : null;
        const rawChange = cells[i + 2] || '';
        const change = /^[+-]?\d+(?:\.\d+)?\s*%$/u.test(rawChange)
          ? Number(rawChange.replace('%', '').trim()) / 100 : null;
        candidates.push({ value, dailyChangePct: change, updatedAt });
      }
    }
  }
  candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latest = candidates[0];
  // Never silently retreat to an older readable row when the newest quote is hidden.
  if (!latest || !isFreightIndexValue(latest.value)) throw new Error(`stockq:${symbol} latest dated index unavailable`);
  if (candidates.some(row => row.updatedAt === latest.updatedAt
    && (row.value !== latest.value || row.dailyChangePct !== latest.dailyChangePct))) {
    throw new Error(`stockq:${symbol} conflicting latest index`);
  }
  const ageDays = (nowMs - Date.parse(latest.updatedAt)) / DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > maxAgeDays) throw new Error(`stockq:${symbol} stale or future observation`);
  return latest;
}
