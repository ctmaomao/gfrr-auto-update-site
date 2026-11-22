export function parseFredCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) continue;
    if (raw === undefined || raw.trim() === '' || raw.trim() === '.') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

export function buildDateChunks(startDate, endDate, chunkYears) {
  const chunks = [];
  let year = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  while (year <= endYear) {
    const chunkStart = year === Number(startDate.slice(0, 4)) ? startDate : `${year}-01-01`;
    const chunkEndYear = Math.min(year + chunkYears - 1, endYear);
    const chunkEnd = chunkEndYear === endYear ? endDate : `${chunkEndYear}-12-31`;
    chunks.push({ startDate: chunkStart, endDate: chunkEnd });
    year = chunkEndYear + 1;
  }
  return chunks;
}
