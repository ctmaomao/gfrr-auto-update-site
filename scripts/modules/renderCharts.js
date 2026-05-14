import { $, fmtSignedArrow } from './config.js?v=28.0M-33V';
import { renderList } from './renderTables.js?v=28.0M-33V';

const CHART_COLORS = {
  primary: '#7C1D1D',
  heatLow: '#1F4D2C',
  heatMid: '#A8761A',
  heatHigh: '#7C1D1D',
  heatSevere: '#5A0F0F'
};

function chartRiskColor(score) {
  if (!Number.isFinite(score)) return '#E8E0D4';
  if (score >= 85) return CHART_COLORS.heatSevere;
  if (score >= 70) return CHART_COLORS.heatHigh;
  if (score >= 50) return CHART_COLORS.heatMid;
  return CHART_COLORS.heatLow;
}

const TRANSMISSION_CHAIN_ORDER = [
  '油价→通胀',
  '通胀→利率',
  '利率→股票',
  '流动性→估值',
  '美元→信用'
];

const ASSET_MAPPING_ORDER = [
  '能源',
  '美元/短票',
  '黄金',
  '科技股',
  '全球股票',
  '长久期债券'
];

function sortByLabelOrder(items, orderedLabels, labelKey) {
  if (!Array.isArray(items)) return [];
  const rank = new Map(orderedLabels.map((label, index) => [label, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = rank.has(a.item?.[labelKey]) ? rank.get(a.item[labelKey]) : orderedLabels.length;
      const rb = rank.has(b.item?.[labelKey]) ? rank.get(b.item[labelKey]) : orderedLabels.length;
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function renderBars(containerId, items, isTrend = false) {
  const root = $(containerId);
  root.innerHTML = '';
  root.className = 'progress-group';
  const orderedItems = containerId === 'path-change-bars'
    ? sortByLabelOrder(items, TRANSMISSION_CHAIN_ORDER, 'label')
    : items;
  orderedItems.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.className = 'progress-row';
    const trendNote = isTrend ? `<div class="progress-note">较上次 ${fmtSignedArrow(item.delta)}</div>` : '';
    wrap.innerHTML = `
      <div class="progress-top"><span>${item.label}</span><span>${item.value}%</span></div>
      <div class="progress-track"><div class="progress-fill ${item.mode || ''}" style="width:${item.value}%"></div></div>
      ${trendNote}
    `;
    root.appendChild(wrap);
  });
}

export function renderLineChart(svgId, history, opts = {}) {
  const svg = $(svgId);
  const width = opts.width || 760;
  const height = opts.height || 220;
  const pad = opts.pad || { top: 18, right: 18, bottom: 34, left: 46 };
  const values = history.map((d) => d.score);
  const dates = history.map((d) => d.date.slice(5));
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const x = (i) => pad.left + (i * (width - pad.left - pad.right)) / Math.max(1, history.length - 1);
  const y = (v) => height - pad.bottom - ((v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const line = history.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.score)}`).join(' ');
  const area = `${line} L ${x(history.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`;
  const gridValues = [min, Math.round((min + max) / 2), max];
  const grid = gridValues.map((g) => `
    <line class="gridline" x1="${pad.left}" y1="${y(g)}" x2="${width - pad.right}" y2="${y(g)}"></line>
    <text x="${pad.left - 10}" y="${y(g) + 4}" text-anchor="end">${g}</text>
  `).join('');
  const labelEvery = history.length > 10 ? 3 : 1;
  const labels = dates.map((d, i) => i % labelEvery === 0 || i === history.length - 1
    ? `<text x="${x(i)}" y="${height - 12}" text-anchor="middle">${d}</text>`
    : '').join('');
  const points = history.map((d, i) => `<circle class="point" cx="${x(i)}" cy="${y(d.score)}" r="${history.length > 10 ? 3.5 : 5}"></circle>`).join('');
  svg.innerHTML = `
    <defs>
      <linearGradient id="${svgId}-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${CHART_COLORS.primary}"></stop>
        <stop offset="100%" stop-color="${CHART_COLORS.primary}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    ${grid}
    <path class="area" d="${area}" fill="url(#${svgId}-gradient)" opacity="0.24"></path>
    <path class="series" d="${line}"></path>
    ${points}
    ${labels}
  `;
}

export function wrapSvgText(text, maxChars = 10) {
  const safe = String(text || '');
  const chunks = [];
  for (let i = 0; i < safe.length; i += maxChars) chunks.push(safe.slice(i, i + maxChars));
  return chunks;
}

export function renderHeatmap(regions) {
  const svg = $('world-heatmap');
  const list = $('heatmap-list');
  list.innerHTML = '';
  const layout = {
    us: { x: 34, y: 108, w: 182, h: 90 },
    latam: { x: 118, y: 228, w: 118, h: 104 },
    europe: { x: 292, y: 78, w: 130, h: 78 },
    middleEast: { x: 430, y: 140, w: 136, h: 88 },
    china: { x: 592, y: 104, w: 132, h: 92 },
    japan: { x: 672, y: 206, w: 86, h: 70 },
    emAsia: { x: 548, y: 232, w: 126, h: 84 }
  };
  const heatmapKeyAliases = { middleeast: 'middleEast' };
  svg.innerHTML = `
    <rect x="12" y="20" width="756" height="330" rx="24" fill="transparent" stroke="rgba(26,24,21,0.08)"></rect>
    <text class="heat-label" x="44" y="48">区域风险集中度</text>
  `;
  regions.forEach((region) => {
    const normalizedKey = heatmapKeyAliases[region.key] || region.key;
    const spec = layout[normalizedKey];
    if (!spec) return;
    const color = chartRiskColor(region.risk);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `
      <rect class="heat-region" x="${spec.x}" y="${spec.y}" width="${spec.w}" height="${spec.h}" rx="20" fill="${color}" fill-opacity="0.82"></rect>
      <text class="heat-label" x="${spec.x + 12}" y="${spec.y + 32}">${region.shortLabel}</text>
      <text class="heat-score" x="${spec.x + 12}" y="${spec.y + 58}">风险 ${region.risk}</text>
    `;
    svg.appendChild(g);
    const item = document.createElement('div');
    item.className = 'heatmap-item';
    item.innerHTML = `
      <span class="swatch" style="background:${color}"></span>
      <div class="swatch-label"><strong>${region.label}</strong><span>${region.note}</span></div>
      <strong>${region.risk}</strong>
    `;
    list.appendChild(item);
  });
}

function formatTransmissionDelta(delta) {
  if (!Number.isFinite(delta)) return '趋势待累计';
  const rounded = Math.round(delta * 10) / 10;
  const value = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  if (rounded > 0) return `Δ +${value}`;
  if (rounded < 0) return `Δ ${value}`;
  return '持平';
}

export function renderTransmission(chain) {
  $('chain-regime-tag').textContent = chain.regimeTag;
  $('chain-stress-score').textContent = chain.stressScore;
  $('chain-lead-shock').textContent = chain.leadShock;
  $('chain-confidence').textContent = `${chain.pathConfidence}%`;
  $('chain-dominant-impact').textContent = chain.dominantImpact;
  const flow = $('chain-flow');
  flow.innerHTML = '';
  chain.nodes.forEach((node) => {
    const color = chartRiskColor(node.score);
    const card = document.createElement('div');
    card.className = 'chain-node';
    const deltaClass = node.delta > 0 ? 'up' : node.delta < 0 ? 'down' : 'flat';
    const deltaText = formatTransmissionDelta(node.delta);
    card.innerHTML = `
      <div class="chain-node-top">
        <div class="chain-node-title">${node.label}</div>
        <div class="chain-node-score">${node.score}</div>
      </div>
      <div class="chain-node-meta">
        <div class="chain-node-direction">${node.directionLabel}</div>
        <div class="chain-delta ${deltaClass}">${deltaText}</div>
      </div>
      <div class="chain-node-bar"><div class="chain-node-fill" style="width:${node.score}%; background:${color}"></div></div>
      <div class="chain-node-note">${node.note}</div>
    `;
    flow.appendChild(card);
  });
  const layers = $('chain-layers');
  layers.innerHTML = '';
  chain.layers.forEach((layer) => {
    const div = document.createElement('div');
    div.className = 'chain-layer-card';
    div.innerHTML = `
      <div class="chain-layer-title"><span>${layer.name}</span><span>${layer.score}</span></div>
      <div class="chain-layer-tags">${layer.items.map((item) => `<span class="chain-tag">${item}</span>`).join('')}</div>
    `;
    layers.appendChild(div);
  });
  const decomp = $('chain-decomposition');
  decomp.innerHTML = '';
  chain.decomposition.forEach((asset) => {
    const card = document.createElement('div');
    card.className = 'decomp-card';
    card.innerHTML = `<div class="decomp-title"><span>${asset.asset}</span><span>${asset.total}</span></div>`;
    asset.drivers.forEach((driver) => {
      const row = document.createElement('div');
      row.className = 'decomp-row';
      row.innerHTML = `
        <span>${driver.label}</span>
        <div class="decomp-bar"><div class="decomp-fill" style="width:${driver.value}%"></div></div>
        <strong>${driver.value}</strong>
      `;
      card.appendChild(row);
    });
    decomp.appendChild(card);
  });
  renderList('chain-summary', chain.summary);
  const impacts = $('chain-asset-impacts');
  impacts.innerHTML = '';
  sortByLabelOrder(chain.assetImpacts, ASSET_MAPPING_ORDER, 'asset').forEach((item) => {
    const div = document.createElement('div');
    div.className = 'chain-impact-item';
    div.innerHTML = `
      <strong>${item.asset}</strong>
      <span class="chain-impact-direction ${item.directionClass}">${item.directionLabel}</span>
      <span class="chain-impact-score">${item.score}</span>
    `;
    impacts.appendChild(div);
  });
}
