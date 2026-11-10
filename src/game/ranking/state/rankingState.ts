import { RankingRequestError } from '../../../data/ranking.js';
import type { Leaderboard } from '../../../data/ranking.js';
import { findChart, getAvailableCharts, stepChart } from '../../../data/songs.js';
import type { ChartRef } from '../../../data/songs.js';
import type { Difficulty } from '../../../rhythm/types.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { clamp } from '../../../range.js';
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
  isControlsEntryHovered,
  withControlsOpen,
} from '../../app/controlsGuide.js';
import { getAccountPanelPointerKey } from '../../ui/state/accountIdentity.js';
import type { AccountPanelButton } from '../../ui/state/accountIdentity.js';
import type { ControlsButton } from '../../app/controlsGuide.js';
import { getDifficultyAppearance } from '../../ui/state/difficultyAppearance.js';
import type { MenuAction } from '../../ui/state/menuAction.js';
import type { TabAppearance } from '../../ui/state/tabAppearance.js';
import { getPlainRankValue, getRankValue, getTopRankTier } from '../../ui/state/topRank.js';
import type { TopRankTier } from '../../ui/state/topRank.js';

/** 곡 선택 목록과 같은 줄 수로, 씬은 곡 선택과 같은 줄 배치로 그린다. */
export const RANKING_VISIBLE_ROWS = 9;

export type BoardLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly board: Leaderboard }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

export type RankingDialog = 'failed' | 'unavailable' | 'revised';

export type RankingButton =
  'back' | 'dialogCancel' | 'dialogAccept' | ControlsButton | AccountPanelButton;

export type RankingHover =
  { readonly kind: 'difficulty'; readonly difficulty: Difficulty } | ButtonHover<RankingButton>;

interface RankingFields {
  readonly charts: readonly ChartRef[];
  readonly chart: ChartRef;
  readonly isSignedIn: boolean;
  readonly load: BoardLoad;
  readonly topRow: number;
  /** 채보 수정 안내는 한 화면 방문 동안 채보 버전마다 한 번만 띄운다. */
  readonly noticedRevisions: ReadonlyMap<string, string>;
  readonly hover: RankingHover | null;
}

export type RankingState = RankingFields &
  (
    | { readonly dialog: RankingDialog | 'none'; readonly isControlsOpen: false }
    | { readonly dialog: 'none'; readonly isControlsOpen: true }
  );

export type RankingAction =
  | { readonly kind: 'scroll'; readonly rows: number }
  | { readonly kind: 'difficulty'; readonly step: 1 | -1 }
  | { readonly kind: 'back' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'closeDialog' };

export interface RankingRow {
  readonly rank: number;
  readonly nickname: string;
  readonly featuredAchievement: string | null;
  readonly score: number;
  readonly accuracy: number;
  readonly isMe: boolean;
  readonly tier: TopRankTier | 'none';
  readonly hasTopBadge: boolean;
  readonly outsideTopRank: string | null;
}

export type MyRankView =
  | { readonly kind: 'guest' }
  | { readonly kind: 'none' }
  | {
      readonly kind: 'ranked';
      readonly rank: string;
      readonly score: number;
      readonly accuracy: number;
    }
  | { readonly kind: 'hidden' };

export type RankingNotice = 'none' | 'loading' | 'empty';

const LOADING: BoardLoad = { kind: 'loading' };
const NO_ACTION = { kind: 'none' } as const;

export function createRankingState(
  chart: ChartRef,
  isSignedIn: boolean,
  noticedRevisions: ReadonlyMap<string, string>,
): RankingState {
  return {
    charts: getAvailableCharts(chart.song, chart.laneCount),
    chart,
    isSignedIn,
    load: LOADING,
    topRow: 0,
    dialog: 'none',
    noticedRevisions,
    hover: null,
    isControlsOpen: false,
  };
}

function withChart(state: RankingState, chart: ChartRef): RankingState {
  if (chart.chartId === state.chart.chartId) {
    return state;
  }
  return {
    ...state,
    chart,
    load: LOADING,
    topRow: 0,
  };
}

export function selectRankingDifficulty(state: RankingState, difficulty: Difficulty): RankingState {
  const chart = findChart(state.chart.song, state.chart.laneCount, difficulty);
  return chart === undefined ? state : withChart(state, chart);
}

export function stepRankingDifficulty(state: RankingState, step: 1 | -1): RankingState {
  return withChart(state, stepChart(state.chart, step));
}

function getBoardEntries({ top, me }: Leaderboard): Leaderboard['top'] {
  return me === null || top.some((entry) => entry.isMe)
    ? top
    : [
        ...top,
        {
          ...me,
          isMe: true,
        },
      ];
}

/** 내 줄이 첫 화면에 있으면 그대로 두고, 아래에 있으면 가운데로 올려 바로 보이게 한다. */
function getMyRowTopRow(board: Leaderboard): number | null {
  const entries = getBoardEntries(board);
  const myIndex = entries.findIndex((entry) => entry.isMe);
  if (myIndex < RANKING_VISIBLE_ROWS) {
    return null;
  }
  return clamp(
    myIndex - Math.floor(RANKING_VISIBLE_ROWS / 2),
    0,
    entries.length - RANKING_VISIBLE_ROWS,
  );
}

function openDialog(state: RankingState, dialog: RankingDialog): RankingState {
  return {
    ...state,
    dialog,
    isControlsOpen: false,
    hover: withControlsOpen(state, false).hover,
  };
}

export function applyLeaderboard(state: RankingState, board: Leaderboard): RankingState {
  const { chartId } = state.chart;
  const isRevisionNoticed =
    board.hasPreviousRevisionRecord && state.noticedRevisions.get(chartId) !== board.chartRevision;
  const loaded: RankingState = {
    ...state,
    load: {
      kind: 'loaded',
      board,
    },
    topRow: getMyRowTopRow(board) ?? state.topRow,
  };
  return isRevisionNoticed
    ? openDialog(
        {
          ...loaded,
          noticedRevisions: new Map([...state.noticedRevisions, [chartId, board.chartRevision]]),
        },
        'revised',
      )
    : loaded;
}

export function failLeaderboard(state: RankingState, error: unknown): RankingState {
  return error instanceof RankingRequestError && error.kind === 'notFound'
    ? openDialog(
        {
          ...state,
          load: { kind: 'unavailable' },
        },
        'unavailable',
      )
    : openDialog(
        {
          ...state,
          load: { kind: 'failed' },
        },
        'failed',
      );
}

/** 대화상자와 조작 안내는 함께 열리지 않으므로 대화상자가 열린 동안은 열지 않는다. */
export function openRankingControls(state: RankingState): RankingState {
  return state.dialog === 'none' ? withControlsOpen(state, true) : state;
}

// Phaser 는 숨긴 버튼에 POINTER_OUT 을 보내지 않으므로 대화상자를 닫을 때 그 버튼의 hover 를 푼다.
export function closeRankingDialog(state: RankingState): RankingState {
  return {
    ...state,
    dialog: 'none',
    hover: unhoverButton(unhoverButton(state.hover, 'dialogCancel'), 'dialogAccept'),
  };
}

export function retryLeaderboard(state: RankingState): RankingState {
  return {
    ...closeRankingDialog(state),
    load: LOADING,
  };
}

function getTopEntries(state: RankingState): Leaderboard['top'] {
  return state.load.kind === 'loaded' ? getBoardEntries(state.load.board) : [];
}

export function scrollRanking(state: RankingState, rows: number): RankingState {
  if (state.dialog !== 'none') {
    return state;
  }
  const maxTopRow = Math.max(0, getTopEntries(state).length - RANKING_VISIBLE_ROWS);
  const topRow = clamp(state.topRow + rows, 0, maxTopRow);
  if (topRow === state.topRow) {
    return state;
  }
  return {
    ...state,
    topRow,
  };
}

/** 실패와 볼 수 없음은 BACK·RETRY 로만 끝나고, 채보 수정 안내만 닫는다. */
function getDialogAction(dialog: RankingDialog, choice: 'accept' | 'cancel'): RankingAction {
  switch (dialog) {
    case 'failed':
      return { kind: choice === 'accept' ? 'retry' : 'back' };
    case 'unavailable':
      return { kind: 'back' };
    case 'revised':
      return { kind: 'closeDialog' };
  }
}

/** 대화상자가 열린 동안은 수락과 뒤로만 받고 나머지 키는 막는다. */
export function readRankingKey(
  state: RankingState,
  action: MenuAction | null,
): RankingAction | typeof NO_ACTION {
  if (state.dialog !== 'none') {
    switch (action) {
      case 'confirm':
        return getDialogAction(state.dialog, 'accept');
      case 'back':
        return getDialogAction(state.dialog, 'cancel');
      default:
        return NO_ACTION;
    }
  }
  switch (action) {
    case 'up':
      return {
        kind: 'scroll',
        rows: -1,
      };
    case 'down':
      return {
        kind: 'scroll',
        rows: 1,
      };
    case 'left':
    case 'previousTab':
      return {
        kind: 'difficulty',
        step: -1,
      };
    case 'right':
    case 'nextTab':
      return {
        kind: 'difficulty',
        step: 1,
      };
    case 'back':
      return { kind: 'back' };
    case 'confirm':
    case null:
      return NO_ACTION;
  }
}

export function readRankingDialogButton(
  state: RankingState,
  button: 'dialogCancel' | 'dialogAccept',
): RankingAction | typeof NO_ACTION {
  return state.dialog === 'none'
    ? NO_ACTION
    : getDialogAction(state.dialog, button === 'dialogAccept' ? 'accept' : 'cancel');
}

function withHover(state: RankingState, hover: RankingHover | null): RankingState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverRankingButton(state: RankingState, button: RankingButton): RankingState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverRankingButton(state: RankingState, button: RankingButton): RankingState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressRankingButton(state: RankingState, button: RankingButton): RankingState {
  return withHover(state, pressButton(state.hover, button, true));
}

export function releaseRankingButton(state: RankingState, button: RankingButton): RankingState {
  return withHover(state, releaseButton(state.hover, button));
}

function getHoveredDifficulty(state: RankingState): Difficulty | null {
  return state.hover?.kind === 'difficulty' ? state.hover.difficulty : null;
}

export function hoverRankingDifficulty(state: RankingState, difficulty: Difficulty): RankingState {
  return getHoveredDifficulty(state) === difficulty
    ? state
    : withHover(state, {
        kind: 'difficulty',
        difficulty,
      });
}

export function unhoverRankingDifficulty(
  state: RankingState,
  difficulty: Difficulty,
): RankingState {
  return getHoveredDifficulty(state) === difficulty ? withHover(state, null) : state;
}

export function getRankingDifficultyAppearance(
  state: RankingState,
  difficulty: Difficulty,
): TabAppearance {
  return getDifficultyAppearance(difficulty, {
    selected: state.chart.difficulty,
    hovered: getHoveredDifficulty(state),
    available: state.charts.map((chart) => chart.difficulty),
  });
}

function isMedalTier(tier: TopRankTier | 'none'): boolean {
  return tier !== 'none' && tier !== 'plain';
}

export function getRankingRows(state: RankingState): readonly RankingRow[] {
  return getTopEntries(state)
    .slice(state.topRow, state.topRow + RANKING_VISIBLE_ROWS)
    .map((entry) => ({
      ...entry,
      tier: getTopRankTier(entry.rank),
      hasTopBadge: entry.isMe || isMedalTier(getTopRankTier(entry.rank)),
      outsideTopRank: getPlainRankValue(entry.rank),
    }));
}

// 곡 선택의 쪽 번호처럼 목록 아래에 두되, 한 줄씩 넘기므로 보이는 마지막 순위까지 센다.
export function getRankingRowIndicator(
  state: RankingState,
): { readonly kind: 'hidden' } | { readonly kind: 'text'; readonly text: string } {
  const totalCount = getTopEntries(state).length;
  if (totalCount <= RANKING_VISIBLE_ROWS) {
    return { kind: 'hidden' };
  }
  return {
    kind: 'text',
    text: `${state.topRow + RANKING_VISIBLE_ROWS} / ${totalCount}`,
  };
}

export function getMyRankView(state: RankingState): MyRankView {
  if (state.load.kind !== 'loaded') {
    return { kind: 'hidden' };
  }
  if (!state.isSignedIn) {
    return { kind: 'guest' };
  }
  const { me } = state.load.board;
  return me === null
    ? { kind: 'none' }
    : {
        kind: 'ranked',
        ...me,
        rank: getRankValue(me.rank),
      };
}

export function getRankingTotal(
  state: RankingState,
): { readonly kind: 'hidden' } | { readonly kind: 'count'; readonly count: number } {
  return state.load.kind === 'loaded'
    ? {
        kind: 'count',
        count: state.load.board.totalPlayers,
      }
    : { kind: 'hidden' };
}

export function getRankingNotice(state: RankingState): RankingNotice {
  switch (state.load.kind) {
    case 'loading':
      return 'loading';
    case 'loaded':
      return state.load.board.top.length === 0 ? 'empty' : 'none';
    case 'unavailable':
    case 'failed':
      return 'none';
  }
}

export function getRankingBackView(state: RankingState): ButtonView {
  return getButtonView(state.hover, 'back', true, false);
}

export function getRankingDialogButtonViews(state: RankingState): {
  readonly cancel: ButtonView;
  readonly accept: ButtonView;
} {
  return {
    cancel: getButtonView(state.hover, 'dialogCancel', true, false),
    accept: getButtonView(state.hover, 'dialogAccept', true, false),
  };
}

export function getRankingControlsCloseView(state: RankingState): ButtonView {
  return getControlsCloseView(state.hover);
}

export function isRankingControlsEntryHovered(state: RankingState): boolean {
  return isControlsEntryHovered(state.hover);
}

export type RankingRegion =
  | 'songInfo'
  | 'rows'
  | 'total'
  | 'myRank'
  | 'notice'
  | 'difficultyTabs'
  | 'dialog'
  | 'dialogButtons'
  | 'backButton'
  | 'controls'
  | 'controlsEntry'
  | 'accountButton'
  | 'controlsClose';

type RankingReader = StateReader<RankingState>;

const readSong: RankingReader = (state) => state.chart.song;
const readLoad: RankingReader = (state) => state.load;
const readTopRow: RankingReader = (state) => state.topRow;
const readChart: RankingReader = (state) => state.chart;
const readHoveredDifficulty: RankingReader = getHoveredDifficulty;
const readDialog: RankingReader = (state) => state.dialog;
const readControlsOpen: RankingReader = (state) => state.isControlsOpen;
const readHovered =
  (button: RankingButton): RankingReader =>
  (state) =>
    isButtonHovered(state.hover, button);
const readPressed =
  (button: RankingButton): RankingReader =>
  (state) =>
    isButtonPressed(state.hover, button);

const REGION_SOURCES: Readonly<Record<RankingRegion, readonly RankingReader[]>> = {
  songInfo: [readSong],
  rows: [readLoad, readTopRow],
  total: [readLoad],
  myRank: [readLoad],
  notice: [readLoad],
  difficultyTabs: [readChart, readHoveredDifficulty],
  dialog: [readDialog],
  dialogButtons: [
    readHovered('dialogCancel'),
    readPressed('dialogCancel'),
    readHovered('dialogAccept'),
    readPressed('dialogAccept'),
  ],
  backButton: [readHovered('back'), readPressed('back')],
  controls: [readControlsOpen],
  controlsEntry: [readHovered('controlsEntry')],
  accountButton: [(state) => getAccountPanelPointerKey(state.hover)],
  controlsClose: [readHovered('controlsClose'), readPressed('controlsClose')],
};

export function getChangedRegions(
  previous: RankingState | null,
  next: RankingState,
): readonly RankingRegion[] {
  return filterChangedRegions(REGION_SOURCES, previous, next);
}
