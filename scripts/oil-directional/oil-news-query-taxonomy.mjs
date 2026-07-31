export const WEB_NGRAMS_QUERY_SET_VERSION = 'odp-oil-news-web-ngrams-taxonomy-v2';

export const WEB_NGRAMS_SUPPORTED_LANGUAGES = Object.freeze(['en', 'zh', 'ar', 'ru', 'es']);

export const WEB_NGRAMS_TERM_SET = Object.freeze([
  {
    id: 'hormuz',
    labelZh: '霍尔木兹',
    patterns: [
      'hormuz', 'strait of hormuz', '霍尔木兹', 'هرمز', 'ормуз', 'ormuz'
    ],
    buckets: ['chokepoint', 'middle_east_risk']
  },
  {
    id: 'red_sea',
    labelZh: '红海',
    patterns: [
      'red sea', 'bab el-mandeb', 'bab el mandeb', '红海', '曼德海峡',
      'البحر الأحمر', 'باب المندب', 'красное море', 'баб-эль-мандеб',
      'mar rojo', 'bab el mandeb'
    ],
    buckets: ['chokepoint', 'tanker_shipping']
  },
  {
    id: 'tanker',
    labelZh: '油轮/航运',
    patterns: [
      'tanker', 'vlcc', 'shipping insurance', '油轮', '航运保险',
      'ناقلة نفط', 'ناقلات النفط', 'танкер', 'страхование судоходства',
      'petrolero', 'buque cisterna', 'seguro marítimo'
    ],
    buckets: ['tanker_shipping']
  },
  {
    id: 'crude_oil',
    labelZh: '原油',
    patterns: [
      'crude oil', 'oil prices', 'brent crude', 'wti crude', '原油', '油价',
      'النفط الخام', 'أسعار النفط', 'сырая нефть', 'цены на нефть',
      'petróleo crudo', 'precios del petróleo'
    ],
    buckets: ['market_reaction']
  },
  {
    id: 'sanctions',
    labelZh: '制裁',
    patterns: [
      'oil sanctions', 'shadow fleet', 'price cap', '石油制裁', '影子船队',
      'عقوبات النفط', 'أسطول الظل', 'нефтяные санкции', 'теневой флот',
      'sanciones petroleras', 'flota fantasma'
    ],
    buckets: ['sanctions', 'tanker_shipping']
  },
  {
    id: 'supply_disruption',
    labelZh: '供应中断',
    patterns: [
      'oil outage', 'pipeline outage', 'export halt', 'supply disruption',
      '供应中断', '管道停运', '出口暂停', 'تعطل الإمدادات', 'توقف خط الأنابيب',
      'сбой поставок', 'остановка трубопровода', 'interrupción del suministro',
      'parada del oleoducto'
    ],
    buckets: ['supply_disruption']
  },
  {
    id: 'facility_event',
    labelZh: '设施事件',
    patterns: [
      'refinery fire', 'refinery outage', 'terminal shutdown', '炼厂火灾',
      '炼厂停运', '码头关闭', 'حريق مصفاة', 'توقف المصفاة',
      'пожар на НПЗ', 'остановка НПЗ', 'incendio en refinería',
      'parada de refinería'
    ],
    buckets: ['facility_event', 'supply_disruption']
  }
]);

export const WEB_NGRAMS_DIRECTIONAL_RULES = Object.freeze([
  {
    id: 'escalation_en',
    language: 'en',
    polarity: 'risk_escalation',
    patterns: [
      'blockade', 'closure', 'closed', 'shutdown', 'halt', 'disruption',
      'attack', 'strike', 'explosion', 'fire', 'outage', 'sanctions', 'embargo'
    ]
  },
  {
    id: 'deescalation_en',
    language: 'en',
    polarity: 'risk_deescalation',
    patterns: [
      'reopen', 'reopened', 'resume', 'resumed', 'restart', 'restored',
      'waiver', 'ceasefire', 'truce', 'de-escalation'
    ]
  },
  {
    id: 'escalation_zh',
    language: 'zh',
    polarity: 'risk_escalation',
    matchMode: 'contains',
    patterns: ['封锁', '关闭', '停运', '中断', '袭击', '爆炸', '火灾', '制裁', '禁运']
  },
  {
    id: 'deescalation_zh',
    language: 'zh',
    polarity: 'risk_deescalation',
    matchMode: 'contains',
    patterns: ['重开', '恢复', '重启', '复产', '豁免', '停火', '休战']
  },
  {
    id: 'escalation_ar',
    language: 'ar',
    polarity: 'risk_escalation',
    patterns: ['حصار', 'إغلاق', 'توقف', 'تعطل', 'هجوم', 'انفجار', 'حريق', 'عقوبات', 'حظر']
  },
  {
    id: 'deescalation_ar',
    language: 'ar',
    polarity: 'risk_deescalation',
    patterns: ['إعادة فتح', 'استئناف', 'إعادة تشغيل', 'استعادة', 'إعفاء', 'وقف إطلاق النار', 'هدنة']
  },
  {
    id: 'escalation_ru',
    language: 'ru',
    polarity: 'risk_escalation',
    patterns: ['блокада', 'закрытие', 'остановка', 'перебои', 'атака', 'взрыв', 'пожар', 'санкции', 'эмбарго']
  },
  {
    id: 'deescalation_ru',
    language: 'ru',
    polarity: 'risk_deescalation',
    patterns: ['открытие', 'возобновление', 'перезапуск', 'восстановление', 'отмена санкций', 'перемирие']
  },
  {
    id: 'escalation_es',
    language: 'es',
    polarity: 'risk_escalation',
    patterns: ['bloqueo', 'cierre', 'parada', 'interrupción', 'ataque', 'explosión', 'incendio', 'sanciones', 'embargo']
  },
  {
    id: 'deescalation_es',
    language: 'es',
    polarity: 'risk_deescalation',
    patterns: ['reapertura', 'reanudación', 'reinicio', 'restablecimiento', 'exención', 'alto el fuego', 'tregua']
  }
]);

export function normalizeMultilingualText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\u0640/gu, '')
    .toLocaleLowerCase('en-US');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function matchesPattern(normalizedText, normalizedPattern, matchMode) {
  if (matchMode === 'contains') return normalizedText.includes(normalizedPattern);
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(normalizedPattern)}(?![\\p{L}\\p{N}])`,
    'u'
  ).test(normalizedText);
}

export function matchWebNgramsTerms(text, termSet = WEB_NGRAMS_TERM_SET) {
  const normalized = normalizeMultilingualText(text);
  return termSet
    .map((term) => ({
      term,
      matchedPattern: term.patterns.find((pattern) => (
        normalized.includes(normalizeMultilingualText(pattern))
      )) || null
    }))
    .filter((match) => match.matchedPattern);
}

export function matchWebNgramsDirectionalRules(
  text,
  rules = WEB_NGRAMS_DIRECTIONAL_RULES
) {
  const normalized = normalizeMultilingualText(text);
  return rules.flatMap((rule) => {
    const matchedPattern = rule.patterns.find((pattern) => matchesPattern(
      normalized,
      normalizeMultilingualText(pattern),
      rule.matchMode
    ));
    return matchedPattern ? [{ rule, matchedPattern }] : [];
  });
}
