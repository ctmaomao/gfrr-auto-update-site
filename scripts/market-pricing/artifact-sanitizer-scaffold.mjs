import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const CONTRACT_VERSION = 'v28.0M-10';
const DEFAULT_INPUT_PATH =
  'docs/fixtures/market-pricing/artifact-sanitizer-scaffold-valid-v28.0M-10.json';
const DEFAULT_OUTPUT_PATH =
  'manual-artifacts/market-pricing/artifact-sanitizer-scaffold-latest.json';

const ALLOWED_INPUT_PREFIXES = [
  'docs/fixtures/market-pricing/',
  'manual-artifacts/market-pricing/'
];

const SENSITIVE_FIELD_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'bearer',
  'token',
  'accesstoken',
  'refreshtoken',
  'cookie',
  'cookies',
  'session',
  'headers',
  'requestheaders',
  'responseheaders',
  'secret',
  'password',
  'credential',
  'credentials'
]);

const SOURCE_LEAKAGE_FIELD_KEYS = new Set([
  'url',
  'endpoint',
  'queryurl',
  'requesturl',
  'rawurl',
  'downloadurl',
  'sourceurl',
  'fullurl',
  'finalurl'
]);

const TRADING_FIELD_KEYS = new Set([
  'buy',
  'sell',
  'short',
  'long',
  'inverseetf',
  'allocation',
  'positionadvice',
  'tradeadvice',
  'recommendation',
  'targetposition'
]);

const CALCULATION_FIELD_KEYS = new Set([
  'ma60',
  'zscore',
  'standarddeviation',
  'upperband',
  'lowerband',
  'temperature',
  'markettemperature',
  'signal'
]);

const PRODUCTION_WRITE_FLAGS = new Set([
  'productiondatawritten',
  'historyfilemodified',
  'radardatamodified',
  'readyforproductionwrite'
]);

const REAL_RECORD_SOURCE_STATUSES = new Set([
  'ok',
  'stale',
  'fallback',
  'rejected'
]);

const REAL_RECORD_SOURCE_TYPES = new Set([
  'manual_fixture',
  'scaffold_fixture',
  'public_csv',
  'official_api',
  'licensed_provider'
]);

const REAL_RECORD_CANDIDATE_SOURCES = new Set([
  'manual_fixture',
  'scaffold_fixture'
]);

const REAL_RECORD_PRICE_FIELDS = new Set(['adjustedClose', 'close']);
const REAL_RECORD_PRICE_FIELD_USED = new Set(['adjustedClose', 'close']);
const REAL_RECORD_PRICE_ADJUSTMENT_STATUS = new Set([
  'adjusted',
  'unadjusted_labeled',
  'index_level'
]);

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function readOption(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function normalizeInputPath(inputPath) {
  const normalized = path.normalize(inputPath).replaceAll('\\', '/');
  if (!ALLOWED_INPUT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(
      'Artifact sanitizer scaffold input must stay under docs/fixtures/market-pricing/ or manual-artifacts/market-pricing/.'
    );
  }
  return normalized;
}

function normalizeOutputPath(outputPath) {
  const normalized = path.normalize(outputPath).replaceAll('\\', '/');
  if (!normalized.startsWith('manual-artifacts/market-pricing/')) {
    throw new Error(
      'Artifact sanitizer scaffold output must stay under manual-artifacts/market-pricing/.'
    );
  }
  return normalized;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    input: DEFAULT_INPUT_PATH,
    output: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      options.input = normalizeInputPath(readOption(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--output') {
      options.output = normalizeOutputPath(readOption(argv, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  options.input = normalizeInputPath(options.input);
  options.output = normalizeOutputPath(options.output);
  return options;
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function inspectObjectFields(value, findings, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectObjectFields(item, findings, `${trail}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    const fieldPath = `${trail}.${key}`;

    if (SENSITIVE_FIELD_KEYS.has(normalized)) {
      addUnique(findings.sensitiveFieldsRejected, fieldPath);
    }
    if (SOURCE_LEAKAGE_FIELD_KEYS.has(normalized)) {
      addUnique(findings.sourceLeakageFieldsRejected, fieldPath);
    }
    if (TRADING_FIELD_KEYS.has(normalized) || CALCULATION_FIELD_KEYS.has(normalized)) {
      addUnique(findings.forbiddenFieldsRejected, fieldPath);
    }
    if (PRODUCTION_WRITE_FLAGS.has(normalized) && child === true) {
      addUnique(findings.forbiddenFieldsRejected, `${fieldPath}=true`);
    }

    inspectObjectFields(child, findings, fieldPath);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function addRecordRejection(findings, reason, recordIndex = null) {
  const suffix = recordIndex === null ? reason : `record_${recordIndex}_${reason}`;
  addUnique(findings.recordsRejectedReasons, suffix);
}

function inspectScaffoldArtifactShape(artifact, findings) {
  if (artifact.contractVersion !== 'v28.0M-9') {
    addUnique(findings.recordsRejectedReasons, 'artifact_contract_version_not_supported');
  }
  if (artifact.kind !== 'market_pricing_artifact_fetch_scaffold_report') {
    addUnique(findings.recordsRejectedReasons, 'artifact_kind_not_supported');
  }
  if (
    artifact.status !== 'artifact_fetch_scaffold_only' &&
    artifact.status !== 'network_request_rejected_scaffold_only'
  ) {
    addUnique(findings.recordsRejectedReasons, 'artifact_status_not_scaffold_only');
  }
  if (artifact.sourceMode !== 'scaffold_no_live_fetch') {
    addUnique(findings.recordsRejectedReasons, 'artifact_source_mode_not_scaffold');
  }
  if (artifact.fixtureOnly !== true) {
    addUnique(findings.recordsRejectedReasons, 'artifact_fixture_only_required');
  }
  if (artifact.networkAllowed !== false) {
    addUnique(findings.recordsRejectedReasons, 'network_allowed_must_be_false');
  }
  if (artifact.apiCalled !== false) {
    addUnique(findings.recordsRejectedReasons, 'api_called_must_be_false');
  }
  if (artifact.secretsRead !== false) {
    addUnique(findings.recordsRejectedReasons, 'secrets_read_must_be_false');
  }
  if (artifact.calculationPerformed !== false) {
    addUnique(findings.recordsRejectedReasons, 'calculation_performed_must_be_false');
  }
  if (artifact.validation?.readyForProductionWrite !== false) {
    addUnique(findings.recordsRejectedReasons, 'ready_for_production_write_must_be_false');
  }
  if (artifact.boundaries?.noLiveFetch !== true) {
    addUnique(findings.recordsRejectedReasons, 'boundary_no_live_fetch_required');
  }
  if (artifact.boundaries?.noProductionWrite !== true) {
    addUnique(findings.recordsRejectedReasons, 'boundary_no_production_write_required');
  }
  if (artifact.boundaries?.noCalculation !== true) {
    addUnique(findings.recordsRejectedReasons, 'boundary_no_calculation_required');
  }

  if (!Array.isArray(artifact.records)) {
    addUnique(findings.recordsRejectedReasons, 'records_must_be_array');
    return;
  }

  if (artifact.records.length > 0) {
    findings.recordsRejected += artifact.records.length;
    addUnique(findings.recordsRejectedReasons, 'records_present_in_scaffold_phase');
  }
}

function inspectRecordForbiddenFields(record, findings, recordIndex) {
  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key);
    if (CALCULATION_FIELD_KEYS.has(normalized)) {
      addRecordRejection(findings, `forbidden_calculation_field_${key}`, recordIndex);
    }
    if (TRADING_FIELD_KEYS.has(normalized)) {
      addRecordRejection(findings, `forbidden_trading_advice_field_${key}`, recordIndex);
    }
    if (SOURCE_LEAKAGE_FIELD_KEYS.has(normalized) || SENSITIVE_FIELD_KEYS.has(normalized)) {
      addRecordRejection(findings, `forbidden_source_field_${key}`, recordIndex);
    }
    if (PRODUCTION_WRITE_FLAGS.has(normalized) && value === true) {
      addRecordRejection(findings, `forbidden_production_write_flag_${key}`, recordIndex);
    }
  }
}

function inspectRealRecord(record, findings, recordIndex, artifactFrequency) {
  const beforeReasonCount = findings.recordsRejectedReasons.length;

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    addRecordRejection(findings, 'record_must_be_object', recordIndex);
    return false;
  }

  inspectRecordForbiddenFields(record, findings, recordIndex);

  if (!isIsoDate(record.date)) {
    addRecordRejection(findings, 'invalid_date_format', recordIndex);
  }

  const recordFrequency = record.frequency ?? artifactFrequency;
  if (recordFrequency !== 'weekly') {
    addRecordRejection(findings, 'frequency_must_be_weekly', recordIndex);
  }
  if (record.currency !== 'USD') {
    addRecordRejection(findings, 'currency_must_be_usd', recordIndex);
  }
  if (!REAL_RECORD_SOURCE_STATUSES.has(record.sourceStatus)) {
    addRecordRejection(findings, 'invalid_source_status', recordIndex);
  }
  if (!REAL_RECORD_SOURCE_TYPES.has(record.sourceType)) {
    addRecordRejection(findings, 'invalid_source_type', recordIndex);
  }
  if (!isNonEmptyString(record.sourceName)) {
    addRecordRejection(findings, 'source_name_required', recordIndex);
  }
  if (!REAL_RECORD_PRICE_FIELD_USED.has(record.priceFieldUsed)) {
    addRecordRejection(findings, 'missing_or_invalid_price_field_used', recordIndex);
  }
  if (!REAL_RECORD_PRICE_ADJUSTMENT_STATUS.has(record.priceAdjustmentStatus)) {
    addRecordRejection(findings, 'invalid_price_adjustment_status', recordIndex);
  }

  const presentPriceFields = [...REAL_RECORD_PRICE_FIELDS].filter((field) =>
    Object.hasOwn(record, field)
  );
  if (presentPriceFields.length === 0) {
    addRecordRejection(findings, 'missing_price_field', recordIndex);
  }

  for (const field of presentPriceFields) {
    if (!isFinitePositiveNumber(record[field])) {
      addRecordRejection(findings, `non_positive_price_${field}`, recordIndex);
    }
  }

  if (record.priceFieldUsed === 'adjustedClose' && !isFinitePositiveNumber(record.adjustedClose)) {
    addRecordRejection(findings, 'adjusted_close_required_for_price_field_used', recordIndex);
  }
  if (record.priceFieldUsed === 'close') {
    if (!isFinitePositiveNumber(record.close)) {
      addRecordRejection(findings, 'close_required_for_price_field_used', recordIndex);
    }
    if (record.priceAdjustmentStatus === 'adjusted') {
      addRecordRejection(findings, 'close_price_cannot_use_adjusted_status', recordIndex);
    }
  }

  return findings.recordsRejectedReasons.length === beforeReasonCount;
}

function inspectRealRecordArtifactShape(artifact, findings) {
  if (artifact.contractVersion !== 'v28.0M-12-real-record-synthetic-1') {
    addUnique(findings.recordsRejectedReasons, 'real_record_contract_version_not_supported');
  }
  if (
    artifact.status !== 'synthetic_fixture_only' &&
    artifact.status !== 'artifact_only_synthetic_fixture'
  ) {
    addUnique(findings.recordsRejectedReasons, 'real_record_status_not_synthetic_fixture');
  }
  if (artifact.fixtureOnly !== true) {
    addUnique(findings.recordsRejectedReasons, 'real_record_fixture_only_required');
  }
  if (artifact.syntheticOnly !== true) {
    addUnique(findings.recordsRejectedReasons, 'real_record_synthetic_only_required');
  }
  if (artifact.artifactOnly !== true) {
    addUnique(findings.recordsRejectedReasons, 'real_record_artifact_only_required');
  }
  if (artifact.assetKey !== 'fixture_asset') {
    addUnique(findings.recordsRejectedReasons, 'real_record_asset_key_must_be_fixture_asset');
  }
  if (artifact.symbol !== 'FIXTURE') {
    addUnique(findings.recordsRejectedReasons, 'real_record_symbol_must_be_fixture');
  }
  if (artifact.frequency !== 'weekly') {
    addUnique(findings.recordsRejectedReasons, 'real_record_frequency_must_be_weekly');
  }
  if (!REAL_RECORD_CANDIDATE_SOURCES.has(artifact.candidateSource)) {
    addUnique(findings.recordsRejectedReasons, 'real_record_candidate_source_must_be_fixture');
  }
  if (
    artifact.sourceComplianceReviewed !== true &&
    artifact.sourceComplianceReviewed !== false
  ) {
    addUnique(findings.recordsRejectedReasons, 'source_compliance_reviewed_boolean_required');
  }
  if (artifact.productionDataWritten !== false) {
    addUnique(findings.recordsRejectedReasons, 'production_data_written_must_be_false');
  }
  if (artifact.historyFileModified !== false) {
    addUnique(findings.recordsRejectedReasons, 'history_file_modified_must_be_false');
  }
  if (artifact.radarDataModified !== false) {
    addUnique(findings.recordsRejectedReasons, 'radar_data_modified_must_be_false');
  }
  if (artifact.calculationPerformed !== false) {
    addUnique(findings.recordsRejectedReasons, 'calculation_performed_must_be_false');
  }
  if (artifact.validation?.readyForProductionWrite !== false) {
    addUnique(findings.recordsRejectedReasons, 'ready_for_production_write_must_be_false');
  }
  if (!Array.isArray(artifact.records)) {
    addUnique(findings.recordsRejectedReasons, 'records_must_be_array');
    return;
  }

  const seenDates = new Set();
  let previousDate = null;

  artifact.records.forEach((record, recordIndex) => {
    const validBeforeOrderChecks = inspectRealRecord(
      record,
      findings,
      recordIndex,
      artifact.frequency
    );

    if (isIsoDate(record?.date)) {
      if (seenDates.has(record.date)) {
        addRecordRejection(findings, 'duplicate_date', recordIndex);
      }
      if (previousDate !== null && record.date < previousDate) {
        addRecordRejection(findings, 'unsorted_date', recordIndex);
      }
      seenDates.add(record.date);
      previousDate = record.date;
    }

    const validAfterOrderChecks =
      validBeforeOrderChecks &&
      !findings.recordsRejectedReasons.some((reason) =>
        reason.startsWith(`record_${recordIndex}_`)
      );
    if (validAfterOrderChecks) {
      findings.recordsStructurallyValid += 1;
    }
  });

  findings.recordsRejected += artifact.records.length - findings.recordsStructurallyValid;
}

function inspectArtifactShape(artifact, findings) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    addUnique(findings.recordsRejectedReasons, 'artifact_root_must_be_object');
    return;
  }

  if (artifact.kind === 'market_pricing_artifact_fetch_scaffold_report') {
    inspectScaffoldArtifactShape(artifact, findings);
    return;
  }
  if (artifact.kind === 'market_pricing_real_record_artifact') {
    inspectRealRecordArtifactShape(artifact, findings);
    return;
  }

  if (artifact.kind !== 'market_pricing_artifact_fetch_scaffold_report') {
    addUnique(findings.recordsRejectedReasons, 'artifact_kind_not_supported');
  }
}

export function buildArtifactSanitizerScaffoldReport(inputPath, artifact) {
  const findings = {
    sensitiveFieldsRejected: [],
    sourceLeakageFieldsRejected: [],
    forbiddenFieldsRejected: [],
    recordsRejectedReasons: [],
    recordsStructurallyValid: 0,
    recordsRejected: 0
  };

  inspectObjectFields(artifact, findings);
  inspectArtifactShape(artifact, findings);

  const records = Array.isArray(artifact?.records) ? artifact.records : [];
  const invalid =
    findings.sensitiveFieldsRejected.length > 0 ||
    findings.sourceLeakageFieldsRejected.length > 0 ||
    findings.forbiddenFieldsRejected.length > 0 ||
    findings.recordsRejectedReasons.length > 0;

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_artifact_sanitizer_scaffold_report',
    generatedAt: new Date().toISOString(),
    status: invalid
      ? 'invalid_artifact'
      : artifact?.kind === 'market_pricing_real_record_artifact'
        ? 'pass_synthetic_real_record_scaffold'
        : 'pass_scaffold_only',
    inputPath,
    artifactKind: artifact?.kind ?? null,
    artifactContractVersion: artifact?.contractVersion ?? null,
    artifactStatus: artifact?.status ?? null,
    scaffoldOnly: true,
    fixtureOnly: artifact?.fixtureOnly === true,
    syntheticOnly: artifact?.syntheticOnly === true,
    recordsInspected: records.length,
    recordsStructurallyValid: findings.recordsStructurallyValid,
    recordsAcceptedForHistory: 0,
    recordsRejected: findings.recordsRejected,
    recordsRejectedReasons: findings.recordsRejectedReasons,
    rejectionReasons: findings.recordsRejectedReasons,
    sensitiveFieldsRejected: findings.sensitiveFieldsRejected,
    sourceLeakageFieldsRejected: findings.sourceLeakageFieldsRejected,
    forbiddenFieldsRejected: findings.forbiddenFieldsRejected,
    sourceComplianceReviewed:
      artifact?.kind === 'market_pricing_real_record_artifact'
        ? artifact.sourceComplianceReviewed === true
        : false,
    readyForProductionWrite: false,
    productionDataWritten: false,
    historyFileModified: false,
    radarDataModified: false,
    calculationPerformed: false,
    boundaries: {
      sanitizerScaffoldOnly: true,
      artifactOnly: true,
      noLiveFetch: true,
      noProductionWrite: true,
      noCalculation: true,
      displayOnly: true,
      notInvestmentAdvice: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    notesZh: [
      '本报告仅为 market pricing artifact sanitizer scaffold。',
      '本轮不联网、不抓取真实行情、不写入生产数据。',
      '本轮不写入 data/market-pricing-history.json。',
      '本轮不计算 MA60、标准差或 z-score。',
      '即使 artifact 通过 scaffold 检查，也不允许写入生产历史。'
    ]
  };
}

export function readArtifact(inputPath) {
  const safeInputPath = normalizeInputPath(inputPath || DEFAULT_INPUT_PATH);
  const artifactText = fs.readFileSync(safeInputPath, 'utf8');
  return {
    inputPath: safeInputPath,
    artifact: JSON.parse(artifactText)
  };
}

export function writeArtifactSanitizerScaffoldReport(outputPath, report) {
  const safeOutputPath = normalizeOutputPath(outputPath || DEFAULT_OUTPUT_PATH);
  fs.mkdirSync(path.dirname(safeOutputPath), { recursive: true });
  fs.writeFileSync(safeOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    outputPath: safeOutputPath,
    report
  };
}

export function sanitizeArtifactFile(inputPath, outputPath) {
  const { inputPath: safeInputPath, artifact } = readArtifact(inputPath);
  const report = buildArtifactSanitizerScaffoldReport(safeInputPath, artifact);
  return writeArtifactSanitizerScaffoldReport(outputPath || DEFAULT_OUTPUT_PATH, report);
}

function printSummary(result) {
  const { outputPath, report } = result;
  console.log('Market pricing artifact sanitizer scaffold report written.');
  console.log(`output=${outputPath}`);
  console.log(`status=${report.status}`);
  console.log(`inputPath=${report.inputPath}`);
  console.log(`recordsInspected=${report.recordsInspected}`);
  console.log(`recordsAcceptedForHistory=${report.recordsAcceptedForHistory}`);
  console.log(`readyForProductionWrite=${report.readyForProductionWrite}`);
  console.log(`productionDataWritten=${report.productionDataWritten}`);
  console.log(`calculationPerformed=${report.calculationPerformed}`);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = sanitizeArtifactFile(options.input, options.output);
  printSummary(result);
  const passStatuses = new Set([
    'pass_scaffold_only',
    'pass_synthetic_real_record_scaffold'
  ]);
  if (!passStatuses.has(result.report.status)) {
    process.exitCode = 1;
  }
  return result.report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
