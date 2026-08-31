import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { EDITORIAL_TOPICS } from './editorial-contract.mjs';
import { EDITORIAL_QUERIES, buildNewsDiscovery } from './editorial-news.mjs';
import { classifySearchRequestError } from './search-request-policy.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';
const DEFAULT_OUTPUT = `${PREFIX}news-discovery-latest.json`;
const USER_AGENT = 'gfrr-macro-risk-editorial/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const TIMEOUT_MS = 20_000;
const MAX_RESULTS = 5;

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, allowNetwork: false, asOfDate: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const read = () => {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === '--output') options.output = read();
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg === '--as-of') options.asOfDate = read();
    else if (arg.startsWith('--as-of=')) options.asOfDate = arg.slice(8);
    else if (arg === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

function secretList(names) {
  return [...new Set(names.flatMap((name) => String(process.env[name] || '').split(/[\n,;]+/u)).map((value) => value.trim()).filter(Boolean))];
}

function dateWindow(asOfDate) {
  const end = asOfDate ? new Date(`${asOfDate}T23:59:59.000Z`) : new Date();
  if (!Number.isFinite(end.getTime())) throw new Error('--as-of must be YYYY-MM-DD');
  return { windowStart: new Date(end.getTime() - 7 * 86400000).toISOString().slice(0, 10), windowEnd: end.toISOString().slice(0, 10) };
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.httpStatus = response.status;
      throw error;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function withKeys(keys, request) {
  let lastError;
  for (const key of keys) {
    try { return await request(key); } catch (error) { lastError = error; }
  }
  throw lastError || new Error('provider_not_configured');
}

async function tavily(topic, query, keys) {
  const json = await withKeys(keys, (key) => fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ query, topic: 'news', search_depth: 'basic', max_results: MAX_RESULTS, time_range: 'week', include_answer: false, include_raw_content: false })
  }));
  return (json?.results || []).map((item) => ({ provider: 'tavily', topic, title: item.title, url: item.url, publishedAt: item.published_date, snippet: item.content, searchScore: item.score }));
}

async function brave(topic, query, keys) {
  const params = new URLSearchParams({ q: query, freshness: 'pw', count: String(MAX_RESULTS), country: 'US', search_lang: 'en', ui_lang: 'en-US', extra_snippets: 'true' });
  const json = await withKeys(keys, (key) => fetchJson(`https://api.search.brave.com/res/v1/news/search?${params}`, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT, 'X-Subscription-Token': key }
  }));
  return (json?.results || []).map((item) => ({ provider: 'brave', topic, title: item.title, url: item.url, publishedAt: item.page_age || item.age, snippet: [item.description, ...(item.extra_snippets || [])].filter(Boolean).join(' ') }));
}

async function collectProvider(provider, keys) {
  if (keys.length === 0) return { rows: [], status: { status: 'not_configured', successCount: 0, failureCount: EDITORIAL_TOPICS.length, queryRuns: [] } };
  const rows = [];
  const queryRuns = [];
  for (const topic of EDITORIAL_TOPICS) {
    try {
      const results = provider === 'tavily' ? await tavily(topic, EDITORIAL_QUERIES[topic], keys) : await brave(topic, EDITORIAL_QUERIES[topic], keys);
      rows.push(...results);
      queryRuns.push({ topic, status: 'ok', resultCount: results.length });
    } catch (error) {
      queryRuns.push({ topic, status: 'error', resultCount: 0, error: classifySearchRequestError(error) });
    }
  }
  const successCount = queryRuns.filter((run) => run.status === 'ok').length;
  return { rows, status: { status: successCount === EDITORIAL_TOPICS.length ? 'ok' : successCount > 0 ? 'partial' : 'error', successCount, failureCount: EDITORIAL_TOPICS.length - successCount, queryRuns } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, PREFIX);
  const window = dateWindow(options.asOfDate);
  let rawStories = [];
  let sourceStatus;
  if (options.allowNetwork) {
    const [tavilyResult, braveResult] = await Promise.all([
      collectProvider('tavily', secretList(['TAVILY_API_KEYS', 'TAVILY_API_KEY'])),
      collectProvider('brave', secretList(['BRAVE_API_KEYS', 'BRAVE_API_KEY']))
    ]);
    rawStories = [...tavilyResult.rows, ...braveResult.rows];
    sourceStatus = { tavily: tavilyResult.status, brave: braveResult.status };
  } else {
    sourceStatus = { tavily: { status: 'dry_run', successCount: 0, failureCount: 0, queryRuns: [] }, brave: { status: 'dry_run', successCount: 0, failureCount: 0, queryRuns: [] } };
  }
  const discovery = buildNewsDiscovery({ rawStories, sourceStatus, generatedAt: new Date().toISOString(), ...window });
  writeJson(options.output, discovery);
  console.log(`Macro risk editorial news ${options.allowNetwork ? 'live' : 'dry-run'}: status=${discovery.status}, stories=${discovery.stories.length}, output=${options.output}`);
}

main().catch((error) => {
  console.error(`Macro risk editorial news collection failed: ${error.message}`);
  process.exitCode = 1;
});
