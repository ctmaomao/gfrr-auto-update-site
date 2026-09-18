import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACLED_WEEKLY_REGIONS } from '../../scripts/world-order/acled-weekly-coverage.mjs';

import { workbook } from '../fixtures/acled-weekly-workbook.mjs';

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
