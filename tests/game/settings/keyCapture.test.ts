import { describe, expect, it } from 'vitest';
import { readKeyCapture } from '../../../src/game/settings/keyCapture.js';

describe('readKeyCapture', () => {
  it.each(['Enter', 'KeyF', 'Escape'])('reads non-repeated %s as its code', (code) => {
    expect(
      readKeyCapture({
        code,
        repeat: false,
      }),
    ).toBe(code);
  });

  it.each(['Enter', 'KeyF', 'Escape'])('reads repeated %s as null', (code) => {
    expect(
      readKeyCapture({
        code,
        repeat: true,
      }),
    ).toBeNull();
  });
});
