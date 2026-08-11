import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, writeJson } from '../lib/check-script-helpers.mjs';
import { EDITORIAL_TOPICS } from './weekly-editorial-contract.mjs';
import {
  buildNewsDiscovery,
  rawStoriesFromFixture,
  WEEKLY_EDITORIAL_QUERIES
} from './weekly-editorial-news.mjs';

const DEFAULT_OUTPUT = 'manual-artifacts/bubble-watch-weekly-editorial/news-discovery-latest.json';
const ARTIFACT_PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';
const USER_AGENT = 'gfrr-bubble-watch-weekly-editorial/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 5;

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, fixture: null, allowNetwork: false, asOfDate: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--output') options.output = readValue();
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg === '--fixture') options.fixture = readValue();
    else if (arg.startsWith('--fixture=')) options.fixture = arg.slice('--fixture='.length);
    else if (arg === '--as-of') options.asOfDate = readValue();
    else if (arg.startsWith('--as-of=')) options.asOfDate = arg.slice('--as-of='.length);
    else if (arg === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unsupported argument: ${arg}`);
  }
  if (options.fixture && options.allowNetwork) throw new Error('--fixture cannot be combined with --allow-network');
  return options;
}

function readSecretList(names) {
  const values = [];
  for (const name of names) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) continue;
    values.push(...raw.split(/[\n,;]+/u).map((value) => value.trim()).filter(Boolean));
  }
  return [...new Set(values)];
}

function resolveWindow(asOfDate) {
  const end = asOfDate ? new Date(`${asOfDate}T23:59:59.000Z`) : new Date();
  if (!Number.isFinite(end.getTime())) throw new Error('--as-of must be YYYY-MM-DD');
  const start = new Date(end.getTime() - 9 * 24 * 60 * 60 * 1000);
  return {
    windowStart: start.toISOString().slice(0, 10),
    windowEnd: end.toISOString().slice(0, 10)
  };
}

function safeError(error) {
  if (error?.name === 'AbortError') return 'request_timeout';
  const message = String(error?.message || 'request_failed');
  const http = message.match(/HTTP\s+(\d{3})/u);
  return http ? `http_${http[1]}` : 'request_failed';
}

function safeMainError(error) {
  const message = String(error?.message || '');
  if (/^(?:Refusing output outside|unsupported argument|missing value|--fixture cannot|--as-of must)/u.test(message)) return message;
  if (error?.code === 'ENOENT') return 'input_file_not_found';
  return safeError(error);
}

async function fetchJson(url, init, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithKeyRotation(keys, label, request) {
  let lastError = null;
  for (const [index, key] of keys.entries()) {
    try {
      return await request(key);
    } catch (error) {
      lastError = error;
      console.warn(`[bubble-watch-weekly-editorial] ${label} key ${index + 1}/${keys.length} failed: ${safeError(error)}`);
    }
  }
  throw lastError || new Error(`${label} unavailable`);
}

async function fetchTavily(topic, query, keys) {
  const json = await fetchWithKeyRotation(keys, 'Tavily', (key) => fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify({
      query,
      topic: 'news',
      search_depth: 'basic',
      max_results: MAX_RESULTS,
      time_range: 'week',
      include_answer: false,
      include_raw_content: false,
      include_usage: false
    })
  }, 'Tavily'));
  return (Array.isArray(json?.results) ? json.results : []).map((item) => ({
    provider: 'tavily',
    topic,
    title: item.title,
    url: item.url,
    publishedAt: item.published_date || item.publishedDate,
    snippet: item.content,
    searchScore: Number.isFinite(item.score) ? item.score : null
  }));
}

async function fetchBrave(topic, query, keys) {
  const params = new URLSearchParams({
    q: query,
    freshness: 'pw',
    count: String(MAX_RESULTS),
    country: 'US',
    search_lang: 'en',
    ui_lang: 'en-US',
    extra_snippets: 'true'
  });
  const json = await fetchWithKeyRotation(keys, 'Brave', (key) => fetchJson(`https://api.search.brave.com/res/v1/news/search?${params}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'User-Agent': USER_AGENT,
      'X-Subscription-Token': key
    }
  }, 'Brave'));
  return (Array.isArray(json?.results) ? json.results : []).map((item) => ({
    provider: 'brave',
    topic,
    title: item.title,
    url: item.url,
    publishedAt: item.page_age || item.age,
    snippet: [item.description, ...(Array.isArray(item.extra_snippets) ? item.extra_snippets : [])].filter(Boolean).join(' ')
  }));
}

async function collectProvider(provider, keys) {
  const rows = [];
  const queryRuns = [];
  if (keys.length === 0) {
    return {
      rows,
      status: { status: 'not_configured', successCount: 0, failureCount: EDITORIAL_TOPICS.length, queryRuns: [] }
    };
  }
  for (const topic of EDITORIAL_TOPICS) {
    try {
      const results = provider === 'tavily'
        ? await fetchTavily(topic, WEEKLY_EDITORIAL_QUERIES[topic], keys)
        : await fetchBrave(topic, WEEKLY_EDITORIAL_QUERIES[topic], keys);
      rows.push(...results);
      queryRuns.push({ topic, status: 'ok', resultCount: results.length });
    } catch (error) {
      queryRuns.push({ topic, status: 'error', resultCount: 0, error: safeError(error) });
    }
  }
  const successCount = queryRuns.filter((run) => run.status === 'ok').length;
  const failureCount = queryRuns.length - successCount;
  return {
    rows,
    status: {
      status: successCount === EDITORIAL_TOPICS.length ? 'ok' : successCount > 0 ? 'partial' : 'error',
      successCount,
      failureCount,
      queryRuns
    }
  };
}

async function collectLive() {
  const tavilyKeys = readSecretList(['TAVILY_API_KEYS', 'TAVILY_API_KEY']);
  const braveKeys = readSecretList(['BRAVE_API_KEYS', 'BRAVE_API_KEY']);
  const tavily = await collectProvider('tavily', tavilyKeys);
  const brave = await collectProvider('brave', braveKeys);
  return {
    rawStories: [...tavily.rows, ...brave.rows],
    sourceStatus: { tavily: tavily.status, brave: brave.status }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, ARTIFACT_PREFIX);
  const generatedAt = new Date().toISOString();
  const window = resolveWindow(options.asOfDate);
  let rawStories = [];
  let sourceStatus;

  if (options.fixture) {
    const fixture = JSON.parse(await fs.readFile(options.fixture, 'utf8'));
    rawStories = rawStoriesFromFixture(fixture);
    sourceStatus = {
      tavily: { status: 'ok', successCount: EDITORIAL_TOPICS.length, failureCount: 0, queryRuns: [] },
      brave: { status: 'ok', successCount: EDITORIAL_TOPICS.length, failureCount: 0, queryRuns: [] }
    };
  } else if (options.allowNetwork) {
    ({ rawStories, sourceStatus } = await collectLive());
  } else {
    sourceStatus = {
      tavily: { status: 'dry_run', successCount: 0, failureCount: 0, queryRuns: [] },
      brave: { status: 'dry_run', successCount: 0, failureCount: 0, queryRuns: [] }
    };
  }

  const discovery = buildNewsDiscovery({ rawStories, sourceStatus, generatedAt, ...window });
  writeJson(options.output, discovery);
  console.log(`Bubble Watch weekly news ${options.allowNetwork ? 'live' : options.fixture ? 'fixture' : 'dry-run'}: status=${discovery.status}, stories=${discovery.stories.length}, output=${options.output}`);
}

main().catch((error) => {
  console.error(`Bubble Watch weekly news collection failed: ${safeMainError(error)}`);
  process.exitCode = 1;
});
