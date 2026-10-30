import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import {
  createSongList,
  focusSongListRow,
  getFocusedSong,
  getSongListRows,
  moveSongListFocus,
  scrollSongList,
  withSongCount,
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
  return {
    songCount: 10,
    visibleRowCount: 4,
    focusedIndex,
    topIndex,
  };
}

describe('createSongList', () => {
  it('focuses the given song and centers it in the visible rows', () => {
    expect(createSongList(songs, 'song-5', 4)).toEqual(list(5, 3));
  });

  it('keeps the visible rows inside the list at both ends', () => {
    expect(createSongList(songs, 'song-0', 4).topIndex).toBe(0);
    expect(createSongList(songs, 'song-9', 4).topIndex).toBe(6);
  });

  it('focuses the first song without a known song id', () => {
    expect(createSongList(songs, null, 4)).toEqual(list(0, 0));
    expect(createSongList(songs, 'missing', 4)).toEqual(list(0, 0));
  });

  it('starts at the top when every song fits', () => {
    expect(createSongList(songs.slice(0, 3), 'song-2', 4).topIndex).toBe(0);
  });

  it('holds no songs for an empty list', () => {
    const empty = createSongList([], null, 4);

    expect(empty).toEqual({
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
    const short = createSongList(songs.slice(0, 2), null, 4);
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
    expect(getSongListRows(createSongList(songs.slice(0, 2), null, 4), songs)).toHaveLength(2);
  });

  it('drops rows of songs removed after opening', () => {
    expect(getSongListRows(list(4, 3), songs.slice(0, 5))).toHaveLength(2);
  });
});

describe('withSongCount', () => {
  it('counts appended songs and keeps the focus and scroll', () => {
    expect(withSongCount(list(7, 6), 20)).toEqual({
      ...list(7, 6),
      songCount: 20,
    });
  });

  it('returns the same state for the same song count', () => {
    const current = list(4, 3);
    expect(withSongCount(current, 10)).toBe(current);
  });

  it('lists the appended songs once the count grows', () => {
    const grown = withSongCount(createSongList(songs.slice(0, 2), null, 4), 10);
    expect(getSongListRows(grown, songs).map(({ song }) => song.id)).toEqual([
      'song-0',
      'song-1',
      'song-2',
      'song-3',
    ]);
  });
});

describe('getFocusedSong', () => {
  it('returns the focused song and none for an empty list', () => {
    expect(getFocusedSong(list(4, 3), songs)?.id).toBe('song-4');
    expect(getFocusedSong(createSongList([], null, 4), [])).toBeUndefined();
  });
});
