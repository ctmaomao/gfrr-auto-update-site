// Detection only: never rewrite editorial prose. Ambiguous financial/date starts stay intact.
export function editorialListMarkerView(text = '') {
  return String(text).normalize('NFKC').replace(/^[ \t]*(?:[1-9]\d?\. |\([1-9]\d?\)[ \t]+)(?=关注|观察|首先|其次|同时|当前|需要|注意|压力|市场|证据|融资条件)/gmu,
    marker => ' '.repeat(marker.length));
}

// Pressure readings are program-injected. Token membership is not semantic binding
// to index/weekly-change/percentile fields, so model numeric pressure prose stays blocked.
export function pressureContainsNumericContent(text = '') {
  return /[0-9]|百分之[零〇一二三四五六七八九十百]|(?:原值|指数|周变化|变化幅度|历史百分位|百分位)(?:为|是|达到|升至|降至|[:：])\s*(?:负|正)?[零〇一二三四五六七八九十百千万亿两]+(?:点[零〇一二三四五六七八九]+)?(?:[，。、；\s]|$)/u.test(editorialListMarkerView(text));
}
