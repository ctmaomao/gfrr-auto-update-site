import { $ } from './config.js?v=28.0L-3U';

const SCHEMA_VERSION = 'v28.0L-external-ai-production-1';
const PANEL_ID = 'external-ai-display-panel';
const FACT_LIMIT = 4;
const INFERENCE_LIMIT = 3;
const COMPACT_LIMIT = 3;
const UNSAFE_TEXT_VALUES = [
  '买入',
  '卖出',
  '加仓',
  '减仓',
  '做多',
  '做空',
  '建仓',
  '平仓',
  '止损',
  '止盈',
  '仓位',
  '现金',
  '敞口',
  '执行灯',
  '交易信号',
  '操作建议',
  '配置建议',
  '立即行动',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStrings(value, limit) {
  return safeArray(value)
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, limit);
}

function hasUnsafeText(value) {
  if (typeof value === 'string') {
    return UNSAFE_TEXT_VALUES.some((term) => value.includes(term));
  }
  if (Array.isArray(value)) return value.some(hasUnsafeText);
  if (isPlainObject(value)) return Object.values(value).some(hasUnsafeText);
  return false;
}

function setHidden(container) {
  if (!container) return;
  container.hidden = true;
  container.setAttribute('aria-hidden', 'true');
  container.replaceChildren();
}

function appendText(root, tagName, className, text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  root.appendChild(element);
  return element;
}

function appendBadge(root, text) {
  appendText(root, 'span', 'external-ai-badge', text);
}

function appendList(root, items, limit) {
  const values = cleanStrings(items, limit);
  if (values.length === 0) return false;

  const list = document.createElement('ul');
  list.className = 'external-ai-list';
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = value;
    list.appendChild(item);
  }
  root.appendChild(list);
  return true;
}

function appendSection(root, title, items, limit) {
  const section = document.createElement('section');
  section.className = 'external-ai-section';
  appendText(section, 'h3', '', title);
  const hasItems = appendList(section, items, limit);
  if (hasItems) root.appendChild(section);
  return hasItems;
}

function appendCompactSignals(root, dataGaps, invalidationSignals) {
  const gapItems = cleanStrings(dataGaps, COMPACT_LIMIT);
  const signalItems = cleanStrings(invalidationSignals, COMPACT_LIMIT);
  if (gapItems.length === 0 && signalItems.length === 0) return false;

  const section = document.createElement('section');
  section.className = 'external-ai-section';
  appendText(section, 'h3', '', '数据缺口 / 失效信号');

  if (gapItems.length > 0) {
    appendText(section, 'p', 'external-ai-section-label', '数据缺口');
    appendList(section, gapItems, COMPACT_LIMIT);
  }
  if (signalItems.length > 0) {
    appendText(section, 'p', 'external-ai-section-label', '失效信号');
    appendList(section, signalItems, COMPACT_LIMIT);
  }

  root.appendChild(section);
  return true;
}

function buildConfidenceText(confidence) {
  if (!isPlainObject(confidence)) return '';
  const level = typeof confidence.level === 'string' && confidence.level.trim()
    ? confidence.level
    : 'unknown';
  const score = Number.isFinite(Number(confidence.score))
    ? String(Math.round(Number(confidence.score)))
    : '--';
  return `置信度：${level} / ${score}`;
}

function buildTimestampText(layer) {
  const timestamp = typeof layer.updatedAt === 'string' && layer.updatedAt.trim()
    ? layer.updatedAt
    : layer.generatedAt;
  return typeof timestamp === 'string' && timestamp.trim()
    ? `更新时间: ${timestamp}`
    : '';
}

export function shouldDisplayExternalAiLayer(layer) {
  if (!isPlainObject(layer)) return false;
  const boundaries = isPlainObject(layer.boundaries) ? layer.boundaries : {};
  const qualityReview = isPlainObject(layer.qualityReview) ? layer.qualityReview : {};
  const freshness = isPlainObject(layer.freshness) ? layer.freshness : {};
  const reviewStatus = String(qualityReview.status || '').toLowerCase();

  return layer.schemaVersion === SCHEMA_VERSION
    && layer.status === 'valid'
    && layer.displayEnabled === true
    && boundaries.frontendDisplayApproved === true
    && boundaries.displayOnly === true
    && boundaries.notInvestmentAdvice === true
    && boundaries.affectsScoring === false
    && boundaries.affectsDecisionModel === false
    && boundaries.affectsExecutionLock === false
    && boundaries.affectsPositionGuidance === false
    && qualityReview.promotionEligible === false
    && (reviewStatus === 'pass' || reviewStatus === 'warn')
    && freshness.isStale === false
    && !hasUnsafeText(layer);
}

export function getExternalAiDisplayState(data) {
  const layer = isPlainObject(data) ? data.externalAiInterpretationLayer : null;
  return {
    layer,
    shouldDisplay: shouldDisplayExternalAiLayer(layer),
  };
}

export function renderExternalAiPanel(data, container = $(PANEL_ID)) {
  const { layer, shouldDisplay } = getExternalAiDisplayState(data);
  if (!container || !shouldDisplay) {
    setHidden(container);
    return;
  }

  const confidence = isPlainObject(layer.confidence) ? layer.confidence : {};
  container.hidden = false;
  container.setAttribute('aria-hidden', 'false');
  container.replaceChildren();

  const article = document.createElement('article');
  article.className = 'card full-width-card external-ai-card';

  const header = document.createElement('div');
  header.className = 'external-ai-header';
  const titleGroup = document.createElement('div');
  appendText(titleGroup, 'h2', '', '外部 AI 解读（只读）');
  appendText(titleGroup, 'p', 'muted external-ai-kicker', '该内容仅解释站内结构化数据，不改变风险评分、决策模型或任何执行规则。');

  const badges = document.createElement('div');
  badges.className = 'external-ai-badges';
  appendBadge(badges, '只读');
  appendBadge(badges, '不构成投资建议');
  appendBadge(badges, '不影响评分');
  appendBadge(badges, '站内结构化数据');

  header.appendChild(titleGroup);
  header.appendChild(badges);
  article.appendChild(header);

  const summary = document.createElement('section');
  summary.className = 'external-ai-summary';
  appendText(summary, 'p', '', layer.summaryZh || '当前解读文本不足。');
  article.appendChild(summary);

  const grid = document.createElement('div');
  grid.className = 'external-ai-grid';
  appendSection(grid, '主要观察', layer.facts, FACT_LIMIT);
  appendSection(grid, 'AI 推断', layer.inferences, INFERENCE_LIMIT);
  appendCompactSignals(grid, layer.dataGaps, layer.invalidationSignals);
  if (grid.children.length > 0) article.appendChild(grid);

  const footer = document.createElement('div');
  footer.className = 'external-ai-meta';
  appendText(footer, 'span', '', buildConfidenceText(confidence));
  appendText(footer, 'span', '', typeof confidence.reasonZh === 'string' ? confidence.reasonZh : '');
  appendText(footer, 'span', '', buildTimestampText(layer));
  if (footer.children.length > 0) article.appendChild(footer);

  container.appendChild(article);
}
