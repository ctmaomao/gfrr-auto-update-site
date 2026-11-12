import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateWeeklyEditorialWriteEvidence, assertWeeklyEditorialWriterContext } from './bubble-watch/weekly-editorial-write-evidence.mjs';
import { buildWeeklyEditorialInput } from './bubble-watch/weekly-editorial-input.mjs';
import { reviewWeeklyEditorial, projectWeeklyEditorial } from './bubble-watch/weekly-editorial-production.mjs';
import { RECEIPT_GRANT } from './lib/deepseek-receipt-grant.mjs';

const DIRECTORY = 'manual-artifacts/bubble-watch-weekly-editorial';
export const CANDIDATE_PATH = `${DIRECTORY}/receipt-review-candidate.json`;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = () => { throw new Error('bubble_receipt_candidate_hold'); };
export function serializeBubbleReceiptCandidate(candidate) {
  const encoded = `${JSON.stringify(candidate, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > 128 * 1024) fail();
  return encoded;
}
const strings = ['string'];
const claim = { titleZh: 'string', detailZh: 'string', sourceRefIds: strings, sourceIndicatorIds: strings };
// Exact field allowlists, independent of provider-envelope and input schemas.
// Optional allowed fields remain optional; existing full evidence validation
// checks semantic requirements before this privacy projection is constructed.
const OUTPUT = {
  schemaVersion: 'string', generatedAt: 'string', asOfDate: 'string', provider: 'string', model: 'string', mode: 'string',
  headlineZh: 'string', leadZh: 'string', weeklyTimeline: [{ ...claim, date: 'string' }],
  scorecardSynthesisZh: 'string', scorecardSourceIndicatorIds: strings,
  keyTensions: [claim], categoryAnalysis: [{ ...claim, category: 'string' }],
  historicalComparison: { ...claim, period: 'string' },
  watchNextWeek: [{ conditionZh: 'string', invalidationZh: 'string', sourceIndicatorIds: strings }],
  dataGaps: strings, sourceAttribution: [{ sourceRefId: 'string', claimType: 'string', noteZh: 'string' }],
  confidence: { level: 'string', score: 'number', reasonZh: 'string' }, auditFlags: strings,
  boundaries: Object.fromEntries(['displayOnly', 'commentaryOnly', 'externalAiGenerated', 'usesExternalAiApi',
    'affectsBubbleWatchScoring', 'affectsCore23', 'affectsShadow4', 'affectsStageTrigger', 'affectsGfrrScoring',
    'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance', 'notInvestmentAdvice'].map(k => [k, 'boolean']))
};
const status = { status: 'string', successCount: 'number', failureCount: 'number' };
const NEWS = { schemaVersion: 'string', generatedAt: 'string', status: 'string', windowStart: 'string', windowEnd: 'string',
  topicsQueried: 'number', liveProviderCount: 'number', coverageMode: 'string',
  sourceStatus: { tavily: status, brave: status }, topics: [{ id: 'string', query: 'string', storyCount: 'number' }],
  stories: [{ id: 'string', topic: 'string', title: 'string', url: 'string', domain: 'string', publishedAt: 'nullable-string',
    snippet: 'nullable-string', providers: strings, supportingDomains: strings, evidenceStatus: 'string', contentScope: 'string', sourceName: 'string' }],
  dataGaps: strings, boundaries: Object.fromEntries(['transientArtifactOnly', 'containsRawProviderResponse', 'containsHeaders',
    'containsApiKeys', 'containsFullArticleBody', 'affectsBubbleWatchScoring', 'affectsGfrrScoring'].map(k => [k, 'boolean'])) };
function allowlisted(value, schema, field = '') {
  if (field === 'historicalComparison' && value === null) return null;
  if (schema === 'nullable-string' && (value === null || typeof value === 'string')) return value;
  if (typeof schema === 'string') {
    if (typeof value !== schema || (schema === 'number' && !Number.isFinite(value))) fail();
    return value;
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length > 100) fail();
    return value.map(item => allowlisted(item, schema[0]));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(schema, key)) fail();
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(property, 'value')) fail();
    result[key] = allowlisted(property.value, schema[key], key);
  }
  return result;
}
export function buildBubbleReceiptCandidate({ bubbleWatch, radarData, oilNewsWatch, projection, now = new Date().toISOString(), env = process.env }) {
  if (env.DEEPSEEK_BUDGET_SELECTION !== RECEIPT_GRANT.id || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_RUN_ATTEMPT !== '1' || env.EDITORIAL_PROVIDER_OUTCOME !== 'success'
    || env.EDITORIAL_REVIEW_OUTCOME !== 'success') fail();
  assertWeeklyEditorialWriterContext(projection?.weeklyEditorial, env);
  if (projection?.schemaVersion !== 'bubble-watch-weekly-editorial-production-projection-v1'
    || projection.target !== 'data/bubble-watch.json.summary.weekly_editorial'
    || !validateWeeklyEditorialWriteEvidence({ bubbleWatch, projection, now }).ok) fail();
  const layer = projection.weeklyEditorial;
  const output = allowlisted(layer.output, OUTPUT);
  const original = projection.writeEvidence.input;
  const newsContext = allowlisted(original.newsContext, NEWS);
  // Rebuild site-derived fields from the checked-out source commit, not provider
  // metadata. Preserve exact bounded excerpts; never trim or repair billing facts.
  const input = { ...buildWeeklyEditorialInput({ bubbleWatch, radarData, oilNewsWatch,
    discovery: newsContext, generatedAt: original.generatedAt }), newsContext,
    dataGaps: allowlisted(original.dataGaps, strings) };
  if (digest(input) !== digest(original)) fail();
  const review = reviewWeeklyEditorial({ input, output, generatedAt: projection.writeEvidence.review.generatedAt });
  const rebuiltLayer = projectWeeklyEditorial({ input, output, review, generatedAt: layer.generatedAt,
    sourceCommit: layer.provenance.sourceCommit, runId: layer.provenance.runId });
  if (digest(review) !== digest(projection.writeEvidence.review) || digest(rebuiltLayer) !== digest(layer)) fail();
  const safeProjection = { schemaVersion: projection.schemaVersion, generatedAt: projection.generatedAt,
    target: projection.target, weeklyEditorial: rebuiltLayer, writeEvidence: { input, review } };
  if (!validateWeeklyEditorialWriteEvidence({ bubbleWatch, projection: safeProjection, now }).ok) fail();
  if (digest(output) !== layer.provenance.artifactDigest) fail();
  const candidate = {
    schemaVersion: 'bubble-receipt-review-candidate-v1', purpose: 'independent_fact_review_before_publication',
    publicationReady: false, replayEvidenceRetained: true, containsPrompt: false, containsProviderEnvelope: false,
    selection: RECEIPT_GRANT.id, generatedAt: layer.generatedAt, asOfDate: layer.asOfDate,
    sourceCommit: layer.provenance.sourceCommit, runId: String(layer.provenance.runId),
    sourceSnapshotDigest: projection.writeEvidence.input.sourceSnapshotDigest,
    inputDigest: layer.provenance.inputDigest, artifactDigest: layer.provenance.artifactDigest,
    originalProjectionDigest: digest(projection), automatedReviewStatus: layer.qualityReview.status,
    projection: safeProjection
  };
  for (const key of ['sourceSnapshotDigest', 'inputDigest', 'artifactDigest', 'originalProjectionDigest']) {
    if (!/^[a-f0-9]{64}$/u.test(candidate[key] || '')) fail();
  }
  const key = env.DEEPSEEK_API_KEY;
  if (typeof key !== 'string' || key.length < 16 || /[\r\n]/u.test(key)) fail();
  const encoded = serializeBubbleReceiptCandidate(candidate);
  // Match the actual credential as well as common leaked-credential envelopes.
  if (encoded.includes(key) || encoded.includes(JSON.stringify(key).slice(1, -1)) || encoded.includes(Buffer.from(key).toString('base64'))) fail();
  if (/(?:sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u.test(encoded)) fail();
  return candidate;
}
function readBounded(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) fail();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function main() {
  try {
    if (process.argv.length !== 2 || fs.existsSync(CANDIDATE_PATH)) fail();
    const candidate = buildBubbleReceiptCandidate({ bubbleWatch: readBounded('data/bubble-watch.json'),
      radarData: readBounded('data/radar-data.json'), oilNewsWatch: readBounded('data/oil-news-event-watch.json'),
      projection: readBounded(`${DIRECTORY}/production-projection-latest.json`) });
    fs.writeFileSync(CANDIDATE_PATH, serializeBubbleReceiptCandidate(candidate), { flag: 'wx', mode: 0o600 });
    console.log('Bubble receipt candidate retained for independent review; no production write; original-run writer safeguards still apply.');
  } catch { console.error('Bubble receipt candidate HOLD: details withheld.'); process.exitCode = 1; }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
