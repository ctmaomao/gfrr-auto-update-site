import { isOfrEditorialVisible } from './macroRiskEditorialOfrContract.js?v=data-provenance-20261109';

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
  if (layer.schemaVersion === 'macro-risk-editorial-ofr-production-v2') return isOfrEditorialVisible(layer, radarData, now);
  if (radarData.mainPressureReadout !== undefined || radarData.advicePolicy !== undefined
      || radarData.scoreRole === 'legacy_model_audit_only' || radarData.legacyModelAudit !== undefined) return false;
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

// A separately retained production issue is a dated historical article. Its
// original clocks qualify its original display; they never qualify today's AI.
export function isMacroRiskEditorialPreviousIssueVisible(layer, radarData, now = new Date()) {
  if (!isRecord(layer) || !isRecord(radarData) || !Number.isFinite(now.getTime())) return false;
  // A retired score article never becomes current OFR commentary, even as history.
  if (radarData.mainPressureReadout !== undefined || radarData.advicePolicy !== undefined
      || radarData.scoreRole === 'legacy_model_audit_only' || radarData.legacyModelAudit !== undefined
      || layer.schemaVersion === 'macro-risk-editorial-ofr-production-v2') return false;
  const clocks = [layer.sourceDataUpdatedAt, layer.generatedAt, layer.output?.generatedAt, radarData.updatedAt].map(value => Date.parse(value || ''));
  if (!clocks.every(value => Number.isFinite(value) && value <= now.getTime())) return false;
  const [sourceTime, generatedTime, outputTime, currentTime] = clocks;
  if (sourceTime > currentTime || sourceTime > generatedTime || sourceTime > outputTime) return false;
  if (Math.abs(generatedTime - outputTime) > MAX_AGE_HOURS * 3600000) return false;
  if (layer.provenance?.generatedBy !== 'github_actions_workflow'
      || !/^\d+$/u.test(String(layer.provenance?.runId ?? ''))
      || !/^[a-f0-9]{40}$/u.test(layer.provenance?.sourceCommit || '')) return false;
  if (!/^[a-f0-9]{64}$/u.test(layer.provenance?.inputDigest || '')
      || !/^[a-f0-9]{64}$/u.test(layer.provenance?.artifactDigest || '')
      || layer.validation?.artifactDigest !== layer.provenance.artifactDigest) return false;
  if (layer.output?.model !== layer.model || layer.output?.sourceDataUpdatedAt !== layer.sourceDataUpdatedAt
      || layer.freshness?.artifactGeneratedAt !== layer.output?.generatedAt
      || layer.freshness?.sourceDataUpdatedAt !== layer.sourceDataUpdatedAt) return false;
  for (const key of ['affectsWorldOrder', 'affectsOdp', 'affectsBubbleWatch']) {
    if (layer.boundaries?.[key] !== false) return false;
  }
  return isMacroRiskEditorialVisible(layer, { updatedAt: layer.sourceDataUpdatedAt }, new Date(Math.max(generatedTime, outputTime)));
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

function editorialWarningZh(value) {
  return text(value, '').replace(/cross_checked/gu, '经交叉核对').replace(/discovery_only/gu, '仅供线索发现')
    .replace(/official/gu, '官方来源').replace(/partial/gu, '覆盖不完整');
}

function renderEditorialWarnings(layer) {
  const warnings = array(layer.qualityReview?.warnings).filter(value => typeof value === 'string' && value.trim());
  if (!warnings.length) return null;
  const block = el('div', 'macro-editorial-gaps');
  block.append(el('h4', '', '编辑覆盖提示'));
  const list = el('ul', '');
  for (const warning of warnings) list.append(el('li', '', editorialWarningZh(warning)));
  block.append(list);
  return block;
}

function renderSources(layer, output, index) {
  const ofr = layer.schemaVersion === 'macro-risk-editorial-ofr-production-v2';
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
    const sourceClass = ofr ? ({ official: '官方来源', cross_checked: '经交叉核对', discovery_only: '仅供线索发现', site_structured: '站内结构化证据', site: '站内证据' }[entry.source.sourceClass]
      || (entry.source.kind === 'site_structured' || entry.source.kind === 'site' ? '站内结构化证据' : '新闻证据')) : text(entry.source.sourceClass);
    item.append(el('span', '', ` · S${entry.number} · ${sourceClass}`));
    sourceList.append(item);
  }
  content.append(gaps, sourceList);
  details.append(content);
  return details;
}

function renderEditorialContent(layer, previousIssue = false, radarData = null) {
  if (layer.schemaVersion === 'macro-risk-editorial-ofr-production-v2') return renderOfrEditorialContent(layer);
  const output = layer.output;
  const index = sourceIndex(layer);
  const fragment = document.createDocumentFragment();
  const header = el('header', 'macro-editorial-header');
  const eyebrow = el('div', 'macro-editorial-eyebrow');
  if (previousIssue) eyebrow.append(document.createTextNode('上一期宏观判读 · 历史留存'));
  else eyebrow.append(el('span', 'macro-editorial-live-dot', ''), document.createTextNode(' 本期宏观判读 · THIS ISSUE\'S VERDICT'));
  const badges = el('div', 'macro-editorial-badges');
  badges.append(el('span', '', 'DEEPSEEK'), el('span', '', '只读编辑层'), el('span', '', '不进评分'));
  const top = el('div', 'macro-editorial-header-top');
  top.append(eyebrow, badges);
  header.append(top);
  if (previousIssue) {
    const notice = el('p', 'macro-editorial-previous-notice');
    notice.append(el('strong', '', layer.sourceDataUpdatedAt !== radarData?.updatedAt
      ? '上一期判读，当前数据已更新。' : '上一期判读，暂未有新的合格 AI 判读。'),
    document.createTextNode(` 原期数据：${formatUtc(layer.sourceDataUpdatedAt)}；原文生成：${formatUtc(layer.generatedAt)}。以下正文、分数及观察条件均对应原期，不代表本期最新判断；当前确定性依据已展开。`));
    header.append(notice);
  }
  header.append(el('h2', '', text(output.headlineZh)));
  header.querySelector('h2').id = 'macro-editorial-title';
  header.append(el('p', 'macro-editorial-lead', text(output.leadZh)));
  const meta = el('div', 'macro-editorial-meta');
  meta.append(
    el('span', '', `${previousIssue ? '原期综合分' : '综合分'} ${Number.isFinite(output.scoreSynthesis?.score) ? output.scoreSynthesis.score : previousIssue ? '见原期正文' : '沿用站内'}`),
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
  footer.append(el('p', '', `置信度说明：${text(output.confidence?.reasonZh)}`), el('p', '', previousIssue
    ? '历史判读仅解释原期宏观压力。仅供参考,不参与平台的风险打分与决策。'
    : '边界：本判读只解释当前宏观压力，不构成危机预测或投资建议，也不改变任何评分、决策与执行字段。'), renderSources(layer, output, index));
  fragment.append(footer);
  return fragment;
}


function renderOfrEditorialContent(layer) {
  const output = layer.output;
  const snapshot = layer.pressureSnapshot;
  const index = sourceIndex(layer);
  const fragment = document.createDocumentFragment();
  const header = el('header', 'macro-editorial-header');
  const top = el('div', 'macro-editorial-header-top');
  const eyebrow = el('div', 'macro-editorial-eyebrow');
  eyebrow.append(el('span', 'macro-editorial-live-dot', ''), document.createTextNode(' 本期宏观判读 · OFR 金融压力观察'));
  const badges = el('div', 'macro-editorial-badges');
  badges.append(el('span', '', 'DEEPSEEK'), el('span', '', '只读编辑层'), el('span', '', '不进评分'));
  top.append(eyebrow, badges);
  const title = el('h2', '', output.headlineZh); title.id = 'macro-editorial-title';
  header.append(top, title, el('p', 'macro-editorial-lead', output.leadZh), sourceFooter(output.sourceRefIds, index));
  const meta = el('div', 'macro-editorial-meta');
  const status = { available: '官方观察值', cached: '抓取失败，保留旧观察', stale: '观察已陈旧', missing_current: '最新观察缺值', unavailable: '官方读数缺失' }[snapshot.status];
  const raw = value => Number.isFinite(value) ? value.toFixed(3) : '缺失';
  const w = snapshot.weeklyChange;
  const p = snapshot.percentile;
  meta.append(
    el('span', '', `OFR FSI 原值 ${raw(snapshot.index.value)} · 观察日 ${text(snapshot.index.observedDate, '缺失')}`),
    el('span', '', `数据状态：${status}`),
    el('span', '', Number.isFinite(w.value) ? `周变化 ${w.value > 0 ? '+' : ''}${raw(w.value)} · ${w.fromDate} → ${w.toDate}` : '周变化缺失，趋势待累计'),
    el('span', '', Number.isFinite(p.value) ? `严格过去十年历史百分位 ${p.value.toFixed(1)} · 截至 ${p.endDateExclusive}（不含当日）` : '十年历史百分位缺失，覆盖待累计'),
    el('span', '', `生成 ${formatUtc(layer.generatedAt)}`)
  );
  header.append(meta);
  fragment.append(header);
  const synthesis = el('section', 'macro-editorial-score-synthesis macro-editorial-synthesis-prose');
  synthesis.append(el('div', 'macro-editorial-score-label', 'OFR PRESSURE · 金融压力解读'),
    el('p', '', '原值以0为历史平均参考；历史百分位表示相对位置，不是0–100风险分，也不是危机概率。'),
    el('p', '', output.pressureSynthesis.assessmentZh), sourceFooter(output.pressureSynthesis.sourceRefIds, index));
  fragment.append(synthesis);
  if (array(output.weeklyTimeline).length || array(output.keyTensions).length) {
    const both = array(output.weeklyTimeline).length && array(output.keyTensions).length;
    const split = el('div', both ? 'macro-editorial-split' : 'macro-editorial-split macro-editorial-single-column');
    if (array(output.weeklyTimeline).length) split.append(renderTimeline(output, index));
    if (array(output.keyTensions).length) split.append(renderTensions(output, index));
    fragment.append(split);
  }
  if (array(output.contextAnalysis).length) {
    const contexts = el('section', 'macro-editorial-block macro-editorial-modules');
    contexts.append(sectionHeading('MACRO CONTEXT', '宏观背景与独立证据'));
    const grid = el('div', 'macro-editorial-module-grid');
    for (const item of output.contextAnalysis) {
      const card = el('article', 'macro-editorial-module-card');
      card.append(el('h4', '', item.labelZh), el('p', '', item.assessmentZh), sourceFooter(item.sourceRefIds, index));
      grid.append(card);
    }
    contexts.append(grid); fragment.append(contexts);
  }
  if (array(output.crossMarketAnalysis).length) fragment.append(renderCrossMarket(output, index));
  if (output.historicalComparison) {
    const h = output.historicalComparison;
    const history = el('section', 'macro-editorial-history');
    history.append(sectionHeading('HISTORICAL LENS', h.periodZh), el('h4', '', '相似点'), el('p', '', h.similaritiesZh), el('h4', '', '关键差异'), el('p', '', h.differencesZh), sourceFooter(h.sourceRefIds, index));
    fragment.append(history);
  }
  fragment.append(renderWatch(output, index));
  const footer = el('footer', 'macro-editorial-footer');
  const warnings = renderEditorialWarnings(layer);
  if (warnings) footer.append(warnings);
  footer.append(el('p', '', `编辑信心说明：${output.confidence.reasonZh}`), el('p', '', 'OFR 官方观察约滞后两个营业日。结构背景、尾部警报和世界秩序独立观察，不构成OFR分解或仓位建议。仅供参考,不参与平台的风险打分与决策。'), renderSources(layer, output, index));
  fragment.append(footer);
  return fragment;
}

export function renderMacroRiskEditorial({ radarData, now = new Date() }) {
  const root = document.getElementById('macro-risk-editorial');
  const content = document.getElementById('macro-editorial-content');
  if (!root || !content) return false;
  const choices = [
    { layer: radarData?.macroRiskEditorialLayer, current: true },
    { layer: radarData?.macroRiskEditorialPreviousIssue, current: false },
  ];
  for (const { layer, current } of choices) {
    const eligible = current ? isMacroRiskEditorialVisible(layer, radarData, now)
      : isMacroRiskEditorialPreviousIssueVisible(layer, radarData, now);
    if (!eligible) continue;
    try {
      content.replaceChildren(renderEditorialContent(layer, !current, radarData));
      root.hidden = false;
      root.dataset.editorialMode = current ? 'current' : 'previous';
      // Only CURRENT AI can fold today's deterministic evidence.
      return current;
    } catch (error) {
      console.error('[renderMacroRiskEditorial] render failed:', error);
    }
  }
  root.hidden = true;
  root.dataset.editorialMode = 'unavailable';
  content.replaceChildren();
  return false;
}
