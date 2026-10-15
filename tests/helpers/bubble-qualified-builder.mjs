import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const builderUrl=new URL('../../scripts/build-bubble-watch.mjs',import.meta.url);
export async function buildQualifiedAbsFixture({publish=false,baselineOutput=null,baselineHistory=null,clock='2026-10-13T12:00:00Z',revision=1,insiderHttpStatus=200,duplicateSymbol=null}={}) {
  const source=fs.readFileSync(builderUrl,'utf8');
  const bundle=JSON.parse(fs.readFileSync(new URL('../../docs/fixtures/bubble-watch/legacy-contract-bundle.json',import.meta.url)));
  const methods={contractVersion:'bubble-qualified-methods-v1',activeRevision:revision,approvedAbsSourceReviews:[],absObservation:null};
  const files={...bundle.files,'config/bubble-watch-methods.json':methods,'config/bubble-credit-spreads.json':{enabled:false}};
  if (baselineOutput) files['data/bubble-watch.json']=baselineOutput;
  if (baselineHistory) files['data/bubble-watch-history.json']=baselineHistory;
  const bindings={};
  for(const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+'([^']+)';/gu)) {
    const module=await import(match[2].startsWith('.')?new URL(match[2],builderUrl).href:match[2]);
    if(match[1].trim().startsWith('{')) for(const key of match[1].replace(/[{}]/gu,'').split(',').map(s=>s.trim()).filter(Boolean)) {
      const [name,alias=name]=key.split(/\s+as\s+/u);
      bindings[alias]=name==='collectInsiderWindows' && revision>=2
        ? args=>module[name]({...args,fetchFn:insiderFetch,now:()=>virtualTime,sleep:async ms=>{virtualTime+=ms;}}) : module[name];
    } else bindings[match[1].trim()]=module.default;
  }
  const writes=new Map(), logs=[];
  const RealDate=globalThis.Date, realFetch=globalThis.fetch;
  let networkCalls=0,virtualTime=RealDate.parse(clock);
  const requestStarts=[];
  class FrozenDate extends RealDate {
    constructor(...args){super(...(args.length?args:[virtualTime]));}
    static now(){return virtualTime;}
  }
  const dateBefore=days=>new RealDate(RealDate.parse(clock)-days*86400000).toISOString().slice(0,10);
  const insiderFetch=async (url,options)=>{
    networkCalls++;requestStarts.push(virtualTime);
    if(!/^https:\/\/xoomar\.com\/api\/markets\/insiders\/[A-Z]+\?from=/u.test(url)
      || options.redirect!=='error') throw new Error('Fixture refuses unexpected source or redirects');
    if(insiderHttpStatus!==200)return new Response('',{status:insiderHttpStatus});
    const symbol=new URL(url).pathname.split('/').at(-1);
    const rows=[{insiderName:'FixtureInsiderPrivate',txDate:dateBefore(1),txCode:'S',isOpenMarket:true,valueUsd:'12000000',priceNote:null},
      {insiderName:'FixtureInsiderPrivate',txDate:dateBefore(3),txCode:'P',isOpenMarket:true,valueUsd:'1000000',priceNote:null}];
    if(symbol===duplicateSymbol) rows.splice(1,0,structuredClone(rows[0]));
    return Response.json({source:'xoomar.com',meta:{source:'SEC'},updatedAt:new RealDate(virtualTime).toISOString(),data:{ticker:symbol,transactions:rows}});
  };
  const key=file=>path.relative(root,file).replaceAll('\\','/');
  const fakeFs={...fs,
    readFileSync(file,...args){const name=key(file);if(Object.hasOwn(files,name))return JSON.stringify(files[name]);return fs.readFileSync(file,...args);},
    existsSync(file){return Object.hasOwn(files,key(file))||fs.existsSync(file);},
    mkdirSync(){},writeFileSync(file,text){writes.set(key(file),text);}
  };
  const noNetwork=async()=>{networkCalls++;throw new Error('Fixture forbids all external requests');};
  const context=vm.createContext({...bindings,fs:fakeFs,Date:FrozenDate,Buffer,URL,structuredClone,setTimeout,clearTimeout,fetch:noNetwork,
    console:{log:line=>logs.push(line),warn:line=>logs.push(line),error:line=>logs.push(line)},
    process:{argv:['node','builder','--refresh-qualified-only',...(publish?['--publish-qualified']:[])],env:{BUBBLE_WATCH_DISABLE_WIND:'1'},exit(code){throw new Error(`Unexpected exit ${code}`);}}});
  try {
    globalThis.Date=FrozenDate;globalThis.fetch=noNetwork;
    const executable=source.replace(/import\s+[\s\S]*?\s+from\s+'[^']+';\s*/gu,'').replaceAll('import.meta.url',JSON.stringify(builderUrl.href)).replace(/main\(\)\.catch\([\s\S]*$/u,'globalThis.finished=main();');
    vm.runInContext(executable,context,{timeout:10000});await context.finished;
  } catch(error) { error.fixtureWrites=[...writes.keys()]; error.fixtureNetworkCalls=networkCalls; throw error;
  } finally {globalThis.Date=RealDate;globalThis.fetch=realFetch;}
  const candidate=publish?{output:JSON.parse(writes.get('data/bubble-watch.json')),history:JSON.parse(writes.get('data/bubble-watch-history.json'))}
    :JSON.parse(writes.get('manual-artifacts/bubble-qualified-refresh-candidate.json'));
  return {...candidate,writes,networkCalls,requestStarts,logs,baseline:bundle.files,methods};
}

