import { describe, expect, it } from 'vitest';
import { RhythmClock } from '../../src/audio/RhythmClock.js';

describe('RhythmClock', () => {
  it('adds positive offsets to song time but not to playback position', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 30, 20);
    clock.start(10, 0);
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(1500 + 30 + 20);
    expect(clock.getPlaybackMs()).toBeCloseTo(1500);
  });

  it('adds negative offsets to song time but not to playback position', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, -40, -15);
    clock.start(10, 0);
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(1500 - 40 - 15);
    expect(clock.getPlaybackMs()).toBeCloseTo(1500);
  });

  it('starts from songStartMs', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 0, 0);
    clock.start(10, 5000);
    timeSource.currentTime = 11.5;
    expect(clock.getTimeMs()).toBeCloseTo(6500);
    expect(clock.getPlaybackMs()).toBeCloseTo(6500);
  });

  it('returns negative song time during the lead-in', () => {
    const timeSource = { currentTime: 10 };
    const clock = new RhythmClock(timeSource, 30, -10);
    clock.start(12, 0);
    expect(clock.getTimeMs()).toBeCloseTo(-2000 + 30 - 10);
    expect(clock.getPlaybackMs()).toBeCloseTo(-2000);
  });

  it('throws when read before start', () => {
    const clock = new RhythmClock({ currentTime: 10 }, 0, 0);
    expect(() => clock.getTimeMs()).toThrow(Error);
    expect(() => clock.getPlaybackMs()).toThrow(Error);
  });
});
