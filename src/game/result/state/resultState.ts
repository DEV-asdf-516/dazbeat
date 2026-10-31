import type { NamedAchievementDefinition } from '../../../data/achievements.js';
import { findChart, getAvailableDifficulties, stepChart } from '../../../data/songs.js';
import type { ChartRef } from '../../../data/songs.js';
import type { Difficulty } from '../../../rhythm/types.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { cycleItem } from '../../../range.js';
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
import { getDifficultyAppearance } from '../../ui/state/difficultyAppearance.js';
import type { PlayMode, SceneRequest, SongSelectRestore } from '../../app/sceneRoutes.js';
import type { TabAppearance } from '../../ui/state/tabAppearance.js';

export type ResultMenuItem = 'retry' | 'songSelect';

export type ResultButton = ResultMenuItem | ControlsButton;

export type ResultHover =
  | { readonly kind: 'difficulty'; readonly difficulty: Difficulty }
  | { readonly kind: 'toastClose'; readonly toastId: number }
  | ButtonHover<ResultButton>;

export interface ShownToast {
  readonly id: number;
  readonly achievement: NamedAchievementDefinition;
  readonly slot: number;
  readonly phase: 'shown' | 'leaving';
}

export interface ToastQueue {
  readonly shown: readonly ShownToast[];
  readonly waiting: readonly NamedAchievementDefinition[];
  readonly nextId: number;
}

export interface ResultState {
  readonly retryChart: ChartRef;
  readonly hover: ResultHover | null;
  readonly focus: ResultMenuItem;
  readonly toasts: ToastQueue;
  readonly isControlsOpen: boolean;
}

export interface ResultExit {
  readonly mode: PlayMode;
  readonly restore: SongSelectRestore | undefined;
}

const MENU_ITEMS: readonly ResultMenuItem[] = ['retry', 'songSelect'];
const MAX_VISIBLE_TOASTS = 3;

export function createResultState(retryChart: ChartRef): ResultState {
  return {
    retryChart,
    hover: null,
    focus: 'retry',
    isControlsOpen: false,
    toasts: {
      shown: [],
      waiting: [],
      nextId: 0,
    },
  };
}

export function selectRetryDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  const { retryChart } = state;
  if (difficulty === retryChart.difficulty) {
    return state;
  }
  // 채보가 없는 난이도 탭은 비활성이라 눌러도 바뀌지 않는다.
  const chart = findChart(retryChart.song, retryChart.laneCount, difficulty);
  return chart === undefined
    ? state
    : {
        ...state,
        retryChart: chart,
      };
}

export function stepRetryChart(state: ResultState, delta: 1 | -1): ResultState {
  const retryChart = stepChart(state.retryChart, delta);
  return retryChart === state.retryChart
    ? state
    : {
        ...state,
        retryChart,
      };
}

export function hoverDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  return getHoveredDifficulty(state) === difficulty
    ? state
    : {
        ...state,
        hover: {
          kind: 'difficulty',
          difficulty,
        },
      };
}

export function unhoverDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  return getHoveredDifficulty(state) === difficulty
    ? {
        ...state,
        hover: null,
      }
    : state;
}

export function hoverToastClose(state: ResultState, toastId: number): ResultState {
  return getHoveredToastId(state) === toastId
    ? state
    : {
        ...state,
        hover: {
          kind: 'toastClose',
          toastId,
        },
      };
}

export function unhoverToastClose(state: ResultState, toastId: number): ResultState {
  return getHoveredToastId(state) === toastId
    ? {
        ...state,
        hover: null,
      }
    : state;
}

export function getHoveredToastId(state: ResultState): number | null {
  return state.hover?.kind === 'toastClose' ? state.hover.toastId : null;
}

export function getRetryTabAppearance(state: ResultState, difficulty: Difficulty): TabAppearance {
  const { retryChart } = state;
  return getDifficultyAppearance(difficulty, {
    selected: retryChart.difficulty,
    hovered: getHoveredDifficulty(state),
    available: getAvailableDifficulties(retryChart.song, retryChart.laneCount),
  });
}

export function moveResultFocus(state: ResultState, delta: 1 | -1): ResultState {
  const focus = cycleItem(MENU_ITEMS, state.focus, delta);
  return focus === state.focus
    ? state
    : {
        ...state,
        focus,
      };
}

export function isResultFocused(state: ResultState, item: ResultMenuItem): boolean {
  return state.focus === item;
}

function isResultButtonEnabled(state: ResultState, button: ResultButton): boolean {
  switch (button) {
    case 'retry':
    case 'songSelect':
      return true;
    default:
      return isControlsButtonEnabled(button, state.isControlsOpen);
  }
}

function withHover(state: ResultState, hover: ResultState['hover']): ResultState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverResultButton(state: ResultState, button: ResultButton): ResultState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverResultButton(state: ResultState, button: ResultButton): ResultState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressResultButton(state: ResultState, button: ResultButton): ResultState {
  return withHover(state, pressButton(state.hover, button, isResultButtonEnabled(state, button)));
}

export function releaseResultButton(state: ResultState, button: ResultButton): ResultState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getMenuButtonView(state: ResultState, item: ResultMenuItem): ButtonView {
  return getButtonView(state.hover, item, true, isResultFocused(state, item));
}

export function getResultControlsCloseView(state: ResultState): ButtonView {
  return getControlsCloseView(state.hover, state.isControlsOpen);
}

export function isResultControlsEntryHovered(state: ResultState): boolean {
  return isControlsEntryHovered(state.hover);
}

export function getResultExitRequest(
  state: ResultState,
  item: ResultMenuItem,
  exit: ResultExit,
): SceneRequest {
  const { retryChart } = state;
  const { mode, restore } = exit;
  const restoreData =
    restore === undefined
      ? {}
      : {
          restore: {
            ...restore,
            difficulty: retryChart.difficulty,
          },
        };
  switch (item) {
    case 'retry':
      return {
        key: 'gameplay',
        data: {
          ...retryChart,
          mode,
          ...restoreData,
        },
      };
    case 'songSelect':
      return {
        key: 'songSelect',
        data: {
          mode,
          ...restoreData,
        },
      };
  }
}

export function queueAchievements(
  state: ResultState,
  achievements: readonly NamedAchievementDefinition[],
): ResultState {
  return {
    ...state,
    toasts: admitWaiting({
      ...state.toasts,
      waiting: [...state.toasts.waiting, ...achievements],
    }),
  };
}

// 이미 나가는 중이거나 없는 알림이면 같은 참조라, 늦은 시간 만료나 두 번 닫기로 두 번 나가지 않는다.
export function dismissToast(state: ResultState, toastId: number): ResultState {
  const { shown } = state.toasts;
  if (!shown.some((toast) => toast.id === toastId && toast.phase === 'shown')) {
    return state;
  }
  return {
    ...state,
    toasts: {
      ...state.toasts,
      shown: shown.map((toast) =>
        toast.id === toastId
          ? {
              ...toast,
              phase: 'leaving',
            }
          : toast,
      ),
    },
  };
}

export function removeToast(state: ResultState, toastId: number): ResultState {
  return {
    ...state,
    // 사라진 알림은 POINTER_OUT 을 보내지 못하므로 그 닫기 hover 를 여기서 푼다.
    hover: getHoveredToastId(state) === toastId ? null : state.hover,
    toasts: admitWaiting({
      ...state.toasts,
      shown: state.toasts.shown.filter((toast) => toast.id !== toastId),
    }),
  };
}

/** 새 알림이 맨 아래 칸이고 먼저 온 알림일수록 위 칸이다. 들인 것이 없으면 다음 등장 전까지 칸을 지킨다. */
function admitWaiting(queue: ToastQueue): ToastQueue {
  const shown = [...queue.shown];
  const waiting = [...queue.waiting];
  let { nextId } = queue;
  while (shown.length < MAX_VISIBLE_TOASTS) {
    const achievement = waiting.shift();
    if (achievement === undefined) {
      break;
    }
    shown.push({
      id: nextId,
      achievement,
      slot: 0,
      phase: 'shown',
    });
    nextId += 1;
  }
  if (nextId === queue.nextId) {
    return queue;
  }
  return {
    shown: shown.map((toast, index) => ({
      ...toast,
      slot: shown.length - 1 - index,
    })),
    waiting,
    nextId,
  };
}

export interface ToastChanges {
  readonly entered: readonly ShownToast[];
  readonly moved: readonly ShownToast[];
  readonly leaving: readonly number[];
}

export function getToastChanges(previous: ResultState | null, next: ResultState): ToastChanges {
  const before = previous?.toasts.shown ?? [];
  const after = next.toasts.shown;
  const findBefore = (id: number): ShownToast | undefined =>
    before.find((toast) => toast.id === id);
  return {
    entered: after.filter((toast) => findBefore(toast.id) === undefined),
    moved: after.filter((toast) => {
      const old = findBefore(toast.id);
      return old !== undefined && old.slot !== toast.slot;
    }),
    leaving: after
      .filter((toast) => toast.phase === 'leaving' && findBefore(toast.id)?.phase === 'shown')
      .map(({ id }) => id),
  };
}

export type ResultRegion =
  | 'tabs'
  | 'retryButton'
  | 'songSelectButton'
  | 'toasts'
  | 'toastClose'
  | 'controls'
  | 'controlsEntry'
  | 'controlsClose'
  | 'menuFocusMotion';

type ResultReader = StateReader<ResultState>;

const readRetryChart: ResultReader = (state) => state.retryChart;
const readHoveredDifficulty: ResultReader = (state) => getHoveredDifficulty(state);
const readHoveredToastId: ResultReader = (state) => getHoveredToastId(state);
const readFocus: ResultReader = (state) => state.focus;
const readShownToasts: ResultReader = (state) => state.toasts.shown;
const readControlsOpen: ResultReader = (state) => state.isControlsOpen;
const readRetryHovered: ResultReader = (state) => isButtonHovered(state.hover, 'retry');
const readRetryPressed: ResultReader = (state) => isButtonPressed(state.hover, 'retry');
const readSongSelectHovered: ResultReader = (state) => isButtonHovered(state.hover, 'songSelect');
const readSongSelectPressed: ResultReader = (state) => isButtonPressed(state.hover, 'songSelect');
const readEntryHovered: ResultReader = (state) => isButtonHovered(state.hover, 'controlsEntry');
const readCloseHovered: ResultReader = (state) => isButtonHovered(state.hover, 'controlsClose');
const readClosePressed: ResultReader = (state) => isButtonPressed(state.hover, 'controlsClose');

const REGION_SOURCES: Readonly<
  Record<Exclude<ResultRegion, 'menuFocusMotion'>, readonly ResultReader[]>
> = {
  tabs: [readRetryChart, readHoveredDifficulty],
  retryButton: [readRetryHovered, readRetryPressed, readFocus],
  songSelectButton: [readSongSelectHovered, readSongSelectPressed, readFocus],
  toasts: [readShownToasts],
  toastClose: [readHoveredToastId, readShownToasts],
  controls: [readControlsOpen],
  controlsEntry: [readEntryHovered],
  controlsClose: [readCloseHovered, readClosePressed, readControlsOpen],
};

export function getChangedRegions(
  previous: ResultState | null,
  next: ResultState,
): readonly ResultRegion[] {
  const regions = filterChangedRegions(REGION_SOURCES, previous, next);
  const hasFocusMotion = previous === null || previous.focus !== next.focus;
  return hasFocusMotion ? [...regions, 'menuFocusMotion'] : regions;
}

function getHoveredDifficulty(state: ResultState): Difficulty | null {
  return state.hover?.kind === 'difficulty' ? state.hover.difficulty : null;
}
