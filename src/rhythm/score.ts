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
  return judgment === 'bad' || judgment === 'miss' ? 0 : combo + 1;
}

export function isFullCombo(counts: JudgmentCounts): boolean {
  return counts.miss === 0 && counts.bad === 0;
}
