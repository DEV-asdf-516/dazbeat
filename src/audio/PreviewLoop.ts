import type { YouTubePlayer, YouTubePlayerState } from './YouTubePlayer.js';
import { getProgress } from '../range.js';
import { msToSec } from '../time.js';

const PREVIEW_SPAN_MS = 20000;
const FADE_IN_MS = 1000;
const FADE_OUT_MS = 1500;

export class PreviewLoop {
  private readonly player: Pick<YouTubePlayer, 'requestPlay' | 'setVolume'>;
  private readonly now: () => number;
  private readonly startSec: number;
  private readonly volume: number;
  private playedMs = 0;
  private playingSinceAtMs: number | null = null;
  private sentVolume = 0;

  constructor(
    player: Pick<YouTubePlayer, 'requestPlay' | 'setVolume'>,
    now: () => number,
    plan: {
      readonly startMs: number;
      readonly volume: number;
    },
  ) {
    this.player = player;
    this.now = now;
    this.startSec = msToSec(plan.startMs);
    this.volume = plan.volume;
    player.setVolume(0);
    player.requestPlay(this.startSec);
  }

  handleStateChange(state: YouTubePlayerState): void {
    switch (state) {
      case 'playing':
        this.playingSinceAtMs ??= this.now();
        return;
      case 'ended':
        this.playingSinceAtMs = null;
        this.restart();
        return;
      default:
        this.playedMs = this.getPlayedMs();
        this.playingSinceAtMs = null;
        return;
    }
  }

  // 탭이 숨거나 창이 가려져 프레임이 멈춰도 iframe 의 위치 보고는 계속 오므로, 구간 끝 되감기를 여기서도 한다.
  handlePositionReport(): void {
    if (this.getPlayedMs() >= PREVIEW_SPAN_MS) {
      this.restart();
    }
  }

  tick(): void {
    const playedMs = this.getPlayedMs();
    if (playedMs >= PREVIEW_SPAN_MS) {
      this.restart();
      return;
    }
    const volume =
      this.volume *
      Math.min(
        getProgress(playedMs, 0, FADE_IN_MS),
        getProgress(playedMs, PREVIEW_SPAN_MS, PREVIEW_SPAN_MS - FADE_OUT_MS),
      );
    if (volume !== this.sentVolume) {
      this.player.setVolume(volume);
      this.sentVolume = volume;
    }
  }

  private getPlayedMs(): number {
    return this.playingSinceAtMs === null
      ? this.playedMs
      : this.playedMs + this.now() - this.playingSinceAtMs;
  }

  private restart(): void {
    this.player.setVolume(0);
    this.sentVolume = 0;
    this.player.requestPlay(this.startSec);
    this.playedMs = 0;
    // seek 뒤에는 playing 보고가 다시 오지 않을 수 있어, 재생 중이었으면 지금부터 바로 센다.
    if (this.playingSinceAtMs !== null) {
      this.playingSinceAtMs = this.now();
    }
  }
}
