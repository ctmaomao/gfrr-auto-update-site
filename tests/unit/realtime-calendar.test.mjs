import assert from 'node:assert/strict';
import test from 'node:test';
import { parseObservationTimestamp } from '../../scripts/daily/source-observation.mjs';
import { sourceTimestampAgeSeconds } from '../../scripts/realtime/gold-quote.mjs';
import { computeAgeMinutes, parseObservedAtUtc, prepareBrentCandidatesForConsensus, buildBrentPromotionDecision, buildBrentConsensus } from '../../scripts/run-realtime.mjs';
const now = '2026-03-02T12:00:00Z';
const invalid = ['2026-03-02T12:00:00+0:00', '2026-03-02T12:00:00oops', '2026-03-02Tbad', '2026-03-02 12:00:00oops', '2026-02-30', '2025-02-29', '2026-04-31', '2026-02-30T12:00:00Z', '2026-02-30t12:00:00z', '2026-02-30 12:00:00Z', '2026-03-02T24:00:00Z', '2026-03-02T12:00:00+14:30', '2026-03-02T12:00:00'];
const candidate = (source, observedAt) => ({ source, observedAt, value:90, available:true });
test('canonical observation clocks reject calendar/time rollover and implicit timezone', () => {
  for (const value of invalid) {
    assert.equal(parseObservationTimestamp(value), null, value);
    assert.equal(sourceTimestampAgeSeconds(value, Date.parse(now)), null, value);
    assert.equal(computeAgeMinutes(value, now), null, value);
    assert.equal(computeAgeMinutes(now, value), null, value);
  }
  for (const value of ['2024-02-29', '2026-03-02', '2026-03-02T12:00Z', '2026-03-02T12:00:00+0000', '2026-03-02t12:00:00z', '2026-03-02T12:00:00Z', '2026-03-02T13:00:00.123+01:00', '2026-03-02T01:00:00+14:00', '2026-03-02T23:00:00-12:00']) assert.equal(parseObservationTimestamp(value), Date.parse(value));
  assert.equal(computeAgeMinutes('2026-03-02T12:05:00Z', now), 0);
  assert.equal(computeAgeMinutes('2026-03-02T12:05:00.001Z', now), null);
});
test('invalid canonical dates cannot enter Brent consensus, Stooq exception or Oilprice weak confirmation', () => {
  for (const source of ['ice','barchart','stooq','marketwatch','oilprice','yahoo']) {
    for (const value of invalid) {
      const result = prepareBrentCandidatesForConsensus([candidate('barchart', now),candidate(source,value)],now)[1];
      assert.equal(result.participatesInConsensus,false,`${source}/${value}`);
      assert.equal(result.weakConfirmation,false);
    }
  }
  const candidates = prepareBrentCandidatesForConsensus([candidate('ice',now),candidate('barchart',now)],now);
  const result = buildBrentPromotionDecision([{key:'brent',value:88,timestamp:'2026-02-30'}],{candidates,consensus:buildBrentConsensus(candidates)},now);
  assert.equal(result.applied,false);
  assert.equal(result.anchorAgeHours,null);
});
test('HTML canonical timestamp rejects before normalization, not as missing weak confirmation', () => {
  for (const value of invalid) assert.throws(()=>parseObservedAtUtc(value),/observation_timestamp_invalid/);
  assert.equal(parseObservedAtUtc('2024-02-29T12:00:00Z'),'2024-02-29T12:00:00.000Z');
  assert.equal(parseObservedAtUtc('1772452800'),'2026-03-02T12:00:00.000Z');
  assert.equal(parseObservedAtUtc('March 2, 2026 12:00 PM UTC'),'2026-03-02T12:00:00.000Z');
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('production HTML wrapper makes malformed canonical clock unavailable with no added request', async () => {
  const source = readFileSync(new URL('../../scripts/run-realtime.mjs', import.meta.url),'utf8');
  const body = source.slice(source.indexOf('async function fetchBrentHtmlCandidate('),source.indexOf('\nasync function fetchBrentBarchartCandidate('));
  let requests = 0;
  let raw;
  const fetchCandidate = vm.runInNewContext(`${body}\nfetchBrentHtmlCandidate`, {
    retryTask: task=>task(), fetchWithTimeout: async()=>{requests++;return 'fixture';}, REQUEST_TIMEOUT_MS:8000,
    extractValueByPatterns:()=>90, isReasonableBrentValue:()=>true,
    extractObservedAtByPatterns:()=>parseObservedAtUtc(raw),
    buildUnavailableCandidate:(source,fetchedAt,delayClass,reason)=>({source,fetchedAt,delayClass,reason,available:false,observedAt:null}),
    classifyFetchFailure: error=>error.message
  });
  for (raw of invalid) {
  const result=await fetchCandidate({source:'oilprice',delayClass:'delayed-web',url:'https://example.invalid'},now);

  assert.equal(result.available,false);
  assert.equal(result.reason,'observation_timestamp_invalid');
  assert.equal(prepareBrentCandidatesForConsensus([candidate('barchart',now),result],now)[1].weakConfirmation,false);
  }
  assert.equal(requests,invalid.length);
});
