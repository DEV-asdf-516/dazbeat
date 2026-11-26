import { describe, expect, it } from 'vitest';
import { getLoadErrorText } from '../../../../src/game/gameplay/state/gameplayStatus.js';

describe('getLoadErrorText', () => {
  it('has a hint only for a video that does not allow embedding', () => {
    expect(
      getLoadErrorText({
        kind: 'videoError',
        errorKind: 'embeddingNotAllowed',
        code: 101,
      }),
    ).toEqual({
      message: {
        kind: 'videoError',
        errorKind: 'embeddingNotAllowed',
        code: 101,
      },
      hasHint: true,
    });
    expect(
      getLoadErrorText({
        kind: 'videoError',
        errorKind: 'videoNotFound',
        code: 100,
      }).hasHint,
    ).toBe(false);
    expect(getLoadErrorText({ kind: 'chartLoadFailed' })).toEqual({
      message: {
        kind: 'key',
        key: 'gameplay.chartLoadFailed',
      },
      hasHint: false,
    });
  });
});
