import { findChart, getAvailableCharts, stepChart } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import type { ChartRecord } from '../../storage/chartRecords.js';
import type { CelestialStaticId } from '../celestial/celestialCatalog.js';
import { getDifficultyAppearance } from '../difficultyAppearance.js';
import type { DifficultyAppearance } from '../difficultyAppearance.js';
import { clamp } from '../../range.js';
import type { SongFeed, SongFeedStatus } from '../SongFeed.js';
import type { SongSelectRestore } from '../sceneRoutes.js';

export type SongSelection =
  | { readonly kind: 'none'; readonly difficulty: Difficulty | null }
  | {
      readonly kind: 'song';
      readonly index: number;
      readonly song: Song;
      readonly chart: ChartRef | null;
    };

export interface SongSelectState {
  readonly filter: SongFilter;
  readonly songs: readonly Song[];
  readonly current: SongSelection;
}

export type SongRowView =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'song';
      readonly song: Song;
      readonly isSelected: boolean;
      readonly recordChart: ChartRef | null;
    };

export type SongSelectNotice = 'loading' | 'loadFailed' | 'noSongs';

type SongSelectTarget = Pick<SongSelectRestore, 'index' | 'songId' | 'difficulty'>;

export function createSongSelectState(
  songs: readonly Song[],
  filter: SongFilter,
  target?: SongSelectTarget,
): SongSelectState {
  if (target === undefined) {
    return {
      filter,
      songs,
      current: selectAt(songs, 0, null),
    };
  }
  const found = songs.findIndex((song) => song.id === target.songId);
  return {
    filter,
    songs,
    current: selectAt(
      songs,
      found === -1 ? clamp(target.index, 0, songs.length - 1) : found,
      target.difficulty,
    ),
  };
}

export function openSongSelect(
  catalog: SongFeed,
  restore: SongSelectRestore | undefined,
): { readonly feed: SongFeed; readonly state: SongSelectState } {
  if (restore === undefined) {
    return {
      feed: catalog,
      state: createSongSelectState(catalog.songs, 'all'),
    };
  }
  const { feed } = restore;
  return {
    feed,
    state: createSongSelectState(feed.songs, feed.query.category, restore),
  };
}

export function getSongSelectTarget(state: SongSelectState): SongSelectTarget {
  const { current } = state;
  if (current.kind === 'none') {
    return {
      index: 0,
      songId: null,
      difficulty: current.difficulty,
    };
  }
  return {
    index: current.index,
    songId: current.song.id,
    difficulty: current.chart?.difficulty ?? null,
  };
}

export function getSongSelectNotice(
  songCount: number,
  status: SongFeedStatus,
): SongSelectNotice | null {
  if (songCount > 0) {
    return null;
  }
  switch (status) {
    case 'hasMore':
    case 'loading':
      return 'loading';
    case 'failed':
      return 'loadFailed';
    case 'complete':
      return 'noSongs';
  }
}

export function getPlayableSelection(state: SongSelectState): ChartRef | null {
  return state.current.kind === 'song' ? state.current.chart : null;
}

export function isSameSelection(a: SongSelectState, b: SongSelectState): boolean {
  const { current: x } = a;
  const { current: y } = b;
  if (x.kind === 'none' || y.kind === 'none') {
    return x.kind === y.kind;
  }
  return x.song === y.song && x.chart?.difficulty === y.chart?.difficulty;
}

export function hasNewCurrentSong(previous: SongSelectState, next: SongSelectState): boolean {
  return (
    next.current.kind === 'song' &&
    (previous.current.kind === 'none' || previous.current.song !== next.current.song)
  );
}

export const SONG_ROW_NODE_IDS = [
  'R15',
  'R16',
  'R17',
  'R18',
  'C:node-played',
] as const satisfies readonly CelestialStaticId[];

export function getSongRowNodeId(
  record: ChartRecord | null,
  isSelected: boolean,
  isHovered: boolean,
): (typeof SONG_ROW_NODE_IDS)[number] {
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

export interface SongPage {
  readonly startIndex: number;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly selectedSlot: number | null;
}

export function getSongPage(state: SongSelectState, rowsPerPage: number): SongPage {
  const { current } = state;
  const songIndex = current.kind === 'song' ? current.index : 0;
  const pageIndex = Math.floor(songIndex / rowsPerPage);
  const startIndex = pageIndex * rowsPerPage;
  return {
    startIndex,
    pageNumber: pageIndex + 1,
    pageCount: Math.ceil(state.songs.length / rowsPerPage),
    selectedSlot: current.kind === 'song' ? songIndex - startIndex : null,
  };
}

export interface JacketRange {
  readonly visible: readonly Song[];
  readonly adjacent: readonly Song[];
}

export function getJacketRange(state: SongSelectState, rowsPerPage: number): JacketRange {
  const { startIndex } = getSongPage(state, rowsPerPage);
  const endIndex = startIndex + rowsPerPage;
  return {
    visible: state.songs.slice(startIndex, endIndex),
    adjacent: [
      ...state.songs.slice(Math.max(startIndex - rowsPerPage, 0), startIndex),
      ...state.songs.slice(endIndex, endIndex + rowsPerPage),
    ],
  };
}

export function getSongRows(state: SongSelectState, rowsPerPage: number): SongRowView[] {
  const { startIndex, selectedSlot } = getSongPage(state, rowsPerPage);
  const difficulty = getSelectedDifficulty(state.current);
  return Array.from({ length: rowsPerPage }, (_, slot): SongRowView => {
    const song = state.songs[startIndex + slot];
    if (song === undefined) {
      return { kind: 'empty' };
    }
    return {
      kind: 'song',
      song,
      isSelected: slot === selectedSlot,
      recordChart: difficulty === null ? null : (findChart(song, difficulty) ?? null),
    };
  });
}

export function getSongDifficultyAppearance(
  state: SongSelectState,
  difficulty: Difficulty,
  isHovered: boolean,
): DifficultyAppearance {
  const { current } = state;
  return getDifficultyAppearance({
    isSelected: current.kind === 'song' && difficulty === current.chart?.difficulty,
    isAvailable: current.kind === 'song' && findChart(current.song, difficulty) !== undefined,
    isHovered,
  });
}

export function moveSong(state: SongSelectState, delta: number): SongSelectState {
  const index = state.current.kind === 'song' ? state.current.index : 0;
  return selectSong(state, clamp(index + delta, 0, state.songs.length - 1));
}

export function selectSong(state: SongSelectState, index: number): SongSelectState {
  const { current } = state;
  if (state.songs[index] === undefined || (current.kind === 'song' && index === current.index)) {
    return state;
  }
  return {
    ...state,
    current: selectAt(state.songs, index, getSelectedDifficulty(current)),
  };
}

export function moveDifficulty(state: SongSelectState, delta: 1 | -1): SongSelectState {
  const { current } = state;
  if (current.kind === 'none' || current.chart === null) {
    return state;
  }
  const chart = stepChart(current.chart, delta);
  return chart === current.chart ? state : withChart(state, current, chart);
}

export function selectDifficulty(state: SongSelectState, difficulty: Difficulty): SongSelectState {
  const { current } = state;
  if (current.kind === 'none' || difficulty === current.chart?.difficulty) {
    return state;
  }
  const chart = findChart(current.song, difficulty);
  return chart === undefined ? state : withChart(state, current, chart);
}

export function withFilter(
  state: SongSelectState,
  filter: SongFilter,
  songs: readonly Song[],
): SongSelectState {
  return {
    filter,
    songs,
    current: selectAt(songs, 0, getSelectedDifficulty(state.current)),
  };
}

export function withSongs(state: SongSelectState, songs: readonly Song[]): SongSelectState {
  if (songs === state.songs) {
    return state;
  }
  const { current } = state;
  return {
    ...state,
    songs,
    current: selectAt(
      songs,
      current.kind === 'song' ? current.index : 0,
      getSelectedDifficulty(current),
    ),
  };
}

export function isOnLastLoadedPage(state: SongSelectState, rowsPerPage: number): boolean {
  const { pageNumber, pageCount } = getSongPage(state, rowsPerPage);
  return pageNumber >= pageCount;
}

function withChart(
  state: SongSelectState,
  current: Extract<SongSelection, { kind: 'song' }>,
  chart: ChartRef,
): SongSelectState {
  return {
    ...state,
    current: {
      ...current,
      chart,
    },
  };
}

function selectAt(
  songs: readonly Song[],
  index: number,
  previous: Difficulty | null,
): SongSelection {
  const song = songs[index];
  if (song === undefined) {
    return {
      kind: 'none',
      difficulty: previous,
    };
  }
  const charts = getAvailableCharts(song);
  return {
    kind: 'song',
    index,
    song,
    chart: charts.find((chart) => chart.difficulty === previous) ?? charts[0] ?? null,
  };
}

function getSelectedDifficulty(current: SongSelection): Difficulty | null {
  return current.kind === 'song' ? (current.chart?.difficulty ?? null) : current.difficulty;
}
