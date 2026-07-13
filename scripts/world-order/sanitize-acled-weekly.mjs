import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as xlsx from 'xlsx';

xlsx.set_fs(fs);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const inputDir = path.join(root, 'manual-artifacts', 'world-order', 'acled-input', 'weekly');
const outputPath = path.join(root, 'config', 'world-order-acled-regional-weekly.json');

const SOURCE_URL = 'https://acleddata.com/conflict-data/download-data-files';
const LICENSE_LEVEL = 'open';
const ATTRIBUTION = 'ACLED (Armed Conflict Location & Event Data) — https://acleddata.com';
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_DATA_ROWS = 350_000;

const expectedRegions = [
  'Africa',
  'Middle-East',
  'Europe-Central-Asia',
  'US-and-Canada',
  'Latin-America-the-Caribbean',
  'Asia-Pacific'
];

const expectedColumns = [
  'WEEK',
  'REGION',
  'COUNTRY',
  'ADMIN1',
  'EVENT_TYPE',
  'SUB_EVENT_TYPE',
  'EVENTS',
  'FATALITIES',
  'POPULATION_EXPOSURE',
  'DISORDER_TYPE',
  'ID',
  'CENTROID_LATITUDE',
  'CENTROID_LONGITUDE'
];

const filenamePattern = /^(.+)_aggregated_data_up_to_week_of-(\d{4}-\d{2}-\d{2})(?:_.*)?\.xlsx$/u;

function warn(message) {
  console.warn(`ACLED weekly sanitizer warning: ${message}`);
}

function fail(message) {
  throw new Error(`ACLED weekly sanitizer failed: ${message}`);
}

function isNonEmptyRow(row) {
  return Array.isArray(row) && row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function toIsoDateFromDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) fail(`invalid date cell: ${date}`);
  return date.toISOString().slice(0, 10);
}

function excelSerialToIsoDate(value) {
  const parsed = xlsx.SSF.parse_date_code(value);
  if (!parsed) fail(`invalid Excel date serial: ${value}`);
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  return toIsoDateFromDate(date);
}

function parseWeek(value, context) {
  if (value instanceof Date) return toIsoDateFromDate(value);
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToIsoDate(value);
  const text = String(value ?? '').trim();
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/u);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return toIsoDateFromDate(parsed);
  fail(`${context}: WEEK must be parseable as YYYY-MM-DD`);
}

function parseNonNegativeInteger(value, context) {
  const text = String(value ?? '').replace(/,/gu, '').trim();
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    fail(`${context}: expected non-negative integer, got ${value}`);
  }
  return parsed;
}

function normalizeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function validateHeader(header, filename) {
  const normalized = header.map((value) => String(value ?? '').trim());
  if (normalized.length !== expectedColumns.length) {
    fail(`${filename}: expected ${expectedColumns.length} columns, got ${normalized.length}`);
  }
  for (const [index, expected] of expectedColumns.entries()) {
    if (normalized[index] !== expected) {
      fail(`${filename}: column ${index + 1} expected ${expected}, got ${normalized[index] || '<blank>'}`);
    }
  }
}

function listInputFiles() {
  if (!fs.existsSync(inputDir)) return [];
  return fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function selectRecognizedFiles(filenames) {
  const byRegion = new Map();
  for (const filename of filenames) {
    const match = filename.match(filenamePattern);
    if (!match) {
      warn(`unknown filename pattern skipped: ${filename}`);
      continue;
    }
    const [, region, fileWeek] = match;
    if (!expectedRegions.includes(region)) {
      warn(`unknown region skipped: ${region} (${filename})`);
      continue;
    }
    const existing = byRegion.get(region) || [];
    existing.push({ region, fileWeek, filename });
    byRegion.set(region, existing);
  }

  const selected = [];
  for (const region of expectedRegions) {
    const entries = byRegion.get(region) || [];
    if (entries.length === 0) continue;
    entries.sort((a, b) => b.fileWeek.localeCompare(a.fileWeek) || a.filename.localeCompare(b.filename));
    selected.push(entries[0]);
    for (const skipped of entries.slice(1)) {
      warn(`duplicate ${region} weekly file skipped in favor of ${entries[0].filename}: ${skipped.filename}`);
    }
  }
  return selected;
}

function resolveInputFile(filename) {
  const candidate = path.resolve(inputDir, filename);
  const stats = fs.lstatSync(candidate);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${filename}: input must be a regular file`);
  if (stats.size > MAX_INPUT_BYTES) {
    fail(`${filename}: file size ${stats.size} exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  const resolvedInputDir = fs.realpathSync(inputDir);
  const resolvedFile = fs.realpathSync(candidate);
  const relative = path.relative(resolvedInputDir, resolvedFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${filename}: resolved path escapes the weekly input directory`);
  }
  return resolvedFile;
}

function validateSheetRowLimit(sheet, filename) {
  const fullRange = sheet['!fullref'] || sheet['!ref'];
  if (!fullRange) return;
  const endRowIndex = xlsx.utils.decode_range(fullRange).e.r;
  if (endRowIndex > MAX_DATA_ROWS) {
    fail(`${filename}: worksheet exceeds ${MAX_DATA_ROWS} data rows`);
  }
}

function readWorkbookRows(entry) {
  const filePath = resolveInputFile(entry.filename);
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    sheets: 'Sheet1',
    sheetRows: MAX_DATA_ROWS + 2
  });
  if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'Sheet1') {
    fail(`${entry.filename}: expected exactly one sheet named Sheet1`);
  }
  const sheet = workbook.Sheets.Sheet1;
  validateSheetRowLimit(sheet, entry.filename);
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false
  }).filter(isNonEmptyRow);
  if (rows.length === 0) fail(`${entry.filename}: sheet is empty`);
  if (rows.length > MAX_DATA_ROWS + 1) fail(`${entry.filename}: worksheet exceeds ${MAX_DATA_ROWS} data rows`);
  validateHeader(rows[0], entry.filename);

  return rows.slice(1).filter(isNonEmptyRow).map((row, index) => {
    const context = `${entry.filename} row ${index + 2}`;
    const record = Object.fromEntries(expectedColumns.map((column, columnIndex) => [column, row[columnIndex] ?? '']));
    const week = parseWeek(record.WEEK, context);
    const events = parseNonNegativeInteger(record.EVENTS, `${context} EVENTS`);
    const fatalities = parseNonNegativeInteger(record.FATALITIES, `${context} FATALITIES`);
    return {
      week,
      region: normalizeString(record.REGION, entry.region),
      country: normalizeString(record.COUNTRY, 'Unknown'),
      admin1: normalizeString(record.ADMIN1, 'Unknown'),
      eventType: normalizeString(record.EVENT_TYPE),
      events,
      fatalities
    };
  });
}

function sortWeeksDescending(rows) {
  return [...new Set(rows.map((row) => row.week))].sort((a, b) => b.localeCompare(a));
}

function sumRows(rows, field) {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

function topCountries(rows) {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row.country, (totals.get(row.country) || 0) + row.events);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([country]) => country);
}

function aggregateRegion(region, rows) {
  const weeksDescending = sortWeeksDescending(rows);
  if (weeksDescending.length === 0) fail(`${region}: no data rows found`);
  const latest4 = new Set(weeksDescending.slice(0, 4));
  const latest12 = new Set(weeksDescending.slice(0, 12));
  const rows4 = rows.filter((row) => latest4.has(row.week));
  const rows12 = rows.filter((row) => latest12.has(row.week));
  return {
    region,
    weekRange: [weeksDescending[weeksDescending.length - 1], weeksDescending[0]],
    rowCount: rows.length,
    eventsLast4Weeks: sumRows(rows4, 'events'),
    eventsLast12Weeks: sumRows(rows12, 'events'),
    fatalitiesLast4Weeks: sumRows(rows4, 'fatalities'),
    fatalitiesLast12Weeks: sumRows(rows12, 'fatalities'),
    civilianTargetingEventsLast4Weeks: sumRows(
      rows4.filter((row) => row.eventType === 'Violence against civilians'),
      'events'
    ),
    topCountriesByEventsLast4Weeks: topCountries(rows4),
    rows
  };
}

function clampShare(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function buildHotZones(rows, latestWeeks) {
  const latest = new Set(latestWeeks);
  const totals = new Map();
  for (const row of rows) {
    if (!latest.has(row.week)) continue;
    const key = `${row.country}\u0000${row.admin1}`;
    const current = totals.get(key) || {
      country: row.country,
      admin1: row.admin1,
      events: 0,
      fatalities: 0
    };
    current.events += row.events;
    current.fatalities += row.fatalities;
    totals.set(key, current);
  }
  return [...totals.values()]
    .sort((a, b) => b.events - a.events || b.fatalities - a.fatalities || a.country.localeCompare(b.country) || a.admin1.localeCompare(b.admin1))
    .slice(0, 10);
}

function validateLatestWeekFreshness(latestWeek) {
  const latest = new Date(`${latestWeek}T00:00:00.000Z`);
  if (!Number.isFinite(latest.getTime())) fail(`latestWeek is not parseable: ${latestWeek}`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - latest.getTime()) / 86_400_000);
  if (ageDays < 0) fail(`latestWeek ${latestWeek} is in the future`);
  if (ageDays <= 30) return;
  if (ageDays <= 90) {
    warn(`latestWeek ${latestWeek} is ${ageDays} days old; data is approaching expiration`);
    return;
  }
  fail(`latestWeek ${latestWeek} is ${ageDays} days old; data is expired`);
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

// Re-running on byte-identical inputs must not dirty the working tree: preparedAt is the only
// volatile field (stamped = now each run). When the freshly-built payload matches the existing
// file in every OTHER field, skip the write so the committed preparedAt is preserved. This also
// makes preparedAt mean "when the content last actually changed" — exactly what fetch-acled.mjs
// surfaces as lastFetchedAt and what acled:status compares against. Both payloads come from the
// same builder, so key order matches and a stringify compare is a sound deep-equal here.
function unchangedExceptPreparedAt(payload, filePath) {
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return JSON.stringify({ ...payload, preparedAt: existing.preparedAt }) === JSON.stringify(existing);
  } catch {
    return false;
  }
}

function buildPayload(aggregates, selectedFiles) {
  const allRows = aggregates.flatMap((aggregate) => aggregate.rows);
  const allWeeksDescending = sortWeeksDescending(allRows);
  if (allWeeksDescending.length === 0) fail('no WEEK values found in recognized files');
  const latestWeek = allWeeksDescending[0];
  validateLatestWeekFreshness(latestWeek);

  const globalEvents4 = aggregates.reduce((sum, item) => sum + item.eventsLast4Weeks, 0);
  const globalEvents12 = aggregates.reduce((sum, item) => sum + item.eventsLast12Weeks, 0);
  const globalFatalities4 = aggregates.reduce((sum, item) => sum + item.fatalitiesLast4Weeks, 0);
  const globalFatalities12 = aggregates.reduce((sum, item) => sum + item.fatalitiesLast12Weeks, 0);
  const globalCivilianTargeting4 = aggregates.reduce((sum, item) => sum + item.civilianTargetingEventsLast4Weeks, 0);
  const eventsDelta = globalEvents12 === 0
    ? null
    : ((globalEvents4 / 4) / (globalEvents12 / 12)) - 1;

  return {
    version: '1.0.0',
    source: 'acled-aggregated-manual-normalized-weekly',
    sourceName: 'ACLED Regional Weekly Aggregated Data',
    preparedAt: new Date().toISOString(),
    preparedBy: 'manual',
    latestWeek,
    filesIngested: aggregates.map((aggregate) => ({
      region: aggregate.region,
      filename: selectedFiles.find((entry) => entry.region === aggregate.region)?.filename || '',
      weekRange: aggregate.weekRange,
      rowCount: aggregate.rowCount
    })),
    global: {
      eventsLast4Weeks: globalEvents4,
      eventsLast12Weeks: globalEvents12,
      eventsDelta4Vs12: roundMetric(eventsDelta),
      fatalitiesLast4Weeks: globalFatalities4,
      fatalitiesLast12Weeks: globalFatalities12,
      civilianTargetingShareLast4Weeks: globalEvents4 === 0
        ? null
        : roundMetric(clampShare(globalCivilianTargeting4 / globalEvents4))
    },
    regionalLast4Weeks: aggregates.map((aggregate) => ({
      region: aggregate.region,
      events: aggregate.eventsLast4Weeks,
      fatalities: aggregate.fatalitiesLast4Weeks,
      civilianTargetingEvents: aggregate.civilianTargetingEventsLast4Weeks,
      topCountriesByEvents: aggregate.topCountriesByEventsLast4Weeks
    })),
    hotZonesLast4Weeks: buildHotZones(allRows, allWeeksDescending.slice(0, 4)),
    quality: {
      isRealData: true,
      sourceUrl: SOURCE_URL,
      licenseLevel: LICENSE_LEVEL,
      attribution: ATTRIBUTION,
      methodologyNoteZh: 'ACLED 区域周度聚合文件由 operator 手动下载,本脚本只读取本地 xlsx。指标按最新 4 周与 12 周窗口汇总事件、死亡与平民受害事件,用于观察短期冲突密度变化；它不同于 SIPRI 年度军费慢变量。',
      confidence: 0.85
    }
  };
}

function main() {
  const filenames = listInputFiles();
  if (filenames.length === 0) {
    console.log('no input files,operator has not yet placed xlsx files');
    return;
  }

  const selectedFiles = selectRecognizedFiles(filenames);
  if (selectedFiles.length === 0) {
    console.log('no input files,operator has not yet placed xlsx files');
    return;
  }

  const missingRegions = expectedRegions.filter((region) => !selectedFiles.some((entry) => entry.region === region));
  if (missingRegions.length > 0) {
    warn(`missing expected regions: ${missingRegions.join(', ')}`);
  }

  const aggregates = selectedFiles.map((entry) => aggregateRegion(entry.region, readWorkbookRows(entry)));
  const payload = buildPayload(aggregates, selectedFiles);
  const relPath = path.relative(root, outputPath);
  const summary = `regions=${aggregates.length}, latestWeek=${payload.latestWeek}`;
  if (unchangedExceptPreparedAt(payload, outputPath)) {
    console.log(`ACLED weekly sanitizer: ${relPath} unchanged (${summary}); preparedAt preserved, file not rewritten`);
    return;
  }
  writeJsonAtomic(outputPath, payload);
  console.log(`ACLED weekly sanitizer: wrote ${relPath} (${summary})`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
