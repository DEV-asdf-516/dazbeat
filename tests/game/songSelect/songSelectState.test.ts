import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import type { Difficulty } from '../../../src/rhythm/types.js';
import type { ChartRecord } from '../../../src/storage/chartRecords.js';
import {
  canSelectRandomSong,
  createSongSelectState,
  getJacketRange,
  getPlayableSelection,
  getSongPage,
  getSongRows,
  getSongDifficultyAppearance,
  getSongRowNodeId,
  getSongSelectNotice,
  getSongSelectTarget,
  hasNewCurrentSong,
  isOnLastLoadedPage,
  isSameSelection,
  moveDifficulty,
  moveSong,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  withFilter,
  withSongs,
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
  4: {
    easy: 'easy.json',
    normal: 'normal.json',
    hard: 'hard.json',
    expert: 'expert.json',
  },
});
const EASY_HARD_SONG = makeSong('easy-hard', 'original', {
  4: {
    easy: 'easy.json',
    hard: 'hard.json',
  },
});
const COVER_SONG = makeSong('cover', 'cover', {
  4: {
    normal: 'normal.json',
    hard: 'hard.json',
  },
});
const NO_CHART_SONG = makeSong('no-chart', 'original', {});
const SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG, COVER_SONG];
const ORIGINAL_SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG];

describe('createSongSelectState', () => {
  it('starts on the given filter with the first song and its first available difficulty', () => {
    const state = createSongSelectState([EASY_HARD_SONG, FULL_SONG], 'original', 4);

    expect(state.filter).toBe('original');
    expect(indexOf(state)).toBe(0);
    expect(difficultyOf(state)).toBe('easy');
    expect(songOf(state)).toBe(EASY_HARD_SONG);
  });

  it('has no song or difficulty when there are no songs', () => {
    const state = createSongSelectState([], 'all', 4);

    expect(state.current).toEqual({
      kind: 'none',
      difficulty: null,
    });
  });
});

describe('moveSong', () => {
  it('stops at the top and bottom of the list', () => {
    const initial = createSongSelectState(SONGS, 'all', 4);

    expect(indexOf(moveSong(initial, -1))).toBe(0);
    const last = moveSong(moveSong(initial, 1), 1);
    expect(indexOf(last)).toBe(2);
    expect(indexOf(moveSong(last, 1))).toBe(2);
  });

  it('keeps the current difficulty when the new song has it', () => {
    const onHard = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'hard');

    expect(difficultyOf(moveSong(onHard, 1))).toBe('hard');
  });

  it('switches to the first available difficulty when the new song lacks the current one', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'normal');

    expect(difficultyOf(moveSong(onNormal, 1))).toBe('easy');
  });
});

describe('selectSong', () => {
  it('ignores out-of-range indexes', () => {
    const initial = createSongSelectState(SONGS, 'all', 4);

    expect(selectSong(initial, -1)).toEqual(initial);
    expect(selectSong(initial, SONGS.length)).toEqual(initial);
  });

  it('selects the song and applies the difficulty rule', () => {
    const onExpert = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'expert');
    const state = selectSong(onExpert, 2);

    expect(songOf(state)).toBe(COVER_SONG);
    expect(difficultyOf(state)).toBe('normal');
  });
});

describe('selectRandomSong', () => {
  it('never picks the current song', () => {
    const state = createSongSelectState(SONGS, 'all', 4);

    for (const value of [0, 0.5, 0.99]) {
      expect(songOf(selectRandomSong(state, () => value))).not.toBe(FULL_SONG);
    }
  });

  it('picks the candidate the random value points at in list order', () => {
    const state = moveSong(createSongSelectState(SONGS, 'all', 4), 1);

    expect(songOf(selectRandomSong(state, () => 0))).toBe(FULL_SONG);
    expect(songOf(selectRandomSong(state, () => 0.5))).toBe(COVER_SONG);
  });

  it('does not pick a song without charts', () => {
    const state = createSongSelectState([FULL_SONG, NO_CHART_SONG, COVER_SONG], 'all', 4);

    expect(songOf(selectRandomSong(state, () => 0))).toBe(COVER_SONG);
    expect(songOf(selectRandomSong(state, () => 0.99))).toBe(COVER_SONG);
  });

  it('keeps the current difficulty when the picked song has it', () => {
    const state = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'hard');

    expect(difficultyOf(selectRandomSong(state, () => 0))).toBe('hard');
  });

  it('switches to the first available difficulty when the picked song lacks the current one', () => {
    const state = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'normal');

    const next = selectRandomSong(state, () => 0);

    expect(songOf(next)).toBe(EASY_HARD_SONG);
    expect(difficultyOf(next)).toBe('easy');
  });

  it('is disabled and keeps the state with one playable song or less', () => {
    const state = createSongSelectState([FULL_SONG, NO_CHART_SONG], 'all', 4);

    expect(canSelectRandomSong(state)).toBe(false);
    expect(selectRandomSong(state, () => 0)).toBe(state);
    expect(canSelectRandomSong(createSongSelectState(SONGS, 'all', 4))).toBe(true);
  });

  it('is disabled for an empty list', () => {
    const state = createSongSelectState([], 'all', 4);

    expect(canSelectRandomSong(state)).toBe(false);
    expect(selectRandomSong(state, () => 0)).toBe(state);
  });

  it('picks only songs with charts of the state lane count', () => {
    const FIVE_LANE_SONG = makeSong('five-lane', 'original', { 5: { easy: 'easy-5k.json' } });
    const state = createSongSelectState([FULL_SONG, FIVE_LANE_SONG, COVER_SONG], 'all', 4);

    expect(songOf(selectRandomSong(state, () => 0))).toBe(COVER_SONG);
    expect(songOf(selectRandomSong(state, () => 0.99))).toBe(COVER_SONG);
    expect(canSelectRandomSong(createSongSelectState([FULL_SONG, FIVE_LANE_SONG], 'all', 4))).toBe(
      false,
    );
  });

  it('picks from every candidate when the current song has no charts', () => {
    const state = createSongSelectState([NO_CHART_SONG, FULL_SONG, COVER_SONG], 'all', 4);

    expect(songOf(selectRandomSong(state, () => 0))).toBe(FULL_SONG);
    expect(songOf(selectRandomSong(state, () => 0.5))).toBe(COVER_SONG);
  });
});

describe('moveDifficulty', () => {
  it('skips difficulties without a chart and stops at the ends', () => {
    const state = selectSong(createSongSelectState(SONGS, 'all', 4), 1);

    expect(difficultyOf(state)).toBe('easy');
    expect(difficultyOf(moveDifficulty(state, -1))).toBe('easy');
    const hard = moveDifficulty(state, 1);
    expect(difficultyOf(hard)).toBe('hard');
    expect(difficultyOf(moveDifficulty(hard, 1))).toBe('hard');
  });
});

describe('song without charts', () => {
  it('is selected without a chart and ignores difficulty changes', () => {
    const state = createSongSelectState([NO_CHART_SONG, FULL_SONG], 'all', 4);

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
    const onExpert = selectDifficulty(
      createSongSelectState([FULL_SONG, NO_CHART_SONG], 'all', 4),
      'expert',
    );
    const noChart = moveSong(onExpert, 1);

    expect(difficultyOf(noChart)).toBeNull();
    expect(difficultyOf(moveSong(noChart, -1))).toBe('easy');
  });
});

describe('selectDifficulty', () => {
  it('keeps the state for a difficulty without a chart', () => {
    const state = selectSong(createSongSelectState(SONGS, 'all', 4), 1);

    expect(selectDifficulty(state, 'normal')).toEqual(state);
  });

  it('selects an available difficulty', () => {
    const state = selectSong(createSongSelectState(SONGS, 'all', 4), 1);

    expect(difficultyOf(selectDifficulty(state, 'hard'))).toBe('hard');
  });
});

describe('withFilter', () => {
  it('selects the first song of the new list and keeps the selected difficulty', () => {
    const onHard = selectDifficulty(moveSong(createSongSelectState(SONGS, 'all', 4), 1), 'hard');
    const cover = withFilter(onHard, 'cover', [COVER_SONG]);

    expect(cover.filter).toBe('cover');
    expect(cover.songs).toEqual([COVER_SONG]);
    expect(indexOf(cover)).toBe(0);
    expect(difficultyOf(cover)).toBe('hard');
  });

  it('switches to the first available difficulty when the first song lacks the selected one', () => {
    const onEasy = createSongSelectState(ORIGINAL_SONGS, 'original', 4);

    expect(difficultyOf(withFilter(onEasy, 'cover', [COVER_SONG]))).toBe('normal');
  });

  it('remembers the difficulty through an empty list until songs arrive', () => {
    const onHard = selectDifficulty(createSongSelectState(ORIGINAL_SONGS, 'all', 4), 'hard');
    const empty = withFilter(onHard, 'cover', []);

    expect(empty.current).toEqual({
      kind: 'none',
      difficulty: 'hard',
    });
    const loaded = withSongs(empty, [COVER_SONG]);
    expect(songOf(loaded)).toBe(COVER_SONG);
    expect(difficultyOf(loaded)).toBe('hard');
    expect(difficultyOf(withFilter(empty, 'original', ORIGINAL_SONGS))).toBe('hard');
  });
});

describe('createSongSelectState with a restore target', () => {
  const pageSongs: readonly Song[] = Array.from({ length: 12 }, (_, index) =>
    makeSong(`song-${index}`, 'cover', index === 7 ? COVER_SONG.chartIds : FULL_SONG.chartIds),
  );

  it('finds the song by id even when its position changed', () => {
    const state = createSongSelectState(SONGS, 'all', 4, {
      index: 0,
      songId: COVER_SONG.id,
      difficulty: 'hard',
    });

    expect(songOf(state)).toBe(COVER_SONG);
    expect(indexOf(state)).toBe(2);
    expect(difficultyOf(state)).toBe('hard');
  });

  it('uses the index clamped to the list when the song id is null or missing', () => {
    expect(
      indexOf(
        createSongSelectState(SONGS, 'all', 4, {
          index: 1,
          songId: null,
          difficulty: null,
        }),
      ),
    ).toBe(1);
    expect(
      indexOf(
        createSongSelectState(SONGS, 'all', 4, {
          index: 99,
          songId: 'missing',
          difficulty: null,
        }),
      ),
    ).toBe(2);
    expect(
      indexOf(
        createSongSelectState(SONGS, 'all', 4, {
          index: -3,
          songId: 'missing',
          difficulty: null,
        }),
      ),
    ).toBe(0);
  });

  it('falls back to the first difficulty of a song without the restored one', () => {
    const state = createSongSelectState(SONGS, 'all', 4, {
      index: 0,
      songId: COVER_SONG.id,
      difficulty: 'easy',
    });

    expect(difficultyOf(state)).toBe('normal');
  });

  it('has no song and remembers the restored difficulty for an empty list', () => {
    const state = createSongSelectState([], 'cover', 4, {
      index: 4,
      songId: COVER_SONG.id,
      difficulty: 'expert',
    });

    expect(state.filter).toBe('cover');
    expect(state.current).toEqual({
      kind: 'none',
      difficulty: 'expert',
    });
  });

  it('computes the page and selected row from the restored position', () => {
    const state = createSongSelectState(pageSongs, 'cover', 4, {
      index: 0,
      songId: 'song-7',
      difficulty: 'normal',
    });

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 6,
      pageNumber: 3,
      pageCount: 4,
      selectedSlot: 1,
    });
    expect(difficultyOf(state)).toBe('normal');
  });
});

describe('getSongSelectTarget', () => {
  it('returns the position, song id and difficulty of the selected chart', () => {
    const state = selectDifficulty(moveSong(createSongSelectState(SONGS, 'all', 4), 1), 'hard');

    expect(getSongSelectTarget(state)).toEqual({
      index: 1,
      songId: EASY_HARD_SONG.id,
      difficulty: 'hard',
    });
  });

  it('has no difficulty for a song without charts', () => {
    const state = moveSong(createSongSelectState([FULL_SONG, NO_CHART_SONG], 'all', 4), 1);

    expect(getSongSelectTarget(state)).toEqual({
      index: 1,
      songId: NO_CHART_SONG.id,
      difficulty: null,
    });
  });

  it('returns the remembered difficulty without a song', () => {
    const onHard = selectDifficulty(createSongSelectState(ORIGINAL_SONGS, 'all', 4), 'hard');

    expect(getSongSelectTarget(withFilter(onHard, 'cover', []))).toEqual({
      index: 0,
      songId: null,
      difficulty: 'hard',
    });
  });
});

describe('immutability', () => {
  it('does not modify the input state', () => {
    const initial = createSongSelectState(SONGS, 'all', 4);
    const snapshot = structuredClone(initial);

    moveSong(initial, 1);
    selectSong(initial, 2);
    moveDifficulty(initial, 1);
    selectDifficulty(initial, 'hard');
    withFilter(initial, 'cover', [COVER_SONG]);
    withSongs(initial, [...SONGS, NO_CHART_SONG]);

    expect(initial).toEqual(snapshot);
  });
});

describe('getPlayableSelection', () => {
  it('returns the current song and difficulty', () => {
    expect(getPlayableSelection(createSongSelectState(SONGS, 'all', 4))).toEqual({
      song: FULL_SONG,
      laneCount: 4,
      difficulty: 'easy',
      chartId: 'easy.json',
    });
  });

  it('returns null without songs', () => {
    expect(getPlayableSelection(createSongSelectState([], 'all', 4))).toBeNull();
  });

  it('returns null for a song without charts', () => {
    const noCharts = makeSong('none', 'original', {});
    expect(getPlayableSelection(createSongSelectState([noCharts], 'all', 4))).toBeNull();
  });
});

describe('isSameSelection', () => {
  it('is true when only the filter changes but the song stays', () => {
    const state = createSongSelectState(SONGS, 'all', 4);
    expect(isSameSelection(state, withFilter(state, 'original', ORIGINAL_SONGS))).toBe(true);
  });

  it('is false when the difficulty changes', () => {
    const state = createSongSelectState(SONGS, 'all', 4);
    expect(isSameSelection(state, moveDifficulty(state, 1))).toBe(false);
  });

  it('is false when the song changes', () => {
    const state = createSongSelectState(SONGS, 'all', 4);
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
    expect(getSongRows(createSongSelectState([], 'all', 4), 3)).toEqual([
      { kind: 'empty' },
      { kind: 'empty' },
      { kind: 'empty' },
    ]);
  });

  it('selects the first row and fills the rest of a short page with empty rows', () => {
    expect(getSongRows(createSongSelectState([FULL_SONG, EASY_HARD_SONG], 'all', 4), 3)).toEqual([
      {
        kind: 'song',
        song: FULL_SONG,
        isSelected: true,
        recordChart: {
          song: FULL_SONG,
          laneCount: 4,
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
          laneCount: 4,
          difficulty: 'easy',
          chartId: 'easy.json',
        },
      },
      { kind: 'empty' },
    ]);
  });

  it('keeps the selected last row of a full page on that page', () => {
    const list = songs(4);

    expect(
      songAndSelection(getSongRows(selectSong(createSongSelectState(list, 'all', 4), 2), 3)),
    ).toEqual([
      [list[0], false],
      [list[1], false],
      [list[2], true],
    ]);
  });

  it('shows the next page with the selected row first and empty rows after the last song', () => {
    const list = songs(4);

    expect(
      songAndSelection(getSongRows(selectSong(createSongSelectState(list, 'all', 4), 3), 3)),
    ).toEqual([[list[3], true], null, null]);
  });

  it('uses the selected difficulty chart of each row song, or null when the song lacks it', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'normal');

    expect(
      getSongRows(onNormal, 3).map((row) => (row.kind === 'song' ? row.recordChart : null)),
    ).toEqual([
      {
        song: FULL_SONG,
        laneCount: 4,
        difficulty: 'normal',
        chartId: 'normal.json',
      },
      null,
      {
        song: COVER_SONG,
        laneCount: 4,
        difficulty: 'normal',
        chartId: 'normal.json',
      },
    ]);
  });

  it('has no record chart in any row while a song without charts is selected', () => {
    expect(getSongRows(createSongSelectState([NO_CHART_SONG, FULL_SONG], 'all', 4), 2)).toEqual([
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
    const state = createSongSelectState(SONGS, 'all', 4);

    expect(hasNewCurrentSong(state, selectDifficulty(state, 'hard'))).toBe(false);
  });

  it('is true when the current song changes', () => {
    const state = createSongSelectState(SONGS, 'all', 4);

    expect(hasNewCurrentSong(state, moveSong(state, 1))).toBe(true);
  });

  it('is false when the next state has no song', () => {
    const state = createSongSelectState(ORIGINAL_SONGS, 'all', 4);

    expect(hasNewCurrentSong(state, withFilter(state, 'cover', []))).toBe(false);
  });

  it('is true when a song appears after having none', () => {
    const empty = withFilter(createSongSelectState(ORIGINAL_SONGS, 'all', 4), 'cover', []);

    expect(hasNewCurrentSong(empty, withFilter(empty, 'all', ORIGINAL_SONGS))).toBe(true);
  });
});

describe('getSongPage', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.chartIds),
    );

  it('is the first page with no selected slot when there are no songs', () => {
    expect(getSongPage(createSongSelectState([], 'all', 4), 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      pageCount: 0,
      selectedSlot: null,
    });
  });

  it('keeps the last row of a page on that page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 2);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      pageCount: 3,
      selectedSlot: 2,
    });
  });

  it('moves the next row to the first slot of the next page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 3);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 3,
      pageNumber: 2,
      pageCount: 3,
      selectedSlot: 0,
    });
  });

  it('puts a lone song on the last page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 6);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 6,
      pageNumber: 3,
      pageCount: 3,
      selectedSlot: 0,
    });
  });

  it('counts only full or partial pages', () => {
    expect(getSongPage(createSongSelectState(songs(6), 'all', 4), 3).pageCount).toBe(2);
    expect(getSongPage(createSongSelectState(songs(7), 'all', 4), 3).pageCount).toBe(3);
  });
});

describe('getSongDifficultyAppearance', () => {
  it('is disabled when there is no song', () => {
    expect(getSongDifficultyAppearance(createSongSelectState([], 'all', 4), 'easy', true)).toBe(
      'disabled',
    );
  });

  it('reads selection and chart availability from the current song', () => {
    const state = createSongSelectState([EASY_HARD_SONG], 'all', 4);

    expect(getSongDifficultyAppearance(state, 'normal', true)).toBe('disabled');
    expect(getSongDifficultyAppearance(state, 'easy', false)).toBe('selected');
    expect(getSongDifficultyAppearance(state, 'hard', true)).toBe('emphasized');
  });
});

describe('withSongs', () => {
  it('keeps the selected song, position and difficulty when songs are appended', () => {
    const before = selectDifficulty(selectSong(createSongSelectState(SONGS, 'all', 4), 1), 'hard');
    const state = withSongs(before, [...SONGS, NO_CHART_SONG]);

    expect(state.songs).toEqual([...SONGS, NO_CHART_SONG]);
    expect(indexOf(state)).toBe(1);
    expect(songOf(state)).toBe(EASY_HARD_SONG);
    expect(difficultyOf(state)).toBe('hard');
  });

  it('uses the given songs as they are without filtering them by the current filter', () => {
    const before = createSongSelectState([COVER_SONG], 'cover', 4);
    const state = withSongs(before, [COVER_SONG, FULL_SONG]);

    expect(state.filter).toBe('cover');
    expect(state.songs).toEqual([COVER_SONG, FULL_SONG]);
  });

  it('selects the first song when the list was empty', () => {
    const before = withFilter(createSongSelectState(ORIGINAL_SONGS, 'all', 4), 'cover', []);
    const state = withSongs(before, [COVER_SONG]);

    expect(indexOf(state)).toBe(0);
    expect(songOf(state)).toBe(COVER_SONG);
    expect(difficultyOf(state)).toBe('normal');
  });

  it('returns the same state for the same song list', () => {
    const state = createSongSelectState(SONGS, 'all', 4);

    expect(withSongs(state, SONGS)).toBe(state);
  });
});

describe('isOnLastLoadedPage', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.chartIds),
    );

  it('is true when the selected song is on the last page', () => {
    expect(isOnLastLoadedPage(selectSong(createSongSelectState(songs(7), 'all', 4), 6), 3)).toBe(
      true,
    );
  });

  it('is false when the selected song is on an earlier page', () => {
    expect(isOnLastLoadedPage(selectSong(createSongSelectState(songs(7), 'all', 4), 5), 3)).toBe(
      false,
    );
  });

  it('is true when the list is empty', () => {
    expect(isOnLastLoadedPage(createSongSelectState([], 'all', 4), 3)).toBe(true);
  });
});

describe('getJacketRange', () => {
  const songs: readonly Song[] = Array.from({ length: 20 }, (_, index) =>
    makeSong(`song-${index}`, index % 2 === 0 ? 'original' : 'cover', FULL_SONG.chartIds),
  );

  it('loads the next page as adjacent on the first page', () => {
    expect(getJacketRange(createSongSelectState(songs, 'all', 4), 9)).toEqual({
      visible: songs.slice(0, 9),
      adjacent: songs.slice(9, 18),
    });
  });

  it('loads the previous page then the next page as adjacent on a middle page', () => {
    expect(getJacketRange(selectSong(createSongSelectState(songs, 'all', 4), 10), 9)).toEqual({
      visible: songs.slice(9, 18),
      adjacent: [...songs.slice(0, 9), ...songs.slice(18, 20)],
    });
  });

  it('loads only the previous page as adjacent on the last page', () => {
    expect(getJacketRange(selectSong(createSongSelectState(songs, 'all', 4), 19), 9)).toEqual({
      visible: songs.slice(18, 20),
      adjacent: songs.slice(9, 18),
    });
  });

  it('has no adjacent songs when the list fits on one page', () => {
    expect(getJacketRange(createSongSelectState(songs.slice(0, 5), 'all', 4), 9)).toEqual({
      visible: songs.slice(0, 5),
      adjacent: [],
    });
  });

  it('uses the songs of the current list', () => {
    const originals = songs.filter((song) => song.category === 'original');

    expect(getJacketRange(createSongSelectState(originals, 'original', 4), 9)).toEqual({
      visible: originals.slice(0, 9),
      adjacent: originals.slice(9),
    });
  });

  it('is empty for an empty list', () => {
    expect(getJacketRange(createSongSelectState([], 'all', 4), 9)).toEqual({
      visible: [],
      adjacent: [],
    });
  });
});

describe('getSongSelectNotice', () => {
  it('shows nothing while there are songs', () => {
    expect(getSongSelectNotice(1, 'loading')).toBeNull();
    expect(getSongSelectNotice(1, 'failed')).toBeNull();
    expect(getSongSelectNotice(1, 'complete')).toBeNull();
  });

  it('is loading for an empty list waiting for or loading a batch', () => {
    expect(getSongSelectNotice(0, 'hasMore')).toBe('loading');
    expect(getSongSelectNotice(0, 'loading')).toBe('loading');
  });

  it('is loadFailed for an empty failed list', () => {
    expect(getSongSelectNotice(0, 'failed')).toBe('loadFailed');
  });

  it('is noSongs for an empty complete list', () => {
    expect(getSongSelectNotice(0, 'complete')).toBe('noSongs');
  });
});

describe('lane count', () => {
  const MIXED_SONG = makeSong('mixed', 'original', {
    4: {
      easy: 'easy-4k.json',
      hard: 'hard-4k.json',
    },
    5: {
      normal: 'normal-5k.json',
      expert: 'expert-5k.json',
    },
  });

  it('selects, steps and offers only the charts of the state lane count', () => {
    const state = createSongSelectState([MIXED_SONG], 'all', 5);

    expect(getPlayableSelection(state)).toEqual({
      song: MIXED_SONG,
      laneCount: 5,
      difficulty: 'normal',
      chartId: 'normal-5k.json',
    });
    expect(getPlayableSelection(moveDifficulty(state, 1))).toEqual({
      song: MIXED_SONG,
      laneCount: 5,
      difficulty: 'expert',
      chartId: 'expert-5k.json',
    });
    expect(selectDifficulty(state, 'easy')).toBe(state);
    expect(getSongDifficultyAppearance(state, 'easy', false)).toBe('disabled');
    expect(getSongDifficultyAppearance(state, 'expert', false)).toBe('normal');
  });

  it('keeps a song without charts of the lane count in the list but not playable', () => {
    const state = createSongSelectState([MIXED_SONG, FULL_SONG], 'all', 6);

    expect(state.songs).toEqual([MIXED_SONG, FULL_SONG]);
    expect(songOf(state)).toBe(MIXED_SONG);
    expect(getPlayableSelection(state)).toBeNull();
    expect(getPlayableSelection(moveSong(state, 1))).toBeNull();
  });

  it('restores the same difficulty only when the lane count has it', () => {
    const target = {
      index: 0,
      songId: MIXED_SONG.id,
      difficulty: 'hard',
    } as const;

    expect(difficultyOf(createSongSelectState([MIXED_SONG], 'all', 4, target))).toBe('hard');
    expect(difficultyOf(createSongSelectState([MIXED_SONG], 'all', 5, target))).toBe('normal');
  });

  it('keeps the lane count through filter and song list changes', () => {
    const state = createSongSelectState([MIXED_SONG], 'all', 5);

    expect(withFilter(state, 'original', [FULL_SONG, MIXED_SONG]).laneCount).toBe(5);
    expect(getPlayableSelection(withSongs(state, [FULL_SONG, MIXED_SONG]))).toBeNull();
  });

  it('uses the record chart of the state lane count in each row', () => {
    const state = createSongSelectState([MIXED_SONG, FULL_SONG], 'all', 4);

    expect(
      getSongRows(state, 2).map((row) => (row.kind === 'song' ? row.recordChart : null)),
    ).toEqual([
      {
        song: MIXED_SONG,
        laneCount: 4,
        difficulty: 'easy',
        chartId: 'easy-4k.json',
      },
      {
        song: FULL_SONG,
        laneCount: 4,
        difficulty: 'easy',
        chartId: 'easy.json',
      },
    ]);
    expect(
      getSongRows(createSongSelectState([MIXED_SONG, FULL_SONG], 'all', 5), 2).map((row) =>
        row.kind === 'song' ? row.recordChart : null,
      ),
    ).toEqual([
      {
        song: MIXED_SONG,
        laneCount: 5,
        difficulty: 'normal',
        chartId: 'normal-5k.json',
      },
      null,
    ]);
  });
});
