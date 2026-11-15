import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ofrEditorialFixture } from '../fixtures/macro-editorial-ofr.mjs';
import { fixtureDeepSeekBudget } from '../helpers/deepseek-budget-fixture.mjs';
import { validateEditorialOutput } from '../../scripts/macro-risk/editorial-contract.mjs';
import { normalizeOutput, requestEditorial } from '../../scripts/macro-risk/editorial-provider.mjs';
import { reviewEditorial, projectEditorial, applyEditorialProjection } from '../../scripts/macro-risk/editorial-production.mjs';
import { isOfrEditorialVisible } from '../../scripts/modules/macroRiskEditorialOfrContract.js';
import { numericEvidenceAtoms } from '../../scripts/bubble-watch/weekly-editorial-numeric-grounding.mjs';
import { safeClaimDiagnostics, safeNumericAtom, safeProviderDiagnostics } from '../../scripts/lib/editorial-safe-diagnostics.mjs';

const check = text => { const x = ofrEditorialFixture(); x.output.pressureSynthesis.assessmentZh = text; return validateEditorialOutput(x.output,x.input); };
test('pressure numerical readings stay program-injected; evidence token membership never substitutes for field binding', () => {
  const x=ofrEditorialFixture();
  const review=reviewEditorial({input:x.input,output:x.output,generatedAt:x.at});
  const layer=projectEditorial({...x,review,generatedAt:x.at,sourceCommit:'b'.repeat(40),runId:'123'});
  const data=applyEditorialProjection(x.radar,layer,new Date(x.at),x.input);
  assert.equal(isOfrEditorialVisible(layer,data,new Date(x.at)),true);
  const negatives=['原值为100。','周变化为0。','金额为（100）亿元。','[100]亿元','{100}亿元','USD (100)','$(100)','-(100)美元','(100)%','[100]基点','（100）天','[100]年','（100）GW','金额为（0）美元/天。',
    'OFR原值为999。','OFR原值为负九十九。','截至2026-12-31的读数。','原值为4美元。','变化为4基点。','原值为-4%。','建议加仓。','综合分为99。',
    x.input.structuredFacts.find(f=>f.id==='fact:ofr:pressure').factZh];
  for (const text of negatives) {
    const validated=check(text);assert.equal(validated.ok,false,text);
    if (text==='原值为100。') assert.ok(validated.diagnostics.some(row=>row.ruleCode==='pressure_numeric_prose'&&row.fieldPath==='pressureSynthesis.assessmentZh'));
    const bad=structuredClone(layer);bad.output.pressureSynthesis.assessmentZh=text;
    assert.throws(()=>applyEditorialProjection(x.radar,bad,new Date(x.at),x.input),undefined,text);
    assert.equal(isOfrEditorialVisible(bad,data,new Date(x.at)),false,text);
  }
  const listed=structuredClone(layer);listed.output.pressureSynthesis.assessmentZh='1. 关注融资条件。';
  assert.equal(validateEditorialOutput(listed.output,x.input).ok,true);
  assert.equal(isOfrEditorialVisible(listed,data,new Date(x.at)),true);
});

test('only unambiguous prose-list markers are excluded from numeric detection; original prose stays intact', () => {
  for(const text of ['1. 关注融资条件。','（1） 观察市场。','第一，关注融资条件；第二，观察市场。','一元化解释并不可靠。']) assert.equal(check(text).ok,true,text);
  for(const text of ['1.5%','1. November 2026','2026. 11. 10','（100）亿元','（1）美元','（1）天','1. 5%','1. million','1. 美元','未来7天继续观察。','近7日新闻窗口。','金额一元。','一元人民币。','一元化为美元。','百分之一。']) assert.ok(numericEvidenceAtoms(text).length>0,text);
  for(const text of ['1. 关注融资999美元。','（1） 观察利率99%。','一元化解释并不支持999美元。','1. 观察2026-12-31的市场。']) assert.equal(check(text).ok,false,text);
  for (const [text, key] of [['1.5%','percent:15e-1'], ['1. November 2026','number:1e0'],
    ['2026. 11. 10','year:2026e0'], ['（100）亿元','number:1e2'], ['（1）美元','number:1e0'], ['（1）天','number:1e0'], ['1. 5%','percent:5e0']]) {
    assert.ok(numericEvidenceAtoms(text).some(atom=>atom.key===key),text);
  }
  const text='1. 关注融资条件。';numericEvidenceAtoms(text);assert.equal(text,'1. 关注融资条件。');
});

test('optional defaults apply only to absent OFR keys; required and malformed fields remain blocked', () => {
  const x=ofrEditorialFixture();
  for(const key of ['weeklyTimeline','keyTensions','contextAnalysis','crossMarketAnalysis','historicalComparison']) {
    const o=structuredClone(x.output);delete o[key];
    const n=normalizeOutput(o,x.input,x.at,'fixture');assert.deepEqual(n[key],key==='historicalComparison'?null:[]);
    assert.equal(Object.hasOwn(o,key),false);
    for(const bad of ['',42,false,{}]) { o[key]=bad;const b=normalizeOutput(o,x.input,x.at,'fixture');assert.deepEqual(b[key],bad);assert.equal(validateEditorialOutput(b,x.input).ok,false); }
  }
  for(const key of ['watchNext','pressureSynthesis','dataGaps','sourceRefIds']) { const o=structuredClone(x.output);delete o[key];assert.equal(validateEditorialOutput(normalizeOutput(o,x.input,x.at,'fixture'),x.input).ok,false); }
});

test('diagnostic projection is bounded, grammar checked, secret aware and idempotent', () => {
  const {input}=ofrEditorialFixture();
  const row={claimPath:'pressureSynthesis',fieldPath:'pressureSynthesis.assessmentZh',ruleCode:'unsupported_numeric',atom:{kind:'number',key:'number:999e0'},sourceRefIds:['site:ofr:pressure','UNKNOWN_PRIVATE_ID']};
  const rows=safeClaimDiagnostics(Array(30).fill(row),input);assert.equal(rows.length,24);assert.deepEqual(rows[0].sourceRefIds,['site:ofr:pressure']);assert.equal(rows[0].atom.key,'number:999e0');
  for(const atom of [{kind:'unparsed-financial',key:'unparsed:PRIVATE_TEXT'}, {kind:'unparsed-financial',key:'unparsed-financial:123'}, {kind:'date',key:'date:999e0'}, {kind:'identifier',key:'identifier:PRIVATE_TEXT'}, {kind:'number',key:'number:https://private.example'}, {kind:'number',key:'number:123456789012345678901e0'}]) assert.equal(safeNumericAtom(atom).key,null);
  assert.equal(safeNumericAtom({kind:'number',key:'number:781236985401e0'},'781236985401').key,null);
  const d=safeProviderDiagnostics({responseModel:'PRIVATE_MODEL',errorType:'PRIVATE_ERROR',contract:{errorCount:1,errors:['OFR output unknown/retired field PRIVATE_KEY','OFR claim unsupported numeric/unit/date: unparsed:PRIVATE_TOKEN'],claims:[row,{...row,claimPath:'PRIVATE_PATH',fieldPath:'PRIVATE_FIELD',sourceRefIds:['site:PRIVATE_URL']}]}},input);
  assert.equal(JSON.stringify(d).includes('PRIVATE'),false);assert.deepEqual(safeProviderDiagnostics(d,input),d);
  assert.equal(JSON.stringify(safeProviderDiagnostics({contentLength:123456,usage:{total_tokens:123456}},input,'123456')).includes('123456'),false);
});

test('mocked rejection exposes paths and safe atoms but never arbitrary keys, text, URLs or credential digits', async () => {
  const x=ofrEditorialFixture(), secret='781236985401';
  x.output['PRIVATE_KEY_https://private.example']='PRIVATE_BODY';
  x.output.pressureSynthesis.assessmentZh=`一元人民币。原值为999。 PRIVATE_PROSE ${secret}`;
  x.output.pressureSynthesis.sourceRefIds.push('PRIVATE_REF');
  let calls=0;
  await assert.rejects(requestEditorial({budget:fixtureDeepSeekBudget,input:x.input,apiKey:secret,now:()=>new Date(x.at),fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(x.output)}}]})};}}),error=>{
    const d=error.responseDiagnostics;assert.ok(d.contract.claims.some(c=>c.fieldPath==='pressureSynthesis.assessmentZh'&&c.atom.key==='number:999e0'));
    const encoded=JSON.stringify(d);for(const marker of ['PRIVATE','private.example','一元',secret])assert.equal(encoded.includes(marker),false,marker);
    assert.equal(error.replayCandidate,undefined);return true;
  });assert.equal(calls,1);
});

test('both ordinary failure writers use the safe projection and Bubble never serializes a replay candidate', () => {
  for(const path of ['scripts/macro-risk/run-editorial-deepseek.mjs','scripts/bubble-watch/run-weekly-editorial-deepseek.mjs']) {
    const code=fs.readFileSync(path,'utf8');assert.ok(code.includes('response: safeProviderDiagnostics('));assert.equal(code.includes('replayCandidate:'),false);assert.equal(code.includes('? error.message'),false);
  }
});
