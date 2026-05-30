// scripts/modules/renderMacroOverview.js
// M-94 V0 路径 C · Stage 4b-1A
// 职责:render macro-overview-shell 内 3 个 block(Hero + threshold + pressure-sources)
// 后续 Stage 4b-1B / 4b-2 扩展(market-temp / risk-engines / wow / trend SVG / signal-layers / macro-drivers / cross-validation)

import {
  $,
  fmtSigned,
  fmtNumSafe,
  fmtDeltaSafe,
} from './config.js?v=stage-15-omo-eastmoney-1';

// ---------- 阈值 + 派生 helper ----------

// 6 pressure module tone 阈值(red >= 70 / yellow 50-69 / green < 50)
function moduleTone(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 70) return 'red';
  if (score >= 50) return 'yellow';
  return 'green';
}

// trend 派生箭头(>2 ↑ / <-2 ↓ / 中间 →)
function trendArrow(trend) {
  if (!Number.isFinite(trend)) return '→';
  if (trend > 2) return '↑';
  if (trend < -2) return '↓';
  return '→';
}

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

function renderHero({ radarData, worldOrderStressData }) {
  try {
    if (!radarData) {
      console.warn('[renderMacroOverview] renderHero: radarData missing, skip');
      return;
    }

    // big-left .value (顶层 score)
    if (Number.isFinite(radarData.score)) {
      const valueEl = $('hero-score-value');
      if (valueEl) {
        valueEl.innerHTML = `${radarData.score}<sup>/100</sup>`;
      }
    }

    // big-left .breakdown — 派生 X 红 / Y 黄 / Z 绿
    const breakdown = deriveModuleBreakdown(radarData.modules);
    if (breakdown) {
      const breakdownEl = $('hero-breakdown-counts');
      if (breakdownEl) {
        breakdownEl.innerHTML = `<strong>${breakdown.red} 红 / ${breakdown.yellow} 黄 / ${breakdown.green} 绿</strong>`;
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

    // big-right h2 — oneLineConclusion
    const h2El = $('hero-verdict-headline');
    if (h2El && radarData.dailyBrief?.oneLineConclusion) {
      h2El.textContent = radarData.dailyBrief.oneLineConclusion;
    }

    // big-right p — verdict body (用 dailyBrief.plainSummary 或 fallback)
    // Stage 4b-1A 不动 verdict body 文本(没有合适字段映射,留给 Stage 4b-2 用 aiInterpretationLayer.summaryZh 派生)

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
      nowEl.textContent = `原始 ${radarData.score}(高风险预警) · overlay ${Number.isFinite(woScore) ? woScore : '—'}(${woLabel})`;
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
        labelSpan.textContent = `overlay ${worldOrderStressData.score}`;
      }
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderThresholdBlock failed:', error);
  }
}

// ---------- Block 3: Pressure Sources (6 mini-card) ----------

const PRESSURE_MODULES = [
  { key: 'energy', cardId: 'pressure-card-energy', label: 'Energy 能源', activeText: '能源传导主线' },
  { key: 'geopolitical', cardId: 'pressure-card-geopolitical', label: 'Geopolitical 地缘', activeText: 'multi_theater' },
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
        `QQQ 当前价格距 60 周均值 ${qqqZ.toFixed(2)} 个标准差，处于历史第二极端区间。NDX ${signedFixed(ndxZ, 2)}σ / IXIC ${signedFixed(ixicZ, 2)}σ，整个美国成长股板块同步极端。`
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
      setMiniCardState('engine-card-b6', geopoliticalTone, geopoliticalTone === 'green' ? '地缘降温' : 'multi_theater');
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
      setLeafText('wow-item-1-text', `Brent crack spread 走阔到 ${crackSpread.toFixed(2)},4w 变化 ${signedFixed(crackSpread4wChange, 2)}。`);
      setLeafText('wow-item-1-source', `炼油价差 4 周变化 ${signedFixed(crackSpread4wChange, 2)}`);
    }
    const hyOas = asNumber(radarData.macroDrivers?.credit?.hyOas);
    if (hyOas !== null) {
      setLeafText('wow-item-2-text', `HY OAS 在 ${hyOas.toFixed(2)}% 低位,与 VIX 同步走低。信用市场不验证恐慌。`);
      setLeafText('wow-item-2-source', '信用与波动率反向证据');
    }
    const woState = worldOrderStressData?.state;
    const woLabel = worldOrderStressData?.labelZh;
    if (woState) {
      setLeafText('wow-item-3-text', `World Order overlay 当前为 ${woState}${woLabel ? `(${woLabel})` : ''},结构性压力持续。`);
      setLeafText('wow-item-3-source', '世界秩序状态变化');
    }
    const futureMinusTargetMid = asNumber(radarData.macroDrivers?.policyExpectations?.futureMinusTargetMid);
    if (futureMinusTargetMid !== null) {
      const bp = futureMinusTargetMid * 100;
      setLeafText('wow-item-4-text', `Fed 政策路径分歧 ${signedFixed(bp, 1)}bp,市场定价与目标中位仍有偏差。`);
      setLeafText('wow-item-4-source', 'Fed 政策路径分歧');
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
      const scoreText = Number.isFinite(consumerCheck.score) ? `score ${consumerCheck.score}` : 'score —';
      const statusText = consumerCheck.status ? `(${consumerCheck.status})` : '';
      setLeafText('wow-item-6-text', `消费与资产价格背离 ${scoreText}${statusText}。`);
      setLeafText('wow-item-6-source', '消费与资产价格背离');
    }
  } catch (error) {
    console.error('[renderMacroOverview] renderWowSection failed:', error);
  }
}

// ---------- Stage 4b-2 shared helpers ----------

const TREND_X = [80, 177.14, 274.29, 371.43, 468.57, 565.71, 662.86, 760];

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
  return clamp(200 * (1 - n / 100), 0, 200);
}

function pointPair(x, y) {
  return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
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
  const observedAt = textValue(wo?.observedAt);
  const observedAtMs = parseObservedAtMs(observedAt);
  if (score === null || !observedAt || observedAtMs === null) {
    return {
      date: historyItem?.date || null,
      valid: false
    };
  }
  return {
    date: historyItem?.date || null,
    valid: true,
    score,
    state: textValue(wo?.state),
    labelZh: textValue(wo?.labelZh),
    observedAt,
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
  if (analysis.fullFallback || overlayWeekly.length !== TREND_X.length) {
    return {
      mode: 'fallback',
      points: TREND_X.map((x) => pointPair(x, fallbackY)),
      lastY: fallbackY
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
    return pointPair(TREND_X[index], lastY);
  });

  return {
    mode: analysis.staleTail ? 'stale-tail' : 'history',
    points,
    lastY
  };
}

function overlayStatusSuffix(mode) {
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
    const detail = mode === 'stale-tail' && analysis.latestObservedAtAgeDays !== null
      ? `latest observedAt age ${analysis.latestObservedAtAgeDays.toFixed(1)} days`
      : `${analysis.validWoPoints} valid points, ${analysis.uniqueObservedAt} unique observedAt`;
    overlayLine.setAttribute('aria-label', `World Order overlay trend ${mode}; ${detail}`);
  }
}

function latestQqqZ(marketPricingMetricsData) {
  const qqq = latestRecord(marketPricingMetricsData?.assets?.qqq?.records);
  return asNumber(qqq?.zScore);
}

function formatStatus(score, isActive) {
  return `score ${score} · ${isActive ? 'ACTIVE' : 'LATENT'}`;
}

function setNarrative(index, item) {
  const root = $(`narrative-${index}`);
  if (root) root.classList.toggle('active', item.isActive);
  setLeafText(`narrative-${index}-name`, item.name);
  setLeafText(`narrative-${index}-score`, formatStatus(item.score, item.isActive));
  setLeafText(`narrative-${index}-desc`, item.description);
}

function deriveNarratives({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  const energy = asNumber(radarData?.modules?.energy);
  const inflation = asNumber(radarData?.modules?.inflation);
  const liquidity = asNumber(radarData?.modules?.liquidity);
  const brent = asNumber(radarData?.displayInputsBaseline?.brent ?? radarData?.__effectiveDisplayInputs?.brent ?? radarData?.brentPricingLayer?.selectedBrent?.value);
  const crackSpread = asNumber(radarData?.brentPricingLayer?.crackSpread);
  const sentiment = asNumber(radarData?.macroDrivers?.consumer?.umichSentiment);
  const ismPmi = asNumber(radarData?.macroDrivers?.consumer?.ismManufacturingPmi);
  const woScore = asNumber(worldOrderStressData?.score);
  const woState = worldOrderStressData?.state || 'unknown';
  const woLabel = worldOrderStressData?.labelZh || '';
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
      name: '⚡ energy_shock 能源冲击',
      score: n1Score,
      isActive: n1Active,
      description: n1Active
        ? `Brent ${(brent ?? 0).toFixed(2)} + crack spread 走阔到 ${(crackSpread ?? 0).toFixed(2)},2022 模式重演。下一节是是否传导至 CPI / breakeven。`
        : `Brent ${(brent ?? 0).toFixed(2)} + crack spread ${(crackSpread ?? 0).toFixed(2)},暂未触发能源传导主线条件。`,
    },
    {
      shortName: '滞胀压力',
      name: '⚖️ stagflation_pressure 滞胀压力',
      score: n2Score,
      isActive: n2Active,
      description: n2Active
        ? `ISM PMI ${(ismPmi ?? 0).toFixed(1)} ${(ismPmi ?? 0) < 50 ? '收缩' : '扩张'} + 能源涨价 + 实际工资压制。三件套均已出现,但信用未验证。`
        : `ISM PMI ${(ismPmi ?? 0).toFixed(1)} ${(ismPmi ?? 0) < 50 ? '收缩' : '扩张'} + 能源涨价。三件套尚未集结,观察中。`,
    },
    {
      shortName: '世界秩序压力穿越',
      name: '🌐 world_order_pressure_crossing 世界秩序压力穿越',
      score: n3Score,
      isActive: n3Active,
      description: n3Active
        ? `${woState}${woLabel ? `(${woLabel})` : ''} 持续,触发橙色升档指针。OFAC + GDELT 双印证。`
        : `${woState}${woLabel ? `(${woLabel})` : ''} 未触发升档阈值。OFAC + GDELT 双印证。`,
    },
    {
      shortName: '风险资产错配',
      name: '📉 risk_asset_mismatch 风险资产错配',
      score: n4Score,
      isActive: n4Active,
      description: n4Active
        ? 'SPX 仍在高位但 NDX 跑赢,内部分化已达高警戒。'
        : 'SPX 仍在高位但 NDX 跑赢,内部分化未到危机程度。',
    },
    {
      shortName: '过热确认',
      name: '🔥 overheat_confirmation 过热确认',
      score: n5Score,
      isActive: n5Active,
      description: n5Active
        ? `QQQ z-score ${signedFixed(qqqZ ?? 0, 2)}σ ${(qqqZ ?? 0) > 2 ? '极度过热' : '偏热'},波动率与信用未同步,缺少印证。`
        : `QQQ z-score ${signedFixed(qqqZ ?? 0, 2)}σ ${(qqqZ ?? 0) > 2 ? '极度过热' : '偏热'},但信用 + 波动率没有验证,缺少同步证据。`,
    },
    {
      shortName: '信用利差告警',
      name: '💰 credit_spread_warning 信用利差告警',
      score: n6Score,
      isActive: n6Active,
      description: n6Active
        ? `HY OAS ${(hyOas ?? 0).toFixed(2)}% / IG OAS ${(igOas ?? 0).toFixed(2)}% / NFCI ${signedFixed(nfci ?? 0, 2)}。信用层进入边际收紧。`
        : `HY OAS ${(hyOas ?? 0).toFixed(2)}% / IG OAS ${(igOas ?? 0).toFixed(2)}% / NFCI ${signedFixed(nfci ?? 0, 2)}。压力初现但远未到告警阈值。`,
    },
    {
      shortName: '流动性收紧',
      name: '💧 liquidity_tightening 流动性收紧',
      score: n7Score,
      isActive: n7Active,
      description: n7Active
        ? `水位 / 回购 / 隔夜出现压力。${has2019Signal ? '2019-09 信号目前存在' : '2019-09 信号目前不存在'}。`
        : `水位 / 回购 / 隔夜三层均无压力。${has2019Signal ? '2019-09 信号目前存在' : '2019-09 信号目前不存在'}。`,
    },
  ];
}

// ---------- Block 4: Trend SVG ----------

function renderTrendSvg({ radarData, radarHistoryData, worldOrderStressData }) {
  try {
    const weekly = pickEightWeeklyPoints(radarHistoryData);
    if (weekly.length !== 8) return;
    const scorePoints = weekly.map((item, index) => {
      const y = trendY(item.score);
      return y === null ? null : pointPair(TREND_X[index], y);
    });
    if (scorePoints.some((p) => p === null)) return;
    const scoreLine = $('trend-line-score');
    if (scoreLine) scoreLine.setAttribute('points', scorePoints.join(' '));
    const lastY = trendY(weekly[weekly.length - 1].score);
    const scoreDot = $('trend-dot-score');
    if (scoreDot && lastY !== null) {
      scoreDot.setAttribute('cx', String(TREND_X[TREND_X.length - 1]));
      scoreDot.setAttribute('cy', Number(lastY.toFixed(2)).toString());
    }

    const overlayScore = asNumber(worldOrderStressData?.score);
    if (overlayScore === null) return;
    const overlayWeekly = pickEightWeeklyOverlay(radarHistoryData);
    const analysis = analyzeOverlayHistory(overlayWeekly);
    const overlayTrend = buildOverlayTrendPoints(overlayWeekly, overlayScore, analysis);
    if (!overlayTrend) return;
    const overlayLine = $('trend-line-overlay');
    if (overlayLine) overlayLine.setAttribute('points', overlayTrend.points.join(' '));
    const overlayDot = $('trend-dot-overlay');
    if (overlayDot) {
      overlayDot.setAttribute('cx', String(TREND_X[TREND_X.length - 1]));
      overlayDot.setAttribute('cy', Number(overlayTrend.lastY.toFixed(2)).toString());
    }
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
    const repoBp = signedFixedWithZero(asNumber(fed.bgcrSofrSpread) ?? 0, 0);
    setLeafText('pillar-1-text', `${fed.regime || '—'}。WALCL / reserveBalances ${reserveT}T / repo BGCR-SOFR ${repoBp}bp / SOFR-EFFR 锚定。ON RRP: ${fed.onRrpLevel || '—'}。`);

    const policyBp = signedFixedWithZero((asNumber(policy.futureMinusTargetMid) ?? 0) * 100, 1);
    setLeafText('pillar-2-text', `market vs 委员分歧。futureMinusTargetMid ${policyBp}bp,policy tone: ${policy.policyTone || '—'}。`);

    const curveBp = signedFixedWithZero((asNumber(curve.t10y2y) ?? 0) * 100, 0);
    setLeafText('pillar-3-text', `t10y2y ${curveBp}bp,curve.regime ${curve.regime || '—'}。${curve.steepeningAlert ? '陡峭化告警激活,通常领先衰退 6-18 月' : '未触发陡峭化告警'}。`);

    const hy = asNumber(credit.hyOas);
    const ig = asNumber(credit.igOas);
    const nfci = asNumber(credit.nfci);
    setLeafText('pillar-4-text', `HY OAS ${(hy ?? 0).toFixed(2)}% / IG OAS ${(ig ?? 0).toFixed(2)}% / NFCI ${signedFixed(nfci ?? 0, 2)} (${credit.nfciRegime || '—'}) / SLOOS ${credit.sloosRegime || '—'}。`);
  } catch (error) {
    console.error('[renderMacroOverview] renderMacroDriversPillars failed:', error);
  }
}

// ---------- Block 9: Cross Validation ----------

function renderCrossValidation({ radarData, worldOrderStressData, marketPricingMetricsData }) {
  try {
    const narratives = deriveNarratives({ radarData, worldOrderStressData, marketPricingMetricsData });
    const active = narratives.filter((item) => item.isActive);
    const checks = Array.isArray(radarData?.divergenceLayer?.checks) ? radarData.divergenceLayer.checks : [];
    const contradictionCount = checks.filter((item) => item?.status === 'stress').length;
    const insufficientCount = checks.filter((item) => item?.status === 'insufficient_data').length;
    const consistencyScore = Math.round(clamp(active.length * 12 - contradictionCount * 5 + 30, 0, 100));
    setLeafText('cv-consistency-value', String(consistencyScore));
    const fill = $('cv-bar-fill');
    if (fill) fill.style.width = `${consistencyScore}%`;
    setLeafText('cv-breakdown-counts', `${active.length} strong_confirmation / ${contradictionCount} contradiction / ${insufficientCount} insufficient_data`);

    const activeNames = active.slice(0, 3).map((item) => item.shortName).join(' + ');
    const hyOas = asNumber(radarData?.macroDrivers?.credit?.hyOas);
    const creditEvidence = hyOas !== null && hyOas < 3 ? '提供反向证据' : '不提供反向证据';
    setLeafText('cv-summary-line', `${activeNames} ${active.length >= 3 ? '同向支持' : '尚未集结'};HY OAS + VIX ${creditEvidence}。`);
  } catch (error) {
    console.error('[renderMacroOverview] renderCrossValidation failed:', error);
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

    const vix = asNumber(radarData.displayInputsBaseline?.vix ?? radarData.__effectiveDisplayInputs?.vix);
    const vixStatus = vixTone(vix);
    setToneClass('c7-vix-status', 'status-bar', vixStatus);
    setBadge('c7-vix-badge', vixStatus);
    if (vix !== null) setLeafText('c7-vix-number', vix.toFixed(2));
    setLeafText('c7-vix-aux', '12 周低位');

    const spx = asNumber(radarData.displayInputsBaseline?.spx ?? radarData.__effectiveDisplayInputs?.spx);
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

    const ndxRecord = latestMarketRecord(marketPricingMetricsData, 'ndx');
    const ndxZ = asNumber(ndxRecord?.zScore);
    if (ndxZ !== null) {
      const zText = formatSignedScore(ndxZ, 2);
      setBadge('c7-ndx-badge', 'yellow', `${zText}σ`);
      setLeafText('c7-ndx-number', zText);
      setLeafText('c7-ndx-aux', 'NDX vs 60 周均值 · 与 QQQ 同步极端');
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
    setLeafText('c8-geo-aux', `6 底层模块之一 · moduleTrends 显示 ${geoTrend}`);
    if (geoScore !== null) {
      setLeafText('c8-geo-note', `底层地缘评分 ${Math.round(geoScore)},直接进入主评分链。和 World Order overlay 不是同一回事。`);
    }

    const woScore = asNumber(worldOrderStressData?.score);
    if (woScore !== null) setLeafText('c8-wo-number', String(Math.round(woScore)));
    if (worldOrderStressData?.state || worldOrderStressData?.labelZh) {
      setLeafText('c8-wo-aux', `state: ${worldOrderStressData.state || '—'} · labelZh: ${worldOrderStressData.labelZh || '—'}`);
    }

    const econ = worldOrderStressData?.dimensions?.economicWeaponization || {};
    const econScore = asNumber(econ.score);
    const econTone = indicatorTone(econScore);
    setToneClass('c8-econ-status', 'status-bar', econTone);
    setBadge('c8-econ-badge', econTone);
    if (econScore !== null) setLeafText('c8-econ-number', String(Math.round(econScore)));
    if (econ.trend) setLeafText('c8-econ-aux', `trend: ${econ.trend} · OFAC + GDELT`);
    if (econ.trend) setLeafText('c8-econ-note', `制裁与经济武器化处于高位区间。trend: ${econ.trend}。`);

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
    const display = radarData.displayInputsBaseline || {};
    const consumer = radarData.macroDrivers?.consumer || {};

    const brent = asNumber(display.brent ?? brentLayer.selectedBrent?.value);
    const brentStatus = brentTone(brent);
    setIndicatorStatus('c1-brent-status', 'c1-brent-badge', brentStatus);
    if (brent !== null) setLeafText('c1-brent-number', brent.toFixed(2));
    if (brentLayer.mode) {
      setLeafText('c1-brent-aux', `主值 selectedBrent · status: ${brentLayer.mode}`);
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
      setLeafText('c1-crack-aux', `ULSD × 42 − Brent · crackSpread4wChange ${signedNumber(crackChange, 2)}`);
    }
    if (brentLayer.crackSpreadRegime) {
      setLeafText('c1-crack-note', `炼油利润扩张说明能源向汽油 / 柴油传导。Brent → CPI 的中间证据。regime: ${brentLayer.crackSpreadRegime}。`);
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


function renderCfetsRmbLeaf(prefix, cfetsRmb) {
  if (!cfetsRmb) return;
  const status = cfetsRmb.sourceStatus?.cfets || 'missing';
  setToneClass(`${prefix}-status`, 'status-bar', 'neutral');
  setBadge(`${prefix}-badge`, 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

  const cfets = asNumber(cfetsRmb.cfets);
  const bis = asNumber(cfetsRmb.bis);
  const sdr = asNumber(cfetsRmb.sdr);
  setLeafText(`${prefix}-number`, cfets !== null ? cfets.toFixed(2) : '—');
  const cfetsText = cfets !== null ? `CFETS ${cfets.toFixed(2)}` : 'CFETS —';
  const bisText = bis !== null ? `BIS ${bis.toFixed(2)}` : 'BIS —';
  const sdrText = sdr !== null ? `SDR ${sdr.toFixed(2)}` : 'SDR —';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText(`${prefix}-aux`, `${cfetsText} · ${bisText} · ${sdrText}${suffix}`);
}

function renderChinaBondLeaf({ radarData }) {
  const chinaBond = radarData?.macroDrivers?.chinaBond;
  if (!chinaBond) return;
  const status = chinaBond.sourceStatus?.yield10y || chinaBond.yield10y?.sourceStatus || 'missing';
  setToneClass('c6-china-10y-status', 'status-bar', 'neutral');
  setBadge('c6-china-10y-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

  const cn10y = asNumber(chinaBond.yield10y?.value);
  const us10y = asNumber(radarData?.displayInputsBaseline?.us10y);
  setLeafText('c6-china-10y-number', cn10y !== null ? cn10y.toFixed(2) : '—');
  const cnText = cn10y !== null ? `中国 10Y ${cn10y.toFixed(2)}%` : '中国 10Y —';
  const usText = us10y !== null ? `美 10Y ${us10y.toFixed(2)}%` : '美 10Y —';
  const spreadText = cn10y !== null && us10y !== null ? `差 ${formatBps(cn10y - us10y, 0)}` : '差 —';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-10y-aux', `${cnText} · ${usText} · ${spreadText}${suffix}`);
}
function renderChinaInflationLeaf({ radarData }) {
  const chinaInflation = radarData?.macroDrivers?.chinaInflation;
  if (!chinaInflation) return;
  const cpiStatus = chinaInflation.sourceStatus?.cpi || chinaInflation.cpi?.sourceStatus || 'missing';
  const ppiStatus = chinaInflation.sourceStatus?.ppi || chinaInflation.ppi?.sourceStatus || 'missing';
  const status = cpiStatus === 'live' || ppiStatus === 'live' ? 'live' : (cpiStatus === 'fallback' || ppiStatus === 'fallback' ? 'fallback' : 'missing');
  setToneClass('c6-china-infl-status', 'status-bar', 'neutral');
  setBadge('c6-china-infl-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

  const cpi = asNumber(chinaInflation.cpi?.yoy);
  const ppi = asNumber(chinaInflation.ppi?.yoy);
  setLeafText('c6-china-infl-number', cpi !== null ? (cpi * 100).toFixed(1) : '—');
  const cpiText = cpi !== null ? `CPI ${signedFixed(cpi * 100, 1)}% YoY` : 'CPI —';
  const ppiText = ppi !== null ? `PPI ${signedFixed(ppi * 100, 1)}% YoY` : 'PPI —';
  const refMonth = chinaInflation.cpi?.refMonth || chinaInflation.ppi?.refMonth || '—';
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-infl-aux', `${cpiText} · ${ppiText} · ${refMonth}${suffix}`);
}

function renderChinaPmiLeaf({ radarData }) {
  const chinaPmi = radarData?.macroDrivers?.chinaPmi;
  if (!chinaPmi) return;
  const status = chinaPmi.sourceStatus?.pmi || chinaPmi.pmi?.sourceStatus || 'missing';
  setToneClass('c6-china-pmi-status', 'status-bar', 'neutral');
  setBadge('c6-china-pmi-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

  const pmi = asNumber(chinaPmi.pmi?.value);
  setLeafText('c6-china-pmi-number', pmi !== null ? pmi.toFixed(1) : '—');
  const refMonth = chinaPmi.pmi?.refMonth || '—';
  const expansion = pmi === null ? '—' : (pmi >= 50 ? '扩张' : '收缩');
  const suffix = status === 'fallback' ? ' · 回退' : '';
  setLeafText('c6-china-pmi-aux', `${refMonth} · ${expansion}${suffix}`);
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
  setToneClass('c6-tsf-status', 'status-bar', 'neutral');
  setBadge('c6-tsf-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : status === 'missing' ? 'OBS·缺失' : 'OBS');

  const stockYoY = asNumber(tsf.stockYoY);
  const ytdIncrementYi = asNumber(tsf.ytdIncrementYi);
  const label = tsf.incrementPeriodLabel || '年内';
  const refMonth = tsf.refMonth || '—';
  const suffix = status === 'fallback' ? ' · 回退' : status === 'missing' ? ' · 待源恢复' : '';
  setLeafText('c6-tsf-number', stockYoY !== null ? (stockYoY * 100).toFixed(1) : '—');
  setLeafText('c6-tsf-unit', stockYoY !== null ? '% YoY' : '');
  setLeafText('c6-tsf-aux', `${label}增量 ${formatChinaTsfIncrementYi(ytdIncrementYi)} · ${refMonth}${suffix}`);
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
  setToneClass('c6-mlf-status', 'status-bar', 'neutral');
  setBadge('c6-mlf-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : status === 'missing' ? 'OBS·缺失' : 'OBS');

  const operationAmountYi = asNumber(mlf.operationAmountYi);
  const termText = formatChinaMlfTerm(mlf.termMonths);
  const opDate = mlf.opDate || '—';
  const rate = asNumber(mlf.mlfRate);
  const rateText = rate !== null ? `中标利率 ${(rate * 100).toFixed(2)}%` : '利率未披露';
  const suffix = status === 'fallback' ? ' · 回退' : status === 'missing' ? ' · 待源恢复' : '';
  setLeafText('c6-mlf-number', formatChinaMlfAmount(operationAmountYi));
  setLeafText('c6-mlf-unit', operationAmountYi !== null ? '亿元' : '');
  setLeafText('c6-mlf-aux', `${termText} · ${opDate} · ${rateText}${suffix}`);
}
function renderChinaOmoLeaf({ radarData }) {
  const omo = radarData?.macroDrivers?.chinaOmo;
  if (!omo) return;
  const status = omo.sourceStatus || 'missing';
  setToneClass('c6-omo-status', 'status-bar', 'neutral');
  setBadge('c6-omo-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : status === 'missing' ? 'OBS·缺失' : 'OBS');

  const opDate = omo.opDate || '—';
  if (omo.operationType === '无操作') {
    setLeafText('c6-omo-number', '—');
    setLeafText('c6-omo-unit', '今日无操作');
    const suffix = status === 'fallback' ? ' · 回退' : '';
    setLeafText('c6-omo-aux', `今日无操作 · ${opDate}${suffix}`);
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
  setLeafText('c6-omo-aux', `${termText} · ${amountText} · ${opDate} · ${announcementNo}${suffix}`);
}
function renderChinaPropertyLeaf({ radarData }) {
  const property = radarData?.macroDrivers?.chinaPropertyPrice;
  if (!property) {
    renderChinaPropertyTierBreakdown(null);
    return;
  }
  const status = property.sourceStatus || 'missing';
  setToneClass('c6-house-status', 'status-bar', 'neutral');
  setBadge('c6-house-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : status === 'missing' ? 'OBS·缺失' : 'OBS');

  const newUp = asNumber(property.newCitiesUp);
  const newFlat = asNumber(property.newCitiesFlat);
  const resaleUp = asNumber(property.resaleCitiesUp);
  setLeafText('c6-house-number', newUp !== null ? `${Math.round(newUp)}/70` : '—');
  setLeafText('c6-house-unit', '新房上涨');

  const auxParts = [];
  auxParts.push(`二手上涨 ${resaleUp !== null ? `${Math.round(resaleUp)}/70` : '—'}`);
  auxParts.push(`新房持平 ${newFlat !== null ? `${Math.round(newFlat)} 城` : '—'}`);
  auxParts.push(property.refMonth || '—');
  if (status === 'fallback') auxParts.push('回退');
  if (status === 'missing') auxParts.push('待源恢复');
  setLeafText('c6-house-aux', auxParts.join(' · '));
  renderChinaPropertyTierBreakdown(property);
}
function renderC2GlobalLiquidity({ radarData }) {
  try {
    if (!radarData) return;
    const display = radarData.displayInputsBaseline || {};
    const curve = radarData.macroDrivers?.curve || {};
    const fed = radarData.macroDrivers?.fedLiquidity || {};
    const policy = radarData.macroDrivers?.policyExpectations || {};

    const dxy = asNumber(display.dxy);
    if (dxy !== null) setLeafText('c2-dxy-number', dxy.toFixed(2));
    const dxy12wHigh = radarData.historyWindowFields?.dxy12wHigh;
    const dxyHighValue = asNumber(dxy12wHigh?.value);
    if (dxy12wHigh?.windowStatus === 'ready' && dxyHighValue !== null) {
      setLeafText('c2-dxy-aux', `12周高位 ${dxyHighValue.toFixed(2)}`);
    } else if (dxyHighValue !== null) {
      setLeafText('c2-dxy-aux', `当前可用窗口高位 ${dxyHighValue.toFixed(2)} · ${formatWindowProgress(dxy12wHigh)}`);
    } else if (dxy12wHigh) {
      setLeafText('c2-dxy-aux', `12周高位 ${formatWindowProgress(dxy12wHigh)}`);
    }

    const gold = asNumber(display.gold);
    if (gold !== null) setLeafText('c2-gold-number', gold.toFixed(2));

    const us10y = asNumber(display.us10y);
    const us10yStatus = us10yTone(us10y);
    setIndicatorStatus('c2-us10y-status', 'c2-us10y-badge', us10yStatus);
    if (us10y !== null) setLeafText('c2-us10y-number', us10y.toFixed(2));
    const t10y2y = asNumber(curve.t10y2y);
    const t10y2yWeekChange = asNumber(curve.t10y2yWeekChange);
    if (t10y2y !== null && curve.regime) {
      setLeafText('c2-us10y-aux', `10Y · 2s10s spread ${formatBps(t10y2y, 0)} · ${curve.regime}`);
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
    if (fed.regime) setLeafText('c2-liquidity-aux', `银行准备金 reserveBalances · regime: ${fed.regime}`);
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
      setToneClass('c2-cuau-status', 'status-bar', 'neutral');
      setBadge('c2-cuau-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

      const ratio = asNumber(cg.ratio);
      setLeafText('c2-cuau-number', ratio !== null ? (ratio * 1000).toFixed(3) : '—');

      const cu = asNumber(cg.copper?.price);
      const au = asNumber(cg.gold?.price);
      const rc = asNumber(cg.ratioChangePct);
      const cuText = cu !== null ? `铜 $${cu.toFixed(2)}/lb` : '铜 —';
      const auText = au !== null ? `金 $${au.toFixed(0)}/oz` : '金 —';
      const rcText = rc !== null ? `近5日 ${signedFixed(rc * 100, 2)}%` : '近5日 —';
      const suffix = status === 'fallback' ? ' · 回退' : '';
      setLeafText('c2-cuau-aux', `${cuText} · ${auText} · ${rcText}${suffix}`);
    }

    renderCfetsRmbLeaf('c2-cfets', radarData.macroDrivers?.cfetsRmb);
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
    const display = radarData.displayInputsBaseline || {};
    const credit = radarData.macroDrivers?.credit || {};
    const privateCredit = radarData.macroDrivers?.privateCreditProxy || {};
    const cre = radarData.macroDrivers?.commercialRealEstate || {};

    const hyOas = asNumber(display.hyOas ?? credit.hyOas);
    const hyTone = creditHyTone(hyOas);
    setIndicatorStatus('c3-hy-status', 'c3-hy-badge', hyTone);
    const hyOasWoW = radarData.historyWindowFields?.hyOasWoW;
    if (hyOas !== null) {
      setLeafText('c3-hy-number', hyOas.toFixed(2));
      const changeBp = asNumber(hyOasWoW?.changeBp);
      const changePct = signedPercentFromDecimal(hyOasWoW?.changePct, 1);
      if (hyOasWoW?.windowStatus === 'ready' && changeBp !== null && changePct) {
        setLeafText('c3-hy-aux', `HY OAS ${hyOas.toFixed(2)}% · WoW ${formatSignedBpValue(changeBp, 0)} / ${changePct}`);
      } else if (hyOasWoW) {
        setLeafText('c3-hy-aux', `HY OAS ${hyOas.toFixed(2)}% · WoW ${formatWindowProgress(hyOasWoW)}`);
      } else {
        setLeafText('c3-hy-aux', `HY OAS ${hyOas.toFixed(2)}% · WoW 字段未接入`);
      }
    }

    const igOas = asNumber(credit.igOas);
    const igTone = creditIgTone(igOas);
    setIndicatorStatus('c3-ig-status', 'c3-ig-badge', igTone);
    if (igOas !== null) setLeafText('c3-ig-number', igOas.toFixed(2));
    const igChange = asNumber(credit.igOas1dChange);
    const igHyRatio = asNumber(credit.igHyRatio);
    if (igChange !== null && igHyRatio !== null) {
      setLeafText('c3-ig-aux', `igOas1dChange ${formatBps(igChange, 0)} · igHyRatio ${igHyRatio.toFixed(2)}`);
    }

    const nfciTone = nfciToneFromRegime(credit.nfciRegime);
    setIndicatorStatus('c3-nfci-status', 'c3-nfci-badge', nfciTone);
    const nfci = asNumber(credit.nfci);
    if (nfci !== null) setLeafText('c3-nfci-number', nfci.toFixed(3));
    const nfciChange = asNumber(credit.nfci4wChange);
    if (nfciChange !== null && credit.nfciRegime) {
      setLeafText('c3-nfci-aux', `nfci4wChange ${signedNumber(nfciChange, 3)} · regime: ${credit.nfciRegime}`);
    }
    if (nfci !== null && credit.nfciRegime) {
      setLeafText('c3-nfci-note', `NFCI 汇总 100+ 跨市场信号(信用 / 流动性 / 杠杆)。方向反转：正值=收紧。当前 ${nfci.toFixed(3)},${credit.nfciRegime}。`);
    }

    const privateTone = privateCreditToneFromRegime(privateCredit.privateCreditProxyRegime);
    setIndicatorStatus('c3-private-status', 'c3-private-badge', privateTone);
    const intervalNav = asNumber(privateCredit.intervalFundNavPrice);
    if (intervalNav !== null) setLeafText('c3-private-number', intervalNav.toFixed(2));
    const privateStressZ = radarData.historyWindowFields?.privateCreditStressZScore;
    const privateStressHeadline = asNumber(privateStressZ?.headline);
    if (privateStressZ?.windowStatus === 'ready' && privateStressHeadline !== null) {
      setLeafText('c3-private-aux', `6-proxy stress z ${formatSignedScore(privateStressHeadline, 2, 'σ')}`);
    } else if (privateStressZ) {
      setLeafText('c3-private-aux', `6-proxy z-score ${formatWindowProgress(privateStressZ)}`);
    } else {
      const intervalChange = signedPercentFromDecimal(privateCredit.intervalFundNav4wChange, 1);
      if (privateCredit.intervalFundNavSymbol && intervalChange) {
        setLeafText('c3-private-aux', `${privateCredit.intervalFundNavSymbol} intervalFundNav · 4w ${intervalChange}`);
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
      setLeafText('c3-cre-aux', `creDelinquencyRate · QoQ ${formatBps(delinquencyChange, 0)} · regime: ${cre.creStressRegime}`);
    }
    if (delinquency !== null) setLeafText('c3-cre-delinquency', `creDelinquencyRate ${delinquency.toFixed(2)}%`);
    if (asNumber(cre.creChargeOffRate) !== null) setLeafText('c3-cre-chargeoff', `creChargeOffRate ${cre.creChargeOffRate.toFixed(2)}%`);
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
      setLeafText('c4-employment-aux', `initialClaims · 4w average ${formatK(claimsAvg)}k · 4w change ${claimsChange}`);
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
      setLeafText('c4-consumer-aux', `cartsNominal · real ${realYoy} YoY`);
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

function renderEuroVolatilityLeaf({ radarData }) {
  const euroVolatility = radarData?.macroDrivers?.euroVolatility;
  const value = asNumber(euroVolatility?.value);
  const changePct = asNumber(euroVolatility?.changePct);
  const vix = asNumber(radarData?.displayInputsBaseline?.vix);
  const status = euroVolatility?.sourceStatus || 'missing';

  setToneClass('c5-v2x-status', 'status-bar', 'neutral');
  setBadge('c5-v2x-badge', 'neutral', status === 'fallback' ? 'OBS·回退' : status === 'missing' ? 'OBS·缺失' : 'OBS');
  setLeafText('c5-v2x-number', value !== null ? value.toFixed(1) : '—');

  const auxParts = [];
  if (typeof euroVolatility?.refDate === 'string' && euroVolatility.refDate.trim()) {
    auxParts.push(euroVolatility.refDate);
  }
  if (changePct !== null) {
    auxParts.push(`1日 ${signedFixed(changePct * 100, 1)}%`);
  }
  if (value !== null && vix !== null) {
    auxParts.push(`vs 美VIX ${signedFixed(value - vix, 1)}`);
  }
  if (status === 'fallback') auxParts.push('回退');
  if (status === 'missing' && auxParts.length === 0) auxParts.push('待源恢复');
  setLeafText('c5-v2x-aux', auxParts.join(' · ') || '—');
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
      { key: 'dax', prefix: 'c5-dax' }
    ];

    cards.forEach(({ key, prefix }) => {
      const item = worldEconomy[key];
      const price = asNumber(item?.price);
      const changePct = asNumber(item?.changePct);
      const status = item?.sourceStatus || worldEconomy.sourceStatus?.[key] || 'missing';

      setToneClass(`${prefix}-status`, 'status-bar', 'neutral');
      setBadge(`${prefix}-badge`, 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

      if (price !== null) {
        setLeafText(`${prefix}-number`, price.toFixed(0));
      } else {
        setLeafText(`${prefix}-number`, '—');
      }

      if (changePct !== null) {
        const pctText = signedFixed(changePct * 100, 2);
        const suffix = status === 'fallback' ? ' · 回退' : '';
        setLeafText(`${prefix}-aux`, `近5日 ${pctText}%${suffix}`);
      } else {
        setLeafText(`${prefix}-aux`, status === 'fallback' ? '近5日 — · 回退' : '近5日 —');
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
    renderCfetsRmbLeaf('c6-cfets', radarData.macroDrivers?.cfetsRmb);
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

      setToneClass(`${prefix}-status`, 'status-bar', 'neutral');
      setBadge(`${prefix}-badge`, 'neutral', status === 'fallback' ? 'OBS·回退' : 'OBS');

      if (price !== null) {
        setLeafText(`${prefix}-number`, price.toFixed(0));
      } else {
        setLeafText(`${prefix}-number`, '—');
      }

      if (changePct !== null) {
        const pctText = signedFixed(changePct * 100, 2);
        const suffix = status === 'fallback' ? ' · 回退' : '';
        setLeafText(`${prefix}-aux`, `近5日 ${pctText}%${suffix}`);
      } else {
        setLeafText(`${prefix}-aux`, status === 'fallback' ? '近5日 — · 回退' : '近5日 —');
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
      setLeafText('detail-health-score', `healthScore ${Math.round(realtime.healthScore)}/100`);
    }
    if (realtime.sourceMode) setLeafText('detail-health-source-mode', `实时输入 ${realtime.sourceMode}`);
    const runAt = formatUtcMinute(realtime.capturedAt || realtime.updatedAt);
    if (runAt) setLeafText('detail-health-run-at', runAt);
    if (structuralSignals.length > 0) {
      const first = structuralSignals[0];
      setLeafText('detail-health-structural-signal', `${first.key || 'structuralSignal'} · ${first.detail || first.label || ''}`.trim());
    }

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
      '油价→通胀': 'detail-time-path-oil-inflation',
      '通胀→利率': 'detail-time-path-inflation-rate',
      '利率→股票': 'detail-time-path-rate-equity',
      '美元→信用': 'detail-time-path-dollar-credit',
      '流动性→估值': 'detail-time-path-liquidity-valuation',
    };
    for (const [label, id] of Object.entries(pathMap)) {
      const entry = findByField(pathChanges, 'label', label);
      const text = pathChangeText(entry);
      if (text) setLeafText(id, text);
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
          setLeafText(id, `score ${Math.round(node.score)} · ${node.state}`);
        } else {
          setLeafText(id, `score ${Math.round(node.score)}`);
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
    if (wo.labelZh || wo.state) setLeafText('wo-detail-state', `${wo.labelZh || '—'} · ${wo.state || '—'}`);
    const confidence = confidenceLabel(wo.confidence);
    if (confidence) setLeafText('wo-detail-confidence', confidence);
    const marketInput = wo.marketConfirmationInput || {};
    if (marketInput.source || asNumber(marketInput.healthScore) !== null) {
      const health = asNumber(marketInput.healthScore) !== null ? `health ${Math.round(marketInput.healthScore)}/100` : 'health —';
      setLeafText('wo-detail-market-confirmation', `${marketInput.source || 'unknown-source'} · ${health}`);
    }
    const modifier = wo.decisionModifier || {};
    if (modifier.riskBias || asNumber(modifier.maxStateBoost) !== null) {
      setLeafText('wo-detail-risk-bias', `riskBias ${modifier.riskBias || '—'} · maxStateBoost ${modifier.maxStateBoost ?? '—'}`);
    }

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
      const trendText = dim.trend;
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
      setLeafText(`wo-driver-${i + 1}`, `${driver.labelZh || driver.dimensionKey || `driver-${i + 1}`} · ${driver.score ?? '—'}`);
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
  if (value === true) return 'true';
  if (value === false) return 'false';
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
  const title = textValue(scenario.titleZh);
  const triggers = Array.isArray(scenario.triggerConditions)
    ? scenario.triggerConditions.map((item) => textValue(item)).filter(Boolean).join('、')
    : null;
  const invalidations = Array.isArray(scenario.invalidationConditions)
    ? scenario.invalidationConditions.map((item) => textValue(item)).filter(Boolean).join('、')
    : null;
  const parts = [];
  if (title) parts.push(`${title}:`);
  if (triggers) parts.push(`若 ${triggers},则升级观察`);
  if (invalidations) parts.push(`若 ${invalidations},则降级/失效`);
  return parts.length > 0 ? parts.join('；') : null;
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
    if (!layer || layer.displayEnabled === false) return;

    if (textValue(layer.provider)) setLeafText('ext-ai-provider', layer.provider);
    if (textValue(layer.model)) setLeafText('ext-ai-model', layer.model);
    if (textValue(layer.qualityReview?.recommendation)) setLeafText('ext-ai-quality', layer.qualityReview.recommendation);
    const promotion = formatBoolean(layer.qualityReview?.promotionEligible);
    if (promotion) setLeafText('ext-ai-promotion', promotion);
    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-run-id', layer.provenance.runId);
    const generatedAt = formatUtcMinuteStage5d2(layer.generatedAt);
    if (generatedAt) setLeafText('ext-ai-generated-at', generatedAt);

    if (textValue(layer.summaryZh)) setLeafText('ext-ai-summary', layer.summaryZh);
    const factsText = orderedSentence(layer.facts);
    if (factsText) setLeafText('ext-ai-facts-text', factsText);
    const inferencesText = orderedSentence(layer.inferences);
    if (inferencesText) setLeafText('ext-ai-inferences-text', inferencesText);
    const judgmentsText = orderedSentence(layer.modelJudgments);
    if (judgmentsText) setLeafText('ext-ai-judgments-text', judgmentsText);

    if (Array.isArray(layer.scenarioHypotheses)) {
      for (let i = 0; i < 2; i += 1) {
        const text = scenarioText(layer.scenarioHypotheses[i]);
        if (text) setLeafText(`ext-ai-scenario-${i + 1}`, text);
      }
    }

    const boundaries = layer.boundaries || {};
    const boundaryText = joinNonEmpty([
      `displayOnly=${formatBoolean(boundaries.displayOnly)}`,
      `externalAiGenerated=${formatBoolean(boundaries.externalAiGenerated)}`,
      `usesExternalAiApi=${formatBoolean(boundaries.usesExternalAiApi)}`,
      `notInvestmentAdvice=${formatBoolean(boundaries.notInvestmentAdvice)}`,
      `productionWriteApproved=${formatBoolean(boundaries.productionWriteApproved)}`,
      `frontendDisplayApproved=${formatBoolean(boundaries.frontendDisplayApproved)}`,
    ], ' / ');
    if (boundaryText) setLeafText('ext-ai-boundaries-text', boundaryText);

    if (Array.isArray(layer.auditFlags) && layer.auditFlags.length > 0) {
      setLeafText('ext-ai-audit-flags', layer.auditFlags.join(' / '));
    }

    if (textValue(layer.provenance?.runId)) setLeafText('ext-ai-prov-run-id', layer.provenance.runId);
    if (textValue(layer.inputSource)) setLeafText('ext-ai-prov-input-source', layer.inputSource);
    if (textValue(layer.sourceMode)) setLeafText('ext-ai-prov-source-mode', layer.sourceMode);
    if (generatedAt) setLeafText('ext-ai-prov-generated-at', generatedAt);
    const digest = shortHash(layer.provenance?.artifactDigest, 12);
    if (digest) setLeafText('ext-ai-prov-artifact-digest', digest);
    const commit = shortHash(layer.provenance?.sourceCommit, 12);
    if (commit) setLeafText('ext-ai-prov-source-commit', commit);
    const humanApproved = formatBoolean(layer.provenance?.humanApproved);
    if (humanApproved) setLeafText('ext-ai-prov-human-approved', humanApproved);
    if (promotion) setLeafText('ext-ai-prov-promotion', promotion);
    const confidenceText = joinNonEmpty([
      layer.confidence?.level,
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

    const stateText = joinNonEmpty([decision.strategyState, decision.stateLabel]);
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

export function renderMacroOverview({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData }) {
  // Stage 4b-1A: Hero + threshold + pressure-sources
  renderHero({ radarData, worldOrderStressData });
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

  // Stage 5a: heatmap + C7 market sentiment + C8 geopolitics/world-order
  renderHeatmap({ radarData });
  renderC7MarketSentiment({ radarData, marketPricingMetricsData });
  renderC8Geopolitical({ radarData, worldOrderStressData });

  // Stage 5b: C1 inflation/energy + C2 global liquidity
  renderC1InflationEnergy({ radarData });
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
