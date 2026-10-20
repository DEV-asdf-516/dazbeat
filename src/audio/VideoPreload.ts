import type { YouTubePlayer, YouTubePlayerState } from './YouTubePlayer.js';
import { getVideoStartSec } from './LeadInPlayback.js';
import { msToSec } from '../time.js';

type Stage =
  | { readonly kind: 'warming' }
  | { readonly kind: 'warmPausing' }
  | {
      readonly kind: 'preloading';
      readonly startedAtMs: number;
      readonly bufferedEndSec: number;
      readonly grewAtMs: number;
    };

// 받아 둔 끝이 이만큼 늘지 않으면 더 기다려도 받아지지 않는다고 보고 시작한다.
const PRELOAD_IDLE_MS = 2000;
const PRELOAD_MAX_MS = 10000;

export class VideoPreload {
  private readonly player: Pick<YouTubePlayer, 'pause' | 'getBufferedEndSec'>;
  private readonly now: () => number;
  private readonly preloadEndMs: number;
  private stage: Stage = { kind: 'warming' };

  constructor(
    player: Pick<YouTubePlayer, 'requestPlay' | 'pause' | 'setVolume' | 'getBufferedEndSec'>,
    now: () => number,
    plan: {
      readonly playbackStartMs: number;
      readonly preloadEndMs: number;
    },
  ) {
    this.player = player;
    this.now = now;
    this.preloadEndMs = plan.preloadEndMs;
    // 예열로 영상을 미리 불러 두되, 실제 재생 요청 전까지 소리는 내지 않는다.
    player.setVolume(0);
    player.requestPlay(getVideoStartSec(plan.playbackStartMs));
  }

  handleStateChange(state: YouTubePlayerState): void {
    switch (this.stage.kind) {
      case 'warming':
        if (state === 'playing') {
          this.player.pause();
          this.stage = { kind: 'warmPausing' };
        }
        return;
      case 'warmPausing':
        if (state === 'paused') {
          const nowMs = this.now();
          this.stage = {
            kind: 'preloading',
            startedAtMs: nowMs,
            bufferedEndSec: this.player.getBufferedEndSec(),
            grewAtMs: nowMs,
          };
        }
        return;
      case 'preloading':
        return;
    }
  }

  tick(): boolean {
    const { stage } = this;
    if (stage.kind !== 'preloading') {
      return false;
    }
    const nowMs = this.now();
    const bufferedEndSec = this.player.getBufferedEndSec();
    const current =
      bufferedEndSec > stage.bufferedEndSec
        ? {
            ...stage,
            bufferedEndSec,
            grewAtMs: nowMs,
          }
        : stage;
    this.stage = current;
    return (
      current.bufferedEndSec >= msToSec(this.preloadEndMs) ||
      nowMs - current.grewAtMs >= PRELOAD_IDLE_MS ||
      nowMs - current.startedAtMs >= PRELOAD_MAX_MS
    );
  }
}
