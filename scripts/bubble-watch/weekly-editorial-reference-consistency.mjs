// ADR-0081: complete only a claim's already declared, uniquely registered
// indicator/reference pair. Never select evidence from prose or another claim.
export function completeClaimIndicatorReferences(output, input) {
  const next = structuredClone(output);
  const facts = Array.isArray(input?.structuredFacts) ? input.structuredFacts : [];
  const sources = Array.isArray(input?.sourceRefs) ? input.sourceRefs : [];
  const pairs = facts.flatMap(fact => {
    const id = fact?.indicatorId;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(id)) return [];
    const ref = `indicator:${id}`;
    const rows = sources.filter(source => source?.id === ref);
    if (facts.filter(row => row?.indicatorId === id).length !== 1 || rows.length !== 1
      || fact.id !== `fact:${id}` || !Array.isArray(fact.sourceRefIds) || fact.sourceRefIds.length !== 1 || fact.sourceRefIds[0] !== ref
      || rows[0].kind !== 'indicator' || rows[0].sourceClass !== 'site_structured'
      || !Array.isArray(rows[0].indicatorIds) || rows[0].indicatorIds.length !== 1 || rows[0].indicatorIds[0] !== id) return [];
    return [{ id, ref }];
  });
  const claims = ['weeklyTimeline', 'keyTensions', 'categoryAnalysis']
    .flatMap(key => Array.isArray(next?.[key]) ? next[key] : []);
  if (next?.historicalComparison && typeof next.historicalComparison === 'object') claims.push(next.historicalComparison);
  let addedSourceRefs = 0;
  let addedIndicatorIds = 0;
  for (const claim of claims) {
    // Malformed arrays, duplicates and unknown values remain visible to the validator.
    const refs = claim?.sourceRefIds, ids = claim?.sourceIndicatorIds;
    if (!Array.isArray(refs) || !Array.isArray(ids)
      || [...refs, ...ids].some(value => typeof value !== 'string')
      || new Set(refs).size !== refs.length || new Set(ids).size !== ids.length) continue;
    const linked = pairs.filter(pair => ids.includes(pair.id) || refs.includes(pair.ref));
    const newRefs = linked.filter(pair => !refs.includes(pair.ref)).map(pair => pair.ref);
    const newIds = linked.filter(pair => !ids.includes(pair.id)).map(pair => pair.id);
    if (refs.length + newRefs.length > 12 || ids.length + newIds.length > 27) continue;
    refs.push(...newRefs);
    ids.push(...newIds);
    addedSourceRefs += newRefs.length;
    addedIndicatorIds += newIds.length;
  }
  return { output: next, diagnostics: { addedSourceRefs, addedIndicatorIds } };
}
