import type { Judgment, JudgmentCounts } from './types.js';

export const ACCURACY_WEIGHTS: Record<Judgment, number> = {
  perfect: 1,
  great: 0.8,
  good: 0.5,
  bad: 0.2,
  miss: 0,
};
export const CLEAR_ACCURACY = 0.7;

export function calculateAccuracy(counts: JudgmentCounts): number {
  const total = counts.perfect + counts.great + counts.good + counts.bad + counts.miss;
  if (total === 0) {
    return 0;
  }
  const weighted =
    counts.perfect * ACCURACY_WEIGHTS.perfect +
    counts.great * ACCURACY_WEIGHTS.great +
    counts.good * ACCURACY_WEIGHTS.good +
    counts.bad * ACCURACY_WEIGHTS.bad +
    counts.miss * ACCURACY_WEIGHTS.miss;
  return weighted / total;
}

export function isCleared(accuracy: number): boolean {
  return accuracy >= CLEAR_ACCURACY;
}
