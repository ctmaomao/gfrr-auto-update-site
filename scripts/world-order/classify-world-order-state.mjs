import { clampScore } from './normalize-world-order-inputs.mjs';

export const WORLD_ORDER_STATES = {
  normal_globalization: {
    labelZh: '全球化正常期',
    min: 0,
    max: 20
  },
  friction_rising: {
    labelZh: '摩擦升温期',
    min: 21,
    max: 40
  },
  bloc_fragmentation: {
    labelZh: '阵营化与脱钩期',
    min: 41,
    max: 60
  },
  multi_theater_stress: {
    labelZh: '多战区压力期',
    min: 61,
    max: 75
  },
  war_economy_stress: {
    labelZh: '战争经济压力期',
    min: 76,
    max: 100
  }
};

export function classifyWorldOrderState(score) {
  const normalizedScore = clampScore(score);
  for (const [state, config] of Object.entries(WORLD_ORDER_STATES)) {
    if (normalizedScore >= config.min && normalizedScore <= config.max) {
      return {
        state,
        labelZh: config.labelZh
      };
    }
  }
  return {
    state: 'war_economy_stress',
    labelZh: WORLD_ORDER_STATES.war_economy_stress.labelZh
  };
}
