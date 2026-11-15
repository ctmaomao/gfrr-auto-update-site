import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMarketObservations, validateMarketSnapshot } from './bubble-watch/market-observations.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'data/bubble-market-observations.json');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--write')||args.length>1)throw Error('Usage: refresh-bubble-market-observations.mjs [--write]');
const original=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;
let previous;try{previous=JSON.parse(original);}catch{ /* Invalid prior snapshot cannot establish evidence. */ }
const output=await collectMarketObservations({previous});
if(validateMarketSnapshot(output).length)throw Error('market_snapshot_invalid');
if((fs.existsSync(target)?fs.readFileSync(target,'utf8'):null)!==original)throw Error('Market snapshot changed during collection');
if(args.includes('--write'))fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({mode:args.includes('--write')?'written':'dry-run',...output}));
