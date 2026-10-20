import type { YouTubePlayerState } from './YouTubePlayer.js';
import { clamp } from '../range.js';
import { msToSec, secToMs } from '../time.js';

export const SYNC_INTERVAL_MS = 250;
export const HARD_RESYNC_MS = 1000;
// 영상이 이만큼 뒤처지면 감속으로 따라가지 않고 보고 위치로 재기준한다: 노트가 눈에 띄게 느려지는 것보다 낫다.
export const MAX_LAG_MS = 50;
const MAX_RATE_DEVIATION = 0.5;

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
  private rate = 1;
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
    return this.predictSec(this.now());
  }

  handleStateChange(state: YouTubePlayerState): void {
    const t = this.now();
    this.anchorSec = this.player.getCurrentTime();
    this.anchorAtMs = t;
    this.lastSampleAtMs = t;
    this.rate = 1;
    this.mode = getMode(state);
  }

  // 영상이 MAX_LAG_MS 넘게 뒤처져 재기준했으면 true 를 반환한다.
  sync(): boolean {
    if (this.mode !== 'tracking') {
      return false;
    }
    const t = this.now();
    if (t - this.lastSampleAtMs < SYNC_INTERVAL_MS) {
      return false;
    }
    const reportedSec = this.player.getCurrentTime();
    const predictedSec = this.predictSec(t);
    const driftMs = secToMs(reportedSec - predictedSec);
    const hasFallenBehind = driftMs < -MAX_LAG_MS;
    if (hasFallenBehind || driftMs > HARD_RESYNC_MS) {
      this.anchorSec = reportedSec;
      this.rate = 1;
    } else {
      this.anchorSec = predictedSec;
      this.rate = 1 + clamp(driftMs / SYNC_INTERVAL_MS, -MAX_RATE_DEVIATION, MAX_RATE_DEVIATION);
    }
    this.anchorAtMs = t;
    // TEMP 진단: 시작 직후 어긋남 확인 후 제거
    console.log(`t=${performance.now().toFixed(0)} [sync] reported=${reportedSec.toFixed(3)} predicted=${predictedSec.toFixed(3)} drift=${driftMs.toFixed(0)}ms`);
    this.lastSampleAtMs = t;
    return hasFallenBehind;
  }

  // 배율은 한 샘플 간격에만 적용해, sync 가 한동안 불리지 않아도 편차가 쌓이지 않게 한다.
  private predictSec(atMs: number): number {
    const elapsedMs = atMs - this.anchorAtMs;
    const correctedMs = Math.min(elapsedMs, SYNC_INTERVAL_MS);
    return this.anchorSec + msToSec(this.rate * correctedMs + (elapsedMs - correctedMs));
  }
}
