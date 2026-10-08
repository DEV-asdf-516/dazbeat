import { CLEAR_ACCURACY } from './accuracy.js';
import type { Rank } from './types.js';

export const RANK_THRESHOLDS: readonly { rank: Rank; minAccuracy: number }[] = [
  { rank: 'S', minAccuracy: 0.95 },
  { rank: 'A', minAccuracy: 0.9 },
  { rank: 'B', minAccuracy: 0.8 },
  { rank: 'C', minAccuracy: CLEAR_ACCURACY },
];

export function getRank(accuracy: number): Rank {
  return RANK_THRESHOLDS.find(({ minAccuracy }) => minAccuracy <= accuracy)?.rank ?? 'D';
}
