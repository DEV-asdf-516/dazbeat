import {
  findChart,
  getAvailableCharts,
  getAvailableDifficulties,
  stepChart,
} from '../../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../../data/songs.js';
import type { Difficulty, LaneCount } from '../../../rhythm/types.js';
import { getChartRecord } from '../../../storage/chartRecords.js';
import type { ChartRecord, ChartRecords } from '../../../storage/chartRecords.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import {
  getControlsCloseView,
  isControlsButtonEnabled,
  isControlsEntryHovered,
} from '../../app/controlsGuide.js';
import type { ControlsButton } from '../../app/controlsGuide.js';
import type { CelestialStaticId } from '../../celestial/state/celestialCatalog.js';
import { getDifficultyAppearance } from '../../ui/state/difficultyAppearance.js';
import type { TabAppearance } from '../../ui/state/tabAppearance.js';
import { requireDefined } from '../../../invariant.js';
import { clamp } from '../../../range.js';
import { isShallowEqual } from '../../../shallowEqual.js';
import type { SongFeed, SongFeedStatus } from '../../app/SongFeed.js';
import type { SongSelectRestore } from '../../app/sceneRoutes.js';

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

export type SongSelectButton = 'settings' | ControlsButton;

export type SongSelectHover =
  | { readonly kind: 'filter'; readonly filter: SongFilter }
  | { readonly kind: 'row'; readonly slot: number }
  | { readonly kind: 'action'; readonly action: SongSelectAction }
  | { readonly kind: 'difficulty'; readonly difficulty: Difficulty }
  | ButtonHover<SongSelectButton>;

export interface SongSelectState {
  readonly filter: SongFilter;
  readonly songs: readonly Song[];
  readonly laneCount: LaneCount;
  readonly current: SongSelection;
  readonly hover: SongSelectHover | null;
  readonly isControlsOpen: boolean;
}

export type SongRowAppearance = 'selected' | 'hovered' | 'idle';

export type SongRowView =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'song';
      readonly song: Song;
      readonly appearance: SongRowAppearance;
      readonly nodeId: SongRowNodeId;
    };

export type SongSelectNotice = 'loading' | 'loadFailed' | 'noSongs';

export interface SongSelectView {
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
  readonly isLoadingMore: boolean;
  /** 아직 받지 않은 곡까지 포함한 목록 전체 곡 수. 페이지 수 표시에 쓴다. */
  readonly songCount: number;
  readonly records: ChartRecords;
}

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
      isControlsOpen: false,
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
    isControlsOpen: false,
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

export function getSelectedRecord(
  state: SongSelectState,
  records: ChartRecords,
): ChartRecord | null {
  const selection = getPlayableSelection(state);
  return selection === null
    ? null
    : getChartRecord(records, selection.song.id, selection.laneCount, selection.difficulty);
}

export function getDifficultyAccent(state: SongSelectState): number | null {
  return state.current.kind === 'song' ? state.current.song.accentColor : null;
}

export function getNoticeKind(notice: SongSelectNotice): 'loading' | 'text' {
  return notice === 'loading' ? 'loading' : 'text';
}

export const SONG_ROW_NODE_IDS = [
  'R15',
  'R16',
  'R17',
  'R18',
  'C:node-played',
] as const satisfies readonly CelestialStaticId[];

type SongRowNodeId = (typeof SONG_ROW_NODE_IDS)[number];

export function getSongRowNodeId(
  appearance: SongRowAppearance,
  record: ChartRecord | null,
): SongRowNodeId {
  switch (appearance) {
    case 'selected':
      return 'R17';
    case 'hovered':
      return 'R16';
    case 'idle':
      if (record === null) {
        return 'R15';
      }
      return record.cleared ? 'R18' : 'C:node-played';
  }
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

export function getSongRows(
  state: SongSelectState,
  rowsPerPage: number,
  records: ChartRecords,
): SongRowView[] {
  const { startIndex, selectedSlot } = getSongPage(state, rowsPerPage);
  const difficulty = getSelectedDifficulty(state.current);
  return Array.from({ length: rowsPerPage }, (_, slot): SongRowView => {
    const song = state.songs[startIndex + slot];
    if (song === undefined) {
      return { kind: 'empty' };
    }
    const appearance = getSongRowAppearance(state, slot, selectedSlot);
    const recordChart =
      difficulty === null ? undefined : findChart(song, state.laneCount, difficulty);
    return {
      kind: 'song',
      song,
      appearance,
      nodeId: getSongRowNodeId(
        appearance,
        recordChart === undefined
          ? null
          : getChartRecord(records, song.id, recordChart.laneCount, recordChart.difficulty),
      ),
    };
  });
}

export function getPageIndicator(
  state: SongSelectState,
  rowsPerPage: number,
  songCount: number,
): { readonly text: string } | null {
  const pageCount = Math.ceil(songCount / rowsPerPage);
  if (pageCount < 2) {
    return null;
  }
  return { text: `${getSongPage(state, rowsPerPage).pageNumber} / ${pageCount}` };
}

export type LoadingMoreAnchor =
  { readonly kind: 'row'; readonly slot: number } | { readonly kind: 'pageEnd' };

// 받아 둔 마지막 곡 바로 아래 칸에 붙이고, 그 곡이 이 쪽 마지막 칸이면 쪽 번호 줄 끝에 둔다.
export function getLoadingMoreAnchor(
  state: SongSelectState,
  rowsPerPage: number,
): LoadingMoreAnchor {
  const { startIndex } = getSongPage(state, rowsPerPage);
  const filledCount = clamp(state.songs.length - startIndex, 0, rowsPerPage);
  return filledCount === rowsPerPage
    ? { kind: 'pageEnd' }
    : {
        kind: 'row',
        slot: filledCount,
      };
}

function getSongRowAppearance(
  state: SongSelectState,
  slot: number,
  selectedSlot: number | null,
): SongRowAppearance {
  if (slot === selectedSlot) {
    return 'selected';
  }
  return isSameHover(state.hover, {
    kind: 'row',
    slot,
  })
    ? 'hovered'
    : 'idle';
}

export function getSongDifficultyAppearance(
  state: SongSelectState,
  difficulty: Difficulty,
): TabAppearance {
  const { current, hover } = state;
  return getDifficultyAppearance(difficulty, {
    selected: current.kind === 'song' ? (current.chart?.difficulty ?? null) : null,
    hovered: hover?.kind === 'difficulty' ? hover.difficulty : null,
    available:
      current.kind === 'song' ? getAvailableDifficulties(current.song, state.laneCount) : [],
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

export type SongActionAppearance = 'disabled' | 'hovered' | 'idle';

export function getActionAppearance(
  state: SongSelectState,
  action: SongSelectAction,
): SongActionAppearance {
  if (!isActionEnabled(state, action)) {
    return 'disabled';
  }
  return isSameHover(state.hover, {
    kind: 'action',
    action,
  })
    ? 'hovered'
    : 'idle';
}

function isActionEnabled(state: SongSelectState, action: SongSelectAction): boolean {
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
    isControlsOpen: state.isControlsOpen,
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
    case 'button':
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

function withHover(state: SongSelectState, hover: SongSelectHover | null): SongSelectState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(
    state,
    pressButton(
      state.hover,
      button,
      button === 'settings' || isControlsButtonEnabled(button, state.isControlsOpen),
    ),
  );
}

export function releaseSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getSettingsButtonView(view: SongSelectView): ButtonView {
  return getButtonView(view.state.hover, 'settings', true, false);
}

export function getSongSelectControlsCloseView(view: SongSelectView): ButtonView {
  return getControlsCloseView(view.state.hover, view.state.isControlsOpen);
}

export function isSongSelectControlsEntryHovered(view: SongSelectView): boolean {
  return isControlsEntryHovered(view.state.hover);
}

export type SongSelectShortcut = 'openSettings' | 'selectRandomSong';

export function readSongSelectShortcut(
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): SongSelectShortcut | null {
  switch (event.code) {
    case 'Tab':
      return 'openSettings';
    case 'KeyR':
      return event.repeat ? null : 'selectRandomSong';
    default:
      return null;
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
    case 'button':
      return target.kind === 'button' && target.button === hover.button;
  }
}

function getSelectedDifficulty(current: SongSelection): Difficulty | null {
  return current.kind === 'song' ? (current.chart?.difficulty ?? null) : current.difficulty;
}

export type SongSelectRegion =
  | 'filterTabs'
  | 'rows'
  | 'selectedHalo'
  | 'notice'
  | 'pageIndicator'
  | 'loadingMore'
  | 'jacket'
  | 'songInfo'
  | 'difficultyTabs'
  | 'actions'
  | 'jacketLoads'
  | 'controls'
  | 'settingsButton'
  | 'controlsEntry'
  | 'controlsClose'
  | 'jacketGlint'
  | 'rowShift';

// 쪽 칸 수가 인자라 읽기 함수가 view 와 함께 받는다.
interface RegionInput {
  readonly view: SongSelectView;
  readonly rowsPerPage: number;
}

type SongSelectReader = (input: RegionInput) => unknown;

const readFilter: SongSelectReader = ({ view }) => view.state.filter;
const readHoveredFilter: SongSelectReader = ({ view }) =>
  view.state.hover?.kind === 'filter' ? view.state.hover.filter : null;
const readHoveredSlot: SongSelectReader = ({ view }) =>
  view.state.hover?.kind === 'row' ? view.state.hover.slot : null;
const readHoveredDifficulty: SongSelectReader = ({ view }) =>
  view.state.hover?.kind === 'difficulty' ? view.state.hover.difficulty : null;
const readSongs: SongSelectReader = ({ view }) => view.state.songs;
const readLaneCount: SongSelectReader = ({ view }) => view.state.laneCount;
const readCurrent: SongSelectReader = ({ view }) => view.state.current;
const readCurrentSong: SongSelectReader = ({ view }) =>
  view.state.current.kind === 'song' ? view.state.current.song : null;
const readRecords: SongSelectReader = ({ view }) => view.records;
const readSelectedRecord: SongSelectReader = ({ view }) =>
  getSelectedRecord(view.state, view.records);
const readStartIndex: SongSelectReader = ({ view, rowsPerPage }) =>
  getSongPage(view.state, rowsPerPage).startIndex;
const readSelectedSlot: SongSelectReader = ({ view, rowsPerPage }) =>
  getSongPage(view.state, rowsPerPage).selectedSlot;
const readNotice: SongSelectReader = ({ view }) => view.notice;
const readPageText: SongSelectReader = ({ view, rowsPerPage }) =>
  getPageIndicator(view.state, rowsPerPage, view.songCount)?.text ?? null;
const readIsLoadingMore: SongSelectReader = ({ view }) => view.isLoadingMore;
const readLoadingMoreSlot: SongSelectReader = ({ view, rowsPerPage }) => {
  const anchor = getLoadingMoreAnchor(view.state, rowsPerPage);
  return anchor.kind === 'row' ? anchor.slot : null;
};
const readRandomAppearance: SongSelectReader = ({ view }) =>
  getActionAppearance(view.state, 'random');
const readPlayAppearance: SongSelectReader = ({ view }) => getActionAppearance(view.state, 'play');
const readControlsOpen: SongSelectReader = ({ view }) => view.state.isControlsOpen;
const readSettingsHovered: SongSelectReader = ({ view }) =>
  isButtonHovered(view.state.hover, 'settings');
const readSettingsPressed: SongSelectReader = ({ view }) =>
  isButtonPressed(view.state.hover, 'settings');
const readEntryHovered: SongSelectReader = ({ view }) =>
  isButtonHovered(view.state.hover, 'controlsEntry');
const readCloseHovered: SongSelectReader = ({ view }) =>
  isButtonHovered(view.state.hover, 'controlsClose');
const readClosePressed: SongSelectReader = ({ view }) =>
  isButtonPressed(view.state.hover, 'controlsClose');

const REGION_SOURCES: Readonly<
  Record<Exclude<SongSelectRegion, 'jacketGlint' | 'rowShift'>, readonly SongSelectReader[]>
> = {
  filterTabs: [readFilter, readHoveredFilter],
  // 칸마다 곡, 모양(고름, hover), 기록 노드를 읽는다. 어느 칸을 칠할지는 getChangedRowSlots 가 정한다.
  rows: [
    readSongs,
    readStartIndex,
    readSelectedSlot,
    readHoveredSlot,
    readCurrent,
    readLaneCount,
    readRecords,
  ],
  selectedHalo: [readSelectedSlot],
  notice: [readNotice],
  pageIndicator: [readPageText],
  loadingMore: [readIsLoadingMore, readLoadingMoreSlot],
  jacket: [readCurrentSong],
  songInfo: [readCurrentSong, readSelectedRecord],
  difficultyTabs: [readCurrent, readLaneCount, readHoveredDifficulty],
  actions: [readRandomAppearance, readPlayAppearance],
  jacketLoads: [readSongs, readStartIndex],
  controls: [readControlsOpen],
  settingsButton: [readSettingsHovered, readSettingsPressed],
  controlsEntry: [readEntryHovered],
  controlsClose: [readCloseHovered, readClosePressed, readControlsOpen],
};

export function getChangedRegions(
  previous: SongSelectView | null,
  next: SongSelectView,
  rowsPerPage: number,
): readonly SongSelectRegion[] {
  const regions: SongSelectRegion[] = [
    ...filterChangedRegions(
      REGION_SOURCES,
      previous === null
        ? null
        : {
            view: previous,
            rowsPerPage,
          },
      {
        view: next,
        rowsPerPage,
      },
    ),
  ];
  if (previous !== null && hasNewCurrentSong(previous.state, next.state)) {
    regions.push('jacketGlint');
  }
  if (getShiftedRowSlots(previous, next, rowsPerPage).length > 0) {
    regions.push('rowShift');
  }
  return regions;
}

export function getChangedRowSlots(
  previous: SongSelectView | null,
  next: SongSelectView,
  rowsPerPage: number,
): readonly number[] {
  const after = getSongRows(next.state, rowsPerPage, next.records);
  if (previous === null) {
    return after.map((_, slot) => slot);
  }
  const before = getSongRows(previous.state, rowsPerPage, previous.records);
  return after.flatMap((row, slot) => (isSameRow(before[slot], row) ? [] : [slot]));
}

export function getShiftedRowSlots(
  previous: SongSelectView | null,
  next: SongSelectView,
  rowsPerPage: number,
): readonly number[] {
  const after = getSongPage(next.state, rowsPerPage).selectedSlot;
  const before = previous === null ? null : getSongPage(previous.state, rowsPerPage).selectedSlot;
  if (after === before) {
    return [];
  }
  return [before, after].filter((slot) => slot !== null);
}

function isSameRow(previous: SongRowView | undefined, next: SongRowView): boolean {
  return previous !== undefined && isShallowEqual(previous, next);
}

function hasNewCurrentSong(previous: SongSelectState, next: SongSelectState): boolean {
  return (
    next.current.kind === 'song' &&
    (previous.current.kind === 'none' || previous.current.song !== next.current.song)
  );
}
