import {validateFedMarketPathPublication,FED_PATH_LABELS,FED_THRESHOLD_TEXT}from'./qualified-fed-publication.mjs';
export function buildQualifiedFedIndicator(base,report,today){
 const result=report.result,missing=result.status==='unknown';
 const card={...base,name_zh:'Fed 3/6个月隐含路径',status:result.status,
  source_name:'Yahoo联邦基金期货日线代理 · FRED实际EFFR · Fed会议日历',
  value_display:FED_PATH_LABELS[result.status],threshold_text:FED_THRESHOLD_TEXT,
  as_of:missing?null:result.quoteLabelDate,stale:false,
  provenance:{mode:'auto',checkedAt:report.checkedAt,detail:report},
  ...(missing?{evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'fed_market_path_unavailable',checkedDate:today}}:{})};
 const errors=validateFedMarketPathPublication(card,today);
 if(errors.length)throw Error(`Fed evidence cannot publish: ${errors.join('; ')}`);
 const paths=missing?'本轮未取得完整合格的3/6个月报价、同期实际利率及已审会议日历，路径数值待确认。'
  :`快照日${today}，同期实际有效联邦基金利率${report.sourceEvidence.baseline.value}%（原观测日${result.baselineObservedAt}）；`+
   result.paths.map((p,i)=>`${i===0?'3':'6'}个月目标日${p.targetDate}，隐含有效利率约${p.expectedRatePct.toFixed(3)}%，较同期实际利率${p.deltaBp>=0?'+':''}${p.deltaBp.toFixed(1)}基点`).join('；')+`。期货共同纽约日线标签${result.quoteLabelDate}，保留原日期。`;
 return {...card,note:`${paths}采用3/6个日历月、月末截日；月平均利率按会议前后分段及后续非会议月锚定推导。仅支持已审会议日期及次日生效假设，日历变更、来源失败或报价不合格均待确认。Yahoo日线标签结束至少24小时、距今不超过7日且报告成交量为正；成交量不证明同步成交。该代理不是CME官方结算或实时行情，也不是下次会议加息/降息概率或政策目标区间。期货风险溢价、临时会议及非会议因素可能使实际路径偏离。灯号使用未舍入精确值，展示约数不参与阈值；不沿用年末点阵图、通胀或旧灯号。`};
}
