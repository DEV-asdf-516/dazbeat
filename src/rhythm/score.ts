import type { Judgment, JudgmentCounts } from './types.js';

export const JUDGMENT_SCORES: Record<Judgment, number> = {
  perfect: 1000,
  great: 700,
  good: 300,
  bad: 100,
  miss: 0,
};

export function getJudgmentScore(judgment: Judgment): number {
  return JUDGMENT_SCORES[judgment];
}

export function getNextCombo(combo: number, judgment: Judgment): number {
  switch (judgment) {
    case 'perfect':
    case 'great':
      return combo + 1;
    case 'good':
      return 1;
    case 'bad':
    case 'miss':
      return 0;
  }
}

export function isFullCombo(counts: JudgmentCounts): boolean {
  return counts.good === 0 && counts.bad === 0 && counts.miss === 0;
}
