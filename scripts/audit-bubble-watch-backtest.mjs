#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/bubble-watch-backtest/bubble-watch-backtest-latest.json';
const ROOT = process.cwd();
const EXPECTED_IDS = [
  'cape', 'top5_weight', 'nvda_fpe',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const CATEGORY_ORDER = ['valuation', 'capital', 'market_structure', 'credit', 'fundamentals', 'macro'];
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_RANK = { observation: 0, caution: 1, alert: 2, top: 3 };

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function resolveOutputPath(outputPath) {
  const allowedRoot = path.resolve(ROOT, 'manual-artifacts', 'bubble-watch-backtest');
  const resolved = path.resolve(ROOT, outputPath);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Bubble Watch audit output must stay under manual-artifacts/bubble-watch-backtest.');
  }
  return resolved;
}

function tierFromPct(pct) {
  if (pct >= 60) return 'top';
  if (pct >= 40) return 'alert';
  if (pct >= 25) return 'caution';
  return 'observation';
}

function roundPct(value) {
  return Number(value.toFixed(1));
}

function replayStatuses(statuses, categoryById) {
  const statusById = new Map(Object.entries(statuses || {}));
  const missing = EXPECTED_IDS.filter((id) => !['red', 'yellow', 'green'].includes(statusById.get(id)));
  if (missing.length) {
    return {
      replayable: false,
      missing,
      total: EXPECTED_IDS.length
    };
  }
  const red = EXPECTED_IDS.filter((id) => statusById.get(id) === 'red').length;
  const yellow = EXPECTED_IDS.filter((id) => statusById.get(id) === 'yellow').length;
  const green = EXPECTED_IDS.length - red - yellow;
  const redPct = roundPct((red / EXPECTED_IDS.length) * 100);
  const weightedAux = roundPct(((red + 0.5 * yellow) / EXPECTED_IDS.length) * 100);
  const baseTier = tierFromPct(redPct);
  const resonantCategories = CATEGORY_ORDER
    .map((category) => {
      const ids = EXPECTED_IDS.filter((id) => categoryById.get(id) === category);
      const redInCategory = ids.filter((id) => statusById.get(id) === 'red').length;
      return {
        key: category,
        red: redInCategory,
        total: ids.length,
        ratio: ids.length ? redInCategory / ids.length : 0
      };
    })
    .filter((category) => category.ratio >= 0.5);
  let effectiveTier = baseTier;
  if (resonantCategories.length >= 2 && TIER_RANK[effectiveTier] < TIER_RANK.alert) effectiveTier = 'alert';
  return {
    replayable: true,
    total: EXPECTED_IDS.length,
    red,
    yellow,
    green,
    primaryScorePct: redPct,
    redPct,
    weightedAux,
    baseTier,
    effectiveTier,
    overrideActive: effectiveTier !== baseTier,
    resonantCategories: resonantCategories.map(({ key, red: r, total }) => ({ key, red: r, total }))
  };
}

function makeAll(status = 'green') {
  return Object.fromEntries(EXPECTED_IDS.map((id) => [id, status]));
}

function withStatuses(base, entries) {
  const out = { ...base };
  for (const [id, status] of entries) out[id] = status;
  return out;
}

function buildScenarioInputs() {
  const allGreen = makeAll('green');
  const manyYellowNoRed = withStatuses(allGreen, EXPECTED_IDS.slice(0, 16).map((id) => [id, 'yellow']));
  const dualResonanceLowRed = withStatuses(allGreen, [
    ['cape', 'red'],
    ['top5_weight', 'red'],
    ['vc_ai_share', 'red'],
    ['nvda_invest_revenue', 'red']
  ]);
  const singleResonanceLowRed = withStatuses(allGreen, [
    ['cape', 'red'],
    ['top5_weight', 'red']
  ]);
  const cautionByRedPct = withStatuses(allGreen, [
    ['cape', 'red'],
    ['hyperscaler_capex_yoy', 'red'],
    ['breadth_50d', 'red'],
    ['hy_oas', 'red'],
    ['token_volume_mom', 'red'],
    ['accounting_events', 'red']
  ]);
  const alertByRedPct = withStatuses(allGreen, EXPECTED_IDS.slice(0, 10).map((id) => [id, 'red']));
  const topByRedPct = withStatuses(allGreen, EXPECTED_IDS.slice(0, 15).map((id) => [id, 'red']));
  return [
    {
      key: 'all_green_floor',
      statuses: allGreen,
      expected: { primaryScorePct: 0, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'many_yellow_no_red_weighted_aux_does_not_drive_tier',
      statuses: manyYellowNoRed,
      expected: { primaryScorePct: 0, weightedAux: 33.3, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'single_resonance_low_redpct_no_override',
      statuses: singleResonanceLowRed,
      expected: { primaryScorePct: 8.3, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'dual_resonance_low_redpct_forces_alert',
      statuses: dualResonanceLowRed,
      expected: { primaryScorePct: 16.7, effectiveTier: 'alert', overrideActive: true }
    },
    {
      key: 'caution_by_redpct_without_resonance',
      statuses: cautionByRedPct,
      expected: { primaryScorePct: 25, effectiveTier: 'caution', overrideActive: false }
    },
    {
      key: 'alert_by_redpct',
      statuses: alertByRedPct,
      expected: { primaryScorePct: 41.7, effectiveTier: 'alert' }
    },
    {
      key: 'systemic_top_by_redpct',
      statuses: topByRedPct,
      expected: { primaryScorePct: 62.5, effectiveTier: 'top' }
    }
  ];
}

function compareExpected(actual, expected) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const actualValue = actual?.[key];
    if (typeof expectedValue === 'number') {
      if (Math.abs(Number(actualValue) - expectedValue) > 0.06) mismatches.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
    } else if (actualValue !== expectedValue) {
      mismatches.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
    }
  }
  return mismatches;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = resolveOutputPath(options.output);
  const latest = readJson('data/bubble-watch.json');
  const history = readJson('data/bubble-watch-history.json');
  const pageHtml = fs.readFileSync(path.join(ROOT, 'bubble-watch.html'), 'utf8');
  const categoryById = new Map((latest.indicators || []).map((indicator) => [indicator.id, indicator.category]));
  const currentStatuses = Object.fromEntries((latest.indicators || []).map((indicator) => [indicator.id, indicator.status]));
  const currentReplay = replayStatuses(currentStatuses, categoryById);
  const summary = latest.summary || {};
  const currentMismatches = [
    ...compareExpected(currentReplay, {
      primaryScorePct: summary.primary_score_pct,
      redPct: summary.red_pct,
      weightedAux: summary.weighted_risk_score,
      effectiveTier: latest.scoring?.effective_tier,
      overrideActive: latest.scoring?.override_active
    }),
    summary.primary_score_basis === 'red_light_ratio' ? null : `primary_score_basis: expected red_light_ratio, got ${summary.primary_score_basis}`,
    summary.primary_score_pct === summary.red_pct ? null : `primary_score_pct ${summary.primary_score_pct} != red_pct ${summary.red_pct}`,
    String(summary.verdict_desc || '').includes('加权风险分') ? 'verdict_desc still contains 加权风险分' : null,
    pageHtml.includes('WEIGHTED RISK SCORE') ? 'page still contains WEIGHTED RISK SCORE' : null
  ].filter(Boolean);

  const historyEntries = Array.isArray(history.entries) ? history.entries : [];
  const historyReplay = historyEntries.map((entry) => {
    const replay = replayStatuses(entry.statuses, categoryById);
    return {
      week: entry.week,
      date: entry.date,
      replayable: replay.replayable,
      stored: {
        red_pct: entry.red_pct,
        risk_score: entry.risk_score,
        statusCount: entry.statuses ? Object.keys(entry.statuses).length : 0
      },
      replay,
      mismatches: replay.replayable
        ? compareExpected(replay, { redPct: entry.red_pct, weightedAux: entry.risk_score })
        : []
    };
  });

  const scenarios = buildScenarioInputs().map((scenario) => {
    const replay = replayStatuses(scenario.statuses, categoryById);
    return {
      key: scenario.key,
      expected: scenario.expected,
      replay,
      pass: replay.replayable && compareExpected(replay, scenario.expected).length === 0,
      mismatches: replay.replayable ? compareExpected(replay, scenario.expected) : ['scenario not replayable']
    };
  });

  const failures = [
    ...currentMismatches.map((message) => ({ group: 'current', message })),
    ...historyReplay.flatMap((entry) => entry.mismatches.map((message) => ({ group: 'history', message: `${entry.week}: ${message}` }))),
    ...scenarios.flatMap((scenario) => scenario.mismatches.map((message) => ({ group: 'scenario', message: `${scenario.key}: ${message}` })))
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    verdict: failures.length ? 'needs_review' : 'pass_with_limitations',
    limitations: [
      'Only recent Bubble Watch entries contain full per-indicator statuses; older seed history can validate plotted red_pct/weighted values but not replay every status.',
      'AI-specific indicators do not have a 20-year homogeneous history; scenario replay is used to stress the scoring contract around thresholds and override behavior.',
      'Wind cross-checks are run outside this script when exact proprietary or MCP natural-language mappings are needed.'
    ],
    current: {
      as_of_date: latest.as_of_date,
      issue_number: latest.issue_number,
      summary,
      replay: currentReplay,
      mismatches: currentMismatches
    },
    history: {
      entries: historyEntries.length,
      replayableEntries: historyReplay.filter((entry) => entry.replayable).length,
      fullCurrentContractEntries: historyReplay.filter((entry) => entry.replayable && entry.stored.statusCount === EXPECTED_IDS.length).length,
      legacyEntriesWithoutStatuses: historyReplay.filter((entry) => !entry.replayable).length,
      rows: historyReplay
    },
    scenarios,
    failures
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[bubble-watch-backtest] verdict=${report.verdict}`);
  console.log(`[bubble-watch-backtest] current primary=${summary.primary_score_pct}% weighted_aux=${summary.weighted_risk_score}% verdict=${summary.verdict_label}`);
  console.log(`[bubble-watch-backtest] history entries=${report.history.entries}, replayable=${report.history.replayableEntries}, legacy=${report.history.legacyEntriesWithoutStatuses}`);
  for (const scenario of scenarios) {
    console.log(`[bubble-watch-backtest] scenario ${scenario.key}: pass=${scenario.pass}, primary=${scenario.replay.primaryScorePct}, weighted_aux=${scenario.replay.weightedAux}, effective=${TIER_LABEL_ZH[scenario.replay.effectiveTier]}`);
  }
  console.log(`[bubble-watch-backtest] wrote ${path.relative(ROOT, outputPath)}`);
  if (failures.length) process.exit(1);
}

main();
