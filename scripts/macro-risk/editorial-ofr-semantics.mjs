// ADR-0107: bounded wording checks, not a general factual/causal verifier.
// Comparisons use the validated original snapshot, never a model-written label.
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function ofrBaselineMeaning(value) {
  if (!finite(value)) return '当前原值缺失，不能判断其相对 OFR 校准历史均值的位置。';
  return `原值${value < 0 ? '低于' : value > 0 ? '高于' : '等于'} OFR 校准历史均值；该均值基准不是本站严格过去十年样本的中位数，原值正负不能推出该样本中的高低位置或宽松状态。`;
}
export function ofrPercentileMeaning(value) {
  if (!finite(value)) return '严格过去十年样本的相对位置不可用，不能从原值正负推断。';
  return `当前读数在严格过去十年样本中的排序${value < 50 ? '低于' : value > 50 ? '高于' : '位于'}中位位置；这是样本排序比较，不是宽松、紧张、危机或风险等级。`;
}
export const OFR_SITE_COVERAGE_FACT = '本站当前 OFR 快照未包含类别及地区贡献分解；contributionsPublished=false 仅描述本站发布范围，不表示 OFR 官方未公布。OFR 官方提供类别及地区贡献，但本站输入未纳入这些贡献，不能据此分解当期变化的驱动。';

const ofrSubject = /OFR|金融压力(?:指数|原值|读数)?|压力(?:原值|指数|读数|区间|水平|整体|低位|高位)/iu;
const independentSubject = /(?:NFCI|SOFR|OAS|联邦基金利率|政策利率|信用利差|国债收益率|通胀|失业率|油价|股价|美联储|央行)/iu;
const directionWords = /低于|高于|等于|位于.{0,4}中位|(?:偏|较|相对)?低位|(?:偏|较|相对)?高位|偏低|偏高|较低|较高|上半(?:部|区|段)|下半(?:部|区|段)|宽松|紧张/gu;
const negativeBoundary = /(?:不(?:能|可|足以)?|无法)(?:直接|据此|仅凭原值|仅凭负值|仅凭正值)?(?:代表|意味着|说明|表示|推断|认定|视为|等同于|证明)|不等于|并非|不是/u;
// A negation must govern this comparison/absence, not an earlier proposition.
// Accept only a bounded grammatical bridge after its last governing verb.
// In particular, another state adjective, risk-score noun, or assertion verb
// ends the exemption even when no punctuation/conjunction was supplied.
function directlyNegates(prefix) {
  const match = [...prefix.matchAll(new RegExp(negativeBoundary.source, 'gu'))].at(-1);
  if (!match) return false;
  const bridge = prefix.slice(match.index + match[0].length);
  return bridge.replace(/(?:严格)?(?:过去|近)(?:十|10)年|金融压力|校准历史均值|OFR|FSI|官方|该机构|当前|压力|指数|原值|读数|整体|处于|处在|历史|相对|同口径|样本|窗口|水平|位置|所处|本站|站内|快照|输入|类别|地区|贡献|分解|数据|其|的|为|是|中|在|该|也|已|尚|\s/giu, '') === '';
}
const baseline = /(?:OFR\s*(?:的|自身|官方)?\s*(?:校准|长期)?历史(?:平均值|均值|平均水平))|(?:OFR\s*(?:的)?\s*校准(?:均值|平均值|基准))|校准历史均值/iu;
const priorWindow = /(?:严格)?(?:过去|近)(?:十|10)年(?:的)?(?:同口径)?(?:历史)?(?:样本|窗口)|严格过去十年/iu;
const median = /中位(?:数|位置)?|样本(?:排序)?(?:上|下)半(?:部|区|段)/u;
const lowerDirection = /低于|低位|偏低|较低|下半/u;
const upperDirection = /高于|高位|偏高|较高|上半/u;
const direction = text => lowerDirection.test(text) ? -1 : upperDirection.test(text) ? 1 : 0;
const relation = value => finite(value) ? Math.sign(value) : null;

// Fields are inspected independently so a qualifier in another title, paragraph,
// data gap or citation cannot launder an unsupported assertion. Within a field,
// comma-separated clauses inherit only their subject, not a comparison basis.
export function inspectOfrSemanticField(text, { snapshot, sourceRefIds = [], defaultPressure = false } = {}) {
  if (typeof text !== 'string') return [];
  const errors = new Set();
  const citedPressure = sourceRefIds.some(id => /^site:ofr:(?:pressure|percentile|weekly-change)$/u.test(id));
  for (const sentence of text.normalize('NFKC').split(/[。！？!?；;\n]/u)) {
    let pressureSubject = defaultPressure;
    let contributionContext = false;
    for (const clause of sentence.split(/[，,]|但是|然而|而是|并且|同时|因此|因而|从而|所以|但|却|且/gu).filter(Boolean)) {
      const explicitOfr = ofrSubject.test(clause);
      const explicitIndependent = independentSubject.test(clause) && !explicitOfr;
      if (explicitOfr) pressureSubject = true;
      else if (explicitIndependent) pressureSubject = false;
      const scoped = pressureSubject || (citedPressure && !explicitIndependent && /(?:压力|原值|百分位|历史相对|宽松底色)/u.test(clause));
      let affirmativeComparisons = 0;
      for (const match of clause.matchAll(directionWords)) {
        const before = clause.slice(0, match.index);
        // Only negated inference boundaries are exempt, not arbitrary clauses
        // containing “不”. Assertions following a comma are checked separately.
        if (/^(?:若|如果|一旦|未来若)/u.test(clause.trim())) continue;
        if (directlyNegates(before)) {
          // A denial of an inference is a boundary. A negated numerical
          // relation needs explicit direction instead of silently bypassing it.
          const negation = [...before.matchAll(new RegExp(negativeBoundary.source, 'gu'))].at(-1)?.[0];
          if (scoped && /^(?:并非|不是)$/u.test(negation || '') && (baseline.test(clause) || priorWindow.test(clause))) errors.add('ofr_negated_comparison_requires_explicit_direction');
          continue;
        }
        if (scoped && /(?:不|未|没有)\s*$/u.test(before)) { errors.add('ofr_negated_comparison_requires_explicit_direction'); continue; }
        if (!scoped) continue;
        affirmativeComparisons += 1;
        if (affirmativeComparisons > 1) errors.add('ofr_multiple_comparisons_require_separate_clauses');
        const hasBaseline = baseline.test(clause);
        const hasWindow = priorWindow.test(clause);
        const hasMedian = median.test(clause);
        if (/宽松|紧张/u.test(match[0]) || (!hasBaseline && !hasWindow)) {
          errors.add('ofr_comparison_basis_required');
          continue;
        }
        if (hasBaseline && hasWindow) { errors.add('ofr_comparison_basis_ambiguous'); continue; }
        const expected = hasBaseline ? relation(snapshot?.index?.value) : relation(finite(snapshot?.percentile?.value) ? snapshot.percentile.value - 50 : null);
        const actual = direction(match[0]);
        // No invented “low stress” thresholds: a rank adjective only asserts
        // the side of the sample midpoint. It never assigns an absolute regime.
        if (hasWindow && !hasMedian && /低于|高于|等于/u.test(match[0])) { errors.add('ofr_rank_comparison_requires_midpoint'); continue; }
        if (expected === null || expected !== actual) errors.add(hasBaseline ? 'ofr_baseline_direction_mismatch' : 'ofr_percentile_direction_mismatch');
        if (!sourceRefIds.includes(hasBaseline ? 'site:ofr:pressure' : 'site:ofr:percentile')) errors.add('ofr_comparison_source_required');
      }
      // “contributionsPublished” is a site publication boundary, not a claim
      // about the upstream publisher. Require a nearby site subject on absence.
      const explicitContribution = /(?:贡献|成分).{0,8}(?:分解|分项|明细|数据)|(?:类别|地区)贡献/u.test(clause);
      if (explicitContribution) contributionContext = true;
      if (!contributionContext) continue;
      for (const absent of clause.matchAll(/(?:未|没有|不)(?:公布|发布|提供|包含|纳入|披露)|(?:缺少|缺失|缺乏)|不可用/gu)) {
        if (directlyNegates(clause.slice(0, absent.index))) continue;
        // Inherit only an omitted contribution object, not a newly named data set.
        if (!explicitContribution && !/^(?:这些|上述|相关)?(?:数据|信息|明细|内容)?\s*$/u.test(clause.slice(absent.index + absent[0].length))) continue;
        const prefix = clause.slice(0, absent.index);
        const siteMarkers = [...prefix.matchAll(/(?:本站|站内)(?:当前|本期|的)?(?:\s*OFR\s*)?(?:快照|输入|证据包|发布范围|数据)?|(?:本次|本期|当前)(?:的)?(?:站内)?(?:\s*OFR\s*)?(?:快照|输入|证据包)/giu)];
        const publisherMarkers = [...prefix.matchAll(/OFR(?:\s*(?:官方|机构|指数))?|官方|该机构/giu)];
        const site = siteMarkers.at(-1), publisher = publisherMarkers.at(-1);
        const siteIsLocation = site && /(?:在|于)\s*$/u.test(prefix.slice(0, site.index));
        const publisherActs = /(?:公布|发布|提供|披露)/u.test(absent[0]);
        const siteIsSubject = site && !(siteIsLocation && publisherActs && publisher)
          && (!publisher || site.index + site[0].length >= publisher.index + publisher[0].length);
        if (!siteIsSubject) errors.add('ofr_contribution_gap_requires_site_scope');
        else if (!sourceRefIds.includes('site:ofr:coverage')) errors.add('ofr_contribution_scope_source_required');
      }
    }
  }
  return [...errors];
}
