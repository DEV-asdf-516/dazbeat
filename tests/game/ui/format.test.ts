import { describe, expect, it } from 'vitest';
import { formatAccuracy, formatKeyCode, formatScore } from '../../../src/game/ui/format.js';

describe('formatScore', () => {
  it.each<[number, string]>([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [982430, '982,430'],
    [1234567, '1,234,567'],
  ])('formats %d as %s', (score, expected) => {
    expect(formatScore(score)).toBe(expected);
  });
});

describe('formatAccuracy', () => {
  it.each<[number, string]>([
    [0, '0.00%'],
    [0.98723, '98.72%'],
    [1, '100.00%'],
  ])('formats %d as %s', (accuracy, expected) => {
    expect(formatAccuracy(accuracy)).toBe(expected);
  });
});

describe('formatKeyCode', () => {
  it.each<[string, string]>([
    ['KeyD', 'D'],
    ['KeyK', 'K'],
    ['Digit1', '1'],
    ['Space', 'SPACE'],
    ['Semicolon', 'Semicolon'],
    ['ShiftLeft', 'ShiftLeft'],
  ])('formats %s as %s', (code, expected) => {
    expect(formatKeyCode(code)).toBe(expected);
  });
});
