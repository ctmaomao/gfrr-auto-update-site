import { createHash } from 'node:crypto';
import { normalizeMultilingualText } from './oil-news-query-taxonomy.mjs';

export const EVENT_SIGNATURE_CONTRACT = 'oil-news-event-signature-v1';
const digest = value => createHash('sha256').update(value).digest('hex');
// Title-only, deliberately small location vocabulary. Unknown or multi-place
// headlines abstain instead of borrowing a query bucket or inferring a country.
const LOCATIONS = [
  ['hormuz', /\b(?:hormuz|ormuz)\b|霍尔木兹|هرمز|ормуз/u],
  ['suez', /\bsuez\b|苏伊士|السويس|суэц/u],
  ['red_sea', /\b(?:red sea|mar rojo)\b|红海|البحر الاحمر|красн\p{L}* мор/u],
  ['bab_el_mandeb', /\bbab el[ -]mandeb\b|曼德海峡|باب المندب|баб-эль-мандеб/u],
  ['fujairah', /\bfujairah\b|富查伊拉|الفجيرة|фуджейр/u],
  ['kharg', /\bkharg\b|哈尔克|خارک|خارك|харк/u],
  ['ras_tanura', /\bras tanura\b|拉斯坦努拉|راس تنورة|рас-танура/u]
];
const TARGETS = [
  ['shipping', /\b(?:tankers?|ships?|vessels?|shipping|vlcc|petroleros?|buque\w*)\b|油轮|船舶|航运|ناقل\p{L}*|سفين\p{L}*|تانкер\p{L}*|танкер\p{L}*/u],
  ['refinery', /\b(?:refinery|refineries|refineria)\b|炼厂|炼油厂|مصفاة|المصفاة|нпз/u],
  ['pipeline', /\b(?:oil pipeline|pipeline|oleoducto)\b|输油管|管道|خط الانابيب|нефтепровод/u],
  ['terminal', /\b(?:oil terminal|terminal)\b|码头|محطة النفط|терминал/u],
  ['channel', /\b(?:canal|strait|channel)\b|海峡|运河|مضيق|قناة|пролив|канал/u]
];
const CAUSES = [
  ['attack', /\b(?:attack(?:s|ed|ing)?|strike(?:s)?|struck|ataque)\b|袭击|هجوم|атака/u],
  ['fire', /\b(?:fires?|incendio)\b|火灾|حريق|пожар/u],
  ['explosion', /\b(?:explosions?|explosion)\b|爆炸|انفجار|взрыв/u]
];
const OPERATIONS = [
  ['closure', /\b(?:clos(?:ed|ure|ures)|shutdowns?|halts?|halted|blockade|cierre|bloqueo)\b|关闭|停运|封锁|اغلاق|حصار|закрытие|блокада/u],
  ['resumption', /\b(?:reopen(?:s|ed|ing)?|resum(?:e|es|ed|ing)|restart(?:s|ed|ing)?|restor(?:e|es|ed|ing)|reapertura|reanudacion)\b|重开|恢复|重启|复产|استئناف|اعادة فتح|возобновление|открытие/u]
];
function ids(text, rules) { return rules.filter(([, re]) => re.test(text)).map(([id]) => id); }
function targets(text) {
  const found = ids(text, TARGETS);
  // A ship in a named strait is a shipping target, not two independent targets.
  return found.length > 1 ? found.filter(id => id !== 'channel') : found;
}
function mechanisms(text) {
  const physical = ids(text, CAUSES);
  // A named physical cause can have an operational consequence (attack closes
  // traffic). Multiple physical causes stay ambiguous, never priority-guessed.
  return physical.length ? physical : ids(text, OPERATIONS);
}
function assetHashes(text) {
  // Only explicit quoted vessel names / IMO identifiers, never arbitrary title
  // tokens. Missing names on either side cannot resolve a named-asset claim.
  const names = [...text.matchAll(/\b(?:mv|mt|m\/v|m\/t|tanker|vessel)\s+["“']([^"”']{2,80})["”']/gu)]
    .map(match => `vessel:${match[1].trim().replace(/\s+/gu, ' ')}`);
  const imos = [...text.matchAll(/\bimo\s*[:#-]?\s*(\d{7})\b/gu)].map(match => `imo:${match[1]}`);
  return [...new Set([...names, ...imos].map(digest))].sort();
}

export function buildOilNewsEventSignature(title) {
  const text = normalizeMultilingualText(String(title || '').slice(0, 500));
  const locations = ids(text, LOCATIONS);
  const targetIds = targets(text);
  const mechanismIds = mechanisms(text);
  const namedAssetHashes = assetHashes(text);
  let state = 'comparable_candidate';
  if (!locations.length) state = 'location_missing';
  else if (locations.length !== 1) state = 'location_ambiguous';
  else if (!targetIds.length) state = 'target_missing';
  else if (targetIds.length !== 1) state = 'target_ambiguous';
  else if (!mechanismIds.length) state = 'mechanism_missing';
  else if (mechanismIds.length !== 1) state = 'mechanism_ambiguous';
  else if (namedAssetHashes.length > 1) state = 'named_asset_ambiguous';
  else {
    const clauses = text.replace(/\bu\.s\./gu, 'us').split(/[.!?;。！？；]|\b(?:but|while|whereas)\b|但是|然而/u);
    if (!clauses.some(clause => ids(clause, LOCATIONS).includes(locations[0])
      && targets(clause).includes(targetIds[0]) && mechanisms(clause).includes(mechanismIds[0]))) {
      state = 'event_clause_unbound';
    }
  }
  return { contractVersion: EVENT_SIGNATURE_CONTRACT, state,
    locationId: locations.length === 1 ? locations[0] : null,
    targetId: targetIds.length === 1 ? targetIds[0] : null,
    mechanismId: mechanismIds.length === 1 ? mechanismIds[0] : null,
    namedAssetHashes: namedAssetHashes.slice(0, 2) };
}

export function sameEventCandidateReason(left, right) {
  if (left?.contractVersion !== EVENT_SIGNATURE_CONTRACT || right?.contractVersion !== EVENT_SIGNATURE_CONTRACT
      || left.state !== 'comparable_candidate' || right.state !== 'comparable_candidate') return 'event_signature_unresolved';
  if (left.locationId !== right.locationId) return 'event_location_mismatch';
  if (left.targetId !== right.targetId) return 'event_target_mismatch';
  if (left.mechanismId !== right.mechanismId) return 'event_mechanism_mismatch';
  if (JSON.stringify(left.namedAssetHashes) !== JSON.stringify(right.namedAssetHashes)) return 'named_asset_unresolved_or_mismatch';
  return 'same_event_candidate';
}
