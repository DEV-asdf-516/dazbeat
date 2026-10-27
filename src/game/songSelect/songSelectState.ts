import { findChart, getAvailableCharts, stepChart } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import type { ChartRecord } from '../../storage/chartRecords.js';
import type { CelestialStaticId } from '../celestial/celestialCatalog.js';
import { getDifficultyAppearance } from '../difficultyAppearance.js';
import type { TabAppearance } from '../ui/TextTabs.js';
import { requireDefined } from '../../invariant.js';
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

export const SONG_SELECT_ACTIONS = ['random', 'play'] as const;
export type SongSelectAction = (typeof SONG_SELECT_ACTIONS)[number];

export type SongSelectHover =
  | { readonly kind: 'filter'; readonly filter: SongFilter }
  | { readonly kind: 'row'; readonly slot: number }
  | { readonly kind: 'action'; readonly action: SongSelectAction }
  | { readonly kind: 'difficulty'; readonly difficulty: Difficulty };

export interface SongSelectState {
  readonly filter: SongFilter;
  readonly songs: readonly Song[];
  readonly laneCount: LaneCount;
  readonly current: SongSelection;
  readonly hover: SongSelectHover | null;
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
  laneCount: LaneCount,
  target?: SongSelectTarget,
): SongSelectState {
  if (target === undefined) {
    return {
      filter,
      songs,
      laneCount,
      current: selectAt(songs, laneCount, 0, null),
      hover: null,
    };
  }
  if (songs.length === 0) {
    return {
      filter,
      songs,
      laneCount,
      current: {
        kind: 'none',
        difficulty: target.difficulty,
      },
      hover: null,
    };
  }
  const found = songs.findIndex((song) => song.id === target.songId);
  return {
    filter,
    songs,
    laneCount,
    current: selectAt(
      songs,
      laneCount,
      found === -1 ? clamp(target.index, 0, songs.length - 1) : found,
      target.difficulty,
    ),
    hover: null,
  };
}

export function openSongSelect(
  catalog: SongFeed,
  laneCount: LaneCount,
  restore: SongSelectRestore | undefined,
): { readonly feed: SongFeed; readonly state: SongSelectState } {
  if (restore === undefined) {
    return {
      feed: catalog,
      state: createSongSelectState(catalog.songs, 'all', laneCount),
    };
  }
  const { feed } = restore;
  return {
    feed,
    state: createSongSelectState(feed.songs, feed.query.category, laneCount, restore),
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

// 빈 목록의 로딩은 notice 가 알리고, 곡이 보이는 동안 다음 배치를 받을 때만 목록 아래에 따로 알린다.
export function isLoadingMoreSongs(loadedCount: number, status: SongFeedStatus): boolean {
  return loadedCount > 0 && status === 'loading';
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
  readonly loadedPageCount: number;
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
    loadedPageCount: Math.ceil(state.songs.length / rowsPerPage),
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
      recordChart:
        difficulty === null ? null : (findChart(song, state.laneCount, difficulty) ?? null),
    };
  });
}

export function getSongDifficultyAppearance(
  state: SongSelectState,
  difficulty: Difficulty,
  isHovered: boolean,
): TabAppearance {
  const { current } = state;
  return getDifficultyAppearance({
    isSelected: current.kind === 'song' && difficulty === current.chart?.difficulty,
    isAvailable:
      current.kind === 'song' && findChart(current.song, state.laneCount, difficulty) !== undefined,
    isHovered,
  });
}

/** 고른 필터는 hover 보다 먼저 본다. */
export function getFilterAppearance(state: SongSelectState, filter: SongFilter): TabAppearance {
  if (state.filter === filter) {
    return 'selected';
  }
  return isSameHover(state.hover, {
    kind: 'filter',
    filter,
  })
    ? 'emphasized'
    : 'normal';
}

export function moveSong(state: SongSelectState, delta: number): SongSelectState {
  if (state.songs.length === 0) {
    return state;
  }
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
    current: selectAt(state.songs, state.laneCount, index, getSelectedDifficulty(current)),
  };
}

export function canSelectRandomSong(state: SongSelectState): boolean {
  return getRandomCandidates(state).length > 0;
}

export function isActionEnabled(state: SongSelectState, action: SongSelectAction): boolean {
  return action === 'random' ? canSelectRandomSong(state) : getPlayableSelection(state) !== null;
}

export function selectRandomSong(state: SongSelectState, random: () => number): SongSelectState {
  const candidates = getRandomCandidates(state);
  if (candidates.length === 0) {
    return state;
  }
  return selectSong(
    state,
    requireDefined(
      candidates[Math.floor(random() * candidates.length)],
      'Random value must be in [0, 1)',
    ),
  );
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
  const chart = findChart(current.song, state.laneCount, difficulty);
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
    laneCount: state.laneCount,
    current: selectAt(songs, state.laneCount, 0, getSelectedDifficulty(state.current)),
    hover: state.hover,
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
      state.laneCount,
      current.kind === 'song' ? current.index : 0,
      getSelectedDifficulty(current),
    ),
  };
}

export function setHover(state: SongSelectState, target: SongSelectHover): SongSelectState {
  return isSameHover(state.hover, target)
    ? state
    : {
        ...state,
        hover: target,
      };
}

export function clearHover(state: SongSelectState, target: SongSelectHover): SongSelectState {
  return isSameHover(state.hover, target)
    ? {
        ...state,
        hover: null,
      }
    : state;
}

// 빈 줄과 누를 수 없게 된 RANDOM, PLAY 는 씬이 입력을 꺼 Phaser 가 POINTER_OUT 을 보내지 않으므로 hover 를 여기서 푼다.
export function releaseHover(state: SongSelectState, rowsPerPage: number): SongSelectState {
  const { hover } = state;
  if (hover === null) {
    return state;
  }
  switch (hover.kind) {
    case 'filter':
    case 'difficulty':
      return state;
    case 'row':
      return getSongPage(state, rowsPerPage).startIndex + hover.slot >= state.songs.length
        ? {
            ...state,
            hover: null,
          }
        : state;
    case 'action':
      return isActionEnabled(state, hover.action)
        ? state
        : {
            ...state,
            hover: null,
          };
  }
}

export function isOnLastLoadedPage(state: SongSelectState, rowsPerPage: number): boolean {
  const { pageNumber, loadedPageCount } = getSongPage(state, rowsPerPage);
  return pageNumber >= loadedPageCount;
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
  laneCount: LaneCount,
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
  const charts = getAvailableCharts(song, laneCount);
  return {
    kind: 'song',
    index,
    song,
    chart: charts.find((chart) => chart.difficulty === previous) ?? charts[0] ?? null,
  };
}

function getRandomCandidates(state: SongSelectState): number[] {
  const playable = state.songs.flatMap((song, index) =>
    getAvailableCharts(song, state.laneCount).length > 0 ? [index] : [],
  );
  if (playable.length <= 1) {
    return [];
  }
  const { current } = state;
  return playable.filter((index) => current.kind !== 'song' || index !== current.index);
}

function isSameHover(hover: SongSelectHover | null, target: SongSelectHover): boolean {
  if (hover === null) {
    return false;
  }
  switch (hover.kind) {
    case 'filter':
      return target.kind === 'filter' && target.filter === hover.filter;
    case 'row':
      return target.kind === 'row' && target.slot === hover.slot;
    case 'action':
      return target.kind === 'action' && target.action === hover.action;
    case 'difficulty':
      return target.kind === 'difficulty' && target.difficulty === hover.difficulty;
  }
}

function getSelectedDifficulty(current: SongSelection): Difficulty | null {
  return current.kind === 'song' ? (current.chart?.difficulty ?? null) : current.difficulty;
}
