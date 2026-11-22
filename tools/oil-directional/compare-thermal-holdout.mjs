// Offline Stage 2 arithmetic. An independent reviewer must verify source receipts,
// frozen membership, block design and adjudication before supplying this input.
// This schema cannot authenticate provenance or prove unlisted training episodes absent.
// Bootstrap intervals can be degenerate (for example identical clustered outcomes).
const RESAMPLES = 10_000;
function utc(value) {
  const time = typeof value === 'string' && Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error('Expected canonical UTC timestamp');
  return time;
}
function knownBy(value, cutoff, earliest = -Infinity) {
  return value != null && utc(value) <= cutoff && utc(value) >= earliest;
}
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function add(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}
function summarize(clusters, scale) {
  let seed = 20261119;
  function sampleIndex(size) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return Math.floor((seed >>> 0) / 2 ** 32 * size);
  }
  const counts = clusters.map(rows => [rows.filter(([a,b]) => !a && b).length,
    rows.filter(([a,b]) => a && !b).length, rows.length]);
  const [bOnly,aOnly,total] = counts.reduce(([b,a,n],[bb,aa,nn]) => [b+bb,a+aa,n+nn], [0,0,0]);
  const samples = Array.from({length: RESAMPLES}, () => {
    let discordance = 0, denominator = 0;
    for (let i = 0; i < counts.length; i++) {
      const [b,a,n] = counts[sampleIndex(counts.length)];
      discordance += b-a; denominator += n;
    }
    return scale * discordance / denominator;
  }).sort((a,b) => a-b);
  return { bOnly, aOnly, total, estimate: scale * (bOnly-aOnly) / total,
    interval95: [samples[249], samples[9749]] };
}
export function compareThermalHoldout(manifest, evidence) {
  const freeze = utc(manifest.frozenAt), split = utc(manifest.holdoutStart);
  const ascertainment = utc(manifest.ascertainmentCutoff);
  requireThat(freeze <= split, 'Freeze must precede holdout');
  for (const minimum of [manifest.minEventEpisodes,manifest.minNegativeBlocks]) {
    requireThat(Number.isInteger(minimum) && minimum >= 2, 'Invalid cluster minimum');
  }
  requireThat(Array.isArray(manifest.windows) && manifest.windows.length <= 1000 && Array.isArray(evidence)
    && evidence.length <= manifest.windows.length, 'Invalid cohort size');
  const eligibleIds = new Set(), evidenceById = new Map(), events = new Map(), negatives = new Map();
  const blockers = new Set(), pairedEvents = new Map(), pairedNegatives = new Map(), episodePlanning = new Map();
  let previousEnd = split;
  const emptyCoverage = () => ({pairedObservableWindows:0,fallbackWindows:0,missingTruthWindows:0,
    missingAsOfWindows:0,adjudicatedOutOfScopeWindows:0});
  const coverage = emptyCoverage();
  const byStratum = Object.fromEntries(['planned','unplanned','indeterminate','event_free','out_of_scope','unknown']
    .map(key => [key,emptyCoverage()]));
  function count(key, field) { coverage[field]++; byStratum[key][field]++; }
  const nonblank = value => typeof value === 'string' && value.trim().length > 0;
  // Identity keys must already be canonical; never rewrite sealed identifiers.
  const canonicalId = value => typeof value === 'string' && value.length > 0 && value === value.trim();
  requireThat(Array.isArray(manifest.trainingEpisodeIds) && manifest.trainingEpisodeIds.length <= 1000
    && manifest.trainingEpisodeIds.every(canonicalId), 'Expected sealed training episode list');
  const trainingEpisodes = new Set(manifest.trainingEpisodeIds);
  for (const window of manifest.windows) {
    const start = utc(window.start), end = utc(window.end);
    requireThat(start >= previousEnd && end > start, 'Unsorted or overlapping holdout windows');
    previousEnd = end;
    requireThat(canonicalId(window.id) && !eligibleIds.has(window.id), 'Duplicate or invalid sealed window');
    eligibleIds.add(window.id);
  }
  for (const row of evidence) {
    requireThat(eligibleIds.has(row.windowId) && !evidenceById.has(row.windowId), 'Duplicate or unsealed evidence');
    evidenceById.set(row.windowId,row);
  }
  const episodeIds = new Set(), closedBlocks = new Set();
  let activeBlock = null;
  for (const window of manifest.windows) {
    const row = evidenceById.get(window.id);
    const cutoff = utc(window.cutoff), start = utc(window.start);
    requireThat(cutoff >= start && cutoff <= utc(window.end)
      && utc(window.end) <= ascertainment, 'Invalid decision or ascertainment cutoff');
    const block = window.negativeBlockId;
    requireThat(canonicalId(block), 'Missing sealed time block');
    if (block !== activeBlock) {
      requireThat(!closedBlocks.has(block), 'Overlapping negative blocks');
      if (activeBlock !== null) closedBlocks.add(activeBlock);
      activeBlock = block;
    }
    if (!row || !['event','event_free','out_of_scope'].includes(row.truth)
      || row.truthReceipt?.independent !== true || !nonblank(row.truthReceipt.reference)
      || !knownBy(row.truthReceipt.knownAt, ascertainment)
      || utc(row.truthReceipt.knownAt) < utc(window.end)) {
      count('unknown','missingTruthWindows');
      blockers.add('unresolved_independent_truth'); continue;
    }
    if (row.truth === 'out_of_scope') { count('out_of_scope','adjudicatedOutOfScopeWindows'); continue; }
    const stratum = row.truth === 'event' ? row.planning : 'event_free';
    if (row.truth === 'event') {
      requireThat(canonicalId(row.episodeId), 'Missing adjudicated event episode');
      requireThat(['planned','unplanned','indeterminate'].includes(stratum), 'Missing valid planning stratum');
      requireThat(!episodePlanning.has(row.episodeId) || episodePlanning.get(row.episodeId) === stratum,
        'Conflicting episode planning strata');
      episodePlanning.set(row.episodeId,stratum);
      episodeIds.add(row.episodeId);
    } else if (row.episodeId !== null) {
      requireThat(canonicalId(row.episodeId), 'Control needs explicit null or canonical episode identifier');
      count(stratum,'missingTruthWindows');
      blockers.add('episode_linked_control');
      continue;
    }
    if (!row.a || typeof row.a.alert !== 'boolean' || !knownBy(row.a.knownAt, cutoff, start)
      || !row.thermal || !['available','unavailable'].includes(row.thermal.status)
      || !knownBy(row.thermal.knownAt, cutoff, start)) {
      count(stratum,'missingAsOfWindows'); blockers.add('unresolved_as_of_receipt'); continue;
    }
    let augmented = row.a.alert;
    if (row.thermal.status === 'unavailable') count(stratum,'fallbackWindows');
    else if (row.b && typeof row.b.alert === 'boolean' && knownBy(row.b.knownAt, cutoff)
      && utc(row.b.knownAt) >= Math.max(utc(row.a.knownAt), utc(row.thermal.knownAt))) augmented = row.b.alert;
    else { count(stratum,'missingAsOfWindows'); blockers.add('unresolved_as_of_receipt'); continue; }
    const pair = [row.a.alert, augmented];
    if (row.truth === 'event') add(events, row.episodeId, pair);
    else add(negatives, block, pair);
    if (row.thermal.status === 'available') {
      count(stratum,'pairedObservableWindows');
      if (row.truth === 'event') add(pairedEvents,row.episodeId,pair);
      else add(pairedNegatives,block,pair);
    }
  }
  if ([...episodeIds].some(id => trainingEpisodes.has(id))) blockers.add('training_episode_overlap');
  if (events.size < manifest.minEventEpisodes) blockers.add('insufficient_event_episodes');
  if (negatives.size < manifest.minNegativeBlocks) blockers.add('insufficient_negative_blocks');
  const result = {status:'inconclusive', blockers:[...blockers], sealedWindows:manifest.windows.length,
    eventEpisodes:events.size, negativeBlocks:negatives.size, coverage, byStratum, gain:null, harm:null, eligibleForProduction:false,
    pairedObservable:{eventEpisodes:pairedEvents.size,negativeBlocks:pairedNegatives.size,gain:null,harm:null}};
  if (blockers.size) return result;
  const eventClusters = group => [...group.values()].map(rows => [[rows.some(([a]) => a),rows.some(([,b]) => b)]]);
  result.gain = summarize(eventClusters(events), 1);
  // Descriptive subset only: the conditional denominator is not the primary estimand.
  if (pairedEvents.size >= manifest.minEventEpisodes) result.pairedObservable.gain = summarize(eventClusters(pairedEvents), 1);
  if (pairedNegatives.size >= manifest.minNegativeBlocks) result.pairedObservable.harm = summarize([...pairedNegatives.values()], 100);
  result.harm = summarize([...negatives.values()], 100);
  const {minimumGain,maximumHarm} = manifest;
  if (Number.isFinite(minimumGain) && Number.isFinite(maximumHarm)) {
    if (result.gain.interval95[0] > minimumGain && result.harm.interval95[1] < maximumHarm) result.status = 'clears_frozen_margins';
    else if (result.gain.interval95[1] < minimumGain || result.harm.interval95[0] > maximumHarm) result.status = 'fails_frozen_margins';
  } else result.status = 'descriptive_only';
  return result;
}
