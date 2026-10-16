import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { LANES } from '../../rhythm/lanes.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/LocalSave.js';
import { getQuitConfirmAction } from './quitConfirm.js';

export type GameplayCommand = 'confirm' | 'back' | 'mvMode';

/** 한 키가 레인과 명령을 동시에 가질 수 있다. 어느 쪽을 쓸지는 게임 단계가 정한다. */
export interface GameplayKey {
  lane: Lane | null;
  command: GameplayCommand | null;
}

/** 키 동작 결정에 필요한 현재 단계. 확인창·player 상태는 플레이 중에만 의미가 있다. */
export type GameplayKeyContext =
  | { readonly phase: 'loading' | 'ready' | 'starting' | 'error' | 'ending' }
  | {
      readonly phase: 'playing';
      readonly isQuitConfirmOpen: boolean;
      readonly playerState: YouTubePlayerState;
    };

export type GameplayKeyAction =
  | { readonly kind: 'none' }
  /** 곡 선택으로 돌아간다. */
  | { readonly kind: 'leave' }
  | { readonly kind: 'cycleMvMode' }
  /** 재생을 요청하고 starting 으로 간다. */
  | { readonly kind: 'start' }
  | { readonly kind: 'openQuitConfirm' }
  | { readonly kind: 'closeQuitConfirm' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'pressLane'; readonly lane: Lane };

const NONE: GameplayKeyAction = { kind: 'none' };

export function getGameplayKeyAction(
  context: GameplayKeyContext,
  key: GameplayKey,
  isRepeat: boolean,
): GameplayKeyAction {
  // 키를 누르고 있을 때의 반복 입력은 나가기만 받는다. 플레이 중에는 Esc 반복이 확인창을 여닫지 않게 모두 무시한다.
  if (isRepeat && (key.command !== 'back' || context.phase === 'playing')) {
    return NONE;
  }
  switch (context.phase) {
    // starting 은 재생 요청을 이미 보냈으므로 확인을 로딩 중처럼 무시한다.
    case 'loading':
    case 'starting':
      switch (key.command) {
        case 'back':
          return { kind: 'leave' };
        case 'mvMode':
          return { kind: 'cycleMvMode' };
        default:
          return NONE;
      }
    case 'ready':
      switch (key.command) {
        case 'confirm':
          return { kind: 'start' };
        case 'back':
          return { kind: 'leave' };
        case 'mvMode':
          return { kind: 'cycleMvMode' };
        default:
          return NONE;
      }
    case 'error':
      return key.command === 'confirm' || key.command === 'back' ? { kind: 'leave' } : NONE;
    case 'ending':
      return NONE;
    case 'playing':
      return getPlayingKeyAction(context.isQuitConfirmOpen, context.playerState, key);
  }
}

function getPlayingKeyAction(
  isQuitConfirmOpen: boolean,
  playerState: YouTubePlayerState,
  key: GameplayKey,
): GameplayKeyAction {
  switch (getQuitConfirmAction(isQuitConfirmOpen, key.command)) {
    case 'open':
      return { kind: 'openQuitConfirm' };
    case 'quit':
      return { kind: 'leave' };
    case 'cancel':
      return { kind: 'closeQuitConfirm' };
    case 'ignore':
      return NONE;
    case 'pass':
      break;
  }
  // 버퍼링·일시정지 중에는 레인 입력을 판정하지 않는다.
  const isStopped = playerState === 'buffering' || playerState === 'paused';
  if (key.lane !== null && !isStopped) {
    return {
      kind: 'pressLane',
      lane: key.lane,
    };
  }
  switch (key.command) {
    case 'confirm':
      return playerState === 'paused' ? { kind: 'resume' } : NONE;
    case 'mvMode':
      return { kind: 'cycleMvMode' };
    default:
      return NONE;
  }
}

export function readGameplayKey(code: string, keyBindings: Settings['keyBindings']): GameplayKey {
  const lane = LANES.find((candidate) => keyBindings[candidate] === code) ?? null;
  return {
    lane,
    command: toCommand(code, lane),
  };
}

function toCommand(code: string, lane: Lane | null): GameplayCommand | null {
  switch (code) {
    // Enter 는 레인 키로 바인딩해도 시작·재개 키로 계속 쓴다.
    case 'Enter':
      return 'confirm';
    case 'Escape':
      return 'back';
    // Tab 을 레인 키로 바인딩하면 MV 모드 전환보다 레인 입력이 우선한다.
    case 'Tab':
      return lane === null ? 'mvMode' : null;
    default:
      return null;
  }
}
