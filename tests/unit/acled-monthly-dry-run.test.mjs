import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACLED_MONTHLY_SLUGS } from '../../scripts/world-order/acled-download-manifest.mjs';

function zip() {
  const name = Buffer.from('synthetic'), data = Buffer.from('fixture');
  const local = Buffer.alloc(30 + name.length); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(name.length,26); name.copy(local,30);
  const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(name.length,28); name.copy(central,46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(local.length+data.length,16);
  return Buffer.concat([local,data,central,end]);
}

test('monthly dry-run preserves source and config while exercising the real builder and validators', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-monthly-preview-'));
  try {
    const scripts = path.join(fixture, 'scripts/world-order'); fs.mkdirSync(scripts,{recursive:true});
    for (const name of ['sanitize-acled-monthly.mjs','acled-monthly-filename.mjs','acled-monthly-trend.mjs','xlsx-input-guard.mjs']) fs.copyFileSync(`scripts/world-order/${name}`,path.join(scripts,name));
    const parser = path.join(fixture,'node_modules/xlsx'); fs.mkdirSync(parser,{recursive:true});
    fs.writeFileSync(path.join(parser,'package.json'),JSON.stringify({type:'module',exports:'./index.mjs'}));
    // Only the parser is stubbed; real ZIP guard, rows, dates, trend and payload execute.
    fs.writeFileSync(path.join(parser,'index.mjs'),"import fs from 'node:fs';import path from 'node:path';export function set_fs(){};export function readFile(p){return {SheetNames:['Sheet1'],Sheets:{Sheet1:{'!ref':'A1:D25',rows:JSON.parse(fs.readFileSync(new URL('./rows.json',import.meta.url),'utf8'))[path.basename(p)]}}}};export const utils={sheet_to_json:s=>s.rows};");
    const now = new Date(), year = now.getUTCFullYear(), month = now.getUTCMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const date = `${String(now.getUTCDate()).padStart(2,'0')}${monthNames[month].slice(0,3)}${year}`;
    const names = ACLED_MONTHLY_SLUGS.map(s=>`number_of_${s}_as-of-${date}.xlsx`);
    const rows = Object.fromEntries(names.map(name=>[name,name.includes('country-month-year')
      ? [['COUNTRY','MONTH','YEAR','EVENTS'],...Array.from({length:24},(_,i)=>{const d=new Date(Date.UTC(year,month-24+i,1));return ['Fixture',monthNames[d.getUTCMonth()],d.getUTCFullYear(),1];})]
      : [['COUNTRY','YEAR',name.includes('fatalities')?'FATALITIES':'EVENTS'],...Array.from({length:4},(_,i)=>['Fixture',year-1-i,1])]]));
    const rowPath=path.join(parser,'rows.json'); const save=()=>fs.writeFileSync(rowPath,JSON.stringify(rows)); save();
    const input=path.join(fixture,'manual-artifacts/world-order/acled-input/monthly'); fs.mkdirSync(input,{recursive:true});
    const output=path.join(fixture,'config/world-order-acled-global-monthly.json'); fs.mkdirSync(path.dirname(output));
    const run=(args=['--dry-run'])=>spawnSync(process.execPath,[path.join(scripts,'sanitize-acled-monthly.mjs'),...args],{encoding:'utf8',timeout:20000});
    assert.equal(JSON.parse(run().stdout).status,'no_input'); assert.equal(fs.existsSync(output),false);
    fs.writeFileSync(path.join(input,'unknown.xlsx'),zip()); assert.equal(JSON.parse(run().stdout).status,'no_recognized_input'); fs.unlinkSync(path.join(input,'unknown.xlsx'));
    for(const name of names) fs.writeFileSync(path.join(input,name),zip());
    const sourceBytes=names.map(n=>fs.readFileSync(path.join(input,n)));
    const preview=run(); assert.equal(preview.status,0,preview.stderr); const report=JSON.parse(preview.stdout);
    assert.equal(report.status,'validated_not_published'); assert.equal(report.files,6); assert.equal(report.rows,44);
    assert.equal(report.monthlyTrendAvailable,true); assert.equal(report.warningCount,0); assert.equal(report.matchesCurrentConfig,false); assert.equal(fs.existsSync(output),false);
    assert.equal(run([]).status,0); const original=fs.readFileSync(output), stamp=fs.statSync(output).mtimeMs;
    const preserved=()=>{assert.deepEqual(fs.readFileSync(output),original);assert.equal(fs.statSync(output).mtimeMs,stamp);};
    assert.equal(JSON.parse(run().stdout).matchesCurrentConfig,true); preserved();
    rows[names[0]][1][2]=2; save(); assert.equal(JSON.parse(run().stdout).matchesCurrentConfig,false); preserved();
    const monthly=names.find(n=>n.includes('country-month-year')); rows[monthly].pop(); save();
    const incomplete=JSON.parse(run().stdout); assert.equal(incomplete.monthlyTrendAvailable,false); assert.ok(incomplete.warningCount>0); preserved();
    rows[monthly][1][3]='PRIVATE-BAD'; save(); const bad=run(); assert.equal(bad.status,1); assert.equal(JSON.parse(bad.stderr).status,'validation_failed'); assert.doesNotMatch(bad.stderr,/PRIVATE|Fixture|number_of/u); preserved();
    rows[monthly][1][3]=1; save();
    const mixed=names[0].replace(date,'01Jan2000'); fs.renameSync(path.join(input,names[0]),path.join(input,mixed)); assert.equal(run().status,1); preserved(); fs.renameSync(path.join(input,mixed),path.join(input,names[0]));
    assert.equal(run(['--unknown']).status,1); preserved();
    for(const [i,name] of names.entries()) assert.deepEqual(fs.readFileSync(path.join(input,name)),sourceBytes[i]);
    fs.unlinkSync(path.join(input,names[0])); assert.equal(run().status,1); preserved();
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); } // Only the mkdtemp-created synthetic fixture.
});
