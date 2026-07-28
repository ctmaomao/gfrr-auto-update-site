const CORE_COMPANY_RE = /\b(NVIDIA|NVDA|Super Micro|SMCI|CoreWeave|Oracle|Broadcom|OpenAI|Anthropic|Databricks|Cerebras|Microsoft|Meta|Alphabet|Google|Amazon|AWS)\b/giu;
const CONSUMER_SERVICE_MENTION_RE = /\b(?:Google (?:Drive|Docs|Photos|Maps|Play|account)|Amazon (?:account|Marketplace)|Microsoft (?:account|Teams|Windows))\b/giu;
const ACCOUNTING_MISCONDUCT_RE = /\b(?:accounting|round[-\s]?tripping|misstatement|financial (?:reporting|statement|disclosure)s?|books? and records|revenue recognition|earnings manipulation|audit(?:or|ing)?|securities fraud|investor fraud)\b/iu;
const FORMAL_ENFORCEMENT_RE = /\b(?:charged?|charges|indict(?:ed|ment)|settled?|settlement|enforcement|investigat(?:e|ed|es|ing|ion)|complaint|convict(?:ed|ion)|pleaded guilty|lawsuit|action)\b/iu;
const EVENT_CONTEXT_RADIUS = 240;

function normalizeEventText(link) {
  return `${link?.title || ''}. ${link?.context || ''} ${link?.date || ''}`
    .replace(CONSUMER_SERVICE_MENTION_RE, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function isCoreAiAccountingEnforcementEvent(link) {
  const text = normalizeEventText(link);
  for (const match of text.matchAll(CORE_COMPANY_RE)) {
    const start = Math.max(0, match.index - EVENT_CONTEXT_RADIUS);
    const end = Math.min(text.length, match.index + match[0].length + EVENT_CONTEXT_RADIUS);
    const contextWindow = text.slice(start, end);
    if (ACCOUNTING_MISCONDUCT_RE.test(contextWindow) && FORMAL_ENFORCEMENT_RE.test(contextWindow)) {
      return true;
    }
  }
  return false;
}
