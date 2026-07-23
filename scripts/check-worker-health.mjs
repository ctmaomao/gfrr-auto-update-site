import fs from 'node:fs';

import {
  FUTURE_TIMESTAMP_TOLERANCE_MINUTES,
  isFutureTimestampAge,
  timestampAgeMinutes
} from './health/timestamp-policy.mjs';

const WORKER_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.worker-preview.json';
const SECONDARY_PREVIEW_URL = 'https://gfrr-realtime-worker.gfrrriskradar2026.workers.dev/market.secondary-preview.json';
const FETCH_TIMEOUT_MS = 4500;
const CORE_FIELDS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y'];
const CORE_SECONDARY_SET = ['vix', 'gold', 'dxy', 'us10y', 'spx'];
const SECONDARY_FRESHNESS_PROFILES = {
  vix: { freshHours: 36, marketClosedHours: 72, staleWarningHours: Infinity },
  gold: { freshHours: 12, marketClosedHours: 36, staleWarningHours: 72 },
  dxy: { freshHours: 12, marketClosedHours: 36, staleWarningHours: 72 },
  us10y: { freshHours: 24, marketClosedHours: 72, staleWarningHours: 120 },
  spx: { freshHours: 24, marketClosedHours: 72, staleWarningHours: 120 },
};
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

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
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
  const rawAgeMinutes = timestampAgeMinutes(updatedAt);
  if (rawAgeMinutes == null) return null;
  if (isFutureTimestampAge(rawAgeMinutes)) return Math.floor(rawAgeMinutes);
  return Math.max(0, Math.round(rawAgeMinutes));
}

function parseObservedAt(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    const parsed = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundHours(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
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

function approximatelyEqual(a, b, tolerance = 0.0002) {
  return Math.abs(a - b) <= tolerance;
}

function isLegacyUs10yNormalization(source) {
  const rawValue = positiveNumber(source.rawValue);
  const value = positiveNumber(source.value);
  return source.status === 'ok' &&
    rawValue != null &&
    rawValue <= 20 &&
    value != null &&
    source.normalization === 'divide-by-10' &&
    approximatelyEqual(value, rawValue / 10);
}

function freshnessWarningStatus(status) {
  return ['stale-warning', 'stale-critical', 'missing-observedAt', 'unparsable-observedAt'].includes(status);
}

function auditSecondaryFreshness(name, source) {
  if (!source || typeof source !== 'object') {
    return {
      observedAgeHours: null,
      freshnessStatus: 'not-applicable',
      freshnessReason: 'source-missing',
    };
  }
  if (source.status !== 'ok') {
    return {
      observedAgeHours: null,
      freshnessStatus: 'not-applicable',
      freshnessReason: `source-status-${source.status ?? 'missing'}`,
    };
  }
  if (typeof source.observedAt !== 'string' || source.observedAt.trim() === '') {
    return {
      observedAgeHours: null,
      freshnessStatus: 'missing-observedAt',
      freshnessReason: `${name}-observedAt-missing`,
    };
  }

  const observedMs = parseObservedAt(source.observedAt);
  if (observedMs == null) {
    return {
      observedAgeHours: null,
      freshnessStatus: 'unparsable-observedAt',
      freshnessReason: `${name}-observedAt-unparsable`,
    };
  }

  const rawAgeMinutes = (Date.now() - observedMs) / 60000;
  if (isFutureTimestampAge(rawAgeMinutes)) {
    return {
      observedAgeHours: Math.floor(rawAgeMinutes) / 60,
      freshnessStatus: 'future-observedAt',
      freshnessReason: `${name}-observedAt-exceeds-${FUTURE_TIMESTAMP_TOLERANCE_MINUTES}m-future-tolerance`,
    };
  }
  const ageHours = Math.max(0, rawAgeMinutes / 60);
  const observedAgeHours = roundHours(ageHours);
  const profile = SECONDARY_FRESHNESS_PROFILES[name] || { freshHours: 24, marketClosedHours: 72, staleWarningHours: 120 };

  if (ageHours <= profile.freshHours) {
    return {
      observedAgeHours,
      freshnessStatus: 'fresh',
      freshnessReason: `${name}-observedAt-within-${profile.freshHours}h`,
    };
  }
  if (ageHours <= profile.marketClosedHours) {
    return {
      observedAgeHours,
      freshnessStatus: 'market-closed-stale-ok',
      freshnessReason: `${name}-observedAt-within-market-closed-window`,
    };
  }
  if (ageHours <= profile.staleWarningHours) {
    return {
      observedAgeHours,
      freshnessStatus: 'stale-warning',
      freshnessReason: `${name}-observedAt-stale-warning`,
    };
  }
  return {
    observedAgeHours,
    freshnessStatus: 'stale-critical',
    freshnessReason: `${name}-observedAt-stale-critical`,
  };
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
  const confirmationSources = Array.isArray(promotion.confirmationSources)
    ? promotion.confirmationSources
    : [];
  const tradingEconomicsConfirmation = confirmationSources.find(
    (source) => source?.source === 'tradingeconomics:brent-crude-oil',
  ) || {};
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
  if (age != null && age < -FUTURE_TIMESTAMP_TOLERANCE_MINUTES) {
    addReason(reasons, `worker updatedAt exceeds ${FUTURE_TIMESTAMP_TOLERANCE_MINUTES} minute future tolerance`);
  }
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
    promotionSelectedValue: finiteNumber(promotion.selectedValue),
    promotionSelectedSource: promotion.selectedSource ?? null,
    promotionReason: promotion.reason ?? null,
    moveStatus: promotion.moveStatus ?? null,
    promotedChangePct: finiteNumber(promotion.promotedChangePct),
    tradingEconomics: {
      status: tradingEconomicsConfirmation.status ?? null,
      value: finiteNumber(tradingEconomicsConfirmation.value),
      observedAt: tradingEconomicsConfirmation.observedAt ?? null,
      ageHours: finiteNumber(tradingEconomicsConfirmation.ageHours),
      freshnessStatus: tradingEconomicsConfirmation.freshnessStatus ?? null,
      freshnessReason: tradingEconomicsConfirmation.freshnessReason ?? null,
    },
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
    return {
      status: null,
      value: null,
      rawValue: null,
      normalization: null,
      normalizationReason: null,
      observedAt: null,
      observedAgeHours: null,
      freshnessStatus: 'not-applicable',
      freshnessReason: 'source-missing',
      participatesInPrimary: null,
      participatesInValidation: null,
    };
  }
  if (source.source !== expected.source) addReason(reasons, `${name} source is ${source.source ?? 'missing'}`);
  if (source.provider !== expected.provider) addReason(reasons, `${name} provider is ${source.provider ?? 'missing'}`);
  if (source.participatesInPrimary !== false) addReason(reasons, `${name} participatesInPrimary must be false`);
  if (source.participatesInValidation !== false) addReason(reasons, `${name} participatesInValidation must be false`);
  if (!SECONDARY_STATUSES.has(source.status)) addReason(reasons, `${name} status invalid: ${source.status ?? 'missing'}`);
  if (source.status === 'ok' && positiveNumber(source.value) == null) addReason(reasons, `${name} status ok but value is not positive finite`);
  if (source.status === 'ok' && expected.requireRawValue && positiveNumber(source.rawValue) == null) {
    addReason(reasons, `${name} status ok but rawValue is not positive finite`);
  }
  if (expected.us10yNormalization) {
    const rawValue = positiveNumber(source.rawValue);
    const value = positiveNumber(source.value);
    const legacyNormalization = isLegacyUs10yNormalization(source);
    if (source.status === 'ok') {
      if (!['divide-by-10', 'no-op'].includes(source.normalization)) {
        addReason(reasons, `${name} normalization must be divide-by-10 or no-op when ok`);
      } else if (rawValue != null && value != null) {
        if (rawValue > 20) {
          if (source.normalization !== 'divide-by-10') addReason(reasons, `${name} rawValue > 20 must use divide-by-10`);
          if (!approximatelyEqual(value, rawValue / 10)) addReason(reasons, `${name} value must equal rawValue / 10`);
        } else if (source.normalization !== 'no-op' || !approximatelyEqual(value, rawValue)) {
          if (legacyNormalization) {
            addReason(warnings, `${name} uses pre-E-3A divide-by-10 normalization for rawValue <= 20`);
          } else {
            addReason(reasons, `${name} rawValue <= 20 must use no-op normalization`);
          }
        }
      }
      if (typeof source.normalizationReason !== 'string' || source.normalizationReason.trim() === '') {
        if (legacyNormalization) {
          addReason(warnings, `${name} missing normalizationReason in pre-E-3A payload`);
        } else {
          addReason(reasons, `${name} normalizationReason must be a non-empty string when ok`);
        }
      }
    } else if (source.status === 'failed' || source.status === 'unavailable') {
      if (source.normalization !== 'unknown') addReason(warnings, `${name} normalization should be unknown when not ok`);
    }
  }
  if (source.status === 'failed' || source.status === 'unavailable') {
    addReason(warnings, `${name} secondary status is ${source.status}`);
  }
  const freshness = auditSecondaryFreshness(name, source);
  if (freshness.freshnessStatus === 'future-observedAt') {
    addReason(reasons, `${name} freshness ${freshness.freshnessStatus}: ${freshness.freshnessReason}`);
  } else if (freshnessWarningStatus(freshness.freshnessStatus)) {
    addReason(warnings, `${name} freshness ${freshness.freshnessStatus}: ${freshness.freshnessReason}`);
  }

  return {
    status: source.status ?? null,
    value: finiteNumber(source.value),
    rawValue: finiteNumber(source.rawValue),
    normalization: source.normalization ?? null,
    normalizationReason: source.normalizationReason ?? null,
    observedAt: source.observedAt ?? null,
    observedAgeHours: freshness.observedAgeHours,
    freshnessStatus: freshness.freshnessStatus,
    freshnessReason: freshness.freshnessReason,
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
  if (age != null && age < -FUTURE_TIMESTAMP_TOLERANCE_MINUTES) {
    addReason(reasons, `secondary updatedAt exceeds ${FUTURE_TIMESTAMP_TOLERANCE_MINUTES} minute future tolerance`);
  }
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
      requireRawValue: true,
      us10yNormalization: true,
    },
    reasons,
    warnings,
  );
  const spx = checkSecondarySource(
    'spx',
    sources.spx,
    { provider: 'yahoo', source: 'yahoo:^GSPC' },
    reasons,
    warnings,
  );
  if (!sources.vix && !sources.gold && !sources.dxy && !sources.us10y && !sources.spx) {
    addReason(reasons, 'VIX, Gold, DXY, US10Y, and SPX secondary sources are all missing');
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
    spx,
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

function actionForOverall(overall) {
  if (overall === 'ok') return 'No action needed';
  if (overall === 'warning') return 'Monitor';
  return 'Investigate Worker runtime';
}

function interpretationForOverall(overall) {
  if (overall === 'ok') return 'Worker-first runtime is healthy. No action needed.';
  if (overall === 'warning') {
    return 'Worker-first runtime is usable, but one or more secondary/freshness observations need monitoring.';
  }
  return 'Worker-first runtime hard gate failed. Investigate before continuing deployments or source changes.';
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
  console.log('Worker-first Health Check');
  console.log('Role: hard gate for Cloudflare Worker runtime');
  console.log(`Overall: ${summary.overall}`);
  console.log(`Action: ${actionForOverall(summary.overall)}`);
  console.log(`Interpretation: ${interpretationForOverall(summary.overall)}`);
  console.log('');
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
  console.log(`  coreSecondarySet: ${CORE_SECONDARY_SET.join(',')}`);
  console.log(`  updatedAt: ${summary.secondary.updatedAt}`);
  console.log(`  ageMinutes: ${summary.secondary.ageMinutes}`);
  console.log(`  sourceMode: ${summary.secondary.sourceMode}`);
  console.log(`  unavailable: ${summary.secondary.unavailable}`);
  console.log(`  vix: ${summary.secondary.vix?.status ?? 'missing'} ${summary.secondary.vix?.value ?? '--'} ${summary.secondary.vix?.observedAt ?? '--'} freshness=${summary.secondary.vix?.freshnessStatus ?? '--'} ageHours=${summary.secondary.vix?.observedAgeHours ?? '--'} reason=${summary.secondary.vix?.freshnessReason ?? '--'}`);
  console.log(`  gold: ${summary.secondary.gold?.status ?? 'missing'} ${summary.secondary.gold?.value ?? '--'} ${summary.secondary.gold?.observedAt ?? '--'} freshness=${summary.secondary.gold?.freshnessStatus ?? '--'} ageHours=${summary.secondary.gold?.observedAgeHours ?? '--'} reason=${summary.secondary.gold?.freshnessReason ?? '--'}`);
  console.log(`  dxy: ${summary.secondary.dxy?.status ?? 'missing'} ${summary.secondary.dxy?.value ?? '--'} ${summary.secondary.dxy?.observedAt ?? '--'} freshness=${summary.secondary.dxy?.freshnessStatus ?? '--'} ageHours=${summary.secondary.dxy?.observedAgeHours ?? '--'} reason=${summary.secondary.dxy?.freshnessReason ?? '--'}`);
  console.log(`  us10y: ${summary.secondary.us10y?.status ?? 'missing'} ${summary.secondary.us10y?.value ?? '--'} raw=${summary.secondary.us10y?.rawValue ?? '--'} normalization=${summary.secondary.us10y?.normalization ?? '--'} reason=${summary.secondary.us10y?.normalizationReason ?? '--'} ${summary.secondary.us10y?.observedAt ?? '--'} freshness=${summary.secondary.us10y?.freshnessStatus ?? '--'} ageHours=${summary.secondary.us10y?.observedAgeHours ?? '--'} freshnessReason=${summary.secondary.us10y?.freshnessReason ?? '--'}`);
  console.log(`  spx: ${summary.secondary.spx?.status ?? 'missing'} ${summary.secondary.spx?.value ?? '--'} ${summary.secondary.spx?.observedAt ?? '--'} freshness=${summary.secondary.spx?.freshnessStatus ?? '--'} ageHours=${summary.secondary.spx?.observedAgeHours ?? '--'} reason=${summary.secondary.spx?.freshnessReason ?? '--'}`);
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

function jsonValue(value) {
  return value === undefined ? null : value;
}

function snapshotSecondarySource(source, includeUs10y = false) {
  const base = {
    status: jsonValue(source?.status),
    value: jsonValue(source?.value),
    observedAt: jsonValue(source?.observedAt),
    freshnessStatus: jsonValue(source?.freshnessStatus),
    observedAgeHours: jsonValue(source?.observedAgeHours),
    freshnessReason: jsonValue(source?.freshnessReason),
  };
  if (!includeUs10y) return base;
  return {
    ...base,
    rawValue: jsonValue(source?.rawValue),
    normalization: jsonValue(source?.normalization),
    normalizationReason: jsonValue(source?.normalizationReason),
  };
}

function buildSnapshot(summary) {
  return {
    schemaVersion: 'v28.0G-7A',
    generatedAt: summary.checkedAt,
    role: 'worker-first-hard-gate',
    overall: summary.overall,
    action: actionForOverall(summary.overall),
    interpretation: interpretationForOverall(summary.overall),
    worker: {
      status: jsonValue(summary.worker.status),
      updatedAt: jsonValue(summary.worker.updatedAt),
      ageMinutes: jsonValue(summary.worker.ageMinutes),
      sourceMode: jsonValue(summary.worker.sourceMode),
      healthScore: jsonValue(summary.worker.healthScore),
      criticalMissing: jsonValue(summary.worker.criticalMissing),
      unavailable: jsonValue(summary.worker.unavailable),
      brent: jsonValue(summary.worker.brent),
      gold: jsonValue(summary.worker.gold),
      promotionApplied: jsonValue(summary.worker.promotionApplied),
      moveStatus: jsonValue(summary.worker.moveStatus),
      sourceProbeReused: jsonValue(summary.worker.sourceProbeReused),
      sourceProbeFrequencyMinutes: jsonValue(summary.worker.sourceProbeFrequencyMinutes),
      sourceProbeCount: jsonValue(summary.worker.sourceProbeCount),
      secondaryPollution: jsonValue(summary.worker.secondaryPollution),
    },
    brent: {
      promotionApplied: jsonValue(summary.worker.promotionApplied),
      selectedValue: jsonValue(summary.worker.promotionSelectedValue),
      selectedSource: jsonValue(summary.worker.promotionSelectedSource),
      reason: jsonValue(summary.worker.promotionReason),
      moveStatus: jsonValue(summary.worker.moveStatus),
      promotedChangePct: jsonValue(summary.worker.promotedChangePct),
      tradingEconomics: {
        status: jsonValue(summary.worker.tradingEconomics?.status),
        value: jsonValue(summary.worker.tradingEconomics?.value),
        observedAt: jsonValue(summary.worker.tradingEconomics?.observedAt),
        ageHours: jsonValue(summary.worker.tradingEconomics?.ageHours),
        freshnessStatus: jsonValue(summary.worker.tradingEconomics?.freshnessStatus),
        freshnessReason: jsonValue(summary.worker.tradingEconomics?.freshnessReason),
      },
    },
    secondary: {
      status: jsonValue(summary.secondary.status),
      updatedAt: jsonValue(summary.secondary.updatedAt),
      ageMinutes: jsonValue(summary.secondary.ageMinutes),
      sourceMode: jsonValue(summary.secondary.sourceMode),
      unavailable: jsonValue(summary.secondary.unavailable),
      coreSecondarySet: CORE_SECONDARY_SET,
      sources: {
        vix: snapshotSecondarySource(summary.secondary.vix),
        gold: snapshotSecondarySource(summary.secondary.gold),
        dxy: snapshotSecondarySource(summary.secondary.dxy),
        us10y: snapshotSecondarySource(summary.secondary.us10y, true),
        spx: snapshotSecondarySource(summary.secondary.spx),
      },
    },
    reasons: summary.reasons,
  };
}

function validateSnapshotPath(snapshotPath) {
  if (!snapshotPath) return null;
  const normalized = snapshotPath.replace(/\\/gu, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) {
    throw new Error('--snapshot-file must be a relative path');
  }
  if (normalized.split('/').some((part) => part === '..')) {
    throw new Error('--snapshot-file must not contain parent directory segments');
  }
  if (/(^|\/)(data|realtime)(\/|$)/u.test(normalized)) {
    throw new Error('--snapshot-file must not write into data/ or realtime/');
  }
  return snapshotPath;
}

function writeSnapshot(summary, snapshotPath) {
  if (!snapshotPath) return;
  const safePath = validateSnapshotPath(snapshotPath);
  fs.writeFileSync(safePath, `${JSON.stringify(buildSnapshot(summary), null, 2)}\n`);
  console.log(`Worker health snapshot written: ${safePath}`);
}

function appendGithubSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '## Worker-first Health Check',
    '',
    'Role: **hard gate for Cloudflare Worker runtime**',
    '',
    `Overall: **${summary.overall}**`,
    '',
    `Action: **${actionForOverall(summary.overall)}**`,
    '',
    '### Interpretation',
    '',
    interpretationForOverall(summary.overall),
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
    `| core secondary set | ${tableValue(CORE_SECONDARY_SET.join(', '))} |`,
    `| updatedAt | ${tableValue(summary.secondary.updatedAt)} |`,
    `| ageMinutes | ${tableValue(summary.secondary.ageMinutes)} |`,
    `| sourceMode | ${tableValue(summary.secondary.sourceMode)} |`,
    `| unavailable | ${tableValue(summary.secondary.unavailable)} |`,
    `| VIX | ${tableValue(`${summary.secondary.vix?.status ?? 'missing'} / ${summary.secondary.vix?.value ?? '--'} / ${summary.secondary.vix?.observedAt ?? '--'} / ${summary.secondary.vix?.freshnessStatus ?? '--'} / age ${summary.secondary.vix?.observedAgeHours ?? '--'}h / ${summary.secondary.vix?.freshnessReason ?? '--'}`)} |`,
    `| Gold | ${tableValue(`${summary.secondary.gold?.status ?? 'missing'} / ${summary.secondary.gold?.value ?? '--'} / ${summary.secondary.gold?.observedAt ?? '--'} / ${summary.secondary.gold?.freshnessStatus ?? '--'} / age ${summary.secondary.gold?.observedAgeHours ?? '--'}h / ${summary.secondary.gold?.freshnessReason ?? '--'}`)} |`,
    `| DXY | ${tableValue(`${summary.secondary.dxy?.status ?? 'missing'} / ${summary.secondary.dxy?.value ?? '--'} / ${summary.secondary.dxy?.observedAt ?? '--'} / ${summary.secondary.dxy?.freshnessStatus ?? '--'} / age ${summary.secondary.dxy?.observedAgeHours ?? '--'}h / ${summary.secondary.dxy?.freshnessReason ?? '--'}`)} |`,
    `| US10Y | ${tableValue(`${summary.secondary.us10y?.status ?? 'missing'} / ${summary.secondary.us10y?.value ?? '--'} / raw ${summary.secondary.us10y?.rawValue ?? '--'} / normalization ${summary.secondary.us10y?.normalization ?? '--'} / ${summary.secondary.us10y?.normalizationReason ?? '--'} / ${summary.secondary.us10y?.observedAt ?? '--'} / ${summary.secondary.us10y?.freshnessStatus ?? '--'} / age ${summary.secondary.us10y?.observedAgeHours ?? '--'}h / ${summary.secondary.us10y?.freshnessReason ?? '--'}`)} |`,
    `| SPX | ${tableValue(`${summary.secondary.spx?.status ?? 'missing'} / ${summary.secondary.spx?.value ?? '--'} / ${summary.secondary.spx?.observedAt ?? '--'} / ${summary.secondary.spx?.freshnessStatus ?? '--'} / age ${summary.secondary.spx?.observedAgeHours ?? '--'}h / ${summary.secondary.spx?.freshnessReason ?? '--'}`)} |`,
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
const snapshotFile = (() => {
  if (!hasArg('--snapshot-file')) return null;
  const value = argValue('--snapshot-file');
  if (!value) {
    console.error('--snapshot-file requires a relative output path');
    process.exit(1);
  }
  try {
    return validateSnapshotPath(value);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();

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
writeSnapshot(summary, snapshotFile);
if (failOnUnhealthy && summary.overall === 'unhealthy') process.exit(1);
