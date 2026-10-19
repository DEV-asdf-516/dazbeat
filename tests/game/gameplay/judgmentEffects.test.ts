import { describe, expect, it } from 'vitest';
import {
  getHitBloomIntensity,
  getJudgmentPopScale,
  getLaneEffectIds,
  hasJudgmentGlow,
  hasJudgmentShimmer,
} from '../../../src/game/gameplay/judgmentEffects.js';

describe('getLaneEffectIds', () => {
  it.each([
    ['perfect', 'tap', ['R34', 'R35', 'R36', 'R33']],
    ['perfect', 'holdStart', ['R34', 'R35', 'R36', 'R33', 'R32']],
    ['perfect', 'holdEnd', ['R34', 'R35', 'R36']],
    ['great', 'tap', ['R34', 'R35', 'R33']],
    ['great', 'holdStart', ['R34', 'R35', 'R33', 'R32']],
    ['great', 'holdEnd', ['R34', 'R35']],
    ['good', 'tap', ['R34', 'R33']],
    ['good', 'holdStart', ['R34', 'R33', 'R32']],
    ['good', 'holdEnd', ['R34']],
    ['bad', 'tap', ['R33']],
    ['bad', 'holdStart', ['R33', 'R32']],
    ['miss', 'tap', []],
    ['miss', 'holdStart', []],
    ['miss', 'holdEnd', []],
  ] as const)('plays %s %s effects in order', (judgment, kind, expected) => {
    expect(
      getLaneEffectIds({
        judgment,
        kind,
      }),
    ).toEqual(expected);
  });
});

describe('hasJudgmentShimmer', () => {
  it.each([
    ['perfect', true],
    ['great', true],
    ['good', true],
    ['bad', false],
    ['miss', false],
  ] as const)('%s → %s', (judgment, expected) => {
    expect(hasJudgmentShimmer(judgment)).toBe(expected);
  });
});

describe('getHitBloomIntensity', () => {
  it('is strongest for perfect and weakens with each lower judgment', () => {
    const [perfect, great, good] = (['perfect', 'great', 'good'] as const).map(
      getHitBloomIntensity,
    );
    expect(perfect).toBe(1);
    expect(great).toBeLessThan(perfect ?? 0);
    expect(good).toBeLessThan(great ?? 0);
    expect(good).toBeGreaterThan(0);
  });

  it.each(['bad', 'miss'] as const)('shows no bloom for %s', (judgment) => {
    expect(getHitBloomIntensity(judgment)).toBe(0);
  });
});

describe('getJudgmentPopScale', () => {
  it('pops perfect larger than great', () => {
    expect(getJudgmentPopScale('perfect')).toBeGreaterThan(getJudgmentPopScale('great'));
    expect(getJudgmentPopScale('great')).toBeGreaterThan(1);
  });

  it.each(['good', 'bad', 'miss'] as const)('does not pop %s', (judgment) => {
    expect(getJudgmentPopScale(judgment)).toBe(1);
  });
});

describe('hasJudgmentGlow', () => {
  it.each([
    ['perfect', true],
    ['great', true],
    ['good', false],
    ['bad', false],
    ['miss', false],
  ] as const)('%s → %s', (judgment, expected) => {
    expect(hasJudgmentGlow(judgment)).toBe(expected);
  });
});
