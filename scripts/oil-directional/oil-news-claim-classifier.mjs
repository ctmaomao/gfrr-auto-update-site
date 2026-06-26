export const CLAIM_POLARITY_RULE_VERSION = 'oil-news-claim-polarity-p53';

export const POLARITIES = [
  'risk_escalation',
  'risk_deescalation',
  'mixed_or_contested',
  'market_reaction_only',
  'unclear_or_high_claim'
];

export const EVENT_TYPES = [
  'chokepoint',
  'shipping',
  'sanctions',
  'facility',
  'supply',
  'market_reaction',
  'general_energy'
];

export const SOURCE_TIERS = [
  'primary_wire_or_official',
  'major_financial_media',
  'industry_trade',
  'aggregator_or_blog',
  'low_confidence'
];

export const RISK_ESCALATION_RE = /\b(blockade|closure|closed|shut|shutdown|halt|halts|disrupt|disrupted|disruption|mine|mines|mined|attack|attacks|strike|strikes|blast|explosion|fire|outage|war|sanction|sanctions|embargo|injured|missing|blockaded)\b/iu;
export const RISK_DEESCALATION_RE = /\b(reopen|reopened|reopening|resume|resumes|resumed|restart|restarts|restarted|return|returns|returned|lifted|license|waiver|ceasefire|truce|de-escalat|deescalat|recover|recovered|restore|restored)\b/iu;
export const MARKET_REACTION_RE = /\b(oil|brent|wti|crude|price|prices|futures|spread|spreads|trader|traders|market|risk premium|pre-war|decline|falls|losses|extends|inflation)\b/iu;

const PRIMARY_DOMAINS = new Set([
  'reuters.com',
  'apnews.com',
  'bloomberg.com',
  'eia.gov',
  'treasury.gov',
  'whitehouse.gov',
  'energy.gov',
  'ec.europa.eu',
  'consilium.europa.eu',
  'ofac.treasury.gov'
]);

const MAJOR_FINANCIAL_DOMAINS = new Set([
  'wsj.com',
  'ft.com',
  'cnbc.com',
  'marketwatch.com',
  'businessinsider.com',
  'bbc.com',
  'abcnews.com',
  'nbcnews.com',
  'cfr.org'
]);

const INDUSTRY_TRADE_DOMAINS = new Set([
  'worldoil.com',
  'oilandgas360.com',
  'marinelink.com',
  'maritime-executive.com',
  'oilprice.com',
  'rigzone.com',
  'upstreamonline.com',
  'spglobal.com'
]);

const LOW_CONFIDENCE_DOMAINS = new Set([
  'cryptobriefing.com'
]);

const ESCALATION_TERMS = [
  'blockade', 'closure', 'closed', 'shutdown', 'halt', 'disruption', 'mine',
  'attack', 'strike', 'blast', 'explosion', 'fire', 'outage', 'war',
  'sanction', 'embargo', 'injured', 'missing'
].map((term) => ({ term, re: new RegExp(`\\b${term}\\w*\\b`, 'iu') }));

const DEESCALATION_TERMS = [
  'reopen', 'resume', 'restart', 'return', 'lifted', 'license', 'waiver',
  'ceasefire', 'truce', 'de-escalat', 'deescalat', 'recover', 'restore'
].map((term) => ({ term, re: new RegExp(`\\b${term}\\w*\\b`, 'iu') }));

const MARKET_TERMS = [
  'oil', 'brent', 'wti', 'crude', 'price', 'futures', 'spread', 'trader',
  'market', 'risk premium', 'decline', 'falls', 'losses', 'inflation'
].map((term) => ({ term, re: new RegExp(`\\b${term.replace(' ', '\\s+')}\\w*\\b`, 'iu') }));

export function fillCounts(keys, counts = {}) {
  return Object.fromEntries(keys.map((key) => [key, Number.isFinite(counts[key]) ? counts[key] : 0]));
}

export function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row?.[key] || 'missing';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function termHits(title, regexMap) {
  const text = String(title || '');
  return regexMap.filter(({ re }) => re.test(text)).map(({ term }) => term);
}

export function sourceTier(domain) {
  const normalized = String(domain || '').toLowerCase();
  if (PRIMARY_DOMAINS.has(normalized)) return 'primary_wire_or_official';
  if (MAJOR_FINANCIAL_DOMAINS.has(normalized)) return 'major_financial_media';
  if (INDUSTRY_TRADE_DOMAINS.has(normalized)) return 'industry_trade';
  if (LOW_CONFIDENCE_DOMAINS.has(normalized)) return 'low_confidence';
  if (!normalized || normalized === 'example.com') return 'low_confidence';
  return 'aggregator_or_blog';
}

export function eventType(article) {
  const buckets = Array.isArray(article?.buckets) ? article.buckets : [];
  const title = String(article?.title || '');
  if (/\b(hormuz|suez|red sea|bab el-mandeb|strait|channel)\b/iu.test(title)) {
    return 'chokepoint';
  }
  if (/\b(tanker|shipping|vessel|fleet|transit|insurance|loadings)\b/iu.test(title)) {
    return 'shipping';
  }
  if (/\b(sanction|embargo|ofac|shadow fleet|license|waiver)\b/iu.test(title)) {
    return 'sanctions';
  }
  if (/\b(refinery|terminal|pipeline|plant|facility|explosion|blast|fire|outage)\b/iu.test(title)) {
    return 'facility';
  }
  if (/\b(supply|export|exports|production|disruption|outage)\b/iu.test(title)) {
    return 'supply';
  }
  if (buckets.includes('chokepoint')) return 'chokepoint';
  if (buckets.includes('tanker_shipping')) return 'shipping';
  if (buckets.includes('sanctions')) return 'sanctions';
  if (buckets.includes('supply_disruption')) return 'supply';
  if (buckets.includes('facility_event')) return 'facility';
  if (buckets.includes('market_reaction') || MARKET_REACTION_RE.test(title)) {
    return 'market_reaction';
  }
  return 'general_energy';
}

export function claimPolarity(article) {
  const title = String(article?.title || '');
  const escalation = RISK_ESCALATION_RE.test(title);
  const deescalation = RISK_DEESCALATION_RE.test(title);
  const market = MARKET_REACTION_RE.test(title) || (Array.isArray(article?.buckets) && article.buckets.includes('market_reaction'));
  if (escalation && deescalation) return 'mixed_or_contested';
  if (deescalation) return 'risk_deescalation';
  if (escalation) return 'risk_escalation';
  if (market) return 'market_reaction_only';
  return 'unclear_or_high_claim';
}

export function claimTriggerTerms(article) {
  const title = article?.title;
  return {
    escalation: termHits(title, ESCALATION_TERMS),
    deescalation: termHits(title, DEESCALATION_TERMS),
    market: termHits(title, MARKET_TERMS)
  };
}

export function classifyOilNewsArticle(article) {
  const domain = typeof article?.domain === 'string' ? article.domain : null;
  return {
    domain,
    sourceTier: sourceTier(domain),
    eventType: eventType(article),
    claimPolarity: claimPolarity(article),
    triggerTerms: claimTriggerTerms(article)
  };
}

export function contradictionState(claims) {
  const byEventType = EVENT_TYPES.map((type) => {
    const rows = claims.filter((claim) => claim.eventType === type);
    const escalation = rows.filter((claim) => claim.claimPolarity === 'risk_escalation').length;
    const deescalation = rows.filter((claim) => claim.claimPolarity === 'risk_deescalation').length;
    const mixed = rows.filter((claim) => claim.claimPolarity === 'mixed_or_contested').length;
    return {
      eventType: type,
      claimCount: rows.length,
      riskEscalation: escalation,
      riskDeescalation: deescalation,
      mixedOrContested: mixed,
      contradiction: (escalation > 0 && deescalation > 0) || mixed > 0
    };
  }).filter((row) => row.claimCount > 0);
  const mixedEventTypes = byEventType.filter((row) => row.contradiction);
  if (mixedEventTypes.length > 0) {
    return {
      state: 'mixed_claims',
      eventTypes: mixedEventTypes.map((row) => row.eventType),
      details: byEventType
    };
  }
  const totalEscalation = byEventType.reduce((sum, row) => sum + row.riskEscalation + row.mixedOrContested, 0);
  const totalDeescalation = byEventType.reduce((sum, row) => sum + row.riskDeescalation, 0);
  if (totalEscalation > totalDeescalation && totalEscalation > 0) {
    return { state: 'risk_escalation_dominant', eventTypes: [], details: byEventType };
  }
  if (totalDeescalation > totalEscalation && totalDeescalation > 0) {
    return { state: 'risk_deescalation_dominant', eventTypes: [], details: byEventType };
  }
  return { state: 'no_directional_claim_dominance', eventTypes: [], details: byEventType };
}

export function buildClaimPolarityAggregate(articles) {
  const rows = Array.isArray(articles) ? articles.map(classifyOilNewsArticle) : [];
  return {
    ruleVersion: CLAIM_POLARITY_RULE_VERSION,
    evaluatedArticleCount: Array.isArray(articles) ? articles.length : 0,
    claimCount: rows.length,
    polarityCounts: fillCounts(POLARITIES, countBy(rows, 'claimPolarity')),
    eventTypeCounts: fillCounts(EVENT_TYPES, countBy(rows, 'eventType')),
    sourceTierCounts: fillCounts(SOURCE_TIERS, countBy(rows, 'sourceTier')),
    contradiction: contradictionState(rows),
    displayMode: 'aggregate_only_no_headlines',
    directHeadlineDisplayAllowed: false,
    originalHeadlineDisplayAllowed: false,
    noteZh: '主张方向只基于 compact title 做本地分类聚合;前端只能展示计数与混合状态,不得展示标题原文、URL 或把新闻主张写成确认事件。'
  };
}
