import type { Judgment, JudgmentWindows, Note } from './types.js';

export const JUDGMENT_WINDOWS: JudgmentWindows = {
  perfectMs: 40,
  greatMs: 80,
  goodMs: 100,
  badMs: 130,
};

export function judgeTap(
  noteTimeMs: number,
  inputTimeMs: number,
  windows: JudgmentWindows,
): Judgment {
  const diffMs = Math.abs(inputTimeMs - noteTimeMs);
  if (diffMs <= windows.perfectMs) {
    return 'perfect';
  }
  if (diffMs <= windows.greatMs) {
    return 'great';
  }
  if (diffMs <= windows.goodMs) {
    return 'good';
  }
  if (diffMs <= windows.badMs) {
    return 'bad';
  }
  return 'miss';
}

export function judgeHoldRelease(
  endTimeMs: number,
  releaseTimeMs: number,
  windows: JudgmentWindows,
): Judgment {
  return releaseTimeMs >= endTimeMs - windows.badMs ? 'perfect' : 'miss';
}

/** hold 노트는 시작(holdStart)과 끝(holdEnd)에서 각각 판정된다. */
export function countJudgments(notes: readonly Note[]): number {
  return notes.reduce((total, note) => total + (note.type === 'hold' ? 2 : 1), 0);
}
