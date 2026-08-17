import { createHash } from 'node:crypto';

import { EDITORIAL_TOPICS, NEWS_DISCOVERY_SCHEMA } from './weekly-editorial-contract.mjs';

export const WEEKLY_EDITORIAL_QUERIES = Object.freeze({
  ai_capex_earnings: '(AI OR artificial intelligence) (capex OR "capital expenditure") earnings cloud data center',
  ai_financing_credit: '(AI OR artificial intelligence) financing debt credit facility data center startup',
  ai_demand_fundamentals: '(AI OR artificial intelligence) demand revenue backlog adoption enterprise earnings',
  market_structure_valuation: '(AI stocks OR semiconductor stocks) valuation breadth concentration market',
  macro_policy: '(AI stocks OR technology stocks) Federal Reserve rates inflation policy',
  accounting_regulatory: '(AI OR artificial intelligence) accounting SEC DOJ investigation disclosure regulation'
});

export function assessWeeklyEditorialNewsReadiness(discovery) {
  const providers = ['tavily', 'brave'].map((provider) => discovery?.sourceStatus?.[provider] || {});
  const providerStatuses = providers.map((status) => status.status || 'missing');
  const searchProvidersHealthy = providers.every((status) => status.status === 'ok'
    && status.successCount === EDITORIAL_TOPICS.length
    && status.failureCount === 0);
  const stories = Array.isArray(discovery?.stories) ? discovery.stories : [];
  const credibleCount = stories.filter((story) => ['official', 'cross_checked'].includes(story?.evidenceStatus)).length;
  const editorialReady = ['ok', 'partial'].includes(discovery?.status)
    && discovery?.liveProviderCount === 2
    && credibleCount >= 1;
  let reason = null;
  if (credibleCount === 0 && searchProvidersHealthy) reason = 'no_credible_news';
  else if (!searchProvidersHealthy) reason = 'search_provider_unhealthy';
  else if (discovery?.liveProviderCount !== 2) reason = 'two_live_providers_required';
  else if (credibleCount === 0) reason = 'credible_news_required';
  else if (!['ok', 'partial'].includes(discovery?.status)) reason = 'discovery_status_not_ready';
  return {
    editorialReady,
    expectedSkip: credibleCount === 0 && searchProvidersHealthy,
    reason,
    storyCount: stories.length,
    credibleCount,
    providerStatuses,
    searchProvidersHealthy
  };
}

const OFFICIAL_DOMAIN_SUFFIXES = Object.freeze([
  'sec.gov',
  'justice.gov',
  'federalreserve.gov',
  'nvidia.com',
  'microsoft.com',
  'aboutamazon.com',
  'amazon.com',
  'abc.xyz',
  'investor.fb.com',
  'meta.com',
  'openai.com',
  'anthropic.com',
  'oracle.com',
  'amd.com',
  'broadcom.com'
]);

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source'
]);

function compactText(value, maxLength) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function canonicalizeNewsUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./u, '');
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/{2,}/gu, '/').replace(/\/$/u, '') || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function newsDomain(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    return null;
  }
}

function titleTokens(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 2));
}

export function titleFingerprint(value) {
  const normalized = [...titleTokens(value)].sort().join(' ');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function titleSimilarity(left, right) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function parsePublishedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isOfficialDomain(domain) {
  return OFFICIAL_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
}

export function normalizeProviderStory(raw) {
  if (!raw || !EDITORIAL_TOPICS.includes(raw.topic) || !['tavily', 'brave'].includes(raw.provider)) return null;
  const url = canonicalizeNewsUrl(raw.url);
  const title = compactText(raw.title, 220);
  const domain = newsDomain(url);
  if (!url || !title || !domain) return null;
  return {
    provider: raw.provider,
    topic: raw.topic,
    title,
    titleFingerprint: titleFingerprint(title),
    url,
    domain,
    publishedAt: parsePublishedAt(raw.publishedAt),
    snippet: compactText(raw.snippet, 360),
    searchScore: Number.isFinite(raw.searchScore) ? raw.searchScore : null
  };
}

function sameStory(left, right) {
  return left.url === right.url
    || left.titleFingerprint === right.titleFingerprint
    || titleSimilarity(left.title, right.title) >= 0.72;
}

function clusterStories(rows) {
  const clusters = [];
  for (const row of rows) {
    const match = clusters.find((cluster) => cluster.topic === row.topic && cluster.rows.some((item) => sameStory(item, row)));
    if (match) match.rows.push(row);
    else clusters.push({ topic: row.topic, rows: [row] });
  }
  return clusters;
}

function preferredClusterRow(rows) {
  return [...rows].sort((left, right) => {
    const officialDelta = Number(isOfficialDomain(right.domain)) - Number(isOfficialDomain(left.domain));
    if (officialDelta !== 0) return officialDelta;
    const dateDelta = String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
    if (dateDelta !== 0) return dateDelta;
    return Number(right.searchScore || 0) - Number(left.searchScore || 0);
  })[0];
}

function stableStoryId(topic, title, url) {
  const digest = createHash('sha256').update(`${topic}\n${title}\n${url}`).digest('hex').slice(0, 14);
  return `news:${topic}:${digest}`;
}

function storyFromCluster(cluster) {
  const preferred = preferredClusterRow(cluster.rows);
  const providers = [...new Set(cluster.rows.map((row) => row.provider))].sort();
  const supportingDomains = [...new Set(cluster.rows.map((row) => row.domain))].sort();
  const official = cluster.rows.some((row) => isOfficialDomain(row.domain));
  const evidenceStatus = official ? 'official' : supportingDomains.length >= 2 ? 'cross_checked' : 'discovery_only';
  return {
    id: stableStoryId(cluster.topic, preferred.title, preferred.url),
    topic: cluster.topic,
    title: preferred.title,
    url: preferred.url,
    domain: preferred.domain,
    publishedAt: preferred.publishedAt,
    snippet: preferred.snippet,
    providers,
    supportingDomains,
    evidenceStatus
  };
}

export function buildNewsDiscovery({ rawStories, sourceStatus, generatedAt, windowStart, windowEnd }) {
  const normalized = (Array.isArray(rawStories) ? rawStories : [])
    .map(normalizeProviderStory)
    .filter(Boolean);
  const stories = clusterStories(normalized)
    .map(storyFromCluster)
    .sort((left, right) => {
      const statusRank = { official: 0, cross_checked: 1, discovery_only: 2 };
      return statusRank[left.evidenceStatus] - statusRank[right.evidenceStatus]
        || String(right.publishedAt || '').localeCompare(String(left.publishedAt || ''));
    })
    .filter((story, index, all) => all.slice(0, index).filter((item) => item.topic === story.topic).length < 5)
    .slice(0, 30);

  const statuses = sourceStatus || {};
  const liveProviderCount = ['tavily', 'brave'].filter((provider) => ['ok', 'partial'].includes(statuses[provider]?.status)).length;
  const fullProviderCount = ['tavily', 'brave'].filter((provider) => statuses[provider]?.status === 'ok').length;
  const usableCount = stories.filter((story) => story.evidenceStatus !== 'discovery_only').length;
  const status = fullProviderCount === 2 && usableCount >= 2
    ? 'ok'
    : liveProviderCount > 0 && usableCount > 0
      ? 'partial'
      : 'insufficient';
  const dataGaps = [];
  if (liveProviderCount < 2) dataGaps.push('新闻发现未获得 Tavily 与 Brave 两个索引的完整成功响应。');
  if (usableCount === 0) dataGaps.push('本周期未形成 official 或 cross_checked 新闻证据。');
  if (usableCount === 1) dataGaps.push('本周期仅形成 1 条 official/cross_checked 新闻证据；其余事实性段落必须同时引用站内结构化指标并披露新闻覆盖限制。');
  if (stories.some((story) => story.evidenceStatus === 'discovery_only')) dataGaps.push('部分搜索结果仅为 discovery_only，不得单独支撑事实性判断。');

  return {
    schemaVersion: NEWS_DISCOVERY_SCHEMA,
    generatedAt,
    status,
    windowStart,
    windowEnd,
    topicsQueried: EDITORIAL_TOPICS.length,
    liveProviderCount,
    sourceStatus: statuses,
    topics: EDITORIAL_TOPICS.map((topic) => ({
      id: topic,
      query: WEEKLY_EDITORIAL_QUERIES[topic],
      storyCount: stories.filter((story) => story.topic === topic).length
    })),
    stories,
    dataGaps,
    boundaries: {
      transientArtifactOnly: true,
      containsRawProviderResponse: false,
      containsHeaders: false,
      containsApiKeys: false,
      containsFullArticleBody: false,
      affectsBubbleWatchScoring: false,
      affectsGfrrScoring: false
    }
  };
}

export function rawStoriesFromFixture(fixture) {
  const rows = [];
  for (const provider of ['tavily', 'brave']) {
    for (const result of Array.isArray(fixture?.providers?.[provider]) ? fixture.providers[provider] : []) {
      rows.push({ ...result, provider });
    }
  }
  return rows;
}
