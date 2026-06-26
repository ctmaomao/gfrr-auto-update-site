import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT,
  fetchGdeltCloudSummary
} from './world-order/fetch-gdelt-cloud.mjs';
import { fetchOfacSummary } from './world-order/fetch-ofac.mjs';
import { importSipriSummary } from './world-order/import-sipri.mjs';
import { fetchAcledSummary } from './world-order/fetch-acled.mjs';
import { buildMarketConfirmation, selectMarketConfirmationInput } from './world-order/build-market-confirmation.mjs';
import { scoreWorldOrderStress } from './world-order/score-world-order-stress.mjs';
import {
  SOURCE_KEYS,
  WORLD_ORDER_WARNING,
  buildSourceResult,
  compactObject,
  isoNow
} from './world-order/normalize-world-order-inputs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config', 'world-order-rules.json');
const outputPath = path.join(root, 'data', 'world-order-stress.json');
const gdeltCacheOutputPath = path.join(root, DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT);
const radarDataPath = path.join(root, 'data', 'radar-data.json');
const realtimePath = path.join(root, 'realtime', 'market.json');

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function normalizeSourceMap(sources) {
  const normalized = {};
  for (const key of SOURCE_KEYS) {
    normalized[key] = sources[key] || buildSourceResult({
      enabled: false,
      status: 'error',
      summary: { errors: [`${key} source did not return a result`] },
      confidence: 0
    });
  }
  return normalized;
}

function stripBuildOnlyFields(source) {
  if (!source || typeof source !== 'object') return source;
  const { cacheArtifact: _cacheArtifact, ...publicSource } = source;
  return publicSource;
}

function freshnessFromSources(sources) {
  const statuses = Object.values(sources).map((source) => source.status);
  if (statuses.every((status) => status === 'ok')) return 'fresh';
  const okCount = statuses.filter((status) => ['ok', 'partial'].includes(status)).length;
  if (okCount >= 2) return 'partial';
  if (okCount === 1) return 'partial';
  if (statuses.includes('stale')) return 'stale';
  return 'error';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtValue(value) {
  const numeric = finiteOrNull(value);
  if (numeric === null) return 'null';
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(2)));
}

function fmtText(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return String(value).replace(/\s+/gu, ' ').trim();
}

function fmtPercent(value) {
  const numeric = finiteOrNull(value);
  return numeric === null ? 'null' : `${Math.round(numeric * 100)}%`;
}

function shortNote(value, maxLength = 120) {
  const text = fmtText(value);
  if (text === 'null' || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function printBuildSummary(output) {
  const gdelt = output.externalSources?.gdelt || {};
  const gdeltSummary = gdelt.summary || {};
  const ofac = output.externalSources?.ofac || {};
  const ofacSummary = ofac.summary || {};
  const sipri = output.externalSources?.sipri || {};
  const sipriSummary = sipri.summary || {};
  const acled = output.externalSources?.acled || {};
  const marketConfirmation = output.dimensions?.marketConfirmation || {};
  const marketInput = output.marketConfirmationInput || {};
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];

  console.log('');
  console.log('World Order Stress Build Summary');
  console.log(`updatedAt: ${fmtText(output.updatedAt)}`);
  console.log(`score: ${fmtValue(output.score)}`);
  console.log(`state: ${fmtText(output.state)} / ${fmtText(output.labelZh)}`);
  console.log(`confidence: ${fmtPercent(output.confidence)}`);
  console.log(`freshness: ${fmtText(output.freshness)}`);
  console.log('');
  console.log('Sources');
  console.log(`GDELT: ${fmtText(gdelt.status)} success=${fmtValue(gdeltSummary.successCount)} failed=${fmtValue(gdeltSummary.failureCount)} rateLimited=${fmtValue(gdeltSummary.rateLimitedCount)} cached=${gdeltSummary.usedCachedSummary === true}`);
  if (gdelt.status === 'stale' || gdelt.status === 'partial') {
    console.log(`GDELT reason: ${shortNote(gdeltSummary.cacheReason || (Array.isArray(gdeltSummary.errors) ? gdeltSummary.errors.join('; ') : null))}`);
  }
  console.log(`OFAC: ${fmtText(ofac.status)} recentActions=${fmtValue(ofacSummary.recentActionsCount)} listUpdates=${fmtValue(ofacSummary.listUpdatesCount)}`);
  console.log(`SIPRI: ${fmtText(sipri.status)} updatedYear=${fmtValue(sipriSummary.updatedYear)} note=${shortNote(sipriSummary.noteZh)}`);
  console.log(`ACLED: ${fmtText(acled.status)} enabled=${acled.enabled === true}`);
  if (acled.status === 'not_configured') {
    console.log('ACLED reason: not configured; GDELT remains the proxy conflict event layer.');
  }
  console.log('');
  console.log('Market confirmation');
  console.log(`source: ${fmtText(marketInput.source)}`);
  console.log(`brent: ${fmtValue(marketInput.brent)}`);
  console.log(`gold: ${fmtValue(marketInput.gold)}`);
  console.log(`state: ${fmtText(marketConfirmation.state)}`);
  console.log(`score: ${fmtValue(marketConfirmation.score)}`);
  console.log('');
  console.log('Warnings');
  if (warnings.length === 0) {
    console.log('- none');
  } else {
    for (const warning of warnings) {
      console.log(`- ${fmtText(warning)}`);
    }
  }
}

async function main() {
  const rules = readJsonIfExists(configPath, {});
  const previous = readJsonIfExists(outputPath, null);
  const dataPayload = readJsonIfExists(radarDataPath, {});
  const realtimePayload = readJsonIfExists(realtimePath, {});

  const [gdeltRaw, ofac, sipri, acled] = await Promise.all([
    fetchGdeltCloudSummary({ config: rules.gdelt, previousSource: previous?.externalSources?.gdelt }),
    fetchOfacSummary({ config: rules.ofac, previousSource: previous?.externalSources?.ofac }),
    importSipriSummary({ config: rules.sipri, previousSource: previous?.externalSources?.sipri }),
    fetchAcledSummary({ config: rules.acled, previousSource: previous?.externalSources?.acled })
  ]);
  const gdeltCacheArtifact = gdeltRaw?.cacheArtifact || null;
  const gdelt = stripBuildOnlyFields(gdeltRaw);

  const externalSources = normalizeSourceMap({ gdelt, ofac, sipri, acled });
  const marketConfirmationInput = await selectMarketConfirmationInput({ dataPayload, realtimePayload });
  const marketConfirmation = buildMarketConfirmation({ marketConfirmationInput, rules });
  const scored = scoreWorldOrderStress({ externalSources, marketConfirmation, dataPayload, rules });
  const freshness = freshnessFromSources(externalSources);
  const sourceMode = freshness === 'fresh'
    ? 'computed_with_external_sources'
    : freshness === 'partial' || freshness === 'stale'
      ? 'computed_with_partial_external_sources'
      : 'computed_with_source_errors';
  const warnings = [
    ...new Set([
      ...scored.warnings,
      ...(freshness === 'error' ? ['外部数据源本轮异常，当前结果仅保留结构和低置信度状态。'] : []),
      WORLD_ORDER_WARNING
    ])
  ];

  const output = compactObject({
    version: '1.0.0',
    updatedAt: isoNow(),
    sourceMode,
    score: scored.score,
    state: scored.state,
    labelZh: scored.labelZh,
    confidence: scored.confidence,
    freshness,
    marketConfirmationInput,
    externalSources: Object.fromEntries(
      SOURCE_KEYS.map((key) => {
        const source = externalSources[key];
        return [key, {
          enabled: source.enabled,
          status: source.status,
          lastFetchedAt: source.lastFetchedAt,
          summary: source.summary
        }];
      })
    ),
    dimensions: scored.dimensions,
    dominantDrivers: scored.dominantDrivers,
    systemInterpretationZh: scored.systemInterpretationZh,
    decisionModifier: scored.decisionModifier,
    warnings
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  if (gdeltCacheArtifact) {
    fs.writeFileSync(gdeltCacheOutputPath, `${JSON.stringify(compactObject(gdeltCacheArtifact), null, 2)}\n`);
    console.log(`World order GDELT cache written: ${path.relative(root, gdeltCacheOutputPath)}`);
  }
  console.log(`World order stress data written: ${path.relative(root, outputPath)}`);
  printBuildSummary(output);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
