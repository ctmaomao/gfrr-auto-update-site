import {replayQuarterlyCapexPanel} from './capex-quarterly-replay.mjs';
import {quarterlyCapexHold,validateQuarterlyCapexPublication,QUARTERLY_CAPEX_LABELS,QUARTERLY_CAPEX_SOURCE,QUARTERLY_CAPEX_THRESHOLD} from './capex-quarterly-publication.mjs';
import {QUARTERLY_CAPEX_POLICY} from './capex-quarterly-panel.mjs';
const signed=(v,d=2)=>`${v>=0?'+':''}${v.toFixed(d)}`;
const amount=values=>values[0]===values[1]?`${values[0]*10}`:`${values[0]*10}–${values[1]*10}`;
export function buildQuarterlyCapexIndicator(base,report,today){
 const result=replayQuarterlyCapexPanel(report,today),known=result.ok;
 if(!known&&(report?.policy!==QUARTERLY_CAPEX_POLICY||report?.asOfDate!==today||report?.decision?.status!=='unknown'))throw Error('Malformed quarterly capex evidence cannot publish');
 const status=known?result.decision.status:'unknown';
 const shared='观察最新季度财报电话会关联反应，未完整追踪季度之间的临时指引，也不证明首次披露时点或资本开支因果。个股收益还受到收入、利润和其他财报信息影响。固定四家样本，不缩减分母；价格为当前版本复权历史收盘价，不是当时可得的历史回测。';
 let note='固定MSFT、META、AMZN、GOOGL四家公司。本轮最新季度材料、同年度指引、收盘后时段或价格对照未能全部核实，保持待确认；缺口不表示没有上调或没有市场惩罚。'+shared;
 if(known){
  const names={MSFT:'微软',META:'Meta',AMZN:'亚马逊',GOOGL:'Alphabet'};
  const parts=report.companies.map(row=>{
   const g=row.guidance,p=row.prices,q=row.catalog.quarter.split(' '),quarter=`${q[1]}${row.symbol==='MSFT'?'财年':'年'}第${{'Q2':'二','Q4':'四'}[q[0]]}季度`;
   const guidance=row.symbol==='MSFT'?`2026年经济投入预期未变，租赁重分类后账面约${amount(g.reportedCurrent)}亿美元，不计为上调`
    :row.symbol==='META'?`2026年含融资租赁本金的指引从${amount(g.previous)}亿美元变为${amount(g.current)}亿美元，仅下限提高`
    :`2026年${row.symbol==='AMZN'?'现金资本开支':'公司报告口径资本开支'}从${amount(g.previous)}亿美元变为${amount(g.current)}亿美元（金额来自具名二手电话会整理）`;
   return `${names[row.symbol]}（${row.symbol}，${quarter}）：${guidance}；${row.window.beforeDate}至${row.window.afterDate}收盘，个股${signed(p.stockReturnPct)}%、QQQ${signed(p.qqqReturnPct)}%，相对${signed(p.excessReturnPp)}个百分点。`;
  });
  note=`固定四家面板已核验；${result.decision.raisedCount}家上调，${result.decision.punishedCount}家受罚、${result.decision.rewardedCount}家获奖励。${parts.join('')}微软分类及Meta指引经公司材料核对；Amazon和Alphabet金额采用具名二手电话会文本，公司材料用于财报事件身份和时段核验。${shared}`;
 }
 const card={...base,name_zh:'资本开支财报关联反应',status,as_of:known?report.companies.map(r=>r.timing.eventDate).sort().at(-1):null,stale:false,
  source_name:QUARTERLY_CAPEX_SOURCE,value_display:QUARTERLY_CAPEX_LABELS[status],threshold_text:QUARTERLY_CAPEX_THRESHOLD,note,
  provenance:{mode:'auto',checkedAt:report.checkedAt,detail:known?report:quarterlyCapexHold(today)}};
 delete card.evidence_gap;
 if(!known)card.evidence_gap={policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today};
 const errors=validateQuarterlyCapexPublication(card,today);if(errors.length)throw Error(`Capex evidence cannot publish: ${errors.join('; ')}`);
 return card;
}
