import { BRAVE_OIL_DISCOVERY_CONSUMER, BRAVE_OIL_DISCOVERY_GRANT_ID, BRAVE_RENEWAL_SMOKE_GRANT_ID,
  BRAVE_DISPATCH_DEADLINE_MS, createBraveBudget } from './brave-budget.mjs';
import { parseBravePrivateProof, prepareBravePrivateRenewal, renewBravePrivateProof, withBravePrivateProof } from './brave-private-proof.mjs';
import { keyFingerprint, SEARCH_CLOCK_POLICY, SEARCH_REPOSITORY } from './free-search-ledger.mjs';

export const OIL_DISCOVERY = Object.freeze({
  purpose: 'brave-oil-news-official-discovery-once-v1',
  baseHead: '2430d892d9828be3368b86c25268c2496e8589d0',
  workflow: '.github/workflows/brave-oil-news-official-discovery.yml',
  query: 'site:eia.gov oil',
  feed: 'https://www.eia.gov/rss/todayinenergy.xml'
});
const refuse = () => { throw new Error('brave_oil_discovery_refused_or_uncertain'); };
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === fields;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));

// Bounded first-parent evidence from the exact, trusted current-main checkout.
const NATURAL_DATA_PATHS = new Set([
  'data/oil-thermal-watch.json',
  'data/radar-data.json', 'data/radar-history.json', 'data/radar-history-full.json',
  'data/world-order-stress.json', 'data/gdelt-world-order-cache.json',
  'data/oil-news-event-watch.json', 'data/gdelt-news-cache.json',
  'data/bubble-watch.json', 'data/bubble-market-observations.json', 'data/bubble-watch-history.json', 'data/gdelt-bubble-watch-cache.json'
]);
const REGULAR_UPDATE = /^:100644 100644 [a-f0-9]{40} [a-f0-9]{40} M$/u;
function onlyNaturalDataUpdates(delta) {
  const fields = delta.split('\0');
  if (fields.pop() !== '' || fields.length < 2 || fields.length % 2 || fields.length > NATURAL_DATA_PATHS.size * 2) return false;
  const paths = new Set();
  for (let i = 0; i < fields.length; i += 2) {
    const path = fields[i + 1];
    if (!REGULAR_UPDATE.test(fields[i]) || !NATURAL_DATA_PATHS.has(path) || paths.has(path)) return false;
    paths.add(path);
  }
  return true;
}
export function verifyBraveOilReviewedAnchor({ reviewed, checkout, git }) {
  if (!sha(reviewed) || !sha(checkout) || typeof git !== 'function') return false;
  if (reviewed === checkout) return true;
  try {
    const lines = git(['log', '--first-parent', '--max-count=33', '--format=%H %P', checkout, '--']).trimEnd().split('\n');
    if (lines.length > 33) return false;
    let current = checkout;
    for (const line of lines) {
      const [commit, parent, ...extra] = line.trimEnd().split(' ');
      if (commit !== current) return false;
      if (commit === reviewed) return true;
      if (extra.length || !sha(parent)) return false;
      const delta = git(['diff-tree', '-r', '--raw', '-z', '--no-commit-id', '--no-renames', '--no-abbrev', '--ignore-submodules=none', parent, commit, '--']);
      if (!onlyNaturalDataUpdates(delta)) return false;
      current = parent;
    }
  } catch { /* Unavailable or incomplete history never proves equivalence. */ }
  return false;
}

function inputs({ priorProof, authorization, keys, context, verifyReviewedAnchor, now }) {
  if (typeof authorization !== 'string' || Buffer.byteLength(authorization) > 48000) refuse();
  const record = JSON.parse(authorization);
  if (!exact(record, 'approvedDispatchSha,baseHead,grant,purpose,schemaVersion')
    || record.schemaVersion !== 'brave-oil-news-private-authorization-v1'
    || record.purpose !== OIL_DISCOVERY.purpose || record.baseHead !== OIL_DISCOVERY.baseHead
    || !sha(record.approvedDispatchSha) || context.actions !== 'true' || context.repository !== SEARCH_REPOSITORY
    || context.event !== 'workflow_dispatch' || context.ref !== 'refs/heads/main'
    || !sha(context.sha) || context.workflowSha !== context.sha || context.liveMainSha !== context.sha
    || context.workflowRef !== `${SEARCH_REPOSITORY}/${OIL_DISCOVERY.workflow}@refs/heads/main`
    || !/^[0-9]+$/u.test(context.runId || '') || context.job !== context.operation
    || !['preview', 'single-discovery'].includes(context.operation)) refuse();
  if (context.sha !== record.approvedDispatchSha
    && verifyReviewedAnchor?.(record.approvedDispatchSha, context.sha) !== true) refuse();
  const unique = [...new Set(keys.flatMap(value => String(value || '').split(/[\n,;]+/u)).map(value => value.trim()).filter(Boolean))];
  if (unique.length !== 1 || /\s/u.test(unique[0])) refuse();
  const key = unique[0], prior = parseBravePrivateProof(priorProof, now);
  const last = prior.grants.at(-1), grant = record.grant;
  if (last?.id !== BRAVE_RENEWAL_SMOKE_GRANT_ID || grant?.id !== BRAVE_OIL_DISCOVERY_GRANT_ID
    || keyFingerprint(key) !== last.keyId || grant.requestLimit !== last.requestLimit) refuse();
  return { key, prior, next: prepareBravePrivateRenewal({ privateProof: prior, grant, now }) };
}

// No invoker, environment reads, provider credentials, public-result artifact,
// or fixture-controlled transport defaults. The caller owns exact-ref checks
// and the trusted fixed GitHub store/snapshot, bound in the private authorization.
export async function runBraveOilDiscovery({ priorProof, authorization, keys, context, baseSnapshot, store, fetchImpl, verifyReviewedAnchor,
  now = Date.now, monotonicNow = () => performance.now() }) {
  try {
    const { key, prior, next } = inputs({ priorProof, authorization, keys, context, verifyReviewedAnchor, now: now() });
    if (baseSnapshot?.head !== OIL_DISCOVERY.baseHead) refuse();
    const anchored = await withBravePrivateProof({ read: async () => structuredClone(baseSnapshot) }, prior, now).read();
    const receipts = anchored.ledger.entries;
    const last = receipts.at(-1);
    if (last?.grantId !== BRAVE_RENEWAL_SMOKE_GRANT_ID || last.state !== 'success' || last.runId !== '44252310781') refuse();
    const current = await store.read();
    // Before a new reservation, there must be zero receipt drift, no spent
    // business grant, and no unresolved/held historical debit.
    if (stable(current.ledger.entries) !== stable(baseSnapshot.ledger.entries) || current.ledger.hold !== null) refuse();
    const isBase = current.head === OIL_DISCOVERY.baseHead;
    let projection = current.ledger;
    if (isBase) {
      await renewBravePrivateProof({ store: { read: async () => current,
        write: async (_previous, value) => { projection = value; return true; } },
      privateProof: prior, nextPrivateProof: next, now, monotonicNow });
    }
    const local = now(), server = current.serverTime, latest = next.grants.at(-1);
    if (!Number.isFinite(server) || Math.abs(local - server) > SEARCH_CLOCK_POLICY.maxSkewMs
      || Date.parse(latest.verifiedAt) > Math.min(local, server - SEARCH_CLOCK_POLICY.httpDatePrecisionMs)
      || Math.max(local, server) + BRAVE_DISPATCH_DEADLINE_MS + SEARCH_CLOCK_POLICY.httpDatePrecisionMs >= Date.parse(latest.expiresAt)) refuse();
    // Preview works through the same gate and validation but writes solely to
    // disposable memory. A prior successful/failed/uncertain receipt cannot run.
    let simulated = { ...current, ledger: structuredClone(projection) };
    const sink = { read: async () => structuredClone(simulated), write: async (_previous, ledger) => {
      simulated = { ...simulated, ledger: structuredClone(ledger) }; return true;
    } };
    const opts = { key, consumer: BRAVE_OIL_DISCOVERY_CONSUMER, mode: 'manual', runId: context.runId };
    const gate = target => createBraveBudget({ store: withBravePrivateProof(target, next, now), now, monotonicNow });
    await gate(sink)(opts, async () => ({ results: [] }));
    if (typeof fetchImpl !== 'function') refuse();
    const official = await readOfficialReleases(fetchImpl, now());
    if (!official || official.size === 0) {
      if (context.operation === 'preview') refuse();
      return outcome(official ? 'NO_RECENT_OFFICIAL_RELEASE_NO_REQUEST' : 'OFFICIAL_VERIFICATION_UNAVAILABLE_NO_REQUEST');
    }
    if (context.operation === 'preview') return outcome('PREVIEW_READY');
    if (isBase) {
      // Recheck trustworthy clocks and immutability at the actual CAS; never
      // retry an uncertain ledger operation or update any secret here.
      await renewBravePrivateProof({ store: {
        read: async () => {
          const fresh = await store.read();
          if (fresh.head !== current.head || stable(fresh.ledger) !== stable(current.ledger)) refuse();
          return fresh;
        }, write: (previous, ledger) => store.write(previous, ledger)
      }, privateProof: prior, nextPrivateProof: next, now, monotonicNow });
    }
    // A CAS contention must not be retried on this first business run.
    const singleWriteStore = { read: () => store.read(), write: async (previous, ledger) => {
      if (await store.write(previous, ledger) !== true) refuse();
      return true;
    } };
    const hints = await gate(singleWriteStore)(opts, () => requestBraveHints(key, fetchImpl));
    const settled = await withBravePrivateProof(store, next, now).read();
    const booked = settled.ledger.entries.at(-1);
    if (settled.ledger.entries.length !== receipts.length + 1
      || stable(settled.ledger.entries.slice(0, -1)) !== stable(receipts)
      || booked?.grantId !== BRAVE_OIL_DISCOVERY_GRANT_ID || booked.consumer !== BRAVE_OIL_DISCOVERY_CONSUMER
      || booked.runId !== context.runId || booked.state !== 'success' || settled.ledger.hold !== null) refuse();
    for (const id of hints.results) {
      const release = official.get(id);
      if (release) return { status: 'OFFICIAL_RELEASE_VERIFIED', ...release };
    }
    return outcome('NO_MATCHING_OFFICIAL_RELEASE');
  } catch {
    // Discard source content, URLs, keys and exception text even on failure.
    refuse();
  }
}

async function readBounded(response, limit) {
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('response_limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}
const requestOptions = (accept, headers) => ({
  redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
  headers: { Accept: accept, ...headers }
});
// Do not fetch a URL supplied by Brave. Match only article IDs against the
// official feed, opened at a fixed URL independent of Brave results.
function articleId(value) {
  if (typeof value !== 'string' || value.length > 120) return null;
  return /^https:\/\/www\.eia\.gov\/todayinenergy\/detail\.php\?id=([1-9][0-9]{3,6})$/iu.exec(value)?.[1] ?? null;
}
async function requestBraveHints(key, fetchImpl) {
  const params = new URLSearchParams({ q: OIL_DISCOVERY.query, count: '10', freshness: 'pm' });
  const response = await fetchImpl(`https://api.search.brave.com/res/v1/news/search?${params}`,
    requestOptions('application/json', { 'X-Subscription-Token': key }));
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error('provider_refused'), { providerResponseReceived: true, httpStatus: response.status });
  }
  const json = JSON.parse(await readBounded(response, 1024 * 1024));
  if (!Array.isArray(json?.results) || json.results.length > 10 || json.error || json.errors) refuse();
  return { results: [...new Set(json.results.map(item => articleId(item?.url)).filter(Boolean))] };
}
const outcome = status => ({ status });
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseRssDate(value) {
  // RSS 2.0 uses RFC-822 mail dates. Accept explicit publisher time zones
  // only, and reject normalized invalid dates, clock values and wrong weekday.
  const m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([0-9]{1,2}) ([A-Z][a-z]{2}) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) (GMT|UTC|EST|EDT|[+-][0-9]{4})$/u.exec(value);
  if (!m) return null;
  const [, weekday, day, month, year, hour, minute, sec, zone] = m;
  const idx = months.indexOf(month), date = new Date(Date.UTC(+year, idx, +day, +hour, +minute, +sec));
  if (idx < 0 || date.getUTCFullYear() !== +year || date.getUTCMonth() !== idx || date.getUTCDate() !== +day
    || +hour > 23 || +minute > 59 || +sec > 59 || date.toUTCString().slice(0, 3) !== weekday) return null;
  const offset = zone === 'EST' ? '-0500' : zone === 'EDT' ? '-0400' : ['GMT','UTC'].includes(zone) ? '+0000' : zone;
  const hours = +offset.slice(1, 3), minutes = +offset.slice(3);
  if (hours > 23 || minutes > 59) return null;
  const utc = +date - (offset.startsWith('-') ? -1 : 1) * (hours * 60 + minutes) * 60000;
  return { utc, date: `${year}-${String(idx + 1).padStart(2, '0')}-${day.padStart(2, '0')}` };
}
function rssItems(xml) {
  // Scan a constrained RSS 2.0 envelope. Protect opaque CDATA before
  // structural matching; never interpret comments or embedded feed text as
  // tags. The marker syntax cannot appear in an XML 1.0 input.
  if (xml.includes('\0')) return null;
  const data = [];
  const safe = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>/gu,
    (_, cdata) => cdata === undefined ? '' : `\0${data.push(cdata) - 1}\0`);
  if (/<!DOCTYPE|<!ENTITY|<!--|<!\[CDATA\[/iu.test(safe)) return null;
  const channel = /^\s*(?:<\?xml[^?]*\?>\s*)?<rss\b[^>]*>\s*<channel\b[^>]*>([\s\S]+)<\/channel>\s*<\/rss>\s*$/u.exec(safe)?.[1];
  if (!channel || /<\/?channel\b/u.test(channel)) return null;
  const directItems = [];
  const stack = [];
  let item;
  const wanted = new Set(['link', 'pubDate', 'title', 'description']);
  for (const token of channel.matchAll(/<(\/?)([\w.:-]+)\b(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/gu)) {
    const [raw, close, name, selfClosed] = token;
    if (close) {
      const open = stack.pop();
      if (open?.name !== name) return null;
      if (item && stack.length === 1 && wanted.has(name)) {
        const content = channel.slice(open.contentAt, token.index).trim();
        if (item.has(name) || (name !== 'description' && /[<>]/u.test(content))) item.set(name, '');
        else item.set(name, content.replace(/\0([0-9]+)\0/gu, (_, i) => data[+i] ?? ''));
      }
      if (item && stack.length === 0 && name === 'item') { directItems.push(item); item = null; }
    } else if (!selfClosed) {
      if (stack.length === 0 && name === 'item') item = new Map();
      stack.push({ name, contentAt: token.index + raw.length });
    }
  }
  return stack.length === 0 && directItems.length ? directItems : null;
}
async function readOfficialReleases(fetchImpl, now) {
  try {
    const response = await fetchImpl(OIL_DISCOVERY.feed, requestOptions('application/rss+xml, application/xml, text/xml'));
    if (!response.ok || !/^(application\/(rss\+xml|xml)|text\/xml)(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel(); return null;
    }
    const items = rssItems(await readBounded(response, 1024 * 1024));
    if (!items) return null;
    const verified = new Map();
    for (const item of items) {
      const officialId = articleId(item.get('link'));
      if (!officialId) continue;
      const release = parseRssDate(item.get('pubDate') ?? '');
      const title = item.get('title') ?? '';
      // Independent publisher content, not Brave title/snippet/category/date.
      const body = (item.get('description') ?? '').replace(/<[^>]*>/gu, ' ');
      if (release && release.utc <= now && release.utc >= now - 14 * 86400000 && body.trim().length >= 80
        && /\b(?:oil|petroleum|refiner(?:y|ies)|chokepoints?)\b/iu.test(title + ' ' + body)) verified.set(officialId, {
        releaseDate: release.date, officialUrl: `https://www.eia.gov/todayinenergy/detail.php?id=${officialId}`
      });
    }
    return verified;
  } catch { return null; }
}
