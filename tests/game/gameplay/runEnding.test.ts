import { describe, expect, it } from 'vitest';
import { getRunEnding } from '../../../src/game/gameplay/runEnding.js';
import type { GameplayResult, JudgmentCounts } from '../../../src/rhythm/types.js';

const GAME_END_MS = 60_000;

function finished(counts: Partial<JudgmentCounts>): GameplayResult {
  return {
    outcome: 'finished',
    cleared: true,
    score: 900_000,
    accuracy: 95,
    maxCombo: 100,
    counts: {
      perfect: 90,
      great: 10,
      good: 0,
      bad: 0,
      miss: 0,
      ...counts,
    },
  };
}

describe('getRunEnding', () => {
  it('keeps playing before the game end even when the session has finished', () => {
    expect(getRunEnding(GAME_END_MS - 1, GAME_END_MS, finished({}))).toEqual({ kind: 'continue' });
  });

  it('keeps playing after the game end while notes remain unjudged', () => {
    expect(getRunEnding(GAME_END_MS + 1, GAME_END_MS, { outcome: 'playing' })).toEqual({
      kind: 'continue',
    });
  });

  it('shows FULL COMBO at the game end without miss or bad', () => {
    const result = finished({ good: 3 });
    expect(getRunEnding(GAME_END_MS, GAME_END_MS, result)).toEqual({
      kind: 'fullCombo',
      result,
    });
  });

  it.each([
    ['miss', { miss: 1 }],
    ['bad', { bad: 1 }],
  ] as const)('goes straight to the result with a %s', (_, counts) => {
    const result = finished(counts);
    expect(getRunEnding(GAME_END_MS, GAME_END_MS, result)).toEqual({
      kind: 'result',
      result,
    });
  });
});
