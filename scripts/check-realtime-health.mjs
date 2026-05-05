import fs from 'node:fs';

const DEFAULT_REALTIME_HEALTH_URL =
  'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';
const SOFT_FAIL_NOTE =
  'Realtime-data health is fallback/Daily baseline observation; Worker-first runtime hard fail is handled by Check Worker Health.';
const WORKER_RUNTIME_NOTE =
  'This check does not represent the Worker-first runtime health. Worker-first runtime hard gate is handled by Check Worker Health.';

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

function actionForReport(report) {
  if (!shouldRecover(report)) return 'No action needed';
  return 'shouldRecover=true, check realtime-data workflow if persistent';
}

function interpretationForFreshness(freshness) {
  if (freshness === 'fresh' || freshness === 'aging') {
    return 'Fallback realtime-data is usable. No action needed.';
  }
  if (freshness === 'stale') {
    return 'Fallback realtime-data is stale. Worker-first runtime may still be healthy. Check Build Realtime Market only if this persists.';
  }
  return 'Fallback realtime-data is unavailable. This is not a Worker runtime failure, but should be reviewed if persistent.';
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
  console.log('Realtime-data Health');
  console.log('Role: soft observer for fallback / Daily baseline');
  console.log('[realtime-health] mode: soft-fail mode');
  console.log(`[realtime-health] result: ${report.result}`);
  console.log(`[realtime-health] action: ${actionForReport(report)}`);
  console.log(`[realtime-health] note: ${SOFT_FAIL_NOTE}`);
  console.log(`[realtime-health] runtime-note: ${WORKER_RUNTIME_NOTE}`);
  console.log(`[realtime-health] interpretation: ${interpretationForFreshness(report.freshness)}`);
  console.log('[realtime-health] strict-mode-note: --fail-on-stale is available for manual strict checks');

  const orderedKeys = [
    'source',
    'url',
    'fetchedAt',
    'updatedAt',
    'ageMinutes',
    'freshness',
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

function markdownValue(value) {
  if (value == null || value === '') return '--';
  return String(value).replace(/\r?\n/gu, ' ').replace(/\|/gu, '\\|');
}

function writeGithubSummary(report, mode) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const lines = [
    '## Realtime-data Health',
    '',
    'Role: **soft observer for fallback / Daily baseline**',
    '',
    `Mode: **${mode.failOnStale ? 'strict --fail-on-stale' : 'soft-fail mode'}**`,
    '',
    `Result: **${report.result}**`,
    '',
    `Action: **${actionForReport(report)}**`,
    '',
    SOFT_FAIL_NOTE,
    '',
    WORKER_RUNTIME_NOTE,
    '',
    '| Item | Value |',
    '|---|---|',
    `| updatedAt | ${markdownValue(report.updatedAt)} |`,
    `| ageMinutes | ${markdownValue(report.ageMinutes)} |`,
    `| freshness | ${markdownValue(report.freshness)} |`,
    `| result | ${markdownValue(report.result)} |`,
    `| shouldRecover | ${shouldRecover(report) ? 'true' : 'false'} |`,
    `| suggestedAction | ${markdownValue(report.suggestedAction)} |`,
    `| reason | ${markdownValue(report.reason)} |`,
    '',
    '### Interpretation',
    '',
    interpretationForFreshness(report.freshness),
    '',
  ];

  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  } catch (error) {
    console.warn(`[realtime-health] failed to write GitHub summary: ${error.message}`);
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
  writeGithubSummary(report, mode);

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
  writeGithubSummary(report, mode);

  if (!mode.soft) {
    process.exitCode = 1;
  }
});
