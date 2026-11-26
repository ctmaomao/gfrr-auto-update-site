import { renderOilDirectional } from './renderOilDirectional.js?v=oil-route-estimates-20261127';
import { buildOilMarketView } from './oilMarketModel.js?v=oil-route-estimates-20261127';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const fmt=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?value.replace('T',' ').replace(/\.\d+Z$/,' UTC').replace(/Z$/,' UTC'):'观察日未知';
const state=row=>row.value===null?'缺失':row.sourceStatus==='live'?'来源可用':row.asOfDate?'超龄／时点异常或来源不可用':'时点缺失 · 不作判断';
const clock=row=>`观察：${date(row.asOfDate)} · ${state(row)}`;
function cells(host,values){const tr=el('tr');for(const v of values)tr.append(el('td',v));host.append(tr);}
async function load(path){try{const response=await fetch(path,{cache:'no-cache',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Unavailable');return await response.json();}catch{return null;}}
export function renderOilMarket(input,now=Date.now()) {
 const v=buildOilMarketView(input,now);
 renderOilDirectional({oilData:input.oil,radarData:input.radar,worldOrderStressData:input.worldOrder,oilNewsEventWatchData:input.news});
 $('oil-brent').textContent=fmt(v.brent.value);
 $('oil-brent-meta').textContent=clock(v.brent);
 $('oil-curve').replaceChildren();
 const maximum=Math.max(1,...v.curve.map(row=>row.value || 0));
 for(const row of v.curve){const host=el('div',undefined,'oil-bar-row');host.append(el('span',row.label || '合约未知'));const track=el('span',undefined,'oil-bar-track');const fill=el('span',undefined,'oil-bar-fill');fill.style.width=`${Math.max(0,(row.value || 0)/maximum*100)}%`;track.append(fill);host.append(track,el('span',fmt(row.value)),el('span',clock(row),'oil-bar-date'));$('oil-curve').append(host);}
 if(!v.curve.length)$('oil-curve').append(el('p','期货报价未能加载，不绘制曲线。'));
 $('oil-freight').replaceChildren();
 for(const row of v.freight){const item=el('article');item.append(el('h3',row.label),el('div',fmt(row.value),'oil-big'),el('p',clock(row),'oil-meta'),el('p',`来源：${row.source?.startsWith('BalticExchangePublicTicker')?'波罗的海交易所公共行情':row.source?.startsWith('StockQ')?'StockQ 公开代理':'未能核实'}。指数点数，不是运费货币金额。`));$('oil-freight').append(item);}
 $('oil-transport-clock').textContent=`来源：IMF PortWatch。获取时间：${date(v.transportFetchedAt)}；这不是船舶观察时间。`;
 $('oil-routes').replaceChildren();
 for(const row of v.routes){const item=el('article',undefined,'oil-route');item.append(el('h4',row.label),el('p',`${fmt(row.value)} 船次 · 过去30日均值 ${fmt(row.average)}`),el('p',clock(row),'oil-meta'));if(row.value!==null && row.average!==null && row.average>=0){const maximum=Math.max(1,row.value,row.average);for(const [label,value] of [['当日',row.value],['30日均值',row.average]]){const comparison=el('div',undefined,'oil-route-bar');comparison.append(el('span',label));const track=el('span',undefined,'oil-bar-track');const fill=el('span',undefined,'oil-bar-fill');fill.style.width=`${Math.max(0,value/maximum*100)}%`;track.append(fill);comparison.append(track);item.append(comparison);}}if(row.tradeEstimateState==='reported')item.append(el('p','油轮运输量估计：'+fmt(row.estimatedTradeVolume)+' 公吨'),el('p',clock(row.tradeEstimate),'oil-meta'));if(row.tradeEstimateState==='zero')item.append(el('p','源报油轮运输量估计为0；不等于无油轮或无可用运力，不能据此确认实际货量或航道状态。','oil-warning'));if(row.tradeEstimateState==='missing')item.append(el('p','油轮运输量估计缺失；不以零代替。','oil-warning'));$('oil-routes').append(item);}
 $('oil-facilities').replaceChildren();
 if(v.thermal){const t=v.thermal;$('oil-thermal-count').textContent=`${fmt(t.rows)} 条记录`;$('oil-thermal-meta').textContent=`${t.clockStatus==='live'?'最近快照':'历史／超龄或时点无效的快照'}。${t.observationStatus==='live'?'最新采集在24小时内；仍不代表持续覆盖。':'最新采集超24小时或时点未知，不作当前判断。'}${fmt(t.detectedAreas)} 个监测区检出／${fmt(t.areas)} 个起步监测区。最新采集：${date(t.latest)}；快照生成：${date(t.generatedAt)}。${t.status==='partial'?'来源不完整。':'来源状态需结合快照核查。'}`;
 const historical=new Map([['established','已建立'],['partial','部分建立'],['not_established','未建立']]).get(t.baselineStatus) || '状态未知';
 const c=t.baselineComparison;
 const current=c
   ? `本快照可比监测区：${fmt(c.compared)}／${fmt(c.areas)}。${c.paused===c.areas?'来源不完整或组合改变，全轮基线比较暂停。':c.paused?'部分监测区因来源不完整或组合改变暂停比较。':''}`
   : '本快照可比范围未核实。';
 $('oil-thermal-baseline').textContent=`历史基线：${historical}${t.baselineAt?`（样本截至 ${date(t.baselineAt)}）`:''}。${current}${t.retired?'本轮含已停用来源。':''}比较状态不代表设施运行正常，热源记录也不确认事故。`;
 for(const row of t.facilities)cells($('oil-facilities'),[row.label || '名称未知',fmt(row.rowCount),date(row.latestAcqAt)]);
 }else{$('oil-thermal-count').textContent='数据不可用';$('oil-thermal-meta').textContent='未能取得可识别的卫星观测快照；不推断无异常。';$('oil-thermal-baseline').textContent='基线可比性未核实，不作异常判断。';}
 const missing=['radar','oil','thermal','worldOrder','news'].filter(key=>!input[key]);$('oil-load-status').textContent=missing.length?`部分数据未加载（${missing.map(k=>({radar:'市场与运输',oil:'周度供需',thermal:'卫星观测',worldOrder:'市场背景',news:'新闻事件'}[k])).join('、')}），对应区域保留缺失状态。`:`已读取五个已发布快照。市场快照生成：${date(v.radarAt)}；各项观察时点见下文。`;
}
function revealEvidenceAnchor(){if(globalThis.location?.hash==='#oil-physical')$('oil-physical').open=true;}
if(typeof document!=='undefined'){
revealEvidenceAnchor();globalThis.addEventListener('hashchange',revealEvidenceAnchor);
document.querySelector('a[href="#oil-physical"]').addEventListener('click',()=>{$('oil-physical').open=true;});
const [radar,oil,thermal,worldOrder,news]=await Promise.all([load('data/radar-data.json'),load('data/oil-directional-pressure.json'),load('data/oil-thermal-watch.json'),load('data/world-order-stress.json'),load('data/oil-news-event-watch.json')]);
renderOilMarket({radar,oil,thermal,worldOrder,news});
}
