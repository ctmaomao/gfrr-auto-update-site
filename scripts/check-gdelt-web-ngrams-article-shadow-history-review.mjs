#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertOilNewsDiscoveryPolicy,
  evaluateWebNgramsShadowHistory
} from './oil-directional/review-gdelt-web-ngrams-article-shadow-history.mjs';
import { WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT } from './oil-directional/gdelt-web-ngrams-cross-source-telemetry.mjs';

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
      crossSourceTelemetryContractVersion: WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT,
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
        webCandidateCount: 24,
        referenceArticleCount: 20,
        excludedReferenceArticleCount: 0,
        exactDiscoveryMatchCount: 0,
        exactDiscoveryMatchRate: 0,
        independentSupportCandidateCount: 6,
        independentSupportRate: 0.25,
        crossProviderSupportCandidateCount: 3,
        crossProviderSupportRate: 0.125,
        providerDiscoveryCounts: { tavily: 0, brave: 0 },
        providerIndependentSupportCounts: { tavily: 6, brave: 3 },
        diagnostics: {
          web: { totalCount: 24, directionalCount: 8, validDateCount: 24,
            missingDateCount: 0, invalidDateCount: 0, futureDateCount: 0 },
          reference: { totalCount: 20, directionalCount: 8, validDateCount: 20,
            missingDateCount: 0, invalidDateCount: 0, futureDateCount: 0 },
          comparison: { windowComparableWebCount: 24, directionalWindowComparableWebCount: 8,
            independentDomainSupportedWebCount: 6 }
        }
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
assert.equal(immature.status, 'collecting_requalified_shadow_history');
assert.ok(immature.gates.some((gate) => gate.name === 'observation_days' && !gate.passed));
assert.ok(immature.gates.some((gate) => gate.name === 'usable_samples' && !gate.passed));

const degradedSamples = Array.from({ length: 121 }, (_, index) => {
  const sample = healthySample(index);
  sample.cache.classificationAggregate.supportedLanguageCoverageRate = 0.4;
  sample.cache.crossSourceAggregate.independentSupportCandidateCount = 1;
  sample.cache.crossSourceAggregate.independentSupportRate = 0.0417;
  sample.cache.crossSourceAggregate.crossProviderSupportCandidateCount = 0;
  sample.cache.crossSourceAggregate.crossProviderSupportRate = 0;
  sample.cache.crossSourceAggregate.providerIndependentSupportCounts = { tavily: 1, brave: 0 };
  sample.cache.crossSourceAggregate.diagnostics.comparison.independentDomainSupportedWebCount = 1;
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

function legacySample(index) {
  const sample = healthySample(index);
  delete sample.cache.crossSourceTelemetryContractVersion;
  delete sample.cache.crossSourceAggregate.diagnostics;
  return sample;
}
const legacyRows = Array.from({ length: 223 }, (_, index) => legacySample(index));
const legacyReview = evaluateWebNgramsShadowHistory(legacyRows, policy);
assert.equal(legacyReview.metrics.validSampleCount, 223);
assert.equal(legacyReview.metrics.usableSampleCount, 223);
assert.equal(legacyReview.metrics.observationDays, 55.5);
assert.equal(legacyReview.legacySampleCount, 223);
assert.equal(legacyReview.qualityMetrics.validSampleCount, 0);
assert.equal(legacyReview.qualityMetrics.usableSampleCount, 0);
assert.equal(legacyReview.qualityMetrics.medianIndependentSupportRate, null);
assert.equal(legacyReview.status, 'legacy_samples_require_requalification');
assert.equal(legacyReview.qualityGatePassed, false);
assert.equal(legacyReview.legacyAggregatesRecomputed, false);

const mixed = evaluateWebNgramsShadowHistory([
  ...legacyRows, ...Array.from({ length: 119 }, (_, i) => healthySample(i + 300))
], policy);
assert.equal(mixed.metrics.usableSampleCount, 342);
assert.equal(mixed.qualityMetrics.usableSampleCount, 119);
assert.equal(mixed.qualityMetrics.observationDays, 29.5);
assert.equal(mixed.qualityGatePassed, false);
assert.equal(mixed.gates.find(row => row.name === 'usable_samples').actual, 119);
const oneHundredTwenty = Array.from({ length: 120 }, (_, i) => healthySample(i));
assert.equal(evaluateWebNgramsShadowHistory(oneHundredTwenty, policy).qualityGatePassed, false);
oneHundredTwenty[119] = healthySample(120);
assert.equal(evaluateWebNgramsShadowHistory(oneHundredTwenty, policy).qualityGatePassed, true);
assert.equal(mature.qualityMetrics.observationDays, 30);
assert.equal(mature.legacySampleCount, 0);

const failingCohort = Array.from({ length: 121 }, (_, i) => {
  const sample = healthySample(i);
  if (i >= 105) Object.assign(sample.cache, { status: 'source_unavailable',
    sourceFile: { selectedTimestamp: null, pairAvailable: false, sourceStatus: 'source_unavailable' },
    candidateAggregate: null, classificationAggregate: null, crossSourceAggregate: null });
  return sample;
});
const failingReview = evaluateWebNgramsShadowHistory([...legacyRows, ...failingCohort.map((sample, i) => {
  const offset = healthySample(i + 300);
  sample.cache.generatedAt = offset.cache.generatedAt;
  if (sample.cache.sourceFile.pairAvailable) sample.cache.sourceFile = offset.cache.sourceFile;
  return sample;
})], policy);
assert.equal(failingReview.qualityMetrics.validSampleCount, 121);
assert.equal(failingReview.qualityMetrics.pairAvailabilityRate, 0.8678);
assert.equal(failingReview.gates.find(row => row.name === 'pair_availability_rate').passed, false);

console.log('PASS check-gdelt-web-ngrams-article-shadow-history-review');
