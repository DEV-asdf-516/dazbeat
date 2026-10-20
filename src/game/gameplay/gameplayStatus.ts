import type { PlaybackStatus } from '../../audio/LeadInPlayback.js';

export type GameplayStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'awaitingStart' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'countdown'; readonly digit: 1 | 2 | 3 }
  | { readonly kind: 'none' };

export function getPlayingStatus(status: PlaybackStatus): GameplayStatus {
  switch (status.kind) {
    case 'loading':
    case 'paused':
      return { kind: status.kind };
    case 'countdown':
      return {
        kind: 'countdown',
        digit: status.digit,
      };
    case 'waiting':
    case 'running':
      return { kind: 'none' };
  }
}

export function isSamePlaybackStatus(a: PlaybackStatus, b: PlaybackStatus): boolean {
  return a.kind === 'countdown' && b.kind === 'countdown' ? a.digit === b.digit : a.kind === b.kind;
}

export function isLoadingStatus(status: GameplayStatus): boolean {
  return status.kind === 'loading';
}
