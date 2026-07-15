#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/bubble-watch-backtest/bubble-watch-backtest-latest.json';
const ROOT = process.cwd();
const CORE_IDS = [
  'cape', 'top5_weight', 'nvda_fpe',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'arr_2nd_deriv', 'enterprise_deploy', 'cloud_rpo_growth',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const SHADOW_IDS = ['private_secondary_marks', 'token_revenue_ratio', 'gpu_rental_price', 'frontier_progress'];
const EXPECTED_IDS = [
  'cape', 'top5_weight', 'nvda_fpe', 'private_secondary_marks',
  'hyperscaler_capex_yoy', 'mag4_fcf_yoy', 'vc_ai_share', 'nvda_invest_revenue',
  'breadth_50d', 'spy_vs_rsp_6m', 'insider_sell_buy', 'ai_ipo_pipeline',
  'hy_oas', 'dc_abs_spread', 'debt_capex_ratio', 'neocloud_credit',
  'token_volume_mom', 'token_revenue_ratio', 'gpu_rental_price', 'arr_2nd_deriv',
  'enterprise_deploy', 'cloud_rpo_growth', 'frontier_progress',
  'accounting_events', 'fed_policy', 'capex_reaction', 'ceo_hedging'
];
const AXIS_SCORE = { green: 0, yellow: 50, red: 100 };
const CATEGORY_ORDER = ['valuation', 'capital', 'market_structure', 'credit', 'fundamentals', 'macro'];
const TIER_LABEL_ZH = { observation: '观察期', caution: '中度警戒', alert: '高风险预警', top: '系统性顶部' };
const TIER_RANK = { observation: 0, caution: 1, alert: 2, top: 3 };
const SCORING_MODEL_VERSION = 'bubble-watch-v2-core23-shadow4';

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

function replayStatuses(statuses, categoryById, axisById, ids = CORE_IDS) {
  const statusById = new Map(Object.entries(statuses || {}));
  const missing = ids.filter((id) => !['red', 'yellow', 'green'].includes(statusById.get(id)));
  if (missing.length) {
    return {
      replayable: false,
      missing,
      total: ids.length
    };
  }
  const red = ids.filter((id) => statusById.get(id) === 'red').length;
  const yellow = ids.filter((id) => statusById.get(id) === 'yellow').length;
  const green = ids.length - red - yellow;
  const redPct = roundPct((red / ids.length) * 100);
  const weightedAux = roundPct(((red + 0.5 * yellow) / ids.length) * 100);
  const baseTier = tierFromPct(redPct);
  const resonantCategories = CATEGORY_ORDER
    .map((category) => {
      const categoryIds = ids.filter((id) => categoryById.get(id) === category);
      const redInCategory = categoryIds.filter((id) => statusById.get(id) === 'red').length;
      return {
        key: category,
        red: redInCategory,
        total: categoryIds.length,
        ratio: categoryIds.length ? redInCategory / categoryIds.length : 0
      };
    })
    .filter((category) => category.ratio >= 0.5);
  let effectiveTier = baseTier;
  if (resonantCategories.length >= 2 && TIER_RANK[effectiveTier] < TIER_RANK.alert) effectiveTier = 'alert';
  let stageScore = null;
  let triggerScore = null;
  let twoAxisUpgrade = null;
  const axisScore = (axis) => {
    const axisIds = ids.filter((id) => axisById.get(id) === axis);
    return roundPct(axisIds.reduce((sum, id) => sum + AXIS_SCORE[statusById.get(id)], 0) / axisIds.length);
  };
  stageScore = axisScore('stage');
  triggerScore = axisScore('trigger');
  const target = stageScore >= 60 && triggerScore >= 65
    ? 'top'
    : stageScore >= 60 && triggerScore >= 50
      ? 'alert'
      : null;
  if (target && TIER_RANK[target] > TIER_RANK[effectiveTier]) {
    effectiveTier = target;
    twoAxisUpgrade = target;
  }
  return {
    replayable: true,
    total: ids.length,
    red,
    yellow,
    green,
    primaryScorePct: redPct,
    redPct,
    weightedAux,
    baseTier,
    effectiveTier,
    overrideActive: effectiveTier !== baseTier,
    stageScore,
    triggerScore,
    twoAxisUpgrade,
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

function buildScenarioInputs(axisById) {
  const allGreen = makeAll('green');
  const manyYellowNoRed = withStatuses(allGreen, CORE_IDS.slice(0, 18).map((id) => [id, 'yellow']));
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
  const alertByRedPct = withStatuses(allGreen, CORE_IDS.slice(0, 10).map((id) => [id, 'red']));
  const topByRedPct = withStatuses(allGreen, CORE_IDS.slice(0, 14).map((id) => [id, 'red']));
  const stageIds = CORE_IDS.filter((id) => axisById.get(id) === 'stage');
  const triggerIds = CORE_IDS.filter((id) => !stageIds.includes(id));
  const axisAlert = withStatuses(allGreen, [
    ...stageIds.map((id) => [id, 'yellow']),
    ['cape', 'red'], ['top5_weight', 'red'],
    ...triggerIds.map((id) => [id, 'yellow'])
  ]);
  const axisTop = withStatuses(axisAlert, [
    ['breadth_50d', 'red'], ['hy_oas', 'red'], ['token_volume_mom', 'red'], ['accounting_events', 'red']
  ]);
  const shadowAllRed = withStatuses(allGreen, SHADOW_IDS.map((id) => [id, 'red']));
  return [
    {
      key: 'all_green_floor',
      statuses: allGreen,
      expected: { primaryScorePct: 0, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'many_yellow_no_red_weighted_aux_does_not_drive_tier',
      statuses: manyYellowNoRed,
      expected: { primaryScorePct: 0, weightedAux: 39.1, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'single_resonance_low_redpct_no_override',
      statuses: singleResonanceLowRed,
      expected: { primaryScorePct: 8.7, effectiveTier: 'observation', overrideActive: false }
    },
    {
      key: 'dual_resonance_low_redpct_forces_alert',
      statuses: dualResonanceLowRed,
      expected: { primaryScorePct: 17.4, effectiveTier: 'alert', overrideActive: true }
    },
    {
      key: 'caution_by_redpct_without_resonance',
      statuses: cautionByRedPct,
      expected: { primaryScorePct: 26.1, effectiveTier: 'caution', overrideActive: false }
    },
    {
      key: 'alert_by_redpct',
      statuses: alertByRedPct,
      expected: { primaryScorePct: 43.5, effectiveTier: 'alert' }
    },
    {
      key: 'systemic_top_by_redpct',
      statuses: topByRedPct,
      expected: { primaryScorePct: 60.9, effectiveTier: 'top' }
    },
    {
      key: 'stage_trigger_alert_without_redpct_threshold',
      statuses: axisAlert,
      expected: { primaryScorePct: 8.7, stageScore: 60, triggerScore: 50, effectiveTier: 'alert', twoAxisUpgrade: 'alert' }
    },
    {
      key: 'stage_trigger_top_without_redpct_threshold',
      statuses: axisTop,
      expected: { primaryScorePct: 26.1, stageScore: 60, triggerScore: 65.4, effectiveTier: 'top', twoAxisUpgrade: 'top' }
    },
    {
      key: 'shadow_all_red_does_not_change_core_score',
      statuses: shadowAllRed,
      expected: { primaryScorePct: 0, weightedAux: 0, stageScore: 0, triggerScore: 0, effectiveTier: 'observation', overrideActive: false }
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
  const axisById = new Map((latest.indicators || []).map((indicator) => [indicator.id, indicator.axis]));
  const currentStatuses = Object.fromEntries((latest.indicators || []).map((indicator) => [indicator.id, indicator.status]));
  const currentReplay = replayStatuses(currentStatuses, categoryById, axisById);
  const summary = latest.summary || {};
  const currentMismatches = [
    ...compareExpected(currentReplay, {
      primaryScorePct: summary.primary_score_pct,
      redPct: summary.red_pct,
      weightedAux: summary.weighted_risk_score,
      effectiveTier: latest.scoring?.effective_tier,
      overrideActive: latest.scoring?.override_active
    }),
    latest.contractVersion === 'bubble-watch-v2' ? null : `contractVersion: expected bubble-watch-v2, got ${latest.contractVersion}`,
    latest.scoring?.model_version === SCORING_MODEL_VERSION ? null : `scoring model: expected ${SCORING_MODEL_VERSION}, got ${latest.scoring?.model_version}`,
    JSON.stringify(latest.scoring?.core_indicator_ids) === JSON.stringify(CORE_IDS) ? null : 'core_indicator_ids drift',
    JSON.stringify(latest.scoring?.shadow_indicator_ids) === JSON.stringify(SHADOW_IDS) ? null : 'shadow_indicator_ids drift',
    summary.primary_score_basis === 'core_red_light_ratio' ? null : `primary_score_basis: expected core_red_light_ratio, got ${summary.primary_score_basis}`,
    summary.primary_score_pct === summary.red_pct ? null : `primary_score_pct ${summary.primary_score_pct} != red_pct ${summary.red_pct}`,
    String(summary.verdict_desc || '').includes('加权风险分') ? 'verdict_desc still contains 加权风险分' : null,
    pageHtml.includes('WEIGHTED RISK SCORE') ? 'page still contains WEIGHTED RISK SCORE' : null,
    pageHtml.includes('Stage × Trigger') ? null : 'page missing Stage × Trigger',
    pageHtml.includes('固定核心') && pageHtml.includes('影子观察') ? null : 'page missing Core-23 / Shadow-4 disclosure',
    pageHtml.includes('Threshold Scale') || pageHtml.includes('触发阈值标尺') ? 'page still contains retired threshold scale' : null
  ].filter(Boolean);

  const historyEntries = Array.isArray(history.entries) ? history.entries : [];
  const historyReplay = historyEntries.map((entry) => {
    const replay = replayStatuses(entry.statuses, categoryById, axisById);
    return {
      week: entry.week,
      date: entry.date,
      replayable: replay.replayable,
      stored: {
        red_pct: entry.red_pct,
        risk_score: entry.risk_score,
        core_red_pct: entry.core_red_pct,
        core_risk_score: entry.core_risk_score,
        statusCount: entry.statuses ? Object.keys(entry.statuses).length : 0
      },
      replay,
      mismatches: replay.replayable
        ? compareExpected(replay, { redPct: entry.core_red_pct, weightedAux: entry.core_risk_score })
        : []
    };
  });

  const scenarios = buildScenarioInputs(axisById).map((scenario) => {
    const replay = replayStatuses(scenario.statuses, categoryById, axisById);
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
      'Only entries from 2026-06-18 onward contain every Core-23 status; older published red_pct/weighted values used changing denominators and are preserved but excluded from the v2 comparable trend.',
      'AI-specific indicators do not have a 20-year homogeneous history; this audit is a scoring-contract replay and scenario stress test, not a predictive backtest or crash-probability calibration.',
      'Shadow-4 is deliberately held out of primary score, Stage/Trigger, category resonance, momentum, and similarity until the pre-registered promotion gates are met.',
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
      v2ComparableEntries: historyReplay.filter((entry) => entry.replayable).length,
      fullDisplayEntries: historyReplay.filter((entry) => entry.replayable && entry.stored.statusCount === EXPECTED_IDS.length).length,
      nonComparableEntries: historyReplay.filter((entry) => !entry.replayable).length,
      rows: historyReplay
    },
    scenarios,
    failures
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[bubble-watch-backtest] verdict=${report.verdict}`);
  console.log(`[bubble-watch-backtest] current primary=${summary.primary_score_pct}% weighted_aux=${summary.weighted_risk_score}% verdict=${summary.verdict_label}`);
  console.log(`[bubble-watch-backtest] history entries=${report.history.entries}, v2-comparable=${report.history.v2ComparableEntries}, non-comparable=${report.history.nonComparableEntries}`);
  for (const scenario of scenarios) {
    console.log(`[bubble-watch-backtest] scenario ${scenario.key}: pass=${scenario.pass}, primary=${scenario.replay.primaryScorePct}, weighted_aux=${scenario.replay.weightedAux}, effective=${TIER_LABEL_ZH[scenario.replay.effectiveTier]}`);
  }
  console.log(`[bubble-watch-backtest] wrote ${path.relative(ROOT, outputPath)}`);
  if (failures.length) process.exit(1);
}

main();
