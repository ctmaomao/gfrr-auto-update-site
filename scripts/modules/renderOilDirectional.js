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
  'odp-energy-spare-status',
  'odp-energy-spare-value',
  'odp-energy-spare-regime',
  'odp-energy-spare-period',
  'odp-energy-spare-note',
  'odp-energy-transport-status',
  'odp-energy-transport-date',
  'odp-energy-transport-rerouting',
  'odp-energy-transport-note',
  'odp-energy-source-boundary',
];
const CORE_CHOKEPOINTS = [
  ['suez', 'Suez'],
  ['babElMandeb', 'Bab el-Mandeb'],
  ['malacca', 'Malacca'],
  ['hormuz', 'Hormuz'],
  ['capeGoodHope', 'Cape'],
  ['gibraltar', 'Gibraltar'],
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
function formatMbpd(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v < 0.1 ? v.toFixed(2) : v.toFixed(1)} mbpd`;
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
    live: 'live',
    fallback: 'fallback · 沿用',
    stale: 'stale · 待刷新',
    missing: 'missing · 源暂不可用',
    insufficient_window: '窗口不足',
  })[normalized] || '源暂不可用';
}
function reroutingZh(regime) {
  return ({
    rerouting_watch: '红海->好望角绕行代理偏高',
    normal: '未见显著绕行代理',
    unknown: '窗口不足',
  })[regime] || '窗口不足';
}
function clearEnergyAddendum() {
  for (const id of ENERGY_TEXT_IDS) setLeafText(id, '—');
  const coreHost = $('odp-energy-transport-core');
  if (coreHost) coreHost.textContent = '—';
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
    const tanker = Number.isFinite(latest.nTanker) ? `${latest.nTanker} tankers` : '—';
    const cap = Number.isFinite(latest.capacityTanker) ? `capacity ${compactNumber(latest.capacityTanker)}` : 'capacity —';
    const dev = Number.isFinite(item.latestVs30dPct) ? `30d ${ratioPct(item.latestVs30dPct)}` : '30d —';
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
function renderEnergyTransport(transport) {
  const status = transport && transport.sourceStatus ? transport.sourceStatus.chokepoints : null;
  setLeafText('odp-energy-transport-status', statusZh(status));

  if (!transport || typeof transport !== 'object' || status === 'missing') {
    setLeafText('odp-energy-transport-date', '—');
    setLeafText('odp-energy-transport-rerouting', '源暂不可用');
    setLeafText('odp-energy-transport-note', '咽喉转运补充层暂不可用;本区只显示 Daily 已生成的 compact 派生摘要,不读取浏览器外部源。');
    renderTransportCore(null);
    return;
  }

  const age = Number.isFinite(transport.latestAgeDays) ? ` · ${Math.round(transport.latestAgeDays)} 天前` : '';
  const rerouting = transport.reroutingProxy || {};
  const redSea = Number.isFinite(rerouting.suezBabTankerVs30dPct) ? `Suez/Bab ${ratioPct(rerouting.suezBabTankerVs30dPct)}` : 'Suez/Bab —';
  const cape = Number.isFinite(rerouting.capeTankerVs30dPct) ? `Cape ${ratioPct(rerouting.capeTankerVs30dPct)}` : 'Cape —';
  setLeafText('odp-energy-transport-date', `${transport.latestDate || '—'}${age}`);
  setLeafText('odp-energy-transport-rerouting', `${reroutingZh(rerouting.redSeaToCapeRegime)} · ${redSea} / ${cape}`);
  setLeafText('odp-energy-transport-note', 'PortWatch AIS-derived proxy;船舶计数和 capacity 是观测代理,可能受 GPS jamming、AIS spoofing、vessels going dark、绕行或数据延迟影响;不是官方贸易统计,不估算军事或价格结果。');
  renderTransportCore(transport);
}
function renderEnergyAddendum(radarData) {
  clearEnergyAddendum();
  const macroDrivers = radarData && radarData.macroDrivers ? radarData.macroDrivers : {};
  renderSpareCapacity(macroDrivers.energySpareCapacity);
  renderEnergyTransport(macroDrivers.energyTransport);
  setLeafText('odp-energy-source-boundary', '边界:OPEC 闲置产能与咽喉转运均为 audit-only / display-only 能源证据层,不进入 scoring、decision、execution、position、World Order weights 或 Global Risk Heatmap。');
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

export function renderOilDirectional({ oilData, radarData }) {
  renderEnergyAddendum(radarData);

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
  setLeafText('odp-evidence-note', `物理链 = 馏分油库存 -> 裂解价差/炼厂开工 -> 商业原油库存 -> Brent 期限结构;8 个周度源来自 EIA WPSR(截至 ${crudeAsOf}),价格方向取布伦特近 ~4 周变动,期限结构为低置信公开代理;本层 audit-only / display-only,不进入 scoring / decision / execution / Heatmap。`);
  renderEvidenceList(ev);
}
