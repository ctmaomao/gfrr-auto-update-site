// Publish the independently reviewed pending-only capex event contract.
import {capexEventEvidenceHold,validateCapexEventPublication} from './capex-event-evidence.mjs';
export function buildCapexEventIndicator(base,today,checkedAt=new Date().toISOString()){
  const card={...base,status:'unknown',as_of:null,stale:false,
    name_zh:'资本开支公告事件反应',value_display:'待确认',
    source_name:'公司季度财报及公告后价格 · 事件证据待核',
    threshold_text:'固定四家公司；最新财报、可比指引上调及匹配交易日证据齐备后再判读',
    note:'固定MSFT、META、AMZN、GOOGL四家公司。目前尚未具备可核验最新季度财报目录、同口径前后指引、首次披露时间及首个完整正常交易日个股与QQQ价格的完整面板，因此保持待确认。这不表示没有支出上调或没有市场惩罚。租赁会计重分类不能直接当作投入改变，区间下限提高也不等于上限提高；财报同时包含收入、利润等信息，公告后相对收益不能全归因于资本开支。滚动多窗口收益、新闻条数及研究评论均不替代本项事件证据；季度之间的资本开支更新尚未完整覆盖。',
    provenance:{mode:'auto',checkedAt,detail:capexEventEvidenceHold(today)},
    evidence_gap:{policy:'bubble-qualified-evidence-v1',reasonCode:'capex_qualified_event_unavailable',checkedDate:today}};
  const errors=validateCapexEventPublication(card,today);
  if(errors.length)throw new Error(`Capex evidence cannot publish: ${errors.join('; ')}`);
  return card;
}
