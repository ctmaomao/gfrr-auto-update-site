import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DETAIL_PAGES,extractDetailLink,discoverAcledDetails} from '../../scripts/world-order/acled-detail-discovery.mjs';
import {AUTH_PROBE} from '../../scripts/world-order/acled-authenticated-probe.mjs';
import {DETAIL_WORKFLOW_PATH,isReviewedAcledAuthWorkflow} from '../../scripts/acled-auth-workflow-policy.mjs';
const username='fixture@example.invalid',password='PRIVATE_PASSWORD',token='PRIVATE_TOKEN_123456789';
const cookie=`SSESS${'a'.repeat(32)}=PRIVATE_SESSION_123456`;
const login=()=>new Response(JSON.stringify({current_user:{uid:'42',name:username},logout_token:token,csrf_token:token}),{headers:{'content-type':'application/json','set-cookie':`${cookie}; Path=/; Secure; HttpOnly`}});
const urlFor=p=>`https://acleddata.com/system/files/2026-09/${p.kind==='monthly'?`number_of_${p.identity}_as-of-04Sep2026`:`${p.identity}_aggregated_data_up_to_week_of-2026-09-05`}.xlsx`;
const html=p=>`<a href="${urlFor(p)}">Download</a>`;
function fake({pageResponse,logoutResponse}={}) {
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push(url); assert.equal(options.redirect,'manual');
    if(url===AUTH_PROBE.loginUrl){assert.deepEqual(JSON.parse(options.body),{name:username,pass:password});return login();}
    assert.equal(options.headers.Cookie,cookie);
    if(url.startsWith(AUTH_PROBE.logoutUrl)){assert.equal(options.headers['X-CSRF-Token'],token);return logoutResponse?logoutResponse():new Response(null,{status:204});}
    const page=DETAIL_PAGES.find(p=>p.url===url);assert.ok(page,'only fixed detail URLs are requested');assert.equal(options.method,'GET');
    return pageResponse?pageResponse(page):new Response(html(page),{headers:{'content-type':'text/html'}});
  }};
}
const run=f=>discoverAcledDetails({username,password,fetchImpl:f.fetchImpl,timeoutMs:30});
test('exact fourteen requests identify twelve links without requesting files or exposing secrets',async()=>{
  const f=fake(),r=await run(f);assert.equal(f.calls.length,14);assert.equal(r.requestCount,14);
  assert.equal(r.status,'links_discovered');assert.equal(r.links.length,12);assert.equal(r.logout,'confirmed');assert.equal(r.sessionMayRemain,false);
  assert.equal(r.rawPagesSaved,false);assert.equal(r.productionWritten,false);assert.equal(r.contentValidated,false);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE|fixture@|SSESS|<a/u);
  assert.ok(f.calls.every(u=>!u.includes('.xlsx')));
});
test('extract only one matching safe identity, tolerate repeated identical links and quoted JSON paths',()=>{
  const p=DETAIL_PAGES[0],url=urlFor(p);
  assert.equal(extractDetailLink(html(p)+html(p),p),url);
  assert.equal(extractDetailLink(JSON.stringify({file:url}).replaceAll('/','\\/'),p),url);
  for(const value of ['',`<a href="${url}?token=PRIVATE">x</a>`,html(p).replace('acleddata.com','evil.invalid'),html(DETAIL_PAGES[1]),html(p)+html(p).replace('04Sep','05Sep'),html(p).replace('04Sep','31Sep'), 'x'.repeat(1048577)]) {
    assert.throws(()=>extractDetailLink(value,p));
  }
});
test('page HTTP, redirect, binary content, byte caps, invalid UTF8 and ambiguous links stop and logout once',async()=>{
  for(const response of [()=>new Response(null,{status:302}),()=>new Response('PRIVATE',{status:403}),
    ()=>new Response('PRIVATE',{headers:{'content-type':'application/zip'}}),
    ()=>new Response('',{headers:{'content-type':'text/html','content-length':'1048577'}}),
    ()=>new Response('x'.repeat(1048577),{headers:{'content-type':'text/html'}}),
    ()=>new Response(new Uint8Array([255]),{headers:{'content-type':'text/html'}}),
    ()=>new Response('PRIVATE',{headers:{'content-type':'text/html'}})]) {
    const f=fake({pageResponse:response}),r=await run(f);assert.equal(r.status,'stopped');assert.equal(r.requestCount,3);assert.equal(f.calls.length,3);assert.equal(r.logout,'confirmed');assert.doesNotMatch(JSON.stringify(r),/PRIVATE/u);assert.equal(r.links,undefined);
  }
});
test('monthly date mismatch cannot expose a complete manifest; failed logout cannot imply success',async()=>{
  const mixed=fake({pageResponse:p=>new Response(html(p).replace(p===DETAIL_PAGES[0]?'04Sep':'NEVER','05Sep'),{headers:{'content-type':'text/html'}})});
  const r=await run(mixed);assert.equal(r.requestCount,14);assert.equal(r.reason,'manifest_invalid');assert.equal(r.links,undefined);
  const fail=await run(fake({logoutResponse:()=>new Response(null,{status:200})}));assert.equal(fail.status,'stopped');assert.equal(fail.sessionMayRemain,true);assert.equal(fail.links,undefined);
});
test('missing credentials and invalid login never read details',async()=>{
  assert.equal((await discoverAcledDetails()).requestCount,0);
  let count=0;const r=await discoverAcledDetails({username,password,fetchImpl:async()=>{count++;return new Response('PRIVATE',{status:403});}});
  assert.equal(count,1);assert.equal(r.sessionMayRemain,true);assert.equal(r.logout,'not_attempted');assert.doesNotMatch(JSON.stringify(r),/PRIVATE/u);
});
test('hung HTML fetch and body honor deadlines then logout, including late cancellation',async()=>{
  let resolve,cancelled=0;
  const f=fake({pageResponse:()=>new Promise(r=>{resolve=r;})});const result=await run(f);
  assert.equal(result.pages[0].reason,'timeout');assert.equal(result.logout,'confirmed');
  resolve(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'text/html'}}));await new Promise(r=>setImmediate(r));assert.equal(cancelled,1);
  const body=await run(fake({pageResponse:()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;}}),{headers:{'content-type':'text/html'}})}));
  assert.equal(body.pages[0].reason,'timeout');assert.equal(body.logout,'confirmed');assert.equal(cancelled,2);
});
test('CLI default offline and exact reviewed workflow required for live',()=>{
  for(const args of [[],['--live'],['--PRIVATE']]) {
    const result=spawnSync(process.execPath,['scripts/discover-acled-details.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
    assert.equal(JSON.parse(result.stdout).requestCount,0);assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE/u);
  }
  assert.equal(isReviewedAcledAuthWorkflow(DETAIL_WORKFLOW_PATH,readFileSync(DETAIL_WORKFLOW_PATH,'utf8')),true);
});
