import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('bubble-watch.html','utf8');
const tick=vm.runInNewContext(html.slice(html.indexOf('function dateTickIndices('),html.indexOf('function drawCreditTrend('))+';dateTickIndices');
test('short and full-year series retain unique ordered first/last observations at each viewport',()=>{
 for(const n of [6,7,10,262,370]) for(const w of [167,297,303,337,900]) {
  const indices=Array.from(tick(n,w));
  assert.equal(indices[0],0);assert.equal(indices.at(-1),n-1);
  assert.equal(new Set(indices).size,indices.length);
  assert.ok(indices.length>=2&&indices.length<=5);
  assert.ok(indices.every((v,i)=>Number.isInteger(v)&&v>=0&&v<n&&(!i||v>indices[i-1])));
 }
 assert.deepEqual(Array.from(tick(6,303)),[0,2,3,5]);
 assert.deepEqual(Array.from(tick(262,900)),[0,65,131,196,261]);
 assert.deepEqual(Array.from(tick(10,292,10)),[0,3,6,9]);
 assert.deepEqual(Array.from(tick(10,1000,10)),[0,1,2,3,4,5,6,7,8,9]);
});
test('invalid tick inputs are empty rather than fabricated dates',()=>{
 for(const [n,w]of [[null,300],[0,300],[1,300],[2.5,300],[6,NaN],[6,0]]) assert.deepEqual(Array.from(tick(n,w)),[]);
});
test('first/last labels anchor inward without changing points or date granularity',()=>{
 assert.match(html,/i === 0 \? 'start' : i === points.length - 1 \? 'end' : 'middle'/);
 assert.match(html,/i === 0 \? 'start' : i === seed.length - 1 \? 'end' : 'middle'/);
 assert.match(html,/points\[i\]\.date\.slice\(0,7\)/);
});
