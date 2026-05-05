import fs from 'node:fs';

const WORKER_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json';
const SECONDARY_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.secondary-preview.json';
const FETCH_TIMEOUT_MS = 4500;
const CORE_FIELDS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y'];
const MOVE_STATUSES = new Set([
  'no-previous',
  'normal',
  'volatility-watch',
  'confirmed-extreme-move',
  'unconfirmed-jump-hold',
]);
const SECONDARY_STATUSES = new Set(['ok', 'failed', 'unavailable']);

function hasArg(name) {
  return process.argv.includes(name);
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function bool(value) {
  return value === true;
}

function ageMinutes(updatedAt) {
  if (typeof updatedAt !== 'string') return null;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((Date.now() - parsed) / 60000);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent':
          'Mozilla/5.0 (compatible; GFRRWorkerHealthCheck/28.0F-2; +https://ctmaomao.github.io/gfrr-auto-update-site/)',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    let parseError = null;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    return {
      status: response.status,
      ok: response.ok && payload != null,
      payload,
      error: response.ok ? parseError : `HTTP ${response.status}`,
    };
  } catch (err) {
    const error = err instanceof Error && err.name === 'AbortError'
      ? `timeout after ${FETCH_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      status: null,
      ok: false,
      payload: null,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

function addReason(target, message) {
  target.push(message);
}

function checkNoSecondaryPollution(payload, reasons) {
  const diagnostics = payload?.workerGeneratedPreview?.diagnostics || {};
  const polluted = [
    ['secondarySources', payload?.secondarySources],
    ['secondaryDiagnostics', payload?.secondaryDiagnostics],
    ['secondarySourceSummary', payload?.secondarySourceSummary],
    ['workerGeneratedPreview.diagnostics.secondarySources', diagnostics.secondarySources],
    ['workerGeneratedPreview.diagnostics.secondaryDiagnostics', diagnostics.secondaryDiagnostics],
    ['workerGeneratedPreview.diagnostics.secondarySourceSummary', diagnostics.secondarySourceSummary],
  ].filter(([, value]) => value !== undefined);

  for (const [field] of polluted) {
    addReason(reasons, `main preview contains forbidden secondary marker: ${field}`);
  }

  return polluted.length === 0;
}

function checkWorkerPreview(result) {
  const reasons = [];
  const warnings = [];
  const payload = result.payload || {};
  const values = payload.values || {};
  const promotion = payload.brentValidation?.promotion || {};
  const sourceProbe = payload.brentValidation?.sourceProbe || {};
  const sourceProbeProbes = Array.isArray(sourceProbe.probes) ? sourceProbe.probes : null;
  const age = ageMinutes(payload.updatedAt);

  if (result.status !== 200) addReason(reasons, `worker HTTP status is ${result.status ?? 'unavailable'}`);
  if (!result.ok) addReason(reasons, `worker JSON unavailable: ${result.error || 'unknown error'}`);
  if (payload.sourceMode !== 'worker-generated-preview') addReason(reasons, `worker sourceMode is ${payload.sourceMode ?? 'missing'}`);
  if (payload.unavailable === true) addReason(reasons, 'worker unavailable is true');
  if (finiteNumber(payload.healthScore) == null || payload.healthScore < 85) addReason(reasons, `worker healthScore is ${payload.healthScore ?? 'missing'}`);
  if (finiteNumber(payload.criticalMissing) == null || payload.criticalMissing > 1) addReason(reasons, `worker criticalMissing is ${payload.criticalMissing ?? 'missing'}`);
  if (age == null) addReason(reasons, 'worker updatedAt is missing or unparsable');
  if (age != null && age > 10) addReason(reasons, `worker ageMinutes ${age} exceeds 10`);

  for (const field of CORE_FIELDS) {
    const value = finiteNumber(values[field]);
    if (value == null) addReason(reasons, `worker values.${field} is not finite`);
  }
  if (positiveNumber(values.brent) == null) addReason(reasons, 'worker values.brent is not positive');
  checkNoSecondaryPollution(payload, reasons);

  if (!payload.brentValidation?.promotion) {
    addReason(reasons, 'brentValidation.promotion missing');
  } else if (!MOVE_STATUSES.has(promotion.moveStatus)) {
    addReason(reasons, `promotion.moveStatus invalid: ${promotion.moveStatus ?? 'missing'}`);
  }
  if (!payload.brentValidation?.sourceProbe) {
    addReason(reasons, 'brentValidation.sourceProbe missing');
  } else {
    if (sourceProbe.frequencyMinutes !== 60) addReason(reasons, `sourceProbe.frequencyMinutes is ${sourceProbe.frequencyMinutes ?? 'missing'}`);
    if (finiteNumber(sourceProbe.probeCount) == null || sourceProbe.probeCount > 5) addReason(reasons, `sourceProbe.probeCount invalid: ${sourceProbe.probeCount ?? 'missing'}`);
    if (!sourceProbeProbes) addReason(reasons, 'sourceProbe.probes is not an array');
  }

  return {
    status: result.status,
    updatedAt: payload.updatedAt ?? null,
    ageMinutes: age,
    sourceMode: payload.sourceMode ?? null,
    healthScore: finiteNumber(payload.healthScore),
    criticalMissing: finiteNumber(payload.criticalMissing),
    unavailable: bool(payload.unavailable),
    brent: finiteNumber(values.brent),
    gold: finiteNumber(values.gold),
    promotionApplied: promotion.applied === true,
    moveStatus: promotion.moveStatus ?? null,
    sourceProbeReused: sourceProbe.reused === true,
    sourceProbeFrequencyMinutes: sourceProbe.frequencyMinutes ?? null,
    sourceProbeCount: sourceProbe.probeCount ?? null,
    secondaryPollution: reasons.some((reason) => reason.includes('secondary marker')) ? 'failed' : 'ok',
    healthy: reasons.length === 0,
    warnings,
    reasons,
  };
}

function checkSecondarySource(name, source, expected, reasons, warnings) {
  if (!source || typeof source !== 'object') {
    addReason(warnings, `secondary ${name} missing`);
    return null;
  }
  if (source.source !== expected.source) addReason(reasons, `${name} source is ${source.source ?? 'missing'}`);
  if (source.provider !== expected.provider) addReason(reasons, `${name} provider is ${source.provider ?? 'missing'}`);
  if (source.participatesInPrimary !== false) addReason(reasons, `${name} participatesInPrimary must be false`);
  if (source.participatesInValidation !== false) addReason(reasons, `${name} participatesInValidation must be false`);
  if (expected.normalization && source.normalization !== expected.normalization) {
    addReason(reasons, `${name} normalization must be ${expected.normalization}`);
  }
  if (!SECONDARY_STATUSES.has(source.status)) addReason(reasons, `${name} status invalid: ${source.status ?? 'missing'}`);
  if (source.status === 'ok' && positiveNumber(source.value) == null) addReason(reasons, `${name} status ok but value is not positive finite`);
  if (source.status === 'ok' && expected.requireRawValue && positiveNumber(source.rawValue) == null) {
    addReason(reasons, `${name} status ok but rawValue is not positive finite`);
  }
  if (source.status === 'failed' || source.status === 'unavailable') {
    addReason(warnings, `${name} secondary status is ${source.status}`);
  }

  return {
    status: source.status ?? null,
    value: finiteNumber(source.value),
    rawValue: finiteNumber(source.rawValue),
    normalization: source.normalization ?? null,
    observedAt: source.observedAt ?? null,
    participatesInPrimary: source.participatesInPrimary,
    participatesInValidation: source.participatesInValidation,
  };
}

function checkSecondaryPreview(result) {
  const reasons = [];
  const warnings = [];
  const payload = result.payload || {};
  const sources = payload.diagnostics?.sources || {};
  const age = ageMinutes(payload.updatedAt);

  if (result.status !== 200) addReason(reasons, `secondary HTTP status is ${result.status ?? 'unavailable'}`);
  if (!result.ok) addReason(reasons, `secondary JSON unavailable: ${result.error || 'unknown error'}`);
  if (!['secondary-preview', 'secondary-preview-unavailable'].includes(payload.sourceMode)) {
    addReason(reasons, `secondary sourceMode invalid: ${payload.sourceMode ?? 'missing'}`);
  }
  if (age == null) addReason(reasons, 'secondary updatedAt is missing or unparsable');
  if (payload.sourceMode === 'secondary-preview' && payload.unavailable !== false) {
    addReason(reasons, 'secondary-preview must have unavailable=false');
  }
  if (payload.sourceMode === 'secondary-preview-unavailable') {
    addReason(warnings, 'secondary preview is unavailable');
  }

  const vix = checkSecondarySource(
    'vix',
    sources.vix,
    { provider: 'cboe', source: 'cboe:VIX_History' },
    reasons,
    warnings,
  );
  const gold = checkSecondarySource(
    'gold',
    sources.gold,
    { provider: 'yahoo', source: 'yahoo:GC=F' },
    reasons,
    warnings,
  );
  const dxy = checkSecondarySource(
    'dxy',
    sources.dxy,
    { provider: 'yahoo', source: 'yahoo:DX-Y.NYB' },
    reasons,
    warnings,
  );
  const us10y = checkSecondarySource(
    'us10y',
    sources.us10y,
    {
      provider: 'yahoo',
      source: 'yahoo:^TNX',
      normalization: 'divide-by-10',
      requireRawValue: true,
    },
    reasons,
    warnings,
  );
  if (!sources.vix && !sources.gold && !sources.dxy && !sources.us10y) {
    addReason(reasons, 'VIX, Gold, DXY, and US10Y secondary sources are all missing');
  }

  return {
    status: result.status,
    updatedAt: payload.updatedAt ?? null,
    ageMinutes: age,
    sourceMode: payload.sourceMode ?? null,
    unavailable: bool(payload.unavailable),
    vix,
    gold,
    dxy,
    us10y,
    healthy: reasons.length === 0,
    warnings,
    reasons,
  };
}

function overallStatus(worker, secondary) {
  if (!worker.healthy || !secondary.healthy) return 'unhealthy';
  if (worker.warnings.length > 0 || secondary.warnings.length > 0) return 'warning';
  return 'ok';
}

function collectReasons(worker, secondary) {
  return [
    ...worker.reasons.map((reason) => `worker: ${reason}`),
    ...secondary.reasons.map((reason) => `secondary: ${reason}`),
    ...worker.warnings.map((reason) => `worker warning: ${reason}`),
    ...secondary.warnings.map((reason) => `secondary warning: ${reason}`),
  ];
}

function printSummary(summary) {
  console.log('Worker preview:');
  console.log(`  status: ${summary.worker.status}`);
  console.log(`  updatedAt: ${summary.worker.updatedAt}`);
  console.log(`  ageMinutes: ${summary.worker.ageMinutes}`);
  console.log(`  sourceMode: ${summary.worker.sourceMode}`);
  console.log(`  healthScore: ${summary.worker.healthScore}`);
  console.log(`  criticalMissing: ${summary.worker.criticalMissing}`);
  console.log(`  unavailable: ${summary.worker.unavailable}`);
  console.log(`  brent: ${summary.worker.brent}`);
  console.log(`  gold: ${summary.worker.gold}`);
  console.log(`  promotionApplied: ${summary.worker.promotionApplied}`);
  console.log(`  moveStatus: ${summary.worker.moveStatus}`);
  console.log(`  sourceProbeReused: ${summary.worker.sourceProbeReused}`);
  console.log(`  sourceProbeFrequencyMinutes: ${summary.worker.sourceProbeFrequencyMinutes}`);
  console.log(`  sourceProbeCount: ${summary.worker.sourceProbeCount}`);
  console.log(`  secondaryPollution: ${summary.worker.secondaryPollution}`);
  console.log('');
  console.log('Secondary preview:');
  console.log(`  status: ${summary.secondary.status}`);
  console.log(`  updatedAt: ${summary.secondary.updatedAt}`);
  console.log(`  ageMinutes: ${summary.secondary.ageMinutes}`);
  console.log(`  sourceMode: ${summary.secondary.sourceMode}`);
  console.log(`  unavailable: ${summary.secondary.unavailable}`);
  console.log(`  vix: ${summary.secondary.vix?.status ?? 'missing'} ${summary.secondary.vix?.value ?? '--'} ${summary.secondary.vix?.observedAt ?? '--'}`);
  console.log(`  gold: ${summary.secondary.gold?.status ?? 'missing'} ${summary.secondary.gold?.value ?? '--'} ${summary.secondary.gold?.observedAt ?? '--'}`);
  console.log(`  dxy: ${summary.secondary.dxy?.status ?? 'missing'} ${summary.secondary.dxy?.value ?? '--'} ${summary.secondary.dxy?.observedAt ?? '--'}`);
  console.log(`  us10y: ${summary.secondary.us10y?.status ?? 'missing'} ${summary.secondary.us10y?.value ?? '--'} raw=${summary.secondary.us10y?.rawValue ?? '--'} ${summary.secondary.us10y?.observedAt ?? '--'}`);
  console.log('');
  console.log(`Conclusion: ${summary.overall}`);
  if (summary.reasons.length > 0) {
    console.log('Reasons:');
    for (const reason of summary.reasons) console.log(`  - ${reason}`);
  }
}

function tableValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value).replace(/\r?\n/gu, ' ').replace(/\|/gu, '\\|');
}

function appendGithubSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '## Worker-first Health Check',
    '',
    `Overall: **${summary.overall}**`,
    '',
    '### Worker Preview',
    '',
    '| Item | Value |',
    '|---|---|',
    `| HTTP status | ${tableValue(summary.worker.status)} |`,
    `| updatedAt | ${tableValue(summary.worker.updatedAt)} |`,
    `| ageMinutes | ${tableValue(summary.worker.ageMinutes)} |`,
    `| sourceMode | ${tableValue(summary.worker.sourceMode)} |`,
    `| healthScore | ${tableValue(summary.worker.healthScore)} |`,
    `| criticalMissing | ${tableValue(summary.worker.criticalMissing)} |`,
    `| unavailable | ${tableValue(summary.worker.unavailable)} |`,
    `| brent | ${tableValue(summary.worker.brent)} |`,
    `| gold | ${tableValue(summary.worker.gold)} |`,
    `| promotionApplied | ${tableValue(summary.worker.promotionApplied)} |`,
    `| moveStatus | ${tableValue(summary.worker.moveStatus)} |`,
    `| sourceProbeReused | ${tableValue(summary.worker.sourceProbeReused)} |`,
    `| sourceProbeFrequencyMinutes | ${tableValue(summary.worker.sourceProbeFrequencyMinutes)} |`,
    `| sourceProbeCount | ${tableValue(summary.worker.sourceProbeCount)} |`,
    `| secondary pollution | ${tableValue(summary.worker.secondaryPollution)} |`,
    '',
    '### Secondary Preview',
    '',
    '| Item | Value |',
    '|---|---|',
    `| HTTP status | ${tableValue(summary.secondary.status)} |`,
    `| updatedAt | ${tableValue(summary.secondary.updatedAt)} |`,
    `| ageMinutes | ${tableValue(summary.secondary.ageMinutes)} |`,
    `| sourceMode | ${tableValue(summary.secondary.sourceMode)} |`,
    `| unavailable | ${tableValue(summary.secondary.unavailable)} |`,
    `| VIX | ${tableValue(`${summary.secondary.vix?.status ?? 'missing'} / ${summary.secondary.vix?.value ?? '--'} / ${summary.secondary.vix?.observedAt ?? '--'}`)} |`,
    `| Gold | ${tableValue(`${summary.secondary.gold?.status ?? 'missing'} / ${summary.secondary.gold?.value ?? '--'} / ${summary.secondary.gold?.observedAt ?? '--'}`)} |`,
    `| DXY | ${tableValue(`${summary.secondary.dxy?.status ?? 'missing'} / ${summary.secondary.dxy?.value ?? '--'} / ${summary.secondary.dxy?.observedAt ?? '--'}`)} |`,
    `| US10Y | ${tableValue(`${summary.secondary.us10y?.status ?? 'missing'} / ${summary.secondary.us10y?.value ?? '--'} / raw ${summary.secondary.us10y?.rawValue ?? '--'} / ${summary.secondary.us10y?.observedAt ?? '--'}`)} |`,
    '',
    '### Reasons',
    '',
    ...(summary.reasons.length > 0 ? summary.reasons.map((reason) => `- ${reason}`) : ['- none']),
    '',
  ];
  fs.appendFileSync(summaryPath, lines.join('\n'));
}

const githubSummary = hasArg('--github-summary');
const failOnUnhealthy = hasArg('--fail-on-unhealthy');

const [workerResult, secondaryResult] = await Promise.all([
  fetchJson(WORKER_PREVIEW_URL),
  fetchJson(SECONDARY_PREVIEW_URL),
]);
const worker = checkWorkerPreview(workerResult);
const secondary = checkSecondaryPreview(secondaryResult);
const summary = {
  checkedAt: new Date().toISOString(),
  worker,
  secondary,
  overall: overallStatus(worker, secondary),
  reasons: collectReasons(worker, secondary),
};

printSummary(summary);
if (githubSummary) appendGithubSummary(summary);
if (failOnUnhealthy && summary.overall === 'unhealthy') process.exit(1);
