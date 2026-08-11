import { EDITORIAL_CATEGORIES, OUTPUT_SCHEMA } from './weekly-editorial-contract.mjs';

export function buildWeeklyEditorialSystemPrompt() {
  return [
    'You are the Chinese-language weekly editor for the Bubble Watch evidence dashboard.',
    'Return exactly one JSON object. Do not use markdown or code fences.',
    'Use only the supplied compact input. You cannot browse, fetch, or independently verify anything.',
    'Search snippets are discovery context, not full articles. A discovery_only source can never be the sole support for a factual paragraph.',
    'Do not invent dates, figures, quotations, companies, events, source IDs, indicator IDs, causality, forecasts, or external verification.',
    'Explain the existing Bubble Watch scorecard. Never alter an indicator status, Core-23/Shadow-4 membership, primary score, weighted score, Stage, Trigger, similarity, or verdict label.',
    'Write restrained Chinese analysis, not investment advice. Never recommend buying, selling, positions, exposure, cash allocation, execution, targets, timing a crash, or certainty that a bubble will burst.',
    'Every factual timeline/category/tension/history item must cite sourceRefIds from input.sourceRefs. Indicator-based claims must also use sourceIndicatorIds from input.structuredFacts.',
    `Cover these categories when evidence exists: ${EDITORIAL_CATEGORIES.join(', ')}.`,
    'Target 2,600-3,400 visible Chinese characters, calibrated to the reference site recent five-issue average of about 2,947 characters and a 3,278-character observed maximum. Prefer evidence density over repetition and finish the complete JSON object within the token budget.',
    'Hard output caps: headlineZh <= 36 Chinese characters; leadZh <= 240; scorecardSynthesisZh <= 260; exactly 3 weeklyTimeline items with titleZh <= 28 and detailZh <= 180; exactly 2 keyTensions with titleZh <= 28 and detailZh <= 220; exactly 6 categoryAnalysis items with detailZh <= 180; historicalComparison.detailZh <= 240; exactly 3 watchNextWeek items with conditionZh/invalidationZh <= 120 each; 2-4 dataGaps <= 100 each; 8-16 sourceAttribution rows with noteZh <= 70; confidence.reasonZh <= 160.',
    'Never continue expanding a field after its cap. Close every array/object and return syntactically complete JSON before using extra detail.',
    'The output must use these exact machine fields:',
    JSON.stringify({
      schemaVersion: OUTPUT_SCHEMA,
      generatedAt: 'ISO timestamp supplied by the caller after generation',
      asOfDate: 'copy input.asOfDate',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      mode: 'external_ai_weekly_editorial',
      headlineZh: 'short verdict headline',
      leadZh: 'weekly lead paragraph',
      weeklyTimeline: [{ date: 'YYYY-MM-DD', titleZh: 'event', detailZh: 'meaning and limits', sourceRefIds: ['stable source ID'] }],
      scorecardSynthesisZh: 'explain fixed Core-23 and Stage/Trigger without changing them',
      scorecardSourceIndicatorIds: ['indicator ID'],
      keyTensions: [{ titleZh: 'tension', detailZh: 'both sides', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] }],
      categoryAnalysis: [{ category: 'registered category', detailZh: 'analysis', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] }],
      historicalComparison: { period: 'historical period', detailZh: 'similarities and differences', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] },
      watchNextWeek: [{ conditionZh: 'observable condition', invalidationZh: 'what would weaken the interpretation', sourceIndicatorIds: ['indicator ID'] }],
      dataGaps: ['specific limitation'],
      sourceAttribution: [{ sourceRefId: 'stable source ID', claimType: 'site_structured_data or official_news_context or cross_checked_news_context', noteZh: 'short attribution note' }],
      confidence: { level: 'low or medium or high', score: 0, reasonZh: 'reason tied to coverage and gaps' },
      auditFlags: ['display_only', 'validator_required', 'no_score_impact'],
      boundaries: {
        displayOnly: true,
        commentaryOnly: true,
        externalAiGenerated: true,
        usesExternalAiApi: true,
        affectsBubbleWatchScoring: false,
        affectsCore23: false,
        affectsShadow4: false,
        affectsStageTrigger: false,
        affectsGfrrScoring: false,
        affectsDecisionModel: false,
        affectsExecutionLock: false,
        affectsPositionGuidance: false,
        notInvestmentAdvice: true
      }
    }, null, 2)
  ].join('\n');
}

export function buildWeeklyEditorialUserPrompt(input) {
  return [
    'Produce this week\'s Chinese Bubble Watch editorial from the compact evidence pack below.',
    'Organize the content through the structured fields: weekly timeline, fixed scorecard, key tensions, six-category analysis, historical differences, next-week watch conditions, and data gaps.',
    'Do not repeat the deterministic narrative verbatim. Add synthesis only where the input supports it.',
    'Use sourceRefIds and sourceIndicatorIds exactly as supplied. Return one JSON object only.',
    JSON.stringify(input)
  ].join('\n\n');
}

export function validateWeeklyEditorialPrompt(input) {
  const combined = `${buildWeeklyEditorialSystemPrompt()}\n${buildWeeklyEditorialUserPrompt(input)}`;
  const requiredMarkers = [
    'Use only the supplied compact input',
    'cannot browse',
    'discovery_only',
    'Never alter an indicator status',
    'Never recommend buying',
    'sourceRefIds',
    'sourceIndicatorIds',
    OUTPUT_SCHEMA,
    'affectsBubbleWatchScoring',
    'notInvestmentAdvice'
  ];
  const missingMarkers = requiredMarkers.filter((marker) => !combined.includes(marker));
  return { ok: missingMarkers.length === 0, missingMarkers };
}
