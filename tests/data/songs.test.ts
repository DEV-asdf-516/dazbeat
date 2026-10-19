import { describe, expect, it } from 'vitest';
import {
  filterSongs,
  findChart,
  getAvailableCharts,
  getAvailableDifficulties,
  stepChart,
  withSavedChart,
} from '../../src/data/songs.js';
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

describe('getAvailableCharts', () => {
  it('lists the charts of difficulties with a chart id in EASY to EXPERT order', () => {
    const song = makeSong('a', 'original', {
      expert: 'chart_expert',
      easy: 'chart_easy',
    });

    expect(getAvailableCharts(song)).toEqual([
      {
        song,
        difficulty: 'easy',
        chartId: 'chart_easy',
      },
      {
        song,
        difficulty: 'expert',
        chartId: 'chart_expert',
      },
    ]);
  });

  it('is empty for a song without charts', () => {
    expect(getAvailableCharts(makeSong('a', 'original'))).toEqual([]);
  });
});

describe('findChart', () => {
  const song = makeSong('a', 'original', { normal: 'chart_normal' });

  it('returns the chart of a difficulty with a chart id', () => {
    expect(findChart(song, 'normal')).toEqual({
      song,
      difficulty: 'normal',
      chartId: 'chart_normal',
    });
  });

  it('is undefined for a difficulty without a chart id', () => {
    expect(findChart(song, 'hard')).toBeUndefined();
  });
});

describe('stepChart', () => {
  const song = makeSong('a', 'original', {
    easy: 'chart_easy',
    hard: 'chart_hard',
    expert: 'chart_expert',
  });
  const [easy, hard, expert] = getAvailableCharts(song);
  if (easy === undefined || hard === undefined || expert === undefined) {
    throw new Error('expected three charts');
  }

  it('moves over difficulties without a chart', () => {
    expect(stepChart(easy, 1)).toEqual(hard);
    expect(stepChart(hard, -1)).toEqual(easy);
  });

  it('returns the same chart at both ends', () => {
    expect(stepChart(easy, -1)).toBe(easy);
    expect(stepChart(expert, 1)).toBe(expert);
  });

  it('returns the same chart for a song with a single chart', () => {
    const [only] = getAvailableCharts(makeSong('b', 'original', { normal: 'chart_normal' }));
    if (only === undefined) {
      throw new Error('expected a chart');
    }

    expect(stepChart(only, 1)).toBe(only);
    expect(stepChart(only, -1)).toBe(only);
  });
});

describe('withSavedChart', () => {
  it('saves a new song with the chart id for a new difficulty without changing the input', () => {
    const song = makeSong('a', 'original', { normal: 'chart_normal' });

    const { saved } = withSavedChart([song], 'a', 'hard', 'chart_hard');

    expect(saved).not.toBe(song);
    expect(saved.chartIds).toEqual({
      normal: 'chart_normal',
      hard: 'chart_hard',
    });
    expect(getAvailableDifficulties(saved)).toEqual(['normal', 'hard']);
    expect(song.chartIds).toEqual({ normal: 'chart_normal' });
    expect(getAvailableDifficulties(song)).toEqual(['normal']);
  });

  it('replaces the saved song in a new list without changing the input', () => {
    const other = makeSong('b', 'original');
    const song = makeSong('a', 'original', { normal: 'chart_normal' });
    const songs = [other, song];

    const updated = withSavedChart(songs, 'a', 'hard', 'chart_hard');

    expect(updated.saved.chartIds).toEqual({
      normal: 'chart_normal',
      hard: 'chart_hard',
    });
    expect(updated.songs).not.toBe(songs);
    expect(updated.songs).toEqual([other, updated.saved]);
    expect(updated.songs[0]).toBe(other);
    expect(songs).toEqual([other, song]);
    expect(song.chartIds).toEqual({ normal: 'chart_normal' });
  });

  it('returns the same list and song when the chart id is unchanged', () => {
    const song = makeSong('a', 'original', { normal: 'chart_normal' });
    const songs = [song];

    const updated = withSavedChart(songs, 'a', 'normal', 'chart_normal');

    expect(updated.songs).toBe(songs);
    expect(updated.saved).toBe(song);
  });

  it('throws when the saved song is not in the list', () => {
    expect(() => withSavedChart([makeSong('b', 'original')], 'a', 'hard', 'chart_hard')).toThrow(
      'not in the current song list',
    );
  });
});
