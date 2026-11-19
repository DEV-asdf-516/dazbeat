import { secToMs } from '../time.js';

export class RhythmClock {
  private readonly timeSource: { getTimeAt(atMs: number): number };
  private readonly userOffsetMs: number;
  private readonly chartOffsetMs: number;
  private readonly audioStartTimeSec: number;
  private readonly songStartMs: number;

  constructor(
    timeSource: { getTimeAt(atMs: number): number },
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

  getTimeMs(atMs: number): number {
    return this.getPlaybackMs(atMs) + this.userOffsetMs + this.chartOffsetMs;
  }

  getPlaybackMs(atMs: number): number {
    return secToMs(this.timeSource.getTimeAt(atMs) - this.audioStartTimeSec) + this.songStartMs;
  }
}
