export class RhythmClock {
  private readonly timeSource: { readonly currentTime: number };
  private readonly userOffsetMs: number;
  private readonly chartOffsetMs: number;
  private audioStartTimeSec: number | null = null;
  private songStartMs = 0;

  constructor(
    timeSource: { readonly currentTime: number },
    userOffsetMs: number,
    chartOffsetMs: number,
  ) {
    this.timeSource = timeSource;
    this.userOffsetMs = userOffsetMs;
    this.chartOffsetMs = chartOffsetMs;
  }

  start(audioStartTimeSec: number, songStartMs: number): void {
    this.audioStartTimeSec = audioStartTimeSec;
    this.songStartMs = songStartMs;
  }

  getTimeMs(): number {
    return this.getPlaybackMs() + this.userOffsetMs + this.chartOffsetMs;
  }

  getPlaybackMs(): number {
    if (this.audioStartTimeSec === null) {
      throw new Error('RhythmClock has not been started');
    }
    return (this.timeSource.currentTime - this.audioStartTimeSec) * 1000 + this.songStartMs;
  }
}
