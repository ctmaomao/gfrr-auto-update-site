// Read-only descriptions: never infer observations or alter model inputs.
export function signedSpreadNote(spyRet, rspRet) {
  const spread = spyRet - rspRet;
  const pct = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  const direction = spread > 0 ? '市值加权 SPY 领先等权重 RSP' : spread < 0 ? '等权重 RSP 领先市值加权 SPY' : '市值加权 SPY 与等权重 RSP 回报持平';
  return `公开市场价格显示 6 个月回报:SPY ${pct(spyRet)} vs 等权重 RSP ${pct(rspRet)}；SPY−RSP ${pct(spread)}，${direction}。该差值不单独证明头部独涨或个股广度；既有灯色按差值绝对值分档:>10% 红 / 5-10% 黄 / <5% 绿。`;
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
