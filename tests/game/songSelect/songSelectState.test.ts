import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import type { ChartRecord } from '../../../src/storage/LocalSave.js';
import {
  createSongSelectState,
  cycleFilter,
  getCurrentSong,
  getPlayableSelection,
  getRowRecordDifficulty,
  getSongRowNodeId,
  hasNewCurrentSong,
  isSameSelection,
  moveDifficulty,
  moveSong,
  selectDifficulty,
  selectFilter,
  selectSong,
} from '../../../src/game/songSelect/songSelectState.js';

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
const COVER_SONG = makeSong('cover', 'cover', { normal: 'normal.json', hard: 'hard.json' });
const SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG, COVER_SONG];
const ORIGINAL_SONGS: readonly Song[] = [FULL_SONG, EASY_HARD_SONG];

describe('createSongSelectState', () => {
  it('starts on the all filter with the first song and its first available difficulty', () => {
    const state = createSongSelectState([EASY_HARD_SONG, FULL_SONG]);

    expect(state.filter).toBe('all');
    expect(state.songIndex).toBe(0);
    expect(state.difficulty).toBe('easy');
    expect(getCurrentSong(state)).toBe(EASY_HARD_SONG);
  });

  it('has no song or difficulty when there are no songs', () => {
    const state = createSongSelectState([]);

    expect(state.songIndex).toBe(0);
    expect(state.difficulty).toBeNull();
    expect(getCurrentSong(state)).toBeUndefined();
  });
});

describe('moveSong', () => {
  it('stops at the top and bottom of the list', () => {
    const initial = createSongSelectState(SONGS);

    expect(moveSong(initial, -1).songIndex).toBe(0);
    const last = moveSong(moveSong(initial, 1), 1);
    expect(last.songIndex).toBe(2);
    expect(moveSong(last, 1).songIndex).toBe(2);
  });

  it('keeps the current difficulty when the new song has it', () => {
    const onHard = selectDifficulty(createSongSelectState(SONGS), 'hard');

    expect(moveSong(onHard, 1).difficulty).toBe('hard');
  });

  it('switches to the first available difficulty when the new song lacks the current one', () => {
    const onNormal = selectDifficulty(createSongSelectState(SONGS), 'normal');

    expect(moveSong(onNormal, 1).difficulty).toBe('easy');
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

    expect(getCurrentSong(state)).toBe(COVER_SONG);
    expect(state.difficulty).toBe('normal');
  });
});

describe('moveDifficulty', () => {
  it('skips difficulties without a chart and stops at the ends', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(state.difficulty).toBe('easy');
    expect(moveDifficulty(state, -1).difficulty).toBe('easy');
    const hard = moveDifficulty(state, 1);
    expect(hard.difficulty).toBe('hard');
    expect(moveDifficulty(hard, 1).difficulty).toBe('hard');
  });
});

describe('selectDifficulty', () => {
  it('keeps the state for a difficulty without a chart', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(selectDifficulty(state, 'normal')).toEqual(state);
  });

  it('selects an available difficulty', () => {
    const state = selectSong(createSongSelectState(SONGS), 1);

    expect(selectDifficulty(state, 'hard').difficulty).toBe('hard');
  });
});

describe('cycleFilter', () => {
  it('cycles all → original → cover → all and resets the song index', () => {
    const atSecond = moveSong(createSongSelectState(SONGS), 1);
    const original = cycleFilter(atSecond, 1);

    expect(original.filter).toBe('original');
    expect(original.songs).toEqual(ORIGINAL_SONGS);
    expect(original.songIndex).toBe(0);
    const cover = cycleFilter(original, 1);
    expect(cover.filter).toBe('cover');
    expect(cover.songs).toEqual([COVER_SONG]);
    expect(cycleFilter(cover, 1).filter).toBe('all');
  });

  it('cycles backwards from all to cover', () => {
    const state = cycleFilter(createSongSelectState(SONGS), -1);

    expect(state.filter).toBe('cover');
    expect(state.songIndex).toBe(0);
  });
});

describe('selectFilter', () => {
  it('clears the difficulty for an empty list and restores it when returning to all', () => {
    const empty = selectFilter(createSongSelectState(ORIGINAL_SONGS), 'cover');

    expect(empty.songs).toEqual([]);
    expect(empty.difficulty).toBeNull();
    expect(getCurrentSong(empty)).toBeUndefined();
    const all = selectFilter(empty, 'all');
    expect(getCurrentSong(all)).toBe(FULL_SONG);
    expect(all.difficulty).toBe('easy');
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
  const played: ChartRecord = { score: 500000, accuracy: 0.8, maxCombo: 40, cleared: false };
  const cleared: ChartRecord = { score: 900000, accuracy: 0.95, maxCombo: 120, cleared: true };

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

describe('getRowRecordDifficulty', () => {
  it('has no record difficulty when no difficulty is selected', () => {
    expect(getRowRecordDifficulty(FULL_SONG, null)).toBeNull();
  });

  it('has no record difficulty when the song lacks the selected difficulty', () => {
    expect(getRowRecordDifficulty(EASY_HARD_SONG, 'normal')).toBeNull();
  });

  it('uses the selected difficulty when the song has it', () => {
    expect(getRowRecordDifficulty(EASY_HARD_SONG, 'hard')).toBe('hard');
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
