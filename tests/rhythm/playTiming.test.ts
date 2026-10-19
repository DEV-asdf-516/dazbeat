import { describe, expect, it } from 'vitest';
import { getGameFraction } from '../../src/rhythm/playTiming.js';

describe('getGameFraction', () => {
  it.each([
    [1000, 0],
    [2000, 0.5],
    [3000, 1],
  ])('maps %d ms inside the game range to %d', (timeMs, fraction) => {
    expect(getGameFraction(1000, 3000, timeMs)).toBe(fraction);
  });

  it.each([
    [0, -0.5],
    [4000, 1.5],
  ])('keeps %d ms outside the range proportional (%d)', (timeMs, fraction) => {
    expect(getGameFraction(1000, 3000, timeMs)).toBe(fraction);
  });
});
