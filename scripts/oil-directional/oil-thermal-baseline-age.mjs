// Disclosure only. Historical window maturity is not freshness; never change
// established/repeated/elevated gates or automatically promote a baseline here.
const DAY_MS = 86400000;
const PREFIX = '历史基线时效：';
function utcMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return ms;
}

export function baselineAgeDisclosure(lastSampleAt, generatedAt, windowDays) {
  const last = utcMillis(lastSampleAt);
  const generated = utcMillis(generatedAt);
  if (last === null || generated === null || last > generated) {
    return '历史基线截至时间缺失、无效或晚于本轮生成时间,时效无法核验;成熟度不代表近期有效。';
  }
  const days = (generated - last) / DAY_MS;
  const olderThanWindow = typeof windowDays === 'number' && Number.isFinite(windowDays)
    && windowDays > 0 && days > windowDays;
  return `历史基线截至 ${new Date(last).toISOString()},距本轮生成 ${days.toFixed(1)} 天;`
    + (olderThanWindow ? '基线参考较旧(间隔已超过其采样跨度),需复核适用性;' : '')
    + '历史窗口成熟度不代表近期有效,基线不会随每轮观测自动更新。';
}

export function discloseOilThermalBaselineAge(artifact) {
  if (!artifact || typeof artifact !== 'object') return artifact;
  // No query means no new observation; preserve the existing stable shell.
  if (artifact.sourceStatus?.firms === 'not_queried') return artifact;
  const review = artifact.baseline?.sourceReview;
  if (review) {
    const note = baselineAgeDisclosure(review.lastSampleAt, artifact.generatedAt,
      review.effectiveQualityWindowDays ?? review.sampleWindowDays);
    artifact.limitationsZh = [...(artifact.limitationsZh ?? []).filter((text) =>
      !String(text).startsWith(PREFIX)), PREFIX + note];
  }
  for (const facility of artifact.facilities ?? []) {
    const comparison = facility.baselineComparison;
    if (comparison?.status !== 'established') continue;
    const note = baselineAgeDisclosure(comparison.lastSampleAt, artifact.generatedAt, comparison.windowDays);
    const original = String(facility.noteZh ?? '').split(PREFIX)[0].trimEnd();
    facility.noteZh = [original, PREFIX + note].filter(Boolean).join(' ');
  }
  return artifact;
}
