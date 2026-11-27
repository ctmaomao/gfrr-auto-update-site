// Offline research: caller supplies previously saved official bytes and the expected observation week.
// A publisher release day is not proof of exact time-of-day availability. No writes or scoring.
// Only the explicit --probe-cohort mode makes requests.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

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
function parseDnav(html, id, targetDay, cutoffDay) {
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
 const receipt = {id,releaseDate,targetDay,latest:observations.get(target),valuePrior:observations.get(target-week),change4w:Number((observations.get(target)-observations.get(target-4*week)).toFixed(3)),change13w:Number((observations.get(target)-observations.get(target-13*week)).toFixed(3)),seasonalReferences:comparable.map(x=>new Date(x).toISOString().slice(0,10)),points:observations.size,spanYears:(target-[...observations.keys()][0])/86400000/365.25};
 return {receipt,observations};
}
export function inspectDnav(html, id, targetDay, cutoffDay) {
 return parseDnav(html, id, targetDay, cutoffDay).receipt;
}
const dnavUrl = id => 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=' + id + '&f=W';
function replaySnapshot(bytes, id, target, cutoff, project = false) {
 const {receipt, observations} = parseDnav(bytes.toString('utf8'), id, target, cutoff);
 const sha256 = createHash('sha256').update(bytes).digest('hex');
 return project ? {
  id,
  releaseDate: receipt.releaseDate,
  sourceUrl: dnavUrl(id),
  sha256,
  observations: [...observations].map(([ms,value])=>({period:new Date(ms).toISOString().slice(0,10),value})),
 } : {...receipt,sha256};
}

function readCohort(readSnapshot, target, release, cutoff, project) {
 if (strictDate(release) < strictDate(target) || strictDate(release) > strictDate(cutoff)) {
  throw Error('pinned release day outside replay interval');
 }
 const results = Object.keys(series).map(id => {
  const replay = replaySnapshot(readSnapshot(id), id, target, cutoff, project);
  if (replay.releaseDate !== release) throw Error('cohort release day differs from pinned release');
  return replay;
 });
 return results;
}
export function replayDnavCohort(readSnapshot, target, release, cutoff) {
 return {targetDay:target, releaseDate:release, series:readCohort(readSnapshot,target,release,cutoff,false)};
}
export function projectDnavCohort(readSnapshot, target, release, cutoff) {
 const rows = readCohort(readSnapshot,target,release,cutoff,true);
 return {targetDay:target, releaseDate:release, sourceFormat:'eia-dnav-html', byId:Object.fromEntries(rows.map(({id,...row})=>[id,row]))};
}

const maxPageBytes = 512 * 1024;
export async function probeDnavCohort(target, releaseAt, {now = Date.now(), fetchImpl = fetch, project = false} = {}) {
 const releaseMs = Date.parse(releaseAt);
 const targetMs = strictDate(target);
 if (!Number.isFinite(releaseMs) || new Date(releaseMs).toISOString() !== releaseAt
  || !Number.isFinite(now) || new Date(targetMs).getUTCDay() !== 5
  || releaseMs <= targetMs || releaseMs >= targetMs + week || now < releaseMs) {
  throw Error('invalid or not-yet-reached release window');
 }
 const cutoff = new Date(now).toISOString().slice(0,10);
 const release = releaseAt.slice(0,10);
 const signal = AbortSignal.timeout(15_000);
 const pages = await Promise.all(Object.keys(series).map(async id=>{
  const res = await fetchImpl(dnavUrl(id), {signal, redirect:'error'});
  if (!res.ok || !/^text\/html(?:;|$)/i.test(res.headers.get('content-type') ?? '') || !res.body) {
   await res.body?.cancel();
   throw Error('unexpected DNav response for '+id);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
   const {value,done} = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > maxPageBytes) {
    await reader.cancel();
    throw Error('DNav response too large for '+id);
   }
   chunks.push(value);
  }
  return [id,Buffer.concat(chunks,size)];
 }));
 const byId = new Map(pages);
 return (project ? projectDnavCohort : replayDnavCohort)(id=>byId.get(id),target,release,cutoff);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
 const args = process.argv.slice(2);
 if (args[0] === '--probe-cohort') {
  if (args.length !== 3) throw Error('Usage: --probe-cohort <target-Friday> <scheduled-release-UTC>');
  console.log(JSON.stringify(await probeDnavCohort(...args.slice(1)),null,2));
 } else {
  const project = args[0] === '--project-cohort';
  const cohort = project || args[0] === '--cohort';
  if (args.length !== (cohort ? 5 : 4) || args.some(arg=>!arg)) {
   throw Error('Usage: node tools/oil-directional/replay-eia-dnav-weekly.mjs <snapshot.html> <series> <target-Friday> <cutoff-date> or --cohort/--project-cohort <directory> <target-Friday> <release-day> <cutoff-date>');
  }
  const result = cohort
   ? (project ? projectDnavCohort : replayDnavCohort)(id=>readFileSync(join(args[1], id+'-dnav.html')), ...args.slice(2))
   : replaySnapshot(readFileSync(args[0]), ...args.slice(1));
  console.log(JSON.stringify(result, null, 2));
 }
}
