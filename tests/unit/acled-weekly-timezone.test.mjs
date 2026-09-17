import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';

// Minimal OOXML fixture built without importing the parser outside the sanitizer.
function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name), data = Buffer.from(text), l = Buffer.alloc(30 + n.length), c = Buffer.alloc(46 + n.length);
    l.writeUInt32LE(0x04034b50); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26); n.copy(l, 30);
    c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); n.copy(c, 46);
    locals.push(l, data); central.push(c); offset += l.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = central.length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function workbook(serial) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const header = ['WEEK','REGION','COUNTRY','ADMIN1','EVENT_TYPE','SUB_EVENT_TYPE','EVENTS','FATALITIES','POPULATION_EXPOSURE','DISORDER_TYPE','ID','CENTROID_LATITUDE','CENTROID_LONGITUDE'];
  const row = (values, r) => `<row r="${r}">${values.map((v, i) => typeof v === 'number'
    ? `<c r="${String.fromCharCode(65+i)}${r}"${i===0?' s="1"':''}><v>${v}</v></c>`
    : `<c r="${String.fromCharCode(65+i)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}</row>`;
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><dimension ref="A1:M13"/><sheetData>${row(header,1)}${Array.from({length:12},(_,i)=>row([serial-i*7,'fixture','fixture','fixture','Battles','fixture',1,0,0,'fixture',i,0,0],i+2)).join('')}</sheetData></worksheet>`,
  });
}

test('real XLSX date-formatted serials have identical weekly dates in UTC, Auckland and Los Angeles', () => {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent,'gfrr-acled-timezone-'));
  try {
    const code = path.join(root,'scripts/world-order'); fs.mkdirSync(code,{recursive:true});
    for (const name of ['sanitize-acled-weekly.mjs','xlsx-input-guard.mjs','acled-weekly-coverage.mjs','acled-weekly-window.mjs']) fs.copyFileSync(`scripts/world-order/${name}`,path.join(code,name));
    fs.mkdirSync(path.join(root,'node_modules')); fs.symlinkSync(fs.realpathSync('node_modules/xlsx'),path.join(root,'node_modules/xlsx'),process.platform==='win32'?'junction':'dir');
    fs.mkdirSync(path.join(root,'config'));
    const input = path.join(root,'manual-artifacts/world-order/acled-input/weekly'); fs.mkdirSync(input,{recursive:true});
    const today = new Date().toISOString().slice(0,10), serial = (Date.parse(`${today}T00:00:00Z`)-Date.UTC(1899,11,30))/86400000;
    const bytes = workbook(serial);
    for (const region of ACLED_WEEKLY_REGIONS) fs.writeFileSync(path.join(input,`${region}_aggregated_data_up_to_week_of-${today}.xlsx`),bytes,{flag:'wx'});
    const reports = [];
    for (const TZ of ['UTC','Pacific/Auckland','America/Los_Angeles']) {
      const r = spawnSync(process.execPath,[path.join(code,'sanitize-acled-weekly.mjs'),'--dry-run'],{env:{...process.env,TZ},encoding:'utf8',timeout:20000});
      assert.equal(r.status,0,r.stderr); const report = JSON.parse(r.stdout);
      assert.equal(report.latestWeek,today); assert.equal(report.rows,72); reports.push(report);
    }
    assert.deepEqual(reports[0],reports[1]); assert.deepEqual(reports[0],reports[2]);
    assert.deepEqual(fs.readdirSync(path.join(root,'config')),[]);
    for (const name of fs.readdirSync(input)) assert.deepEqual(fs.readFileSync(path.join(input,name)),bytes);
    // Negative control in this disposable workspace only: the former parser option
    // reproduces the one-day drift with the very same real-parser fixture.
    const script = path.join(code,'sanitize-acled-weekly.mjs');
    fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace('cellDates: false','cellDates: true'));
    const old = spawnSync(process.execPath,[script,'--dry-run'],{env:{...process.env,TZ:'Pacific/Auckland'},encoding:'utf8',timeout:20000});
    assert.equal(old.status,0,old.stderr);
    assert.equal(JSON.parse(old.stdout).latestWeek,new Date(Date.parse(`${today}T00:00:00Z`)-86400000).toISOString().slice(0,10));
  } finally {
    assert.equal(path.dirname(root),parent); assert.equal(fs.realpathSync(root),root);
    assert.ok(path.basename(root).startsWith('gfrr-acled-timezone-')); fs.rmSync(root,{recursive:true});
  }
});
