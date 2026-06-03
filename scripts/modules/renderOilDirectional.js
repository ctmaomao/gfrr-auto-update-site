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
  if (!el || !tone) return;
  el.className = `${baseClass} ${tone}`;
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

function reasonInventory(sig, ev) {
  const i = sig.inventoryDrawPressure || {};
  const e = ev.crudeStocksExSpr || {};
  const trend = i.drawAccel ? '加速去化' : (Number.isFinite(i.change4w) && i.change4w < 0 ? '去化' : '回补');
  return `${trend},近 4 周 ${signed(e.change4w)} 千桶,5 年同期 ${pct(e.vs5yAvgPct)}`;
}
function reasonDiesel(sig, ev) {
  const d = sig.dieselProductStress || {};
  const e = ev.distillateStocks || {};
  const state = d.extremeTight ? '极紧' : (d.tight ? '偏紧' : '正常');
  return `${state},5 年同期 ${pct(e.vs5yAvgPct)}`;
}
function reasonCurve(sig, ev) {
  const pc = sig.priceContext || {};
  const c = ev.curve || {};
  const regime = pc.curveSlopeRegime === 'backwardation' ? 'backwardation(近强远弱)'
    : pc.curveSlopeRegime === 'contango' ? 'contango(近弱远强)' : '—';
  return `${regime},前-后 ${signed(c.frontMinusBack, 2)}(低置信代理)`;
}
function reasonRefinery(sig) {
  const r = sig.refineryConfirmation || {};
  const state = r.high ? '偏高' : (r.low ? '偏低' : '中性');
  return `开工率 4 周均 ${fixed(r.utilAvg4w, 1)}%,${state}`;
}
function reasonSpr(sig) {
  const s = sig.sprBufferEffectiveness || {};
  return `近 4 周 ${signed(s.sprChange4w)} 千桶${s.bufferInsufficient ? ',缓冲不足以抵消商业去化' : ''}`;
}
function reasonDemand(sig) {
  const d = sig.demandDestructionRisk || {};
  const ratio = (Number.isFinite(d.suppliedAvg4w) && Number.isFinite(d.suppliedAvg13w) && d.suppliedAvg13w)
    ? (d.suppliedAvg4w / d.suppliedAvg13w).toFixed(2) : '—';
  const state = d.demandDestruction ? '需求破坏' : (d.demandFalling ? '需求转弱' : '未见需求破坏');
  return `产品供应 4w/13w 比 ${ratio},${state}`;
}

function buildHeadline(finalBias, it, sig) {
  const pc = (sig && sig.priceContext) || {};
  const brent = pct(pc.brentChangePct4w);
  switch (finalBias) {
    case 'false_down_physical_stress':
      return `布伦特近 ~4 周 ${brent},价格回落;但物理链仍偏紧(库存加速去化 + 期限结构 backwardation + 柴油偏紧),下跌未获物理确认。`;
    case 'false_up_unconfirmed':
      return `布伦特近 ~4 周 ${brent},价格走高;但物理链偏松(库存回补 + 曲线走弱 + 柴油改善),上涨缺物理确认。`;
    case 'strong_bullish':
      return `物理链强紧张:库存加速去化、炼厂高开工、SPR 缓冲不足以抵消,布伦特近 ~4 周 ${brent}。`;
    case 'moderate_bullish':
      return `物理链偏紧(库存偏低或去化),布伦特近 ~4 周 ${brent}。`;
    case 'product_crisis':
      return `成品油主导:柴油/裂解极紧、炼厂受限,压力来自下游而非原油本身,布伦特近 ~4 周 ${brent}。`;
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

export function renderOilDirectional({ oilData }) {
  if (!oilData || typeof oilData !== 'object') {
    setLeafText('odp-verdict', '数据不可用');
    setLeafText('odp-headline', '油价方向研判数据未能加载,暂不显示。');
    return;
  }

  const finalBias = oilData.finalBias;
  const it = oilData.interpretation || {};
  const sig = oilData.signals;
  const ev = oilData.evidence || {};
  const crudeAsOf = (ev.crudeStocksExSpr && ev.crudeStocksExSpr.asOfDate) || '—';

  setLeafText('odp-verdict', FINAL_BIAS_ZH[finalBias] || '—');
  setToneClass('odp-verdict', 'section-title', FINAL_BIAS_TONE[finalBias]);
  setLeafText('odp-headline', buildHeadline(finalBias, it, sig));
  setLeafText('odp-physical-bias', PHYSICAL_BIAS_ZH[it.physicalBias] || '—');
  setLeafText('odp-divergence', DIVERGENCE_ZH[it.divergence] || '—');
  setLeafText('odp-data-sufficiency', DATA_SUFFICIENCY_ZH[it.dataSufficiency] || '—');
  setLeafText('odp-asof', crudeAsOf);

  if (!sig) {
    // insufficient_data -> 暂不判断, no fabricated reasons.
    for (const id of REASON_IDS) setLeafText(id, '暂不判断');
    setLeafText('odp-evidence-note', '本周物理链数据不足(非 8 源同周 live),暂不给出方向判断。');
    return;
  }

  setLeafText('odp-reason-inventory', reasonInventory(sig, ev));
  setLeafText('odp-reason-diesel', reasonDiesel(sig, ev));
  setLeafText('odp-reason-curve', reasonCurve(sig, ev));
  setLeafText('odp-reason-refinery', reasonRefinery(sig));
  setLeafText('odp-reason-spr', reasonSpr(sig));
  setLeafText('odp-reason-demand', reasonDemand(sig));
  setLeafText('odp-evidence-note', `物理链 8 个周度源(EIA WPSR,截至 ${crudeAsOf});价格方向取布伦特近 ~4 周变动,期限结构为低置信公开代理。`);
  renderEvidenceList(ev);
}
