import { isUsableNews, isLimitedEvidence } from './editorial-evidence-policy.mjs';
import { EDITORIAL_CATEGORIES, OUTPUT_SCHEMA } from './weekly-editorial-contract.mjs';

export function buildWeeklyEditorialSystemPrompt(input) {
  const limited = Boolean(input) && isLimitedEvidence(input);
  return [
    'You are the Chinese-language weekly editor for the Bubble Watch evidence dashboard.',
    'Return exactly one JSON object. Do not use markdown or code fences.',
    'Use only the supplied compact input. You cannot browse, fetch, or independently verify anything.',
    'Search snippets are discovery context, not full articles. A discovery_only source can never be the sole support for a factual paragraph.',
    'attributed_media permits a single reviewed publisher excerpt: cite the correct structured source IDs; repeating the publisher name or a fixed attribution verb in every paragraph is optional. Preserve opinions and uncertainty; disclose media-excerpt limitations in dataGaps. Do not add unsupported financial numbers, verbatim quotations or unseen article details. Terminology quotes such as “七巨头” are not verbatim quotations; prefer clear unquoted paraphrases. title_only items cannot support factual paragraphs.',
    'Financial amounts and rates must be supported by approved news actually cited in that item, or by a structuredFact whose indicatorId AND matching indicator:* sourceRefId are both cited in that same item. Mixed media and site analysis is allowed; distinguish reported facts from site indicators. Exact equivalent units are allowed (USD 50 billion = 500亿美元; 50 basis points = 0.5%; end of September = 9月底). Preserve currency, sign and percentage meaning; do not round, infer FX, invent a date, use unrelated evidence, or borrow numbers from discovery_only. Put site numbers in scorecardSynthesisZh or a separate indicator-only item when a mixed claim lacks matching indicator refs. Use Arabic digits for financial amounts and percentages. Never spell unsupported numbers in Chinese to evade checks.',
    'Do not invent dates, figures, quotations, companies, events, source IDs, indicator IDs, causality, forecasts, or external verification.',
    'Explain the existing Bubble Watch scorecard. Never alter an indicator status, Core-23/Shadow-4 membership, primary score, weighted score, Stage, Trigger, similarity, or verdict label.',
    'Write restrained Chinese analysis, not investment advice. Never recommend buying, selling, positions, exposure, cash allocation, execution, targets, timing a crash, or certainty that a bubble will burst.',
    'Every factual timeline/category/tension/history item must cite sourceRefIds from input.sourceRefs. Indicator-based claims must also use sourceIndicatorIds from input.structuredFacts.',
    `Cover these categories when evidence exists: ${EDITORIAL_CATEGORIES.join(', ')}.`,
    limited ? 'Target 600-1,800 visible Chinese characters for limited evidence. Omit unsupported sections, disclose news coverage, and do not pad to a long-form target.' : 'Target 2,600-3,400 visible Chinese characters, calibrated to the reference site recent five-issue average of about 2,947 characters and a 3,278-character observed maximum. Prefer evidence density over repetition and finish the complete JSON object within the token budget.',
    'Writing guidance, not admission quotas: use only supported timeline items and categories; no exact item counts, minimum indicator count or per-paragraph character quotas. Keep details concise, omit unsupported sections and never pad to a target.',
    'Length accounting includes ALL string values inside headlineZh, leadZh, weeklyTimeline, scorecardSynthesisZh, keyTensions, categoryAnalysis, historicalComparison, watchNextWeek, dataGaps and confidence, joined with newlines: dates, category names, sourceRefIds, sourceIndicatorIds and confidence.level count too. Stay within the target after allowing for these IDs; the validator maximum is 6,500, never a writing target. Cite only sources actually supporting each item; do not repeat the whole source inventory in every paragraph.',
    'sourceAttribution is not part of the visible-character target. Include exactly one sourceAttribution row for every unique sourceRefId used anywhere in the output, up to the contract maximum of 80 rows; do not omit referenced indicator:* sources to meet a shorter attribution count.',
    'Avoid unnecessary expansion. Close every array/object and return syntactically complete JSON before using extra detail.',
    'For qualified v3 evidence: copy input.scoringSnapshot.scorecardDisclosureZh EXACTLY into scorecardSynthesisZh; analysis belongs in the other supported sections. null is unknown, never zero or green. Preserve the supplied fixed-Core-23 lower/upper ranges and named evidence gaps. Ranges are mathematical bounds, not probabilities. Never select one endpoint as a point score, infer missing lights, or compare different model revisions as a weekly improvement. A guaranteed verdict does not remove missing evidence.',
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
      weeklyTimeline: [{ date: 'YYYY-MM-DD', titleZh: 'event', detailZh: 'meaning and limits', sourceRefIds: ['stable source ID'], sourceIndicatorIds: ['indicator ID when citing site facts; otherwise empty array'] }],
      scorecardSynthesisZh: 'explain fixed Core-23 and Stage/Trigger without changing them',
      scorecardSourceIndicatorIds: ['indicator ID'],
      keyTensions: [{ titleZh: 'tension', detailZh: 'both sides', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] }],
      categoryAnalysis: [{ category: 'registered category', detailZh: 'analysis', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] }],
      historicalComparison: { period: 'historical period', detailZh: 'similarities and differences', sourceIndicatorIds: ['indicator ID'], sourceRefIds: ['stable source ID'] },
      watchNextWeek: [{ conditionZh: 'observable condition', invalidationZh: 'what would weaken the interpretation', sourceIndicatorIds: ['indicator ID'] }],
      dataGaps: ['specific limitation'],
      sourceAttribution: [{ sourceRefId: 'stable source ID', claimType: 'site_structured_data, official_news_context, cross_checked_news_context, attributed_media_news_context, or discovery_only_news_context', noteZh: 'short attribution note' }],
      confidence: { level: 'low or medium or high', score: 'integer 0-100, never a 0-1 probability', reasonZh: 'reason tied to coverage and gaps' },
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
  const credibleStories = (input?.newsContext?.stories || []).filter((story) => isUsableNews(story));
  const coverageConstraint = credibleStories.length <= 1
    ? `Only ${credibleStories.length} usable official/cross_checked/attributed_media news story is available${credibleStories.length === 1 ? ` (${credibleStories[0].id})` : ''}. In weeklyTimeline, use at most ${credibleStories.length} news story as a primary factual event. Build the remaining timeline items from structuredFacts, previousComparison, and deterministic scorecard changes; cite matching indicator:* sourceRefIds and sourceIndicatorIds. Never use discovery_only news as sole support.`
    : 'Prefer official/cross_checked news for timeline events. If a discovery_only item is mentioned, corroborate it with matching structuredFacts plus indicator:* sourceRefIds and sourceIndicatorIds.';
  return [
    'Produce this week\'s Chinese Bubble Watch editorial from the compact evidence pack below.',
    'Organize the content through the structured fields: weekly timeline, fixed scorecard, key tensions, six-category analysis, historical differences, next-week watch conditions, and data gaps.',
    'Do not repeat the deterministic narrative verbatim. Add synthesis only where the input supports it.',
    coverageConstraint,
    isLimitedEvidence(input) ? 'Limited evidence: write a concise 600-1,800 character editorial; this overrides the normal length target and exact item counts. Include only supported timeline items, tensions and categories. Omit unsupported sections, disclose news coverage in dataGaps, confidence must be low/medium with score <=70. Cite the indicators actually used and include an observable watch condition. Do not pad.' : 'Use full coverage only where evidence supports it; omit unsupported news details.',
    'Use sourceRefIds and sourceIndicatorIds exactly as supplied. Return one JSON object only.',
    JSON.stringify(input),
    'Final preflight before returning JSON: keep the editorial concise and within the total 6,500-character safety maximum. Ground financial amounts and rates in this item’s cited approved news or explicitly paired indicator ID/source ref. Exact unit equivalents are allowed, unsupported rounding and currency swaps are not. Keep only claim-specific references. Count reference IDs and dates in the total length target. Complete the JSON; do not fill space or add unsupported detail.'
  ].join('\n\n');
}

export function validateWeeklyEditorialPrompt(input) {
  const combined = `${buildWeeklyEditorialSystemPrompt(input)}\n${buildWeeklyEditorialUserPrompt(input)}`;
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
