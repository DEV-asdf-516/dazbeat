import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import {
  createSongList,
  cycleSongListFilter,
  focusSongListRow,
  getFocusedSong,
  getSongListRows,
  moveSongListFocus,
  scrollSongList,
  selectSongListFilter,
  toWheelRows,
} from '../../../src/game/editor/songListState.js';
import type { SongListState } from '../../../src/game/editor/songListState.js';

function makeSong(index: number): Song {
  return {
    id: `song-${index}`,
    title: `Song ${index}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
    accentColor: 0xffffff,
    constellation: 'gemini',
    gameStartMs: 1000,
    gameEndMs: 10000,
    chartIds: {},
  };
}

const songs = Array.from({ length: 10 }, (_, index) => makeSong(index));

function list(focusedIndex: number, topIndex: number): SongListState {
  return { filter: 'all', songCount: 10, visibleRowCount: 4, focusedIndex, topIndex };
}

describe('createSongList', () => {
  it('focuses the given song and centers it in the visible rows', () => {
    expect(createSongList(songs, 'song-5', 4, 'all')).toEqual(list(5, 3));
  });

  it('keeps the visible rows inside the list at both ends', () => {
    expect(createSongList(songs, 'song-0', 4, 'all').topIndex).toBe(0);
    expect(createSongList(songs, 'song-9', 4, 'all').topIndex).toBe(6);
  });

  it('focuses the first song without a known song id', () => {
    expect(createSongList(songs, null, 4, 'all')).toEqual(list(0, 0));
    expect(createSongList(songs, 'missing', 4, 'all')).toEqual(list(0, 0));
  });

  it('starts at the top when every song fits', () => {
    expect(createSongList(songs.slice(0, 3), 'song-2', 4, 'all').topIndex).toBe(0);
  });

  it('holds no songs for an empty list', () => {
    const empty = createSongList([], null, 4, 'all');

    expect(empty).toEqual({
      filter: 'all',
      songCount: 0,
      visibleRowCount: 4,
      focusedIndex: 0,
      topIndex: 0,
    });
    expect(moveSongListFocus(empty, 1)).toBe(empty);
    expect(scrollSongList(empty, 1)).toBe(empty);
    expect(focusSongListRow(empty, 0)).toBe(empty);
    expect(getSongListRows(empty, [])).toEqual([]);
  });
});

describe('moveSongListFocus', () => {
  it('moves inside the visible rows without scrolling', () => {
    expect(moveSongListFocus(list(4, 3), 1)).toEqual(list(5, 3));
  });

  it('scrolls just enough to keep the focus visible', () => {
    expect(moveSongListFocus(list(6, 3), 1)).toEqual(list(7, 4));
    expect(moveSongListFocus(list(3, 3), -1)).toEqual(list(2, 2));
  });

  it('stops at both ends and returns the same state', () => {
    const first = list(0, 0);
    const last = list(9, 6);
    expect(moveSongListFocus(first, -1)).toBe(first);
    expect(moveSongListFocus(last, 1)).toBe(last);
  });
});

describe('focusSongListRow', () => {
  it('focuses the song shown in the row', () => {
    expect(focusSongListRow(list(3, 3), 2)).toEqual(list(5, 3));
  });

  it('ignores rows without a song and the already focused row', () => {
    const short = createSongList(songs.slice(0, 2), null, 4, 'all');
    expect(focusSongListRow(short, 2)).toBe(short);
    expect(focusSongListRow(short, 4)).toBe(short);
    expect(focusSongListRow(short, -1)).toBe(short);
    expect(focusSongListRow(short, 0)).toBe(short);
  });
});

describe('scrollSongList', () => {
  it('scrolls and pulls the focus into the visible rows', () => {
    expect(scrollSongList(list(3, 3), 2)).toEqual(list(5, 5));
    expect(scrollSongList(list(6, 3), -2)).toEqual(list(4, 1));
  });

  it('keeps a focus that stays visible', () => {
    expect(scrollSongList(list(5, 3), 1)).toEqual(list(5, 4));
  });

  it('stops at both ends and returns the same state', () => {
    const top = list(0, 0);
    const bottom = list(9, 6);
    expect(scrollSongList(top, -3)).toBe(top);
    expect(scrollSongList(bottom, 3)).toBe(bottom);
    expect(scrollSongList(list(8, 5), 10)).toEqual(list(8, 6));
  });
});

describe('toWheelRows', () => {
  it('moves at least one row per wheel event in its direction', () => {
    expect(toWheelRows(10, 48)).toBe(1);
    expect(toWheelRows(-10, 48)).toBe(-1);
  });

  it('moves a row per row height for larger deltas', () => {
    expect(toWheelRows(144, 48)).toBe(3);
    expect(toWheelRows(-100, 48)).toBe(-2);
  });

  it('does not move without a delta', () => {
    expect(toWheelRows(0, 48)).toBe(0);
  });
});

describe('getSongListRows', () => {
  it('lists the visible songs with the focused mark', () => {
    const rows = getSongListRows(list(4, 3), songs);

    expect(rows.map(({ rowIndex, song }) => [rowIndex, song.id])).toEqual([
      [0, 'song-3'],
      [1, 'song-4'],
      [2, 'song-5'],
      [3, 'song-6'],
    ]);
    expect(rows.map(({ isFocused }) => isFocused)).toEqual([false, true, false, false]);
  });

  it('shows fewer rows when the list is shorter than the visible rows', () => {
    expect(getSongListRows(createSongList(songs.slice(0, 2), null, 4, 'all'), songs)).toHaveLength(
      2,
    );
  });

  it('drops rows of songs removed after opening', () => {
    expect(getSongListRows(list(4, 3), songs.slice(0, 5))).toHaveLength(2);
  });
});

describe('song list filter', () => {
  // 짝수 번은 original, 홀수 번은 cover 인 목록
  const mixed = songs.map((song, index) => ({
    ...song,
    category: index % 2 === 0 ? ('original' as const) : ('cover' as const),
  }));

  it('counts and shows only the songs of the filter', () => {
    const covers = createSongList(mixed, null, 4, 'cover');
    expect(covers.songCount).toBe(5);
    expect(getSongListRows(covers, mixed).map(({ song }) => song.id)).toEqual([
      'song-1',
      'song-3',
      'song-5',
      'song-7',
    ]);
  });

  it('focuses the given song by its index in the filtered list', () => {
    const covers = createSongList(mixed, 'song-5', 4, 'cover');
    expect(covers.focusedIndex).toBe(2);
    expect(getFocusedSong(covers, mixed)?.id).toBe('song-5');
  });

  it('keeps the focused song when it is in the new filter', () => {
    const all = createSongList(mixed, 'song-6', 4, 'all');
    const originals = selectSongListFilter(all, mixed, 'original');
    expect(originals.filter).toBe('original');
    expect(getFocusedSong(originals, mixed)?.id).toBe('song-6');
  });

  it('focuses the first song when the focused song is not in the new filter', () => {
    const all = createSongList(mixed, 'song-6', 4, 'all');
    const covers = selectSongListFilter(all, mixed, 'cover');
    expect(getFocusedSong(covers, mixed)?.id).toBe('song-1');
    expect(covers.topIndex).toBe(0);
  });

  it('returns the same state for the current filter', () => {
    const all = createSongList(mixed, null, 4, 'all');
    expect(selectSongListFilter(all, mixed, 'all')).toBe(all);
  });

  it('cycles all → original → cover → all and back', () => {
    const all = createSongList(mixed, null, 4, 'all');
    const original = cycleSongListFilter(all, mixed, 1);
    const cover = cycleSongListFilter(original, mixed, 1);
    expect([original.filter, cover.filter, cycleSongListFilter(cover, mixed, 1).filter]).toEqual([
      'original',
      'cover',
      'all',
    ]);
    expect(cycleSongListFilter(all, mixed, -1).filter).toBe('cover');
  });

  it('has no rows and no focused song for an empty filter', () => {
    const originalsOnly = mixed.filter((song) => song.category === 'original');
    const covers = createSongList(originalsOnly, null, 4, 'cover');
    expect(covers.songCount).toBe(0);
    expect(getSongListRows(covers, originalsOnly)).toEqual([]);
    expect(getFocusedSong(covers, originalsOnly)).toBeUndefined();
  });
});
