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

const CONFIDENCE_ZH = {
  low: '低 · 需交叉确认',
  moderate: '中 · 多源部分确认',
  high: '高 · 多源同向',
};

const REASON_IDS = [
  'odp-reason-inventory', 'odp-reason-diesel', 'odp-reason-curve',
  'odp-reason-refinery', 'odp-reason-spr', 'odp-reason-demand',
];
const LADDER_IDS = [
  'odp-ladder-core',
  'odp-ladder-market',
  'odp-ladder-global',
  'odp-ladder-watch',
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
  'odp-global-overlay-status',
  'odp-global-overlay-effect',
  'odp-global-overlay-supply',
  'odp-global-overlay-demand',
  'odp-global-overlay-transport',
  'odp-global-overlay-confidence',
  'odp-global-overlay-note',
  'odp-news-event-status',
  'odp-news-event-window',
  'odp-news-event-conflict',
  'odp-news-event-sanctions',
  'odp-news-event-headline-gate',
  'odp-news-event-source-health',
  'odp-news-event-market',
  'odp-news-event-title-risk',
  'odp-news-event-note',
  'odp-thermal-status',
  'odp-thermal-source',
  'odp-thermal-window',
  'odp-thermal-facility',
  'odp-thermal-signal',
  'odp-thermal-note',
  'odp-qc-ledger-status',
  'odp-qc-ledger-wpsr',
  'odp-qc-ledger-odp',
  'odp-qc-ledger-daily',
  'odp-qc-ledger-worker',
  'odp-qc-ledger-monthly',
  'odp-qc-ledger-note',
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
const EVENT_REGION_ZH = {
  india: '印度',
  ukraine: '乌克兰',
  indonesia: '印度尼西亚',
  palestine: '巴勒斯坦',
  mexico: '墨西哥',
  russia: '俄罗斯',
  lebanon: '黎巴嫩',
  nigeria: '尼日利亚',
  spain: '西班牙',
  colombia: '哥伦比亚',
  iran: '伊朗',
  iraq: '伊拉克',
  israel: '以色列',
  yemen: '也门',
  sudan: '苏丹',
  taiwan: '台湾',
  syria: '叙利亚',
  oman: '阿曼',
  kuwait: '科威特',
  qatar: '卡塔尔',
  'saudi arabia': '沙特',
  'united arab emirates': '阿联酋',
  'korea, north': '朝鲜',
};
const OIL_EVENT_WATCH_REGIONS = new Set([
  'iran',
  'iraq',
  'kuwait',
  'qatar',
  'saudi arabia',
  'united arab emirates',
  'oman',
  'yemen',
  'israel',
  'palestine',
  'lebanon',
  'syria',
  'russia',
  'ukraine',
  'nigeria',
]);
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
const EVIDENCE_ROLE_ORDER = [
  {
    role: 'core_physical_anchor',
    title: '核心物理锚',
    note: 'EIA WPSR 低噪声周度锚,是 ODP 判断链的主依据,用于校准更快但更嘈杂的信号。',
  },
  {
    role: 'market_confirmation',
    title: '市场确认',
    note: 'WTI / Brent / 裂解价差 / 期限结构为较快代理,只用于确认或背离周度物理链。',
  },
  {
    role: 'global_slow_variable',
    title: '全球慢变量',
    note: '月度或日度慢变量只解释供应缓冲和需求上限,不覆盖周度物理链。',
  },
  {
    role: 'high_frequency_watch',
    title: '高频观察层',
    note: '新闻、卫星与运输事件只提示人工观察,不确认断供、事故或油价方向。',
  },
  {
    role: 'data_quality',
    title: '数据质量',
    note: '时间戳、source health 和降级状态用于解释置信度,不生成方向判断。',
  },
];
const EVIDENCE_ROW_DEFS = [
  ['Brent 主显示', 'brentPrice'],
  ['WTI 市场代理', 'wtiPrice'],
  ['柴油裂解价差', 'crackSpread'],
  ['期限结构', 'curve'],
  ['原油库存(ex-SPR)', 'crudeStocksExSpr'],
  ['SPR 库存', 'sprStocks'],
  ['馏分油库存', 'distillateStocks'],
  ['汽油库存', 'gasolineStocks'],
  ['炼厂开工率', 'refineryUtilization'],
  ['炼厂原油投入', 'refinerCrudeInputs'],
  ['汽油 product supplied', 'demandGasolineSupplied'],
  ['馏分油 product supplied', 'demandDistillateSupplied'],
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
  return `${Math.abs(v) < 0.1 ? v.toFixed(2) : v.toFixed(1)} mbpd`;
}
function formatSignedMbpd(v) {
  if (!Number.isFinite(v)) return '—';
  const dp = Math.abs(v) < 0.1 ? 2 : 1;
  return `${signed(v, dp)} mbpd`;
}
function formatMbbl(v) {
  if (!Number.isFinite(v)) return '—';
  return `${fixed(v, 0)} mbbl`;
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
  setToneClass('odp-global-overlay-status', 'odp-global-overlay-status', '');
  setToneClass('odp-news-event-status', 'odp-news-event-status', '');
  setToneClass('odp-news-event-headline-gate', 'odp-news-headline-gate', '');
  setToneClass('odp-news-event-source-health', 'odp-news-source-health', '');
  setToneClass('odp-thermal-status', 'odp-thermal-status', '');
  setToneClass('odp-qc-ledger-status', 'odp-qc-ledger-status', '');
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
  const inventory = macroDrivers.energyInventoryBalance || {};
  const crude = evidence.crudeStocksExSpr || {};
  const gasoline = evidence.demandGasolineSupplied || {};
  const distillate = evidence.demandDistillateSupplied || {};
  const asOfText = alignment.dates.length === 1 ? alignment.dates[0] : (alignment.dates.length ? `${alignment.dates.length} 个日期` : '—');
  const spareStatus = spare.sourceStatus ? spare.sourceStatus.spareCapacity : null;
  const spareText = spareStatus === 'live' || spareStatus === 'fallback'
    ? `${formatMbpd(spare.spareCapacityMbpd)} · ${spare.latestPeriod || '—'} · ${spare.bufferRegime || '状态待核'}`
    : 'EIA STEO 闲置产能源暂不可用';
  const inventoryStatus = inventory.sourceStatus ? inventory.sourceStatus.inventoryBalance : null;
  const inventoryUsable = inventoryStatus === 'live' || inventoryStatus === 'fallback';
  const inventoryText = inventoryUsable
    ? `OECD商库 ${formatMbbl(inventory.oecdCommercialInventoryMbbl)} · YoY ${signed(inventory.oecdCommercialInventoryYoYMbbl)} mbbl · 全球净抽库 ${formatSignedMbpd(inventory.globalInventoryDrawMbpd)}`
    : '未接 OECD 商业库存 / 全球净库存变化';
  const globalDemandText = inventoryUsable
    ? `全球消费 ${formatMbpd(inventory.worldConsumptionMbpd)} · YoY ${formatSignedMbpd(inventory.worldConsumptionYoYMbpd)}`
    : '未接全球消费预测';
  const demandText = `美国汽油 ${pct(gasoline.vs5yAvgPct)} / 馏分油 ${pct(distillate.vs5yAvgPct)}`;
  const status = !alignment.aligned ? '周报源需降级' : inventoryUsable ? 'STEO 月度已接' : '需外部月度源';
  const tone = inventoryStatus === 'live' && alignment.aligned ? 'green' : 'yellow';

  setLeafText('odp-global-forecast-status', status);
  setToneClass('odp-global-forecast-status', 'odp-global-forecast-status', tone);
  setLeafText('odp-global-forecast-us-weekly', `${alignment.liveCount}/${alignment.total} 同周 live · 原油较5年 ${pct(crude.vs5yAvgPct)}`);
  setLeafText('odp-global-forecast-global-stocks', inventoryText);
  setLeafText('odp-global-forecast-demand', `${globalDemandText}; 美国周度 ${demandText}`);
  setLeafText('odp-global-forecast-buffer', spareText);
  setLeafText('odp-global-forecast-window', `周报截至 ${asOfText} · STEO 库存 ${inventory.latestPeriod || '—'} · 闲置 ${spare.latestPeriod || '—'}`);
  setLeafText('odp-global-forecast-note', inventoryUsable
    ? 'P6A 已接 EIA STEO OECD 商业库存、全球净库存变化与全球消费慢变量;可用于解释 Pulse 的 OECD 库存/全球需求叙事边界,但它仍是月度估算/预测,不是实时全球商业库存总量、OPEC 月报或油价预测。'
    : 'Pulse 的 OECD 库存低位、全球需求下修与 OPEC 月报属于全球月度/预测层;本站当前只能用美国 EIA 周报、EIA STEO 闲置产能和公开价格代理做边界解读,不能把外部新闻里的全球库存或需求预测当成站内已验证数据。');
}
const GLOBAL_OVERLAY_EFFECT_ZH = {
  confirms_false_down: '确认假性下跌',
  confirms_physical_tightness: '确认物理偏紧',
  caps_confidence_demand_watch: '需求下修封顶',
  event_risk_watch: '事件风险观察',
  neutral: '保持主判定',
  unavailable: '证据不足',
  insufficient_physical_data: '周度链不足',
};
const GLOBAL_OVERLAY_SUPPLY_ZH = {
  extremely_tight: '极紧缓冲',
  tight: '偏紧缓冲',
  neutral: '中性',
  unavailable: '源不可用',
};
const GLOBAL_OVERLAY_INVENTORY_ZH = {
  acute_draw: '全球急抽库',
  tight: '库存偏紧',
  neutral: '中性',
  unavailable: '源不可用',
};
const GLOBAL_OVERLAY_DEMAND_ZH = {
  demand_break_confirmed: '需求破坏已确认',
  downshift_watch: '需求下修观察',
  neutral: '未确认需求破坏',
  unavailable: '源不可用',
};
const GLOBAL_OVERLAY_TRANSPORT_ZH = {
  chokepoint_watch_low_confidence: '咽喉观察(低置信)',
  normal: '未触发',
  unavailable: '源不可用',
};
const GLOBAL_OVERLAY_CONFIDENCE_ZH = {
  flat: '不调整',
  up: '上调',
  up_with_demand_cap: '上调但受需求下修封顶',
  down: '下调',
};
function overlayTone(effect) {
  return ({
    confirms_false_down: 'red',
    confirms_physical_tightness: 'yellow',
    caps_confidence_demand_watch: 'yellow',
    event_risk_watch: 'yellow',
    neutral: 'green',
  })[effect] || '';
}
function isUsableEnergyStatus(status) {
  return status === 'live' || status === 'fallback';
}
function lteNumber(value, threshold) {
  const n = firstNumber(value);
  return n !== null && n <= threshold;
}
function gteNumber(value, threshold) {
  const n = firstNumber(value);
  return n !== null && n >= threshold;
}
function deriveDisplayGlobalOverlay(oilData, radarData) {
  const artifactOverlay = oilData?.interpretation?.globalOverlay;
  if (artifactOverlay && typeof artifactOverlay === 'object') return { ...artifactOverlay, displaySource: 'artifact' };

  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  const inventory = macroDrivers.energyInventoryBalance || {};
  const spare = macroDrivers.energySpareCapacity || {};
  const transport = macroDrivers.energyTransport || {};
  const invUsable = isUsableEnergyStatus(inventory.sourceStatus?.inventoryBalance);
  const spareUsable = isUsableEnergyStatus(spare.sourceStatus?.spareCapacity);
  const transportUsable = isUsableEnergyStatus(transport.sourceStatus?.chokepoints);
  if (!invUsable && !spareUsable && !transportUsable) return null;

  const oecdTight = invUsable && (
    lteNumber(inventory.oecdCommercialInventoryVs5yPct, -5)
    || lteNumber(inventory.oecdCommercialInventoryYoYMbbl, -150)
  );
  const globalDraw = invUsable && (
    gteNumber(inventory.globalInventoryDrawMbpd, 1)
    || gteNumber(inventory.globalInventoryDraw3mAvgMbpd, 1)
  );
  const spareTight = spareUsable && (
    lteNumber(spare.spareCapacityMbpd, 1)
    || spare.bufferRegime === '极低缓冲'
    || spare.bufferRegime === '偏低'
  );
  const confirmationCount = [oecdTight, globalDraw, spareTight].filter(Boolean).length;
  const demandDownshift = invUsable && lteNumber(inventory.worldConsumptionYoYMbpd, -1);
  const hormuz = transport.chokepoints?.hormuz || {};
  const cape = transport.chokepoints?.capeGoodHope || {};
  const chokepointWatch = transportUsable && (
    lteNumber(hormuz.capacityTankerVs30dPct, -0.4)
    || lteNumber(hormuz.latestVs30dPct, -0.4)
  ) && (
    gteNumber(cape.latestVs30dPct, 0.3)
    || transport.reroutingProxy?.redSeaToCapeRegime === 'rerouting_watch'
  );
  const effect = oilData?.finalBias === 'false_down_physical_stress' && confirmationCount >= 2
    ? 'confirms_false_down'
    : confirmationCount >= 2
      ? 'confirms_physical_tightness'
      : demandDownshift
        ? 'caps_confidence_demand_watch'
        : chokepointWatch
          ? 'event_risk_watch'
          : 'neutral';
  const drivers = [];
  const reasons = [];
  if (oecdTight) { drivers.push('oecdCommercialInventory'); reasons.push('OECD 商业库存低于同期或同比明显下降。'); }
  if (globalDraw) { drivers.push('globalInventoryDraw'); reasons.push('全球净库存变化显示抽库。'); }
  if (spareTight) { drivers.push('opecSpareCapacity'); reasons.push('OPEC 闲置产能缓冲偏薄。'); }
  if (demandDownshift) { drivers.push('globalDemandDownshift'); reasons.push('全球消费预测同比下修,对上行压力形成置信上限。'); }
  if (chokepointWatch) { drivers.push('transportChokepoint'); reasons.push('PortWatch 咽喉代理触发低置信事件风险观察,不确认暗航行或封锁。'); }
  if (!reasons.length) reasons.push('Daily 慢变量未给出足够同向确认,保持周度物理链主判定。');
  return {
    status: 'active',
    effect,
    supplyBuffer: lteNumber(spare.spareCapacityMbpd, 0.5) || spare.bufferRegime === '极低缓冲' ? 'extremely_tight' : (spareTight ? 'tight' : (spareUsable ? 'neutral' : 'unavailable')),
    inventoryBalance: gteNumber(inventory.globalInventoryDrawMbpd, 3) ? 'acute_draw' : ((oecdTight || globalDraw) ? 'tight' : (invUsable ? 'neutral' : 'unavailable')),
    demandState: demandDownshift ? 'downshift_watch' : (invUsable ? 'neutral' : 'unavailable'),
    transportRisk: chokepointWatch ? 'chokepoint_watch_low_confidence' : (transportUsable ? 'normal' : 'unavailable'),
    confirmationCount,
    confidenceAdjustment: (effect === 'confirms_false_down' || effect === 'confirms_physical_tightness')
      ? (demandDownshift ? 'up_with_demand_cap' : 'up')
      : effect === 'caps_confidence_demand_watch' ? 'down' : 'flat',
    confidence: demandDownshift ? 'low' : (confirmationCount >= 2 ? 'moderate' : 'low'),
    drivers,
    reasons,
    sourceWindows: {
      inventoryPeriod: inventory.latestPeriod || null,
      sparePeriod: spare.latestPeriod || null,
      transportDate: transport.latestDate || null,
    },
    displaySource: 'daily_fallback',
  };
}
function renderGlobalOverlay(oilData, radarData) {
  const overlay = deriveDisplayGlobalOverlay(oilData, radarData);
  if (!overlay) {
    setLeafText('odp-global-overlay-status', '待 ODP 刷新');
    setLeafText('odp-global-overlay-effect', '证据不足');
    setLeafText('odp-global-overlay-supply', '—');
    setLeafText('odp-global-overlay-demand', '—');
    setLeafText('odp-global-overlay-transport', '—');
    setLeafText('odp-global-overlay-confidence', '不调整');
    setLeafText('odp-global-overlay-note', 'P6B 全球确认层需要 ODP artifact 或 Daily 慢变量;缺失时不替代周度物理链主判定。');
    return;
  }
  const tone = overlayTone(overlay.effect);
  const status = overlay.displaySource === 'daily_fallback'
    ? 'Daily 回填'
    : overlay.status === 'active' ? '已接入' : overlay.status === 'not_evaluated' ? '暂不评估' : '源不可用';
  const windows = overlay.sourceWindows || {};
  const sourceText = overlay.displaySource === 'daily_fallback'
    ? 'ODP artifact 尚未含 P6B overlay;本区用 Daily 慢变量做只读回填,下次 ODP build 后以 artifact 为准。'
    : 'P6B overlay 来自 ODP artifact,仅确认/降级解释,不改变平台风险打分与执行判断。';
  const reasonText = Array.isArray(overlay.reasons) && overlay.reasons.length ? overlay.reasons.join(' ') : '保持周度物理链主判定。';

  setLeafText('odp-global-overlay-status', status);
  setToneClass('odp-global-overlay-status', 'odp-global-overlay-status', tone);
  setLeafText('odp-global-overlay-effect', GLOBAL_OVERLAY_EFFECT_ZH[overlay.effect] || '—');
  setLeafText('odp-global-overlay-supply', `${GLOBAL_OVERLAY_SUPPLY_ZH[overlay.supplyBuffer] || '—'} / ${GLOBAL_OVERLAY_INVENTORY_ZH[overlay.inventoryBalance] || '—'} · ${overlay.confirmationCount || 0}/3 确认`);
  setLeafText('odp-global-overlay-demand', GLOBAL_OVERLAY_DEMAND_ZH[overlay.demandState] || '—');
  setLeafText('odp-global-overlay-transport', GLOBAL_OVERLAY_TRANSPORT_ZH[overlay.transportRisk] || '—');
  setLeafText('odp-global-overlay-confidence', `${GLOBAL_OVERLAY_CONFIDENCE_ZH[overlay.confidenceAdjustment] || '不调整'} · ${overlay.confidence || 'low'}`);
  setLeafText('odp-global-overlay-note', `${reasonText} 期别:库存 ${windows.inventoryPeriod || '—'} / 闲置 ${windows.sparePeriod || '—'} / PortWatch ${windows.transportDate || '—'}。${sourceText}`);
}
function eventSourceStatusZh(status) {
  return ({
    ok: '已接入',
    stale: '沿用缓存',
    error: '源不可用',
    manual_required: '等待手动源',
    not_configured: '未配置',
    disabled: '未启用',
  })[status] || '源不可用';
}
function eventRegionName(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.key === 'string') return value.key.trim();
  return '';
}
function eventRegionZh(value) {
  const key = eventRegionName(value);
  if (!key) return '';
  return EVENT_REGION_ZH[key.toLowerCase()] || key;
}
function uniqueEventRegions(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const key = eventRegionName(value);
    const normalized = key.toLowerCase();
    if (!key || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(key);
  }
  return out;
}
function renderLegacyOilEventNewsLayer(worldOrderStressData) {
  const gdelt = worldOrderStressData?.externalSources?.gdelt || {};
  const summary = gdelt.summary && typeof gdelt.summary === 'object' ? gdelt.summary : {};
  const status = typeof gdelt.status === 'string' ? gdelt.status : '';
  const conflictEvents = Math.max(0, Math.round(firstNumber(summary.conflictEvents, summary.totalEvents, summary.totalArticles) ?? 0));
  const sanctionsEvents = Math.max(0, Math.round(firstNumber(summary.sanctionsEvents) ?? 0));
  const chokepointEvents = Math.max(0, Math.round(firstNumber(summary.blockadeOrChokepointEvents) ?? 0));
  const totalArticles = Math.max(0, Math.round(firstNumber(summary.totalArticles, summary.totalEvents) ?? 0));
  const keyConflictRegions = uniqueEventRegions(summary.keyConflictRegions);
  const visibleRegions = uniqueEventRegions([
    ...keyConflictRegions,
    ...(Array.isArray(summary.regionsCovered) ? summary.regionsCovered : []),
    ...(Array.isArray(summary.topCountries) ? summary.topCountries : []),
  ]);
  const oilWatchRegions = visibleRegions.filter((region) => OIL_EVENT_WATCH_REGIONS.has(region.toLowerCase()));
  const regionText = visibleRegions.slice(0, 4).map(eventRegionZh).filter(Boolean).join(' / ') || '—';
  const oilRegionText = oilWatchRegions.slice(0, 4).map(eventRegionZh).filter(Boolean).join(' / ');
  const fetchedAt = formatUtcMinute(gdelt.lastFetchedAt || summary.attemptedAt);
  const cached = summary.usedCachedSummary === true ? ' · 缓存' : '';
  const marketInput = worldOrderStressData?.marketConfirmationInput || {};
  const marketBrent = firstNumber(marketInput.brent);
  const marketAge = Number.isFinite(marketInput.ageMinutes) ? ` · ${Math.round(marketInput.ageMinutes)} 分钟龄` : '';
  const marketAt = marketAge || (formatUtcMinute(marketInput.updatedAt) ? ` · ${formatUtcMinute(marketInput.updatedAt)}` : '');
  const marketText = Number.isFinite(marketBrent)
    ? `Brent ${formatUsd(marketBrent)}${marketAt}`
    : '市场确认暂不可用';

  let statusText = eventSourceStatusZh(status);
  let tone = '';
  if (status === 'ok' && (chokepointEvents > 0 || sanctionsEvents > 0 || oilWatchRegions.length > 0 || conflictEvents > 0)) {
    statusText = '广义事件观察';
    tone = 'yellow';
  } else if (status === 'ok') {
    statusText = '未见事件压力';
    tone = 'green';
  } else if (status === 'stale') {
    tone = 'yellow';
  }

  const eventContext = oilRegionText
    ? `重点地区含 ${oilRegionText},作为能源事件背景观察。`
    : '未从广义摘要中识别出重点能源地区。';
  const directContext = chokepointEvents > 0 || sanctionsEvents > 0
    ? `制裁 ${sanctionsEvents} / 通道 ${chokepointEvents} 条需人工核验。`
    : '当前摘要未给出制裁或通道中断的直接计数。';

  setLeafText('odp-news-event-status', statusText);
  setToneClass('odp-news-event-status', 'odp-news-event-status', tone);
  setLeafText('odp-news-event-window', `${fetchedAt || '—'}${cached} · ${totalArticles} 条报道代理`);
  setLeafText('odp-news-event-conflict', `${conflictEvents} 条 · ${regionText}`);
  setLeafText('odp-news-event-sanctions', `制裁 ${sanctionsEvents} / 通道 ${chokepointEvents}`);
  setLeafText('odp-news-event-headline-gate', '专用闸门未接入');
  setToneClass('odp-news-event-headline-gate', 'odp-news-headline-gate', 'yellow');
  setLeafText('odp-news-event-source-health', '广义 GDELT 摘要 · 专用三源未接入');
  setToneClass('odp-news-event-source-health', 'odp-news-source-health', 'yellow');
  setLeafText('odp-news-event-market', marketText);
  setLeafText('odp-news-event-title-risk', '缺专用标题风险字段 · 不展示标题原文');
  setLeafText('odp-news-event-note', `本层复用已有 GDELT 广义新闻事件摘要,用于提示油价相关地缘背景是否需要观察;它不是 ODP 专用新闻 API,也不确认霍尔木兹通道中断、断供或船舶级流向。${eventContext}${directContext}后续只有与价格结构、咽喉转运、库存/供需锚点和卫星/设施事件同时印证时,才提高事件观察置信度。`);
}
function newsEventTone(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.signalState === 'elevated_manual_review') return 'red';
  if (data.signalState === 'watch' || data.status === 'partial' || data.status === 'source_unavailable') return 'yellow';
  if (data.signalState === 'quiet' || data.status === 'ok') return 'green';
  return '';
}
function newsBucketCount(data, key) {
  const value = data?.buckets?.[key]?.articleCount;
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
const NEWS_SOURCE_HEALTH_FIELDS = [
  ['gdeltDoc', 'GDELT'],
  ['tavily', 'Tavily'],
  ['brave', 'Brave'],
];
function newsSourceStateZh(status) {
  return ({
    live: '可用',
    partial: '部分可用',
    error: '降级',
    not_configured: '未配置',
    not_queried: '未查询',
    dry_run: '演练',
  })[status] || '待核';
}
function newsSourceCount(data) {
  return Array.isArray(data?.sources) && data.sources.length > 0
    ? data.sources.length
    : NEWS_SOURCE_HEALTH_FIELDS.length;
}
function newsDegradedSources(data) {
  const status = data?.sourceStatus || {};
  return NEWS_SOURCE_HEALTH_FIELDS
    .map(([key, label]) => ({ label, state: status[key] }))
    .filter((source) => source.state && source.state !== 'live')
    .map((source) => `${source.label}${newsSourceStateZh(source.state)}`);
}
function newsQueryCoverageText(data) {
  const coverage = data?.queryCoverage || {};
  const queryCount = Number.isFinite(coverage.queryCount) ? Math.round(coverage.queryCount) : null;
  const successCount = Number.isFinite(coverage.querySuccessCount) ? Math.round(coverage.querySuccessCount) : null;
  if (!queryCount || successCount === null) return '查询覆盖待核';
  return `查询 ${successCount}/${queryCount} 成功`;
}
function newsSourceHealthText(data) {
  const total = newsSourceCount(data);
  const liveSources = Number.isFinite(data?.aggregate?.liveSourceCount)
    ? Math.round(data.aggregate.liveSourceCount)
    : 0;
  const configured = Number.isFinite(data?.aggregate?.configuredSourceCount)
    ? Math.round(data.aggregate.configuredSourceCount)
    : null;
  const configuredText = configured !== null && configured < total ? ` · ${configured}/${total} 已配置` : '';
  const degraded = newsDegradedSources(data);
  const degradedText = degraded.length ? degraded.join('、') : '三源正常';
  const closedText = data?.status === 'source_unavailable' ? ' · 失败关闭' : '';
  return `公开源 ${liveSources}/${total} 可用${configuredText} · ${newsQueryCoverageText(data)} · ${degradedText}${closedText}`;
}
function newsSourceHealthTone(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.status === 'ok') return 'green';
  if (data.status === 'partial' || data.status === 'source_unavailable' || data.status === 'not_configured') return 'yellow';
  return '';
}
function newsFallbackContextText(data) {
  if (!data || typeof data !== 'object') return '来源状态待核;观察层不补推断。';
  if (data.status === 'source_unavailable') {
    return '本轮新闻源不可用,观察层失败关闭,不沿用旧报道或单一路径推断事件压力。';
  }
  if (data.status === 'not_configured') {
    return '新闻源尚未完整配置,只保留背景观察,不提高事件置信度。';
  }
  if (data.status === 'partial') {
    const degraded = newsDegradedSources(data);
    const degradedText = degraded.length ? `${degraded.join('、')}。` : '部分来源降级。';
    return `${degradedText}本层仍需多源重合与市场/物理信号交叉核验,不把单一路径报道写成确认事件。`;
  }
  if (data.status === 'ok') {
    return '三路新闻索引均可用,但新闻层仍只是事件代理,需要与市场/物理证据交叉核验。';
  }
  return '来源状态待核;观察层不补推断。';
}
function newsWindowText(data) {
  const freshness = data?.freshness || {};
  const windowDays = Number.isFinite(freshness.windowDays) ? `${freshness.windowDays}天窗` : '窗口待核';
  const latest = formatUtcMinute(freshness.latestArticleAt);
  const generated = formatUtcMinute(data?.generatedAt);
  const age = Number.isFinite(freshness.latestArticleAgeHours) ? ` · ${freshness.latestArticleAgeHours}小时龄` : '';
  return `${windowDays} · ${latest || generated || '—'}${age}`;
}
function headlineReadinessText(data) {
  const readiness = data?.headlineDisplayReadiness || {};
  if (readiness.displayHeadlinesApproved === true) return '异常 · 标题批准';
  return ({
    not_ready_high_claim_title_noise: '未批准 · 标题噪声',
    not_ready_source_unavailable: '未批准 · 源不可用',
    dry_run_not_ready: '未批准 · 演练模式',
    candidate_ready_for_review: '待审阅 · 未批准',
  })[readiness.state] || '未批准 · 待复核';
}
function headlineReadinessTone(data) {
  const readiness = data?.headlineDisplayReadiness || {};
  if (readiness.displayHeadlinesApproved === true) return 'red';
  if (readiness.state === 'not_ready_high_claim_title_noise' || readiness.state === 'not_ready_source_unavailable') return 'yellow';
  if (readiness.state === 'candidate_ready_for_review' || readiness.state === 'dry_run_not_ready') return 'yellow';
  return '';
}
function titleRiskText(data) {
  const titleRisk = data?.titleRisk || {};
  const evaluated = Number.isFinite(titleRisk.evaluatedArticleCount) ? Math.round(titleRisk.evaluatedArticleCount) : null;
  const highClaim = Number.isFinite(titleRisk.highClaimTitleCount) ? Math.round(titleRisk.highClaimTitleCount) : null;
  const domains = Number.isFinite(titleRisk.highClaimDomainCount) ? Math.round(titleRisk.highClaimDomainCount) : null;
  if (evaluated === null || highClaim === null) return '标题风险未计算 · 不展示标题原文';
  const domainText = domains === null ? '域名待核' : `${domains} 个来源域`;
  return `${highClaim}/${evaluated} 条高主张标题 · ${domainText} · 不展示标题原文`;
}
function renderOilEventNewsLayer(oilNewsEventWatchData, worldOrderStressData) {
  const data = oilNewsEventWatchData && oilNewsEventWatchData.schemaVersion === 'oil-news-event-watch-1'
    ? oilNewsEventWatchData
    : null;
  if (!data) {
    renderLegacyOilEventNewsLayer(worldOrderStressData);
    return;
  }

  const chokepoint = newsBucketCount(data, 'chokepoint');
  const supply = newsBucketCount(data, 'supply_disruption');
  const facility = newsBucketCount(data, 'facility_event');
  const sanctions = newsBucketCount(data, 'sanctions');
  const shipping = newsBucketCount(data, 'tanker_shipping');
  const middleEast = newsBucketCount(data, 'middle_east_risk');
  const marketReaction = newsBucketCount(data, 'market_reaction');
  const confidence = data.aggregate?.confidence || 'none';
  const unique = Number.isFinite(data.aggregate?.uniqueArticleCount) ? Math.round(data.aggregate.uniqueArticleCount) : 0;
  const marketInput = worldOrderStressData?.marketConfirmationInput || {};
  const marketBrent = firstNumber(marketInput.brent);
  const marketAge = Number.isFinite(marketInput.ageMinutes) ? ` · ${Math.round(marketInput.ageMinutes)} 分钟龄` : '';
  const marketAt = marketAge || (formatUtcMinute(marketInput.updatedAt) ? ` · ${formatUtcMinute(marketInput.updatedAt)}` : '');
  const brentText = Number.isFinite(marketBrent)
    ? `Brent ${formatUsd(marketBrent)}${marketAt}`
    : 'Brent 市场确认暂不可用';
  const stateText = data.displayStatusZh || '观察层已接入';

  setLeafText('odp-news-event-status', stateText);
  setToneClass('odp-news-event-status', 'odp-news-event-status', newsEventTone(data));
  setLeafText('odp-news-event-window', `${newsWindowText(data)} · ${unique} 条专用报道代理`);
  setLeafText('odp-news-event-conflict', `通道 ${chokepoint} / 供应 ${supply} / 设施 ${facility} · 中东 ${middleEast}`);
  setLeafText('odp-news-event-sanctions', `制裁 ${sanctions} / 航运 ${shipping}`);
  setLeafText('odp-news-event-headline-gate', headlineReadinessText(data));
  setToneClass('odp-news-event-headline-gate', 'odp-news-headline-gate', headlineReadinessTone(data));
  setLeafText('odp-news-event-source-health', newsSourceHealthText(data));
  setToneClass('odp-news-event-source-health', 'odp-news-source-health', newsSourceHealthTone(data));
  setLeafText('odp-news-event-market', `市场反应 ${marketReaction} 条 · ${brentText}`);
  setLeafText('odp-news-event-title-risk', titleRiskText(data));
  setLeafText('odp-news-event-note', `${data.aggregate?.reasonZh || '专用油价新闻层暂不可用。'}${newsFallbackContextText(data)}本区读取 production read-only oil-news event watch(GDELT/Tavily/Brave),置信度 ${confidence};标题只做聚合风险闸门,不展示原文标题。它不确认霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向。只有与价格结构、库存/供需锚点、咽喉转运和卫星/设施事件同时印证时,才适合提高人工观察置信度。`);
}
function thermalTone(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.status === 'source_unavailable') return 'yellow';
  if (data.status === 'not_configured') return 'yellow';
  if (data.signalState === 'baseline_elevated_repeated_watch') return 'yellow';
  if (data.signalState === 'baseline_repeated_watch') return 'yellow';
  if (data.signalState === 'baseline_building_elevated_watch') return 'yellow';
  if (data.status === 'ok' || data.status === 'partial') return 'green';
  return '';
}
function thermalWindowText(data) {
  if (!data || typeof data !== 'object') return '分钟至数小时级 · 数据未加载';
  const freshness = data.freshness || {};
  const latest = formatUtcMinute(freshness.latestAcqAt);
  const age = Number.isFinite(freshness.latestAgeHours) ? ` · ${freshness.latestAgeHours}小时龄` : '';
  const windowDays = Number.isFinite(freshness.windowDays) ? `${freshness.windowDays}天窗` : '窗口待核';
  return latest ? `${windowDays} · ${latest}${age}` : `${windowDays} · 尚未查询设施热异常`;
}
function thermalFacilityText(data) {
  const coverage = data && data.facilityCoverage ? data.facilityCoverage : {};
  const count = Number.isFinite(coverage.facilityCount) ? coverage.facilityCount : 0;
  const regions = Array.isArray(coverage.regions) && coverage.regions.length ? ` · ${coverage.regions.join('/')}` : '';
  const status = coverage.whitelistStatus === 'configured' ? '白名单已配置' : '白名单待建';
  return `${count} 个设施 · ${status}${regions}`;
}
function thermalSignalText(data) {
  const aggregate = data && data.aggregate ? data.aggregate : {};
  const baseline = data && data.baseline ? data.baseline : {};
  const rowCount = Number.isFinite(aggregate.rowCount) ? aggregate.rowCount : 0;
  const high = Number.isFinite(aggregate.highConfidenceCount) ? aggregate.highConfidenceCount : 0;
  const maxFrp = Number.isFinite(aggregate.maxFrp) ? aggregate.maxFrp.toFixed(1) : '—';
  const facilities = Number.isFinite(aggregate.facilitiesWithDetections) ? aggregate.facilitiesWithDetections : 0;
  const repeated = Number.isFinite(aggregate.repeatedObservationCount) ? aggregate.repeatedObservationCount : 0;
  const elevated = Number.isFinite(aggregate.elevatedRepeatedObservationCount) ? aggregate.elevatedRepeatedObservationCount : 0;
  const established = Number.isFinite(baseline.facilitiesWithEstablishedBaseline) ? baseline.facilitiesWithEstablishedBaseline : 0;
  const baselineStatus = aggregate.baselineStatus || baseline.status;
  const baselineText = ({
    established: `基线已建立 ${established}/${baseline.facilityCount || 0}`,
    partial: `部分基线 ${established}/${baseline.facilityCount || 0}`,
    missing: '基线配置缺失',
    not_established: '基线建立中'
  })[baselineStatus] || '基线待核';
  const repeatedText = repeated > 0 ? ` · 重复观察 ${repeated}${elevated > 0 ? ` / 升高 ${elevated}` : ''}` : ' · 未达重复观测';
  return `${rowCount} 条聚合热异常 · 高置信 ${high} · max FRP ${maxFrp} · ${facilities} 个设施有检出 · ${baselineText}${repeatedText}`;
}
function thermalNoteText(data) {
  if (!data || typeof data !== 'object') {
    return '卫星热异常观察层数据未加载;本区不读取浏览器外部源,不确认炼厂事故、供应中断或油价预测。';
  }
  if (data.signalState === 'facility_whitelist_missing' || data.signalState === 'map_key_or_facility_missing') {
    return 'FIRMS 生产观察层已建好读取口径,但 committed 设施坐标白名单仍为空;下一步需要把炼厂/终端小 bbox、sourceNote 与历史基线规则补齐后才会查询设施热异常。';
  }
  if (data.signalState === 'map_key_missing') {
    return 'FIRMS 生产观察层已建好,但本轮未检测到 MAP_KEY;GitHub Secret 或本地 key 配好后才会查询设施白名单。';
  }
  if (data.signalState === 'source_unavailable') {
    return 'FIRMS 本轮查询失败或全部源不可用;保持 fail-closed,不沿用为事故、断供或油价方向判断。';
  }
  if (data.signalState === 'baseline_elevated_repeated_watch' || data.signalState === 'baseline_repeated_watch') {
    return '设施热异常同时满足历史基线超阈值与多源重复观测,需要人工复核;它仍不确认炼厂事故、供应中断或油价预测,也不改变 ODP 方向判断。';
  }
  if (data.signalState === 'baseline_established_no_detections' || data.signalState === 'baseline_established_no_repeated_signal') {
    return '设施热异常观察已接入基线解释框架,但本轮未满足超基线强度与多源重复观测的组合条件;不确认炼厂事故、供应中断或油价预测。';
  }
  const elevated = data.signalState === 'baseline_building_elevated_watch';
  const prefix = elevated ? '设施热异常聚合出现基线建立期升高观察,需要人工复核。' : '设施热异常聚合已接入生产只读观察层。';
  return `${prefix}历史基线样本不足前,这些计数只能作为热源/火炬代理,不确认炼厂事故、供应中断或油价预测,也不改变 ODP 方向判断。`;
}
function renderSatelliteThermalWatch(oilThermalWatchData) {
  const data = oilThermalWatchData && typeof oilThermalWatchData === 'object' ? oilThermalWatchData : null;
  const sourceStatus = data?.sourceStatus?.firms ? ` · FIRMS ${data.sourceStatus.firms}` : '';
  setLeafText('odp-thermal-status', data?.displayStatusZh || '数据未加载');
  setToneClass('odp-thermal-status', 'odp-thermal-status', thermalTone(data));
  setLeafText('odp-thermal-source', `NASA FIRMS / VIIRS NRT · production read-only${sourceStatus}`);
  setLeafText('odp-thermal-window', thermalWindowText(data));
  setLeafText('odp-thermal-facility', thermalFacilityText(data));
  setLeafText('odp-thermal-signal', thermalSignalText(data));
  setLeafText('odp-thermal-note', thermalNoteText(data));
}
function renderDataQcLedger(oilData, radarData, worldOrderStressData) {
  const evidence = oilData && oilData.evidence ? oilData.evidence : {};
  const alignment = wpsrAlignment(evidence);
  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  const marketInput = worldOrderStressData && worldOrderStressData.marketConfirmationInput
    ? worldOrderStressData.marketConfirmationInput
    : {};
  const spare = macroDrivers.energySpareCapacity || {};
  const inventory = macroDrivers.energyInventoryBalance || {};
  const transport = macroDrivers.energyTransport || {};
  const asOfText = alignment.dates.length === 1 ? alignment.dates[0] : (alignment.dates.length ? `${alignment.dates.length} 个日期` : '—');
  const workerAt = formatUtcMinute(marketInput.updatedAt);
  const workerBrent = Number.isFinite(marketInput.brent) ? ` · Brent ${formatUsd(marketInput.brent)}` : '';
  const workerAge = Number.isFinite(marketInput.ageMinutes) ? ` · ${Math.round(marketInput.ageMinutes)} 分钟龄` : '';
  const status = alignment.aligned && oilData?.builtAt && radarData?.updatedAt && marketInput.updatedAt
    ? '时点已标注'
    : '时点需降级';
  const tone = status === '时点已标注' ? 'yellow' : '';

  setLeafText('odp-qc-ledger-status', status);
  setToneClass('odp-qc-ledger-status', 'odp-qc-ledger-status', tone);
  setLeafText('odp-qc-ledger-wpsr', `${alignment.liveCount}/${alignment.total} 同周 live · ${asOfText}`);
  setLeafText('odp-qc-ledger-odp', formatUtcMinute(oilData?.builtAt) || '—');
  setLeafText('odp-qc-ledger-daily', formatUtcMinute(radarData?.updatedAt) || '—');
  setLeafText('odp-qc-ledger-worker', `${workerAt || '—'}${workerBrent}${workerAge}`);
  setLeafText('odp-qc-ledger-monthly', `STEO 库存 ${inventory.latestPeriod || '—'} / 闲置 ${spare.latestPeriod || '—'} · PortWatch ${transport.latestDate || '—'}`);
  setLeafText('odp-qc-ledger-note', 'EIA 周报、ODP 构建、Daily 快照、Worker 市场确认、STEO 与 PortWatch 慢变量不在同一时间边界;本区只做时间戳核对和降噪提示,不重算信号,不改变风险打分或决策。');
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
function renderEnergyAddendum(radarData, worldOrderStressData, oilData, oilThermalWatchData, oilNewsEventWatchData) {
  clearEnergyAddendum();
  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  renderBrentBasisCheck(radarData, worldOrderStressData);
  renderPulseFactorCheck(oilData, radarData, worldOrderStressData);
  renderGlobalForecastGap(oilData, radarData);
  renderGlobalOverlay(oilData, radarData);
  renderOilEventNewsLayer(oilNewsEventWatchData, worldOrderStressData);
  renderSatelliteThermalWatch(oilThermalWatchData);
  renderDataQcLedger(oilData, radarData, worldOrderStressData);
  renderSpareCapacity(macroDrivers.energySpareCapacity);
  renderEnergyTransport(macroDrivers.energyTransport);
  setLeafText('odp-energy-source-boundary', '边界:Brent 口径校验、Pulse 三因子校验、OECD 库存/全球净抽库、P6B 全球确认层、新闻事件观察、卫星热异常观察、数据时点/QC、OPEC 闲置产能与咽喉转运均为仅供参考的能源观察层,不参与平台的风险打分与决策。');
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

function sourceStatusShort(status) {
  return ({
    live: 'live',
    fallback: 'fallback',
    stale: 'stale',
    missing: 'missing',
  })[status] || 'missing';
}
function evidenceValueText(e) {
  if (!e || typeof e !== 'object') return '—';
  if (Number.isFinite(e.value)) {
    if (e.unit === '$/bbl') return `$${e.value.toFixed(2)}/bbl`;
    if (e.unit === 'percent') return `${fixed(e.value, 1)}%`;
    return `${Math.round(e.value)} ${e.unit || ''}`.trim();
  }
  if (Number.isFinite(e.frontMinusBack)) return `前-后 ${signed(e.frontMinusBack, 2)}`;
  if (e.slopeRegime) return e.slopeRegime;
  return '—';
}
function evidenceChangeText(e) {
  if (!e || typeof e !== 'object') return '—';
  if (Number.isFinite(e.change4w)) return `4w ${signed(e.change4w, e.unit === 'percent' ? 1 : 0)}`;
  if (Number.isFinite(e.frontMinusBack)) return `状态 ${e.slopeRegime || '—'}`;
  return sourceStatusShort(e.sourceStatus);
}
function evidenceFreshnessText(e) {
  if (!e || typeof e !== 'object') return '—';
  const asOf = compactDate(e.asOfDate) || '—';
  const age = Number.isFinite(e.ageDays) ? `${Math.round(e.ageDays)}天龄` : '时点待核';
  return `${sourceStatusShort(e.sourceStatus)} · ${asOf} · ${age}`;
}
function evidenceRoleText(e) {
  if (!e || typeof e !== 'object') return '—';
  const tier = e.latencyTierZh || e.latencyTier || '未分级';
  const use = e.directionalUse || e.sourceRole || '用途待核';
  return `${tier} · ${use}`;
}
function curveRegimeZh(regime) {
  return ({
    backwardation: 'backwardation(现货偏紧)',
    contango: 'contango(远月溢价)',
    flat: '近似平坦',
  })[regime] || (regime || '期限结构待核');
}
function buildCoreLadderText(it, ev, crudeAsOf) {
  const physical = PHYSICAL_BIAS_ZH[it.physicalBias] || '物理判断待核';
  const sufficiency = DATA_SUFFICIENCY_ZH[it.dataSufficiency] || '数据充分度待核';
  const crude = ev.crudeStocksExSpr || {};
  const distillate = ev.distillateStocks || {};
  const crudeTight = Number.isFinite(crude.vs5yAvgPct) ? `原油较5年 ${pct(crude.vs5yAvgPct)}` : '原油库存待核';
  const distillateTight = Number.isFinite(distillate.vs5yAvgPct) ? `馏分油较5年 ${pct(distillate.vs5yAvgPct)}` : '馏分油库存待核';
  return `${physical} · ${sufficiency}; EIA 周度锚截至 ${crudeAsOf || '—'}, ${crudeTight}, ${distillateTight}。`;
}
function buildMarketLadderText(it, sig, ev) {
  const pc = sig?.priceContext || {};
  const brentMove = Number.isFinite(pc.brentChangePct4w) ? `Brent 近4周 ${pct(pc.brentChangePct4w, 1)}` : 'Brent 近4周方向待核';
  const curve = ev.curve || {};
  const curveText = curveRegimeZh(pc.curveSlopeRegime || curve.slopeRegime);
  const divergence = DIVERGENCE_ZH[it.divergence] || '背离待核';
  return `${brentMove} · ${curveText}; ${divergence},市场层只确认或背离物理链。`;
}
function buildGlobalLadderText(it) {
  const overlay = it.globalOverlay && typeof it.globalOverlay === 'object' ? it.globalOverlay : null;
  if (!overlay || overlay.status !== 'active') return '全球库存、闲置产能与咽喉转运慢变量证据不足,保持周度物理链主判定。';
  const effect = GLOBAL_OVERLAY_EFFECT_ZH[overlay.effect] || '保持主判定';
  const supply = GLOBAL_OVERLAY_SUPPLY_ZH[overlay.supplyBuffer] || '供应缓冲待核';
  const demand = GLOBAL_OVERLAY_DEMAND_ZH[overlay.demandState] || '需求待核';
  const confidence = GLOBAL_OVERLAY_CONFIDENCE_ZH[overlay.confidenceAdjustment] || '不调整';
  return `${effect} · ${supply} · ${demand}; 置信修正: ${confidence},不新增方向枚举。`;
}
function buildWatchLadderText(oilThermalWatchData, oilNewsEventWatchData) {
  const newsText = oilNewsEventWatchData?.displayStatusZh
    || newsSourceHealthText(oilNewsEventWatchData)
    || '新闻层未加载';
  const thermalText = oilThermalWatchData?.displayStatusZh || '卫星热异常未加载';
  return `新闻 ${newsText} · 卫星 ${thermalText}; 两者只做观察层,不确认断供、事故或油价方向。`;
}
function evidenceRow(label, e) {
  const row = document.createElement('div');
  row.className = 'odp-evidence-row';
  const make = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  row.appendChild(make('odp-ev-label', label));
  row.appendChild(make('odp-ev-value', evidenceValueText(e)));
  row.appendChild(make('odp-ev-change', evidenceFreshnessText(e)));
  row.appendChild(make('odp-ev-range', `${evidenceChangeText(e)} · ${evidenceRoleText(e)}`));
  return row;
}

function evidenceTierGroup(tierMeta, rows) {
  const group = document.createElement('section');
  group.className = 'odp-evidence-tier';
  const heading = document.createElement('div');
  heading.className = 'odp-evidence-tier-heading';
  const title = document.createElement('strong');
  title.textContent = tierMeta.title;
  const note = document.createElement('span');
  note.textContent = tierMeta.note;
  heading.append(title, note);
  const body = document.createElement('div');
  body.className = 'odp-evidence-tier-rows';
  body.replaceChildren(...rows.map(([label, e]) => evidenceRow(label, e)));
  group.append(heading, body);
  return group;
}

function renderEvidenceList(ev) {
  const host = $('odp-evidence-list');
  if (!host) return;
  const rows = EVIDENCE_ROW_DEFS
    .map(([label, key]) => [label, ev[key]])
    .filter(([, e]) => e && typeof e === 'object');
  const groups = EVIDENCE_ROLE_ORDER
    .map((roleMeta) => {
      const roleRows = rows.filter(([, e]) => e.directionalRole === roleMeta.role);
      return roleRows.length ? evidenceTierGroup(roleMeta, roleRows) : null;
    })
    .filter(Boolean);
  const unclassifiedRows = rows.filter(([, e]) => !EVIDENCE_ROLE_ORDER.some((roleMeta) => roleMeta.role === e.directionalRole));
  if (unclassifiedRows.length) {
    groups.push(evidenceTierGroup({
      tier: 'unclassified',
      title: '未分级证据',
      note: '该证据缺少 directionalRole,需在 ODP contract 中补齐后才能用于判断链分组。',
    }, unclassifiedRows));
  }
  host.replaceChildren(...groups);
}

export function renderOilDirectional({ oilData, radarData, worldOrderStressData, oilThermalWatchData, oilNewsEventWatchData }) {
  renderEnergyAddendum(radarData, worldOrderStressData, oilData, oilThermalWatchData, oilNewsEventWatchData);

  if (!oilData || typeof oilData !== 'object') {
    setLeafText('odp-verdict', '数据不可用');
    setLeafText('hero-odp-ref-verdict', '数据不可用');
    setToneClass('odp-verdict', 'section-title', '');
    setLeafText('odp-headline', '油价方向研判数据未能加载,暂不显示。');
    for (const id of ['odp-physical-bias', 'odp-divergence', 'odp-confidence', 'odp-data-sufficiency', 'odp-asof', 'odp-evidence-note']) setLeafText(id, '—');
    for (const id of LADDER_IDS) setLeafText(id, '—');
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
  setLeafText('odp-confidence', CONFIDENCE_ZH[it.confidence] || it.confidence || '—');
  setLeafText('odp-data-sufficiency', DATA_SUFFICIENCY_ZH[it.dataSufficiency] || '—');
  setLeafText('odp-asof', crudeAsOf);
  setLeafText('odp-ladder-core', buildCoreLadderText(it, ev, crudeAsOf));
  setLeafText('odp-ladder-market', buildMarketLadderText(it, sig, ev));
  setLeafText('odp-ladder-global', buildGlobalLadderText(it));
  setLeafText('odp-ladder-watch', buildWatchLadderText(oilThermalWatchData, oilNewsEventWatchData));

  if (!sig) {
    // insufficient_data -> 暂不判断, no fabricated reasons; clear any prior evidence rows.
    for (const id of REASON_IDS) setLeafText(id, '暂不判断');
    setLeafText('odp-evidence-note', '本周物理链数据不足(非 8 源同周 live),暂不给出方向判断。');
    setLeafText('odp-ladder-market', '市场层等待完整物理链后再做确认或背离说明。');
    setLeafText('odp-ladder-global', '全球慢变量只做背景观察,不替代缺失的周度物理锚。');
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
