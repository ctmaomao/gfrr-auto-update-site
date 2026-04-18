const dataUrl = './data/radar-data.json';
const historyUrl = './data/radar-history.json';
const localRealtimeUrl = './realtime/market.json';
const remoteRealtimeUrl = 'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';

const $ = (id) => document.getElementById(id);
const fmtSigned = (n) => `${n > 0 ? '+' : ''}${n}`;
const riskColor = (score) => {
  if (score >= 85) return '#ff5e72';
  if (score >= 70) return '#ff9a5d';
  if (score >= 50) return '#ffd46a';
  return '#2fd38a';
};
const trendClass = (delta) => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
const fmtDeltaSafe = (n) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '--';
const deltaArrow = (n) => !Number.isFinite(n) || n === 0 ? '→' : n > 0 ? '↑' : '↓';
const fmtSignedArrow = (n) => `${deltaArrow(n)} ${Number.isFinite(n) ? Math.abs(n) : '--'}`;


function fmtNumSafe(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

const FRESHNESS_WINDOWS = {
  fresh: 30,
  aging: 90,
  stale: 360
};

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function computeAgeMinutes(asOf) {
  const asOfTime = parseTimestamp(asOf);
  if (asOfTime === null) return null;
  return Math.max(0, Math.round((Date.now() - asOfTime) / 60000));
}

function classifyFreshnessLevel(ageMinutes, hasRealtime) {
  if (!hasRealtime || ageMinutes === null) return 'unavailable';
  if (ageMinutes <= FRESHNESS_WINDOWS.fresh) return 'fresh';
  if (ageMinutes <= FRESHNESS_WINDOWS.aging) return 'aging';
  if (ageMinutes <= FRESHNESS_WINDOWS.stale) return 'stale';
  return 'unavailable';
}

function buildRealtimeStatusLabel(metadata) {
  if (metadata.realtimeUnavailable) {
    return 'Realtime unavailable / baseline only';
  }

  const parts = [`Realtime ${metadata.realtimeFreshnessLevel}`];
  if (Number.isFinite(metadata.realtimeAgeMinutes)) parts.push(`${metadata.realtimeAgeMinutes}m old`);
  if (metadata.realtimeDegraded) parts.push('degraded');
  if (metadata.realtimeFallbackUsed) parts.push('local fallback');
  if (metadata.realtimeCacheOnly) parts.push('cache only');
  return parts.join(' / ');
}

function shouldApplyRealtimeOverlay(metadata, realtimePayload) {
  return !!realtimePayload?.values && !metadata.realtimeUnavailable;
}

async function fetchBaselineData() {
  return fetch(dataUrl).then((r) => r.json());
}

async function fetchHistoryData() {
  return fetch(historyUrl).then((r) => r.json());
}

function normalizeRealtimePayload(payload) {
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
    sourceDetails: payload.sourceDetails && typeof payload.sourceDetails === 'object' ? payload.sourceDetails : {},
    notes: Array.isArray(payload.notes) ? payload.notes : []
  };
}

async function fetchRealtimePayload() {
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

function buildRuntimeState(baseline, history, realtimeResult) {
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
    realtimeCacheOnly: !!realtimePayload?.cacheOnly
  };
  runtimeMetadata.realtimeStatusLabel = buildRealtimeStatusLabel(runtimeMetadata);
  runtimeMetadata.realtimeOverlayEnabled = shouldApplyRealtimeOverlay(runtimeMetadata, realtimePayload);

  return {
    baseline,
    history,
    realtimePayload,
    runtimeMetadata,
    data: runtimeMetadata.realtimeOverlayEnabled ? applyRealtimeOverlay(baseline, realtimePayload) : baseline
  };
}

function getRealtimeNumber(values, key) {
  const value = Number(values?.[key]);
  return Number.isFinite(value) ? value : null;
}

function applyRealtimeOverlay(base, realtimePayload) {
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
  next.liquidityIndex.notes = [
    `实时快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`,
    `数据模式：${realtimePayload.sourceMode || 'unknown'} / 健康分数：${realtimePayload.healthScore ?? '--'} / 关键缺失：${realtimePayload.criticalMissing ?? 0}。`,
    ...(realtimePayload.notes || [])
  ];

  const hardStop = realtimePayload.cacheOnly
    || next.modules.liquidity >= 75
    || (brent !== null && brent >= 110)
    || (hy !== null && hy >= 4.5)
    || (vix !== null && vix >= 28)
    || totalScore >= 82;
  const caution = !hardStop && (
    realtimePayload.degradedMode
    || next.modules.liquidity >= 60
    || (brent !== null && brent >= 90)
    || (hy !== null && hy >= 3.7)
    || (vix !== null && vix >= 20)
    || totalScore >= 65
  );

  let level = 'green';
  let levelLabel = 'GREEN / 允许分批进攻';
  let title = '今天允许小幅加仓，但必须按纪律分批执行';
  let desc = '流动性、信用和波动率均回到相对稳定区，系统允许提高风险暴露，但必须按分批规则执行。';
  let allow = ['允许分三笔以内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许适度降低美元/短票仓位。'];
  let block = ['禁止一次性打满仓位。', '禁止单日大涨后追高。', '禁止取消全部对冲。'];
  let mandatory = ['单日净加仓不得超过总资产 5%。', '若状态灯重新转黄，次日停止加仓。', '若周回撤 > -3%，立即回到 YELLOW。'];
  let target = '58%';
  let cash = '20%';
  let riskBudget = '50%';
  let status = '风险可控，仍需阈值约束';

  if (hardStop) {
    level = 'red';
    levelLabel = 'RED / 禁止新增';
    title = '今天禁止主动加仓，只允许减仓与恢复防御层';
    desc = realtimePayload.cacheOnly
      ? '关键快变量不足，系统进入缓存模式。为避免误判，执行引擎直接锁为 RED：禁止新增，只允许风险收缩。'
      : '高压风险组合已触发。执行引擎直接锁为 RED：任何新增风险动作都被禁止，只允许减仓、补现金和恢复防御仓。';
    allow = ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'];
    block = ['禁止新增股票与高Beta仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'];
    mandatory = ['若总仓位高于 42%，必须先减回 38%-42%。', '若科技/高Beta > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'];
    target = '38%';
    cash = '35%';
    riskBudget = '30%';
    status = '硬阈值全面生效';
  } else if (caution) {
    level = 'yellow';
    levelLabel = 'YELLOW / 仅允许微调';
    title = '今天不能主动加风险，只允许对齐目标仓位与防守再平衡';
    desc = '风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。';
    allow = ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'];
    block = ['禁止新增高Beta与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'];
    mandatory = ['若总仓位高于 53%，先减仓。', '若科技/高Beta > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'];
    target = '48%';
    cash = '27%';
    riskBudget = '40%';
    status = '硬阈值生效中';
  }

  next.tradingSystem.executionLock = {
    tag: realtimePayload.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtimePayload.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
    level,
    levelLabel,
    title,
    description: desc,
    allow,
    block,
    mandatory
  };

  const actionText = level === 'red'
    ? '执行引擎锁定：禁止新增，只允许减仓与防守恢复。'
    : level === 'yellow'
      ? '执行引擎锁定：只允许微调，不允许扩大风险暴露。'
      : '执行引擎开放：允许分批进攻，但不得破坏现金缓冲与止损纪律。';

  next.tradingSystem.actionLayer = {
    tag: '今日执行清单（交易引擎版）',
    priorityLine: `先看执行状态灯（${levelLabel}）→ 再执行强制动作 → 再对齐目标仓位；不满足条件时禁止交易。`,
    todayAction: actionText,
    checklist: mandatory,
    blocked: block,
    checkpoints: [
      `Brent 当前 ${fmtNumSafe(brent,1)}`,
      `DXY 当前 ${fmtNumSafe(dxy,2)}`,
      `VIX 当前 ${fmtNumSafe(vix,2)}`,
      `HY OAS 当前 ${fmtNumSafe(hy,2)}%`
    ]
  };

  next.tradingSystem.positioning.regime = level === 'red' ? '强防守执行框架' : level === 'yellow' ? '防守型执行框架' : '可控进攻框架';
  next.tradingSystem.positioning.riskBudget = riskBudget;
  next.tradingSystem.positioning.targetGrossExposure = target;
  next.tradingSystem.positioning.cashBufferTarget = cash;
  next.tradingSystem.positioning.coreAllocations = level === 'red'
    ? [
        { asset: '美元 / 短票', target: '核心1', weight: '24%', reason: '融资与信用压力阶段的首要防御层。' },
        { asset: '现金', target: '缓冲层', weight: '35%', reason: '执行引擎 RED，现金缓冲必须充足。' },
        { asset: '黄金', target: '对冲', weight: '12%', reason: '用于对冲尾部风险与政策不确定性。' },
        { asset: '原油 / 能源', target: '防守受益', weight: '12%', reason: '油价偏高时继续保留。' }
      ]
    : level === 'yellow'
      ? [
          { asset: '原油 / 能源', target: '核心1', weight: '20%', reason: '主链条仍偏向能源与通胀输入。' },
          { asset: '美元 / 短票', target: '核心2', weight: '18%', reason: '流动性偏紧阶段的稳定防御层。' },
          { asset: '黄金', target: '对冲', weight: '10%', reason: '对冲政策与通胀不确定性。' },
          { asset: '股票（防御板块）', target: '观察仓', weight: '8%', reason: '只保留低波动、现金流型权益。' }
        ]
      : [
          { asset: '股票（质量+防御）', target: '核心1', weight: '24%', reason: '风险回到可控区后恢复权益暴露。' },
          { asset: '原油 / 能源', target: '核心2', weight: '16%', reason: '保留主链条防守属性。' },
          { asset: '黄金', target: '对冲', weight: '8%', reason: '保留尾部对冲。' },
          { asset: '美元 / 短票', target: '缓冲层', weight: '12%', reason: '保留机动空间。' }
        ];
  next.tradingSystem.positioning.executionRestrictions = level === 'green'
    ? ['任何新增仓位必须分批执行。','单日净加仓不超过总资产的 5%。','若状态灯转黄，次日停止加仓。']
    : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。','科技与高Beta资产合计不得超过 3%。','任何新增进攻仓位都必须由减仓腾出空间。'];

  next.tradingSystem.riskControl.status = status;
  next.tradingSystem.riskControl.systemState = title;
  next.tradingSystem.riskControl.maxDrawdown = level === 'red' ? '-6%' : '-8%';
  next.tradingSystem.riskControl.hardThresholds = [
    '流动性 ≥ 75：总仓位降至 42%。',
    'Brent ≥ 110：能源上调，股票下调。',
    'HY OAS ≥ 4.5%：暂停新增风险仓位。',
    'VIX ≥ 28：进入 RED。'
  ];
  next.tradingSystem.riskControl.resetThresholds = [
    'VIX < 18 且 HY OAS < 3.7：才允许回到 GREEN。',
    'Brent < 95 且 DXY 走弱：才允许提高成长仓。',
    'criticalMissing < 2：解除数据回退约束。'
  ];

  next.tradingSystem.signalEngine = {
    strength: totalScore,
    direction: level === 'red' ? '只允许减仓/防守' : level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高Beta' : '允许质量权益分批进攻',
    consistency: realtimePayload.cacheOnly ? '低一致性（缓存）' : realtimePayload.degradedMode ? '中一致性（回退）' : '高一致性',
    macroSignal: totalScore >= 70 ? '滞胀冲击' : totalScore >= 55 ? '流动性偏紧' : '通胀回落增长',
    liquiditySignal: `${next.liquidityIndex.regime}（实时）`,
    chainSignal: next.modules.energy >= next.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
    notes: [
      `执行引擎状态：${levelLabel}。`,
      `关键快变量：Brent ${fmtNumSafe(brent,1)} / DXY ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY ${fmtNumSafe(hy,2)}。`,
      `健康度 ${realtimePayload.healthScore ?? '--'}，关键缺失 ${realtimePayload.criticalMissing ?? 0}。`
    ]
  };

  next.topRisks = [
    `盘中快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `执行状态灯：${levelLabel}。`,
    realtimePayload.cacheOnly ? '当前为缓存模式，系统自动提升防守等级。' : realtimePayload.degradedMode ? '当前为带回退实时模式，少量数据已回退但系统继续运行。' : '当前为实时模式，快变量直接驱动信号与仓位。',
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`
  ];

  next.decisionLine = `当前已进入 v24.1 交易引擎模式：实时快变量 ${realtimePayload.sourceMode || '--'}，执行状态灯为 ${levelLabel}。先看状态灯，再决定能不能动。`;
  next.summary = `v24.1 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${fmtNumSafe(brent,1)}、美元 ${fmtNumSafe(dxy,2)}、VIX ${fmtNumSafe(vix,2)}、HY OAS ${fmtNumSafe(hy,2)}%。`;
  next.recovery = {
    degradedMode: !!realtimePayload.degradedMode,
    safeOutput: true,
    lastRun: realtimePayload.updatedAt || next.updatedAt,
    notes: realtimePayload.notes || ['v24.1 快变量正常。']
  };

  return next;
}


function renderRealtimeStrip(realtime, metadata = null) {
  if (!realtime || !realtime.values) return;
  $('realtime-updated-at').textContent = realtime.asOf || realtime.updatedAt || '--';
  $('rt-brent').textContent = fmtNumSafe(realtime.values.brent, 1);
  $('rt-dxy').textContent = fmtNumSafe(realtime.values.dxy, 2);
  $('rt-vix').textContent = fmtNumSafe(realtime.values.vix, 2);
  $('rt-hy').textContent = fmtNumSafe(realtime.values.hyOas, 2);
  $('rt-us10y').textContent = fmtNumSafe(realtime.values.us10y, 2);
  $('rt-gold').textContent = fmtNumSafe(realtime.values.gold, 1);
  $('rt-spx').textContent = fmtNumSafe(realtime.values.spx, 0);
  $('rt-source-mode').textContent = realtime.degradedMode ? '部分回退' : '实时覆盖';
  if (metadata?.realtimeUnavailable) {
    $('rt-source-mode').textContent = 'baseline only';
  } else if (metadata) {
    const modeParts = [metadata.realtimeFreshnessLevel || realtime.freshnessLevel || 'fresh'];
    if (metadata.realtimeDegraded) modeParts.push('degraded');
    if (metadata.realtimeFallbackUsed) modeParts.push('local fallback');
    if (metadata.realtimeCacheOnly) modeParts.push('cache only');
    $('rt-source-mode').textContent = modeParts.join(' / ');
  }
  $('rt-brent-delta').textContent = fmtSigned(realtime.changes?.brent1d || 0);
  $('rt-dxy-delta').textContent = fmtSigned(realtime.changes?.dxy1d || 0);
  $('rt-vix-delta').textContent = fmtSigned(realtime.changes?.vix1d || 0);
  $('rt-hy-delta').textContent = fmtSigned(realtime.changes?.hyOas1d || 0);
  renderList('realtime-notes', realtime.notes || []);
}


function renderBars(containerId, items, isTrend = false) {
  const root = $(containerId);
  root.innerHTML = '';
  root.className = 'progress-group';
  items.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.className = 'progress-row';
    const trendNote = isTrend ? `<div class="progress-note">较上次 ${fmtSignedArrow(item.delta)}</div>` : '';
    wrap.innerHTML = `
      <div class="progress-top"><span>${item.label}</span><span>${item.value}%</span></div>
      <div class="progress-track"><div class="progress-fill ${item.mode || ''}" style="width:${item.value}%"></div></div>
      ${trendNote}
    `;
    root.appendChild(wrap);
  });
}


function renderExecutionLock(lock) {
  $('execution-lock-tag').textContent = lock.tag;
  $('execution-status-level').textContent = lock.levelLabel;
  $('execution-status-title').textContent = lock.title;
  $('execution-status-desc').textContent = lock.description;
  const pill = $('execution-status-level');
  pill.classList.remove('green', 'yellow', 'red');
  if (lock.level === 'green') pill.classList.add('green');
  else if (lock.level === 'yellow') pill.classList.add('yellow');
  else pill.classList.add('red');
  const allow = $('execution-allow');
  const block = $('execution-block');
  const mandatory = $('execution-mandatory');
  allow.className = 'bullet-list lock-allow';
  block.className = 'bullet-list lock-block';
  mandatory.className = 'bullet-list lock-mandatory';
  renderList('execution-allow', lock.allow || []);
  renderList('execution-block', lock.block || []);
  renderList('execution-mandatory', lock.mandatory || []);
}

function renderAssetTable(rows) {
  const body = $('asset-table-body');
  body.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('强')
      ? 'strong'
      : row.bias.includes('谨慎')
        ? 'cautious'
        : row.bias.includes('低配')
          ? 'underweight'
          : 'neutral';
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td>${row.score}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.reason}</td>
    `;
    body.appendChild(tr);
  });
}

function renderAssetReturnMap(mapData) {
  $('return-map-horizon').textContent = mapData.horizon;
  const body = $('asset-return-body');
  body.innerHTML = '';
  const convictionRank = { '高': 4, '中高': 3, '中': 2, '中低': 1, '低': 0 };
  const biasRank = (bias) => {
    if ((bias || '').includes('偏多') || (bias || '') === '偏多') return 3;
    if ((bias || '').includes('中性偏多')) return 2.5;
    if ((bias || '').includes('中性')) return 2;
    if ((bias || '').includes('中性偏空')) return 1.5;
    if ((bias || '').includes('偏空')) return 1;
    return 0;
  };
  [...mapData.rows].sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? a.priority : (convictionRank[a.conviction] || 0) * 10 + biasRank(a.bias);
    const pb = Number.isFinite(b.priority) ? b.priority : (convictionRank[b.conviction] || 0) * 10 + biasRank(b.bias);
    return pb - pa;
  }).forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('偏多') || row.bias.includes('多')
      ? 'strong'
      : row.bias.includes('偏空') || row.bias.includes('空')
        ? 'underweight'
        : 'neutral';
    const drivers = (row.drivers || []).map((d) => `<span class="asset-driver-chip">${d}</span>`).join('');
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.expected}</td>
      <td>${row.drawdown}</td>
      <td>${row.conviction}</td>
      <td class="return-driver-cell">${drivers || '—'}</td>
      <td>${row.note}</td>
    `;
    body.appendChild(tr);
  });
}

function renderList(id, items) {
  const root = $(id);
  root.innerHTML = '';
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    root.appendChild(li);
  });
}

function renderScenarioTree(items) {
  const root = $('scenario-list');
  root.innerHTML = '';
  items.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'scenario-card';
    node.innerHTML = `
      <div class="scenario-title">${item.name} · ${item.probability}%</div>
      <div class="scenario-meta">${item.description}</div>
      <div><strong>触发条件：</strong>${item.triggers}</div>
      <div style="margin-top:8px;"><strong>资产表现：</strong>${item.assets}</div>
    `;
    root.appendChild(node);
  });
}

function renderLineChart(svgId, history, opts = {}) {
  const svg = $(svgId);
  const width = opts.width || 760;
  const height = opts.height || 220;
  const pad = opts.pad || { top: 18, right: 18, bottom: 34, left: 46 };
  const values = history.map((d) => d.score);
  const dates = history.map((d) => d.date.slice(5));
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const x = (i) => pad.left + (i * (width - pad.left - pad.right)) / Math.max(1, history.length - 1);
  const y = (v) => height - pad.bottom - ((v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const line = history.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.score)}`).join(' ');
  const area = `${line} L ${x(history.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`;

  const gridValues = [min, Math.round((min + max) / 2), max];
  const grid = gridValues.map((g) => `
    <line class="gridline" x1="${pad.left}" y1="${y(g)}" x2="${width - pad.right}" y2="${y(g)}"></line>
    <text x="${pad.left - 10}" y="${y(g) + 4}" text-anchor="end">${g}</text>
  `).join('');

  const labelEvery = history.length > 10 ? 3 : 1;
  const labels = dates.map((d, i) => i % labelEvery === 0 || i === history.length - 1
    ? `<text x="${x(i)}" y="${height - 12}" text-anchor="middle">${d}</text>`
    : '').join('');
  const points = history.map((d, i) => `<circle class="point" cx="${x(i)}" cy="${y(d.score)}" r="${history.length > 10 ? 3.5 : 5}"></circle>`).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="${svgId}-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6ebeff"></stop>
        <stop offset="100%" stop-color="#6ebeff" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    ${grid}
    <path class="area" d="${area}" fill="url(#${svgId}-gradient)" opacity="0.24"></path>
    <path class="series" d="${line}"></path>
    ${points}
    ${labels}
  `;
}

function wrapSvgText(text, maxChars = 10) {
  const safe = String(text || '');
  const chunks = [];
  for (let i = 0; i < safe.length; i += maxChars) chunks.push(safe.slice(i, i + maxChars));
  return chunks;
}

function renderHeatmap(regions) {
  const svg = $('world-heatmap');
  const list = $('heatmap-list');
  list.innerHTML = '';

  const layout = {
    us: { x: 34, y: 108, w: 182, h: 90 },
    latam: { x: 118, y: 228, w: 118, h: 104 },
    europe: { x: 292, y: 78, w: 130, h: 78 },
    middleEast: { x: 430, y: 140, w: 136, h: 88 },
    china: { x: 592, y: 104, w: 132, h: 92 },
    japan: { x: 672, y: 206, w: 86, h: 70 },
    emAsia: { x: 548, y: 232, w: 126, h: 84 }
  };

  svg.innerHTML = `
    <rect x="12" y="20" width="756" height="330" rx="24" fill="rgba(8, 20, 39, 0.65)" stroke="rgba(133,164,229,0.14)"></rect>
    <text class="heat-label" x="44" y="48">区域风险集中度</text>
  `;

  regions.forEach((region) => {
    const spec = layout[region.key];
    if (!spec) return;
    const color = riskColor(region.risk);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `
      <rect class="heat-region" x="${spec.x}" y="${spec.y}" width="${spec.w}" height="${spec.h}" rx="20" fill="${color}" fill-opacity="0.82"></rect>
      <text class="heat-label" x="${spec.x + 12}" y="${spec.y + 32}">${region.shortLabel}</text>
      <text class="heat-score" x="${spec.x + 12}" y="${spec.y + 58}">风险 ${region.risk}</text>
    `;
    svg.appendChild(g);

    const item = document.createElement('div');
    item.className = 'heatmap-item';
    item.innerHTML = `
      <span class="swatch" style="background:${color}"></span>
      <div class="swatch-label"><strong>${region.label}</strong><span>${region.note}</span></div>
      <strong>${region.risk}</strong>
    `;
    list.appendChild(item);
  });
}

function renderTransmission(chain) {
  $('chain-regime-tag').textContent = chain.regimeTag;
  $('chain-stress-score').textContent = chain.stressScore;
  $('chain-lead-shock').textContent = chain.leadShock;
  $('chain-confidence').textContent = `${chain.pathConfidence}%`;
  $('chain-dominant-impact').textContent = chain.dominantImpact;

  const flow = $('chain-flow');
  flow.innerHTML = '';
  chain.nodes.forEach((node) => {
    const color = riskColor(node.score);
    const card = document.createElement('div');
    card.className = 'chain-node';
    const deltaClass = node.delta > 0 ? 'up' : node.delta < 0 ? 'down' : 'flat';
    const deltaText = `${Number.isFinite(node.delta) ? `${node.delta > 0 ? '+' : ''}${node.delta}` : '--'}`;
    card.innerHTML = `
      <div class="chain-node-top">
        <div class="chain-node-title">${node.label}</div>
        <div class="chain-node-score">${node.score}</div>
      </div>
      <div class="chain-node-meta">
        <div class="chain-node-direction">${node.directionLabel}</div>
        <div class="chain-delta ${deltaClass}">Δ ${deltaText}</div>
      </div>
      <div class="chain-node-bar"><div class="chain-node-fill" style="width:${node.score}%; background:${color}"></div></div>
      <div class="chain-node-note">${node.note}</div>
    `;
    flow.appendChild(card);
  });

  const layers = $('chain-layers');
  layers.innerHTML = '';
  chain.layers.forEach((layer) => {
    const div = document.createElement('div');
    div.className = 'chain-layer-card';
    div.innerHTML = `
      <div class="chain-layer-title"><span>${layer.name}</span><span>${layer.score}</span></div>
      <div class="chain-layer-tags">${layer.items.map((item) => `<span class="chain-tag">${item}</span>`).join('')}</div>
    `;
    layers.appendChild(div);
  });

  const decomp = $('chain-decomposition');
  decomp.innerHTML = '';
  chain.decomposition.forEach((asset) => {
    const card = document.createElement('div');
    card.className = 'decomp-card';
    card.innerHTML = `<div class="decomp-title"><span>${asset.asset}</span><span>${asset.total}</span></div>`;
    asset.drivers.forEach((driver) => {
      const row = document.createElement('div');
      row.className = 'decomp-row';
      row.innerHTML = `
        <span>${driver.label}</span>
        <div class="decomp-bar"><div class="decomp-fill" style="width:${driver.value}%"></div></div>
        <strong>${driver.value}</strong>
      `;
      card.appendChild(row);
    });
    decomp.appendChild(card);
  });

  renderList('chain-summary', chain.summary);

  const impacts = $('chain-asset-impacts');
  impacts.innerHTML = '';
  chain.assetImpacts.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'chain-impact-item';
    div.innerHTML = `
      <strong>${item.asset}</strong>
      <span class="chain-impact-direction ${item.directionClass}">${item.directionLabel}</span>
      <span class="chain-impact-score">${item.score}</span>
    `;
    impacts.appendChild(div);
  });
}


function renderSignalEngine(signal) {
  $('signal-strength').textContent = signal.strength;
  $('signal-direction').textContent = signal.direction;
  $('signal-consistency').textContent = signal.consistency;
  $('signal-macro').textContent = signal.macroSignal;
  $('signal-liquidity-chain').textContent = `${signal.liquiditySignal} / ${signal.chainSignal}`;
  renderList('signal-notes', signal.notes || []);
}

function renderActionLayer(action) {
  $('action-tag').textContent = action.tag;
  $('today-action').textContent = action.todayAction;
  $('action-priority').textContent = action.priorityLine || '执行优先级：先减风险，再做微调，最后观察确认。';
  const allow = $('action-allow');
  const avoid = $('action-avoid');
  const watch = $('action-watch');
  allow.className = 'bullet-list action-checklist';
  avoid.className = 'bullet-list action-blocklist';
  watch.className = 'bullet-list threshold-list';
  renderList('action-allow', action.checklist || []);
  renderList('action-avoid', action.blocked || []);
  renderList('action-watch', action.checkpoints || []);
}

function renderPositioning(position) {
  $('position-regime').textContent = position.regime;
  $('position-risk-budget').textContent = position.riskBudget;
  $('position-gross-exposure').textContent = position.targetGrossExposure;
  $('position-cash-buffer').textContent = position.cashBufferTarget;
  const body = $('position-core-body');
  body.innerHTML = '';
  (position.coreAllocations || []).forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.asset}${item.target ? `<span class="position-target-chip">${item.target}</span>` : ''}</td>
      <td>${item.weight}</td>
      <td>${item.reason}</td>
    `;
    body.appendChild(tr);
  });
  renderList('position-restrictions', position.executionRestrictions || []);
}

function renderRiskControl(risk) {
  $('risk-status').textContent = risk.status;
  $('risk-max-drawdown').textContent = risk.maxDrawdown;
  $('risk-single-asset-max').textContent = risk.singleAssetMax;
  $('risk-system-state').textContent = risk.systemState;
  const deRisk = $('risk-de-risk-triggers');
  const stopRules = $('risk-stop-rules');
  deRisk.className = 'bullet-list threshold-list';
  stopRules.className = 'bullet-list threshold-list';
  renderList('risk-de-risk-triggers', risk.hardThresholds || []);
  renderList('risk-stop-rules', risk.resetThresholds || []);
}

function renderDiscipline(discipline) {
  $('discipline-tag').textContent = discipline.tag;
  renderList('discipline-entry', discipline.entryConditions || []);
  renderList('discipline-prohibited', discipline.prohibitedBehaviors || []);
  renderList('discipline-mandatory', discipline.mandatoryRules || []);
}

function renderWarningSystem(warning) {
  $('warning-status').textContent = warning.status;
  $('warning-critical-count').textContent = warning.criticalCount;
  $('warning-warning-count').textContent = warning.warningCount;
  $('warning-watch-count').textContent = warning.watchCount;
  const root = $('warning-alert-list');
  root.innerHTML = '';
  const order = { '红色': 0, '橙色': 1, '黄色': 2 };
  [...warning.alerts].sort((a, b) => order[a.level] - order[b.level]).forEach((alert, idx) => {
    const levelClass = alert.level === '红色' ? 'danger' : alert.level === '橙色' ? 'warning' : 'watch';
    const div = document.createElement('div');
    div.className = `warning-card ${levelClass}`;
    div.innerHTML = `
      <div class="warning-card-top">
        <span class="badge ${levelClass === 'danger' ? 'underweight' : levelClass === 'warning' ? 'cautious' : 'neutral'}">${alert.level}</span>
        <strong>${alert.title}</strong>
        <span class="warning-time">${alert.triggeredAgo || '触发时间待补充'}</span>
        <span class="warning-level-order">优先级 ${idx + 1}</span>
      </div>
      <div class="warning-driver">主导驱动：${alert.driver || '综合风险条件'}</div>
      <div class="warning-line"><span>条件</span><span>${alert.condition}</span></div>
      <div class="warning-line"><span>动作</span><span>${alert.action}</span></div>
    `;
    root.appendChild(div);
  });
  const rules = $('warning-rules');
  rules.innerHTML = '';
  warning.rules.forEach((rule) => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    div.textContent = rule;
    rules.appendChild(div);
  });
}

async function main() {
  const [baseline, history, realtimeResult] = await Promise.all([
    fetchBaselineData(),
    fetchHistoryData(),
    fetchRealtimePayload()
  ]);

  const runtimeState = buildRuntimeState(baseline, history, realtimeResult);
  const data = runtimeState.data;
  const realtime = runtimeState.realtimePayload;
  const metadata = runtimeState.runtimeMetadata;

  if (metadata.realtimeOverlayEnabled && realtime?.values) {
    renderRealtimeStrip(realtime, metadata);
    $('runtime-badge').textContent = metadata.realtimeFallbackUsed
      ? '快变量来自本地 fallback'
      : realtime.degradedMode
        ? '快变量部分降级 / 慢变量正常'
        : '快变量已实时覆盖';
  } else {
    $('runtime-badge').textContent = metadata.realtimeFetchFailed ? '当前处于基线模式 / realtime 不可用' : '当前处于基线模式';
  }
  if (!metadata.realtimeOverlayEnabled) {
    $('rt-source-mode').textContent = 'baseline only';
  }
  $('runtime-badge').textContent = metadata.realtimeStatusLabel;
  $('overview-date').textContent = data.updatedAt.slice(0, 10);
  $('decision-line').textContent = data.decisionLine || '当前以防守型决策为主，等待更明确的宽松与增长信号。';
  $('summary-text').textContent = data.summary;
  $('global-score').textContent = data.score;
  $('macro-regime').textContent = data.currentMacroRegime;
  $('crisis-phase').textContent = data.currentCrisisPhase;
  $('confidence-level').textContent = data.confidenceLevel;
  $('trend-label').textContent = data.trendLabel;
  $('score-change-1d').textContent = fmtSignedArrow(data.scoreChange1d);
  $('score-change-7d').textContent = fmtSignedArrow(data.scoreChange7d);
  $('phase-current').textContent = data.currentCrisisPhase;
  $('phase-next').textContent = data.nextCrisisPhase;
  $('phase-transition').textContent = `${data.transitionRisk}%`;
  $('confidence-score').textContent = data.confidenceScore;
  $('confidence-level-bottom').textContent = data.confidenceLevel;
  $('degraded-mode').textContent = data.recovery.degradedMode ? '是' : '否';
  $('safe-output').textContent = data.recovery.safeOutput ? '是' : '否';
  $('last-run').textContent = data.recovery.lastRun;
  $('liquidity-score').textContent = data.liquidityIndex.score;
  $('liquidity-regime').textContent = data.liquidityIndex.regime;
  $('liquidity-change').textContent = fmtSignedArrow(data.liquidityIndex.change1d);
  $('liquidity-direction').textContent = data.liquidityIndex.directionLabel;

  $('score-change-30d').textContent = fmtSignedArrow(data.timeDimension.scoreChange30d);
  $('avg-30d').textContent = data.timeDimension.avg30d;
  $('range-30d').textContent = `${data.timeDimension.peak30d} / ${data.timeDimension.trough30d}`;
  $('draw-from-peak').textContent = fmtSignedArrow(data.timeDimension.drawFromPeak);
  $('transmission-speed').textContent = data.timeDimension.transmissionSpeed;
  $('transmission-acceleration').textContent = data.timeDimension.transmissionAcceleration;
  $('time-dominant-path').textContent = data.timeDimension.dominantPath;
  $('trend-explanation').textContent = data.timeDimension.trendExplanation;

  renderList('top-risks', data.topRisks);
  renderList('phase-signals', data.phaseSignals);
  renderList('trigger-critical', data.triggerPanel.critical);
  renderList('trigger-drivers', data.triggerPanel.drivers);
  renderList('trigger-watchlist', data.triggerPanel.watchlist);
  renderList('confidence-notes', data.confidenceNotes);
  renderList('recovery-notes', data.recovery.notes);
  renderList('liquidity-notes', data.liquidityIndex.notes);
  renderList('time-notes', data.timeDimension.notes);

  const moduleLabelMap = {
    geopolitical: '地缘政治', energy: '能源', inflation: '通胀', liquidity: '流动性', debt: '债务', banking: '银行'
  };
  renderBars('module-bars', Object.entries(data.modules).map(([key, value]) => ({
    label: moduleLabelMap[key] || key,
    value,
    delta: data.moduleTrends[key],
    mode: trendClass(data.moduleTrends[key])
  })), true);

  renderBars('regime-bars', [
    ['通缩增长', data.regimeProbabilities.disinflationaryGrowth],
    ['流动性多头', data.regimeProbabilities.liquidityBull],
    ['滞胀冲击', data.regimeProbabilities.stagflationShock],
    ['危机式流动性挤压', data.regimeProbabilities.crisisLiquiditySqueeze],
    ['货币贬值', data.regimeProbabilities.monetaryDebasement],
    ['通缩衰退', data.regimeProbabilities.deflationaryBust]
  ].map(([label, value]) => ({ label, value })));

  renderBars('liquidity-pillars', data.liquidityIndex.pillars.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderBars('path-change-bars', data.timeDimension.pathChanges.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderLineChart('trend-chart', history.slice(-7), { width: 760, height: 220, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderLineChart('trend-chart-30d', history, { width: 980, height: 260, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderHeatmap(data.heatmap);
  renderTransmission(data.transmissionChain);
  renderExecutionLock(data.tradingSystem.executionLock);
  renderSignalEngine(data.tradingSystem.signalEngine);
  renderActionLayer(data.tradingSystem.actionLayer);
  renderPositioning(data.tradingSystem.positioning);
  renderRiskControl(data.tradingSystem.riskControl);
  renderDiscipline(data.tradingSystem.discipline);
  renderWarningSystem(data.warningSystem);
  renderAssetReturnMap(data.assetReturnMap);
  renderAssetTable(data.assetMatrix);
  renderScenarioTree(data.scenarioTree);
}

main().catch((error) => {
  console.error(error);
  $('runtime-badge').textContent = '加载失败';
  $('summary-text').textContent = `风险数据加载失败：${error.message}`;
});
