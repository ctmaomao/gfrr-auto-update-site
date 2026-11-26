// Offline research: caller supplies previously saved official bytes and the expected observation week.
// A publisher release day is not proof of exact time-of-day availability. No network, writes or scoring.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const series = {
 WCESTUS1:'Weekly U.S. Ending Stocks excluding SPR of Crude Oil (Thousand Barrels)',
 WCSSTUS1:'Weekly U.S. Ending Stocks of Crude Oil in SPR (Thousand Barrels)',
 WDISTUS1:'Weekly U.S. Ending Stocks of Distillate Fuel Oil (Thousand Barrels)',
 WGTSTUS1:'Weekly U.S. Ending Stocks of Total Gasoline (Thousand Barrels)',
 WGFUPUS2:'Weekly U.S. Product Supplied of Finished Motor Gasoline (Thousand Barrels per Day)',
 WPULEUS3:'Weekly U.S. Percent Utilization of Refinery Operable Capacity (Percent)',
 WCRRIUS2: 'Weekly U.S. Refiner Net Input of Crude Oil (Thousand Barrels per Day)',
 WDIUPUS2: 'Weekly U.S. Product Supplied of Distillate Fuel Oil (Thousand Barrels per Day)',
};
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const week = 604800000;
const norm = text => text.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
function strictDate(date) {
 const ms = Date.parse(date + 'T00:00:00.000Z');
 if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== date) throw Error('invalid calendar date');
 return ms;
}
export function inspectDnav(html, id, targetDay, cutoffDay) {
 if (typeof html!=='string' || !Object.hasOwn(series,id)) throw Error('series identity or unit mismatch');
 const title = html.match(/<title>\s*([^<]+)<\/title>/i)?.[1];
 if (!series[id] || !title || norm(title)!==series[id] || !html.includes('../hist_xls/'+id+'w.xls')) throw Error('series identity or unit mismatch');
 const release = [...html.matchAll(/>\s*Release Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*</gi)];
 if (release.length!==1) throw Error('release date ambiguous');
 const [,rm,rd,ry] = release[0];
 const releaseDate = ry+'-'+rm.padStart(2,'0')+'-'+rd.padStart(2,'0');
 const target = strictDate(targetDay);
 if (strictDate(releaseDate)<target || strictDate(releaseDate)>strictDate(cutoffDay)) throw Error('release day outside replay interval');
 const tables = [...html.matchAll(/<table\b[^>]*class=['"]FloatTitle['"][^>]*>([\s\S]*?)<\/table>/gi)];
 if (tables.length!==1 || !/>Year-Month</i.test(tables[0][1]) || !/>End Date</i.test(tables[0][1])) throw Error('weekly table mismatch');
 const observations = new Map();
 let newest = 0;
 for (const [,row] of tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells=[...row.matchAll(/<td\b[^>]*>([^<]*)<\/td>/gi)].map(x=>norm(x[1]));
  const month=cells[0]?.match(/^(\d{4})-([A-Z][a-z]{2})$/);
  if (!month) continue;
  const m=months.indexOf(month[2])+1;
  if (!m || cells.length!==11) throw Error('unexpected row layout');
  for(let i=1;i<11;i+=2){
   const [d,v]=[cells[i],cells[i+1]];
   if (!d && !v) continue;
   if (!/^\d{2}\/\d{2}$/.test(d) || Number(d.slice(0,2))!==m) throw Error('week date/month mismatch');
   const period = month[1]+'-'+d.replace('/','-');
   const ms=strictDate(period);
   if(ms<=newest || ms>target || new Date(ms).getUTCDay()!==5) throw Error('duplicate, mixed cadence or after target');
   newest=ms;
   if(!v || ['-','--','NA','W'].includes(v)) continue;
   if(!(id==='WPULEUS3'?/^\d{1,3}(?:\.\d+)?$/:/^(?:\d+|\d{1,3}(?:,\d{3})+)$/).test(v)) throw Error('malformed numeric observation');
   const number=Number(v.replaceAll(',','')); if(!Number.isFinite(number)) throw Error('nonfinite'); observations.set(ms,number);
  }
 }
 if(newest!==target || !Array.from({length:14},(_,i)=>observations.has(target-i*week)).every(Boolean)) throw Error('target or recent weekly history incomplete');
 const year=new Date(target).getUTCFullYear();
 const comparable=Array.from({length:5},(_,i)=>{
  const day=targetDay.replace(/^\d{4}/,String(year-1-i));const ms=strictDate(day);
  return [...observations.keys()].filter(x=>Math.abs(x-ms)<=week).sort((a,b)=>Math.abs(a-ms)-Math.abs(b-ms))[0];
 });
 if(comparable.some(x=>x===undefined)) throw Error('insufficient five-year reference');
 return {id,releaseDate,targetDay,latest:observations.get(target),valuePrior:observations.get(target-week),change4w:Number((observations.get(target)-observations.get(target-4*week)).toFixed(3)),change13w:Number((observations.get(target)-observations.get(target-13*week)).toFixed(3)),seasonalReferences:comparable.map(x=>new Date(x).toISOString().slice(0,10)),points:observations.size,spanYears:(target-[...observations.keys()][0])/86400000/365.25};
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
 const [, , file, id, target, cutoff] = process.argv;
 if (!file || !id || !target || !cutoff || process.argv.length!==6) throw Error('Usage: node tools/oil-directional/replay-eia-dnav-weekly.mjs <snapshot.html> <series> <target-Friday> <cutoff-date>');
 const bytes = readFileSync(file);
 const replay = inspectDnav(bytes.toString('utf8'), id, target, cutoff);
 console.log(JSON.stringify({...replay, sha256:createHash('sha256').update(bytes).digest('hex')}, null, 2));
}
