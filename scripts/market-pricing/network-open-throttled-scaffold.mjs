/*
 * v28.0M-21 Market Pricing Network Open (Throttled)
 *
 * First M-series step that CAN open the network. Default mode is dry-run.
 * Network access requires explicit --network=open-throttled flag.
 *
 * Hard limits enforced in code:
 *   - Max 1 fetch per invocation
 *   - 30 second timeout (AbortController)
 *   - Max 1 retry, no exponential backoff
 *   - Source URL must come from manifest, not hardcoded
 *   - Response written only to manual-artifacts/, never to data/
 *   - records=[] in all reports (M-22 is the first record-write step)
 *
 * Boundaries inherited from M-17 ~ M-20 remain false in design fixture.
 * sourceApproved, liveFetchApproved, productionDataWriteApproved all remain false.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT_VERSION = 'v28.0M-21-network-open-throttled-design-1';
const MANIFEST_PATH = path.join(
  'docs',
  'fixtures',
  'market-pricing',
  'network-open-throttled-manifest-v28.0M-21.json'
);
const SOURCE_FORMAT_DESIGN_PATH = path.join(
  'docs',
  'fixtures',
  'market-pricing',
  'source-format-verification-design-v28.0M-20.json'
);
const DEFAULT_SOURCE_ID = 'stooq_public_csv_qqq';
const DEFAULT_TARGET_ASSET = 'qqq';
const DEFAULT_TARGET_SYMBOL = 'QQQ';
const DEFAULT_OUTPUT_ROOT =
  'manual-artifacts/market-pricing/network-fetch-attempts';
const OPEN_THROTTLED_FLAG_VALUE = 'open-throttled';

function nowIso() {
  return new Date().toISOString();
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8'));
}

export function readNetworkOpenThrottledManifest() {
  return readJson(MANIFEST_PATH);
}

function readSourceFormatDesign() {
  return readJson(SOURCE_FORMAT_DESIGN_PATH);
}

function defaultFetchPolicy(manifest = null) {
  const policy = manifest?.policy || {};

  return {
    maxFetchPerInvocation: policy.maxFetchPerInvocation ?? 1,
    timeoutSeconds: policy.timeoutSeconds ?? 30,
    maxRetries: policy.maxRetries ?? 1,
    followRedirectsAcrossHostnames:
      policy.followRedirectsAcrossHostnames ?? false,
    allowedHttpMethods: policy.allowedHttpMethods || ['GET'],
    requiresExplicitNetworkOpenFlag: true,
    explicitNetworkOpenFlagName: '--network=open-throttled'
  };
}

function buildBaseReport(options = {}) {
  const manifest = options.manifest || null;
  const fetchPolicy = options.fetchPolicy || defaultFetchPolicy(manifest);
  const dryRun = options.dryRun === true || options.network !== OPEN_THROTTLED_FLAG_VALUE;
  const runtimeOpen = dryRun === false;
  const fetchAttemptCount = dryRun ? 0 : options.fetchAttemptCount || 0;
  const status =
    options.status ||
    (dryRun
      ? 'network_open_throttled_design_dry_run_only'
      : 'network_open_throttled_runtime_audit_only');

  return {
    contractVersion: CONTRACT_VERSION,
    kind: 'market_pricing_network_open_throttled_design',
    generatedAt: options.generatedAt || nowIso(),
    status,
    targetAsset: options.targetAsset || DEFAULT_TARGET_ASSET,
    targetSymbol: options.targetSymbol || DEFAULT_TARGET_SYMBOL,
    sourceCandidate: options.sourceCandidate || DEFAULT_SOURCE_ID,

    networkOpenAllowedInDesign: true,
    networkOpenAllowedInRuntime: runtimeOpen,
    networkOpenedThisRun: runtimeOpen && fetchAttemptCount > 0,
    networkAllowed: runtimeOpen,
    networkRequestRejected: options.networkRequestRejected === true,
    fetchAttemptCount,
    recordsWrittenToHistory: 0,
    recordsWrittenToData: 0,
    manualArtifactWritten: options.manualArtifactWritten === true,

    fetchPolicy,

    sourceApproved: false,
    liveFetchApproved: false,
    sourceComplianceReviewed: false,
    symbolMappingVerified: false,
    sourceFormatVerified: false,
    sourceSelectionFinalized: false,
    sourceUrlPersistenceAllowed: true,
    secretsAllowed: false,
    productionDataWriteApproved: false,
    historyWriteApproved: false,
    marketTemperatureCalculationApproved: false,
    readyForProductionWrite: false,

    artifactOnly: true,
    manualArtifactsLayerOnly: true,
    verificationRequiresSeparateApproval: true,

    apiCalled: runtimeOpen && fetchAttemptCount > 0,
    secretsRead: false,
    productionDataWritten: false,
    historyFileModified: false,
    frontendChanged: false,
    workflowChanged: false,

    boundaries: {
      defaultDryRun: true,
      networkOnlyWithExplicitFlag: true,
      singleFetchPerInvocation: true,
      maxTimeoutSeconds: fetchPolicy.timeoutSeconds,
      noSecretsRead: true,
      noProcessEnvRead: true,
      noHardcodedUrl: true,
      noProductionWrite: true,
      noHistoryWrite: true,
      noWorkflowChange: true,
      noCalculation: true,
      noFrontendChange: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },

    records: [],
    rejectionReasons: options.rejectionReasons || [],
    fetchAttempt: options.fetchAttempt || null,
    validation: options.validation || null,
    artifactDirectory: options.artifactDirectory || null,
    nextAllowedStep:
      'M-22 will define the contract for writing the FIRST real record to history. M-21 only inspects real data; M-22 is the first record-write step.'
  };
}

export function buildMarketPricingNetworkOpenThrottledReport(options = {}) {
  return buildBaseReport(options);
}

function assertManualArtifactDirectory(outputDirectory) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, DEFAULT_OUTPUT_ROOT);
  const resolvedOutput = path.resolve(root, outputDirectory);

  if (
    resolvedOutput !== allowedRoot &&
    !resolvedOutput.startsWith(`${allowedRoot}${path.sep}`)
  ) {
    throw Object.assign(
      new Error('M-21 output must stay under manual-artifacts/market-pricing/network-fetch-attempts.'),
      { exitCode: 2, reason: 'output_path_outside_manual_artifacts' }
    );
  }

  return resolvedOutput;
}

function validateManifest(manifest) {
  const sources = Array.isArray(manifest.allowedSources)
    ? manifest.allowedSources
    : [];
  const policy = manifest.policy || {};

  if (sources.length !== 1) {
    throw Object.assign(new Error('Manifest must contain exactly one allowed source.'), {
      exitCode: 2,
      reason: 'manifest_source_count_invalid'
    });
  }

  if (policy.maxFetchPerInvocation !== 1) {
    throw Object.assign(new Error('Manifest maxFetchPerInvocation must be 1.'), {
      exitCode: 2,
      reason: 'manifest_fetch_limit_invalid'
    });
  }

  if (policy.timeoutSeconds !== 30) {
    throw Object.assign(new Error('Manifest timeoutSeconds must be 30.'), {
      exitCode: 2,
      reason: 'manifest_timeout_invalid'
    });
  }

  if (policy.maxRetries !== 1) {
    throw Object.assign(new Error('Manifest maxRetries must be 1.'), {
      exitCode: 2,
      reason: 'manifest_retry_invalid'
    });
  }

  if (policy.followRedirectsAcrossHostnames !== false) {
    throw Object.assign(
      new Error('Manifest must forbid redirects across hostnames.'),
      { exitCode: 2, reason: 'manifest_redirect_policy_invalid' }
    );
  }
}

function selectManifestSource(manifest, sourceId) {
  validateManifest(manifest);

  const source = manifest.allowedSources.find((item) => item.id === sourceId);
  if (!source) {
    throw Object.assign(new Error(`Source is not in the M-21 manifest: ${sourceId}`), {
      exitCode: 2,
      reason: 'source_not_in_manifest'
    });
  }

  if (source.id !== DEFAULT_SOURCE_ID || source.expectedSymbol !== DEFAULT_TARGET_SYMBOL) {
    throw Object.assign(new Error('M-21 only allows the QQQ manifest source.'), {
      exitCode: 2,
      reason: 'source_policy_mismatch'
    });
  }

  if (source.method !== 'GET') {
    throw Object.assign(new Error('M-21 only allows GET.'), {
      exitCode: 2,
      reason: 'source_method_not_allowed'
    });
  }

  return source;
}

function parseTimeoutSeconds(rawValue, manifest) {
  const timeoutSeconds = Number(rawValue ?? manifest.policy.timeoutSeconds);

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw Object.assign(new Error('Timeout must be a positive number of seconds.'), {
      exitCode: 2,
      reason: 'timeout_invalid'
    });
  }

  if (timeoutSeconds > manifest.policy.timeoutSeconds) {
    throw Object.assign(new Error('Timeout exceeds the M-21 manifest policy.'), {
      exitCode: 2,
      reason: 'timeout_exceeds_policy'
    });
  }

  return timeoutSeconds;
}

function parseCliArgs(argv) {
  const options = {
    network: 'closed',
    source: DEFAULT_SOURCE_ID,
    timeout: null,
    output: null,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--network=')) {
      options.network = arg.slice('--network='.length);
      continue;
    }

    if (arg === '--network') {
      options.network = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--source=')) {
      options.source = arg.slice('--source='.length);
      continue;
    }

    if (arg === '--source') {
      options.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      options.timeout = arg.slice('--timeout='.length);
      continue;
    }

    if (arg === '--timeout') {
      options.timeout = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    throw Object.assign(new Error(`Unknown M-21 argument: ${arg}`), {
      exitCode: 2,
      reason: 'unknown_argument'
    });
  }

  return options;
}

export function validateM20SourceFormat({ contentType, bodyText, sourceFormatDesign }) {
  const firstNonEmptyLine = String(bodyText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const expectedColumns =
    sourceFormatDesign?.candidateSourceFormatDesign?.expectedColumns || [];
  const requiredColumnNames = expectedColumns
    .filter((column) => column.required === true)
    .map((column) => column.name);
  const headerColumns = firstNonEmptyLine
    ? firstNonEmptyLine.split(',').map((column) => column.trim())
    : [];

  const flags = {
    contentTypeMatched: String(contentType || '').toLowerCase().startsWith('text/'),
    noEmptyBody: String(bodyText || '').length > 0,
    headerRowPresent:
      Boolean(firstNonEmptyLine) && firstNonEmptyLine.includes(',') && /[a-z]/i.test(firstNonEmptyLine),
    columnSchemaMatched: requiredColumnNames.every((name) => headerColumns.includes(name)),
    noHtmlErrorPageMasquerade: !String(bodyText || '').trimStart().startsWith('<')
  };
  const passed = Object.values(flags).every((value) => value === true);

  return {
    status: passed ? 'pass' : 'fail',
    flags,
    requiredColumnNames,
    observedHeaderColumns: headerColumns,
    failureReasons: Object.entries(flags)
      .filter(([, value]) => value !== true)
      .map(([key]) => key)
  };
}

async function readResponseBody(response) {
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    text: buffer.toString('utf8'),
    byteLength: buffer.byteLength
  };
}

async function fetchOnce({ source, timeoutSeconds, attemptNumber }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const startedAt = nowIso();

  try {
    const response = await fetch(source.url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const location = response.headers.get('location') || '';
    const body = await readResponseBody(response);
    const sourceHostname = new URL(source.url).hostname;
    const redirectHostname = location
      ? new URL(location, source.url).hostname
      : null;
    const redirectedAcrossHostname =
      Boolean(redirectHostname) && redirectHostname !== sourceHostname;
    const isRedirect = response.status >= 300 && response.status < 400;
    const ok = response.ok && !isRedirect;

    return {
      attemptNumber,
      ok,
      startedAt,
      finishedAt: nowIso(),
      method: 'GET',
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength: body.byteLength,
      redirectedAcrossHostname,
      failureReason: ok
        ? null
        : isRedirect
          ? redirectedAcrossHostname
            ? 'redirect_across_hostname_rejected'
            : 'redirect_not_followed'
          : `http_status_${response.status}`,
      body
    };
  } catch (error) {
    return {
      attemptNumber,
      ok: false,
      startedAt,
      finishedAt: nowIso(),
      method: 'GET',
      status: null,
      statusText: null,
      contentType: null,
      contentLength: 0,
      redirectedAcrossHostname: false,
      failureReason: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error),
      body: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithSingleRetry({ source, timeoutSeconds, manifest }) {
  const maxAttempts = manifest.policy.maxRetries + 1;
  const attempts = [];

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const attempt = await fetchOnce({ source, timeoutSeconds, attemptNumber });
    attempts.push(attempt);

    if (attempt.ok) {
      return { ok: true, attempts, finalAttempt: attempt };
    }
  }

  return {
    ok: false,
    attempts,
    finalAttempt: attempts.at(-1)
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeAttemptArtifact({ outputDirectory, body, metadata, responseFileName }) {
  fs.mkdirSync(outputDirectory, { recursive: true });

  if (body?.buffer) {
    fs.writeFileSync(path.join(outputDirectory, responseFileName), body.buffer);
  }

  writeJson(path.join(outputDirectory, 'attempt-metadata.json'), metadata);
}

function relativeFromRoot(absolutePath) {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
}

async function runOpenThrottled(options) {
  const manifest = readNetworkOpenThrottledManifest();
  const source = selectManifestSource(manifest, options.source);
  const timeoutSeconds = parseTimeoutSeconds(options.timeout, manifest);
  const sourceFormatDesign = readSourceFormatDesign();
  const outputDirectory = assertManualArtifactDirectory(
    options.output || path.join(DEFAULT_OUTPUT_ROOT, timestampForPath())
  );
  const fetchPolicy = defaultFetchPolicy(manifest);
  const fetchResult = await fetchWithSingleRetry({
    source,
    timeoutSeconds,
    manifest
  });
  const attemptSummaries = fetchResult.attempts.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    ok: attempt.ok,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    method: attempt.method,
    status: attempt.status,
    statusText: attempt.statusText,
    contentType: attempt.contentType,
    contentLength: attempt.contentLength,
    redirectedAcrossHostname: attempt.redirectedAcrossHostname,
    failureReason: attempt.failureReason,
    errorName: attempt.errorName || null
  }));

  if (!fetchResult.ok) {
    const failedDirectory = assertManualArtifactDirectory(`${outputDirectory}-failed`);
    const finalAttempt = fetchResult.finalAttempt || {};
    const report = buildMarketPricingNetworkOpenThrottledReport({
      manifest,
      fetchPolicy,
      network: OPEN_THROTTLED_FLAG_VALUE,
      status: 'network_open_throttled_fetch_failed_audit_only',
      fetchAttemptCount: fetchResult.attempts.length,
      manualArtifactWritten: true,
      artifactDirectory: relativeFromRoot(failedDirectory),
      rejectionReasons: [finalAttempt.failureReason || 'fetch_failed'],
      fetchAttempt: {
        sourceId: source.id,
        expectedSymbol: source.expectedSymbol,
        url: source.url,
        attempts: attemptSummaries
      }
    });
    const responseFileName =
      finalAttempt.body && String(finalAttempt.contentType || '').toLowerCase().startsWith('text/')
        ? 'response.csv'
        : 'response.bin';

    writeAttemptArtifact({
      outputDirectory: failedDirectory,
      body: finalAttempt.body,
      responseFileName,
      metadata: {
        ...report,
        failureReason: finalAttempt.failureReason || 'fetch_failed'
      }
    });

    return { exitCode: 3, report };
  }

  const finalAttempt = fetchResult.finalAttempt;
  const validation = validateM20SourceFormat({
    contentType: finalAttempt.contentType,
    bodyText: finalAttempt.body.text,
    sourceFormatDesign
  });

  if (validation.status !== 'pass') {
    const failedDirectory = assertManualArtifactDirectory(`${outputDirectory}-failed`);
    const responseFileName = String(finalAttempt.contentType || '').toLowerCase().startsWith('text/')
      ? 'response.csv'
      : 'response.bin';
    const report = buildMarketPricingNetworkOpenThrottledReport({
      manifest,
      fetchPolicy,
      network: OPEN_THROTTLED_FLAG_VALUE,
      status: 'network_open_throttled_validation_failed_audit_only',
      fetchAttemptCount: fetchResult.attempts.length,
      manualArtifactWritten: true,
      artifactDirectory: relativeFromRoot(failedDirectory),
      rejectionReasons: validation.failureReasons,
      validation,
      fetchAttempt: {
        sourceId: source.id,
        expectedSymbol: source.expectedSymbol,
        url: source.url,
        attempts: attemptSummaries
      }
    });

    writeAttemptArtifact({
      outputDirectory: failedDirectory,
      body: finalAttempt.body,
      responseFileName,
      metadata: report
    });

    return { exitCode: 4, report };
  }

  const report = buildMarketPricingNetworkOpenThrottledReport({
    manifest,
    fetchPolicy,
    network: OPEN_THROTTLED_FLAG_VALUE,
    status: 'network_open_throttled_fetch_validated_audit_only',
    fetchAttemptCount: fetchResult.attempts.length,
    manualArtifactWritten: true,
    artifactDirectory: relativeFromRoot(outputDirectory),
    validation,
    fetchAttempt: {
      sourceId: source.id,
      expectedSymbol: source.expectedSymbol,
      url: source.url,
      attempts: attemptSummaries
    }
  });

  writeAttemptArtifact({
    outputDirectory,
    body: finalAttempt.body,
    responseFileName: 'response.csv',
    metadata: report
  });

  return { exitCode: 0, report };
}

function writeDryRunReportIfRequested({ output, report }) {
  if (!output) {
    return null;
  }

  const outputDirectory = assertManualArtifactDirectory(output);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, 'dry-run-report.json');
  writeJson(outputPath, report);
  return outputPath;
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const manifest = readNetworkOpenThrottledManifest();
  selectManifestSource(manifest, options.source);
  parseTimeoutSeconds(options.timeout, manifest);

  if (options.dryRun === true || options.network !== OPEN_THROTTLED_FLAG_VALUE) {
    const report = buildMarketPricingNetworkOpenThrottledReport({
      manifest,
      network: options.network,
      dryRun: true,
      sourceCandidate: options.source,
      fetchPolicy: defaultFetchPolicy(manifest)
    });
    const outputPath = writeDryRunReportIfRequested({ output: options.output, report });

    console.log('Market pricing network open throttled scaffold: PASS');
    console.log(`status=${report.status}`);
    console.log(`networkOpenedThisRun=${report.networkOpenedThisRun}`);
    console.log(`networkAllowed=${report.networkAllowed}`);
    console.log(`fetchAttemptCount=${report.fetchAttemptCount}`);
    console.log(`records=${report.records.length}`);
    if (outputPath) {
      console.log(`output=${relativeFromRoot(outputPath)}`);
    }
    return 0;
  }

  const result = await runOpenThrottled(options);
  console.log(
    result.exitCode === 0
      ? 'Market pricing network open throttled scaffold: PASS'
      : 'Market pricing network open throttled scaffold: FAIL'
  );
  console.log(`status=${result.report.status}`);
  console.log(`networkOpenedThisRun=${result.report.networkOpenedThisRun}`);
  console.log(`networkAllowed=${result.report.networkAllowed}`);
  console.log(`fetchAttemptCount=${result.report.fetchAttemptCount}`);
  console.log(`records=${result.report.records.length}`);
  if (result.report.artifactDirectory) {
    console.log(`artifactDirectory=${result.report.artifactDirectory}`);
  }
  return result.exitCode;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error('Market pricing network open throttled scaffold: FAIL');
      console.error(`reason=${error.reason || 'unexpected_error'}`);
      console.error(error.message);
      process.exitCode = error.exitCode || 1;
    });
}
