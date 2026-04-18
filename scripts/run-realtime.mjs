import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const realtimePath = path.join(root, 'realtime', 'market.json');
const now = new Date().toISOString();
const cosd = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const seriesMap = {
  brent: 'DCOILBRENTEU',
  dxy: 'DTWEXBGS',
  hyOas: 'BAMLH0A0HYM2',
  vix: 'VIXCLS',
  spx: 'SP500',
  us10y: 'DGS10',
  us2y: 'DGS2',
  real10y: 'DFII10',
  breakeven10y: 'T10YIE'
};

function parseCsv(text) {
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

async function fetchFred(id) {
  const url = `${FRED}?cosd=${cosd}&id=${id}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'gfr-v24-realtime/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch ${id}: ${res.status}`);
  const rows = parseCsv(await res.text());
  if (rows.length < 2) throw new Error(`Insufficient rows for ${id}`);
  return rows;
}

async function fetchGoldOptional() {
  // Stooq daily gold spot proxy; optional source
  const url = 'https://stooq.com/q/d/l/?s=xauusd&i=d';
  const res = await fetch(url, { headers: { 'User-Agent': 'gfr-v24-realtime/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch xauusd: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close] = line.split(',');
    const value = Number(close);
    if (!date || !Number.isFinite(value)) continue;
    rows.push({ date, value });
  }
  if (rows.length < 2) throw new Error('Insufficient rows for gold');
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
    chg1d: Number.isFinite(curr) && Number.isFinite(prev) ? curr - prev : 0
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
    lastSuccessAt: now,
    notes: ['本地测试模式：仅校验 v24 混合实时架构脚本结构。'],
    values: {
      brent: 87.6, dxy: 105.2, vix: 19.6, us10y: 4.42, us2y: 4.76, real10y: 2.05, breakeven10y: 2.31, spx: 5124.3, gold: 2368.2, hyOas: 4.08
    },
    changes: {
      brent1d: 0.8, dxy1d: 0.12, vix1d: -0.4, us10y1d: 0.03, spx1d: 18.2, gold1d: 6.4, hyOas1d: 0.05
    },
    sourceStatus: {
      brent: 'mock', dxy: 'mock', hyOas: 'mock', vix: 'mock', spx: 'mock', us10y: 'mock', us2y: 'mock', real10y: 'mock', breakeven10y: 'mock', gold: 'mock'
    }
  };
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
    let degraded = false;
    const notes = [];
    for (const [key, id] of Object.entries(seriesMap)) {
      try {
        const rows = await fetchFred(id);
        const s = buildSeriesPayload(rows);
        values[key] = s.value;
        changes[`${key}1d`] = s.chg1d;
        sourceStatus[key] = 'fred';
      } catch (err) {
        degraded = true;
        values[key] = prev?.values?.[key] ?? 0;
        changes[`${key}1d`] = prev?.changes?.[`${key}1d`] ?? 0;
        sourceStatus[key] = `fallback:${String(err.message).slice(0, 80)}`;
        notes.push(`${key} 拉取失败，已回退到上次有效值`);
      }
    }

    try {
      const rows = await fetchGoldOptional();
      const s = buildSeriesPayload(rows);
      values.gold = s.value;
      changes.gold1d = s.chg1d;
      sourceStatus.gold = 'stooq';
    } catch (err) {
      degraded = true;
      values.gold = prev?.values?.gold ?? 0;
      changes.gold1d = prev?.changes?.gold1d ?? 0;
      sourceStatus.gold = `fallback:${String(err.message).slice(0, 80)}`;
      notes.push('gold 拉取失败，已回退到上次有效值');
    }

    payload = {
      updatedAt: now,
      sourceMode: degraded ? 'live-with-fallback' : 'live',
      degradedMode: degraded,
      lastSuccessAt: now,
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
