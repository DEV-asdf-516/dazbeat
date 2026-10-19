import { describe, expect, it } from 'vitest';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString } from '../src/typeGuards.js';

describe('isRecord', () => {
  it.each([[{}], [{ a: 1 }]])('accepts plain object %j', (value) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([[null], [undefined], [[]], ['a'], [1]])('rejects %j', (value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe('isString', () => {
  it.each([[''], ['a']])('accepts %j', (value) => {
    expect(isString(value)).toBe(true);
  });

  it.each([[null], [1], [{}]])('rejects %j', (value) => {
    expect(isString(value)).toBe(false);
  });
});

describe('isBoolean', () => {
  it.each([[true], [false]])('accepts %j', (value) => {
    expect(isBoolean(value)).toBe(true);
  });

  it.each([[0], ['true'], [null]])('rejects %j', (value) => {
    expect(isBoolean(value)).toBe(false);
  });
});

describe('isFiniteNumber', () => {
  it.each([[0], [-1.5], [Number.MAX_VALUE]])('accepts %d', (value) => {
    expect(isFiniteNumber(value)).toBe(true);
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], ['1'], [null]])(
    'rejects %j',
    (value) => {
      expect(isFiniteNumber(value)).toBe(false);
    },
  );
});

describe('isOneOf', () => {
  const isLetter = isOneOf(['a', 'b']);

  it.each([['a'], ['b']])('accepts listed value %j', (value) => {
    expect(isLetter(value)).toBe(true);
  });

  it.each([['c'], [''], [null]])('rejects unlisted value %j', (value) => {
    expect(isLetter(value)).toBe(false);
  });

  it('rejects everything for an empty list', () => {
    expect(isOneOf([])('a')).toBe(false);
  });
});
