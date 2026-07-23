import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as xlsx from 'xlsx';
import { assertWorksheetDimensions, preflightXlsxInputs } from './xlsx-input-guard.mjs';

xlsx.set_fs(fs);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const inputDir = path.join(root, 'manual-artifacts', 'world-order', 'acled-input', 'monthly');
const outputPath = path.join(root, 'config', 'world-order-acled-global-monthly.json');

const SOURCE = 'acled-aggregated-manual-normalized-monthly';
const SOURCE_NAME = 'ACLED Global Monthly Aggregated Data';
const SOURCE_URL = 'https://acleddata.com/conflict-data/download-data-files';
const LICENSE_LEVEL = 'open';
const ATTRIBUTION = 'ACLED (Armed Conflict Location & Event Data) — https://acleddata.com';
const MAX_INPUT_BYTES = 1 * 1024 * 1024;
const MAX_BATCH_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_DATA_ROWS = 50_000;
const MAX_DATA_COLUMNS = 8;
const ZIP_LIMITS = Object.freeze({
  maxEntries: 64,
  maxEntryUncompressedBytes: 8 * 1024 * 1024,
  maxUncompressedBytes: 12 * 1024 * 1024,
  maxCompressionRatio: 32,
});

const ESCALATION_BASELINE_THRESHOLD = 50;
const TOP_RANK_LIMIT = 10;

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_INDEX = new Map(MONTH_ORDER.map((name, idx) => [name, idx + 1]));
const MONTH_SHORT_BY_NUMBER = new Map([
  [1, 'Jan'], [2, 'Feb'], [3, 'Mar'], [4, 'Apr'], [5, 'May'], [6, 'Jun'],
  [7, 'Jul'], [8, 'Aug'], [9, 'Sep'], [10, 'Oct'], [11, 'Nov'], [12, 'Dec']
]);
const MONTH_NUMBER_BY_SHORT = new Map([...MONTH_SHORT_BY_NUMBER.entries()].map(([n, s]) => [s, n]));

const fileSpecs = [
  {
    slug: 'demonstration_events_by_country-year',
    metric: 'demonstrations',
    granularity: 'country-year',
    columns: ['COUNTRY', 'YEAR', 'EVENTS'],
    valueColumn: 'EVENTS'
  },
  {
    slug: 'events_targeting_civilians_by_country-year',
    metric: 'civilianTargeting',
    granularity: 'country-year',
    columns: ['COUNTRY', 'YEAR', 'EVENTS'],
    valueColumn: 'EVENTS'
  },
  {
    slug: 'political_violence_events_by_country-month-year',
    metric: 'politicalViolenceMonthly',
    granularity: 'country-month-year',
    columns: ['COUNTRY', 'MONTH', 'YEAR', 'EVENTS'],
    valueColumn: 'EVENTS'
  },
  {
    slug: 'political_violence_events_by_country-year',
    metric: 'politicalViolence',
    granularity: 'country-year',
    columns: ['COUNTRY', 'YEAR', 'EVENTS'],
    valueColumn: 'EVENTS'
  },
  {
    slug: 'reported_civilian_fatalities_by_country-year',
    metric: 'civilianFatalities',
    granularity: 'country-year',
    columns: ['COUNTRY', 'YEAR', 'FATALITIES'],
    valueColumn: 'FATALITIES'
  },
  {
    slug: 'reported_fatalities_by_country-year',
    metric: 'fatalities',
    granularity: 'country-year',
    columns: ['COUNTRY', 'YEAR', 'FATALITIES'],
    valueColumn: 'FATALITIES'
  }
];

const slugByName = new Map(fileSpecs.map((spec) => [spec.slug, spec]));
const filenamePattern = /^number_of_(?<slug>[a-z_-]+)_as-of-(?<day>\d{2})(?<mon>[A-Z][a-z]{2})(?<year>\d{4})\.xlsx$/u;

function warn(message) {
  console.warn(`ACLED monthly sanitizer warning: ${message}`);
}

function fail(message) {
  throw new Error(`ACLED monthly sanitizer failed: ${message}`);
}

function isNonEmptyRow(row) {
  return Array.isArray(row) && row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function normalizeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function parseNonNegativeInteger(value, context) {
  const text = String(value ?? '').replace(/,/gu, '').trim();
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    fail(`${context}: expected non-negative integer, got ${value}`);
  }
  return parsed;
}

function parseYear(value, context) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1990 || parsed > 2100) {
    fail(`${context}: YEAR must be integer in [1990, 2100], got ${value}`);
  }
  return parsed;
}

function parseMonthName(value, context) {
  const text = String(value ?? '').trim();
  if (!MONTH_INDEX.has(text)) fail(`${context}: MONTH must be English month name, got ${value}`);
  return MONTH_INDEX.get(text);
}

function validateHeader(header, filename, expected) {
  const normalized = header.map((value) => String(value ?? '').trim());
  if (normalized.length !== expected.length) {
    fail(`${filename}: expected ${expected.length} columns, got ${normalized.length}`);
  }
  for (const [index, name] of expected.entries()) {
    if (normalized[index] !== name) {
      fail(`${filename}: column ${index + 1} expected ${name}, got ${normalized[index] || '<blank>'}`);
    }
  }
}

function asOfFromMatch(match) {
  const day = Number(match.groups.day);
  const year = Number(match.groups.year);
  const monthNumber = MONTH_NUMBER_BY_SHORT.get(match.groups.mon);
  if (!monthNumber || day < 1 || day > 31) fail(`unparseable as-of date in filename: ${match[0]}`);
  const iso = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) fail(`invalid as-of date: ${iso}`);
  return iso;
}

function listInputFiles() {
  if (!fs.existsSync(inputDir)) return [];
  return fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function selectRecognizedFiles(filenames) {
  const bySlug = new Map();
  for (const filename of filenames) {
    const match = filename.match(filenamePattern);
    if (!match) {
      warn(`unknown filename pattern skipped: ${filename}`);
      continue;
    }
    const spec = slugByName.get(match.groups.slug);
    if (!spec) {
      warn(`unknown slug skipped: ${match.groups.slug} (${filename})`);
      continue;
    }
    const asOfDate = asOfFromMatch(match);
    const existing = bySlug.get(spec.slug) || [];
    existing.push({ spec, filename, asOfDate });
    bySlug.set(spec.slug, existing);
  }

  const selected = [];
  for (const spec of fileSpecs) {
    const entries = bySlug.get(spec.slug) || [];
    if (entries.length === 0) continue;
    entries.sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || a.filename.localeCompare(b.filename));
    selected.push(entries[0]);
    for (const skipped of entries.slice(1)) {
      warn(`duplicate ${spec.slug} file skipped in favor of ${entries[0].filename}: ${skipped.filename}`);
    }
  }
  return selected;
}

function readSheetRows(entry, inputFiles) {
  const filePath = inputFiles.get(entry.filename);
  const workbook = xlsx.readFile(filePath, {
    cellDates: false,
    sheets: 'Sheet1',
    sheetRows: MAX_DATA_ROWS + 2
  });
  if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'Sheet1') {
    fail(`${entry.filename}: expected exactly one sheet named Sheet1`);
  }
  const sheet = workbook.Sheets.Sheet1;
  assertWorksheetDimensions(sheet, entry.filename, { maxDataRows: MAX_DATA_ROWS, maxColumns: MAX_DATA_COLUMNS });
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false
  }).filter(isNonEmptyRow);
  if (rows.length === 0) fail(`${entry.filename}: sheet is empty`);
  if (rows.length > MAX_DATA_ROWS + 1) fail(`${entry.filename}: worksheet exceeds ${MAX_DATA_ROWS} data rows`);
  validateHeader(rows[0], entry.filename, entry.spec.columns);
  return rows.slice(1).filter(isNonEmptyRow);
}

function parseYearlyRows(entry, inputFiles) {
  const rows = readSheetRows(entry, inputFiles);
  const valueColumnIndex = entry.spec.columns.indexOf(entry.spec.valueColumn);
  return rows.map((row, index) => {
    const context = `${entry.filename} row ${index + 2}`;
    return {
      country: normalizeString(row[0], 'Unknown'),
      year: parseYear(row[1], context),
      value: parseNonNegativeInteger(row[valueColumnIndex], `${context} ${entry.spec.valueColumn}`)
    };
  });
}

function parseMonthlyRows(entry, inputFiles) {
  const rows = readSheetRows(entry, inputFiles);
  const valueColumnIndex = entry.spec.columns.indexOf(entry.spec.valueColumn);
  return rows.map((row, index) => {
    const context = `${entry.filename} row ${index + 2}`;
    return {
      country: normalizeString(row[0], 'Unknown'),
      month: parseMonthName(row[1], context),
      year: parseYear(row[2], context),
      value: parseNonNegativeInteger(row[valueColumnIndex], `${context} ${entry.spec.valueColumn}`)
    };
  });
}

function sumByYear(rows, year) {
  return rows
    .filter((row) => row.year === year)
    .reduce((sum, row) => sum + row.value, 0);
}

function priorYearsAverage(rows, latestFullYear, lookback) {
  const years = [];
  for (let i = 1; i <= lookback; i += 1) years.push(latestFullYear - i);
  const sums = years.map((year) => sumByYear(rows, year));
  if (sums.every((value) => value === 0)) return null;
  return sums.reduce((acc, value) => acc + value, 0) / lookback;
}

function deriveLatestFullYear(rows, asOfDateIso) {
  const asOfYear = Number(asOfDateIso.slice(0, 4));
  const years = new Set(rows.map((row) => row.year));
  let candidate = asOfYear - 1;
  if (!years.has(candidate)) {
    candidate = Math.max(...years);
    warn(`latestFullYear fell back to ${candidate} because ${asOfYear - 1} not present`);
  }
  return candidate;
}

function clampShare(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function topEscalatingCountries(rows, latestFullYear) {
  const countries = new Map();
  for (const row of rows) {
    if (![latestFullYear, latestFullYear - 1, latestFullYear - 2, latestFullYear - 3].includes(row.year)) continue;
    const current = countries.get(row.country) || { latest: 0, priorSum: 0, priorCount: 0 };
    if (row.year === latestFullYear) current.latest += row.value;
    else {
      current.priorSum += row.value;
      current.priorCount += 1;
    }
    countries.set(row.country, current);
  }
  const entries = [];
  for (const [country, agg] of countries.entries()) {
    if (agg.latest < ESCALATION_BASELINE_THRESHOLD) continue;
    const priorAvg = agg.priorCount > 0 ? agg.priorSum / 3 : null;
    if (priorAvg === null || priorAvg <= 0) continue;
    const delta = agg.latest / priorAvg - 1;
    entries.push({
      country,
      latestFullYearEvents: agg.latest,
      prior3YearAverageEvents: roundMetric(priorAvg),
      yoyDelta: roundMetric(delta)
    });
  }
  return entries
    .sort((a, b) => (b.yoyDelta ?? -Infinity) - (a.yoyDelta ?? -Infinity) || a.country.localeCompare(b.country))
    .slice(0, TOP_RANK_LIMIT);
}

function topFatalitiesCountries(rows, latestFullYear) {
  const list = rows
    .filter((row) => row.year === latestFullYear && row.value > 0)
    .map((row) => ({ country: row.country, fatalities: row.value }))
    .sort((a, b) => b.fatalities - a.fatalities || a.country.localeCompare(b.country))
    .slice(0, TOP_RANK_LIMIT);
  return list;
}

function buildMonthlyTrend(rows) {
  if (rows.length === 0) return null;
  const totals = new Map();
  for (const row of rows) {
    const key = row.year * 100 + row.month;
    totals.set(key, (totals.get(key) || 0) + row.value);
  }
  const sortedKeys = [...totals.keys()].sort((a, b) => b - a);
  const last12 = sortedKeys.slice(0, 12);
  const prior12 = sortedKeys.slice(12, 24);
  if (last12.length < 12) {
    warn(`monthly trend last12 window incomplete (have ${last12.length} months)`);
  }
  const last12Sum = last12.reduce((acc, key) => acc + totals.get(key), 0);
  const prior12Sum = prior12.reduce((acc, key) => acc + totals.get(key), 0);
  const delta = prior12Sum === 0 ? null : last12Sum / prior12Sum - 1;
  function keyToLabel(key) {
    const year = Math.floor(key / 100);
    const month = key % 100;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  return {
    latest12mWindow: last12.length === 0 ? null : [keyToLabel(last12[last12.length - 1]), keyToLabel(last12[0])],
    prior12mWindow: prior12.length === 0 ? null : [keyToLabel(prior12[prior12.length - 1]), keyToLabel(prior12[0])],
    latest12mEvents: last12Sum,
    prior12mEvents: prior12Sum,
    latest12mVsPrior12mDelta: roundMetric(delta)
  };
}

function validateAsOfFreshness(asOfDateIso) {
  const asOf = new Date(`${asOfDateIso}T00:00:00.000Z`);
  if (!Number.isFinite(asOf.getTime())) fail(`asOfDate is not parseable: ${asOfDateIso}`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - asOf.getTime()) / 86_400_000);
  if (ageDays < 0) fail(`asOfDate ${asOfDateIso} is in the future`);
  if (ageDays <= 35) return ageDays;
  if (ageDays <= 60) {
    warn(`asOfDate ${asOfDateIso} is aging (${ageDays} days old)`);
    return ageDays;
  }
  if (ageDays <= 120) {
    warn(`asOfDate ${asOfDateIso} is stale (${ageDays} days old)`);
    return ageDays;
  }
  if (ageDays <= 180) {
    warn(`asOfDate ${asOfDateIso} is approaching expiration (${ageDays} days old)`);
    return ageDays;
  }
  fail(`asOfDate ${asOfDateIso} is ${ageDays} days old; data is expired`);
  return ageDays;
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

function buildPayload(parsedByMetric, selectedFiles) {
  const asOfDates = selectedFiles.map((entry) => entry.asOfDate);
  const asOfDate = asOfDates.sort()[asOfDates.length - 1];
  validateAsOfFreshness(asOfDate);

  const politicalViolence = parsedByMetric.get('politicalViolence') ?? [];
  const demonstrations = parsedByMetric.get('demonstrations') ?? [];
  const civilianTargeting = parsedByMetric.get('civilianTargeting') ?? [];
  const fatalities = parsedByMetric.get('fatalities') ?? [];
  const civilianFatalities = parsedByMetric.get('civilianFatalities') ?? [];
  const politicalViolenceMonthly = parsedByMetric.get('politicalViolenceMonthly') ?? [];

  const latestFullYear = deriveLatestFullYear(politicalViolence.length > 0 ? politicalViolence : fatalities, asOfDate);

  const pvLatest = sumByYear(politicalViolence, latestFullYear);
  const pvPrior3yAvg = priorYearsAverage(politicalViolence, latestFullYear, 3);
  const pvYoyDelta = pvPrior3yAvg && pvPrior3yAvg > 0 ? pvLatest / pvPrior3yAvg - 1 : null;

  const civTargetingLatest = sumByYear(civilianTargeting, latestFullYear);
  const civTargetingShare = pvLatest > 0 ? clampShare(civTargetingLatest / pvLatest) : null;

  const fatalitiesLatest = sumByYear(fatalities, latestFullYear);
  const civilianFatalitiesLatest = sumByYear(civilianFatalities, latestFullYear);
  const civilianFatalitiesShare = fatalitiesLatest > 0 ? clampShare(civilianFatalitiesLatest / fatalitiesLatest) : null;

  const demonstrationsLatest = sumByYear(demonstrations, latestFullYear);

  const filesIngestedSummary = selectedFiles.map((entry) => {
    const parsed = parsedByMetric.get(entry.spec.metric) ?? [];
    const years = parsed.length > 0 ? [...new Set(parsed.map((row) => row.year))].sort((a, b) => a - b) : [];
    return {
      slug: entry.spec.slug,
      metric: entry.spec.metric,
      granularity: entry.spec.granularity,
      filename: entry.filename,
      asOfDate: entry.asOfDate,
      yearRange: years.length > 0 ? [years[0], years[years.length - 1]] : null,
      rowCount: parsed.length
    };
  });

  return {
    version: '1.0.0',
    source: SOURCE,
    sourceName: SOURCE_NAME,
    preparedAt: new Date().toISOString(),
    preparedBy: 'manual',
    asOfDate,
    latestFullYear,
    filesIngested: filesIngestedSummary,
    global: {
      politicalViolenceEventsLatestFullYear: pvLatest,
      politicalViolenceEventsPrior3YearAverage: roundMetric(pvPrior3yAvg),
      politicalViolenceYoyDelta: roundMetric(pvYoyDelta),
      demonstrationsLatestFullYear: demonstrationsLatest,
      civilianTargetingEventsLatestFullYear: civTargetingLatest,
      civilianTargetingShareLatestFullYear: roundMetric(civTargetingShare),
      fatalitiesLatestFullYear: fatalitiesLatest,
      civilianFatalitiesLatestFullYear: civilianFatalitiesLatest,
      civilianFatalitiesShareLatestFullYear: roundMetric(civilianFatalitiesShare)
    },
    monthlyTrend: buildMonthlyTrend(politicalViolenceMonthly),
    topEscalatingCountries: topEscalatingCountries(politicalViolence, latestFullYear),
    topFatalitiesCountries: topFatalitiesCountries(fatalities, latestFullYear),
    quality: {
      isRealData: true,
      sourceUrl: SOURCE_URL,
      licenseLevel: LICENSE_LEVEL,
      attribution: ATTRIBUTION,
      methodologyNoteZh: 'ACLED 全球年度/月度聚合由 operator 手动下载，本脚本只读取本地 xlsx。指标基于最近完整年份与 prior 3 年均值，配合 country-month-year 文件做 last-12m vs prior-12m 趋势，用于观察慢变量的年度结构性变化，与 weekly 高频信号互补。',
      confidence: 0.85
    }
  };
}

function main() {
  const filenames = listInputFiles();
  if (filenames.length === 0) {
    console.log('no input files, operator has not yet placed monthly xlsx files');
    return;
  }

  const selectedFiles = selectRecognizedFiles(filenames);
  if (selectedFiles.length === 0) {
    console.log('no recognized files, operator has not yet placed monthly xlsx files');
    return;
  }

  const missingSlugs = fileSpecs
    .map((spec) => spec.slug)
    .filter((slug) => !selectedFiles.some((entry) => entry.spec.slug === slug));
  if (missingSlugs.length > 0) {
    fail(`missing required monthly slugs (all 6 must be present for committed JSON): ${missingSlugs.join(', ')}`);
  }

  const inputFiles = preflightXlsxInputs({
    inputDir,
    filenames: selectedFiles.map((entry) => entry.filename),
    maxInputBytes: MAX_INPUT_BYTES,
    maxBatchInputBytes: MAX_BATCH_INPUT_BYTES,
    maxBatchUncompressedBytes: MAX_BATCH_UNCOMPRESSED_BYTES,
    zipLimits: ZIP_LIMITS,
  });
  const parsedByMetric = new Map();
  for (const entry of selectedFiles) {
    const rows = entry.spec.granularity === 'country-month-year'
      ? parseMonthlyRows(entry, inputFiles)
      : parseYearlyRows(entry, inputFiles);
    parsedByMetric.set(entry.spec.metric, rows);
  }

  const payload = buildPayload(parsedByMetric, selectedFiles);
  const relPath = path.relative(root, outputPath);
  const summary = `files=${selectedFiles.length}, asOfDate=${payload.asOfDate}, latestFullYear=${payload.latestFullYear}, pvEvents=${payload.global.politicalViolenceEventsLatestFullYear}`;
  if (unchangedExceptPreparedAt(payload, outputPath)) {
    console.log(`ACLED monthly sanitizer: ${relPath} unchanged (${summary}); preparedAt preserved, file not rewritten`);
    return;
  }
  writeJsonAtomic(outputPath, payload);
  console.log(`ACLED monthly sanitizer: wrote ${relPath} (${summary})`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
