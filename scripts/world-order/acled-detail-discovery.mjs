import { AUTH_PROBE, controlRequest, sessionCookie } from './acled-authenticated-probe.mjs';
import { validateAcledDownloadManifest } from './acled-download-manifest.mjs';
import { parseAcledMonthlyFilename } from './acled-monthly-filename.mjs';
import { selectWeeklyFiles } from './acled-weekly-coverage.mjs';

// Exact detail routes observed on the official aggregated directory, 2026-09-17.
// Never enumerate dates, routes, or files; this operation reads HTML only.
export const DETAIL_PAGES = Object.freeze([
  ['monthly','political_violence_events_by_country-year','number-political-violence-events-country-year'],
  ['monthly','political_violence_events_by_country-month-year','number-political-violence-events-country-month-year'],
  ['monthly','demonstration_events_by_country-year','number-demonstration-events-country-year'],
  ['monthly','reported_fatalities_by_country-year','number-reported-fatalities-country-year'],
  ['monthly','reported_civilian_fatalities_by_country-year','number-reported-civilian-fatalities-direct-targeting-country-year'],
  ['monthly','events_targeting_civilians_by_country-year','number-events-targeting-civilians-country-year'],
  ['weekly','Africa','aggregated-data-africa'],
  ['weekly','Asia-Pacific','aggregated-data-asia-pacific'],
  ['weekly','Europe-Central-Asia','aggregated-data-europe-and-central-asia'],
  ['weekly','Latin-America-the-Caribbean','aggregated-data-latin-america-caribbean'],
  ['weekly','Middle-East','aggregated-data-middle-east'],
  ['weekly','US-and-Canada','aggregated-data-united-states-canada'],
].map(([kind,identity,route])=>Object.freeze({kind,identity,url:`https://acleddata.com/aggregated/${route}`})));

export function extractDetailLink(html, page) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 1048576 || !DETAIL_PAGES.includes(page)) throw new Error('detail_invalid');
  const found = new Set();
  // Accept quoted static paths in attributes or JSON. No JS execution, HTML storage,
  // entity decoding, arbitrary host, query, encoded path or redirect traversal.
  for (const match of html.replace(/\\\//gu,'/').matchAll(/["']((?:https:\/\/acleddata\.com)?\/system\/files\/[^"'<>\s]{1,1024})["']/gu)) {
    const url = match[1].startsWith('/') ? `https://acleddata.com${match[1]}` : match[1];
    if (!/^https:\/\/acleddata\.com\/system\/files\/\d{4}-(?:0[1-9]|1[0-2])\/[A-Za-z0-9_.-]+\.xlsx$/u.test(url)) continue;
    const filename = url.slice(url.lastIndexOf('/')+1);
    if (page.kind === 'monthly') {
      if (parseAcledMonthlyFilename(filename)?.slug === page.identity) found.add(url);
    } else {
      try { if (selectWeeklyFiles([filename])[0]?.region === page.identity) found.add(url); } catch { /* Invalid source dates cannot qualify. */ }
    }
  }
  if (found.size !== 1) throw new Error('link_missing_or_ambiguous');
  return [...found][0];
}

export async function discoverAcledDetails({username,password,fetchImpl=fetch,timeoutMs=15000}={}) {
  const report = {schemaVersion:'acled-detail-discovery-v1',status:'stopped',requestCount:0,
    login:'not_attempted',logout:'not_attempted',sessionMayRemain:false,pages:[],
    productionWritten:false,rawFileSaved:false,rawPagesSaved:false,contentValidated:false};
  if (![username,password].every(v=>typeof v==='string' && v.length>0 && v.length<=1024 && !/[\x00-\x1f\x7f]/u.test(v))) {
    return {...report,reason:'credentials_missing_or_invalid'};
  }
  // Requests are serial and bounded by the immutable 12-element list plus controls.
  report.requestCount++;
  const login=await controlRequest(AUTH_PROBE.loginUrl,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({name:username,pass:password})},fetchImpl,timeoutMs);
  report.loginHttpStatus=login.httpStatus; report.loginBytes=login.receivedBytes; report.sessionMayRemain=true;
  if (!login.ok) return {...report,login:'unconfirmed',reason:login.reason};
  let cookie,csrfToken,logoutToken;
  try {
    if (login.httpStatus!==200 || (login.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json') throw new Error();
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(login.bytes));
    if (!/^[1-9]\d*$/u.test(String(value?.current_user?.uid??'')) || value.current_user.name!==username
      || ![value.logout_token,value.csrf_token].every(v=>typeof v==='string' && /^[A-Za-z0-9_-]{16,256}$/u.test(v))) throw new Error();
    cookie=sessionCookie(login.headers); csrfToken=value.csrf_token; logoutToken=value.logout_token;
  } catch {return {...report,login:'unconfirmed',reason:'login_contract_invalid'};}
  report.login='confirmed';
  try {
    const urls=[];
    for (const page of DETAIL_PAGES) {
      report.requestCount++;
      const response=await controlRequest(page.url,{method:'GET',headers:{Cookie:cookie,Accept:'text/html'}},fetchImpl,timeoutMs,'html');
      const receipt={kind:page.kind,identity:page.identity,httpStatus:response.httpStatus,bytes:response.receivedBytes};
      report.pages.push(receipt);
      if (!response.ok) {receipt.reason=response.reason;report.reason='detail_read_failed';return report;}
      try {urls.push(extractDetailLink(new TextDecoder('utf-8',{fatal:true}).decode(response.bytes),page));receipt.status='link_identified';}
      catch {receipt.reason='link_missing_or_ambiguous';report.reason='detail_link_failed';return report;}
    }
    // Only a complete, date-consistent manifest can expose public static link metadata.
    const manifest=validateAcledDownloadManifest(urls);
    report.links=manifest.entries; report.status='links_discovered';
  } catch {report.reason='manifest_invalid';}
  finally {
    report.requestCount++;
    const logout=await controlRequest(`${AUTH_PROBE.logoutUrl}&token=${encodeURIComponent(logoutToken)}`,{method:'POST',headers:{Cookie:cookie,Accept:'application/json','Content-Type':'application/json','X-CSRF-Token':csrfToken}},fetchImpl,timeoutMs);
    report.logoutHttpStatus=logout.httpStatus;report.logoutBytes=logout.receivedBytes;
    report.logout=logout.ok && logout.httpStatus===204 && logout.receivedBytes===0?'confirmed':'unconfirmed';
    report.sessionMayRemain=report.logout!=='confirmed';
    if (report.sessionMayRemain) {report.status='stopped';delete report.links;}
    cookie=null;csrfToken=null;logoutToken=null;
  }
  return report;
}
