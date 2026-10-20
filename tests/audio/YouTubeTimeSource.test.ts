import { describe, expect, it } from 'vitest';
import type { YouTubePlayerState } from '../../src/audio/YouTubePlayer.js';
import { YouTubeTimeSource } from '../../src/audio/YouTubeTimeSource.js';

function setup(startMs = 1000) {
  const fake = {
    positionSec: 0,
    nowMs: startMs,
  };
  const source = new YouTubeTimeSource(
    { getCurrentTime: () => fake.positionSec },
    () => fake.nowMs,
  );
  return {
    fake,
    source,
  };
}

describe('YouTubeTimeSource', () => {
  it('aligns to the player position on the first playing state', () => {
    const { fake, source } = setup();
    fake.positionSec = 12.5;
    source.handleStateChange('playing');
    expect(source.currentTime).toBeCloseTo(12.5);
  });

  it('advances by elapsed now while tracking', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 120;
    expect(source.currentTime).toBeCloseTo(10.12);
  });

  it.each<YouTubePlayerState>(['buffering', 'paused'])('freezes while state %s', (state) => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 200;
    fake.positionSec = 10.2;
    source.handleStateChange(state);
    fake.nowMs += 5000;
    expect(source.currentTime).toBeCloseTo(10.2);
  });

  it('resyncs to the player position when playing resumes', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 200;
    source.handleStateChange('paused');
    fake.nowMs += 3000;
    fake.positionSec = 4;
    source.handleStateChange('playing');
    expect(source.currentTime).toBeCloseTo(4);
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(4.1);
  });

  it('ignores sync before the sample interval elapses', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 200;
    fake.positionSec = 20;
    source.sync();
    expect(source.currentTime).toBeCloseTo(10.2);
  });

  it('jumps to the sampled position when drift exceeds 1s', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 500;
    fake.positionSec = 11.501;
    source.sync();
    expect(source.currentTime).toBeCloseTo(11.501);
  });

  it('does not jump when drift is exactly 1s', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 500;
    fake.positionSec = 11.5;
    source.sync();
    expect(source.currentTime).toBeCloseTo(10.5);
  });

  it('absorbs a lead within 1s over one sample interval, then advances at normal rate', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 300;
    fake.positionSec = 10.38;
    source.sync();
    expect(source.currentTime).toBeCloseTo(10.3);
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(10.3 + 0.1 * 1.32);
    fake.nowMs += 150;
    expect(source.currentTime).toBeCloseTo(10.38 + 0.25);
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(10.38 + 0.35);
  });

  it.each([
    [0.2, 1.5],
    [-0.04, 0.84],
  ])('limits the rate when drift is %ss', (driftSec, rate) => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 300;
    fake.positionSec = 10.3 + driftSec;
    source.sync();
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(10.3 + 0.1 * rate);
  });

  it('jumps back to the sampled position and reports it when the player falls 51ms behind', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 300;
    fake.positionSec = 10.249;
    expect(source.sync()).toBe(true);
    expect(source.currentTime).toBeCloseTo(10.249);
    fake.nowMs += 100;
    expect(source.currentTime).toBeCloseTo(10.349);
  });

  it('does not report falling behind when the player is 49ms behind', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 300;
    fake.positionSec = 10.251;
    expect(source.sync()).toBe(false);
    expect(source.currentTime).toBeCloseTo(10.3);
  });

  it('keeps advancing after ended and ignores sync', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 100;
    fake.positionSec = 60;
    source.handleStateChange('ended');
    fake.nowMs += 1000;
    source.sync();
    expect(source.currentTime).toBeCloseTo(61);
    fake.nowMs += 500;
    source.sync();
    expect(source.currentTime).toBeCloseTo(61.5);
  });

  it('returns the same value for repeated reads at the same now', () => {
    const { fake, source } = setup();
    fake.positionSec = 10;
    source.handleStateChange('playing');
    fake.nowMs += 250;
    fake.positionSec = 30;
    const first = source.currentTime;
    expect(source.currentTime).toBe(first);
    expect(source.currentTime).toBe(first);
  });
});
