import { $ } from './config.js?v=28.0L-3R';

const SCHEMA_VERSION = 'v28.0L-external-ai-production-1';
const PANEL_ID = 'external-ai-display-panel';
const SAFE_LIMIT = 4;
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
  '投资建议',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function appendList(root, items) {
  const list = document.createElement('ul');
  list.className = 'bullet-list';
  for (const item of safeArray(items).filter((value) => typeof value === 'string' && value.trim()).slice(0, SAFE_LIMIT)) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  if (list.children.length > 0) root.appendChild(list);
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
  article.className = 'card full-width-card';

  const heading = document.createElement('h2');
  heading.textContent = '外部 AI 解读（只读）';
  article.appendChild(heading);

  const boundary = document.createElement('p');
  boundary.className = 'muted';
  boundary.textContent = '仅解释站内结构化数据，不改变风险评分、决策模型或任何执行规则。';
  article.appendChild(boundary);

  const summary = document.createElement('p');
  summary.textContent = layer.summaryZh || '当前解读文本不足。';
  article.appendChild(summary);

  appendList(article, layer.facts);
  appendList(article, layer.inferences);

  const confidenceLine = document.createElement('p');
  confidenceLine.className = 'muted';
  confidenceLine.textContent = `置信度：${confidence.level || 'unknown'} / ${Number.isFinite(Number(confidence.score)) ? Math.round(Number(confidence.score)) : '--'}。${confidence.reasonZh || '暂不足以判断。'}`;
  article.appendChild(confidenceLine);

  container.appendChild(article);
}
