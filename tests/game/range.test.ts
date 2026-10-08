import { describe, expect, it } from 'vitest';
import { clamp, cycleItem, stepItem } from '../../src/game/range.js';

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
