export const BANNED_COPY = [
  '危机已经爆发',
  '必然崩盘',
  '必然逼空',
  '世界大战',
  '战争概率',
  '已经进入第三次世界大战',
  '13步已走几步',
  'guaranteed',
  'certainty',
  'sure thing',
  'risk-free',
  '真实 Dated Brent 已接入',
  'Platts Dated Brent 已接入',
  '实物油价已经确认',
  'DeepSeek 已验证市场事实',
  'OpenAI 已验证市场事实',
  '外部 AI 已确认危机'
];

export const UNSAFE_CLAIMS = [
  '买入',
  '卖出',
  '加仓',
  '满仓',
  '清仓',
  '必须买',
  '必须卖',
  '确定赚钱',
  '无风险',
  '投资建议',
  '交易建议',
  '立即执行',
  '已确认危机',
  '外部 AI 已确认'
];

export const UNSAFE_CONTENT = [
  '执行灯',
  '执行',
  '仓位',
  '现金',
  '敞口',
  '交易',
  '买入',
  '卖出',
  '加仓',
  '减仓',
  '做多',
  '做空',
  '建仓',
  '平仓',
  '止损',
  '止盈',
  '操作信号',
  '行动信号',
  '交易信号',
  '配置建议',
  '风险动作',
  '风控动作',
];

export const FORBIDDEN_SECRET_MARKERS = [
  'DEEPSEEK_API_KEY',
  'Authorization',
  'Bearer',
  'GITHUB_TOKEN',
  '.env',
  'rawHeaders',
  'rawResponse',
  'requestHeaders',
  'responseHeaders',
];

export const EXTERNAL_AI_BLOCKLIST_GROUPS = [
  {
    className: 'banned_copy',
    phrases: BANNED_COPY,
  },
  {
    className: 'unsafe_claim',
    phrases: UNSAFE_CLAIMS,
  },
  {
    className: 'unsafe_content',
    phrases: UNSAFE_CONTENT,
  },
  {
    className: 'secret_marker',
    phrases: FORBIDDEN_SECRET_MARKERS,
  },
];

export const EXTERNAL_AI_TEXT_BLOCKLIST = [
  ...new Set(EXTERNAL_AI_BLOCKLIST_GROUPS.flatMap((group) => group.phrases)),
].sort((left, right) => right.length - left.length);
