import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIceBrentCandidate } from '../../scripts/realtime/ice-brent-candidate.mjs';
const now = '2026-11-12T09:00:00Z';
const front = { marketId: 101, marketStrip: 'Jan27', lastPrice: 93, lastTime: '11/12/2026 08:55 AM GMT' };
const back = { ...front, marketId: 102, marketStrip: 'Feb27', lastPrice: 90 };
const parse = rows => parseIceBrentCandidate(rows, now);
test('select chronological front, preserving actual quote time and contract', () => {
  assert.deepEqual(parse([back, front]), { source:'ice', value:93, observedAt:'2026-11-12T08:55:00.000Z', fetchedAt:now,
    delayClass:'delayed-15m', available:true, reason:null, contract:'Jan27', marketId:101 });
});
test('never skip invalid front price or time for valid deferred contract', () => {
  for (const lastPrice of [null, '', '93', NaN, Infinity, 0, 29, 151]) assert.equal(parse([{...front,lastPrice},back]).available,false);
  for (const lastTime of [null, '', '11/12/2026', '11/12/2026 08:55 AM', '02/30/2026 08:55 AM GMT', '11/12/2026 13:55 AM GMT', '11/12/2026 08:99 AM GMT','11/12/2026 10:00 AM GMT']) assert.equal(parse([{...front,lastTime},back]).available,false);
});
test('reject unknown identity, ambiguous front, expired identity and malformed payload', () => {
  for (const rows of [null,{},[],[front,{...back,marketStrip:'unknown'}],[front,{...front,marketId:103}],[{...front,marketStrip:'Oct26'}],[{...front,marketId:null}],Array(257).fill(front)]) assert.equal(parse(rows).available,false);
  assert.equal(parseIceBrentCandidate([front],'bad').available,false);
});
test('stale time is retained for existing 120-minute consensus exclusion', () => {
  assert.equal(parse([{...front,lastTime:'11/10/2026 08:55 AM GMT'}]).observedAt,'2026-11-10T08:55:00.000Z');
});
test('handles noon, midnight, UTC and optional seconds without timezone guessing', () => {
  for (const [raw,expected] of [['11/11/2026 12:00 PM UTC','2026-11-11T12:00:00.000Z'],['11/12/2026 12:01:03 AM GMT','2026-11-12T00:01:03.000Z']]) assert.equal(parse([{...front,lastTime:raw}]).observedAt,expected);
});

// Exercise the actual production fetch wrapper and freshness gate without
// importing its network-writing CLI entry point.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../scripts/run-realtime.mjs', import.meta.url), 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /u);
  return end < 0 ? rest : rest.slice(0,end+1);
}
const evaluateFreshness = vm.runInNewContext([
  'const BRENT_CONSENSUS_MAX_AGE_MINUTES=120;',extract('parseTimestamp'),extract('isFreshEnoughForConsensus'),
  'isFreshEnoughForConsensus'
].join('\n'));
test('actual consensus gate still rejects old ICE timestamps', () => {
  assert.equal(evaluateFreshness(parse([front]),now),true);
  assert.equal(evaluateFreshness(parse([{...front,lastTime:'11/10/2026 08:55 AM GMT'}]),now),false);
});
test('production wrapper isolates HTTP/JSON failures with one request', async () => {
  for (const mode of ['good','json','http']) {
    let calls=0;
    const fetcher = vm.runInNewContext(`${extract('fetchBrentIceCandidate')}\nfetchBrentIceCandidate`,{
      ICE_BRENT_CONTRACT_DATA_URL:'https://example.invalid/fixture',REQUEST_TIMEOUT_MS:8000,
      parseIceBrentCandidate,
      fetchWithTimeout:async () => { calls++; if(mode==='http') throw new Error('HTTP 429'); return mode==='json' ? '<html>blocked</html>' : JSON.stringify([front,back]); },
      buildUnavailableCandidate:(source,fetchedAt,delayClass,reason)=>({source,fetchedAt,delayClass,available:false,reason}),
      classifyFetchFailure:error=>error.message
    });
    const result=await fetcher(now);
    assert.equal(calls,1);assert.equal(result.available,mode==='good');
  }
});
