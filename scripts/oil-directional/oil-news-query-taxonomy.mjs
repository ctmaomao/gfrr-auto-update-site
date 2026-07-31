export const WEB_NGRAMS_QUERY_SET_VERSION = 'odp-oil-news-web-ngrams-taxonomy-v1';

export const WEB_NGRAMS_TERM_SET = Object.freeze([
  {
    id: 'hormuz',
    labelZh: '霍尔木兹',
    patterns: ['hormuz', 'strait of hormuz'],
    buckets: ['chokepoint', 'middle_east_risk']
  },
  {
    id: 'red_sea',
    labelZh: '红海',
    patterns: ['red sea', 'bab el-mandeb', 'bab el mandeb'],
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    id: 'tanker',
    labelZh: '油轮/航运',
    patterns: ['tanker', 'vlcc', 'shipping insurance'],
    buckets: ['tanker_shipping']
  },
  {
    id: 'crude_oil',
    labelZh: '原油',
    patterns: ['crude oil', 'oil prices', 'brent crude', 'wti crude'],
    buckets: ['market_reaction']
  },
  {
    id: 'sanctions',
    labelZh: '制裁',
    patterns: ['oil sanctions', 'shadow fleet', 'price cap'],
    buckets: ['sanctions', 'tanker_shipping']
  },
  {
    id: 'supply_disruption',
    labelZh: '供应中断',
    patterns: ['oil outage', 'pipeline outage', 'export halt', 'supply disruption'],
    buckets: ['supply_disruption']
  },
  {
    id: 'facility_event',
    labelZh: '设施事件',
    patterns: ['refinery fire', 'refinery outage', 'terminal shutdown'],
    buckets: ['facility_event', 'supply_disruption']
  }
]);

export function matchWebNgramsTerms(text, termSet = WEB_NGRAMS_TERM_SET) {
  const normalized = String(text || '').normalize('NFKC').toLocaleLowerCase('en-US');
  return termSet
    .map((term) => ({
      term,
      matchedPattern: term.patterns.find((pattern) => normalized.includes(pattern)) || null
    }))
    .filter((match) => match.matchedPattern);
}
