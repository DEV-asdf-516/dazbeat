import { describe, expect, it } from 'vitest';
import { msToSec, secToMs } from '../src/time.js';

describe('msToSec', () => {
  it.each([
    [0, 0],
    [1, 0.001],
    [1500, 1.5],
    [-250, -0.25],
  ])('converts %d ms to %d s', (ms, expected) => {
    expect(msToSec(ms)).toBe(expected);
  });
});

describe('secToMs', () => {
  it.each([
    [0, 0],
    [0.001, 1],
    [1.5, 1500],
    [-0.25, -250],
  ])('converts %d s to %d ms', (sec, expected) => {
    expect(secToMs(sec)).toBe(expected);
  });
});
