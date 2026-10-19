import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../../src/audio/RhythmClock.js';

describe('RhythmClock', () => {
  it('adds positive offsets to song time but not to playback position', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 30, 20, {
      audioStartTimeSec: 10,
      songStartMs: 0,
    });
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(1500 + 30 + 20);
    expect(clock.getPlaybackMs()).toBeCloseTo(1500);
  });

  it('adds negative offsets to song time but not to playback position', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, -40, -15, {
      audioStartTimeSec: 10,
      songStartMs: 0,
    });
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(1500 - 40 - 15);
    expect(clock.getPlaybackMs()).toBeCloseTo(1500);
  });

  it('starts from songStartMs', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 0, 0, {
      audioStartTimeSec: 10,
      songStartMs: 5000,
    });
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(6500);
    expect(clock.getPlaybackMs()).toBeCloseTo(6500);
  });

  it('returns negative song time during the lead-in', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 30, -10, {
      audioStartTimeSec: 12,
      songStartMs: 0,
    });
    expect(clock.getTimeMs()).toBeCloseTo(-2000 + 30 - 10);
    expect(clock.getPlaybackMs()).toBeCloseTo(-2000);
  });
});
