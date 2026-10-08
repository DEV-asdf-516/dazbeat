import { describe, expect, it } from 'vitest';
import { getStarlightBand } from '../../../src/game/gameplay/starlightBand.js';

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
