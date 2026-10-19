import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';
import { LANES } from '../../rhythm/lanes.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/settings.js';
import type { GameplayCommand } from './gameplayCommand.js';
import { isPlayerStopped } from './gameplayStatus.js';
import { getQuitConfirmAction } from './quitConfirm.js';

export interface GameplayKey {
  lane: Lane | null;
  command: GameplayCommand | null;
}

export type CommonKeyAction =
  { readonly kind: 'none' } | { readonly kind: 'leave' } | { readonly kind: 'cycleMvMode' };

export type ReadyKeyAction = CommonKeyAction | { readonly kind: 'start' };

export type ErrorKeyAction = { readonly kind: 'none' } | { readonly kind: 'leave' };

export type PlayingKeyAction =
  | CommonKeyAction
  | { readonly kind: 'openQuitConfirm' }
  | { readonly kind: 'closeQuitConfirm' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'pressLane'; readonly lane: Lane };

const NONE = { kind: 'none' } as const;
const LEAVE = { kind: 'leave' } as const;

// starting 은 재생 요청을 이미 보냈으므로 확인을 로딩 중처럼 무시한다.
export function getLoadingKeyAction(key: GameplayKey, isRepeat: boolean): CommonKeyAction {
  if (key.command === 'back') {
    return LEAVE;
  }
  return key.command === 'mvMode' && !isRepeat ? { kind: 'cycleMvMode' } : NONE;
}

export function getReadyKeyAction(key: GameplayKey, isRepeat: boolean): ReadyKeyAction {
  if (key.command === 'confirm' && !isRepeat) {
    return { kind: 'start' };
  }
  return getLoadingKeyAction(key, isRepeat);
}

export function getErrorKeyAction(key: GameplayKey, isRepeat: boolean): ErrorKeyAction {
  return key.command === 'back' || (key.command === 'confirm' && !isRepeat) ? LEAVE : NONE;
}

// Esc 반복이 확인창을 여닫지 않게 반복 입력을 모두 무시한다.
export function getPlayingKeyAction(
  isQuitConfirmOpen: boolean,
  playerState: YouTubePlayerState,
  key: GameplayKey,
  isRepeat: boolean,
): PlayingKeyAction {
  if (isRepeat) {
    return NONE;
  }
  switch (getQuitConfirmAction(isQuitConfirmOpen, key.command)) {
    case 'open':
      return { kind: 'openQuitConfirm' };
    case 'quit':
      return LEAVE;
    case 'cancel':
      return { kind: 'closeQuitConfirm' };
    case 'ignore':
      return NONE;
    case 'pass':
      break;
  }
  if (key.lane !== null && !isPlayerStopped(playerState)) {
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
