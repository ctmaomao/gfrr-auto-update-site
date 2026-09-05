// Responsive Macro Overview trend SVG renderer.
// Display-only: reads provided snapshots and writes the existing trend DOM contract.

import { $ } from './config.js?v=bofa-report-review-1';

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TREND_POINT_COUNT = 8;
const TREND_CHART_HEIGHT = 220;
let TREND_CHART = buildTrendChart(800);
let TREND_X = buildTrendX(TREND_CHART);

function buildTrendChart(width) {
  const safeWidth = Math.max(320, Math.round(asNumber(width) || 800));
  return {
    width: safeWidth,
    height: TREND_CHART_HEIGHT,
    plotLeft: 44,
    plotRight: safeWidth - 14,
    plotTop: 10,
    plotBottom: 194,
    yMin: 0,
    yMax: 100
  };
}

function buildTrendX(chart) {
  return Array.from({ length: TREND_POINT_COUNT }, (_, index) => (
    chart.plotLeft
    + ((chart.plotRight - chart.plotLeft) * index) / (TREND_POINT_COUNT - 1)
  ));
}

function trendLayoutWidth() {
  const wrap = document.querySelector('.trend-svg-wrap');
  return wrap?.clientWidth || 800;
}

function syncTrendFrame(chart) {
  const svg = document.querySelector('.trend-svg-wrap svg');
  if (!svg) return;
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.setAttribute('height', String(chart.height));

  const canvas = svg.querySelector('.trend-canvas');
  if (canvas) {
    canvas.setAttribute('width', String(chart.width));
    canvas.setAttribute('height', String(chart.height));
  }

  const yFor = (value) => {
    const ratio = (clamp(value, chart.yMin, chart.yMax) - chart.yMin) / (chart.yMax - chart.yMin);
    return chart.plotBottom - ratio * (chart.plotBottom - chart.plotTop);
  };

  const gridValues = [100, 80, 60, 40, 20, 0];
  svg.querySelectorAll('.trend-grid-line').forEach((line, index) => {
    const y = yFor(gridValues[index] ?? 0);
    line.setAttribute('x1', String(chart.plotLeft));
    line.setAttribute('x2', String(chart.plotRight));
    line.setAttribute('y1', Number(y.toFixed(2)).toString());
    line.setAttribute('y2', Number(y.toFixed(2)).toString());
  });

  for (const value of [25, 40, 60, 80]) {
    const y = yFor(value);
    const line = svg.querySelector(`.trend-threshold.threshold-${value}`);
    if (line) {
      line.setAttribute('x1', String(chart.plotLeft));
      line.setAttribute('x2', String(chart.plotRight));
      line.setAttribute('y1', Number(y.toFixed(2)).toString());
      line.setAttribute('y2', Number(y.toFixed(2)).toString());
    }
    const label = svg.querySelector(`.trend-threshold-label.threshold-${value}`);
    if (label) {
      label.setAttribute('x', Number((chart.plotRight + 12).toFixed(2)).toString());
      label.setAttribute('y', Number((y + 3).toFixed(2)).toString());
    }
  }

  const axes = svg.querySelectorAll('.trend-axis');
  if (axes[0]) {
    axes[0].setAttribute('x1', String(chart.plotLeft));
    axes[0].setAttribute('x2', String(chart.plotLeft));
    axes[0].setAttribute('y1', String(chart.plotTop));
    axes[0].setAttribute('y2', String(chart.plotBottom));
  }
  if (axes[1]) {
    axes[1].setAttribute('x1', String(chart.plotLeft));
    axes[1].setAttribute('x2', String(chart.plotRight));
    axes[1].setAttribute('y1', String(chart.plotBottom));
    axes[1].setAttribute('y2', String(chart.plotBottom));
  }

  svg.querySelectorAll('.trend-axis-label').forEach((label, index) => {
    const value = gridValues[index] ?? 0;
    const y = yFor(value);
    label.setAttribute('x', String(chart.plotLeft - 8));
    label.setAttribute('y', Number((y + 4).toFixed(2)).toString());
  });
}

function prepareTrendLayout() {
  TREND_CHART = buildTrendChart(trendLayoutWidth());
  TREND_X = buildTrendX(TREND_CHART);
  syncTrendFrame(TREND_CHART);
}

function resetTrendDynamicState() {
  for (const id of ['trend-line-score', 'trend-line-overlay']) {
    const line = $(id);
    if (!line) continue;
    line.setAttribute('points', '');
    line.removeAttribute('aria-label');
    line.hidden = true;
  }
  const overlayLine = $('trend-line-overlay');
  overlayLine?.classList.remove('is-partial', 'is-fallback');
  for (const id of ['trend-dots-score', 'trend-dots-overlay']) {
    const group = $(id);
    if (!group) continue;
    group.replaceChildren();
    group.hidden = true;
  }
  TREND_X.forEach((x, index) => {
    const label = $(`trend-x-${index}`);
    if (!label) return;
    label.textContent = index === TREND_X.length - 1 ? 'NOW' : `W-${TREND_X.length - 1 - index}`;
    label.setAttribute('x', Number(x.toFixed(2)).toString());
  });
  const mode = $('trend-overlay-mode');
  if (mode) mode.textContent = '升档层(Overlay)数据不足';
  const now = $('threshold-now-line');
  if (now) now.textContent = '等待最新数据';
  const marker = $('threshold-marker-override');
  if (marker) marker.hidden = true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trendY(score) {
  const n = asNumber(score);
  if (n === null) return null;
  const ratio = (clamp(n, TREND_CHART.yMin, TREND_CHART.yMax) - TREND_CHART.yMin)
    / (TREND_CHART.yMax - TREND_CHART.yMin);
  return TREND_CHART.plotBottom - ratio * (TREND_CHART.plotBottom - TREND_CHART.plotTop);
}

function pointPair(x, y) {
  return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
}

function formatTrendDateLabel(value, fallback) {
  const text = textValue(value);
  if (!text) return fallback;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (match) return `${match[2]}-${match[3]}`;
  return fallback;
}

function trendIsoDate(value) {
  const text = textValue(value);
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (match) return match[1];
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function mergeCurrentTrendSnapshot(weekly, radarData, worldOrderStressData) {
  if (!Array.isArray(weekly) || weekly.length !== TREND_X.length) return weekly;
  const currentScore = asNumber(radarData?.score);
  const overlayScore = asNumber(worldOrderStressData?.score);
  if (currentScore === null && overlayScore === null) return weekly;

  const next = weekly.slice();
  const last = next[next.length - 1] || {};
  const currentDate = trendIsoDate(radarData?.updatedAt) || trendIsoDate(worldOrderStressData?.observedAt) || last.date;
  const merged = {
    ...last,
    date: currentDate || last.date
  };

  if (currentScore !== null) merged.score = currentScore;

  if (overlayScore !== null) {
    merged.worldOrderStress = {
      ...(last.worldOrderStress || {}),
      ...(worldOrderStressData || {}),
      score: overlayScore,
      observedAt: textValue(worldOrderStressData?.observedAt) || currentDate || textValue(last.worldOrderStress?.observedAt),
    };
  }

  next[next.length - 1] = merged;
  return next;
}

function updateTrendXAxisLabels(weekly) {
  weekly.forEach((item, index) => {
    const label = $(`trend-x-${index}`);
    if (!label) return;
    label.textContent = formatTrendDateLabel(item?.date, index === weekly.length - 1 ? 'NOW' : `W-${weekly.length - 1 - index}`);
    label.setAttribute('x', Number(TREND_X[index].toFixed(2)).toString());
    label.setAttribute('text-anchor', index === weekly.length - 1 ? 'end' : 'middle');
    label.classList.toggle('is-now', index === weekly.length - 1);
  });
}

function buildTrendPoint(index, score, source = null) {
  const y = trendY(score);
  if (y === null) return null;
  return {
    x: TREND_X[index],
    y,
    score: asNumber(score),
    source
  };
}

function pointsToAttribute(points) {
  return points
    .filter(Boolean)
    .map((point) => pointPair(point.x, point.y))
    .join(' ');
}

function renderTrendDots(groupId, points, className, radius, lastId) {
  const group = $(groupId);
  if (!group) return;
  group.hidden = false;
  group.textContent = '';
  points.filter(Boolean).forEach((point, index, validPoints) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', `trend-dot ${className}`);
    circle.setAttribute('cx', Number(point.x.toFixed(2)).toString());
    circle.setAttribute('cy', Number(point.y.toFixed(2)).toString());
    circle.setAttribute('r', String(radius));
    if (index === validPoints.length - 1 && lastId) {
      circle.setAttribute('id', lastId);
    }
    if (point.score !== null) {
      circle.setAttribute('aria-label', `${point.score.toFixed(0)} on ${point.source?.date || 'trend point'}`);
    }
    group.appendChild(circle);
  });
}

function pickEightWeeklyPoints(history) {
  if (!Array.isArray(history) || history.length < 8) return [];
  const points = [];
  for (let i = 7; i >= 0; i--) {
    const idx = history.length - 1 - i * 7;
    if (idx < 0 || !history[idx]) return [];
    points.push(history[idx]);
  }
  return points;
}

const WO_HISTORY_MIN_VALID_POINTS = 5;
const WO_HISTORY_STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseObservedAtMs(value) {
  const text = textValue(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeOverlayHistoryPoint(historyItem) {
  const wo = historyItem?.worldOrderStress;
  const score = asNumber(wo?.score);
  const date = textValue(historyItem?.date);
  const observedAtRaw = textValue(wo?.observedAt);
  const observedAt = observedAtRaw || date;
  const observedAtMs = parseObservedAtMs(observedAt);
  if (score === null || !observedAt || observedAtMs === null) {
    return {
      date: date || null,
      valid: false
    };
  }
  return {
    date: date || null,
    valid: true,
    score,
    state: textValue(wo?.state),
    labelZh: textValue(wo?.labelZh),
    observedAt,
    observedAtSource: observedAtRaw ? 'observedAt' : 'history-date',
    observedAtMs,
    freshness: textValue(wo?.freshness)
  };
}

function analyzeOverlayHistory(overlayWeekly, nowMs = Date.now()) {
  const validPoints = overlayWeekly.filter((point) => point.valid);
  const observedAtSet = new Set(validPoints.map((point) => point.observedAt));
  const latestPoint = validPoints.reduce((latest, point) => {
    if (!latest || point.observedAtMs > latest.observedAtMs) return point;
    return latest;
  }, null);
  const latestObservedAtAgeDays = latestPoint
    ? Math.max(0, (nowMs - latestPoint.observedAtMs) / DAY_MS)
    : null;
  const fullFallback = validPoints.length < WO_HISTORY_MIN_VALID_POINTS || observedAtSet.size < 2;
  const staleTail = !fullFallback && latestObservedAtAgeDays !== null && latestObservedAtAgeDays > WO_HISTORY_STALE_DAYS;
  return {
    validWoPoints: validPoints.length,
    uniqueObservedAt: observedAtSet.size,
    latestObservedAt: latestPoint?.observedAt || null,
    latestObservedAtAgeDays,
    fullFallback,
    staleTail
  };
}

function staleTailStartIndex(overlayWeekly, latestObservedAt) {
  if (!latestObservedAt) return -1;
  let index = -1;
  for (let i = overlayWeekly.length - 1; i >= 0; i -= 1) {
    if (overlayWeekly[i]?.valid && overlayWeekly[i].observedAt === latestObservedAt) {
      index = i;
      break;
    }
  }
  if (index < 0) return -1;
  while (index > 0 && overlayWeekly[index - 1]?.valid && overlayWeekly[index - 1].observedAt === latestObservedAt) {
    index -= 1;
  }
  return index;
}

function buildOverlayTrendPoints(overlayWeekly, fallbackScore, analysis) {
  const fallbackY = trendY(fallbackScore);
  if (fallbackY === null) return null;
  if (overlayWeekly.length === TREND_X.length) {
    const slottedPoints = overlayWeekly.map((point, index) => (
      point.valid ? buildTrendPoint(index, point.score, point) : null
    ));
    const validSlottedPoints = slottedPoints.filter(Boolean);
    if (validSlottedPoints.length >= 2 && validSlottedPoints.length < TREND_X.length) {
      return {
        mode: 'partial-history',
        points: validSlottedPoints,
        dotPoints: validSlottedPoints,
        lastY: validSlottedPoints[validSlottedPoints.length - 1].y,
        validPointCount: validSlottedPoints.length
      };
    }
  }

  if (analysis.fullFallback || overlayWeekly.length !== TREND_X.length) {
    const fallbackPoints = TREND_X.map((x, index) => ({
      x,
      y: fallbackY,
      score: fallbackScore,
      source: overlayWeekly[index] || null
    }));
    return {
      mode: 'fallback',
      points: fallbackPoints,
      dotPoints: fallbackPoints.slice(-1),
      lastY: fallbackY,
      validPointCount: analysis.validWoPoints
    };
  }

  const tailStart = analysis.staleTail ? staleTailStartIndex(overlayWeekly, analysis.latestObservedAt) : -1;
  let lastY = fallbackY;
  const points = overlayWeekly.map((point, index) => {
    const shouldExtendTail = analysis.staleTail && tailStart >= 0 && index > tailStart;
    if (!shouldExtendTail && point.valid) {
      const y = trendY(point.score);
      if (y !== null) lastY = y;
    }
    return {
      x: TREND_X[index],
      y: lastY,
      score: point.valid ? point.score : fallbackScore,
      source: point
    };
  });

  return {
    mode: analysis.staleTail ? 'stale-tail' : 'history',
    points,
    dotPoints: points,
    lastY
  };
}

function overlayStatusSuffix(mode) {
  if (mode === 'partial-history') return '历史累积中';
  if (mode === 'fallback') return '参考线';
  if (mode === 'stale-tail') return '尾部滞后';
  return '';
}

function renderOverlayTrendStatus({ mode, radarData, worldOrderStressData, analysis }) {
  const suffix = overlayStatusSuffix(mode);
  const mainScore = asNumber(radarData?.score);
  const woScore = asNumber(worldOrderStressData?.score);
  const woLabel = textValue(worldOrderStressData?.labelZh);
  const mainText = mainScore === null ? '—' : String(Math.round(mainScore));
  const scoreText = woScore === null ? '—' : String(Math.round(woScore));
  const labelText = woLabel ? `(${woLabel})` : '';
  const suffixText = suffix ? ` · overlay ${suffix}` : '';
  const nowEl = $('threshold-now-line');
  if (nowEl) {
    nowEl.textContent = `原始 ${mainText}(高风险预警) · overlay ${scoreText}${labelText}${suffixText}`;
  }
  const marker = $('threshold-marker-override');
  if (marker) marker.hidden = false;
  const labelSpan = marker?.querySelector('.marker-label');
  if (labelSpan) {
    labelSpan.textContent = suffix ? `overlay ${scoreText} (${suffix})` : `overlay ${scoreText}`;
  }
  const overlayLine = $('trend-line-overlay');
  if (overlayLine) {
    const detail = mode === 'partial-history'
      ? `${analysis.validWoPoints} valid weekly anchors; history still accumulating`
      : mode === 'stale-tail' && analysis.latestObservedAtAgeDays !== null
      ? `latest observedAt age ${analysis.latestObservedAtAgeDays.toFixed(1)} days`
      : `${analysis.validWoPoints} valid points, ${analysis.uniqueObservedAt} unique observedAt`;
    overlayLine.setAttribute('aria-label', `World Order overlay trend ${mode}; ${detail}`);
  }
  const modeEl = $('trend-overlay-mode');
  if (modeEl) {
    if (mode === 'partial-history') {
      modeEl.textContent = `升档层(Overlay) ${analysis.validWoPoints}/8 周锚点`;
    } else if (mode === 'fallback') {
      modeEl.textContent = '升档层(Overlay)历史不足: 参考线';
    } else if (mode === 'stale-tail') {
      modeEl.textContent = '升档层(Overlay)尾部滞后';
    } else {
      modeEl.textContent = '升档层(Overlay) 8 周历史';
    }
  }
}

let lastTrendSvgArgs = null;
let trendResizeBound = false;
let trendResizeTimer = null;

function bindTrendResizeHandler() {
  if (trendResizeBound || typeof window === 'undefined') return;
  trendResizeBound = true;
  window.addEventListener('resize', () => {
    if (!lastTrendSvgArgs) return;
    window.clearTimeout(trendResizeTimer);
    trendResizeTimer = window.setTimeout(() => renderTrendSvg(lastTrendSvgArgs), 120);
  });
}

export function renderTrendSvg({ radarData, radarHistoryData, worldOrderStressData }) {
  try {
    lastTrendSvgArgs = { radarData, radarHistoryData, worldOrderStressData };
    bindTrendResizeHandler();
    prepareTrendLayout();
    resetTrendDynamicState();
    const weekly = mergeCurrentTrendSnapshot(
      pickEightWeeklyPoints(radarHistoryData),
      radarData,
      worldOrderStressData
    );
    if (weekly.length !== 8) return;
    updateTrendXAxisLabels(weekly);
    const scorePoints = weekly.map((item, index) => buildTrendPoint(index, item.score, item));
    if (scorePoints.some((p) => p === null)) return;
    const scoreLine = $('trend-line-score');
    if (scoreLine) {
      scoreLine.hidden = false;
      scoreLine.setAttribute('points', pointsToAttribute(scorePoints));
      scoreLine.setAttribute('aria-label', `Risk score trend ${weekly.map((item, index) => `${textValue(item.date) || `slot-${index + 1}`}:${Math.round(item.score)}`).join(', ')}`);
    }
    renderTrendDots('trend-dots-score', scorePoints, 'trend-dot-score', 4, 'trend-dot-score');

    const overlayScore = asNumber(worldOrderStressData?.score);
    if (overlayScore === null) return;
    const overlayWeekly = weekly.map((item) => normalizeOverlayHistoryPoint(item));
    const analysis = analyzeOverlayHistory(overlayWeekly);
    const overlayTrend = buildOverlayTrendPoints(overlayWeekly, overlayScore, analysis);
    if (!overlayTrend) return;
    const overlayLine = $('trend-line-overlay');
    if (overlayLine) {
      overlayLine.hidden = false;
      overlayLine.setAttribute('points', pointsToAttribute(overlayTrend.points));
      overlayLine.classList.toggle('is-partial', overlayTrend.mode === 'partial-history');
      overlayLine.classList.toggle('is-fallback', overlayTrend.mode === 'fallback');
    }
    renderTrendDots('trend-dots-overlay', overlayTrend.dotPoints || overlayTrend.points, 'trend-dot-overlay', 3, 'trend-dot-overlay');
    renderOverlayTrendStatus({
      mode: overlayTrend.mode,
      radarData,
      worldOrderStressData,
      analysis
    });
  } catch (error) {
    console.error('[renderMacroOverview] renderTrendSvg failed:', error);
  }
}

// ---------- Block 5: Signal Layers ----------
