import { SONG_FILTERS, filterSongs, getAvailableDifficulties } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import type { ChartRecord } from '../../storage/LocalSave.js';
import { clamp, cycleItem, stepItem } from '../range.js';

export interface SongSelectState {
  readonly allSongs: readonly Song[];
  readonly filter: SongFilter;
  readonly songs: readonly Song[];
  readonly songIndex: number;
  readonly difficulty: Difficulty | null;
}

export function createSongSelectState(allSongs: readonly Song[]): SongSelectState {
  const songs = filterSongs(allSongs, 'all');
  return {
    allSongs,
    filter: 'all',
    songs,
    songIndex: 0,
    difficulty: pickDifficulty(songs[0], null),
  };
}

export function getCurrentSong(state: SongSelectState): Song | undefined {
  return state.songs[state.songIndex];
}

/** 곡과 난이도가 모두 정해져 바로 플레이할 수 있을 때만 값을 돌려준다. */
export function getPlayableSelection(
  state: SongSelectState,
): { song: Song; difficulty: Difficulty } | null {
  const song = getCurrentSong(state);
  return song === undefined || state.difficulty === null
    ? null
    : { song, difficulty: state.difficulty };
}

export function isSameSelection(a: SongSelectState, b: SongSelectState): boolean {
  return getCurrentSong(a) === getCurrentSong(b) && a.difficulty === b.difficulty;
}

/** 다음 상태에 곡이 있고 이전 곡과 다를 때만 true. jacket glint 재생 조건이다. */
export function hasNewCurrentSong(previous: SongSelectState, next: SongSelectState): boolean {
  const song = getCurrentSong(next);
  return song !== undefined && song !== getCurrentSong(previous);
}

/** 곡 행에서 기록을 조회할 난이도. 선택 난이도가 그 곡에 없으면 null 이다. */
export function getRowRecordDifficulty(
  song: Song,
  difficulty: Difficulty | null,
): Difficulty | null {
  return difficulty !== null && getAvailableDifficulties(song).includes(difficulty)
    ? difficulty
    : null;
}

/** 곡 행 node 의 presentation id. 선택 > hover > 기록 기준 지속 상태(idle·played·cleared) 순이다. */
export function getSongRowNodeId(
  record: ChartRecord | null,
  isSelected: boolean,
  isHovered: boolean,
): string {
  if (isSelected) {
    return 'R17';
  }
  if (isHovered) {
    return 'R16';
  }
  if (record === null) {
    return 'R15';
  }
  return record.cleared ? 'R18' : 'C:node-played';
}

export function moveSong(state: SongSelectState, delta: number): SongSelectState {
  const songIndex = clamp(state.songIndex + delta, 0, state.songs.length - 1);
  return selectSong(state, songIndex);
}

export function selectSong(state: SongSelectState, index: number): SongSelectState {
  const song = state.songs[index];
  if (song === undefined || index === state.songIndex) {
    return state;
  }
  return { ...state, songIndex: index, difficulty: pickDifficulty(song, state.difficulty) };
}

export function moveDifficulty(state: SongSelectState, delta: 1 | -1): SongSelectState {
  const song = getCurrentSong(state);
  if (song === undefined || state.difficulty === null) {
    return state;
  }
  const difficulty = stepItem(getAvailableDifficulties(song), state.difficulty, delta);
  if (difficulty === state.difficulty) {
    return state;
  }
  return { ...state, difficulty };
}

export function selectDifficulty(state: SongSelectState, difficulty: Difficulty): SongSelectState {
  const song = getCurrentSong(state);
  if (
    song === undefined ||
    difficulty === state.difficulty ||
    !getAvailableDifficulties(song).includes(difficulty)
  ) {
    return state;
  }
  return { ...state, difficulty };
}

export function cycleFilter(state: SongSelectState, delta: 1 | -1): SongSelectState {
  return selectFilter(state, cycleItem(SONG_FILTERS, state.filter, delta));
}

export function selectFilter(state: SongSelectState, filter: SongFilter): SongSelectState {
  const songs = filterSongs(state.allSongs, filter);
  return {
    ...state,
    filter,
    songs,
    songIndex: 0,
    difficulty: pickDifficulty(songs[0], state.difficulty),
  };
}

function pickDifficulty(song: Song | undefined, current: Difficulty | null): Difficulty | null {
  if (song === undefined) {
    return null;
  }
  const available = getAvailableDifficulties(song);
  if (current !== null && available.includes(current)) {
    return current;
  }
  return available[0] ?? null;
}
