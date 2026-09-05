import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MANIFEST_PATH = 'docs/evidence/transport-shock/free-proxy-real-event-review-manifest.json';
const SCHEMA = 'transport-shock-free-proxy-reviewed-evidence-manifest-v1';
const SAMPLE_SCHEMA = 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1';
const BASIS = 'manual_review_not_model_backtest';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FAMILIES = new Set(['known_disruption_tightening', 'headline_only_false_positive', 'single_chokepoint_noise',
  'stale_physical_proxy', 'market_confirmation_divergence', 'benign_baseline']);
const SOURCE_FAMILIES = new Set(['energy_department_pdf_mirror', 'official_chokepoint_context', 'official_energy_context',
  'official_physical_proxy', 'portwatch_chokepoint_proxy', 'public_market_proxy', 'public_news_event_context', 'shipping_association_context']);
const TYPES = new Set(['local_physical_context', 'market_proxy', 'news_claim_proxy', 'physical_disruption_claim',
  'physical_proxy', 'route_context', 'stale_physical_proxy']);
const APPROVALS = ['promotionEligible', 'scoreReadinessApproved', 'scoreIntegrationApproved', 'scoreWriteApproved',
  'productionWriteApproved', 'productionDisplayApproved', 'frontendDisplayApproved', 'mainScoreApproved', 'eligibleForMainScore'];
const MANIFEST_BOUNDARIES = Object.freeze({
  ...Object.fromEntries(APPROVALS.map(key => [key, false])),
  productionHistoricalReplayPerformed: false, historicalBacktestPerformed: false,
  routeFreightConfirmation: 'not_connected', marketConfirmation: 'not_connected',
  noNetworkCall: true, noEnvironmentRead: true, noProductionDataRead: true,
  noProductionWrite: true, noScoreWrite: true, noProductionReplayExecution: true,
  rawCitationStored: false
});
const SOURCE_BOUNDARIES = Object.freeze({
  outputOnlyToManualArtifacts: true, noNetworkCall: true, noEnvironmentRead: true, noProductionDataRead: true,
  noProductionWrite: true, noRealtimeWrite: true, noWorkflowChange: true, noFrontendChange: true,
  noWorkerRuntimeChange: true, noScoreWrite: true, noReplayExecution: true, noProductionReplayExecution: true,
  noHistoricalBacktestPerformed: true, rawCitationStored: false, affectsScoring: false, affectsMainJudgment: false
});
const IMPACT_KEYS = ['writesProductionData', 'modifiesFrontend', 'modifiesWorkerRuntime', 'modifiesWorkflow',
  'affectsValues', 'affectsDisplayInputsBaseline', 'affectsEffectiveDisplayInputs', 'affectsScoring', 'affectsDecisionModel',
  'affectsExecutionLock', 'affectsPositionGuidance', 'affectsBrentPromotion', 'affectsOdpFinalBias', 'affectsMainJudgment',
  'affectsGlobalRiskHeatmap', 'affectsCrossValidation'];
const SAMPLE_KEYS = ['sampleId', 'familyKey', 'generatedAt', 'sampleWindow', 'observedCandidateContributionPct',
  'sourceReviewSha256', 'compactEvidence'];
const EVIDENCE_KEYS = ['sourceFamily', 'sourceStatus', 'direction', 'confirmationType', 'sourceCitationHash',
  'sourceDomainHint', 'rawCitationStored'];
const SOURCE_KEYS = ['schemaVersion', 'contractVersion', 'status', 'recommendation', 'generatedAt', 'inputPath',
  'sampleId', 'familyKey', 'sampleWindow', 'expectedContributionPct', 'observedCandidateContributionPct', 'confirmations',
  'acceptedForFutureReplayDataset', 'realEventCandidate', 'historicalReplayRunnerImplemented',
  ...APPROVALS, 'productionHistoricalReplayPerformed', 'historicalBacktestPerformed', 'routeFreightConfirmation',
  'marketConfirmation', 'review', 'productionImpact', 'boundaries', 'boundary', 'limitationZh'];

function requireThat(condition, message) {
  if (!condition) throw new Error(`Free-proxy evidence manifest: ${message}`);
}

function objectKeys(value, allowed, label, required = allowed) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be an object`);
  requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} contains unknown keys`);
  requireThat(required.every(key => Object.hasOwn(value, key)), `${label} has missing keys`);
}

function exactMap(value, expected, label) {
  objectKeys(value, Object.keys(expected), label);
  for (const [key, target] of Object.entries(expected)) {
    requireThat(value[key] === target, `${label}.${key} must be ${String(target)}`);
  }
}

function isoDate(value, label) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value), `${label} must be an ISO date`);
  const ms = Date.parse(`${value}T00:00:00Z`);
  requireThat(Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value, `${label} is not a real date`);
  return ms;
}

function isoTime(value, label) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value), `${label} must be a UTC ISO timestamp`);
  const ms = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  requireThat(Number.isFinite(ms) && new Date(ms).toISOString() === canonical, `${label} is not a real timestamp`);
  return ms;
}

function hash(value, label) {
  requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), `${label} must be a lowercase SHA-256`);
}

function domain(value) {
  requireThat(typeof value === 'string' && value.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(value), 'sourceDomainHint must be a plain domain');
}

function evidence(rows) {
  requireThat(Array.isArray(rows) && rows.length >= 1 && rows.length <= 50, 'compactEvidence must contain 1..50 entries');
  for (const row of rows) {
    objectKeys(row, EVIDENCE_KEYS, 'compactEvidence entry');
    requireThat(SOURCE_FAMILIES.has(row.sourceFamily), 'unknown sourceFamily');
    requireThat(row.sourceStatus === 'manual_reference', 'sourceStatus must be manual_reference');
    requireThat(['tightening', 'zero_contribution_control'].includes(row.direction), 'unknown evidence direction');
    requireThat(TYPES.has(row.confirmationType), 'unknown confirmationType');
    hash(row.sourceCitationHash, 'sourceCitationHash');
    domain(row.sourceDomainHint);
    requireThat(row.rawCitationStored === false, 'rawCitationStored must be false');
  }
}

function validateSample(sample, reviewedMs) {
  objectKeys(sample, SAMPLE_KEYS, 'sample');
  requireThat(typeof sample.sampleId === 'string' && /^[a-z0-9][a-z0-9_-]{0,159}$/u.test(sample.sampleId), 'invalid sampleId');
  requireThat(FAMILIES.has(sample.familyKey), 'unknown familyKey');
  const generatedMs = isoTime(sample.generatedAt, 'generatedAt');
  requireThat(generatedMs <= reviewedMs, 'sample generatedAt is after reviewedAt');
  objectKeys(sample.sampleWindow, ['startDate', 'endDate'], 'sampleWindow');
  const start = isoDate(sample.sampleWindow.startDate, 'startDate');
  const end = isoDate(sample.sampleWindow.endDate, 'endDate');
  requireThat(start <= end && end <= generatedMs, 'sampleWindow must be ordered and not after generatedAt');
  const contribution = sample.observedCandidateContributionPct;
  requireThat(typeof contribution === 'number' && Number.isFinite(contribution) && contribution >= 0 && contribution <= 3,
    'observedCandidateContributionPct must be a finite number in 0..3');
  requireThat(sample.familyKey === 'known_disruption_tightening' || contribution === 0, 'zero-control contribution must be zero');
  hash(sample.sourceReviewSha256, 'sourceReviewSha256');
  evidence(sample.compactEvidence);
}

/** Validates metadata only; source hashes do not imply the original files were reverified. */
export function validateEvidenceManifest(data) {
  objectKeys(data, ['schemaVersion', 'reviewedAt', 'contributionBasis', 'boundaries', 'samples'], 'manifest');
  requireThat(data.schemaVersion === SCHEMA, 'unsupported schemaVersion');
  requireThat(data.contributionBasis === BASIS, 'contributionBasis must remain manual review, not a backtest');
  const reviewedMs = isoTime(data.reviewedAt, 'reviewedAt');
  requireThat(reviewedMs <= Date.now(), 'reviewedAt must not be in the future');
  exactMap(data.boundaries, MANIFEST_BOUNDARIES, 'boundaries');
  requireThat(Array.isArray(data.samples) && data.samples.length >= 1 && data.samples.length <= 500, 'samples must contain 1..500 entries');
  const ids = new Set();
  const hashes = new Set();
  for (const sample of data.samples) {
    validateSample(sample, reviewedMs);
    requireThat(!ids.has(sample.sampleId), 'duplicate sampleId');
    requireThat(!hashes.has(sample.sourceReviewSha256), 'duplicate sourceReviewSha256');
    ids.add(sample.sampleId);
    hashes.add(sample.sourceReviewSha256);
  }
  return data;
}

function sourceReview(raw) {
  requireThat(typeof raw === 'string' || Buffer.isBuffer(raw), 'entry.raw must be a string or Buffer');
  const text = raw.toString();
  requireThat(!/https?:\/\/|www\./iu.test(text), 'source review must not contain raw URLs');
  const source = JSON.parse(text);
  objectKeys(source, SOURCE_KEYS, 'source review', SOURCE_KEYS.filter(key => !['promotionEligible', 'scoreReadinessApproved'].includes(key)));
  requireThat(source.schemaVersion === SAMPLE_SCHEMA && source.status === 'sample_review_ready_keep_no_score_write', 'source review schema/status is not ready');
  requireThat(source.realEventCandidate === true && source.acceptedForFutureReplayDataset === true, 'source review must be an accepted real-event candidate');
  for (const key of APPROVALS) {
    if (['promotionEligible', 'scoreReadinessApproved'].includes(key) && !Object.hasOwn(source, key)) continue;
    requireThat(source[key] === false, `source review ${key} must be false`);
  }
  requireThat(source.productionHistoricalReplayPerformed === false && source.historicalBacktestPerformed === false, 'source review must not claim historical replay/backtest');
  requireThat(source.routeFreightConfirmation === 'not_connected' && source.marketConfirmation === 'not_connected', 'source confirmations must remain not_connected');
  exactMap(source.boundaries, SOURCE_BOUNDARIES, 'source boundaries');
  exactMap(source.productionImpact, Object.fromEntries(IMPACT_KEYS.map(key => [key, false])), 'source productionImpact');
  objectKeys(source.review, ['evidenceCount', 'compactEvidence', 'rawCitationStored', 'blockers', 'warnings'], 'source review details');
  requireThat(source.review.rawCitationStored === false && Array.isArray(source.review.blockers) && source.review.blockers.length === 0,
    'source review has blockers or raw citations');
  evidence(source.review.compactEvidence);
  requireThat(source.review.evidenceCount === source.review.compactEvidence.length, 'source evidenceCount mismatch');
  requireThat(Array.isArray(source.review.warnings) && source.review.warnings.every(value => typeof value === 'string'), 'source warnings must be strings');
  objectKeys(source.confirmations, ['transportProxy', 'marketConfirmation', 'physicalAnchor', 'newsClaimLedger'], 'source confirmations');
  requireThat(Object.values(source.confirmations).every(value => typeof value === 'string'), 'source confirmation summaries must be strings');
  requireThat(typeof source.expectedContributionPct === 'number' && Number.isFinite(source.expectedContributionPct)
    && source.expectedContributionPct >= 0 && source.expectedContributionPct <= 3, 'source expected contribution must be in 0..3');
  requireThat(source.familyKey === 'known_disruption_tightening' || source.expectedContributionPct === 0, 'source zero-control expected contribution must be zero');
  for (const key of ['contractVersion', 'recommendation', 'inputPath', 'boundary', 'limitationZh']) {
    requireThat(typeof source[key] === 'string', `source ${key} must be a string`);
  }
  requireThat(typeof source.historicalReplayRunnerImplemented === 'boolean', 'source runner implementation flag must be boolean');
  return source;
}

/** Returns a compact projection; never writes files or copies free-text citations. */
export function createEvidenceManifest(entries, { reviewedAt } = {}) {
  requireThat(Array.isArray(entries), 'entries must be an array');
  const samples = entries.map(entry => {
    objectKeys(entry, ['raw'], 'entry');
    const source = sourceReview(entry.raw);
    return {
      sampleId: source.sampleId, familyKey: source.familyKey, generatedAt: source.generatedAt,
      sampleWindow: { ...source.sampleWindow }, observedCandidateContributionPct: source.observedCandidateContributionPct,
      sourceReviewSha256: createHash('sha256').update(entry.raw).digest('hex'),
      compactEvidence: source.review.compactEvidence.map(row => ({ ...row }))
    };
  });
  return validateEvidenceManifest({ schemaVersion: SCHEMA, reviewedAt, contributionBasis: BASIS,
    boundaries: { ...MANIFEST_BOUNDARIES }, samples });
}

export function readEvidenceManifest(path = DEFAULT_MANIFEST_PATH) {
  requireThat(path === DEFAULT_MANIFEST_PATH, 'only the exact reviewed manifest path is allowed');
  let cursor = ROOT;
  for (const segment of DEFAULT_MANIFEST_PATH.split('/')) {
    cursor = resolve(cursor, segment);
    requireThat(!lstatSync(cursor).isSymbolicLink(), 'manifest path must not traverse a symlink or junction');
  }
  const manifest = validateEvidenceManifest(JSON.parse(readFileSync(cursor, 'utf8')));
  return manifest.samples.map(sample => {
    const sampleReview = {
      schemaVersion: SAMPLE_SCHEMA, status: 'sample_review_ready_keep_no_score_write',
      sampleId: sample.sampleId, familyKey: sample.familyKey, generatedAt: sample.generatedAt,
      sampleWindow: { ...sample.sampleWindow }, observedCandidateContributionPct: sample.observedCandidateContributionPct,
      acceptedForFutureReplayDataset: true, realEventCandidate: true,
      ...MANIFEST_BOUNDARIES,
      review: { evidenceCount: sample.compactEvidence.length, compactEvidence: sample.compactEvidence.map(row => ({ ...row })), rawCitationStored: false },
      boundaries: { ...SOURCE_BOUNDARIES }
    };
    return { sourcePath: DEFAULT_MANIFEST_PATH, artifact: sampleReview, sampleReview };
  });
}
