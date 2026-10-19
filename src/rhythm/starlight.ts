import { clamp } from '../range.js';
import type { Judgment } from './types.js';

export const MAX_HP = 100;

const HP_DELTAS: Record<Judgment, number> = {
  perfect: 1,
  great: 0.5,
  good: 0,
  bad: -5,
  miss: -10,
};

export function getNextHp(hp: number, judgment: Judgment): number {
  return clamp(hp + HP_DELTAS[judgment], 0, MAX_HP);
}
