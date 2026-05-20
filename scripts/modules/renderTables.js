import { $ } from './config.js?v=28.0M-64V';

export function renderList(id, items) {
  const root = $(id);
  root.innerHTML = '';
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    root.appendChild(li);
  });
}

const ASSET_MATRIX_BIAS_ORDER = ['强配', '中性偏多', '谨慎偏多', '中性', '谨慎偏空', '低配'];

function normalizeBias(bias) {
  return typeof bias === 'string' ? bias.trim() : '';
}

function classifyBiasMatrix(bias) {
  const value = normalizeBias(bias);
  if (value.includes('强')) return 'strong';
  if (value === '中性偏多') return 'strong-mid';
  if (value.includes('谨慎')) return 'cautious';
  if (value.includes('低配')) return 'underweight';
  return 'neutral';
}

function classifyBiasReturnMap(bias) {
  const value = normalizeBias(bias);
  if (value === '偏多') return 'strong';
  if (value === '中性偏多') return 'strong-mid';
  if (value === '中性偏空') return 'cautious-bear';
  if (value === '偏空') return 'underweight';
  return 'neutral';
}

function sortAssetMatrixRows(rows) {
  if (!Array.isArray(rows)) return [];
  const biasRank = (bias) => {
    const idx = ASSET_MATRIX_BIAS_ORDER.indexOf(typeof bias === 'string' ? bias.trim() : '');
    return idx === -1 ? ASSET_MATRIX_BIAS_ORDER.length : idx;
  };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ra = biasRank(a.row?.bias);
      const rb = biasRank(b.row?.bias);
      if (ra !== rb) return ra - rb;
      const sa = Number(a.row?.score);
      const sb = Number(b.row?.score);
      const aFinite = Number.isFinite(sa);
      const bFinite = Number.isFinite(sb);
      if (aFinite && bFinite && sa !== sb) return sb - sa;
      if (aFinite !== bFinite) return aFinite ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

export function renderAssetTable(rows) {
  const body = $('asset-table-body');
  body.innerHTML = '';
  const ordered = sortAssetMatrixRows(rows);
  ordered.forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = classifyBiasMatrix(row.bias);
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td>${row.score}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.reason}</td>
    `;
    body.appendChild(tr);
  });
}

export function renderAssetReturnMap(mapData) {
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
    const biasClass = classifyBiasReturnMap(row.bias);
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

export function renderActionLayer(action) {
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

export function renderPositioning(position) {
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

export function renderRiskControl(risk) {
  $('risk-status').textContent = risk.status;
  $('risk-max-drawdown').textContent = risk.maxDrawdown;
  $('risk-single-asset-max').textContent = risk.singleAssetMax;
  $('risk-system-state').textContent = risk.systemState;
  renderList('risk-de-risk-triggers', risk.hardThresholds || []);
  renderList('risk-stop-rules', risk.resetThresholds || []);
}

export function renderDiscipline(discipline) {
  $('discipline-tag').textContent = discipline.tag;
  renderList('discipline-entry', discipline.entryConditions || []);
  renderList('discipline-prohibited', discipline.prohibitedBehaviors || []);
  renderList('discipline-mandatory', discipline.mandatoryRules || []);
}

export function renderWarningSystem(warning) {
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
