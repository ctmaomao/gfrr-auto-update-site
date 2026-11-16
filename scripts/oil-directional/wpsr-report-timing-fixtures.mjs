// Synthetic schema/timing checks only. No PDF parser, case builder, returns or model.
import { createHash } from 'node:crypto';
import frozen from '../../config/wpsr-report-asof-synthetic-protocol.json' with { type: 'json' };
export const WPSR_PROTOCOL_SHA256 = '6b6336acd1ed4cc2b77eec2ff2d99e757a0cabdd5b75c38cbf6203f8d7f408de';
const canonicalHash = createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
if (canonicalHash !== '4d60a481ff23c1a2f7e317fc06222d1a8139500187cc004c3b432f4971697b47') throw new Error('frozen protocol mismatch');
const DAY = 86400000;
const states = ['numeric', 'source_null', 'unknown_support', 'quarantined'];
const fail = message => { throw new Error(message); };
function exact(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length
    || !fields.every(key => Object.hasOwn(value, key) && 'value' in Object.getOwnPropertyDescriptor(value, key))) fail('invalid schema');
}
function array(value, limit) {
  if (!Array.isArray(value) || value.length > limit || Array.from({ length: value.length }, (_, i) => i).some(i => !Object.hasOwn(value, i))) fail('invalid bounded array');
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('invalid id'); }
function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('invalid hash'); }
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('invalid calendar date');
}
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('invalid UTC');
}
function unique(values) { if (new Set(values).size !== values.length) fail('duplicate identity'); }
function equalSet(a, b) { return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]); }
function plusTwo(value) { return new Date(Date.parse(value) + 2 * DAY).toISOString(); }
function nextPhase(issue) {
  const d = issue.slice(0, 10);
  if (d < frozen.splits.train[0]) return { phase: null, next: null };
  for (const [phase, end, next] of [['train', '2017-12-31', '2018-01-01'], ['calibration', '2020-12-31', '2021-01-01'], ['untouchedTest', '2025-12-31', '2026-01-01']]) {
    if (d <= end) return { phase, next };
  }
  return { phase: 'secondaryFinalChronologicalHoldout', next: null };
}
export function validateWpsrReportTimingFixtures(input) {
  exact(input, ['syntheticFixtureOnly', 'manifest', 'reports', 'requests', 'closures', 'asOfUTC']);
  if (input.syntheticFixtureOnly !== true) fail('synthetic fixture assertion required');
  utc(input.asOfUTC);
  const { manifest, reports, requests, closures, asOfUTC } = input;
  exact(manifest, ['batches', 'supportSpecs']);
  array(manifest.batches, 64); array(manifest.supportSpecs, 64); array(reports, 128); array(requests, 64); array(closures, 64);
  const expected = new Map(); const batchMap = new Map();
  for (const batch of manifest.batches) {
    exact(batch, ['releaseDate', 'members']); day(batch.releaseDate); array(batch.members, 8);
    if (!batch.members.length || batchMap.has(batch.releaseDate)) fail('invalid batch');
    batchMap.set(batch.releaseDate, { releaseDate: batch.releaseDate, reasons: [], quotes: new Map() });
    for (const member of batch.members) {
      exact(member, ['reportId', 'sha256']); id(member.reportId); hash(member.sha256);
      if (expected.has(member.reportId)) fail('duplicate member');
      expected.set(member.reportId, { ...member, releaseDate: batch.releaseDate });
    }
  }
  const byReport = new Map(); const cells = new Map(); const futureReports = []; const reportIds = new Set(); let paused = false;
  for (const report of reports) {
    exact(report, ['reportId', 'sha256', 'officialReleaseDate', 'indexReleaseDate', 'noticeReleaseDate', 'dataWeekEnding', 'retrievedAtUTC', 'syntheticKnownAtUTC', 'httpLastModifiedRaw', 'embeddedPDFDatesRaw', 'layout', 'units', 'cells']);
    id(report.reportId); hash(report.sha256); day(report.officialReleaseDate); day(report.indexReleaseDate); day(report.dataWeekEnding); utc(report.retrievedAtUTC); utc(report.syntheticKnownAtUTC);
    if (report.syntheticKnownAtUTC < `${report.officialReleaseDate}T00:00:00.000Z`) fail('synthetic knowledge precedes report date');
    if (report.noticeReleaseDate !== null) day(report.noticeReleaseDate);
    for (const metadata of [report.httpLastModifiedRaw, report.embeddedPDFDatesRaw]) if (typeof metadata !== 'string' || metadata.length > 256) fail('invalid metadata');
    array(report.cells, 64); if (reportIds.has(report.reportId)) fail('duplicate report');
    reportIds.add(report.reportId);
    // Schema validation applies even to future fixtures, but their content must not
    // enter historical as-of eligibility. This is an asserted synthetic clock only.
    for (const cell of report.cells) {
      exact(cell, ['supportId', 'quoteDate', 'state', 'value']); id(cell.supportId); day(cell.quoteDate);
      if (!states.includes(cell.state) || (cell.state === 'numeric' ? typeof cell.value !== 'number' || !Number.isFinite(cell.value) || cell.value <= 0 : cell.value !== null)) fail('invalid observation state');
    }
    if (report.syntheticKnownAtUTC > asOfUTC) { futureReports.push(report); continue; }
    byReport.set(report.reportId, report);
    const member = expected.get(report.reportId);
    if (!member) { paused = true; continue; }
    const batch = batchMap.get(member.releaseDate);
    if (report.sha256 !== member.sha256 || report.officialReleaseDate !== member.releaseDate || report.indexReleaseDate !== member.releaseDate
      || (report.noticeReleaseDate !== null && report.noticeReleaseDate !== member.releaseDate)
      || report.dataWeekEnding > member.releaseDate || report.layout !== 'table11_brent_daily_verified_fixture' || report.units !== 'USD/barrel') batch.reasons.push('report_provenance_or_layout_dispute');
    for (const cell of report.cells) {
      exact(cell, ['supportId', 'quoteDate', 'state', 'value']); id(cell.supportId); day(cell.quoteDate);
      if (cells.has(cell.supportId)) fail('duplicate support identity');
      if (!states.includes(cell.state) || (cell.state === 'numeric' ? typeof cell.value !== 'number' || !Number.isFinite(cell.value) || cell.value <= 0 : cell.value !== null)) fail('invalid observation state');
      const bound = { ...cell, reportId: report.reportId, releaseDate: member.releaseDate };
      cells.set(cell.supportId, bound);
      if (cell.quoteDate > member.releaseDate || ['unknown_support', 'quarantined'].includes(cell.state)) batch.reasons.push('invalid_or_unknown_member');
      const previous = batch.quotes.get(cell.quoteDate);
      if (previous && (previous.state !== cell.state || previous.value !== cell.value)) batch.reasons.push('same_day_conflict');
      batch.quotes.set(cell.quoteDate, bound);
    }
  }
  for (const member of expected.values()) if (!byReport.has(member.reportId)) batchMap.get(member.releaseDate).reasons.push('missing_member');
  const specs = new Map();
  for (const spec of manifest.supportSpecs) {
    exact(spec, ['specId', 'fromQuoteDate', 'toQuoteDate', 'throughReleaseDate', 'memberIds', 'supportIds']);
    id(spec.specId); day(spec.fromQuoteDate); day(spec.toQuoteDate); day(spec.throughReleaseDate);
    array(spec.memberIds, 128); array(spec.supportIds, 8192); spec.memberIds.forEach(id); spec.supportIds.forEach(id); unique(spec.memberIds); unique(spec.supportIds);
    if (specs.has(spec.specId) || spec.fromQuoteDate > spec.toQuoteDate || spec.toQuoteDate > spec.throughReleaseDate) fail('invalid support spec');
    const required = [...expected.values()].filter(m => m.releaseDate <= spec.throughReleaseDate).map(m => m.reportId);
    const requiredCells = [...cells.values()].filter(c => required.includes(c.reportId) && c.quoteDate >= spec.fromQuoteDate && c.quoteDate <= spec.toQuoteDate).map(c => c.supportId);
    const reasons = [];
    if (!equalSet(required, spec.memberIds) || !equalSet(requiredCells, spec.supportIds) || !required.length || !requiredCells.length) reasons.push('support_set_incomplete');
    if (required.some(r => !byReport.has(r) || batchMap.get(expected.get(r).releaseDate).reasons.length)) reasons.push('support_batch_unavailable');
    specs.set(spec.specId, { ...spec, reasons });
  }
  const closureMap = new Map();
  for (const closure of closures) {
    exact(closure, ['specId', 'knownAtUTC']); id(closure.specId);
    if (closureMap.has(closure.specId) || !specs.has(closure.specId)) fail('invalid closure identity');
    // A boolean or malformed date never establishes closure; return pending instead.
    let valid = true; try { utc(closure.knownAtUTC); } catch { valid = false; }
    closureMap.set(closure.specId, valid ? closure.knownAtUTC : null);
  }
  function closureFor(specId, supportIds, cutoff) {
    const spec = specs.get(specId); const known = closureMap.get(specId); const reasons = [];
    if (!spec) return { reasons: ['unknown_support_spec'], known: null };
    reasons.push(...spec.reasons);
    if (!equalSet(supportIds, spec.supportIds)) reasons.push('requested_support_omitted_or_replaced');
    if (!known || known > cutoff || known > asOfUTC) reasons.push('closure_pending');
    // D+2 is issue/label convention, not a minimum closure clock. A date-only
    // synthetic report can close on D; no intraday source-availability claim follows.
    if (known && `${spec.throughReleaseDate}T00:00:00.000Z` > known) reasons.push('closure_precedes_required_report_date');
    if (known && spec.memberIds.some(reportId => byReport.get(reportId)?.syntheticKnownAtUTC > known)) reasons.push('closure_precedes_member_knowledge');
    const support = spec.supportIds.map(s => cells.get(s));
    if (support.some(c => !c || ['unknown_support', 'quarantined'].includes(c.state))) reasons.push('support_unknown_or_quarantined');
    // Any later corpus member changing a previously null cell invalidates fixed support.
    if (support.some(c => c?.state === 'source_null' && [...cells.values()].some(later => later.quoteDate === c.quoteDate && later.state === 'numeric' && later.releaseDate > spec.throughReleaseDate))) reasons.push('late_null_to_numeric_pause');
    return { reasons, known, spec };
  }
  const results = []; const requestIds = []; const issuanceDates = [];
  for (const request of requests) {
    exact(request, ['requestId', 'releaseDate', 'featureSpecId', 'featureSupportIds', 'labelSpecId', 'labelSupportIds', 'anchorSupportId', 'endpointSupportId']);
    for (const name of ['requestId', 'featureSpecId', 'labelSpecId', 'anchorSupportId', 'endpointSupportId']) id(request[name]);
    day(request.releaseDate); requestIds.push(request.requestId); issuanceDates.push(request.releaseDate);
    for (const list of [request.featureSupportIds, request.labelSupportIds]) { array(list, 8192); list.forEach(id); unique(list); }
    const issueAt = plusTwo(request.releaseDate);
    // Date-granularity engineering convention, NOT proof of historical release availability.
    const cutoffAt = `${request.releaseDate}T23:59:59.999Z`;
    const feature = closureFor(request.featureSpecId, request.featureSupportIds, cutoffAt);
    const label = closureFor(request.labelSpecId, request.labelSupportIds, asOfUTC);
    const reasons = [...feature.reasons.map(r => `feature:${r}`), ...label.reasons.map(r => `label:${r}`)];
    if (paused) reasons.push('new_member_pause');
    if (!batchMap.has(request.releaseDate) || batchMap.get(request.releaseDate).reasons.length) reasons.push('issuance_batch_unavailable');
    const numericDates = [...cells.values()].filter(c => c.state === 'numeric' && !batchMap.get(c.releaseDate).reasons.length);
    const latest = numericDates.filter(c => c.releaseDate <= request.releaseDate).map(c => c.quoteDate).sort().at(-1);
    const previousLatest = numericDates.filter(c => c.releaseDate < request.releaseDate).map(c => c.quoteDate).sort().at(-1);
    if (!latest || (previousLatest && latest <= previousLatest)) reasons.push('latest_quote_not_advanced');
    if (issueAt > asOfUTC) reasons.push('issue_future');
    if (feature.spec?.throughReleaseDate > request.releaseDate) reasons.push('future_feature_report');
    const anchor = cells.get(request.anchorSupportId); const endpoint = cells.get(request.endpointSupportId);
    if (![anchor, endpoint].every(c => c?.state === 'numeric') || !request.labelSupportIds.includes(request.anchorSupportId) || !request.labelSupportIds.includes(request.endpointSupportId)) reasons.push('label_endpoint_unavailable');
    let matureAt = null;
    if (anchor?.state === 'numeric' && endpoint?.state === 'numeric') {
      if (anchor.quoteDate <= issueAt.slice(0, 10) || endpoint.quoteDate <= anchor.quoteDate) reasons.push('label_not_strictly_future_ordered');
      // Explicit references may only use the earliest complete eligible numeric occurrence IN THIS CORPUS.
      for (const c of [anchor, endpoint]) if ([...cells.values()].some(other => other.quoteDate === c.quoteDate && other.state === 'numeric' && other.releaseDate < c.releaseDate && !batchMap.get(other.releaseDate).reasons.length)) reasons.push('not_corpus_first_numeric');
      if (!label.reasons.length && label.known) matureAt = [plusTwo(anchor.releaseDate), plusTwo(endpoint.releaseDate), label.known].sort().at(-1);
    }
    const { phase, next } = nextPhase(issueAt);
    if (!phase) reasons.push('outside_fixed_splits');
    if (!matureAt || matureAt > asOfUTC) reasons.push('label_pending');
    const purged = Boolean(next && ((endpoint && endpoint.quoteDate >= next) || (matureAt && matureAt >= `${next}T00:00:00.000Z`)));
    if (purged) reasons.push('cross_phase_label_purged');
    results.push({ requestId: request.requestId, issueAt, cutoffAt, phase, labelMatureAt: matureAt, purged,
      syntheticTimingEligible: reasons.length === 0, caseConstructionVerified: false, reasons: [...new Set(reasons)] });
  }
  unique(requestIds); unique(issuanceDates);
  // Separate hindsight warning only. Future evidence cannot change past results.
  const retrospectiveAuditPaused = futureReports.some(report => {
    const member = expected.get(report.reportId);
    if (!member || report.sha256 !== member.sha256 || report.officialReleaseDate !== member.releaseDate
      || report.indexReleaseDate !== member.releaseDate || (report.noticeReleaseDate !== null && report.noticeReleaseDate !== member.releaseDate)) return true;
    return report.cells.some(cell => [...cells.values()].some(previous => previous.quoteDate === cell.quoteDate
      && ((previous.state === 'source_null' && cell.state === 'numeric') || (previous.state === 'numeric' && (cell.state !== 'numeric' || cell.value !== previous.value)))));
  });
  return { protocolId: frozen.protocolId, protocolSha256: WPSR_PROTOCOL_SHA256, canonicalProtocolSha256: canonicalHash,
    syntheticFixtureOnly: true, eligibleForEvaluation: false, eligibleForPublicProbability: false, eligibleForMainScore: false,
    caseConstructionVerified: false, historicalPublicationCompletenessVerified: false, sourceFirstPublicationVerified: false,
    featureCutoffConvention: 'release_date_UTC_day_end_synthetic_engineering_only', syntheticKnowledgeClockVerified: false, paused, retrospectiveAuditPaused,
    batches: [...batchMap.values()].map(b => ({ releaseDate: b.releaseDate, eligible: !b.reasons.length, reasons: [...new Set(b.reasons)] })), results };
}
