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

export function isLoadingStatus(status: GameplayStatus): boolean {
  return status.kind === 'loading';
}
