import { describe, expect, it } from 'vitest';
import { requireDefined } from '../src/invariant.js';

describe('requireDefined', () => {
  it('returns defined values, including falsy ones', () => {
    expect(requireDefined(0, 'missing')).toBe(0);
    expect(requireDefined('', 'missing')).toBe('');
    expect(requireDefined(false, 'missing')).toBe(false);
    expect(requireDefined(null, 'missing')).toBeNull();
  });

  it('throws an Error with the message for undefined', () => {
    expect(() => requireDefined(undefined, 'Missing row: 3')).toThrow(new Error('Missing row: 3'));
  });

  it('appends the subject to the message only when throwing', () => {
    expect(() => requireDefined(undefined, 'Missing row', 3)).toThrow(new Error('Missing row: 3'));
    expect(() => requireDefined(undefined, 'Missing tab', 'all')).toThrow(
      new Error('Missing tab: all'),
    );
  });
});
