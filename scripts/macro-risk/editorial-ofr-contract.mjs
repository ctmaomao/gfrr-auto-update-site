import { validatePublishedOfrComponent } from '../daily/ofr-publication-contract.mjs';
import { numericEvidenceAtoms } from '../bubble-watch/weekly-editorial-numeric-grounding.mjs';

export const OFR_INPUT_SCHEMA = 'macro-risk-editorial-ofr-input-v2';
export const OFR_OUTPUT_SCHEMA = 'macro-risk-editorial-ofr-output-v2';
export const OFR_PRODUCTION_SCHEMA = 'macro-risk-editorial-ofr-production-v2';
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = x => Array.isArray(x) ? x : [];
const strings = x => Array.isArray(x) ? x.filter(v => typeof v === 'string') : [];
const textFields = ['headlineZh','leadZh','titleZh','detailZh','assessmentZh','labelZh','assetZh','observationZh','implicationZh','periodZh','similaritiesZh','differencesZh','conditionZh','whyItMattersZh','invalidationZh','reasonZh'];
const rootKeys = new Set(['schemaVersion','generatedAt','sourceDataUpdatedAt','provider','model','mode','headlineZh','leadZh','sourceRefIds','weeklyTimeline','pressureSynthesis','keyTensions','contextAnalysis','crossMarketAnalysis','historicalComparison','watchNext','dataGaps','sourceAttribution','confidence','auditFlags','boundaries']);
const claimKeys = new Set([...textFields, 'date','topic','sourceRefIds']);
export function ofrEditorialClaims(output) {
  return [{ headlineZh: output?.headlineZh, leadZh: output?.leadZh, detailZh: [...strings(output?.dataGaps), output?.confidence?.reasonZh].join('\n'), sourceRefIds: output?.sourceRefIds },
    output?.pressureSynthesis, ...list(output?.weeklyTimeline), ...list(output?.keyTensions), ...list(output?.contextAnalysis), ...list(output?.crossMarketAnalysis), ...(output?.historicalComparison ? [output.historicalComparison] : []), ...list(output?.watchNext)].filter(record);
}
export function visibleOfrEditorialSections(output) {
  const section = value => (Array.isArray(value) ? value : [value]).filter(record).map(item => [...textFields.map(k => item[k]), item.date].filter(x => typeof x === 'string').join('\n')).join('\n');
  return { headline: output?.headlineZh || '', lead: output?.leadZh || '', timeline: section(output?.weeklyTimeline), pressureSynthesis: section(output?.pressureSynthesis), keyTensions: section(output?.keyTensions), context: section(output?.contextAnalysis), crossMarket: section(output?.crossMarketAnalysis), historicalComparison: section(output?.historicalComparison), watchNext: section(output?.watchNext), dataGaps: strings(output?.dataGaps).join('\n'), confidence: output?.confidence?.reasonZh || '' };
}
export function validateOfrEditorialInput(input, validateNewsDiscovery) {
  const errors = [];
  if (!record(input)) return { ok: false, errors: ['OFR input must be an object'], sourceRefIds: new Set() };
  for (const key of ['riskSnapshot','moduleSnapshot','score','decisionModel','positionGuidance','tradingSystem']) if (Object.hasOwn(input,key)) errors.push(`OFR input forbids retired field ${key}`);
  try { validatePublishedOfrComponent(input.pressureSnapshot); } catch (e) { errors.push(e.message); }
  if (input.historicalContext?.recentScores !== undefined) errors.push('OFR input forbids legacy score history');
  for (const k of ['generatedAt','sourceDataUpdatedAt']) if (!Number.isFinite(Date.parse(input[k]))) errors.push(`OFR input ${k} invalid`);
  if (Date.parse(input.sourceDataUpdatedAt) > Date.parse(input.generatedAt)) errors.push('OFR input source timestamp is future');
  if (input.pressureSnapshot && Date.parse(input.pressureSnapshot.asOf) > Date.parse(input.generatedAt)) errors.push('OFR input pressure timestamp is future');
  const facts = Array.isArray(input.structuredFacts) ? input.structuredFacts : [];
  const refs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  if (facts.length < 1 || facts.length > 60 || refs.length < 2 || refs.length > 120) errors.push('OFR input evidence bounds invalid');
  const ids = new Set(refs.map(x=>x?.id));
  if (ids.size !== refs.length || refs.some(x=>typeof x?.id !== 'string' || !x.id)) errors.push('OFR input source ids invalid or duplicated');
  for (const fact of facts) {
    if (typeof fact?.factZh !== 'string' || !fact.factZh.trim() || fact.factZh.length > 800 || !Array.isArray(fact.sourceRefIds) || !fact.sourceRefIds.length || fact.sourceRefIds.some(id=>!ids.has(id))) errors.push('OFR input structured fact or reference invalid');
  }
  const news = validateNewsDiscovery(input.newsContext); errors.push(...news.errors);
  const stories = input.newsContext?.stories || [];
  if (!stories.some(x=>['official','cross_checked'].includes(x.evidenceStatus))) errors.push('OFR input requires credible news');
  for (const story of stories) {
    if (!ids.has(story.id)) errors.push('OFR input news source missing');
    const time=Date.parse(story.publishedAt), now=Date.parse(input.generatedAt);
    if (!Number.isFinite(time) || time > now || now-time > 7*86400000) errors.push('OFR input news date missing/future/stale');
  }
  for (const k of ['siteStructuredDataOnly','newsDiscoveryContextOnly','noSecrets','noRawArticleBody','readOnlyContext','excludesExistingAiLayers','excludesDecisionExecutionPositionFields']) if (input.boundaries?.[k] !== true) errors.push(`OFR input boundary ${k}`);
  for (const k of ['affectsGfrrScoring','affectsRiskModules','affectsDecisionModel','affectsExecutionLock','affectsPositionGuidance']) if (input.boundaries?.[k] !== false) errors.push(`OFR input boundary ${k}`);
  if (Buffer.byteLength(JSON.stringify(input),'utf8')>65536) errors.push('OFR input exceeds 64 KiB');
  return { ok:!errors.length, errors, sourceRefIds:ids };
}
export function validateOfrEditorialOutput(output, input, inputResult, unsafePatterns) {
  const errors = [...inputResult.errors];
  const warnings = [];
  const root = record(output) ? output : {};
  const str=(v,label,min=1,max=1000)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)errors.push(`${label} must be nonempty text within bounds`);};
  const arr=(v,label,min=0,max=5)=>{if(!Array.isArray(v)||v.length<min||v.length>max){errors.push(`${label} array bounds invalid`);return [];}return v;};
  for (const key of Object.keys(root)) if (!rootKeys.has(key)) errors.push(`OFR output unknown/retired field ${key}`);
  if(root.schemaVersion!==OFR_OUTPUT_SCHEMA||root.provider!=='deepseek'||root.mode!=='external_ai_macro_risk_editorial')errors.push('OFR output identity invalid');
  if(root.sourceDataUpdatedAt!==input?.sourceDataUpdatedAt)errors.push('OFR output snapshot mismatch');
  if(!Number.isFinite(Date.parse(root.generatedAt)))errors.push('OFR output generatedAt invalid');
  str(root.headlineZh,'headline',1,90);str(root.leadZh,'lead',1,900);
  if(!record(root.pressureSynthesis))errors.push('pressureSynthesis required'); else str(root.pressureSynthesis.assessmentZh,'pressureSynthesis',1,1000);
  arr(root.weeklyTimeline,'weeklyTimeline',0,5); arr(root.keyTensions,'keyTensions',0,4); arr(root.contextAnalysis,'contextAnalysis',0,6); arr(root.crossMarketAnalysis,'crossMarketAnalysis',0,5);
  if(root.historicalComparison!==null && !record(root.historicalComparison))errors.push('historicalComparison must be object or null');
  for (const [key, fields] of [['weeklyTimeline',['date','titleZh','detailZh']],['keyTensions',['titleZh','detailZh']],['contextAnalysis',['topic','labelZh','assessmentZh']],['crossMarketAnalysis',['assetZh','observationZh','implicationZh']]]) {
    for (const row of list(root[key])) {
      if (!record(row)) { errors.push(`${key} contains non-object claim`); continue; }
      for (const field of fields) str(row[field],`${key}.${field}`,1,1000);
      if (Object.keys(row).some(k=>![...fields,'sourceRefIds'].includes(k))) errors.push(`${key} unexpected field`);
    }
  }
  if (record(root.historicalComparison)) for (const field of ['periodZh','similaritiesZh','differencesZh']) str(root.historicalComparison[field],`historicalComparison.${field}`,1,1000);
  if (record(root.pressureSynthesis) && Object.keys(root.pressureSynthesis).some(k=>!['assessmentZh','sourceRefIds'].includes(k))) errors.push('pressureSynthesis unexpected field');
  if (record(root.confidence) && Object.keys(root.confidence).some(k=>!['level','score','reasonZh'].includes(k))) errors.push('confidence unexpected field');
  const watch=arr(root.watchNext,'watchNext',1,5); for(const row of watch){str(row?.conditionZh,'watch condition');str(row?.whyItMattersZh,'watch reason');str(row?.invalidationZh,'watch invalidation');}
  const gaps=arr(root.dataGaps,'dataGaps',1,12);for(const gap of gaps)str(gap,'data gap',1,800);
  const attributions=arr(root.sourceAttribution,'sourceAttribution',1,120);
  if(!['low','medium','high'].includes(root.confidence?.level)||!Number.isFinite(root.confidence?.score)||root.confidence.score<0||root.confidence.score>100)errors.push('confidence invalid');
  str(root.confidence?.reasonZh,'confidence reason',1,800);
  for(const key of ['displayOnly','commentaryOnly','externalAiGenerated','usesExternalAiApi','notInvestmentAdvice'])if(root.boundaries?.[key]!==true)errors.push(`output.boundaries.${key} must be true`);
  for(const key of ['affectsGfrrScoring','affectsRiskModules','affectsTailRiskOverlay','affectsDecisionModel','affectsExecutionLock','affectsPositionGuidance','affectsWorldOrder','affectsOdp','affectsBubbleWatch'])if(root.boundaries?.[key]!==false)errors.push(`output.boundaries.${key} must be false`);
  const stories=new Map((input?.newsContext?.stories||[]).map(x=>[x.id,x]));
  const referred=new Set();
  for(const claim of ofrEditorialClaims(root)){
    for(const key of Object.keys(claim))if(!claimKeys.has(key))errors.push(`OFR claim unknown/retired field ${key}`);
    const refs=arr(claim.sourceRefIds,'claim sourceRefIds',1,12);
    if(refs.some(id=>typeof id!=='string'||!inputResult.sourceRefIds.has(id)))errors.push('OFR claim unknown source');
    refs.forEach(id=>referred.add(id));
    if(refs.length && refs.every(id=>stories.get(id)?.evidenceStatus==='discovery_only'))errors.push('OFR claim relies only on discovery_only');
    const evidence=[...(input?.structuredFacts||[]).filter(f=>(f.sourceRefIds||[]).some(id=>refs.includes(id))).map(f=>f.factZh), ...refs.map(id=>stories.get(id)).filter(s=>s&&['official','cross_checked'].includes(s.evidenceStatus)).map(s=>`${s.title} ${s.snippet||''} ${s.publishedAt?.slice(0,10)||''}`)].join('\n');
    const text=[...textFields.map(k=>claim[k]),claim.date].filter(x=>typeof x==='string').join('\n');
    const supported=new Set(ofrNumericEvidenceAtoms(evidence).filter(a=>!a.kind.startsWith('invalid')).flatMap(a=>[a.key,...(a.alternateKey?[a.alternateKey]:[])]));
    for(const atom of ofrNumericEvidenceAtoms(text))if(atom.kind.startsWith('invalid')||(!supported.has(atom.key)&&!supported.has(atom.alternateKey)))errors.push(`OFR claim unsupported numeric/unit/date: ${atom.key}`);
    const compoundEvidence = new Set(compoundUnitAtoms(evidence));
    for (const atom of compoundUnitAtoms(text)) if (!compoundEvidence.has(atom)) errors.push(`OFR compound financial unit unsupported: ${atom}`);
    for(const match of text.matchAll(/(?:称|表示|写道|原文|指出|宣布|强调|宣称|声称|警告|报告|透露|提到|认为|said|stated|announced|emphasized|claimed|warned|reported|noted)\s*[:：]?\s*[“「"]([^”」"]+)[”」"]/giu))if(!evidence.includes(match[1]))errors.push('OFR explicit quotation not supported by cited evidence');
    if(claim.date && (!/^\d{4}-\d{2}-\d{2}$/u.test(claim.date)||!Number.isFinite(Date.parse(`${claim.date}T00:00:00Z`))||new Date(`${claim.date}T00:00:00Z`).toISOString().slice(0,10)!==claim.date))errors.push('OFR timeline date invalid');
  }
  // Numeric pressure labels are injected by projection, never copied from model text.
  if(/[0-9０-９]|百分之[零〇一二三四五六七八九十百]|(?:原值|指数|周变化|变化幅度|历史百分位|百分位)(?:为|是|达到|升至|降至|[:：])\s*(?:负|正)?[零〇一二三四五六七八九十百千万亿两]+(?:点[零〇一二三四五六七八九]+)?(?:[，。、；\s]|$)/u.test(root.pressureSynthesis?.assessmentZh||''))errors.push('OFR pressure prose must leave numeric readings to program projection');
  const attrs=new Set(attributions.map(x=>x?.sourceRefId));if(attrs.size!==attributions.length)errors.push('duplicate attribution');
  for(const id of referred)if(!attrs.has(id))errors.push('OFR citation lacks attribution');
  for(const id of attrs)if(!inputResult.sourceRefIds.has(id))errors.push('unknown attribution source');
  if(![...referred].some(id=>['official','cross_checked'].includes(stories.get(id)?.evidenceStatus)))errors.push('OFR commentary must cite credible news');
  const sections=visibleOfrEditorialSections(root), visible=Object.values(sections).join('\n');
  if(visible.length>6800||Buffer.byteLength(JSON.stringify(root),'utf8')>65536)errors.push('OFR output exceeds size limit');
  if(visible.length<800)warnings.push('本期为有依据的简版，未达到建议篇幅。');
  if((root.contextAnalysis?.length||0)<3)warnings.push('本期独立结构观察覆盖有限，不补写无依据栏目。');
  if(referred.size<12)warnings.push('本期实际引用来源少于建议数量，保留简版与覆盖限制。');
  for(const pattern of unsafePatterns)if(pattern.test(visible))errors.push('OFR output unsafe wording');
  if(/(?:总分|综合分|风险评分|模块分)(?:为|是|达到|升至|降至|[:：])\s*[\d零一二三四五六七八九十]|(?:仓位|配置|现金|敞口)(?:比例|建议|上限)|(?:建议|应当).{0,8}(?:买入|卖出|加仓|减仓|做多|做空)/u.test(visible))errors.push('OFR output revives retired scoring or allocation advice');
  return {ok:!errors.length,errors,warnings,visibleTextLength:visible.length,visibleTextSectionLengths:Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,v.length])),referencedSourceCount:referred.size};
}


// OFR requires numeric grounding beyond Bubble's intentionally narrower hard
// scope. Preserve unparsed Chinese rates as exact evidence tokens rather than
// treating their absence from the shared parser as absence of a numeric claim.
// Do not infer equivalence to Arabic figures without an exact numeral parser.
function ofrNumericEvidenceAtoms(text) {
  const normalized = String(text).normalize('NFKC');
  const atoms = numericEvidenceAtoms(normalized);
  for (const match of normalized.matchAll(/(?:负|正|[+-])?[零〇一二三四五六七八九十百千万亿两点]+\s*(?:个\s*)?(?:基点|百分点|百分比|%|basis points?|percentage points?|bps|bp)(?![A-Za-z])/giu)) {
    atoms.push({ key: `unparsed-rate:${match[0].replace(/\s+/gu, '').toLowerCase()}`, kind: 'unparsed-financial' });
  }
  return atoms;
}

// A monetary amount and its explicit denominator are one token. This also
// rejects dropping a denominator entirely, not just changing barrel to tonne.
function compoundUnitAtoms(text) {
  const value = String(text).normalize('NFKC');
  const aliases = { barrel: 'barrel', barrels: 'barrel', bbl: 'barrel', 桶: 'barrel', ton: 'ton', tons: 'ton', tonne: 'ton', tonnes: 'ton', 吨: 'ton', kWh: 'kWh', MWh: 'MWh', kg: 'kg', 千克: 'kg', hour: 'hour', hours: 'hour', 小时: 'hour' };
  const atoms = [];
  const currencies = '(?:US dollars?|U\\.S\\. dollars?|US\\$|U\\.S\\.\\$|USD|EUR|GBP|CNY|HKD|AUD|CAD|NZD|SGD|JPY|HK\\$|AU\\$|CA\\$|NZ\\$|A\\$|C\\$|S\\$|\\$|€|£|新西兰元|新加坡元|人民币|美元|欧元|英镑|港元|澳元|加元|日元|元)';
  const amount = '[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
  const scale = '(?:trillion|billion|million|thousand|tn|bn|b|m|k|万亿|百万|亿|万|千)';
  const pattern = new RegExp(`(?:${currencies}\\s*)?${amount}\\s*(?:${scale}\\s*)?(?:${currencies})?`, 'giu');
  for (const match of value.matchAll(pattern)) {
    const money = numericEvidenceAtoms(match[0]).find(a => a.kind.startsWith('money:'));
    if (!money) continue;
    const before = value.slice(Math.max(0, match.index - 35), match.index);
    const after = value.slice(match.index + match[0].length);
    const following = /^\s*(?:[Pp][Ee][Rr]\s+|[／/]\s*|每\s*)([A-Za-z]+|桶|吨|千克|小时)/u.exec(after);
    const preceding = /(?:每|[Pp][Ee][Rr]\s+|[／/])\s*([A-Za-z]+|桶|吨|千克|小时)\s*$/u.exec(before);
    const unit = following?.[1] || preceding?.[1];
    // English words are case-insensitive; SI symbols remain case-sensitive.
    // Unknown symbols retain their spelling rather than gaining equivalence.
    const wordAliases = { barrel: 'barrel', barrels: 'barrel', bbl: 'barrel', ton: 'ton', tons: 'ton', tonne: 'ton', tonnes: 'ton', hour: 'hour', hours: 'hour' };
    atoms.push(unit ? `${money.key}/per:${aliases[unit] || wordAliases[unit.toLowerCase()] || unit}` : `${money.key}/plain`);
  }
  return atoms;
}
