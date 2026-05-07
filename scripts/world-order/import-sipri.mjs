import { buildEmptySummary, buildSourceResult } from './normalize-world-order-inputs.mjs';

export async function importSipriSummary({ config = {} } = {}) {
  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: buildEmptySummary({
        globalMilitarySpendTrend: null,
        majorPowerMilitarySpendTrend: null,
        militarySpendShareOfGDPTrend: null,
        updatedYear: null,
        sourceFreshness: 'not-applicable',
        noteZh: 'SIPRI 数据源已关闭。'
      })
    });
  }

  return buildSourceResult({
    enabled: true,
    status: 'manual_required',
    lastFetchedAt: null,
    summary: buildEmptySummary({
      globalMilitarySpendTrend: null,
      majorPowerMilitarySpendTrend: null,
      militarySpendShareOfGDPTrend: null,
      updatedYear: null,
      sourceFreshness: 'manual_required',
      noteZh: 'SIPRI 是慢变量数据源。H-1 仅提供导入框架，需要后续手动导入标准化军费数据后再参与高置信度评分。'
    }),
    evidence: [
      {
        labelZh: 'SIPRI 军费慢变量',
        source: 'SIPRI manual import',
        summary: '当前未导入真实 SIPRI 标准化数据，因此只降低结构性评分置信度，不伪造军费趋势。',
        value: null,
        direction: 'neutral',
        confidence: 0
      }
    ],
    confidence: 0.05,
    warnings: ['SIPRI 需要手动导入标准化数据。']
  });
}
