import { describe, expect, it } from 'vitest';
import { getYouTubeErrorKind } from '../../src/audio/YouTubePlayer.js';

describe('getYouTubeErrorKind', () => {
  it.each([
    [2, 'invalidParameter'],
    [5, 'html5PlayerError'],
    [100, 'videoNotFound'],
    [101, 'embeddingNotAllowed'],
    [150, 'embeddingNotAllowed'],
    [9999, 'unknown'],
  ])('maps error code %i to %s', (code, kind) => {
    expect(getYouTubeErrorKind(code)).toBe(kind);
  });
});
