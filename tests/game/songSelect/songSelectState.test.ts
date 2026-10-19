import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import type { Difficulty } from '../../../src/rhythm/types.js';
import type { ChartRecord } from '../../../src/storage/chartRecords.js';
import {
  createSongSelectState,
  cycleFilter,
  getPlayableSelection,
  getSongPage,
  getSongRows,
  getSongDifficultyAppearance,
  getSongRowNodeId,
  hasNewCurrentSong,
  isSameSelection,
  moveDifficulty,
  moveSong,
  selectDifficulty,
  selectFilter,
  selectSong,
} from '../../../src/game/songSelect/songSelectState.js';
import type { SongRowView, SongSelectState } from '../../../src/game/songSelect/songSelectState.js';

function makeSong(id: string, category: Song['category'], chartIds: Song['chartIds']): Song {
  return {
    id,
    title: id,
    category,
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `http://pb.test/api/files/songs/${id}/jacket.png`,
    accentColor: 0xffffff,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds,
  };
}

function songOf(state: SongSelectState): Song | undefined {
  return state.current.kind === 'song' ? state.current.song : undefined;
}

function indexOf(state: SongSelectState): number | null {
  return state.current.kind === 'song' ? state.current.index : null;
}

function difficultyOf(state: SongSelectState): Difficulty | null {
  return getPlayableSelection(state)?.difficulty ?? null;
}

const FULL_SONG = makeSong('full', 'original', {
  easy: 'easy.json',
  normal: 'normal.json',
  hard: 'hard.json',
  expert: 'expert.json',
});
const EASY_HARD_SONG = makeSong('easy-hard', 'original', {
  easy: 'easy.json',
  hard: 'hard.json',
});
const COVER_SONG = makeSong('cover', 'cover', {
  normal: 'normal.json',
  hard: 'hard.json',
});
const NO_CHART_SONG = makeSong('no-chart', 'original', {});
const SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG, COVER_SONG];
const ORIGINAL_SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG];

describe('createSongSelectState', () => {
  it('starts on the all filter with the first song and its first available difficulty', () => {
    const state = createSongSelectState([EASY_HARD_SONG, FULL_SONG]);

    expect(state.filter).toBe('all');
    expect(indexOf(state)).toBe(0);
    expect(difficultyOf(state)).toBe('easy');
    expect(songOf(state)).toBe(EASY_HARD_SONG);
  });

  it('has no song or difficulty when there are no songs', () => {
    const state = createSongSelectState([]);

    expect(state.current).toEqual({ kind: 'none' });
  });
});

describe('moveSong', () => {
  it('stops at the top and bottom of the list', () => {
    const initial = createSongSelectState(SONGS);

    expect(indexOf(moveSong(initial, -1))).toBe(0);
    const last = moveSong(moveSong(initial, 1), 1);
    expect(indexOf(last)).toBe(2);
    expect(indexOf(moveSong(last, 1))).toBe(2);
  });

  it('keeps the current difficulty when the new song has it', () => {
    const onHard = selectDifficulty(createSongSelectState(SONGS), 'hard');

    expect(difficultyOf(moveSong(onHard, 1))).toBe('hard');
  });

  it('switches to the first available difficulty when the new song lacks the current one', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS), 'normal');

    expect(difficultyOf(moveSong(onNormal, 1))).toBe('easy');
  });
});

describe('selectSong', () => {
  it('ignores out-of-range indexes', () => {
    const initial = createSongSelectState(SONGS);

    expect(selectSong(initial, -1)).toEqual(initial);
    expect(selectSong(initial, SONGS.length)).toEqual(initial);
  });

  it('selects the song and applies the difficulty rule', () => {
    const onExpert = selectDifficulty(createSongSelectState(SONGS), 'expert');
    const state = selectSong(onExpert, 2);

    expect(songOf(state)).toBe(COVER_SONG);
    expect(difficultyOf(state)).toBe('normal');
  });
});

describe('moveDifficulty', () => {
  it('skips difficulties without a chart and stops at the ends', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(difficultyOf(state)).toBe('easy');
    expect(difficultyOf(moveDifficulty(state, -1))).toBe('easy');
    const hard = moveDifficulty(state, 1);
    expect(difficultyOf(hard)).toBe('hard');
    expect(difficultyOf(moveDifficulty(hard, 1))).toBe('hard');
  });
});

describe('song without charts', () => {
  it('is selected without a chart and ignores difficulty changes', () => {
    const state = createSongSelectState([NO_CHART_SONG, FULL_SONG]);

    expect(state.current).toEqual({
      kind: 'song',
      index: 0,
      song: NO_CHART_SONG,
      chart: null,
    });
    expect(getPlayableSelection(state)).toBeNull();
    expect(moveDifficulty(state, 1)).toBe(state);
    expect(selectDifficulty(state, 'easy')).toBe(state);
    expect(getSongDifficultyAppearance(state, 'easy', true)).toBe('disabled');
  });

  it('picks the first chart of the next song after passing a song without charts', () => {
    const onExpert = selectDifficulty(createSongSelectState([FULL_SONG, NO_CHART_SONG]), 'expert');
    const noChart = moveSong(onExpert, 1);

    expect(difficultyOf(noChart)).toBeNull();
    expect(difficultyOf(moveSong(noChart, -1))).toBe('easy');
  });
});

describe('selectDifficulty', () => {
  it('keeps the state for a difficulty without a chart', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(selectDifficulty(state, 'normal')).toEqual(state);
  });

  it('selects an available difficulty', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(difficultyOf(selectDifficulty(state, 'hard'))).toBe('hard');
  });
});

describe('cycleFilter', () => {
  it('cycles all → original → cover → all and resets the song index', () => {
    const atSecond = moveSong(createSongSelectState(SONGS), 1);
    const original = cycleFilter(atSecond, 1);

    expect(original.filter).toBe('original');
    expect(original.songs).toEqual(ORIGINAL_SONGS);
    expect(indexOf(original)).toBe(0);
    const cover = cycleFilter(original, 1);
    expect(cover.filter).toBe('cover');
    expect(cover.songs).toEqual([COVER_SONG]);
    expect(cycleFilter(cover, 1).filter).toBe('all');
  });

  it('cycles backwards from all to cover', () => {
    const state = cycleFilter(createSongSelectState(SONGS), -1);

    expect(state.filter).toBe('cover');
    expect(indexOf(state)).toBe(0);
  });
});

describe('selectFilter', () => {
  it('clears the difficulty for an empty list and restores it when returning to all', () => {
    const empty = selectFilter(createSongSelectState(ORIGINAL_SONGS), 'cover');

    expect(empty.songs).toEqual([]);
    expect(difficultyOf(empty)).toBeNull();
    expect(songOf(empty)).toBeUndefined();
    const all = selectFilter(empty, 'all');
    expect(songOf(all)).toBe(FULL_SONG);
    expect(difficultyOf(all)).toBe('easy');
  });
});

describe('immutability', () => {
  it('does not modify the input state', () => {
    const initial = createSongSelectState(SONGS);
    const snapshot = structuredClone(initial);

    moveSong(initial, 1);
    selectSong(initial, 2);
    moveDifficulty(initial, 1);
    selectDifficulty(initial, 'hard');
    cycleFilter(initial, 1);
    selectFilter(initial, 'cover');

    expect(initial).toEqual(snapshot);
  });
});

describe('getPlayableSelection', () => {
  it('returns the current song and difficulty', () => {
    expect(getPlayableSelection(createSongSelectState(SONGS))).toEqual({
      song: FULL_SONG,
      difficulty: 'easy',
      chartId: 'easy.json',
    });
  });

  it('returns null without songs', () => {
    expect(getPlayableSelection(createSongSelectState([]))).toBeNull();
  });

  it('returns null for a song without charts', () => {
    const noCharts = makeSong('none', 'original', {});
    expect(getPlayableSelection(createSongSelectState([noCharts]))).toBeNull();
  });
});

describe('isSameSelection', () => {
  it('is true when only the filter changes but the song stays', () => {
    const state = createSongSelectState(SONGS);
    expect(isSameSelection(state, selectFilter(state, 'original'))).toBe(true);
  });

  it('is false when the difficulty changes', () => {
    const state = createSongSelectState(SONGS);
    expect(isSameSelection(state, moveDifficulty(state, 1))).toBe(false);
  });

  it('is false when the song changes', () => {
    const state = createSongSelectState(SONGS);
    expect(isSameSelection(state, moveSong(state, 1))).toBe(false);
  });
});

describe('getSongRowNodeId', () => {
  const played: ChartRecord = {
    score: 500000,
    accuracy: 0.8,
    maxCombo: 40,
    cleared: false,
  };
  const cleared: ChartRecord = {
    score: 900000,
    accuracy: 0.95,
    maxCombo: 120,
    cleared: true,
  };

  it('shows selected regardless of hover and record', () => {
    expect(getSongRowNodeId(null, true, false)).toBe('R17');
    expect(getSongRowNodeId(played, true, true)).toBe('R17');
    expect(getSongRowNodeId(cleared, true, true)).toBe('R17');
  });

  it('shows hover over the persistent state', () => {
    expect(getSongRowNodeId(null, false, true)).toBe('R16');
    expect(getSongRowNodeId(played, false, true)).toBe('R16');
    expect(getSongRowNodeId(cleared, false, true)).toBe('R16');
  });

  it('shows idle without a record', () => {
    expect(getSongRowNodeId(null, false, false)).toBe('R15');
  });

  it('shows played for a record that is not cleared', () => {
    expect(getSongRowNodeId(played, false, false)).toBe('C:node-played');
  });

  it('shows cleared for a cleared record', () => {
    expect(getSongRowNodeId(cleared, false, false)).toBe('R18');
  });
});

describe('getSongRows', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.chartIds),
    );
  const songAndSelection = (rows: readonly SongRowView[]) =>
    rows.map((row) => (row.kind === 'song' ? [row.song, row.isSelected] : null));

  it('is all empty rows when there are no songs', () => {
    expect(getSongRows(createSongSelectState([]), 3)).toEqual([
      { kind: 'empty' },
      { kind: 'empty' },
      { kind: 'empty' },
    ]);
  });

  it('selects the first row and fills the rest of a short page with empty rows', () => {
    expect(getSongRows(createSongSelectState([FULL_SONG, EASY_HARD_SONG]), 3)).toEqual([
      {
        kind: 'song',
        song: FULL_SONG,
        isSelected: true,
        recordChart: {
          song: FULL_SONG,
          difficulty: 'easy',
          chartId: 'easy.json',
        },
      },
      {
        kind: 'song',
        song: EASY_HARD_SONG,
        isSelected: false,
        recordChart: {
          song: EASY_HARD_SONG,
          difficulty: 'easy',
          chartId: 'easy.json',
        },
      },
      { kind: 'empty' },
    ]);
  });

  it('keeps the selected last row of a full page on that page', () => {
    const list = songs(4);

    expect(songAndSelection(getSongRows(selectSong(createSongSelectState(list), 2), 3))).toEqual([
      [list[0], false],
      [list[1], false],
      [list[2], true],
    ]);
  });

  it('shows the next page with the selected row first and empty rows after the last song', () => {
    const list = songs(4);

    expect(songAndSelection(getSongRows(selectSong(createSongSelectState(list), 3), 3))).toEqual([
      [list[3], true],
      null,
      null,
    ]);
  });

  it('uses the selected difficulty chart of each row song, or null when the song lacks it', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS), 'normal');

    expect(
      getSongRows(onNormal, 3).map((row) => (row.kind === 'song' ? row.recordChart : null)),
    ).toEqual([
      {
        song: FULL_SONG,
        difficulty: 'normal',
        chartId: 'normal.json',
      },
      null,
      {
        song: COVER_SONG,
        difficulty: 'normal',
        chartId: 'normal.json',
      },
    ]);
  });

  it('has no record chart in any row while a song without charts is selected', () => {
    expect(getSongRows(createSongSelectState([NO_CHART_SONG, FULL_SONG]), 2)).toEqual([
      {
        kind: 'song',
        song: NO_CHART_SONG,
        isSelected: true,
        recordChart: null,
      },
      {
        kind: 'song',
        song: FULL_SONG,
        isSelected: false,
        recordChart: null,
      },
    ]);
  });
});

describe('hasNewCurrentSong', () => {
  it('is false when only the difficulty changes', () => {
    const state = createSongSelectState(SONGS);

    expect(hasNewCurrentSong(state, selectDifficulty(state, 'hard'))).toBe(false);
  });

  it('is true when the current song changes', () => {
    const state = createSongSelectState(SONGS);

    expect(hasNewCurrentSong(state, moveSong(state, 1))).toBe(true);
  });

  it('is false when the next state has no song', () => {
    const state = createSongSelectState(ORIGINAL_SONGS);

    expect(hasNewCurrentSong(state, selectFilter(state, 'cover'))).toBe(false);
  });

  it('is true when a song appears after having none', () => {
    const empty = selectFilter(createSongSelectState(ORIGINAL_SONGS), 'cover');

    expect(hasNewCurrentSong(empty, selectFilter(empty, 'all'))).toBe(true);
  });
});

describe('getSongPage', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.chartIds),
    );

  it('is the first page with no selected slot when there are no songs', () => {
    expect(getSongPage(createSongSelectState([]), 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      pageCount: 0,
      selectedSlot: null,
    });
  });

  it('keeps the last row of a page on that page', () => {
    const state = selectSong(createSongSelectState(songs(7)), 2);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      pageCount: 3,
      selectedSlot: 2,
    });
  });

  it('moves the next row to the first slot of the next page', () => {
    const state = selectSong(createSongSelectState(songs(7)), 3);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 3,
      pageNumber: 2,
      pageCount: 3,
      selectedSlot: 0,
    });
  });

  it('puts a lone song on the last page', () => {
    const state = selectSong(createSongSelectState(songs(7)), 6);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 6,
      pageNumber: 3,
      pageCount: 3,
      selectedSlot: 0,
    });
  });

  it('counts only full or partial pages', () => {
    expect(getSongPage(createSongSelectState(songs(6)), 3).pageCount).toBe(2);
    expect(getSongPage(createSongSelectState(songs(7)), 3).pageCount).toBe(3);
  });
});

describe('getSongDifficultyAppearance', () => {
  it('is disabled when there is no song', () => {
    expect(getSongDifficultyAppearance(createSongSelectState([]), 'easy', true)).toBe('disabled');
  });

  it('reads selection and chart availability from the current song', () => {
    const state = createSongSelectState([EASY_HARD_SONG]);

    expect(getSongDifficultyAppearance(state, 'normal', true)).toBe('disabled');
    expect(getSongDifficultyAppearance(state, 'easy', false)).toBe('selected');
    expect(getSongDifficultyAppearance(state, 'hard', true)).toBe('emphasized');
  });
});
