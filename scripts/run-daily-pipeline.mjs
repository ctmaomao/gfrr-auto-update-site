import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const rulesPath = path.join(root, 'config', 'rules.json');
const RULES = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const R = RULES;
const dataDir = path.join(root, 'data');
const dataPath = path.join(dataDir, 'radar-data.json');
const histPath = path.join(dataDir, 'radar-history.json');
const rtPath = path.join(root, 'realtime', 'market.json');

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const isoNow = new Date().toISOString();

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const prevData = readJson(dataPath, {});
const prevHistory = readJson(histPath, []);
const realtime = readJson(rtPath, null);

function buildFallback() {
  const next = structuredClone(prevData);
  next.version = 'v26.0A-rc1';
  next.updatedAt = isoNow;
  next.decisionLine = '实时快变量暂不可用，系统沿用上次有效慢变量结构，但保留今日更新时间戳。';
  next.summary = 'v24.1 日构建已退回到上次有效慢变量结构。';
  next.recovery = {
    degradedMode: true,
    safeOutput: true,
    lastRun: isoNow,
    notes: ['Build Daily Radar Data 未拿到可用 realtime 快照，已回退到上次有效结果。']
  };
  return { data: next, history: prevHistory };
}

function deriveRisk(rt) {
  const v = rt.values || {};
  const brent = v.brent ?? R.defaults.brent;
  const dxy = v.dxy ?? R.defaults.dxy;
  const vix = v.vix ?? R.defaults.vix;
  const hy = v.hyOas ?? R.defaults.hyOas;
  const us10y = v.us10y ?? R.defaults.us10y;
  const real10y = v.real10y ?? R.defaults.real10y;
  const breakeven = v.breakeven10y ?? R.defaults.breakeven10y;
  const spx = v.spx ?? R.defaults.spx;
  const gold = v.gold ?? R.defaults.gold;

  const rb = R.riskBaselines;
  const oilRisk = clamp((brent - rb.brentBase) * rb.brentScale);
  const dollarRisk = clamp((dxy - rb.dxyBase) * rb.dxyScale);
  const hyRisk = clamp((hy - rb.hyBase) * rb.hyScale);
  const vixRisk = clamp((vix - rb.vixBase) * rb.vixScale);
  const rateRisk = clamp((us10y - rb.us10yBase) * rb.us10yScale);
  const realRisk = clamp((real10y - rb.real10yBase) * rb.real10yScale);
  const inflationRisk = clamp((breakeven - rb.breakevenBase) * rb.breakevenScale + oilRisk * rb.oilInflationWeight);
  const spxRisk = clamp((5300 - spx) / 6);

  const modules = {
    geopolitical: clamp((oilRisk * 0.72) + (vixRisk * 0.28)),
    energy: clamp((oilRisk * 0.82) + Math.max(0, rt.changes?.brent1d || 0) * 2),
    inflation: clamp((inflationRisk * 0.72) + (realRisk * 0.08)),
    liquidity: clamp((dollarRisk * 0.35) + (hyRisk * 0.35) + (vixRisk * 0.18) + (rateRisk * 0.12)),
    debt: clamp((realRisk * 0.45) + (rateRisk * 0.3) + (hyRisk * 0.25)),
    banking: clamp((hyRisk * 0.55) + (vixRisk * 0.2) + (dollarRisk * 0.25))
  };
  const mw = R.moduleWeights;
  const score = clamp(
    modules.geopolitical * mw.geopolitical +
    modules.energy * mw.energy +
    modules.inflation * mw.inflation +
    modules.liquidity * mw.liquidity +
    modules.debt * mw.debt +
    modules.banking * mw.banking
  );
  return { modules, score, oilRisk, dollarRisk, hyRisk, vixRisk, rateRisk, realRisk, inflationRisk, spxRisk, brent, dxy, vix, hy, us10y, real10y, breakeven, spx, gold };
}

function regimeProb(score, risk) {
  const raw = {
    disinflationaryGrowth: Math.max(1, 120 - risk.inflationRisk - risk.hyRisk),
    liquidityBull: Math.max(1, 115 - risk.dollarRisk - risk.vixRisk),
    stagflationShock: Math.max(1, risk.oilRisk + risk.inflationRisk),
    crisisLiquiditySqueeze: Math.max(1, risk.hyRisk + risk.dollarRisk + risk.vixRisk),
    monetaryDebasement: Math.max(1, risk.inflationRisk + (100 - risk.realRisk)),
    deflationaryBust: Math.max(1, risk.hyRisk + risk.vixRisk + risk.spxRisk)
  };
  const sum = Object.values(raw).reduce((a,b)=>a+b,0);
  const probs = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, clamp(v/sum*100)]));
  probs.stagflationShock = clamp(100 - (probs.disinflationaryGrowth+probs.liquidityBull+probs.crisisLiquiditySqueeze+probs.monetaryDebasement+probs.deflationaryBust));
  return probs;
}

function regimeLabel(probs) {
  const labels = { disinflationaryGrowth:'通胀回落增长', liquidityBull:'流动性多头', stagflationShock:'滞胀冲击', crisisLiquiditySqueeze:'流动性偏紧', monetaryDebasement:'货币贬值', deflationaryBust:'通缩衰退' };
  return labels[Object.entries(probs).sort((a,b)=>b[1]-a[1])[0][0]];
}

function lockEngine(score, risk, rt) {
  const el = R.executionLock;
  const criticalDown = (rt.criticalMissing ?? 0) >= el.red.criticalMissingThreshold || (rt.cacheOnly ?? false);
  if (criticalDown || score >= el.red.scoreThreshold || risk.brent >= el.red.brentThreshold || risk.hy >= el.red.hyThreshold || risk.vix >= el.red.vixThreshold) {
    return {
      level:'red',
      levelLabel:'RED / 禁止新增',
      title:'今天禁止主动加仓，只允许减仓与恢复防御层',
      description:'系统检测到高压风险组合，执行引擎已锁定为 RED。任何新增风险仓位均被禁止，只允许减仓、防守和补充现金。',
      gross:'38%',
      cash:'35%',
      riskBudget:'30%',
      allow:['允许减仓风险资产。','允许补充美元/短票与现金。','允许把黄金对冲恢复到上限。'],
      block:['禁止新增股票与高Beta仓位。','禁止盘中追涨。','禁止主观覆盖系统阈值。'],
      mandatory:['若总仓位高于 42%，必须先减到 38% 附近。','若科技/高Beta > 2%，立即降回 2% 以下。','若现金缓冲 < 30%，立即补回。'],
      actionText:'执行引擎锁定：禁止新增，只允许减仓与防守恢复。'
    };
  }
  if (score >= el.yellow.scoreThreshold || risk.brent >= el.yellow.brentThreshold || risk.hy >= el.yellow.hyThreshold || risk.vix >= el.yellow.vixThreshold) {
    return {
      level:'yellow',
      levelLabel:'YELLOW / 仅允许微调',
      title:'今天不能主动加风险，只允许对齐目标仓位与防守再平衡',
      description:'风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。',
      gross:'48%',
      cash:'27%',
      riskBudget:'40%',
      allow:['允许把总仓位向 48% 靠拢。','允许维持能源、美元/短票、黄金对冲层。','允许保留防御型股票观察仓。'],
      block:['禁止新增高Beta与久期进攻仓位。','禁止因为单日反弹而加仓。','禁止无视执行状态灯。'],
      mandatory:['若总仓位高于 53%，先减仓。','若科技/高Beta > 3%，降回上限以内。','若现金缓冲 < 25%，恢复到安全区间。'],
      actionText:'执行引擎锁定：只允许微调，不允许扩大风险暴露。'
    };
  }
  return {
    level:'green',
    levelLabel:'GREEN / 允许分批进攻',
    title:'今天允许小幅加仓，但必须按纪律分批执行',
    description:'风险组合回到可控区，执行引擎允许提高风险暴露，但必须分批、限额，并保留最低现金缓冲。',
    gross:'58%',
    cash:'20%',
    riskBudget:'50%',
    allow:['允许分三笔内提高总仓位。','允许增加质量权益和部分成长观察仓。','允许降低部分美元/短票。'],
    block:['禁止一次性打满仓位。','禁止在单日大涨后追高。','禁止取消防守底仓。'],
    mandatory:['任何新增仓位都必须分批完成。','若状态灯重新转黄，次日停止加仓。','若周回撤超过 -3%，回到 YELLOW 纪律。'],
    actionText:'执行引擎开放：允许分批进攻，但不得破坏现金缓冲与止损纪律。'
  };
}

function targetAllocations(lock, risk) {
  if (lock.level === 'red') {
    return [
      { asset:'美元 / 短票', target:'核心1', weight:'24%', reason:'融资与信用压力阶段的首要防御层。' },
      { asset:'现金', target:'缓冲层', weight:'35%', reason:'执行引擎 RED，现金缓冲必须充足。' },
      { asset:'黄金', target:'对冲', weight:'12%', reason:'用于对冲尾部风险和政策不确定性。' },
      { asset:'原油 / 能源', target:'防守受益', weight:'12%', reason:'油价偏高时继续保留。' },
      { asset:'股票（防御）', target:'观察仓', weight:'5%', reason:'仅保留最低防御仓。' }
    ];
  }
  if (lock.level === 'yellow') {
    return [
      { asset:'原油 / 能源', target:'核心1', weight:'20%', reason:'主链条仍偏向能源与通胀输入。' },
      { asset:'美元 / 短票', target:'核心2', weight:'18%', reason:'流动性偏紧阶段的稳定防御层。' },
      { asset:'黄金', target:'对冲', weight:'10%', reason:'对冲政策与通胀不确定性。' },
      { asset:'股票（防御板块）', target:'观察仓', weight:'8%', reason:'只保留低波动、现金流型权益。' },
      { asset:'科技 / 高Beta', target:'限制仓', weight:'0%-3%', reason:'不允许成为进攻主仓。' }
    ];
  }
  return [
    { asset:'股票（质量+防御）', target:'核心1', weight:'24%', reason:'风险回到可控区后恢复权益暴露。' },
    { asset:'原油 / 能源', target:'核心2', weight:'16%', reason:'保留主链条防守属性。' },
    { asset:'黄金', target:'对冲', weight:'8%', reason:'保留尾部对冲。' },
    { asset:'美元 / 短票', target:'缓冲层', weight:'12%', reason:'保留机动空间。' }
  ];
}

function appendHistory(prevHistory, score) {
  const today = isoNow.slice(0, 10);
  const history = Array.isArray(prevHistory) ? [...prevHistory] : [];
  if (history.length && history[history.length - 1].date === today) {
    history[history.length - 1].score = score;
  } else {
    history.push({ date: today, score });
  }
  return history.slice(-90);
}

function build() {
  if (!realtime || !realtime.values) return buildFallback();

  const risk = deriveRisk(realtime);
  const history = appendHistory(prevHistory, risk.score);
  const scoreChange1d = history.length >= 2 ? risk.score - history[history.length - 2].score : 0;
  const scoreChange7d = history.length >= 8 ? risk.score - history[history.length - 8].score : 0;
  const scoreChange30d = history.length >= 30 ? risk.score - history[Math.max(0, history.length - 30)].score : scoreChange7d;
  const avg30d = clamp(avg(history.slice(-30).map(x => x.score)));
  const peak30d = Math.max(...history.slice(-30).map(x => x.score));
  const trough30d = Math.min(...history.slice(-30).map(x => x.score));
  const probs = regimeProb(risk.score, risk);
  const macro = regimeLabel(probs);
  const phase = risk.modules.liquidity >= 70 ? '流动性偏紧' : risk.modules.energy >= 75 ? '通胀冲击' : '风险缓和';
  const lock = lockEngine(risk.score, risk, realtime);
  const allocs = targetAllocations(lock, risk);

  const topRisks = [
    `布伦特 ${risk.brent.toFixed(1)} 美元，能源链条仍在传导。`,
    `广义美元 ${risk.dxy.toFixed(2)}，融资环境尚未明显放松。`,
    `HY OAS ${risk.hy.toFixed(2)}%，信用风险${risk.hy >= 4 ? '偏紧' : '可控但需观察'}。`,
    `10Y 美债 ${risk.us10y.toFixed(2)}%，实际利率 ${risk.real10y.toFixed(2)}%。`
  ];

  const data = {
    version:'v26.0A-rc1',
    updatedAt: isoNow,
    score:risk.score,
    scoreChange1d,
    scoreChange7d,
    scoreChange30d,
    trendLabel: scoreChange7d > R.trendThresholds.risingThreshold ? '风险上升' : scoreChange7d < R.trendThresholds.fallingThreshold ? '风险回落' : '高位震荡偏紧',
    currentMacroRegime: macro,
    currentCrisisPhase: phase,
    nextCrisisPhase: phase === '流动性偏紧' ? '政策应对' : '风险缓和',
    transitionRisk: clamp(avg([risk.modules.liquidity, risk.hyRisk, risk.vixRisk])),
    confidenceScore: clamp(100 - (realtime.criticalMissing ?? 0) * R.confidenceScoring.criticalMissingPenalty - (realtime.fallbackCount ?? 0) * R.confidenceScoring.fallbackPenalty),
    confidenceLevel: (realtime.cacheOnly ? '低' : realtime.degradedMode ? '中' : '高'),
    topRisks,
    decisionLine: `当前已进入 v24.1 交易引擎模式：实时快变量 ${realtime.sourceMode}，执行状态灯为 ${lock.levelLabel}。先看状态灯，再决定能不能动。`,
    summary: `v24.1 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${risk.brent.toFixed(1)}、美元 ${risk.dxy.toFixed(2)}、VIX ${risk.vix.toFixed(2)}、HY OAS ${risk.hy.toFixed(2)}%。`,
    modules: risk.modules,
    moduleTrends: {
      geopolitical: clamp((realtime.changes?.brent1d ?? 0) * 2, -9, 9),
      energy: clamp((realtime.changes?.brent1d ?? 0) * 3, -9, 9),
      inflation: clamp((realtime.changes?.breakeven10y1d ?? 0) * 20, -9, 9),
      liquidity: clamp(((realtime.changes?.dxy1d ?? 0) * 8) + ((realtime.changes?.hyOas1d ?? 0) * 10), -9, 9),
      debt: clamp(((realtime.changes?.us10y1d ?? 0) + (realtime.changes?.real10y1d ?? 0)) * 20, -9, 9),
      banking: clamp((realtime.changes?.hyOas1d ?? 0) * 12, -9, 9)
    },
    regimeProbabilities: probs,
    phaseSignals: [
      `实时输入：布伦特 ${risk.brent.toFixed(1)} / VIX ${risk.vix.toFixed(2)} / HY OAS ${risk.hy.toFixed(2)}%。`,
      `利率输入：10Y ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)} / 盈亏平衡通胀 ${risk.breakeven.toFixed(2)}%。`,
      `快变量状态：${realtime.sourceMode}，健康度 ${realtime.healthScore}。`
    ],
    liquidityIndex: {
      score:risk.modules.liquidity,
      regime:risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复',
      change1d: clamp(((realtime.changes?.dxy1d ?? 0) * 10) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9),
      directionLabel: realtime.cacheOnly ? '快变量缓存模式' : realtime.degradedMode ? '快变量带回退' : '快变量实时覆盖',
      notes: [
        `美元 ${risk.dxy.toFixed(2)} / HY OAS ${risk.hy.toFixed(2)} / VIX ${risk.vix.toFixed(2)} 为三大流动性输入。`,
        ...(realtime.notes || [])
      ],
      pillars: [
        { label:'美元融资', value: risk.dollarRisk, delta: clamp((realtime.changes?.dxy1d ?? 0) * 8, -9, 9) },
        { label:'跨资产波动', value: risk.vixRisk, delta: clamp((realtime.changes?.vix1d ?? 0) * 4, -9, 9) },
        { label:'信用 / 利差', value: risk.hyRisk, delta: clamp((realtime.changes?.hyOas1d ?? 0) * 10, -9, 9) },
        { label:'利率敏感压力', value: clamp(avg([risk.rateRisk, risk.realRisk])), delta: clamp(((realtime.changes?.us10y1d ?? 0) + (realtime.changes?.real10y1d ?? 0)) * 18, -9, 9) }
      ]
    },
    timeDimension: {
      trend30d:'滚动风险曲线（混合实时驱动）',
      scoreChange30d,
      avg30d,
      peak30d,
      trough30d,
      drawFromPeak: risk.score - peak30d,
      transmissionSpeed: clamp(avg([risk.modules.energy, risk.modules.inflation, risk.modules.liquidity])),
      transmissionAcceleration: scoreChange7d > R.trendThresholds.acceleratingThreshold ? '加快' : scoreChange7d < R.trendThresholds.deceleratingThreshold ? '放缓' : '平稳',
      dominantPath: risk.modules.energy >= risk.modules.liquidity ? '油价 → 通胀 → 利率 → 股票' : '美元 → 信用 → 流动性 → 股票',
      pathChanges: [
        { label:'油价→通胀', value: clamp(avg([risk.oilRisk, risk.inflationRisk])), delta: clamp((realtime.changes?.brent1d ?? 0) * 3, -9, 9) },
        { label:'通胀→利率', value: clamp(avg([risk.inflationRisk, risk.rateRisk])), delta: clamp((realtime.changes?.breakeven10y1d ?? 0) * 18, -9, 9) },
        { label:'美元→信用', value: clamp(avg([risk.dollarRisk, risk.hyRisk])), delta: clamp(((realtime.changes?.dxy1d ?? 0) * 8) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9) },
        { label:'利率→股票', value: clamp(avg([risk.rateRisk, risk.spxRisk])), delta: clamp(((realtime.changes?.us10y1d ?? 0) * 16) - ((realtime.changes?.spx1d ?? 0) / 20), -9, 9) },
        { label:'流动性→估值', value: clamp(avg([risk.modules.liquidity, risk.vixRisk])), delta: clamp(((realtime.changes?.vix1d ?? 0) * 3) + ((realtime.changes?.hyOas1d ?? 0) * 8), -9, 9) }
      ],
      notes: [
        `当前综合风险分数 ${risk.score}。`,
        `执行引擎状态：${lock.levelLabel}。`,
        `慢变量由 realtime 快照驱动重算，不再直接依赖外抓。`
      ]
    },
    heatmap: [
      { key:'us', label:'美国', shortLabel:'美国', risk: clamp(avg([risk.modules.inflation, risk.modules.debt, risk.modules.liquidity])), note:`融资偏紧 + 实际利率 ${risk.real10y.toFixed(2)}%` },
      { key:'europe', label:'欧洲', shortLabel:'欧洲', risk: clamp(avg([risk.modules.energy, risk.modules.banking])), note:'能源敏感 + 增长拖累' },
      { key:'middleeast', label:'中东', shortLabel:'中东', risk: risk.modules.geopolitical, note:'原油与地缘仍是主风险源' },
      { key:'china', label:'中国', shortLabel:'中国', risk: clamp(avg([risk.modules.debt * 0.4, risk.modules.liquidity * 0.6])), note:'外需与美元约束' },
      { key:'japan', label:'日韩', shortLabel:'日韩', risk: clamp(avg([risk.modules.energy * 0.45, risk.modules.liquidity * 0.55])), note:'输入型压力+美元波动' },
      { key:'emAsia', label:'新兴亚洲', shortLabel:'新兴亚洲', risk: clamp(avg([risk.modules.liquidity * 0.65, risk.modules.energy * 0.35])), note:'美元敏感度较高' },
      { key:'latam', label:'拉美', shortLabel:'拉美', risk: clamp(avg([risk.modules.energy * 0.35, risk.modules.liquidity * 0.65])), note:'商品支撑但外部融资受限' }
    ],
    transmissionChain: prevData.transmissionChain || {},
    assetMatrix: [
      { asset:'黄金', score: clamp(50 + (100 - risk.realRisk) * 0.35 + risk.inflationRisk * 0.25), bias: (risk.realRisk < 60 ? '中性偏多' : '谨慎偏多'), reason:`金价 ${risk.gold.toFixed(1)}，通胀对冲仍在，但真实利率继续约束。` },
      { asset:'原油', score: clamp(45 + risk.oilRisk * 0.55), bias: risk.brent >= 90 ? '强配' : '中性偏多', reason:`布伦特 ${risk.brent.toFixed(1)} 美元，仍是主导链条。` },
      { asset:'美元', score: clamp(40 + risk.dollarRisk * 0.55), bias: risk.dollarRisk >= 60 ? '强配' : '中性偏多', reason:`美元 ${risk.dxy.toFixed(2)}，融资偏紧阶段继续占优。` },
      { asset:'美债久期', score: clamp(60 - risk.realRisk * 0.45), bias: risk.realRisk >= 60 ? '低配' : '谨慎偏多', reason:`10Y ${risk.us10y.toFixed(2)} / 实际利率 ${risk.real10y.toFixed(2)}%。` },
      { asset:'科技股', score: clamp(55 - avg([risk.rateRisk, risk.modules.liquidity]) * 0.5), bias: risk.score >= 70 ? '回避' : '低配', reason:'高估值资产仍受利率与流动性制约。' },
      { asset:'能源股', score: clamp(50 + risk.modules.energy * 0.45), bias: risk.modules.energy >= 70 ? '强配' : '中性偏多', reason:'能源现金流继续受益于高油价环境。' },
      { asset:'比特币', score: clamp(48 - risk.modules.liquidity * 0.35 - risk.vixRisk * 0.2), bias: risk.modules.liquidity >= 65 ? '回避' : '低配', reason:'高Beta资产对流动性最敏感。' }
    ],
    assetReturnMap: prevData.assetReturnMap || { horizon:'未来1个月', rows:[] },
    scenarioTree: [
      {
        name:'基准情景',
        probability: clamp(avg([probs.stagflationShock, probs.crisisLiquiditySqueeze])),
        description:'快变量显示风险仍高位但未失控，市场以防守与分化为主。',
        triggers:`布伦特 ${risk.brent.toFixed(1)} / 美元 ${risk.dxy.toFixed(2)} / HY OAS ${risk.hy.toFixed(2)}`,
        assets:'能源领先 / 美元与黄金保留 / 成长受限'
      },
      {
        name:'风险情景',
        probability: clamp(avg([risk.hyRisk, risk.vixRisk])),
        description:'信用与波动率继续上行，执行引擎会切到 RED。',
        triggers:'油价 > 110 或 HY OAS > 4.5% 或 VIX > 28',
        assets:'只允许减仓 / 现金与美元提高 / 高Beta回避'
      },
      {
        name:'极端情景',
        probability: clamp(avg([risk.modules.liquidity, risk.vixRisk])),
        description:'多源关键快变量连续失效时，系统进入缓存模式并强制防守。',
        triggers:'criticalMissing ≥ 4 或 cacheOnly=true',
        assets:'停止加仓 / 保留现金 / 仅做风险控制'
      },
      {
        name:'反转情景',
        probability: clamp(avg([probs.disinflationaryGrowth, probs.liquidityBull])),
        description:'美元走弱、波动率和利差收敛后，系统重新开放进攻窗口。',
        triggers:'VIX < 18 / HY OAS < 3.7 / Brent < 95',
        assets:'逐步恢复权益与质量成长配置'
      }
    ],
    warningSystem: {
      status:`${lock.levelLabel} / 数据模式 ${realtime.sourceMode}`,
      criticalCount: realtime.criticalMissing || 0,
      warningCount: realtime.fallbackCount || 0,
      watchCount: Object.values(realtime.sourceStatus || {}).filter(v => String(v).startsWith('fred') || String(v).startsWith('stooq')).length,
      alerts: [
        { level: lock.level === 'red' ? '红色' : lock.level === 'yellow' ? '橙色' : '黄色', title:'执行状态灯', driver:'交易引擎', triggeredAgo: isoNow, condition: lock.description, action: lock.actionText },
        ...(realtime.notes || []).map((n) => ({ level:'黄色', title:'数据源提示', driver:'快变量源', triggeredAgo: isoNow, condition:n, action:'继续使用 fallback，不中断系统' }))
      ],
      rules: [
        '关键快变量失败 2 项以上 → 标记部分降级。',
        '关键快变量失败 4 项以上 → 进入缓存模式。',
        '缓存模式自动把执行状态灯至少提升到 YELLOW。'
      ]
    },
    triggerPanel: {
      critical:[`Brent ${risk.brent.toFixed(1)}`, `DXY ${risk.dxy.toFixed(2)}`, `HY ${risk.hy.toFixed(2)}%`],
      drivers:[`VIX ${risk.vix.toFixed(2)}`, `10Y ${risk.us10y.toFixed(2)}%`, `Real10Y ${risk.real10y.toFixed(2)}%`],
      watchlist:['下一次通胀数据','油价是否高于 100','信用利差是否重新走阔']
    },
    confidenceNotes: [
      `数据模式：${realtime.sourceMode}。`,
      `健康分数：${realtime.healthScore}。`,
      `关键缺失项：${realtime.criticalMissing || 0}。`
    ],
    recovery: {
      degradedMode: realtime.degradedMode,
      safeOutput: true,
      lastRun: isoNow,
      notes: realtime.notes || ['v24.1 慢变量已由最新 realtime 快照重算。']
    },
    tradingSystem: {
      signalEngine: {
        strength: risk.score,
        direction: lock.level === 'red' ? '只允许减仓/防守' : lock.level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高Beta' : '允许质量权益分批进攻',
        consistency: realtime.cacheOnly ? '低一致性（缓存）' : realtime.degradedMode ? '中一致性（回退）' : '高一致性',
        macroSignal: macro,
        liquiditySignal: `${risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复'}（实时）`,
        chainSignal: risk.modules.energy >= risk.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
        notes: [
          `执行引擎状态：${lock.levelLabel}。`,
          `关键快变量：Brent ${risk.brent.toFixed(1)} / DXY ${risk.dxy.toFixed(2)} / VIX ${risk.vix.toFixed(2)} / HY ${risk.hy.toFixed(2)}。`,
          `健康度 ${realtime.healthScore}，关键缺失 ${realtime.criticalMissing || 0}。`
        ]
      },
      positioning: {
        regime: lock.level === 'red' ? '强防守执行框架' : lock.level === 'yellow' ? '防守型执行框架' : '可控进攻框架',
        riskBudget: lock.riskBudget,
        targetGrossExposure: lock.gross,
        cashBufferTarget: lock.cash,
        coreAllocations: allocs,
        executionRestrictions: lock.level === 'green'
          ? ['任何新增仓位必须分批执行。','单日净加仓不超过总资产的 5%。','若状态灯转黄，次日停止加仓。']
          : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。','科技与高Beta资产合计不得超过 3%。','任何新增进攻仓位都必须由减仓腾出空间。']
      },
      discipline: prevData.tradingSystem?.discipline || {
        tag:'系统优先于主观判断',
        entryConditions:['宏观、流动性、传导链至少两项同向支持。'],
        prohibitedBehaviors:['禁止在状态灯为 RED 或 YELLOW 时主观追高。'],
        mandatoryRules:['先看状态灯，再执行动作。']
      },
      riskControl: {
        status: lock.level === 'red' ? '硬阈值全面生效' : lock.level === 'yellow' ? '硬阈值生效中' : '风险可控但仍受约束',
        maxDrawdown: lock.level === 'red' ? '-6%' : '-8%',
        singleAssetMax: lock.level === 'red' ? '20%' : '22%',
        systemState: lock.title,
        hardThresholds: [
          '流动性 ≥ 75：总仓位降至 42%。',
          'Brent ≥ 110：能源上调，股票下调。',
          'HY OAS ≥ 4.5%：暂停新增风险仓位。',
          'VIX ≥ 28：进入 RED。'
        ],
        resetThresholds: [
          'VIX < 18 且 HY OAS < 3.7：才允许回到 GREEN。',
          'Brent < 95 且 DXY 走弱：才允许提高成长仓。',
          'criticalMissing < 2：解除数据回退约束。'
        ]
      },
      actionLayer: {
        tag:'今日执行清单（交易引擎版）',
        priorityLine:`先看执行状态灯 ${lock.levelLabel} → 再执行强制动作 → 再对齐目标仓位；不满足条件时禁止交易。`,
        todayAction: lock.actionText,
        checklist: lock.mandatory,
        blocked: lock.block,
        checkpoints: [
          `Brent 当前 ${risk.brent.toFixed(1)}`,
          `DXY 当前 ${risk.dxy.toFixed(2)}`,
          `VIX 当前 ${risk.vix.toFixed(2)}`,
          `HY OAS 当前 ${risk.hy.toFixed(2)}%`
        ]
      },
      executionLock: {
        tag: realtime.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtime.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
        level: lock.level,
        levelLabel: lock.levelLabel,
        title: lock.title,
        description: lock.description,
        allow: lock.allow,
        block: lock.block,
        mandatory: lock.mandatory
      }
    }
  };

  data.decisionModel = {
    contractVersion: 'v26.0A-final',
    strategyState: lock.level === 'red' ? 'Defensive' : lock.level === 'yellow' ? 'Caution' : 'Balanced',
    stateLabel: lock.levelLabel,
    stateScore: risk.score,
    stateReason: `Daily pipeline baseline: execution lock ${lock.levelLabel}, risk score ${risk.score}.`,
    dominantDrivers: Object.entries(risk.modules)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, score]) => ({ key, score, label: key, trend: 0 })),
    positionGuidance: {
      totalExposureBand: lock.gross ? `${parseInt(lock.gross) - 10}%-${lock.gross}` : '35%-55%',
      riskAssetBias: lock.level === 'red' ? 'Underweight risk assets' : lock.level === 'yellow' ? 'Selective underweight' : 'Neutral to selective',
      cashGuidance: `Target cash buffer: ${lock.cash}`,
      targetGrossExposure: lock.gross,
      cashBufferTarget: lock.cash,
      riskBudget: lock.riskBudget
    },
    actionQueue: {
      priorityActions: lock.mandatory,
      blockedActions: lock.block,
      watchItems: data.triggerPanel?.watchlist || []
    },
    triggerMonitor: {
      upgradeTriggers: data.triggerPanel?.critical || [],
      activeEscalationSignals: data.triggerPanel?.drivers || []
    },
    invalidationRules: {
      resetConditions: data.tradingSystem?.riskControl?.resetThresholds || []
    }
  };

  return { data, history };
}

const built = build();
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(dataPath, JSON.stringify(built.data, null, 2));
fs.writeFileSync(histPath, JSON.stringify(built.history, null, 2));
console.log('Built v26.0A-rc1 radar data successfully.');
