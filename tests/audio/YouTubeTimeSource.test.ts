import { describe, expect, it } from 'vitest';
import type { YouTubePlayerState } from '../../src/audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../src/audio/YouTubeTimeSource.js';

function setup() {
  const fake = { nowMs: 1000 };
  const source = new YouTubeTimeSource(() => fake.nowMs);
  return {
    fake,
    source,
  };
}

describe('YouTubeTimeSource', () => {
  it('stays at the held position until the player plays', () => {
    const { fake, source } = setup();
    source.hold(12.5);
    source.handleStateChange('buffering');
    fake.nowMs += 800;

    expect(source.currentTime).toBe(12.5);
  });

  it('flows from the held position by elapsed time once playing', () => {
    const { fake, source } = setup();
    source.hold(10);
    source.handleStateChange('playing');
    fake.nowMs += 120;

    expect(source.currentTime).toBeCloseTo(10.12, 9);
  });

  it('keeps flowing without a jump on a repeated playing state', () => {
    const { fake, source } = setup();
    source.hold(10);
    source.handleStateChange('playing');
    fake.nowMs += 500;
    source.handleStateChange('playing');
    fake.nowMs += 500;

    expect(source.currentTime).toBeCloseTo(11, 9);
  });

  it.each<YouTubePlayerState>(['buffering', 'paused', 'unstarted', 'cued'])(
    'stops where it is on %s and continues from there on playing',
    (state) => {
      const { fake, source } = setup();
      source.hold(10);
      source.handleStateChange('playing');
      fake.nowMs += 200;
      source.handleStateChange(state);
      fake.nowMs += 3000;
      expect(source.currentTime).toBeCloseTo(10.2, 9);

      source.handleStateChange('playing');
      fake.nowMs += 100;
      expect(source.currentTime).toBeCloseTo(10.3, 9);
    },
  );

  it('reads a given time and never before the flow started', () => {
    const { fake, source } = setup();
    source.hold(10);
    source.handleStateChange('playing');

    expect(source.getTimeAt(fake.nowMs + 250)).toBeCloseTo(10.25, 9);
    expect(source.getTimeAt(fake.nowMs - 16)).toBe(10);
  });

  it('keeps flowing after the video ends', () => {
    const { fake, source } = setup();
    source.hold(10);
    source.handleStateChange('playing');
    fake.nowMs += 200;
    source.handleStateChange('ended');
    fake.nowMs += 300;

    expect(source.currentTime).toBeCloseTo(10.5, 9);
  });

  it('restarts from a new held position while flowing', () => {
    const { fake, source } = setup();
    source.hold(10);
    source.handleStateChange('playing');
    fake.nowMs += 200;
    source.hold(4);
    fake.nowMs += 300;
    expect(source.currentTime).toBe(4);

    source.handleStateChange('playing');
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(4.1, 9);
  });
});
