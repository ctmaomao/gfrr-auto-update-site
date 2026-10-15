// Bounded free transport; runtime activation is separate from this source contract.
import { INSIDER_BASKET, qualifyInsiderWindows, insiderWindowUrl } from './qualified-insider.mjs';
const LIMIT=1024*1024;
async function getJson(url,fetchFn){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetchFn(url,{headers:{Accept:'application/json','User-Agent':'gfrr-bubble-watch/1.0'},redirect:'error',signal:controller.signal});
    if(!response.ok){const error=new Error(`Insider source HTTP ${response.status}`);error.status=response.status;throw error;}
    if(!/application\/json/iu.test(response.headers.get('content-type')||''))throw new Error('Insider source content type changed');
    const length=Number(response.headers.get('content-length'));
    if(Number.isFinite(length)&&length>LIMIT)throw new Error('Insider response exceeds byte cap');
    const reader=response.body?.getReader();if(!reader)throw new Error('Insider response body missing');
    let bytes=0;const chunks=[];
    try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>LIMIT)throw new Error('Insider response exceeds byte cap');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}
    const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(joined));
  } finally {clearTimeout(timer);}
}
export async function collectInsiderWindows({today,fetchFn=globalThis.fetch,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const samples=[],failures=[];let lastStart=null,actualRequests=0;
  for(const symbol of INSIDER_BASKET){
    if(lastStart!==null){const wait=Math.max(0,6500-(now()-lastStart));if(wait)await sleep(wait);}
    lastStart=now();
    const sourceUrl=insiderWindowUrl(symbol,today);
    try {
      actualRequests++;
      const json=await getJson(sourceUrl,fetchFn);
      if(json?.source !== 'xoomar.com' || json?.meta?.source !== 'SEC') throw new Error('Insider response origin mismatch');
      samples.push({symbol,responseTicker:json?.data?.ticker,sourceUrl,responseBuiltAt:json?.updatedAt,transactions:json?.data?.transactions});
    } catch(error){
      failures.push({symbol,reason:error.status?`http_${error.status}`:error.name==='AbortError'?'timeout':'response_unusable'});
      if([401,403,429].includes(error.status))break;
    }
  }
  const checkedAt=new Date(now()).toISOString();
  const report=qualifyInsiderWindows(samples,today,checkedAt);
  return {...report,sourceFailures:failures,sourceAttribution:'Data: XOOMAR; Insider trade data: SEC.',sourceAttributionUrl:'https://xoomar.com',
    collectionPolicy:{actualRequests,maximumRequests:12,minimumStartSpacingMs:6500,requestTimeoutMs:12000,responseMaxBytes:LIMIT,applicationRetries:0}};
}
