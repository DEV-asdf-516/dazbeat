import { describe, expect, it } from 'vitest';
import { ALL_SONGS_QUERY } from '../../../../src/data/songs.js';
import type { Song } from '../../../../src/data/songs.js';
import { SongFeed } from '../../../../src/game/app/SongFeed.js';
import type { Difficulty } from '../../../../src/rhythm/types.js';
import { recordKey } from '../../../../src/storage/chartRecords.js';
import type { ChartRecord, ChartRecords } from '../../../../src/storage/chartRecords.js';
import {
  clickControlsHelp,
  isControlsHelpShown,
  withControlsOpen,
} from '../../../../src/game/app/controlsGuide.js';
import {
  canSelectRandomSong,
  createSongSelectState,
  getActionAppearance,
  getChangedRegions,
  getChangedRowSlots,
  getJacketRange,
  getLoadingMoreAnchor,
  getPageIndicator,
  getSelectedLevel,
  getSelectedRecord,
  getShiftedRowSlots,
  getPlayableSelection,
  getSongPage,
  getSongRows,
  getSongDifficultyAppearance,
  getSongRowNodeId,
  getSongSelectNotice,
  getSongSelectRestore,
  hoverSongSelectButton,
  pressSongSelectButton,
  unhoverSongSelectButton,
  isOnLastLoadedPage,
  moveDifficulty,
  moveSong,
  readSongSelectShortcut,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  setHover,
  withFilter,
  withLocalRecords,
  withSongs,
} from '../../../../src/game/songSelect/state/songSelectState.js';
import type {
  SongRowView,
  SongSelectState,
  SongSelectView,
} from '../../../../src/game/songSelect/state/songSelectState.js';

function makeSong(id: string, category: Song['category'], charts: Song['charts']): Song {
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
    charts,
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
    easy: {
      id: 'easy.json',
      level: 1,
    },
    normal: {
      id: 'normal.json',
      level: 1,
    },
    hard: {
      id: 'hard.json',
      level: 1,
    },
    expert: {
      id: 'expert.json',
      level: 1,
    },
  },
});
const EASY_HARD_SONG = makeSong('easy-hard', 'original', {
  4: {
    easy: {
      id: 'easy.json',
      level: 1,
    },
    hard: {
      id: 'hard.json',
      level: 1,
    },
  },
});
const COVER_SONG = makeSong('cover', 'cover', {
  4: {
    normal: {
      id: 'normal.json',
      level: 1,
    },
    hard: {
      id: 'hard.json',
      level: 1,
    },
  },
});
const NO_CHART_SONG = makeSong('no-chart', 'original', {});
const SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG, COVER_SONG];
const ORIGINAL_SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG];
const PLAYED: ChartRecord = {
  score: 500000,
  accuracy: 0.8,
  maxCombo: 40,
};
const CLEARED: ChartRecord = {
  score: 900000,
  accuracy: 0.95,
  maxCombo: 120,
};

function nodeIds(rows: readonly SongRowView[]): (string | null)[] {
  return rows.map((row) => (row.kind === 'song' ? row.nodeId : null));
}

function viewOf(
  state: SongSelectState,
  overrides: Partial<Omit<SongSelectView, 'state'>> = {},
): SongSelectView {
  return {
    state,
    notice: null,
    isLoadingMore: false,
    songCount: state.songs.length,
    ...overrides,
  };
}

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
    const fiveLaneSong = makeSong('five-lane', 'original', {
      5: {
        easy: {
          id: 'easy-5k.json',
          level: 1,
        },
      },
    });
    const state = createSongSelectState([FULL_SONG, fiveLaneSong, COVER_SONG], 'all', 4);

    expect(songOf(selectRandomSong(state, () => 0))).toBe(COVER_SONG);
    expect(songOf(selectRandomSong(state, () => 0.99))).toBe(COVER_SONG);
    expect(canSelectRandomSong(createSongSelectState([FULL_SONG, fiveLaneSong], 'all', 4))).toBe(
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
    expect(difficultyOf(moveDifficulty(state, 'previous'))).toBe('easy');
    const hard = moveDifficulty(state, 'next');
    expect(difficultyOf(hard)).toBe('hard');
    expect(difficultyOf(moveDifficulty(hard, 'next'))).toBe('hard');
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
    expect(moveDifficulty(state, 'next')).toBe(state);
    expect(selectDifficulty(state, 'easy')).toBe(state);
    expect(
      getSongDifficultyAppearance(
        setHover(state, {
          kind: 'difficulty',
          difficulty: 'easy',
        }),
        'easy',
      ),
    ).toBe('disabled');
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
    makeSong(`song-${index}`, 'cover', index === 7 ? COVER_SONG.charts : FULL_SONG.charts),
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
      loadedPageCount: 4,
      selectedSlot: 1,
    });
    expect(difficultyOf(state)).toBe('normal');
  });
});

describe('getSongSelectRestore', () => {
  const feed = new SongFeed(ALL_SONGS_QUERY, () => Promise.reject(new Error('Not used')));

  it('returns the feed with the position, song id and difficulty of the selected chart', () => {
    const state = selectDifficulty(moveSong(createSongSelectState(SONGS, 'all', 4), 1), 'hard');

    expect(getSongSelectRestore(state, feed)).toEqual({
      feed,
      index: 1,
      songId: EASY_HARD_SONG.id,
      difficulty: 'hard',
    });
  });

  it('has no difficulty for a song without charts', () => {
    const state = moveSong(createSongSelectState([FULL_SONG, NO_CHART_SONG], 'all', 4), 1);

    expect(getSongSelectRestore(state, feed)).toEqual({
      feed,
      index: 1,
      songId: NO_CHART_SONG.id,
      difficulty: null,
    });
  });

  it('returns the remembered difficulty without a song', () => {
    const onHard = selectDifficulty(createSongSelectState(ORIGINAL_SONGS, 'all', 4), 'hard');

    expect(getSongSelectRestore(withFilter(onHard, 'cover', []), feed)).toEqual({
      feed,
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
    moveDifficulty(initial, 'next');
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
      level: 1,
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

describe('getSongRowNodeId', () => {
  it('shows selected regardless of record', () => {
    expect(getSongRowNodeId('selected', null)).toBe('R17');
    expect(getSongRowNodeId('selected', CLEARED)).toBe('R17');
  });

  it('shows hover over the persistent state', () => {
    expect(getSongRowNodeId('hovered', null)).toBe('R16');
    expect(getSongRowNodeId('hovered', CLEARED)).toBe('R16');
  });

  it('shows idle without a record', () => {
    expect(getSongRowNodeId('idle', null)).toBe('R15');
  });

  it('shows cleared for a record', () => {
    expect(getSongRowNodeId('idle', CLEARED)).toBe('R18');
  });
});

describe('getSongRows', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.charts),
    );
  const songAndSelection = (rows: readonly SongRowView[]) =>
    rows.map((row) => (row.kind === 'song' ? [row.song, row.appearance] : null));

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
        appearance: 'selected',
        nodeId: 'R17',
        topRank: null,
        level: 1,
      },
      {
        kind: 'song',
        song: EASY_HARD_SONG,
        appearance: 'idle',
        nodeId: 'R15',
        topRank: null,
        level: 1,
      },
      { kind: 'empty' },
    ]);
  });

  it('keeps the selected last row of a full page on that page', () => {
    const list = songs(4);

    expect(
      songAndSelection(getSongRows(selectSong(createSongSelectState(list, 'all', 4), 2), 3)),
    ).toEqual([
      [list[0], 'idle'],
      [list[1], 'idle'],
      [list[2], 'selected'],
    ]);
  });

  it('shows the next page with the selected row first and empty rows after the last song', () => {
    const list = songs(4);

    expect(
      songAndSelection(getSongRows(selectSong(createSongSelectState(list, 'all', 4), 3), 3)),
    ).toEqual([[list[3], 'selected'], null, null]);
  });

  it('shows the hovered row as hovered and keeps the selected row selected under hover', () => {
    const state = createSongSelectState(songs(3), 'all', 4);

    expect(
      songAndSelection(
        getSongRows(
          setHover(state, {
            kind: 'row',
            slot: 1,
          }),
          3,
        ),
      ).map((row) => row?.[1]),
    ).toEqual(['selected', 'hovered', 'idle']);
    expect(
      songAndSelection(
        getSongRows(
          setHover(state, {
            kind: 'row',
            slot: 0,
          }),
          3,
        ),
      ).map((row) => row?.[1]),
    ).toEqual(['selected', 'idle', 'idle']);
  });

  it('reads the record of the selected difficulty chart of each row song', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS, 'all', 4), 'normal');
    const records: ChartRecords = new Map([
      [recordKey(EASY_HARD_SONG.id, 4, 'easy'), CLEARED],
      [recordKey(COVER_SONG.id, 4, 'normal'), PLAYED],
    ]);

    expect(nodeIds(getSongRows(withLocalRecords(onNormal, records), 3))).toEqual([
      'R17',
      'R15',
      'R18',
    ]);
  });

  it('has no record chart in any row while a song without charts is selected', () => {
    expect(getSongRows(createSongSelectState([NO_CHART_SONG, FULL_SONG], 'all', 4), 2)).toEqual([
      {
        kind: 'song',
        song: NO_CHART_SONG,
        appearance: 'selected',
        nodeId: 'R17',
        topRank: null,
        level: null,
      },
      {
        kind: 'song',
        song: FULL_SONG,
        appearance: 'idle',
        nodeId: 'R15',
        topRank: null,
        level: null,
      },
    ]);
  });
});

describe('chart levels', () => {
  const leveledSong = makeSong('leveled', 'original', {
    4: {
      easy: {
        id: 'leveled-easy',
        level: 2,
      },
      hard: {
        id: 'leveled-hard',
        level: 4.5,
      },
      expert: {
        id: 'leveled-expert',
        level: 1,
      },
    },
    5: {
      easy: {
        id: 'leveled-easy-5k',
        level: 1.5,
      },
    },
  });
  const otherLeveledSong = makeSong('other-leveled', 'cover', {
    4: {
      hard: {
        id: 'other-hard',
        level: 3,
      },
    },
  });
  const levels = (state: SongSelectState) =>
    getSongRows(state, 3).map((row) => (row.kind === 'song' ? row.level : undefined));

  it('is the level of the lane count and selected difficulty chart in each row and the detail', () => {
    const state = createSongSelectState([leveledSong, otherLeveledSong], 'all', 4);

    expect(levels(state)).toEqual([2, null, undefined]);
    expect(getSelectedLevel(state)).toBe(2);
    expect(levels(createSongSelectState([leveledSong, otherLeveledSong], 'all', 5))).toEqual([
      1.5,
      null,
      undefined,
    ]);
    expect(getSelectedLevel(createSongSelectState([leveledSong], 'all', 5))).toBe(1.5);
  });

  it('follows the difficulty and the song the selection moves to', () => {
    const state = createSongSelectState([leveledSong, otherLeveledSong], 'all', 4);
    const onHard = selectDifficulty(state, 'hard');

    expect(levels(onHard)).toEqual([4.5, 3, undefined]);
    expect(getSelectedLevel(onHard)).toBe(4.5);
    expect(getSelectedLevel(moveSong(onHard, 1))).toBe(3);
    expect(getSelectedLevel(moveDifficulty(onHard, 'next'))).toBe(1);
  });

  it('is null without a chart or a song', () => {
    expect(getSelectedLevel(createSongSelectState([NO_CHART_SONG], 'all', 4))).toBeNull();
    expect(getSelectedLevel(createSongSelectState([], 'all', 4))).toBeNull();
  });

  it('redraws the song info when only the selected level changes', () => {
    const state = createSongSelectState([leveledSong, otherLeveledSong], 'all', 4);

    expect(getChangedRegions(viewOf(state), viewOf(selectDifficulty(state, 'hard')), 3)).toContain(
      'songInfo',
    );
  });
});

describe('getActionAppearance', () => {
  it('disables RANDOM when there is only one song to pick', () => {
    expect(getActionAppearance(createSongSelectState([FULL_SONG], 'all', 4), 'random')).toBe(
      'disabled',
    );
  });

  it('disables PLAY on a song without charts even when hovered', () => {
    const state = setHover(createSongSelectState([NO_CHART_SONG, FULL_SONG], 'all', 4), {
      kind: 'action',
      action: 'play',
    });

    expect(getActionAppearance(state, 'play')).toBe('disabled');
  });

  it('shows the hovered action as hovered and the other as idle', () => {
    const state = setHover(createSongSelectState(SONGS, 'all', 4), {
      kind: 'action',
      action: 'random',
    });

    expect(getActionAppearance(state, 'random')).toBe('hovered');
    expect(getActionAppearance(state, 'play')).toBe('idle');
  });
});

describe('getSongPage', () => {
  const songs = (count: number): readonly Song[] =>
    Array.from({ length: count }, (_, index) =>
      makeSong(`song-${index}`, 'original', FULL_SONG.charts),
    );

  it('is the first page with no selected slot when there are no songs', () => {
    expect(getSongPage(createSongSelectState([], 'all', 4), 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      loadedPageCount: 0,
      selectedSlot: null,
    });
  });

  it('keeps the last row of a page on that page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 2);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 0,
      pageNumber: 1,
      loadedPageCount: 3,
      selectedSlot: 2,
    });
  });

  it('moves the next row to the first slot of the next page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 3);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 3,
      pageNumber: 2,
      loadedPageCount: 3,
      selectedSlot: 0,
    });
  });

  it('puts a lone song on the last page', () => {
    const state = selectSong(createSongSelectState(songs(7), 'all', 4), 6);

    expect(getSongPage(state, 3)).toEqual({
      startIndex: 6,
      pageNumber: 3,
      loadedPageCount: 3,
      selectedSlot: 0,
    });
  });

  it('counts only full or partial pages', () => {
    expect(getSongPage(createSongSelectState(songs(6), 'all', 4), 3).loadedPageCount).toBe(2);
    expect(getSongPage(createSongSelectState(songs(7), 'all', 4), 3).loadedPageCount).toBe(3);
  });
});

describe('getSongDifficultyAppearance', () => {
  it('is disabled when there is no song', () => {
    expect(
      getSongDifficultyAppearance(
        setHover(createSongSelectState([], 'all', 4), {
          kind: 'difficulty',
          difficulty: 'easy',
        }),
        'easy',
      ),
    ).toBe('disabled');
  });

  it('reads selection and chart availability from the current song', () => {
    const state = createSongSelectState([EASY_HARD_SONG], 'all', 4);

    expect(
      getSongDifficultyAppearance(
        setHover(state, {
          kind: 'difficulty',
          difficulty: 'normal',
        }),
        'normal',
      ),
    ).toBe('disabled');
    expect(getSongDifficultyAppearance(state, 'easy')).toBe('selected');
    expect(
      getSongDifficultyAppearance(
        setHover(state, {
          kind: 'difficulty',
          difficulty: 'hard',
        }),
        'hard',
      ),
    ).toBe('emphasized');
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
      makeSong(`song-${index}`, 'original', FULL_SONG.charts),
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
    makeSong(`song-${index}`, index % 2 === 0 ? 'original' : 'cover', FULL_SONG.charts),
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
  const mixedSong = makeSong('mixed', 'original', {
    4: {
      easy: {
        id: 'easy-4k.json',
        level: 1,
      },
      hard: {
        id: 'hard-4k.json',
        level: 1,
      },
    },
    5: {
      normal: {
        id: 'normal-5k.json',
        level: 1,
      },
      expert: {
        id: 'expert-5k.json',
        level: 1,
      },
    },
  });

  it('selects, steps and offers only the charts of the state lane count', () => {
    const state = createSongSelectState([mixedSong], 'all', 5);

    expect(getPlayableSelection(state)).toEqual({
      song: mixedSong,
      laneCount: 5,
      difficulty: 'normal',
      chartId: 'normal-5k.json',
      level: 1,
    });
    expect(getPlayableSelection(moveDifficulty(state, 'next'))).toEqual({
      song: mixedSong,
      laneCount: 5,
      difficulty: 'expert',
      chartId: 'expert-5k.json',
      level: 1,
    });
    expect(selectDifficulty(state, 'easy')).toBe(state);
    expect(getSongDifficultyAppearance(state, 'easy')).toBe('disabled');
    expect(getSongDifficultyAppearance(state, 'expert')).toBe('normal');
  });

  it('keeps a song without charts of the lane count in the list but not playable', () => {
    const state = createSongSelectState([mixedSong, FULL_SONG], 'all', 6);

    expect(state.songs).toEqual([mixedSong, FULL_SONG]);
    expect(songOf(state)).toBe(mixedSong);
    expect(getPlayableSelection(state)).toBeNull();
    expect(getPlayableSelection(moveSong(state, 1))).toBeNull();
  });

  it('restores the same difficulty only when the lane count has it', () => {
    const target = {
      index: 0,
      songId: mixedSong.id,
      difficulty: 'hard',
    } as const;

    expect(difficultyOf(createSongSelectState([mixedSong], 'all', 4, target))).toBe('hard');
    expect(difficultyOf(createSongSelectState([mixedSong], 'all', 5, target))).toBe('normal');
  });

  it('keeps the lane count through filter and song list changes', () => {
    const state = createSongSelectState([mixedSong], 'all', 5);

    expect(withFilter(state, 'original', [FULL_SONG, mixedSong]).laneCount).toBe(5);
    expect(getPlayableSelection(withSongs(state, [FULL_SONG, mixedSong]))).toBeNull();
  });

  it('reads the record of the state lane count in each row', () => {
    const records: ChartRecords = new Map([
      [recordKey(FULL_SONG.id, 4, 'easy'), CLEARED],
      [recordKey(FULL_SONG.id, 5, 'easy'), CLEARED],
    ]);

    expect(
      nodeIds(
        getSongRows(
          withLocalRecords(createSongSelectState([mixedSong, FULL_SONG], 'all', 4), records),
          2,
        ),
      ),
    ).toEqual(['R17', 'R18']);
    expect(
      nodeIds(
        getSongRows(
          withLocalRecords(createSongSelectState([mixedSong, FULL_SONG], 'all', 5), records),
          2,
        ),
      ),
    ).toEqual(['R17', 'R15']);
  });
});

describe('getSelectedRecord', () => {
  it('reads the record of the playable selection', () => {
    const state = withLocalRecords(
      createSongSelectState(SONGS, 'all', 4),
      new Map([[recordKey(FULL_SONG.id, 4, 'easy'), PLAYED]]),
    );

    expect(getSelectedRecord(state)).toBe(PLAYED);
    expect(getSelectedRecord(moveSong(state, 1))).toBeNull();
  });
});

describe('getPageIndicator', () => {
  const songs = Array.from({ length: 5 }, (_, index) =>
    makeSong(`song-${index}`, 'original', FULL_SONG.charts),
  );

  it('is null when every song fits on one page', () => {
    expect(getPageIndicator(createSongSelectState(songs, 'all', 4), 5, 5)).toBeNull();
  });

  it('counts the pages of the whole list including songs not loaded yet', () => {
    expect(getPageIndicator(selectSong(createSongSelectState(songs, 'all', 4), 3), 3, 7)).toEqual({
      text: '2 / 3',
    });
  });
});

describe('getLoadingMoreAnchor', () => {
  const songs = Array.from({ length: 4 }, (_, index) =>
    makeSong(`song-${index}`, 'original', FULL_SONG.charts),
  );

  it('anchors to the first empty row of the page', () => {
    expect(getLoadingMoreAnchor(selectSong(createSongSelectState(songs, 'all', 4), 3), 3)).toEqual({
      kind: 'row',
      slot: 1,
    });
  });

  it('anchors to the page line end when the page is full', () => {
    expect(getLoadingMoreAnchor(createSongSelectState(songs, 'all', 4), 3)).toEqual({
      kind: 'pageEnd',
    });
  });
});

describe('getChangedRegions', () => {
  const state = createSongSelectState(SONGS, 'all', 4);

  it('draws every region and shifts the selected row on the first render', () => {
    expect(getChangedRegions(null, viewOf(state), 3)).toEqual([
      'filterTabs',
      'levelSlider',
      'rows',
      'selectedHalo',
      'notice',
      'pageIndicator',
      'loadingMore',
      'jacket',
      'songInfo',
      'difficultyTabs',
      'actions',
      'jacketLoads',
      'controls',
      'settingsButton',
      'backButton',
      'rankingButton',
      'levelResetButton',
      'retryButton',
      'recordsRetryButton',
      'controlsEntry',
      'accountButton',
      'controlsClose',
      'controlsHelpCard',
      'controlsHelpButton',
      'rowShift',
    ]);
  });

  it('redraws only the controls when only the controls open', () => {
    expect(getChangedRegions(viewOf(state), viewOf(withControlsOpen(state, true)), 3)).toEqual([
      'controls',
    ]);
  });

  it('redraws only the hovered button when the button hover changes', () => {
    const hovered = hoverSongSelectButton(state, 'settings');

    expect(getChangedRegions(viewOf(state), viewOf(hovered), 3)).toEqual(['settingsButton']);
    expect(
      getChangedRegions(viewOf(hovered), viewOf(pressSongSelectButton(hovered, 'settings')), 3),
    ).toEqual(['settingsButton']);
    expect(
      getChangedRegions(
        viewOf(hovered),
        viewOf(hoverSongSelectButton(hovered, 'controlsEntry')),
        3,
      ),
    ).toEqual(['settingsButton', 'controlsEntry']);
  });

  it('redraws only the region that reads the hover', () => {
    const view = viewOf(state);

    expect(
      getChangedRegions(
        view,
        viewOf(
          setHover(state, {
            kind: 'filter',
            filter: 'cover',
          }),
        ),
        3,
      ),
    ).toEqual(['filterTabs']);
    expect(
      getChangedRegions(
        view,
        viewOf(
          setHover(state, {
            kind: 'row',
            slot: 1,
          }),
        ),
        3,
      ),
    ).toEqual(['rows']);
    expect(
      getChangedRegions(
        view,
        viewOf(
          setHover(state, {
            kind: 'action',
            action: 'play',
          }),
        ),
        3,
      ),
    ).toEqual(['actions']);
    expect(
      getChangedRegions(
        view,
        viewOf(
          setHover(state, {
            kind: 'difficulty',
            difficulty: 'hard',
          }),
        ),
        3,
      ),
    ).toEqual(['difficultyTabs']);
  });

  it('plays the jacket glint when the current song changes', () => {
    expect(getChangedRegions(viewOf(state), viewOf(moveSong(state, 1)), 3)).toContain(
      'jacketGlint',
    );
  });

  it('does not play the jacket glint when only the difficulty changes', () => {
    expect(
      getChangedRegions(viewOf(state), viewOf(selectDifficulty(state, 'hard')), 3),
    ).not.toContain('jacketGlint');
  });

  it('does not play the jacket glint when the list loses its song', () => {
    expect(
      getChangedRegions(viewOf(state), viewOf(withFilter(state, 'cover', [])), 3),
    ).not.toContain('jacketGlint');
  });

  it('plays the jacket glint when a song appears after having none', () => {
    const empty = withFilter(state, 'cover', []);

    expect(
      getChangedRegions(viewOf(empty), viewOf(withFilter(empty, 'all', ORIGINAL_SONGS)), 3),
    ).toContain('jacketGlint');
  });
});

describe('controls help', () => {
  const open = withControlsOpen(createSongSelectState(SONGS, 'all', 4), true);
  const hover = (state: SongSelectState) => hoverSongSelectButton(state, 'controlsHelp');
  const leave = (state: SongSelectState) => unhoverSongSelectButton(state, 'controlsHelp');

  it('shows the card on (?) hover and keeps it pinned after the pointer leaves', () => {
    const hovered = hover(open);
    const pinned = clickControlsHelp(hovered);

    expect(isControlsHelpShown(hovered)).toBe(true);
    expect(getChangedRegions(viewOf(open), viewOf(hovered), 3)).toEqual([
      'controlsHelpCard',
      'controlsHelpButton',
    ]);
    expect(getChangedRegions(viewOf(hovered), viewOf(pinned), 3)).not.toContain('controls');
    expect(isControlsHelpShown(leave(pinned))).toBe(true);
  });

  it('hides a pinned card on the next click under the pointer until the pointer comes back', () => {
    const dismissed = clickControlsHelp(hover(leave(clickControlsHelp(hover(open)))));

    expect(isControlsHelpShown(dismissed)).toBe(false);
    expect(leave(dismissed).controls).toBe('open');
    expect(isControlsHelpShown(hover(leave(dismissed)))).toBe(true);
  });

  it('closes with the pin and the (?) hover dropped and reopens unpinned', () => {
    const closed = withControlsOpen(clickControlsHelp(hover(open)), false);

    expect(closed.controls).toBe('closed');
    expect(closed.hover).toBeNull();
    expect(isControlsHelpShown(closed)).toBe(false);
    expect(withControlsOpen(closed, true).controls).toBe('open');
  });
});

describe('getChangedRowSlots', () => {
  const songs = Array.from({ length: 6 }, (_, index) =>
    makeSong(`song-${index}`, 'original', FULL_SONG.charts),
  );
  const state = setHover(createSongSelectState(songs, 'all', 4), {
    kind: 'row',
    slot: 1,
  });

  it('is every slot on the first render', () => {
    expect(getChangedRowSlots(null, viewOf(state), 3)).toEqual([0, 1, 2]);
  });

  it('is the two rows a hover moves between', () => {
    const next = setHover(state, {
      kind: 'row',
      slot: 2,
    });

    expect(getChangedRowSlots(viewOf(state), viewOf(next), 3)).toEqual([1, 2]);
  });

  it('is every slot when the page changes', () => {
    expect(getChangedRowSlots(viewOf(state), viewOf(selectSong(state, 3)), 3)).toEqual([0, 1, 2]);
  });
});

describe('getShiftedRowSlots', () => {
  const songs = Array.from({ length: 3 }, (_, index) =>
    makeSong(`song-${index}`, 'original', FULL_SONG.charts),
  );
  const state = createSongSelectState(songs, 'all', 4);

  it('is the selected slot on the first render', () => {
    expect(getShiftedRowSlots(null, viewOf(state), 3)).toEqual([0]);
  });

  it('is the slots whose selection changed', () => {
    expect(getShiftedRowSlots(viewOf(state), viewOf(selectSong(state, 2)), 3)).toEqual([0, 2]);
  });

  it('is empty when the selected slot stays', () => {
    expect(getShiftedRowSlots(viewOf(state), viewOf(selectDifficulty(state, 'hard')), 3)).toEqual(
      [],
    );
  });
});

describe('readSongSelectShortcut', () => {
  const key = (code: string, isRepeat = false) => ({
    code,
    repeat: isRepeat,
  });

  it('selects a random song on R but not on a repeat', () => {
    expect(readSongSelectShortcut(key('KeyR'))).toBe('selectRandomSong');
    expect(readSongSelectShortcut(key('KeyR', true))).toBeNull();
  });

  it('opens the ranking on L but not on a repeat', () => {
    expect(readSongSelectShortcut(key('KeyL'))).toBe('openRanking');
    expect(readSongSelectShortcut(key('KeyL', true))).toBeNull();
  });

  it('opens settings on Tab but not on a repeat', () => {
    expect(readSongSelectShortcut(key('Tab'))).toBe('openSettings');
    expect(readSongSelectShortcut(key('Tab', true))).toBeNull();
  });

  it('ignores other keys', () => {
    expect(readSongSelectShortcut(key('KeyX'))).toBeNull();
  });
});
