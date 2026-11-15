import { createHash } from 'node:crypto';
import { bubbleEditorialSourceDigest, buildWeeklyEditorialInput } from './weekly-editorial-input.mjs';
import { assessWeeklyEditorialNewsReadiness } from './weekly-editorial-news.mjs';
import { validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from './weekly-editorial-contract.mjs';
import { projectWeeklyEditorial } from './weekly-editorial-production.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : NaN;
}
function dateTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? timestamp(`${value}T00:00:00Z`) : NaN;
}

// Full evidence is intentionally transient. Public metadata validation cannot
// re-ground prose after search excerpts have been removed from the public layer.
export function validateWeeklyEditorialWriteEvidence({ bubbleWatch, projection, now }) {
  const errors = [];
  try {
    const layer = projection?.weeklyEditorial;
    const input = projection?.writeEvidence?.input;
    const review = projection?.writeEvidence?.review;
    if (!input || !review || !layer) return { ok: false, errors: ['original input and review evidence are required'] };
    if (input.fixtureOnly !== false || input.inputMode !== 'live_site_compact_evidence_pack') errors.push('write rejects fixture/non-live input');
    if (Buffer.byteLength(JSON.stringify(input)) > 60 * 1024) errors.push('write input exceeds 60 KiB');
    errors.push(...validateWeeklyEditorialInput(input).errors);
    errors.push(...validateWeeklyEditorialOutput(layer.output, input).errors);
    if (input.asOfDate !== bubbleWatch?.as_of_date || input.sourceSnapshotDigest !== bubbleEditorialSourceDigest(bubbleWatch)) errors.push('input source snapshot differs from current Bubble data');
    if (digest(input) !== layer.provenance?.inputDigest) errors.push('original input digest differs from production provenance');
    if (layer.provenance?.generatedBy !== 'github_actions_workflow' || !/^\d+$/u.test(String(layer.provenance?.runId || '')) || !/^[a-f0-9]{40}$/u.test(layer.provenance?.sourceCommit || '')) errors.push('trusted Actions provenance is required');
    const rebuilt = buildWeeklyEditorialInput({ bubbleWatch, discovery: input.newsContext, generatedAt: input.generatedAt });
    for (const field of ['scoringSnapshot', 'structuredFacts', 'narrativeBaseline', 'historicalContext']) {
      if (digest(input[field]) !== digest(rebuilt[field])) errors.push(`original ${field} differs from current Bubble evidence`);
    }
    const deterministicRefs = input.sourceRefs.filter(source => source.kind !== 'context');
    if (digest(deterministicRefs) !== digest(rebuilt.sourceRefs)) errors.push('indicator/news source references differ from original evidence');
    const contextRefs = [];
    if (input.contextSnapshots?.radar) contextRefs.push({ id: 'context:radar', kind: 'context',
      sourceName: 'GFRR radar-data compact context', sourceClass: 'site_structured', asOfDate: input.contextSnapshots.radar.updatedAt || null });
    if (input.contextSnapshots?.oilNews) contextRefs.push({ id: 'context:oil-news', kind: 'context',
      sourceName: 'GFRR oil-news-event-watch compact aggregate', sourceClass: 'site_structured_proxy', asOfDate: input.contextSnapshots.oilNews.generatedAt || null });
    if (digest(input.sourceRefs.filter(source => source.kind === 'context')) !== digest(contextRefs)) errors.push('context source references differ from compact evidence');
    const readiness = assessWeeklyEditorialNewsReadiness(input.newsContext);
    if (!readiness.editorialReady) errors.push(`news evidence is not ready: ${readiness.reason}`);
    if (readiness.coverageMode === 'limited_single_search' && input.newsContext.coverageMode !== readiness.coverageMode) errors.push('limited search disclosure mode is missing');
    const nowMs = timestamp(now);
    const inputMs = timestamp(input.generatedAt);
    const newsMs = timestamp(input.newsContext.generatedAt);
    const outputMs = timestamp(layer.output?.generatedAt);
    const reviewMs = timestamp(review.generatedAt);
    const projectionMs = timestamp(layer.generatedAt);
    const clocks = [newsMs, inputMs, outputMs, reviewMs, projectionMs, nowMs];
    if (clocks.some(ms => !Number.isFinite(ms)) || clocks.some((ms, i) => i > 0 && ms < clocks[i - 1])) errors.push('invalid, future or reversed evidence clocks');
    if (nowMs - newsMs > 30 * 3600000 || nowMs - inputMs > 30 * 3600000 || nowMs - outputMs > 30 * 3600000) errors.push('publication evidence exceeds 30-hour write window');
    const asOfMs = dateTimestamp(input.asOfDate);
    if (!Number.isFinite(asOfMs) || asOfMs > nowMs || nowMs - asOfMs > 240 * 3600000) errors.push('source issue date is invalid, future or stale');
    const startMs = dateTimestamp(input.newsContext.windowStart);
    if (input.newsContext.windowEnd !== input.asOfDate || !Number.isFinite(startMs) || startMs > asOfMs || asOfMs - startMs > 10 * 86400000) errors.push('news evidence window does not match the issue');
    if (projection.generatedAt !== layer.generatedAt) errors.push('projection clock differs from production layer');
    const repeated = projectWeeklyEditorial({ input, output: layer.output, review, generatedAt: layer.generatedAt,
      sourceCommit: layer.provenance?.sourceCommit, runId: layer.provenance?.runId });
    if (digest(repeated) !== digest(layer)) errors.push('production layer differs from freshly validated evidence projection');
  } catch (error) { errors.push(`write evidence validation failed: ${error.message}`); }
  return { ok: errors.length === 0, errors };
}

export function assertWeeklyEditorialWriterContext(layer, env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'ctmaomao/gfrr-auto-update-site'
    || env.GITHUB_WORKFLOW !== 'Bubble Watch Weekly Editorial Refresh' || env.GITHUB_REF !== 'refs/heads/main'
    || !/^\d+$/u.test(env.GITHUB_RUN_ID || '') || String(layer?.provenance?.runId) !== env.GITHUB_RUN_ID) {
    throw new Error('production writer requires the matching trusted weekly editorial Actions run');
  }
}
