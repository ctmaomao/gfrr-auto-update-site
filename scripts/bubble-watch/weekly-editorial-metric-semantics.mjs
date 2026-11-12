// Only explicit return-difference assertions are covered. A percentage-point
// difference must not be relabelled as a relative return. This is not general NLP.
export function explicitSpreadUnitError(claim) {
  const linked = (Array.isArray(claim?.sourceRefIds) && claim.sourceRefIds.includes('indicator:spy_vs_rsp_6m'))
    || (Array.isArray(claim?.sourceIndicatorIds) && claim.sourceIndicatorIds.includes('spy_vs_rsp_6m'));
  if (!linked) return false;
  const text = [claim?.titleZh, claim?.detailZh].filter(value => typeof value === 'string').join(' ');
  return /(?:SPY\s*[−–-]\s*RSP|SPY\s*(?:vs\.?|与|相对)\s*RSP\s*(?:收益|回报)?差(?:值)?|(?:市值加权|SPY)\s*(?:相对|与|vs\.?)\s*(?:等权重|RSP)\s*(?:领先|落后|收益差|回报差|差值))\s*(?:为|约|是|达|：|:)?\s*[+−-]?\d+(?:\.\d+)?\s*%/iu.test(text);
}
