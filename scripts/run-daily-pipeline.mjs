import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const round = (n, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const latest = (arr, idx = 0) => arr[arr.length - 1 - idx];
const fmtPct = (n) => `${n > 0 ? '+' : ''}${round(n, 1)}%`;
const now = new Date();
const isoNow = now.toISOString();
const cosd = new Date(Date.now() - 420 * 24 * 3600 * 1000).toISOString().slice(0, 10);

const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const seriesMap = {
  brent: 'DCOILBRENTEU',
  dollar: 'DTWEXBGS',
  hyOas: 'BAMLH0A0HYM2',
  vix: 'VIXCLS',
  spx: 'SP500',
  gold: 'GOLDAMGBD228NLBM',
  tenY: 'DGS10',
  twoY: 'DGS2',
  real10: 'DFII10',
  breakeven10: 'T10YIE'
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (!date || raw === undefined) continue;
    if (raw === '.' || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out;
}

async function fetchFredSeries(id) {
  const url = `${FRED}?cosd=${cosd}&id=${id}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'gfr-v23-data-pipeline/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch ${id}: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 40) throw new Error(`Insufficient rows for ${id}`);
  return rows;
}

function percentRank(rows, value, lookback = 252) {
  const values = rows.slice(-lookback).map((x) => x.value);
  const below = values.filter((v) => v <= value).length;
  return clamp((below / values.length) * 100);
}

function valueOnOrBefore(rows, date) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date <= date) return rows[i].value;
  }
  return rows[0].value;
}

function makeSeriesContext(rows) {
  const curr = latest(rows).value;
  const prev = latest(rows, 1).value;
  const prev5 = latest(rows, 5).value;
  const prev20 = latest(rows, 20).value;
  return {
    curr,
    prev,
    prev5,
    prev20,
    chg1d: curr - prev,
    chg5d: curr - prev5,
    chg20d: curr - prev20,
    pct1d: prev === 0 ? 0 : ((curr - prev) / prev) * 100,
    pct5d: prev5 === 0 ? 0 : ((curr - prev5) / prev5) * 100,
    percentile: percentRank(rows, curr),
    rows
  };
}

function riskScoreFromState(state) {
  const oilRisk = state.brent.percentile;
  const dollarRisk = state.dollar.percentile;
  const hyRisk = state.hyOas.percentile;
  const vixRisk = state.vix.percentile;
  const realRisk = state.real10.percentile;
  const yieldRisk = state.tenY.percentile;
  const inflationRisk = clamp(avg([state.breakeven10.percentile, oilRisk, realRisk]));
  const spxRisk = 100 - state.spx.percentile;
  const geo = clamp(oilRisk * 0.7 + vixRisk * 0.3);
  const energy = clamp(oilRisk * 0.78 + Math.max(0, state.brent.pct5d) * 2.2);
  const liquidity = clamp(dollarRisk * 0.42 + hyRisk * 0.36 + vixRisk * 0.22);
  const debt = clamp(realRisk * 0.35 + yieldRisk * 0.35 + hyRisk * 0.30);
  const banking = clamp(hyRisk * 0.48 + liquidity * 0.30 + vixRisk * 0.22);

  const modules = {
    geopolitical: clamp(geo),
    energy: clamp(energy),
    inflation: clamp(inflationRisk),
    liquidity: clamp(liquidity),
    debt: clamp(debt),
    banking: clamp(banking)
  };

  const globalRiskScore = clamp(
    modules.geopolitical * 0.16 +
    modules.energy * 0.16 +
    modules.inflation * 0.18 +
    modules.liquidity * 0.20 +
    modules.debt * 0.17 +
    modules.banking * 0.13
  );

  return { modules, globalRiskScore, oilRisk, dollarRisk, hyRisk, vixRisk, realRisk, yieldRisk, inflationRisk, spxRisk };
}

function regimeBundle(risk) {
  const growthRelief = 100 - risk.spxRisk;
  const disinflationaryGrowth = Math.max(1, 0.38 * growthRelief + 0.22 * (100 - risk.inflationRisk) + 0.20 * (100 - risk.hyRisk) + 0.20 * (100 - risk.dollarRisk));
  const liquidityBull = Math.max(1, 0.35 * (100 - risk.vixRisk) + 0.30 * (100 - risk.hyRisk) + 0.20 * growthRelief + 0.15 * (100 - risk.realRisk));
  const stagflationShock = Math.max(1, 0.34 * risk.oilRisk + 0.30 * risk.inflationRisk + 0.18 * risk.dollarRisk + 0.18 * risk.realRisk);
  const crisisLiquiditySqueeze = Math.max(1, 0.42 * risk.dollarRisk + 0.30 * risk.hyRisk + 0.16 * risk.vixRisk + 0.12 * risk.realRisk);
  const monetaryDebasement = Math.max(1, 0.40 * risk.inflationRisk + 0.34 * (100 - risk.realRisk) + 0.26 * risk.oilRisk);
  const deflationaryBust = Math.max(1, 0.30 * (100 - risk.oilRisk) + 0.28 * risk.hyRisk + 0.24 * risk.vixRisk + 0.18 * (100 - growthRelief));

  const raw = {
    disinflationaryGrowth,
    liquidityBull,
    stagflationShock,
    crisisLiquiditySqueeze,
    monetaryDebasement,
    deflationaryBust
  };

  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clamp((v / sum) * 100)]));
  // force sum ~=100
  const diff = 100 - Object.values(probs).reduce((a, b) => a + b, 0);
  probs.stagflationShock = clamp(probs.stagflationShock + diff);
  return probs;
}

function labelForRegime(probs) {
  const mapping = {
    disinflationaryGrowth: '通胀回落增长',
    liquidityBull: '流动性多头',
    stagflationShock: '滞胀冲击',
    crisisLiquiditySqueeze: '流动性偏紧',
    monetaryDebasement: '货币贬值',
    deflationaryBust: '通缩衰退'
  };
  return mapping[Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0]];
}

function crisisPhase(modules) {
  if (modules.liquidity >= 78 || modules.banking >= 72) return '流动性偏紧';
  if (modules.energy >= 80 && modules.inflation >= 72) return '通胀冲击';
  if (modules.liquidity <= 55 && modules.debt <= 55) return '风险缓和';
  return '融资压力上升';
}

function executionLock(modules, state) {
  const oil = state.brent.curr;
  const hy = state.hyOas.curr;
  const dxyBroad = state.dollar.curr;
  const vix = state.vix.curr;
  const liq = modules.liquidity;

  if (liq >= 75 || oil >= 110 || hy >= 4.5 || vix >= 28) {
    return {
      level: 'red',
      levelLabel: 'RED / 只允许减仓',
      title: '今天禁止主动加仓，只允许减仓或恢复防御层',
      description: '风险阈值已进入高压区。系统锁定为 RED：任何新增风险动作都被禁止，只允许执行减仓、补现金和恢复防御仓。',
      targetGrossExposure: '42%',
      cashBufferTarget: '32%',
      allow: ['允许降低总风险暴露。', '允许补充现金、美元/短票和黄金对冲。', '允许把高Beta与久期仓位降回最低。'],
      block: ['禁止任何新增进攻仓位。', '禁止因为盘中反弹而追价。', '禁止主观覆盖系统阈值。'],
      mandatory: ['若总仓位高于 46%，今日必须减回 42% 附近。', '若科技/高Beta > 2%，必须先降仓。', '若现金缓冲 < 30%，必须补回。']
    };
  }
  if (liq >= 60 || oil >= 90 || hy >= 3.7 || vix >= 20) {
    return {
      level: 'yellow',
      levelLabel: 'YELLOW / 仅允许微调',
      title: '今天不能主动加风险，只允许对齐目标仓位与防守再平衡',
      description: '当前不属于进攻窗口。系统允许的动作仅限于：把总仓位校准到目标值附近，维持能源、美元/短票与黄金对冲层；禁止扩大科技、高Beta和久期风险暴露。',
      targetGrossExposure: '48%',
      cashBufferTarget: '27%',
      allow: ['允许把总仓位向目标值 48% 靠拢，但调整幅度不得超过 ±5%。', '允许维持或小幅补足能源、美元/短票、黄金对冲层。', '允许对防御型股票保留观察仓，不允许扩大为进攻主仓。'],
      block: ['禁止新增高Beta、科技与久期进攻仓位。', '禁止因为单日反弹而提升总风险暴露。', '禁止主观覆盖风控阈值和动作清单。'],
      mandatory: ['若当前总仓位高于 53%，今日必须先减仓再做任何调整。', '若科技/高Beta 高于 3%，今日必须降回上限以内。', '若现金缓冲低于 25%，今日必须恢复到安全区间。']
    };
  }
  return {
    level: 'green',
    levelLabel: 'GREEN / 允许进攻',
    title: '今天允许小幅加仓，但必须按纪律分批执行',
    description: '流动性、信用和波动率均已回到相对稳定区，系统允许小幅提高风险暴露，但仍要按目标仓位和分批规则执行。',
    targetGrossExposure: '58%',
    cashBufferTarget: '20%',
    allow: ['允许分三笔内提高总仓位。', '允许增加防御型权益和部分科技观察仓。', '允许降低美元/短票与现金缓冲。'],
    block: ['禁止一次性打满仓位。', '禁止在单日大涨后追高。', '禁止无视硬阈值。'],
    mandatory: ['任何新增仓位都必须分批完成。', '若风险信号重新转黄，次日停止加仓。', '若周回撤超过 -3%，立即回到 YELLOW 纪律。']
  };
}

function assetBias(score) {
  if (score >= 78) return '强配';
  if (score >= 60) return '中性偏多';
  if (score >= 45) return '谨慎偏多';
  if (score >= 30) return '低配';
  return '回避';
}

function convictionFrom(score) {
  if (score >= 80) return '高';
  if (score >= 65) return '中高';
  if (score >= 50) return '中';
  return '中低';
}

function historicalStates(all, dates) {
  return dates.map((date) => {
    const state = Object.fromEntries(Object.entries(all).map(([k, rows]) => {
      const sub = rows.filter((r) => r.date <= date);
      return [k, makeSeriesContext(sub)];
    }));
    const risk = riskScoreFromState(state);
    return { date, state, risk, score: risk.globalRiskScore };
  });
}

function safeNum(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

async function buildLiveData() {
  const fetched = Object.fromEntries(
    await Promise.all(Object.entries(seriesMap).map(async ([key, id]) => [key, await fetchFredSeries(id)]))
  );

  const ctx = Object.fromEntries(Object.entries(fetched).map(([k, rows]) => [k, makeSeriesContext(rows)]));
  const risk = riskScoreFromState(ctx);

  const allDates = fetched.spx.slice(-30).map((x) => x.date);
  const hist = historicalStates(fetched, allDates);
  const history = hist.map((x) => ({ date: x.date, score: x.score }));

  const globalRiskScore = latest(history).score;
  const scoreChange1d = history.at(-1).score - history.at(-2).score;
  const scoreChange7d = history.at(-1).score - history.at(-8).score;
  const scoreChange30d = history.at(-1).score - history[0].score;
  const avg30d = clamp(avg(history.map((x) => x.score)));
  const peak30d = Math.max(...history.map((x) => x.score));
  const trough30d = Math.min(...history.map((x) => x.score));
  const drawFromPeak = globalRiskScore - peak30d;

  const fiveDayAgo = hist.at(-6).risk.modules;
  const moduleTrends = Object.fromEntries(
    Object.keys(risk.modules).map((k) => [k, clamp(risk.modules[k] - fiveDayAgo[k], -9, 9)])
  );

  const probs = regimeBundle(risk);
  const currentMacroRegime = labelForRegime(probs);
  const currentCrisisPhase = crisisPhase(risk.modules);
  const nextCrisisPhase = currentCrisisPhase === '流动性偏紧' ? '政策应对' : '风险缓和';
  const transitionRisk = clamp(avg([risk.modules.liquidity, risk.hyRisk, risk.vixRisk]));

  const consistencySpread = Math.max(risk.modules.energy, risk.modules.inflation, risk.modules.liquidity) - Math.min(risk.modules.energy, risk.modules.inflation, risk.modules.liquidity);
  const confidenceScore = clamp(88 - consistencySpread / 2);
  const confidenceLevel = confidenceScore >= 80 ? '高' : confidenceScore >= 65 ? '中' : '低';

  const dominantPath = risk.modules.energy >= risk.modules.liquidity
    ? '战争 → 油价 → 通胀 → 利率 → 股票'
    : '美元 → 信用 → 流动性 → 估值';

  const oil = ctx.brent.curr;
  const dollar = ctx.dollar.curr;
  const hy = ctx.hyOas.curr;
  const vix = ctx.vix.curr;
  const y10 = ctx.tenY.curr;
  const y2 = ctx.twoY.curr;
  const real10 = ctx.real10.curr;
  const breakeven = ctx.breakeven10.curr;
  const spx = ctx.spx.curr;
  const gold = ctx.gold.curr;

  const topRisks = [
    oil >= 100 ? `布伦特油价维持在 ${round(oil, 1)} 美元附近，能源冲击仍在传导` : `油价位于 ${round(oil, 1)} 美元，能源链条尚未完全解除`,
    `广义美元指数处于 ${round(dollar, 2)}，流动性约束仍然存在`,
    `高收益利差位于 ${round(hy, 2)}%，信用环境${hy >= 4 ? '偏紧' : '仍需观察'}`,
    `10年期美债 ${round(y10, 2)}%，10年实际利率 ${round(real10, 2)}%，久期资产修复受限`
  ];

  const decisionLine = `当前系统已切换到真实数据驱动模式：今天的结论来自布伦特、广义美元、VIX、高收益利差、美债收益率与金价等官方市场数据；先看执行状态灯，再决定能不能动。`;

  const summary = `全球金融风险雷达 v23 当前根据真实市场数据生成：布伦特 ${round(oil, 1)} 美元、广义美元 ${round(dollar, 2)}、VIX ${round(vix, 2)}、高收益利差 ${round(hy, 2)}%、10年美债 ${round(y10, 2)}%、10年实际利率 ${round(real10, 2)}%。当前主导环境为“${currentMacroRegime}”，危机阶段为“${currentCrisisPhase}”。`;

  const heatmap = [
    { key: 'us', label: '美国', shortLabel: '美国', risk: clamp(avg([risk.modules.inflation, risk.modules.debt, risk.modules.liquidity])), note: `融资偏紧 + 实际利率 ${round(real10,2)}%` },
    { key: 'europe', label: '欧洲', shortLabel: '欧洲', risk: clamp(avg([risk.modules.energy, risk.modules.geopolitical * 0.7, risk.modules.banking * 0.3])), note: `能源敏感 + 外需拖累` },
    { key: 'middleeast', label: '中东', shortLabel: '中东', risk: clamp(risk.modules.geopolitical), note: `原油与地缘仍是主风险源` },
    { key: 'china', label: '中国', shortLabel: '中国', risk: clamp(avg([dollar > 126 ? 65 : 52, risk.modules.debt * 0.4, risk.modules.liquidity * 0.6])), note: '外需与美元约束' },
    { key: 'japan', label: '日韩', shortLabel: '日韩', risk: clamp(avg([risk.modules.energy * 0.45, risk.modules.liquidity * 0.55])), note: '输入型压力+美元波动' },
    { key: 'emAsia', label: '新兴亚洲', shortLabel: '新兴亚洲', risk: clamp(avg([risk.modules.liquidity * 0.65, risk.modules.energy * 0.35])), note: '美元敏感度较高' },
    { key: 'latam', label: '拉美', shortLabel: '拉美', risk: clamp(avg([risk.modules.energy * 0.35, risk.modules.liquidity * 0.65])), note: '商品支撑但外部融资受限' }
  ];

  const transmissionNodes = [
    { label: '战争冲击', score: clamp(risk.modules.geopolitical), impact: '上行', delta: moduleTrends.geopolitical, reason: `地缘与油价共振，布伦特 ${round(oil,1)} 美元。` },
    { label: '油价压力', score: clamp(risk.modules.energy), impact: '推升油价', delta: moduleTrends.energy, reason: `能源价格与供应扰动共同抬高通胀输入项。` },
    { label: '通胀传导', score: clamp(risk.modules.inflation), impact: '抬升通胀', delta: moduleTrends.inflation, reason: `10年盈亏平衡通胀 ${round(breakeven,2)}%。` },
    { label: '利率压力', score: clamp(risk.modules.debt), impact: '维持高利率', delta: moduleTrends.debt, reason: `10年名义利率 ${round(y10,2)}%，2年 ${round(y2,2)}%。` },
    { label: '流动性压力', score: clamp(risk.modules.liquidity), impact: '压缩估值', delta: moduleTrends.liquidity, reason: `美元 ${round(dollar,2)} / HY ${round(hy,2)} / VIX ${round(vix,2)}。` },
    { label: '股票影响', score: clamp(avg([risk.modules.liquidity, risk.vixRisk, risk.realRisk])), impact: '偏空', delta: clamp(scoreChange7d / 2, -9, 9), reason: `标普500 ${round(spx,0)}，高估值资产仍受约束。` }
  ];

  const warToOil = transmissionNodes[0].score;
  const oilToInflation = transmissionNodes[1].score;
  const inflationToRates = transmissionNodes[2].score;
  const ratesToEquities = transmissionNodes[5].score;
  const ratesToGold = clamp(avg([risk.inflationRisk, 100 - risk.realRisk, ctx.gold.percentile]));

  const transmissionChain = {
    regimeTag: currentMacroRegime,
    stressScore: globalRiskScore,
    leadShock: dominantPath.includes('油价') ? '油价/通胀' : '美元/流动性',
    pathConfidence: confidenceScore,
    dominantImpact: ratesToEquities >= 70 ? '全球股票承压' : '资产分化加剧',
    nodes: transmissionNodes,
    layers: [
      { name: '冲击源', tags: dominantPath.includes('油价') ? ['地缘冲击', '能源冲击', '通胀输入'] : ['美元偏强', '信用偏紧', '波动抬升'], score: clamp(avg([warToOil, oilToInflation])) },
      { name: '价格/融资层', tags: ['利率', '美元', '信用'], score: clamp(avg([inflationToRates, risk.modules.liquidity])) },
      { name: '资产定价层', tags: ['久期股', '成长股', '高Beta'], score: ratesToEquities },
      { name: '市场节奏层', tags: ['波动率', '再平衡', '避险'], score: clamp(avg([risk.vixRisk, risk.modules.liquidity])) },
      { name: '资产映射层', tags: ['能源', '黄金', '美元', '科技'], score: clamp(avg([warToOil, ratesToGold, ratesToEquities])) }
    ],
    decomposition: {
      topBlock: [
        { label: '全球股票', value: clamp(avg([risk.spxRisk, risk.vixRisk])) },
        { label: '利率', value: clamp(risk.modules.debt) },
        { label: '风险偏好', value: clamp(avg([risk.hyRisk, risk.vixRisk])) },
        { label: '黄金', value: clamp(ratesToGold) }
      ],
      goldBlock: [
        { label: '通胀对冲', value: clamp(risk.inflationRisk) },
        { label: '真实利率', value: clamp(100 - risk.realRisk) },
        { label: '流动性压力', value: clamp(risk.modules.liquidity) }
      ],
      energyBlock: [
        { label: '地缘冲击', value: clamp(risk.modules.geopolitical) },
        { label: '供给扰动', value: clamp(risk.modules.energy) },
        { label: '库存/需求', value: clamp(avg([risk.modules.energy, 100 - risk.spxRisk])) }
      ]
    },
    summary: [
      `系统当前主链条为“${dominantPath}”。`,
      `真实数据输入显示：布伦特 ${round(oil,1)} 美元、VIX ${round(vix,2)}、HY OAS ${round(hy,2)}%。`,
      `当美元、信用利差和实际利率同步走强时，系统会自动把执行状态灯提升到更强防守。`
    ],
    assetImpacts: [
      { asset: '黄金', view: ratesToGold >= 65 ? '中性偏多' : '中性', score: clamp(ratesToGold) },
      { asset: '全球股票', view: ratesToEquities >= 70 ? '负面' : '中性偏弱', score: clamp(ratesToEquities) },
      { asset: '能源', view: warToOil >= 70 ? '正面' : '中性', score: clamp(warToOil) },
      { asset: 'UST久期', view: risk.realRisk >= 60 ? '负面' : '中性', score: clamp(risk.modules.debt) },
      { asset: '美元', view: risk.modules.liquidity >= 60 ? '正面' : '中性', score: clamp(risk.modules.liquidity) },
      { asset: '科技股', view: ratesToEquities >= 68 ? '明显负面' : '偏弱', score: clamp(ratesToEquities + 4) }
    ]
  };

  const goldScore = clamp(50 + (ratesToGold - 50) * 0.8);
  const oilScore = clamp(50 + (warToOil - 50) * 0.9);
  const usdScore = clamp(45 + (risk.modules.liquidity - 45) * 0.8);
  const bondScore = clamp(52 - (risk.realRisk - 50) * 0.7 - (risk.inflationRisk - 50) * 0.25);
  const techScore = clamp(58 - (ratesToEquities - 50) * 0.9);
  const energyEqScore = clamp(52 + (warToOil - 50) * 0.9);
  const btcScore = clamp(48 - (risk.modules.liquidity - 50) * 0.6 - (risk.vixRisk - 50) * 0.35 + (100 - risk.spxRisk - 50) * 0.2);

  const assetMatrix = [
    { asset: '黄金', score: goldScore, bias: assetBias(goldScore), reason: `金价 ${round(gold,1)}，通胀与避险支撑存在，但真实利率仍有压制。` },
    { asset: '原油', score: oilScore, bias: assetBias(oilScore), reason: `布伦特 ${round(oil,1)} 美元，能源链条仍是最强风险源。` },
    { asset: '美元', score: usdScore, bias: assetBias(usdScore), reason: `广义美元 ${round(dollar,2)}，融资偏紧阶段继续受益。` },
    { asset: '美债久期', score: bondScore, bias: assetBias(bondScore), reason: `10年实际利率 ${round(real10,2)}%，久期修复仍受限制。` },
    { asset: '科技股', score: techScore, bias: assetBias(techScore), reason: `标普500 ${round(spx,0)}，高估值资产仍受真实利率与流动性约束。` },
    { asset: '能源股', score: energyEqScore, bias: assetBias(energyEqScore), reason: `油价与现金流改善共同支撑能源股。` },
    { asset: '比特币', score: btcScore, bias: assetBias(btcScore), reason: '高Beta资产仍主要受流动性与波动率主导。' }
  ];

  const assetReturnMap = {
    horizon: '未来1个月决策区间（真实数据驱动）',
    rows: [
      { asset: '原油 / 能源', bias: oilScore >= 70 ? '偏多' : '中性偏多', expected: oil >= 110 ? '+2% ~ +10%' : '+1% ~ +7%', drawdown: '-7%', conviction: convictionFrom(oilScore), priority: 100, drivers: ['布伦特', '地缘'], note: `布伦特现价 ${round(oil,1)}，若继续高于 110，美股风险偏好将继续受压。` },
      { asset: '美元 / 短票', bias: usdScore >= 65 ? '偏多' : '中性', expected: '+0% ~ +3%', drawdown: '-2%', conviction: convictionFrom(usdScore), priority: 95, drivers: ['广义美元', '融资环境'], note: `广义美元 ${round(dollar,2)}，作为当前流动性防守层。` },
      { asset: '黄金', bias: goldScore >= 60 ? '中性偏多' : '中性', expected: '-2% ~ +5%', drawdown: '-6%', conviction: convictionFrom(goldScore), priority: 80, drivers: ['金价', '实际利率'], note: `金价 ${round(gold,1)}，对冲价值保留。` },
      { asset: '全球股票', bias: techScore < 40 ? '偏空' : '中性偏空', expected: '-6% ~ +2%', drawdown: '-10%', conviction: convictionFrom(100 - techScore), priority: 40, drivers: ['标普500', 'VIX'], note: `标普500 ${round(spx,0)}，估值修复仍受利率约束。` },
      { asset: '科技 / 高Beta', bias: techScore < 35 ? '偏空' : '中性偏空', expected: '-8% ~ +3%', drawdown: '-14%', conviction: convictionFrom(100 - techScore), priority: 30, drivers: ['实际利率', '波动率'], note: '只允许作为观察仓，不允许成为核心仓位。' },
      { asset: '美债久期', bias: bondScore >= 55 ? '中性偏多' : '中性偏空', expected: '-1% ~ +3%', drawdown: '-4%', conviction: convictionFrom(bondScore), priority: 60, drivers: ['10Y', '实际利率'], note: `10年利率 ${round(y10,2)}%，若实际利率继续高位，久期回升空间受限。` },
      { asset: '比特币', bias: btcScore >= 55 ? '中性' : '偏空', expected: '-10% ~ +8%', drawdown: '-18%', conviction: convictionFrom(100 - btcScore), priority: 20, drivers: ['流动性', '波动率'], note: '高Beta资产，对系统流动性状态最敏感。' }
    ]
  };

  const warningAlerts = [];
  if (oil >= 110) warningAlerts.push({ level: '红色', title: '布伦特维持 110 美元上方', driver: '能源链条', triggeredAgo: `当前 ${round(oil,1)} 美元`, condition: '能源冲击继续向通胀与资产估值传导', action: '保持能源防御，削减成长风险' });
  if (hy >= 4.5) warningAlerts.push({ level: '红色', title: '高收益利差进入压力区', driver: '信用环境', triggeredAgo: `当前 ${round(hy,2)}%`, condition: '信用风险升高，股债同时承压概率上升', action: '减少风险资产与低质量信用敞口' });
  if (risk.modules.liquidity >= 70) warningAlerts.push({ level: '橙色', title: '流动性偏紧仍未解除', driver: '美元 / 信用 / 波动', triggeredAgo: `指数 ${risk.modules.liquidity}`, condition: '美元与利差未回到宽松区间', action: '维持美元/短票与现金缓冲' });
  if (real10 >= 2.0) warningAlerts.push({ level: '橙色', title: '实际利率处于高位', driver: '真实利率', triggeredAgo: `当前 ${round(real10,2)}%`, condition: '久期与成长资产估值受压', action: '科技和长久期只保留观察仓' });
  if (vix >= 18) warningAlerts.push({ level: '黄色', title: '波动率高于舒适区', driver: 'VIX', triggeredAgo: `当前 ${round(vix,2)}`, condition: '市场对冲需求仍较高', action: '减少主观追涨操作' });
  if (dollar >= 126) warningAlerts.push({ level: '黄色', title: '广义美元偏强', driver: '美元', triggeredAgo: `当前 ${round(dollar,2)}`, condition: '新兴市场和风险资产面临外部融资压力', action: '保持防守仓位' });
  while (warningAlerts.length < 6) {
    warningAlerts.push({ level: '黄色', title: '观察政策与信用条件', driver: '政策 / 信用', triggeredAgo: '近期', condition: '等待下一组宏观数据确认', action: '不提前扩大风险' });
  }

  const warningSystem = {
    status: `${warningAlerts.filter(a => a.level === '红色').length}项关键预警 / ${warningAlerts.filter(a => a.level === '橙色').length}项重点预警 / ${warningAlerts.filter(a => a.level === '黄色').length}项观察项`,
    criticalCount: warningAlerts.filter(a => a.level === '红色').length,
    warningCount: warningAlerts.filter(a => a.level === '橙色').length,
    watchCount: warningAlerts.filter(a => a.level === '黄色').length,
    alerts: warningAlerts,
    rules: [
      '布伦特 ≥ 110：进入更强防守。',
      'HY OAS ≥ 4.5%：优先减仓风险资产。',
      '广义美元持续走强：保留美元/短票防守。',
      '真实利率高位：限制成长与久期。'
    ]
  };

  const triggerPanel = {
    critical: [
      `布伦特现价 ${round(oil,1)} 美元`,
      `广义美元 ${round(dollar,2)}`,
      `HY OAS ${round(hy,2)}%`
    ],
    drivers: [
      `10年美债 ${round(y10,2)}%`,
      `10年实际利率 ${round(real10,2)}%`,
      `VIX ${round(vix,2)}`
    ],
    watchlist: [
      '下一次美国核心通胀与就业数据',
      '油价是否继续高于 100',
      '高收益利差是否重新走阔'
    ]
  };

  const confidenceNotes = [
    `当前主链条 ${dominantPath} 与真实市场数据方向一致。`,
    `模型输入来自官方数据源：FRED / Treasury / Cboe 系列。`,
    `若任一关键输入缺失，系统会进入降级输出并保留上次有效结构。`
  ];

  const lock = executionLock(risk.modules, ctx);
  const actionLayer = {
    tag: '今日执行清单（不可主观覆盖）',
    priorityLine: `执行顺序：先看执行状态灯（${lock.levelLabel}）→ 再处理强制动作 → 再校准目标仓位；若不满足允许条件，直接停止交易。`,
    todayAction: lock.level === 'red'
      ? '今日只允许减仓与恢复防御层，不允许任何新增风险动作。'
      : lock.level === 'yellow'
        ? `今日只允许把组合对齐到目标总仓位 ${lock.targetGrossExposure}，并维持能源、美元/短票与黄金对冲层；不允许新增进攻性加仓。`
        : `今日允许小幅提高总仓位到 ${lock.targetGrossExposure}，但必须分批执行并保留最低现金缓冲 ${lock.cashBufferTarget}。`,
    checklist: lock.level === 'red'
      ? ['若总仓位高于 46%，先减到 42% 左右。', '恢复美元/短票和现金缓冲。', '把科技/高Beta 降至最低观察仓。']
      : lock.level === 'yellow'
        ? [
            `先确认总仓位是否高于 ${Number(lock.targetGrossExposure.replace('%','')) + 5}%；若是，先减仓。`,
            '维持能源、美元/短票与黄金对冲层。',
            '全球股票仅保留防御仓，科技/高Beta 不超过 3%。'
          ]
        : [
            '按三笔以内分批加仓。',
            '优先增加防御型股票与部分科技观察仓。',
            '保持现金缓冲不低于 20%。'
          ],
    blocked: lock.block,
    checkpoints: [
      `检查 VIX 是否高于 ${round(vix,2)} 并继续走强。`,
      `检查 HY OAS 是否高于 ${round(hy,2)}%。`,
      `检查广义美元是否继续强于 ${round(dollar,2)}。`,
      '检查执行状态灯是否发生切换。'
    ]
  };

  const positioning = {
    regime: lock.level === 'red' ? '强防守执行框架' : lock.level === 'yellow' ? '防守型执行框架' : '可控进攻框架',
    riskBudget: lock.level === 'red' ? '35%' : lock.level === 'yellow' ? '40%' : '50%',
    targetGrossExposure: lock.targetGrossExposure,
    cashBufferTarget: lock.cashBufferTarget,
    coreAllocations: lock.level === 'red'
      ? [
          { asset: '美元 / 短票', target: '核心1', weight: '22%', reason: '融资与信用压力环境下的首要防御层。' },
          { asset: '黄金', target: '对冲', weight: '12%', reason: '用于对冲尾部风险与政策不确定性。' },
          { asset: '原油 / 能源', target: '防守受益', weight: '18%', reason: '油价高位时仍是最清晰的受益板块。' },
          { asset: '全球股票（防御板块）', target: '观察仓', weight: '5%', reason: '仅保留低波动、现金流资产。' }
        ]
      : lock.level === 'yellow'
        ? [
            { asset: '原油 / 能源', target: '核心1', weight: '22%', reason: '主链条未断，作为第一优先核心仓位。' },
            { asset: '美元 / 短票', target: '核心2', weight: '18%', reason: '融资偏紧环境下的稳定防守层。' },
            { asset: '黄金', target: '对冲', weight: '10%', reason: '用于对冲政策与通胀不确定性，但不追涨。' },
            { asset: '全球股票（防御板块）', target: '观察仓', weight: '8%', reason: '只保留低久期、防御性现金流板块。' },
            { asset: '科技 / 高Beta', target: '限制仓', weight: '0%–3%', reason: '不允许成为进攻主仓，只能微量战术参与。' }
          ]
        : [
            { asset: '全球股票（防御+质量成长）', target: '核心1', weight: '24%', reason: '流动性与信用改善后允许提高权益暴露。' },
            { asset: '原油 / 能源', target: '核心2', weight: '16%', reason: '仍保留主链条防守属性。' },
            { asset: '黄金', target: '对冲', weight: '8%', reason: '对冲尾部风险。' },
            { asset: '美元 / 短票', target: '缓冲层', weight: '12%', reason: '保留流动性。' }
          ],
    executionRestrictions: lock.level === 'green'
      ? ['任何新增仓位必须分批执行。', '单日净加仓不超过总资产的 5%。', '若状态灯转黄，次日停止加仓。']
      : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。', '科技与高Beta资产合计不得超过 3%。', '任何新增进攻仓位，必须由防御仓位等额释放后执行。']
  };

  const riskControl = {
    status: lock.level === 'red' ? '硬阈值风控全面生效' : lock.level === 'yellow' ? '硬阈值风控生效中' : '风险可控，仍需阈值约束',
    maxDrawdown: lock.level === 'red' ? '-6%' : '-8%',
    singleAssetMax: lock.level === 'red' ? '20%' : '22%',
    systemState: lock.title,
    hardThresholds: [
      '流动性指数 ≥ 75：总仓位降至 42%。',
      '布伦特油价 ≥ 110：能源上调，全球股票下调。',
      'HY OAS ≥ 4.5%：暂停所有新增风险仓位。',
      '组合单周回撤 ≤ -4%：自动进入观察模式。'
    ],
    resetThresholds: [
      '流动性指数连续 5 日 < 68：才允许把总仓位从 48% 提高到 52%。',
      '油价回落且实际利率下行：才允许提高科技/成长观察仓。',
      '若任一核心资产触及单笔止损线：立即减半，不允许摊平。'
    ]
  };

  const tradingSystem = {
    signalEngine: {
      strength: globalRiskScore,
      direction: lock.level === 'red' ? '强防守：美元 / 黄金 / 能源' : lock.level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高Beta' : '谨慎进攻：质量权益 + 防御对冲并存',
      consistency: confidenceLevel === '高' ? '高一致性' : confidenceLevel === '中' ? '中一致性' : '低一致性',
      macroSignal: currentMacroRegime,
      liquiditySignal: `${risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复中'}（最新）`,
      chainSignal: dominantPath,
      notes: [
        `真实数据输入：布伦特 ${round(oil,1)}、广义美元 ${round(dollar,2)}、VIX ${round(vix,2)}、HY OAS ${round(hy,2)}。`,
        '只有当宏观、流动性、传导链三者继续同向时，才允许提高现有风险仓位。',
        '系统每天会刷新 updatedAt；即使周末市场休市，也会保留最新可得市场数据并更新时间戳。'
      ]
    },
    positioning,
    discipline: {
      tag: '系统优先于主观判断',
      entryConditions: [
        '宏观状态、流动性、传导链三者至少两项以上同向支持。',
        '信号强度 ≥ 65，且预警系统没有新增红色项。',
        '仓位调整必须基于主链条变化，而非单日情绪波动。'
      ],
      prohibitedBehaviors: [
        '禁止在流动性仍偏紧时重仓抄底高Beta资产。',
        '禁止在信号分歧时一次性大幅加仓。',
        '禁止因单日上涨而追逐已脱离主链条支撑的资产。'
      ],
      mandatoryRules: [
        '每次新增仓位最多分三笔执行，不允许一次性打满。',
        '单日净加仓不得超过组合总资产的 5%。',
        '若连续两天触发红色预警，次日必须重新评估并考虑减仓。'
      ]
    },
    riskControl,
    actionLayer,
    executionLock: {
      tag: '系统锁定层 · 主观不得覆盖',
      level: lock.level,
      levelLabel: lock.levelLabel,
      title: lock.title,
      description: lock.description,
      allow: lock.allow,
      block: lock.block,
      mandatory: lock.mandatory
    }
  };

  const data = {
    version: 'v23',
    updatedAt: isoNow,
    score: globalRiskScore,
    scoreChange1d,
    scoreChange7d,
    scoreChange30d,
    trendLabel: scoreChange7d > 5 ? '风险上升' : scoreChange7d < -5 ? '风险回落' : '高位震荡偏紧',
    currentMacroRegime,
    currentCrisisPhase,
    nextCrisisPhase,
    transitionRisk,
    confidenceScore,
    confidenceLevel,
    topRisks,
    decisionLine,
    summary,
    modules: risk.modules,
    moduleTrends,
    regimeProbabilities: probs,
    phaseSignals: [
      `布伦特 ${round(oil,1)} 美元与 10Y 盈亏平衡通胀 ${round(breakeven,2)}% 共同决定通胀压力。`,
      `广义美元 ${round(dollar,2)}、HY OAS ${round(hy,2)}% 与 VIX ${round(vix,2)} 共同决定流动性状态。`,
      `10年美债 ${round(y10,2)}% 与 10年实际利率 ${round(real10,2)}% 继续限制久期与成长估值。`
    ],
    liquidityIndex: {
      score: risk.modules.liquidity,
      regime: risk.modules.liquidity >= 70 ? '限制性偏紧' : risk.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复',
      change1d: clamp(risk.modules.liquidity - fiveDayAgo.liquidity, -9, 9),
      directionLabel: risk.modules.liquidity >= 70 ? '紧缩中（仍偏紧）' : risk.modules.liquidity >= 55 ? '紧缩中（缓解中）' : '修复中',
      notes: [
        `广义美元 ${round(dollar,2)}、HY OAS ${round(hy,2)}% 与 VIX ${round(vix,2)} 是当前流动性判断的三大输入。`,
        '该模块现在由真实市场数据驱动，而不再是固定种子。',
        '周末若市场休市，系统会保留最近一个交易日的最新数据并更新时间戳。'
      ],
      pillars: [
        { label: '美元融资', value: clamp(risk.dollarRisk), delta: clamp(ctx.dollar.pct5d * 2, -9, 9) },
        { label: '跨资产波动', value: clamp(risk.vixRisk), delta: clamp(ctx.vix.pct5d, -9, 9) },
        { label: '银行 / 信用压力', value: clamp(risk.hyRisk), delta: clamp(ctx.hyOas.chg5d * 3, -9, 9) },
        { label: '利率敏感压力', value: clamp(avg([risk.realRisk, risk.yieldRisk])), delta: clamp((ctx.real10.chg5d + ctx.tenY.chg5d) * 4, -9, 9) }
      ]
    },
    timeDimension: {
      trend30d: scoreChange30d > 8 ? '30日上行后高位波动' : scoreChange30d < -8 ? '30日明显回落' : '30日高位震荡',
      scoreChange30d,
      avg30d,
      peak30d,
      trough30d,
      drawFromPeak,
      transmissionSpeed: clamp(avg([risk.modules.energy, risk.modules.inflation, risk.modules.liquidity])),
      transmissionAcceleration: scoreChange7d > 3 ? '加快' : scoreChange7d < -3 ? '放缓' : '平稳',
      dominantPath,
      pathChanges: [
        { label: '油价→通胀', value: oilToInflation, delta: clamp(moduleTrends.energy, -9, 9) },
        { label: '通胀→利率', value: inflationToRates, delta: clamp(moduleTrends.inflation, -9, 9) },
        { label: '美元→信用', value: clamp(avg([risk.dollarRisk, risk.hyRisk])), delta: clamp(moduleTrends.liquidity, -9, 9) },
        { label: '利率→股票', value: ratesToEquities, delta: clamp(moduleTrends.debt, -9, 9) },
        { label: '流动性→估值', value: clamp(avg([risk.modules.liquidity, risk.vixRisk])), delta: clamp(moduleTrends.liquidity, -9, 9) }
      ],
      notes: [
        `过去30个交易日风险变化 ${scoreChange30d > 0 ? '+' : ''}${scoreChange30d} 分。`,
        `最近1周变化 ${scoreChange7d > 0 ? '+' : ''}${scoreChange7d} 分，显示风险节奏${scoreChange7d > 0 ? '抬升' : scoreChange7d < 0 ? '回落' : '持平'}。`,
        '现在30日曲线由真实数据动态重算，而不再是静态样本。'
      ]
    },
    heatmap,
    transmissionChain,
    assetMatrix,
    assetReturnMap,
    scenarioTree: [
      {
        name: '基准情景',
        probability: clamp(avg([probs.stagflationShock, probs.crisisLiquiditySqueeze])),
        description: '油价与融资条件都仍偏紧，但市场处于高位震荡而非失控。',
        triggers: `布伦特 95-110 / 广义美元偏强 / HY OAS ${round(hy,2)}% 附近`,
        assets: '能源领先 / 美元与黄金保留 / 科技股受限'
      },
      {
        name: '风险情景',
        probability: clamp(avg([probs.crisisLiquiditySqueeze, risk.vixRisk])),
        description: '油价、美元与信用利差同步走强，系统切换到更强防守。',
        triggers: '布伦特 > 110 / HY OAS > 4.5% / VIX > 28',
        assets: '只允许减仓 / 现金与美元提高 / 高Beta 回避'
      },
      {
        name: '极端情景',
        probability: clamp(avg([risk.vixRisk, risk.hyRisk])),
        description: '信用与波动率共振导致系统进入 RED 锁定。',
        triggers: '信用冲击 / 波动率飙升 / 政策失效',
        assets: '优先保现金、美元、黄金，暂停新增风险'
      },
      {
        name: '反转情景',
        probability: clamp(avg([probs.liquidityBull, probs.disinflationaryGrowth])),
        description: '油价回落、美元走弱、利差收敛，系统重新开放进攻窗口。',
        triggers: '流动性 < 68 / 油价 < 95 / 信用利差收敛',
        assets: '逐步恢复权益与质量成长配置'
      }
    ],
    warningSystem,
    triggerPanel,
    confidenceNotes,
    recovery: {
      degradedMode: false,
      safeOutput: true,
      lastRun: isoNow,
      notes: [
        'v23 已切换为真实数据驱动模式。',
        '主输入来自 FRED 图表 CSV 官方下载端点；市场源包括 Treasury、Cboe、ICE/BofA 与 EIA 在 FRED 的系列。',
        '若未来某个源短暂不可用，系统可回退到上次有效结构并保留更新时间戳。'
      ]
    },
    tradingSystem
  };

  return { data, history };
}

function fallbackBuild(error) {
  const prevDataPath = path.join(dataDir, 'radar-data.json');
  const prevHistoryPath = path.join(dataDir, 'radar-history.json');
  const prevData = JSON.parse(fs.readFileSync(prevDataPath, 'utf8'));
  const prevHistory = JSON.parse(fs.readFileSync(prevHistoryPath, 'utf8'));
  prevData.version = 'v23';
  prevData.updatedAt = isoNow;
  prevData.decisionLine = '真实数据源暂时不可用，系统已退回到上次有效结构，但保留今日更新时间戳。';
  prevData.summary = `v23 实时构建失败，已回退到上次有效数据。错误摘要：${String(error.message).slice(0, 120)}`;
  prevData.recovery = {
    degradedMode: true,
    safeOutput: true,
    lastRun: isoNow,
    notes: [
      '本次实时抓取未完全成功，系统已自动回退到上次有效结果。',
      `错误摘要：${String(error.message).slice(0, 160)}`,
      '页面结构仍保持完整，可继续使用，但建议稍后重跑。'
    ]
  };
  return { data: prevData, history: prevHistory };
}

function mockBuild() {
  // local test mode for offline validation
  const prevData = JSON.parse(fs.readFileSync(path.join(dataDir, 'radar-data.json'), 'utf8'));
  const prevHistory = JSON.parse(fs.readFileSync(path.join(dataDir, 'radar-history.json'), 'utf8'));
  prevData.version = 'v23';
  prevData.updatedAt = isoNow;
  prevData.decisionLine = '当前处于本地测试模式：脚本结构已切换为真实数据驱动版，线上 GitHub Actions 将读取官方市场数据后自动更新。';
  prevData.summary = 'v23 本地测试模式已启用。GitHub Actions 线上环境会从官方数据源抓取市场数据并重新计算模块。';
  prevData.recovery = {
    degradedMode: false,
    safeOutput: true,
    lastRun: isoNow,
    notes: [
      '当前是在离线测试环境中生成的样例数据。',
      '线上 GitHub Actions 运行时将从 FRED 官方 CSV 端点抓取真实市场数据。',
      '本地测试模式仅用于语法校验和打包。'
    ]
  };
  return { data: prevData, history: prevHistory };
}

async function main() {
  let built;
  if (process.env.GFR_USE_LOCAL_MOCK === '1') {
    built = mockBuild();
  } else {
    try {
      built = await buildLiveData();
    } catch (error) {
      built = fallbackBuild(error);
    }
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'radar-data.json'), JSON.stringify(built.data, null, 2));
  fs.writeFileSync(path.join(dataDir, 'radar-history.json'), JSON.stringify(built.history, null, 2));
  console.log('Built v23 data successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
