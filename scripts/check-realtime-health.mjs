import fs from 'node:fs';

const DEFAULT_REALTIME_HEALTH_URL =
  'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';

const FRESHNESS_ACTIONS = {
  fresh: 'No action needed.',
  aging: 'Monitor. Realtime is aging but still within acceptable window.',
  stale: 'Check Build Realtime Market workflow runs and realtime-data branch update status.',
  unavailable: 'Check remote realtime file availability, workflow failures, permissions, or JSON structure.'
};

function parseMode(argv) {
  return {
    soft: argv.includes('--soft'),
    failOnStale: argv.includes('--fail-on-stale'),
    githubOutput: argv.includes('--github-output')
  };
}

function buildCacheBustedUrl(rawUrl, nowMs) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`Realtime health URL must use HTTPS: ${rawUrl}`);
  }

  url.searchParams.set('t', String(nowMs));
  return url.toString();
}

function extractUpdatedAt(data) {
  return data?.updatedAt || data?.meta?.updatedAt || data?.generatedAt || data?.timestamp || null;
}

function classifyFreshness(ageMinutes) {
  if (!Number.isFinite(ageMinutes)) return 'unavailable';
  if (ageMinutes <= 30) return 'fresh';
  if (ageMinutes <= 90) return 'aging';
  if (ageMinutes <= 360) return 'stale';
  return 'unavailable';
}

function resultForFreshness(freshness) {
  if (freshness === 'fresh' || freshness === 'aging') return 'OK';
  if (freshness === 'stale') return 'STALE';
  return 'UNAVAILABLE';
}

function unavailableReport(url, fetchedAt, reason) {
  return {
    source: 'remote',
    url,
    fetchedAt,
    updatedAt: '--',
    ageMinutes: '--',
    freshness: 'unavailable',
    result: resultForFreshness('unavailable'),
    suggestedAction: FRESHNESS_ACTIONS.unavailable,
    reason
  };
}

function printReport(report) {
  const orderedKeys = [
    'source',
    'url',
    'fetchedAt',
    'updatedAt',
    'ageMinutes',
    'freshness',
    'result',
    'suggestedAction'
  ];

  for (const key of orderedKeys) {
    console.log(`[realtime-health] ${key}: ${report[key]}`);
  }

  if (report.reason) {
    console.log(`[realtime-health] reason: ${report.reason}`);
  }
}

function shouldRecover(report) {
  return report.freshness === 'stale' || report.freshness === 'unavailable';
}

function writeGithubOutput(report, mode) {
  if (!mode.githubOutput || !process.env.GITHUB_OUTPUT) return;

  const output = {
    updatedAt: report.updatedAt,
    ageMinutes: report.ageMinutes,
    freshness: report.freshness,
    result: report.result,
    shouldRecover: shouldRecover(report) ? 'true' : 'false'
  };

  const lines = Object.entries(output)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('\n');

  try {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  } catch (error) {
    console.warn(`[realtime-health] failed to write GitHub output: ${error.message}`);
  }
}

async function checkRealtimeHealth() {
  const nowMs = Date.now();
  const fetchedAt = new Date(nowMs).toISOString();
  const sourceUrl = process.env.GFRR_REALTIME_HEALTH_URL || DEFAULT_REALTIME_HEALTH_URL;
  const url = buildCacheBustedUrl(sourceUrl, nowMs);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json'
      }
    });
  } catch (error) {
    return unavailableReport(url, fetchedAt, `fetch failed: ${error.message}`);
  }

  if (!response.ok) {
    return unavailableReport(url, fetchedAt, `fetch returned HTTP ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    return unavailableReport(url, fetchedAt, `JSON parse failed: ${error.message}`);
  }

  const updatedAt = extractUpdatedAt(data);
  const updatedAtMs = Date.parse(updatedAt);
  if (!updatedAt || Number.isNaN(updatedAtMs)) {
    return unavailableReport(url, fetchedAt, 'updatedAt is missing or invalid');
  }

  const ageMinutes = Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000));
  const freshness = classifyFreshness(ageMinutes);

  return {
    source: 'remote',
    url,
    fetchedAt,
    updatedAt,
    ageMinutes,
    freshness,
    result: resultForFreshness(freshness),
    suggestedAction: FRESHNESS_ACTIONS[freshness]
  };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const report = await checkRealtimeHealth();
  printReport(report);
  writeGithubOutput(report, mode);

  if (mode.failOnStale && ['stale', 'unavailable'].includes(report.freshness)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const mode = parseMode(process.argv.slice(2));
  const fetchedAt = new Date().toISOString();
  const sourceUrl = process.env.GFRR_REALTIME_HEALTH_URL || DEFAULT_REALTIME_HEALTH_URL;
  const report = unavailableReport(sourceUrl, fetchedAt, error.message);
  printReport(report);
  writeGithubOutput(report, mode);

  if (!mode.soft) {
    process.exitCode = 1;
  }
});
