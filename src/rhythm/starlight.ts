import type { Judgment } from './types.js';

/** 플레이 시작 HP 이자 상한이다. */
export const MAX_HP = 100;

export const HP_DELTAS: Record<Judgment, number> = {
  perfect: 1,
  great: 0.5,
  good: 0,
  bad: -5,
  miss: -10,
};

export function getNextHp(hp: number, judgment: Judgment): number {
  return Math.min(MAX_HP, Math.max(0, hp + HP_DELTAS[judgment]));
}
