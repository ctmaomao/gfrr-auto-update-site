// Qualified evidence publication; score math stays in the reviewed fixed-Core-23 contract.
import { replayEvidenceScores, TIER_LABELS } from './evidence-score-contract.mjs';
const round = n => Number(n.toFixed(1));
const lights = ['red', 'yellow', 'green'];
const fmt = (point, range) => Number.isFinite(point) ? point.toFixed(1) : `${range.lower.toFixed(1)}–${range.upper.toFixed(1)}`;
export function evidenceHistoryFields(indicators, replay) {
  return {
    score_bounds: { primary: replay.primaryRange, pressure: replay.pressureRange, stage: replay.stageRange, trigger: replay.triggerRange },
    tier_range: replay.tierRange, effective_tier: replay.effectiveTier, unknown_core_ids: replay.unknownIds,
    gap_metadata: Object.fromEntries(indicators.filter(i=>i.status==='unknown').map(i=>[i.id, {
      as_of: i.as_of, stale: i.stale, evidence_gap: i.evidence_gap, provenance: i.provenance
    }]))
  };
}
function axisLabel(axis, score) {
  if (score === null) return { zh:'待确认', en:'Pending' };
  const rows = axis === 'stage'
    ? [[30,'早期 Displacement','Displacement'],[50,'扩张 Boom','Boom'],[70,'亢奋 Euphoria','Euphoria'],[Infinity,'极端 Mania','Mania']]
    : [[25,'引线未燃','Fuse Unlit'],[45,'零星火花','Sparks'],[65,'引线点燃','Fuse Lit'],[Infinity,'破裂进行中','Unwinding']];
  const [,zh,en] = rows.find(([upper])=>score<upper); return {zh,en};
}
export function summarizeEvidence(indicators, today, previous, { revision, promotionPolicy, similarity }) {
  const r = replayEvidenceScores(indicators, revision);
  const known = indicators.filter(i=>i.score_role==='core' && lights.includes(i.status));
  const count = status => indicators.filter(i=>i.status===status).length;
  const gaps = indicators.filter(i=>i.status==='unknown');
  const stage = axisLabel('stage',r.stage), trigger = axisLabel('trigger',r.trigger);
  const pairFacts = ids => known.filter(i=>ids.includes(i.id)).map(i=>`${i.name_zh}为${i.value_display}（${{red:'红灯',yellow:'黄灯',green:'绿灯'}[i.status]}）`).join('；');
  const sections = [
    { key:'scorecard', sourceIndicators:known.map(i=>i.id), summaryZh:`截至${today}，固定核心23项中有${r.counts.red}项红灯、${r.counts.yellow}项黄灯、${r.counts.green}项绿灯、${r.counts.unknown}项待确认。核心红灯比例为${fmt(r.primary,r.primaryRange)}%，辅助压力为${fmt(r.pressure,r.pressureRange)}。缺口保留在23个槽位中，未作为绿灯或零分，也未通过缩小分母提高红灯比例。` },
    { key:'stage', sourceIndicators:known.filter(i=>i.axis==='stage').map(i=>i.id), summaryZh:`泡沫成熟度为${fmt(r.stage,r.stageRange)}，主要反映估值、资金投入和发行活动。${pairFacts(['cape','top5_weight','nvda_fpe','hyperscaler_capex_yoy','mag4_fcf_yoy'])}。这些指标描述当前金融结构，不单独给出见顶时点；公司之间的会计范围和样本限制应结合证据卡阅读。` },
    { key:'trigger', sourceIndicators:known.filter(i=>i.axis==='trigger').map(i=>i.id), summaryZh:`破裂临近度为${fmt(r.trigger,r.triggerRange)}。${pairFacts(['hy_oas','breadth_50d','spy_vs_rsp_6m'])}。信用价格和市场广度回答不同问题，应分别观察，不能将股价上涨直接解释为信用风险消失。${gaps.length ? `${gaps.map(i=>i.name_zh).join('、')}待确认；现有材料不足以给出这些指标的单一灯色。` : '本期核心指标具备合格观测，仍应结合各自原始日期及来源限制阅读。'}` },
    { key:'verdict', sourceIndicators:known.filter(i=>i.status==='red').map(i=>i.id), summaryZh:`综合判读为“${r.verdictLabel}”。${r.unknownIds.length ? (r.effectiveTier==='pending' ? `缺口不同补全对应${TIER_LABELS[r.tierRange.lower]}至${TIER_LABELS[r.tierRange.upper]}，因此不发布单一风险档位。` : '缺口的最低与最高补全仍得到相同有效档位；这是规则支持的档位，不能据此忽略未确认材料。') : '按固定核心红灯比例及原分类、两轴共振规则确定档位。'}辅助压力与两轴描述不同维度，不能相加作为新的总分。` },
    { key:'limitations', sourceIndicators:[], summaryZh:'上下界只表示证据缺口全部取最低或最高灯色时的数学边界，并非概率或统计置信区间。四项影子观察继续展示但不进入主分、两轴或分类共振。旧期记录保留原发布模型，不使用今天材料回填新口径的历史；跨模型不能宣称风险本周改善或恶化。来源限制、观测日期和过期标记应分别阅读；下一期以新增合格证据确认变化，不依据参考网站总分反推本站灯色。' }
  ];
  const verdictDesc = sections.map(s=>s.summaryZh).join('\n\n');
  if (verdictDesc.length < 650 || Buffer.byteLength(verdictDesc)>2600) throw new Error(`Evidence narrative budget invalid: ${verdictDesc.length}/${Buffer.byteLength(verdictDesc)}`);
  let deteriorated=0, improved=0;
  const flips=[];
  if (previous?.scoring_model_version===r.modelVersion) for (const item of known) {
    const before=previous.statuses?.[item.id]; if(!lights.includes(before)||before===item.status) continue;
    const delta=lights.indexOf(before)-lights.indexOf(item.status);
    if(delta>0) deteriorated+=delta; else improved-=delta;
    flips.push({id:item.id,name_zh:item.name_zh,from:before,to:item.status,up:delta>0,ind:item});
  }
  const allKnown = gaps.length===0;
  const narrativePlan = { version:'bubble-watch-narrative-v2', sourceMode:'local_indicator_evidence_pack', upstreamVerdictPolicy:'calibration_only_never_copied',
    sections, evidenceGaps:r.unknownIds, evidenceHighlights:known.slice(0,16).map(i=>({id:i.id,note_summary:i.note})), limitations:[sections.at(-1).summaryZh] };
  return { replay:r, flips, summary:{
    total_indicators:27, red_count:count('red'),yellow_count:count('yellow'),green_count:count('green'),unknown_count:gaps.length,
    display_red_pct:allKnown?round(100*count('red')/27):null,
    display_weighted_risk_score:allKnown?round(100*(count('red')+.5*count('yellow'))/27):null,
    scoring_total_indicators:23,scoring_red_count:r.counts.red,scoring_yellow_count:r.counts.yellow,scoring_green_count:r.counts.green,scoring_unknown_count:gaps.length,
    primary_score_pct:r.primary,primary_score_basis:'core_red_light_ratio',red_pct:r.primary,weighted_risk_score:r.pressure,
    primary_score_range_pct:r.primaryRange,weighted_risk_score_range:r.pressureRange,
    stage_score:r.stage,stage_score_range:r.stageRange,stage_label:stage.zh,stage_label_en:stage.en,
    trigger_score:r.trigger,trigger_score_range:r.triggerRange,trigger_label:trigger.zh,trigger_label_en:trigger.en,
    category_scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.point])),
    category_score_ranges:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,{lower:v.lower,upper:v.upper}])),
    momentum:{deteriorated,improved,net:deteriorated-improved},similarity,
    verdict_label:r.verdictLabel,verdict_label_en:({observation:'Observation',caution:'Moderate Caution',alert:'High Risk Alert',top:'Systemic Top',pending:'Evidence Pending'})[r.effectiveTier],
    verdict_desc:verdictDesc,verdict_desc_source:'bubble-watch-narrative-v2',narrative_plan:narrativePlan
  },scoring:{
    model_version:r.modelVersion,primary_universe:'core',core_indicator_ids:indicators.filter(i=>i.score_role==='core').map(i=>i.id),
    shadow_indicator_ids:indicators.filter(i=>i.score_role==='shadow').map(i=>i.id),shadow_policy:'display_only_no_score_impact',shadow_promotion_policy:promotionPolicy,
    base_tier:r.baseTier,effective_tier:r.effectiveTier,override_active:r.overrideActive,two_axis_upgrade:r.twoAxisUpgrade,tier_range:r.tierRange,unknown_core_ids:r.unknownIds,
    override_rule:'固定核心23项；缺证据保留区间，原分类与两轴共振规则不变',
    override_rules:{ category_resonance:'红灯占比≥50%的分类≥2个→至少高风险预警',two_axis_alert:'stage≥60且trigger≥50→至少高风险预警',two_axis_top:'stage≥60且trigger≥65→系统性顶部' }
  } };
}

