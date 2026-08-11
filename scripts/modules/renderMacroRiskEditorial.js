const MAX_AGE_HOURS = 30;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = String(content);
  return node;
}

function formatUtc(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp)).replace(/\//gu, '-').replace(' ', ' · ') + ' UTC';
}

export function isMacroRiskEditorialVisible(layer, radarData, now = new Date()) {
  if (!isRecord(layer) || !isRecord(radarData)) return false;
  if (layer.schemaVersion !== 'macro-risk-editorial-production-v1') return false;
  if (layer.status !== 'valid' || layer.displayEnabled !== true) return false;
  if (layer.sourceDataUpdatedAt !== radarData.updatedAt) return false;
  if (layer.provider !== 'deepseek' || layer.mode !== 'external_ai_macro_risk_editorial') return false;
  if (layer.validation?.status !== 'pass' || !['pass', 'warn'].includes(layer.qualityReview?.status)) return false;
  if (layer.qualityReview?.promotionEligible !== false || layer.provenance?.humanApproved !== false) return false;
  if (layer.freshness?.isStale !== false || layer.freshness?.maxAgeHours !== MAX_AGE_HOURS) return false;
  if (layer.boundaries?.frontendDisplayApproved !== true || layer.boundaries?.displayOnly !== true || layer.boundaries?.notInvestmentAdvice !== true) return false;
  for (const key of ['affectsGfrrScoring', 'affectsRiskModules', 'affectsTailRiskOverlay', 'affectsDecisionModel', 'affectsExecutionLock', 'affectsPositionGuidance']) {
    if (layer.boundaries?.[key] !== false) return false;
  }
  const generatedAt = Date.parse(layer.generatedAt || '');
  if (!Number.isFinite(generatedAt) || now.getTime() - generatedAt > MAX_AGE_HOURS * 60 * 60 * 1000) return false;
  const output = layer.output;
  return isRecord(output)
    && typeof output.headlineZh === 'string'
    && typeof output.leadZh === 'string'
    && array(output.moduleAnalysis).length === 6
    && array(output.crossMarketAnalysis).length >= 3;
}

function sourceIndex(layer) {
  const ordered = array(layer.sourceLedger);
  return new Map(ordered.map((source, index) => [source.id, { source, number: index + 1 }]));
}

function sourceMarks(refIds, index) {
  const marks = array(refIds).map((id) => index.get(id)).filter(Boolean).map((entry) => `S${entry.number}`);
  return marks.length > 0 ? marks.join(' · ') : '站内证据';
}

function sectionHeading(kicker, title) {
  const header = el('header', 'macro-editorial-section-heading');
  header.append(el('span', 'macro-editorial-section-kicker', kicker), el('h3', '', title));
  return header;
}

function sourceFooter(refIds, index) {
  return el('div', 'macro-editorial-source-marks', sourceMarks(refIds, index));
}

function renderTimeline(output, index) {
  const block = el('section', 'macro-editorial-block macro-editorial-timeline');
  block.append(sectionHeading('THE WEEK IN CONTEXT', '近 7 日关键脉络'));
  const list = el('ol', 'macro-editorial-timeline-list');
  for (const item of array(output.weeklyTimeline)) {
    const row = el('li', 'macro-editorial-timeline-item');
    row.append(el('time', '', text(item.date)), el('h4', '', text(item.titleZh)), el('p', '', text(item.detailZh)), sourceFooter(item.sourceRefIds, index));
    list.append(row);
  }
  block.append(list);
  return block;
}

function renderTensions(output, index) {
  const block = el('section', 'macro-editorial-block');
  block.append(sectionHeading('KEY TENSIONS', '当前最重要的张力'));
  const list = el('div', 'macro-editorial-stack');
  for (const item of array(output.keyTensions)) {
    const card = el('article', 'macro-editorial-note-card');
    card.append(el('h4', '', text(item.titleZh)), el('p', '', text(item.detailZh)), sourceFooter(item.sourceRefIds, index));
    list.append(card);
  }
  block.append(list);
  return block;
}

function renderModules(output, index) {
  const block = el('section', 'macro-editorial-block macro-editorial-modules');
  block.append(sectionHeading('SIX-ENGINE READ', '六大风险模块逐项判读'));
  const grid = el('div', 'macro-editorial-module-grid');
  for (const item of array(output.moduleAnalysis)) {
    const card = el('article', 'macro-editorial-module-card');
    const head = el('div', 'macro-editorial-module-head');
    head.append(el('h4', '', text(item.labelZh)), el('strong', '', Number.isFinite(item.score) ? `${Math.round(item.score)}/100` : '—'));
    card.append(head, el('p', '', text(item.assessmentZh)), sourceFooter(item.sourceRefIds, index));
    grid.append(card);
  }
  block.append(grid);
  return block;
}

function renderCrossMarket(output, index) {
  const block = el('section', 'macro-editorial-block');
  block.append(sectionHeading('CROSS-ASSET CHECK', '跨资产确认与背离'));
  const grid = el('div', 'macro-editorial-market-grid');
  for (const item of array(output.crossMarketAnalysis)) {
    const card = el('article', 'macro-editorial-market-card');
    card.append(el('h4', '', text(item.assetZh)), el('p', '', text(item.observationZh)), el('p', 'macro-editorial-implication', text(item.implicationZh)), sourceFooter(item.sourceRefIds, index));
    grid.append(card);
  }
  block.append(grid);
  return block;
}

function renderWatch(output, index) {
  const block = el('section', 'macro-editorial-block');
  block.append(sectionHeading('WHAT CHANGES THE VIEW', '下一步观察与失效条件'));
  const list = el('div', 'macro-editorial-watch-list');
  for (const [itemIndex, item] of array(output.watchNext).entries()) {
    const row = el('article', 'macro-editorial-watch-row');
    row.append(el('div', 'macro-editorial-watch-number', String(itemIndex + 1)));
    const body = el('div', 'macro-editorial-watch-body');
    body.append(el('h4', '', text(item.conditionZh)), el('p', '', text(item.whyItMattersZh)));
    const invalidation = el('p', 'macro-editorial-invalidation');
    invalidation.append(el('strong', '', '失效条件：'), document.createTextNode(text(item.invalidationZh)));
    body.append(invalidation, sourceFooter(item.sourceRefIds, index));
    row.append(body);
    list.append(row);
  }
  block.append(list);
  return block;
}

function renderSources(layer, output, index) {
  const details = el('details', 'macro-editorial-sources');
  details.append(el('summary', '', `证据来源与数据限制 · ${array(layer.sourceLedger).length} SOURCES`));
  const content = el('div', 'macro-editorial-sources-content');
  const gaps = el('div', 'macro-editorial-gaps');
  gaps.append(el('h4', '', '数据限制'));
  const gapList = el('ul', '');
  for (const gap of array(output.dataGaps)) gapList.append(el('li', '', gap));
  gaps.append(gapList);
  const sourceList = el('ol', 'macro-editorial-source-list');
  for (const entry of index.values()) {
    const item = el('li', '');
    const label = text(entry.source.title, text(entry.source.sourceName, entry.source.id));
    if (entry.source.kind === 'news' && typeof entry.source.url === 'string' && entry.source.url.startsWith('https://')) {
      const link = el('a', '', label);
      link.href = entry.source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
    } else item.append(document.createTextNode(label));
    item.append(el('span', '', ` · S${entry.number} · ${text(entry.source.sourceClass)}`));
    sourceList.append(item);
  }
  content.append(gaps, sourceList);
  details.append(content);
  return details;
}

function renderEditorialContent(layer) {
  const output = layer.output;
  const index = sourceIndex(layer);
  const fragment = document.createDocumentFragment();
  const header = el('header', 'macro-editorial-header');
  const eyebrow = el('div', 'macro-editorial-eyebrow');
  eyebrow.append(el('span', 'macro-editorial-live-dot', ''), document.createTextNode(' 本期宏观判读 · THIS ISSUE\'S VERDICT'));
  const badges = el('div', 'macro-editorial-badges');
  badges.append(el('span', '', 'DEEPSEEK'), el('span', '', '只读编辑层'), el('span', '', '不进评分'));
  const top = el('div', 'macro-editorial-header-top');
  top.append(eyebrow, badges);
  header.append(top, el('h2', '', text(output.headlineZh)));
  header.querySelector('h2').id = 'macro-editorial-title';
  header.append(el('p', 'macro-editorial-lead', text(output.leadZh)));
  const meta = el('div', 'macro-editorial-meta');
  meta.append(
    el('span', '', `综合分 ${Number.isFinite(output.scoreSynthesis?.score) ? output.scoreSynthesis.score : '沿用站内'}`),
    el('span', '', `置信度 ${text(output.confidence?.level)} ${Number.isFinite(output.confidence?.score) ? Math.round(output.confidence.score) : '—'}/100`),
    el('span', '', `生成 ${formatUtc(layer.generatedAt)}`),
    el('span', '', `复核 ${text(layer.qualityReview?.status).toUpperCase()}`)
  );
  header.append(meta);
  fragment.append(header);

  const score = el('section', 'macro-editorial-score-synthesis');
  score.append(el('div', 'macro-editorial-score-label', 'EDITORIAL SYNTHESIS · 总分解释'), el('p', '', text(output.scoreSynthesis?.assessmentZh)), sourceFooter(output.scoreSynthesis?.sourceRefIds, index));
  fragment.append(score);

  const split = el('div', 'macro-editorial-split');
  split.append(renderTimeline(output, index), renderTensions(output, index));
  fragment.append(split, renderModules(output, index), renderCrossMarket(output, index));

  const history = el('section', 'macro-editorial-history');
  history.append(sectionHeading('HISTORICAL LENS', text(output.historicalComparison?.periodZh, '历史比较')));
  const historyGrid = el('div', 'macro-editorial-history-grid');
  const similar = el('div', ''); similar.append(el('h4', '', '相似点'), el('p', '', text(output.historicalComparison?.similaritiesZh)));
  const different = el('div', ''); different.append(el('h4', '', '关键差异'), el('p', '', text(output.historicalComparison?.differencesZh)));
  historyGrid.append(similar, different);
  history.append(historyGrid, sourceFooter(output.historicalComparison?.sourceRefIds, index));
  fragment.append(history, renderWatch(output, index));

  const footer = el('footer', 'macro-editorial-footer');
  footer.append(el('p', '', `置信度说明：${text(output.confidence?.reasonZh)}`), el('p', '', '边界：本判读只解释当前宏观压力，不构成危机预测或投资建议，也不改变任何评分、决策与执行字段。'), renderSources(layer, output, index));
  fragment.append(footer);
  return fragment;
}

export function renderMacroRiskEditorial({ radarData, now = new Date() }) {
  const root = document.getElementById('macro-risk-editorial');
  const content = document.getElementById('macro-editorial-content');
  if (!root || !content) return false;
  const layer = radarData?.macroRiskEditorialLayer;
  if (!isMacroRiskEditorialVisible(layer, radarData, now)) {
    root.hidden = true;
    content.replaceChildren();
    return false;
  }
  try {
    content.replaceChildren(renderEditorialContent(layer));
    root.hidden = false;
    return true;
  } catch (error) {
    root.hidden = true;
    content.replaceChildren();
    console.error('[renderMacroRiskEditorial] render failed:', error);
    return false;
  }
}
