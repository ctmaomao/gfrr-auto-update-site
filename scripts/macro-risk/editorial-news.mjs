import { createHash } from 'node:crypto';

import { EDITORIAL_TOPICS, NEWS_DISCOVERY_SCHEMA } from './editorial-contract.mjs';

export const EDITORIAL_QUERIES = Object.freeze({
  central_bank_inflation: '(Federal Reserve OR ECB OR central bank) inflation interest rates policy latest',
  energy_geopolitics: '(oil OR energy OR shipping) geopolitics supply disruption sanctions latest',
  credit_liquidity: '(credit markets OR bank funding OR liquidity OR high yield spreads) latest',
  growth_employment_consumer: '(growth OR employment OR consumer spending OR retail sales) economy latest',
  global_china_europe: '(China economy OR euro area economy OR global trade) latest data policy',
  market_volatility_valuation: '(VIX OR equity valuation OR market breadth OR bond yields) latest markets'
});

const OFFICIAL_DOMAIN_SUFFIXES = Object.freeze([
  // The .gov namespace is restricted to verified U.S. government organizations,
  // including federal, state, local, tribal, and territorial authorities.
  'gov',
  'federalreserve.gov',
  'ecb.europa.eu',
  'bls.gov',
  'bea.gov',
  'census.gov',
  'treasury.gov',
  'eia.gov',
  'imf.org',
  'worldbank.org',
  'oecd.org',
  'bis.org',
  'stats.gov.cn',
  'europa.eu',
  'bankofengland.co.uk',
  'boj.or.jp'
]);

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source']);

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
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/{2,}/gu, '/').replace(/\/$/u, '') || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    return null;
  }
}

function titleTokens(value) {
  return new Set(String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u).filter((token) => token.length >= 2));
}

function titleFingerprint(value) {
  return createHash('sha256').update([...titleTokens(value)].sort().join(' ')).digest('hex').slice(0, 16);
}

function titleSimilarity(left, right) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function parsePublishedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isOfficialDomain(domain) {
  return OFFICIAL_DOMAIN_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
}

export function assessEditorialNewsReadiness(discovery) {
  const stories = Array.isArray(discovery?.stories) ? discovery.stories : [];
  const officialCount = stories.filter((story) => story?.evidenceStatus === 'official').length;
  const crossCheckedCount = stories.filter((story) => story?.evidenceStatus === 'cross_checked').length;
  const credibleCount = officialCount + crossCheckedCount;
  const providers = ['tavily', 'brave'].map((provider) => discovery?.sourceStatus?.[provider] || {});
  const providerStatuses = providers.map((status) => status.status || 'missing');
  const searchProvidersHealthy = providers.every((status) => {
    const runs = Array.isArray(status.queryRuns) ? status.queryRuns : [];
    return status.status === 'ok'
      && status.successCount === EDITORIAL_TOPICS.length
      && status.failureCount === 0
      && runs.length === EDITORIAL_TOPICS.length
      && new Set(runs.map((run) => run?.topic)).size === EDITORIAL_TOPICS.length
      && runs.every((run) => EDITORIAL_TOPICS.includes(run?.topic) && run?.status === 'ok');
  });
  return {
    editorialReady: credibleCount > 0,
    expectedSkip: credibleCount === 0 && searchProvidersHealthy,
    reason: credibleCount > 0 ? null : searchProvidersHealthy ? 'no_credible_news' : 'news_source_health_incomplete',
    credibleCount,
    officialCount,
    crossCheckedCount,
    storyCount: stories.length,
    providerStatuses
  };
}

export function normalizeProviderStory(raw) {
  if (!raw || !EDITORIAL_TOPICS.includes(raw.topic) || !['tavily', 'brave'].includes(raw.provider)) return null;
  const url = canonicalizeNewsUrl(raw.url);
  const title = compactText(raw.title, 220);
  const domain = domainFromUrl(url);
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
  return left.url === right.url || left.titleFingerprint === right.titleFingerprint || titleSimilarity(left.title, right.title) >= 0.72;
}

function stableStoryId(topic, title, url) {
  return `news:${topic}:${createHash('sha256').update(`${topic}\n${title}\n${url}`).digest('hex').slice(0, 14)}`;
}

function storyFromCluster(cluster) {
  const preferred = [...cluster.rows].sort((left, right) => {
    const officialDelta = Number(isOfficialDomain(right.domain)) - Number(isOfficialDomain(left.domain));
    return officialDelta || String(right.publishedAt || '').localeCompare(String(left.publishedAt || '')) || Number(right.searchScore || 0) - Number(left.searchScore || 0);
  })[0];
  const providers = [...new Set(cluster.rows.map((row) => row.provider))].sort();
  const supportingDomains = [...new Set(cluster.rows.map((row) => row.domain))].sort();
  const evidenceStatus = cluster.rows.some((row) => isOfficialDomain(row.domain))
    ? 'official'
    : supportingDomains.length >= 2 ? 'cross_checked' : 'discovery_only';
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
  const rows = (Array.isArray(rawStories) ? rawStories : []).map(normalizeProviderStory).filter(Boolean);
  const clusters = [];
  for (const row of rows) {
    const match = clusters.find((cluster) => cluster.topic === row.topic && cluster.rows.some((item) => sameStory(item, row)));
    if (match) match.rows.push(row);
    else clusters.push({ topic: row.topic, rows: [row] });
  }
  const rank = { official: 0, cross_checked: 1, discovery_only: 2 };
  const stories = clusters.map(storyFromCluster)
    .sort((left, right) => rank[left.evidenceStatus] - rank[right.evidenceStatus] || String(right.publishedAt || '').localeCompare(String(left.publishedAt || '')))
    .filter((story, index, all) => all.slice(0, index).filter((item) => item.topic === story.topic).length < 5)
    .slice(0, 30);
  const statuses = sourceStatus || {};
  const liveProviderCount = ['tavily', 'brave'].filter((provider) => ['ok', 'partial'].includes(statuses[provider]?.status)).length;
  const fullProviderCount = ['tavily', 'brave'].filter((provider) => statuses[provider]?.status === 'ok').length;
  const { credibleCount } = assessEditorialNewsReadiness({ stories, sourceStatus: statuses });
  const status = fullProviderCount === 2 && credibleCount >= 2 ? 'ok' : liveProviderCount > 0 && credibleCount > 0 ? 'partial' : 'insufficient';
  const dataGaps = [];
  if (liveProviderCount < 2) dataGaps.push('近 7 日新闻发现未获得 Tavily 与 Brave 两个索引的完整成功响应。');
  if (credibleCount === 0) dataGaps.push('本周期未形成 official 或 cross_checked 新闻证据，不能生成新的外部 AI 判读。');
  if (credibleCount === 1) dataGaps.push('本周期仅形成 1 条 official/cross_checked 新闻证据，其余判断必须由站内结构化数据共同支撑。');
  if (stories.some((story) => story.evidenceStatus === 'discovery_only')) dataGaps.push('部分结果仅为 discovery_only，不得单独支撑事实性判断。');
  return {
    schemaVersion: NEWS_DISCOVERY_SCHEMA,
    generatedAt,
    status,
    windowStart,
    windowEnd,
    topicsQueried: EDITORIAL_TOPICS.length,
    liveProviderCount,
    sourceStatus: statuses,
    topics: EDITORIAL_TOPICS.map((topic) => ({ id: topic, query: EDITORIAL_QUERIES[topic], storyCount: stories.filter((story) => story.topic === topic).length })),
    stories,
    dataGaps,
    boundaries: {
      transientArtifactOnly: true,
      containsRawProviderResponse: false,
      containsHeaders: false,
      containsApiKeys: false,
      containsFullArticleBody: false,
      affectsGfrrScoring: false
    }
  };
}

export function rawStoriesFromFixture(fixture) {
  return ['tavily', 'brave'].flatMap((provider) => (Array.isArray(fixture?.providers?.[provider]) ? fixture.providers[provider] : []).map((item) => ({ ...item, provider })));
}
