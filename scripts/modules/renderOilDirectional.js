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

import { qualifyOdpDisplay } from './oilEvidenceQuality.js?v=editorial-review-20261110-r2';

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
  strong_bullish: '美国周度供需明显偏紧',
  moderate_bullish: '美国周度供需偏紧',
  neutral_range: '美国周度供需中性',
  bearish: '美国周度供需偏松',
  false_down_physical_stress: '价格下跌 · 美国周度供需仍紧',
  false_up_unconfirmed: '价格上涨 · 美国周度供需偏松',
  product_crisis: '美国成品油库存压力较高',
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
  strong_bullish: '明显偏紧',
  moderate_bullish: '偏紧',
  neutral_range: '中性',
  bearish: '偏松',
  product_crisis: '成品油库存压力较高',
  insufficient_data: '数据不足',
};

const DIVERGENCE_ZH = {
  none: '未标记背离，不代表价格方向已确认',
  false_down_physical_stress: '价格下跌 · 美国周度供需仍紧',
  false_up_unconfirmed: '价格上涨 · 美国周度供需偏松',
};

// Historical confidence is not a calibrated prediction confidence or an independent-source count.

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
const ATTRIBUTION_LIST_IDS = [
  'odp-attribution-support',
  'odp-attribution-counter',
  'odp-attribution-caps',
  'odp-attribution-triggers',
];
const EVIDENCE_TIMING_SUMMARY_ID = 'odp-evidence-timing-summary';
const EVIDENCE_READINESS_MATRIX_ID = 'odp-evidence-readiness-matrix';
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
  'odp-news-event-web-ngrams-health',
  'odp-news-event-web-ngrams-age',
  'odp-news-event-market',
  'odp-news-event-claim-polarity',
  'odp-news-event-claim-quality',
  'odp-news-event-title-risk',
  'odp-news-event-note',
  'odp-thermal-status',
  'odp-thermal-source',
  'odp-thermal-request-health',
  'odp-thermal-window',
  'odp-thermal-facility',
  'odp-thermal-baseline-quality',
  'odp-thermal-signal',
  'odp-thermal-note',
  'odp-cross-confirmation-status',
  'odp-cross-confirmation-eia',
  'odp-cross-confirmation-market',
  'odp-cross-confirmation-news',
  'odp-cross-confirmation-thermal',
  'odp-cross-confirmation-summary',
  'odp-cross-confirmation-note',
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
const EVIDENCE_ROLE_ORDER = [
  {
    role: 'core_physical_anchor',
    title: '美国周度供需',
    note: '8 项统计均来自美国 EIA WPSR，同一来源体系，不代表全球供需。',
  },
  {
    role: 'market_confirmation',
    title: '市场价格与期限结构',
    note: '按各自真实观察日列示；缺日期、超龄或口径不可比时不作方向依据。',
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
  setToneClass('odp-news-event-web-ngrams-health', 'odp-news-web-ngrams-health', '');
  setToneClass('odp-news-event-web-ngrams-age', 'odp-news-web-ngrams-health', '');
  setToneClass('odp-news-event-claim-polarity', 'odp-news-claim-polarity', '');
  setToneClass('odp-news-event-claim-quality', 'odp-news-claim-quality', '');
  setToneClass('odp-thermal-status', 'odp-thermal-status', '');
  setToneClass('odp-thermal-request-health', 'odp-thermal-request-health', '');
  setToneClass('odp-thermal-baseline-quality', 'odp-thermal-baseline-quality', '');
  setToneClass('odp-cross-confirmation-status', 'odp-cross-confirmation-status', '');
  setToneClass('odp-qc-ledger-status', 'odp-qc-ledger-status', '');
  setToneClass('odp-energy-spare-regime', 'odp-energy-regime', '');
  const coreHost = $('odp-energy-transport-core');
  if (coreHost) coreHost.textContent = '—';
}
function renderGlobalForecastGap(oilData, radarData) {
  const macro = radarData?.macroDrivers || {};
  const inventory = macro.energyInventoryBalance || {};
  const spare = macro.energySpareCapacity || {};
  const validMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const inventoryUsable = validMonth(inventory.latestPeriod) && ['live', 'fallback'].includes(inventory.sourceStatus?.inventoryBalance);
  const spareUsable = validMonth(spare.latestPeriod) && ['live', 'fallback'].includes(spare.sourceStatus?.spareCapacity);
  const weeklyDate = compactDate(oilData?.evidence?.crudeStocksExSpr?.asOfDate) || '未知';
  setLeafText('odp-global-forecast-status', '预测/估算背景');
  setToneClass('odp-global-forecast-status', 'odp-global-forecast-status', '');
  setLeafText('odp-global-forecast-us-weekly', `美国周度观察日 ${weeklyDate}，与月度口径分列`);
  setLeafText('odp-global-forecast-global-stocks', inventoryUsable
    ? `${inventory.latestPeriod}：OECD 商库 ${formatMbbl(inventory.oecdCommercialInventoryMbbl)}；全球净抽库 ${formatSignedMbpd(inventory.globalInventoryDrawMbpd)}`
    : '未知：缺少合格月期或来源状态');
  setLeafText('odp-global-forecast-demand', inventoryUsable
    ? `${inventory.latestPeriod}：全球消费 ${formatMbpd(inventory.worldConsumptionMbpd)}；同比 ${formatSignedMbpd(inventory.worldConsumptionYoYMbpd)}`
    : '未知：缺少合格月期或来源状态');
  setLeafText('odp-global-forecast-buffer', spareUsable
    ? `${spare.latestPeriod}：OPEC 闲置产能 ${formatMbpd(spare.spareCapacityMbpd)}`
    : '未知：缺少合格月期或来源状态');
  setLeafText('odp-global-forecast-window', `库存/需求月期 ${validMonth(inventory.latestPeriod) ? inventory.latestPeriod : '未知'}；闲置产能月期 ${validMonth(spare.latestPeriod) ? spare.latestPeriod : '未知'}`);
  setLeafText('odp-global-forecast-note', 'EIA STEO 预测/估算背景，同一 EIA 体系，不独立确认、不提高置信。月期不是实时观察日，也不是实时全球库存或已发生的供应变化。');
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
export function renderLegacyOilEventNewsLayer(worldOrderStressData) {
  const gdelt = worldOrderStressData?.externalSources?.gdelt || {};
  const summary = gdelt.summary && typeof gdelt.summary === 'object' ? gdelt.summary : {};
  const status = typeof gdelt.status === 'string' ? gdelt.status : '';
  const count = (...values) => {
    const value = values.find(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    return value === undefined ? null : Math.round(value);
  };
  const conflictEvents = count(summary.conflictEvents, summary.totalEvents);
  const sanctionsEvents = count(summary.sanctionsEvents);
  const chokepointEvents = count(summary.blockadeOrChokepointEvents);
  const totalEvents = count(summary.totalEvents);
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
  } else if (status === 'ok' && [conflictEvents, sanctionsEvents, chokepointEvents].every(value => value !== null)) {
    statusText = '未见事件压力';
    tone = 'green';
  } else if (status === 'ok') {
    statusText = conflictEvents === null ? '事件计数缺失' : '事件计数不完整';
  } else if (status === 'stale') {
    tone = 'yellow';
  }

  const eventContext = oilRegionText
    ? `重点地区含 ${oilRegionText},作为能源事件背景观察。`
    : '未从广义摘要中识别出重点能源地区。';
  const directContext = chokepointEvents > 0 || sanctionsEvents > 0
    ? `制裁 ${sanctionsEvents ?? '—'} / 通道 ${chokepointEvents ?? '—'} 起需人工核验。`
    : '当前摘要未给出制裁或通道中断的直接计数。';

  setLeafText('odp-news-event-status', statusText);
  setToneClass('odp-news-event-status', 'odp-news-event-status', tone);
  const eventWindowText = totalEvents === null ? '事件数未知' : `${totalEvents} 起事件（按国家汇总）`;
  const conflictText = conflictEvents === null ? '事件数未知' : `${conflictEvents} 起事件`;
  setLeafText('odp-news-event-window', `${fetchedAt || '—'}${cached} · ${eventWindowText} · 去重报道数未知`);
  setLeafText('odp-news-event-conflict', `${conflictText} · ${regionText}`);
  setLeafText('odp-news-event-sanctions', `制裁 ${sanctionsEvents ?? '—'} / 通道 ${chokepointEvents ?? '—'}`);
  setLeafText('odp-news-event-headline-gate', '专用闸门未接入');
  setToneClass('odp-news-event-headline-gate', 'odp-news-headline-gate', 'yellow');
  setLeafText('odp-news-event-source-health', '广义 GDELT 摘要 · 专用三源未接入');
  setToneClass('odp-news-event-source-health', 'odp-news-source-health', 'yellow');
  setLeafText('odp-news-event-web-ngrams-health', '聚合背景未批准或未加载 · 不用于当前新闻信号');
  setToneClass('odp-news-event-web-ngrams-health', 'odp-news-web-ngrams-health', 'yellow');
  setLeafText('odp-news-event-web-ngrams-age', '历史审阅样本日期待核 · 不用于当前新闻信号');
  setToneClass('odp-news-event-web-ngrams-age', 'odp-news-web-ngrams-health', 'yellow');
  setLeafText('odp-news-event-market', marketText);
  setLeafText('odp-news-event-claim-polarity', '专用主张聚合未接入 · 不展示标题原文');
  setToneClass('odp-news-event-claim-polarity', 'odp-news-claim-polarity', 'yellow');
  setLeafText('odp-news-event-claim-quality', '专用主张质量未接入 · 不展示标题原文');
  setToneClass('odp-news-event-claim-quality', 'odp-news-claim-quality', 'yellow');
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
// Exact ledger codes that justify naming a cause next to the source label. Anything
// else keeps the generic source-degraded wording instead of guessing an attribution.
// Codes are emitted by scripts/lib/tavily-budget.mjs and preserved verbatim into
// sourceStatus.details.<source>.queryRuns[].error by scripts/lib/search-request-policy.mjs.
const NEWS_SOURCE_EXHAUSTION_LABELS = [
  ['tavily_budget_account_limit', '额度耗尽'],
  ['tavily_budget_project_limit', '额度耗尽'],
  // The project's own rolling 31-day ledger capacity being reached is quota
  // unavailability from the reader's point of view, so it shares the exhaustion
  // wording rather than the generic degraded state.
  ['tavily_budget_ledger_full', '额度耗尽'],
  ['tavily_budget_session_stopped', '采集已暂停'],
];
function newsSourceExhaustionLabel(data, key) {
  const runs = data?.sourceStatus?.details?.[key]?.queryRuns;
  if (!Array.isArray(runs)) return null;
  for (const run of runs) {
    const code = typeof run?.error === 'string' ? run.error.trim().toLowerCase() : '';
    if (!code) continue;
    const match = NEWS_SOURCE_EXHAUSTION_LABELS.find(([ledgerCode]) => ledgerCode === code);
    if (match) return match[1];
  }
  return null;
}
function newsDegradedSources(data) {
  const status = data?.sourceStatus || {};
  return NEWS_SOURCE_HEALTH_FIELDS
    .map(([key, label]) => {
      const attribution = newsSourceExhaustionLabel(data, key);
      return { label: attribution ? `${label}${attribution}` : label, state: status[key] };
    })
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
export function newsSourceHealthText(data) {
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
function parseWebNgramsTimestamp(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u)
    : null;
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const timestampMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestampMs);
  const valid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
  return valid ? timestampMs : null;
}

export function webNgramsSampleAge(cache, nowMs = Date.now()) {
  const automated = cache?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v2';
  const timestamp = automated
    ? cache?.automation?.selectedFileTimestamp
    : cache?.sampleGate?.latestSelectedTimestamp;
  const timestampMs = parseWebNgramsTimestamp(timestamp);
  const staleAfterHours = Number.isFinite(cache?.staleAfterHours)
    && cache.staleAfterHours > 0
    ? cache.staleAfterHours
    : null;
  if (timestampMs === null || staleAfterHours === null || !Number.isFinite(nowMs)) {
    return {
      state: 'unavailable',
      text: automated
        ? '自动源文件日期待核 · 不用于当前新闻信号'
        : '历史审阅样本日期待核 · 不用于当前新闻信号',
      tone: 'yellow',
      ageHours: null,
    };
  }
  const ageHours = (nowMs - timestampMs) / (60 * 60 * 1000);
  if (ageHours < -1) {
    return {
      state: 'unavailable',
      text: automated
        ? '自动源文件时间异常 · 不用于当前新闻信号'
        : '历史审阅样本时间异常 · 不用于当前新闻信号',
      tone: 'yellow',
      ageHours: null,
    };
  }
  const safeAgeHours = Math.max(0, ageHours);
  const ageText = safeAgeHours < 24
    ? `距今约 ${Math.round(safeAgeHours)} 小时`
    : `距今约 ${Math.floor(safeAgeHours / 24)} 天`;
  const asOfDate = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
  const thresholdText = `${Math.round(staleAfterHours)} 小时`;
  const stale = safeAgeHours > staleAfterHours;
  return {
    state: stale ? 'stale' : 'within_window',
    text: `${automated ? '自动源文件截至' : '历史审阅样本截至'} ${asOfDate} · ${ageText} · ${stale ? `已超 ${thresholdText}时效` : `${thresholdText}内`}`,
    tone: stale ? 'yellow' : 'green',
    ageHours: safeAgeHours,
  };
}

function webNgramsSourceHealth(data) {
  const cache = data?.sourceCaches?.gdeltWebNgramsFallback;
  const approvedContract = cache?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v1'
    || cache?.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v2';
  const approved = approvedContract
    && cache?.frontendDisplayApproved === true
    && cache?.displayMode === 'aggregate_source_health_only_no_headlines'
    && cache?.sourceHealth?.usedForCurrentSignal === false;
  if (!approved) {
    return {
      text: '聚合背景未批准或未加载 · 不用于当前新闻信号',
      tone: 'yellow',
      sampleAge: webNgramsSampleAge(null),
    };
  }
  if (cache.contractVersion === 'gdelt-web-ngrams-display-fallback-cache-v2') {
    const sourceState = cache.sourceHealth?.state;
    const aggregate = cache.aggregate || {};
    const hits = Number.isFinite(aggregate.totalHitCount) ? Math.max(0, Math.round(aggregate.totalHitCount)) : null;
    const docs = Number.isFinite(aggregate.uniqueDocCount) ? Math.max(0, Math.round(aggregate.uniqueDocCount)) : null;
    const stateText = sourceState === 'live'
      ? '自动下载源正常'
      : sourceState === 'stale'
        ? '自动下载源沿用时效内缓存'
        : '自动下载源暂不可用';
    const countText = hits === null || docs === null ? '聚合计数待核' : `命中 ${hits} · 文档 ${docs}`;
    return {
      text: `${stateText} · ${countText} · 不用于当前新闻信号`,
      tone: sourceState === 'live' ? 'green' : 'yellow',
      sampleAge: webNgramsSampleAge(cache),
    };
  }

  const gate = cache.sampleGate || {};
  const usable = Number.isFinite(gate.usableSampleCount) ? Math.max(0, Math.round(gate.usableSampleCount)) : null;
  const selected = Number.isFinite(gate.selectedTimestampCount) ? Math.max(0, Math.round(gate.selectedTimestampCount)) : null;
  const windowHours = Number.isFinite(gate.observationWindowHours) ? Math.max(0, gate.observationWindowHours) : null;
  const warnings = Number.isFinite(gate.warningCount) ? Math.max(0, Math.round(gate.warningCount)) : null;
  const gatePassed = gate.state === 'passed'
    && usable !== null
    && usable >= 8
    && selected !== null
    && selected >= 2
    && windowHours !== null
    && windowHours >= 24;
  const stateText = gatePassed ? '聚合背景样本门已通过' : '聚合背景样本门待复核';
  const sampleText = usable === null || selected === null ? '样本数待核' : `样本 ${usable}/${selected}`;
  const windowText = windowHours === null ? '观察窗待核' : `${windowHours}小时观察窗`;
  const warningText = warnings === null ? '告警数待核' : `${warnings}条样本告警`;
  return {
    text: `${stateText} · ${sampleText} · ${windowText} · ${warningText} · 不用于当前新闻信号`,
    tone: gatePassed && warnings === 0 ? 'green' : 'yellow',
    sampleAge: webNgramsSampleAge(cache),
  };
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
function claimQualityText(data) {
  const layer = data?.claimPolarity || {};
  const counts = layer.polarityCounts || {};
  const titleRisk = data?.titleRisk || {};
  const readiness = data?.headlineDisplayReadiness || {};
  const blockers = [];
  const mixed = claimPolarityCount(counts, 'mixed_or_contested');
  const unclear = claimPolarityCount(counts, 'unclear_or_high_claim');
  const highClaim = Number.isFinite(titleRisk.highClaimTitleCount) ? Math.round(titleRisk.highClaimTitleCount) : 0;
  const liveSources = Number.isFinite(data?.aggregate?.liveSourceCount) ? Math.round(data.aggregate.liveSourceCount) : 0;
  const totalSources = newsSourceCount(data);
  if (layer.ruleVersion !== 'oil-news-claim-polarity-p53') blockers.push('主张聚合待计算');
  if (layer.contradiction?.state === 'mixed_claims' || mixed > 0) blockers.push('主张混合待核');
  if (unclear > 0) blockers.push(`未明/高主张 ${unclear}`);
  if (highClaim > 0) blockers.push(`高主张标题 ${highClaim}`);
  if (readiness.displayHeadlinesApproved !== true) blockers.push('标题未批准');
  if (data?.status !== 'ok') blockers.push('来源降级');
  if (liveSources < Math.min(2, totalSources)) blockers.push('多源不足');
  const sourceText = totalSources ? `${liveSources}/${totalSources}源` : '来源待核';
  if (!blockers.length) return `质量可读 · 聚合一致 · ${sourceText} · 不展示标题原文`;
  return `质量待核 · ${blockers.slice(0, 4).join(' · ')} · ${sourceText} · 不展示标题原文`;
}
function claimQualityTone(data) {
  const layer = data?.claimPolarity || {};
  const counts = layer.polarityCounts || {};
  const titleRisk = data?.titleRisk || {};
  const mixed = claimPolarityCount(counts, 'mixed_or_contested');
  const unclear = claimPolarityCount(counts, 'unclear_or_high_claim');
  const highClaim = Number.isFinite(titleRisk.highClaimTitleCount) ? Math.round(titleRisk.highClaimTitleCount) : 0;
  if (data?.status === 'source_unavailable' || data?.status === 'not_configured') return 'yellow';
  if (layer.contradiction?.state === 'mixed_claims' || mixed > 0 || unclear > 0 || highClaim > 0) return 'yellow';
  if (layer.ruleVersion === 'oil-news-claim-polarity-p53' && data?.status === 'ok') return 'green';
  return '';
}
function claimPolarityCount(counts, key) {
  return Number.isFinite(counts?.[key]) ? Math.round(counts[key]) : 0;
}
function claimPolarityText(data) {
  const layer = data?.claimPolarity || {};
  const counts = layer.polarityCounts || {};
  if (layer.ruleVersion !== 'oil-news-claim-polarity-p53') {
    return '主张方向聚合待计算 · 不展示标题原文';
  }
  const escalation = claimPolarityCount(counts, 'risk_escalation');
  const deescalation = claimPolarityCount(counts, 'risk_deescalation');
  const mixed = claimPolarityCount(counts, 'mixed_or_contested');
  const marketOnly = claimPolarityCount(counts, 'market_reaction_only');
  const unclear = claimPolarityCount(counts, 'unclear_or_high_claim');
  const state = ({
    mixed_claims: '混合待核',
    risk_escalation_dominant: '新闻升温主导',
    risk_deescalation_dominant: '新闻降温主导',
    no_directional_claim_dominance: '未见方向冲突',
  })[layer.contradiction?.state] || '状态待核';
  const unclearText = unclear > 0 ? ` / 未明 ${unclear}` : '';
  const axes = layer.axisGate?.axes;
  const axisLabel = (axis) => ({
    mixed_or_contested: '矛盾待核',
    risk_escalation_supported: '升温稳定',
    risk_escalation_unconfirmed: '升温待证',
    risk_deescalation_supported: '缓和稳定',
    risk_deescalation_unconfirmed: '缓和待证',
    market_reaction_observed: '反应已见',
    insufficient_directional_claims: '证据不足'
  })[axes?.[axis]?.state] || '待刷新';
  const axisText = layer.axisGate?.ruleVersion === 'oil-news-claim-axis-gate-v1'
    ? ` · 通道 ${axisLabel('transport_security')} / 供应 ${axisLabel('supply_flow')} / 市场 ${axisLabel('market_reaction')}`
    : '';
  return `升温 ${escalation} / 降温 ${deescalation} / 混合 ${mixed} / 市场 ${marketOnly}${unclearText} · ${state}${axisText} · 不展示标题原文`;
}
function claimPolarityTone(data) {
  const layer = data?.claimPolarity || {};
  const counts = layer.polarityCounts || {};
  const escalation = claimPolarityCount(counts, 'risk_escalation');
  const deescalation = claimPolarityCount(counts, 'risk_deescalation');
  const mixed = claimPolarityCount(counts, 'mixed_or_contested');
  if (layer.contradiction?.state === 'mixed_claims' || mixed > 0) return 'yellow';
  if (layer.contradiction?.state === 'risk_escalation_dominant') return 'red';
  if (layer.contradiction?.state === 'risk_deescalation_dominant') return 'green';
  if (escalation > deescalation && escalation > 0) return 'red';
  if (deescalation > escalation && deescalation > 0) return 'green';
  return '';
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
  const webNgramsHealth = webNgramsSourceHealth(data);

  setLeafText('odp-news-event-status', stateText);
  setToneClass('odp-news-event-status', 'odp-news-event-status', newsEventTone(data));
  setLeafText('odp-news-event-window', `${newsWindowText(data)} · ${unique} 条专用报道代理`);
  setLeafText('odp-news-event-conflict', `通道 ${chokepoint} / 供应 ${supply} / 设施 ${facility} · 中东 ${middleEast}`);
  setLeafText('odp-news-event-sanctions', `制裁 ${sanctions} / 航运 ${shipping}`);
  setLeafText('odp-news-event-headline-gate', headlineReadinessText(data));
  setToneClass('odp-news-event-headline-gate', 'odp-news-headline-gate', headlineReadinessTone(data));
  setLeafText('odp-news-event-source-health', newsSourceHealthText(data));
  setToneClass('odp-news-event-source-health', 'odp-news-source-health', newsSourceHealthTone(data));
  setLeafText('odp-news-event-web-ngrams-health', webNgramsHealth.text);
  setToneClass('odp-news-event-web-ngrams-health', 'odp-news-web-ngrams-health', webNgramsHealth.tone);
  setLeafText('odp-news-event-web-ngrams-age', webNgramsHealth.sampleAge.text);
  setToneClass('odp-news-event-web-ngrams-age', 'odp-news-web-ngrams-health', webNgramsHealth.sampleAge.tone);
  setLeafText('odp-news-event-market', `市场反应 ${marketReaction} 条 · ${brentText}`);
  setLeafText('odp-news-event-claim-polarity', claimPolarityText(data));
  setToneClass('odp-news-event-claim-polarity', 'odp-news-claim-polarity', claimPolarityTone(data));
  setLeafText('odp-news-event-claim-quality', claimQualityText(data));
  setToneClass('odp-news-event-claim-quality', 'odp-news-claim-quality', claimQualityTone(data));
  setLeafText('odp-news-event-title-risk', titleRiskText(data));
  setLeafText('odp-news-event-note', `${data.aggregate?.reasonZh || '专用油价新闻层暂不可用。'}${newsFallbackContextText(data)}本区读取 production read-only oil-news event watch(GDELT/Tavily/Brave),置信度 ${confidence};标题只做聚合风险闸门,主张方向只显示聚合计数,不展示原文标题。它不确认霍尔木兹关闭、断供、油轮流向、炼厂事故、制裁影响或油价方向。只有与价格结构、库存/供需锚点、咽喉转运和卫星/设施事件同时印证时,才适合提高人工观察置信度。`);
}
function renderEnergyAddendum(radarData, worldOrderStressData, oilData, oilNewsEventWatchData) {
  clearEnergyAddendum();
  renderGlobalForecastGap(oilData, radarData);
  renderOilEventNewsLayer(oilNewsEventWatchData, worldOrderStressData);
  setLeafText('odp-energy-source-boundary', '边界：美国周度统计、STEO 预测/估算背景与新闻观察分别列示；仅供参考,不参与平台的风险打分与决策。');
}

function reasonInventory(sig, ev) {
  const e = ev.crudeStocksExSpr || {};
  const trend = Number.isFinite(e.change4w) ? (e.change4w < 0 ? '去化' : e.change4w > 0 ? '回补' : '持平') : '变化未知';
  return `美国商业原油库存${trend}，近 4 周 ${signed(e.change4w)} 千桶，较 5 年同期 ${pct(e.vs5yAvgPct)}`;
}
function reasonDiesel(sig, ev) {
  const e = ev.distillateStocks || {};
  return `美国馏分油库存较 5 年同期 ${pct(e.vs5yAvgPct)}，近 4 周 ${signed(e.change4w)} 千桶`;
}
function reasonCurve(sig, ev) {
  const c = ev.curve || {};
  if (c.sourceStatus !== 'live' || !Number.isFinite(c.frontMinusBack)) return `期限结构未知：${c.asOfDate ? `观察日 ${compactDate(c.asOfDate)}，已超龄或来源不可用` : '缺少合格观察日或完整报价'}，不作方向依据。`;
  return `观察日 ${compactDate(c.asOfDate)}，前月减后月 ${signed(c.frontMinusBack, 2)} 美元/桶；${curveRegimeZh(c.slopeRegime)}，公开期货代理，非官方结算曲线。`;
}
function reasonRefinery(sig, ev) {
  const r = sig.refineryConfirmation || {};
  const level = ev.refineryUtilization || {};
  return `美国炼厂开工率 ${fixed(level.value, 1)}%，4 周均 ${fixed(r.utilAvg4w, 1)}%；裂解价差未知：缺少同日同口径两腿报价与 ULSD 观察日，不判断收窄。`;
}
function reasonSpr(sig) {
  const s = sig.sprBufferEffectiveness || {};
  return `美国 SPR 近 4 周 ${signed(s.sprChange4w)} 千桶；政策储备与商业库存分列。`;
}
function reasonDemand(sig) {
  const d = sig.demandDestructionRisk || {};
  const ratio = (Number.isFinite(d.suppliedAvg4w) && Number.isFinite(d.suppliedAvg13w) && d.suppliedAvg13w)
    ? (d.suppliedAvg4w / d.suppliedAvg13w).toFixed(2) : '未知';
  return `美国产品供应量 4 周/13 周均值比 ${ratio}；这是需求代理，不是最终消费实测。`;
}
function buildHeadline(finalBias, it, sig, priceUsable) {
  const physical = PHYSICAL_BIAS_ZH[it.physicalBias] || '未知';
  if (finalBias !== 'insufficient_data' && !priceUsable) return `美国周度供需${physical}；缺少同源、带真实观察日的可比价格历史，油价方向暂不足判断。周度压力不等于后续价格预测。`;
  const brent = pct(sig?.priceContext?.brentChangePct4w);
  switch (finalBias) {
    case 'insufficient_data':
      return '本周美国供需数据不足或已超龄，暂不给出方向判断。';
    case 'false_down_physical_stress':
      return `布伦特近 4 周 ${brent}，价格回落；美国周度供需仍偏紧，两者背离，不据此认定下跌会逆转。`;
    case 'false_up_unconfirmed':
      return `布伦特近 4 周 ${brent}，价格走高；美国周度供需偏松，两者背离，不据此认定上涨会逆转。`;
    case 'strong_bullish':
      return `美国周度供需明显偏紧；布伦特近 4 周 ${brent}。当前压力不等于后续价格预测。`;
    case 'moderate_bullish':
    case 'neutral_range':
    case 'bearish':
    case 'product_crisis':
      return `美国周度供需${physical}；布伦特近 4 周 ${brent}。当前压力不等于后续价格预测。`;
    default:
      return '美国周度供需状态未知，暂不判断。';
  }
}

function sourceStatusShort(status) {
  return ({
    live: '可用',
    fallback: '历史回退',
    stale: '超龄或源不可用',
    missing: '缺失',
  })[status] || '未知';
}
function evidenceValueText(e) {
  if (!e || typeof e !== 'object') return '—';
  if (Number.isFinite(e.frontMinusBack)) return `前-后 ${signed(e.frontMinusBack, 2)}`;
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
  if (e.directionalRole === 'core_physical_anchor') return '美国周度统计 · 同一 EIA 来源体系';
  if (e.directionalRole === 'market_confirmation') return '市场读数 · 须核对真实观察日';
  return '背景资料 · 用途待核';
}
function clearEvidenceTimingSummary() {
  const host = $(EVIDENCE_TIMING_SUMMARY_ID);
  if (host) host.textContent = '—';
}
function clearEvidenceReadinessMatrix() {
  const host = $(EVIDENCE_READINESS_MATRIX_ID);
  if (host) host.textContent = '—';
}
function curveRegimeZh(regime) {
  return ({
    backwardation: 'backwardation(近月高于远月)',
    contango: 'contango(近月低于远月)',
    flat: '近似平坦',
  })[regime] || '期限结构待核';
}
function attributionListItem(item) {
  const li = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = item && item.label ? `${item.label}:` : '归因:';
  const text = document.createElement('span');
  text.textContent = item && item.text ? ` ${item.text}` : ' 暂无可展示解释。';
  li.append(title, text);
  return li;
}
function renderAttributionList(id, rows, fallbackText) {
  const host = $(id);
  if (!host) return;
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object').slice(0, 4) : [];
  if (!safeRows.length) {
    host.replaceChildren(attributionListItem({ label: '待补充', text: fallbackText }));
    return;
  }
  host.replaceChildren(...safeRows.map(attributionListItem));
}
function clearAttribution() {
  setLeafText('odp-attribution-thesis', '—');
  for (const id of ATTRIBUTION_LIST_IDS) {
    const host = $(id);
    if (host) host.replaceChildren();
  }
}
function physicalCounterEvidence(it, sig, ev, qualified) {
  if (!qualified.physicalUsable || !sig) return [{ label: '反向依据', text: '美国周度数据不足或已超龄，反证亦暂不判断。' }];
  const tight = ['strong_bullish', 'moderate_bullish', 'product_crisis'].includes(it.physicalBias);
  const loose = it.physicalBias === 'bearish';
  const rows = [];
  const demand = sig.demandDestructionRisk || {};
  const refinery = sig.refineryConfirmation || {};
  const inventory = sig.inventoryDrawPressure || {};
  // Explain existing signal flags only; no new threshold, combined score or direction.
  if (tight && (demand.demandFalling === true || demand.demandDestruction === true)) rows.push({ label: '需求反向依据', text: reasonDemand(sig) });
  if ((tight && refinery.low === true) || (loose && refinery.high === true)) rows.push({ label: '加工端反向依据', text: `美国炼厂开工率 4 周均 ${fixed(refinery.utilAvg4w, 1)}%，与当前周度供需偏向存在分歧。` });
  if ((tight && inventory.loose === true) || (loose && inventory.tight === true)) rows.push({ label: '库存反向依据', text: reasonInventory(sig, ev) });
  const curve = ev.curve || {};
  if (curve.sourceStatus === 'live' && Number.isFinite(curve.frontMinusBack) && ((tight && curve.slopeRegime === 'contango') || (loose && curve.slopeRegime === 'backwardation'))) rows.push({ label: '期限结构反向依据', text: reasonCurve(sig, ev) });
  return rows.length ? rows : [{ label: '反向依据', text: '当前合格周度字段和期限结构未列出明确反向证据；不代表后续价格方向已获确认。' }];
}
function renderAttribution(it, sig, ev, qualified) {
  // Do not forward old artifact prose: it can contain unqualified crack/global/thermal claims.
  clearAttribution();
  setLeafText('odp-attribution-thesis', qualified.physicalUsable
    ? `美国周度供需：${PHYSICAL_BIAS_ZH[it.physicalBias] || '未知'}。价格走势与周度压力分开阅读。`
    : '本周美国供需数据不足或已超龄，暂不判断。');
  renderAttributionList('odp-attribution-support', [
    { label: '统计范围', text: `EIA WPSR 美国周度统计，观察日 ${compactDate(ev.crudeStocksExSpr?.asOfDate) || '未知'}，不代表全球供需。` },
    { label: '价格边界', text: qualified.priceUsable ? '只描述同期价格与周度供需关系，不预测反转。' : '缺少有真实观察日的同源价格历史，方向暂不足判断。' },
  ], '暂无合格依据。');
  renderAttributionList('odp-attribution-counter', physicalCounterEvidence(it, sig, ev, qualified), '暂无合格反向依据。');
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

export function renderOilDirectional({ oilData, radarData, worldOrderStressData, oilNewsEventWatchData }) {
  const qualified = qualifyOdpDisplay(oilData, radarData);
  const ev = qualified.evidence;
  renderEnergyAddendum(radarData, worldOrderStressData, oilData ? { ...oilData, evidence: ev } : null, oilNewsEventWatchData);
  // Retired DOM remains for compatibility, but never invokes the old confirmation renderers.
  for (const id of LADDER_IDS) setLeafText(id, '—');
  clearEvidenceTimingSummary();
  clearEvidenceReadinessMatrix();
  if (!oilData || typeof oilData !== 'object') {
    setLeafText('odp-verdict', '数据不可用');
    setLeafText('hero-odp-ref-verdict', '数据不可用');
    setToneClass('odp-verdict', 'section-title', '');
    setLeafText('odp-headline', '油价方向研判数据未能加载，暂不显示。');
    for (const id of ['odp-physical-bias', 'odp-divergence', 'odp-confidence', 'odp-data-sufficiency', 'odp-asof', 'odp-evidence-note']) setLeafText(id, '—');
    clearAttribution();
    for (const id of REASON_IDS) setLeafText(id, '—');
    const host = $('odp-evidence-list');
    if (host) host.replaceChildren();
    return;
  }
  const finalBias = qualified.displayBias;
  const it = oilData.interpretation || {};
  const sig = oilData.signals ? { ...oilData.signals, priceContext: qualified.priceContext } : null;
  const crudeAsOf = ev.crudeStocksExSpr?.asOfDate || '未知';
  const verdict = qualified.physicalUsable && !qualified.priceUsable ? '油价方向暂不足判断' : (FINAL_BIAS_ZH[finalBias] || '数据不足 · 暂不判断');
  setLeafText('odp-verdict', verdict);
  setLeafText('hero-odp-ref-verdict', verdict);
  setToneClass('odp-verdict', 'section-title', qualified.priceUsable ? FINAL_BIAS_TONE[finalBias] : '');
  setLeafText('odp-headline', buildHeadline(finalBias, it, sig, qualified.priceUsable));
  setLeafText('odp-physical-bias', qualified.physicalUsable ? (PHYSICAL_BIAS_ZH[it.physicalBias] || '未知') : '数据不足或已超龄');
  setLeafText('odp-divergence', qualified.priceUsable && qualified.physicalUsable ? (DIVERGENCE_ZH[it.divergence] || '关系未知') : '未知：缺少合格可比价格或周度依据');
  setLeafText('odp-confidence', '美国周度统计，不是油价预测置信度');
  setLeafText('odp-data-sufficiency', qualified.physicalUsable ? '8 项美国统计同周可用' : '不足：缺失、异期或超龄');
  setLeafText('odp-asof', crudeAsOf);
  const brent = ev.brentPrice || {};
  const brentSource = /fred/i.test(brent.quoteSource || brent.source || '') ? 'FRED/EIA 现货' : /eia/i.test(brent.quoteSource || brent.source || '') ? 'EIA 现货' : '来源待核';
  const brentText = Number.isFinite(brent.value) && brent.asOfDate
    ? `Brent ${formatUsd(brent.value)}（${brentSource}），观察日 ${compactDate(brent.asOfDate)}，${brent.sourceStatus === 'live' ? '来源观察值' : '历史值，已超龄或源不可用'}。`
    : 'Brent 未知：缺少与选定价格匹配的真实源观察日。';
  setLeafText('odp-brent-basis-alert', `${brentText}快照生成时间不代表报价观察时间。`);
  renderAttribution(it, sig, ev, qualified);
  if (!sig || !qualified.physicalUsable) {
    // insufficient_data -> no replacement by price, news, satellite or monthly background.
    for (const id of REASON_IDS) setLeafText(id, '暂不判断');
    setLeafText('odp-evidence-note', '本周美国供需数据不足或已超龄，暂不给出方向判断；市场、新闻与月度背景不替代缺失的美国周度依据。');
    renderEvidenceList(ev);
    return;
  }
  setLeafText('odp-reason-inventory', reasonInventory(sig, ev));
  setLeafText('odp-reason-diesel', reasonDiesel(sig, ev));
  setLeafText('odp-reason-curve', reasonCurve(sig, ev));
  setLeafText('odp-reason-refinery', reasonRefinery(sig, ev));
  setLeafText('odp-reason-spr', reasonSpr(sig));
  setLeafText('odp-reason-demand', reasonDemand(sig));
  setLeafText('odp-evidence-note', `8 项周度统计来自美国 EIA WPSR（观察日 ${crudeAsOf}），不是 8 个独立来源；市场价格分别标注观察日，缺失或超龄时不作方向依据。仅供参考,不参与平台的风险打分与决策。`);
  renderEvidenceList(ev);
}
