#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { isManualArtifactPath } from './lib/check-script-helpers.mjs';
import {
  assertGdeltWebNgramsDisplayFallbackCache,
  attachGdeltWebNgramsDisplayFallbackCache
} from './oil-directional/gdelt-web-ngrams-display-fallback-cache.mjs';

const DEFAULT_TARGET = 'data/oil-news-event-watch.json';

function parseArgs(argv) {
  const options = {
    input: DEFAULT_TARGET,
    output: DEFAULT_TARGET,
    writeOutput: true,
    printJson: false,
    generatedAt: null,
    diagnosis: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--input') {
      options.input = nextValue();
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--generated-at') {
      options.generatedAt = nextValue();
    } else if (arg === '--diagnosis') {
      options.diagnosis = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (resolve(options.input) !== resolve(DEFAULT_TARGET)) {
    throw new Error(`Refusing to read Oil News artifact outside ${DEFAULT_TARGET}`);
  }
  if (options.writeOutput && resolve(options.output) !== resolve(DEFAULT_TARGET)) {
    throw new Error(`Refusing to write GDELT Web NGrams fallback cache outside ${DEFAULT_TARGET}`);
  }
  if (options.diagnosis && !isManualArtifactPath(options.diagnosis, 'manual-artifacts/oil-news/')) {
    throw new Error('Refusing to read automated GDELT Web NGrams diagnosis outside manual-artifacts/oil-news/');
  }
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, payload) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function assertOilNewsArtifact(artifact) {
  if (artifact?.schemaVersion !== 'oil-news-event-watch-1') {
    throw new Error('Input is not an oil-news-event-watch-1 production artifact.');
  }
  if (artifact?.module !== 'oil-news-event-watch') {
    throw new Error('Input module is not oil-news-event-watch.');
  }
  if (artifact?.promotionEligible !== false) {
    throw new Error('Oil News promotionEligible must remain false.');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifact = readJson(options.input);
  assertOilNewsArtifact(artifact);
  const diagnosis = options.diagnosis ? readJson(options.diagnosis) : null;
  const generatedAt = options.generatedAt || diagnosis?.generatedAt || artifact.generatedAt || new Date().toISOString();
  const updated = attachGdeltWebNgramsDisplayFallbackCache(artifact, {
    generatedAt,
    diagnosis,
    previousCache: artifact.sourceCaches?.gdeltWebNgramsFallback
  });
  assertGdeltWebNgramsDisplayFallbackCache(updated.sourceCaches.gdeltWebNgramsFallback);

  if (options.writeOutput) writeJson(options.output, updated);

  const summary = {
    status: 'ok',
    action: options.writeOutput
      ? diagnosis ? 'automated_production_display_only_cache_written' : 'production_display_only_cache_written'
      : 'dry_run_no_output',
    outputPath: options.writeOutput ? resolve(options.output) : null,
    fieldPath: 'sourceCaches.gdeltWebNgramsFallback',
    cacheStatus: updated.sourceCaches.gdeltWebNgramsFallback.status,
    productionDataWriteApproved: updated.sourceCaches.gdeltWebNgramsFallback.productionDataWriteApproved,
    currentSignalEnhancement: updated.sourceCaches.gdeltWebNgramsFallback.currentSignalEnhancement,
    eligibleForScoring: updated.sourceCaches.gdeltWebNgramsFallback.eligibleForScoring,
    boundary: updated.sourceCaches.gdeltWebNgramsFallback.boundary
  };
  console.log(JSON.stringify(options.printJson ? updated : summary, null, 2));
}

main();
