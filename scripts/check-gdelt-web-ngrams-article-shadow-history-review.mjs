#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertOilNewsDiscoveryPolicy,
  evaluateWebNgramsShadowHistory
} from './oil-directional/review-gdelt-web-ngrams-article-shadow-history.mjs';

const policy = JSON.parse(readFileSync(resolve('config/oil-news-discovery-policy.json'), 'utf8'));
assertOilNewsDiscoveryPolicy(policy);

function timestampFromDate(date) {
  return date.toISOString().replace(/[-:T.Z]/gu, '').slice(0, 14);
}

function healthySample(index) {
  const generatedAt = new Date(Date.UTC(2026, 6, 1) + index * 6 * 60 * 60 * 1000).toISOString();
  return {
    commit: `synthetic-${index}`,
    cache: {
      contractVersion: 'gdelt-web-ngrams-article-shadow-cache-v1',
      generatedAt,
      status: 'shadow_observation_ready',
      sourceFile: {
        selectedTimestamp: timestampFromDate(new Date(Date.parse(generatedAt) - 20 * 60 * 1000)),
        pairAvailable: true,
        sourceStatus: 'ok'
      },
      candidateAggregate: { candidateCount: 24 },
      classificationAggregate: {
        supportedLanguageCoverageRate: 0.9,
        directionalArticleCount: 8
      },
      crossSourceAggregate: {
        referenceArticleCount: 20,
        independentSupportRate: 0.25,
        crossProviderSupportRate: 0.125
      },
      observationPolicy: {
        requiredObservationDays: 30,
        minimumUsableSamples: 120,
        comparisonProviders: ['tavily', 'brave'],
        comparisonWindowHours: 36
      },
      productionDataWriteApproved: true,
      workflowAutomationApproved: true,
      liveFetchApproved: true,
      apiKeyReadApproved: false,
      usesExistingOilNewsProviderResults: true,
      frontendDisplayApproved: false,
      shadowObservationOnly: true,
      currentSignalEnhancement: false,
      eventConfirmationSource: false,
      oilDirectionInput: false,
      eligibleForScoring: false,
      promotionEligible: false,
      boundary: 'aggregate-only shadow cache; not in current signal or scoring'
    }
  };
}

const mature = evaluateWebNgramsShadowHistory(
  Array.from({ length: 121 }, (_, index) => healthySample(index)),
  policy
);
assert.equal(mature.metrics.observationDays, 30);
assert.equal(mature.metrics.usableSampleCount, 121);
assert.equal(mature.qualityGatePassed, true);
assert.equal(mature.readyForManualCutoverReview, true);
assert.equal(mature.promotionEligible, false);
assert.equal(mature.automaticCutoverApproved, false);
assert.equal(mature.activeMode, 'gdelt_doc_primary_web_ngrams_shadow');
assert.equal(mature.requiredNextStep, 'separate reviewed manual cutover PR');

const immature = evaluateWebNgramsShadowHistory(
  Array.from({ length: 20 }, (_, index) => healthySample(index)),
  policy
);
assert.equal(immature.qualityGatePassed, false);
assert.equal(immature.status, 'collecting_shadow_history');
assert.ok(immature.gates.some((gate) => gate.name === 'observation_days' && !gate.passed));
assert.ok(immature.gates.some((gate) => gate.name === 'usable_samples' && !gate.passed));

const degradedSamples = Array.from({ length: 121 }, (_, index) => {
  const sample = healthySample(index);
  sample.cache.classificationAggregate.supportedLanguageCoverageRate = 0.4;
  sample.cache.crossSourceAggregate.independentSupportRate = 0.05;
  sample.cache.crossSourceAggregate.crossProviderSupportRate = 0.01;
  return sample;
});
const degraded = evaluateWebNgramsShadowHistory(degradedSamples, policy);
assert.equal(degraded.qualityGatePassed, false);
assert.ok(degraded.gates.some((gate) => (
  gate.name === 'median_independent_support_rate' && !gate.passed
)));

const invalid = evaluateWebNgramsShadowHistory([
  ...Array.from({ length: 121 }, (_, index) => healthySample(index)),
  { commit: 'invalid', cache: { contractVersion: 'invalid' } }
], policy);
assert.equal(invalid.qualityGatePassed, false);
assert.equal(invalid.metrics.invalidSampleCount, 1);
assert.ok(invalid.gates.some((gate) => gate.name === 'invalid_samples' && !gate.passed));

const empty = evaluateWebNgramsShadowHistory([], policy);
assert.equal(empty.status, 'insufficient_history');
assert.equal(empty.promotionEligible, false);

console.log('PASS check-gdelt-web-ngrams-article-shadow-history-review');
