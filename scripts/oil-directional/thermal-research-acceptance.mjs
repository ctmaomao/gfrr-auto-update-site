// Pure synthetic-fixture acceptance semantics, not a collector or measured skill.
// Input clocks, asset bindings, coverage and independent labels are assertions.
const MAX_CASES = 100;
const MAX_OBSERVATIONS = 32;
const MECHANISMS = ['upstream_crude_supply', 'refinery_crude_demand', 'product_supply'];
function demand(ok, message) { if (!ok) throw new Error(message); }
function fields(value, expected) {
  demand(value && typeof value === 'object' && !Array.isArray(value), 'Expected record');
  demand(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), 'Unexpected or missing field');
}
function id(value) {
  demand(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(value), 'Invalid fixture identifier');
  return value;
}
function utc(value) {
  demand(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'Invalid UTC clock');
  const time = Date.parse(value);
  demand(Number.isFinite(time), 'Invalid UTC clock');
  const canonical = new Date(time).toISOString();
  demand(canonical === value || canonical === value.replace('Z', '.000Z'), 'Invalid UTC calendar');
  return time;
}
function member(value, choices) { demand(choices.includes(value), 'Invalid enum'); return value; }
function labelOf(label, windowStart, windowEnd) {
  if (label === null) return null;
  fields(label, ['eventId', 'evidenceSource', 'evidencePublishedAt', 'planning', 'onsetEarliestAt', 'onsetLatestAt', 'affectedUnit', 'recovery', 'confirmedReduction']);
  id(label.eventId); id(label.affectedUnit);
  fields(label.evidenceSource, ['kind', 'reference']);
  member(label.evidenceSource.kind, ['operator', 'government', 'port', 'independent_other']);
  id(label.evidenceSource.reference); // Fixture reference, never fetched or authenticated.
  const publishedAt = utc(label.evidencePublishedAt);
  const earliest = utc(label.onsetEarliestAt), latest = utc(label.onsetLatestAt);
  demand(windowStart <= earliest && earliest <= latest && latest <= windowEnd, 'Event outside bound episode');
  member(label.planning, ['planned', 'unplanned', 'unknown']);
  fields(label.recovery, ['status', 'at']);
  member(label.recovery.status, ['recovered', 'not_recovered', 'unknown']);
  if (label.recovery.status === 'recovered') {
    const recoveredAt = utc(label.recovery.at);
    demand(recoveredAt >= latest && recoveredAt <= publishedAt, 'Inconsistent recovery clocks');
  } else demand(label.recovery.at === null, 'Unknown recovery time must remain null');
  fields(label.confirmedReduction, ['status', 'amount', 'unit']);
  const reduction = label.confirmedReduction;
  member(reduction.status, ['confirmed', 'not_confirmed', 'unknown']);
  if (reduction.status === 'confirmed' && reduction.amount !== null) {
    demand(typeof reduction.amount === 'number' && Number.isFinite(reduction.amount) && reduction.amount >= 0, 'Invalid reduction measurement');
    member(reduction.unit, ['barrels_per_day', 'tonnes_per_day', 'percent']);
    demand(reduction.unit !== 'percent' || reduction.amount <= 100, 'Invalid percentage');
  } else demand(reduction.amount === null && reduction.unit === null, 'Unmeasured reduction must remain unknown');
  return { ...label, publishedAt, onsetLatest: latest };
}

export function assessThermalResearchFixtures(input) {
  demand(new TextEncoder().encode(JSON.stringify(input)).byteLength <= 500_000, 'Fixture byte limit exceeded');
  fields(input, ['asOf', 'cases']);
  const asOf = utc(input.asOf);
  demand(Array.isArray(input.cases) && input.cases.length <= MAX_CASES, 'Case limit exceeded');
  const caseIds = new Set(), episodeIds = new Set(), eventIds = new Set(), observationIds = new Set();
  const rows = input.cases.map(item => {
    fields(item, ['caseId', 'assetId', 'episodeId', 'mechanism', 'windowStart', 'windowEnd', 'eventLabel', 'observations']);
    id(item.caseId); id(item.assetId); id(item.episodeId);
    demand(!caseIds.has(item.caseId), 'Duplicate case'); caseIds.add(item.caseId);
    const episodeKey = `${item.assetId}/${item.episodeId}`;
    demand(!episodeIds.has(episodeKey), 'Duplicate bound asset episode'); episodeIds.add(episodeKey);
    member(item.mechanism, MECHANISMS);
    const windowStart = utc(item.windowStart), windowEnd = utc(item.windowEnd);
    demand(windowStart <= windowEnd, 'Invalid episode window');
    const label = labelOf(item.eventLabel, windowStart, windowEnd);
    if (label) { demand(!eventIds.has(label.eventId), 'Duplicate independent event'); eventIds.add(label.eventId); }
    const labelAvailable = label !== null && label.publishedAt <= asOf;
    const knownEvent = labelAvailable && label.onsetLatest <= asOf;
    // The uncertain-onset interval is not confirmed event-time exposure. Before
    // onsetLatest or after recovery, a thermal signal remains only a candidate.
    const eventEnd = knownEvent && label.recovery.status === 'recovered' ? utc(label.recovery.at) : windowEnd;
    demand(Array.isArray(item.observations) && item.observations.length <= MAX_OBSERVATIONS, 'Observation limit exceeded');
    const observations = item.observations.map(observation => {
      fields(observation, ['observationId', 'assetId', 'episodeId', 'firstKnownAt', 'acquiredAt', 'httpOutcome', 'overpassOpportunity', 'spatialCoverage', 'cloudQuality', 'thermalSignal']);
      id(observation.observationId);
      demand(!observationIds.has(observation.observationId), 'Duplicate observation'); observationIds.add(observation.observationId);
      demand(observation.assetId === item.assetId && observation.episodeId === item.episodeId, 'Observation binding mismatch');
      member(observation.httpOutcome, ['success', 'failure', 'unknown']);
      member(observation.overpassOpportunity, ['available', 'unavailable', 'unknown']);
      member(observation.spatialCoverage, ['complete', 'partial', 'unknown']);
      member(observation.cloudQuality, ['clear', 'obscured', 'unknown']);
      member(observation.thermalSignal, ['detected', 'not_detected', 'unknown']);
      const received = observation.firstKnownAt === null ? null : utc(observation.firstKnownAt);
      const acquired = observation.acquiredAt === null ? null : utc(observation.acquiredAt);
      demand(acquired === null || (received !== null && acquired <= received && acquired >= windowStart && acquired <= windowEnd), 'Inconsistent observation clocks');
      demand(observation.thermalSignal === 'unknown' || (received !== null && acquired !== null && observation.httpOutcome === 'success'), 'Thermal assertion lacks observation');
      const available = received !== null && received <= asOf;
      const withinEvaluationPeriod = knownEvent
        ? eventEnd <= asOf && acquired >= label.onsetLatest && acquired <= eventEnd
        : windowEnd <= asOf;
      const qualified = available && acquired !== null && withinEvaluationPeriod && observation.httpOutcome === 'success'
        && observation.overpassOpportunity === 'available' && observation.spatialCoverage === 'complete'
        && observation.cloudQuality === 'clear' && observation.thermalSignal !== 'unknown';
      return { available, qualified, detected: observation.thermalSignal === 'detected' };
    });
    const qualified = observations.some(row => row.qualified);
    const supported = observations.some(row => row.qualified && row.detected);
    const candidate = observations.some(row => row.available && row.detected);
    return { caseId: item.caseId, assetId: item.assetId, episodeId: item.episodeId, mechanism: item.mechanism,
      independentEventLabel: labelAvailable ? structuredClone(item.eventLabel) : null,
      knownEvent, eventId: knownEvent ? label.eventId : null, planning: knownEvent ? label.planning : 'unknown',
      qualifiedObservation: qualified, qualifiedThermalSupport: knownEvent && supported,
      thermalCandidate: candidate, suddenEventSupport: knownEvent && label.planning === 'unplanned' && supported,
      status: knownEvent ? (!qualified ? 'unassessable' : supported ? 'event_with_thermal_support' : 'event_without_thermal_support')
        : candidate ? 'candidate' : 'unknown' };
  });
  const known = rows.filter(row => row.knownEvent);
  const qualified = known.filter(row => row.qualifiedObservation);
  return { schemaVersion: 'thermal-research-acceptance-fixture-1', dataAuthenticity: 'synthetic_fixture_only',
    eligibleForEvaluation: false, eligibleForMainScore: false, pricePrediction: { status: 'unknown', eligible: false, reason: 'prediction_contract_not_implemented' },
    rows, denominatorAudit: {
      allIndependentKnownEvents: known.length,
      knownEventsWithQualifiedObservation: qualified.length,
      knownEventsWithQualifiedThermalSupport: qualified.filter(row => row.qualifiedThermalSupport).length,
      knownEventsUnassessable: known.length - qualified.length,
      qualifiedKnownEventsWithoutThermalSupport: qualified.filter(row => !row.qualifiedThermalSupport).length,
      byPlanning: Object.fromEntries(['planned', 'unplanned', 'unknown'].map(planning => {
        const group = known.filter(row => row.planning === planning);
        return [planning, { knownEvents: group.length, qualifiedObservationEvents: group.filter(row => row.qualifiedObservation).length,
          qualifiedThermalSupportEvents: group.filter(row => row.qualifiedThermalSupport).length }];
      })),
      excludedFromUnplannedCount: known.filter(row => row.planning !== 'unplanned').length,
      recall: null, falseNegativeCount: null,
      limitation: 'Fixture-bound episode counts only; not measured end-to-end recall or a complete event inventory. Unknown opportunity is not a false negative.'
    } };
}
