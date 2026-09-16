import { readFileSync } from 'node:fs';

const SAMPLE_WEEKLY_EDITORIAL_OUTPUT = JSON.parse(readFileSync('docs/fixtures/bubble-watch-weekly-editorial/sample-output-v1.json', 'utf8'));

export function buildApprovedBubbleWeeklyEditorial(data, currentTimestamp) {
  const output = {
    ...SAMPLE_WEEKLY_EDITORIAL_OUTPUT,
    generatedAt: currentTimestamp,
    asOfDate: data.as_of_date,
  };
  return {
    schemaVersion: 'bubble-watch-weekly-editorial-production-v1',
    status: 'valid',
    displayEnabled: true,
    generatedAt: currentTimestamp,
    updatedAt: currentTimestamp,
    asOfDate: data.as_of_date,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    mode: 'external_ai_weekly_editorial',
    sourceMode: 'weekly_news_and_site_structured_compact_v1',
    output,
    sourceLedger: [
      { id: 'indicator:cape', kind: 'indicator', sourceName: 'Bubble Watch CAPE', sourceClass: 'site_structured' },
      { id: 'news:earnings-sample', kind: 'news', sourceName: 'Issuer', sourceClass: 'official', title: 'Fixture issuer earnings', url: 'https://issuer.example/earnings-sample', domain: 'issuer.example' },
      { id: 'news:financing-sample', kind: 'news', sourceName: 'News A', sourceClass: 'cross_checked', title: 'Fixture financing context', url: 'https://news-a.example/ai-financing-sample', domain: 'news-a.example' },
    ],
    validation: { status: 'pass' },
    qualityReview: {
      status: 'pass',
      promotionEligible: false,
      warnings: ['only one official/cross_checked news reference was used; remaining factual claims require site-indicator corroboration'],
    },
    provenance: { humanApproved: false },
    freshness: { artifactGeneratedAt: currentTimestamp, sourceAsOfDate: data.as_of_date, maxAgeHours: 240, isStale: false },
    boundaries: {
      displayOnly: true,
      frontendDisplayApproved: true,
      affectsBubbleWatchScoring: false,
      affectsCore23: false,
      affectsShadow4: false,
      affectsStageTrigger: false,
      affectsGfrrScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
    },
  };
}
