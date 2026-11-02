import type { PlaybackStatus } from '../../../audio/LeadInPlayback.js';
import type { YouTubeErrorKind } from '../../../audio/YouTubePlayer.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { MV_MODES } from '../../../storage/settings.js';
import type { MvMode } from '../../../storage/settings.js';
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

export type GameplayLoadError =
  | { readonly kind: 'chartLoadFailed' }
  | { readonly kind: 'playerLoadFailed' }
  | { readonly kind: 'videoError'; readonly errorKind: YouTubeErrorKind; readonly code: number }
  | { readonly kind: 'playbackStartFailed' };

export type GameplayStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'resuming' }
  | { readonly kind: 'countdown'; readonly digit: 1 | 2 | 3 }
  | { readonly kind: 'none' };

export function getPlayingStatus(status: PlaybackStatus): GameplayStatus {
  switch (status.kind) {
    case 'loading':
    case 'paused':
    case 'resuming':
      return { kind: status.kind };
    case 'countdown':
      return {
        kind: 'countdown',
        digit: status.digit,
      };
    case 'running':
      return { kind: 'none' };
  }
}

// 일시정지는 멈춘 장면을 그대로 보이고, 영상 위치를 다시 맞추는 동안(로딩·재개·카운트다운)만 가린다.
export function isMvVisibleIn(status: PlaybackStatus): boolean {
  switch (status.kind) {
    case 'running':
    case 'paused':
      return true;
    case 'loading':
    case 'resuming':
    case 'countdown':
      return false;
  }
}

export type GameplayStatusMessage = 'loading' | 'resuming';

export interface GameplayStatusView {
  readonly notice:
    | { readonly kind: 'none' }
    | { readonly kind: 'loading'; readonly message: GameplayStatusMessage };
  readonly countdownDigit: 1 | 2 | 3 | null;
}

const NO_STATUS_VIEW: GameplayStatusView = {
  notice: { kind: 'none' },
  countdownDigit: null,
};

export function getStatusView(status: GameplayStatus): GameplayStatusView {
  switch (status.kind) {
    case 'loading':
    case 'resuming':
      return {
        notice: {
          kind: 'loading',
          message: status.kind,
        },
        countdownDigit: null,
      };
    case 'countdown':
      return {
        notice: { kind: 'none' },
        countdownDigit: status.digit,
      };
    case 'paused':
    case 'none':
      return NO_STATUS_VIEW;
  }
}

export type GameplayStatusRegion = 'notice' | 'countdown' | 'countdownPop';

type StatusReader = StateReader<GameplayStatus>;

const readKind: StatusReader = (status) => status.kind;
const readDigit: StatusReader = (status) => getStatusView(status).countdownDigit;

const REGION_SOURCES: Readonly<
  Record<Exclude<GameplayStatusRegion, 'countdownPop'>, readonly StatusReader[]>
> = {
  notice: [readKind],
  countdown: [readDigit],
};

export function getChangedStatusRegions(
  previous: GameplayStatus | null,
  next: GameplayStatus,
): readonly GameplayStatusRegion[] {
  const regions: GameplayStatusRegion[] = [...filterChangedRegions(REGION_SOURCES, previous, next)];
  const digit = getStatusView(next).countdownDigit;
  // 숫자가 사라질 때도 팝 트윈을 멈추고 크기를 되돌려야 하므로 숫자가 바뀌면 늘 고른다.
  const isPopped =
    previous === null ? digit !== null : getStatusView(previous).countdownDigit !== digit;
  return isPopped ? [...regions, 'countdownPop'] : regions;
}

export type LoadErrorMessage =
  | {
      readonly kind: 'key';
      readonly key:
        'gameplay.chartLoadFailed' | 'gameplay.playerLoadFailed' | 'gameplay.playbackStartFailed';
    }
  | { readonly kind: 'videoError'; readonly errorKind: YouTubeErrorKind; readonly code: number };

export function getLoadErrorText(error: GameplayLoadError): {
  readonly message: LoadErrorMessage;
  readonly hasHint: boolean;
} {
  switch (error.kind) {
    case 'chartLoadFailed':
      return {
        message: {
          kind: 'key',
          key: 'gameplay.chartLoadFailed',
        },
        hasHint: false,
      };
    case 'playerLoadFailed':
      return {
        message: {
          kind: 'key',
          key: 'gameplay.playerLoadFailed',
        },
        hasHint: false,
      };
    case 'videoError':
      return {
        message: {
          kind: 'videoError',
          errorKind: error.errorKind,
          code: error.code,
        },
        hasHint: error.errorKind === 'embeddingNotAllowed',
      };
    case 'playbackStartFailed':
      return {
        message: {
          kind: 'key',
          key: 'gameplay.playbackStartFailed',
        },
        hasHint: false,
      };
  }
}

export function getMvModeMarks(
  selected: MvMode,
): readonly { readonly mode: MvMode; readonly isSelected: boolean }[] {
  return MV_MODES.map((mode) => ({
    mode,
    isSelected: mode === selected,
  }));
}

export type GameplayButton = 'back' | 'quitCancel' | 'quitAccept';

export interface GameplayButtons {
  readonly hover: ButtonHover<GameplayButton> | null;
  readonly isQuitConfirmOpen: boolean;
}

export const INITIAL_GAMEPLAY_BUTTONS: GameplayButtons = {
  hover: null,
  isQuitConfirmOpen: false,
};

export function withQuitConfirmOpen(
  buttons: GameplayButtons,
  isQuitConfirmOpen: boolean,
): GameplayButtons {
  if (buttons.isQuitConfirmOpen === isQuitConfirmOpen) {
    return buttons;
  }
  return {
    isQuitConfirmOpen,
    // Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 확인 창을 닫을 때 그 안 버튼의 hover 를 푼다.
    hover: isQuitConfirmOpen
      ? buttons.hover
      : unhoverButton(unhoverButton(buttons.hover, 'quitCancel'), 'quitAccept'),
  };
}

function isGameplayButtonEnabled(buttons: GameplayButtons, button: GameplayButton): boolean {
  return button === 'back' || buttons.isQuitConfirmOpen;
}

function withHover(buttons: GameplayButtons, hover: GameplayButtons['hover']): GameplayButtons {
  return hover === buttons.hover
    ? buttons
    : {
        ...buttons,
        hover,
      };
}

export function hoverGameplayButton(
  buttons: GameplayButtons,
  button: GameplayButton,
): GameplayButtons {
  return withHover(buttons, hoverButton(buttons.hover, button));
}

export function unhoverGameplayButton(
  buttons: GameplayButtons,
  button: GameplayButton,
): GameplayButtons {
  return withHover(buttons, unhoverButton(buttons.hover, button));
}

export function pressGameplayButton(
  buttons: GameplayButtons,
  button: GameplayButton,
): GameplayButtons {
  return withHover(
    buttons,
    pressButton(buttons.hover, button, isGameplayButtonEnabled(buttons, button)),
  );
}

export function releaseGameplayButton(
  buttons: GameplayButtons,
  button: GameplayButton,
): GameplayButtons {
  return withHover(buttons, releaseButton(buttons.hover, button));
}

export function getGameplayButtonView(
  buttons: GameplayButtons,
  button: GameplayButton,
): ButtonView {
  return getButtonView(
    buttons.hover,
    button,
    isGameplayButtonEnabled(buttons, button),
    button === 'back',
  );
}

export type GameplayButtonRegion = 'backButton' | 'quitConfirmButtons';

type ButtonsReader = StateReader<GameplayButtons>;

const readQuitConfirmOpen: ButtonsReader = (buttons) => buttons.isQuitConfirmOpen;

function readPointer(button: GameplayButton): readonly ButtonsReader[] {
  return [
    (buttons) => isButtonHovered(buttons.hover, button),
    (buttons) => isButtonPressed(buttons.hover, button),
  ];
}

const BUTTON_REGION_SOURCES: Readonly<Record<GameplayButtonRegion, readonly ButtonsReader[]>> = {
  backButton: readPointer('back'),
  quitConfirmButtons: [
    ...readPointer('quitCancel'),
    ...readPointer('quitAccept'),
    readQuitConfirmOpen,
  ],
};

export function getChangedButtonRegions(
  previous: GameplayButtons | null,
  next: GameplayButtons,
): readonly GameplayButtonRegion[] {
  return filterChangedRegions(BUTTON_REGION_SOURCES, previous, next);
}
