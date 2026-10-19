import { secToMs } from '../time.js';

export class RhythmClock {
  private readonly timeSource: { readonly currentTime: number };
  private readonly userOffsetMs: number;
  private readonly chartOffsetMs: number;
  private readonly audioStartTimeSec: number;
  private readonly songStartMs: number;

  constructor(
    timeSource: { readonly currentTime: number },
    userOffsetMs: number,
    chartOffsetMs: number,
    start: { audioStartTimeSec: number; songStartMs: number },
  ) {
    this.timeSource = timeSource;
    this.userOffsetMs = userOffsetMs;
    this.chartOffsetMs = chartOffsetMs;
    this.audioStartTimeSec = start.audioStartTimeSec;
    this.songStartMs = start.songStartMs;
  }

  getTimeMs(): number {
    return this.getPlaybackMs() + this.userOffsetMs + this.chartOffsetMs;
  }

  getPlaybackMs(): number {
    return secToMs(this.timeSource.currentTime - this.audioStartTimeSec) + this.songStartMs;
  }
}
