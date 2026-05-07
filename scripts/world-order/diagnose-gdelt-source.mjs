import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const TIMEOUT_MS = 10000;
const DELAY_MS = 2000;
const RATE_LIMIT_BACKOFF_MS = 4000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const configPath = path.join(root, 'config', 'world-order-rules.json');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function pickProductionQuery() {
  const rules = readJsonIfExists(configPath, {});
  const queries = Array.isArray(rules?.gdelt?.queries) ? rules.gdelt.queries : [];
  const selected = queries
    .filter((item) => typeof item?.query === 'string' && item.query.trim())
    .sort((a, b) => String(b.query).length - String(a.query).length)[0];
  return selected?.query || '(war OR conflict OR military OR strike) (Ukraine OR Russia OR Iran OR Taiwan)';
}

function buildUrl({ query, mode = 'ArtList', timespan = '24h', maxRecords = 10 }) {
  const params = new URLSearchParams({
    query,
    mode,
    format: 'json',
    timespan,
    maxrecords: String(maxRecords),
    sort: 'HybridRel'
  });
  return `${GDELT_DOC_API}?${params.toString()}`;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'gfrr-gdelt-diagnosis/1.0'
      }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      responseBytes: text.length
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseCount(text, mode) {
  try {
    const parsed = JSON.parse(text);
    if (mode === 'TimelineVolRaw') {
      return {
        articleCount: null,
        timelinePointCount: Array.isArray(parsed.timeline) ? parsed.timeline.length : 0
      };
    }
    return {
      articleCount: Array.isArray(parsed.articles) ? parsed.articles.length : 0,
      timelinePointCount: null
    };
  } catch (_error) {
    return { articleCount: null, timelinePointCount: null };
  }
}

async function runQuery(queryConfig) {
  const startedAt = new Date().toISOString();
  const url = buildUrl(queryConfig);
  const started = Date.now();
  let sawRateLimit = false;

  try {
    let response = await fetchWithTimeout(url, TIMEOUT_MS);
    if (response.status === 429) {
      sawRateLimit = true;
      await delay(RATE_LIMIT_BACKOFF_MS);
      response = await fetchWithTimeout(url, TIMEOUT_MS);
    }
    const durationMs = Date.now() - started;
    const counts = response.ok ? parseCount(response.text, queryConfig.mode) : { articleCount: null, timelinePointCount: null };
    return {
      label: queryConfig.label,
      redactedUrl: url.replace(/query=[^&]+/u, 'query=<encoded>'),
      mode: queryConfig.mode,
      timespan: queryConfig.timespan,
      startedAt,
      durationMs,
      httpStatus: response.status,
      ok: response.ok,
      rateLimited: sawRateLimit || response.status === 429,
      timeout: false,
      articleCount: counts.articleCount,
      timelinePointCount: counts.timelinePointCount,
      error: response.ok ? null : `HTTP ${response.status}`,
      responseBytes: response.responseBytes
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    const timeout = /abort|timeout|aborted/iu.test(message) || error?.name === 'AbortError';
    return {
      label: queryConfig.label,
      redactedUrl: url.replace(/query=[^&]+/u, 'query=<encoded>'),
      mode: queryConfig.mode,
      timespan: queryConfig.timespan,
      startedAt,
      durationMs,
      httpStatus: null,
      ok: false,
      rateLimited: false,
      timeout,
      articleCount: null,
      timelinePointCount: null,
      error: timeout ? 'timeout' : message,
      responseBytes: 0
    };
  }
}

function buildQueries() {
  return [
    {
      label: 'baseline-simple',
      query: 'conflict',
      mode: 'ArtList',
      timespan: '24h',
      maxRecords: 10
    },
    {
      label: 'sanctions-simple',
      query: 'sanctions',
      mode: 'ArtList',
      timespan: '24h',
      maxRecords: 10
    },
    {
      label: 'theater-composite-light',
      query: '(Ukraine OR Russia OR Iran OR Taiwan)',
      mode: 'ArtList',
      timespan: '24h',
      maxRecords: 10
    },
    {
      label: 'chokepoint-light',
      query: '("Red Sea" OR "South China Sea" OR Strait)',
      mode: 'ArtList',
      timespan: '24h',
      maxRecords: 10
    },
    {
      label: 'current-production-equivalent',
      query: pickProductionQuery(),
      mode: 'ArtList',
      timespan: '24h',
      maxRecords: 10
    }
  ];
}

function summarize(results) {
  const successCount = results.filter((item) => item.ok).length;
  const failureCount = results.length - successCount;
  const timeoutCount = results.filter((item) => item.timeout).length;
  const rateLimitedCount = results.filter((item) => item.rateLimited).length;
  const durations = results.map((item) => item.durationMs).filter(Number.isFinite);
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;
  const fastestMs = durations.length ? Math.min(...durations) : null;
  const slowestMs = durations.length ? Math.max(...durations) : null;
  const simpleResults = results.filter((item) => item.label !== 'current-production-equivalent');
  const productionResult = results.find((item) => item.label === 'current-production-equivalent');
  const systemErrors = results.filter((item) => !item.ok && !item.timeout && !item.rateLimited && item.httpStatus === null).length;

  let diagnosis = 'gdelt-currently-healthy';
  let recommendation = 'Current stale state may be intermittent; rerun build:world-order once.';
  if (systemErrors > 0 && successCount === 0) {
    diagnosis = 'local-runtime-network-error';
    recommendation = 'Check local network / GitHub runner network before changing source logic.';
  } else if (rateLimitedCount >= 2) {
    diagnosis = 'rate-limited';
    recommendation = 'Increase throttle, reduce query count, avoid repeated manual runs, consider daily refresh only.';
  } else if (simpleResults.some((item) => item.ok) && productionResult && !productionResult.ok) {
    diagnosis = 'production-query-too-heavy';
    recommendation = 'Reduce production query complexity, shorter timespan, split into lighter themes.';
  } else if (simpleResults.every((item) => item.timeout || !item.ok)) {
    diagnosis = 'network-or-gdelt-availability';
    recommendation = 'Keep stale cache fallback; avoid scheduled refresh until stability improves.';
  }

  return {
    successCount,
    failureCount,
    timeoutCount,
    rateLimitedCount,
    averageDurationMs,
    fastestMs,
    slowestMs,
    diagnosis,
    recommendation
  };
}

function printSummary(results, summary) {
  console.log('GDELT Diagnosis Summary');
  console.log(`successCount: ${summary.successCount}`);
  console.log(`failureCount: ${summary.failureCount}`);
  console.log(`timeoutCount: ${summary.timeoutCount}`);
  console.log(`rateLimitedCount: ${summary.rateLimitedCount}`);
  console.log(`averageDurationMs: ${summary.averageDurationMs}`);
  console.log(`fastestMs: ${summary.fastestMs}`);
  console.log(`slowestMs: ${summary.slowestMs}`);
  console.log(`diagnosis: ${summary.diagnosis}`);
  console.log(`recommendation: ${summary.recommendation}`);
  console.log('');
  console.log('Queries');
  for (const item of results) {
    console.log(`- ${item.label}: ok=${item.ok} status=${item.httpStatus ?? 'null'} timeout=${item.timeout} rateLimited=${item.rateLimited} durationMs=${item.durationMs} articles=${item.articleCount ?? 'null'} bytes=${item.responseBytes} error=${item.error ?? 'null'}`);
  }
}

async function main() {
  const queries = buildQueries().slice(0, 6);
  const results = [];
  for (const [index, query] of queries.entries()) {
    if (index > 0) await delay(DELAY_MS);
    results.push(await runQuery(query));
  }
  printSummary(results, summarize(results));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
