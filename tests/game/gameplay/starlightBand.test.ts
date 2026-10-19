import { describe, expect, it } from 'vitest';
import { getStarlightBand, isStarlightDrop } from '../../../src/game/gameplay/starlightBand.js';

describe('getStarlightBand', () => {
  it.each([
    [100, 'stable'],
    [70, 'stable'],
    [69.5, 'caution'],
    [35, 'caution'],
    [34.5, 'danger'],
    [34, 'danger'],
    [0.5, 'danger'],
    [0, 'danger'],
  ] as const)('maps hp %d to %s', (hp, band) => {
    expect(getStarlightBand(hp)).toBe(band);
  });
});

describe('isStarlightDrop', () => {
  it.each([
    ['stable', 'stable', false],
    ['caution', 'caution', false],
    ['danger', 'danger', false],
    ['stable', 'caution', true],
    ['caution', 'danger', true],
    ['stable', 'danger', true],
    ['caution', 'stable', false],
    ['danger', 'caution', false],
    ['danger', 'stable', false],
  ] as const)('%s → %s is a drop: %s', (previous, next, expected) => {
    expect(isStarlightDrop(previous, next)).toBe(expected);
  });
});
