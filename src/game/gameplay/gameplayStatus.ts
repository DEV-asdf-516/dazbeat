import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';

export type GameplayStatus =
  'loading' | 'awaitingStart' | 'preparing' | 'buffering' | 'paused' | 'none';

export function isPlayerStopped(
  state: YouTubePlayerState,
): state is Extract<YouTubePlayerState, 'buffering' | 'paused'> {
  return state === 'buffering' || state === 'paused';
}

export function getPlayingStatus(state: YouTubePlayerState): GameplayStatus {
  return isPlayerStopped(state) ? state : 'none';
}

export function isLoadingStatus(status: GameplayStatus): boolean {
  return status === 'loading' || status === 'preparing' || status === 'buffering';
}
