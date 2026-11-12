// ADR-0103: allowlisted diagnostic projection, never provider prose or arbitrary keys.
import { numericEvidenceAtoms } from '../bubble-watch/weekly-editorial-numeric-grounding.mjs';
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e9 ? value : null;
const pathPattern = /^(?:root\.dataGaps\[\d{1,3}\]|root\.confidence\.reasonZh|root|pressureSynthesis|historicalComparison|weeklyTimeline\[\d{1,3}\]|keyTensions\[\d{1,3}\]|contextAnalysis\[\d{1,3}\]|crossMarketAnalysis\[\d{1,3}\]|watchNext\[\d{1,3}\])(?:\.(?:headlineZh|leadZh|detailZh|titleZh|assessmentZh|labelZh|assetZh|observationZh|implicationZh|periodZh|similaritiesZh|differencesZh|conditionZh|whyItMattersZh|invalidationZh|reasonZh|date))?$/u;
const codes = new Set(['unsupported_numeric', 'unsupported_compound_unit', 'unsupported_quote', 'unknown_source', 'pressure_numeric_prose', 'ofr_semantic_boundary', 'contract_invalid']);
const kinds = new Set(['number','percent','percentage-point','year','month','day','quarter','date','month-day','scaled-number','power-W','invalid','invalid-financial','unparsed-financial', ...['USD','EUR','GBP','CNY','HKD','AUD','CAD','NZD','SGD','JPY'].map(x=>`money:${x}`), ...['KiB','MiB','GiB','TiB','KB','MB','GB','TB','kbps','Mbps','Gbps','km','kg','kWh','MWh','GWh'].map(x=>`unit:${x}`)]);
const fixedRefs = new Set(['site:ofr:pressure','site:ofr:weekly-change','site:ofr:percentile','site:ofr:coverage',
  'site:macro:credit:igOas','site:macro:credit:nfci','site:macro:fedLiquidity:effectiveFedFundsRate','site:macro:fedLiquidity:sofr']);
// Only registered Macro topics and content hashes, not arbitrary source strings.
const refPattern = /^news:(?:central_bank_inflation|energy_geopolitics|credit_liquidity|growth_employment_consumer|global_china_europe|market_volatility_valuation):[a-f0-9]{14}$/u;
export function safeNumericAtom(atom, secret = '') {
  const kind = kinds.has(atom?.kind) ? atom.kind : 'other';
  const key = typeof atom?.key === 'string' ? atom.key : '';
  const secretAtoms = secret ? new Set(numericEvidenceAtoms(secret).map(x=>x.key)) : new Set();
  const numeric = /^-?\d{1,18}(?:e-?\d{1,3})?$/u;
  const suffix = key.startsWith(`${kind}:`) ? key.slice(kind.length + 1) : '';
  const valid = kind === 'date' ? /^\d{4}-\d{2}-\d{2}$/u.test(suffix)
    : kind === 'month-day' ? /^\d{1,2}-\d{1,2}$/u.test(suffix)
      : !['other', 'unparsed-financial', 'invalid', 'invalid-financial'].includes(kind) && numeric.test(suffix);
  // Unparsed financial words, identifiers and invalid offsets are never serialized.
  return { kind, key: valid && !kind.startsWith('invalid') && !secretAtoms.has(key)
    && !(secret && key.includes(secret)) ? key : null };
}
export function safeClaimDiagnostics(rows, input, secret = '') {
  const known = new Set((input?.sourceRefs || []).map(x=>x.id));
  return (Array.isArray(rows) ? rows : []).slice(0, 24).map(row => ({
    claimPath: pathPattern.test(row?.claimPath || '') ? row.claimPath : 'root',
    fieldPath: pathPattern.test(row?.fieldPath || '') ? row.fieldPath : 'root',
    ruleCode: codes.has(row?.ruleCode) ? row.ruleCode : 'contract_invalid',
    atom: safeNumericAtom(row?.atom, secret),
    sourceRefIds: (Array.isArray(row?.sourceRefIds) ? row.sourceRefIds : []).filter(id => known.has(id) && (fixedRefs.has(id) || refPattern.test(id)) && !(secret && id.includes(secret))).slice(0,12)
  }));
}
function safeError(message) {
  if (['unsupported_numeric','unsupported_compound_unit','unsupported_quote','credible_news_required','unknown_source_or_field','pressure_numeric_prose','ofr_semantic_boundary','contract_invalid'].includes(message)) return message;
  if (String(message).startsWith('OFR semantic boundary: ')) return 'ofr_semantic_boundary';
  if (message === 'OFR pressure prose must leave numeric readings to program projection') return 'pressure_numeric_prose';
  // Return literals, never a matched substring. Unknown text stays process-local.
  if (String(message).includes('sourceRefIds must be an array with length 1-12')) return 'sourceRefIds must be an array with length 1-12';
  if (message === 'output visible editorial text must not exceed 6500 characters') return 'output visible editorial text must not exceed 6500 characters';
  if (String(message).includes('unsupported numeric/unit/date')) return 'unsupported_numeric';
  if (String(message).includes('compound financial unit')) return 'unsupported_compound_unit';
  if (String(message).includes('quotation')) return 'unsupported_quote';
  if (String(message).includes('credible news')) return 'credible_news_required';
  if (String(message).includes('unknown source') || String(message).includes('unknown/retired')) return 'unknown_source_or_field';
  return 'contract_invalid';
}
export function safeProviderDiagnostics(value, input, secret = '') {
  if (!value || typeof value !== 'object') return null;
  const finiteCount = value => count(value) !== null && !(secret && String(value) === secret) ? value : null;
  const result = {};
  for (const key of ['httpStatus','choicesCount','contentLength','reasoningContentLength']) result[key] = finiteCount(value[key]);
  for (const key of ['hasContent','contentStartsWithObject','contentEndsWithObject','contentHasSingleJsonFence','hasReasoningContent','requestIdPresent']) if (typeof value[key] === 'boolean') result[key] = value[key];
  result.finishReason = ['stop','length','content_filter','tool_calls'].includes(value.finishReason) ? value.finishReason : null;
  result.responseModel = ['deepseek-chat','deepseek-reasoner','deepseek-flash','deepseek-v4-flash'].includes(value.responseModel) ? value.responseModel : null;
  for (const key of ['errorType','errorCode','transportErrorName','transportErrorCode']) result[key] = value[key] ? 'provider_error' : null;
  result.usage = value.usage ? Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'].filter(k=>finiteCount(value.usage[k])!==null).map(k=>[k,value.usage[k]])) : null;
  if (value.contract) {
    const c = value.contract;
    result.contract = { errorCount: finiteCount(c.errorCount), visibleTextLength: finiteCount(c.visibleTextLength),
      errors: (Array.isArray(c.errors) ? c.errors : []).slice(0,24).map(safeError),
      claims: safeClaimDiagnostics(c.claims,input,secret),
      diagnosticsTruncated: c.diagnosticsTruncated === true };
    result.contract.visibleTextSectionLengths = Object.fromEntries(['headline','lead','timeline','pressureSynthesis','scoreSynthesis','keyTensions','modules','context','crossMarket','historicalComparison','watchNext','dataGaps','confidence'].filter(k=>finiteCount(c.visibleTextSectionLengths?.[k])!==null).map(k=>[k,c.visibleTextSectionLengths[k]]));
    // Existing media diagnostics remain available locally. Only counts leave this boundary.
    if (c.mediaClaims) result.contract.mediaClaims = { failedClaimCount: finiteCount(c.mediaClaims.failedClaimCount), warningClaimCount: finiteCount(c.mediaClaims.warningClaimCount),
      claims: (Array.isArray(c.mediaClaims.claims) ? c.mediaClaims.claims : []).slice(0,12).map(row => ({
        claimPath: /^(?:weeklyTimeline|keyTensions|categoryAnalysis)\[\d{1,3}\]$|^historicalComparison$/u.test(row?.claimPath || '') ? row.claimPath : 'root',
        mediaSourceFailureCount: finiteCount(row.mediaSourceFailureCount), mediaSourceWarningCount: finiteCount(row.mediaSourceWarningCount)
      })) };
  }
  return result;
}
