import type { PlaybackStatus } from '../../audio/LeadInPlayback.js';
import { LANES } from '../../rhythm/lanes.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/settings.js';
import type { GameplayCommand } from './gameplayCommand.js';
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

export type PressedLanes = ReadonlySet<Lane>;

export type LaneReleaseAction =
  { readonly kind: 'none' } | { readonly kind: 'release'; readonly pressedLanes: PressedLanes };

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
  status: PlaybackStatus,
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
  if (key.lane !== null && status.kind === 'running') {
    return {
      kind: 'pressLane',
      lane: key.lane,
    };
  }
  switch (key.command) {
    case 'confirm':
      return status.kind === 'paused' ? { kind: 'resume' } : NONE;
    case 'mvMode':
      return { kind: 'cycleMvMode' };
    default:
      return NONE;
  }
}

export function addPressedLane(pressedLanes: PressedLanes, lane: Lane): PressedLanes {
  return pressedLanes.has(lane) ? pressedLanes : new Set([...pressedLanes, lane]);
}

// 세션에 누르기를 전달하지 않은 레인(카운트다운 중 누른 키 등)의 떼기는 세션에 넘기지 않는다.
export function getLaneReleaseAction(pressedLanes: PressedLanes, lane: Lane): LaneReleaseAction {
  if (!pressedLanes.has(lane)) {
    return NONE;
  }
  return {
    kind: 'release',
    pressedLanes: new Set([...pressedLanes].filter((pressed) => pressed !== lane)),
  };
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
