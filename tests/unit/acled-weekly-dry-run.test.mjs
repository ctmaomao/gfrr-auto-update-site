import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';

function zip() {
  const name = Buffer.from('synthetic'), data = Buffer.from('fixture');
  const local = Buffer.alloc(30 + name.length); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); name.copy(central, 46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + data.length, 16);
  return Buffer.concat([local, data, central, end]);
}
test('weekly preflight uses the production builder but never creates or rewrites config', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-acled-dryrun-'));
  try {
    const scripts = path.join(fixture, 'scripts/world-order'); fs.mkdirSync(scripts, { recursive: true });
    for (const name of ['sanitize-acled-weekly.mjs', 'xlsx-input-guard.mjs', 'acled-weekly-coverage.mjs', 'acled-weekly-window.mjs']) fs.copyFileSync(`scripts/world-order/${name}`, path.join(scripts, name));
    const parser = path.join(fixture, 'node_modules/xlsx'); fs.mkdirSync(parser, { recursive: true });
    fs.writeFileSync(path.join(parser, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
    // Stub only the parser; real ZIP guard, row validation and common-window builder execute.
    fs.writeFileSync(path.join(parser, 'index.mjs'), "import fs from 'node:fs'; export function set_fs(){}; export function readFile(){return {SheetNames:['Sheet1'],Sheets:{Sheet1:{'!ref':'A1:M13'}}}}; export const utils={sheet_to_json:()=>JSON.parse(fs.readFileSync(new URL('./rows.json',import.meta.url),'utf8'))};");
    const header = ['WEEK','REGION','COUNTRY','ADMIN1','EVENT_TYPE','SUB_EVENT_TYPE','EVENTS','FATALITIES','POPULATION_EXPOSURE','DISORDER_TYPE','ID','CENTROID_LATITUDE','CENTROID_LONGITUDE'];
    const today = new Date().toISOString().slice(0,10), end = Date.parse(`${today}T00:00:00Z`);
    const rows = [header, ...Array.from({length:12},(_,i)=>[new Date(end-i*7*86400000).toISOString().slice(0,10),'fixture','fixture','fixture','Battles','fixture',1,0,0,'fixture',i,0,0])];
    const rowPath = path.join(parser,'rows.json'); fs.writeFileSync(rowPath,JSON.stringify(rows));
    const input = path.join(fixture,'manual-artifacts/world-order/acled-input/weekly'); fs.mkdirSync(input,{recursive:true});
    const output = path.join(fixture,'config/world-order-acled-regional-weekly.json'); fs.mkdirSync(path.dirname(output));
    const run = (args=['--dry-run'])=>spawnSync(process.execPath,[path.join(scripts,'sanitize-acled-weekly.mjs'),...args],{encoding:'utf8',timeout:20000});
    assert.equal(JSON.parse(run().stdout).status,'no_input'); assert.equal(fs.existsSync(output),false);
    const filenames = ACLED_WEEKLY_REGIONS.map(region=>`${region}_aggregated_data_up_to_week_of-${today}.xlsx`);
    for(const name of filenames) fs.writeFileSync(path.join(input,name),zip());
    const preview = run(); assert.equal(preview.status,0,preview.stderr);
    const report = JSON.parse(preview.stdout); assert.equal(report.status,'validated_not_published'); assert.equal(report.rows,72); assert.equal(report.regions,6); assert.equal(report.matchesCurrentConfig,false); assert.equal(fs.existsSync(output),false);
    assert.equal(run([]).status,0); const original = fs.readFileSync(output); const stamp = fs.statSync(output).mtimeMs;
    assert.equal(JSON.parse(run().stdout).matchesCurrentConfig,true); assert.deepEqual(fs.readFileSync(output),original); assert.equal(fs.statSync(output).mtimeMs,stamp);
    rows[1][6]=2; fs.writeFileSync(rowPath,JSON.stringify(rows)); assert.equal(JSON.parse(run().stdout).matchesCurrentConfig,false); assert.deepEqual(fs.readFileSync(output),original);
    rows[1][6]='PRIVATE-BAD'; fs.writeFileSync(rowPath,JSON.stringify(rows)); const bad=run(); assert.equal(bad.status,1); assert.equal(JSON.parse(bad.stderr).status,'validation_failed'); assert.doesNotMatch(bad.stderr,/PRIVATE|fixture/u); assert.deepEqual(fs.readFileSync(output),original);
    fs.unlinkSync(path.join(input,filenames[0])); assert.equal(run().status,1); assert.deepEqual(fs.readFileSync(output),original);
    assert.equal(run(['--unknown']).status,1); assert.deepEqual(fs.readFileSync(output),original);
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); } // Only this mkdtemp-created synthetic fixture.
});
