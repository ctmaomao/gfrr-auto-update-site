import { validateEvidenceScoreFields } from './evidence-score-contract.mjs';

// Keep the score proof small: no narrative, paid response, or credentials.
const SUMMARY_FIELDS = ['primary_score_pct','red_pct','weighted_risk_score','stage_score','trigger_score',
  'scoring_unknown_count','scoring_total_indicators','scoring_red_count','scoring_yellow_count','scoring_green_count',
  'primary_score_range_pct','weighted_risk_score_range','stage_score_range','trigger_score_range','category_scores','category_score_ranges','verdict_label'];
const pick = (object, keys) => Object.fromEntries(keys.map(key=>[key,structuredClone(object?.[key])]));
function scoreDisclosure(snapshot) {
  const score = (value, range) => value === null ? `${range.lower.toFixed(1)}–${range.upper.toFixed(1)}` : value.toFixed(1);
  const proof = snapshot.qualifiedEvidence;
  const missing = proof.indicators.filter(i=>i.status==='unknown').map(i=>({dc_abs_spread:'数据中心ABS利差',insider_sell_buy:'内部人交易',capex_reaction:'资本开支反应',fed_policy:'Fed政策路径'})[i.id]);
  return `固定核心23项，主分${score(snapshot.primaryScorePct,snapshot.primaryScoreRangePct)}%，辅助压力${score(snapshot.weightedRiskScore,snapshot.weightedRiskScoreRange)}；泡沫成熟度${score(snapshot.stageScore,snapshot.stageScoreRange)}，破裂临近度${score(snapshot.triggerScore,snapshot.triggerScoreRange)}。${missing.length ? `${missing.join('、')}待确认，点值保留为空，不按绿灯或零分处理；上下界是数学边界，不是概率。` : '核心观测齐全；四项影子观察不计分。'}综合判读：${snapshot.verdictLabelZh}。`;
}
export function buildEditorialScoringSnapshot(bubble) {
  const s=bubble.summary || {};
  const snapshot={
    contractVersion:bubble.contractVersion,modelVersion:bubble.scoring?.model_version,
    coreIndicatorCount:s.scoring_total_indicators,shadowIndicatorCount:bubble.indicators.filter(i=>i.score_role==='shadow').length,
    coreRedCount:s.scoring_red_count,coreYellowCount:s.scoring_yellow_count,coreGreenCount:s.scoring_green_count,
    primaryScorePct:s.primary_score_pct,weightedRiskScore:s.weighted_risk_score,
    stageScore:s.stage_score,stageLabelZh:s.stage_label,triggerScore:s.trigger_score,triggerLabelZh:s.trigger_label,verdictLabelZh:s.verdict_label
  };
  if (bubble.contractVersion==='bubble-watch-v3') {
    const errors=validateEvidenceScoreFields(bubble);
    if(errors.length) throw new Error(`Invalid qualified Bubble input: ${errors.join('; ')}`);
    snapshot.qualifiedEvidence={contractVersion:bubble.contractVersion,as_of_date:bubble.as_of_date,
      indicators:bubble.indicators.map(i=>pick(i,['id','axis','category','score_role','status','as_of','stale','evidence_gap','provenance'])),
      summary:pick(s,SUMMARY_FIELDS),
      scoring:pick(bubble.scoring,['model_version','effective_tier','base_tier','override_active','two_axis_upgrade','tier_range','unknown_core_ids'])};
    // Only the gap's checking clock is needed; never copy collector diagnostics.
    for(const i of snapshot.qualifiedEvidence.indicators) i.provenance=i.status==='unknown'?pick(i.provenance,['mode','checkedAt']):undefined;
    snapshot.coreUnknownCount=s.scoring_unknown_count;
    snapshot.primaryScoreRangePct=structuredClone(s.primary_score_range_pct);
    snapshot.weightedRiskScoreRange=structuredClone(s.weighted_risk_score_range);
    snapshot.stageScoreRange=structuredClone(s.stage_score_range);
    snapshot.triggerScoreRange=structuredClone(s.trigger_score_range);
    snapshot.scorecardDisclosureZh=scoreDisclosure(snapshot);
  }
  if (snapshot.contractVersion === 'bubble-watch-v3') {
    const errors = validateEditorialScoringSnapshot(snapshot, bubble.as_of_date);
    if (errors.length) throw new Error(`Invalid qualified score labels: ${errors.join('; ')}`);
  }
  return snapshot;
}
export function validateEditorialScoringSnapshot(snapshot, asOfDate, facts=[]) {
  if(snapshot?.contractVersion==='bubble-watch-v2') return [];
  if(snapshot?.contractVersion!=='bubble-watch-v3') return ['input scoring contract must be registered v2 or v3'];
  const proof=snapshot.qualifiedEvidence;
  const errors=validateEvidenceScoreFields(proof);
  if(proof?.as_of_date!==asOfDate) errors.push('qualified evidence date differs from input');
  if(proof?.scoring?.model_version!==snapshot.modelVersion) errors.push('qualified model differs from input');
  const s=proof?.summary || {};
  const aliases={primaryScorePct:'primary_score_pct',weightedRiskScore:'weighted_risk_score',stageScore:'stage_score',triggerScore:'trigger_score',
    coreUnknownCount:'scoring_unknown_count',coreRedCount:'scoring_red_count',coreYellowCount:'scoring_yellow_count',coreGreenCount:'scoring_green_count',
    primaryScoreRangePct:'primary_score_range_pct',weightedRiskScoreRange:'weighted_risk_score_range',stageScoreRange:'stage_score_range',triggerScoreRange:'trigger_score_range',verdictLabelZh:'verdict_label'};
  for(const [alias,field] of Object.entries(aliases)) if(JSON.stringify(snapshot[alias])!==JSON.stringify(s[field])) errors.push(`qualified score alias differs: ${alias}`);
  for (const [axis, point, label] of [['stage',snapshot.stageScore,snapshot.stageLabelZh],['trigger',snapshot.triggerScore,snapshot.triggerLabelZh]]) {
    const rows = axis === 'stage' ? [[30,'早期 Displacement'],[50,'扩张 Boom'],[70,'亢奋 Euphoria'],[Infinity,'极端 Mania']]
      : [[25,'引线未燃'],[45,'零星火花'],[65,'引线点燃'],[Infinity,'破裂进行中']];
    const expected = point === null ? '待确认' : rows.find(([ceiling])=>point<ceiling)?.[1];
    if (label !== expected) errors.push(`qualified axis label differs: ${axis}`);
  }
  try { if (snapshot.scorecardDisclosureZh !== scoreDisclosure(snapshot)) errors.push('qualified score disclosure differs from score proof'); } catch { errors.push('qualified disclosure cannot be constructed'); }
  const byId=new Map((proof?.indicators || []).map(i=>[i.id,i]));
  for(const fact of facts) {
    const i=byId.get(fact.indicatorId);
    if(!i || fact.status!==i.status || (fact.scoreRole && fact.scoreRole!==i.score_role)) errors.push(`qualified fact differs: ${fact.indicatorId}`);
  }
  return errors;
}
