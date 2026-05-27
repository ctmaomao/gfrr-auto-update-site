// scripts/modules/renderMacroOverview.js
// M-94 V0 路径 C · Stage 4b-1A
// 职责:render macro-overview-shell 内 3 个 block(Hero + threshold + pressure-sources)
// 后续 Stage 4b-1B / 4b-2 扩展(market-temp / risk-engines / wow / trend SVG / signal-layers / macro-drivers / cross-validation)

import {
  $,
  fmtSigned,
  fmtNumSafe,
  fmtDeltaSafe,
} from './config.js?v=28.0M-95';

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
      setLeafText('wow-item-1-source', `brentPricingLayer.crackSpread4wChange ${signedFixed(crackSpread4wChange, 2)}`);
    }
    const hyOas = asNumber(radarData.macroDrivers?.credit?.hyOas);
    if (hyOas !== null) {
      setLeafText('wow-item-2-text', `HY OAS 在 ${hyOas.toFixed(2)}% 低位,与 VIX 同步走低。信用市场不验证恐慌。`);
      setLeafText('wow-item-2-source', 'divergenceLayer 提供反向证据');
    }
    const woState = worldOrderStressData?.state;
    const woLabel = worldOrderStressData?.labelZh;
    if (woState) {
      setLeafText('wow-item-3-text', `World Order overlay 当前为 ${woState}${woLabel ? `(${woLabel})` : ''},结构性压力持续。`);
      setLeafText('wow-item-3-source', 'worldOrderStress.state transition');
    }
    const futureMinusTargetMid = asNumber(radarData.macroDrivers?.policyExpectations?.futureMinusTargetMid);
    if (futureMinusTargetMid !== null) {
      const bp = futureMinusTargetMid * 100;
      setLeafText('wow-item-4-text', `Fed 政策路径分歧 ${signedFixed(bp, 1)}bp,市场定价与目标中位仍有偏差。`);
      setLeafText('wow-item-4-source', 'macroDrivers.policyExpectations.futureMinusTargetMid');
    }
    const initialClaims = asNumber(radarData.macroDrivers?.employment?.initialClaims);
    if (initialClaims !== null) {
      setLeafText('wow-item-5-text', `首次申请稳在 ${(initialClaims / 1000).toFixed(0)}k,就业扩散仍需观察。`);
      setLeafText('wow-item-5-source', 'macroDrivers.employment.diffusion');
    }
    const consumerCheck = Array.isArray(radarData.divergenceLayer?.checks)
      ? radarData.divergenceLayer.checks.find((item) => item?.key === 'consumer_vs_asset_pricing')
      : null;
    if (consumerCheck) {
      const scoreText = Number.isFinite(consumerCheck.score) ? `score ${consumerCheck.score}` : 'score —';
      const statusText = consumerCheck.status ? `(${consumerCheck.status})` : '';
      setLeafText('wow-item-6-text', `consumer_vs_asset_pricing 背离 ${scoreText}${statusText}。`);
      setLeafText('wow-item-6-source', 'divergenceLayer.checks[consumer_vs_asset_pricing]');
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
  return clamp(200 * (1 - n / 70), 0, 200);
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

function renderTrendSvg({ radarHistoryData, worldOrderStressData }) {
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
    const overlayY = trendY(overlayScore);
    if (overlayY === null) return;
    const overlayPoints = TREND_X.map((x) => pointPair(x, overlayY));
    const overlayLine = $('trend-line-overlay');
    if (overlayLine) overlayLine.setAttribute('points', overlayPoints.join(' '));
    const overlayDot = $('trend-dot-overlay');
    if (overlayDot) {
      overlayDot.setAttribute('cx', String(TREND_X[TREND_X.length - 1]));
      overlayDot.setAttribute('cy', Number(overlayY.toFixed(2)).toString());
    }
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
  renderTrendSvg({ radarHistoryData, worldOrderStressData });
  renderSignalLayers({ radarData, worldOrderStressData, marketPricingMetricsData });
  renderMacroDriversPillars({ radarData });
  renderCrossValidation({ radarData, worldOrderStressData, marketPricingMetricsData });

  // Stage 5a: heatmap + C7 market sentiment + C8 geopolitics/world-order
  renderHeatmap({ radarData });
  renderC7MarketSentiment({ radarData, marketPricingMetricsData });
  renderC8Geopolitical({ radarData, worldOrderStressData });

  console.log('[renderMacroOverview] Stage 5a renders complete (macro overview + heatmap + C7/C8 thematic cards)');
}
