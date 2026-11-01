import { snapshotDisplayHealth } from './snapshotFreshness.js?v=ofr-primary-20261101-r1';
import { buildFourLaneReadout } from './fourLaneReadout.js?v=ofr-primary-20261101-r1';

const DAY = 86400000;
const finite = Number.isFinite;
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + 'T00:00:00Z');
  return finite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}
const raw = value => finite(value) ? value.toFixed(3) : '—';
const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(3)}` : '待累计';
const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const STATUS = { available: '官方观察值', cached: '抓取失败 · 保留旧观察', stale: '观察已超龄', missing_current: '最新观察缺值', unavailable: '官方读数待更新' };

// Display qualification only: never constructs a score, band or allocation.
export function buildOfrView(radarData, nowMs = Date.now()) {
  const c = radarData?.mainPressureReadout;
  const today = finite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : null;
  const observation = date(c?.index?.observedDate);
  const receipt = Date.parse(c?.source?.retrievedAt ?? '');
  const publication = Date.parse(c?.asOf ?? '');
  const valid = c?.contractVersion === 'ofr-primary-pressure-observation-v1'
    && c.modelId === 'ofr_fsi_published_index' && Object.hasOwn(STATUS, c.status)
    && c.source?.provider === 'Office of Financial Research'
    && c.source?.sourceUrl === 'https://www.financialresearch.gov/financial-stress-index/'
    && /^[a-f0-9]{64}$/.test(c.source?.snapshotSha256 ?? '')
    && observation !== null && observation === c.source.observedDate && observation <= today
    && finite(receipt) && finite(publication) && receipt <= publication && publication <= nowMs
    && observation <= c.source.retrievedAt.slice(0, 10)
    && c.boundaries?.oldThresholdsApplied === false && c.boundaries?.tailFloorAdded === false
    && c.boundaries?.worldOrderAdded === false && c.boundaries?.positionMapping === null;
  if (!valid) return { current: false, status: 'unavailable', value: null, date: null, percentile: null, weekly: null, history: [] };
  const days = (Date.parse(today) - Date.parse(observation)) / DAY;
  const status = days > 7 ? 'stale' : c.status;
  const current = c.currentEligible === true && status === 'available' && c.retrieval?.status === 'received' && c.retrieval?.fallbackUsed === false && finite(c.index.value);
  const p = c.percentile;
  const percentile = finite(p?.value) && p.value >= 0 && p.value <= 100 && p.years === 10 && p.method === 'strict_prior_midrank' && p.endDateExclusive === observation && p.historyRows >= 2000 && p.reasons?.length === 0 ? p.value : null;
  const w = c.weeklyChange;
  const weeklyDays = date(w?.fromDate) ? (Date.parse(observation) - Date.parse(w.fromDate)) / DAY : null;
  const weekly = finite(w?.value) && finite(c.index.value) && w.toDate === observation && weeklyDays >= 7 && weeklyDays <= 11 ? { value: w.value, fromDate: w.fromDate, toDate: w.toDate } : null;
  let prior = '';
  const history = Array.isArray(c.history) && c.history.length <= 64 && c.history.every(r => {
    const ok = date(r?.date) && r.date > prior && r.date <= observation && finite(r.value); prior = r?.date; return ok;
  }) ? c.history : [];
  return { current, status, value: finite(c.index.value) ? c.index.value : null, date: observation, percentile, weekly, history };
}

function row(label, status, detail) {
  const wrap = document.createElement('div'); wrap.className = 'hero-lane-row';
  for (const [tag, cls, value] of [['dt', 'hero-lane-label', label], ['dd', 'hero-lane-status', status], ['dd', 'hero-lane-detail', detail]]) {
    const el = document.createElement(tag); el.className = cls; el.textContent = value; wrap.append(el);
  }
  return wrap;
}

export function renderOfrPrimary({ radarData, worldOrderStressData, nowMs = Date.now() } = {}) {
  for (const id of ['trend-line-score', 'trend-line-overlay']) document.getElementById(id)?.setAttribute('points', '');
  for (const id of ['trend-dots-score', 'trend-dots-overlay']) document.getElementById(id)?.replaceChildren();
  const v = buildOfrView(radarData, nowMs);
  const label = STATUS[v.status];
  text('hero-score-value', v.current ? raw(v.value) : '—');
  text('hero-score-attribution', v.current ? `OFR FSI原值 · ${v.date}` : `${label}${v.date ? ` · 原观察日 ${v.date} · 原值 ${raw(v.value)}` : ''}`);
  text('hero-verdict-kicker', 'FINANCIAL STRESS · 金融压力观测');
  text('hero-verdict-headline', v.current ? (v.value > 0 ? '高于历史平均' : v.value < 0 ? '低于历史平均' : '处于历史平均') : label);
  text('hero-verdict-body', `${v.current ? 'OFR原值以0为历史平均参考；负值不等于没有风险。' : '当前主读数暂不具备有效本期资格；不以旧综合分代替。'}这是已发表金融市场压力的测量，约滞后两个营业日，不能直接判断估值泡沫、危机概率或市场顶部。能源尾部和世界秩序单列观察，不抬高本读数。`);
  text('hero-dominant-chain', v.date ?? '观察日待更新');
  text('hero-weekly-change', v.weekly ? `${signed(v.weekly.value)} · ${v.weekly.fromDate} → ${v.weekly.toDate}${v.current ? '' : '（旧观察）'}` : '趋势待累计');
  text('hero-data-health', snapshotDisplayHealth(radarData, nowMs).heroLabel);
  text('hero-breakdown-counts', '独立警报与旧模型诊断见下方');
  text('hero-overlay-score', finite(worldOrderStressData?.score) ? `${worldOrderStressData.score} · 独立观察，不升档OFR` : '待更新');
  text('threshold-now-line', v.percentile === null ? '十年历史位置待累计' : `严格过去十年历史百分位 ${v.percentile.toFixed(1)} · ${v.date}${v.current ? '' : '（旧观察）'}`);
  text('ofr-scale-note', '原值高于0：压力高于历史平均；低于0：低于历史平均。百分位表示相对历史位置，不是危机概率，也不是新的风险评分。');
  const host = document.getElementById('hero-four-lanes');
  if (host) {
    host.replaceChildren();
    if (radarData) {
      const lanes = buildFourLaneReadout(radarData, nowMs).lanes;
      const shock = lanes.shock;
      host.append(row('金融压力', v.current ? raw(v.value) : label, v.percentile === null ? '十年历史位置待累计' : `十年百分位 ${v.percentile.toFixed(1)} · 非概率`));
      host.append(row('结构脆弱性', '分项观察 · 无综合评分', lanes.fragility.gaps.map(g => `${g.label}：${g.status}`).join(' · ')));
      host.append(row('尾部与运输', shock.tail.length ? shock.tail.map(t => t.label).join(' / ') : shock.tailKnown ? '快照未记录尾部触发' : '尾部记录待核验', `记录对应雷达快照 ${radarData.updatedAt?.slice(0, 10) ?? '日期待核验'}；运输：${shock.transport.status}${shock.transport.expired && !shock.transport.status.includes('过期') ? ' · 过期' : ''}。独立观察，不加分OFR；未触发不等于没有风险。`));
      host.append(row('数据可信度', lanes.credibility.label, `OFR：${label}；各来源按原观察日解读，采集健康不等于所有指标均为本日。`));
    }
    host.hidden = !radarData;
  }
  renderOfrTrend(v);
  return v;
}

function svgEl(tag, attributes, content) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  if (content !== undefined) el.textContent = content;
  return el;
}
function renderOfrTrend(v) {
  const svg = document.getElementById('ofr-trend-svg'); if (!svg) return;
  svg.replaceChildren();
  const width = Math.max(280, Math.round(svg.getBoundingClientRect?.().width || 800));
  svg.setAttribute('viewBox', `0 0 ${width} 220`);
  if (v.history.length < 2) { svg.append(svgEl('text', { x: 20, y: 100, class: 'ofr-trend-label' }, 'OFR有日期的趋势待累计')); return; }
  const rows = v.history;
  const lo = Math.min(0, ...rows.map(r => r.value)), hi = Math.max(0, ...rows.map(r => r.value));
  const pad = Math.max(0.2, (hi - lo) * 0.15), min = lo - pad, max = hi + pad;
  const start = Date.parse(rows[0].date), span = Date.parse(rows.at(-1).date) - start;
  const end = width - 14;
  const x = r => 58 + (end - 58) * (Date.parse(r.date) - start) / span;
  const y = value => 190 - 170 * (value - min) / (max - min);
  for (const value of [min, 0, max]) {
    svg.append(svgEl('line', { x1: 58, x2: end, y1: y(value), y2: y(value), class: 'trend-grid-line' }));
    svg.append(svgEl('text', { x: 50, y: y(value) + 4, 'text-anchor': 'end', class: 'ofr-trend-label' }, value.toFixed(2)));
  }
  svg.append(svgEl('polyline', { points: rows.map(r => `${x(r).toFixed(2)},${y(r.value).toFixed(2)}`).join(' '), class: 'ofr-trend-line' }));
  for (const r of [rows[0], rows.at(-1)]) svg.append(svgEl('text', { x: x(r), y: 212, 'text-anchor': r === rows[0] ? 'start' : 'end', class: 'ofr-trend-label' }, r.date));
}
