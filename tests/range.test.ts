import { describe, expect, it } from 'vitest';
import { clamp, cycleItem, getDistance, getProgress, lerp, stepItem } from '../src/range.js';

const ITEMS = ['a', 'b', 'c'] as const;

describe('clamp', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [5, 5],
    [10, 10],
    [11, 10],
  ])('clamps %d into [0, 10] as %d', (value, expected) => {
    expect(clamp(value, 0, 10)).toBe(expected);
  });
});

describe('getDistance', () => {
  it.each([
    [3, 10, 7],
    [10, 3, 7],
    [5, 5, 0],
    [-4, 2, 6],
  ])('returns the distance between %d and %d as %d', (a, b, expected) => {
    expect(getDistance(a, b)).toBe(expected);
  });
});

describe('getProgress', () => {
  it.each([
    [9, 0],
    [10, 0],
    [15, 0.5],
    [20, 1],
    [21, 1],
  ])('maps %d in [10, 20] to %d', (value, expected) => {
    expect(getProgress(value, 10, 20)).toBe(expected);
  });

  it('runs backwards when from is greater than to', () => {
    expect(getProgress(20, 20, 10)).toBe(0);
    expect(getProgress(15, 20, 10)).toBe(0.5);
    expect(getProgress(10, 20, 10)).toBe(1);
  });
});

describe('lerp', () => {
  it.each([
    [0, 10],
    [0.5, 15],
    [1, 20],
  ])('interpolates [10, 20] at %d as %d', (t, expected) => {
    expect(lerp(10, 20, t)).toBe(expected);
  });

  it('interpolates backwards when from is greater than to', () => {
    expect(lerp(1, 0.25, 0.5)).toBe(0.625);
  });
});

describe('cycleItem', () => {
  it('moves to the neighbor inside the list', () => {
    expect(cycleItem(ITEMS, 'a', 1)).toBe('b');
    expect(cycleItem(ITEMS, 'c', -1)).toBe('b');
  });

  it('wraps around both ends', () => {
    expect(cycleItem(ITEMS, 'c', 1)).toBe('a');
    expect(cycleItem(ITEMS, 'a', -1)).toBe('c');
  });

  it('throws for an item outside the list', () => {
    expect(() => cycleItem<string>(ITEMS, 'z', 1)).toThrow('not in the list');
  });
});

describe('stepItem', () => {
  it('moves to the neighbor inside the list', () => {
    expect(stepItem(ITEMS, 'a', 1)).toBe('b');
    expect(stepItem(ITEMS, 'c', -1)).toBe('b');
  });

  it('stays at both ends', () => {
    expect(stepItem(ITEMS, 'c', 1)).toBe('c');
    expect(stepItem(ITEMS, 'a', -1)).toBe('a');
  });

  it('stays on a single-item list', () => {
    expect(stepItem(['only'], 'only', 1)).toBe('only');
  });

  it('throws for an item outside the list', () => {
    expect(() => stepItem<string>(ITEMS, 'z', 1)).toThrow('not in the list');
  });
});
