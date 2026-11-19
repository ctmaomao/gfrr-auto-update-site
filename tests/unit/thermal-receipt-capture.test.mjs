import test from 'node:test';
import assert from 'node:assert/strict';
import { createThermalReceiptCapture, isResearchCsvShapeValid } from '../../scripts/oil-directional/thermal-receipt-capture.mjs';
import { fetchFirmsText } from '../../scripts/oil-directional/firms-request-policy.mjs';
const at = '2026-11-15T01:00:00.000Z';
const row = { latitude:'0.1', longitude:'0.2', instrument:'VIIRS', satellite:'N20', acq_date:'2026-11-15', acq_time:'0000', confidence:'h', frp:'0', daynight:'N' };
let requestSequence=0;
const receipt = (records=[row], extra={}) => ({source:'VIIRS_NOAA20_NRT', areaId:`fixture-${++requestSequence}`, bbox:'0,0,1,1', dayRange:1, outcome:'parsed', bodyReceivedAt:at, logicalRequestStartedAt:at, classifiedAt:'2026-11-15T03:00:00.000Z', researchCsvShapeValid:true, diagnostics:{outcome:'success', httpStatus:200, attempts:1, retryCount:0}, records, ...extra});
test('snapshot whitelists fields, keeps real zero/null, and is detached from caller state', () => {
  const c=createThermalReceiptCapture(); const input=receipt([{...row, key:'SECRET_CANARY', url:'https://SECRET_CANARY'}]);
  input.rawCSV='SECRET_CANARY'; input.diagnostics.raw='SECRET_CANARY'; c.record(input);
  input.records[0].frp='8'; const a=c.snapshot(); assert.equal(a.observations[0].revisions[0].frp,0);
  assert.equal(a.eligibleForEvaluation,false); assert.equal(a.crossRunFirstSeen,null); assert.equal(a.coverage,'unknown');assert.equal(a.spatialCoverage,'unknown');assert.equal(a.overpassOpportunity,'unknown');assert.equal(a.cloudQuality,'unknown');
  assert.equal(a.observations[0].firstReceivedInRun,at); assert.equal(Object.hasOwn(a.observations[0], 'latitude'),false); assert.equal(Object.hasOwn(a.observations[0], 'longitude'),false); assert.ok(!JSON.stringify(a).includes('SECRET_CANARY'));
  a.receipts.length=0; assert.equal(c.snapshot().receipts.length,1);
  c.record(receipt([{...row,frp:''}],{bodyReceivedAt:'2026-11-15T02:00:00.000Z'}));
  assert.equal(c.snapshot().observations[0].revisions[1].frp,null);
});
test('overlapping requests and revised content retain one identity and first in-run receipt, not events', () => {
  const c=createThermalReceiptCapture(); c.record(receipt([row,row]));
  c.record(receipt([{...row,frp:'5'}],{areaId:'overlap',bodyReceivedAt:'2026-11-15T02:00:00.000Z'}));
  c.record(receipt()); const s=c.snapshot(); // regressing body clock is rejected atomically
  assert.equal(s.receipts.length,2); assert.equal(s.observations.length,1); assert.equal(s.observations[0].revisions.length,2);
  assert.equal(s.receipts[0].observationIds.length,1); assert.equal(s.complete,false);
});
test('missing coordinates/product/calendar and invalid fields remain research invalid, never invented identity', () => {
  for(const patch of [{latitude:''},{longitude:'181'},{latitude:'2'},{instrument:undefined},{satellite:'N21'},{acq_date:'2026-02-30'},{acq_time:'2400'},{frp:'-1'},{frp:'SECRET_CANARY'},{confidence:{toString:()=> 'h',key:'SECRET_CANARY'}},{acq_date:'2027-01-01'}]) {
    const c=createThermalReceiptCapture(); c.record(receipt([{...row,...patch}])); const s=c.snapshot();
    assert.equal(s.receipts[0].invalidIdentityRowCount,1); assert.equal(s.observations.length,0); assert.equal(s.complete,false);
    assert.ok(!JSON.stringify(s).includes('SECRET_CANARY'));
  }
});
test('zero, parse failure, network failure and retirement remain distinct, coverage always unknown', () => {
  const c=createThermalReceiptCapture();c.record(receipt([]));c.record(receipt([],{outcome:'parse_invalid'}));
  c.record(receipt([],{outcome:'request_error',bodyReceivedAt:null,diagnostics:{outcome:'error',httpStatus:null,attempts:2,retryCount:1,category:'network_error'}}));
  c.record(receipt([],{outcome:'request_error',bodyReceivedAt:null,diagnostics:{outcome:'error',httpStatus:null,attempts:0,retryCount:0,category:'source_retired'}}));
  const s=c.snapshot();assert.deepEqual(s.receipts.map(r=>r.outcome),['success_zero','parse_invalid','request_error','retired']);
  assert.deepEqual(s.receipts.map(r=>r.bodyReceivedAt),[at,at,null,null]);assert.equal(s.coverage,'unknown');
});
test('caps are post-response research bounds, incomplete without raw spill or fake completeness', () => {
  const c=createThermalReceiptCapture(); for(let i=0;i<151;i++)c.record(receipt([]));
  assert.equal(c.snapshot().receipts.length,150);assert.equal(c.snapshot().complete,false);
  assert.ok(Buffer.byteLength(JSON.stringify(c.snapshot()))<=262144);
  const many=createThermalReceiptCapture(); many.record(receipt(Array(1001).fill(row)));
  assert.equal(many.snapshot().receipts.length,0);assert.deepEqual(many.snapshot().limitations,['capacity_exceeded']);
});
test('invalid receipt cannot leak thrown message, unknown context, or impossible clock', () => {
  for(const patch of [{source:'SECRET_CANARY'},{bbox:'SECRET_CANARY'},{bodyReceivedAt:'2026-02-30T01:00:00.000Z'},{dayRange:0},{diagnostics:null}]) {
    const c=createThermalReceiptCapture(); c.record(receipt([] ,patch));const s=c.snapshot();
    assert.equal(s.complete,false);assert.equal(s.receipts.length,0);assert.ok(!JSON.stringify(s).includes('SECRET_CANARY'));
  }
});
test('body receipt timestamp is optional and observed only after awaited response body completion', async()=>{
  const url='https://firms.modaps.eosdis.nasa.gov/api/area/csv/TEST/VIIRS_NOAA20_NRT/0,0,1,1/1';
  let bodyFinishedAt;
  const fetchImpl=async()=>({ok:true,status:200,text:async()=>{await new Promise(r=>setTimeout(r,5));bodyFinishedAt=Date.now();return 'fixture';}});
  const plain=await fetchFirmsText(url,{fetchImpl});assert.equal(Object.hasOwn(plain,'bodyReceivedAt'),false);
  const timed=await fetchFirmsText(url,{fetchImpl,captureBodyReceivedAt:true,nowMs:Date.parse('2020-01-01')});
  assert.ok(Date.parse(timed.bodyReceivedAt)>=bodyFinishedAt);assert.deepEqual(timed.diagnostics,plain.diagnostics);
});

test('serialized byte cap rejects a large sanitized batch atomically', () => {
  const c=createThermalReceiptCapture();c.record(receipt([]));
  c.record(receipt(Array.from({length:900},(_,i)=>({...row,longitude:String((i+1)/1000)}))));
  const s=c.snapshot();assert.equal(s.complete,false);assert.ok(s.limitations.includes('capacity_exceeded'));
  assert.equal(s.receipts.length,1);assert.equal(s.observations.length,0);assert.ok(Buffer.byteLength(JSON.stringify(s))<=s.limits.bytes);
});

const fullHeader='latitude,longitude,instrument,satellite,acq_date,acq_time,confidence,frp,daynight';
test('research CSV gate rejects duplicate headers, wrong cell count, quotes and missing identity without production parsing changes',()=>{
  assert.equal(isResearchCsvShapeValid(fullHeader+'\n'),true);
  assert.equal(isResearchCsvShapeValid(fullHeader+'\n0.1,0.2,VIIRS,N20,2026-11-15,0000,h,0,N'),true);
  for(const csv of [fullHeader+',frp\n',fullHeader+'\n1,2',fullHeader+'\n"0.1,0.2,VIIRS,N20,2026-11-15,0000,h,0,N','acq_date,acq_time,confidence,frp,daynight\n']) assert.equal(isResearchCsvShapeValid(csv),false);
  const c=createThermalReceiptCapture();c.record(receipt([row],{researchCsvShapeValid:false}));
  assert.equal(c.snapshot().complete,false);assert.equal(c.snapshot().receipts[0].outcome,'research_invalid');assert.equal(c.snapshot().receipts[0].parsedRowCount,null);
});
test('manifest is whitelisted and finalize compares expected requests without claiming coverage',()=>{
  const manifest={runId:'123',runAttempt:1,checkoutSha:'a'.repeat(40),configDigest:'b'.repeat(64),geometryDigest:'c'.repeat(64),sourceSet:['VIIRS_NOAA20_NRT'],expectedRequests:1,key:'SECRET_CANARY'};
  const c=createThermalReceiptCapture(manifest);c.record(receipt());const s=c.finalize();
  assert.equal(s.finalized,true);assert.equal(s.complete,true);assert.equal(s.coverage,'unknown');assert.ok(!JSON.stringify(s).includes('SECRET_CANARY'));
  assert.equal(createThermalReceiptCapture(manifest).finalize().complete,false);
  assert.equal(createThermalReceiptCapture().finalize().complete,false);
  assert.throws(()=>createThermalReceiptCapture({...manifest,checkoutSha:'SECRET_CANARY'}));
});

test('processing version is normalized only for missing or empty input and remains revision content', () => {
  const c = createThermalReceiptCapture();
  for (const version of [undefined, null, '', '6.1URT', '6.1RT', '6.1NRT', '61.10.99']) {
    c.record(receipt([{ ...row, instrument: 'MODIS', satellite: 'T', confidence: '85', version }], { source: 'MODIS_NRT' }));
  }
  const snapshot = c.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.observations.length, 1);
  assert.deepEqual(snapshot.observations[0].revisions.map(r => r.processingVersion),
    [null, '6.1URT', '6.1RT', '6.1NRT', '61.10.99']);
});

test('processing version rejects unsupported strings and nonstring input without leaking raw values', () => {
  for (const version of ['SECRET_CANARY', 2, {}, '2.0rt', '2.0RT ', '2.0URT\n', '2.0RTURT',
    '2.0.0.1RT', '2.001URT', 'URT']) {
    const c = createThermalReceiptCapture();
    c.record(receipt([{ ...row, version }]));
    const snapshot = c.snapshot();
    assert.equal(snapshot.complete, false);
    assert.equal(snapshot.receipts[0].invalidIdentityRowCount, 1);
    assert.equal(snapshot.observations.length, 0);
    assert.ok(!JSON.stringify(snapshot).includes('SECRET_CANARY'));
  }
});

test('duplicate logical request cannot satisfy an expected denominator and invalid validation clock stays incomplete',()=>{
  const c=createThermalReceiptCapture();const input=receipt();c.record(input);c.record(input);
  assert.equal(c.snapshot().receipts.length,1);assert.ok(c.snapshot().limitations.includes('duplicate_logical_request'));
  const future=createThermalReceiptCapture();future.record(receipt([],{classifiedAt:'2099-01-01T00:00:00.000Z'}));
  assert.equal(future.snapshot().receipts.length,0);assert.equal(future.snapshot().complete,false);
});
