import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchGdeltSummary } from './world-order/fetch-gdelt.mjs';
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

function freshnessFromSources(sources) {
  const statuses = Object.values(sources).map((source) => source.status);
  if (statuses.every((status) => status === 'ok')) return 'fresh';
  const okCount = statuses.filter((status) => ['ok', 'partial'].includes(status)).length;
  if (okCount >= 2) return 'partial';
  if (okCount === 1) return 'partial';
  if (statuses.includes('stale')) return 'stale';
  return 'error';
}

async function main() {
  const rules = readJsonIfExists(configPath, {});
  const previous = readJsonIfExists(outputPath, null);
  const dataPayload = readJsonIfExists(radarDataPath, {});
  const realtimePayload = readJsonIfExists(realtimePath, {});

  const [gdelt, ofac, sipri, acled] = await Promise.all([
    fetchGdeltSummary({ config: rules.gdelt, previousSource: previous?.externalSources?.gdelt }),
    fetchOfacSummary({ config: rules.ofac, previousSource: previous?.externalSources?.ofac }),
    importSipriSummary({ config: rules.sipri, previousSource: previous?.externalSources?.sipri }),
    fetchAcledSummary({ config: rules.acled, previousSource: previous?.externalSources?.acled })
  ]);

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
  console.log(`World order stress data written: ${path.relative(root, outputPath)}`);
  console.log(`score=${output.score} state=${output.state} freshness=${output.freshness} confidence=${output.confidence}`);
  for (const key of SOURCE_KEYS) {
    console.log(`${key}: ${output.externalSources[key].status}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
