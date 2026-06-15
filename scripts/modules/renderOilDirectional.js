// scripts/modules/renderOilDirectional.js — PR4 · Oil Directional Pressure (ODP) renderer.
//
// Display-only: renders data/oil-directional-pressure.json (finalBias / signals /
// interpretation + evidence) as the Chinese-language standalone energy theme
// (#oil-directional-pressure). The physical chain takes precedence over the price
// surface ("物理>金融"). Audit-only — this layer does NOT feed scoring / decision /
// execution / Heatmap.
//
// Discipline: every displayed number is wired here via a setter (no hardcoded numbers
// in index.html -> no stale-display). Chinese copy carries NO trade-action words
// (guarded by check:oil-directional-zh-copy) — these are observational assessments,
// not instructions.

const $ = (id) => document.getElementById(id);

function setLeafText(id, value) {
  const el = $(id);
  if (!el || value === null || value === undefined || value === '') return;
  el.textContent = String(value);
}

function setToneClass(id, baseClass, tone) {
  const el = $(id);
  if (!el) return;
  // empty tone -> reset to base class (no stale tone left over on a degraded re-render)
  el.className = tone ? `${baseClass} ${tone}` : baseClass;
}

const FINAL_BIAS_ZH = {
  strong_bullish: '强看涨 · 物理紧张',
  moderate_bullish: '温和看涨',
  neutral_range: '中性震荡',
  bearish: '偏空',
  false_down_physical_stress: '假性下跌 · 物理压力仍强',
  false_up_unconfirmed: '假性上涨 · 缺物理确认',
  product_crisis: '成品油压力主导',
  insufficient_data: '数据不足 · 暂不判断',
};

// red = 上行/物理压力强;green = 下行/无上行压力;yellow = 温和/需观察;'' = 不上色(数据不足)。
const FINAL_BIAS_TONE = {
  strong_bullish: 'red',
  product_crisis: 'red',
  false_down_physical_stress: 'red',
  moderate_bullish: 'yellow',
  false_up_unconfirmed: 'yellow',
  neutral_range: 'green',
  bearish: 'green',
  insufficient_data: '',
};

const PHYSICAL_BIAS_ZH = {
  strong_bullish: '强(库存紧 + 加速去化)',
  moderate_bullish: '偏紧',
  neutral_range: '中性',
  bearish: '偏松',
  product_crisis: '成品油紧张',
  insufficient_data: '数据不足',
};

const DIVERGENCE_ZH = {
  none: '无背离(价格与物理一致,或价格方向未知)',
  false_down_physical_stress: '价格下跌 · 物理仍紧',
  false_up_unconfirmed: '价格上涨 · 物理偏松',
};

const DATA_SUFFICIENCY_ZH = {
  full: '完整(8 源同周 live)',
  partial: '部分',
  insufficient: '不足 · 暂不判断',
};

const REASON_IDS = [
  'odp-reason-inventory', 'odp-reason-diesel', 'odp-reason-curve',
  'odp-reason-refinery', 'odp-reason-spr', 'odp-reason-demand',
];
const ENERGY_TEXT_IDS = [
  'odp-brent-basis-alert',
  'odp-brent-basis-status',
  'odp-brent-basis-daily',
  'odp-brent-basis-worker',
  'odp-brent-basis-futures',
  'odp-brent-basis-spread',
  'odp-brent-basis-note',
  'odp-pulse-factor-status',
  'odp-pulse-factor-wpsr',
  'odp-pulse-factor-inventory',
  'odp-pulse-factor-crack',
  'odp-pulse-factor-refinery',
  'odp-pulse-factor-window',
  'odp-pulse-factor-note',
  'odp-global-forecast-status',
  'odp-global-forecast-us-weekly',
  'odp-global-forecast-global-stocks',
  'odp-global-forecast-demand',
  'odp-global-forecast-buffer',
  'odp-global-forecast-window',
  'odp-global-forecast-note',
  'odp-energy-spare-status',
  'odp-energy-spare-value',
  'odp-energy-spare-regime',
  'odp-energy-spare-period',
  'odp-energy-spare-note',
  'odp-energy-transport-status',
  'odp-energy-transport-date',
  'odp-energy-transport-coverage',
  'odp-energy-transport-hormuz',
  'odp-energy-transport-rerouting',
  'odp-energy-transport-ais-caveat',
  'odp-energy-transport-note',
  'odp-energy-source-boundary',
];
const CORE_CHOKEPOINTS = [
  ['suez', '苏伊士'],
  ['babElMandeb', '曼德海峡'],
  ['malacca', '马六甲'],
  ['hormuz', '霍尔木兹'],
  ['capeGoodHope', '好望角'],
  ['gibraltar', '直布罗陀'],
];
const COVERAGE_CHOKEPOINT_KEYS = [
  'suez',
  'panama',
  'bosporus',
  'babElMandeb',
  'malacca',
  'hormuz',
  'capeGoodHope',
  'gibraltar',
];
const CORE_WPSR_KEYS = [
  'crudeStocksExSpr',
  'sprStocks',
  'distillateStocks',
  'gasolineStocks',
  'refineryUtilization',
  'refinerCrudeInputs',
  'demandGasolineSupplied',
  'demandDistillateSupplied',
];

function signed(v, dp = 0) {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + (dp ? v.toFixed(dp) : String(Math.round(v)));
}
function pct(v, dp = 1) {
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(dp) + '%';
}
function fixed(v, dp = 1) {
  return Number.isFinite(v) ? v.toFixed(dp) : '—';
}
function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function firstNumber(...values) {
  for (const value of values) {
    const n = asNumber(value);
    if (n !== null) return n;
  }
  return null;
}
function formatUsd(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : '—';
}
function basisPct(reference, comparison) {
  if (!Number.isFinite(reference) || !Number.isFinite(comparison) || comparison <= 0) return null;
  return ((reference - comparison) / comparison) * 100;
}
function formatBasisPct(value) {
  return Number.isFinite(value) ? signed(value, 1) + '%' : '—';
}
function formatUtcMinute(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}
function compactDate(value) {
  if (!value || typeof value !== 'string') return null;
  return value.slice(0, 10);
}
function formatMbpd(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v < 0.1 ? v.toFixed(2) : v.toFixed(1)} mbpd`;
}
function formatKBarrels(value) {
  if (!Number.isFinite(value)) return '—';
  return `${signed(value)} 千桶`;
}
function formatPctPoint(value) {
  if (!Number.isFinite(value)) return '—';
  return `${signed(value, 1)}百分点`;
}
function ratioPct(v) {
  if (!Number.isFinite(v)) return '—';
  return signed(v * 100, 1) + '%';
}
function compactNumber(v) {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}m`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}
function statusZh(status) {
  const normalized = typeof status === 'string' ? status : '';
  return ({
    live: '实时',
    fallback: '回退沿用',
    stale: '陈旧待刷新',
    missing: '源不可用',
    insufficient_window: '窗口不足',
  })[normalized] || '源不可用';
}
function reroutingZh(regime) {
  return ({
    rerouting_watch: '红海->好望角绕行代理偏高',
    normal: '未见显著绕行代理',
    unknown: '窗口不足',
  })[regime] || '窗口不足';
}
// 缓冲状态上色:极低缓冲=red(供应缓冲近耗尽),偏低=yellow,宽松=green;正常/未知不上色。
// 枚举与 validate-data.mjs VALID_ENERGY_SPARE_CAPACITY_REGIMES 对齐。
const BUFFER_REGIME_TONE = {
  '极低缓冲': 'red',
  '偏低': 'yellow',
  '宽松': 'green',
};
function clearEnergyAddendum() {
  for (const id of ENERGY_TEXT_IDS) setLeafText(id, '—');
  setToneClass('odp-brent-basis-alert', 'odp-brent-basis-alert', '');
  setToneClass('odp-brent-basis-status', 'odp-brent-basis-status', '');
  setToneClass('odp-pulse-factor-status', 'odp-pulse-factor-status', '');
  setToneClass('odp-global-forecast-status', 'odp-global-forecast-status', '');
  setToneClass('odp-energy-spare-regime', 'odp-energy-regime', '');
  const coreHost = $('odp-energy-transport-core');
  if (coreHost) coreHost.textContent = '—';
}
function brentBasisTone(status) {
  return ({
    '口径背离': 'red',
    '轻微背离': 'yellow',
    '基本一致': 'green',
  })[status] || '';
}
function brentBasisStatus({ dailyVsWorkerPct, dailyVsFuturesPct, proxyStatus }) {
  const maxAbs = Math.max(
    Number.isFinite(dailyVsWorkerPct) ? Math.abs(dailyVsWorkerPct) : 0,
    Number.isFinite(dailyVsFuturesPct) ? Math.abs(dailyVsFuturesPct) : 0,
  );
  if (proxyStatus === 'stress' || maxAbs >= 5) return '口径背离';
  if (proxyStatus === 'watch' || maxAbs >= 2) return '轻微背离';
  if (Number.isFinite(maxAbs) && maxAbs > 0) return '基本一致';
  return '证据不足';
}
function getBrentBasisModel(radarData, worldOrderStressData) {
  const brentLayer = radarData && radarData.brentPricingLayer ? radarData.brentPricingLayer : {};
  const dailyBrent = firstNumber(
    brentLayer.selectedBrent?.value,
    radarData?.displayInputsBaseline?.brent,
    radarData?.values?.brent,
  );
  const marketInput = worldOrderStressData && worldOrderStressData.marketConfirmationInput
    ? worldOrderStressData.marketConfirmationInput
    : {};
  const workerBrent = firstNumber(marketInput.brent);
  const futuresBrent = firstNumber(
    brentLayer.futuresPriceCurve?.frontPrice,
    brentLayer.iceFuturesPriceCurve?.frontPrice,
    brentLayer.futuresProxy?.value,
  );
  const dailyVsWorkerPct = basisPct(dailyBrent, workerBrent);
  const dailyVsFuturesPct = basisPct(dailyBrent, futuresBrent);
  const status = brentBasisStatus({
    dailyVsWorkerPct,
    dailyVsFuturesPct,
    proxyStatus: brentLayer.proxySpread?.status,
  });
  const tone = brentBasisTone(status);
  const workerTime = formatUtcMinute(marketInput.updatedAt);
  const futuresTime = formatUtcMinute(brentLayer.futuresPriceCurve?.updatedAt || brentLayer.iceFuturesPriceCurve?.updatedAt);
  return {
    brentLayer,
    dailyBrent,
    workerBrent,
    futuresBrent,
    dailyVsWorkerPct,
    dailyVsFuturesPct,
    status,
    tone,
    workerTime,
    futuresTime,
  };
}
function renderBrentBasisCheck(radarData, worldOrderStressData) {
  const model = getBrentBasisModel(radarData, worldOrderStressData);
  const {
    dailyBrent,
    workerBrent,
    futuresBrent,
    dailyVsWorkerPct,
    dailyVsFuturesPct,
    status,
    tone,
    workerTime,
    futuresTime,
  } = model;

  setLeafText('odp-brent-basis-status', status);
  setToneClass('odp-brent-basis-status', 'odp-brent-basis-status', tone);
  setLeafText('odp-brent-basis-daily', dailyBrent !== null ? `${formatUsd(dailyBrent)} · Daily · FRED` : '—');
  setLeafText('odp-brent-basis-worker', workerBrent !== null ? `${formatUsd(workerBrent)}${workerTime ? ` · ${workerTime}` : ''}` : '—');
  setLeafText('odp-brent-basis-futures', futuresBrent !== null ? `${formatUsd(futuresBrent)}${futuresTime ? ` · ${futuresTime}` : ''}` : '—');
  setLeafText('odp-brent-basis-spread', `Daily 较 Worker ${formatBasisPct(dailyVsWorkerPct)} / Daily 较期货 ${formatBasisPct(dailyVsFuturesPct)}`);

  if (status === '证据不足') {
    setLeafText('odp-brent-basis-alert', 'Brent 口径校验:当前缺少足够的 Worker 快照或期货代理,暂不判断口径差异。');
    setLeafText('odp-brent-basis-note', '本区只读站内已生成的 Daily 主显示值、Worker 快照和公开期货代理;不从浏览器重新抓取外部行情,不改变主 Brent 值。');
    return;
  }

  const alert = status === '口径背离'
    ? `Brent 口径校验:${status}。Daily 主显示值与市场确认/期货代理差异显著,说明 FRED/EIA 现货代理与市场快照存在时间差;ODP 价格解释应优先标注口径差异。`
    : `Brent 口径校验:${status}。Daily 主显示值与市场确认/期货代理差异有限,仍按公开代理观察处理。`;
  setLeafText('odp-brent-basis-alert', alert);
  setToneClass('odp-brent-basis-alert', 'odp-brent-basis-alert', tone);
  setLeafText('odp-brent-basis-note', '本区只解释 Brent 公开代理之间的时间戳和口径差异:Daily 主显示值、Worker 市场确认快照、Yahoo/ICE 期货代理可能不同步;该提示不改变主 Brent 值、Worker 油价确认逻辑、风险打分或执行判断。');
}
function pulseFactorTone(status) {
  return ({
    '证据完整': 'green',
    '需标注口径': 'yellow',
    '证据需降级': 'yellow',
    '证据不足': '',
  })[status] || '';
}
function wpsrAlignment(evidence) {
  const rows = CORE_WPSR_KEYS.map((key) => evidence && evidence[key]).filter(Boolean);
  const liveCount = rows.filter((row) => row.sourceStatus === 'live').length;
  const dates = Array.from(new Set(rows.map((row) => compactDate(row.asOfDate)).filter(Boolean)));
  const staleCount = rows.filter((row) => (
    row.sourceStatus !== 'live'
    || (Number.isFinite(row.ageDays) && Number.isFinite(row.maxAgeDays) && row.ageDays > row.maxAgeDays)
  )).length;
  return {
    liveCount,
    total: CORE_WPSR_KEYS.length,
    dates,
    staleCount,
    aligned: liveCount === CORE_WPSR_KEYS.length && dates.length === 1 && staleCount === 0,
  };
}
function pulseFactorStatus(alignment, brentBasis) {
  if (!alignment.aligned) return alignment.liveCount >= 6 ? '证据需降级' : '证据不足';
  if (brentBasis.status === '口径背离' || brentBasis.brentLayer?.proxySpread?.status === 'stress') return '需标注口径';
  return '证据完整';
}
function renderPulseFactorCheck(oilData, radarData, worldOrderStressData) {
  const evidence = oilData && oilData.evidence ? oilData.evidence : null;
  const alignment = wpsrAlignment(evidence);
  const brentBasis = getBrentBasisModel(radarData, worldOrderStressData);
  const status = pulseFactorStatus(alignment, brentBasis);
  const tone = pulseFactorTone(status);
  const asOfText = alignment.dates.length === 1 ? alignment.dates[0] : (alignment.dates.length ? `${alignment.dates.length} 个日期` : '—');
  const crude = evidence?.crudeStocksExSpr || {};
  const distillate = evidence?.distillateStocks || {};
  const crack = evidence?.crackSpread || {};
  const refinery = evidence?.refineryUtilization || {};
  const builtAt = formatUtcMinute(oilData?.builtAt);
  const radarAt = formatUtcMinute(radarData?.updatedAt);
  const crackChangeText = Number.isFinite(crack.change4w) ? `,4w ${signed(crack.change4w, 2)}` : '';

  setLeafText('odp-pulse-factor-status', status);
  setToneClass('odp-pulse-factor-status', 'odp-pulse-factor-status', tone);
  setLeafText('odp-pulse-factor-wpsr', `${alignment.liveCount}/${alignment.total} 同周 live · 截至 ${asOfText}`);
  setLeafText('odp-pulse-factor-inventory', `原油 ${formatKBarrels(crude.change1w)}(1w) / ${formatKBarrels(crude.change4w)}(4w)`);
  setLeafText('odp-pulse-factor-crack', `馏分油较5年 ${pct(distillate.vs5yAvgPct)} · 裂差 ${fixed(crack.value, 2)}${crackChangeText}`);
  setLeafText('odp-pulse-factor-refinery', `${fixed(refinery.value, 1)}% · 1w ${formatPctPoint(refinery.change1w)} / 4w ${formatPctPoint(refinery.change4w)}`);
  setLeafText('odp-pulse-factor-window', `ODP ${builtAt || '—'} · Daily ${radarAt || '—'}`);

  if (status === '证据不足') {
    setLeafText('odp-pulse-factor-note', 'Pulse 三因子校验当前缺少足够 EIA 周度源,暂不判断;不补值、不从浏览器读取外部行情。');
    return;
  }
  const basisText = brentBasis.status === '口径背离'
    ? '但 Brent 现货/期货/Worker 口径背离,价格层必须标注时间差'
    : '价格代理未触发明显口径警示';
  const crackText = Number.isFinite(crack.change4w) && crack.change4w < 0
    ? '裂解价差 4 周收窄,说明成品油利润代理没有继续同向扩张'
    : '裂解价差未显示 4 周收窄';
  setLeafText('odp-pulse-factor-note', `解读:库存去化、馏分油偏紧与炼厂高开工共同支持物理链偏紧;${crackText};${basisText}。本区只是把 Pulse 式三因子拆成站内证据质量说明,不替代 ODP 物理链分类器。`);
}
function renderGlobalForecastGap(oilData, radarData) {
  const evidence = oilData && oilData.evidence ? oilData.evidence : {};
  const alignment = wpsrAlignment(evidence);
  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  const spare = macroDrivers.energySpareCapacity || {};
  const crude = evidence.crudeStocksExSpr || {};
  const gasoline = evidence.demandGasolineSupplied || {};
  const distillate = evidence.demandDistillateSupplied || {};
  const asOfText = alignment.dates.length === 1 ? alignment.dates[0] : (alignment.dates.length ? `${alignment.dates.length} 个日期` : '—');
  const spareStatus = spare.sourceStatus ? spare.sourceStatus.spareCapacity : null;
  const spareText = spareStatus === 'live'
    ? `${formatMbpd(spare.spareCapacityMbpd)} · ${spare.latestPeriod || '—'} · ${spare.bufferRegime || '状态待核'}`
    : 'EIA STEO 闲置产能源暂不可用';
  const demandText = `美国汽油 ${pct(gasoline.vs5yAvgPct)} / 馏分油 ${pct(distillate.vs5yAvgPct)}`;
  const status = alignment.aligned ? '需外部月度源' : '周报源需降级';
  const tone = alignment.aligned ? 'yellow' : '';

  setLeafText('odp-global-forecast-status', status);
  setToneClass('odp-global-forecast-status', 'odp-global-forecast-status', tone);
  setLeafText('odp-global-forecast-us-weekly', `${alignment.liveCount}/${alignment.total} 同周 live · 原油较5年 ${pct(crude.vs5yAvgPct)}`);
  setLeafText('odp-global-forecast-global-stocks', '未接 OECD / 全球商业库存');
  setLeafText('odp-global-forecast-demand', `${demandText} · 非全球预测`);
  setLeafText('odp-global-forecast-buffer', spareText);
  setLeafText('odp-global-forecast-window', `周报截至 ${asOfText} · STEO ${spare.latestPeriod || '—'}`);
  setLeafText('odp-global-forecast-note', 'Pulse 的 OECD 库存低位、全球需求下修与 OPEC 月报属于全球月度/预测层;本站当前只能用美国 EIA 周报、EIA STEO 闲置产能和公开价格代理做边界解读,不能把外部新闻里的全球库存或需求预测当成站内已验证数据。');
}
function renderSpareCapacity(spare) {
  const status = spare && spare.sourceStatus ? spare.sourceStatus.spareCapacity : null;
  setLeafText('odp-energy-spare-status', statusZh(status));

  if (!spare || typeof spare !== 'object' || status === 'missing') {
    setLeafText('odp-energy-spare-value', '—');
    setLeafText('odp-energy-spare-regime', '源暂不可用');
    setLeafText('odp-energy-spare-period', '—');
    setLeafText('odp-energy-spare-note', 'OPEC 闲置产能补充层暂不可用;本区只显示 Daily 已生成的 EIA STEO 慢变量。');
    return;
  }

  const periodType = spare.latestIsForecast === true ? '预测期' : spare.latestIsForecast === false ? '历史期' : '期别待核';
  setLeafText('odp-energy-spare-value', formatMbpd(spare.spareCapacityMbpd));
  setLeafText('odp-energy-spare-regime', spare.bufferRegime || '—');
  setToneClass('odp-energy-spare-regime', 'odp-energy-regime', BUFFER_REGIME_TONE[spare.bufferRegime] || '');
  setLeafText('odp-energy-spare-period', `${spare.latestPeriod || '—'} · ${periodType}`);
  setLeafText('odp-energy-spare-note', 'EIA STEO COPS_OPEC 月度估算/预测,用于观察全球供应缓冲厚薄;不是实时物理闲置桶数或 OPEC 官方配额执行。');
}
function renderTransportCore(transport) {
  const host = $('odp-energy-transport-core');
  if (!host) return;
  if (!transport || !transport.chokepoints || typeof transport.chokepoints !== 'object') {
    host.textContent = '—';
    return;
  }
  const rows = CORE_CHOKEPOINTS.map(([id, label]) => {
    const item = transport.chokepoints[id] || {};
    const latest = item.latest || {};
    const tanker = Number.isFinite(latest.nTanker) ? `${latest.nTanker} 艘油轮` : '—';
    const cap = Number.isFinite(latest.capacityTanker) ? `运力 ${compactNumber(latest.capacityTanker)}` : '运力 —';
    const dev = Number.isFinite(item.latestVs30dPct) ? `较30日均 ${ratioPct(item.latestVs30dPct)}` : '较30日均 —';
    const row = document.createElement('div');
    row.className = 'odp-energy-core-item';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    value.textContent = `${tanker} · ${cap} · ${dev}`;
    row.append(name, value);
    return row;
  });
  host.replaceChildren(...rows);
}
function transportCoverageText(transport) {
  const chokepoints = transport && transport.chokepoints ? transport.chokepoints : {};
  const liveCount = COVERAGE_CHOKEPOINT_KEYS.filter((id) => chokepoints[id]?.sourceStatus === 'live').length;
  const label = liveCount === COVERAGE_CHOKEPOINT_KEYS.length ? '核心咽喉完整' : '核心咽喉不完整';
  return `${liveCount}/${COVERAGE_CHOKEPOINT_KEYS.length} live · ${label}`;
}
function hormuzTransportText(transport) {
  const hormuz = transport?.chokepoints?.hormuz;
  if (!hormuz || typeof hormuz !== 'object') return '窗口不足';
  const latest = hormuz.latest || {};
  const tanker = Number.isFinite(latest.nTanker) ? `${latest.nTanker} 艘油轮` : '油轮 —';
  const countDev = Number.isFinite(hormuz.latestVs30dPct) ? `数量 ${ratioPct(hormuz.latestVs30dPct)}` : '数量 —';
  const capacityDev = Number.isFinite(hormuz.capacityTankerVs30dPct) ? `运力 ${ratioPct(hormuz.capacityTankerVs30dPct)}` : '运力 —';
  return `${tanker} · ${countDev} / ${capacityDev}`;
}
function aisCaveatText(transport) {
  if (!transport || typeof transport !== 'object') return '源暂不可用';
  const terms = transport.usageTermsPinned === 'imf_data_terms_pinned' ? 'IMF 条款已固定' : '条款状态待核';
  const caveat = transport.redistributionCaveat === true ? '上游限制保留' : '上游限制待核';
  return `${terms} · ${caveat} · 非暗航行确认`;
}
function renderEnergyTransport(transport) {
  const status = transport && transport.sourceStatus ? transport.sourceStatus.chokepoints : null;
  setLeafText('odp-energy-transport-status', statusZh(status));

  if (!transport || typeof transport !== 'object' || status === 'missing') {
    setLeafText('odp-energy-transport-date', '—');
    setLeafText('odp-energy-transport-coverage', '源暂不可用');
    setLeafText('odp-energy-transport-hormuz', '源暂不可用');
    setLeafText('odp-energy-transport-rerouting', '源暂不可用');
    setLeafText('odp-energy-transport-ais-caveat', '源暂不可用');
    setLeafText('odp-energy-transport-note', '咽喉转运补充层暂不可用;本区只显示 Daily 已生成的 compact 派生摘要,不读取浏览器外部源。');
    renderTransportCore(null);
    return;
  }

  const age = Number.isFinite(transport.latestAgeDays) ? ` · ${Math.round(transport.latestAgeDays)} 天前` : '';
  const rerouting = transport.reroutingProxy || {};
  const redSea = Number.isFinite(rerouting.suezBabTankerVs30dPct) ? `苏伊士/曼德 ${ratioPct(rerouting.suezBabTankerVs30dPct)}` : '苏伊士/曼德 —';
  const cape = Number.isFinite(rerouting.capeTankerVs30dPct) ? `好望角 ${ratioPct(rerouting.capeTankerVs30dPct)}` : '好望角 —';
  setLeafText('odp-energy-transport-date', `${transport.latestDate || '—'}${age}`);
  setLeafText('odp-energy-transport-coverage', transportCoverageText(transport));
  setLeafText('odp-energy-transport-hormuz', hormuzTransportText(transport));
  setLeafText('odp-energy-transport-rerouting', `${reroutingZh(rerouting.redSeaToCapeRegime)} · ${redSea} / ${cape}`);
  setLeafText('odp-energy-transport-ais-caveat', aisCaveatText(transport));
  setLeafText('odp-energy-transport-note', 'PortWatch 是 AIS 派生咽喉代理,可帮助观察霍尔木兹、苏伊士/曼德与好望角偏离;但本站未接 Kpler 或船舶级暗航行源,不能确认油轮关 AIS、科威特库存变化、封锁或真实油轮流量。');
  renderTransportCore(transport);
}
function renderEnergyAddendum(radarData, worldOrderStressData, oilData) {
  clearEnergyAddendum();
  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  renderBrentBasisCheck(radarData, worldOrderStressData);
  renderPulseFactorCheck(oilData, radarData, worldOrderStressData);
  renderGlobalForecastGap(oilData, radarData);
  renderSpareCapacity(macroDrivers.energySpareCapacity);
  renderEnergyTransport(macroDrivers.energyTransport);
  setLeafText('odp-energy-source-boundary', '边界:Brent 口径校验、Pulse 三因子校验、全球库存/需求缺口、OPEC 闲置产能与咽喉转运均为仅供参考的能源观察层,不参与平台的风险打分与决策。');
}

function reasonInventory(sig, ev) {
  const i = sig.inventoryDrawPressure || {};
  const e = ev.crudeStocksExSpr || {};
  const trend = i.drawAccel ? '加速去化' : (Number.isFinite(i.change4w) && i.change4w < 0 ? '去化' : '回补');
  return `链条库存端:商业原油${trend},近 4 周 ${signed(e.change4w)} 千桶,5 年同期 ${pct(e.vs5yAvgPct)}`;
}
function reasonDiesel(sig, ev) {
  const d = sig.dieselProductStress || {};
  const e = ev.distillateStocks || {};
  const state = d.extremeTight ? '极紧' : (d.tight ? '偏紧' : '正常');
  return `链条起点:馏分油库存${state},5 年同期 ${pct(e.vs5yAvgPct)},对应工业/运输需求压力`;
}
function reasonCurve(sig, ev) {
  const pc = sig.priceContext || {};
  const c = ev.curve || {};
  const regime = pc.curveSlopeRegime === 'backwardation' ? 'backwardation(近端高于远端,现货紧张代理)'
    : pc.curveSlopeRegime === 'contango' ? 'contango(近端低于远端,供应宽松代理)' : '—';
  return `链条定价端:${regime},前-后 ${signed(c.frontMinusBack, 2)}(公开代理,低置信,非官方结算曲线)`;
}
function reasonRefinery(sig, ev) {
  const r = sig.refineryConfirmation || {};
  const crack = ev.crackSpread || {};
  const state = r.high ? '偏高' : (r.low ? '偏低' : '中性');
  const crackText = Number.isFinite(crack.value)
    ? `;裂解价差 ${fixed(crack.value, 2)} ${crack.unit || '$/bbl'}${crack.regime ? `(${crack.regime})` : ''},4w ${signed(crack.change4w, 2)}`
    : ';裂解价差 —';
  return `链条加工端:炼厂开工率 4 周均 ${fixed(r.utilAvg4w, 1)}%,${state}${crackText}`;
}
function reasonSpr(sig) {
  const s = sig.sprBufferEffectiveness || {};
  return `政策缓冲端:SPR 近 4 周 ${signed(s.sprChange4w)} 千桶${s.bufferInsufficient ? ',缓冲不足以抵消商业去化' : ''}`;
}
function reasonDemand(sig) {
  const d = sig.demandDestructionRisk || {};
  const ratio = (Number.isFinite(d.suppliedAvg4w) && Number.isFinite(d.suppliedAvg13w) && d.suppliedAvg13w)
    ? (d.suppliedAvg4w / d.suppliedAvg13w).toFixed(2) : '—';
  const state = d.demandDestruction ? '需求破坏' : (d.demandFalling ? '需求转弱' : '未见需求破坏');
  return `需求端:产品供应 4w/13w 比 ${ratio},${state}`;
}

function buildHeadline(finalBias, it, sig) {
  const pc = (sig && sig.priceContext) || {};
  const brent = pct(pc.brentChangePct4w);
  switch (finalBias) {
    case 'false_down_physical_stress':
      return `布伦特近 ~4 周 ${brent},价格回落;但物理链仍偏紧(馏分油/成品油压力 + 加工端确认 + 期限结构 backwardation),下跌未获物理确认。`;
    case 'false_up_unconfirmed':
      return `布伦特近 ~4 周 ${brent},价格走高;但物理链偏松(库存回补 + 曲线走弱 + 馏分油改善),上涨缺物理确认。`;
    case 'strong_bullish':
      return `物理链强紧张:库存加速去化、炼厂高开工,布伦特近 ~4 周 ${brent}。`;
    case 'moderate_bullish':
      return `物理链偏紧(库存偏低或去化),布伦特近 ~4 周 ${brent}。`;
    case 'product_crisis':
      return `馏分油库存极紧,成品油压力主导(压力来自下游成品而非原油本身),布伦特近 ~4 周 ${brent}。`;
    case 'bearish':
      return `物理链偏松:库存回补且高于同期、需求转弱,布伦特近 ~4 周 ${brent}。`;
    case 'neutral_range':
      return `物理链中性,无明确方向压力,布伦特近 ~4 周 ${brent}。`;
    case 'insufficient_data':
    default:
      return '本周物理链数据不足(非 8 源同周 live),暂不给出方向判断。';
  }
}

function evidenceRow(label, e) {
  const row = document.createElement('div');
  row.className = 'odp-evidence-row';
  const make = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  row.appendChild(make('odp-ev-label', label));
  row.appendChild(make('odp-ev-value', e && Number.isFinite(e.value) ? `${Math.round(e.value)} ${e.unit || ''}`.trim() : '—'));
  row.appendChild(make('odp-ev-change', `4w ${signed(e && e.change4w)}`));
  row.appendChild(make('odp-ev-range', `5y位 ${e && Number.isFinite(e.fiveYrRangePosition) ? (e.fiveYrRangePosition * 100).toFixed(0) + '%' : '—'}`));
  return row;
}

function renderEvidenceList(ev) {
  const host = $('odp-evidence-list');
  if (!host) return;
  const rows = [
    ['原油库存(ex-SPR)', ev.crudeStocksExSpr],
    ['SPR 库存', ev.sprStocks],
    ['馏分油库存', ev.distillateStocks],
    ['汽油库存', ev.gasolineStocks],
    ['炼厂开工率', ev.refineryUtilization],
    ['汽油 product supplied', ev.demandGasolineSupplied],
    ['馏分油 product supplied', ev.demandDistillateSupplied],
  ];
  host.replaceChildren(...rows.map(([label, e]) => evidenceRow(label, e)));
}

export function renderOilDirectional({ oilData, radarData, worldOrderStressData }) {
  renderEnergyAddendum(radarData, worldOrderStressData, oilData);

  if (!oilData || typeof oilData !== 'object') {
    setLeafText('odp-verdict', '数据不可用');
    setLeafText('hero-odp-ref-verdict', '数据不可用');
    setToneClass('odp-verdict', 'section-title', '');
    setLeafText('odp-headline', '油价方向研判数据未能加载,暂不显示。');
    for (const id of ['odp-physical-bias', 'odp-divergence', 'odp-data-sufficiency', 'odp-asof', 'odp-evidence-note']) setLeafText(id, '—');
    for (const id of REASON_IDS) setLeafText(id, '—');
    const host = $('odp-evidence-list');
    if (host) host.replaceChildren();
    return;
  }

  const finalBias = oilData.finalBias;
  const it = oilData.interpretation || {};
  const sig = oilData.signals;
  const ev = oilData.evidence || {};
  const crudeAsOf = (ev.crudeStocksExSpr && ev.crudeStocksExSpr.asOfDate) || '—';

  setLeafText('odp-verdict', FINAL_BIAS_ZH[finalBias] || '—');
  setLeafText('hero-odp-ref-verdict', FINAL_BIAS_ZH[finalBias] || '—'); // PR5: read-only cross-ref in the Hero / dailyBrief
  setToneClass('odp-verdict', 'section-title', FINAL_BIAS_TONE[finalBias]);
  setLeafText('odp-headline', buildHeadline(finalBias, it, sig));
  setLeafText('odp-physical-bias', PHYSICAL_BIAS_ZH[it.physicalBias] || '—');
  setLeafText('odp-divergence', DIVERGENCE_ZH[it.divergence] || '—');
  setLeafText('odp-data-sufficiency', DATA_SUFFICIENCY_ZH[it.dataSufficiency] || '—');
  setLeafText('odp-asof', crudeAsOf);

  if (!sig) {
    // insufficient_data -> 暂不判断, no fabricated reasons; clear any prior evidence rows.
    for (const id of REASON_IDS) setLeafText(id, '暂不判断');
    setLeafText('odp-evidence-note', '本周物理链数据不足(非 8 源同周 live),暂不给出方向判断。');
    const host = $('odp-evidence-list');
    if (host) host.replaceChildren();
    return;
  }

  setLeafText('odp-reason-inventory', reasonInventory(sig, ev));
  setLeafText('odp-reason-diesel', reasonDiesel(sig, ev));
  setLeafText('odp-reason-curve', reasonCurve(sig, ev));
  setLeafText('odp-reason-refinery', reasonRefinery(sig, ev));
  setLeafText('odp-reason-spr', reasonSpr(sig));
  setLeafText('odp-reason-demand', reasonDemand(sig));
  setLeafText('odp-evidence-note', `物理链 = 馏分油库存 -> 裂解价差/炼厂开工 -> 商业原油库存 -> Brent 期限结构;8 个周度源来自 EIA WPSR(截至 ${crudeAsOf}),价格方向取布伦特近 ~4 周变动,期限结构为低置信公开代理;本层仅供参考,不参与平台的风险打分与决策。`);
  renderEvidenceList(ev);
}
