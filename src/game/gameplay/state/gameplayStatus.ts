import type { PlaybackStatus } from '../../audio/LeadInPlayback.js';

export type GameplayStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'awaitingStart' }
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

export type GameplayStatusMessage = 'loading' | 'awaitingStart' | 'resuming';

export interface GameplayStatusView {
  readonly notice:
    | { readonly kind: 'none' }
    | { readonly kind: 'text' | 'loading'; readonly message: GameplayStatusMessage };
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
    case 'awaitingStart':
      return {
        notice: {
          kind: 'text',
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
