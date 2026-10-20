import { describe, expect, it } from 'vitest';
import {
  getGameFraction,
  getPlayDurationMs,
  getPlaybackStartMs,
} from '../../src/rhythm/playTiming.js';

describe('getPlaybackStartMs', () => {
  it.each([
    [0, -2000],
    [1999, -1],
    [2000, 0],
    [2001, 1],
    [60000, 58000],
  ])('starts playback for gameStartMs %d at %d', (gameStartMs, playbackStartMs) => {
    expect(getPlaybackStartMs(gameStartMs)).toBe(playbackStartMs);
  });
});

describe('getPlayDurationMs', () => {
  it.each([
    [0, 10000, 12000],
    [5000, 10000, 7000],
  ])('includes the lead-in for game %d–%d ms (%d)', (gameStartMs, gameEndMs, durationMs) => {
    expect(getPlayDurationMs(gameStartMs, gameEndMs)).toBe(durationMs);
  });
});

describe('getGameFraction', () => {
  it.each([
    [1000, 0],
    [2000, 0.5],
    [3000, 1],
  ])('maps %d ms inside the game range to %d', (timeMs, fraction) => {
    expect(getGameFraction(1000, 3000, timeMs)).toBe(fraction);
  });

  it.each([
    [0, -0.5],
    [4000, 1.5],
  ])('keeps %d ms outside the range proportional (%d)', (timeMs, fraction) => {
    expect(getGameFraction(1000, 3000, timeMs)).toBe(fraction);
  });
});
