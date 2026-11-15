import { OFR_COLUMNS, parseOfrCsv, buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';
import { buildEditorialInput } from '../../scripts/macro-risk/editorial-input.mjs';
import { buildNewsDiscovery } from '../../scripts/macro-risk/editorial-news.mjs';
import { OFR_OUTPUT_SCHEMA } from '../../scripts/macro-risk/editorial-contract.mjs';
export const OFR_EDITORIAL_TIME='2026-11-01T12:00:00Z';
export function ofrEditorialFixture(){
 const at=OFR_EDITORIAL_TIME;
 const rows=parseOfrCsv(OFR_COLUMNS.join(',')+'\n'+[['2026-10-14',-0.2],['2026-10-21',-0.5],['2026-10-28',0]].map(([date,value])=>[date,value,0,0,0,0,0,0,0,0].join(',')).join('\n'));
 const p=buildPublishedOfrComponent({rows,readout:buildOfrReadout(rows,{asOf:at,retrievedAt:'2026-11-01T11:59:00Z',snapshotSha256:'a'.repeat(64)}),now:at});
 const radar=retireLegacyAdvice({updatedAt:at,score:88,modules:{energy:99},decisionModel:{},tradingSystem:{}},p);
 const discovery=buildNewsDiscovery({rawStories:[{provider:'brave',topic:'central_bank_inflation',title:'Federal Reserve policy statement',url:'https://federalreserve.gov/newsevents/pressreleases/monetary20261030a.htm',publishedAt:'2026-10-30T12:00:00Z',snippet:'Policy rate is 4%. Officials said "Data remain mixed".'}],sourceStatus:{tavily:{status:'error'},brave:{status:'ok'}},generatedAt:at,windowStart:'2026-10-25',windowEnd:'2026-11-01'});
 const input=buildEditorialInput({radarData:radar,discovery,generatedAt:at});
 const news=discovery.stories[0].id, refs=['site:ofr:pressure',news];
 const output={schemaVersion:OFR_OUTPUT_SCHEMA,generatedAt:at,sourceDataUpdatedAt:at,provider:'deepseek',model:'fixture',mode:'external_ai_macro_risk_editorial',headlineZh:'压力观察与证据边界',leadZh:'官方金融压力读数与政策新闻分别反映不同层面的情况，不能直接相互替代，也不构成投资建议。',sourceRefIds:refs,pressureSynthesis:{assessmentZh:'官方读数保留原观察日期，历史相对位置与当前压力不可混为一谈。',sourceRefIds:['site:ofr:pressure']},weeklyTimeline:[{date:'2026-10-30',titleZh:'政策声明更新',detailZh:'政策利率为4%，该消息只作独立背景。',sourceRefIds:[news]}],keyTensions:[],contextAnalysis:[],crossMarketAnalysis:[],historicalComparison:null,watchNext:[{conditionZh:'观察后续官方数据是否一致',whyItMattersZh:'避免单一信息过度解释',invalidationZh:'若后续证据不一致，需重新审视解释',sourceRefIds:refs}],dataGaps:['辅助历史百分位缺失，政策新闻不代表压力指数全部覆盖。'],sourceAttribution:refs.map(sourceRefId=>({sourceRefId})),confidence:{level:'low',score:40,reasonZh:'仅为编辑信心，证据覆盖有限。'},auditFlags:['read_only_editorial'],boundaries:{displayOnly:true,commentaryOnly:true,externalAiGenerated:true,usesExternalAiApi:true,notInvestmentAdvice:true,...Object.fromEntries(['GfrrScoring','RiskModules','TailRiskOverlay','DecisionModel','ExecutionLock','PositionGuidance','WorldOrder','Odp','BubbleWatch'].map(k=>['affects'+k,false]))}};
 return {radar,input,output,at};
}
