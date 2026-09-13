import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SITES, TARGETS, inspectContent, readBounded, probePublishedSnapshots } from '../../scripts/lib/published-snapshots.mjs';

const now = Date.parse('2026-09-13T10:00:00Z');
const generated = '2026-09-13T04:00:00Z';
const contents = {
  'index.html': '<script src="scripts/app.js?v=test-1"></script>',
  'scripts/app.js': "const APP_VERSION = 'test-1';",
  'data/radar-data.json': JSON.stringify({ score: 50, modules: {}, updatedAt: generated }),
  'data/world-order-stress.json': JSON.stringify({ externalSources: {}, updatedAt: generated }),
  'data/oil-directional-pressure.json': JSON.stringify({ evidence: {}, builtAt: generated }),
  'data/oil-news-event-watch.json': JSON.stringify({ sourceStatus: {}, generatedAt: generated })
};
const baseline = () => Object.fromEntries(TARGETS.map(({ path }) => [path, { text: contents[path], committedAt: generated }]));
const fakeFetch = (transform = (text => text)) => async url => {
  const site = SITES.find(item => url.startsWith(item.base));
  assert.ok(site, 'only fixed destinations');
  const path = url.slice(site.base.length);
  assert.ok(path in contents, 'only fixed files');
  return new Response(transform(contents[path], path, site.id));
};
const probe = (fetchImpl = fakeFetch(), pinned = baseline()) => probePublishedSnapshots({ baseline: pinned, now, fetchImpl });
test('both sites: exactly 12 bounded reads and normalized matching hashes', async () => {
  let requests = 0;
  const result = await probe(async (url, options) => { requests++; assert.equal(options.redirect, 'error'); return fakeFetch(text => '\uFEFF' + text.replace(/\n/g, '\r\n'))(url); });
  assert.equal(requests, 12); assert.equal(result.status, 'pass');
  assert.equal(result.rows.length, 12);
});
test('invalid baseline rejected before any network', async () => {
  let requests = 0;
  for (const bad of ['{', '{"updatedAt":"2026-09-13T08:00:00Z"}', '{"score":50,"modules":{},"updatedAt":"2026-02-30"}']) {
    const pinned = baseline(); pinned['data/radar-data.json'].text = bad;
    await assert.rejects(probe(async () => { requests++; }, pinned), /Invalid pinned baseline content/);
  }
  assert.equal(requests, 0);
});
test('network and HTTP failure isolated, no exception/response text leaked', async () => {
  const result = await probe(async url => {
    if (url === SITES[0].base + 'index.html') throw new Error('SECRET_TOKEN');
    if (url === SITES[0].base + 'scripts/app.js') return new Response('SECRET_BODY', { status: 503 });
    return fakeFetch()(url);
  });
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.rows[0].errors, ['network_error']);
  assert.deepEqual(result.rows[1].errors, ['http_error']);
  assert.equal(result.rows.filter(row => !row.errors.length).length, 10);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
test('deadline covers hanging headers and streaming body', async () => {
  const headers = await readBounded('https://example.invalid', () => new Promise(() => {}), 20);
  assert.equal(headers.error, 'request_timeout');
  let cancelled = false;
  const body = await readBounded('https://example.invalid', async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })), 20);
  assert.equal(body.error, 'request_timeout'); assert.equal(cancelled, true);
});
test('bounded body checks both declared and actual size; redirect rejected', async () => {
  assert.equal((await readBounded('x', async () => new Response('x', { headers: { 'content-length': '999' } }), 50, 8)).error, 'body_too_large');
  assert.equal((await readBounded('x', async () => new Response('123456789'), 50, 8)).error, 'body_too_large');
  assert.equal((await readBounded('x', async () => ({ ok: true, status: 200, url: 'other' }), 50)).error, 'unexpected_url');
});
test('bad JSON, future dates and old body remain errors irrespective of cache headers', async () => {
  for (const [text, code] of [ ['{', 'invalid_json'],
    [JSON.stringify({ score: 50, modules: {}, updatedAt: '2026-09-14T10:00:00Z' }), 'generated_time_future'],
    [JSON.stringify({ score: 50, modules: {}, updatedAt: '2026-09-01T10:00:00Z' }), 'snapshot_stale'] ]) {
    const result = await probe(fakeFetch((original, path) => path === 'data/radar-data.json' ? text : original));
    assert.ok(result.rows.find(row => row.path === 'data/radar-data.json').errors.includes(code));
  }
});
test('same-version content mismatch fails after grace and separates cross-site mismatch', async () => {
  const result = await probe(fakeFetch((text, path, site) => site === 'custom' && path === 'scripts/app.js' ? text + ' // changed' : text));
  assert.equal(result.status, 'fail');
  assert.ok(result.rows.find(row => row.site === 'custom' && row.path === 'scripts/app.js').errors.includes('baseline_mismatch'));
  assert.ok(result.rows[1].errors.includes('cross_site_mismatch'));
});
test('per-file grace and newer concurrent JSON warn without hiding source/time errors', async () => {
  const pinned = baseline(); pinned['scripts/app.js'].committedAt = '2026-09-13T09:30:00Z';
  const result = await probe(fakeFetch((text, path) => path === 'scripts/app.js' ? text + ' // deploy' : text), pinned);
  assert.equal(result.status, 'warn'); assert.ok(result.rows[1].warnings.includes('publication_in_progress'));
  const newer = await probe(fakeFetch(text => text.replaceAll(generated, '2026-09-13T09:00:00Z')));
  assert.equal(newer.status, 'warn'); assert.ok(newer.rows[2].warnings.includes('baseline_advanced'));
});
test('EdgeOne 3h data schedule has 4h grace, without extending Pages or hiding stale snapshots', async () => {
  const pinned = baseline(); pinned['data/radar-data.json'].committedAt = '2026-09-13T08:00:00Z';
  const result = await probe(fakeFetch((text, path) => path === 'data/radar-data.json' ? text.replace('50', '51') : text), pinned);
  assert.ok(result.rows[2].errors.includes('baseline_mismatch'));
  assert.ok(result.rows[8].warnings.includes('publication_in_progress'));
  assert.deepEqual(result.rows[8].errors, []);
  const stale = await probe(fakeFetch((text, path) => path === 'data/radar-data.json' ? text.replace(generated, '2026-09-01T00:00:00Z') : text), pinned);
  assert.ok(stale.rows[8].errors.includes('snapshot_stale'));
});
test('HTML/script mixed versions fail even inside grace', async () => {
  const pinned = baseline(); pinned['index.html'].committedAt = '2026-09-13T09:30:00Z';
  const result = await probe(fakeFetch((text, path) => path === 'index.html' ? text.replace('test-1', 'test-2') : text), pinned);
  assert.ok(result.rows[0].errors.includes('asset_version_mismatch'));
});
test('source observation is separate from fresh collection; degradation warns, not outage', async () => {
  const pinned = baseline();
  const text = JSON.stringify({ updatedAt: generated, externalSources: { acled: { status: 'partial', lastFetchedAt: generated,
    summary: { sourceFreshness: 'aging', latestWeek: '2026-08-28' } } } });
  pinned['data/world-order-stress.json'].text = text;
  const result = await probe(fakeFetch((original, path) => path === 'data/world-order-stress.json' ? text : original), pinned);
  assert.equal(result.status, 'warn');
  const row = result.rows[3]; assert.deepEqual(row.errors, []);
  assert.equal(row.sources.find(source => source.id === 'acled_weekly').observedAt, '2026-08-28');
  assert.equal(row.sources.find(source => source.id === 'acled').clockKind, 'collection_not_observation');
});
test('operational limits apply to generation, not embedded source dates', () => {
  const target = TARGETS.find(item => item.kind === 'odp');
  const result = inspectContent(target, JSON.stringify({ builtAt: generated, evidence: { stocks: { sourceStatus: 'live', asOfDate: '2026-08-01', maxAgeDays: 16 } } }), now);
  assert.deepEqual(result.errors, []); assert.equal(result.sources[0].ageExceeded, true);
});
test('CLI defaults to no-network plan and workflow is read-only/main-only', () => {
  const output = execFileSync(process.execPath, ['scripts/check-published-snapshots.mjs'], { encoding: 'utf8' });
  assert.equal(JSON.parse(output).status, 'dry_run');
  const workflow = fs.readFileSync('.github/workflows/check-published-snapshots.yml', 'utf8');
  assert.match(workflow, /contents: read/); assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /fetch-depth: 0/); assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /timeout-minutes: 3/); assert.match(workflow, /retention-days: 90/);
  assert.doesNotMatch(workflow, /secrets\.|contents: write|git push|workflow run|npm ci/);
  assert.match(workflow, /node scripts\/check-published-snapshots.mjs --allow-network --github-summary/);
});
test('current committed production schemas are accepted offline', () => {
  for (const target of TARGETS) {
    const text = execFileSync('git', ['show', `HEAD:${target.path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const data = target.clock ? JSON.parse(text) : null;
    const inspection = inspectContent(target, text, data ? Date.parse(data[target.clock]) + 300000 : now);
    assert.ok(!inspection.errors.includes('invalid_shape'), target.path);
    assert.ok(!inspection.errors.includes('asset_version_missing'), target.path);
  }
});
