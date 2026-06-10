#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'manual-artifacts/treasury-fiscal-data/tga-replay-latest.json';
const DEFAULT_HISTORY_PATH = 'data/radar-history-full.json';
const DEFAULT_RADAR_DATA_PATH = 'data/radar-data.json';
const DEFAULT_ROWS = 180;
const FETCH_TIMEOUT_MS = Number(process.env.TREASURY_FISCAL_DATA_FETCH_TIMEOUT_MS) || 20000;

const DTS_OPERATING_CASH_BALANCE_ENDPOINT =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';

const DTS_SERIES = {
  tgaClosingBalance: {
    accountType: 'Treasury General Account (TGA) Closing Balance',
    expectedLine: '4'
  },
  tgaDeposits: {
    accountType: 'Total TGA Deposits (Table II)',
    expectedLine: '2'
  },
  tgaWithdrawals: {
    accountType: 'Total TGA Withdrawals (Table II) (-)',
    expectedLine: '3'
  }
};

const DRAIN_5D_THRESHOLD_MILLIONS = 50000;
const INJECTION_5D_THRESHOLD_MILLIONS = -50000;

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    output: DEFAULT_OUTPUT,
    historyPath: DEFAULT_HISTORY_PATH,
    radarDataPath: DEFAULT_RADAR_DATA_PATH,
    rows: DEFAULT_ROWS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-network') {
      options.allowNetwork = true;
      continue;
    }

    if (arg === '--output') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--history') {
      options.historyPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--radar-data') {
      options.radarDataPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--rows') {
      options.rows = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.rows) || options.rows < 30 || options.rows > 1000) {
    throw new Error('--rows must be an integer between 30 and 1000.');
  }

  return options;
}

function resolveOutputPath(outputPath) {
  const root = process.cwd();
  const allowedRoot = path.resolve(root, 'manual-artifacts', 'treasury-fiscal-data');
  const resolved = path.resolve(root, outputPath);

  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('TGA replay output must stay under manual-artifacts/treasury-fiscal-data.');
  }

  return resolved;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function finiteNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildDtsUrl(accountType, rows) {
  return `${DTS_OPERATING_CASH_BALANCE_ENDPOINT}`
    + '?fields=record_date,account_type,open_today_bal,src_line_nbr'
    + `&filter=account_type:eq:${encodeURIComponent(accountType)}`
    + '&sort=-record_date'
    + `&page[size]=${rows}`;
}

async function fetchDtsSeries(seriesConfig, rows) {
  const url = buildDtsUrl(seriesConfig.accountType, rows);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GFRR-source-review/1.0' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    const json = await response.json();
    const data = Array.isArray(json.data) ? json.data : [];
    const points = data
      .map((row) => ({
        date: String(row.record_date || ''),
        accountType: String(row.account_type || ''),
        value: finiteNumberOrNull(row.open_today_bal),
        sourceLine: String(row.src_line_nbr || '')
      }))
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)
        && row.accountType === seriesConfig.accountType
        && Number.isFinite(row.value))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return {
      ok: points.length > 0,
      accountType: seriesConfig.accountType,
      expectedLine: seriesConfig.expectedLine,
      observedLatestLine: points.length ? points[points.length - 1].sourceLine : null,
      count: points.length,
      firstDate: points.length ? points[0].date : null,
      latestDate: points.length ? points[points.length - 1].date : null,
      points
    };
  } catch (error) {
    return {
      ok: false,
      accountType: seriesConfig.accountType,
      expectedLine: seriesConfig.expectedLine,
      observedLatestLine: null,
      count: 0,
      firstDate: null,
      latestDate: null,
      error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'fetch_failed'),
      points: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

function combineDtsSeries(closing, deposits, withdrawals) {
  const byDate = new Map();

  for (const point of closing.points) {
    byDate.set(point.date, {
      date: point.date,
      tgaBalance: point.value,
      sourceLines: { tgaBalance: point.sourceLine }
    });
  }

  for (const point of deposits.points) {
    const row = byDate.get(point.date);
    if (row) {
      row.tgaDeposits = point.value;
      row.sourceLines.tgaDeposits = point.sourceLine;
    }
  }

  for (const point of withdrawals.points) {
    const row = byDate.get(point.date);
    if (row) {
      row.tgaWithdrawals = point.value;
      row.sourceLines.tgaWithdrawals = point.sourceLine;
    }
  }

  const rows = [...byDate.values()]
    .filter((row) => Number.isFinite(row.tgaBalance))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    row.tgaChange1d = index >= 1 ? row.tgaBalance - rows[index - 1].tgaBalance : null;
    row.tgaChange5d = index >= 5 ? row.tgaBalance - rows[index - 5].tgaBalance : null;
    row.tgaChange20d = index >= 20 ? row.tgaBalance - rows[index - 20].tgaBalance : null;
    row.tgaNetDepositWithdrawal = Number.isFinite(row.tgaDeposits) && Number.isFinite(row.tgaWithdrawals)
      ? row.tgaDeposits - row.tgaWithdrawals
      : null;
  }

  return rows;
}

function latestDtsOnOrBefore(dtsRows, date) {
  let selected = null;
  for (const row of dtsRows) {
    if (row.date <= date) selected = row;
    else break;
  }
  return selected;
}

function valueAtPath(obj, pathParts) {
  let cur = obj;
  for (const part of pathParts) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[part];
  }
  return finiteNumberOrNull(cur);
}

function alignWithGfrrHistory(historyRows, dtsRows) {
  return historyRows
    .filter((row) => row && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')))
    .map((row, index, rows) => {
      const next = rows[index + 1] || null;
      const previous = rows[index - 1] || null;
      const dts = latestDtsOnOrBefore(dtsRows, row.date);
      const score = finiteNumberOrNull(row.score);
      const liquidity = valueAtPath(row, ['modules', 'liquidity']);
      const nextScore = next ? finiteNumberOrNull(next.score) : null;
      const nextLiquidity = next ? valueAtPath(next, ['modules', 'liquidity']) : null;
      const previousOnRrp = previous ? finiteNumberOrNull(previous.onRrp) : null;
      const previousWalcl = previous ? finiteNumberOrNull(previous.walcl) : null;
      const onRrp = finiteNumberOrNull(row.onRrp);
      const walcl = finiteNumberOrNull(row.walcl);

      return {
        date: row.date,
        score,
        liquidity,
        scoreChangeNext1Row: Number.isFinite(score) && Number.isFinite(nextScore) ? nextScore - score : null,
        liquidityChangeNext1Row: Number.isFinite(liquidity) && Number.isFinite(nextLiquidity) ? nextLiquidity - liquidity : null,
        onRrp,
        onRrpChange1HistoryRow: Number.isFinite(onRrp) && Number.isFinite(previousOnRrp) ? onRrp - previousOnRrp : null,
        walcl,
        walclChange1HistoryRow: Number.isFinite(walcl) && Number.isFinite(previousWalcl) ? walcl - previousWalcl : null,
        alignedDtsDate: dts?.date || null,
        tgaBalance: dts?.tgaBalance ?? null,
        tgaDeposits: dts?.tgaDeposits ?? null,
        tgaWithdrawals: dts?.tgaWithdrawals ?? null,
        tgaNetDepositWithdrawal: dts?.tgaNetDepositWithdrawal ?? null,
        tgaChange1d: dts?.tgaChange1d ?? null,
        tgaChange5d: dts?.tgaChange5d ?? null,
        tgaChange20d: dts?.tgaChange20d ?? null
      };
    });
}

function pearson(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => [finiteNumberOrNull(row[xKey]), finiteNumberOrNull(row[yKey])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (pairs.length < 3) return { n: pairs.length, r: null };

  const avgX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const avgY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let num = 0;
  let denX = 0;
  let denY = 0;

  for (const [x, y] of pairs) {
    const dx = x - avgX;
    const dy = y - avgY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return { n: pairs.length, r: null };
  return { n: pairs.length, r: Number((num / Math.sqrt(denX * denY)).toFixed(4)) };
}

function uniqueByAlignedDtsDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    if (!row.alignedDtsDate) continue;
    if (!byDate.has(row.alignedDtsDate)) {
      byDate.set(row.alignedDtsDate, row);
    }
  }
  return [...byDate.values()];
}

function countFinite(rows, key) {
  return rows.filter((row) => Number.isFinite(finiteNumberOrNull(row[key]))).length;
}

function pickEventRow(row) {
  return {
    date: row.date,
    alignedDtsDate: row.alignedDtsDate,
    tgaBalance: row.tgaBalance,
    tgaChange5d: row.tgaChange5d,
    tgaChange20d: row.tgaChange20d,
    tgaNetDepositWithdrawal: row.tgaNetDepositWithdrawal,
    score: row.score,
    liquidity: row.liquidity,
    scoreChangeNext1Row: row.scoreChangeNext1Row,
    liquidityChangeNext1Row: row.liquidityChangeNext1Row,
    onRrp: row.onRrp,
    walcl: row.walcl
  };
}

function buildScreeningSummary(alignedRows) {
  const diagnosticRows = uniqueByAlignedDtsDate(alignedRows);
  const rowsWithTga5d = diagnosticRows.filter((row) => Number.isFinite(row.tgaChange5d));
  const drainEvents = rowsWithTga5d.filter((row) => row.tgaChange5d >= DRAIN_5D_THRESHOLD_MILLIONS);
  const injectionEvents = rowsWithTga5d.filter((row) => row.tgaChange5d <= INJECTION_5D_THRESHOLD_MILLIONS);

  return {
    diagnosticRows: diagnosticRows.length,
    thresholds: {
      drain5dMillions: DRAIN_5D_THRESHOLD_MILLIONS,
      injection5dMillions: INJECTION_5D_THRESHOLD_MILLIONS,
      note: 'Screening thresholds only; not a formula, not a scoring rule. Weekend / holiday GFRR rows are de-duplicated by aligned DTS date.'
    },
    eventCounts: {
      drain5d: drainEvents.length,
      injection5d: injectionEvents.length,
      drain5dWithNextScoreIncrease: drainEvents.filter((row) => row.scoreChangeNext1Row > 0).length,
      injection5dWithNextScoreDecrease: injectionEvents.filter((row) => row.scoreChangeNext1Row < 0).length
    },
    topFiscalDrains: [...rowsWithTga5d]
      .sort((a, b) => b.tgaChange5d - a.tgaChange5d)
      .slice(0, 5)
      .map(pickEventRow),
    topFiscalInjections: [...rowsWithTga5d]
      .sort((a, b) => a.tgaChange5d - b.tgaChange5d)
      .slice(0, 5)
      .map(pickEventRow)
  };
}

function buildCorrelationSummary(alignedRows) {
  const diagnosticRows = uniqueByAlignedDtsDate(alignedRows);
  return {
    diagnosticRows: diagnosticRows.length,
    tgaChange5d_vs_nextScoreChange: pearson(diagnosticRows, 'tgaChange5d', 'scoreChangeNext1Row'),
    tgaChange5d_vs_nextLiquidityChange: pearson(diagnosticRows, 'tgaChange5d', 'liquidityChangeNext1Row'),
    tgaChange5d_vs_sameDayLiquidityModule: pearson(diagnosticRows, 'tgaChange5d', 'liquidity'),
    tgaChange20d_vs_sameDayLiquidityModule: pearson(diagnosticRows, 'tgaChange20d', 'liquidity'),
    tgaChange5d_vs_onRrpLevel: pearson(diagnosticRows, 'tgaChange5d', 'onRrp'),
    tgaChange5d_vs_walclLevel: pearson(diagnosticRows, 'tgaChange5d', 'walcl'),
    note: 'Correlations use committed local GFRR history rows, de-duplicated by aligned DTS date; they are preliminary diagnostics, not a backtest approval.'
  };
}

function buildReport({ options, dtsFetch, dtsRows, alignedRows, radarData }) {
  const latestDts = dtsRows[dtsRows.length - 1] || null;
  const latestAligned = alignedRows[alignedRows.length - 1] || null;
  const currentFed = radarData?.macroDrivers?.fedLiquidity || {};

  const coverage = {
    dtsRows: dtsRows.length,
    dtsFirstDate: dtsRows[0]?.date || null,
    dtsLatestDate: latestDts?.date || null,
    gfrrHistoryRows: alignedRows.length,
    gfrrFirstDate: alignedRows[0]?.date || null,
    gfrrLatestDate: alignedRows[alignedRows.length - 1]?.date || null,
    rowsWithAlignedDts: alignedRows.filter((row) => row.alignedDtsDate).length,
    uniqueAlignedDtsDates: uniqueByAlignedDtsDate(alignedRows).length,
    rowsWithTgaChange1d: countFinite(alignedRows, 'tgaChange1d'),
    rowsWithTgaChange5d: countFinite(alignedRows, 'tgaChange5d'),
    rowsWithTgaChange20d: countFinite(alignedRows, 'tgaChange20d'),
    rowsWithOnRrp: countFinite(alignedRows, 'onRrp'),
    rowsWithWalcl: countFinite(alignedRows, 'walcl'),
    reserveBalancesInCurrentRadarData: Number.isFinite(finiteNumberOrNull(currentFed.reserveBalances)),
    reserveBalancesInHistoryRows: 0
  };

  const minBacktestRowsNeeded = 120;
  const hasEnoughLocalHistory = coverage.gfrrHistoryRows >= minBacktestRowsNeeded
    && coverage.rowsWithTgaChange20d >= minBacktestRowsNeeded / 2
    && coverage.rowsWithOnRrp >= minBacktestRowsNeeded / 2
    && coverage.rowsWithWalcl >= minBacktestRowsNeeded / 2;

  return {
    schemaVersion: 'treasury-tga-replay-1',
    kind: 'treasury_fiscal_data_tga_artifact_only_replay',
    generatedAt: new Date().toISOString(),
    status: hasEnoughLocalHistory
      ? 'diagnostic_ready_for_human_review'
      : 'insufficient_local_history_for_formula_approval',
    sourceCandidate: 'TreasuryFiscalData:DTS:operating_cash_balance:TGA',
    artifactOnly: true,
    productionDataWritten: false,
    runtimeChanged: false,
    scoringChanged: false,
    formulaApproved: false,
    outputPath: options.output,
    inputs: {
      historyPath: options.historyPath,
      radarDataPath: options.radarDataPath,
      dtsEndpoint: DTS_OPERATING_CASH_BALANCE_ENDPOINT,
      rowsRequestedPerSeries: options.rows,
      allowNetwork: options.allowNetwork,
      noSecrets: true
    },
    dtsFetch,
    coverage,
    latestObservation: latestDts ? {
      date: latestDts.date,
      tgaBalance: latestDts.tgaBalance,
      tgaDeposits: latestDts.tgaDeposits,
      tgaWithdrawals: latestDts.tgaWithdrawals,
      tgaNetDepositWithdrawal: latestDts.tgaNetDepositWithdrawal,
      tgaChange1d: latestDts.tgaChange1d,
      tgaChange5d: latestDts.tgaChange5d,
      tgaChange20d: latestDts.tgaChange20d
    } : null,
    currentFedLiquiditySnapshot: {
      walcl: finiteNumberOrNull(currentFed.walcl),
      walcl4wChange: finiteNumberOrNull(currentFed.walcl4wChange),
      onRrp: finiteNumberOrNull(currentFed.onRrp),
      onRrpWeekChange: finiteNumberOrNull(currentFed.onRrpWeekChange),
      reserveBalances: finiteNumberOrNull(currentFed.reserveBalances),
      reserveBalances4wChange: finiteNumberOrNull(currentFed.reserveBalances4wChange),
      sourceStatus: currentFed.sourceStatus || null
    },
    latestGfrrAlignedRow: latestAligned ? pickEventRow(latestAligned) : null,
    correlations: buildCorrelationSummary(alignedRows),
    screening: buildScreeningSummary(alignedRows),
    sampleRows: alignedRows.slice(-15).map(pickEventRow),
    assessment: {
      incrementalSignal: 'plausible_not_proven',
      formulaApproval: false,
      reason: hasEnoughLocalHistory
        ? 'Artifact has enough local rows for human diagnostic review, but formula still requires a separate approved backtest methodology.'
        : 'Committed GFRR history is too short and lacks reserve-balance history, so this artifact cannot prove incremental signal versus ON RRP / WALCL / reserve balances.',
      nextAllowedStep: 'Design a larger artifact-only replay using a longer committed or fetched historical baseline; no runtime or scoring implementation is approved.'
    },
    boundaries: {
      noDataJsonWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      affectsValues: false,
      affectsDisplayInputsBaseline: false,
      affectsEffectiveDisplayInputs: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsActionQueue: false,
      affectsTriggerMonitor: false,
      affectsInvalidationRules: false
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.allowNetwork) {
    throw new Error('TGA replay requires explicit --allow-network; no Treasury API call was made.');
  }

  const outputPath = resolveOutputPath(options.output);
  const history = readJsonFile(options.historyPath);
  const radarData = readJsonFile(options.radarDataPath);

  if (!Array.isArray(history)) {
    throw new Error(`${options.historyPath} must be an array.`);
  }

  const [closing, deposits, withdrawals] = await Promise.all([
    fetchDtsSeries(DTS_SERIES.tgaClosingBalance, options.rows),
    fetchDtsSeries(DTS_SERIES.tgaDeposits, options.rows),
    fetchDtsSeries(DTS_SERIES.tgaWithdrawals, options.rows)
  ]);

  if (!closing.ok || !deposits.ok || !withdrawals.ok) {
    throw new Error('One or more DTS series fetches failed; aborting artifact write.');
  }

  const dtsRows = combineDtsSeries(closing, deposits, withdrawals);
  const alignedRows = alignWithGfrrHistory(history, dtsRows);
  const report = buildReport({
    options,
    dtsFetch: {
      tgaClosingBalance: { ...closing, points: undefined },
      tgaDeposits: { ...deposits, points: undefined },
      tgaWithdrawals: { ...withdrawals, points: undefined }
    },
    dtsRows,
    alignedRows,
    radarData
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[tga-replay] wrote ${options.output}`);
  console.log(`[tga-replay] status=${report.status}`);
  console.log(`[tga-replay] DTS ${report.coverage.dtsFirstDate}..${report.coverage.dtsLatestDate} rows=${report.coverage.dtsRows}`);
  console.log(`[tga-replay] GFRR ${report.coverage.gfrrFirstDate}..${report.coverage.gfrrLatestDate} rows=${report.coverage.gfrrHistoryRows}`);
  console.log(`[tga-replay] incrementalSignal=${report.assessment.incrementalSignal}; formulaApproval=${report.assessment.formulaApproval}`);
}

main().catch((error) => {
  console.error('[tga-replay] FATAL:', error?.message || error);
  process.exit(1);
});
