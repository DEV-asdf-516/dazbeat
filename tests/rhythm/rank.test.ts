import { describe, expect, it } from 'vitest';
import { CLEAR_ACCURACY } from '../../src/rhythm/accuracy.js';
import { getRank } from '../../src/rhythm/rank.js';

describe('getRank', () => {
  it.each([
    [1, 'S'],
    [0.95, 'S'],
    [0.9499, 'A'],
    [0.9, 'A'],
    [0.8999, 'B'],
    [0.8, 'B'],
    [0.7999, 'C'],
    [0.7, 'C'],
    [0.6999, 'D'],
    [0, 'D'],
  ] as const)('returns %s accuracy as rank %s', (accuracy, rank) => {
    expect(getRank(accuracy)).toBe(rank);
  });

  it('uses CLEAR_ACCURACY as the C boundary', () => {
    expect(getRank(CLEAR_ACCURACY)).toBe('C');
  });
});
