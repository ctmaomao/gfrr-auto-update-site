const dataUrl = './data/radar-data.json';
const historyUrl = './data/radar-history.json';
const realtimeUrl = './realtime/market.json';

const $ = (id) => document.getElementById(id);
const fmtSigned = (n) => `${n > 0 ? '+' : ''}${n}`;
const riskColor = (score) => {
  if (score >= 85) return '#ff5e72';
  if (score >= 70) return '#ff9a5d';
  if (score >= 50) return '#ffd46a';
  return '#2fd38a';
};
const trendClass = (delta) => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
const fmtDeltaSafe = (n) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '--';
const deltaArrow = (n) => !Number.isFinite(n) || n === 0 ? '→' : n > 0 ? '↑' : '↓';
const fmtSignedArrow = (n) => `${deltaArrow(n)} ${Number.isFinite(n) ? Math.abs(n) : '--'}`;


function fmtNumSafe(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

function computeRealtimeOverlay(base, realtime) {
  if (!realtime || !realtime.values) return base;

  const next = structuredClone(base);
  next.realtime = realtime;

  const brent = realtime.values.brent || 0;
  const dxy = realtime.values.dxy || 0;
  const vix = realtime.values.vix || 0;
  const hy = realtime.values.hyOas || 0;
  const us10y = realtime.values.us10y || 0;
  const real10y = realtime.values.real10y || 0;
  const gold = realtime.values.gold || 0;
  const spx = realtime.values.spx || 0;
  const breakeven10y = realtime.values.breakeven10y || 0;

  const oilRisk = Math.max(0, Math.min(100, Math.round((brent - 60) * 2)));
  const dollarRisk = Math.max(0, Math.min(100, Math.round((dxy - 95) * 8)));
  const hyRisk = Math.max(0, Math.min(100, Math.round((hy - 2.5) * 35)));
  const vixRisk = Math.max(0, Math.min(100, Math.round((vix - 12) * 7)));
  const realRisk = Math.max(0, Math.min(100, Math.round((real10y - 0.5) * 33)));
  const inflationRisk = Math.max(0, Math.min(100, Math.round(((breakeven10y || 2.2) - 1.5) * 45 + oilRisk * 0.35)));

  next.modules.energy = Math.max(0, Math.min(100, Math.round((next.modules.energy * 0.45) + oilRisk * 0.55)));
  next.modules.liquidity = Math.max(0, Math.min(100, Math.round((next.modules.liquidity * 0.35) + dollarRisk * 0.35 + hyRisk * 0.2 + vixRisk * 0.1)));
  next.modules.inflation = Math.max(0, Math.min(100, Math.round((next.modules.inflation * 0.4) + inflationRisk * 0.6)));
  next.modules.debt = Math.max(0, Math.min(100, Math.round((next.modules.debt * 0.45) + realRisk * 0.55)));

  next.liquidityIndex.score = next.modules.liquidity;
  next.liquidityIndex.regime = next.modules.liquidity >= 70 ? '限制性偏紧' : next.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复';
  next.liquidityIndex.directionLabel = realtime.degradedMode ? '快变量部分降级' : '快变量已实时覆盖';
  next.liquidityIndex.notes = [
    `实时快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`,
    ...(realtime.notes || [])
  ];

  let level = 'green';
  let levelLabel = 'GREEN / 允许进攻';
  let title = '今天允许小幅加仓，但必须按纪律分批执行';
  let desc = '流动性、信用和波动率均已回到相对稳定区，系统允许小幅提高风险暴露，但仍要按目标仓位和分批规则执行。';
  let allow = ['允许分三笔内提高总仓位。','允许增加防御型权益和部分科技观察仓。','允许降低美元/短票与现金缓冲。'];
  let block = ['禁止一次性打满仓位。','禁止在单日大涨后追高。','禁止无视硬阈值。'];
  let mandatory = ['任何新增仓位都必须分批完成。','若风险信号重新转黄，次日停止加仓。','若周回撤超过 -3%，立即回到 YELLOW 纪律。'];
  let target = '58%';
  let cash = '20%';
  let status = '风险可控，仍需阈值约束';

  if (next.modules.liquidity >= 75 || brent >= 110 || hy >= 4.5 || vix >= 28) {
    level = 'red';
    levelLabel = 'RED / 只允许减仓';
    title = '今天禁止主动加仓，只允许减仓或恢复防御层';
    desc = '风险阈值已进入高压区。系统锁定为 RED：任何新增风险动作都被禁止，只允许执行减仓、补现金和恢复防御仓。';
    allow = ['允许降低总风险暴露。', '允许补充现金、美元/短票和黄金对冲。', '允许把高Beta与久期仓位降回最低。'];
    block = ['禁止任何新增进攻仓位。', '禁止因为盘中反弹而追价。', '禁止主观覆盖系统阈值。'];
    mandatory = ['若总仓位高于 46%，今日必须减回 42% 附近。', '若科技/高Beta > 2%，必须先降仓。', '若现金缓冲 < 30%，必须补回。'];
    target = '42%';
    cash = '32%';
    status = '硬阈值风控全面生效';
  } else if (next.modules.liquidity >= 60 || brent >= 90 || hy >= 3.7 || vix >= 20) {
    level = 'yellow';
    levelLabel = 'YELLOW / 仅允许微调';
    title = '今天不能主动加风险，只允许对齐目标仓位与防守再平衡';
    desc = '当前不属于进攻窗口。系统允许的动作仅限于：把总仓位校准到目标值附近，维持能源、美元/短票与黄金对冲层；禁止扩大科技、高Beta和久期风险暴露。';
    allow = ['允许把总仓位向目标值 48% 靠拢，但调整幅度不得超过 ±5%。', '允许维持或小幅补足能源、美元/短票、黄金对冲层。', '允许对防御型股票保留观察仓，不允许扩大为进攻主仓。'];
    block = ['禁止新增高Beta、科技与久期进攻仓位。', '禁止因为单日反弹而提升总风险暴露。', '禁止主观覆盖风控阈值和动作清单。'];
    mandatory = ['若当前总仓位高于 53%，今日必须先减仓再做任何调整。', '若科技/高Beta 高于 3%，今日必须降回上限以内。', '若现金缓冲低于 25%，今日必须恢复到安全区间。'];
    target = '48%';
    cash = '27%';
    status = '硬阈值风控生效中';
  }

  next.tradingSystem.executionLock = {
    tag: realtime.degradedMode ? '快变量部分降级 · 主观不得覆盖' : '快变量实时覆盖 · 主观不得覆盖',
    level,
    levelLabel,
    title,
    description: desc,
    allow,
    block,
    mandatory
  };

  next.tradingSystem.actionLayer = {
    tag: '今日执行清单（不可主观覆盖）',
    priorityLine: `执行顺序：先看执行状态灯（${levelLabel}）→ 再处理强制动作 → 再校准目标仓位；若不满足允许条件，直接停止交易。`,
    todayAction: level === 'red'
      ? '今日只允许减仓与恢复防御层，不允许任何新增风险动作。'
      : level === 'yellow'
        ? `今日只允许把组合对齐到目标总仓位 ${target}，并维持能源、美元/短票与黄金对冲层；不允许新增进攻性加仓。`
        : `今日允许小幅提高总仓位到 ${target}，但必须分批执行并保留最低现金缓冲 ${cash}。`,
    checklist: level === 'red'
      ? ['若总仓位高于 46%，先减到 42% 左右。','恢复美元/短票和现金缓冲。','把科技/高Beta 降至最低观察仓。']
      : level === 'yellow'
        ? ['若总仓位高于 53%，先减仓。','维持能源、美元/短票与黄金对冲层。','全球股票仅保留防御仓，科技/高Beta 不超过 3%。']
        : ['按三笔以内分批加仓。','优先增加防御型股票与部分科技观察仓。','保持现金缓冲不低于 20%。'],
    blocked: block,
    checkpoints: [
      `检查布伦特是否高于 ${fmtNumSafe(brent,1)}。`,
      `检查 VIX 是否高于 ${fmtNumSafe(vix,2)}。`,
      `检查 HY OAS 是否高于 ${fmtNumSafe(hy,2)}%。`,
      '检查执行状态灯是否发生切换。'
    ]
  };

  next.tradingSystem.positioning.targetGrossExposure = target;
  next.tradingSystem.positioning.cashBufferTarget = cash;
  next.tradingSystem.riskControl.status = status;
  next.tradingSystem.riskControl.systemState = title;
  next.tradingSystem.riskControl.maxDrawdown = level === 'red' ? '-6%' : '-8%';

  next.topRisks = [
    `盘中快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    ...next.topRisks.slice(0, 3)
  ];
  next.decisionLine = `v24 混合实时架构已启用：慢变量来自静态构建，执行状态灯与今日执行由盘中快变量实时覆盖。`;
  next.summary = `${base.summary} 当前盘中快变量显示：Brent ${fmtNumSafe(brent,1)}，DXY ${fmtNumSafe(dxy,2)}，VIX ${fmtNumSafe(vix,2)}，HY OAS ${fmtNumSafe(hy,2)}。`;

  return next;
}

function renderRealtimeStrip(realtime) {
  if (!realtime || !realtime.values) return;
  $('realtime-updated-at').textContent = realtime.updatedAt || '--';
  $('rt-brent').textContent = fmtNumSafe(realtime.values.brent, 1);
  $('rt-dxy').textContent = fmtNumSafe(realtime.values.dxy, 2);
  $('rt-vix').textContent = fmtNumSafe(realtime.values.vix, 2);
  $('rt-hy').textContent = fmtNumSafe(realtime.values.hyOas, 2);
  $('rt-us10y').textContent = fmtNumSafe(realtime.values.us10y, 2);
  $('rt-gold').textContent = fmtNumSafe(realtime.values.gold, 1);
  $('rt-spx').textContent = fmtNumSafe(realtime.values.spx, 0);
  $('rt-source-mode').textContent = realtime.degradedMode ? '部分回退' : '实时覆盖';
  $('rt-brent-delta').textContent = fmtSigned(realtime.changes?.brent1d || 0);
  $('rt-dxy-delta').textContent = fmtSigned(realtime.changes?.dxy1d || 0);
  $('rt-vix-delta').textContent = fmtSigned(realtime.changes?.vix1d || 0);
  $('rt-hy-delta').textContent = fmtSigned(realtime.changes?.hyOas1d || 0);
  renderList('realtime-notes', realtime.notes || []);
}


function renderBars(containerId, items, isTrend = false) {
  const root = $(containerId);
  root.innerHTML = '';
  root.className = 'progress-group';
  items.forEach((item) => {
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


function renderExecutionLock(lock) {
  $('execution-lock-tag').textContent = lock.tag;
  $('execution-status-level').textContent = lock.levelLabel;
  $('execution-status-title').textContent = lock.title;
  $('execution-status-desc').textContent = lock.description;
  const pill = $('execution-status-level');
  pill.classList.remove('green', 'yellow', 'red');
  if (lock.level === 'green') pill.classList.add('green');
  else if (lock.level === 'yellow') pill.classList.add('yellow');
  else pill.classList.add('red');
  const allow = $('execution-allow');
  const block = $('execution-block');
  const mandatory = $('execution-mandatory');
  allow.className = 'bullet-list lock-allow';
  block.className = 'bullet-list lock-block';
  mandatory.className = 'bullet-list lock-mandatory';
  renderList('execution-allow', lock.allow || []);
  renderList('execution-block', lock.block || []);
  renderList('execution-mandatory', lock.mandatory || []);
}

function renderAssetTable(rows) {
  const body = $('asset-table-body');
  body.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('强')
      ? 'strong'
      : row.bias.includes('谨慎')
        ? 'cautious'
        : row.bias.includes('低配')
          ? 'underweight'
          : 'neutral';
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td>${row.score}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.reason}</td>
    `;
    body.appendChild(tr);
  });
}

function renderAssetReturnMap(mapData) {
  $('return-map-horizon').textContent = mapData.horizon;
  const body = $('asset-return-body');
  body.innerHTML = '';
  const convictionRank = { '高': 4, '中高': 3, '中': 2, '中低': 1, '低': 0 };
  const biasRank = (bias) => {
    if ((bias || '').includes('偏多') || (bias || '') === '偏多') return 3;
    if ((bias || '').includes('中性偏多')) return 2.5;
    if ((bias || '').includes('中性')) return 2;
    if ((bias || '').includes('中性偏空')) return 1.5;
    if ((bias || '').includes('偏空')) return 1;
    return 0;
  };
  [...mapData.rows].sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? a.priority : (convictionRank[a.conviction] || 0) * 10 + biasRank(a.bias);
    const pb = Number.isFinite(b.priority) ? b.priority : (convictionRank[b.conviction] || 0) * 10 + biasRank(b.bias);
    return pb - pa;
  }).forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('偏多') || row.bias.includes('多')
      ? 'strong'
      : row.bias.includes('偏空') || row.bias.includes('空')
        ? 'underweight'
        : 'neutral';
    const drivers = (row.drivers || []).map((d) => `<span class="asset-driver-chip">${d}</span>`).join('');
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.expected}</td>
      <td>${row.drawdown}</td>
      <td>${row.conviction}</td>
      <td class="return-driver-cell">${drivers || '—'}</td>
      <td>${row.note}</td>
    `;
    body.appendChild(tr);
  });
}

function renderList(id, items) {
  const root = $(id);
  root.innerHTML = '';
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    root.appendChild(li);
  });
}

function renderScenarioTree(items) {
  const root = $('scenario-list');
  root.innerHTML = '';
  items.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'scenario-card';
    node.innerHTML = `
      <div class="scenario-title">${item.name} · ${item.probability}%</div>
      <div class="scenario-meta">${item.description}</div>
      <div><strong>触发条件：</strong>${item.triggers}</div>
      <div style="margin-top:8px;"><strong>资产表现：</strong>${item.assets}</div>
    `;
    root.appendChild(node);
  });
}

function renderLineChart(svgId, history, opts = {}) {
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
        <stop offset="0%" stop-color="#6ebeff"></stop>
        <stop offset="100%" stop-color="#6ebeff" stop-opacity="0"></stop>
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

function wrapSvgText(text, maxChars = 10) {
  const safe = String(text || '');
  const chunks = [];
  for (let i = 0; i < safe.length; i += maxChars) chunks.push(safe.slice(i, i + maxChars));
  return chunks;
}

function renderHeatmap(regions) {
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

  svg.innerHTML = `
    <rect x="12" y="20" width="756" height="330" rx="24" fill="rgba(8, 20, 39, 0.65)" stroke="rgba(133,164,229,0.14)"></rect>
    <text class="heat-label" x="44" y="48">区域风险集中度</text>
  `;

  regions.forEach((region) => {
    const spec = layout[region.key];
    if (!spec) return;
    const color = riskColor(region.risk);
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

function renderTransmission(chain) {
  $('chain-regime-tag').textContent = chain.regimeTag;
  $('chain-stress-score').textContent = chain.stressScore;
  $('chain-lead-shock').textContent = chain.leadShock;
  $('chain-confidence').textContent = `${chain.pathConfidence}%`;
  $('chain-dominant-impact').textContent = chain.dominantImpact;

  const flow = $('chain-flow');
  flow.innerHTML = '';
  chain.nodes.forEach((node) => {
    const color = riskColor(node.score);
    const card = document.createElement('div');
    card.className = 'chain-node';
    const deltaClass = node.delta > 0 ? 'up' : node.delta < 0 ? 'down' : 'flat';
    const deltaText = `${Number.isFinite(node.delta) ? `${node.delta > 0 ? '+' : ''}${node.delta}` : '--'}`;
    card.innerHTML = `
      <div class="chain-node-top">
        <div class="chain-node-title">${node.label}</div>
        <div class="chain-node-score">${node.score}</div>
      </div>
      <div class="chain-node-meta">
        <div class="chain-node-direction">${node.directionLabel}</div>
        <div class="chain-delta ${deltaClass}">Δ ${deltaText}</div>
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
  chain.assetImpacts.forEach((item) => {
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


function renderSignalEngine(signal) {
  $('signal-strength').textContent = signal.strength;
  $('signal-direction').textContent = signal.direction;
  $('signal-consistency').textContent = signal.consistency;
  $('signal-macro').textContent = signal.macroSignal;
  $('signal-liquidity-chain').textContent = `${signal.liquiditySignal} / ${signal.chainSignal}`;
  renderList('signal-notes', signal.notes || []);
}

function renderActionLayer(action) {
  $('action-tag').textContent = action.tag;
  $('today-action').textContent = action.todayAction;
  $('action-priority').textContent = action.priorityLine || '执行优先级：先减风险，再做微调，最后观察确认。';
  const allow = $('action-allow');
  const avoid = $('action-avoid');
  const watch = $('action-watch');
  allow.className = 'bullet-list action-checklist';
  avoid.className = 'bullet-list action-blocklist';
  watch.className = 'bullet-list threshold-list';
  renderList('action-allow', action.checklist || []);
  renderList('action-avoid', action.blocked || []);
  renderList('action-watch', action.checkpoints || []);
}

function renderPositioning(position) {
  $('position-regime').textContent = position.regime;
  $('position-risk-budget').textContent = position.riskBudget;
  $('position-gross-exposure').textContent = position.targetGrossExposure;
  $('position-cash-buffer').textContent = position.cashBufferTarget;
  const body = $('position-core-body');
  body.innerHTML = '';
  (position.coreAllocations || []).forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.asset}${item.target ? `<span class="position-target-chip">${item.target}</span>` : ''}</td>
      <td>${item.weight}</td>
      <td>${item.reason}</td>
    `;
    body.appendChild(tr);
  });
  renderList('position-restrictions', position.executionRestrictions || []);
}

function renderRiskControl(risk) {
  $('risk-status').textContent = risk.status;
  $('risk-max-drawdown').textContent = risk.maxDrawdown;
  $('risk-single-asset-max').textContent = risk.singleAssetMax;
  $('risk-system-state').textContent = risk.systemState;
  const deRisk = $('risk-de-risk-triggers');
  const stopRules = $('risk-stop-rules');
  deRisk.className = 'bullet-list threshold-list';
  stopRules.className = 'bullet-list threshold-list';
  renderList('risk-de-risk-triggers', risk.hardThresholds || []);
  renderList('risk-stop-rules', risk.resetThresholds || []);
}

function renderDiscipline(discipline) {
  $('discipline-tag').textContent = discipline.tag;
  renderList('discipline-entry', discipline.entryConditions || []);
  renderList('discipline-prohibited', discipline.prohibitedBehaviors || []);
  renderList('discipline-mandatory', discipline.mandatoryRules || []);
}

function renderWarningSystem(warning) {
  $('warning-status').textContent = warning.status;
  $('warning-critical-count').textContent = warning.criticalCount;
  $('warning-warning-count').textContent = warning.warningCount;
  $('warning-watch-count').textContent = warning.watchCount;
  const root = $('warning-alert-list');
  root.innerHTML = '';
  const order = { '红色': 0, '橙色': 1, '黄色': 2 };
  [...warning.alerts].sort((a, b) => order[a.level] - order[b.level]).forEach((alert, idx) => {
    const levelClass = alert.level === '红色' ? 'danger' : alert.level === '橙色' ? 'warning' : 'watch';
    const div = document.createElement('div');
    div.className = `warning-card ${levelClass}`;
    div.innerHTML = `
      <div class="warning-card-top">
        <span class="badge ${levelClass === 'danger' ? 'underweight' : levelClass === 'warning' ? 'cautious' : 'neutral'}">${alert.level}</span>
        <strong>${alert.title}</strong>
        <span class="warning-time">${alert.triggeredAgo || '触发时间待补充'}</span>
        <span class="warning-level-order">优先级 ${idx + 1}</span>
      </div>
      <div class="warning-driver">主导驱动：${alert.driver || '综合风险条件'}</div>
      <div class="warning-line"><span>条件</span><span>${alert.condition}</span></div>
      <div class="warning-line"><span>动作</span><span>${alert.action}</span></div>
    `;
    root.appendChild(div);
  });
  const rules = $('warning-rules');
  rules.innerHTML = '';
  warning.rules.forEach((rule) => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    div.textContent = rule;
    rules.appendChild(div);
  });
}

async function main() {
  const [baseData, history, realtime] = await Promise.all([
    fetch(dataUrl).then((r) => r.json()),
    fetch(historyUrl).then((r) => r.json()),
    fetch(realtimeUrl).then((r) => r.ok ? r.json() : null).catch(() => null)
  ]);

  const data = computeRealtimeOverlay(baseData, realtime);
  if (realtime?.values) {
    renderRealtimeStrip(realtime);
    $('runtime-badge').textContent = realtime.degradedMode ? '快变量部分降级 / 慢变量正常' : '快变量已实时覆盖';
  } else {
    $('runtime-badge').textContent = data.recovery.safeOutput ? '当前处于正常运行模式' : '当前处于降级输出模式';
  }
  $('overview-date').textContent = data.updatedAt.slice(0, 10);
  $('decision-line').textContent = data.decisionLine || '当前以防守型决策为主，等待更明确的宽松与增长信号。';
  $('summary-text').textContent = data.summary;
  $('global-score').textContent = data.score;
  $('macro-regime').textContent = data.currentMacroRegime;
  $('crisis-phase').textContent = data.currentCrisisPhase;
  $('confidence-level').textContent = data.confidenceLevel;
  $('trend-label').textContent = data.trendLabel;
  $('score-change-1d').textContent = fmtSignedArrow(data.scoreChange1d);
  $('score-change-7d').textContent = fmtSignedArrow(data.scoreChange7d);
  $('phase-current').textContent = data.currentCrisisPhase;
  $('phase-next').textContent = data.nextCrisisPhase;
  $('phase-transition').textContent = `${data.transitionRisk}%`;
  $('confidence-score').textContent = data.confidenceScore;
  $('confidence-level-bottom').textContent = data.confidenceLevel;
  $('degraded-mode').textContent = data.recovery.degradedMode ? '是' : '否';
  $('safe-output').textContent = data.recovery.safeOutput ? '是' : '否';
  $('last-run').textContent = data.recovery.lastRun;
  $('liquidity-score').textContent = data.liquidityIndex.score;
  $('liquidity-regime').textContent = data.liquidityIndex.regime;
  $('liquidity-change').textContent = fmtSignedArrow(data.liquidityIndex.change1d);
  $('liquidity-direction').textContent = data.liquidityIndex.directionLabel;

  $('score-change-30d').textContent = fmtSignedArrow(data.timeDimension.scoreChange30d);
  $('avg-30d').textContent = data.timeDimension.avg30d;
  $('range-30d').textContent = `${data.timeDimension.peak30d} / ${data.timeDimension.trough30d}`;
  $('draw-from-peak').textContent = fmtSignedArrow(data.timeDimension.drawFromPeak);
  $('transmission-speed').textContent = data.timeDimension.transmissionSpeed;
  $('transmission-acceleration').textContent = data.timeDimension.transmissionAcceleration;
  $('time-dominant-path').textContent = data.timeDimension.dominantPath;
  $('trend-explanation').textContent = data.timeDimension.trendExplanation;

  renderList('top-risks', data.topRisks);
  renderList('phase-signals', data.phaseSignals);
  renderList('trigger-critical', data.triggerPanel.critical);
  renderList('trigger-drivers', data.triggerPanel.drivers);
  renderList('trigger-watchlist', data.triggerPanel.watchlist);
  renderList('confidence-notes', data.confidenceNotes);
  renderList('recovery-notes', data.recovery.notes);
  renderList('liquidity-notes', data.liquidityIndex.notes);
  renderList('time-notes', data.timeDimension.notes);

  const moduleLabelMap = {
    geopolitical: '地缘政治', energy: '能源', inflation: '通胀', liquidity: '流动性', debt: '债务', banking: '银行'
  };
  renderBars('module-bars', Object.entries(data.modules).map(([key, value]) => ({
    label: moduleLabelMap[key] || key,
    value,
    delta: data.moduleTrends[key],
    mode: trendClass(data.moduleTrends[key])
  })), true);

  renderBars('regime-bars', [
    ['通缩增长', data.regimeProbabilities.disinflationaryGrowth],
    ['流动性多头', data.regimeProbabilities.liquidityBull],
    ['滞胀冲击', data.regimeProbabilities.stagflationShock],
    ['危机式流动性挤压', data.regimeProbabilities.crisisLiquiditySqueeze],
    ['货币贬值', data.regimeProbabilities.monetaryDebasement],
    ['通缩衰退', data.regimeProbabilities.deflationaryBust]
  ].map(([label, value]) => ({ label, value })));

  renderBars('liquidity-pillars', data.liquidityIndex.pillars.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderBars('path-change-bars', data.timeDimension.pathChanges.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderLineChart('trend-chart', history.slice(-7), { width: 760, height: 220, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderLineChart('trend-chart-30d', history, { width: 980, height: 260, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderHeatmap(data.heatmap);
  renderTransmission(data.transmissionChain);
  renderExecutionLock(data.tradingSystem.executionLock);
  renderSignalEngine(data.tradingSystem.signalEngine);
  renderActionLayer(data.tradingSystem.actionLayer);
  renderPositioning(data.tradingSystem.positioning);
  renderRiskControl(data.tradingSystem.riskControl);
  renderDiscipline(data.tradingSystem.discipline);
  renderWarningSystem(data.warningSystem);
  renderAssetReturnMap(data.assetReturnMap);
  renderAssetTable(data.assetMatrix);
  renderScenarioTree(data.scenarioTree);
}

main().catch((error) => {
  console.error(error);
  $('runtime-badge').textContent = '加载失败';
  $('summary-text').textContent = `风险数据加载失败：${error.message}`;
});
