import {
  CHART_LEVELS,
  FULL_CHART_LEVEL_RANGE,
  findChart,
  getAvailableCharts,
  getAvailableDifficulties,
  stepChart,
} from '../../../data/songs.js';
import type { ChartTopRank, MyChartRecord } from '../../../data/ranking.js';
import type {
  ChartLevel,
  ChartLevelRange,
  ChartRef,
  Song,
  SongFilter,
  SongQuery,
} from '../../../data/songs.js';
import { getRank } from '../../../rhythm/rank.js';
import type { Difficulty, LaneCount, Rank } from '../../../rhythm/types.js';
import { getChartRecord, recordKey } from '../../../storage/chartRecords.js';
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
  getControlsHelpButtonView,
  isControlsHelpShown,
  isControlsPanelOpen,
  leaveControlsButton,
} from '../../app/controlsGuide.js';
import {
  completeAccountSignIn,
  getAccountPanelPointerKey,
} from '../../ui/state/accountIdentity.js';
import type { AccountPanelButton, SignInFailureButton } from '../../ui/state/accountIdentity.js';
import type { SignInFailure } from '../../app/accountState.js';
import type { ControlsButton, ControlsPanel } from '../../app/controlsGuide.js';
import type { CelestialStaticId } from '../../celestial/state/celestialCatalog.js';
import { getDifficultyAppearance } from '../../ui/state/difficultyAppearance.js';
import type { TabAppearance } from '../../ui/state/tabAppearance.js';
import { requireDefined } from '../../../invariant.js';
import {
  clamp,
  getDistance,
  getFraction,
  getProgress,
  isInRange,
  lerp,
  stepItem,
} from '../../../range.js';
import { isShallowEqual } from '../../../shallowEqual.js';
import type { SongFeed, SongFeedStatus } from '../../app/SongFeed.js';
import type { SongSelectRestore } from '../../app/sceneRoutes.js';
import type { MenuAction } from '../../ui/state/menuAction.js';
import type { ListDirection } from '../../../range.js';

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

export type SongSelectButton =
  | 'settings'
  | 'back'
  | 'ranking'
  | 'retry'
  | 'recordsRetry'
  | 'levelReset'
  | ControlsButton
  | AccountPanelButton
  | SignInFailureButton;

export type SongSelectHover =
  | { readonly kind: 'filter'; readonly filter: SongFilter }
  | { readonly kind: 'row'; readonly slot: number }
  | { readonly kind: 'action'; readonly action: SongSelectAction }
  | { readonly kind: 'difficulty'; readonly difficulty: Difficulty }
  | ButtonHover<SongSelectButton>;

export type SongRecords =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly records: ChartRecords }
  | { readonly kind: 'failed' };

export type LevelHandle = 'min' | 'max';

export type LevelSliderInput =
  | { readonly kind: 'idle' }
  | { readonly kind: 'focused'; readonly handle: LevelHandle }
  | { readonly kind: 'dragging'; readonly handle: LevelHandle; readonly anchor: ChartLevel };

export interface LevelSlider {
  readonly range: ChartLevelRange;
  readonly input: LevelSliderInput;
}

export interface SongSelectState {
  readonly filter: SongFilter;
  /** 지금 목록이 걸러진 범위. 끄는 중이나 키 반영 대기 중에는 슬라이더 범위와 다르다. */
  readonly levelRange: ChartLevelRange | null;
  readonly levelSlider: LevelSlider;
  readonly songs: readonly Song[];
  readonly laneCount: LaneCount;
  readonly current: SongSelection;
  readonly hover: SongSelectHover | null;
  readonly controls: ControlsPanel;
  /** 로그인 사용자가 20위 안인 채보의 순위. 채보 id 로 찾는다. */
  readonly topRanks: ReadonlyMap<string, number>;
  readonly records: SongRecords;
  readonly signInFailure: SignInFailure | 'none';
}

export type SongRowAppearance = 'selected' | 'hovered' | 'idle';

export type SongRowView =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'song';
      readonly song: Song;
      readonly appearance: SongRowAppearance;
      readonly nodeId: SongRowNodeId;
      readonly topRank: number | null;
      readonly level: ChartLevel | null;
    };

export type SongSelectNotice = 'loading' | 'loadFailed' | 'noSongs';

export interface SongSelectView {
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
  readonly isLoadingMore: boolean;
  /** 아직 받지 않은 곡까지 포함한 목록 전체 곡 수. 페이지 수 표시에 쓴다. */
  readonly songCount: number;
}

const NO_TOP_RANKS: ReadonlyMap<string, number> = new Map();
const IDLE_LEVEL_SLIDER: LevelSlider = {
  range: FULL_CHART_LEVEL_RANGE,
  input: { kind: 'idle' },
};

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
      levelRange: null,
      levelSlider: IDLE_LEVEL_SLIDER,
      songs,
      laneCount,
      current: selectAt(songs, laneCount, 0, null, null),
      hover: null,
      controls: 'closed',
      topRanks: NO_TOP_RANKS,
      records: { kind: 'loading' },
      signInFailure: 'none',
    };
  }
  const found = songs.findIndex((song) => song.id === target.songId);
  return {
    filter,
    levelRange: null,
    levelSlider: IDLE_LEVEL_SLIDER,
    songs,
    laneCount,
    current: selectAt(
      songs,
      laneCount,
      found === -1 ? clamp(target.index, 0, songs.length - 1) : found,
      target.difficulty,
      null,
    ),
    hover: null,
    controls: 'closed',
    topRanks: NO_TOP_RANKS,
    records: { kind: 'loading' },
    signInFailure: 'none',
  };
}

export function withTopRanks(
  state: SongSelectState,
  ranked: readonly ChartTopRank[],
): SongSelectState {
  if (ranked.length === 0 && state.topRanks.size === 0) {
    return state;
  }
  return {
    ...state,
    topRanks: new Map(ranked.map(({ chartId, rank }) => [chartId, rank])),
  };
}

export function withLocalRecords(state: SongSelectState, records: ChartRecords): SongSelectState {
  return {
    ...state,
    records: {
      kind: 'ready',
      records,
    },
  };
}

export function withMyRecords(
  state: SongSelectState,
  items: readonly MyChartRecord[],
): SongSelectState {
  return withLocalRecords(
    state,
    new Map(
      items.map(({ songId, laneCount, difficulty, ...record }) => [
        recordKey(songId, laneCount, difficulty),
        record,
      ]),
    ),
  );
}

export function failRecords(state: SongSelectState): SongSelectState {
  return {
    ...state,
    records: { kind: 'failed' },
  };
}

/** 기록과 TOP 표시는 로그인한 계정의 것으로 다시 받는다. */
export function completeSongSelectSignIn(state: SongSelectState): SongSelectState {
  return {
    ...completeAccountSignIn(state),
    records: { kind: 'loading' },
  };
}

// 다시 받는 동안 RETRY 가 숨어 Phaser 가 POINTER_OUT 을 보내지 않으므로 hover 를 여기서 푼다.
export function retryRecords(state: SongSelectState): SongSelectState {
  return {
    ...state,
    records: { kind: 'loading' },
    hover: unhoverButton(state.hover, 'recordsRetry'),
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
  const state = createSongSelectState(feed.songs, feed.query.category, laneCount, restore);
  const { level } = feed.query;
  if (level === null) {
    return {
      feed,
      state,
    };
  }
  const range: ChartLevelRange = {
    min: level.min,
    max: level.max,
  };
  return {
    feed,
    state: {
      ...state,
      levelRange: range,
      levelSlider: {
        range,
        input: { kind: 'idle' },
      },
    },
  };
}

export function getSongSelectRestore(state: SongSelectState, feed: SongFeed): SongSelectRestore {
  const { current } = state;
  if (current.kind === 'none') {
    return {
      feed,
      index: 0,
      songId: null,
      difficulty: current.difficulty,
    };
  }
  return {
    feed,
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

/** 곡이 없어 실패 안내만 보이는 동안 PLAY 와 RANKING 은 다시 불러오기로 받는다. */
export function isFeedRetryInput(state: SongSelectState, status: SongFeedStatus): boolean {
  return getSongSelectNotice(state.songs.length, status) === 'loadFailed';
}

export function getPlayableSelection(state: SongSelectState): ChartRef | null {
  return state.current.kind === 'song' ? state.current.chart : null;
}

export function getSelectedLevel(state: SongSelectState): ChartLevel | null {
  return getPlayableSelection(state)?.level ?? null;
}

export function getSelectedRecord(state: SongSelectState): ChartRecord | null {
  const selection = getPlayableSelection(state);
  return selection === null || state.records.kind !== 'ready'
    ? null
    : getChartRecord(
        state.records.records,
        selection.song.id,
        selection.laneCount,
        selection.difficulty,
      );
}

export type SelectedRecordView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'none' }
  | {
      readonly kind: 'record';
      readonly score: number;
      readonly accuracy: number;
      readonly grade: Rank;
    };

export function getSelectedRecordView(state: SongSelectState): SelectedRecordView {
  switch (state.records.kind) {
    case 'loading':
      return { kind: 'hidden' };
    case 'failed':
      return { kind: 'failed' };
    case 'ready': {
      const record = getSelectedRecord(state);
      return record === null
        ? { kind: 'none' }
        : {
            kind: 'record',
            score: record.score,
            accuracy: record.accuracy,
            grade: getRank(record.accuracy),
          };
    }
  }
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
      return record === null ? 'R15' : 'R18';
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

export function getSongRows(state: SongSelectState, rowsPerPage: number): SongRowView[] {
  const { startIndex, selectedSlot } = getSongPage(state, rowsPerPage);
  const difficulty = getSelectedDifficulty(state.current);
  return Array.from({ length: rowsPerPage }, (_, slot): SongRowView => {
    const song = state.songs[startIndex + slot];
    if (song === undefined) {
      return { kind: 'empty' };
    }
    const appearance = getSongRowAppearance(state, slot, selectedSlot);
    // 레벨 범위 필터가 켜져 있으면 곡 목록 줄에 지금 난이도의 채보 대신, 그 곡을 골랐을 때 실제로 선택될 범위 안 채보(pickChart)를 보인다.
    // 지금 난이도가 범위 밖인 곡도 줄에 보이는 레벨과 고른 뒤 레벨이 같아야 하기 때문이다.
    let recordChart: ChartRef | null = null;
    if (state.levelRange !== null) {
      recordChart = pickChart(song, state.laneCount, difficulty, state.levelRange);
    } else if (difficulty !== null) {
      recordChart = findChart(song, state.laneCount, difficulty) ?? null;
    }
    return {
      kind: 'song',
      song,
      appearance,
      nodeId: getSongRowNodeId(
        appearance,
        recordChart === null || state.records.kind !== 'ready'
          ? null
          : getChartRecord(
              state.records.records,
              song.id,
              recordChart.laneCount,
              recordChart.difficulty,
            ),
      ),
      topRank: recordChart === null ? null : (state.topRanks.get(recordChart.chartId) ?? null),
      level: recordChart?.level ?? null,
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
  const blurred = blurLevelSlider(state);
  const { current } = blurred;
  if (state.songs[index] === undefined || (current.kind === 'song' && index === current.index)) {
    return blurred;
  }
  return {
    ...blurred,
    current: selectAt(
      state.songs,
      state.laneCount,
      index,
      getSelectedDifficulty(current),
      state.levelRange,
    ),
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
  return action === 'random'
    ? getRandomCandidates(state).length > 0
    : getPlayableSelection(state) !== null;
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

export function moveDifficulty(state: SongSelectState, direction: ListDirection): SongSelectState {
  const { current } = state;
  if (current.kind === 'none' || current.chart === null) {
    return state;
  }
  const chart = stepChart(current.chart, direction);
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
  const levelRange = getSliderLevelRange(state);
  return {
    filter,
    levelRange,
    levelSlider: state.levelSlider,
    songs,
    laneCount: state.laneCount,
    current: selectAt(songs, state.laneCount, 0, getSelectedDifficulty(state.current), levelRange),
    hover: state.hover,
    controls: state.controls,
    topRanks: state.topRanks,
    records: state.records,
    signInFailure: state.signInFailure,
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
      state.levelRange,
    ),
  };
}

export function withLevelRange(
  state: SongSelectState,
  levelRange: ChartLevelRange | null,
  songs: readonly Song[],
): SongSelectState {
  return {
    ...state,
    levelRange,
    songs,
    current: selectAt(songs, state.laneCount, 0, getSelectedDifficulty(state.current), levelRange),
  };
}

export function getSliderLevelRange(state: SongSelectState): ChartLevelRange | null {
  const { range } = state.levelSlider;
  return isShallowEqual(range, FULL_CHART_LEVEL_RANGE) ? null : range;
}

export function getSongSelectQuery(state: SongSelectState, filter: SongFilter): SongQuery {
  const range = getSliderLevelRange(state);
  return {
    category: filter,
    title: '',
    level:
      range === null
        ? null
        : {
            laneCount: state.laneCount,
            min: range.min,
            max: range.max,
          },
  };
}

export function isSameSongQuery(a: SongQuery, b: SongQuery): boolean {
  if (!isShallowEqual(a, b, ['level'])) {
    return false;
  }
  return a.level === null || b.level === null
    ? a.level === b.level
    : isShallowEqual(a.level, b.level);
}

export function getLevelSliderFocus(state: SongSelectState): LevelHandle | null {
  const { input } = state.levelSlider;
  return input.kind === 'idle' ? null : input.handle;
}

export type LevelSliderKey =
  | { readonly kind: 'pass' }
  | { readonly kind: 'block' }
  | { readonly kind: 'focus' }
  | { readonly kind: 'move'; readonly direction: ListDirection }
  | { readonly kind: 'switchHandle' }
  | { readonly kind: 'blur' };

export function readLevelSliderKey(
  state: SongSelectState,
  action: MenuAction | null,
): LevelSliderKey {
  switch (state.levelSlider.input.kind) {
    case 'idle': {
      const { current } = state;
      return action === 'up' && (current.kind === 'none' || current.index === 0)
        ? { kind: 'focus' }
        : { kind: 'pass' };
    }
    case 'focused':
      switch (action) {
        case 'left':
          return {
            kind: 'move',
            direction: 'previous',
          };
        case 'right':
          return {
            kind: 'move',
            direction: 'next',
          };
        case 'confirm':
          return { kind: 'switchHandle' };
        case 'down':
        case 'back':
          return { kind: 'blur' };
        case 'up':
          return { kind: 'block' };
        case 'previousTab':
        case 'nextTab':
        case null:
          return { kind: 'pass' };
      }
      break;
    case 'dragging':
      return action === null || action === 'previousTab' || action === 'nextTab'
        ? { kind: 'pass' }
        : { kind: 'block' };
  }
}

function withLevelSlider(state: SongSelectState, levelSlider: LevelSlider): SongSelectState {
  return {
    ...state,
    levelSlider,
  };
}

export function focusLevelSlider(state: SongSelectState): SongSelectState {
  const { levelSlider } = state;
  return levelSlider.input.kind === 'idle'
    ? withLevelSlider(state, {
        range: levelSlider.range,
        input: {
          kind: 'focused',
          handle: 'min',
        },
      })
    : state;
}

export function blurLevelSlider(state: SongSelectState): SongSelectState {
  const { levelSlider } = state;
  return levelSlider.input.kind === 'focused'
    ? withLevelSlider(state, {
        range: levelSlider.range,
        input: { kind: 'idle' },
      })
    : state;
}

export function switchLevelHandle(state: SongSelectState): SongSelectState {
  const { levelSlider } = state;
  const { input } = levelSlider;
  return input.kind === 'focused'
    ? withLevelSlider(state, {
        range: levelSlider.range,
        input: {
          kind: 'focused',
          handle: input.handle === 'min' ? 'max' : 'min',
        },
      })
    : state;
}

export function resetLevelSlider(state: SongSelectState): SongSelectState {
  const { levelSlider } = state;
  return isShallowEqual(levelSlider.range, FULL_CHART_LEVEL_RANGE)
    ? state
    : withLevelSlider(state, {
        range: FULL_CHART_LEVEL_RANGE,
        input: levelSlider.input,
      });
}

export function moveLevelHandle(state: SongSelectState, direction: ListDirection): SongSelectState {
  const { levelSlider } = state;
  const { input, range } = levelSlider;
  if (input.kind !== 'focused') {
    return state;
  }
  const next = spanLevels(
    input.handle === 'min' ? range.max : range.min,
    stepItem(CHART_LEVELS, range[input.handle], direction),
    input.handle,
  );
  return isShallowEqual(next.range, range) && next.handle === input.handle
    ? state
    : withLevelSlider(state, {
        range: next.range,
        input: {
          kind: 'focused',
          handle: next.handle,
        },
      });
}

export function pressLevelSlider(state: SongSelectState, level: ChartLevel): SongSelectState {
  const { range } = state.levelSlider;
  const isMaxNearer = getDistance(level, range.min) > getDistance(level, range.max);
  return dragTo(state, isMaxNearer ? range.min : range.max, level, isMaxNearer ? 'max' : 'min');
}

export function dragLevelSlider(state: SongSelectState, level: ChartLevel): SongSelectState {
  const { input } = state.levelSlider;
  return input.kind === 'dragging' ? dragTo(state, input.anchor, level, input.handle) : state;
}

export function releaseLevelSlider(state: SongSelectState): SongSelectState {
  const { levelSlider } = state;
  const { input } = levelSlider;
  return input.kind === 'dragging'
    ? withLevelSlider(state, {
        range: levelSlider.range,
        input: {
          kind: 'focused',
          handle: input.handle,
        },
      })
    : state;
}

function spanLevels(
  anchor: ChartLevel,
  level: ChartLevel,
  movingHandle: LevelHandle,
): { readonly range: ChartLevelRange; readonly handle: LevelHandle } {
  let handle = movingHandle;
  if (level < anchor) {
    handle = 'min';
  } else if (level > anchor) {
    handle = 'max';
  }
  return {
    range: {
      min: level < anchor ? level : anchor,
      max: level > anchor ? level : anchor,
    },
    handle,
  };
}

function dragTo(
  state: SongSelectState,
  anchor: ChartLevel,
  level: ChartLevel,
  draggedHandle: LevelHandle,
): SongSelectState {
  const { range, handle } = spanLevels(anchor, level, draggedHandle);
  const next: LevelSlider = {
    range,
    input: {
      kind: 'dragging',
      handle,
      anchor,
    },
  };
  const { levelSlider } = state;
  return isShallowEqual(next.range, levelSlider.range) &&
    isShallowEqual(next.input, levelSlider.input)
    ? state
    : withLevelSlider(state, next);
}

export const LEVEL_SLIDER_LAYOUT = {
  labelXPx: 566,
  railLeftXPx: 628,
  railRightXPx: 814,
} as const;

const LAST_LEVEL_INDEX = CHART_LEVELS.length - 1;

export function getLevelSliderLevel(xPx: number): ChartLevel {
  const { railLeftXPx, railRightXPx } = LEVEL_SLIDER_LAYOUT;
  const index = Math.round(getProgress(xPx, railLeftXPx, railRightXPx) * LAST_LEVEL_INDEX);
  return requireDefined(CHART_LEVELS[index], 'Level slider index outside the rail', index);
}

export function getLevelSliderXPx(level: ChartLevel): number {
  const { railLeftXPx, railRightXPx } = LEVEL_SLIDER_LAYOUT;
  return lerp(
    railLeftXPx,
    railRightXPx,
    getFraction(CHART_LEVELS.indexOf(level), 0, LAST_LEVEL_INDEX),
  );
}

export type LevelHandleSpacing = 'single' | 'adjacent' | 'apart';

// 한 칸 차이면 두 별 위의 레벨 숫자가 맞닿아 서로 비켜 놓아야 한다.
export function getLevelHandleSpacing(min: ChartLevel, max: ChartLevel): LevelHandleSpacing {
  const steps = CHART_LEVELS.indexOf(max) - CHART_LEVELS.indexOf(min);
  if (steps === 0) {
    return 'single';
  }
  return steps === 1 ? 'adjacent' : 'apart';
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

// 빈 줄, 누를 수 없게 된 RANDOM 과 PLAY, 전체 범위로 돌아가 숨은 레벨 초기화는 씬이 입력을 꺼
// Phaser 가 POINTER_OUT 을 보내지 않으므로 hover 를 여기서 푼다.
export function releaseHover(state: SongSelectState, rowsPerPage: number): SongSelectState {
  const { hover } = state;
  if (hover === null) {
    return state;
  }
  switch (hover.kind) {
    case 'filter':
    case 'difficulty':
      return state;
    case 'button':
      return hover.button === 'levelReset' && !isSongSelectButtonEnabled(state, 'levelReset')
        ? {
            ...state,
            hover: null,
          }
        : state;
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

// RETRY 는 실패 안내와 함께 숨어 Phaser 가 POINTER_OUT 을 보내지 않으므로 hover 를 여기서 푼다.
export function releaseRetryHover(state: SongSelectState, status: SongFeedStatus): SongSelectState {
  return isFeedRetryInput(state, status)
    ? state
    : withHover(state, unhoverButton(state.hover, 'retry'));
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
  return leaveControlsButton(withHover(state, unhoverButton(state.hover, button)), button);
}

export function pressSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(
    state,
    pressButton(state.hover, button, isSongSelectButtonEnabled(state, button)),
  );
}

function isSongSelectButtonEnabled(state: SongSelectState, button: SongSelectButton): boolean {
  switch (button) {
    case 'ranking':
      return getPlayableSelection(state) !== null;
    case 'levelReset':
      return getSliderLevelRange(state) !== null;
    case 'settings':
    case 'back':
    case 'retry':
    case 'recordsRetry':
    case 'controlsEntry':
    case 'controlsClose':
    case 'controlsBackdrop':
    case 'controlsHelp':
    case 'accountProfile':
    case 'accountSignIn':
    case 'signInFailureClose':
      return true;
  }
}

// 휠은 팝업 배경을 거치지 않으므로 조작 안내나 로그인 실패 팝업이 열린 동안 목록을 움직이지 않는다.
export function isSongSelectWheelBlocked(state: SongSelectState): boolean {
  return isControlsPanelOpen(state) || state.signInFailure !== 'none';
}

export function releaseSongSelectButton(
  state: SongSelectState,
  button: SongSelectButton,
): SongSelectState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getBackButtonView(view: SongSelectView): ButtonView {
  return getButtonView(view.state.hover, 'back', true, false);
}

export function getSettingsButtonView(view: SongSelectView): ButtonView {
  return getButtonView(view.state.hover, 'settings', true, false);
}

export function getRetryButtonView(view: SongSelectView): ButtonView {
  return getButtonView(view.state.hover, 'retry', true, false);
}

export function getRecordsRetryButtonView(view: SongSelectView): ButtonView {
  return getButtonView(view.state.hover, 'recordsRetry', true, false);
}

export function getRankingButtonView(view: SongSelectView): ButtonView {
  return getButtonView(
    view.state.hover,
    'ranking',
    isSongSelectButtonEnabled(view.state, 'ranking'),
    false,
  );
}

export function getLevelResetButtonView(view: SongSelectView): ButtonView {
  return getButtonView(
    view.state.hover,
    'levelReset',
    isSongSelectButtonEnabled(view.state, 'levelReset'),
    false,
  );
}

export type SongSelectShortcut =
  'openSettings' | 'selectRandomSong' | 'openRanking' | 'resetLevelFilter';

export function readSongSelectShortcut(
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): SongSelectShortcut | null {
  if (event.repeat) {
    return null;
  }
  switch (event.code) {
    case 'Tab':
      return 'openSettings';
    case 'KeyR':
      return 'selectRandomSong';
    case 'KeyL':
      return 'openRanking';
    case 'Backspace':
      return 'resetLevelFilter';
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
  levelRange: ChartLevelRange | null,
): SongSelection {
  const song = songs[index];
  if (song === undefined) {
    return {
      kind: 'none',
      difficulty: previous,
    };
  }
  return {
    kind: 'song',
    index,
    song,
    chart: pickChart(song, laneCount, previous, levelRange),
  };
}

// 범위 안 채보가 없으면(저장 직후 등) 범위 없이 고른다.
function pickChart(
  song: Song,
  laneCount: LaneCount,
  previous: Difficulty | null,
  levelRange: ChartLevelRange | null,
): ChartRef | null {
  const charts = getAvailableCharts(song, laneCount);
  const inRange =
    levelRange === null
      ? charts
      : charts.filter(({ level }) => isInRange(level, levelRange.min, levelRange.max));
  const candidates = inRange.length > 0 ? inRange : charts;
  return candidates.find((chart) => chart.difficulty === previous) ?? candidates[0] ?? null;
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
  | 'levelSlider'
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
  | 'backButton'
  | 'rankingButton'
  | 'levelResetButton'
  | 'retryButton'
  | 'recordsRetryButton'
  | 'controlsEntry'
  | 'accountButton'
  | 'controlsClose'
  | 'controlsHelpCard'
  | 'controlsHelpButton'
  | 'signInFailure'
  | 'signInFailureButtons'
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
const readLevelRange: SongSelectReader = ({ view }) => view.state.levelRange;
const readLaneCount: SongSelectReader = ({ view }) => view.state.laneCount;
const readCurrent: SongSelectReader = ({ view }) => view.state.current;
const readCurrentSong: SongSelectReader = ({ view }) =>
  view.state.current.kind === 'song' ? view.state.current.song : null;
const readRecords: SongSelectReader = ({ view }) => view.state.records;
const readRecordsKind: SongSelectReader = ({ view }) => view.state.records.kind;
const readSelectedRecord: SongSelectReader = ({ view }) => getSelectedRecord(view.state);
const readSelectedLevel: SongSelectReader = ({ view }) => getSelectedLevel(view.state);
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
const readControlsOpen: SongSelectReader = ({ view }) => isControlsPanelOpen(view.state);
const readSettingsHovered: SongSelectReader = ({ view }) =>
  isButtonHovered(view.state.hover, 'settings');
const readSettingsPressed: SongSelectReader = ({ view }) =>
  isButtonPressed(view.state.hover, 'settings');
const readTopRanks: SongSelectReader = ({ view }) => view.state.topRanks;
const readRankingEnabled: SongSelectReader = ({ view }) =>
  isSongSelectButtonEnabled(view.state, 'ranking');
const readRankingHovered: SongSelectReader = ({ view }) =>
  isButtonHovered(view.state.hover, 'ranking');
const readRankingPressed: SongSelectReader = ({ view }) =>
  isButtonPressed(view.state.hover, 'ranking');
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
  levelSlider: [
    ({ view }) => view.state.levelSlider.range.min,
    ({ view }) => view.state.levelSlider.range.max,
    ({ view }) => getLevelSliderFocus(view.state),
  ],
  // 칸마다 곡, 모양(고름, hover), 기록 노드를 읽는다. 어느 칸을 칠할지는 getChangedRowSlots 가 정한다.
  rows: [
    readSongs,
    readStartIndex,
    readSelectedSlot,
    readHoveredSlot,
    readCurrent,
    readLaneCount,
    readLevelRange,
    readRecords,
    readTopRanks,
  ],
  selectedHalo: [readSelectedSlot],
  notice: [readNotice],
  pageIndicator: [readPageText],
  loadingMore: [readIsLoadingMore, readLoadingMoreSlot],
  jacket: [readCurrentSong],
  // 고른 채보에 기록이 없어도 받는 중, 없음, 실패는 다르게 그리므로 기록 상태 종류도 읽는다.
  songInfo: [
    readCurrentSong,
    readLaneCount,
    readSelectedRecord,
    readRecordsKind,
    readSelectedLevel,
  ],
  difficultyTabs: [readCurrent, readLaneCount, readHoveredDifficulty],
  actions: [readRandomAppearance, readPlayAppearance],
  jacketLoads: [readSongs, readStartIndex],
  controls: [readControlsOpen],
  settingsButton: [readSettingsHovered, readSettingsPressed],
  backButton: [
    ({ view }) => isButtonHovered(view.state.hover, 'back'),
    ({ view }) => isButtonPressed(view.state.hover, 'back'),
  ],
  rankingButton: [readRankingEnabled, readRankingHovered, readRankingPressed],
  levelResetButton: [
    ({ view }) => isSongSelectButtonEnabled(view.state, 'levelReset'),
    ({ view }) => isButtonHovered(view.state.hover, 'levelReset'),
    ({ view }) => isButtonPressed(view.state.hover, 'levelReset'),
  ],
  retryButton: [
    ({ view }) => isButtonHovered(view.state.hover, 'retry'),
    ({ view }) => isButtonPressed(view.state.hover, 'retry'),
  ],
  recordsRetryButton: [
    ({ view }) => isButtonHovered(view.state.hover, 'recordsRetry'),
    ({ view }) => isButtonPressed(view.state.hover, 'recordsRetry'),
  ],
  controlsEntry: [readEntryHovered],
  accountButton: [({ view }) => getAccountPanelPointerKey(view.state.hover)],
  controlsClose: [readCloseHovered, readClosePressed],
  controlsHelpCard: [({ view }) => isControlsHelpShown(view.state)],
  controlsHelpButton: [({ view }) => getControlsHelpButtonView(view.state).appearance],
  signInFailure: [({ view }) => view.state.signInFailure],
  signInFailureButtons: [
    ({ view }) => isButtonHovered(view.state.hover, 'signInFailureClose'),
    ({ view }) => isButtonPressed(view.state.hover, 'signInFailureClose'),
  ],
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
  const after = getSongRows(next.state, rowsPerPage);
  if (previous === null) {
    return after.map((_, slot) => slot);
  }
  const before = getSongRows(previous.state, rowsPerPage);
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
