// Read-only descriptions: never infer observations or alter model inputs.
export const RPO_LABEL_ZH = '云厂商剩余履约义务（RPO）增速';
export const IPO_LABEL_ZH = 'AI 发行/待发行管线';
export const SPREAD_THRESHOLD_ZH = '差值绝对值:>10 个百分点 红 / 5–10 个百分点 黄 / <5 个百分点 绿';
export const RPO_SCOPE_ZH = 'RPO/积压订单不等同递延收入或已确认收入；公司业务范围、定义和财季存在差异，合计仅作需求存量观察。';
export const IPO_SCOPE_ZH = '发行/待发行管线不是已完成发行数；登记公司数为近6个月去重口径，S-1/A 申报不代表已定价或完成上市，申报份数不等于公司数。';
export const HY_SCOPE_ZH = '广义高收益债 OAS 反映全市场信用环境，不是 AI 专属债券篮子，不能直接证明 AI 资本开支风险已被或尚未被定价。';

// Labels/units only. Numeric provenance, score inputs and observation clocks are untouched.
export function indicatorSemanticLabels(indicator) {
  if (indicator.id === 'cloud_rpo_growth') return { name_zh: RPO_LABEL_ZH };
  if (indicator.id === 'ai_ipo_pipeline') return { name_zh: IPO_LABEL_ZH };
  if (indicator.id === 'spy_vs_rsp_6m') return {
    threshold_text: SPREAD_THRESHOLD_ZH,
    value_display: String(indicator.value_display || '').replace(/^([+−-]?\d+(?:\.\d+)?)%$/u, '$1 个百分点')
  };
  return {};
}

// Rewrite only indicator-bound current deterministic prose; never traverse AI issues.
export function semanticNarrativeText(text, indicators) {
  if (typeof text !== 'string') return text;
  for (const old of indicators) {
    const next = { ...old, ...indicatorSemanticLabels(old) };
    text = text.replaceAll(`${old.name_zh}为${old.value_display}`, `${next.name_zh}为${next.value_display}`);
    if (old.name_zh !== next.name_zh) text = text.replaceAll(old.name_zh, next.name_zh);
  }
  return text;
}

const prependOnce = (scope, note) => String(note || '').startsWith(scope) ? note : `${scope}${note || ''}`;

export function broadHyNote(bps, date) {
  return `${HY_SCOPE_ZH}ICE BofA 高收益债 OAS = ${(bps / 100).toFixed(2)}%（${bps} bps，${date}）。阈值:>500 红 / 350-500 黄 / <350 绿`;
}
export function signedSpreadNote(spyRet, rspRet) {
  const spread = spyRet - rspRet;
  const pct = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  const direction = spread > 0 ? '市值加权 SPY 领先等权重 RSP' : spread < 0 ? '等权重 RSP 领先市值加权 SPY' : '市值加权 SPY 与等权重 RSP 回报持平';
  return `标普500市值加权与等权重ETF的6个月回报（RSP不是小盘股指数）:SPY ${pct(spyRet)} vs 等权重 RSP ${pct(rspRet)}；SPY−RSP ${spread > 0 ? '+' : ''}${spread.toFixed(1)} 个百分点，${direction}。该差值不单独证明头部独涨或个股广度；既有灯色按${SPREAD_THRESHOLD_ZH}。`;
}

export function enterpriseSurveyNote(detail = {}, valueDisplay = '') {
  const calibration = detail.proxyConfidenceCalibration;
  const anchor = calibration?.displayAnchor;
  const prefix = calibration?.applied
    ? `发布值「${valueDisplay}」沿用登记校准${anchor?.asOfDate ? `（复核 ${anchor.asOfDate}）` : ''}，不是本轮调查新观测；灯色沿用既有校准规则。`
    : '';
  const pct = detail.productionDeployPct;
  const survey = typeof pct === 'number' && Number.isFinite(pct)
    ? `Google Cloud 报告中 ${pct}% 受访高管称组织已在生产中部署 AI agents。`
    : '本轮 Google Cloud AI-agent 部署比例未确认。';
  const support = typeof detail.deloitteSupport === 'string' && detail.deloitteSupport.trim() && !detail.deloitteSupport.startsWith('Deloitte support fetch failed:')
    ? 'Deloitte 另有项目生产化预期描述，调查对象与口径不同，不构成该部署比例的同口径确认。'
    : '本轮未取得 Deloitte 可核验支持，不能声称跨调查确认。';
  return `${prefix}${survey}${support}AI-agent 部署、项目生产化与全部企业 AI 使用场景不可混为同一观测。`;
}

export function evidenceAwareNote(indicator) {
  const detail = indicator.provenance?.detail;
  if (indicator.id === 'spy_vs_rsp_6m' && Number.isFinite(detail?.spyRet) && Number.isFinite(detail?.rspRet)) return signedSpreadNote(detail.spyRet, detail.rspRet);
  if (indicator.id === 'spy_vs_rsp_6m') return '收益差按百分点表示；历史备用快照缺少同一六个月窗口的两端收益，不能据此重建或确认相对收益。';
  if (indicator.id === 'cloud_rpo_growth') return prependOnce(RPO_SCOPE_ZH, indicator.note);
  if (indicator.id === 'ai_ipo_pipeline') return prependOnce(IPO_SCOPE_ZH, indicator.note);
  if (indicator.id === 'hy_oas') {
    if (Number.isFinite(detail?.bps) && /^\d{4}-\d{2}-\d{2}$/u.test(detail?.date || '')) return broadHyNote(detail.bps, detail.date);
    return prependOnce(HY_SCOPE_ZH, indicator.note);
  }
  if (detail?.sourceObservation || detail?.contractVersion === 'arr-observation-eligibility-v1') return indicator.note;
  if (indicator.id === 'enterprise_deploy' && detail) return enterpriseSurveyNote(detail, indicator.value_display);
  if (indicator.id === 'arr_2nd_deriv' && ['curated', 'auto_fallback'].includes(indicator.provenance?.mode)) {
    if (indicator.note?.startsWith('沿用历史披露序列；')) return indicator.note;
    const reviewDate = indicator.provenance.asOfDate || indicator.as_of;
    const rejected = String(indicator.provenance.reason || '').match(/arr_underlying_observation_stale: latest milestone (\d{4}-\d{2}-\d{2}) is (\d+)d old \(max (\d+)d\)/u);
    const rejection = rejected ? `自动候选里程碑 ${rejected[1]} 已距刷新 ${rejected[2]} 天，超过 ${rejected[3]} 天门槛，被拒用；不代表沿用序列的观测日期。` : '';
    return `沿用历史披露序列；${reviewDate || '未注明日期'} 是复核日期，不是新增 ARR 观测。当前记录未附该序列原始里程碑日期，不能认定收入观测新鲜或最近三个月实际增长；该变化不是本周新增 ARR 观测。${rejection}${indicator.note || ''}`;
  }
  return indicator.note;
}
