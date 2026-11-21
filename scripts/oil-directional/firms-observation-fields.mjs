// Shared strict field parsing; never turn absent measurements into observed zero.
export function firmsFrpOrNull(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('Invalid FIRMS FRP field');
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error('Invalid FIRMS FRP field');
  return number;
}

export function firmsAcquisitionIso(record) {
  const date = String(record.acq_date ?? '').trim();
  const rawTime = String(record.acq_time ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,4}$/.test(rawTime)) {
    throw new Error('Invalid FIRMS acquisition timestamp');
  }
  const time = rawTime.padStart(4, '0');
  if (Number(time.slice(0, 2)) > 23 || Number(time.slice(2)) > 59) {
    throw new Error('Invalid FIRMS acquisition timestamp');
  }
  const iso = `${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;
  const milliseconds = Date.parse(iso);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== iso.replace('Z', '.000Z')) {
    throw new Error('Invalid FIRMS acquisition timestamp');
  }
  return iso;
}

export function parseFirmsCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
