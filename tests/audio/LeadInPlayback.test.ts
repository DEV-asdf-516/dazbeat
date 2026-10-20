import { describe, expect, it } from 'vitest';
import { LeadInPlayback } from '../../src/audio/LeadInPlayback.js';
import type { YouTubePlayerState } from '../../src/audio/YouTubePlayer.js';

const VOLUME = 0.6;

// 선버퍼링이 끝나 카운트다운이 시작된 상태.
function setup(playbackStartMs: number) {
  const fake = {
    positionSec: 0,
    nowMs: 1000,
    calls: [] as string[],
  };
  const playback = new LeadInPlayback(
    {
      requestPlay: (fromSec) => fake.calls.push(`requestPlay(${fromSec})`),
      pause: () => fake.calls.push('pause'),
      resume: () => fake.calls.push('resume'),
      setVolume: (volume) => fake.calls.push(`setVolume(${volume})`),
      getCurrentTime: () => fake.positionSec,
    },
    () => fake.nowMs,
    {
      playbackStartMs,
      volume: VOLUME,
    },
  );
  return {
    fake,
    playback,
  };
}

// 카운트다운이 끝나 V 재생을 요청한 출발 대기 상태.
function setupDeparting(playbackStartMs: number) {
  const ctx = setup(playbackStartMs);
  ctx.fake.nowMs += 3000;
  ctx.playback.tick();
  ctx.fake.calls.length = 0;
  return ctx;
}

// 0초에서 출발한 영상이 stopSec 까지 재생된 영상 구간 상태.
function setupVideo(stopSec: number) {
  const ctx = setupDeparting(0);
  ctx.fake.positionSec = 0;
  ctx.playback.handleStateChange('playing');
  ctx.playback.tick();
  ctx.fake.nowMs += 50;
  ctx.fake.positionSec = 0.05;
  ctx.playback.tick();
  // 영상 구간의 playing 은 시간 소스에 전달되어 보고 위치 stopSec 으로 정확히 재기준된다.
  ctx.fake.nowMs += stopSec * 1000 - 50;
  ctx.fake.positionSec = stopSec;
  ctx.playback.handleStateChange('playing');
  ctx.fake.calls.length = 0;
  return ctx;
}

// 영상 구간 버퍼링으로 stopSec 에 정지한 상태.
function setupStalled(stopSec: number) {
  const ctx = setupVideo(stopSec);
  ctx.playback.handleStateChange('buffering');
  ctx.fake.calls.length = 0;
  return ctx;
}

// 정지 뒤 YouTube 가 재개해 되감기 위치 rewindSec 에서 복귀를 시작한 상태.
function setupCatchingUp(stopSec: number, rewindSec: number) {
  const ctx = setupStalled(stopSec);
  ctx.fake.positionSec = rewindSec;
  ctx.playback.handleStateChange('playing');
  ctx.fake.calls.length = 0;
  return ctx;
}

const RUNNING = { kind: 'running' };

function countdown(digit: number) {
  return {
    kind: 'countdown',
    digit,
  };
}

function status(kind: string) {
  return { kind };
}

describe('LeadInPlayback', () => {
  describe('countdown', () => {
    it('starts at 3 at the video start without calling the player', () => {
      const { fake, playback } = setup(1000);
      expect(playback.status).toEqual(countdown(3));
      expect(playback.currentTime).toBe(1);
      expect(fake.calls).toEqual([]);
    });

    it('changes the digit every 1000ms', () => {
      const { fake, playback } = setup(1000);
      const digits = [999, 1000, 1999, 2000, 2999].map((elapsedMs) => {
        fake.nowMs = 1000 + elapsedMs;
        playback.tick();
        return playback.status;
      });
      expect(digits).toEqual([
        countdown(3),
        countdown(2),
        countdown(2),
        countdown(1),
        countdown(1),
      ]);
      expect(fake.calls).toEqual([]);
      expect(playback.currentTime).toBe(1);
    });

    it('unmutes and resumes where the warm-up paused when the countdown ends', () => {
      const { fake, playback } = setup(1000);
      fake.nowMs += 2999;
      playback.tick();
      expect(fake.calls).toEqual([]);
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      expect(fake.calls).toEqual([`setVolume(${VOLUME})`, 'resume']);
      expect(playback.currentTime).toBe(1);
    });

    it('resumes and stays at 0 for a negative playback start', () => {
      const { fake, playback } = setup(-2000);
      fake.nowMs += 1500;
      playback.tick();
      expect(playback.currentTime).toBe(0);
      fake.nowMs += 1500;
      playback.tick();
      expect(fake.calls).toEqual([`setVolume(${VOLUME})`, 'resume']);
      expect(playback.currentTime).toBe(0);
    });

    it.each<YouTubePlayerState>(['playing', 'paused', 'buffering'])(
      'ignores %s without calling the player',
      (state) => {
        const { fake, playback } = setup(1000);
        fake.nowMs += 500;
        playback.handleStateChange(state);
        expect(playback.status).toEqual(countdown(3));
        expect(fake.calls).toEqual([]);
      },
    );

    it('shows the digit of the current time before the tick', () => {
      const { fake, playback } = setup(1000);
      fake.nowMs += 1000;
      expect(playback.status).toEqual(countdown(2));
    });

    it('freezes while paused without calling the player and continues after resume', () => {
      const { fake, playback } = setup(1000);
      fake.nowMs += 500;
      playback.pause();
      fake.nowMs += 5000;
      playback.tick();
      expect(playback.status).toEqual(countdown(3));
      expect(playback.currentTime).toBe(1);
      playback.pause();
      playback.resume();
      fake.nowMs += 499;
      playback.resume();
      playback.tick();
      expect(playback.status).toEqual(countdown(3));
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(countdown(2));
      fake.nowMs += 1999;
      playback.tick();
      expect(fake.calls).toEqual([]);
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      expect(fake.calls).toEqual([`setVolume(${VOLUME})`, 'resume']);
    });
  });

  describe('departing', () => {
    it('departs only on the tick where the reported position grows after playing', () => {
      const { fake, playback } = setupDeparting(1000);
      playback.handleStateChange('playing');
      // 예열 때 멈춘 위치를 보고하다가 V 로 내려간 뒤 멈춰 있다.
      for (const positionSec of [1.05, 1.0, 1.0]) {
        fake.nowMs += 50;
        fake.positionSec = positionSec;
        playback.tick();
        expect(playback.status).toEqual(status('waiting'));
        expect(playback.currentTime).toBe(1);
      }
      fake.nowMs += 50;
      fake.positionSec = 1.2;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
      expect(playback.currentTime).toBeCloseTo(1.2);
      fake.nowMs += 100;
      expect(playback.currentTime).toBeCloseTo(1.3);
    });

    it('does not depart while the reported position stays the same after playing', () => {
      const { fake, playback } = setupDeparting(1000);
      fake.positionSec = 1;
      playback.handleStateChange('playing');
      for (let step = 0; step < 5; step += 1) {
        fake.nowMs += 50;
        playback.tick();
        expect(playback.status).toEqual(status('waiting'));
        expect(playback.currentTime).toBe(1);
      }
    });

    it('does not depart on a growing reported position before playing', () => {
      const { fake, playback } = setupDeparting(1000);
      fake.positionSec = 1;
      playback.tick();
      playback.handleStateChange('buffering');
      fake.positionSec = 1.1;
      playback.tick();
      expect(playback.currentTime).toBe(1);
      playback.handleStateChange('playing');
      fake.positionSec = 1.2;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
    });

    it('shows loading after waiting 500ms and running once it departs', () => {
      const { fake, playback } = setupDeparting(1000);
      fake.positionSec = 1;
      fake.nowMs += 499;
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(status('loading'));
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(status('loading'));
      playback.tick();
      expect(playback.status).toEqual(status('loading'));
      fake.positionSec = 1.05;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
    });

    it('does not rewind on buffering', () => {
      const { fake, playback } = setupDeparting(1000);
      playback.handleStateChange('buffering');
      fake.nowMs += 1000;
      playback.tick();
      playback.handleStateChange('playing');
      playback.tick();
      expect(fake.calls).toEqual([]);
    });

    it('goes to the video on ended', () => {
      const { fake, playback } = setupDeparting(1000);
      fake.positionSec = 1;
      playback.handleStateChange('ended');
      expect(playback.status).toEqual(RUNNING);
    });

    it('pauses and resumes the player', () => {
      const { fake, playback } = setupDeparting(1000);
      playback.pause();
      playback.resume();
      expect(fake.calls).toEqual(['pause', 'resume']);
    });
  });

  describe('video', () => {
    it('follows the time source after departing', () => {
      const { fake, playback } = setupVideo(5);
      expect(playback.currentTime).toBeCloseTo(5);
      fake.nowMs += 100;
      expect(playback.currentTime).toBeCloseTo(5.1);
    });

    it('pauses and resumes the player', () => {
      const { fake, playback } = setupVideo(5);
      playback.pause();
      playback.resume();
      expect(fake.calls).toEqual(['pause', 'resume']);
    });

    it('rewinds and counts down from the hold position when the video falls 51ms behind', () => {
      const { fake, playback } = setupVideo(5);
      fake.nowMs += 250;
      fake.positionSec = 5.199;
      playback.tick();
      expect(playback.status).toEqual(countdown(3));
      expect(fake.calls).toEqual(['requestPlay(2.25)', `setVolume(${VOLUME})`]);
      expect(playback.currentTime).toBeCloseTo(5.25);
    });

    it('keeps running when the video is 49ms behind', () => {
      const { fake, playback } = setupVideo(5);
      fake.nowMs += 250;
      fake.positionSec = 5.201;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
      expect(fake.calls).toEqual([]);
    });

    it('holds on paused and departs again only after the reported position grows', () => {
      const { fake, playback } = setupVideo(5);
      fake.nowMs += 200;
      fake.positionSec = 5.1;
      playback.handleStateChange('paused');
      expect(playback.status).toEqual(status('paused'));
      expect(playback.currentTime).toBeCloseTo(5.2);
      fake.nowMs += 1000;
      playback.tick();
      expect(playback.status).toEqual(status('paused'));
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(status('waiting'));
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      fake.nowMs += 50;
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      expect(playback.currentTime).toBeCloseTo(5.2);
      fake.nowMs += 50;
      fake.positionSec = 5.3;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
      expect(playback.currentTime).toBeCloseTo(5.3);
      expect(fake.calls).toEqual([]);
    });

    it('shows loading 500ms after leaving paused', () => {
      const { fake, playback } = setupVideo(5);
      playback.handleStateChange('paused');
      fake.nowMs += 2000;
      playback.handleStateChange('buffering');
      fake.nowMs += 499;
      playback.tick();
      expect(playback.status).toEqual(status('waiting'));
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(status('loading'));
    });
  });

  describe('stall recovery', () => {
    it('mutes and holds at the stop position on buffering', () => {
      const { fake, playback } = setupVideo(5);
      fake.positionSec = 4.9;
      playback.handleStateChange('buffering');
      expect(playback.status).toEqual(status('loading'));
      expect(fake.calls).toEqual(['setVolume(0)']);
      expect(playback.currentTime).toBeCloseTo(5);
      fake.nowMs += 1000;
      playback.tick();
      expect(playback.status).toEqual(status('loading'));
      expect(playback.currentTime).toBeCloseTo(5);
    });

    it.each([
      [10, 7, 3],
      [1.5, 0, 2],
      [0.5, 0, 1],
    ])(
      'rewinds from stop position %d to %d and unmutes when YouTube resumes with digit %d',
      (stopSec, rewindSec, digit) => {
        const { fake, playback } = setupStalled(stopSec);
        fake.nowMs += 800;
        fake.positionSec = stopSec;
        playback.handleStateChange('playing');
        expect(playback.status).toEqual(countdown(digit));
        expect(fake.calls).toEqual([`requestPlay(${rewindSec})`, `setVolume(${VOLUME})`]);
        expect(playback.currentTime).toBeCloseTo(stopSec);
      },
    );

    it('counts down by the reported position once the wall clock has passed', () => {
      const { fake, playback } = setupCatchingUp(10, 7);
      fake.nowMs += 5000;
      const digits = [7.999, 8.0, 8.999, 9.0, 9.999].map((positionSec) => {
        fake.positionSec = positionSec;
        playback.tick();
        return playback.status;
      });
      expect(digits).toEqual([
        countdown(3),
        countdown(2),
        countdown(2),
        countdown(1),
        countdown(1),
      ]);
      expect(playback.currentTime).toBeCloseTo(10);
      fake.positionSec = 10;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
    });

    it('does not finish before the rewind length passes even if the reported position is at the stop', () => {
      const { fake, playback } = setupStalled(10);
      fake.positionSec = 10;
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(countdown(3));
      fake.nowMs += 1000;
      playback.tick();
      expect(playback.status).toEqual(countdown(2));
      fake.nowMs += 1999;
      playback.tick();
      expect(playback.status).toEqual(countdown(1));
      expect(playback.currentTime).toBeCloseTo(10);
      fake.nowMs += 1;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
    });

    it('does not finish while the reported position is before the stop', () => {
      const { fake, playback } = setupCatchingUp(10, 7);
      fake.nowMs += 5000;
      fake.positionSec = 9.999;
      playback.tick();
      playback.tick();
      expect(playback.status).toEqual(countdown(1));
      expect(playback.currentTime).toBeCloseTo(10);
    });

    it('follows the reported position of the finishing tick at 1x after finishing', () => {
      const { fake, playback } = setupCatchingUp(10, 7);
      fake.nowMs += 3000;
      fake.positionSec = 10.02;
      playback.tick();
      expect(playback.status).toEqual(RUNNING);
      expect(playback.currentTime).toBeCloseTo(10.02);
      fake.nowMs += 100;
      expect(playback.currentTime).toBeCloseTo(10.12);
    });

    it('shows loading on buffering during catch-up without rewinding again and counts down on playing', () => {
      const { fake, playback } = setupCatchingUp(10, 7);
      playback.handleStateChange('buffering');
      expect(playback.status).toEqual(status('loading'));
      fake.nowMs += 5000;
      fake.positionSec = 10;
      playback.tick();
      expect(playback.status).toEqual(status('loading'));
      fake.positionSec = 8.5;
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(countdown(2));
      expect(fake.calls).toEqual([]);
    });

    it('shows paused on paused during catch-up and does not finish', () => {
      const { fake, playback } = setupCatchingUp(10, 7);
      fake.nowMs += 5000;
      fake.positionSec = 10;
      playback.handleStateChange('paused');
      expect(playback.status).toEqual(status('paused'));
      playback.tick();
      expect(playback.status).toEqual(status('paused'));
    });

    it('shows paused on paused while stalled', () => {
      const { fake, playback } = setupStalled(5);
      playback.handleStateChange('paused');
      expect(playback.status).toEqual(status('paused'));
      expect(fake.calls).toEqual([]);
      playback.handleStateChange('buffering');
      expect(playback.status).toEqual(status('loading'));
    });

    it('pauses and resumes the player while stalled and catching up', () => {
      const stalled = setupStalled(5);
      stalled.playback.pause();
      stalled.playback.resume();
      expect(stalled.fake.calls).toEqual(['pause', 'resume']);
      const catchingUp = setupCatchingUp(5, 2);
      catchingUp.playback.pause();
      catchingUp.playback.resume();
      expect(catchingUp.fake.calls).toEqual(['pause', 'resume']);
    });

    it('does not rewind on playing after a pause request until resumed', () => {
      const { fake, playback } = setupStalled(5);
      playback.pause();
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(status('loading'));
      expect(fake.calls).toEqual(['pause']);
      playback.resume();
      fake.positionSec = 5;
      playback.handleStateChange('playing');
      expect(playback.status).toEqual(countdown(3));
      expect(fake.calls).toEqual(['pause', 'resume', 'requestPlay(2)', `setVolume(${VOLUME})`]);
    });

    it.each([
      ['stalled', () => setupStalled(5)],
      ['catching up', () => setupCatchingUp(5, 2)],
    ])('returns to the video on ended while %s', (_, setupStage) => {
      const { fake, playback } = setupStage();
      playback.handleStateChange('ended');
      expect(playback.status).toEqual(RUNNING);
      fake.calls.length = 0;
      playback.handleStateChange('buffering');
      expect(playback.status).toEqual(status('loading'));
      expect(fake.calls).toEqual(['setVolume(0)']);
    });
  });

  describe('monotonic position', () => {
    function expectMonotonic(playback: LeadInPlayback, videoStartSec: number) {
      let previousSec = Number.NEGATIVE_INFINITY;
      return () => {
        const currentSec = playback.currentTime;
        expect(currentSec).toBeGreaterThanOrEqual(previousSec);
        expect(currentSec).toBeGreaterThanOrEqual(videoStartSec);
        previousSec = currentSec;
      };
    }

    it('never goes back through countdown, departing and departure', () => {
      const { fake, playback } = setup(1000);
      const check = expectMonotonic(playback, 1);
      // 예열 때 V 를 지나 멈춘 위치를 보고하고 있다.
      fake.positionSec = 1.1;
      check();
      for (let step = 1; step <= 30; step += 1) {
        fake.nowMs += 100;
        playback.tick();
        check();
      }
      playback.handleStateChange('playing');
      for (let step = 1; step <= 20; step += 1) {
        fake.nowMs += 50;
        // 예열 위치를 잠시 보고하다 V 로 내려갔다가, 멈췄다 튄다.
        if (step >= 10) {
          fake.positionSec = 1 + step * 0.05;
        } else {
          fake.positionSec = step < 3 ? 1.1 : 1;
        }
        playback.tick();
        check();
      }
      expect(playback.currentTime).toBeGreaterThan(1);
    });

    it('never goes back from stall through catch-up to the video', () => {
      const { fake, playback } = setupVideo(5);
      const check = expectMonotonic(playback, 0);
      check();
      fake.positionSec = 4.8;
      playback.handleStateChange('buffering');
      check();
      fake.nowMs += 1000;
      fake.positionSec = 5;
      playback.handleStateChange('playing');
      check();
      for (let step = 1; step <= 80; step += 1) {
        fake.nowMs += 50;
        fake.positionSec = 2 + step * 0.05;
        playback.tick();
        check();
      }
      expect(playback.currentTime).toBeGreaterThan(5);
    });

    it('never goes back from a pause through departing to the video', () => {
      const { fake, playback } = setupVideo(5);
      const check = expectMonotonic(playback, 0);
      check();
      fake.nowMs += 200;
      fake.positionSec = 5.1;
      playback.handleStateChange('paused');
      check();
      playback.handleStateChange('playing');
      for (let step = 1; step <= 20; step += 1) {
        fake.nowMs += 50;
        fake.positionSec = step < 8 ? 5.1 : 5.1 + step * 0.05;
        playback.tick();
        check();
      }
      expect(playback.currentTime).toBeGreaterThan(5.2);
    });
  });
});
