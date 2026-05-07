const RELIEFWEB_REPORTS_API = 'https://api.reliefweb.int/v2/reports';
const TIMEOUT_MS = 10000;
const DELAY_MS = 1500;
const RETRY_BACKOFF_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl({ query, limit = 5 }) {
  const params = new URLSearchParams();
  params.set('appname', 'gfrr-world-order-probe');
  params.set('profile', 'list');
  params.set('preset', 'latest');
  params.set('query[value]', query);
  params.set('limit', String(limit));
  params.set('sort[]', 'date.created:desc');
  for (const field of ['title', 'date.created', 'country', 'source', 'theme', 'url']) {
    params.append('fields[include][]', field);
  }
  return `${RELIEFWEB_REPORTS_API}?${params.toString()}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'gfrr-reliefweb-diagnosis/1.0'
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

function uniqueNames(values, limit = 8) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.name || item.shortname || item.title || null;
      return null;
    })
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim()))].slice(0, limit);
}

function parseReliefWebPayload(text) {
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    return { contractChanged: true, totalCount: null, reports: [] };
  }
  const totalCount = Number.isFinite(Number(payload.totalCount)) ? Number(payload.totalCount) : payload.data.length;
  const reports = payload.data.map((entry) => entry?.fields || {}).filter((fields) => fields && typeof fields === 'object');
  return { contractChanged: false, totalCount, reports };
}

function extractReportHints(reports) {
  const titles = reports
    .map((report) => report.title)
    .filter((title) => typeof title === 'string' && title.trim())
    .slice(0, 3);
  return {
    reportTitles: titles,
    countries: uniqueNames(reports.flatMap((report) => report.country || [])),
    themes: uniqueNames(reports.flatMap((report) => report.theme || [])),
    sources: uniqueNames(reports.flatMap((report) => report.source || []))
  };
}

async function runProbe(probe) {
  const startedAt = new Date().toISOString();
  const url = buildUrl(probe);
  const started = Date.now();
  let sawRateLimit = false;

  try {
    let response = await fetchWithTimeout(url);
    if (response.status === 429) {
      sawRateLimit = true;
      await delay(RETRY_BACKOFF_MS);
      response = await fetchWithTimeout(url);
    }
    const durationMs = Date.now() - started;
    const base = {
      label: probe.label,
      redactedUrl: url.replace(/query%5Bvalue%5D=[^&]+/u, 'query%5Bvalue%5D=<encoded>'),
      startedAt,
      durationMs,
      httpStatus: response.status,
      ok: response.ok,
      timeout: false,
      rateLimited: sawRateLimit || response.status === 429,
      totalCount: null,
      count: 0,
      reportTitles: [],
      countries: [],
      themes: [],
      sources: [],
      error: response.ok ? null : `HTTP ${response.status}: ${response.text.slice(0, 120).replace(/\s+/gu, ' ')}`,
      responseBytes: response.responseBytes
    };
    if (!response.ok) return base;

    const parsed = parseReliefWebPayload(response.text);
    const hints = extractReportHints(parsed.reports);
    return {
      ...base,
      ok: !parsed.contractChanged,
      totalCount: parsed.totalCount,
      count: parsed.reports.length,
      ...hints,
      error: parsed.contractChanged ? 'response contract changed' : null
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    const timeout = /abort|timeout|aborted/iu.test(message) || error?.name === 'AbortError';
    return {
      label: probe.label,
      redactedUrl: url.replace(/query%5Bvalue%5D=[^&]+/u, 'query%5Bvalue%5D=<encoded>'),
      startedAt,
      durationMs,
      httpStatus: null,
      ok: false,
      timeout,
      rateLimited: false,
      totalCount: null,
      count: 0,
      reportTitles: [],
      countries: [],
      themes: [],
      sources: [],
      error: timeout ? 'timeout' : message,
      responseBytes: 0
    };
  }
}

function buildProbes() {
  return [
    { label: 'baseline-conflict', query: 'conflict', limit: 5 },
    { label: 'sanctions-humanitarian', query: 'sanctions humanitarian', limit: 5 },
    { label: 'red-sea-chokepoint', query: 'Red Sea', limit: 5 },
    { label: 'ukraine-russia', query: 'Ukraine Russia', limit: 5 }
  ];
}

function summarize(results) {
  const successCount = results.filter((item) => item.ok).length;
  const failureCount = results.length - successCount;
  const timeoutCount = results.filter((item) => item.timeout).length;
  const rateLimitedCount = results.filter((item) => item.rateLimited).length;
  const contractChangedCount = results.filter((item) => item.error === 'response contract changed').length;
  const totalReportsMatched = results.reduce((sum, item) => sum + (Number.isFinite(item.totalCount) ? item.totalCount : 0), 0);
  const durations = results.map((item) => item.durationMs).filter(Number.isFinite);
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;

  let diagnosis = 'reliefweb-currently-healthy';
  let recommendation = 'ReliefWeb is feasible as a future public fallback candidate, but keep it out of production scoring until a separate integration version.';
  if (rateLimitedCount >= 2) {
    diagnosis = 'reliefweb-rate-limited';
    recommendation = 'Keep manual probe only; avoid scheduled use.';
  } else if (timeoutCount >= Math.ceil(results.length / 2) || successCount === 0) {
    diagnosis = 'reliefweb-network-or-availability';
    recommendation = 'Do not integrate now; keep GDELT stale cache fallback and retry later.';
  } else if (contractChangedCount > 0) {
    diagnosis = 'reliefweb-api-contract-changed';
    recommendation = 'Review ReliefWeb API response shape before adapter work.';
  } else if (successCount >= 2 && totalReportsMatched <= 0) {
    diagnosis = 'reliefweb-query-too-narrow';
    recommendation = 'Broaden query terms and test country/theme filters before integration.';
  } else if (successCount > 0 && totalReportsMatched < successCount) {
    diagnosis = 'reliefweb-not-suitable-now';
    recommendation = 'ReliefWeb is reachable but current queries are not relevant enough for World Order conflict proxy.';
  }

  return {
    successCount,
    failureCount,
    timeoutCount,
    rateLimitedCount,
    averageDurationMs,
    totalReportsMatched,
    diagnosis,
    recommendation
  };
}

function printSummary(results, summary) {
  console.log('ReliefWeb Source Diagnosis Summary');
  console.log(`successCount: ${summary.successCount}`);
  console.log(`failureCount: ${summary.failureCount}`);
  console.log(`timeoutCount: ${summary.timeoutCount}`);
  console.log(`rateLimitedCount: ${summary.rateLimitedCount}`);
  console.log(`averageDurationMs: ${summary.averageDurationMs}`);
  console.log(`totalReportsMatched: ${summary.totalReportsMatched}`);
  console.log(`diagnosis: ${summary.diagnosis}`);
  console.log(`recommendation: ${summary.recommendation}`);
  console.log('');
  console.log('Queries');
  for (const item of results) {
    console.log(`- ${item.label}: ok=${item.ok} status=${item.httpStatus ?? 'null'} timeout=${item.timeout} rateLimited=${item.rateLimited} durationMs=${item.durationMs} totalCount=${item.totalCount ?? 'null'} count=${item.count} countries=${item.countries.join('|') || 'none'} themes=${item.themes.join('|') || 'none'} sources=${item.sources.join('|') || 'none'} error=${item.error ?? 'null'}`);
    for (const title of item.reportTitles) {
      console.log(`  title: ${title}`);
    }
  }
}

async function main() {
  const probes = buildProbes().slice(0, 5);
  const results = [];
  for (const [index, probe] of probes.entries()) {
    if (index > 0) await delay(DELAY_MS);
    results.push(await runProbe(probe));
  }
  printSummary(results, summarize(results));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
