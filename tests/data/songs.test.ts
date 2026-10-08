import { describe, expect, it } from 'vitest';
import { filterSongs, getAvailableDifficulties, withChartId } from '../../src/data/songs.js';
import type { Song } from '../../src/data/songs.js';

function makeSong(id: string, category: Song['category'], chartIds: Song['chartIds'] = {}): Song {
  return {
    id,
    title: id,
    category,
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `http://pb.test/api/files/songs/${id}/jacket.png`,
    accentColor: 0xffffff,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 10000,
    chartIds,
  };
}

describe('filterSongs', () => {
  const songs = [makeSong('a', 'original'), makeSong('b', 'cover'), makeSong('c', 'original')];

  it('returns every song for all', () => {
    expect(filterSongs(songs, 'all').map((song) => song.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns only original songs in input order', () => {
    expect(filterSongs(songs, 'original').map((song) => song.id)).toEqual(['a', 'c']);
  });

  it('returns only cover songs', () => {
    expect(filterSongs(songs, 'cover').map((song) => song.id)).toEqual(['b']);
  });
});

describe('getAvailableDifficulties', () => {
  it('lists difficulties with a chart id in EASY to EXPERT order', () => {
    const song = makeSong('a', 'original', {
      expert: 'chart_expert',
      easy: 'chart_easy',
      hard: 'chart_hard',
    });

    expect(getAvailableDifficulties(song)).toEqual(['easy', 'hard', 'expert']);
  });
});

describe('withChartId', () => {
  it('returns a new song with the chart id for a new difficulty without changing the input', () => {
    const song = makeSong('a', 'original', { normal: 'chart_normal' });

    const saved = withChartId(song, 'hard', 'chart_hard');

    expect(saved).not.toBe(song);
    expect(saved.chartIds).toEqual({ normal: 'chart_normal', hard: 'chart_hard' });
    expect(getAvailableDifficulties(saved)).toEqual(['normal', 'hard']);
    expect(song.chartIds).toEqual({ normal: 'chart_normal' });
    expect(getAvailableDifficulties(song)).toEqual(['normal']);
  });

  it('returns the same song when the difficulty already has that chart id', () => {
    const song = makeSong('a', 'original', { normal: 'chart_normal' });

    expect(withChartId(song, 'normal', 'chart_normal')).toBe(song);
  });
});
