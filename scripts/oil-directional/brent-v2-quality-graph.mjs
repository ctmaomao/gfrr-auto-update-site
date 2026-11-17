// Draft, pure synthetic graph overlay. No I/O, returns, fitting or case selection.
import protocol from '../../config/brent-spot-release-direction-v2-draft.json' with { type: 'json' };
import v1 from '../../config/brent-spot-release-direction-protocol.json' with { type: 'json' };
const fail = m => { throw new Error(m); };
const DAY = 86400000;
const roles = ['currentLatest', 'previousLatest', 'featureSelection', 'anchorSelection'];
function exact(o, keys) {
  if (!o || Object.getPrototypeOf(o) !== Object.prototype || Reflect.ownKeys(o).length !== keys.length
    || !keys.every(k => Object.hasOwn(o, k) && 'value' in Object.getOwnPropertyDescriptor(o, k))) fail('invalid schema');
}
function array(a, limit) {
  if (!Array.isArray(a) || a.length > limit || Array.from({ length: a.length }, (_, i) => i).some(i => !Object.hasOwn(a, i))) fail('invalid bounded array');
}
function date(s, timestamp = false) {
  const pattern = timestamp ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof s !== 'string' || !pattern.test(s) || !Number.isFinite(Date.parse(s))
    || (timestamp ? new Date(s).toISOString() : new Date(s).toISOString().slice(0, 10)) !== s) fail('unlocatable date');
  return Date.parse(s);
}
const later = d => new Date(date(d) + 2 * DAY).toISOString();
function phase(d) {
  for (const [name, range, next] of [['train', v1.splits.train, v1.splits.calibration[0]],
    ['calibration', v1.splits.calibration, v1.splits.untouchedTest[0]],
    ['test', v1.splits.untouchedTest, v1.splits.secondaryFinalChronologicalHoldout[0]]])
    if (d >= range[0] && d <= range[1]) return { name, next };
  return d >= v1.splits.secondaryFinalChronologicalHoldout[0]
    ? { name: 'secondaryFinalChronologicalHoldout', next: null } : { name: 'outside', next: null };
}
export function reviewSyntheticBrentV2Graph(input) {
  exact(input, ['syntheticFixtureOnly', 'slots', 'cases', 'asOfUTC']);
  if (input.syntheticFixtureOnly !== true) fail('synthetic fixtures only; real execution disabled');
  date(input.asOfUTC, true);
  array(input.slots, protocol.limits.maxSlots); array(input.cases, protocol.limits.maxCases);
  if (!input.slots.length) fail('empty slot universe');
  const slots = new Map(), dates = new Set(), batches = new Set();
  for (const s of input.slots) {
    exact(s, ['id', 'quoteDate', 'availabilityDate', 'state', 'value']);
    if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(s.id) || slots.has(s.id)) fail('duplicate or invalid slot identity');
    date(s.quoteDate); date(s.availabilityDate);
    if (dates.has(s.quoteDate)) fail('duplicate/conflicting quote slot');
    if (!['numeric', 'source_null', 'unknown', 'quarantined'].includes(s.state)
      || (s.state === 'numeric' ? typeof s.value !== 'number' : s.value !== null)) fail('invalid slot state');
    dates.add(s.quoteDate); batches.add(s.availabilityDate); slots.set(s.id, s);
  }
  const ordered = [...slots.values()].sort((a, b) => a.quoteDate.localeCompare(b.quoteDate));
  const positions = new Map(ordered.map((s, i) => [s.id, i]));
  let references = 0;
  function countReferences(n) {
    references += n;
    if (references > protocol.limits.maxDependencyReferences) fail('dependency budget');
  }
  function ids(a) {
    array(a, input.slots.length); countReferences(a.length);
    if (new Set(a).size !== a.length || a.some(id => !slots.has(id))) fail('duplicate/unresolved dependency');
    return a;
  }
  function sortedPath(a) {
    ids(a);
    if (a.some((id, i) => i && slots.get(a[i - 1]).quoteDate >= slots.get(id).quoteDate)) fail('unordered fixed path');
  }
  const caseKeys = new Set(), results = [];
  const fault = s => s.state === 'unknown' || s.state === 'quarantined' || s.availabilityDate < s.quoteDate
    || (s.state === 'numeric' && (!Number.isFinite(s.value) || s.value <= 0));
  for (const c of input.cases) {
    exact(c, ['batchDate', 'horizon', 'featureIds', 'quotePathIds', 'selectionSupport', 'featureClosureKnownAtUTC', 'labelClosureKnownAtUTC']);
    date(c.batchDate);
    if (!batches.has(c.batchDate) || ![1, 5, 20].includes(c.horizon)) fail('unknown batch/horizon');
    const key = `${c.batchDate}/${c.horizon}`;
    if (caseKeys.has(key)) fail('duplicate case'); caseKeys.add(key);
    exact(c.selectionSupport, roles);
    for (const role of roles) ids(c.selectionSupport[role]);
    sortedPath(c.featureIds); sortedPath(c.quotePathIds);
    if (c.featureIds.length > 21 || (c.quotePathIds.length !== 0 && c.quotePathIds.length !== c.horizon + 1)) fail('invalid fixed path length');
    for (const closure of [c.featureClosureKnownAtUTC, c.labelClosureKnownAtUTC]) if (closure !== null) date(closure, true);
    const issueAt = later(c.batchDate), issueDate = issueAt.slice(0, 10), p = phase(issueDate);
    const anchor = slots.get(c.quotePathIds[0]), endpoint = slots.get(c.quotePathIds.at(-1));
    if (anchor && anchor.quoteDate <= issueDate) fail('anchor not strictly future');
    const intervalLength = anchor ? positions.get(endpoint.id) - positions.get(anchor.id) + 1 : 0;
    countReferences(intervalLength);
    const interval = anchor ? ordered.slice(positions.get(anchor.id), positions.get(endpoint.id) + 1) : [];
    const featureSupport = new Set([...c.featureIds, ...c.selectionSupport.currentLatest,
      ...c.selectionSupport.previousLatest, ...c.selectionSupport.featureSelection]);
    const labelSupport = new Set([...c.quotePathIds, ...c.selectionSupport.anchorSelection, ...interval.map(s => s.id)]);
    const reasons = new Set();
    if (p.name === 'outside') reasons.add('outside_phases');
    if (issueAt > input.asOfUTC) reasons.add('issue_after_asof');
    if (c.featureIds.length !== 21) reasons.add('insufficient_fixed_feature_window');
    if (!anchor) reasons.add('missing_fixed_label_path');
    // Validate the declared path without rebuilding it after a quality change.
    if (interval.some(s => s.state === 'numeric' && !c.quotePathIds.includes(s.id))) reasons.add('numeric_interval_slot_omitted');
    if (!roles.every(r => c.selectionSupport[r].length)) reasons.add('missing_declared_selection_support');
    if ([...featureSupport, ...labelSupport].some(id => fault(slots.get(id)))) reasons.add('quarantined_dependency');
    if ([...c.featureIds, ...c.quotePathIds].some(id => slots.get(id).state !== 'numeric')) reasons.add('selected_non_numeric');
    if ([...featureSupport].some(id => slots.get(id).availabilityDate > c.batchDate)) reasons.add('feature_support_after_cutoff');
    if (c.featureClosureKnownAtUTC === null) reasons.add('unknown_feature_closure');
    else if (c.featureClosureKnownAtUTC > issueAt) reasons.add('feature_closure_after_issue');
    if (c.labelClosureKnownAtUTC === null) reasons.add('unknown_label_closure');
    const matureAt = anchor && c.labelClosureKnownAtUTC !== null
      ? [c.labelClosureKnownAtUTC, ...[...labelSupport].map(id => later(slots.get(id).availabilityDate))].sort().at(-1) : null;
    if (matureAt && matureAt > input.asOfUTC) reasons.add('label_not_mature');
    if (p.next && endpoint && (endpoint.quoteDate >= p.next || (matureAt && matureAt >= `${p.next}T00:00:00.000Z`))) reasons.add('purged_phase_boundary');
    const features = c.featureIds.map(id => slots.get(id));
    if (features.length) {
      if ((date(features.at(-1).quoteDate) - date(features[0].quoteDate)) / DAY > v1.issuance.maxLookbackSpanDays) reasons.add('lookback_span');
      if ((date(issueDate) - date(features.at(-1).quoteDate)) / DAY > v1.issuance.maxLatestQuoteAgeAtIssueDays) reasons.add('stale_latest');
      if (features.some((s, i) => i && (date(s.quoteDate) - date(features[i - 1].quoteDate)) / DAY > v1.issuance.maxConsecutiveLookbackGapDays)) reasons.add('lookback_gap');
    }
    if (endpoint && (date(endpoint.quoteDate) - date(issueDate)) / DAY > v1.issuance.maxFutureIntervalSpanDays[String(c.horizon)]) reasons.add('future_span');
    results.push({ caseId: key, batchDate: c.batchDate, issueAt, horizon: c.horizon, phase: p.name,
      featureIds: [...c.featureIds], quotePathIds: [...c.quotePathIds], intervalSlotIds: interval.map(s => s.id),
      anchorId: anchor?.id ?? null, endpointId: endpoint?.id ?? null, matureAt,
      reasons: [...reasons].sort(), syntheticGraphQualityPass: reasons.size === 0 });
  }
  if (caseKeys.size !== batches.size * 3) fail('missing original batch/horizon candidates');
  results.sort((a, b) => a.caseId.localeCompare(b.caseId));
  const byYearPhaseHorizon = {}, reasonOccurrences = {};
  for (const r of results) {
    const group = `${r.issueAt.slice(0, 4)}/${r.phase}/${r.horizon}`;
    const counts = byYearPhaseHorizon[group] ??= { candidates: 0, graphQualityPass: 0 };
    counts.candidates++; if (r.syntheticGraphQualityPass) counts.graphQualityPass++;
    for (const reason of r.reasons) reasonOccurrences[reason] = (reasonOccurrences[reason] ?? 0) + 1;
  }
  return { protocolId: protocol.protocolId, protocolStatus: protocol.status, syntheticFixtureOnly: true,
    results, originalSlots: slots.size, originalAvailabilityBatches: [...batches].sort(),
    coverage: { originalCandidates: results.length, byYearPhaseHorizon, reasonOccurrences, reasonsMayOverlap: true,
      population: 'caller_declared_batch_grid_not_verified_issuance', selectionBiasNotResolved: true },
    dependencyCompletenessVerified: false, caseConstructionVerified: false, historicalAsOfVerified: false,
    eligibleForEvaluation: false, eligibleForPublicProbability: false, eligibleForMainScore: false,
    realExecutionEnabled: false, modelFitted: false };
}
