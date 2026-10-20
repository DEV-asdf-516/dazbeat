import { describe, expect, it } from 'vitest';
import type { PlaybackStatus } from '../../../src/audio/LeadInPlayback.js';
import {
  getPlayingStatus,
  isLoadingStatus,
  isSamePlaybackStatus,
} from '../../../src/game/gameplay/gameplayStatus.js';
import type { GameplayStatus } from '../../../src/game/gameplay/gameplayStatus.js';

describe('getPlayingStatus', () => {
  it.each<[PlaybackStatus, GameplayStatus]>([
    [{ kind: 'loading' }, { kind: 'loading' }],
    [
      {
        kind: 'countdown',
        digit: 3,
      },
      {
        kind: 'countdown',
        digit: 3,
      },
    ],
    [
      {
        kind: 'countdown',
        digit: 2,
      },
      {
        kind: 'countdown',
        digit: 2,
      },
    ],
    [
      {
        kind: 'countdown',
        digit: 1,
      },
      {
        kind: 'countdown',
        digit: 1,
      },
    ],
    [{ kind: 'waiting' }, { kind: 'none' }],
    [{ kind: 'paused' }, { kind: 'paused' }],
    [{ kind: 'running' }, { kind: 'none' }],
  ])('%o → %o', (status, expected) => {
    expect(getPlayingStatus(status)).toEqual(expected);
  });
});

describe('isLoadingStatus', () => {
  it.each<[GameplayStatus, boolean]>([
    [{ kind: 'loading' }, true],
    [{ kind: 'awaitingStart' }, false],
    [{ kind: 'paused' }, false],
    [
      {
        kind: 'countdown',
        digit: 3,
      },
      false,
    ],
    [{ kind: 'none' }, false],
  ])('%o → %s', (status, expected) => {
    expect(isLoadingStatus(status)).toBe(expected);
  });
});

describe('isSamePlaybackStatus', () => {
  it.each<[PlaybackStatus, PlaybackStatus, boolean]>([
    [{ kind: 'running' }, { kind: 'running' }, true],
    [{ kind: 'waiting' }, { kind: 'running' }, false],
    [{ kind: 'loading' }, { kind: 'paused' }, false],
    [
      {
        kind: 'countdown',
        digit: 2,
      },
      {
        kind: 'countdown',
        digit: 2,
      },
      true,
    ],
    [
      {
        kind: 'countdown',
        digit: 3,
      },
      {
        kind: 'countdown',
        digit: 2,
      },
      false,
    ],
    [
      {
        kind: 'countdown',
        digit: 1,
      },
      { kind: 'loading' },
      false,
    ],
  ])('%o, %o → %s', (a, b, expected) => {
    expect(isSamePlaybackStatus(a, b)).toBe(expected);
  });
});
