import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { BRAVE_OIL_DISCOVERY_CONSUMER, BRAVE_OIL_DISCOVERY_GRANT_ID, BRAVE_RENEWAL_SMOKE_GRANT_ID,
  createBraveBudget } from '../../scripts/lib/brave-budget.mjs';
import { OIL_DISCOVERY, runBraveOilDiscovery } from '../../scripts/lib/brave-oil-news-one-shot.mjs';
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
    monotonicNow: () => 0, context: { ...context }, baseSnapshot, store, fetchImpl }), context, store, calls,
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
