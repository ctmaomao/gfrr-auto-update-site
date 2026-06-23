// audit-bubble-watch-sources.mjs — read-only Bubble Watch source-health audit
//
// Runs the normal Bubble Watch builder, inspects the generated provenance, then
// restores production files byte-for-byte. Scheduled audits default to free
// sources only and explicitly disable Wind to avoid paid usage.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_FILES = [
  'data/bubble-watch.json',
  'data/bubble-watch-history.json',
  'data/gdelt-bubble-watch-cache.json',
  'config/bubble-watch-curated.json'
];
const REPORT_PATH = path.join(ROOT, 'manual-artifacts', 'bubble-watch-source-health-latest.json');
const BUILD_LOG_PATH = path.join(ROOT, 'manual-artifacts', 'bubble-watch-source-health-build.log');
const CHECK_LOG_PATH = path.join(ROOT, 'manual-artifacts', 'bubble-watch-source-health-check.log');

const args = new Set(process.argv.slice(2));
const allowPaidWind = args.has('--allow-paid-wind');
const githubSummary = args.has('--github-summary');
const EXPECTED_PAID_FALLBACK_IDS = [
  'dc_abs_spread',
  'ai_ipo_pipeline',
  'accounting_events',
  'token_revenue_ratio',
  'enterprise_deploy',
  'capex_reaction',
  'ceo_hedging'
];

function relPath(p) {
  return path.join(ROOT, p);
}

function readSnapshot() {
  return new Map(SNAPSHOT_FILES.map((file) => [file, fs.readFileSync(relPath(file))]));
}

function restoreSnapshot(snapshot) {
  for (const [file, bytes] of snapshot.entries()) {
    fs.writeFileSync(relPath(file), bytes);
  }
}

function runNodeScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve({ code, stdout, stderr, text: `${stdout}${stderr}` }));
  });
}

function indicatorLabel(row) {
  return `${row.id}(${row.name_zh || row.name_en || 'n/a'})`;
}

function isExpectedPaidSkip(row) {
  return !allowPaidWind &&
    EXPECTED_PAID_FALLBACK_IDS.includes(row.id) &&
    row.provenance?.mode === 'auto_fallback' &&
    /WIND_API_KEY|Wind/i.test(String(row.provenance?.reason || ''));
}

function sourceWarningLines(text) {
  return String(text || '')
    .split(/\r?\n/u)
    .filter((line) => /EDGAR .*403|改走|attempt \d+\/\d+ failed|失败,改走|样本不足/u.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildReport(data, buildResult, checkResult) {
  const indicators = Array.isArray(data.indicators) ? data.indicators : [];
  const rows = indicators.map((row) => ({
    id: row.id,
    name_zh: row.name_zh,
    status: row.status,
    value_display: row.value_display,
    source_name: row.source_name,
    stale: row.stale === true,
    provenance_mode: row.provenance?.mode || null,
    provenance_reason: row.provenance?.reason || null,
    source_tag: row.provenance?.detail?.sourceTag || row.provenance?.detail?.source || null
  }));
  const fallbackRows = indicators.filter((row) => row.provenance?.mode !== 'auto' || row.stale === true);
  const expectedPaidSkips = fallbackRows.filter(isExpectedPaidSkip);
  const unexpectedFallbackRows = fallbackRows.filter((row) => !isExpectedPaidSkip(row));
  const fetchFailures = Array.isArray(data.meta?.fetch_failures) ? data.meta.fetch_failures : [];
  const unexpectedFetchFailures = fetchFailures.filter((failure) => {
    return !expectedPaidSkips.some((row) => row.id === failure.id);
  });
  const windRows = rows.filter((row) => /Wind/i.test(`${row.source_name || ''} ${row.source_tag || ''}`));
  const warnings = sourceWarningLines(buildResult.text);
  const hardFail = buildResult.code !== 0 ||
    checkResult.code !== 0 ||
    unexpectedFallbackRows.length > 0 ||
    unexpectedFetchFailures.length > 0;
  const status = hardFail ? 'fail' : (expectedPaidSkips.length || warnings.length ? 'warn' : 'pass');

  return {
    contractVersion: 'bubble-watch-source-health-audit-v1',
    generatedAt: new Date().toISOString(),
    status,
    mode: allowPaidWind ? 'paid_wind_opt_in' : 'free_sources_only',
    policy: {
      readOnly: true,
      productionFilesRestored: true,
      windDisabledByDefault: !allowPaidWind,
      paidFallbackSkipAllowed: !allowPaidWind ? EXPECTED_PAID_FALLBACK_IDS : []
    },
    buildExitCode: buildResult.code,
    checkExitCode: checkResult.code,
    asOfDate: data.as_of_date || null,
    issueNumber: data.issue_number || null,
    verdict: data.summary?.verdict_label || null,
    meta: {
      autoCount: data.meta?.auto_count,
      curatedCount: data.meta?.curated_count,
      fallbackCount: data.meta?.fallback_count,
      hybridCount: data.meta?.hybrid_count,
      fredKeyPresent: data.meta?.fred_key_present,
      windKeyPresent: data.meta?.wind_key_present,
      upstreamSync: data.meta?.upstream_sync || null
    },
    expectedPaidSkips: expectedPaidSkips.map((row) => ({
      id: row.id,
      reason: row.provenance?.reason || null,
      status: row.status,
      value_display: row.value_display
    })),
    unexpectedFallbackRows: unexpectedFallbackRows.map((row) => ({
      id: row.id,
      label: indicatorLabel(row),
      mode: row.provenance?.mode || null,
      stale: row.stale === true,
      reason: row.provenance?.reason || null
    })),
    fetchFailures,
    unexpectedFetchFailures,
    windRows,
    sourceWarnings: warnings,
    rows
  };
}

function markdownReport(report) {
  const lines = [
    '## Bubble Watch Source Health Audit',
    '',
    `Status: **${report.status.toUpperCase()}**`,
    `Mode: \`${report.mode}\``,
    `As-of date: \`${report.asOfDate || 'n/a'}\``,
    `Issue: \`${report.issueNumber || 'n/a'}\``,
    `Counts: auto=${report.meta.autoCount}, curated=${report.meta.curatedCount}, fallback=${report.meta.fallbackCount}, hybrid=${report.meta.hybridCount}`,
    `Wind key visible to builder: \`${report.meta.windKeyPresent ? 'yes' : 'no'}\``,
    ''
  ];
  if (report.expectedPaidSkips.length) {
    lines.push('Expected paid-fallback skips:');
    for (const row of report.expectedPaidSkips) lines.push(`- \`${row.id}\`: ${row.reason}`);
    lines.push('');
  }
  if (report.unexpectedFallbackRows.length) {
    lines.push('Unexpected fallback/stale rows:');
    for (const row of report.unexpectedFallbackRows) lines.push(`- \`${row.id}\`: ${row.reason || row.mode}`);
    lines.push('');
  }
  if (report.unexpectedFetchFailures.length) {
    lines.push('Unexpected fetch failures:');
    for (const failure of report.unexpectedFetchFailures) lines.push(`- \`${failure.id}\`: ${failure.reason}`);
    lines.push('');
  }
  if (report.sourceWarnings.length) {
    lines.push('Source-level warnings that were recovered by fallback/retry:');
    for (const warning of report.sourceWarnings.slice(0, 12)) lines.push(`- ${warning}`);
    if (report.sourceWarnings.length > 12) lines.push(`- ... ${report.sourceWarnings.length - 12} more`);
    lines.push('');
  }
  lines.push('Production files were restored after the audit; this workflow does not commit or deploy.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const snapshot = readSnapshot();
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const env = { ...process.env };
  if (!allowPaidWind) {
    delete env.WIND_API_KEY;
    env.BUBBLE_WATCH_DISABLE_WIND = '1';
  }

  let buildResult = null;
  let checkResult = null;
  let report = null;
  try {
    buildResult = await runNodeScript('scripts/build-bubble-watch.mjs', env);
    fs.writeFileSync(BUILD_LOG_PATH, buildResult.text);
    if (buildResult.code !== 0) {
      report = {
        contractVersion: 'bubble-watch-source-health-audit-v1',
        generatedAt: new Date().toISOString(),
        status: 'fail',
        mode: allowPaidWind ? 'paid_wind_opt_in' : 'free_sources_only',
        buildExitCode: buildResult.code,
        checkExitCode: null,
        fatal: 'build-bubble-watch failed',
        sourceWarnings: sourceWarningLines(buildResult.text)
      };
    } else {
      checkResult = await runNodeScript('scripts/check-bubble-watch.mjs', env);
      fs.writeFileSync(CHECK_LOG_PATH, checkResult.text);
      const data = JSON.parse(fs.readFileSync(relPath('data/bubble-watch.json'), 'utf8'));
      report = buildReport(data, buildResult, checkResult);
    }
  } finally {
    restoreSnapshot(snapshot);
    if (report) {
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
      const md = markdownReport(report);
      process.stdout.write(`\n${md}`);
      if (githubSummary && process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
      }
    }
  }

  if (!report || report.status === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[bubble-watch-source-audit] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
