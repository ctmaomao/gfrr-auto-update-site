import fs from 'node:fs';
import { validateMarketSnapshot } from './bubble-watch/market-observations.mjs';
const file=new URL('../data/bubble-market-observations.json',import.meta.url);
if(fs.existsSync(file)){
  const errors=validateMarketSnapshot(JSON.parse(fs.readFileSync(file,'utf8')));
  if(errors.length)throw Error(errors.join('; '));
  console.log('Independent Bubble market observations: PASS (original dates retained; display computes current age)');
}else console.log('Independent Bubble market observations: not initialized; optional display remains unavailable');
