import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEvidenceManifest, validateEvidenceManifest, readEvidenceManifest, DEFAULT_MANIFEST_PATH } from '../../scripts/lib/free-proxy-evidence-manifest.mjs';

const REVIEWED_AT = '2020-02-01T00:00:00.000Z';
const clone = value => structuredClone(value);
const approvals = ['productionHistoricalReplayPerformed', 'historicalBacktestPerformed', 'scoreIntegrationApproved',
  'scoreWriteApproved', 'productionWriteApproved', 'productionDisplayApproved', 'frontendDisplayApproved', 'mainScoreApproved', 'eligibleForMainScore'];
const impactKeys = ['writesProductionData', 'modifiesFrontend', 'modifiesWorkerRuntime', 'modifiesWorkflow', 'affectsValues',
  'affectsDisplayInputsBaseline', 'affectsEffectiveDisplayInputs', 'affectsScoring', 'affectsDecisionModel', 'affectsExecutionLock',
  'affectsPositionGuidance', 'affectsBrentPromotion', 'affectsOdpFinalBias', 'affectsMainJudgment', 'affectsGlobalRiskHeatmap', 'affectsCrossValidation'];
const boundaryTrue = ['outputOnlyToManualArtifacts', 'noNetworkCall', 'noEnvironmentRead', 'noProductionDataRead',
  'noProductionWrite', 'noRealtimeWrite', 'noWorkflowChange', 'noFrontendChange', 'noWorkerRuntimeChange', 'noScoreWrite',
  'noReplayExecution', 'noProductionReplayExecution', 'noHistoricalBacktestPerformed'];

function sourceSample(id = 'manual-example-1', family = 'known_disruption_tightening') {
  const contribution = family === 'known_disruption_tightening' ? 2 : 0;
  return {
    schemaVersion: 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1',
    contractVersion: 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-manual-archive-v1',
    status: 'sample_review_ready_keep_no_score_write', recommendation: 'manual_review_only',
    generatedAt: '2020-01-31T00:00:00.000Z', inputPath: 'manual-artifacts/transport-shock-confirmation-factor/example.json',
    sampleId: id, familyKey: family, sampleWindow: { startDate: '2019-01-01', endDate: '2019-01-31' },
    expectedContributionPct: contribution, observedCandidateContributionPct: contribution,
    confirmations: { transportProxy: 'Private manual notes omitted from manifest', marketConfirmation: 'Manual context', physicalAnchor: 'Manual context', newsClaimLedger: 'Manual context' },
    acceptedForFutureReplayDataset: true, realEventCandidate: true, historicalReplayRunnerImplemented: true,
    ...Object.fromEntries(approvals.map(key => [key, false])),
    routeFreightConfirmation: 'not_connected', marketConfirmation: 'not_connected',
    review: {
      evidenceCount: 1,
      compactEvidence: [{ sourceFamily: 'official_energy_context', sourceStatus: 'manual_reference',
        direction: family === 'known_disruption_tightening' ? 'tightening' : 'zero_contribution_control', confirmationType: 'physical_proxy',
        sourceCitationHash: 'a'.repeat(64), sourceDomainHint: 'eia.gov', rawCitationStored: false }],
      rawCitationStored: false, blockers: [], warnings: ['manual_only']
    },
    productionImpact: Object.fromEntries(impactKeys.map(key => [key, false])),
    boundaries: { ...Object.fromEntries(boundaryTrue.map(key => [key, true])), rawCitationStored: false, affectsScoring: false, affectsMainJudgment: false },
    boundary: 'manual only; no score writes', limitationZh: 'Manual review, not a model backtest.'
  };
}

function manifest() {
  return createEvidenceManifest([{ raw: JSON.stringify(sourceSample()) }], { reviewedAt: REVIEWED_AT });
}

test('manifest retains only reviewed metadata and hashes exact original bytes', () => {
  const source = sourceSample();
  const raw = Buffer.from(JSON.stringify(source, null, 2));
  const result = createEvidenceManifest([{ raw }], { reviewedAt: REVIEWED_AT });
  assert.equal(validateEvidenceManifest(result), result);
  assert.equal(result.samples[0].sourceReviewSha256, createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(result.samples[0].sampleWindow, source.sampleWindow);
  assert.equal(result.samples[0].observedCandidateContributionPct, 2);
  assert.equal(result.contributionBasis, 'manual_review_not_model_backtest');
  assert.equal(result.boundaries.historicalBacktestPerformed, false);
  assert.equal(result.boundaries.scoreIntegrationApproved, false);
  assert.equal(result.boundaries.routeFreightConfirmation, 'not_connected');
  assert.equal(JSON.stringify(result).includes('Private manual notes'), false);
  assert.equal(JSON.stringify(result).includes('inputPath'), false);
  assert.equal(JSON.stringify(result).includes('confirmations'), false);
});

test('all six family enums accept explicit no-score manual metadata', () => {
  const families = ['known_disruption_tightening', 'headline_only_false_positive', 'single_chokepoint_noise',
    'stale_physical_proxy', 'market_confirmation_divergence', 'benign_baseline'];
  const result = createEvidenceManifest(families.map((family, index) => ({ raw: JSON.stringify(sourceSample(`sample-${index}`, family)) })), { reviewedAt: REVIEWED_AT });
  assert.equal(result.samples.length, 6);
  assert.equal(result.samples.filter(sample => sample.observedCandidateContributionPct === 0).length, 5);
});

test('unknown fields are rejected recursively at every manifest object level', () => {
  const edits = [
    d => { d.extra = true; }, d => { d.boundaries.extra = false; }, d => { d.samples[0].extra = false; },
    d => { d.samples[0].sampleWindow.extra = false; }, d => { d.samples[0].compactEvidence[0].extra = false; },
    d => { d.samples[0].compactEvidence[0].sourceCitation = 'redacted'; },
    d => { d.samples[0].sampleWindow = null; }, d => { d.boundaries = []; },
    d => { d.samples[0] = Object.create({ sampleId: 'inherited' }); }
  ];
  for (const edit of edits) { const value = manifest(); edit(value); assert.throws(() => validateEvidenceManifest(value)); }
});

test('approval, basis, evidence enums, plain domains and hash validation fail closed', () => {
  const edits = [
    d => { d.schemaVersion = 'other'; }, d => { d.contributionBasis = 'model_backtest'; },
    d => { d.boundaries.scoreIntegrationApproved = true; }, d => { d.boundaries.noNetworkCall = false; },
    d => { d.boundaries.marketConfirmation = 'connected'; }, d => { delete d.boundaries.scoreWriteApproved; },
    d => { d.samples[0].sampleId = 'bad/path'; }, d => { d.samples[0].familyKey = 'unknown'; },
    d => { d.samples[0].sourceReviewSha256 = 'bad'; }, d => { d.samples[0].compactEvidence[0].sourceCitationHash = 'not-a-hash'; },
    d => { d.samples[0].compactEvidence[0].rawCitationStored = true; }, d => { d.samples[0].compactEvidence = []; },
    d => { d.samples[0].compactEvidence[0].sourceStatus = 'live'; },
    d => { d.samples[0].compactEvidence[0].direction = 'neutral'; },
    d => { d.samples[0].compactEvidence[0].confirmationType = 'actual_route_confirmation'; },
    d => { d.samples[0].compactEvidence[0].sourceFamily = 'licensed-feed'; },
    ...['https://eia.gov', 'eia.gov/path', 'eia.gov?q=1', 'eia.gov:443', 'a@eia.gov', '-eia.gov', 'eia..gov', '127.0.0.1'].map(domain =>
      d => { d.samples[0].compactEvidence[0].sourceDomainHint = domain; })
  ];
  for (const edit of edits) { const value = manifest(); edit(value); assert.throws(() => validateEvidenceManifest(value)); }
});

test('dates reject normalization, future windows and future audit timestamps', () => {
  const edits = [
    d => { d.reviewedAt = '2020-02-30T00:00:00.000Z'; },
    d => { d.reviewedAt = new Date(Date.now() + 86400000).toISOString(); },
    d => { d.samples[0].generatedAt = '2020-02-30T00:00:00.000Z'; },
    d => { d.samples[0].generatedAt = '2020-02-02T00:00:00.000Z'; },
    d => { d.samples[0].generatedAt = '2020-01-31T24:00:00Z'; },
    d => { d.samples[0].sampleWindow.endDate = '2019-02-29'; },
    d => { d.samples[0].sampleWindow.endDate = '2020-02-02'; },
    d => { d.samples[0].sampleWindow.startDate = '2019-02-01'; },
    d => { d.samples[0].sampleWindow.startDate = '01/01/2019'; }
  ];
  for (const edit of edits) { const value = manifest(); edit(value); assert.throws(() => validateEvidenceManifest(value)); }
  const valid = manifest(); valid.samples[0].generatedAt = '2020-01-31T00:00:00Z';
  assert.doesNotThrow(() => validateEvidenceManifest(valid));
});

test('numeric values are strict and zero controls cannot claim contributions', () => {
  for (const value of [null, '2', NaN, Infinity, -Infinity, -1, 3.01, true]) {
    const data = manifest(); data.samples[0].observedCandidateContributionPct = value;
    assert.throws(() => validateEvidenceManifest(data));
  }
  const data = manifest(); data.samples[0].familyKey = 'benign_baseline';
  assert.throws(() => validateEvidenceManifest(data));
});

test('duplicate sample IDs and original source hashes cannot inflate coverage', () => {
  const data = manifest(); data.samples.push(clone(data.samples[0]));
  assert.throws(() => validateEvidenceManifest(data), /duplicate sampleId/u);
  data.samples[1].sampleId = 'different-name';
  assert.throws(() => validateEvidenceManifest(data), /duplicate sourceReviewSha256/u);
});

test('creation never launders rejected source reviews or missing safety boundaries', () => {
  const edits = [
    s => { s.status = 'blocked'; }, s => { s.realEventCandidate = false; },
    s => { s.acceptedForFutureReplayDataset = false; }, s => { s.historicalBacktestPerformed = true; },
    s => { s.productionHistoricalReplayPerformed = true; }, s => { s.scoreIntegrationApproved = true; },
    s => { delete s.scoreWriteApproved; }, s => { s.routeFreightConfirmation = 'connected'; },
    s => { s.marketConfirmation = 'connected'; }, s => { s.boundaries.noNetworkCall = false; },
    s => { delete s.boundaries.noProductionWrite; }, s => { delete s.boundaries.noScoreWrite; },
    s => { delete s.boundaries.noProductionReplayExecution; }, s => { s.boundaries.rawCitationStored = true; },
    s => { s.productionImpact.affectsScoring = true; }, s => { s.productionImpact.extra = false; },
    s => { s.review.blockers = ['not_ready']; }, s => { s.review.rawCitationStored = true; },
    s => { s.review.evidenceCount = 9; }, s => { s.review.extra = false; },
    s => { s.review.compactEvidence[0].extra = false; }, s => { s.confirmations.extra = 'ignored-but-forbidden'; },
    s => { s.confirmations.newsClaimLedger = 'https://example.com/private'; },
    s => { s.extra = 'unexpected'; }, s => { s.observedCandidateContributionPct = null; },
    s => { s.expectedContributionPct = '2'; }, s => { s.sampleWindow.extra = false; }
  ];
  for (const edit of edits) {
    const source = sourceSample(); edit(source);
    assert.throws(() => createEvidenceManifest([{ raw: JSON.stringify(source) }], { reviewedAt: REVIEWED_AT }));
  }
});

test('reader permits only the exact configured repository-relative path', () => {
  for (const path of ['', null, resolve(DEFAULT_MANIFEST_PATH), `./${DEFAULT_MANIFEST_PATH}`,
    DEFAULT_MANIFEST_PATH.replaceAll('/', '\\'), 'docs/fixtures/transport-shock/example.json']) {
    assert.throws(() => readEvidenceManifest(path), /exact reviewed manifest path/u);
  }
});

const archiveDir = 'manual-artifacts/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples';
const originalNames = [
  'manual-real-event-baltimore-port-local-noise-2024-03-e42b81372850.review.json',
  'manual-real-event-msc-aries-headline-control-2024-04-8f010ef7cf45.review.json',
  'manual-real-event-panama-canal-vlgc-drought-2023-10-05a2c1fd935a.review.json',
  'manual-real-event-red-sea-stale-physical-proxy-control-2024-06-5e69ccc7f750.review.json',
  'manual-real-event-red-sea-tanker-reroute-2024-01-3cb8452bb57b.review.json',
  'manual-real-event-suez-ever-given-blockage-2021-03-6ebeef94f2a2.review.json'
];
test('six locally retained real-event originals project without changing gate inputs', { skip: !originalNames.every(name => existsSync(`${archiveDir}/${name}`)) }, () => {
  const originals = originalNames.map(name => readFileSync(`${archiveDir}/${name}`));
  assert.equal(originals.length, 6);
  const manifest = createEvidenceManifest(originals.map(raw => ({ raw })), { reviewedAt: new Date().toISOString() });
  originals.forEach((raw, index) => {
    const source = JSON.parse(raw); const sample = manifest.samples[index];
    for (const key of ['sampleId', 'familyKey', 'generatedAt', 'sampleWindow', 'observedCandidateContributionPct']) {
      assert.deepEqual(sample[key], source[key]);
    }
    assert.deepEqual(sample.compactEvidence, source.review.compactEvidence);
    assert.equal(sample.sourceReviewSha256, createHash('sha256').update(raw).digest('hex'));
  });
  assert.equal(manifest.samples.filter(sample => sample.familyKey === 'known_disruption_tightening').length, 3);
  assert.equal(manifest.samples.filter(sample => sample.familyKey !== 'known_disruption_tightening').length, 3);
});

test('checked-in manifest reader returns no-score P30-compatible inputs', { skip: !existsSync(DEFAULT_MANIFEST_PATH) }, () => {
  const data = JSON.parse(readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'));
  const inputs = readEvidenceManifest();
  assert.equal(inputs.length, data.samples.length);
  inputs.forEach((input, index) => {
    assert.equal(input.sourcePath, DEFAULT_MANIFEST_PATH);
    assert.equal(input.artifact, input.sampleReview);
    assert.equal(input.sampleReview.sampleId, data.samples[index].sampleId);
    assert.equal(input.sampleReview.acceptedForFutureReplayDataset, true);
    assert.equal(input.sampleReview.scoreIntegrationApproved, false);
    assert.equal(input.sampleReview.historicalBacktestPerformed, false);
    assert.equal(input.sampleReview.routeFreightConfirmation, 'not_connected');
    assert.equal(input.sampleReview.review.evidenceCount, data.samples[index].compactEvidence.length);
    assert.equal(input.sampleReview.boundaries.noProductionReplayExecution, true);
  });
});
