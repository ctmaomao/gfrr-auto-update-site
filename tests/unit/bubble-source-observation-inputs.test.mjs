import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseCapeAtom, parseStockAnalysisMetricDate, parseBubbleFredRows, requireDailyObservation } from '../../scripts/bubble-watch/source-observation-inputs.mjs';
import { stripTags } from '../../scripts/bubble-watch/public-html-parsers.mjs';
const today='2026-11-12';
const atom=(date='2026-11-11',value='40.24')=>`<feed><updated>2026-11-12T10:00:00Z</updated><entry><id>http://www.multpl.com/shiller-pe/${date}/</id><title>Shiller PE Ratio</title><updated>${date}T16:00:00-05:00</updated><content type="html">&lt;b&gt;Current&lt;span&gt; Shiller PE Ratio&lt;/span&gt;:&lt;/b&gt; ${value}</content></entry></feed>`;
test('CAPE binds value to entry timestamp rather than feed/retrieval clock',()=>{
 assert.deepEqual(parseCapeAtom(atom(),today),{value:40.24,observationDate:'2026-11-11',sourceTimestamp:'2026-11-11T16:00:00-05:00'});
 for(const bad of [atom('2026-11-01'),atom('2026-11-13'),atom('2026-02-30'),atom().replace('-05:00',''),atom().replace('T16:00:00','T24:00:00'),atom().replace('T16:00:00','T16:60:00'),atom().replace('-05:00','-15:00'),atom().replace('/2026-11-11/','/2026-11-10/'),atom()+atom(),atom('2026-11-11','Infinity')]) assert.throws(()=>parseCapeAtom(bad,today));
});
test('holdings date excludes quote and last-checked dates; financial metric date requires its own label',()=>{
 const holdings='At close: Nov 11, 2026 Top 25 Holdings Updated Nov 10, 2026 Last checked: Nov 12, 2026';
 assert.equal(parseStockAnalysisMetricDate(holdings,'holdings',today),'2026-11-10');
 assert.equal(parseStockAnalysisMetricDate('Last updated: Nov 11, 2026 Financial statistics are provided by S&P Global','statistics',today),'2026-11-11');
 for(const text of ['Last checked: Nov 12, 2026','Top 25 Holdings Updated Nov 1, 2026','Top 25 Holdings Updated Nov 13, 2026',holdings+' Top 25 Holdings Updated Nov 9, 2026']) assert.throws(()=>parseStockAnalysisMetricDate(text,'holdings',today));
 assert.throws(()=>parseStockAnalysisMetricDate('Last updated: Nov 12, 2026 quote price','statistics',today));
});
test('FRED missing values stay missing and real zero is retained, dated and sorted',()=>{
 const rows=['', ' ', '.',null,undefined,false,[],{},'NaN','Infinity','0x01'].map(value=>({date:'2026-11-12',value}));
 rows.push({date:'2026-11-10',value:'0'},{date:'2026-11-11',value:'2.5'});
 assert.deepEqual(parseBubbleFredRows(rows,today),[{date:'2026-11-11',value:2.5},{date:'2026-11-10',value:0}]);
 assert.throws(()=>parseBubbleFredRows([{date:'2026-11-13',value:2}],today));
 assert.throws(()=>parseBubbleFredRows([{date:'2026-02-30',value:2}],today));
 assert.throws(()=>parseBubbleFredRows([{date:'2026-11-11',value:2},{date:'2026-11-11',value:3}],today),/conflict/);
 assert.throws(()=>parseBubbleFredRows({},today));
 assert.equal(requireDailyObservation('2026-11-05',today,'test').ageDays,7);
 assert.throws(()=>requireDailyObservation('2026-11-04',today,'test'),/stale/);
});
test('actual fetchers preserve source dates and use one CAPE Atom request',async()=>{
 const source=fs.readFileSync(new URL('../../scripts/build-bubble-watch.mjs',import.meta.url),'utf8');
 const cut=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
 const urls=[];
 const context=vm.createContext({parseCapeAtom,parseStockAnalysisMetricDate,parseBubbleFredRows,stripTags,isoDate:()=>today,BROWSER_UA:'test',UA:'test',FRED_API_KEY:'',fetchWithTimeout:async url=>{urls.push(url);return url.includes('/atom')?atom():'Forward PE 14.75 Last updated: Nov 11, 2026 Financial statistics are provided';}});
 vm.runInContext(cut('async function fetchMultplCape()','// SPY holdings:')+cut('async function fetchNvdaForwardPe()','async function crunchbaseWpSearch')+'globalThis.cape=fetchMultplCape;globalThis.pe=fetchNvdaForwardPe;',context);
 assert.equal((await context.cape()).observationDate,'2026-11-11');
 assert.equal((await context.pe()).observationDate,'2026-11-11');
 assert.equal(urls.filter(url=>url.includes('multpl')).length,1);
 assert.match(urls[0],/\/shiller-pe\/atom$/);
});
