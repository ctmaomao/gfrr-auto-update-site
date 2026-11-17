import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { deriveExpectedHashSources, derivePageHashes, buildEdgeoneJson } from '../../scripts/lib/edgeone-csp-policy.mjs';
import { fileURLToPath } from 'node:url';
import { splitIssues, expectedWeeklyPages } from '../../scripts/build-weekly-reports.mjs';
import { isAllowedPagesArtifactFile } from '../../scripts/build-pages-artifact.mjs';
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('weekly root redirects, explicit radar and every old anchor stay in place', () => {
  const router = read('scripts/modules/weekly-homepage.js');
  for (const [url, redirect] of [
    ['https://example.test/site/', true], ['https://example.test/site/index.html', true],
    ['https://example.test/site/index.html?view=radar', false],
    ['https://example.test/site/#oil-directional-pressure', false],
    ['https://example.test/site/index.html#macro-risk-editorial', false],
  ]) {
    const calls = [];
    vm.runInNewContext(router, { URL, window: { location: { href:url, replace: x => calls.push(x) } } });
    assert.equal(calls.length, redirect ? 1 : 0);
    if (redirect) assert.equal(calls[0], 'https://example.test/site/weekly-reports.html');
  }
});
test('52 issue split preserves all older issues without deletion or renaming', () => {
  const names = Array.from({length:55}, (_,i) => new Date(Date.UTC(2025,0,1+i*7)).toISOString().slice(0,10)+'.html');
  const split = splitIssues([...names,'README.md','.env','invalid.html']);
  assert.equal(split.recent.length,52);
  assert.equal(split.archived.length,3);
  assert.deepEqual([...split.recent,...split.archived].sort(), names.sort());
  assert.ok(split.recent[0] > split.archived[0]);
  assert.doesNotMatch(read('scripts/build-weekly-reports.mjs'), /\brmSync\b/);
});
test('weekly allowlist permits only complete HTML routes, no notes or secrets', () => {
  for (const p of ['weekly-reports.html','reports/2026-11-09.html','reports/archive.html','weekly-reports/index.html','weekly-reports/2026-11-09.html']) assert.equal(isAllowedPagesArtifactFile(p),true,p);
  for (const p of ['reports/.env','reports/README.md','reports/x.js','reports/nested/2026-11-09.html','weekly-reports/.secret.html']) assert.equal(isAllowedPagesArtifactFile(p),false,p);
});
test('generated pages are deterministic, fixed issue stays standalone with cited sources', () => {
  const latest = splitIssues(fs.readdirSync(new URL('../../reports/', import.meta.url))).recent[0];
  const before = read('reports/' + latest);
  for (const [p,expected] of expectedWeeklyPages()) assert.equal(read(p),expected,p);
  assert.equal(read('reports/' + latest),before);
  assert.match(before, /<style>/);
  assert.doesNotMatch(before, /fetch\(|data\/radar-data|onclick=/);
  const legacy = read('reports/2026-11-09.html');
  assert.equal((legacy.match(/<section\b/g)||[]).length,12);
  assert.match(legacy, /<style>/);
  assert.doesNotMatch(legacy, /fetch\(|data\/radar-data|onclick=/);
  assert.match(legacy,/download="GFRR_Weekly_2026-11-09.html"/);
  assert.match(legacy,/sb0678/);
  assert.match(legacy,/empsit_11062026/);
  assert.match(legacy,/不是.*概率|不.*概率/);
});
test('both deploy paths trigger on the canonical and compatible weekly paths', () => {
  for(const p of ['.github/workflows/deploy-static-site-to-pages.yml','.github/workflows/publish-edgeone-release.yml']) {
    const text=read(p);
    for(const trigger of ["'weekly-reports.html'","'reports/**'","'weekly-reports/**'"]) assert.ok(text.includes(trigger),p+trigger);
  }
});

test('weekly content hash inventory stays strict and bounded for every archive copy', () => {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const expected=deriveExpectedHashSources(root);
  const bundle=expected.pages.find(p=>p.file==='weekly-reports.html');
  assert.ok(bundle.sourceFiles.includes('reports/2026-11-09.html'));
  const hashes = bundle.sourceFiles.map(file => derivePageHashes(root, file, { requireInlineBlocks: false }));
  assert.deepEqual(new Set(bundle.scriptHashes), new Set(hashes.flatMap(page => page.scriptHashes)));
  assert.deepEqual(new Set(bundle.styleHashes), new Set(hashes.flatMap(page => page.styleHashes)));
  assert.ok(bundle.scriptHashes.length >= 1);
  assert.ok(bundle.styleHashes.length >= 1);
  const config=JSON.parse(read('config/edgeone/csp-report-only.json'));
  const result=buildEdgeoneJson({config,pages:expected.pages});
  assert.ok(result.policy.length<1000);
  assert.ok(result.policy.includes(bundle.styleHashes[0]));
});


test('four current pages and weekly subpaths link to oil with one current tab', () => {
  for (const path of ['index.html','bubble-watch.html','oil-market.html','weekly-reports.html','weekly-reports/index.html','reports/archive.html']) {
    const nav=read(path).match(/<nav class="page-bookmarks"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.equal((nav.match(/<a /g)||[]).length,4,path);
    assert.equal((nav.match(/aria-current="page"/g)||[]).length,1,path);
    assert.ok(nav.includes('href="'+(path.includes('/')?'../':'')+'oil-market.html"'),path);
  }
});
