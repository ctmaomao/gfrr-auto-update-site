const dataUrl = './data/radar-data.json';
const historyUrl = './data/radar-history.json';
const realtimeUrl = './realtime/market.json';

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

function computeRealtimeOverlay(base, realtime) {
  if (!realtime || !realtime.values) return base;

  const next = structuredClone(base);
  next.realtime = realtime;

  const brent = Number(realtime.values.brent || 0);
  const dxy = Number(realtime.values.dxy || 0);
  const vix = Number(realtime.values.vix || 0);
  const hy = Number(realtime.values.hyOas || 0);
  const us10y = Number(realtime.values.us10y || 0);
  const real10y = Number(realtime.values.real10y || 0);
  const gold = Number(realtime.values.gold || 0);
  const spx = Number(realtime.values.spx || 0);
  const breakeven10y = Number(realtime.values.breakeven10y || 0);

  const oilRisk = Math.max(0, Math.min(100, Math.round((brent - 60) * 2)));
  const dollarRisk = Math.max(0, Math.min(100, Math.round((dxy - 95) * 8)));
  const hyRisk = Math.max(0, Math.min(100, Math.round((hy - 2.5) * 35)));
  const vixRisk = Math.max(0, Math.min(100, Math.round((vix - 12) * 7)));
  const rateRisk = Math.max(0, Math.min(100, Math.round((us10y - 2.5) * 22)));
  const realRisk = Math.max(0, Math.min(100, Math.round((real10y - 0.5) * 33)));
  const inflationRisk = Math.max(0, Math.min(100, Math.round(((breakeven10y || 2.2) - 1.5) * 45 + oilRisk * 0.35)));
  const spxRisk = Math.max(0, Math.min(100, Math.round((5300 - spx) / 6)));

  next.modules.geopolitical = Math.max(0, Math.min(100, Math.round((next.modules.geopolitical * 0.4) + (oilRisk * 0.45) + (vixRisk * 0.15))));
  next.modules.energy = Math.max(0, Math.min(100, Math.round((next.modules.energy * 0.25) + oilRisk * 0.75)));
  next.modules.inflation = Math.max(0, Math.min(100, Math.round((next.modules.inflation * 0.25) + inflationRisk * 0.75)));
  next.modules.liquidity = Math.max(0, Math.min(100, Math.round((next.modules.liquidity * 0.2) + dollarRisk * 0.3 + hyRisk * 0.3 + vixRisk * 0.12 + rateRisk * 0.08)));
  next.modules.debt = Math.max(0, Math.min(100, Math.round((next.modules.debt * 0.25) + realRisk * 0.45 + rateRisk * 0.25 + hyRisk * 0.05)));
  next.modules.banking = Math.max(0, Math.min(100, Math.round((next.modules.banking * 0.2) + hyRisk * 0.55 + vixRisk * 0.2 + dollarRisk * 0.05)));

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
  next.liquidityIndex.directionLabel = realtime.cacheOnly ? '快变量缓存模式' : realtime.degradedMode ? '快变量带回退' : '快变量已实时覆盖';
  next.liquidityIndex.notes = [
    `实时快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`,
    `数据模式：${realtime.sourceMode || 'unknown'} / 健康分数：${realtime.healthScore ?? '--'} / 关键缺失：${realtime.criticalMissing ?? 0}。`,
    ...(realtime.notes || [])
  ];

  const hardStop = realtime.cacheOnly || next.modules.liquidity >= 75 || brent >= 110 || hy >= 4.5 || vix >= 28 || totalScore >= 82;
  const caution = !hardStop && (realtime.degradedMode || next.modules.liquidity >= 60 || brent >= 90 || hy >= 3.7 || vix >= 20 || totalScore >= 65);

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
    desc = realtime.cacheOnly
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
    tag: realtime.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtime.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
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
    consistency: realtime.cacheOnly ? '低一致性（缓存）' : realtime.degradedMode ? '中一致性（回退）' : '高一致性',
    macroSignal: totalScore >= 70 ? '滞胀冲击' : totalScore >= 55 ? '流动性偏紧' : '通胀回落增长',
    liquiditySignal: `${next.liquidityIndex.regime}（实时）`,
    chainSignal: next.modules.energy >= next.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
    notes: [
      `执行引擎状态：${levelLabel}。`,
      `关键快变量：Brent ${fmtNumSafe(brent,1)} / DXY ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY ${fmtNumSafe(hy,2)}。`,
      `健康度 ${realtime.healthScore ?? '--'}，关键缺失 ${realtime.criticalMissing ?? 0}。`
    ]
  };

  next.topRisks = [
    `盘中快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `执行状态灯：${levelLabel}。`,
    realtime.cacheOnly ? '当前为缓存模式，系统自动提升防守等级。' : realtime.degradedMode ? '当前为带回退实时模式，少量数据已回退但系统继续运行。' : '当前为实时模式，快变量直接驱动信号与仓位。',
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`
  ];

  next.decisionLine = `当前已进入 v24.1 交易引擎模式：实时快变量 ${realtime.sourceMode || '--'}，执行状态灯为 ${levelLabel}。先看状态灯，再决定能不能动。`;
  next.summary = `v24.1 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${fmtNumSafe(brent,1)}、美元 ${fmtNumSafe(dxy,2)}、VIX ${fmtNumSafe(vix,2)}、HY OAS ${fmtNumSafe(hy,2)}%。`;
  next.recovery = {
    degradedMode: !!realtime.degradedMode,
    safeOutput: true,
    lastRun: realtime.updatedAt || next.updatedAt,
    notes: realtime.notes || ['v24.1 快变量正常。']
  };

  return next;
}
