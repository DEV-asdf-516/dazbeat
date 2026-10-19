import type { YouTubePlayerState } from './YouTubePlayer.js';
import { msToSec, secToMs } from '../time.js';

export const SYNC_INTERVAL_MS = 250;
export const HARD_RESYNC_MS = 100;
export const SOFT_CORRECTION_RATIO = 0.25;

type TimeSourceMode = 'frozen' | 'tracking' | 'freeRunning';

// 끝난 뒤엔 판정 마감을 위해 혼자 흐른다.
function getMode(state: YouTubePlayerState): TimeSourceMode {
  switch (state) {
    case 'playing':
      return 'tracking';
    case 'ended':
      return 'freeRunning';
    default:
      return 'frozen';
  }
}

export class YouTubeTimeSource {
  private readonly player: { getCurrentTime(): number };
  private readonly now: () => number;
  private mode: TimeSourceMode = 'frozen';
  private anchorSec = 0;
  private anchorAtMs: number;
  private lastSampleAtMs: number;

  constructor(player: { getCurrentTime(): number }, now: () => number) {
    this.player = player;
    this.now = now;
    this.anchorAtMs = now();
    this.lastSampleAtMs = this.anchorAtMs;
  }

  get currentTime(): number {
    if (this.mode === 'frozen') {
      return this.anchorSec;
    }
    return this.anchorSec + msToSec(this.now() - this.anchorAtMs);
  }

  handleStateChange(state: YouTubePlayerState): void {
    const t = this.now();
    this.anchorSec = this.player.getCurrentTime();
    this.anchorAtMs = t;
    this.lastSampleAtMs = t;
    this.mode = getMode(state);
  }

  sync(): void {
    if (this.mode !== 'tracking') {
      return;
    }
    const t = this.now();
    if (t - this.lastSampleAtMs < SYNC_INTERVAL_MS) {
      return;
    }
    this.lastSampleAtMs = t;
    const predictedSec = this.anchorSec + msToSec(t - this.anchorAtMs);
    const driftSec = this.player.getCurrentTime() - predictedSec;
    this.anchorSec =
      secToMs(Math.abs(driftSec)) > HARD_RESYNC_MS
        ? predictedSec + driftSec
        : predictedSec + driftSec * SOFT_CORRECTION_RATIO;
    this.anchorAtMs = t;
  }
}
