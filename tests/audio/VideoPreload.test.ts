import { describe, expect, it } from 'vitest';
import { VideoPreload } from '../../src/audio/VideoPreload.js';
import type { YouTubePlayerState } from '../../src/audio/YouTubePlayer.js';

function setup(playbackStartMs: number) {
  const fake = {
    bufferedEndSec: 0,
    nowMs: 1000,
    calls: [] as string[],
  };
  const preload = new VideoPreload(
    {
      requestPlay: (fromSec) => fake.calls.push(`requestPlay(${fromSec})`),
      pause: () => fake.calls.push('pause'),
      setVolume: (volume) => fake.calls.push(`setVolume(${volume})`),
      getBufferedEndSec: () => fake.bufferedEndSec,
    },
    () => fake.nowMs,
    {
      playbackStartMs,
      preloadEndMs: 60000,
    },
  );
  return {
    fake,
    preload,
  };
}

// 예열 뒤 일시정지되어 선버퍼링을 시작한 상태.
function setupPreloading() {
  const ctx = setup(1000);
  ctx.preload.handleStateChange('playing');
  ctx.preload.handleStateChange('paused');
  ctx.fake.calls.length = 0;
  return ctx;
}

describe('VideoPreload', () => {
  describe('warm-up', () => {
    it.each([
      [1000, 1],
      [-2000, 0],
    ])('warms up muted at the video start for playback start %i', (playbackStartMs, fromSec) => {
      const { fake } = setup(playbackStartMs);
      expect(fake.calls).toEqual(['setVolume(0)', `requestPlay(${fromSec})`]);
    });

    it('pauses once on playing', () => {
      const { fake, preload } = setup(1000);
      preload.handleStateChange('buffering');
      preload.handleStateChange('playing');
      expect(fake.calls).toEqual(['setVolume(0)', 'requestPlay(1)', 'pause']);
      preload.handleStateChange('playing');
      preload.handleStateChange('paused');
      expect(fake.calls).toEqual(['setVolume(0)', 'requestPlay(1)', 'pause']);
    });

    it('does not complete before the warm-up pauses', () => {
      const { fake, preload } = setup(1000);
      fake.bufferedEndSec = 60;
      fake.nowMs += 20000;
      expect(preload.tick()).toBe(false);
      preload.handleStateChange('playing');
      fake.nowMs += 20000;
      expect(preload.tick()).toBe(false);
      preload.handleStateChange('paused');
      expect(preload.tick()).toBe(true);
    });
  });

  describe('preloading', () => {
    it('completes once the buffered end reaches the preload end', () => {
      const { fake, preload } = setupPreloading();
      fake.bufferedEndSec = 59.999;
      expect(preload.tick()).toBe(false);
      fake.bufferedEndSec = 60;
      expect(preload.tick()).toBe(true);
    });

    it('completes after the buffered end stays put for 2000ms', () => {
      const { fake, preload } = setupPreloading();
      fake.nowMs += 1999;
      expect(preload.tick()).toBe(false);
      fake.nowMs += 1;
      expect(preload.tick()).toBe(true);
    });

    it('measures the idle time from the last growth of the buffered end', () => {
      const { fake, preload } = setupPreloading();
      fake.nowMs += 1500;
      fake.bufferedEndSec = 10;
      expect(preload.tick()).toBe(false);
      fake.nowMs += 1999;
      expect(preload.tick()).toBe(false);
      fake.nowMs += 1;
      expect(preload.tick()).toBe(true);
    });

    it('completes after 10000ms even while the buffered end keeps growing', () => {
      const { fake, preload } = setupPreloading();
      for (let elapsedMs = 1000; elapsedMs < 10000; elapsedMs += 1000) {
        fake.nowMs += 1000;
        fake.bufferedEndSec += 1;
        expect(preload.tick()).toBe(false);
      }
      fake.nowMs += 999;
      fake.bufferedEndSec += 1;
      expect(preload.tick()).toBe(false);
      fake.nowMs += 1;
      fake.bufferedEndSec += 1;
      expect(preload.tick()).toBe(true);
    });

    it('completes without calling the player', () => {
      const { fake, preload } = setupPreloading();
      fake.bufferedEndSec = 60;
      expect(preload.tick()).toBe(true);
      expect(fake.calls).toEqual([]);
    });

    it.each<YouTubePlayerState>(['playing', 'paused', 'buffering'])(
      'ignores %s without calling the player',
      (state) => {
        const { fake, preload } = setupPreloading();
        fake.nowMs += 500;
        preload.handleStateChange(state);
        expect(fake.calls).toEqual([]);
        expect(preload.tick()).toBe(false);
      },
    );
  });
});
