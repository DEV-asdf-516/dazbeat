import { describe, expect, it } from 'vitest';
import { calculateAccuracy, isCleared } from '../../src/rhythm/accuracy.js';

describe('calculateAccuracy', () => {
  it('averages the judgment weights over all judgments', () => {
    expect(calculateAccuracy({ perfect: 2, great: 1, good: 1, bad: 2, miss: 1 })).toBeCloseTo(
      (2 + 0.8 + 0.5 + 0.4) / 7,
    );
  });

  it('returns 0 when there are no judgments', () => {
    expect(calculateAccuracy({ perfect: 0, great: 0, good: 0, bad: 0, miss: 0 })).toBe(0);
  });
});

describe('isCleared', () => {
  it('clears at 0.7 accuracy', () => {
    expect(isCleared(0.7)).toBe(true);
  });

  it('does not clear below 0.7 accuracy', () => {
    expect(isCleared(0.69)).toBe(false);
  });
});
