import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PRODUCTION_SCHEMA } from '../../scripts/macro-risk/editorial-contract.mjs';
import { applyEditorialProjection, reviewEditorial, validateEditorialProduction } from '../../scripts/macro-risk/editorial-production.mjs';

const timestamp = '2026-08-11T06:00:00.000Z';
const now = new Date('2026-08-11T06:05:00.000Z');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const radar = { updatedAt: timestamp, score: 42, decisionModel: { executionLock: true } };
// Envelope-only fixture: full output acceptance and happy final writes are covered
// by check-macro-risk-editorial-core.mjs, also executed by the coverage command.
const output = { model: 'fixture', sourceDataUpdatedAt: timestamp, generatedAt: timestamp,
  sourceAttribution: [{ sourceRefId: 'site:test' }], claim: { sourceRefIds: ['site:test'] } };
const layer = {
  schemaVersion: PRODUCTION_SCHEMA, status: 'valid', displayEnabled: true, generatedAt: timestamp,
  sourceDataUpdatedAt: timestamp, provider: 'deepseek', mode: 'external_ai_macro_risk_editorial', model: 'fixture', output,
  validation: { status: 'pass', artifactDigest: hash(output) },
  qualityReview: { status: 'warn', promotionEligible: false },
  provenance: { humanApproved: false, inputDigest: hash({}), artifactDigest: hash(output) },
  freshness: { artifactGeneratedAt: timestamp, maxAgeHours: 30, isStale: false },
  sourceLedger: [{ id: 'site:test', kind: 'site' }],
  boundaries: { displayOnly: true, frontendDisplayApproved: true, notInvestmentAdvice: true,
    ...Object.fromEntries(['GfrrScoring', 'RiskModules', 'TailRiskOverlay', 'DecisionModel', 'ExecutionLock', 'PositionGuidance', 'WorldOrder', 'Odp', 'BubbleWatch'].map(key => [`affects${key}`, false])) }
};

test('valid envelope alone cannot bypass final output revalidation or mutate radar', () => {
  assert.equal(validateEditorialProduction(layer, radar, now).ok, true);
  const before = structuredClone(radar);
  assert.throws(() => applyEditorialProjection(radar, layer, now, {}), /production final output revalidation/);
  assert.throws(() => applyEditorialProjection(radar, layer, now, { fixtureOnly: true }), /non-fixture compact input/);
  assert.deepEqual(radar, before);
});

const cases = {
  schema: x => { x.schemaVersion = 'wrong'; }, status: x => { x.status = 'error'; },
  display: x => { x.displayEnabled = false; }, sourceDate: x => { x.sourceDataUpdatedAt = 'old'; },
  provider: x => { x.provider = 'other'; }, mode: x => { x.mode = 'other'; },
  validation: x => { delete x.validation; }, review: x => { x.qualityReview.status = 'fail'; },
  promotion: x => { x.qualityReview.promotionEligible = true; }, approval: x => { x.provenance.humanApproved = true; },
  inputDigest: x => { x.provenance.inputDigest = 'bad'; }, artifactDigest: x => { x.provenance.artifactDigest = 'bad'; },
  missingOutput: x => { x.output = null; }, alteredOutput: x => { x.output.model = 'altered'; },
  outputSourceDate: x => { x.output.sourceDataUpdatedAt = 'old'; },
  timestampMismatch: x => { x.freshness.artifactGeneratedAt = 'old'; },
  agePolicy: x => { x.freshness.maxAgeHours = 10000; }, staleFlag: x => { x.freshness.isStale = true; },
  invalidTime: x => { x.generatedAt = 'invalid'; }, futureTime: x => { x.generatedAt = '2099-01-01T00:00:00Z'; },
  staleTime: x => { x.generatedAt = '2020-01-01T00:00:00Z'; },
  displayBoundary: x => { x.boundaries.displayOnly = false; },
  frontendBoundary: x => { x.boundaries.frontendDisplayApproved = false; },
  adviceBoundary: x => { x.boundaries.notInvestmentAdvice = false; },
  missingLedger: x => { delete x.sourceLedger; }, duplicateId: x => { x.sourceLedger.push({ ...x.sourceLedger[0] }); },
  missingId: x => { x.sourceLedger.push({}); }, insecureNews: x => { x.sourceLedger[0] = { id: 'site:test', kind: 'news', url: 'http://example.com' }; },
  noNewsUrl: x => { x.sourceLedger[0] = { id: 'site:test', kind: 'news' }; },
  snippet: x => { x.sourceLedger[0].snippet = 'must not publish'; },
  attribution: x => { x.output.sourceAttribution = null; },
  unknownRef: x => { x.output.claim.sourceRefIds = ['unknown']; }
};
for (const key of Object.keys(layer.boundaries).filter(key => key.startsWith('affects'))) cases[key] = x => { x.boundaries[key] = true; };
for (const [name, mutate] of Object.entries(cases)) test(`production rejects ${name} before changing data`, () => {
  const invalid = structuredClone(layer); mutate(invalid);
  const before = structuredClone({ radar, invalid });
  assert.equal(validateEditorialProduction(invalid, radar, now).ok, false);
  assert.throws(() => applyEditorialProjection(radar, invalid, now, {}));
  assert.deepEqual({ radar, invalid }, before);
});

test('absent envelopes and ungrounded review remain fail closed', () => {
  for (const value of [null, [], false]) assert.equal(validateEditorialProduction(value, radar, now).ok, false);
  const review = reviewEditorial({ input: null, output: null, generatedAt: timestamp });
  assert.equal(review.status, 'fail');
  assert.equal(review.frontendDisplayEligible, false);
});
