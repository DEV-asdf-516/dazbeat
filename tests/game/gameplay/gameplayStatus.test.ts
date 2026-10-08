import { describe, expect, it } from 'vitest';
import { getPlayingStatus, isLoadingStatus } from '../../../src/game/gameplay/gameplayStatus.js';

describe('getPlayingStatus', () => {
  it.each([
    ['unstarted', 'none'],
    ['ended', 'none'],
    ['playing', 'none'],
    ['paused', 'paused'],
    ['buffering', 'buffering'],
    ['cued', 'none'],
  ] as const)('%s → %s', (state, expected) => {
    expect(getPlayingStatus(state)).toBe(expected);
  });
});

describe('isLoadingStatus', () => {
  it.each([
    ['loading', true],
    ['awaitingStart', false],
    ['preparing', true],
    ['buffering', true],
    ['paused', false],
    ['none', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isLoadingStatus(status)).toBe(expected);
  });
});
