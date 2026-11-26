import type { PlaybackChange, PlaybackStatus } from '../../../audio/LeadInPlayback.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import type { GameplaySession } from '../../../rhythm/GameplaySession.js';
import type { GameplayState } from '../../../rhythm/types.js';
import type { MvMode } from '../../../storage/settings.js';
import {
  BUTTON_REGION_SOURCES,
  INITIAL_GAMEPLAY_BUTTONS,
  STATUS_REGION_SOURCES,
  getPlayingStatus,
  isCountdownPopped,
  isMvVisibleIn,
  withQuitConfirmOpen,
} from './gameplayStatus.js';
import type {
  GameplayButtonRegion,
  GameplayButtons,
  GameplayLoadError,
  GameplayStatus,
  GameplayStatusRegion,
} from './gameplayStatus.js';
import type { QuitConfirmReason } from './quitConfirm.js';
import { HUD_REGION_SOURCES, isComboPopped, isGaugeGlinted } from './gameplayHud.js';
import type { GameplayFrame, HudRegion } from './gameplayHud.js';

interface GameplayScreenFields {
  readonly status: GameplayStatus;
  readonly buttons: GameplayButtons;
  // 확인 창이 닫혀 있는 동안은 읽지 않는다.
  readonly quitConfirmReason: QuitConfirmReason;
  readonly mvMode: MvMode;
  readonly isMvVisible: boolean;
  readonly loadError: GameplayLoadError | null;
  readonly isIntroVisible: boolean;
}

type LoadingScreenState = GameplayScreenFields & { readonly kind: 'loading' };
type StartingScreenState = GameplayScreenFields & { readonly kind: 'starting' };
// 플레이를 시작한 뒤 첫 tick 이 프레임 값을 만들기 전에는 그릴 프레임이 아직 없어 프레임이 있는 단계와 나눈다.
// 프레임 값은 중첩 객체 없이 필드로 펼쳐 둔다.
type ReadyScreenState = GameplayScreenFields & { readonly kind: 'ready' };
type PlayingScreenState = GameplayScreenFields & GameplayFrame & { readonly kind: 'playing' };
type ReadyEndingScreenState = GameplayScreenFields & { readonly kind: 'readyEnding' };
type EndingScreenState = GameplayScreenFields & GameplayFrame & { readonly kind: 'ending' };
export type PlayScreenState = ReadyScreenState | PlayingScreenState;
// tick 의 실패 결과는 오류 단계로 따로 간다.
type TickPlaybackChange = Exclude<PlaybackChange, { readonly kind: 'failed' }>;
export type ErrorScreenState = GameplayScreenFields & { readonly kind: 'error' };
type LeavingScreenState = GameplayScreenFields & { readonly kind: 'leaving' };
type ClosedScreenState = GameplayScreenFields & { readonly kind: 'closed' };

export type GameplayScreenState =
  | LoadingScreenState
  | StartingScreenState
  | ReadyScreenState
  | PlayingScreenState
  | ReadyEndingScreenState
  | EndingScreenState
  | ErrorScreenState
  | LeavingScreenState
  | ClosedScreenState;

// 그릴 프레임 값이 있는 단계에서만 프레임을 돌려준다.
export function getFrame(state: GameplayScreenState): GameplayFrame | null {
  return state.kind === 'playing' || state.kind === 'ending' ? state : null;
}

// 플레이어가 준비되기 전에는 보일 영상이 없으므로 가린 채 시작한다.
export function getInitialGameplayScreen(mvMode: MvMode): LoadingScreenState {
  return {
    kind: 'loading',
    status: { kind: 'loading' },
    buttons: INITIAL_GAMEPLAY_BUTTONS,
    quitConfirmReason: 'userPaused',
    mvMode,
    isMvVisible: false,
    loadError: null,
    isIntroVisible: true,
  };
}

export function withButtons<State extends GameplayScreenState>(
  state: State,
  buttons: GameplayButtons,
): State {
  return buttons === state.buttons
    ? state
    : {
        ...state,
        buttons,
      };
}

export function withStarting(state: LoadingScreenState): StartingScreenState {
  return {
    ...state,
    kind: 'starting',
    status: { kind: 'loading' },
    isMvVisible: false,
  };
}

export function withReady(state: StartingScreenState, status: PlaybackStatus): ReadyScreenState {
  return {
    ...state,
    kind: 'ready',
    status: getPlayingStatus(status),
  };
}

// tick 하나가 state 객체를 하나만 만들도록 그 tick 의 재생 결과, 프레임 값, 끝 단계를 한 번에 놓는다.
// 인트로는 곡이 시작되면 한 번 걷히고 다시 보이지 않는다.
export function withFrame(
  state: PlayScreenState,
  change: TickPlaybackChange,
  kind: 'playing' | 'ending',
  session: GameplaySession,
  songTimeMs: number,
  gameState: GameplayState,
  progress: number,
  activation: GameplayFrame['activation'],
  enteredNoteCount: number,
  isBeforeGameStart: boolean,
): PlayingScreenState | EndingScreenState {
  return {
    ...state,
    kind,
    status: change.kind === 'none' ? state.status : getPlayingStatus(change.status),
    isMvVisible: change.kind === 'none' ? state.isMvVisible : isMvVisibleIn(change.status),
    buttons:
      change.kind === 'resyncFailed' ? withQuitConfirmOpen(state.buttons, true) : state.buttons,
    quitConfirmReason: change.kind === 'resyncFailed' ? 'resyncFailed' : state.quitConfirmReason,
    session,
    songTimeMs,
    state: gameState,
    progress,
    activation,
    enteredNoteCount,
    isIntroVisible: state.isIntroVisible && isBeforeGameStart,
  };
}

// 실패로 끝나면 새 프레임 값을 그리지 않는다. 확인 창이 열려 있어도 keyup 판정으로 실패할 수 있으므로 확인 창을 닫는다.
export function withFailure(
  state: PlayScreenState,
  change: TickPlaybackChange,
): ReadyEndingScreenState | EndingScreenState {
  const status = change.kind === 'none' ? state.status : getPlayingStatus(change.status);
  const isMvVisible = change.kind === 'none' ? state.isMvVisible : isMvVisibleIn(change.status);
  const buttons = withQuitConfirmOpen(state.buttons, false);
  const quitConfirmReason =
    change.kind === 'resyncFailed' ? 'resyncFailed' : state.quitConfirmReason;
  // eslint-disable-next-line dazbeat/two-way-switch -- 끝낼 수 있는 단계가 늘면 함께 는다.
  switch (state.kind) {
    case 'ready':
      return {
        ...state,
        kind: 'readyEnding',
        status,
        isMvVisible,
        buttons,
        quitConfirmReason,
      };
    case 'playing':
      return {
        ...state,
        kind: 'ending',
        status,
        isMvVisible,
        buttons,
        quitConfirmReason,
      };
  }
}

export function withLeaving(state: GameplayScreenState): LeavingScreenState {
  return {
    ...state,
    kind: 'leaving',
  };
}

export function withClosed(state: GameplayScreenState): ClosedScreenState {
  return {
    ...state,
    kind: 'closed',
  };
}

function withPlayingStatus<State extends GameplayScreenState>(
  state: State,
  status: PlaybackStatus,
): State {
  return {
    ...state,
    status: getPlayingStatus(status),
  };
}

export function withPlaybackStatus<State extends GameplayScreenState>(
  state: State,
  status: PlaybackStatus,
): State {
  return {
    ...withPlayingStatus(state, status),
    isMvVisible: isMvVisibleIn(status),
  };
}

export function openQuitConfirm<State extends GameplayScreenState>(
  state: State,
  reason: QuitConfirmReason,
): State {
  return {
    ...state,
    buttons: withQuitConfirmOpen(state.buttons, true),
    quitConfirmReason: reason,
  };
}

export function closeQuitConfirm<State extends GameplayScreenState>(state: State): State {
  return withButtons(state, withQuitConfirmOpen(state.buttons, false));
}

export function withMvMode<State extends GameplayScreenState>(state: State, mvMode: MvMode): State {
  return {
    ...state,
    mvMode,
  };
}

// 오류 뒤에는 안내와 인트로를 더 보이지 않으므로 상태 안내를 지우고 인트로를 걷고 확인 창을 닫는다.
export function withLoadError(
  state: GameplayScreenState,
  loadError: GameplayLoadError,
): ErrorScreenState {
  return {
    ...state,
    kind: 'error',
    buttons: withQuitConfirmOpen(state.buttons, false),
    status: { kind: 'none' },
    loadError,
    isIntroVisible: false,
  };
}

export type GameplayScreenRegion =
  | GameplayStatusRegion
  | GameplayButtonRegion
  | HudRegion
  | 'mvMode'
  | 'mvVisible'
  | 'loadError'
  | 'backButtonFocus'
  | 'frame'
  | 'activationGlint'
  | 'intro';

type ScreenReader = StateReader<GameplayScreenState>;

const readQuitConfirmOpen: ScreenReader = (state) => state.buttons.isQuitConfirmOpen;

function readStatus(readers: readonly StateReader<GameplayStatus>[]): readonly ScreenReader[] {
  return readers.map((read) => (state) => read(state.status));
}

function readFrame(readers: readonly StateReader<GameplayFrame>[]): readonly ScreenReader[] {
  return readers.map((read) => (state) => {
    const frame = getFrame(state);
    return frame === null ? null : read(frame);
  });
}

function readButtons(readers: readonly StateReader<GameplayButtons>[]): readonly ScreenReader[] {
  return readers.map((read) => (state) => read(state.buttons));
}

// 확인 창이 열린 동안은 상태 안내와 카운트다운을 숨긴다. 오류일 때만 뒤로 버튼이 보인다.
// 확인 창은 문구와 두 버튼 모양을 한 영역이 함께 칠한다.
const REGION_SOURCES: Readonly<
  Record<
    Exclude<
      GameplayScreenRegion,
      | 'comboPop'
      | 'gaugeGlint'
      | 'countdownPop'
      | 'mvMode'
      | 'intro'
      | 'backButtonFocus'
      | 'activationGlint'
    >,
    readonly ScreenReader[]
  >
> = {
  notice: [...readStatus(STATUS_REGION_SOURCES.notice), readQuitConfirmOpen],
  countdown: [...readStatus(STATUS_REGION_SOURCES.countdown), readQuitConfirmOpen],
  backButton: [
    ...readButtons(BUTTON_REGION_SOURCES.backButton),
    (state) => state.loadError !== null,
  ],
  quitDialog: [
    readQuitConfirmOpen,
    (state) => state.quitConfirmReason,
    ...readButtons(BUTTON_REGION_SOURCES.quitDialog),
  ],
  mvVisible: [(state) => state.isMvVisible],
  loadError: [(state) => state.loadError],
  // 활동도는 tick 마다 새로 구하므로 새 프레임 값이 들어온 때만 고른다.
  frame: [(state) => getFrame(state)?.activation ?? null],
  combo: readFrame(HUD_REGION_SOURCES.combo),
  comboTier: readFrame(HUD_REGION_SOURCES.comboTier),
  score: readFrame(HUD_REGION_SOURCES.score),
  progress: readFrame(HUD_REGION_SOURCES.progress),
  gaugeFill: readFrame(HUD_REGION_SOURCES.gaugeFill),
  gaugeBand: readFrame(HUD_REGION_SOURCES.gaugeBand),
  perfectCount: readFrame(HUD_REGION_SOURCES.perfectCount),
  greatCount: readFrame(HUD_REGION_SOURCES.greatCount),
  goodCount: readFrame(HUD_REGION_SOURCES.goodCount),
  badCount: readFrame(HUD_REGION_SOURCES.badCount),
  missCount: readFrame(HUD_REGION_SOURCES.missCount),
  accuracy: readFrame(HUD_REGION_SOURCES.accuracy),
};

// MV 모드 표시는 바꿀 때만 잠깐 떠오르므로 처음 그릴 때는 고르지 않는다.
// 프레임이 없는 단계의 HUD 영역은 그리는 쪽이 건너뛴다. 인트로는 처음부터 보이므로 숨을 때만 고르고, 프레임과 HUD 를 그린 뒤에 둔다.
// 뒤로 버튼 포커스 반짝임은 오류가 새로 생길 때 한 번 재생하며, 첫 그림에 이미 오류가 있으면 그때도 포함한다.
// 최대 활성 반짝임은 새 프레임 값이 들어왔을 때만 고르고 첫 그림은 포함하지 않는다(첫 그림에는 프레임이 없다).
export function getChangedGameplayRegions(
  previous: GameplayScreenState | null,
  next: GameplayScreenState,
): readonly GameplayScreenRegion[] {
  const regions: GameplayScreenRegion[] = [...filterChangedRegions(REGION_SOURCES, previous, next)];
  if (isCountdownPopped(previous?.status ?? null, next.status)) {
    regions.push('countdownPop');
  }
  if ((previous?.loadError ?? null) === null && next.loadError !== null) {
    regions.push('backButtonFocus');
  }
  if (previous === null) {
    return regions;
  }
  if (previous.mvMode !== next.mvMode) {
    regions.push('mvMode');
  }
  const previousFrame = getFrame(previous);
  const nextFrame = getFrame(next);
  if (nextFrame !== null) {
    if (nextFrame.activation.hasReachedFull && previousFrame?.activation !== nextFrame.activation) {
      regions.push('activationGlint');
    }
    if (previousFrame !== null) {
      if (isComboPopped(previousFrame, nextFrame)) {
        regions.push('comboPop');
      }
      if (isGaugeGlinted(previousFrame, nextFrame)) {
        regions.push('gaugeGlint');
      }
    }
  }
  if (previous.isIntroVisible !== next.isIntroVisible) {
    regions.push('intro');
  }
  return regions;
}
