import test from 'node:test';
import assert from 'node:assert/strict';
import { assessThermalResearchFixtures } from '../../scripts/oil-directional/thermal-research-acceptance.mjs';
const clone = value => structuredClone(value);
const label = () => ({eventId:'independent-event-1',evidenceSource:{kind:'operator',reference:'fixture-announcement-1'},evidencePublishedAt:'2026-01-03T00:00:00Z',planning:'unplanned',onsetEarliestAt:'2026-01-01T10:00:00Z',onsetLatestAt:'2026-01-01T12:00:00Z',affectedUnit:'unit-1',recovery:{status:'unknown',at:null},confirmedReduction:{status:'unknown',amount:null,unit:null}});
const observation = () => ({observationId:'observation-1',assetId:'asset-1',episodeId:'episode-1',firstKnownAt:'2026-01-02T00:00:00Z',acquiredAt:'2026-01-01T13:00:00Z',httpOutcome:'success',overpassOpportunity:'available',spatialCoverage:'complete',cloudQuality:'clear',thermalSignal:'detected'});
const eventCase = () => ({caseId:'case-1',assetId:'asset-1',episodeId:'episode-1',mechanism:'upstream_crude_supply',windowStart:'2026-01-01T00:00:00Z',windowEnd:'2026-01-02T00:00:00Z',eventLabel:label(),observations:[observation()]});
const evaluate = cases => assessThermalResearchFixtures({asOf:'2026-01-04T00:00:00Z',cases});
function renamed(item, suffix) {
  const result=clone(item);result.caseId+=suffix;result.assetId+=suffix;result.episodeId+=suffix;
  if(result.eventLabel) result.eventLabel.eventId+=suffix;
  result.observations.forEach(row=>{row.observationId+=suffix;row.assetId=result.assetId;row.episodeId=result.episodeId;});
  return result;
}

test('HTTP success does not establish overpass, spatial or cloud qualification', () => {
  for(const [field,value] of [['overpassOpportunity','unknown'],['overpassOpportunity','unavailable'],['spatialCoverage','unknown'],['spatialCoverage','partial'],['cloudQuality','unknown'],['cloudQuality','obscured']]) {
    const item=eventCase();item.observations[0][field]=value;const result=evaluate([item]);
    assert.equal(result.rows[0].status,'unassessable');
    assert.equal(result.denominatorAudit.allIndependentKnownEvents,1);
    assert.equal(result.denominatorAudit.knownEventsWithQualifiedObservation,0);
    assert.equal(result.denominatorAudit.knownEventsUnassessable,1);
    assert.equal(result.denominatorAudit.falseNegativeCount,null);
  }
});
test('independent label and missing data stays unassessable; thermal alone stays candidate', () => {
  const absent=eventCase();absent.observations=[];
  assert.equal(evaluate([absent]).rows[0].status,'unassessable');
  const thermal=eventCase();thermal.eventLabel=null;
  const result=evaluate([thermal]);assert.equal(result.rows[0].status,'candidate');
  assert.equal(result.denominatorAudit.allIndependentKnownEvents,0);
  assert.equal(result.rows[0].suddenEventSupport,false);
});
test('two denominators retain uncovered events and stratify planning without a recall claim', () => {
  const supported=eventCase();const uncovered=renamed(eventCase(),'2');uncovered.observations=[];
  const planned=renamed(eventCase(),'3');planned.eventLabel.planning='planned';
  const unknown=renamed(eventCase(),'4');unknown.eventLabel.planning='unknown';
  const noSupport=renamed(eventCase(),'5');noSupport.observations[0].thermalSignal='not_detected';
  const result=evaluate([supported,uncovered,planned,unknown,noSupport]);const d=result.denominatorAudit;
  assert.equal(d.allIndependentKnownEvents,5);assert.equal(d.knownEventsWithQualifiedObservation,4);
  assert.equal(d.knownEventsWithQualifiedThermalSupport,3);assert.equal(d.knownEventsUnassessable,1);
  assert.equal(d.qualifiedKnownEventsWithoutThermalSupport,1);assert.equal(d.excludedFromUnplannedCount,2);
  assert.deepEqual(d.byPlanning.unplanned,{knownEvents:3,qualifiedObservationEvents:2,qualifiedThermalSupportEvents:1});
  assert.equal(result.rows[2].suddenEventSupport,false);assert.equal(result.rows[3].suddenEventSupport,false);
  assert.equal(d.recall,null);assert.equal(d.falseNegativeCount,null);
});
test('event, episode and observation duplication cannot inflate denominators', () => {
  const first=eventCase();
  assert.throws(()=>evaluate([first,clone(first)]),/Duplicate case/);
  const sameEvent=renamed(first,'2');sameEvent.eventLabel.eventId=first.eventLabel.eventId;
  assert.throws(()=>evaluate([first,sameEvent]),/Duplicate independent event/);
  const sameEpisode=renamed(first,'2');sameEpisode.assetId=first.assetId;sameEpisode.episodeId=first.episodeId;
  assert.throws(()=>evaluate([first,sameEpisode]),/Duplicate bound asset episode/);
  const duplicate=eventCase();duplicate.observations.push(clone(duplicate.observations[0]));
  assert.throws(()=>evaluate([duplicate]),/Duplicate observation/);
});
test('asset/window bindings and evidence independence are required assertions', () => {
  const wrongAsset=eventCase();wrongAsset.observations[0].assetId='other';assert.throws(()=>evaluate([wrongAsset]),/binding/);
  const wrongWindow=eventCase();wrongWindow.eventLabel.onsetLatestAt='2026-01-03T00:00:00Z';assert.throws(()=>evaluate([wrongWindow]),/outside bound episode/);
  const circular=eventCase();circular.eventLabel.evidenceSource.kind='thermal';assert.throws(()=>evaluate([circular]));
  const unbound=eventCase();delete unbound.episodeId;assert.throws(()=>evaluate([unbound]));
});
test('as-of excludes later labels and later first-known observations, without a lead-time claim', () => {
  const futureLabel=eventCase();futureLabel.eventLabel.evidencePublishedAt='2026-01-05T00:00:00Z';
  const result=evaluate([futureLabel]);assert.equal(result.rows[0].status,'candidate');assert.equal(result.denominatorAudit.allIndependentKnownEvents,0);
  assert.equal(result.rows[0].independentEventLabel,null);
  assert.ok(!JSON.stringify(result).includes('fixture-announcement-1'));
  const futureObservation=eventCase();futureObservation.observations[0].firstKnownAt='2026-01-05T00:00:00Z';assert.equal(evaluate([futureObservation]).rows[0].status,'unassessable');
  const incomplete=eventCase();incomplete.windowEnd='2026-01-05T00:00:00Z';assert.equal(evaluate([incomplete]).rows[0].status,'unassessable');
  assert.equal(Object.hasOwn(result.rows[0],'leadTimeHours'),false);
});
test('clock validation fails closed and failed HTTP cannot confirm a thermal assertion', () => {
  for(const value of [null,'2026-02-30T00:00:00Z','2026-01-03T25:00:00Z']) {
    const item=eventCase();item.eventLabel.evidencePublishedAt=value;assert.throws(()=>evaluate([item]));
  }
  const time=eventCase();time.observations[0].firstKnownAt='2026-01-01T00:00:00Z';assert.throws(()=>evaluate([time]),/clocks/);
  const failed=eventCase();failed.observations[0].httpOutcome='failure';assert.throws(()=>evaluate([failed]),/lacks observation/);
  failed.observations[0].thermalSignal='unknown';assert.equal(evaluate([failed]).rows[0].status,'unassessable');
});
test('independent reduction and recovery labels are preserved, never inferred from thermal', () => {
  const item=eventCase();item.eventLabel.recovery={status:'recovered',at:'2026-01-02T00:00:00Z'};
  item.eventLabel.confirmedReduction={status:'confirmed',amount:0,unit:'barrels_per_day'};
  const result=evaluate([item]);assert.deepEqual(result.rows[0].independentEventLabel,item.eventLabel);
  result.rows[0].independentEventLabel.recovery.status='changed';assert.equal(item.eventLabel.recovery.status,'recovered');
  const bad=eventCase();bad.eventLabel.confirmedReduction={status:'unknown',amount:10,unit:'barrels_per_day'};assert.throws(()=>evaluate([bad]));
});
test('physical mechanisms stay separate and absent price contract never yields predictive success', () => {
  const cases=['upstream_crude_supply','refinery_crude_demand','product_supply'].map((mechanism,i)=>({...renamed(eventCase(),String(i)),mechanism}));
  const before=clone(cases), result=evaluate(cases);assert.deepEqual(cases,before);
  assert.deepEqual(result.rows.map(row=>row.mechanism),cases.map(item=>item.mechanism));
  assert.equal(result.eligibleForEvaluation,false);assert.equal(result.eligibleForMainScore,false);
  assert.equal(result.dataAuthenticity,'synthetic_fixture_only');assert.equal(result.pricePrediction.status,'unknown');
  assert.equal(result.pricePrediction.eligible,false);assert.equal(Object.hasOwn(result,'weights'),false);
  const extra=eventCase();extra.pricePredictionCorrect=true;assert.throws(()=>evaluate([extra]));
});


test('event qualification excludes pre-onset, uncertain-onset and post-recovery observations', () => {
  for (const acquiredAt of ['2026-01-01T09:00:00Z','2026-01-01T11:00:00Z']) {
    const item=eventCase();item.observations[0].acquiredAt=acquiredAt;
    const result=evaluate([item]);assert.equal(result.rows[0].status,'unassessable');
    assert.equal(result.rows[0].thermalCandidate,true);assert.equal(result.rows[0].qualifiedThermalSupport,false);
    assert.equal(result.denominatorAudit.knownEventsWithQualifiedObservation,0);
  }
  const recovered=eventCase();recovered.eventLabel.recovery={status:'recovered',at:'2026-01-01T12:30:00Z'};
  const result=evaluate([recovered]);assert.equal(result.rows[0].status,'unassessable');
  assert.equal(result.denominatorAudit.knownEventsWithQualifiedThermalSupport,0);
  const boundary=eventCase();boundary.observations[0].acquiredAt=boundary.eventLabel.onsetLatestAt;
  assert.equal(evaluate([boundary]).rows[0].status,'event_with_thermal_support');
});
