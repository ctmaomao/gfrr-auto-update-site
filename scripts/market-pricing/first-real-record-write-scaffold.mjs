/*
 * v28.0M-24 Market Pricing First Real Record Write Scaffold
 *
 * Reads sanitized weekly records from manual-artifacts/market-pricing/sanitized-output/<latest>/
 * and writes them to data/market-pricing-history.json under two-stage manual
 * confirmation.
 *
 * Stage 1 (default): --dry-run-commit. Preview only. No file write.
 * Stage 2 (explicit): --commit-to-history. Writes to data/market-pricing-history.json
 *                     atomically (.tmp + rename).
 *
 * Hard guarantees:
 *   - No network calls
 *   - No environment-variable reads
 *   - No writes outside data/market-pricing-history.json
 *   - 5 sanity checks must all pass before any write
 *   - Idempotent: same input -> identical output after first commit
 *   - No MA60, std, z-score calculation (that is M-26)
 *   - No frontend modification (that is M-27)
 *   - No scoring, decision, execution change
 *
 * CI MUST NOT invoke --commit-to-history. The npm script is manual-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_SANITIZED_OUTPUT_BASE = 'manual-artifacts/market-pricing/sanitized-output';
const DEFAULT_HISTORY_FILE = 'data/market-pricing-history.json';
const SOURCE_VENDOR = 'nasdaq_official_manual_download';
const MIN_RECORD_COUNT = 50;
const MIN_CLOSE = 80;
const MAX_CLOSE = 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/;
const SANITIZED_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const HISTORY_KEY_ORDER = [
  'contractVersion',
  'schemaVersion',
  'kind',
  'generatedAt',
  'status',
  'sourceVendor',
  'recordsCount'
];

const SANITY_CHECKS = [
  'sanity check 1: sanitized_input_valid_json',
  'sanity check 2: record_count_minimum',
  'sanity check 3: required_fields_present',
  'sanity check 4: strict_ascending_unique_per_week',
  'sanity check 5: plausibility_bounds_and_no_future'
];

function toProjectRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFailure({
  dryRun,
  inputDir,
  sanitizedFile,
  historyFile,
  failedCheck,
  exitCode,
  reason
}) {
  return {
    ok: false,
    dryRun,
    writePerformed: false,
    inputDir,
    sanitizedFile,
    historyFile,
    failedCheck,
    exitCode,
    reason,
    noWritePerformed: true,
    sanityChecks: SANITY_CHECKS,
    boundaries: {
      noNetworkCall: true,
      noEnvironmentRead: true,
      noFrontendChange: true,
      noScoringChange: true,
      noDecisionChange: true,
      noExecutionChange: true,
      noPositionChange: true,
      noTemperatureCalculation: true
    }
  };
}

function parseCliArgs(argv) {
  const options = {
    sanitizedInput: null,
    historyFile: DEFAULT_HISTORY_FILE,
    dryRunCommit: false,
    commitToHistory: false,
    quiet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--sanitized-input') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --sanitized-input'), { exitCode: 2 });
      }
      options.sanitizedInput = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--sanitized-input=')) {
      options.sanitizedInput = arg.slice('--sanitized-input='.length);
      continue;
    }

    if (arg === '--history-file') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw Object.assign(new Error('Missing value for --history-file'), { exitCode: 2 });
      }
      options.historyFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--history-file=')) {
      options.historyFile = arg.slice('--history-file='.length);
      continue;
    }

    if (arg === '--dry-run-commit') {
      options.dryRunCommit = true;
      continue;
    }

    if (arg === '--commit-to-history') {
      options.commitToHistory = true;
      continue;
    }

    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }

    throw Object.assign(new Error(`Unknown first real record write argument: ${arg}`), {
      exitCode: 2
    });
  }

  return {
    sanitizedInput: options.sanitizedInput,
    historyFile: options.historyFile,
    dryRun: options.dryRunCommit || !options.commitToHistory,
    quiet: options.quiet
  };
}

function resolveHistoryFile(rawHistoryFile) {
  const resolved = path.resolve(ROOT, rawHistoryFile || DEFAULT_HISTORY_FILE);
  const required = path.resolve(ROOT, DEFAULT_HISTORY_FILE);

  if (resolved !== required) {
    throw Object.assign(
      new Error(`History file target must be ${DEFAULT_HISTORY_FILE}`),
      { exitCode: 2 }
    );
  }

  return resolved;
}

function findLatestSanitizedInputDir(rawSanitizedInput) {
  if (rawSanitizedInput) {
    return {
      inputDir: path.resolve(ROOT, rawSanitizedInput),
      missingReason: null
    };
  }

  const baseDir = path.resolve(ROOT, DEFAULT_SANITIZED_OUTPUT_BASE);
  if (!fs.existsSync(baseDir)) {
    return {
      inputDir: null,
      missingReason: `${DEFAULT_SANITIZED_OUTPUT_BASE} does not exist`
    };
  }

  const candidates = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SANITIZED_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (candidates.length === 0) {
    return {
      inputDir: null,
      missingReason: `no timestamped sanitized-output directories under ${DEFAULT_SANITIZED_OUTPUT_BASE}`
    };
  }

  return {
    inputDir: path.join(baseDir, candidates.at(-1)),
    missingReason: null
  };
}

function readSanitizedRecords(inputDir) {
  const sanitizedFile = inputDir ? path.join(inputDir, 'sanitized.json') : null;

  if (!sanitizedFile || !fs.existsSync(sanitizedFile)) {
    return {
      ok: false,
      sanitizedFile,
      reason: 'sanitized_input_not_valid_json'
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(sanitizedFile, 'utf8'));
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        sanitizedFile,
        reason: 'sanitized_input_not_valid_json'
      };
    }

    return {
      ok: true,
      sanitizedFile,
      records: parsed
    };
  } catch {
    return {
      ok: false,
      sanitizedFile,
      reason: 'sanitized_input_not_valid_json'
    };
  }
}

function normalizeRecord(record) {
  const normalized = {
    date: record.date,
    isoWeek: record.isoWeek,
    close: record.close
  };

  if (Object.hasOwn(record, 'sourceVendor')) {
    normalized.sourceVendor = record.sourceVendor;
  }

  if (Object.hasOwn(record, 'sourceFile')) {
    normalized.sourceFile = record.sourceFile;
  }

  if (record.referenceFields && typeof record.referenceFields === 'object' && !Array.isArray(record.referenceFields)) {
    normalized.referenceFields = {};
    for (const key of ['open', 'high', 'low', 'volume', 'notUsedForTemperature']) {
      if (Object.hasOwn(record.referenceFields, key)) {
        normalized.referenceFields[key] = record.referenceFields[key];
      }
    }
  }

  return normalized;
}

function validateRecords(rawRecords, currentTodayIso) {
  if (rawRecords.length < MIN_RECORD_COUNT) {
    return {
      ok: false,
      failedCheck: 2,
      exitCode: 12,
      reason: `record_count_too_low: got ${rawRecords.length} records, minimum is ${MIN_RECORD_COUNT}`
    };
  }

  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = rawRecords[index];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return {
        ok: false,
        failedCheck: 3,
        exitCode: 13,
        reason: `record_field_invalid: record at index ${index} missing/invalid date`
      };
    }

    if (!Object.hasOwn(record, 'date') || typeof record.date !== 'string' || !DATE_PATTERN.test(record.date)) {
      return {
        ok: false,
        failedCheck: 3,
        exitCode: 13,
        reason: `record_field_invalid: record at index ${index} missing/invalid date`
      };
    }

    if (!Object.hasOwn(record, 'isoWeek') || typeof record.isoWeek !== 'string' || !ISO_WEEK_PATTERN.test(record.isoWeek)) {
      return {
        ok: false,
        failedCheck: 3,
        exitCode: 13,
        reason: `record_field_invalid: record at index ${index} missing/invalid isoWeek`
      };
    }

    if (!Object.hasOwn(record, 'close') || typeof record.close !== 'number' || !Number.isFinite(record.close)) {
      return {
        ok: false,
        failedCheck: 3,
        exitCode: 13,
        reason: `record_field_invalid: record at index ${index} missing/invalid close`
      };
    }
  }

  const seenWeeks = new Set();
  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = rawRecords[index];
    if (index > 0 && record.date <= rawRecords[index - 1].date) {
      return {
        ok: false,
        failedCheck: 4,
        exitCode: 14,
        reason: `record_order_invalid: regression or duplicate at index ${index}`
      };
    }

    if (seenWeeks.has(record.isoWeek)) {
      return {
        ok: false,
        failedCheck: 4,
        exitCode: 14,
        reason: `record_order_invalid: regression or duplicate at index ${index}`
      };
    }
    seenWeeks.add(record.isoWeek);
  }

  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = rawRecords[index];
    if (record.close < MIN_CLOSE || record.close > MAX_CLOSE) {
      return {
        ok: false,
        failedCheck: 5,
        exitCode: 15,
        reason: `record_value_out_of_bounds: index ${index}, value ${record.close}`
      };
    }

    if (record.date > currentTodayIso) {
      return {
        ok: false,
        failedCheck: 5,
        exitCode: 15,
        reason: `future_dated: index ${index}, date ${record.date}`
      };
    }
  }

  return {
    ok: true,
    records: rawRecords.map(normalizeRecord)
  };
}

function sameRecordsAlreadyCommitted(currentHistory, records) {
  if (
    currentHistory.status !== 'has_history' ||
    currentHistory.sourceVendor !== SOURCE_VENDOR ||
    currentHistory.recordsCount !== records.length ||
    !Array.isArray(currentHistory.records)
  ) {
    return false;
  }

  return JSON.stringify(currentHistory.records.map(normalizeRecord)) === JSON.stringify(records);
}

function orderHistoryObject(source) {
  const result = {};
  const ordered = new Set([...HISTORY_KEY_ORDER, 'records']);

  for (const key of HISTORY_KEY_ORDER) {
    if (Object.hasOwn(source, key)) {
      result[key] = source[key];
    }
  }

  for (const key of Object.keys(source)) {
    if (!ordered.has(key)) {
      result[key] = source[key];
    }
  }

  if (Object.hasOwn(source, 'records')) {
    result.records = source.records;
  }

  return result;
}

function buildNextHistory({ currentHistory, records, generatedAt }) {
  const next = {
    ...cloneJson(currentHistory),
    generatedAt,
    status: 'has_history',
    sourceVendor: SOURCE_VENDOR,
    recordsCount: records.length,
    records
  };

  return orderHistoryObject(next);
}

function serializeHistory(history) {
  return `${JSON.stringify(history, null, 2)}\n`;
}

export function buildFirstRealRecordWriteReport(options = {}) {
  const dryRun = options.dryRun !== false;
  const historyFile = resolveHistoryFile(options.historyFile || DEFAULT_HISTORY_FILE);
  const inputLookup = findLatestSanitizedInputDir(options.sanitizedInput);
  const inputDir = inputLookup.inputDir;
  const historyFileDisplay = toProjectRelative(historyFile);
  const inputDirDisplay = inputDir ? toProjectRelative(inputDir) : null;

  if (!inputDir) {
    return buildFailure({
      dryRun,
      inputDir: inputDirDisplay,
      sanitizedFile: null,
      historyFile: historyFileDisplay,
      failedCheck: 1,
      exitCode: 11,
      reason: `sanitized_input_not_valid_json: ${inputLookup.missingReason}`
    });
  }

  const inputResult = readSanitizedRecords(inputDir);
  const sanitizedFileDisplay = inputResult.sanitizedFile ? toProjectRelative(inputResult.sanitizedFile) : null;
  if (!inputResult.ok) {
    return buildFailure({
      dryRun,
      inputDir: inputDirDisplay,
      sanitizedFile: sanitizedFileDisplay,
      historyFile: historyFileDisplay,
      failedCheck: 1,
      exitCode: 11,
      reason: inputResult.reason
    });
  }

  const sanityResult = validateRecords(inputResult.records, options.todayIso || todayIso());
  if (!sanityResult.ok) {
    return buildFailure({
      dryRun,
      inputDir: inputDirDisplay,
      sanitizedFile: sanitizedFileDisplay,
      historyFile: historyFileDisplay,
      failedCheck: sanityResult.failedCheck,
      exitCode: sanityResult.exitCode,
      reason: sanityResult.reason
    });
  }

  let currentHistory;
  try {
    currentHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch (error) {
    throw Object.assign(new Error(`Unable to read ${historyFileDisplay}: ${error.message}`), {
      exitCode: 3
    });
  }

  const records = sanityResult.records;
  const generatedAt = sameRecordsAlreadyCommitted(currentHistory, records)
    ? currentHistory.generatedAt || options.generatedAt || nowIso()
    : options.generatedAt || nowIso();
  const nextHistory = buildNextHistory({ currentHistory, records, generatedAt });

  return {
    ok: true,
    dryRun,
    writePerformed: false,
    inputDir: inputDirDisplay,
    sanitizedFile: sanitizedFileDisplay,
    historyFile: historyFileDisplay,
    sanityChecks: SANITY_CHECKS,
    sanityCheckCount: SANITY_CHECKS.length,
    recordsCount: records.length,
    earliestDate: records[0].date,
    latestDate: records.at(-1).date,
    currentStatus: currentHistory.status ?? null,
    plannedStatus: 'has_history',
    currentGeneratedAt: currentHistory.generatedAt ?? null,
    plannedGeneratedAt: generatedAt,
    sourceVendor: SOURCE_VENDOR,
    previewFirst3: records.slice(0, 3),
    previewLast3: records.slice(-3),
    nextHistory,
    serializedHistory: serializeHistory(nextHistory),
    noWritePerformed: true,
    boundaries: {
      noNetworkCall: true,
      noEnvironmentRead: true,
      noFrontendChange: true,
      noScoringChange: true,
      noDecisionChange: true,
      noExecutionChange: true,
      noPositionChange: true,
      noTemperatureCalculation: true
    }
  };
}

function writeHistoryAtomically(report) {
  const historyPath = path.resolve(ROOT, report.historyFile);
  const tmpPath = `${historyPath}.tmp`;

  try {
    fs.writeFileSync(tmpPath, report.serializedHistory, 'utf8');
    fs.renameSync(tmpPath, historyPath);
  } catch (error) {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
    throw Object.assign(error, { exitCode: 3 });
  }
}

function printFailure(report) {
  console.error('Market pricing first real record write scaffold: FAIL');
  console.error(`failed_check=${report.failedCheck}`);
  console.error(`reason=${report.reason}`);
  console.error('no_write_performed=true');
}

function printDryRun(report) {
  console.log('Market pricing first real record write scaffold: DRY-RUN OK');
  console.log(`would_write_records=${report.recordsCount}`);
  console.log('would_write_status="has_history"');
  console.log(`earliest_date=${report.earliestDate}`);
  console.log(`latest_date=${report.latestDate}`);
  console.log(`planned_generatedAt=${report.plannedGeneratedAt}`);
  console.log(`preview_first_3=${JSON.stringify(report.previewFirst3)}`);
  console.log(`preview_last_3=${JSON.stringify(report.previewLast3)}`);
  console.log(`history_file=${report.historyFile}`);
  console.log('(no write performed)');
}

function printCommitted(report) {
  console.log('Market pricing first real record write scaffold: COMMITTED');
  console.log(`wrote_records=${report.recordsCount}`);
  console.log('wrote_status="has_history"');
  console.log(`earliest_date=${report.earliestDate}`);
  console.log(`latest_date=${report.latestDate}`);
  console.log(`history_file=${report.historyFile}`);
  console.log('(file written atomically via .tmp + rename)');
}

function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const report = buildFirstRealRecordWriteReport(options);

    if (!report.ok) {
      if (!options.quiet) {
        printFailure(report);
      }
      process.exitCode = report.exitCode;
      return;
    }

    if (report.dryRun) {
      if (!options.quiet) {
        printDryRun(report);
      }
      return;
    }

    writeHistoryAtomically(report);
    if (!options.quiet) {
      printCommitted(report);
    }
  } catch (error) {
    console.error('Market pricing first real record write scaffold: FAIL');
    console.error('failed_check=fatal_io_or_cli');
    console.error(`reason=${error.message}`);
    console.error('no_write_performed=true');
    process.exitCode = error.exitCode || 3;
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
