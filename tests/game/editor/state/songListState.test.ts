import { describe, expect, it } from 'vitest';
import type { Song } from '../../../../src/data/songs.js';
import {
  createSongList,
  focusSongListRow,
  getChangedRegions,
  getChangedRowIndexes,
  getFocusedSong,
  getListFrame,
  getSongListRows,
  moveSongListFocus,
  scrollSongList,
  withSongCount,
} from '../../../../src/game/editor/state/songListState.js';
import type {
  ChartEditorSelectView,
  SongListState,
} from '../../../../src/game/editor/state/songListState.js';

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
    hover: null,
  };
}

describe('createSongList', () => {
  it('focuses the given song and centers it in the visible rows', () => {
    expect(createSongList(songs, 'song-5', 4, null)).toEqual(list(5, 3));
  });

  it('keeps the visible rows inside the list at both ends', () => {
    expect(createSongList(songs, 'song-0', 4, null).topIndex).toBe(0);
    expect(createSongList(songs, 'song-9', 4, null).topIndex).toBe(6);
  });

  it('focuses the first song without a known song id', () => {
    expect(createSongList(songs, null, 4, null)).toEqual(list(0, 0));
    expect(createSongList(songs, 'missing', 4, null)).toEqual(list(0, 0));
  });

  it('starts at the top when every song fits', () => {
    expect(createSongList(songs.slice(0, 3), 'song-2', 4, null).topIndex).toBe(0);
  });

  it('holds no songs for an empty list', () => {
    const empty = createSongList([], null, 4, null);

    expect(empty).toEqual({
      songCount: 0,
      visibleRowCount: 4,
      focusedIndex: 0,
      topIndex: 0,
      hover: null,
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
    const short = createSongList(songs.slice(0, 2), null, 4, null);
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
    expect(getSongListRows(createSongList(songs.slice(0, 2), null, 4, null), songs)).toHaveLength(
      2,
    );
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
    const grown = withSongCount(createSongList(songs.slice(0, 2), null, 4, null), 10);
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
    expect(getFocusedSong(createSongList([], null, 4, null), [])).toBeUndefined();
  });
});

function viewOf(
  state: SongListState,
  overrides: Partial<Omit<ChartEditorSelectView, 'rows' | 'topIndex' | 'songCount'>> = {},
): ChartEditorSelectView {
  return {
    category: 'all',
    hover: null,
    rows: getSongListRows(state, songs),
    topIndex: state.topIndex,
    songCount: state.songCount,
    notice: null,
    status: null,
    canRetry: false,
    ...overrides,
  };
}

describe('getChangedRegions', () => {
  const view = viewOf(list(1, 0));

  it('redraws only the focus when the focus moves within the rows', () => {
    expect(getChangedRegions(view, viewOf(list(2, 0)))).toEqual(['listFocus']);
  });

  it('redraws the rows, the focus and the frame when the list scrolls', () => {
    expect(getChangedRegions(view, viewOf(scrollSongList(list(1, 0), 2)))).toEqual([
      'listFocus',
      'listFrame',
      'listRows',
    ]);
  });

  it('redraws only the filter segments when only the hover changes', () => {
    expect(
      getChangedRegions(
        view,
        viewOf(list(1, 0), {
          hover: {
            kind: 'filter',
            category: 'cover',
          },
        }),
      ),
    ).toEqual(['filterSegments']);
  });

  it('redraws only the hovered button when only a button hover changes', () => {
    const hovered = viewOf(list(1, 0), {
      hover: {
        kind: 'button',
        button: 'back',
        isPressed: false,
      },
    });

    expect(getChangedRegions(view, hovered)).toEqual(['backButton']);
    expect(
      getChangedRegions(
        hovered,
        viewOf(list(1, 0), {
          hover: {
            kind: 'button',
            button: 'retry',
            isPressed: false,
          },
        }),
      ),
    ).toEqual(['backButton', 'retryButton']);
  });

  it('redraws every button on the first render', () => {
    expect(getChangedRegions(null, view)).toEqual(
      expect.arrayContaining(['backButton', 'retryButton']),
    );
  });

  it('redraws the filter indicator and segments when the category changes', () => {
    expect(getChangedRegions(view, viewOf(list(1, 0), { category: 'cover' }))).toEqual([
      'filterIndicator',
      'filterSegments',
    ]);
  });
});

describe('getChangedRowIndexes', () => {
  it('is every shown row on the first render', () => {
    expect(getChangedRowIndexes(null, viewOf(list(0, 0)))).toEqual([0, 1, 2, 3]);
  });

  it('is the rows whose song changed', () => {
    expect(getChangedRowIndexes(viewOf(list(0, 0)), viewOf(list(0, 1)))).toEqual([0, 1, 2, 3]);
    expect(getChangedRowIndexes(viewOf(list(0, 0)), viewOf(list(1, 0)))).toEqual([]);
  });
});

describe('getListFrame', () => {
  it('tells whether there are rows and whether the list scrolls', () => {
    expect(getListFrame(viewOf(list(0, 2)))).toEqual({
      hasRows: true,
      scroll: {
        kind: 'thumb',
        firstIndex: 2,
        visibleCount: 4,
        totalCount: 10,
      },
    });
    expect(
      getListFrame(
        viewOf({
          songCount: 3,
          visibleRowCount: 4,
          focusedIndex: 0,
          topIndex: 0,
          hover: null,
        }),
      ),
    ).toEqual({
      hasRows: true,
      scroll: { kind: 'hidden' },
    });
    expect(
      getListFrame(
        viewOf({
          songCount: 0,
          visibleRowCount: 4,
          focusedIndex: 0,
          topIndex: 0,
          hover: null,
        }),
      ),
    ).toEqual({
      hasRows: false,
      scroll: { kind: 'hidden' },
    });
  });
});
