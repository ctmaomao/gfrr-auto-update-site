/*
 * v28.0M-23 Market Pricing Manual Weekly Input Sanitizer Scaffold
 *
 * Reads NASDAQ CSV files from manual-artifacts/market-pricing/manual-weekly-input/
 * and produces sanitized weekly records ready for future history insertion.
 *
 * Hard guarantees enforced in code:
 *   - No network primitives
 *   - No environment-variable reads
 *   - No writes to tracked project paths
 *   - Output only to manual-artifacts/market-pricing/sanitized-output/<timestamp>/
 *   - No production-write or activation CLI flags
 *   - records are NOT written to the market-pricing history file (that is M-24)
 *
 * Inherited boundaries:
 *   - sourceApproved=false, liveFetchApproved=false, networkAllowed=false
 *   - sourceComplianceReviewed=false (Stooq compliance was deprecated; NASDAQ compliance pending)
 *   - sourceFormatVerified=false (verification on real data is M-24 acceptance step)
 *   - symbolMappingVerified=false
 *   - productionDataWriteApproved=false
 *   - historyWriteApproved=false
 *   - marketTemperatureCalculationApproved=false
 *   - readyForProductionWrite=false
 *   - Market Pricing Temperature remains waiting-for-history
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'v28.0M-23-manual-weekly-input-sanitizer-scaffold-1';
const DEFAULT_INPUT_DIR = 'manual-artifacts/market-pricing/manual-weekly-input/';
const DEFAULT_OUTPUT_BASE = 'manual-artifacts/market-pricing/sanitized-output';
const EXPECTED_HEADER = 'Date,Close/Last,Volume,Open,High,Low';
const SOURCE_VENDOR = 'nasdaq_official_manual_download';
const MIN_PLAUSIBLE_CLOSE = 80;
const MAX_PLAUSIBLE_CLOSE = 1000;
const INPUT_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.csv$/;
const US_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function emptyReasonCounts() {
  return {
    header_mismatch: 0,
    date_format_invalid: 0,
    date_out_of_range: 0,
    future_date: 0,
    close_not_numeric: 0,
    close_out_of_plausibility_bounds: 0,
    row_column_count_invalid: 0,
    file_name_invalid: 0
  };
}

export function buildSanitizationReport(options = {}) {
  const records = Array.isArray(options.records) ? options.records : [];
  const rejectionsByReason = {
    ...emptyReasonCounts(),
    ...(options.rejectionsByReason || {})
  };

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_manual_weekly_input_sanitizer_scaffold_report',
    generatedAt: options.generatedAt || nowIso(),
    status: 'manual_weekly_input_sanitizer_scaffold_report_only',
    dryRun: options.dryRun === true,
    inputDir: options.inputDir || DEFAULT_INPUT_DIR,
    outputDir: options.outputDir || null,
    filesProcessed: options.filesProcessed || 0,
    filesSkipped: options.filesSkipped || 0,
    rowsAccepted: options.rowsAccepted || 0,
    rowsRejected: options.rowsRejected || 0,
    rejectionsByReason,
    totalWeeksProduced: records.length,
    dateRange: options.dateRange || {
      earliest: records[0]?.date || null,
      latest: records.at(-1)?.date || null
    },
    earliestWeek: records[0]?.isoWeek || null,
    latestWeek: records.at(-1)?.isoWeek || null,
    fileReports: options.fileReports || [],
    records,
    apiCalled: false,
    secretsRead: false,
    productionDataWritten: false,
    historyFileModified: false,
    marketTemperatureCalculated: false,
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noHistoryWrite: true,
      noTemperatureCalculation: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    }
  };
}

function parseCliArgs(argv) {
  const options = {
    inputDir: DEFAULT_INPUT_DIR,
    outputDir: null,
    dryRun: false,
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }

    if (arg === '--input-dir') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for input directory option'), {
          exitCode: 2
        });
      }
      options.inputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--input-dir=')) {
      options.inputDir = arg.slice('--input-dir='.length);
      continue;
    }

    if (arg === '--output-dir') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for output directory option'), {
          exitCode: 2
        });
      }
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
      continue;
    }

    throw Object.assign(new Error(`Unknown sanitizer argument: ${arg}`), {
      exitCode: 2
    });
  }

  return options;
}

function assertManualArtifactPath(relativeOrAbsolutePath, expectedBase) {
  const root = process.cwd();
  const resolved = path.resolve(root, relativeOrAbsolutePath);
  const allowedRoot = path.resolve(root, expectedBase);

  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw Object.assign(
      new Error(`Path must stay under ${expectedBase}`),
      { exitCode: 2 }
    );
  }

  return resolved;
}

function toIsoDateFromUsDate(rawDate, currentYear) {
  if (!US_DATE_PATTERN.test(rawDate)) {
    return { ok: false, reason: 'date_format_invalid' };
  }

  const [monthText, dayText, yearText] = rawDate.split('/');
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    year < 2000 ||
    year > currentYear + 1
  ) {
    return { ok: false, reason: 'date_out_of_range' };
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'date_out_of_range' };
  }

  return {
    ok: true,
    isoDate: date.toISOString().slice(0, 10)
  };
}

function isoWeekFromDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function incrementReason(reportState, reason) {
  reportState.rejectionsByReason[reason] =
    (reportState.rejectionsByReason[reason] || 0) + 1;
}

function rejectRow(reportState, fileReport, lineNumber, reason, rawRow) {
  reportState.rowsRejected += 1;
  incrementReason(reportState, reason);
  fileReport.rowsRejected += 1;
  fileReport.rejections.push({
    lineNumber,
    reason,
    rawRow
  });
}

function parsePrice(value) {
  if (value === undefined || String(value).trim() === '') {
    return null;
  }

  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function parseVolume(value) {
  if (value === undefined || String(value).trim() === '') {
    return null;
  }

  const number = Number(String(value).trim());
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function parseDataRow({ row, lineNumber, sourceFile, sourceFileDate, reportState, fileReport }) {
  const columns = row.split(',').map((value) => value.trim());

  if (columns.length !== 6) {
    rejectRow(reportState, fileReport, lineNumber, 'row_column_count_invalid', row);
    return null;
  }

  const [rawDate, rawClose, rawVolume, rawOpen, rawHigh, rawLow] = columns;
  const convertedDate = toIsoDateFromUsDate(
    rawDate,
    new Date().getUTCFullYear()
  );

  if (!convertedDate.ok) {
    rejectRow(reportState, fileReport, lineNumber, convertedDate.reason, row);
    return null;
  }

  if (convertedDate.isoDate > todayIso()) {
    rejectRow(reportState, fileReport, lineNumber, 'future_date', row);
    return null;
  }

  const close = parsePrice(rawClose);
  if (close === null) {
    rejectRow(reportState, fileReport, lineNumber, 'close_not_numeric', row);
    return null;
  }

  if (close < MIN_PLAUSIBLE_CLOSE || close > MAX_PLAUSIBLE_CLOSE) {
    rejectRow(
      reportState,
      fileReport,
      lineNumber,
      'close_out_of_plausibility_bounds',
      row
    );
    return null;
  }

  const isoWeek = isoWeekFromDate(convertedDate.isoDate);

  reportState.rowsAccepted += 1;
  fileReport.rowsAccepted += 1;

  return {
    date: convertedDate.isoDate,
    isoWeek,
    close,
    sourceFile,
    sourceFileDate,
    sourceVendor: SOURCE_VENDOR,
    referenceFields: {
      open: parsePrice(rawOpen),
      high: parsePrice(rawHigh),
      low: parsePrice(rawLow),
      volume: parseVolume(rawVolume),
      notUsedForTemperature: true
    }
  };
}

function processCsvFile({ filePath, sourceFile, sourceFileDate, reportState }) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const header = lines.shift();
  const fileReport = {
    file: sourceFile,
    status: 'processed',
    rowsAccepted: 0,
    rowsRejected: 0,
    rejections: []
  };

  if (header !== EXPECTED_HEADER) {
    fileReport.status = 'skipped';
    fileReport.skipReason = 'header_mismatch';
    incrementReason(reportState, 'header_mismatch');
    reportState.filesSkipped += 1;
    reportState.fileReports.push(fileReport);
    return [];
  }

  reportState.filesProcessed += 1;

  const acceptedRecords = [];
  lines.forEach((line, index) => {
    const row = line.trim();
    if (!row) {
      return;
    }

    const record = parseDataRow({
      row,
      lineNumber: index + 2,
      sourceFile,
      sourceFileDate,
      reportState,
      fileReport
    });

    if (record) {
      acceptedRecords.push(record);
    }
  });

  reportState.fileReports.push(fileReport);
  return acceptedRecords;
}

function extractWeeklyRecords(dailyRecords) {
  const recordsByWeek = new Map();

  for (const record of dailyRecords) {
    const existing = recordsByWeek.get(record.isoWeek);
    if (!existing) {
      recordsByWeek.set(record.isoWeek, record);
      continue;
    }

    if (record.sourceFileDate > existing.sourceFileDate) {
      recordsByWeek.set(record.isoWeek, record);
      continue;
    }

    if (record.sourceFileDate === existing.sourceFileDate && record.date > existing.date) {
      recordsByWeek.set(record.isoWeek, record);
    }
  }

  return Array.from(recordsByWeek.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(({ sourceFileDate, ...record }) => record);
}

function buildDateRange(records) {
  if (records.length === 0) {
    return { earliest: null, latest: null };
  }

  return {
    earliest: records[0].date,
    latest: records.at(-1).date
  };
}

function buildOutputDir(rawOutputDir) {
  return rawOutputDir || path.join(DEFAULT_OUTPUT_BASE, timestampForPath());
}

function writeOutputFiles({ outputDir, records, report }) {
  const resolvedOutputDir = assertManualArtifactPath(outputDir, DEFAULT_OUTPUT_BASE);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.writeFileSync(
    path.join(resolvedOutputDir, 'sanitized.json'),
    `${JSON.stringify(records, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(resolvedOutputDir, 'sanitization-report.json'),
    `${JSON.stringify({ ...report, records: [] }, null, 2)}\n`,
    'utf8'
  );
  return resolvedOutputDir;
}

export function sanitizeManualWeeklyInput(options = {}) {
  const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
  const outputDir = buildOutputDir(options.outputDir);
  const resolvedInputDir = assertManualArtifactPath(inputDir, DEFAULT_INPUT_DIR);
  const reportState = {
    filesProcessed: 0,
    filesSkipped: 0,
    rowsAccepted: 0,
    rowsRejected: 0,
    rejectionsByReason: emptyReasonCounts(),
    fileReports: []
  };

  if (!fs.existsSync(resolvedInputDir)) {
    const report = buildSanitizationReport({
      dryRun: options.dryRun === true,
      inputDir,
      outputDir,
      ...reportState,
      fileReports: [
        {
          file: null,
          status: 'input_dir_missing',
          warning: 'Input directory does not exist yet.'
        }
      ],
      records: []
    });

    return {
      report,
      records: [],
      outputWritten: false,
      warning: 'Input directory does not exist yet.'
    };
  }

  const directoryEntries = fs.readdirSync(resolvedInputDir, { withFileTypes: true });
  const dailyRecords = [];

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!INPUT_FILE_PATTERN.test(entry.name)) {
      reportState.filesSkipped += 1;
      incrementReason(reportState, 'file_name_invalid');
      reportState.fileReports.push({
        file: entry.name,
        status: 'skipped',
        skipReason: 'file_name_invalid',
        rowsAccepted: 0,
        rowsRejected: 0,
        rejections: []
      });
      continue;
    }

    dailyRecords.push(
      ...processCsvFile({
        filePath: path.join(resolvedInputDir, entry.name),
        sourceFile: entry.name,
        sourceFileDate: entry.name.slice(0, 10),
        reportState
      })
    );
  }

  const records = extractWeeklyRecords(dailyRecords);
  const report = buildSanitizationReport({
    dryRun: options.dryRun === true,
    inputDir,
    outputDir,
    ...reportState,
    records,
    dateRange: buildDateRange(records)
  });

  if (options.dryRun === true) {
    return { report, records, outputWritten: false };
  }

  const resolvedOutputDir = writeOutputFiles({ outputDir, records, report });
  return {
    report: {
      ...report,
      outputDir: path.relative(process.cwd(), resolvedOutputDir).replace(/\\/g, '/')
    },
    records,
    outputWritten: true
  };
}

function printSummary(result, quiet = false) {
  if (quiet) {
    return;
  }

  const report = result.report;
  console.log('Market pricing manual weekly input sanitizer scaffold: PASS');
  console.log(`files_processed=${report.filesProcessed}`);
  console.log(`files_skipped=${report.filesSkipped}`);
  console.log(`rows_accepted=${report.rowsAccepted}`);
  console.log(`rows_rejected=${report.rowsRejected}`);
  console.log(`weeks_produced=${report.totalWeeksProduced}`);
  console.log(`earliest_week=${report.earliestWeek || 'none'}`);
  console.log(`latest_week=${report.latestWeek || 'none'}`);
  console.log(`output_dir=${result.outputWritten ? report.outputDir : 'none'}`);
  if (result.warning) {
    console.log(`warning=${result.warning}`);
  }
}

function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = sanitizeManualWeeklyInput(options);
    printSummary(result, options.quiet);
  } catch (error) {
    console.error('Market pricing manual weekly input sanitizer scaffold: FAIL');
    console.error(error.message);
    process.exitCode = error.exitCode || 3;
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
