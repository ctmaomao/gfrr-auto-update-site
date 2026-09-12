import { createHash } from 'node:crypto';

// Synthetic production-envelope fixture. Never imported by production code.
export function editorialHistoryFixture(timestamp = '2026-09-11T01:00:00.000Z') {
  const output = {
    model: 'fixture', generatedAt: timestamp, sourceDataUpdatedAt: timestamp,
    headlineZh: '原期判读：能源与利率压力仍待观察', leadZh: '此段内容只对应原期数据，用于历史展示回归。',
    scoreSynthesis: { score: 42, assessmentZh: '原期综合分为 42 分。', sourceRefIds: ['site:test'] },
    moduleAnalysis: ['能源', '地缘', '通胀', '流动性', '债务', '银行'].map(labelZh => ({ labelZh, score: 42, assessmentZh: '原期判断。', sourceRefIds: ['site:test'] })),
    crossMarketAnalysis: ['原油', '利率', '信用'].map(assetZh => ({ assetZh, observationZh: '原期观察。', implicationZh: '等待确认。', sourceRefIds: ['site:test'] })),
    sourceAttribution: [{ sourceRefId: 'site:test' }],
  };
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return {
    schemaVersion: 'macro-risk-editorial-production-v1', status: 'valid', displayEnabled: true,
    generatedAt: timestamp, updatedAt: timestamp, sourceDataUpdatedAt: timestamp,
    provider: 'deepseek', model: 'fixture', mode: 'external_ai_macro_risk_editorial', output,
    validation: { status: 'pass', artifactDigest: hash(output) },
    qualityReview: { status: 'warn', promotionEligible: false },
    provenance: { generatedBy: 'github_actions_workflow', humanApproved: false, runId: '123456789', sourceCommit: 'a'.repeat(40), inputDigest: hash({ fixture: true }), artifactDigest: hash(output) },
    freshness: { artifactGeneratedAt: timestamp, sourceDataUpdatedAt: timestamp, maxAgeHours: 30, isStale: false },
    sourceLedger: [{ id: 'site:test', kind: 'site_structured', sourceName: '回归样例', sourceClass: 'site_structured' }],
    boundaries: { displayOnly: true, frontendDisplayApproved: true, notInvestmentAdvice: true,
      ...Object.fromEntries(['GfrrScoring', 'RiskModules', 'TailRiskOverlay', 'DecisionModel', 'ExecutionLock', 'PositionGuidance', 'WorldOrder', 'Odp', 'BubbleWatch'].map(key => [`affects${key}`, false])) },
  };
}
