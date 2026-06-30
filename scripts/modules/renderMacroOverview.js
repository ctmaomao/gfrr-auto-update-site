// scripts/modules/renderMacroOverview.js
// M-94 V0 路径 C · Stage 4b-1A
// 职责:render macro-overview-shell 内 3 个 block(Hero + threshold + pressure-sources)
// 后续 Stage 4b-1B / 4b-2 扩展(market-temp / risk-engines / wow / trend SVG / signal-layers / macro-drivers / cross-validation)

import {
  $,
  fmtSigned,
  fmtNumSafe,
  fmtDeltaSafe,
} from './config.js?v=transport-shock-caveat-1';
import { buildCrossValidationMatrix, buildMacroCoherence } from './buildCrossValidationMatrix.js?v=transport-shock-caveat-1';
import { MODULE_LABELS } from './decision.js?v=transport-shock-caveat-1';
import {
  brentModeZh,
  moduleTone,
  riskBiasZh,
  sourceModeZh,
  trendArrow,
  worldOrderStateLabel,
} from './macroOverviewDisplayHelpers.js?v=transport-shock-caveat-1';
import { buildMacroOverviewHeadline, buildMacroOverviewVerdictBody } from './macroOverviewNarrative.js?v=transport-shock-caveat-1';

// ---------- 阈值 + 派生 helper ----------

// 6 module 真实派生 X red / Y yellow / Z green count
function deriveModuleBreakdown(modules) {
  if (!modules) return null;
  let red = 0, yellow = 0, green = 0;
  const keys = ['energy', 'geopolitical', 'inflation', 'liquidity', 'debt', 'banking'];
  for (const k of keys) {
    const tone = moduleTone(modules[k]);
    if (tone === 'red') red++;
    else if (tone === 'yellow') yellow++;
    else if (tone === 'green') green++;
  }
  return { red, yellow, green };
}

// ---------- Block 1: Hero (editorial-big-number) ----------

function renderHero({ radarData, worldOrderStressData, marketPricingMetricsData, oilDirectionalData }) {
  try {
    if (!radarData) {
      console.warn('[renderMacroOverview] renderHero: radarData missing, skip');
      return;
    }

    // big-left .value (顶层 score)
    if (Number.isFinite(radarData.score)) {
      const valueEl = $('hero-score-value');
      if (valueEl) {
        valueEl.textContent = '';
        valueEl.append(document.createTextNode(String(radarData.score)));
        const denominator = document.createElement('sup');
        denominator.textContent = '/100';
        valueEl.append(denominator);
      }
    }

    // big-left .breakdown — 派生 X 红 / Y 黄 / Z 绿
    const breakdown = deriveModuleBreakdown(radarData.modules);
    if (breakdown) {
      const breakdownEl = $('hero-breakdown-counts');
      if (breakdownEl) {
        breakdownEl.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = `${breakdown.red} 红 / ${breakdown.yellow} 黄 / ${breakdown.green} 绿`;
        breakdownEl.append(strong);
      }
    }

    // big-left .breakdown 第二行 — World Order overlay 数字
    if (worldOrderStressData && Number.isFinite(worldOrderStressData.score)) {
      const overlayEl = $('hero-overlay-score');
      if (overlayEl) {
        overlayEl.textContent = `${worldOrderStressData.score}(升档提示)`;
      }
    }

    // big-right .verdict-kicker
    const kickerEl = $('hero-verdict-kicker');
    if (kickerEl && radarData.dailyBrief?.macroState) {
      kickerEl.textContent = `THIS ISSUE · ${radarData.dailyBrief.macroState}`;
    }

    // big-right h2 — concise verdict label; long risk chain stays in the body/footer.
    const h2El = $('hero-verdict-headline');
    if (h2El) {
      const headline = buildMacroOverviewHeadline({
        radarData,
        worldOrderStressData,
        marketPricingMetricsData,
        oilDirectionalData,
      });
      if (headline) h2El.textContent = headline;
    }

    // big-right p — verdict body(Bubble Watch 改版:接活数据,每期自动派生)
    const bodyEl = $('hero-verdict-body');
    const verdictBody = buildMacroOverviewVerdictBody({
      radarData,
      worldOrderStressData,
      marketPricingMetricsData,
      oilDirectionalData,
    });
    if (bodyEl && verdictBody) bodyEl.textContent = verdictBody;

    // big-footer DOMINANT RISK CHAIN
    const chainEl = $('hero-dominant-chain');
    if (chainEl && radarData.dailyBrief?.dominantRiskChain?.labelZh) {
      chainEl.textContent = radarData.dailyBrief.dominantRiskChain.labelZh;
    }

    // big-footer WEEKLY CHANGE
    const weeklyEl = $('hero-weekly-change');
    if (weeklyEl && Number.isFinite(radarData.scoreChange7d)) {
      weeklyEl.textContent = `${fmtSigned(radarData.scoreChange7d)} (WoW)`;
    }

    // big-footer DATA HEALTH
    const healthEl = $('hero-data-health');
    if (healthEl && Number.isFinite(radarData.dailyRealtimeInput?.healthScore)) {
      healthEl.textContent = `${radarData.dailyRealtimeInput.healthScore}/100 · 数据正常`;
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderHero failed:', error);
  }
}

// ---------- Block 2: Threshold ----------

function renderThresholdBlock({ radarData, worldOrderStressData }) {
  try {
    if (!radarData) return;

    // .now 行 — 文案动态(主 score + overlay state)
    const nowEl = $('threshold-now-line');
    if (nowEl && Number.isFinite(radarData.score) && worldOrderStressData) {
      const woScore = worldOrderStressData.score;
      const woLabel = worldOrderStressData.labelZh || '';
      nowEl.textContent = `原始 ${radarData.score}(高风险预警) · 世界秩序升档 ${Number.isFinite(woScore) ? woScore : '—'}(${woLabel})`;
    }

    // 主 marker — left: ${score}%
    const mainMarkerEl = $('threshold-marker-main');
    if (mainMarkerEl && Number.isFinite(radarData.score)) {
      mainMarkerEl.style.left = `${radarData.score}%`;
      const labelSpan = mainMarkerEl.querySelector('.marker-label');
      if (labelSpan) {
        labelSpan.textContent = `原始 ${radarData.score}`;
      }
    }

    // overlay marker — left: ${woScore}%
    const overrideMarkerEl = $('threshold-marker-override');
    if (overrideMarkerEl && worldOrderStressData && Number.isFinite(worldOrderStressData.score)) {
      overrideMarkerEl.style.left = `${worldOrderStressData.score}%`;
      const labelSpan = overrideMarkerEl.querySelector('.marker-label');
      if (labelSpan) {
        labelSpan.textContent = `升档 ${worldOrderStressData.score}`;
      }
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderThresholdBlock failed:', error);
  }
}

// ---------- Block 3: Pressure Sources (6 mini-card) ----------

const PRESSURE_MODULES = [
  { key: 'energy', cardId: 'pressure-card-energy', label: 'Energy 能源', activeText: '能源传导主线' },
  { key: 'geopolitical', cardId: 'pressure-card-geopolitical', label: 'Geopolitical 地缘', activeText: '多战区压力' },
  { key: 'inflation', cardId: 'pressure-card-inflation', label: 'Inflation 通胀', activeText: '横盘观察' },
  { key: 'liquidity', cardId: 'pressure-card-liquidity', label: 'Liquidity 流动性', activeText: '边际收紧' },
  { key: 'debt', cardId: 'pressure-card-debt', label: 'Debt 债务', activeText: '杠杆稳定' },
  { key: 'banking', cardId: 'pressure-card-banking', label: 'Banking 银行', activeText: '持续改善' },
];

function renderPressureSources({ radarData }) {
  try {
    if (!radarData?.modules) return;

    for (const cfg of PRESSURE_MODULES) {
      const cardEl = $(cfg.cardId);
      if (!cardEl) continue;

      const score = radarData.modules[cfg.key];
      const trend = radarData.moduleTrends?.[cfg.key];
      const tone = moduleTone(score);

      if (tone === null) continue; // 数据缺失,保持 mock 静态值

      // 切换 class:remove all known tones, add real tone
      cardEl.classList.remove('red', 'yellow', 'green');
      cardEl.classList.add(tone);

      // 更新数字 .num
      const numEl = cardEl.querySelector('.num');
      if (numEl) numEl.textContent = String(score);

      // 更新 status .status — `${arrow} ${activeText}`
      const statusEl = cardEl.querySelector('.status');
      if (statusEl) {
        statusEl.textContent = `${trendArrow(trend)} ${cfg.activeText}`;
      }
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderPressureSources failed:', error);
  }
}

// ---------- Stage 4b-1B shared leaf helpers ----------

function latestRecord(records) {
  return Array.isArray(records) && records.length > 0 ? records[records.length - 1] : null;
}
function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 当前市值唯一取数:__effectiveDisplayInputs(实时有效)优先,缺则 displayInputsBaseline(当日快照)。
// 契约 DATA_CONTRACT.md:当前值来自 __effectiveDisplayInputs。display-only,不影响 scoring。
function currentValue(radarData, key) {
  return asNumber(radarData?.__effectiveDisplayInputs?.[key] ?? radarData?.displayInputsBaseline?.[key]);
}
function signedFixed(value, digits = 2) {
  const n = asNumber(value);
  if (n === null) return '—';
  const fixed = n.toFixed(digits);
  return n > 0 ? `+${fixed}` : fixed;
}
function moneyFixed(value) {
  const n = asNumber(value);
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}
function setLeafText(id, value) {
  const el = $(id);
  if (!el || value === null || value === undefined || value === '') return;
  el.textContent = String(value);
}
function setHidden(id, hidden) {
  const el = $(id);
  if (el) el.hidden = hidden;
}
function toneCode(tone) {
  if (tone === 'red') return 'RED';
  if (tone === 'yellow') return 'YEL';
  if (tone === 'green') return 'GRN';
  return '—';
}
function setMiniCardState(cardId, tone, statusText) {
  const cardEl = $(cardId);
  if (!cardEl || !tone) return;
  cardEl.classList.remove('red', 'yellow', 'green');
  cardEl.classList.add(tone);
  const numEl = cardEl.querySelector('.num');
  if (numEl) numEl.textContent = toneCode(tone);
  const statusEl = cardEl.querySelector('.status');
  if (statusEl && statusText) statusEl.textContent = statusText;
}
function deriveCreditEngine({ radarData }) {
  const hyOas = asNumber(radarData?.macroDrivers?.credit?.hyOas);
  const nfci = asNumber(radarData?.macroDrivers?.credit?.nfci);
  if (hyOas === null && nfci === null) return null;
  if ((hyOas !== null && hyOas >= 5) || (nfci !== null && nfci >= 0.5)) {
    return { tone: 'red', status: '信用应力扩散' };
  }
  if ((hyOas !== null && hyOas >= 3.5) || (nfci !== null && nfci >= 0)) {
    return { tone: 'yellow', status: '信用边际收紧' };
  }
  return { tone: 'green', status: '信用反向证据' };
}
function deriveConsumerEngine({ radarData }) {
  const sentiment = asNumber(radarData?.macroDrivers?.consumer?.umichSentiment);
  const regime = String(radarData?.macroDrivers?.consumer?.regime || '');
  if (sentiment === null && !regime) return null;
  if (sentiment !== null && sentiment < 45) {
    return { tone: 'red', status: '消费明显承压' };
  }
  if ((sentiment !== null && sentiment < 60) || regime.includes('走弱')) {
    return { tone: 'yellow', status: '实际工资压制' };
  }
  return { tone: 'green', status: '消费者稳健' };
}

// ---------- Block 7: Market Temperature ----------

function renderMarketTemperature({ marketPricingMetricsData }) {
  try {
    const mpm = marketPricingMetricsData;
    const qqq = latestRecord(mpm?.assets?.qqq?.records);
    const ndx = latestRecord(mpm?.assets?.ndx?.records);
    const ixic = latestRecord(mpm?.assets?.ixic?.records);
    if (!qqq) return;
    const qqqZ = asNumber(qqq.zScore);
    const ndxZ = asNumber(ndx?.zScore);
    const ixicZ = asNumber(ixic?.zScore);
    if (qqqZ !== null) {
      setLeafText('mt-zscore-value', signedFixed(qqqZ, 2));
    }
    if (qqqZ !== null && ndxZ !== null && ixicZ !== null) {
      setLeafText(
        'mt-narrative',
        `纳斯达克100 ETF(QQQ)当前价格距 60 周均值 ${qqqZ.toFixed(2)} 个标准差，处于历史第二极端区间。纳指100(NDX) ${signedFixed(ndxZ, 2)}σ / 纳指综合(IXIC) ${signedFixed(ixicZ, 2)}σ，整个美国成长股板块同步极端。`
      );
    }
    setLeafText('mt-close', moneyFixed(qqq.close));
    setLeafText('mt-ma60', moneyFixed(qqq.ma60));
    setLeafText('mt-stddev', moneyFixed(qqq.stdDev60));
    const minZ = asNumber(mpm?.zScoreRange?.min);
    const maxZ = asNumber(mpm?.zScoreRange?.max);
    if (minZ !== null && maxZ !== null) {
      setLeafText('mt-zscore-range', `[${signedFixed(minZ, 2)}, ${signedFixed(maxZ, 2)}]`);
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderMarketTemperature failed:', error);
  }
}

// ---------- Block 8: Risk Engines ----------

function renderRiskEngines({ radarData }) {
  try {
    if (!radarData) return;

    const energyTone = moduleTone(asNumber(radarData.modules?.energy));
    if (energyTone) {
      setMiniCardState('engine-card-b1', energyTone, energyTone === 'green' ? '能源回落' : '能源冲击主导');
    }
    const liquidityTone = moduleTone(asNumber(radarData.modules?.liquidity));
    if (liquidityTone) {
      setMiniCardState('engine-card-b2', liquidityTone, liquidityTone === 'green' ? '流动性平稳' : '流动性边际收紧');
    }
    const creditEngine = deriveCreditEngine({ radarData });
    if (creditEngine) {
      setMiniCardState('engine-card-b3', creditEngine.tone, creditEngine.status);
    }
    const debtTone = moduleTone(asNumber(radarData.modules?.debt));
    if (debtTone) {
      setMiniCardState('engine-card-b4', debtTone, debtTone === 'green' ? '杠杆稳定' : '债务压力抬升');
    }
    const consumerEngine = deriveConsumerEngine({ radarData });
    if (consumerEngine) {
      setMiniCardState('engine-card-b5', consumerEngine.tone, consumerEngine.status);
    }
    const geopoliticalTone = moduleTone(asNumber(radarData.modules?.geopolitical));
    if (geopoliticalTone) {
      setMiniCardState('engine-card-b6', geopoliticalTone, geopoliticalTone === 'green' ? '地缘降温' : '多战区压力');
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderRiskEngines failed:', error);
  }
}

// ---------- Block 10: WoW key changes ----------

function renderWowSection({ radarData, worldOrderStressData }) {
  try {
    if (!radarData) return;
    const crackSpread = asNumber(radarData.brentPricingLayer?.crackSpread);
    const crackSpread4wChange = asNumber(radarData.brentPricingLayer?.crackSpread4wChange);
    if (crackSpread !== null && crackSpread4wChange !== null) {
      setLeafText('wow-item-1-text', `布伦特原油(Brent)裂解价差(Crack Spread)走阔到 ${crackSpread.toFixed(2)},4 周变化 ${signedFixed(crackSpread4wChange, 2)}。`);
      setLeafText('wow-item-1-source', `炼油价差 4 周变化 ${signedFixed(crackSpread4wChange, 2)}`);
    }
    const hyOas = asNumber(radarData.macroDrivers?.credit?.hyOas);
    if (hyOas !== null) {
      setLeafText('wow-item-2-text', `高收益债利差(HY OAS)在 ${hyOas.toFixed(2)}% 低位,与波动率指数(VIX)同步走低。信用市场不验证恐慌。`);
      setLeafText('wow-item-2-source', '信用与波动率反向证据');
    }
    const woState = worldOrderStressData?.state;
    const woLabel = worldOrderStressData?.labelZh;
    if (woState) {
      setLeafText('wow-item-3-text', `世界秩序压力(World Order)当前为 ${worldOrderStateLabel(woState, woLabel)},结构性压力持续。`);
      setLeafText('wow-item-3-source', '世界秩序状态变化');
    }
    const futureMinusTargetMid = asNumber(radarData.macroDrivers?.policyExpectations?.futureMinusTargetMid);
    if (futureMinusTargetMid !== null) {
      const bp = futureMinusTargetMid * 100;
      setLeafText('wow-item-4-text', `美联储(Fed)政策路径分歧 ${signedFixed(bp, 1)}bp,市场定价与目标中位仍有偏差。`);
      setLeafText('wow-item-4-source', '美联储(Fed)政策路径分歧');
    }
    const initialClaims = asNumber(radarData.macroDrivers?.employment?.initialClaims);
    if (initialClaims !== null) {
      setLeafText('wow-item-5-text', `首次申请稳在 ${(initialClaims / 1000).toFixed(0)}k,就业扩散仍需观察。`);
      setLeafText('wow-item-5-source', '就业扩散度');
    }
    const consumerCheck = Array.isArray(radarData.divergenceLayer?.checks)
      ? radarData.divergenceLayer.checks.find((item) => item?.key === 'consumer_vs_asset_pricing')
      : null;
    if (consumerCheck) {
      const scoreText = Number.isFinite(consumerCheck.score) ? `分数 ${consumerCheck.score}` : '分数 —';
      const statusZh = ({ stress: '压力', watch: '观察', normal: '正常' })[consumerCheck.status] || consumerCheck.status;
      const statusText = statusZh ? `(${statusZh})` : '';
      setLeafText('wow-item-6-text', `消费与资产价格背离 ${scoreText}${statusText}。`);
      setLeafText('wow-item-6-source', '消费与资产价格背离');
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderWowSection failed:', error);
  }
}

// ---------- Stage 4b-2 shared helpers ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
const TREND_POINT_COUNT = 8;
const TREND_CHART_HEIGHT = 220;
let TREND_CHART = buildTrendChart(800);
let TREND_X = buildTrendX(TREND_CHART);

function buildTrendChart(width) {
  const safeWidth = Math.max(320, Math.round(asNumber(width) || 800));
  return {
    width: safeWidth,
    height: TREND_CHART_HEIGHT,
    plotLeft: 44,
    plotRight: safeWidth - 14,
    plotTop: 10,
    plotBottom: 194,
    yMin: 0,
    yMax: 100
  };
}

function buildTrendX(chart) {
  return Array.from({ length: TREND_POINT_COUNT }, (_, index) => (
    chart.plotLeft
    + ((chart.plotRight - chart.plotLeft) * index) / (TREND_POINT_COUNT - 1)
  ));
}

function trendLayoutWidth() {
  const wrap = document.querySelector('.trend-svg-wrap');
  return wrap?.clientWidth || 800;
}

function syncTrendFrame(chart) {
  const svg = document.querySelector('.trend-svg-wrap svg');
  if (!svg) return;
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('height', String(chart.height));

  const canvas = svg.querySelector('.trend-canvas');
  if (canvas) {
    canvas.setAttribute('width', String(chart.width));
    canvas.setAttribute('height', String(chart.height));
  }

  const yFor = (value) => {
    const ratio = (clamp(value, chart.yMin, chart.yMax) - chart.yMin) / (chart.yMax - chart.yMin);
    return chart.plotBottom - ratio * (chart.plotBottom - chart.plotTop);
  };

  const gridValues = [100, 80, 60, 40, 20, 0];
  svg.querySelectorAll('.trend-grid-line').forEach((line, index) => {
    const y = yFor(gridValues[index] ?? 0);
    line.setAttribute('x1', String(chart.plotLeft));
    line.setAttribute('x2', String(chart.plotRight));
    line.setAttribute('y1', Number(y.toFixed(2)).toString());
    line.setAttribute('y2', Number(y.toFixed(2)).toString());
  });

  for (const value of [25, 40, 60, 80]) {
    const y = yFor(value);
    const line = svg.querySelector(`.trend-threshold.threshold-${value}`);
    if (line) {
      line.setAttribute('x1', String(chart.plotLeft));
      line.setAttribute('x2', String(chart.plotRight));
      line.setAttribute('y1', Number(y.toFixed(2)).toString());
      line.setAttribute('y2', Number(y.toFixed(2)).toString());
    }
    const label = svg.querySelector(`.trend-threshold-label.threshold-${value}`);
    if (label) {
      label.setAttribute('x', Number((chart.plotRight + 12).toFixed(2)).toString());
      label.setAttribute('y', Number((y + 3).toFixed(2)).toString());
    }
  }

  const axes = svg.querySelectorAll('.trend-axis');
  if (axes[0]) {
    axes[0].setAttribute('x1', String(chart.plotLeft));
    axes[0].setAttribute('x2', String(chart.plotLeft));
    axes[0].setAttribute('y1', String(chart.plotTop));
    axes[0].setAttribute('y2', String(chart.plotBottom));
  }
  if (axes[1]) {
    axes[1].setAttribute('x1', String(chart.plotLeft));
    axes[1].setAttribute('x2', String(chart.plotRight));
    axes[1].setAttribute('y1', String(chart.plotBottom));
    axes[1].setAttribute('y2', String(chart.plotBottom));
  }

  svg.querySelectorAll('.trend-axis-label').forEach((label, index) => {
    const value = gridValues[index] ?? 0;
    const y = yFor(value);
    label.setAttribute('x', String(chart.plotLeft - 8));
    label.setAttribute('y', Number((y + 4).toFixed(2)).toString());
  });
}

function prepareTrendLayout() {
  TREND_CHART = buildTrendChart(trendLayoutWidth());
  TREND_X = buildTrendX(TREND_CHART);
  syncTrendFrame(TREND_CHART);
}

function signedFixedWithZero(value, digits = 1) {
  const n = asNumber(value);
  if (n === null) return '—';
  const fixed = n.toFixed(digits);
  return n >= 0 ? `+${fixed}` : fixed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trendY(score) {
  const n = asNumber(score);
  if (n === null) return null;
  const ratio = (clamp(n, TREND_CHART.yMin, TREND_CHART.yMax) - TREND_CHART.yMin)
    / (TREND_CHART.yMax - TREND_CHART.yMin);
  return TREND_CHART.plotBottom - ratio * (TREND_CHART.plotBottom - TREND_CHART.plotTop);
}

function pointPair(x, y) {
  return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
}

function formatTrendDateLabel(value, fallback) {
  const text = textValue(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (match) return `${match[2]}-${match[3]}`;
  return fallback;
}

function trendIsoDate(value) {
  const text = textValue(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (match) return match[1];
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function mergeCurrentTrendSnapshot(weekly, radarData, worldOrderStressData) {
  if (!Array.isArray(weekly) || weekly.length !== TREND_X.length) return weekly;
  const currentScore = asNumber(radarData?.score);
  const overlayScore = asNumber(worldOrderStressData?.score);
  if (currentScore === null && overlayScore === null) return weekly;

  const next = weekly.slice();
  const last = next[next.length - 1] || {};
  const currentDate = trendIsoDate(radarData?.updatedAt) || trendIsoDate(worldOrderStressData?.observedAt) || last.date;
  const merged = {
    ...last,
    date: currentDate || last.date
  };

  if (currentScore !== null) merged.score = currentScore;

  if (overlayScore !== null) {
    merged.worldOrderStress = {
      ...(last.worldOrderStress || {}),
      ...(worldOrderStressData || {}),
      score: overlayScore,
      observedAt: textValue(worldOrderStressData?.observedAt) || currentDate || textValue(last.worldOrderStress?.observedAt),
    };
  }

  next[next.length - 1] = merged;
  return next;
}

function updateTrendXAxisLabels(weekly) {
  weekly.forEach((item, index) => {
    const label = $(`trend-x-${index}`);
    if (!label) return;
    label.textContent = formatTrendDateLabel(item?.date, index === weekly.length - 1 ? 'NOW' : `W-${weekly.length - 1 - index}`);
    label.setAttribute('x', Number(TREND_X[index].toFixed(2)).toString());
    label.setAttribute('text-anchor', index === weekly.length - 1 ? 'end' : 'middle');
    label.classList.toggle('is-now', index === weekly.length - 1);
  });
}

function buildTrendPoint(index, score, source = null) {
  const y = trendY(score);
  if (y === null) return null;
  return {
    x: TREND_X[index],
    y,
    score: asNumber(score),
    source
  };
}

function pointsToAttribute(points) {
  return points
    .filter(Boolean)
    .map((point) => pointPair(point.x, point.y))
    .join(' ');
}

function renderTrendDots(groupId, points, className, radius, lastId) {
  const group = $(groupId);
  if (!group) return;
  group.textContent = '';
  points.filter(Boolean).forEach((point, index, validPoints) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', `trend-dot ${className}`);
    circle.setAttribute('cx', Number(point.x.toFixed(2)).toString());
    circle.setAttribute('cy', Number(point.y.toFixed(2)).toString());
    circle.setAttribute('r', String(radius));
    if (index === validPoints.length - 1 && lastId) {
      circle.setAttribute('id', lastId);
    }
    if (point.score !== null) {
      circle.setAttribute('aria-label', `${point.score.toFixed(0)} on ${point.source?.date || 'trend point'}`);
    }
    group.appendChild(circle);
  });
}

function pickEightWeeklyPoints(history) {
  if (!Array.isArray(history) || history.length < 8) return [];
  const points = [];
  for (let i = 7; i >= 0; i--) {
    const idx = history.length - 1 - i * 7;
    if (idx < 0 || !history[idx]) return [];
    points.push(history[idx]);
  }
  return points;
}

const WO_HISTORY_MIN_VALID_POINTS = 5;
const WO_HISTORY_STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseObservedAtMs(value) {
  const text = textValue(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeOverlayHistoryPoint(historyItem) {
  const wo = historyItem?.worldOrderStress;
  const score = asNumber(wo?.score);
  const date = textValue(historyItem?.date);
  const observedAtRaw = textValue(wo?.observedAt);
  const observedAt = observedAtRaw || date;
  const observedAtMs = parseObservedAtMs(observedAt);
  if (score === null || !observedAt || observedAtMs === null) {
    return {
      date: date || null,
      valid: false
    };
  }
  return {
    date: date || null,
    valid: true,
    score,
    state: textValue(wo?.state),
    labelZh: textValue(wo?.labelZh),
    observedAt,
    observedAtSource: observedAtRaw ? 'observedAt' : 'history-date',
    observedAtMs,
    freshness: textValue(wo?.freshness)
  };
}

function pickEightWeeklyOverlay(history) {
  const weekly = pickEightWeeklyPoints(history);
  if (weekly.length !== 8) return [];
  return weekly.map((item) => normalizeOverlayHistoryPoint(item));
}

function analyzeOverlayHistory(overlayWeekly, nowMs = Date.now()) {
  const validPoints = overlayWeekly.filter((point) => point.valid);
  const observedAtSet = new Set(validPoints.map((point) => point.observedAt));
  const latestPoint = validPoints.reduce((latest, point) => {
    if (!latest || point.observedAtMs > latest.observedAtMs) return point;
    return latest;
  }, null);
  const latestObservedAtAgeDays = latestPoint
    ? Math.max(0, (nowMs - latestPoint.observedAtMs) / DAY_MS)
    : null;
  const fullFallback = validPoints.length < WO_HISTORY_MIN_VALID_POINTS || observedAtSet.size < 2;
  const staleTail = !fullFallback && latestObservedAtAgeDays !== null && latestObservedAtAgeDays > WO_HISTORY_STALE_DAYS;
  return {
    validWoPoints: validPoints.length,
    uniqueObservedAt: observedAtSet.size,
    latestObservedAt: latestPoint?.observedAt || null,
    latestObservedAtAgeDays,
    fullFallback,
    staleTail
  };
}

function staleTailStartIndex(overlayWeekly, latestObservedAt) {
  if (!latestObservedAt) return -1;
  let index = -1;
  for (let i = overlayWeekly.length - 1; i >= 0; i -= 1) {
    if (overlayWeekly[i]?.valid && overlayWeekly[i].observedAt === latestObservedAt) {
      index = i;
      break;
    }
  }
  if (index < 0) return -1;
  while (index > 0 && overlayWeekly[index - 1]?.valid && overlayWeekly[index - 1].observedAt === latestObservedAt) {
    index -= 1;
  }
  return index;
}

function buildOverlayTrendPoints(overlayWeekly, fallbackScore, analysis) {
  const fallbackY = trendY(fallbackScore);
  if (fallbackY === null) return null;
  if (overlayWeekly.length === TREND_X.length) {
    const slottedPoints = overlayWeekly.map((point, index) => (
      point.valid ? buildTrendPoint(index, point.score, point) : null
    ));
    const validSlottedPoints = slottedPoints.filter(Boolean);
    if (validSlottedPoints.length >= 2 && validSlottedPoints.length < TREND_X.length) {
      return {
        mode: 'partial-history',
        points: validSlottedPoints,
        dotPoints: validSlottedPoints,
        lastY: validSlottedPoints[validSlottedPoints.length - 1].y,
        validPointCount: validSlottedPoints.length
      };
    }
  }

  if (analysis.fullFallback || overlayWeekly.length !== TREND_X.length) {
    const fallbackPoints = TREND_X.map((x, index) => ({
      x,
      y: fallbackY,
      score: fallbackScore,
      source: overlayWeekly[index] || null
    }));
    return {
      mode: 'fallback',
      points: fallbackPoints,
      dotPoints: fallbackPoints.slice(-1),
      lastY: fallbackY,
      validPointCount: analysis.validWoPoints
    };
  }

  const tailStart = analysis.staleTail ? staleTailStartIndex(overlayWeekly, analysis.latestObservedAt) : -1;
  let lastY = fallbackY;
  const points = overlayWeekly.map((point, index) => {
    const shouldExtendTail = analysis.staleTail && tailStart >= 0 && index > tailStart;
    if (!shouldExtendTail && point.valid) {
      const y = trendY(point.score);
      if (y !== null) lastY = y;
    }
    return {
      x: TREND_X[index],
      y: lastY,
      score: point.valid ? point.score : fallbackScore,
      source: point
    };
  });

  return {
    mode: analysis.staleTail ? 'stale-tail' : 'history',
    points,
    dotPoints: points,
    lastY
  };
}

function overlayStatusSuffix(mode) {
  if (mode === 'partial-history') return '历史累积中';
  if (mode === 'fallback') return '参考线';
  if (mode === 'stale-tail') return '尾部滞后';
  return '';
}

function renderOverlayTrendStatus({ mode, radarData, worldOrderStressData, analysis }) {
  const suffix = overlayStatusSuffix(mode);
  const mainScore = asNumber(radarData?.score);
  const woScore = asNumber(worldOrderStressData?.score);
  const woLabel = textValue(worldOrderStressData?.labelZh);
  const mainText = mainScore === null ? '—' : String(Math.round(mainScore));
  const scoreText = woScore === null ? '—' : String(Math.round(woScore));
  const labelText = woLabel ? `(${woLabel})` : '';
  const suffixText = suffix ? ` · overlay ${suffix}` : '';
  const nowEl = $('threshold-now-line');
  if (nowEl) {
    nowEl.textContent = `原始 ${mainText}(高风险预警) · overlay ${scoreText}${labelText}${suffixText}`;
  }
  const marker = $('threshold-marker-override');
  const labelSpan = marker?.querySelector('.marker-label');
  if (labelSpan) {
    labelSpan.textContent = suffix ? `overlay ${scoreText} (${suffix})` : `overlay ${scoreText}`;
  }
  const overlayLine = $('trend-line-overlay');
  if (overlayLine) {
    const detail = mode === 'partial-history'
      ? `${analysis.validWoPoints} valid weekly anchors; history still accumulating`
      : mode === 'stale-tail' && analysis.latestObservedAtAgeDays !== null
      ? `latest observedAt age ${analysis.latestObservedAtAgeDays.toFixed(1)} days`
      : `${analysis.validWoPoints} valid points, ${analysis.uniqueObservedAt} unique observedAt`;
    overlayLine.setAttribute('aria-label', `World Order overlay trend ${mode}; ${detail}`);
  }
  const modeEl = $('trend-overlay-mode');
  if (modeEl) {
    if (mode === 'partial-history') {
      modeEl.textContent = `升档层(Overlay) ${analysis.validWoPoints}/8 周锚点`;
    } else if (mode === 'fallback') {
      modeEl.textContent = '升档层(Overlay)历史不足: 参考线';
    } else if (mode === 'stale-tail') {
      modeEl.textContent = '升档层(Overlay)尾部滞后';
    } else {
      modeEl.textContent = '升档层(Overlay) 8 周历史';
    }
  }
}

function latestQqqZ(marketPricingMetricsData) {
  const qqq = latestRecord(marketPricingMetricsData?.assets?.qqq?.records);
  return asNumber(qqq?.zScore);
}

function formatStatus(score, isActive) {
  return `分数 ${score} · ${isActive ? '已激活' : '潜伏'}`;
}

function setNarrative(index, item) {
  const root = $(`narrative-${index}`);
  if (root) root.classList.toggle('active', item.isActive);
  setLeafText(`narrative-${index}-name`, item.shortName || item.name);
  setLeafText(`narrative-${index}-score`, formatStatus(item.score, item.isActive));
  setLeafText(`narrative-${index}-desc`, item.description);
}

function deriveNarratives({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  const energy = asNumber(radarData?.modules?.energy);
  const inflation = asNumber(radarData?.modules?.inflation);
  const liquidity = asNumber(radarData?.modules?.liquidity);
  const brent = currentValue(radarData, 'brent') ?? asNumber(radarData?.brentPricingLayer?.selectedBrent?.value);
  const crackSpread = asNumber(radarData?.brentPricingLayer?.crackSpread);
  const sentiment = asNumber(radarData?.macroDrivers?.consumer?.umichSentiment);
  const ismPmi = asNumber(radarData?.macroDrivers?.consumer?.ismManufacturingPmi);
  const woScore = asNumber(worldOrderStressData?.score);
  const woDisplay = worldOrderStateLabel(worldOrderStressData?.state, worldOrderStressData?.labelZh);
  const qqqZ = latestQqqZ(marketPricingMetricsData);
  const hyOas = asNumber(radarData?.macroDrivers?.credit?.hyOas);
  const igOas = asNumber(radarData?.macroDrivers?.credit?.igOas);
  const nfci = asNumber(radarData?.macroDrivers?.credit?.nfci);
  const onRrpLevel = radarData?.macroDrivers?.fedLiquidity?.onRrpLevel || '';
  const repoSpreadRegime = radarData?.macroDrivers?.fedLiquidity?.repoSpreadRegime || '';
  const has2019Signal = onRrpLevel === '告急' && repoSpreadRegime !== '正常';

  const n1Score = Math.round(energy ?? 0);
  const n1Active = n1Score >= 65;
  const n2Score = Math.round(((energy ?? 0) + (inflation ?? 0) + (100 - (sentiment ?? 100))) / 3);
  const n2Active = n2Score >= 55;
  const n3Score = Math.round(woScore ?? 0);
  const n3Active = n3Score >= 65;
  const n4Score = Math.round((qqqZ ?? 0) * 15 + 50);
  const n4Active = n4Score >= 65;
  const n5Score = Math.round((qqqZ ?? 0) * 15 + 30);
  const n5Active = n5Score >= 65;
  const n6Raw = ((hyOas ?? 2) - 2) * 25 + ((nfci ?? -0.5) + 0.5) * 30;
  const n6Score = Math.round(clamp(n6Raw, 0, 100));
  const n6Active = n6Score >= 50;
  const n7Score = Math.round(liquidity ?? 0);
  const n7Active = n7Score >= 60;

  return [
    {
      shortName: '能源冲击',
      name: '能源冲击',
      score: n1Score,
      isActive: n1Active,
      description: n1Active
        ? `布伦特原油(Brent) ${brent !== null ? brent.toFixed(2) : '—'} + 裂解价差(Crack Spread)走阔到 ${crackSpread !== null ? crackSpread.toFixed(2) : '—'},2022 模式重演。下一节是是否传导至消费者物价(CPI)/ 盈亏平衡通胀(breakeven)。`
        : `布伦特原油(Brent) ${brent !== null ? brent.toFixed(2) : '—'} + 裂解价差(Crack Spread) ${crackSpread !== null ? crackSpread.toFixed(2) : '—'},暂未触发能源传导主线条件。`,
    },
    {
      shortName: '滞胀压力',
      name: '滞胀压力',
      score: n2Score,
      isActive: n2Active,
      description: n2Active
        ? `美国制造业景气(ISM PMI) ${ismPmi !== null ? ismPmi.toFixed(1) : '—'} ${ismPmi !== null ? (ismPmi < 50 ? '收缩' : '扩张') : '—'} + 能源涨价 + 实际工资压制。三件套均已出现,但信用未验证。`
        : `美国制造业景气(ISM PMI) ${ismPmi !== null ? ismPmi.toFixed(1) : '—'} ${ismPmi !== null ? (ismPmi < 50 ? '收缩' : '扩张') : '—'} + 能源涨价。三件套尚未集结,观察中。`,
    },
    {
      shortName: '世界秩序压力穿越',
      name: '世界秩序压力穿越',
      score: n3Score,
      isActive: n3Active,
      description: n3Active
        ? `${woDisplay} 持续,触发橙色升档指针。经济制裁(OFAC)+全球新闻事件(GDELT)双印证。`
        : `${woDisplay} 未触发升档阈值。经济制裁(OFAC)+全球新闻事件(GDELT)双印证。`,
    },
    {
      shortName: '风险资产错配',
      name: '风险资产错配',
      score: n4Score,
      isActive: n4Active,
      description: n4Active
        ? '标普500(SPX)仍在高位但纳指100(NDX)跑赢,内部分化已达高警戒。'
        : '标普500(SPX)仍在高位但纳指100(NDX)跑赢,内部分化未到危机程度。',
    },
    {
      shortName: '过热确认',
      name: '过热确认',
      score: n5Score,
      isActive: n5Active,
      description: n5Active
        ? `纳斯达克100 ETF(QQQ)偏离度(z-score) ${signedFixed(qqqZ, 2)}σ ${(qqqZ ?? 0) > 2 ? '极度过热' : '偏热'},波动率与信用未同步,缺少印证。`
        : `纳斯达克100 ETF(QQQ)偏离度(z-score) ${signedFixed(qqqZ, 2)}σ ${(qqqZ ?? 0) > 2 ? '极度过热' : '偏热'},但信用 + 波动率没有验证,缺少同步证据。`,
    },
    {
      shortName: '信用利差告警',
      name: '信用利差告警',
      score: n6Score,
      isActive: n6Active,
      description: n6Active
        ? `高收益债利差(HY OAS) ${hyOas !== null ? hyOas.toFixed(2) : '—'}% / 投资级利差(IG OAS) ${igOas !== null ? igOas.toFixed(2) : '—'}% / 金融条件指数(NFCI) ${signedFixed(nfci, 2)}。信用层进入边际收紧。`
        : `高收益债利差(HY OAS) ${hyOas !== null ? hyOas.toFixed(2) : '—'}% / 投资级利差(IG OAS) ${igOas !== null ? igOas.toFixed(2) : '—'}% / 金融条件指数(NFCI) ${signedFixed(nfci, 2)}。压力初现但远未到告警阈值。`,
    },
    {
      shortName: '流动性收紧',
      name: '流动性收紧',
      score: n7Score,
      isActive: n7Active,
      description: n7Active
        ? `水位 / 回购 / 隔夜出现压力。${has2019Signal ? '2019-09 信号目前存在' : '2019-09 信号目前不存在'}。`
        : `水位 / 回购 / 隔夜三层均无压力。${has2019Signal ? '2019-09 信号目前存在' : '2019-09 信号目前不存在'}。`,
    },
  ];
}

// ---------- Block 4: Trend SVG ----------

let lastTrendSvgArgs = null;
let trendResizeBound = false;
let trendResizeTimer = null;

function bindTrendResizeHandler() {
  if (trendResizeBound || typeof window === 'undefined') return;
  trendResizeBound = true;
  window.addEventListener('resize', () => {
    if (!lastTrendSvgArgs) return;
    window.clearTimeout(trendResizeTimer);
    trendResizeTimer = window.setTimeout(() => renderTrendSvg(lastTrendSvgArgs), 120);
  });
}

function renderTrendSvg({ radarData, radarHistoryData, worldOrderStressData }) {
  try {
    lastTrendSvgArgs = { radarData, radarHistoryData, worldOrderStressData };
    bindTrendResizeHandler();
    prepareTrendLayout();
    const weekly = mergeCurrentTrendSnapshot(
      pickEightWeeklyPoints(radarHistoryData),
      radarData,
      worldOrderStressData
    );
    if (weekly.length !== 8) return;
    updateTrendXAxisLabels(weekly);
    const scorePoints = weekly.map((item, index) => buildTrendPoint(index, item.score, item));
    if (scorePoints.some((p) => p === null)) return;
    const scoreLine = $('trend-line-score');
    if (scoreLine) {
      scoreLine.setAttribute('points', pointsToAttribute(scorePoints));
      scoreLine.setAttribute('aria-label', `Risk score trend ${weekly.map((item) => `${item.date}:${Math.round(item.score)}`).join(', ')}`);
    }
    renderTrendDots('trend-dots-score', scorePoints, 'trend-dot-score', 4, 'trend-dot-score');

    const overlayScore = asNumber(worldOrderStressData?.score);
    if (overlayScore === null) return;
    const overlayWeekly = weekly.map((item) => normalizeOverlayHistoryPoint(item));
    const analysis = analyzeOverlayHistory(overlayWeekly);
    const overlayTrend = buildOverlayTrendPoints(overlayWeekly, overlayScore, analysis);
    if (!overlayTrend) return;
    const overlayLine = $('trend-line-overlay');
    if (overlayLine) {
      overlayLine.setAttribute('points', pointsToAttribute(overlayTrend.points));
      overlayLine.classList.toggle('is-partial', overlayTrend.mode === 'partial-history');
      overlayLine.classList.toggle('is-fallback', overlayTrend.mode === 'fallback');
    }
    renderTrendDots('trend-dots-overlay', overlayTrend.dotPoints || overlayTrend.points, 'trend-dot-overlay', 3, 'trend-dot-overlay');
    renderOverlayTrendStatus({
      mode: overlayTrend.mode,
      radarData,
      worldOrderStressData,
      analysis
    });
  } catch (error) {
    console.error('[renderMacroOverview] renderTrendSvg failed:', error);
  }
}

// ---------- Block 5: Signal Layers ----------

function renderSignalLayers({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  try {
    const narratives = deriveNarratives({ radarData, worldOrderStressData, marketPricingMetricsData });
    narratives.forEach((item, index) => setNarrative(index + 1, item));
  } catch (error) {
    console.error('[renderMacroOverview] renderSignalLayers failed:', error);
  }
}

// ---------- Block 6: Macro Drivers ----------

function renderMacroDriversPillars({ radarData }) {
  try {
    const fed = radarData?.macroDrivers?.fedLiquidity || {};
    const policy = radarData?.macroDrivers?.policyExpectations || {};
    const curve = radarData?.macroDrivers?.curve || {};
    const credit = radarData?.macroDrivers?.credit || {};

    const reserveT = asNumber(fed.reserveBalances) !== null ? (asNumber(fed.reserveBalances) / 1000000).toFixed(2) : '—';
    const repoBp = signedFixedWithZero(asNumber(fed.bgcrSofrSpread), 0);
    setLeafText('pillar-1-text', `${fed.regime || '—'}。美联储总资产(WALCL) / 银行准备金 ${reserveT}T / 回购利差(BGCR-SOFR) ${repoBp}bp / 隔夜利率锚(SOFR-EFFR)锚定。隔夜逆回购: ${fed.onRrpLevel || '—'}。`);

    const policySpread = asNumber(policy.futureMinusTargetMid);
    const policyBp = signedFixedWithZero(policySpread !== null ? policySpread * 100 : null, 1);
    const toneZh = ({ hawkish: '鹰派', dovish: '鸽派', neutral: '中性' })[policy.policyTone] || policy.policyTone || '—';
    setLeafText('pillar-2-text', `市场与委员分歧。期货隐含与目标中值差 ${policyBp}bp,政策基调: ${toneZh}。`);

    const curveSpread = asNumber(curve.t10y2y);
    const curveBp = signedFixedWithZero(curveSpread !== null ? curveSpread * 100 : null, 0);
    setLeafText('pillar-3-text', `10年-2年利差(t10y2y) ${curveBp}bp,曲线状态: ${curve.regime || '—'}。${curve.steepeningAlert ? '陡峭化告警激活,通常领先衰退 6-18 月' : '未触发陡峭化告警'}。`);

    const hy = asNumber(credit.hyOas);
    const ig = asNumber(credit.igOas);
    const nfci = asNumber(credit.nfci);
    setLeafText('pillar-4-text', `高收益债利差(HY OAS) ${hy !== null ? hy.toFixed(2) : '—'}% / 投资级利差(IG OAS) ${ig !== null ? ig.toFixed(2) : '—'}% / 金融条件指数(NFCI) ${signedFixed(nfci, 2)} (${credit.nfciRegime || '—'}) / 银行信贷调查(SLOOS) ${credit.sloosRegime || '—'}。`);
  } catch (error) {
    console.error('[renderMacroOverview] renderMacroDriversPillars failed:', error);
  }
}

// ---------- Block 9: Cross Validation ----------

function renderCrossValidation({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  try {
    const matrix = buildCrossValidationMatrix(radarData, worldOrderStressData, marketPricingMetricsData, radarData?.macroDrivers?.fedLiquidity);
    const narratives = Array.isArray(matrix?.narratives) ? matrix.narratives : [];
    const strong = narratives.filter((n) => n.assessment === 'strong_confirmation').length;
    const partial = narratives.filter((n) => n.assessment === 'partial_confirmation').length;
    const contradiction = narratives.filter((n) => n.assessment === 'contradiction').length;
    const consistencyScore = asNumber(matrix?.consistencyScore);
    setLeafText('cv-consistency-value', consistencyScore !== null ? String(consistencyScore) : '—');
    const fill = $('cv-bar-fill');
    if (fill) fill.style.width = `${consistencyScore !== null ? consistencyScore : 0}%`;
    setLeafText('cv-breakdown-counts', `强确认 ${strong} / 部分确认 ${partial} / 矛盾 ${contradiction}`);
    setLeafText('cv-summary-line', matrix?.oneLineSummary || '—');
  } catch (error) {
    console.error('[renderMacroOverview] renderCrossValidation failed:', error);
  }
}

// ---------- Block 9b: Macro Coherence(批 E,display-only 定性印证) ----------

function macroCoherenceToneClass(verdict) {
  if (verdict === '印证') return 'mc-confirm';
  if (verdict === '背离') return 'mc-diverge';
  return 'mc-background';
}

function renderMacroCoherence({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  try {
    const matrix = buildCrossValidationMatrix(radarData, worldOrderStressData, marketPricingMetricsData, radarData?.macroDrivers?.fedLiquidity);
    const coherence = buildMacroCoherence(radarData, matrix, marketPricingMetricsData);
    const rowsRoot = $('mc-rows');
    if (rowsRoot) {
      const rows = (coherence?.signals || []).map((sig) => {
        const row = document.createElement('div');
        row.className = 'mc-row';
        const head = document.createElement('div');
        head.className = 'mc-row-head';
        const persp = document.createElement('span');
        persp.className = 'mc-perspective';
        persp.textContent = sig.perspectiveZh;
        const verdict = document.createElement('span');
        verdict.className = `mc-verdict ${macroCoherenceToneClass(sig.verdict)}`;
        verdict.textContent = sig.verdict;
        const role = document.createElement('span');
        role.className = 'mc-role';
        role.textContent = sig.timeRole;
        head.append(persp, verdict, role);
        const reason = document.createElement('div');
        reason.className = 'mc-reason';
        reason.textContent = sig.reason;
        const caveat = document.createElement('div');
        caveat.className = 'mc-caveat';
        caveat.textContent = sig.caveat;
        row.append(head, reason, caveat);
        return row;
      });
      rowsRoot.replaceChildren(...rows);
    }
    setLeafText('mc-summary-line', coherence?.summaryLine || '—');
  } catch (error) {
    console.error('[renderMacroOverview] renderMacroCoherence failed:', error);
  }
}

// ---------- Stage 5a shared helpers ----------

const HEATMAP_KEY_BY_CELL = {
  us: 'us',
  europe: 'europe',
  middleeast: 'middleeast',
  china: 'china',
  japan: 'japan',
  latam: 'latam',
};

function heatmapTone(risk) {
  const n = asNumber(risk);
  if (n === null) return null;
  if (n >= 70) return 'severe';
  if (n >= 50) return 'high';
  if (n >= 30) return 'med';
  return 'low';
}

function indicatorTone(score) {
  const n = asNumber(score);
  if (n === null) return null;
  if (n >= 70) return 'red';
  if (n >= 50) return 'yellow';
  return 'green';
}

function vixTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n < 18) return 'green';
  if (n < 25) return 'yellow';
  return 'red';
}

function setToneClass(id, baseClass, tone) {
  const el = $(id);
  if (!el || !tone) return;
  el.className = `${baseClass} ${tone}`;
}

function setBadge(id, tone, label = null) {
  const el = $(id);
  if (!el || !tone) return;
  el.className = `badge ${tone}`;
  el.textContent = label || tone.toUpperCase();
}

const observationReactionContext = {
  worldOrderStressData: null,
};

function scoreRiskBand(score) {
  const value = asNumber(score);
  if (value === null) return { key: 'unknown', label: '判读待确认', tone: 'neutral' };
  if (value >= 60) return { key: 'systemic_top', label: '系统性顶部', tone: 'red' };
  if (value >= 40) return { key: 'high_risk', label: '高风险预警', tone: 'orange' };
  if (value >= 25) return { key: 'moderate_watch', label: '中度警戒', tone: 'yellow' };
  return { key: 'watch', label: '观察期', tone: 'green' };
}

function mainRiskBand(radarData, worldOrderStressData = observationReactionContext.worldOrderStressData) {
  const band = scoreRiskBand(radarData?.score);
  const worldOrderScore = asNumber(worldOrderStressData?.score);
  if (
    (band.key === 'watch' || band.key === 'moderate_watch')
    && worldOrderScore !== null
    && worldOrderScore >= 65
  ) {
    return { key: 'high_risk', label: '高风险预警', tone: 'orange' };
  }
  return band;
}

function observationReaction(radarData, signal, worldOrderStressData = observationReactionContext.worldOrderStressData) {
  const band = mainRiskBand(radarData, worldOrderStressData);
  if (signal === 'unavailable') {
    return { tone: 'pending', label: '数据不足', phrase: '主判断关系待确认' };
  }
  if (signal === 'neutral' || band.key === 'unknown') {
    return { tone: 'neutral', label: '背景', phrase: '背景观察' };
  }
  if (signal === 'stress') {
    return band.key === 'watch'
      ? { tone: 'yellow', label: '背离', phrase: `背离${band.label}` }
      : { tone: band.tone, label: '印证', phrase: `印证${band.label}` };
  }
  if (signal === 'benign') {
    return band.key === 'watch'
      ? { tone: band.tone, label: '印证', phrase: `印证${band.label}` }
      : { tone: 'green', label: '背离', phrase: `背离${band.label}` };
  }
  return { tone: 'neutral', label: '背景', phrase: '背景观察' };
}

function setObservationReaction(statusId, badgeId, radarData, signal) {
  const reaction = observationReaction(radarData, signal);
  setToneClass(statusId, 'status-bar', reaction.tone);
  setBadge(badgeId, reaction.tone, reaction.label);
  return reaction;
}

function reactionText(reaction, detail) {
  const text = typeof detail === 'string' && detail.trim() ? detail.trim() : '—';
  return `${reaction.phrase} · ${text}`;
}

function signalFromEquityChange(changePct) {
  const change = asNumber(changePct);
  if (change === null) return 'unavailable';
  if (change <= -0.01) return 'stress';
  if (change >= 0.01) return 'benign';
  return 'neutral';
}

function signalFromSourceStatus(status) {
  if (status === 'missing') return 'unavailable';
  return 'neutral';
}

function signalFromGoldPrice(gold) {
  if (gold === null || gold === undefined || gold === '') return 'unavailable';
  const value = asNumber(gold);
  if (value === null) return 'unavailable';
  if (value >= 2400) return 'stress';
  return 'neutral';
}

function signalFromFreightRegime(regime) {
  const text = typeof regime === 'string' ? regime : '';
  if (!text) return 'unavailable';
  if (text.includes('高压') || text.includes('紧张')) return 'stress';
  if (text.includes('低压') || text.includes('平稳') || text.includes('正常')) return 'benign';
  return 'neutral';
}

function signalFromTransportShockCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return 'unavailable';
  const score = asNumber(candidate.score ?? candidate.candidateScore ?? candidate.manualCandidateScore);
  const status = typeof candidate.status === 'string' ? candidate.status.toLowerCase() : '';
  if (status.includes('elevated') || status.includes('watch') || (score !== null && score >= 60)) {
    return 'stress';
  }
  if (status.includes('normal') || status.includes('benign') || score !== null) {
    return 'neutral';
  }
  return 'unavailable';
}

function signalFromChinaInflation(cpi, ppi) {
  const c = asNumber(cpi);
  const p = asNumber(ppi);
  if (c === null && p === null) return 'unavailable';
  if ((c !== null && (c < 0 || c >= 0.035)) || (p !== null && (p <= -0.03 || p >= 0.038))) {
    return 'stress';
  }
  if ((c === null || (c >= 0.005 && c <= 0.03)) && (p === null || (p >= -0.02 && p <= 0.03))) {
    return 'benign';
  }
  return 'neutral';
}

function signalFromChinaPmi(pmi) {
  const value = asNumber(pmi);
  if (value === null) return 'unavailable';
  if (value < 49.5) return 'stress';
  if (value > 50.5) return 'benign';
  return 'neutral';
}

function signalFromChinaProperty(newCitiesUp, resaleCitiesUp) {
  const n = asNumber(newCitiesUp);
  const r = asNumber(resaleCitiesUp);
  if (n === null && r === null) return 'unavailable';
  if ((n !== null && n < 20) || (r !== null && r < 15)) return 'stress';
  if ((n !== null && n > 35) && (r !== null && r > 30)) return 'benign';
  return 'neutral';
}

function signalFromChinaTsf(stockYoY) {
  const value = asNumber(stockYoY);
  if (value === null) return 'unavailable';
  if (value < 0.08) return 'stress';
  if (value > 0.10) return 'benign';
  return 'neutral';
}

function signalFromChina10y(cn10y) {
  const value = asNumber(cn10y);
  if (value === null) return 'unavailable';
  if (value < 1.70) return 'stress';
  if (value > 2.00) return 'benign';
  return 'neutral';
}

function findHeatmapEntry(radarData, key) {
  const entries = Array.isArray(radarData?.heatmap) ? radarData.heatmap : [];
  return entries.find((item) => item?.key === key) || null;
}

function updateHeatmapCell(cellKey, entryKey, radarData) {
  const entry = findHeatmapEntry(radarData, entryKey);
  if (!entry) return;
  const risk = asNumber(entry.risk);
  const tone = heatmapTone(risk);
  setToneClass(`heatmap-cell-${cellKey}`, 'heatmap-cell', tone);
  if (entry.shortLabel || entry.label) {
    setLeafText(`heatmap-${cellKey}-region`, entry.shortLabel || entry.label);
  }
  if (risk !== null) {
    setLeafText(`heatmap-${cellKey}-score`, `RISK ${Math.round(risk)}`);
  }
  if (entry.note) {
    setLeafText(`heatmap-${cellKey}-note`, entry.note);
  }
}

function formatScoreNumber(value, digits = 0) {
  const n = asNumber(value);
  if (n === null) return '—';
  return n.toFixed(digits);
}

function formatSignedScore(value, digits = 2, suffix = '') {
  const n = asNumber(value);
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`;
}

function latestMarketRecord(marketPricingMetricsData, assetKey) {
  return latestRecord(marketPricingMetricsData?.assets?.[assetKey]?.records);
}

// ---------- Stage 5a: Heatmap ----------

function renderHeatmap({ radarData }) {
  try {
    if (!radarData) return;
    updateHeatmapCell('us', HEATMAP_KEY_BY_CELL.us, radarData);
    updateHeatmapCell('europe', HEATMAP_KEY_BY_CELL.europe, radarData);
    updateHeatmapCell('middleeast', HEATMAP_KEY_BY_CELL.middleeast, radarData);
    updateHeatmapCell('china', HEATMAP_KEY_BY_CELL.china, radarData);
    updateHeatmapCell('japan', HEATMAP_KEY_BY_CELL.japan, radarData);
    updateHeatmapCell('latam', HEATMAP_KEY_BY_CELL.latam, radarData);
  } catch (error) {
    console.error('[renderMacroOverview] renderHeatmap failed:', error);
  }
}

// ---------- Stage 5a: C7 Market Sentiment ----------

function renderC7MarketSentiment({ radarData, marketPricingMetricsData }) {
  try {
    if (!radarData) return;

    const vix = currentValue(radarData, 'vix');
    const vixStatus = vixTone(vix);
    setToneClass('c7-vix-status', 'status-bar', vixStatus);
    setBadge('c7-vix-badge', vixStatus);
    if (vix !== null) setLeafText('c7-vix-number', vix.toFixed(2));
    setLeafText('c7-vix-aux', '12 周低位');

    const spx = currentValue(radarData, 'spx');
    if (spx !== null) setLeafText('c7-spx-number', spx.toFixed(0));
    const spx52wHigh = radarData.historyWindowFields?.spx52wHigh;
    const spxHighValue = asNumber(spx52wHigh?.value);
    if (spx52wHigh?.windowStatus === 'ready' && spxHighValue !== null) {
      const drawdownPct = spx !== null && spxHighValue !== 0 ? ((spx / spxHighValue) - 1) * 100 : null;
      const drawdownText = formatPct(drawdownPct, 1);
      setLeafText('c7-spx-aux', drawdownText ? `52周高位 ${spxHighValue.toFixed(0)} · 距高 ${drawdownText}` : `52周高位 ${spxHighValue.toFixed(0)}`);
    } else if (spxHighValue !== null) {
      setLeafText('c7-spx-aux', `当前可用窗口高位 ${spxHighValue.toFixed(0)} · ${formatWindowProgress(spx52wHigh)}`);
    } else if (spx52wHigh) {
      setLeafText('c7-spx-aux', `52周高位 ${formatWindowProgress(spx52wHigh)}`);
    }

    const qqqRecord = latestMarketRecord(marketPricingMetricsData, 'qqq');
    const ndxRecord = latestMarketRecord(marketPricingMetricsData, 'ndx');
    const qqqZ = asNumber(qqqRecord?.zScore);
    const ndxZ = asNumber(ndxRecord?.zScore);
    if (ndxZ !== null) {
      const zText = formatSignedScore(ndxZ, 2);
      setBadge('c7-ndx-badge', 'yellow', `${zText}σ`);
      setLeafText('c7-ndx-number', zText);
      setLeafText('c7-ndx-aux', '纳指100(NDX) vs 60 周均值 · 纳斯达克100 ETF(QQQ)对照');
      const qqqClause = qqqZ !== null ? `；纳斯达克100 ETF(QQQ) ${formatSignedScore(qqqZ, 2)}σ` : '';
      setLeafText('c7-ndx-note', `纳指100(NDX) 60 周偏离度(z-score) ${zText}σ${qqqClause}。用于观察美国成长股板块整体温度。本数据为统计描述，不构成投资建议。`);
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderC7MarketSentiment failed:', error);
  }
}

// ---------- Stage 5a: C8 Geopolitics & World Order ----------

function renderC8Geopolitical({ radarData, worldOrderStressData }) {
  try {
    const geoScore = asNumber(radarData?.modules?.geopolitical);
    const geoTone = indicatorTone(geoScore);
    setToneClass('c8-geo-status', 'status-bar', geoTone);
    setBadge('c8-geo-badge', geoTone);
    if (geoScore !== null) setLeafText('c8-geo-number', String(Math.round(geoScore)));
    const geoTrend = trendArrow(asNumber(radarData?.moduleTrends?.geopolitical));
    setLeafText('c8-geo-aux', `6 底层模块之一 · 模块趋势 ${geoTrend}`);
    if (geoScore !== null) {
      setLeafText('c8-geo-note', `底层地缘评分 ${Math.round(geoScore)},直接计入主评分。与世界秩序压力(只做修正、不计分)不是一回事。`);
    }

    const woScore = asNumber(worldOrderStressData?.score);
    if (woScore !== null) setLeafText('c8-wo-number', String(Math.round(woScore)));
    if (worldOrderStressData?.state || worldOrderStressData?.labelZh) {
      setLeafText('c8-wo-aux', `状态:${worldOrderStressData.labelZh || '—'}`);
    }

    const econ = worldOrderStressData?.dimensions?.economicWeaponization || {};
    const econScore = asNumber(econ.score);
    const econTone = indicatorTone(econScore);
    setToneClass('c8-econ-status', 'status-bar', econTone);
    setBadge('c8-econ-badge', econTone);
    if (econScore !== null) setLeafText('c8-econ-number', String(Math.round(econScore)));
    if (econ.trend) setLeafText('c8-econ-aux', `趋势(trend): ${econ.trend} · 美国制裁清单(OFAC)+全球新闻事件(GDELT)`);
    if (econ.trend) setLeafText('c8-econ-note', `制裁与经济武器化处于高位区间。趋势(trend): ${econ.trend}。`);

    const arms = worldOrderStressData?.dimensions?.peaceDividendRetreat || {};
    const armsScore = asNumber(arms.score);
    const armsTone = indicatorTone(armsScore);
    setToneClass('c8-arms-status', 'status-bar', armsTone);
    setBadge('c8-arms-badge', armsTone);
    if (armsScore !== null) setLeafText('c8-arms-number', String(Math.round(armsScore)));
    if (arms.trend) setLeafText('c8-arms-aux', `trend: ${arms.trend} · ACLED weekly + SIPRI annual`);
    if (arms.trend) setLeafText('c8-arms-note', `手动 + 年度数据。不当成实时高频信号读。trend: ${arms.trend}。`);
  } catch (error) {
    console.error('[renderMacroOverview] renderC8Geopolitical failed:', error);
  }
}

// ---------- Stage 5b formatting helpers ----------

function formatT(value) {
  const n = asNumber(value);
  if (n === null) return null;
  return (n / 1000000).toFixed(2);
}

function formatPct(value, digits = 1) {
  const n = asNumber(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(digits)}%`;
}

function formatBps(value, digits = 0) {
  const n = asNumber(value);
  if (n === null) return null;
  const bps = n * 100;
  return `${bps >= 0 ? '+' : ''}${bps.toFixed(digits)}bp`;
}

function formatM(value) {
  const n = asNumber(value);
  if (n === null) return null;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${(abs * 1000).toFixed(0)}M`;
}

function formatUsd(value, digits = 2) {
  const n = asNumber(value);
  if (n === null) return null;
  return `$${n.toFixed(digits)}`;
}

function signedNumber(value, digits = 2) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function brentTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 100) return 'red';
  if (n >= 80) return 'yellow';
  return 'green';
}

function cpiYoYTone(headlineYoY, coreYoY) {
  const vals = [headlineYoY, coreYoY].filter(Number.isFinite);
  if (!vals.length) return 'pending';
  const max = Math.max(...vals);
  if (max >= 0.04) return 'red';
  if (max >= 0.03) return 'yellow';
  return 'green';
}

function crackTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 40) return 'red';
  if (n >= 25) return 'yellow';
  return 'green';
}

function ismToneFromRegime(regime) {
  if (regime === '扩张') return 'green';
  if (regime === '中性偏扩张') return 'yellow';
  if (regime === '收缩') return 'red';
  if (regime === '深度收缩') return 'red';
  return null;
}

function us10yTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 5) return 'red';
  if (n >= 4) return 'yellow';
  return 'green';
}

function liquidityToneFromRegime(regime) {
  if (regime === '平稳') return 'green';
  if (regime === '偏紧') return 'yellow';
  if (regime === '紧张') return 'red';
  return null;
}

function fedPathTone(diffRate) {
  const n = asNumber(diffRate);
  if (n === null) return null;
  const absBp = Math.abs(n * 100);
  if (absBp >= 50) return 'red';
  if (absBp > 20) return 'yellow';
  return 'green';
}

function dxyTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 115) return 'red';
  if (n >= 105) return 'yellow';
  return 'green';
}

function setIndicatorStatus(statusId, badgeId, tone) {
  if (!tone) return;
  setToneClass(statusId, 'status-bar', tone);
  setBadge(badgeId, tone);
}

// ---------- Stage 5b: C1 Inflation & Energy ----------

function renderC1InflationEnergy({ radarData }) {
  try {
    if (!radarData) return;
    const brentLayer = radarData.brentPricingLayer || {};
    const consumer = radarData.macroDrivers?.consumer || {};

    const brent = currentValue(radarData, 'brent') ?? asNumber(brentLayer.selectedBrent?.value);
    const brentStatus = brentTone(brent);
    setIndicatorStatus('c1-brent-status', 'c1-brent-badge', brentStatus);
    if (brent !== null) setLeafText('c1-brent-number', brent.toFixed(2));
    if (brentLayer.mode) {
      setLeafText('c1-brent-aux', `主值取公开现货代理 · 状态:${brentModeZh(brentLayer.mode)}`);
    }
    const eia = asNumber(brentLayer.eiaBrentSpotProxy?.price);
    const futures = asNumber(brentLayer.futuresProxy?.value);
    const ice = asNumber(brentLayer.iceFuturesPriceCurve?.frontPrice);
    const spread = asNumber(brentLayer.proxySpread?.spotMinusFutures);
    const divergence = asNumber(brentLayer.proxySpread?.maxProxyDivergencePct);
    if (eia !== null) setLeafText('c1-brent-eia', formatUsd(eia));
    if (futures !== null) setLeafText('c1-brent-futures', formatUsd(futures));
    if (ice !== null) setLeafText('c1-brent-ice', formatUsd(ice));
    if (spread !== null) {
      const sign = spread >= 0 ? '+$' : '-$';
      setLeafText('c1-brent-spread', `${sign}${Math.abs(spread).toFixed(2)}`);
    }
    if (divergence !== null) setLeafText('c1-brent-divergence', `${divergence.toFixed(1)}%`);

    const crack = asNumber(brentLayer.crackSpread);
    const crackStatus = crackTone(crack);
    setIndicatorStatus('c1-crack-status', 'c1-crack-badge', crackStatus);
    if (crack !== null) setLeafText('c1-crack-number', crack.toFixed(2));
    const crackChange = asNumber(brentLayer.crackSpread4wChange);
    if (crackChange !== null) {
      setLeafText('c1-crack-aux', `超低硫柴油(ULSD) × 42 − 布伦特原油(Brent) · 4 周变化 ${signedNumber(crackChange, 2)}`);
    }
    if (brentLayer.crackSpreadRegime) {
      setLeafText('c1-crack-note', `炼油利润扩张说明能源向汽油 / 柴油传导。布伦特原油(Brent) → 消费者物价(CPI)的中间证据。状态: ${brentLayer.crackSpreadRegime}。`);
    }

    const ismRegime = consumer.ismPmiRegime;
    const ismTone = ismToneFromRegime(ismRegime);
    setIndicatorStatus('c1-ism-status', 'c1-ism-badge', ismTone);
    const ism = asNumber(consumer.ismManufacturingPmi);
    if (ism !== null) setLeafText('c1-ism-number', ism.toFixed(1));
    const ismChange = asNumber(consumer.ismManufacturingPmi3mChange);
    if (ismChange !== null && ismRegime) {
      setLeafText('c1-ism-aux', `3 月动量 ${signedNumber(ismChange, 1)} · regime: ${ismRegime}`);
    }
    if (ismRegime) {
      setLeafText('c1-ism-note', `制造业读数仍在扩张线附近，regime: ${ismRegime}。能源成本能否被需求消化仍是通胀链条的关键。`);
    }

    const inflationEnergy = radarData.macroDrivers?.inflationEnergy;
    if (inflationEnergy) {
      const cpiYoY = asNumber(inflationEnergy.cpi?.headlineYoY);
      const coreYoY = asNumber(inflationEnergy.cpi?.coreYoY);
      const cpiTone = cpiYoYTone(cpiYoY, coreYoY);
      setIndicatorStatus('c1-cpi-status', 'c1-cpi-badge', cpiTone);
      if (cpiYoY !== null) {
        setLeafText('c1-cpi-number', (cpiYoY * 100).toFixed(1));
      } else {
        setLeafText('c1-cpi-number', '—');
      }
      const cpiMoM = asNumber(inflationEnergy.cpi?.headlineMoM);
      const coreText = coreYoY !== null ? `Core ${signedFixed(coreYoY * 100, 1)}% YoY` : 'Core —';
      const momText = cpiMoM !== null ? `MoM ${signedFixed(cpiMoM * 100, 1)}%` : 'MoM —';
      setLeafText('c1-cpi-aux', `${coreText} · ${momText}`);

      const wtiPrice = asNumber(inflationEnergy.wti?.price);
      const wtiTone = wtiPrice === null ? 'pending' : brentTone(wtiPrice);
      setIndicatorStatus('c1-wti-status', 'c1-wti-badge', wtiTone);
      if (wtiPrice !== null) {
        setLeafText('c1-wti-number', wtiPrice.toFixed(0));
      } else {
        setLeafText('c1-wti-number', '—');
      }
      const wtiChange = asNumber(inflationEnergy.wti?.changePct);
      if (wtiChange !== null) {
        setLeafText('c1-wti-aux', `近5日 ${signedFixed(wtiChange * 100, 2)}%`);
      } else {
        setLeafText('c1-wti-aux', '近5日 —');
      }
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderC1InflationEnergy failed:', error);
  }
}

// ---------- Stage 5b: C2 Global Liquidity ----------


function renderCfetsRmbLeaf(prefix, cfetsRmb, radarData) {
  if (!cfetsRmb) return;
  const status = cfetsRmb.sourceStatus?.cfets || 'missing';
  const cfets = asNumber(cfetsRmb.cfets);
  const signal = status === 'missing'
    ? 'unavailable'
    : cfets === null
      ? 'unavailable'
      : cfets < 98
        ? 'stress'
        : cfets > 102
          ? 'benign'
          : 'neutral';
  const reaction = setObservationReaction(`${prefix}-status`, `${prefix}-badge`, radarData, signal);

  const bis = asNumber(cfetsRmb.bis);
  const sdr = asNumber(cfetsRmb.sdr);
  setLeafText(`${prefix}-number`, cfets !== null ? cfets.toFixed(2) : '—');
  const cfetsText = cfets !== null ? `CFETS ${cfets.toFixed(2)}` : 'CFETS —';
  const bisText = bis !== null ? `BIS ${bis.toFixed(2)}` : 'BIS —';
  const sdrText = sdr !== null ? `SDR ${sdr.toFixed(2)}` : 'SDR —';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText(`${prefix}-aux`, reactionText(reaction, `${cfetsText} · ${bisText} · ${sdrText}${suffix}`));
}

function renderChinaBondLeaf({ radarData }) {
  const chinaBond = radarData?.macroDrivers?.chinaBond;
  if (!chinaBond) return;
  const status = chinaBond.sourceStatus?.yield10y || chinaBond.yield10y?.sourceStatus || 'missing';

  const cn10y = asNumber(chinaBond.yield10y?.value);
  const reaction = setObservationReaction(
    'c6-china-10y-status',
    'c6-china-10y-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromChina10y(cn10y)
  );
  const us10y = currentValue(radarData, 'us10y');
  setLeafText('c6-china-10y-number', cn10y !== null ? cn10y.toFixed(2) : '—');
  const cnText = cn10y !== null ? `中国 10Y ${cn10y.toFixed(2)}%` : '中国 10Y —';
  const usText = us10y !== null ? `美 10Y ${us10y.toFixed(2)}%` : '美 10Y —';
  const spreadText = cn10y !== null && us10y !== null ? `差 ${formatBps(cn10y - us10y, 0)}` : '差 —';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-10y-aux', reactionText(reaction, `${cnText} · ${usText} · ${spreadText}${suffix}`));
}
function renderChinaInflationLeaf({ radarData }) {
  const chinaInflation = radarData?.macroDrivers?.chinaInflation;
  if (!chinaInflation) return;
  const cpiStatus = chinaInflation.sourceStatus?.cpi || chinaInflation.cpi?.sourceStatus || 'missing';
  const ppiStatus = chinaInflation.sourceStatus?.ppi || chinaInflation.ppi?.sourceStatus || 'missing';
  const status = cpiStatus === 'live' || ppiStatus === 'live' ? 'live' : (cpiStatus === 'fallback' || ppiStatus === 'fallback' ? 'fallback' : 'missing');

  const cpi = asNumber(chinaInflation.cpi?.yoy);
  const ppi = asNumber(chinaInflation.ppi?.yoy);
  const reaction = setObservationReaction(
    'c6-china-infl-status',
    'c6-china-infl-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromChinaInflation(cpi, ppi)
  );
  setLeafText('c6-china-infl-number', cpi !== null ? (cpi * 100).toFixed(1) : '—');
  const cpiText = cpi !== null ? `消费者物价(CPI) ${signedFixed(cpi * 100, 1)}% YoY` : '消费者物价(CPI) —';
  const ppiText = ppi !== null ? `工业品出厂价格(PPI) ${signedFixed(ppi * 100, 1)}% YoY` : '工业品出厂价格(PPI) —';
  const refMonth = chinaInflation.cpi?.refMonth || chinaInflation.ppi?.refMonth || '—';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-infl-aux', reactionText(reaction, `${cpiText} · ${ppiText} · ${refMonth}${suffix}`));
}

function renderChinaPmiLeaf({ radarData }) {
  const chinaPmi = radarData?.macroDrivers?.chinaPmi;
  if (!chinaPmi) return;
  const status = chinaPmi.sourceStatus?.pmi || chinaPmi.pmi?.sourceStatus || 'missing';

  const pmi = asNumber(chinaPmi.pmi?.value);
  const reaction = setObservationReaction(
    'c6-china-pmi-status',
    'c6-china-pmi-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromChinaPmi(pmi)
  );
  setLeafText('c6-china-pmi-number', pmi !== null ? pmi.toFixed(1) : '—');
  const refMonth = chinaPmi.pmi?.refMonth || '—';
  const expansion = pmi === null ? '—' : (pmi >= 50 ? '扩张' : '收缩');
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-pmi-aux', reactionText(reaction, `${refMonth} · ${expansion}${suffix}`));
}

function formatChinaPropertyTierCounts(group) {
  if (!group) return '—';
  return `${group.up?.length || 0} 涨/${group.flat?.length || 0} 平/${group.down?.length || 0} 跌`;
}

function formatChinaPropertyUpCities(group) {
  const cities = Array.isArray(group?.up) ? group.up : [];
  return cities.length > 0 ? cities.join('、') : '无';
}

function createChinaPropertyDetailText(className, text) {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

function createChinaPropertyTierBlock(id, tier) {
  const block = document.createElement('div');
  block.id = id;
  block.className = 'city-tier-block';
  if (!tier) {
    block.replaceChildren(createChinaPropertyDetailText('city-tier-line', '城市明细暂不可用。'));
    return block;
  }
  const label = `${tier.label || '分线'}(${tier.cityCount || '—'}城)`;
  const title = createChinaPropertyDetailText('city-tier-title', label);
  const newLine = createChinaPropertyDetailText(
    'city-tier-line',
    `新房:${formatChinaPropertyTierCounts(tier.new)} — 上涨:${formatChinaPropertyUpCities(tier.new)}`
  );
  const resaleLine = createChinaPropertyDetailText(
    'city-tier-line',
    `二手:${formatChinaPropertyTierCounts(tier.resale)} — 上涨:${formatChinaPropertyUpCities(tier.resale)}`
  );
  block.replaceChildren(title, newLine, resaleLine);
  return block;
}

function renderChinaPropertyTierBreakdown(property) {
  const root = document.getElementById('c6-house-tier-breakdown');
  if (!root) return;
  const tierBreakdown = property?.tierBreakdown;
  if (!tierBreakdown || typeof tierBreakdown !== 'object') {
    const empty = document.createElement('p');
    empty.className = 'city-tier-empty';
    empty.textContent = '城市明细暂不可用。';
    root.replaceChildren(empty);
    return;
  }
  root.replaceChildren(
    createChinaPropertyTierBlock('c6-house-tier1', tierBreakdown.tier1),
    createChinaPropertyTierBlock('c6-house-tier2', tierBreakdown.tier2),
    createChinaPropertyTierBlock('c6-house-tier3', tierBreakdown.tier3)
  );
}

function formatChinaTsfIncrementYi(value) {
  const numeric = asNumber(value);
  if (numeric === null) return '—';
  const sign = numeric < 0 ? '-' : '';
  const absValue = Math.abs(numeric);
  if (absValue >= 10000) return `${sign}${(absValue / 10000).toFixed(2)}万亿`;
  return `${sign}${Math.round(absValue)}亿`;
}

function createChinaTsfDetailText(className, text) {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

function createChinaTsfComponentLine(component) {
  const label = component?.label || '分项';
  return createChinaTsfDetailText('city-tier-line', `${label}:${formatChinaTsfIncrementYi(component?.incrementYi)}`);
}

function renderChinaTsfComponents(tsf) {
  const root = document.getElementById('c6-tsf-components-list');
  if (!root) return;
  const components = Array.isArray(tsf?.components) ? tsf.components : [];
  if (!components.length) {
    root.replaceChildren(createChinaTsfDetailText('city-tier-line', '社融分项暂不可用。'));
    return;
  }
  root.replaceChildren(
    createChinaTsfDetailText('city-tier-title', `年内累计分项(${components.length}/8)`),
    ...components.map(createChinaTsfComponentLine)
  );
}

function renderChinaTsfLeaf({ radarData }) {
  const tsf = radarData?.macroDrivers?.chinaTsf;
  if (!tsf) {
    renderChinaTsfComponents(null);
    return;
  }
  const status = tsf.sourceStatus || 'missing';

  const stockYoY = asNumber(tsf.stockYoY);
  const ytdIncrementYi = asNumber(tsf.ytdIncrementYi);
  const reaction = setObservationReaction(
    'c6-tsf-status',
    'c6-tsf-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromChinaTsf(stockYoY)
  );
  const label = tsf.incrementPeriodLabel || '年内';
  const refMonth = tsf.refMonth || '—';
  const suffix = status === 'fallback' ? ' · 回退' : status === 'missing' ? ' · 待源恢复' : '';
  setLeafText('c6-tsf-number', stockYoY !== null ? (stockYoY * 100).toFixed(1) : '—');
  setLeafText('c6-tsf-unit', stockYoY !== null ? '% YoY' : '');
  setLeafText('c6-tsf-aux', reactionText(reaction, `${label}增量 ${formatChinaTsfIncrementYi(ytdIncrementYi)} · ${refMonth}${suffix}`));
  renderChinaTsfComponents(tsf);
}
function formatChinaMlfTerm(termMonths) {
  const numeric = asNumber(termMonths);
  if (numeric === null) return '期限 —';
  if (Number.isInteger(numeric) && numeric % 12 === 0) return `${numeric / 12}年期`;
  return `${Math.round(numeric)}个月`;
}

function formatChinaMlfAmount(value) {
  const numeric = asNumber(value);
  if (numeric === null) return '—';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function renderChinaMlfLeaf({ radarData }) {
  const mlf = radarData?.macroDrivers?.chinaMlf;
  if (!mlf) return;
  const status = mlf.sourceStatus || 'missing';
  const reaction = setObservationReaction(
    'c6-mlf-status',
    'c6-mlf-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromSourceStatus(status)
  );

  const operationAmountYi = asNumber(mlf.operationAmountYi);
  const termText = formatChinaMlfTerm(mlf.termMonths);
  const opDate = mlf.opDate || '—';
  const rate = asNumber(mlf.mlfRate);
  const rateText = rate !== null ? `中标利率 ${(rate * 100).toFixed(2)}%` : '利率未披露';
  const suffix = status === 'fallback' ? ' · 回退' : status === 'missing' ? ' · 待源恢复' : '';
  setLeafText('c6-mlf-number', formatChinaMlfAmount(operationAmountYi));
  setLeafText('c6-mlf-unit', operationAmountYi !== null ? '亿元' : '');
  setLeafText('c6-mlf-aux', reactionText(reaction, `${termText} · ${opDate} · ${rateText}${suffix}`));
}
function renderChinaOmoLeaf({ radarData }) {
  const omo = radarData?.macroDrivers?.chinaOmo;
  if (!omo) return;
  const status = omo.sourceStatus || 'missing';
  const reaction = setObservationReaction(
    'c6-omo-status',
    'c6-omo-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromSourceStatus(status)
  );

  const opDate = omo.opDate || '—';
  if (omo.operationType === '无操作') {
    setLeafText('c6-omo-number', '—');
    setLeafText('c6-omo-unit', '今日无操作');
    const suffix = status === 'fallback' ? ' · 回退' : '';
    setLeafText('c6-omo-aux', reactionText(reaction, `今日无操作 · ${opDate}${suffix}`));
    return;
  }

  const operationRate = asNumber(omo.operationRate);
  const termDays = asNumber(omo.termDays);
  const operationAmount = asNumber(omo.operationAmount);
  const operationType = omo.operationType || '公开市场操作';
  const announcementNo = Number.isInteger(omo.announcementNo) ? `第${omo.announcementNo}号` : '公告号 —';
  const termText = termDays !== null ? `${Math.round(termDays)}天${operationType}` : operationType;
  const amountText = operationAmount !== null ? `中标 ${Math.round(operationAmount)}亿` : '中标 —';
  const suffix = status === 'fallback' ? ' · 回退' : status === 'missing' ? ' · 待源恢复' : '';
  setLeafText('c6-omo-number', operationRate !== null ? (operationRate * 100).toFixed(2) : '—');
  setLeafText('c6-omo-unit', operationRate !== null ? '%' : '');
  setLeafText('c6-omo-aux', reactionText(reaction, `${termText} · ${amountText} · ${opDate} · ${announcementNo}${suffix}`));
}
function renderChinaPropertyLeaf({ radarData }) {
  const property = radarData?.macroDrivers?.chinaPropertyPrice;
  if (!property) {
    renderChinaPropertyTierBreakdown(null);
    return;
  }
  const status = property.sourceStatus || 'missing';

  const newUp = asNumber(property.newCitiesUp);
  const newFlat = asNumber(property.newCitiesFlat);
  const resaleUp = asNumber(property.resaleCitiesUp);
  const reaction = setObservationReaction(
    'c6-house-status',
    'c6-house-badge',
    radarData,
    status === 'missing' ? 'unavailable' : signalFromChinaProperty(newUp, resaleUp)
  );
  setLeafText('c6-house-number', newUp !== null ? `${Math.round(newUp)}/70` : '—');
  setLeafText('c6-house-unit', '新房上涨');

  const auxParts = [];
  auxParts.push(`二手上涨 ${resaleUp !== null ? `${Math.round(resaleUp)}/70` : '—'}`);
  auxParts.push(`新房持平 ${newFlat !== null ? `${Math.round(newFlat)} 城` : '—'}`);
  auxParts.push(property.refMonth || '—');
  if (status === 'fallback') auxParts.push('回退');
  if (status === 'missing') auxParts.push('待源恢复');
  setLeafText('c6-house-aux', reactionText(reaction, auxParts.join(' · ')));
  renderChinaPropertyTierBreakdown(property);
}
function renderC2GlobalLiquidity({ radarData }) {
  try {
    if (!radarData) return;
    const curve = radarData.macroDrivers?.curve || {};
    const fed = radarData.macroDrivers?.fedLiquidity || {};
    const policy = radarData.macroDrivers?.policyExpectations || {};

    const dxy = currentValue(radarData, 'dxy');
    if (dxy !== null) setLeafText('c2-dxy-number', dxy.toFixed(2));
    setIndicatorStatus('c2-dxy-status', 'c2-dxy-badge', dxyTone(dxy));
    const dxy12wHigh = radarData.historyWindowFields?.dxy12wHigh;
    const dxyHighValue = asNumber(dxy12wHigh?.value);
    if (dxy12wHigh?.windowStatus === 'ready' && dxyHighValue !== null) {
      setLeafText('c2-dxy-aux', `12周高位 ${dxyHighValue.toFixed(2)}`);
    } else if (dxyHighValue !== null) {
      setLeafText('c2-dxy-aux', `当前可用窗口高位 ${dxyHighValue.toFixed(2)} · ${formatWindowProgress(dxy12wHigh)}`);
    } else if (dxy12wHigh) {
      setLeafText('c2-dxy-aux', `12周高位 ${formatWindowProgress(dxy12wHigh)}`);
    }

    const gold = currentValue(radarData, 'gold');
    if (gold !== null) setLeafText('c2-gold-number', gold.toFixed(2));
    const goldReaction = setObservationReaction('c2-gold-status', 'c2-gold-badge', radarData, signalFromGoldPrice(gold));
    const goldDriver = radarData.macroDrivers?.copperGold?.gold || {};
    const goldChange = asNumber(goldDriver.changePct);
    const goldChangeText = goldChange !== null ? `${signedPercentFromDecimal(goldChange, 2)} ${goldDriver.changeWindow || '1d'}` : '变化 —';
    setLeafText('c2-gold-aux', reactionText(goldReaction, `黄金 ${moneyFixed(gold)} · ${goldChangeText}`));

    const us10y = currentValue(radarData, 'us10y');
    const us10yStatus = us10yTone(us10y);
    setIndicatorStatus('c2-us10y-status', 'c2-us10y-badge', us10yStatus);
    if (us10y !== null) setLeafText('c2-us10y-number', us10y.toFixed(2));
    const t10y2y = asNumber(curve.t10y2y);
    const t10y2yWeekChange = asNumber(curve.t10y2yWeekChange);
    if (t10y2y !== null && curve.regime) {
      setLeafText('c2-us10y-aux', `10年期 · 10年-2年利差(2s10s) ${formatBps(t10y2y, 0)} · ${curve.regime}`);
    }
    if (t10y2y !== null) setLeafText('c2-us10y-t10y2y', `${signedNumber(t10y2y, 2)}%`);
    if (t10y2yWeekChange !== null) setLeafText('c2-us10y-week-change', formatBps(t10y2yWeekChange, 0));
    if (curve.regime) setLeafText('c2-us10y-regime', curve.regime);
    if (typeof curve.steepeningAlert === 'boolean') {
      setLeafText('c2-us10y-alert', String(curve.steepeningAlert));
    }

    const liquidityTone = liquidityToneFromRegime(fed.regime);
    setIndicatorStatus('c2-liquidity-status', 'c2-liquidity-badge', liquidityTone);
    const reserves = asNumber(fed.reserveBalances);
    if (reserves !== null) setLeafText('c2-liquidity-number', formatT(reserves));
    if (fed.regime) setLeafText('c2-liquidity-aux', `银行准备金 · 状态: ${fed.regime}`);
    const walcl = asNumber(fed.walcl);
    if (walcl !== null && asNumber(fed.walcl4wChange) !== null) {
      setLeafText('c2-liquidity-walcl', `${formatT(walcl)}T · 4w ${formatPct(fed.walcl4wChange, 1)}`);
    }
    if (reserves !== null && asNumber(fed.reserveBalances4wChange) !== null) {
      setLeafText('c2-liquidity-reserves', `${formatT(reserves)}T · 4w ${formatPct(fed.reserveBalances4wChange, 1)}`);
    }
    if (asNumber(fed.onRrp) !== null && asNumber(fed.onRrpWeekChange) !== null) {
      setLeafText('c2-liquidity-rrp', `${formatM(fed.onRrp)} · WoW ${formatPct(fed.onRrpWeekChange, 1)}`);
    }
    if (asNumber(fed.sofr) !== null && asNumber(fed.effectiveFedFundsRate) !== null) {
      setLeafText('c2-liquidity-sofr-effr', `${fed.sofr.toFixed(2)}% / ${fed.effectiveFedFundsRate.toFixed(2)}%`);
    }
    if (asNumber(fed.bgcr) !== null && asNumber(fed.tgcr) !== null) {
      setLeafText('c2-liquidity-bgcr-tgcr', `${fed.bgcr.toFixed(2)}% / ${fed.tgcr.toFixed(2)}%`);
    }
    if (fed.repoSpreadRegime) setLeafText('c2-liquidity-repo-regime', fed.repoSpreadRegime);

    const diff = asNumber(policy.futureMinusTargetMid);
    const fedTone = fedPathTone(diff);
    setIndicatorStatus('c2-fed-path-status', 'c2-fed-path-badge', fedTone);
    if (diff !== null) {
      const diffBp = diff * 100;
      const signedBp = `${diffBp >= 0 ? '+' : ''}${diffBp.toFixed(1)}`;
      setLeafText('c2-fed-path-number', signedBp);
      setLeafText('c2-fed-path-aux', `market vs 委员分歧 · ${signedBp}bp`);
    }
    if (asNumber(policy.targetMid) !== null) setLeafText('c2-fed-path-target', `${policy.targetMid.toFixed(2)}%`);
    if (asNumber(policy.fedFundsFutureFrontPrice) !== null && asNumber(policy.fedFundsFutureImpliedRate) !== null) {
      setLeafText('c2-fed-path-front', `${policy.fedFundsFutureFrontPrice.toFixed(2)} → ${policy.fedFundsFutureImpliedRate.toFixed(2)}%`);
    }
    if (asNumber(policy.fedFundsFuturesCurve?.frontMinusBack) !== null) {
      setLeafText('c2-fed-path-zq', `front ${formatBps(policy.fedFundsFuturesCurve.frontMinusBack, 0)}`);
    }
    if (asNumber(policy.sofrFuturesCurve?.frontMinusBack) !== null) {
      setLeafText('c2-fed-path-sr3', `front ${formatBps(policy.sofrFuturesCurve.frontMinusBack, 0)}`);
    }
    if (asNumber(policy.oisForwardCurve?.oneYearRate) !== null) {
      setLeafText('c2-fed-path-ois', `${policy.oisForwardCurve.oneYearRate.toFixed(2)}%`);
    }
    if (asNumber(policy.dotPlotMedianCurrentYear) !== null) {
      setLeafText('c2-fed-path-dot', `${policy.dotPlotMedianCurrentYear.toFixed(2)}%`);
    }
    if (policy.policyTone && policy.minutesPolicyTone) {
      setLeafText('c2-fed-path-tone', `${policy.policyTone} / ${policy.minutesPolicyTone}`);
    }

    const cg = radarData.macroDrivers?.copperGold;
    if (cg) {
      const status = cg.sourceStatus?.ratio || 'missing';

      const ratio = asNumber(cg.ratio);
      const rc = asNumber(cg.ratioChangePct);
      const signal = status === 'missing'
        ? 'unavailable'
        : rc === null
          ? 'neutral'
          : rc <= -0.01
            ? 'stress'
            : rc >= 0.01
              ? 'benign'
              : 'neutral';
      const reaction = setObservationReaction('c2-cuau-status', 'c2-cuau-badge', radarData, signal);
      setLeafText('c2-cuau-number', ratio !== null ? (ratio * 1000).toFixed(3) : '—');

      const cu = asNumber(cg.copper?.price);
      const au = asNumber(cg.gold?.price);
      const cuText = cu !== null ? `铜 $${cu.toFixed(2)}/lb` : '铜 —';
      const auText = au !== null ? `金 $${au.toFixed(0)}/oz` : '金 —';
      const rcText = rc !== null ? `较前日 ${signedFixed(rc * 100, 2)}%` : '较前日 —';
      const suffix = status === 'fallback' ? ' · 回退' : '';
      setLeafText('c2-cuau-aux', reactionText(reaction, `${cuText} · ${auText} · ${rcText}${suffix}`));
    }

    renderCfetsRmbLeaf('c2-cfets', radarData.macroDrivers?.cfetsRmb, radarData);
  } catch (error) {
    console.error('[renderMacroOverview] renderC2GlobalLiquidity failed:', error);
  }
}

// ---------- Stage 5c formatting helpers ----------

function formatK(value) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${Math.round(n / 1000)}`;
}

function formatCountM(value, digits = 2) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${(n / 1000000).toFixed(digits)}M`;
}

function formatPctPlain(value, digits = 1) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${n.toFixed(digits)}%`;
}

function creditHyTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 5) return 'red';
  if (n >= 3.7) return 'yellow';
  return 'green';
}

function creditIgTone(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 1.5) return 'red';
  if (n >= 1.2) return 'yellow';
  return 'green';
}

function nfciToneFromRegime(regime) {
  if (regime === '显著宽松' || regime === '宽松') return 'green';
  if (regime === '中性' || regime === '边际收紧') return 'yellow';
  if (regime === '收紧' || regime === '紧张') return 'red';
  return null;
}

function privateCreditToneFromRegime(regime) {
  if (regime === '平稳') return 'green';
  if (regime === '观察' || regime === 'caution' || regime === '偏弱') return 'yellow';
  if (regime === '紧张' || regime === 'stress') return 'red';
  return null;
}

function creToneFromRegime(regime) {
  if (regime === '稳定') return 'green';
  if (regime === '观察') return 'yellow';
  if (regime === '压力' || regime === '恶化') return 'red';
  return null;
}

function employmentToneFromRegime(regime) {
  if (regime === '强扩张' || regime === '扩散改善') return 'green';
  if (regime === '温和扩张' || regime === '稳定') return 'yellow';
  if (regime === '收缩' || regime === '走弱') return 'red';
  return null;
}

function consumerToneFromRegime(regime) {
  if (regime === '稳定' || regime === '改善') return 'green';
  if (regime === '走弱') return 'yellow';
  if (regime === '急剧走弱' || regime === '衰退') return 'red';
  return null;
}

function signedK(value) {
  const n = asNumber(value);
  if (n === null) return null;
  const k = Math.round(n / 1000);
  return `${k >= 0 ? '+' : ''}${k}k`;
}

function signedPercentFromDecimal(value, digits = 1) {
  const n = asNumber(value);
  if (n === null) return null;
  return formatPct(n * 100, digits);
}

function formatWindowProgress(field) {
  const observations = asNumber(field?.observations);
  const target = asNumber(field?.targetObservations);
  if (observations === null || target === null) return '累积中';
  return `累积中 ${observations}/${target}天`;
}

function formatSignedBpValue(value, digits = 0) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}bp`;
}

// ---------- Stage 5c: C3 Credit & Corporate ----------

function renderC3CreditCorporate({ radarData }) {
  try {
    if (!radarData) return;
    const credit = radarData.macroDrivers?.credit || {};
    const privateCredit = radarData.macroDrivers?.privateCreditProxy || {};
    const cre = radarData.macroDrivers?.commercialRealEstate || {};

    const hyOas = currentValue(radarData, 'hyOas') ?? asNumber(credit.hyOas);
    const hyTone = creditHyTone(hyOas);
    setIndicatorStatus('c3-hy-status', 'c3-hy-badge', hyTone);
    const hyOasWoW = radarData.historyWindowFields?.hyOasWoW;
    if (hyOas !== null) {
      setLeafText('c3-hy-number', hyOas.toFixed(2));
      const changeBp = asNumber(hyOasWoW?.changeBp);
      const changePct = signedPercentFromDecimal(hyOasWoW?.changePct, 1);
      if (hyOasWoW?.windowStatus === 'ready' && changeBp !== null && changePct) {
        setLeafText('c3-hy-aux', `高收益债利差(HY OAS) ${hyOas.toFixed(2)}% · 周变化(WoW) ${formatSignedBpValue(changeBp, 0)} / ${changePct}`);
      } else if (hyOasWoW) {
        setLeafText('c3-hy-aux', `高收益债利差(HY OAS) ${hyOas.toFixed(2)}% · 周变化(WoW) ${formatWindowProgress(hyOasWoW)}`);
      } else {
        setLeafText('c3-hy-aux', `高收益债利差(HY OAS) ${hyOas.toFixed(2)}% · 周变化(WoW)字段未接入`);
      }
    }

    const igOas = asNumber(credit.igOas);
    const igTone = creditIgTone(igOas);
    setIndicatorStatus('c3-ig-status', 'c3-ig-badge', igTone);
    if (igOas !== null) setLeafText('c3-ig-number', igOas.toFixed(2));
    const igChange = asNumber(credit.igOas1dChange);
    const igHyRatio = asNumber(credit.igHyRatio);
    if (igChange !== null && igHyRatio !== null) {
      setLeafText('c3-ig-aux', `1 日变化 ${formatBps(igChange, 0)} · 投资级/高收益比 ${igHyRatio.toFixed(2)}`);
    }

    const nfciTone = nfciToneFromRegime(credit.nfciRegime);
    setIndicatorStatus('c3-nfci-status', 'c3-nfci-badge', nfciTone);
    const nfci = asNumber(credit.nfci);
    if (nfci !== null) setLeafText('c3-nfci-number', nfci.toFixed(3));
    const nfciChange = asNumber(credit.nfci4wChange);
    if (nfciChange !== null && credit.nfciRegime) {
      setLeafText('c3-nfci-aux', `4 周变化 ${signedNumber(nfciChange, 3)} · 状态: ${credit.nfciRegime}`);
    }
    if (nfci !== null && credit.nfciRegime) {
      setLeafText('c3-nfci-note', `金融条件指数(NFCI)汇总 100+ 跨市场信号(信用 / 流动性 / 杠杆)。方向反转：正值=收紧。当前 ${nfci.toFixed(3)},${credit.nfciRegime}。`);
    }

    const privateTone = privateCreditToneFromRegime(privateCredit.privateCreditProxyRegime);
    setIndicatorStatus('c3-private-status', 'c3-private-badge', privateTone);
    const intervalNav = asNumber(privateCredit.intervalFundNavPrice);
    if (intervalNav !== null) setLeafText('c3-private-number', intervalNav.toFixed(2));
    const privateStressZ = radarData.historyWindowFields?.privateCreditStressZScore;
    const privateStressHeadline = asNumber(privateStressZ?.headline);
    if (privateStressZ?.windowStatus === 'ready' && privateStressHeadline !== null) {
      setLeafText('c3-private-aux', `6 代理压力偏离度(z) ${formatSignedScore(privateStressHeadline, 2, 'σ')}`);
    } else if (privateStressZ) {
      setLeafText('c3-private-aux', `6 代理偏离度(z-score) ${formatWindowProgress(privateStressZ)}`);
    } else {
      const intervalChange = signedPercentFromDecimal(privateCredit.intervalFundNav4wChange, 1);
      if (privateCredit.intervalFundNavSymbol && intervalChange) {
        setLeafText('c3-private-aux', `${privateCredit.intervalFundNavSymbol} 区间基金净值 · 4w ${intervalChange}`);
      }
    }
    if (asNumber(privateCredit.bdcEtfPrice) !== null && signedPercentFromDecimal(privateCredit.bdcEtf4wChange, 1)) {
      setLeafText('c3-private-bdc', `${formatUsd(privateCredit.bdcEtfPrice)} · 4w ${signedPercentFromDecimal(privateCredit.bdcEtf4wChange, 1)}`);
    }
    if (asNumber(privateCredit.pbdcEtfPrice) !== null && signedPercentFromDecimal(privateCredit.pbdcEtf4wChange, 1)) {
      setLeafText('c3-private-pbdc', `${formatUsd(privateCredit.pbdcEtfPrice)} · 4w ${signedPercentFromDecimal(privateCredit.pbdcEtf4wChange, 1)}`);
    }
    if (asNumber(privateCredit.seniorLoanEtfPrice) !== null && signedPercentFromDecimal(privateCredit.seniorLoanEtf4wChange, 1)) {
      setLeafText('c3-private-srln', `${formatUsd(privateCredit.seniorLoanEtfPrice)} · 4w ${signedPercentFromDecimal(privateCredit.seniorLoanEtf4wChange, 1)}`);
    }
    if (privateCredit.privateCreditProxyRegime) setLeafText('c3-private-regime', privateCredit.privateCreditProxyRegime);

    const creTone = creToneFromRegime(cre.creStressRegime);
    setIndicatorStatus('c3-cre-status', 'c3-cre-badge', creTone);
    const delinquency = asNumber(cre.creDelinquencyRate);
    if (delinquency !== null) setLeafText('c3-cre-number', delinquency.toFixed(2));
    const delinquencyChange = asNumber(cre.creDelinquencyRateQoQChange);
    if (delinquencyChange !== null && cre.creStressRegime) {
      setLeafText('c3-cre-aux', `商业地产贷款违约率 · QoQ ${formatBps(delinquencyChange, 0)} · 状态: ${cre.creStressRegime}`);
    }
    if (delinquency !== null) setLeafText('c3-cre-delinquency', `${delinquency.toFixed(2)}%`);
    if (asNumber(cre.creChargeOffRate) !== null) setLeafText('c3-cre-chargeoff', `${cre.creChargeOffRate.toFixed(2)}%`);
    if (asNumber(cre.sloosCreNonfarmNonresidentialTightening) !== null) setLeafText('c3-cre-sloos-nonfarm', signedNumber(cre.sloosCreNonfarmNonresidentialTightening, 1));
    if (asNumber(cre.sloosCreConstructionTightening) !== null) setLeafText('c3-cre-sloos-construction', signedNumber(cre.sloosCreConstructionTightening, 1));
    if (asNumber(cre.sloosCreMultifamilyTightening) !== null) setLeafText('c3-cre-sloos-multifamily', signedNumber(cre.sloosCreMultifamilyTightening, 1));
    if (asNumber(cre.sloosCreTighteningMax) !== null) setLeafText('c3-cre-sloos-max', signedNumber(cre.sloosCreTighteningMax, 1));
  } catch (error) {
    console.error('[renderMacroOverview] renderC3CreditCorporate failed:', error);
  }
}

// ---------- Stage 5c: C4 US Economic Temperature ----------

function renderC4UsEconomyTemperature({ radarData }) {
  try {
    if (!radarData) return;
    const employment = radarData.macroDrivers?.employment || {};
    const retail = radarData.macroDrivers?.consumerRetail || {};
    const consumer = radarData.macroDrivers?.consumer || {};

    const employmentTone = employmentToneFromRegime(employment.industryDiffusionRegime);
    setIndicatorStatus('c4-employment-status', 'c4-employment-badge', employmentTone);
    const claims = asNumber(employment.initialClaims);
    if (claims !== null) setLeafText('c4-employment-number', formatK(claims));
    const claimsAvg = asNumber(employment.initialClaims4wAverage);
    const claimsChange = signedK(employment.initialClaims4wChange);
    if (claimsAvg !== null && claimsChange) {
      setLeafText('c4-employment-aux', `初请失业金 · 4 周均值 ${formatK(claimsAvg)}k · 4 周变化 ${claimsChange}`);
      setLeafText('c4-employment-claims-change', claimsChange);
    }
    if (asNumber(employment.continuingClaims) !== null && asNumber(employment.continuingClaims4wAverage) !== null) {
      setLeafText('c4-employment-continuing', `${formatCountM(employment.continuingClaims, 2)} · 4w avg ${formatCountM(employment.continuingClaims4wAverage, 2)}`);
    }
    if (asNumber(employment.joltsOpenings) !== null && signedPercentFromDecimal(employment.joltsOpeningsYoY, 1)) {
      setLeafText('c4-employment-jolts', `${formatCountM(employment.joltsOpenings, 1)} · YoY ${signedPercentFromDecimal(employment.joltsOpeningsYoY, 1)}`);
    }
    if (asNumber(employment.u6Rate) !== null) setLeafText('c4-employment-u6', `${employment.u6Rate.toFixed(1)}%`);
    if (signedPercentFromDecimal(employment.averageHourlyEarningsYoY, 1)) setLeafText('c4-employment-ahe', signedPercentFromDecimal(employment.averageHourlyEarningsYoY, 1));
    if (asNumber(employment.industryPayrollDiffusionPct) !== null) {
      const positive = asNumber(employment.industryPayrollPositiveCount);
      const total = asNumber(employment.industryPayrollSeriesCount);
      const suffix = positive !== null && total !== null ? ` (${positive}/${total} 行业扩张占比)` : '';
      setLeafText('c4-employment-diffusion', `${employment.industryPayrollDiffusionPct.toFixed(1)}%${suffix}`);
    }
    if (employment.industryDiffusionRegime) setLeafText('c4-employment-regime', employment.industryDiffusionRegime);

    const consumerTone = consumerToneFromRegime(consumer.regime);
    setIndicatorStatus('c4-consumer-status', 'c4-consumer-badge', consumerTone);
    const nominalYoy = signedPercentFromDecimal(retail.cartsNominalYoY, 1);
    const realYoy = signedPercentFromDecimal(retail.cartsRealYoY, 1);
    if (nominalYoy) setLeafText('c4-consumer-number', nominalYoy.replace('%', ''));
    if (realYoy) {
      setLeafText('c4-consumer-aux', `名义零售(CARTS) · 实际 ${realYoy} YoY`);
      setLeafText('c4-consumer-real', realYoy);
    }
    if (asNumber(retail.segmentDiffusionPct) !== null) {
      const positive = asNumber(retail.segmentPositiveCount);
      const total = asNumber(retail.segmentSeriesCount);
      const suffix = positive !== null && total !== null ? ` (${positive}/${total} 类品类正增长占比)` : '';
      setLeafText('c4-consumer-diffusion', `${retail.segmentDiffusionPct.toFixed(1)}%${suffix}`);
    }
    if (retail.strongestSegment?.labelZh && asNumber(retail.strongestSegment.yoy) !== null) {
      setLeafText('c4-consumer-strongest', `${retail.strongestSegment.labelZh} ${signedPercentFromDecimal(retail.strongestSegment.yoy, 1)} YoY`);
    }
    if (retail.weakestSegment?.labelZh && asNumber(retail.weakestSegment.yoy) !== null) {
      setLeafText('c4-consumer-weakest', `${retail.weakestSegment.labelZh} ${signedPercentFromDecimal(retail.weakestSegment.yoy, 1)} YoY`);
    }
    if (asNumber(consumer.umichSentiment) !== null && asNumber(consumer.threeMonthChange) !== null) {
      setLeafText('c4-consumer-umich', `${consumer.umichSentiment.toFixed(1)} · 3m ${signedNumber(consumer.threeMonthChange, 1)}`);
    }
    if (signedPercentFromDecimal(retail.bofaCardSpendingExGasYoY, 1)) setLeafText('c4-consumer-bofa', `${signedPercentFromDecimal(retail.bofaCardSpendingExGasYoY, 1)} YoY`);
    if (signedPercentFromDecimal(retail.redbookRetailSalesYoY, 1)) setLeafText('c4-consumer-redbook', signedPercentFromDecimal(retail.redbookRetailSalesYoY, 1));
  } catch (error) {
    console.error('[renderMacroOverview] renderC4UsEconomyTemperature failed:', error);
  }
}

function renderShippingFreight({ radarData }) {
  try {
    const sf = radarData?.macroDrivers?.shippingFreight;
    if (!sf) return;
    const ss = sf.sourceStatus || {};
    const anyLive = ss.dirtyTanker === 'live' || ss.cleanTanker === 'live' || ss.dryBulk === 'live';
    const anyFallback = ss.dirtyTanker === 'fallback' || ss.cleanTanker === 'fallback' || ss.dryBulk === 'fallback';
    const status = anyLive ? 'live' : (anyFallback ? 'fallback' : 'missing');
    const reaction = setObservationReaction(
      'c1-freight-status',
      'c1-freight-badge',
      radarData,
      status === 'missing' ? 'unavailable' : signalFromFreightRegime(sf.freightStressRegime)
    );
    const bdi = asNumber(sf.balticDryIndex);
    setLeafText('c1-freight-number', bdi !== null ? bdi.toFixed(0) : '—');
    const leg = (idxVal, chgVal, label) => {
      const v = asNumber(idxVal);
      if (v === null) return `${label} —`;
      const c = asNumber(chgVal);
      return c !== null ? `${label} ${v.toFixed(0)} ${signedFixed(c * 100, 2)}%` : `${label} ${v.toFixed(0)}`;
    };
    const regime = sf.freightStressRegime ? ` · ${sf.freightStressRegime}` : '';
    const suffix = status === 'fallback' ? ' · 回退' : '';
    const detail = `${leg(sf.balticDirtyTankerIndex, sf.balticDirtyTankerDailyChangePct, 'BDTI')} · ${leg(sf.balticCleanTankerIndex, sf.balticCleanTankerDailyChangePct, 'BCTI')} · ${leg(sf.balticDryIndex, sf.balticDryDailyChangePct, 'BDI')}${regime}${suffix}`;
    setLeafText('c1-freight-aux', reactionText(reaction, detail));
  } catch (error) {
    console.error('[renderMacroOverview] renderShippingFreight failed:', error);
  }
}

function renderTransportShockConfirmation({ radarData }) {
  try {
    const layer = radarData?.macroDrivers?.energyTransport;
    const candidate = layer?.transportShockCandidate;
    const latestAgeDays = asNumber(layer?.latestAgeDays);
    const reaction = setObservationReaction(
      'c1-transport-shock-status',
      'c1-transport-shock-badge',
      radarData,
      signalFromTransportShockCandidate(candidate)
    );

    const score = asNumber(candidate?.score ?? candidate?.candidateScore ?? candidate?.manualCandidateScore);
    setLeafText('c1-transport-shock-number', score !== null ? score.toFixed(0) : '—');

    const gateLabel = (value) => {
      const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!text || text === 'not_connected' || text === 'not connected') return '未接入';
      if (text.includes('manual')) return '人工复核';
      if (text.includes('review')) return '待复核';
      if (text.includes('blocked')) return '阻塞';
      if (text.includes('connected')) return '已接入';
      return value;
    };
    const routeGate = gateLabel(candidate?.routeFreightConfirmation ?? candidate?.routeFreightConfirmationStatus);
    const marketGate = gateLabel(candidate?.marketConfirmation ?? candidate?.marketConfirmationStatus);
    setLeafText('c1-transport-shock-route', routeGate);
    setLeafText('c1-transport-shock-market', marketGate);

    const evidence = candidate?.evidence || {};
    const hormuzPct = asNumber(
      evidence.hormuzTankerVs30dPct
      ?? evidence.hormuzVs30dPct
      ?? layer?.chokepoints?.hormuz?.capacityTankerVs30dPct
      ?? layer?.chokepoints?.hormuz?.latestVs30dPct
    );
    const hormuzText = hormuzPct !== null ? `${signedFixed(hormuzPct * 100, 1)}% vs 30d` : '—';
    setLeafText('c1-transport-shock-hormuz', hormuzText);

    const sampleQuality = !candidate
      ? '候选字段待刷新'
      : candidate.confidence === 'low'
        ? '低置信观察 · 待路线/市场确认'
        : '样本审阅中 · 不入分';
    setLeafText('c1-transport-shock-sample-quality', sampleQuality);

    const freshnessText = latestAgeDays !== null
      ? `PortWatch ${latestAgeDays.toFixed(0)}天龄${latestAgeDays > 7 ? ' · 偏滞后' : ''}`
      : 'PortWatch 数据龄待确认';
    setLeafText('c1-transport-shock-freshness', freshnessText);

    const statusText = candidate?.status ? `状态 ${candidate.status}` : '候选字段待刷新';
    const sourceStatus = layer?.sourceStatus?.chokepoints ? `PortWatch ${layer.sourceStatus.chokepoints}` : 'PortWatch 待确认';
    const ageSuffix = latestAgeDays !== null ? ` · ${latestAgeDays.toFixed(0)}天龄` : '';
    setLeafText('c1-transport-shock-aux', reactionText(reaction, `${statusText} · 路线 ${routeGate} · 市场 ${marketGate} · ${sourceStatus}${ageSuffix}`));
    const firstReason = Array.isArray(candidate?.reasons) && candidate.reasons.length
      ? candidate.reasons[0]
      : '运输冲击确认因子仍在展示观察阶段;路线级油轮运费与市场确认未接入前,不进入主判断打分。';
    const ageCaveat = latestAgeDays !== null && latestAgeDays > 7
      ? ' PortWatch 底层日期超过7天,只作滞后代理观察。'
      : '';
    setLeafText('c1-transport-shock-note', `${firstReason}${ageCaveat}`);
  } catch (error) {
    console.error('[renderMacroOverview] renderTransportShockConfirmation failed:', error);
  }
}

function renderEuroVolatilityLeaf({ radarData }) {
  const euroVolatility = radarData?.macroDrivers?.euroVolatility;
  const value = asNumber(euroVolatility?.value);
  const changePct = asNumber(euroVolatility?.changePct);
  const vix = currentValue(radarData, 'vix');
  const status = euroVolatility?.sourceStatus || 'missing';

  const signal = status === 'missing'
    ? 'unavailable'
    : value === null
      ? 'unavailable'
      : value >= 25 || (changePct !== null && changePct >= 0.08)
        ? 'stress'
        : value < 18 && (changePct === null || changePct < 0.05)
          ? 'benign'
          : 'neutral';
  const reaction = setObservationReaction('c5-v2x-status', 'c5-v2x-badge', radarData, signal);
  setLeafText('c5-v2x-number', value !== null ? value.toFixed(1) : '—');

  const auxParts = [];
  if (typeof euroVolatility?.refDate === 'string' && euroVolatility.refDate.trim()) {
    auxParts.push(euroVolatility.refDate);
  }
  if (changePct !== null) {
    auxParts.push(`1日 ${signedFixed(changePct * 100, 1)}%`);
  }
  if (value !== null && vix !== null) {
    auxParts.push(`相对美国波动率(VIX) ${signedFixed(value - vix, 1)}`);
  }
  if (status === 'fallback') auxParts.push('回退');
  if (status === 'missing' && auxParts.length === 0) auxParts.push('待源恢复');
  setLeafText('c5-v2x-aux', reactionText(reaction, auxParts.join(' · ') || '—'));
}
function renderC5WorldEconomy({ radarData }) {
  try {
    if (!radarData) return;
    renderEuroVolatilityLeaf({ radarData });
    const worldEconomy = radarData.macroDrivers?.worldEconomy;
    if (!worldEconomy) return;

    const cards = [
      { key: 'stoxx50', prefix: 'c5-stoxx50' },
      { key: 'nikkei225', prefix: 'c5-nikkei225' },
      { key: 'dax', prefix: 'c5-dax' },
      { key: 'ftse100', prefix: 'c5-ftse100' },
      { key: 'cac40', prefix: 'c5-cac40' },
      { key: 'stoxx600', prefix: 'c5-stoxx600' },
      { key: 'kospi', prefix: 'c5-kospi' },
      { key: 'asx200', prefix: 'c5-asx200' },
      { key: 'sti', prefix: 'c5-sti' },
      { key: 'taiex', prefix: 'c5-taiex' },
      { key: 'nifty50', prefix: 'c5-nifty50' },
      { key: 'bovespa', prefix: 'c5-bovespa' }
    ];

    cards.forEach(({ key, prefix }) => {
      const item = worldEconomy[key];
      const price = asNumber(item?.price);
      const changePct = asNumber(item?.changePct);
      const status = item?.sourceStatus || worldEconomy.sourceStatus?.[key] || 'missing';

      const reaction = setObservationReaction(
        `${prefix}-status`,
        `${prefix}-badge`,
        radarData,
        status === 'missing' ? 'unavailable' : signalFromEquityChange(changePct)
      );

      if (price !== null) {
        setLeafText(`${prefix}-number`, price.toFixed(0));
      } else {
        setLeafText(`${prefix}-number`, '—');
      }

      if (changePct !== null) {
        const pctText = signedFixed(changePct * 100, 2);
        const suffix = status === 'fallback' ? ' · 回退' : '';
        setLeafText(`${prefix}-aux`, reactionText(reaction, `近5日 ${pctText}%${suffix}`));
      } else {
        setLeafText(`${prefix}-aux`, reactionText(reaction, status === 'fallback' ? '近5日 — · 回退' : '近5日 —'));
      }
    });
  } catch (error) {
    console.error('[renderMacroOverview] renderC5WorldEconomy failed:', error);
  }
}

function renderC6ChinaEquity({ radarData }) {
  try {
    if (!radarData) return;
    renderChinaBondLeaf({ radarData });
    renderCfetsRmbLeaf('c6-cfets', radarData.macroDrivers?.cfetsRmb, radarData);
    renderChinaInflationLeaf({ radarData });
    renderChinaPmiLeaf({ radarData });
    renderChinaPropertyLeaf({ radarData });
    renderChinaOmoLeaf({ radarData });
    renderChinaTsfLeaf({ radarData });
    renderChinaMlfLeaf({ radarData });

    const chinaEquity = radarData.macroDrivers?.chinaEquity;
    if (!chinaEquity) return;

    const cards = [
      { key: 'sseComposite', prefix: 'c6-sse' },
      { key: 'hangSeng', prefix: 'c6-hsi' },
      { key: 'csi300', prefix: 'c6-csi300' }
    ];

    cards.forEach(({ key, prefix }) => {
      const item = chinaEquity[key];
      const price = asNumber(item?.price);
      const changePct = asNumber(item?.changePct);
      const status = item?.sourceStatus || chinaEquity.sourceStatus?.[key] || 'missing';

      const reaction = setObservationReaction(
        `${prefix}-status`,
        `${prefix}-badge`,
        radarData,
        status === 'missing' ? 'unavailable' : signalFromEquityChange(changePct)
      );

      if (price !== null) {
        setLeafText(`${prefix}-number`, price.toFixed(0));
      } else {
        setLeafText(`${prefix}-number`, '—');
      }

      if (changePct !== null) {
        const pctText = signedFixed(changePct * 100, 2);
        const suffix = status === 'fallback' ? ' · 回退' : '';
        setLeafText(`${prefix}-aux`, reactionText(reaction, `近5日 ${pctText}%${suffix}`));
      } else {
        setLeafText(`${prefix}-aux`, reactionText(reaction, status === 'fallback' ? '近5日 — · 回退' : '近5日 —'));
      }
    });
  } catch (error) {
    console.error('[renderMacroOverview] renderC6ChinaEquity failed:', error);
  }
}

function findByField(items, fieldName, expectedValue) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => item && item[fieldName] === expectedValue) || null;
}

function formatUtcMinute(isoValue) {
  if (!isoValue) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function signedInteger(value) {
  const n = asNumber(value);
  if (n === null) return null;
  return `${n > 0 ? '+' : ''}${Math.round(n)}`;
}

function pathChangeText(entry) {
  if (!entry) return null;
  const value = asNumber(entry.value);
  const delta = asNumber(entry.delta);
  if (value === null || delta === null) return null;
  return `${Math.round(value)} (${signedInteger(delta)})`;
}

function updatePathChangeBar(entry, barId, textId) {
  const value = asNumber(entry?.value);
  if (value === null) return;
  const boundedValue = Math.max(0, Math.min(100, value));
  const width = boundedValue * 6;
  const textX = Math.min(760, 112 + width);
  const barEl = $(barId);
  if (barEl) barEl.setAttribute('width', width.toFixed(0));
  const textEl = $(textId);
  if (textEl) textEl.setAttribute('x', textX.toFixed(0));
}

function assetRowByName(rows, name) {
  return findByField(rows, 'asset', name);
}

function scenarioByName(items, name) {
  return findByField(items, 'name', name);
}

function dimensionTone(score) {
  const n = asNumber(score);
  if (n === null) return null;
  if (n >= 85) return 'severe';
  if (n >= 70) return 'high';
  if (n >= 50) return 'med';
  return 'low';
}

function updateToneClass(id, allowed, tone) {
  const el = document.getElementById(id);
  if (!el || !tone) return;
  for (const cls of allowed) el.classList.remove(cls);
  el.classList.add(tone);
}

function confidenceLabel(value) {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 0.8) return `高 (${Number.isInteger(n) ? n : n.toFixed(2)})`;
  if (n >= 0.5) return `中 (${n.toFixed(2)})`;
  return `低 (${n.toFixed(2)})`;
}

function renderDetailData({ radarData }) {
  try {
    if (!radarData) return;

    const realtime = radarData.dailyRealtimeInput || {};
    const structuralSignals = radarData.decisionModel?.structuralSignals || [];
    const time = radarData.timeDimension || {};
    const chain = radarData.transmissionChain || {};
    const assetRows = radarData.assetReturnMap?.rows || [];
    const scenarios = radarData.scenarioTree || [];

    if (asNumber(realtime.healthScore) !== null) {
      setLeafText('detail-health-score', `健康度 ${Math.round(realtime.healthScore)}/100`);
    }
    if (realtime.sourceMode) setLeafText('detail-health-source-mode', `${sourceModeZh(realtime.sourceMode)}输入`);
    const runAt = formatUtcMinute(realtime.capturedAt || realtime.updatedAt);
    if (runAt) setLeafText('detail-health-run-at', runAt);
    // P3-18 WIRE batch B/C/D: data-health appendix prose + sidebar dd + Fed liquidity mirror
    if (realtime.branch) setLeafText('detail-health-branch', realtime.branch);
    if (realtime.commitSha) setLeafText('detail-health-commit', String(realtime.commitSha).slice(0, 8));
    if (runAt) setLeafText('detail-health-captured', runAt);
    if (asNumber(realtime.healthScore) !== null) {
      setLeafText('detail-health-score-dd', `${Math.round(realtime.healthScore)} / 100`);
    }

    // Structural signals: WIRE count + active/none toggle (batch D — 0-signal safe)
    const structuralSignalCount = structuralSignals.length;
    const hasStructuralSignal = structuralSignalCount > 0;
    const firstSignal = hasStructuralSignal ? structuralSignals[0] : null;
    setLeafText('detail-fed-signal-count', String(structuralSignalCount));
    setHidden('detail-fed-signal-active', !hasStructuralSignal);
    setHidden('detail-fed-signal-none', hasStructuralSignal);
    setHidden('detail-health-structural-note-active', !hasStructuralSignal);
    setHidden('detail-health-structural-note-none', hasStructuralSignal);
    if (firstSignal) {
      const signalKey = firstSignal.key || 'structuralSignal';
      const signalLabel = firstSignal.label || signalKey;
      const signalDetail = firstSignal.detail || signalLabel;
      setLeafText('detail-fed-signal-label', signalLabel);
      setLeafText('detail-fed-onrrp', signalDetail);
      setLeafText('detail-health-structural-signal', `${signalLabel} · ${signalDetail}`.trim());
      setLeafText('detail-health-structural-dd', `${signalLabel} (${structuralSignalCount})`);
    } else {
      setLeafText('detail-health-structural-dd', '无激活结构信号');
    }

    // recovery booleans (batch D) — false must not be guarded away
    const recovery = radarData.recovery || {};
    if (typeof recovery.degradedMode === 'boolean') {
      setLeafText('detail-health-degraded-mode', recovery.degradedMode ? '是' : '否');
    }
    if (typeof recovery.safeOutput === 'boolean') {
      setLeafText('detail-health-safe-output', recovery.safeOutput ? '是' : '否');
    }

    // 关键缺失 / fallback counts (batch D) — live from warningSystem (criticalMissing / fallbackCount)
    const warning = radarData.warningSystem || {};
    if (asNumber(warning.criticalCount) !== null) {
      const criticalText = String(Math.round(warning.criticalCount));
      setLeafText('detail-health-critical-missing', criticalText);
      setLeafText('detail-health-critical-missing-dd', `${criticalText} 项`);
    }
    if (asNumber(warning.warningCount) !== null) {
      setLeafText('detail-health-fallback-count', String(Math.round(warning.warningCount)));
    }

    // 数据健康整段叙述：健康 / 需关注 两态切换 (batch E)
    const sourceMode = String(realtime.sourceMode || '');
    const healthDegraded =
      recovery.degradedMode === true ||
      (asNumber(warning.criticalCount) || 0) > 0 ||
      (asNumber(warning.warningCount) || 0) > 0 ||
      (sourceMode !== '' && sourceMode !== 'live');
    setLeafText('detail-health-state-word', healthDegraded ? '需关注' : '正常');
    setToneClass('detail-health-score', '', healthDegraded ? 'warn' : 'ok');
    setToneClass('detail-health-callout', 'appendix-callout', healthDegraded ? 'warn' : 'ok');
    setHidden('detail-health-refresh-active', healthDegraded);
    setHidden('detail-health-refresh-none', !healthDegraded);
    setHidden('detail-health-sources-active', healthDegraded);
    setHidden('detail-health-sources-none', !healthDegraded);
    setHidden('detail-health-callout-active', healthDegraded);
    setHidden('detail-health-callout-none', !healthDegraded);
    setHidden('detail-health-live-note-active', healthDegraded);
    setHidden('detail-health-live-note-none', !healthDegraded);

    const fed = radarData.macroDrivers?.fedLiquidity || {};
    if (fed.regime) setLeafText('detail-fed-regime', fed.regime);
    if (asNumber(fed.walcl) !== null) setLeafText('detail-fed-walcl', `${formatT(fed.walcl)}T`);
    if (asNumber(fed.reserveBalances) !== null) setLeafText('detail-fed-reserves', `${formatT(fed.reserveBalances)}T`);
    if (asNumber(fed.sofr) !== null && asNumber(fed.effectiveFedFundsRate) !== null) {
      setLeafText('detail-fed-sofr-effr', `${fed.sofr.toFixed(2)}%/${fed.effectiveFedFundsRate.toFixed(2)}%`);
    }
    if (fed.repoSpreadRegime) setLeafText('detail-fed-repo-regime', fed.repoSpreadRegime);

    if (asNumber(time.scoreChange30d) !== null) setLeafText('detail-time-change', signedInteger(time.scoreChange30d));
    if (asNumber(time.avg30d) !== null) setLeafText('detail-time-avg', Math.round(time.avg30d));
    if (asNumber(time.trough30d) !== null && asNumber(time.peak30d) !== null) {
      setLeafText('detail-time-range', `[${Math.round(time.trough30d)}, ${Math.round(time.peak30d)}]`);
    }
    if (asNumber(time.drawFromPeak) !== null) setLeafText('detail-time-drawdown', signedInteger(time.drawFromPeak));
    if (asNumber(time.transmissionSpeed) !== null) setLeafText('detail-time-speed', Math.round(time.transmissionSpeed));
    if (time.transmissionAcceleration) setLeafText('detail-time-accel', time.transmissionAcceleration);

    const pathChanges = time.pathChanges || [];
    const pathMap = {
      '油价→通胀': { textId: 'detail-time-path-oil-inflation', barId: 'detail-time-path-oil-inflation-bar' },
      '通胀→利率': { textId: 'detail-time-path-inflation-rate', barId: 'detail-time-path-inflation-rate-bar' },
      '利率→股票': { textId: 'detail-time-path-rate-equity', barId: 'detail-time-path-rate-equity-bar' },
      '美元→信用': { textId: 'detail-time-path-dollar-credit', barId: 'detail-time-path-dollar-credit-bar' },
      '流动性→估值': { textId: 'detail-time-path-liquidity-valuation', barId: 'detail-time-path-liquidity-valuation-bar' },
    };
    for (const [label, ids] of Object.entries(pathMap)) {
      const entry = findByField(pathChanges, 'label', label);
      const text = pathChangeText(entry);
      if (text) setLeafText(ids.textId, text);
      updatePathChangeBar(entry, ids.barId, ids.textId);
    }

    if (asNumber(chain.stressScore) !== null) setLeafText('detail-chain-stress', Math.round(chain.stressScore));
    if (asNumber(chain.pathConfidence) !== null) setLeafText('detail-chain-confidence', Math.round(chain.pathConfidence));
    if (chain.leadShock) setLeafText('detail-chain-lead-shock', chain.leadShock);
    if (chain.dominantImpact) setLeafText('detail-chain-dominant-impact', chain.dominantImpact);

    const nodes = chain.nodes || [];
    const nodeMap = {
      '战争冲击': 'detail-chain-node-shock',
      '油价压力': 'detail-chain-node-price',
      '通胀传导': 'detail-chain-node-macro',
      '利率压力': 'detail-chain-node-rate',
      '股票影响': 'detail-chain-node-equity',
      '黄金影响': 'detail-chain-node-gold',
    };
    for (const [label, id] of Object.entries(nodeMap)) {
      const node = findByField(nodes, 'label', label);
      if (node && asNumber(node.score) !== null) {
        if (node.state && node.state.length > 0) {
          setLeafText(id, `分数 ${Math.round(node.score)} · ${node.state}`);
        } else {
          setLeafText(id, `分数 ${Math.round(node.score)}`);
        }
      }
    }

    const assetIdMap = {
      '原油': 'oil',
      '美元/短票': 'dollar',
      '能源股': 'energy-equity',
      '黄金': 'gold',
      '美国国债': 'treasury',
      '全球股票': 'global-equity',
      '科技股': 'tech',
      '比特币': 'bitcoin',
    };
    for (const [asset, slug] of Object.entries(assetIdMap)) {
      const row = assetRowByName(assetRows, asset);
      if (!row) continue;
      if (row.bias) setLeafText(`detail-asset-${slug}-bias`, row.bias);
      if (row.expectedReturn) setLeafText(`detail-asset-${slug}-range`, row.expectedReturn);
      if (row.maxDrawdown) setLeafText(`detail-asset-${slug}-drawdown`, row.maxDrawdown);
      if (row.confidence) setLeafText(`detail-asset-${slug}-confidence`, row.confidence);
    }

    const scenarioMap = {
      '基准情景': 'detail-scenario-base',
      '风险情景': 'detail-scenario-risk',
      '极端情景': 'detail-scenario-extreme',
      '反转情景': 'detail-scenario-reversal',
    };
    for (const [name, id] of Object.entries(scenarioMap)) {
      const scenario = scenarioByName(scenarios, name);
      if (scenario && asNumber(scenario.probability) !== null) {
        setLeafText(id, `${name} ${Math.round(scenario.probability)}%`);
      }
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderDetailData failed:', error);
  }
}

function renderWorldOrderStress({ worldOrderStressData }) {
  try {
    if (!worldOrderStressData) return;

    const wo = worldOrderStressData;
    if (asNumber(wo.score) !== null) {
      setLeafText('wo-detail-intro-score', Math.round(wo.score));
      setLeafText('wo-detail-score', Math.round(wo.score));
    }
    if (wo.labelZh || wo.state) setLeafText('wo-detail-state', wo.labelZh || '—');
    const confidence = confidenceLabel(wo.confidence);
    if (confidence) setLeafText('wo-detail-confidence', confidence);
    const marketInput = wo.marketConfirmationInput || {};
    if (marketInput.source || asNumber(marketInput.healthScore) !== null) {
      const health = asNumber(marketInput.healthScore) !== null ? `健康度 ${Math.round(marketInput.healthScore)}/100` : '健康度 —';
      setLeafText('wo-detail-market-confirmation', `${sourceModeZh(marketInput.source) || '来源未知'} · ${health}`);
    }
    const modifier = wo.decisionModifier || {};
    if (modifier.riskBias || asNumber(modifier.maxStateBoost) !== null) {
      setLeafText('wo-detail-risk-bias', `风险偏置 ${riskBiasZh(modifier.riskBias)} · 最大升档 ${modifier.maxStateBoost ?? '—'}`);
    }

    // ACLED / GDELT data-freshness indicators — display-only; surfaces existing
    // world-order fields so an operator can confirm a manual ACLED refresh landed.
    // Does NOT change overlay scoring/weights/pipeline (ACLED/GDELT already feed
    // the overlay upstream; this only reads the resulting freshness fields).
    const acledSummary = wo.externalSources?.acled?.summary || {};
    const woDateOrDash = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '—');
    const woCountOrDash = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');
    setLeafText('wo-detail-acled-latest-week', woDateOrDash(acledSummary.latestWeek));
    setLeafText('wo-detail-acled-events-4w', woCountOrDash(acledSummary.eventsLast4Weeks));
    setLeafText('wo-detail-acled-monthly-asof', woDateOrDash(acledSummary.monthlyAsOfDate));
    setLeafText('wo-detail-gdelt-conflict-events', woCountOrDash(wo.externalSources?.gdelt?.summary?.conflictEvents));

    const dimMap = {
      peaceDividendRetreat: 'peace',
      blocFormation: 'bloc',
      multiTheaterConflict: 'conflict',
      economicWeaponization: 'weaponization',
      capitalControlRisk: 'capital',
      marketConfirmation: 'market',
    };
    for (const [key, slug] of Object.entries(dimMap)) {
      const dim = wo.dimensions?.[key];
      if (!dim) continue;
      const tone = dimensionTone(dim.score);
      updateToneClass(`wo-dim-${slug}`, ['low', 'med', 'high', 'severe'], tone);
      if (asNumber(dim.score) !== null) setLeafText(`wo-dim-${slug}-score`, Math.round(dim.score));
      const evidenceSource = key === 'marketConfirmation' && !dim.trend ? null : dim.evidence?.[0]?.source;
      const sourceText = evidenceSource || dim.sourceLabel;
      const trendText = ({ rising: '上行', falling: '回落', stable: '平稳' })[dim.trend] || dim.trend;
      if (sourceText || trendText) {
        if (sourceText && trendText) {
          setLeafText(`wo-dim-${slug}-trend`, `${sourceText} · ${trendText}`);
        } else if (sourceText) {
          setLeafText(`wo-dim-${slug}-trend`, sourceText);
        } else {
          setLeafText(`wo-dim-${slug}-trend`, trendText);
        }
      }
    }

    const drivers = wo.dominantDrivers || [];
    for (let i = 0; i < 3; i += 1) {
      const driver = drivers[i];
      if (!driver) continue;
      const driverLabel = textValue(driver.labelZh) || textValue(driver.dimensionKey) || `驱动 ${i + 1}`;
      setLeafText(`wo-driver-${i + 1}`, `${driverLabel} · ${driver.score ?? '—'}`);
    }
    if (Array.isArray(wo.warnings) && wo.warnings.length > 0) {
      setLeafText('wo-warning-boundary', wo.warnings[0]);
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderWorldOrderStress failed:', error);
  }
}

function textValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function joinNonEmpty(parts, separator = ' · ') {
  return parts
    .map((part) => textValue(part))
    .filter(Boolean)
    .join(separator);
}

function formatBoolean(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === null || value === undefined) return null;
  return String(value);
}

function shortHash(value, length = 12) {
  const text = textValue(value);
  if (!text) return null;
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function orderedSentence(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const clean = items.map((item) => textValue(item)).filter(Boolean);
  if (clean.length === 0) return null;
  return clean.map((item, index) => `(${index + 1}) ${item}`).join(' ');
}

function formatUtcMinuteStage5d2(value) {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function setListItems(prefix, items, maxCount) {
  if (!Array.isArray(items) || items.length === 0) return;
  for (let i = 0; i < maxCount; i += 1) {
    const value = textValue(items[i]);
    if (value) setLeafText(`${prefix}-${i + 1}`, value);
  }
}

function scenarioText(scenario) {
  if (!scenario) return null;
  const title = externalAiDisplayText(scenario.titleZh);
  const triggers = Array.isArray(scenario.triggerConditions)
    ? scenario.triggerConditions.map((item) => externalAiDisplayText(item)).filter(Boolean).join('、')
    : null;
  const invalidations = Array.isArray(scenario.invalidationConditions)
    ? scenario.invalidationConditions.map((item) => externalAiDisplayText(item)).filter(Boolean).join('、')
    : null;
  const parts = [];
  if (title) parts.push(`${title}:`);
  if (triggers) parts.push(`若 ${triggers},则升级观察`);
  if (invalidations) parts.push(`若 ${invalidations},则降级/失效`);
  return parts.length > 0 ? parts.join('；') : null;
}

function externalAiListText(items, fallback = '—') {
  if (!Array.isArray(items)) return fallback;
  const clean = items.map((item) => externalAiDisplayText(item)).filter(Boolean);
  return clean.length > 0 ? clean.join(' / ') : fallback;
}

function externalAiDisplayText(value) {
  const text = textValue(value);
  if (!text) return null;
  return text
    .replace(/\bfalse_down_physical_stress\b/g, '假性下跌、物理压力仍强')
    .replace(/\boilDirectionalPressure\b/g, '油价方向压力')
    .replace(/\bbrentPricingLayer\b/g, '布伦特原油(Brent)定价层')
    .replace(/\bassets\.qqq\.latestMetricDate\b/g, '纳斯达克100 ETF(QQQ)最新温度日期')
    .replace(/\btopRisks\b/g, '每日简报主要风险')
    .replace(/\bfallback\b/g, '回退')
    .replace(/\bif-then\b/g, '条件式(if-then)')
    .replace(/(?<!\()(?<!波动率指数\()(?<!美国)波动率指数?\s*VIX\b/g, '波动率指数(VIX)')
    .replace(/(?<!\()(?<!波动率指数\()\bVIX\b/g, '波动率指数(VIX)')
    .replace(/(?<!\()(?<!高收益债利差\()\bHY OAS\b/g, '高收益债利差(HY OAS)')
    .replace(/(?<!\()(?<!投资级债利差\()(?<!投资级利差\()\bIG OAS\b/g, '投资级债利差(IG OAS)')
    .replace(/高收益利差/g, '高收益债利差(HY OAS)')
    .replace(/美国10年期收益率/g, '美国10年期国债收益率(US10Y)')
    .replace(/广义美元指数(?!\()/g, '广义美元指数(DXY)')
    .replace(/消费者信心指数(?!\()/g, '消费者信心指数(UMCSENT)')
    .replace(/(?<!\()(?<!美国10年期国债收益率\()\bUS10Y\b/g, '美国10年期国债收益率(US10Y)')
    .replace(/(?<!\()(?<!隔夜逆回购\()\bON RRP\b/g, '隔夜逆回购(ON RRP)')
    .replace(/布伦特(?!原油)(?!定价层)/g, '布伦特原油(Brent)')
    .replace(/(?<!\()(?<!布伦特原油\()\bBrent\b/g, '布伦特原油(Brent)')
    .replace(/(?<!\()(?<!纳斯达克100 ETF\()\bQQQ\b/g, '纳斯达克100 ETF(QQQ)')
    .replace(/(?<!\()(?<!标普500\()\bSPX\b/g, '标普500(SPX)')
    .replace(/(?<!\()(?<!纳指100\()\bNDX\b/g, '纳指100(NDX)')
    .replace(/(?<!\()(?<!纳指综合\()\bIXIC\b/g, '纳指综合(IXIC)')
    .replace(/(?<!\()(?<!中期借贷便利\()\bMLF\b/g, '中期借贷便利(MLF)')
    .replace(/(?<!\()(?<!消费者物价\()\bCPI\b/g, '消费者物价(CPI)')
    .replace(/(?<!\()(?<!工业品出厂价格\()\bPPI\b/g, '工业品出厂价格(PPI)')
    .replace(/(?<!\()(?<!密歇根消费信心\()\bUMCSENT\b/g, '密歇根消费信心(UMCSENT)')
    .replace(/(?<!\()\bz-score\b/g, '偏离度(z-score)');
}

const EXTERNAL_AI_MACRO_DRIVER_LABELS = {
  fedLiquidity: '美元流动性',
  policyExpectations: '政策预期',
  curve: '收益率曲线',
  credit: '信用压力',
  consumer: '消费者信心',
  shippingFreight: '航运运价',
  employment: '就业质量',
  consumerRetail: '零售消费',
  commercialRealEstate: '商业地产',
  privateCreditProxy: '私募信贷代理',
  worldEconomy: '世界经济',
  chinaEquity: '中国权益',
  inflationEnergy: '通胀与能源',
  copperGold: '铜金比',
  chinaBond: '中国债券',
  cfetsRmb: 'CFETS 人民币',
  chinaInflation: '中国通胀',
  chinaPmi: '中国采购经理指数(PMI)',
  euroVolatility: '欧元区波动率(V2X)',
  chinaPropertyPrice: '中国房价',
  chinaOmo: '中国公开市场操作',
  chinaTsf: '中国社融',
  chinaMlf: '中国中期借贷便利(MLF)',
  rateVol: '利率波动',
  activeSignals: '活跃信号',
  gatingEvaluation: '门控评估',
  allSourcesMissing: '缺失源汇总',
};

const EXTERNAL_AI_SOURCE_LAYER_LABELS = {
  topRisks: '每日简报 · 主要风险',
  checks: '检查项',
  signals: '信号层',
  score: '风险分数',
  stressScore: '压力分数',
  macroState: '宏观状态',
  onRrp: '隔夜逆回购(ON RRP)',
  proxySpread: '公开代理价差',
  umichSentiment: '密歇根消费信心(UMich)',
  geopolitical: '地缘风险',
  dailyBrief: '每日简报',
  aiInterpretationLayer: '规则基线解读',
  dataHealth: '数据健康',
  modules: '六大风险模块',
  regimeProbabilities: '情景概率',
  scenarioTree: '情景树',
  transmissionChain: '传导链',
  heatmap: '全球风险热力图',
  divergenceLayer: '背离检查层',
  brentPricingLayer: '布伦特原油(Brent)定价层',
  oilDirectionalPressure: '油价方向压力',
  worldOrderStress: '世界秩序压力',
  marketPricing: '市场定价',
  dataQuality: '数据质量',
  'decisionContext.sanitized': '只读系统状态',
  ...Object.fromEntries(
    Object.entries(EXTERNAL_AI_MACRO_DRIVER_LABELS).map(([key, label]) => [`macroDrivers.${key}`, label])
  ),
};

const EXTERNAL_AI_FIELD_PATH_LABELS = {
  consumer_vs_asset_pricing: '消费者体感与资产定价错配',
  'assets.qqq.latestMetricDate': '纳斯达克100 ETF(QQQ) · 最新温度日期',
  'marketPricing.assets.qqq.latestMetricDate': '纳斯达克100 ETF(QQQ) · 最新温度日期',
  'oilDirectionalPressure.signals.dieselProductStress.extremeTight': '柴油库存压力',
  'oilDirectionalPressure.signals.dieselProductStress': '柴油库存压力',
  'oilDirectionalPressure.signals.inventoryDrawPressure': '库存抽紧压力',
  'oilDirectionalPressure.signals.priceContext.brentChangePct4w': '布伦特原油(Brent)4 周变化',
  'brentPricingLayer.proxySpread.status': '现货期货价差状态',
  'brentPricingLayer.proxySpread': '现货期货价差',
  'dailyBrief.dominantRiskChain': '主导风险链',
  'macroDrivers.consumer.umichSentiment': '密歇根消费信心',
  'macroDrivers.credit.igOas': '投资级债利差(IG OAS)',
  'macroDrivers.credit.igHyRatio': '投资级/高收益利差比(IG/HY)',
  'macroDrivers.chinaMlf': '中国中期借贷便利(MLF)',
  'dailyBrief.dominantRiskChain.evidence[0].value': '主风险链证据',
  'macroDrivers.consumer.umichSentiment.threeMonthChange': '密歇根信心三月变化',
  'divergenceLayer.checks.consumer_vs_asset_pricing': '消费者体感与资产定价错配',
  'divergenceLayer.checks[4].status': '消费资产背离检查',
  'marketPricing.assets.qqq.status': '纳斯达克100 ETF(QQQ)状态',
  'marketPricing.assets.ndx.status': '纳指100(NDX)状态',
  'marketPricing.assets.ixic.status': '纳指综合(IXIC)状态',
};

const EXTERNAL_AI_SOURCE_VALUE_LABELS = {
  local_compact: '本地压缩输入',
  manual_local_compact: '手动本地压缩输入',
  manual_workflow: '手动工作流',
  analyst_compact_v1: '分析师压缩输入(v1)',
  manual_analyst_compact_v1: '手动分析师压缩输入(v1)',
};

const EXTERNAL_AI_AUDIT_FLAG_LABELS = {
  manual_artifact_only: '手动工作流制品',
  site_structured_data_only: '仅使用站内结构化数据',
  analyst_compact_v1: '分析师压缩输入(v1)',
  validator_required: '必须通过校验',
  non_production_output: '不作为生产决策输出',
  no_frontend_display: '不覆盖平台主结论',
};

const EXTERNAL_AI_SOURCE_LAYER_KEYS = Object.keys(EXTERNAL_AI_SOURCE_LAYER_LABELS)
  .sort((a, b) => b.length - a.length);

const EXTERNAL_AI_CONFIDENCE_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
};

function externalAiSourceLayerLabel(sourceLayer) {
  if (!sourceLayer) return null;
  if (sourceLayer === 'modules') return '六大风险模块';
  if (sourceLayer.startsWith('modules.')) {
    const moduleKey = sourceLayer.slice('modules.'.length).split(/[.\[\]]/u)[0];
    return MODULE_LABELS[moduleKey] ? `六大风险模块 · ${MODULE_LABELS[moduleKey]}` : '六大风险模块';
  }
  if (sourceLayer.startsWith('macroDrivers.')) {
    const key = sourceLayer.slice('macroDrivers.'.length);
    return EXTERNAL_AI_MACRO_DRIVER_LABELS[key] || `宏观驱动 · ${key}`;
  }
  return EXTERNAL_AI_SOURCE_LAYER_LABELS[sourceLayer] || sourceLayer;
}

function findExternalAiCanonicalSourceLayer(reference) {
  const value = textValue(reference);
  if (!value) return null;
  const macroMatch = value.match(/^(macroDrivers\.[A-Za-z][A-Za-z0-9_]*)(?:[.\[].*)?$/u);
  if (macroMatch) return macroMatch[1];
  return EXTERNAL_AI_SOURCE_LAYER_KEYS.find((key) => (
    value === key ||
    value.startsWith(`${key}.`) ||
    value.startsWith(`${key}[`)
  )) || null;
}

function externalAiFieldPathEntityLabel(reference, canonicalLayer) {
  const value = textValue(reference);
  if (!value || !canonicalLayer || value === canonicalLayer) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[value]) return EXTERNAL_AI_FIELD_PATH_LABELS[value];
  const tail = value.slice(canonicalLayer.length).replace(/^\./u, '');
  if (!tail) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[tail]) return EXTERNAL_AI_FIELD_PATH_LABELS[tail];
  if (canonicalLayer === 'modules') {
    const moduleKey = tail.split(/[.\[\]]/u)[0];
    if (MODULE_LABELS[moduleKey]) return MODULE_LABELS[moduleKey];
  }
  return tail;
}

function externalAiReferenceLabel(reference, { allowFieldPath = false } = {}) {
  const value = textValue(reference);
  if (!value) return null;
  if (EXTERNAL_AI_FIELD_PATH_LABELS[value]) return EXTERNAL_AI_FIELD_PATH_LABELS[value];
  if (EXTERNAL_AI_SOURCE_LAYER_LABELS[value]) return EXTERNAL_AI_SOURCE_LAYER_LABELS[value];
  const canonicalLayer = findExternalAiCanonicalSourceLayer(value);
  if (!canonicalLayer) return value;
  const sourceLabel = externalAiSourceLayerLabel(canonicalLayer);
  if (!allowFieldPath || value === canonicalLayer) return sourceLabel;
  const entityLabel = externalAiFieldPathEntityLabel(value, canonicalLayer);
  return entityLabel ? `${sourceLabel} · ${entityLabel}` : sourceLabel;
}

function externalAiAuditFlagText(flags) {
  if (!Array.isArray(flags)) return null;
  const clean = flags.map((flag) => textValue(flag)).filter(Boolean);
  if (!clean.length) return null;
  return clean.map((flag) => EXTERNAL_AI_AUDIT_FLAG_LABELS[flag] || flag).join(' / ');
}

function setExternalAiAuditFlags(flags) {
  const el = $('ext-ai-audit-flags');
  if (!el) return;
  const displayText = externalAiAuditFlagText(flags);
  if (!displayText) return;
  el.textContent = `审计标记：${displayText}。`;
  el.removeAttribute('title');
}

function externalAiSourceValueLabel(value) {
  const text = textValue(value);
  return text ? (EXTERNAL_AI_SOURCE_VALUE_LABELS[text] || externalAiDisplayText(text)) : null;
}

function externalAiReferenceListText(items, options = {}, fallback = '—') {
  if (!Array.isArray(items)) return fallback;
  const clean = items.map((item) => textValue(item)).filter(Boolean);
  if (clean.length === 0) return fallback;
  return clean
    .map((item) => externalAiReferenceLabel(item, options))
    .filter(Boolean)
    .join(' / ');
}

function setExternalAiReferenceListText(id, items, options = {}) {
  const el = $(id);
  if (!el) return;
  const displayText = externalAiReferenceListText(items, options);
  el.textContent = displayText;
  el.removeAttribute('title');
}

function externalAiTitleWithConfidence(title, confidence) {
  const confidenceLabel = EXTERNAL_AI_CONFIDENCE_LABELS[textValue(confidence)] || textValue(confidence);
  return joinNonEmpty([
    externalAiDisplayText(title),
    confidenceLabel ? `置信度:${confidenceLabel}` : null,
  ]);
}

function renderExternalAiSynthesisItem(item, index) {
  const blockId = `ext-ai-synthesis-${index}-block`;
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const title = externalAiTitleWithConfidence(item.theme, item.confidence);
  const summary = externalAiDisplayText(item.summaryZh);
  if (!title && !summary) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (title) setLeafText(`ext-ai-synthesis-${index}-theme`, title);
  if (summary) setLeafText(`ext-ai-synthesis-${index}-summary`, summary);
  setExternalAiReferenceListText(`ext-ai-synthesis-${index}-supporting`, item.supportingLayers);
  setExternalAiReferenceListText(`ext-ai-synthesis-${index}-conflicting`, item.conflictingLayers);
  return true;
}

function renderExternalAiDivergenceItem(item, index) {
  const blockId = `ext-ai-divergence-${index}-block`;
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const title = externalAiDisplayText(item.titleZh);
  const why = externalAiDisplayText(item.whyItMattersZh);
  if (!title && !why) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (title) setLeafText(`ext-ai-divergence-${index}-title`, title);
  if (why) setLeafText(`ext-ai-divergence-${index}-why`, why);
  setExternalAiReferenceListText(`ext-ai-divergence-${index}-for`, item.evidenceFor, { allowFieldPath: true });
  setExternalAiReferenceListText(`ext-ai-divergence-${index}-against`, item.evidenceAgainst, { allowFieldPath: true });
  setLeafText(`ext-ai-divergence-${index}-invalidations`, externalAiListText(item.invalidationConditions, '—'));
  return true;
}

function renderExternalAiScenarioLean(item) {
  const blockId = 'ext-ai-scenario-lean-block';
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const lean = externalAiTitleWithConfidence(item.leanZh, item.confidence);
  if (!lean) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  setLeafText('ext-ai-scenario-lean-text', lean);
  setLeafText('ext-ai-scenario-lean-refs', externalAiListText(item.scenarioRefs));
  setLeafText('ext-ai-scenario-lean-triggers', externalAiListText(item.triggerConditions));
  setLeafText('ext-ai-scenario-lean-invalidations', externalAiListText(item.invalidationConditions));
  return true;
}

function renderExternalAiDataQualityLens(item) {
  const blockId = 'ext-ai-data-quality-lens-block';
  if (!item || typeof item !== 'object') {
    setHidden(blockId, true);
    return false;
  }
  const summary = externalAiDisplayText(item.summaryZh);
  const impact = externalAiDisplayText(item.confidenceImpactZh);
  if (!summary && !impact) {
    setHidden(blockId, true);
    return false;
  }
  setHidden(blockId, false);
  if (summary) setLeafText('ext-ai-data-quality-summary', summary);
  setExternalAiReferenceListText('ext-ai-data-quality-stale', item.staleLayers);
  setExternalAiReferenceListText('ext-ai-data-quality-fallback', item.fallbackLayers);
  setExternalAiReferenceListText('ext-ai-data-quality-missing', item.missingLayers);
  if (impact) setLeafText('ext-ai-data-quality-impact', impact);
  return true;
}

function renderExternalAiStructuredFields(layer) {
  const shown = [
    renderExternalAiSynthesisItem(layer?.crossLayerSynthesis?.[0], 1),
    renderExternalAiSynthesisItem(layer?.crossLayerSynthesis?.[1], 2),
    renderExternalAiDivergenceItem(layer?.keyDivergences?.[0], 1),
    renderExternalAiDivergenceItem(layer?.keyDivergences?.[1], 2),
    renderExternalAiScenarioLean(layer?.scenarioLean),
    renderExternalAiDataQualityLens(layer?.dataQualityLens),
  ].some(Boolean);
  setHidden('ext-ai-structured-output', !shown);
}

function isExternalAiVisibleForFrontend(layer) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return false;
  const boundaries = layer.boundaries || {};
  const qualityReview = layer.qualityReview || {};
  const freshness = layer.freshness || {};

  if (layer.displayEnabled !== true) return false;
  if (layer.status !== 'valid') return false;
  if (boundaries.frontendDisplayApproved !== true) return false;
  if (boundaries.displayOnly !== true) return false;
  if (boundaries.externalAiGenerated !== true) return false;
  if (boundaries.usesExternalAiApi !== true) return false;
  if (boundaries.affectsScoring !== false) return false;
  if (boundaries.affectsDecisionModel !== false) return false;
  if (boundaries.affectsExecutionLock !== false) return false;
  if (boundaries.affectsPositionGuidance !== false) return false;
  if (boundaries.notInvestmentAdvice !== true) return false;
  if (boundaries.productionWriteApproved !== false) return false;
  if (!['pass', 'warn'].includes(qualityReview.status)) return false;
  if (qualityReview.recommendation !== 'pass_for_manual_review') return false;
  if (qualityReview.promotionEligible !== false) return false;
  if (freshness.isStale !== false) return false;
  return true;
}

function allocationByTarget(positioning, target) {
  const allocations = positioning?.coreAllocations;
  if (!Array.isArray(allocations)) return null;
  return allocations.find((item) => item?.target === target) || null;
}

function setAllocationRow(slug, allocation) {
  if (!allocation) return;
  if (textValue(allocation.name)) setLeafText(`exec-alloc-${slug}-name`, allocation.name);
  if (textValue(allocation.target)) setLeafText(`exec-alloc-${slug}-target`, allocation.target);
  if (textValue(allocation.weight)) setLeafText(`exec-alloc-${slug}-weight`, allocation.weight);
  if (textValue(allocation.reason)) setLeafText(`exec-alloc-${slug}-reason`, allocation.reason);
}

function renderExternalAiAuxiliary({ radarData }) {
  try {
    const layer = radarData?.externalAiInterpretationLayer;
    if (!isExternalAiVisibleForFrontend(layer)) {
      setHidden('external-ai-auxiliary', true);
      setHidden('ext-ai-structured-output', true);
      return;
    }
    setHidden('external-ai-auxiliary', false);

    if (textValue(layer.provider)) setLeafText('ext-ai-provider', layer.provider);
    if (textValue(layer.model)) setLeafText('ext-ai-model', layer.model);
    if (textValue(layer.qualityReview?.recommendation)) {
      const reviewZh = ({ pass_for_manual_review: '已通过人工复核' })[layer.qualityReview.recommendation] || layer.qualityReview.recommendation;
      setLeafText('ext-ai-quality', reviewZh);
    }
    const promotion = formatBoolean(layer.qualityReview?.promotionEligible);
    if (promotion) setLeafText('ext-ai-promotion', promotion);
    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-run-id', layer.provenance.runId);
    const generatedAt = formatUtcMinuteStage5d2(layer.generatedAt);
    if (generatedAt) setLeafText('ext-ai-generated-at', generatedAt);

    if (textValue(layer.summaryZh)) setLeafText('ext-ai-summary', externalAiDisplayText(layer.summaryZh));
    const factsText = orderedSentence(layer.facts);
    if (factsText) setLeafText('ext-ai-facts-text', externalAiDisplayText(factsText));
    const inferencesText = orderedSentence(layer.inferences);
    if (inferencesText) setLeafText('ext-ai-inferences-text', externalAiDisplayText(inferencesText));
    const judgmentsText = orderedSentence(layer.modelJudgments);
    if (judgmentsText) setLeafText('ext-ai-judgments-text', externalAiDisplayText(judgmentsText));

    if (Array.isArray(layer.scenarioHypotheses)) {
      for (let i = 0; i < 2; i += 1) {
        const text = scenarioText(layer.scenarioHypotheses[i]);
        if (text) setLeafText(`ext-ai-scenario-${i + 1}`, text);
      }
    }
    renderExternalAiStructuredFields(layer);

    const boundaries = layer.boundaries || {};
    const boundaryParts = [];
    if (boundaries.externalAiGenerated) boundaryParts.push('本 AI 解读层由外部 AI 生成');
    if (boundaries.displayOnly) boundaryParts.push('仅供展示参考,不参与平台的风险打分与决策');
    if (boundaries.notInvestmentAdvice) boundaryParts.push('不构成投资建议');
    const boundaryText = boundaryParts.length > 0 ? `${boundaryParts.join(';')}。` : '';
    if (boundaryText) setLeafText('ext-ai-boundaries-text', boundaryText);

    setExternalAiAuditFlags(layer.auditFlags);

    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-prov-run-id', layer.provenance.runId);
    if (textValue(layer.inputSource)) setLeafText('ext-ai-prov-input-source', externalAiSourceValueLabel(layer.inputSource));
    if (textValue(layer.sourceMode)) setLeafText('ext-ai-prov-source-mode', externalAiSourceValueLabel(layer.sourceMode));
    if (generatedAt) setLeafText('ext-ai-prov-generated-at', generatedAt);
    const digest = shortHash(layer.provenance?.artifactDigest, 12);
    if (digest) setLeafText('ext-ai-prov-artifact-digest', digest);
    const commit = shortHash(layer.provenance?.sourceCommit, 12);
    if (commit) setLeafText('ext-ai-prov-source-commit', commit);
    const humanApproved = formatBoolean(layer.provenance?.humanApproved);
    if (humanApproved) setLeafText('ext-ai-prov-human-approved', humanApproved);
    if (promotion) setLeafText('ext-ai-prov-promotion', promotion);
    const confidenceText = joinNonEmpty([
      EXTERNAL_AI_CONFIDENCE_LABELS[textValue(layer.confidence?.level)] || layer.confidence?.level,
      asNumber(layer.confidence?.score) !== null ? `${Math.round(layer.confidence.score)}/100` : null,
    ], ' ');
    if (confidenceText) setLeafText('ext-ai-prov-confidence', confidenceText);
  } catch (error) {
    console.error('[renderMacroOverview] renderExternalAiAuxiliary failed:', error);
  }
}

function renderExecutionRiskDetail({ radarData }) {
  try {
    if (!radarData) return;
    const decision = radarData.decisionModel || {};
    const guidance = decision.positionGuidance || {};
    const trading = radarData.tradingSystem || {};
    const lock = trading.executionLock || {};
    const triggerPanel = radarData.triggerPanel || {};
    const triggerMonitor = decision.triggerMonitor || {};
    const warning = radarData.warningSystem || {};
    const positioning = trading.positioning || {};
    const riskControl = trading.riskControl || {};
    const discipline = trading.discipline || {};

    const strategyStateZh = ({ Defensive: '防守(Defensive)', Caution: '谨慎(Caution)', Crisis: '危机(Crisis)', Neutral: '中性(Neutral)', Balanced: '均衡(Balanced)', Offensive: '进攻(Offensive)' })[decision.strategyState] || decision.strategyState;
    const stateText = joinNonEmpty([strategyStateZh, decision.stateLabel]);
    if (stateText) setLeafText('exec-decision-state', stateText);
    if (asNumber(decision.stateScore) !== null) setLeafText('exec-decision-score', Math.round(decision.stateScore));
    if (textValue(decision.stateReason)) setLeafText('exec-decision-reason', decision.stateReason);
    const structural = Array.isArray(decision.structuralSignals) ? decision.structuralSignals[0] : null;
    const structuralText = structural ? joinNonEmpty([structural.label, structural.detail]) : null;
    if (structuralText) setLeafText('exec-structural-signal', structuralText);
    if (asNumber(decision.structuralScoreBump) !== null) setLeafText('exec-structural-bump', `+${Math.round(decision.structuralScoreBump)}`);
    if (Array.isArray(decision.dominantDrivers) && decision.dominantDrivers.length > 0) {
      const drivers = decision.dominantDrivers
        .map((driver) => {
          const label = textValue(driver.labelZh) || textValue(driver.key);
          return label && asNumber(driver.score) !== null ? `${label} (${Math.round(driver.score)})` : null;
        })
        .filter(Boolean);
      if (drivers.length > 0) setLeafText('exec-dominant-drivers', drivers.join(' / '));
    }
    if (textValue(guidance.totalExposureBand)) setLeafText('exec-exposure-band', guidance.totalExposureBand);
    if (textValue(guidance.riskBudget)) setLeafText('exec-risk-budget', guidance.riskBudget);
    if (textValue(guidance.targetGrossExposure)) setLeafText('exec-target-gross', guidance.targetGrossExposure);
    if (textValue(guidance.cashBufferTarget)) setLeafText('exec-cash-target', guidance.cashBufferTarget);
    if (textValue(guidance.riskAssetBias)) setLeafText('exec-risk-asset-bias', guidance.riskAssetBias);
    if (asNumber(guidance.structuralBandShift) !== null) setLeafText('exec-band-shift', `${Math.round(guidance.structuralBandShift)}`);

    updateToneClass('exec-lock-card', ['red', 'yellow', 'green'], lock.level);
    if (textValue(lock.tag)) setLeafText('exec-lock-kicker', `EXECUTION LOCK · ${lock.tag}`);
    if (textValue(lock.levelLabel)) setLeafText('exec-lock-state', lock.levelLabel);
    if (textValue(lock.title)) setLeafText('exec-lock-title', lock.title);
    if (textValue(lock.description)) setLeafText('exec-lock-desc', lock.description);
    setListItems('exec-lock-allow', lock.allow, 3);
    setListItems('exec-lock-block', lock.block, 3);
    setListItems('exec-lock-mandatory', lock.mandatory, 3);

    setListItems('exec-trigger-critical', triggerPanel.critical, 3);
    if (Array.isArray(triggerMonitor.upgradeTriggers) && triggerMonitor.upgradeTriggers.length >= 5) {
      if (textValue(triggerMonitor.upgradeTriggers[3])) setLeafText('exec-trigger-critical-4', triggerMonitor.upgradeTriggers[3]);
      if (textValue(triggerMonitor.upgradeTriggers[4])) setLeafText('exec-trigger-critical-5', triggerMonitor.upgradeTriggers[4]);
    }
    setListItems('exec-trigger-driver', triggerPanel.drivers, 3);
    setListItems('exec-trigger-watch', triggerPanel.watchlist, 3);

    const warningSummary = joinNonEmpty([
      warning.status,
      asNumber(warning.criticalCount) !== null ? `critical ${Math.round(warning.criticalCount)}` : null,
      asNumber(warning.warningCount) !== null ? `warning ${Math.round(warning.warningCount)}` : null,
      asNumber(warning.watchCount) !== null ? `watch ${Math.round(warning.watchCount)}` : null,
    ], ' / ');
    if (warningSummary) setLeafText('exec-warning-summary', `系统按 5 条规则自动触发预警等级: ${warningSummary}`);
    setListItems('exec-warning-rule', warning.rules, 5);

    setAllocationRow('usd', allocationByTarget(positioning, '核心1'));
    setAllocationRow('cash', allocationByTarget(positioning, '缓冲层'));
    setAllocationRow('gold', allocationByTarget(positioning, '对冲'));
    setAllocationRow('energy', allocationByTarget(positioning, '防守受益'));
    setAllocationRow('equity', allocationByTarget(positioning, '观察仓'));

    if (textValue(positioning.regime)) setLeafText('exec-position-regime', positioning.regime);
    if (textValue(riskControl.maxDrawdown)) setLeafText('exec-risk-max-drawdown', riskControl.maxDrawdown);
    if (textValue(riskControl.singleAssetMax)) setLeafText('exec-risk-single-asset-max', riskControl.singleAssetMax);
    if (textValue(riskControl.systemState)) setLeafText('exec-risk-system-state', riskControl.systemState);
    setListItems('exec-hard-threshold', riskControl.hardThresholds, 6);
    setListItems('exec-reset-threshold', riskControl.resetThresholds, 4);

    if (textValue(discipline.tag)) setLeafText('exec-discipline-tag', discipline.tag);
    setListItems('exec-entry-condition', discipline.entryConditions, 3);
    setListItems('exec-prohibited', discipline.prohibitedBehaviors, 3);
    setListItems('exec-mandatory-rule', discipline.mandatoryRules, 3);
  } catch (error) {
    console.error('[renderMacroOverview] renderExecutionRiskDetail failed:', error);
  }
}

// ---------- 主入口 ----------

export function renderMacroOverview({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData }) {
  observationReactionContext.worldOrderStressData = worldOrderStressData || null;

  // Stage 4b-1A: Hero + threshold + pressure-sources
  renderHero({ radarData, worldOrderStressData, marketPricingMetricsData, oilDirectionalData });
  renderThresholdBlock({ radarData, worldOrderStressData });
  renderPressureSources({ radarData });

  // Stage 4b-1B: market-temperature + risk-engines + wow-section
  renderMarketTemperature({ marketPricingMetricsData });
  renderRiskEngines({ radarData });
  renderWowSection({ radarData, worldOrderStressData });

  // Stage 4b-2: trend SVG + signal-layers + macro-drivers + cross-validation
  renderTrendSvg({ radarData, radarHistoryData, worldOrderStressData });
  renderSignalLayers({ radarData, worldOrderStressData, marketPricingMetricsData });
  renderMacroDriversPillars({ radarData });
  renderCrossValidation({ radarData, worldOrderStressData, marketPricingMetricsData });
  renderMacroCoherence({ radarData, worldOrderStressData, marketPricingMetricsData });

  // Stage 5a: heatmap + C7 market sentiment + C8 geopolitics/world-order
  renderHeatmap({ radarData });
  renderC7MarketSentiment({ radarData, marketPricingMetricsData });
  renderC8Geopolitical({ radarData, worldOrderStressData });

  // Stage 5b: C1 inflation/energy + C2 global liquidity
  renderC1InflationEnergy({ radarData });
  renderShippingFreight({ radarData });
  renderTransportShockConfirmation({ radarData });
  renderC2GlobalLiquidity({ radarData });

  // Stage 5c: C3 credit/corporate + C4 US economic temperature + C5 world economy
  renderC3CreditCorporate({ radarData });
  renderC4UsEconomyTemperature({ radarData });
  renderC5WorldEconomy({ radarData });
  renderC6ChinaEquity({ radarData });

  // Stage 5d-1: detail-data + world-order-stress appendix narratives
  renderDetailData({ radarData });
  renderWorldOrderStress({ worldOrderStressData });

  // Stage 5d-2: external-ai + execution-risk appendix narratives
  renderExternalAiAuxiliary({ radarData });
  renderExecutionRiskDetail({ radarData });

  console.log('[renderMacroOverview] Stage 5d-2 renders complete (all Stage 5 frontend binding complete)');
}

export function __testObservationReaction(radarData, signal, worldOrderStressData = null) {
  return observationReaction(radarData, signal, worldOrderStressData);
}

export function __testSignalFromGoldPrice(gold) {
  return signalFromGoldPrice(gold);
}
