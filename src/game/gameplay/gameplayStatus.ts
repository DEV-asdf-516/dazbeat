import type { YouTubePlayerState } from '../../audio/YouTubePlayer.js';

export type GameplayStatus =
  'loading' | 'awaitingStart' | 'preparing' | 'buffering' | 'paused' | 'none';

/** 재생 중 player 상태가 바뀌었을 때 보여 줄 상태. */
export function getPlayingStatus(state: YouTubePlayerState): GameplayStatus {
  switch (state) {
    case 'buffering':
      return 'buffering';
    case 'paused':
      return 'paused';
    default:
      return 'none';
  }
}

/** 기다리는 중인 상태라 loading star 를 함께 보여 줄지. */
export function isLoadingStatus(status: GameplayStatus): boolean {
  return status === 'loading' || status === 'preparing' || status === 'buffering';
}
