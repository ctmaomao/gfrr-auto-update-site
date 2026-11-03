import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyQualifiedRefresh} from './bubble-watch/qualified-refresh-release.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8*1024*1024});
const paths=['data/bubble-watch.json','data/bubble-watch-history.json'];
if(process.argv.length!==2)throw Error('Unsupported qualified verification argument');
const [before,beforeHistory]=paths.map(path=>JSON.parse(git('show',`HEAD:${path}`)));
const [after,history]=paths.map(path=>JSON.parse(fs.readFileSync(path,'utf8')));
const result=verifyQualifiedRefresh({before,beforeHistory,after,history});
const changed=[...new Set([git('diff','--name-only','HEAD'),git('ls-files','--others','--exclude-standard')].flatMap(text=>text.trim().split('\n').filter(Boolean)))];
if(changed.length!==2||changed.some(path=>!paths.includes(path))){result.ok=false;result.errors.push('changed paths exceed the two Bubble outputs');}
console.log(JSON.stringify({...result,asOfDate:after.as_of_date,capexStatus:after.indicators.find(card=>card.id==='capex_reaction')?.status,unknownCore:after.scoring.unknown_core_ids,carriedCards:23}));
if(!result.ok)process.exitCode=1;
