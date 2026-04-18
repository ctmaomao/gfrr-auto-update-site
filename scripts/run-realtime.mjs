import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const realtimePath = path.join(root, 'realtime', 'market.json');
const now = new Date().toISOString();
const cosd = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const primarySeries = {
  brent: { type: 'fred', id: 'DCOILBRENTEU', critical: true },
  dxy: { type: 'fred', id: 'DTWEXBGS', critical: true },
  hyOas: { type: 'fred', id: 'BAMLH0A0HYM2', critical: true },
  vix: { type: 'fred', id: 'VIXCLS', critical: true },
  spx: { type: 'fred', id: 'SP500', critical: false },
  us10y: { type: 'fred', id: 'DGS10', critical: true },
  us2y: { type: 'fred', id: 'DGS2', critical: false },
  real10y: { type: 'fred', id: 'DFII10', critical: true },
  breakeven10y: { type: 'fred', id: 'T10YIE', critical: false }
};

function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined || raw === '.' || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

function parseStooqCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close] = line.split(',');
    const value = Number(close);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'gfr-v24.1-realtime/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchFred(id) {
  const text = await fetchText(`${FRED}?cosd=${cosd}&id=${id}`);
  const rows = parseFredCsv(text);
  if (rows.length < 2) throw new Error('insufficient rows');
  return rows;
}

async function fetchStooq(symbol) {
  const text = await fetchText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`);
  const rows = parseStooqCsv(text);
  if (rows.length < 2) throw new Error('insufficient rows');
  return rows;
}

function latest(rows, idx = 0) {
  return rows[rows.length - 1 - idx]?.value;
}

function buildSeriesPayload(rows) {
  const curr = latest(rows);
  const prev = latest(rows, 1);
  return {
    value: curr,
    chg1d: Number.isFinite(curr) && Number.isFinite(prev) ? +(curr - prev).toFixed(4) : 0
  };
}

function readPrev() {
  try {
    return JSON.parse(fs.readFileSync(realtimePath, 'utf8'));
  } catch {
    return null;
  }
}

function mockPayload() {
  return {
    updatedAt: now,
    sourceMode: 'mock',
    degradedMode: false,
    cacheOnly: false,
    healthScore: 100,
    criticalMissing: 0,
    fallbackCount: 0,
    lastSuccessAt: now,
    notes: ['本地测试模式：仅校验 v24.1 交易引擎脚本结构。'],
    values: {
      brent: 89.8, dxy: 104.7, vix: 17.8, us10y: 4.31, us2y: 4.72, real10y: 1.96, breakeven10y: 2.35, spx: 5178.4, gold: 2384.7, hyOas: 3.92
    },
    changes: {
      brent1d: 1.1, dxy1d: -0.08, vix1d: -0.5, us10y1d: 0.01, us2y1d: -0.02, real10y1d: 0.01, breakeven10y1d: 0.03, spx1d: 22.5, gold1d: 8.3, hyOas1d: -0.04
    },
    sourceStatus: {
      brent: 'mock', dxy: 'mock', hyOas: 'mock', vix: 'mock', spx: 'mock', us10y: 'mock', us2y: 'mock', real10y: 'mock', breakeven10y: 'mock', gold: 'mock'
    }
  };
}

async function resolveSeries(key, prev) {
  const spec = primarySeries[key];
  try {
    const rows = await fetchFred(spec.id);
    const s = buildSeriesPayload(rows);
    return { key, value: s.value, change: s.chg1d, status: 'fred', critical: spec.critical, ok: true };
  } catch (error) {
    return {
      key,
      value: prev?.values?.[key] ?? 0,
      change: prev?.changes?.[`${key}1d`] ?? 0,
      status: `fallback:${String(error.message).slice(0, 60)}`,
      critical: spec.critical,
      ok: false
    };
  }
}

async function resolveGold(prev) {
  try {
    const rows = await fetchStooq('xauusd');
    const s = buildSeriesPayload(rows);
    return { key: 'gold', value: s.value, change: s.chg1d, status: 'stooq', critical: false, ok: true };
  } catch (error) {
    return {
      key: 'gold',
      value: prev?.values?.gold ?? 0,
      change: prev?.changes?.gold1d ?? 0,
      status: `fallback:${String(error.message).slice(0, 60)}`,
      critical: false,
      ok: false
    };
  }
}

async function resolveSpxSecondary(prev) {
  try {
    const rows = await fetchStooq('^spx');
    const s = buildSeriesPayload(rows);
    return { key: 'spx', value: s.value, change: s.chg1d, status: 'stooq-secondary', critical: false, ok: true };
  } catch {
    return { key: 'spx', value: prev?.values?.spx ?? 0, change: prev?.changes?.spx1d ?? 0, status: 'fallback:secondary unavailable', critical: false, ok: false };
  }
}

async function main() {
  let payload;
  if (process.env.GFR_USE_LOCAL_MOCK === '1') {
    payload = mockPayload();
  } else {
    const prev = readPrev();
    const values = {};
    const changes = {};
    const sourceStatus = {};
    const notes = [];
    let fallbackCount = 0;
    let criticalMissing = 0;

    for (const key of Object.keys(primarySeries)) {
      const result = await resolveSeries(key, prev);
      if (key === 'spx' && !result.ok) {
        const secondary = await resolveSpxSecondary(prev);
        values[key] = secondary.value;
        changes[`${key}1d`] = secondary.change;
        sourceStatus[key] = secondary.status;
        if (!secondary.ok) fallbackCount += 1;
      } else {
        values[key] = result.value;
        changes[`${key}1d`] = result.change;
        sourceStatus[key] = result.status;
        if (!result.ok) fallbackCount += 1;
      }

      const bad = !String(sourceStatus[key]).startsWith('fred') && !String(sourceStatus[key]).startsWith('stooq');
      if (bad && primarySeries[key].critical) criticalMissing += 1;
      if (bad) notes.push(`${key} 数据源失效，已回退到上次有效值`);
    }

    const gold = await resolveGold(prev);
    values.gold = gold.value;
    changes.gold1d = gold.change;
    sourceStatus.gold = gold.status;
    if (!gold.ok) {
      fallbackCount += 1;
      notes.push('gold 数据源失效，已回退到上次有效值');
    }

    const cacheOnly = criticalMissing >= 4;
    const degradedMode = criticalMissing >= 2 || fallbackCount >= 3;
    const healthScore = Math.max(0, Math.min(100, 100 - criticalMissing * 18 - fallbackCount * 6));

    payload = {
      updatedAt: now,
      sourceMode: cacheOnly ? 'cache-only' : degradedMode ? 'live-with-fallback' : 'live',
      degradedMode,
      cacheOnly,
      healthScore,
      criticalMissing,
      fallbackCount,
      lastSuccessAt: criticalMissing >= 4 ? (prev?.lastSuccessAt ?? now) : now,
      notes: notes.length ? notes : ['实时快变量已成功刷新。'],
      values,
      changes,
      sourceStatus
    };
  }

  fs.mkdirSync(path.dirname(realtimePath), { recursive: true });
  fs.writeFileSync(realtimePath, JSON.stringify(payload, null, 2));
  console.log('Built realtime market successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
