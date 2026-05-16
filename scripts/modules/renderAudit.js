import { $ } from './config.js?v=28.0M-47V';

export function renderScenarioTree(items) {
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
