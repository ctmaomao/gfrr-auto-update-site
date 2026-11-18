import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { deriveExpectedHashSources, derivePageHashes, buildEdgeoneJson } from '../../scripts/lib/edgeone-csp-policy.mjs';
import { fileURLToPath } from 'node:url';
import { splitIssues, expectedWeeklyPages, checkWeeklyPageSizes } from '../../scripts/build-weekly-reports.mjs';
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
  for (const p of ['weekly-reports.html','reports/2026-11-09.html','reports/2026-11-09-r2.html','reports/archive.html','weekly-reports/index.html','weekly-reports/2026-11-09.html','weekly-reports/2026-11-09-r2.html']) assert.equal(isAllowedPagesArtifactFile(p),true,p);
  for (const p of ['reports/.env','reports/README.md','reports/x.js','reports/nested/2026-11-09.html','weekly-reports/.secret.html','reports/2026-11-09-r02.html','reports/2026-11-09-r1.html','weekly-originals/2026-11-09-r2/predecessor.json','reports/2026-02-30-r2.html']) assert.equal(isAllowedPagesArtifactFile(p),false,p);
});
test('versions sort numerically within a date without using up additional recent issue slots', () => {
  const dates = Array.from({length:53}, (_,i) => new Date(Date.UTC(2026, 0, i+1)).toISOString().slice(0,10));
  const latest = dates.at(-1);
  const names = [...dates.map(date=>date+'.html'), latest+'-r9.html', latest+'-r10.html', dates[0]+'-r2.html'];
  const {recent,archived} = splitIssues(names);
  assert.deepEqual(recent.slice(0,3),[latest+'-r10.html',latest+'-r9.html',latest+'.html']);
  assert.equal(new Set(recent.map(name=>name.slice(0,10))).size,52);
  assert.deepEqual(archived,[dates[0]+'-r2.html',dates[0]+'.html']);
  assert.throws(() => splitIssues([latest+'-r02.html']),/Invalid dated weekly path/);
  const original = '<!doctype html><html><head><title>例</title></head><body><main><section>正文</section></main></body></html>';
  const pages = expectedWeeklyPages({names,readFile:()=>original});
  for (const path of ['weekly-reports.html','weekly-reports/index.html','reports/archive.html']) assert.ok(pages.get(path).includes('download="GFRR_Weekly_'+latest+'-r10.html"'),path);
  assert.match(pages.get('weekly-reports.html'), /第10版.*第9版（已被取代）.*第1版（已被取代）/);
  assert.match(pages.get('reports/archive.html'), /当前共有 1 期/);
  assert.equal(pages.get('weekly-reports/'+latest+'-r10.html'),original);
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

test('generated weekly shells supply history and byte-preserving download even if the original only prints', () => {
  const dates = Array.from({length:53}, (_,i) => new Date(Date.UTC(2026, 0, i+1)).toISOString().slice(0,10)+'.html');
  const latest = dates.at(-1);
  const main = '<main><section>本期正文 <a href="https://example.test/source">出处</a></section>';
  const latestOriginal = '<!doctype html><html lang="zh-CN"><head><title>' + latest.slice(0,10) +
    '</title><style>body{margin:0}</style></head><body class="original"><button type="button">打印</button>' +
    main + '</main></body></html>\r\n';
  const originals = new Map(dates.map(name => ['reports/' + name, name === latest ? latestOriginal : '<!doctype html><html><body>更早原稿</body></html>']));
  const pages = expectedWeeklyPages({ names: dates, readFile: path => originals.get(path) });
  for (const [path, prefix] of [['weekly-reports.html',''],['weekly-reports/index.html','../'],['reports/archive.html','../']]) {
    const html = pages.get(path);
    const toolbar = html.match(/<nav class="weekly-shell-actions"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.equal(toolbar, '<a href="' + prefix + 'weekly-reports.html#history">历史周报</a><a href="' + prefix +
      'reports/' + latest + '" download="GFRR_Weekly_' + latest + '">下载单文件HTML</a>', path);
    const tabs = html.match(/<nav class="page-bookmarks"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.equal((tabs.match(/<a /g)||[]).length,4,path);
    assert.equal((tabs.match(/aria-current="page"/g)||[]).length,1,path);
    assert.ok(html.includes('<body class="original">'), path);
    if (path !== 'reports/archive.html') {
      assert.ok(html.includes('<button type="button">打印</button>' + main), path);
      assert.ok(html.includes('href="' + prefix + 'reports/archive.html"'), path);
    } else {
      assert.ok(html.includes('href="' + dates[0] + '">阅读固定期次全文</a>'), path);
      assert.ok(!html.includes(main), path);
    }
  }
  for (const [path, original] of originals) {
    const dated = pages.get(path.replace('reports/', 'weekly-reports/'));
    assert.deepEqual(Buffer.from(dated),Buffer.from(original),path);
  }
});

test('site shells use the same head, title and body boundaries as the original identity reader', () => {
  const issue = '2026-11-23-r2.html';
  const meta = '<meta name="description" content="a > <body class=fake>">';
  const comment = '<!-- <title>伪刊头</title></head><body> -->';
  const css = '<style>body::after {content:"</head><body>"}</style>';
  const title = '<title>全球金融系统性风险周报｜2026-11-23｜第2版</title>';
  const body = '<body class="actual" data-label="a > b">';
  const original = '<!doctype html><html><head>' + meta + comment + css + title + '</head>' + body + '<main><section>原件</section></main></body></html>';
  const pages = expectedWeeklyPages({names:[issue],readFile:()=>original});
  for (const path of ['weekly-reports.html','weekly-reports/index.html','reports/archive.html']) {
    const html = pages.get(path);
    assert.ok(html.includes(meta + comment + css),path);
    assert.ok(html.includes('</style></head>' + body + '<div class="weekly-site-shell">'),path);
    assert.ok(html.includes(path === 'reports/archive.html' ? '<title>历史周报归档｜GFRR</title>' : title),path);
  }
  assert.equal(pages.get('weekly-reports/'+issue),original);
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

test('generated pages enforce the same byte limit before writing', () => {
  assert.doesNotThrow(() => checkWeeklyPageSizes(new Map([['x', 'a'.repeat(2 * 1024 * 1024)]])));
  assert.throws(() => checkWeeklyPageSizes(new Map([['x', 'a'.repeat(2 * 1024 * 1024 + 1)]])), /2 MiB/);
  assert.throws(() => checkWeeklyPageSizes(new Map([['x', '中'.repeat(700000)]])), /2 MiB/);
});
