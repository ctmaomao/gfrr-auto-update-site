const dataUrl = './data/radar-data.json';
const historyUrl = './data/radar-history.json';

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
  const [data, history] = await Promise.all([
    fetch(dataUrl).then((r) => r.json()),
    fetch(historyUrl).then((r) => r.json())
  ]);

  $('runtime-badge').textContent = data.recovery.safeOutput ? '当前处于正常运行模式' : '当前处于降级输出模式';
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
