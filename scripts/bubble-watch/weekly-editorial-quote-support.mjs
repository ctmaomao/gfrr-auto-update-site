// Punctuation is not proof of a verbatim quotation. Only explicit verbatim claims
// remain blocking; terminology and translated wording are review hints.
import { claimEvidenceTexts } from './weekly-editorial-numeric-grounding.mjs';
export function claimQuoteSupport(claim,input){
 const text=[claim?.titleZh,claim?.detailZh].filter(v=>typeof v==='string').join(' ');
 const evidence=claimEvidenceTexts(claim,input),unsupported=[],blockers=[];
 for(const match of text.matchAll(/[“「]([^”」]+)[”」]|"([^"\n]+)"/gu)){
  const quote=match[1]||match[2];if(evidence.some(value=>value.includes(quote)))continue;
  unsupported.push(quote);
  const prefix=text.slice(Math.max(0,match.index-40),match.index);
  if(/(?:原话|原文|逐字引用|逐字引述|verbatim|direct quote)(?:是|为)?\s*[:：]?\s*$/iu.test(prefix))blockers.push(quote);
 }
 return {unsupportedQuoteCount:unsupported.length,unsupportedDirectQuoteCount:blockers.length};
}
