import { describe, expect, it } from 'vitest';
import { getJudgmentScore, getNextCombo, isFullCombo } from '../../src/rhythm/score.js';

describe('getJudgmentScore', () => {
  it.each([
    ['perfect', 1000],
    ['great', 700],
    ['good', 300],
    ['bad', 100],
    ['miss', 0],
  ] as const)('scores %s as %i', (judgment, expected) => {
    expect(getJudgmentScore(judgment)).toBe(expected);
  });
});

describe('getNextCombo', () => {
  it.each(['perfect', 'great', 'good'] as const)('increments the combo on %s', (judgment) => {
    expect(getNextCombo(5, judgment)).toBe(6);
  });

  it.each(['bad', 'miss'] as const)('resets the combo on %s', (judgment) => {
    expect(getNextCombo(5, judgment)).toBe(0);
  });
});

describe('isFullCombo', () => {
  it('is false with a single bad', () => {
    expect(isFullCombo({ perfect: 10, great: 3, good: 1, bad: 1, miss: 0 })).toBe(false);
  });

  it('is true without any bad or miss', () => {
    expect(isFullCombo({ perfect: 10, great: 3, good: 1, bad: 0, miss: 0 })).toBe(true);
  });

  it('is false with a single miss', () => {
    expect(isFullCombo({ perfect: 10, great: 3, good: 1, bad: 0, miss: 1 })).toBe(false);
  });
});
