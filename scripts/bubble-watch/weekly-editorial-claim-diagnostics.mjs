// Inspect only public, validated news metadata. Never retain provider prose or raw excerpts.
import { claimNumericSupport, claimEvidenceTexts } from './weekly-editorial-numeric-grounding.mjs';
const ALIASES = Object.freeze({
  'The Wall Street Journal': '(?:WSJ|华尔街日报)',
  'Financial Times': '(?:FT|金融时报)',
  Morningstar: '晨星',
  Reuters: '路透社',
  Bloomberg: '彭博社'
});
const attributionVerb = /据|报道|认为|分析|指出|研判/u;
const numericTokens = text => [...new Set(String(text).match(/\d+(?:[.,]\d+)*(?:%|％)?/gu) || [])];
function numberFacts(text) {
  return [...String(text).matchAll(/\d+(?:[.,]\d+)*(?:%|％)?/gu)].slice(0, 8).map(match => {
    const after = text.slice(match.index + match[0].length).trimStart();
    // Whitelisted units only, no surrounding provider prose; this is diagnostic, never an equivalence approval.
    const unit = /^(?:万亿美元|万亿元|亿美元|百万美元|亿元|billion|million|trillion|%|％)/iu.exec(after)?.[0] || null;
    const dollarSign = /\$\s*$/u.test(text.slice(Math.max(0, match.index - 4), match.index));
    return { number: match[0].slice(0, 32), unit: /[%％]$/u.test(match[0]) ? 'percent' : unit, dollarSign };
  });
}
const rows = output => ['weeklyTimeline', 'keyTensions', 'categoryAnalysis'].flatMap(field =>
  (Array.isArray(output?.[field]) ? output[field] : []).map((claim, index) => ({ claim, path: `${field}[${index}]` }))
).concat(output?.historicalComparison && typeof output.historicalComparison === 'object'
  ? [{ claim: output.historicalComparison, path: 'historicalComparison' }] : []);
const textOf = claim => [claim?.titleZh, claim?.detailZh].filter(value => typeof value === 'string').join(' ');

export function normalizeMediaClaimNames(output, input) {
  const next = structuredClone(output);
  const stories = new Map((input?.newsContext?.stories || []).map(story => [story.id, story]));
  for (const { claim } of rows(next)) {
    for (const id of Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : []) {
      const story = stories.get(id);
      const aliases = story?.evidenceStatus === 'attributed_media' && ALIASES[story.sourceName];
      if (!aliases) continue;
      // Only explicit attribution phrases for an already cited publisher; never add a ref/name to an uncredited claim.
      const before = new RegExp(`(根据|据)《?${aliases}》?(?![A-Za-z])`, 'gu');
      const after = new RegExp(`(?<![A-Za-z])《?${aliases}》?(?=报道|认为|分析|指出|研判)`, 'gu');
      for (const field of ['titleZh', 'detailZh']) {
        if (typeof claim?.[field] === 'string') claim[field] = claim[field].split(/(“[^”]*”|「[^」]*」|"[^"]*")/gu)
          .map((part, index) => index % 2 ? part : part
            .replace(before, (_match, verb) => `${verb}${story.sourceName}`)
            .replace(after, story.sourceName)).join('');
      }
    }
  }
  return next;
}

export function diagnoseMediaClaims(output, input, { secret = '' } = {}) {
  const stories = new Map((input?.newsContext?.stories || []).map(story => [story.id, story]));
  const failures = [];
  for (const [claimIndex, { claim, path }] of rows(output).entries()) {
    // Remove the injected credential before extracting even numeric tokens from a malicious response.
    const text = secret ? textOf(claim).replaceAll(secret, '') : textOf(claim);
    const sources = [];
    for (const id of Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : []) {
      const story = stories.get(id);
      if (story?.evidenceStatus !== 'attributed_media') continue;
      const rawEvidence = `${story.title} ${story.snippet}`;
      const evidence = secret ? rawEvidence.replaceAll(secret, '') : rawEvidence;
      const safeClaim = { ...claim, titleZh: text, detailZh: '' };
      const safeInput = { ...input, structuredFacts: (input.structuredFacts || []).map(fact => ({ ...fact, factZh: secret ? fact.factZh?.replaceAll(secret, '') : fact.factZh })), newsContext: { ...input.newsContext, stories: input.newsContext.stories.map(row => ({ ...row, title: secret ? row.title?.replaceAll(secret, '') : row.title, snippet: secret ? row.snippet?.replaceAll(secret, '') : row.snippet })) } };
      const unsupported = typeof story.snippet === 'string' ? [...new Set(claimNumericSupport(safeClaim, safeInput).unsupported.map(atom => atom.number))] : [];
      const unsupportedQuoteCount = [...text.matchAll(/[“「]([^”」]+)[”」]/gu)].filter(match => !claimEvidenceTexts(safeClaim, safeInput).some(evidenceText => evidenceText.includes(match[1]))).length;
      const namePresent = text.includes(story.sourceName);
      const verbPresent = attributionVerb.test(text);
      if (namePresent && verbPresent && unsupported.length === 0 && unsupportedQuoteCount === 0) continue;
      sources.push({
        sourceRefId: story.id, sourceName: story.sourceName,
        sourceNamePresent: namePresent, attributionVerbPresent: verbPresent,
        unsupportedNumberCount: unsupported.length,
        unsupportedNumbers: unsupported.slice(0, 8).map(number => number.slice(0, 32)),
        unsupportedQuoteCount,
        claimNumberFacts: numberFacts(text),
        evidenceNumberCount: numericTokens(evidence).length,
        evidenceNumbers: numericTokens(evidence).slice(0, 8).map(number => number.slice(0, 32)),
        evidenceNumberFacts: numberFacts(evidence)
      });
    }
    if (sources.length) failures.push({ claimIndex, claimPath: path, mediaSourceFailureCount: sources.length, sources: sources.slice(0, 4) });
  }
  return { failedClaimCount: failures.length, claims: failures.slice(0, 12) };
}
