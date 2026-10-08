import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import { stepRetryDifficulty } from '../../../src/game/result/retryDifficulty.js';

/** normal 채보가 없는 곡. 건너뛰기를 확인한다. */
const song: Song = {
  id: 'song-1',
  title: 'Song 1',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 1000,
  gameEndMs: 10000,
  chartIds: { easy: 'c-easy', hard: 'c-hard', expert: 'c-expert' },
};

describe('stepRetryDifficulty', () => {
  it('moves over difficulties without a chart', () => {
    expect(stepRetryDifficulty(song, 'easy', 1)).toBe('hard');
    expect(stepRetryDifficulty(song, 'hard', -1)).toBe('easy');
  });

  it('stays at both ends', () => {
    expect(stepRetryDifficulty(song, 'easy', -1)).toBe('easy');
    expect(stepRetryDifficulty(song, 'expert', 1)).toBe('expert');
  });

  it('throws for a difficulty without a chart', () => {
    expect(() => stepRetryDifficulty(song, 'normal', 1)).toThrow();
  });
});
