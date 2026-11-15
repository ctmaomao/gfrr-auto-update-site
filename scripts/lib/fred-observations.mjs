// Shared Daily/realtime parsers. Keep source ordering and existing coercion/error
// behavior; source eligibility, freshness, requests and fallback stay with callers.
export function parseFredCsv(text) {
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

export function parseFredApiObservations(text) {
  const json = JSON.parse(text);
  const observations = json?.observations;
  if (!Array.isArray(observations)) {
    throw new Error('FRED API returned invalid observations payload');
  }
  const out = [];
  for (const item of observations) {
    const date = item?.date;
    const raw = item?.value;
    if (!date || raw === undefined || raw === '.' || String(raw).trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}
