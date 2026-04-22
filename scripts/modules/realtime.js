import { dataUrl, historyUrl, localRealtimeUrl, remoteRealtimeUrl, fmtNumSafe } from './config.js';
import { computeAgeMinutes, classifyFreshnessLevel, buildRealtimeStatusLabel, shouldApplyRealtimeOverlay } from './freshness.js';
import { buildHealthDashboardModel } from './health.js';
import { buildDecisionModel } from './decision.js';

const SOURCE_MODE_CN = {
  'live': '实时',
  'live-with-fallback': '实时带回退',
  'cache-only': '缓存模式',
  'mock': '模拟'
};

const STRUCTURAL_SIGNAL_LABELS_CN = {
  curveDeepInversion: '曲线深度倒挂',
  curveRapidSteepening: '曲线快速陡峭化',
  onRrpCritical: '逆回购准备金告急',
  fedRapidContraction: '美联储快速缩表',
  igOasStress: '投资级信用利差扩张'
};

export async function fetchBaselineData() {
  return fetch(dataUrl).then((r) => r.json());
}

export async function fetchHistoryData() {
  return fetch(historyUrl).then((r) => r.json());
}

export function normalizeRealtimePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const values = payload.values && typeof payload.values === 'object' ? payload.values : null;
  if (!values) return null;
  const asOf = typeof payload.asOf === 'string'
    ? payload.asOf
    : typeof payload.lastSuccessAt === 'string'
      ? payload.lastSuccessAt
      : typeof payload.updatedAt === 'string'
        ? payload.updatedAt
        : null;
  return {
    values,
    changes: payload.changes && typeof payload.changes === 'object' ? payload.changes : {},
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    asOf,
    ageMinutes: Number.isFinite(payload.ageMinutes) ? payload.ageMinutes : null,
    freshnessLevel: typeof payload.freshnessLevel === 'string' ? payload.freshnessLevel : null,
    unavailable: !!payload.unavailable,
    sourceMode: typeof payload.sourceMode === 'string' ? payload.sourceMode : null,
    degradedMode: !!payload.degradedMode,
    cacheOnly: !!payload.cacheOnly,
    healthScore: payload.healthScore ?? null,
    criticalMissing: payload.criticalMissing ?? null,
    fallbackCount: payload.fallbackCount ?? null,
    lastSuccessAt: typeof payload.lastSuccessAt === 'string' ? payload.lastSuccessAt : null,
    sourceStatus: payload.sourceStatus && typeof payload.sourceStatus === 'object' ? payload.sourceStatus : {},
    sourceDetails: payload.sourceDetails && typeof payload.sourceDetails === 'object' ? payload.sourceDetails : {},
    notes: Array.isArray(payload.notes) ? payload.notes : []
  };
}

export async function fetchRealtimePayload() {
  const attempts = [
    { url: `${remoteRealtimeUrl}?ts=${Date.now()}`, source: 'remote', fallbackUsed: false },
    { url: localRealtimeUrl, source: 'local-fallback', fallbackUsed: true }
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { cache: 'no-store' });
      if (!response.ok) {
        lastError = `${attempt.source}:${response.status}`;
        continue;
      }
      const payload = normalizeRealtimePayload(await response.json());
      if (!payload) {
        lastError = `${attempt.source}:invalid-payload`;
        continue;
      }
      return {
        payload,
        realtimeSource: attempt.source,
        realtimeAvailable: true,
        realtimeFetchFailed: false,
        realtimeFallbackUsed: attempt.fallbackUsed,
        realtimeUpdatedAt: payload.updatedAt,
        realtimeError: lastError
      };
    } catch (error) {
      lastError = `${attempt.source}:${error.message}`;
    }
  }
  return {
    payload: null,
    realtimeSource: 'none',
    realtimeAvailable: false,
    realtimeFetchFailed: true,
    realtimeFallbackUsed: false,
    realtimeUpdatedAt: null,
    realtimeError: lastError
  };
}

export function buildRuntimeState(baseline, history, realtimeResult) {
  const realtimePayload = realtimeResult.payload;
  const realtimeAsOf = realtimePayload?.asOf || realtimePayload?.lastSuccessAt || realtimePayload?.updatedAt || null;
  const realtimeAgeMinutes = computeAgeMinutes(realtimeAsOf);
  const realtimeFreshnessLevel = classifyFreshnessLevel(realtimeAgeMinutes, !!realtimePayload?.values);
  const realtimeDegraded = !!(realtimePayload?.degradedMode || realtimePayload?.cacheOnly || realtimeResult.realtimeFallbackUsed);
  const realtimeUnavailable = realtimeFreshnessLevel === 'unavailable' || !realtimePayload?.values;
  const runtimeMetadata = {
    realtimeSource: realtimeResult.realtimeSource,
    realtimeAvailable: realtimeResult.realtimeAvailable,
    realtimeFetchFailed: realtimeResult.realtimeFetchFailed,
    realtimeFallbackUsed: realtimeResult.realtimeFallbackUsed,
    realtimeUpdatedAt: realtimeResult.realtimeUpdatedAt,
    realtimeError: realtimeResult.realtimeError,
    realtimeAsOf,
    realtimeFreshnessLevel,
    realtimeAgeMinutes,
    realtimeDegraded,
    realtimeUnavailable,
    realtimeCacheOnly: !!realtimePayload?.cacheOnly,
    realtimeHealthScore: realtimePayload?.healthScore ?? null,
    realtimeCriticalMissing: realtimePayload?.criticalMissing ?? null,
    realtimeSourceMode: realtimePayload?.sourceMode || null,
    realtimeSourceStatus: realtimePayload?.sourceStatus || {},
    realtimeSourceDetails: realtimePayload?.sourceDetails || {}
  };
  runtimeMetadata.realtimeStatusLabel = buildRealtimeStatusLabel(runtimeMetadata);
  runtimeMetadata.realtimeOverlayEnabled = shouldApplyRealtimeOverlay(runtimeMetadata, realtimePayload);
  const data = runtimeMetadata.realtimeOverlayEnabled ? applyRealtimeOverlay(baseline, realtimePayload) : baseline;
  const healthDashboard = buildHealthDashboardModel({
    baseline,
    history,
    realtimePayload,
    runtimeMetadata,
    data
  });
  data.decisionModel = buildDecisionModel(data, history, runtimeMetadata, healthDashboard);
  return { baseline, history, realtimePayload, runtimeMetadata, healthDashboard, data };
}

export function getRealtimeNumber(values, key) {
  const value = Number(values?.[key]);
  return Number.isFinite(value) ? value : null;
}

function readStructuralGatingFromBase(base) {
  const md = base?.macroDrivers;
  if (!md || typeof md !== 'object') {
    return {
      available: false,
      allMissing: true,
      activeLabels: [],
      structuralRed: false,
      structuralYellow: false,
      redReasons: [],
      yellowReasons: []
    };
  }

  const pipelineEval = md.gatingEvaluation;
  const activeSignals = Array.isArray(md.activeSignals) ? md.activeSignals : [];
  const activeLabels = activeSignals
    .filter((s) => s && s.reliability !== 'missing')
    .map((s) => s?.label || STRUCTURAL_SIGNAL_LABELS_CN[s?.key] || s?.key)
    .filter(Boolean);

  const fed = md.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = md.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = md.credit || {};
  const creditStatus = credit.sourceStatus || {};

  const walclAvailable = fedStatus.walcl && fedStatus.walcl !== 'missing';
  const onRrpAvailable = fedStatus.onRrp && fedStatus.onRrp !== 'missing';
  const curveAvailable = curveStatus.t10y2y && curveStatus.t10y2y !== 'missing';
  const creditAvailable = creditStatus.igOas && creditStatus.igOas !== 'missing';
  const allMissing = !walclAvailable && !onRrpAvailable && !curveAvailable && !creditAvailable;

  if (pipelineEval && typeof pipelineEval === 'object') {
    return {
      available: !allMissing,
      allMissing,
      activeLabels,
      structuralRed: !!pipelineEval.structuralRed,
      structuralYellow: !!pipelineEval.structuralYellow,
      redReasons: Array.isArray(pipelineEval.redReasons) ? pipelineEval.redReasons : [],
      yellowReasons: Array.isArray(pipelineEval.yellowReasons) ? pipelineEval.yellowReasons : []
    };
  }

  const t10y2y = curveAvailable && Number.isFinite(curve.t10y2y) ? curve.t10y2y : null;
  const onRrp = onRrpAvailable && Number.isFinite(fed.onRrp) ? fed.onRrp : null;
  const walcl4w = walclAvailable && Number.isFinite(fed.walcl4wChange) ? fed.walcl4wChange : null;
  const igOas = creditAvailable && Number.isFinite(credit.igOas) ? credit.igOas : null;

  const redCurveCreditDouble = t10y2y !== null && t10y2y <= -0.8 && igOas !== null && igOas >= 2.0;
  const onRrpCatastrophic = onRrp !== null && onRrp < 50;
  const structuralRed = redCurveCreditDouble || onRrpCatastrophic;

  const yellowCurveFedDouble = t10y2y !== null && t10y2y <= -0.5 && walcl4w !== null && walcl4w <= -1.0;
  const yellowIgWatch = igOas !== null && igOas >= 1.5;
  const yellowOnRrpCritical = onRrp !== null && onRrp < 100;
  const yellowCurveDeep = t10y2y !== null && t10y2y <= -0.5;
  const structuralYellow = yellowCurveFedDouble || yellowIgWatch || yellowOnRrpCritical || yellowCurveDeep;

  const redReasons = [];
  if (redCurveCreditDouble) redReasons.push('曲线严重倒挂且投资级信用告警');
  if (onRrpCatastrophic) redReasons.push('逆回购准备金临界告急');
  const yellowReasons = [];
  if (yellowCurveFedDouble) yellowReasons.push('曲线深度倒挂叠加美联储缩表');
  if (yellowIgWatch) yellowReasons.push('投资级信用利差进入应力区');
  if (yellowOnRrpCritical) yellowReasons.push('逆回购余额告急');
  if (yellowCurveDeep) yellowReasons.push('曲线深度倒挂');

  return {
    available: !allMissing,
    allMissing,
    activeLabels,
    structuralRed,
    structuralYellow,
    redReasons,
    yellowReasons
  };
}

export function applyRealtimeOverlay(base, realtimePayload) {
  if (!realtimePayload?.values) return base;

  const next = structuredClone(base);
  const brent = getRealtimeNumber(realtimePayload.values, 'brent');
  const dxy = getRealtimeNumber(realtimePayload.values, 'dxy');
  const vix = getRealtimeNumber(realtimePayload.values, 'vix');
  const hy = getRealtimeNumber(realtimePayload.values, 'hyOas');
  const us10y = getRealtimeNumber(realtimePayload.values, 'us10y');
  const real10y = getRealtimeNumber(realtimePayload.values, 'real10y');
  const gold = getRealtimeNumber(realtimePayload.values, 'gold');
  const spx = getRealtimeNumber(realtimePayload.values, 'spx');
  const breakeven10y = getRealtimeNumber(realtimePayload.values, 'breakeven10y');

  const oilRisk = brent === null ? null : Math.max(0, Math.min(100, Math.round((brent - 60) * 2)));
  const dollarRisk = dxy === null ? null : Math.max(0, Math.min(100, Math.round((dxy - 95) * 8)));
  const hyRisk = hy === null ? null : Math.max(0, Math.min(100, Math.round((hy - 2.5) * 35)));
  const vixRisk = vix === null ? null : Math.max(0, Math.min(100, Math.round((vix - 12) * 7)));
  const rateRisk = us10y === null ? null : Math.max(0, Math.min(100, Math.round((us10y - 2.5) * 22)));
  const realRisk = real10y === null ? null : Math.max(0, Math.min(100, Math.round((real10y - 0.5) * 33)));
  const inflationRisk = breakeven10y === null || oilRisk === null
    ? null
    : Math.max(0, Math.min(100, Math.round((breakeven10y - 1.5) * 45 + oilRisk * 0.35)));

  if (oilRisk !== null && vixRisk !== null) {
    next.modules.geopolitical = Math.max(0, Math.min(100, Math.round((next.modules.geopolitical * 0.4) + (oilRisk * 0.45) + (vixRisk * 0.15))));
  }
  if (oilRisk !== null) {
    next.modules.energy = Math.max(0, Math.min(100, Math.round((next.modules.energy * 0.25) + oilRisk * 0.75)));
  }
  if (inflationRisk !== null) {
    next.modules.inflation = Math.max(0, Math.min(100, Math.round((next.modules.inflation * 0.25) + inflationRisk * 0.75)));
  }
  if (dollarRisk !== null && hyRisk !== null && vixRisk !== null && rateRisk !== null) {
    next.modules.liquidity = Math.max(0, Math.min(100, Math.round((next.modules.liquidity * 0.2) + dollarRisk * 0.3 + hyRisk * 0.3 + vixRisk * 0.12 + rateRisk * 0.08)));
  }
  if (realRisk !== null && rateRisk !== null && hyRisk !== null) {
    next.modules.debt = Math.max(0, Math.min(100, Math.round((next.modules.debt * 0.25) + realRisk * 0.45 + rateRisk * 0.25 + hyRisk * 0.05)));
  }
  if (hyRisk !== null && vixRisk !== null && dollarRisk !== null) {
    next.modules.banking = Math.max(0, Math.min(100, Math.round((next.modules.banking * 0.2) + hyRisk * 0.55 + vixRisk * 0.2 + dollarRisk * 0.05)));
  }

  const totalScore = Math.round(
    next.modules.geopolitical * 0.15 +
    next.modules.energy * 0.16 +
    next.modules.inflation * 0.18 +
    next.modules.liquidity * 0.20 +
    next.modules.debt * 0.17 +
    next.modules.banking * 0.14
  );
  next.score = totalScore;
  next.liquidityIndex.score = next.modules.liquidity;
  next.liquidityIndex.regime = next.modules.liquidity >= 70 ? '限制性偏紧' : next.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复';
  next.liquidityIndex.directionLabel = realtimePayload.cacheOnly ? '快变量缓存模式' : realtimePayload.degradedMode ? '快变量带回退' : '快变量已实时覆盖';
  {
    const sourceModeLabel = SOURCE_MODE_CN[realtimePayload.sourceMode] || realtimePayload.sourceMode || '--';
    next.liquidityIndex.notes = [
      `实时快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元指数 ${fmtNumSafe(dxy,2)} / 波动率 ${fmtNumSafe(vix,2)} / 高收益利差 ${fmtNumSafe(hy,2)}。`,
      `10年期美债 ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`,
      `数据模式：${sourceModeLabel} / 健康分数：${realtimePayload.healthScore ?? '--'} / 关键缺失：${realtimePayload.criticalMissing ?? 0}。`,
      ...(realtimePayload.notes || [])
    ];
  }

  const hardStopBase = realtimePayload.cacheOnly
    || next.modules.liquidity >= 75
    || (brent !== null && brent >= 110)
    || (hy !== null && hy >= 4.5)
    || (vix !== null && vix >= 28)
    || totalScore >= 82;
  const cautionBase = !hardStopBase && (
    realtimePayload.degradedMode
    || next.modules.liquidity >= 60
    || (brent !== null && brent >= 90)
    || (hy !== null && hy >= 3.7)
    || (vix !== null && vix >= 20)
    || totalScore >= 65
  );

  const gating = readStructuralGatingFromBase(base);

  const hardStop = hardStopBase || gating.structuralRed;
  const caution = !hardStop && (cautionBase || gating.structuralYellow);

  let level = 'green';
  let levelLabel = '绿灯 / 允许分批进攻';
  let title = '今天允许小幅加仓，但必须按纪律分批执行';
  let desc = '流动性、信用和波动率均回到相对稳定区，系统允许提高风险暴露，但必须按分批规则执行。';
  let allow = ['允许分三笔以内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许适度降低美元/短票仓位。'];
  let block = ['禁止一次性打满仓位。', '禁止单日大涨后追高。', '禁止取消全部对冲。'];
  let mandatory = ['单日净加仓不得超过总资产 5%。', '若状态灯重新转黄，次日停止加仓。', '若周回撤 > -3%，立即切回黄灯。'];
  let structurallyTriggered = false;

  if (hardStop) {
    level = 'red';
    levelLabel = '红灯 / 禁止新增';
    title = '今天禁止主动加仓，只允许减仓与恢复防御层';
    const structDesc = (gating.structuralRed && !hardStopBase)
      ? `结构性双压触发红灯（${gating.redReasons.join('、')}）。`
      : '';
    desc = structDesc + (
      realtimePayload.cacheOnly
        ? '关键快变量不足，系统进入缓存模式。为避免误判，执行引擎直接锁为红灯：禁止新增，只允许风险收缩。'
        : '高压风险组合已触发。执行引擎直接锁为红灯：任何新增风险动作都被禁止，只允许减仓、补现金和恢复防御仓。'
    );
    allow = ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'];
    block = ['禁止新增股票与高波动仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'];
    mandatory = ['若总仓位高于 42%，必须先减回 38%-42%。', '若高波动资产 > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'];
    structurallyTriggered = gating.structuralRed && !hardStopBase;
  } else if (caution) {
    level = 'yellow';
    levelLabel = '黄灯 / 仅允许微调';
    title = '今天不能主动加风险，只允许对齐目标仓位与防守再平衡';
    const structDesc = (gating.structuralYellow && !cautionBase)
      ? `结构性压力触发黄灯（${gating.yellowReasons.join('、')}）。`
      : '';
    desc = structDesc + '风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。';
    allow = ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'];
    block = ['禁止新增高波动与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'];
    mandatory = ['若总仓位高于 53%，先减仓。', '若高波动资产 > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'];
    structurallyTriggered = gating.structuralYellow && !cautionBase;
  }

  // v27 允许保留的修改之一：executionLock（结构性红灯/黄灯门控 + structurallyTriggered）
  next.tradingSystem.executionLock = {
    tag: realtimePayload.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtimePayload.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
    level,
    levelLabel,
    title,
    description: desc.trim(),
    allow,
    block,
    mandatory,
    structurallyTriggered
  };

  // v27 允许保留的修改之二：actionLayer.checkpoints 的结构性兼容合并（不整块重写 actionLayer）
  if (!next.tradingSystem.actionLayer || typeof next.tradingSystem.actionLayer !== 'object') {
    next.tradingSystem.actionLayer = {};
  }
  {
    const baseCheckpoints = [
      `布伦特 当前 ${fmtNumSafe(brent,1)}`,
      `美元指数 当前 ${fmtNumSafe(dxy,2)}`,
      `波动率指数 当前 ${fmtNumSafe(vix,2)}`,
      `高收益利差 当前 ${fmtNumSafe(hy,2)}%`
    ];
    const prevCheckpoints = Array.isArray(base?.tradingSystem?.actionLayer?.checkpoints)
      ? base.tradingSystem.actionLayer.checkpoints
      : [];
    const structuralCheckpoints = prevCheckpoints.filter((cp) => {
      const text = String(cp);
      return text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购') || text.includes('10年-2年');
    });
    next.tradingSystem.actionLayer.checkpoints = [...baseCheckpoints, ...structuralCheckpoints];
  }

  // v27 允许保留的修改之三：riskControl.hardThresholds / resetThresholds 保留 pipeline 结构性规则不被覆盖
  if (!next.tradingSystem.riskControl || typeof next.tradingSystem.riskControl !== 'object') {
    next.tradingSystem.riskControl = {};
  }
  {
    const prevHard = Array.isArray(base?.tradingSystem?.riskControl?.hardThresholds)
      ? base.tradingSystem.riskControl.hardThresholds
      : [];
    const prevReset = Array.isArray(base?.tradingSystem?.riskControl?.resetThresholds)
      ? base.tradingSystem.riskControl.resetThresholds
      : [];
    const realtimeHardRules = [
      '流动性 ≥ 75：总仓位降至 42%。',
      '布伦特 ≥ 110：能源上调，股票下调。',
      '高收益利差 ≥ 4.5%：暂停新增风险仓位。',
      '波动率指数 ≥ 28：切入红灯。'
    ];
    const realtimeResetRules = [
      '波动率指数 < 18 且高收益利差 < 3.7：才允许回到绿灯。',
      '布伦特 < 95 且美元走弱：才允许提高成长仓。',
      '关键缺失 < 2：解除数据回退约束。'
    ];
    const pipelineStructuralHard = prevHard.filter((rule) => {
      const text = String(rule);
      return text.includes('结构性') || text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购');
    });
    const pipelineStructuralReset = prevReset.filter((rule) => {
      const text = String(rule);
      return text.includes('结构性') || text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购');
    });
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    next.tradingSystem.riskControl.hardThresholds = uniq([...realtimeHardRules, ...pipelineStructuralHard]);
    next.tradingSystem.riskControl.resetThresholds = uniq([...realtimeResetRules, ...pipelineStructuralReset]);
  }

  return next;
}
