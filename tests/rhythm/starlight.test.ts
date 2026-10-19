import { describe, expect, it } from 'vitest';
import { MAX_HP, getNextHp } from '../../src/rhythm/starlight.js';

describe('getNextHp', () => {
  it.each([
    ['perfect', 51],
    ['great', 50.5],
    ['good', 50],
    ['bad', 45],
    ['miss', 40],
  ] as const)('changes hp by the %s delta away from the bounds', (judgment, expected) => {
    expect(getNextHp(50, judgment)).toBe(expected);
  });

  it('starts from a max hp of 100', () => {
    expect(MAX_HP).toBe(100);
  });

  it('clamps at the max', () => {
    expect(getNextHp(100, 'perfect')).toBe(100);
    expect(getNextHp(100, 'great')).toBe(100);
  });

  it('clamps at 0', () => {
    expect(getNextHp(5, 'miss')).toBe(0);
    expect(getNextHp(3, 'bad')).toBe(0);
  });

  it('keeps hp on good', () => {
    expect(getNextHp(42.5, 'good')).toBe(42.5);
  });

  it('recovers from 0 on perfect and great', () => {
    expect(getNextHp(0, 'great')).toBe(0.5);
    expect(getNextHp(0, 'perfect')).toBe(1);
  });

  it('accumulates without rounding', () => {
    const hps: number[] = [];
    (['bad', 'miss', 'great', 'perfect'] as const).reduce((hp, judgment) => {
      const next = getNextHp(hp, judgment);
      hps.push(next);
      return next;
    }, MAX_HP);
    expect(hps).toEqual([95, 85, 85.5, 86.5]);
  });
});
