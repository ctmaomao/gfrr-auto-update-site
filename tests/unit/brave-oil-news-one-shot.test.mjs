import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BRAVE_OIL_DISCOVERY_CONSUMER, BRAVE_OIL_DISCOVERY_GRANT_ID, BRAVE_RENEWAL_SMOKE_GRANT_ID,
  createBraveBudget } from '../../scripts/lib/brave-budget.mjs';
import { OIL_DISCOVERY, runBraveOilDiscovery, verifyBraveOilReviewedAnchor } from '../../scripts/lib/brave-oil-news-one-shot.mjs';
import { keyFingerprint, SEARCH_REPOSITORY } from '../../scripts/lib/free-search-ledger.mjs';
import { prepareBravePrivateProof, prepareBravePrivateRenewal, createBravePublicProjection, withBravePrivateProof } from '../../scripts/lib/brave-private-proof.mjs';

test.before(() => { globalThis.fetch = async () => { throw new Error('OFFLINE_ONLY'); }; });
const clock = Date.parse('2026-11-23T18:00:00Z'), day = 86400000, iso = t => new Date(t).toISOString();
const key = 'SYNTHETIC_OIL_DISCOVERY_KEY';
function grant(at, evidence, id = randomUUID()) {
  return { id, keyId: keyFingerprint(key), scope: 'provider_enforced_free_only', source: 'owner_dashboard',
    evidenceSha256: evidence.repeat(64), accountPlanBindingSha256: 'b'.repeat(64), verifiedAt: iso(at), expiresAt: iso(at + 3600000),
    protectionEndsAt: iso(at + 3600000), requestLimit: 50, freeOnlyEnabled: true, hardStopConfirmed: true, plan: 'search_postpaid',
    bindingType: 'verified_dashboard_login_and_plan_key', loginIdentityVerified: true, planKeyAssociationVerified: true,
    accountObservation: { source: 'owner_dashboard', observedAt: iso(at), requestsUsed: 20, usageCostUsd: '0.10',
      outOfPocketCostUsd: '0.00', monthlyFreeCreditUsd: '5.00' } };
}
function fixture() {
  const original = prepareBravePrivateProof({ grant: grant(clock - day * 8, 'a'), recordingStartedAt: iso(clock - day * 8), now: clock });
  const prior = prepareBravePrivateRenewal({ privateProof: original, grant: grant(clock - day * 5, 'c', BRAVE_RENEWAL_SMOKE_GRANT_ID), now: clock });
  const fresh = grant(clock - 60000, 'd', BRAVE_OIL_DISCOVERY_GRANT_ID);
  const record = { approvedDispatchSha: 'e'.repeat(40), baseHead: OIL_DISCOVERY.baseHead, grant: fresh,
    purpose: OIL_DISCOVERY.purpose, schemaVersion: 'brave-oil-news-private-authorization-v1' };
  const ledger = createBravePublicProjection({ privateProof: prior, now: clock });
  ledger.entries = [...Array.from({ length: 8 }, (_, i) => ({
    id: randomUUID(), grantId: original.grants[0].id, consumer: 'oil-news', mode: 'automated', runId: String(123 + i),
    requests: 1, time: iso(clock - day * 8 + 1000 * (i + 1)), finishedAt: iso(clock - day * 8 + 2000 * (i + 1)), state: 'success'
  })), { id: randomUUID(), grantId: BRAVE_RENEWAL_SMOKE_GRANT_ID, consumer: 'brave-renewal-smoke', mode: 'manual', runId: '44252310781',
    requests: 1, time: iso(clock - day * 5 + 1000), finishedAt: iso(clock - day * 5 + 2000), state: 'success' }];
  const baseSnapshot = { head: OIL_DISCOVERY.baseHead, serverTime: clock, ledger };
  let current = structuredClone(baseSnapshot), writes = 0;
  const store = { read: async () => structuredClone(current), write: async (previous, value) => {
    if (previous.head !== current.head) return false;
    writes++; current = { head: writes.toString(16).padStart(40, '0'), serverTime: current.serverTime, ledger: structuredClone(value) };
    return true;
  } };
  const context = { actions: 'true', repository: SEARCH_REPOSITORY, ref: 'refs/heads/main', event: 'workflow_dispatch',
    sha: record.approvedDispatchSha, workflowSha: record.approvedDispatchSha, liveMainSha: record.approvedDispatchSha,
    workflowRef: `${SEARCH_REPOSITORY}/${OIL_DISCOVERY.workflow}@refs/heads/main`, job: 'single-discovery', operation: 'single-discovery', runId: '999' };
  let calls = [];
  const matching = 'https://www.eia.gov/todayinenergy/detail.php?id=12345';
  const xml = ({ date = new Date(clock - day).toUTCString(), link = matching, topic = 'Oil refining and production', description = topic.repeat(10) } = {}) =>
    `<rss version="2.0"><channel><item><link>${link}</link><pubDate>${date}</pubDate><title>${topic}</title><description><![CDATA[${description}]]></description></item></channel></rss>`;
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    if (url === OIL_DISCOVERY.feed) {
      assert.equal(options.headers['X-Subscription-Token'], undefined);
      return new Response(xml(), { headers: { 'content-type': 'text/xml' } });
    }
    const endpoint = new URL(url);
    assert.equal(endpoint.origin + endpoint.pathname, 'https://api.search.brave.com/res/v1/news/search');
    assert.equal(endpoint.searchParams.get('q'), OIL_DISCOVERY.query);
    assert.equal(options.headers['X-Subscription-Token'], key);
    return Response.json({ results: [{ url: matching, title: 'NEVER_EXPOSE_PROVIDER_TITLE', description: 'NEVER_EXPOSE_PROVIDER_SNIPPET' }] });
  };
  return { fetchImpl, options: () => ({ priorProof: prior, authorization: JSON.stringify(record), keys: [key], now: () => clock,
    monotonicNow: () => 0, context: { ...context }, baseSnapshot, store, fetchImpl, verifyReviewedAnchor: () => true }), context, store, calls,
  baseSnapshot, prior, record, matching, xml, writes: () => writes };
}

test('preview projects without writes or Brave contact and preflights the official feed', async () => {
  const f = fixture(), opts = f.options();
  opts.context.job = opts.context.operation = 'preview';
  assert.deepEqual(await runBraveOilDiscovery(opts), { status: 'PREVIEW_READY' });
  assert.equal(f.writes(), 0); assert.deepEqual(f.calls, [OIL_DISCOVERY.feed]);
});
test('one settled manual receipt preserves P0/R1 history; only independently verified result escapes', async () => {
  const f = fixture();
  assert.deepEqual(await runBraveOilDiscovery(f.options()), { status: 'OFFICIAL_RELEASE_VERIFIED', officialUrl: f.matching, releaseDate: '2026-11-22' });
  assert.equal(f.writes(), 3); assert.equal(f.calls.length, 2);
  const settled = (await f.store.read()).ledger;
  assert.deepEqual(settled.entries.slice(0, -1), f.baseSnapshot.ledger.entries);
  assert.deepEqual(settled.grants.slice(0, -1), f.baseSnapshot.ledger.grants);
  assert.equal(settled.grants.at(-1).requestLimit, 50);
  assert.deepEqual([settled.entries.at(-1).consumer, settled.entries.at(-1).state], [BRAVE_OIL_DISCOVERY_CONSUMER, 'success']);
  assert.doesNotMatch(JSON.stringify(settled), /NEVER_EXPOSE|12345|SYNTHETIC_OIL_DISCOVERY_KEY/u);
  await assert.rejects(runBraveOilDiscovery(f.options()), /refused_or_uncertain/u);
  assert.equal(f.calls.length, 2);
});
test('concurrent attempts and unsettled reservations permit at most one provider request', async () => {
  for (const outcome of ['normal', 'unknown', 'lost-receipt', '429']) {
    const f = fixture(), opts = f.options(); let provider = 0;
    if (outcome !== 'normal') opts.fetchImpl = async (url, options) => {
      if (url === OIL_DISCOVERY.feed) return f.fetchImpl(url, options);
      provider++;
      if (outcome === 'unknown') throw new Error('untrusted body');
      if (outcome === '429') return new Response('private provider body', { status: 429 });
      return Response.json({ results: [] });
    };
    if (outcome === 'lost-receipt') {
      const write = f.store.write;
      f.store.write = (previous, value) => value.entries.at(-1)?.grantId === BRAVE_OIL_DISCOVERY_GRANT_ID
        && value.entries.at(-1)?.state === 'success' ? false : write(previous, value);
    }
    const outcomes = await Promise.allSettled([runBraveOilDiscovery(opts), runBraveOilDiscovery(opts), runBraveOilDiscovery(opts)]);
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, outcome === 'normal' ? 1 : 0);
    await assert.rejects(runBraveOilDiscovery(opts));
    assert.equal(outcome === 'normal' ? f.calls.filter(x => x !== OIL_DISCOVERY.feed).length : provider, 1);
    if (outcome === '429') assert.equal((await f.store.read()).ledger.hold.code, 'brave_budget_provider_quota_unknown');
  }
});
test('budget isolates each fixed grant from ordinary callers and each other', async () => {
  const f = fixture();
  const next = prepareBravePrivateRenewal({ privateProof: f.prior, grant: f.record.grant, now: clock });
  const activeCanaryTime = clock - 5 * day + 1, activeCanary = { ...f.baseSnapshot.ledger, entries: f.baseSnapshot.ledger.entries.slice(0, -1) };
  const canaryStore = { read: async () => ({ ledger: activeCanary, serverTime: activeCanaryTime }),
    write: async () => assert.fail('ordinary caller cannot write under fixed smoke') };
  await assert.rejects(createBraveBudget({ store: withBravePrivateProof(canaryStore, f.prior, () => activeCanaryTime),
    now: () => activeCanaryTime })({ key, consumer: 'oil-news' }, () => assert.fail('wrong purpose')));
  const businessStore = { read: async () => ({ ledger: createBravePublicProjection({ privateProof: next, now: clock }), serverTime: clock }),
    write: async () => assert.fail('ordinary caller cannot write under fixed discovery') };
  for (const consumer of ['macro-editorial', 'oil-news', 'brave-renewal-smoke']) {
    await assert.rejects(createBraveBudget({ store: withBravePrivateProof(businessStore, next, () => clock),
      now: () => clock })({ key, consumer }, () => assert.fail('wrong purpose')), /purpose_mismatch/u);
  }
});
test('wrong binding, clock, identity, history or permission fails before any actual write or call', async () => {
  for (const alter of [f => f.context.liveMainSha = 'f'.repeat(40), f => f.context.event = 'schedule', f => f.context.job = 'cron',
    f => f.record.grant.requestLimit = 1, f => f.record.grant.hardStopConfirmed = false,
    f => f.record.grant.expiresAt = iso(clock + 1000), f => f.record.grant.id = BRAVE_RENEWAL_SMOKE_GRANT_ID,
    f => f.record.grant.accountPlanBindingSha256 = '9'.repeat(64), f => f.baseSnapshot.ledger.entries.at(-1).runId = '42']) {
    const f = fixture(); alter(f);
    await assert.rejects(runBraveOilDiscovery(f.options())); assert.equal(f.writes(), 0); assert.deepEqual(f.calls, []);
  }
});
test('candidate metadata and official feed failures or no fresh valid hit are not promoted', async () => {
  for (const [variant, expected, officials] of [
    ['off-domain', 'NO_MATCHING_OFFICIAL_RELEASE', 1], ['no-results', 'NO_MATCHING_OFFICIAL_RELEASE', 1],
    ['future', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0], ['old', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0],
    ['invalid-date', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0], ['nested', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0],
    ['comment', 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST', 0], ['cdata', 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST', 0],
    ['poisoned-xml', 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST', 0], ['unavailable', 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST', 0],
    ['unrelated', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0], ['short', 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST', 0]
  ]) {
    const f = fixture(), opts = f.options(); let verifiedCalls = 0, braveCalls = 0;
    opts.fetchImpl = async (url) => {
      if (url !== OIL_DISCOVERY.feed) { braveCalls++; return Response.json({ results: variant === 'no-results' ? [] : [
        { url: variant === 'off-domain' ? f.matching.replace('www.eia.gov/', 'www.eia.gov.evil/') : f.matching, title: 'oil' }
      ] }); }
      verifiedCalls++;
      if (variant === 'unavailable') return new Response(null, { status: 503 });
      let xml = variant === 'poisoned-xml' ? '<!DOCTYPE rss>' + f.xml() : f.xml({
        date: variant === 'old' ? new Date(clock - day * 15).toUTCString() : variant === 'future' ? new Date(clock + day).toUTCString() : variant === 'invalid-date' ? 'Sun, 31 Nov 2026 12:00:00 EST' : undefined,
        topic: variant === 'unrelated' ? 'Unrelated power market' : undefined,
        description: variant === 'short' ? 'oil' : undefined
      });
      const cloned = xml.match(/<item>[\s\S]+<\/item>/u)?.[0] ?? '';
      if (variant === 'comment') xml = xml.replace(cloned, '<!-- ' + cloned.replace(/<!\[CDATA\[|\]\]>/gu, '') + ' -->');
      if (variant === 'cdata') xml = xml.replace(cloned, '<description><![CDATA[' + cloned.replace(/<!\[CDATA\[|\]\]>/gu, '') + ']]></description>');
      if (variant === 'nested') xml = xml.replace(/<link>[\s\S]+?<\/link>/u, x => '<source>' + x + '</source>');
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });
    };
    assert.equal((await runBraveOilDiscovery(opts)).status, expected, variant);
    assert.equal(verifiedCalls, 1);
    assert.equal(braveCalls, officials);
    if (!officials) assert.equal(f.writes(), 0);
  }
});

test('the only proposed runner is exact main dispatch; preview is read-only and no credentials escape', () => {
  const workflow = readFileSync(OIL_DISCOVERY.workflow, 'utf8');
  assert.equal((workflow.match(/run: node scripts\/run-brave-oil-news-official-discovery\.mjs/gu) ?? []).length, 2);
  assert.equal((workflow.match(/BRAVE_BUDGET_OIL_R2: \$\{\{ secrets\.BRAVE_BUDGET_OIL_R2 \}\}/gu) ?? []).length, 2);
  assert.equal((workflow.match(/persist-credentials: false/gu) ?? []).length, 2);
  assert.equal((workflow.match(/fetch-depth: 34/gu) ?? []).length, 2);
  assert.equal((workflow.match(/ref: \$\{\{ github\.sha \}\}/gu) ?? []).length, 2);
  assert.match(workflow, /default: preview/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(workflow, /single-discovery:\n    needs: preview[\s\S]*?permissions:\n      contents: write/u);
  assert.doesNotMatch(workflow, /schedule:|pull_request:|upload-artifact|environment:|GITHUB_STEP_SUMMARY|npm |set -x/u);
  const cli = 'scripts/run-brave-oil-news-official-discovery.mjs';
  const runner = readFileSync(cli, 'utf8');
  assert.match(runner, /const store = operation === 'preview' \? \{ read: \(\) => rawStore\.read\(\) \} : rawStore/u);
  assert.match(runner, /checkout|rev-parse/u);
  const rejected = spawnSync(process.execPath, [cli], { env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'false',
    BRAVE_API_KEY: 'SYNTHETIC_DO_NOT_ECHO' }, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, '');
  assert.equal(rejected.stderr.trim(), 'BRAVE_OIL_DISCOVERY_REFUSED_OR_UNCERTAIN');
});

const entry = 'scripts/run-brave-oil-news-official-discovery.mjs';
const runtimeModules = ['brave-oil-news-one-shot', 'brave-manual-canary', 'brave-budget', 'brave-private-proof', 'free-search-ledger']
  .map(name => `scripts/lib/${name}.mjs`);
const runtimeFiles = [OIL_DISCOVERY.workflow, entry, ...runtimeModules];

function history(t) {
  const root = mkdtempSync(join(tmpdir(), 'brave-oil-reviewed-anchor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  });
  const commit = () => {
    git(['add', '-A']);
    git(['commit', '--quiet', '--allow-empty', '-m', 'synthetic']);
    return head();
  };
  const head = () => git(['rev-parse', 'HEAD']).trim();
  const put = (path, value = '{}\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'Fixture']);
  for (const path of runtimeFiles) put(path, '// reviewed\n');
  put('.gitignore', '*.ignored\n');
  put('package.json');
  const reviewed = commit();
  const verify = (anchor = reviewed, checkout = head(), runnerGit = git) =>
    verifyBraveOilReviewedAnchor({ reviewed: anchor, checkout, root, git: runnerGit });
  return { root, git, put, head, commit, reviewed, verify };
}

test('bounded runtime history permits natural Oil, QQQ, Bubble, curated and World Order updates', t => {
  const h = history(t);
  assert.equal(h.verify(), true);
  for (const path of ['data/oil-directional-pressure.json', 'data/qqq-overheat-history.json',
    'data/market-pricing-history.json', 'data/bubble-watch-editorial-status.json', 'config/bubble-watch-curated.json',
    'config/acled.json', 'scripts/check-world-order-stress.mjs', 'docs/project.md']) {
    h.put(path);
    h.commit();
  }
  assert.equal(h.verify(), true);
  for (let i = 8; i < 32; i++) h.commit();
  assert.equal(h.verify(), true, '32 hops inclusive');
  h.commit();
  assert.equal(h.verify(), false, '33 hops rejected');
});

test('every runtime and metadata path is bound per hop, including changes reverted at HEAD', t => {
  const h = history(t);
  for (const path of [...runtimeFiles, '.gitattributes', 'scripts/.gitattributes', 'scripts/lib/.gitattributes',
    '.github/.gitattributes', '.github/workflows/.gitattributes', '.gitmodules', '.gitignore',
    'scripts/.gitignore', 'scripts/lib/.gitignore', '.github/.gitignore', '.github/workflows/.gitignore', 'package.json', 'scripts/package.json', 'scripts/lib/package.json']) {
    h.git(['reset', '--hard', h.reviewed]);
    h.put(path, 'changed\n');
    const changed = h.commit();
    assert.equal(h.verify(), false, path);
    h.git(['revert', '--no-edit', changed]);
    assert.equal(h.verify(), false, path + ' reverted');
  }
});

test('modes, missing files/objects, path types, merge and malformed Git evidence fail closed', t => {
  const h = history(t), file = join(h.root, entry);
  chmodSync(file, 0o755);
  assert.equal(h.verify(), false, 'exact SHA worktree mode changed');
  h.commit();
  assert.equal(h.verify(h.head()), false, 'exact SHA tracked mode changed');
  h.git(['reset', '--hard', h.reviewed]);
  rmSync(file);
  assert.equal(h.verify(), false, 'exact SHA file missing on disk');
  const missing = h.commit();
  assert.equal(h.verify(missing), false, 'required tracked script missing');
  h.git(['reset', '--hard', h.reviewed]);
  rmSync(file); symlinkSync('lib/brave-budget.mjs', file);
  assert.equal(h.verify(), false, 'exact SHA local symlink');
  const symlink = h.commit();
  assert.equal(h.verify(symlink), false, 'tracked symlink');
  h.git(['reset', '--hard', h.reviewed]);
  h.git(['update-index', '--cacheinfo', `160000,${h.reviewed},${entry}`]);
  h.git(['commit', '--quiet', '-m', 'synthetic gitlink']);
  assert.equal(h.verify(h.head()), false, 'tracked gitlink');
  h.git(['reset', '--hard', h.reviewed]);
  h.put('scripts/lib/package.json/data');
  const directory = h.commit();
  assert.equal(h.verify(directory), false, 'metadata directory is not a plain blob');
  h.git(['reset', '--hard', h.reviewed]);
  h.put(entry, '// modified on disk only\n');
  assert.equal(h.verify(), false, 'actual checkout bytes changed');
  h.git(['reset', '--hard', h.reviewed]);
  h.put('scripts/lib/package.json');
  assert.equal(h.verify(), false, 'metadata expected absent on disk');
  rmSync(join(h.root, 'scripts/lib/package.json'));
  h.git(['switch', '-qc', 'side']);
  h.put('unrelated.txt'); h.commit();
  h.git(['switch', '-q', 'main']);
  h.git(['merge', '--no-ff', '-qm', 'merge', 'side']);
  assert.equal(h.verify(), false, 'otherwise unrelated merge');
  assert.equal(h.verify('f'.repeat(40)), false, 'unknown reviewed ancestor');
  h.git(['reset', '--hard', h.reviewed]);
  h.put('data/ordinary.json'); h.commit();
  const tip = h.head();
  assert.equal(h.verify(), true);
  for (const cmd of ['ls-tree', 'cat-file', 'log']) {
    assert.equal(h.verify(h.reviewed, tip, args => args[0] === cmd ? h.git(args) + 'malformed' : h.git(args)), false);
    assert.equal(h.verify(h.reviewed, tip, args => {
      if (args[0] === cmd) throw new Error('incomplete evidence');
      return h.git(args);
    }), false);
  }
  writeFileSync(join(h.root, '.git/shallow'), tip + '\n');
  assert.equal(h.verify(), false, 'shallow boundary before reviewed anchor');
});

test('dedicated runtime closure covers all checked-in local imports including the literal dynamic edge', () => {
  const pending = [entry], visited = new Set(), dynamic = [];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /\bcreateRequire\s*\(/u);
    // The entry's locally defined assertion helper is not CommonJS require.
    if (file === entry) assert.match(content, /^const require = condition =>/mu);
    else assert.doesNotMatch(content, /\brequire\s*\(/u);
    const specifiers = Array.from(content.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gmu), match => match[1]);
    const calls = [...content.matchAll(/\bimport\s*\(\s*([^)]*?)\s*\)/gu)];
    assert.equal(calls.length, (content.match(/\bimport\s*\(/gu) || []).length);
    for (const [, arg] of calls) {
      const literal = /^['"]([^'"]+)['"]$/u.exec(arg);
      assert.ok(literal, `non-literal dynamic import in ${file}`);
      dynamic.push([file, literal[1]]);
      specifiers.push(literal[1]);
    }
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) pending.push(join(dirname(file), specifier));
      else assert.ok(specifier.startsWith('node:') && isBuiltin(specifier), `non-builtin import in ${file}`);
    }
  }
  assert.deepEqual([...visited].sort(), [entry, ...runtimeModules].sort());
  assert.deepEqual(dynamic, [['scripts/lib/brave-budget.mjs', './brave-private-proof.mjs']]);
});
test('reviewed ancestor is additive to, not a substitute for, exact current trusted main and workflow identities', async () => {
  const f = fixture(), opts = f.options();
  opts.context.job = opts.context.operation = 'preview';
  await assert.rejects(runBraveOilDiscovery({ ...opts, verifyReviewedAnchor: () => false }));
  await assert.rejects(runBraveOilDiscovery({ ...opts, verifyReviewedAnchor: undefined }));
  assert.deepEqual(f.calls, [], 'even exact SHA requires usable fixed checkout before external contact');
  opts.context.sha = opts.context.liveMainSha = opts.context.workflowSha = 'f'.repeat(40);
  let matched = 0;
  opts.verifyReviewedAnchor = (reviewed, checkout) => {
    assert.equal(reviewed, f.record.approvedDispatchSha); assert.equal(checkout, 'f'.repeat(40)); matched++; return true;
  };
  assert.deepEqual(await runBraveOilDiscovery(opts), { status: 'PREVIEW_READY' });
  for (const identity of ['liveMainSha', 'workflowSha', 'ref', 'event', 'workflowRef']) {
    await assert.rejects(runBraveOilDiscovery({ ...opts, context: { ...opts.context, [identity]: 'untrusted' } }));
  }
  await assert.rejects(runBraveOilDiscovery({ ...opts, verifyReviewedAnchor: () => false }));
  assert.equal(matched, 1); assert.equal(f.writes(), 0); assert.deepEqual(f.calls, [OIL_DISCOVERY.feed]);
});
