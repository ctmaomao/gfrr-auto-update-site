import {
  INSIDER_BASKET_SIZE,
  INSIDER_MIN_LIVE_SYMBOLS,
  INSIDER_PARTIAL_MIN_RATIO,
  INSIDER_PARTIAL_COVERAGE_POLICY
} from './insider-source-policy.mjs';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

// ADR-0049: only these ADR-0048 evidence gates may warn with healthy sources and
// a fresh research fallback. Transport/content failures never qualify.
export const EVIDENCE_GAP_POLICIES = Object.freeze({
  vc_ai_share: { reasonCode: 'vc_current_period_unconfirmed', sources: ['Crunchbase News WordPress API'] },
  neocloud_credit: { reasonCode: 'neocloud_current_coverage_unconfirmed', sources: ['PRNewswire:CoreWeave', 'Lambda official blog', 'Crusoe official newsroom', 'Nebius newsroom financing update', 'Nebius newsroom offering close'] }
});

const BLOCK_PAGE = /verify you are human|access denied|just a moment|checking your browser|enable javascript and cookies/iu;

// Inspect the unfiltered API response: a title cannot substitute for an article,
// and dropping malformed rows before this check would conceal source failures.
export function checkVcSourceResponse(rows, asOfDate) {
  const ok = Array.isArray(rows) && rows.length > 0 && rows.every(post => {
    try {
      if (!post || !Number.isInteger(post.id) || post.id <= 0
        || typeof post.title?.rendered !== 'string' || !post.title.rendered.trim()
        || typeof post.date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/u.test(post.date)) return false;
      assessUnderlyingObservationFreshness({ observationDate: post.date.slice(0, 10), asOfDate, maxAgeDays: Number.MAX_SAFE_INTEGER });
      const url = new URL(post.link);
      if (url.protocol !== 'https:' || url.hostname !== 'news.crunchbase.com' || url.pathname === '/') return false;
      const body = [post.excerpt?.rendered, post.content?.rendered]
        .filter(value => typeof value === 'string').join(' ')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
        .replace(/<[^>]*>/gu, ' ').replace(/&[^;\s]+;/gu, ' ').replace(/\s+/gu, ' ').trim();
      return body.length >= 80 && !BLOCK_PAGE.test(body);
    } catch { return false; }
  });
  return { source: 'Crunchbase News WordPress API', status: ok ? 'ok' : 'invalid_content' };
}

export function checkNeocloudSourceContent(source, text) {
  const company = source?.match(/CoreWeave|Lambda|Crusoe|Nebius/u)?.[0];
  const ok = EVIDENCE_GAP_POLICIES.neocloud_credit.sources.includes(source)
    && company && typeof text === 'string' && text.trim().length >= 100
    && new RegExp(`\\b${company}\\b`, 'iu').test(text) && !BLOCK_PAGE.test(text);
  return { source, status: ok ? 'ok' : 'invalid_content' };
}

export function evidenceGapError(error, id, checks, checkedAt) {
  const policy = EVIDENCE_GAP_POLICIES[id];
  if (policy && String(error?.message || '').startsWith(`${policy.reasonCode}: `)) {
    error.evidenceGate = { policy: 'bubble-evidence-gap-v1', reasonCode: policy.reasonCode, checkedAt, checks };
  }
  return error;
}

export function isExpectedEvidenceGapFallback(row, asOfDate) {
  const policy = EVIDENCE_GAP_POLICIES[row?.id];
  const p = row?.provenance;
  const gate = p?.evidenceGate;
  if (!policy || row.stale !== false || p?.mode !== 'auto_fallback'
    || gate?.policy !== 'bubble-evidence-gap-v1' || gate.reasonCode !== policy.reasonCode
    || gate.checkedAt !== asOfDate || !String(p.reason || '').startsWith(`hybrid_live source failed: ${policy.reasonCode}: `)
    || !Array.isArray(gate.checks) || gate.checks.length !== policy.sources.length
    || !gate.checks.every(check => check && typeof check === 'object')
    || new Set(gate.checks.map(check => check.source)).size !== policy.sources.length
    || !gate.checks.every(check => policy.sources.includes(check.source) && check.status === 'ok')
    || typeof p.ageDays !== 'number' || typeof p.maxAgeDays !== 'number' || p.maxAgeDays <= 0
    || row.as_of !== p.asOfDate) return false;
  try {
    const freshness = assessUnderlyingObservationFreshness({ observationDate: p.asOfDate, asOfDate, maxAgeDays: p.maxAgeDays });
    return freshness.status === 'fresh' && freshness.ageDays === p.ageDays;
  } catch { return false; }
}

const ARR_UNDERLYING_STALE_PATTERN =
  /arr_underlying_observation_stale: latest milestone \d{4}-\d{2}-\d{2} is \d+d old \(max \d+d\)/u;

function uniqueSymbols(values) {
  const normalized = Array.isArray(values)
    ? values.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
    : [];
  return normalized.length === new Set(normalized).size ? normalized : [];
}

function isFreshFallbackSnapshot(row) {
  const ageDays = Number(row?.provenance?.ageDays);
  const maxAgeDays = Number(row?.provenance?.maxAgeDays);

  return row?.stale !== true &&
    typeof row?.provenance?.asOfDate === 'string' &&
    row.provenance.asOfDate.length > 0 &&
    Number.isFinite(ageDays) &&
    ageDays >= 0 &&
    Number.isFinite(maxAgeDays) &&
    maxAgeDays > 0 &&
    ageDays <= maxAgeDays;
}

export function isExpectedPolicyFallback(row, asOfDate) {
  return isExpectedEvidenceGapFallback(row, asOfDate) || (row?.id === 'arr_2nd_deriv' &&
    row?.provenance?.mode === 'auto_fallback' &&
    isFreshFallbackSnapshot(row) &&
    ARR_UNDERLYING_STALE_PATTERN.test(String(row?.provenance?.reason || '')));
}

export function isExpectedPolicyFetchFailure(failure, fallbackRow, asOfDate) {
  if (isExpectedEvidenceGapFallback(fallbackRow, asOfDate)) {
    return failure?.id === fallbackRow.id && String(failure.reason || '').startsWith(`hybrid_live_source_failed: ${EVIDENCE_GAP_POLICIES[fallbackRow.id].reasonCode}: `);
  }
  return isExpectedPolicyFallback(fallbackRow, asOfDate) &&
    failure?.id === fallbackRow.id &&
    ARR_UNDERLYING_STALE_PATTERN.test(String(failure?.reason || ''));
}

export function isExpectedPolicyDegradedLiveRow(row) {
  const detail = row?.provenance?.detail || {};
  const requestedSymbols = uniqueSymbols(detail.requestedSymbols);
  const successfulSymbols = uniqueSymbols(detail.successfulSymbols);
  const missingSymbols = uniqueSymbols(detail.missingSymbols);
  const sourceSymbols = uniqueSymbols((detail.sources || []).map((source) => source?.symbol));
  const failedSymbols = uniqueSymbols((detail.sourceFailures || []).map((failure) => failure?.symbol));
  const sourceRows = Array.isArray(detail.sources) ? detail.sources : [];
  const sourceFailures = Array.isArray(detail.sourceFailures) ? detail.sourceFailures : [];
  const requestedSet = new Set(requestedSymbols);
  const coveredSet = new Set([...successfulSymbols, ...missingSymbols]);
  const buyUsd = Number(detail.buyUsd);
  const sellUsd = Number(detail.sellUsd);
  const ratio = Number(detail.ratio);
  const replayRatio = sellUsd / Math.max(buyUsd, 1e6);
  const sourceTotalsValid = sourceRows.every((source) => (
    typeof source?.buyUsd === 'number' && Number.isFinite(source.buyUsd) && source.buyUsd >= 0 &&
    typeof source?.sellUsd === 'number' && Number.isFinite(source.sellUsd) && source.sellUsd >= 0 &&
    source.buyUsd + source.sellUsd > 0
  ));
  const sourceBuyUsd = sourceRows.reduce((sum, source) => sum + Number(source?.buyUsd || 0), 0);
  const sourceSellUsd = sourceRows.reduce((sum, source) => sum + Number(source?.sellUsd || 0), 0);

  return row?.id === 'insider_sell_buy' &&
    row?.status === 'yellow' &&
    row?.value_display === '高卖压·覆盖受限' &&
    row?.stale !== true &&
    row?.provenance?.mode === 'auto' &&
    detail.coverageStatus === 'partial' &&
    detail.coverageReasonCode === 'insider_partial_live_coverage_direction_confirmed' &&
    detail.partialCoveragePolicy === INSIDER_PARTIAL_COVERAGE_POLICY &&
    Number(detail.minimumSuccessfulSymbols) === INSIDER_MIN_LIVE_SYMBOLS &&
    Number(detail.minimumPartialRatio) === INSIDER_PARTIAL_MIN_RATIO &&
    requestedSymbols.length === INSIDER_BASKET_SIZE &&
    successfulSymbols.length === INSIDER_MIN_LIVE_SYMBOLS &&
    missingSymbols.length === 1 &&
    coveredSet.size === requestedSet.size &&
    [...coveredSet].every((symbol) => requestedSet.has(symbol)) &&
    sourceSymbols.length === successfulSymbols.length &&
    sourceSymbols.every((symbol) => successfulSymbols.includes(symbol)) &&
    sourceTotalsValid &&
    Math.abs(sourceBuyUsd - buyUsd) <= 1e-6 &&
    Math.abs(sourceSellUsd - sellUsd) <= 1e-6 &&
    failedSymbols.length === missingSymbols.length &&
    failedSymbols.every((symbol) => missingSymbols.includes(symbol)) &&
    sourceFailures.every((failure) => typeof failure?.reason === 'string' && failure.reason.length > 0) &&
    Number.isFinite(buyUsd) && buyUsd >= 0 &&
    Number.isFinite(sellUsd) && sellUsd > 0 &&
    Number.isFinite(ratio) && ratio >= INSIDER_PARTIAL_MIN_RATIO &&
    Math.abs(ratio - replayRatio) <= 1e-9;
}
