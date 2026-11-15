import { isUsableNews } from './editorial-evidence-policy.mjs';

// Use the day carried by the supplied publication timestamp, never retrieval
// time. The collector may already normalize it to UTC; this gate neither
// recovers publisher-local dates nor infers event dates.
export function publicationDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$)/u.test(value)) return null;
  const day = value.slice(0, 10);
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) return null;
  return day;
}

export function validateTimelineDateBindings(timeline, input) {
  const errors = [];
  const array = value => Array.isArray(value) ? value : [];
  const stories = new Map(array(input?.newsContext?.stories).map(story => [story?.id, story]));
  const facts = array(input?.structuredFacts);
  const sources = new Map(array(input?.sourceRefs).map(source => [source?.id, source]));
  for (const [index, claim] of timeline.entries()) {
    const label = `output weeklyTimeline[${index}]`;
    const date = publicationDay(claim?.date);
    if (!date || date !== claim.date) errors.push(`${label} requires a real calendar date`);
    const refs = Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : [];
    const citedNews = refs.filter(id => stories.has(id)).map(id => stories.get(id));
    if (citedNews.length) {
      const matching = citedNews.filter(story => isUsableNews(story) && publicationDay(story.publishedAt) === date && date !== null);
      if (!matching.length) errors.push(`${label} date must match a cited usable news publication day, never a fetch or inferred event date`);
      for (const story of citedNews) {
        const source = sources.get(story.id);
        if (!source || source.kind !== 'news' || source.publishedAt !== story.publishedAt || source.url !== story.url || source.sourceClass !== story.evidenceStatus) errors.push(`${label} cited news source metadata must match the supplied story`);
      }
      if (typeof claim?.titleZh !== 'string' || !/报道|披露|发布/u.test(claim.titleZh)) errors.push(`${label} titleZh must frame news as reporting, disclosure or publication`);
      // Bounded visible forms bind the leading date to reporting/publication.
      // A generic '据报道' elsewhere in a paragraph cannot establish this basis.
      // Reporting attribution does not verify that the described event occurred
      // on that day. Reject bounded same-day assertions; this is not general NLP.
      const prose = `${claim?.titleZh || ''} ${claim?.detailZh || ''}`;
      if (/(?:当日|当天|同日|今日|当晚|当天晚间)[^，。；：]{0,16}(?:成立|创办|创立|完成|获得|融资|签署|收购|达成|推出|发生|宣布)/u.test(prose)) errors.push(`${label} must not turn a publication date into an unsupported same-day event assertion`);
      const prefixes = matching.flatMap(story => [
        `${date} 据媒体报道，`,
        ...(story.sourceName ? [`${date} 据${story.sourceName}报道，`] : []),
        ...(story.evidenceStatus === 'official' ? [`${date} 据官方发布，`] : [])
      ]);
      if (!prefixes.some(prefix => typeof claim?.detailZh === 'string' && claim.detailZh.startsWith(prefix))) errors.push(`${label} detailZh must explicitly start with its publication date and reporting attribution`);
    } else {
      const supported = facts.some(fact => {
        const id = `indicator:${fact?.indicatorId}`;
        const source = sources.get(id);
        return publicationDay(fact?.asOfDate) === date && date !== null
          && array(claim?.sourceIndicatorIds).includes(fact?.indicatorId)
          && array(fact?.sourceRefIds).includes(id) && refs.includes(id)
          && source?.kind === 'indicator' && array(source.indicatorIds).includes(fact?.indicatorId)
          && publicationDay(source.asOfDate) === date;
      });
      if (!supported) errors.push(`${label} structured-only date must bind a cited structured fact observation date`);
      if (typeof claim?.detailZh !== 'string' || ![`${date} 的站内观测：`, `${date} 站内观测显示，`].some(prefix => claim.detailZh.startsWith(prefix))) errors.push(`${label} structured-only detailZh must explicitly identify the observation date`);
      if (typeof claim?.titleZh !== 'string' || !/观测|快照/u.test(claim.titleZh)) errors.push(`${label} structured-only titleZh must identify an observation or snapshot`);
    }
  }
  return errors;
}
