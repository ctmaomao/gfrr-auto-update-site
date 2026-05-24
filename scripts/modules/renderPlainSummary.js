export const PLAIN_NARRATIVE_PHRASES = Object.freeze({
  "energy_shock": "油价变贵推高物价",
  "stagflation_pressure": "东西变贵增长放慢",
  "risk_asset_mismatch": "股市价格和现实脱节",
  "overheat_confirmation": "市场过热需要降温",
  "credit_spread_warning": "企业借钱开始变难",
  "liquidity_tightening": "市场资金正在变紧",
  "world_order_pressure_crossing": "国际局势影响经济",
  "energy_inflation_rates": "油价推高物价和利息",
  "unknown": "今天没有单一主线"
});

export const PLAIN_EVIDENCE_PHRASES = Object.freeze({
  "brent": "油价仍然偏高",
  "breakeven10y": "市场担心物价更高",
  "us10y": "长期借钱成本偏高",
  "vix": "股市恐慌不明显",
  "hy_oas": "较弱公司借钱变难",
  "ig_oas": "大公司借钱成本上升",
  "sofr": "短期借钱利息偏高",
  "dff": "官方短期利息偏高",
  "zq_curve": "市场预计利息仍高",
  "sr3_curve": "未来借钱成本仍高",
  "ois_curve": "利息预期仍偏高",
  "cdx_hy": "较弱企业保险变贵",
  "cdx_ig": "大企业保险变贵",
  "bizd": "私募借贷基金走弱",
  "pbdc": "私募借贷基金走弱",
  "srln": "企业贷款基金走弱",
  "cclfx": "私募借贷基金走弱",
  "vnq": "房地产股票走弱",
  "rem": "抵押地产股票走弱",
  "cmbs": "商业地产债券走弱",
  "bdti": "原油运输仍偏贵",
  "bcti": "成品油运输仍偏贵",
  "bdi": "大宗货运有所升温",
  "nfci": "金融环境没有放松",
  "walcl": "市场资金没有明显变多",
  "on_rrp": "闲置资金正在减少",
  "consumer_retail": "消费支出变化不稳",
  "employment": "就业市场有点变弱",
  "commercial_real_estate": "商业地产仍需留意",
  "shipping_freight": "运输成本仍需留意",
  "unknown": null
});

export const PLAIN_RISK_LEVELS = Object.freeze([
  "风险较低",
  "风险正常",
  "风险偏高",
  "风险很高",
  "风险非常高"
]);

export const PLAIN_DATA_HEALTH_STATES = Object.freeze([
  "数据正常",
  "数据稍旧",
  "数据不够新"
]);

const PLAIN_COPY = Object.freeze({
  title: "今天全球金融风险一览",
  scorePrefix: "风险分",
  scoreMissing: "暂无风险分",
  trendUp: "比一周前高",
  trendDown: "比一周前低",
  trendFlat: "和一周前基本一样",
  trendMissing: "暂无一周对比",
  noMoreRisks: "目前没有更多突出的风险点",
  scrollHint: "继续往下看专业分析与原始数据"
});

const PLAIN_RISK_BANDS = Object.freeze([
  { max: 30, level: PLAIN_RISK_LEVELS[0], tone: "is-low" },
  { max: 50, level: PLAIN_RISK_LEVELS[1], tone: "is-normal" },
  { max: 70, level: PLAIN_RISK_LEVELS[2], tone: "is-elevated" },
  { max: 85, level: PLAIN_RISK_LEVELS[3], tone: "is-high" },
  { max: 100, level: PLAIN_RISK_LEVELS[4], tone: "is-very-high" }
]);

function finite(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function timestampAgeHours(value, nowMs) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (nowMs - timestamp) / 36e5);
}

function buildRiskLevel(score) {
  const scoreValue = finite(score);
  if (scoreValue === null) {
    return {
      level: PLAIN_RISK_LEVELS[1],
      scoreText: PLAIN_COPY.scoreMissing,
      tone: "is-normal"
    };
  }

  const rounded = Math.max(0, Math.min(100, Math.round(scoreValue)));
  const band = PLAIN_RISK_BANDS.find((item) => rounded <= item.max) || PLAIN_RISK_BANDS.at(-1);
  return {
    level: band.level,
    scoreText: `${PLAIN_COPY.scorePrefix} ${rounded} / 100`,
    tone: band.tone
  };
}

function buildTrendText(scoreChange7d) {
  const changeValue = finite(scoreChange7d);
  if (changeValue === null) return PLAIN_COPY.trendMissing;
  if (changeValue === 0) return PLAIN_COPY.trendFlat;
  const points = Math.round(Math.abs(changeValue));
  const direction = changeValue > 0 ? PLAIN_COPY.trendUp : PLAIN_COPY.trendDown;
  return `${direction} ${points} 分`;
}

function buildDataHealth(data, healthDashboard, nowMs) {
  const realtimeInput = asPlainObject(data?.dailyRealtimeInput);
  const healthScore = finite(realtimeInput.healthScore ?? healthDashboard?.score);
  const updatedAt = realtimeInput.updatedAt || realtimeInput.capturedAt || data?.updatedAt || null;
  const ageHours = timestampAgeHours(updatedAt, nowMs);

  if (healthScore !== null && ageHours !== null && healthScore >= 90 && ageHours <= 36) {
    return { state: PLAIN_DATA_HEALTH_STATES[0], tone: "is-good" };
  }
  if (healthScore !== null && ageHours !== null && healthScore >= 70 && ageHours <= 72) {
    return { state: PLAIN_DATA_HEALTH_STATES[1], tone: "is-watch" };
  }
  return { state: PLAIN_DATA_HEALTH_STATES[2], tone: "is-stale" };
}

function buildPlainStory(data) {
  const chain = asPlainObject(data?.dailyBrief?.dominantRiskChain);
  return PLAIN_NARRATIVE_PHRASES[chain.key] || PLAIN_NARRATIVE_PHRASES.unknown;
}

function buildTopRisks(data) {
  const chain = asPlainObject(data?.dailyBrief?.dominantRiskChain);
  const evidence = Array.isArray(chain.evidence) ? chain.evidence : [];
  const seen = new Set();
  const risks = [];

  for (const item of evidence) {
    const key = item?.key;
    const phrase = PLAIN_EVIDENCE_PHRASES[key] || null;
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    risks.push(phrase);
    if (risks.length >= 3) break;
  }

  while (risks.length < 3) risks.push(PLAIN_COPY.noMoreRisks);
  return risks.slice(0, 3);
}

function setText(root, elementName, value) {
  const element = root.querySelector(`[data-plain-summary-element="${elementName}"]`);
  if (element) element.textContent = value;
  return element;
}

export function buildPlainSummaryModel(data, healthDashboard, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const risk = buildRiskLevel(data?.score);
  const health = buildDataHealth(data, healthDashboard, nowMs);
  return {
    title: PLAIN_COPY.title,
    riskLevel: risk.level,
    riskTone: risk.tone,
    scoreTrend: `${risk.scoreText} · ${buildTrendText(data?.scoreChange7d)}`,
    story: buildPlainStory(data),
    topRisks: buildTopRisks(data),
    dataHealth: health.state,
    dataHealthTone: health.tone,
    scrollHint: PLAIN_COPY.scrollHint
  };
}

export function renderPlainSummary(data, healthDashboard, options = {}) {
  const root = document.getElementById("plain-summary-card");
  if (!root) return null;

  const model = buildPlainSummaryModel(data, healthDashboard, options);
  setText(root, "section-title", model.title);

  const riskLevel = setText(root, "risk-level", model.riskLevel);
  if (riskLevel) riskLevel.className = `plain-summary-risk-level ${model.riskTone}`;

  setText(root, "score-trend", model.scoreTrend);
  setText(root, "plain-story", model.story);

  const topRisks = root.querySelector('[data-plain-summary-element="top-risks"]');
  if (topRisks) {
    topRisks.textContent = "";
    for (const item of model.topRisks) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      topRisks.appendChild(listItem);
    }
  }

  const dataHealth = setText(root, "data-health", model.dataHealth);
  if (dataHealth) dataHealth.className = `plain-summary-data-health ${model.dataHealthTone}`;

  setText(root, "scroll-hint", model.scrollHint);
  return model;
}
