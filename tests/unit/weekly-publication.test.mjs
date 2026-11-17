import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyPublication } from '../../scripts/verify-weekly-publication.mjs';
import { expectedWeeklyPages } from '../../scripts/build-weekly-reports.mjs';
const date = '2026-11-23';
const html = Buffer.from('<!doctype html><html><head><title>周报 2026年11月23日</title></head><body class="paper"><nav class="page-bookmarks"><a href="../weekly-reports.html">周报</a></nav><main><section>正文</section></main></body></html>');
const digest = data => createHash('sha256').update(data).digest('hex');
const sha = digest(html);
const commit = 'a'.repeat(40);
const generated = expectedWeeklyPages({ names: [date + '.html'], readFile: () => html.toString() });
const home = Buffer.from(generated.get('weekly-reports.html'));
const sub = Buffer.from(generated.get('weekly-reports/index.html'));
const archive = Buffer.from(generated.get('reports/archive.html'));
function fixture() {
  const files = new Map([[`weekly-originals/${date}/${sha}.html`,html], [`weekly-originals/${date}/identity.sha256`,Buffer.from(sha+'\n')], [`reports/${date}.html`,html], [`weekly-reports/${date}.html`,html], ['weekly-reports.html',home], ['weekly-reports/index.html',sub], ['reports/archive.html',archive]]);
  const read = (_, p) => { if (!files.has(p)) throw Error('missing ' + p); return files.get(p); };
  const fetcher = async url => { const path = url.pathname.replace(/^\/gfrr-auto-update-site\//,'').replace(/^\//,''); return new Response(files.get(path) || '', {status:files.has(path)?200:404}); };
  return { files, read, fetcher, list: () => [date + '.html'] };
}
test('both sites must return committed bytes and correct links', async () => {
  const f = fixture();
  const result = await verifyPublication({date, sha, commit, ...f});
  assert.equal(result.length,10);
  assert.match(archive.toString(), /<body class="paper">/);
  assert.match(archive.toString(), /^<!doctype html>/i);
  assert.equal(result.filter(r => r.sha256 === sha).length,4);
  const modified = async (url, opts) => url.hostname === 'radar.gfrfinradar.uk' && url.pathname === '/weekly-reports.html' ? new Response('stale') : f.fetcher(url, opts);
  await assert.rejects(verifyPublication({date, sha, commit, read:f.read, list:f.list, fetcher:modified}), /bytes differ/);
  f.files.set('weekly-reports.html', Buffer.from(home.toString().replace('reports/archive.html','wrong.html')));
  await assert.rejects(verifyPublication({date, sha, commit, ...f}), /generated page differs/);
});
test('missing, malformed and mismatching committed identity fail before fetching', async () => {
  const f = fixture();
  await assert.rejects(verifyPublication({date, sha:'0'.repeat(64), commit, ...f}), /missing/);
  await assert.rejects(verifyPublication({date:'../x', sha, commit, ...f}), /date/);
  await assert.rejects(verifyPublication({date, sha, commit:'HEAD', ...f}), /commit/);
  f.files.set(`weekly-reports/${date}.html`,Buffer.from('bad'));
  await assert.rejects(verifyPublication({date, sha, commit, ...f}), /do not match/);
});
