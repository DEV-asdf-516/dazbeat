import { describe, expect, it } from 'vitest';
import { LeadInPlayback, getPreRollStartMs } from '../../src/audio/LeadInPlayback.js';
import type { PlaybackFailure, PlaybackStatus } from '../../src/audio/LeadInPlayback.js';
import { requireDefined } from '../../src/invariant.js';
import { msToSec, secToMs } from '../../src/time.js';

const VOLUME = 0.6;
const START_SEC = 1;
const PRE_ROLL_START_MS = -2000;
const FRAME_MS = 16;
const REPORT_INTERVAL_MS = 265;
const SEEK_DELAY_MS = 250;
// 오디오 출력이 처음 켜질 때의 정체.
const RESUME_DELAY_MS = 300;

// fromAtMs 전에는 fromSec 에 멈춰 있고, 재생 중이면 그 뒤로 1배속으로 흐르는 영상.
interface Video {
  readonly fromAtMs: number;
  readonly fromSec: number;
  readonly isPlaying: boolean;
}

interface Fake {
  nowMs: number;
  readonly calls: string[];
  // 요청 위치로 seek 할 때의 시계 값. 곡 시작 seek 가 어느 프레임에 나갔는지 본다.
  readonly seekClocks: number[];
  video: Video;
  isReporting: boolean;
  nextReportAtMs: number;
  seekDelayFor: (clockSec: number) => number;
  readonly statusChanges: PlaybackStatus[];
  readonly failures: PlaybackFailure[];
  resyncFailureCount: number;
}

interface Context {
  readonly fake: Fake;
  readonly playback: LeadInPlayback;
}

function getPositionSec(video: Video, atMs: number): number {
  return video.isPlaying && atMs > video.fromAtMs
    ? video.fromSec + msToSec(atMs - video.fromAtMs)
    : video.fromSec;
}

// 선버퍼링이 끝나 시작 위치에서 일시정지·음소거된 플레이어를 이어받은 직후.
function setup(
  plan: {
    readonly playbackStartMs?: number;
    readonly preRollStartMs?: number;
    readonly volume?: number;
  } = {},
): Context {
  const fake: Fake = {
    nowMs: 1000,
    calls: [],
    seekClocks: [],
    video: {
      fromAtMs: 0,
      fromSec: msToSec(plan.playbackStartMs ?? secToMs(START_SEC)),
      isPlaying: false,
    },
    isReporting: true,
    nextReportAtMs: 1000,
    seekDelayFor: () => SEEK_DELAY_MS,
    statusChanges: [],
    failures: [],
    resyncFailureCount: 0,
  };
  const playback: LeadInPlayback = new LeadInPlayback(
    {
      requestPlay: (fromSec) => {
        fake.calls.push(`requestPlay(${fromSec})`);
        fake.seekClocks.push(playback.currentTime);
        fake.video = {
          fromAtMs: fake.nowMs + fake.seekDelayFor(playback.currentTime),
          fromSec,
          isPlaying: true,
        };
      },
      pause: () => {
        fake.calls.push('pause');
        fake.video = {
          fromAtMs: fake.nowMs,
          fromSec: getPositionSec(fake.video, fake.nowMs),
          isPlaying: false,
        };
      },
      resume: () => {
        fake.calls.push('resume');
        fake.video = {
          fromAtMs: fake.nowMs + RESUME_DELAY_MS,
          fromSec: getPositionSec(fake.video, fake.nowMs),
          isPlaying: true,
        };
      },
      setVolume: (volume) => fake.calls.push(`setVolume(${volume})`),
    },
    () => fake.nowMs,
    {
      playbackStartMs: plan.playbackStartMs ?? secToMs(START_SEC),
      preRollStartMs: plan.preRollStartMs ?? PRE_ROLL_START_MS,
      volume: plan.volume ?? VOLUME,
    },
    {
      onStatusChange: (status) => fake.statusChanges.push(status),
      onFailure: (failure) => fake.failures.push(failure),
      onResyncFailed: () => {
        fake.resyncFailureCount += 1;
      },
    },
  );
  return {
    fake,
    playback,
  };
}

// 16ms 프레임마다 tick 하고, 보고 중이면 약 265ms 마다 영상 위치를 보고한다. 프레임마다 시계 증가량(ms)을 돌려준다.
function advance(ctx: Context, durationMs: number): number[] {
  const { fake, playback } = ctx;
  const deltasMs: number[] = [];
  const endAtMs = fake.nowMs + durationMs;
  while (fake.nowMs + FRAME_MS <= endAtMs) {
    deltasMs.push(stepFrame(ctx));
  }
  fake.nowMs = endAtMs;
  playback.tick();
  return deltasMs;
}

function stepFrame(ctx: Context): number {
  const { fake, playback } = ctx;
  const beforeSec = playback.currentTime;
  fake.nowMs += FRAME_MS;
  if (fake.isReporting && fake.nowMs >= fake.nextReportAtMs) {
    playback.handlePositionReport(getPositionSec(fake.video, fake.nowMs));
    fake.nextReportAtMs = fake.nowMs + REPORT_INTERVAL_MS;
  }
  playback.tick();
  return secToMs(playback.currentTime - beforeSec);
}

function advanceUntil(ctx: Context, isDone: () => boolean, limitMs = 20000): number[] {
  const deltasMs: number[] = [];
  const limitAtMs = ctx.fake.nowMs + limitMs;
  while (!isDone()) {
    if (ctx.fake.nowMs > limitAtMs) {
      throw new Error('condition was not reached');
    }
    deltasMs.push(stepFrame(ctx));
  }
  return deltasMs;
}

function expectFlowing(deltasMs: readonly number[]): void {
  deltasMs.forEach((deltaMs) => expect(deltaMs).toBeCloseTo(FRAME_MS, 6));
}

function expectStopped(deltasMs: readonly number[]): void {
  deltasMs.forEach((deltaMs) => expect(deltaMs).toBe(0));
}

// 보정이 끝나 시계가 프리롤 시작값에서 흐르기 시작한 상태.
function setupPreRoll(plan: Parameters<typeof setup>[0] = {}): Context {
  const ctx = setup(plan);
  advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown');
  ctx.fake.calls.length = 0;
  ctx.fake.seekClocks.length = 0;
  return ctx;
}

// 곡 시작 검증을 통과해 감시 중인 상태.
function setupWatching(plan: Parameters<typeof setup>[0] = {}): Context {
  const ctx = setupPreRoll(plan);
  advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
  advance(ctx, 1000);
  expect(ctx.fake.failures).toEqual([]);
  ctx.fake.calls.length = 0;
  return ctx;
}

// 그 사이 보고·tick 없이 게임 시계가 sec 가 되는 시각으로 옮긴다.
function moveClockTo(ctx: Context, sec: number): void {
  ctx.fake.nowMs += Math.round(secToMs(sec - ctx.playback.currentTime));
}

// 게임 시계가 sec 일 때 일시정지한다. 그 뒤의 호출·상태 변화만 남긴다.
function pauseAt(ctx: Context, sec: number): void {
  advanceUntil(ctx, () => ctx.playback.currentTime + msToSec(FRAME_MS) >= sec);
  moveClockTo(ctx, sec);
  ctx.fake.calls.length = 0;
  ctx.fake.statusChanges.length = 0;
  ctx.playback.pause();
}

function advanceUntilCallCount(ctx: Context, count: number): number[] {
  return advanceUntil(ctx, () => ctx.fake.calls.length >= count);
}

// resumeAtMs 전까지 시계가 T 에 멈춰 있고, 그 뒤 첫 프레임 값이 T + (now − resumeAtMs) 이며 1배속으로 이어지는지 본다.
function expectResumedFrom(ctx: Context, heldSec: number, resumeAtMs: number): void {
  const deltasMs = advanceUntil(ctx, () => ctx.fake.nowMs >= resumeAtMs);
  expectStopped(deltasMs.slice(0, -1));
  expect(ctx.fake.nowMs - resumeAtMs).toBeLessThan(FRAME_MS);
  expect(ctx.playback.currentTime).toBeCloseTo(heldSec + msToSec(ctx.fake.nowMs - resumeAtMs), 9);
  expectFlowing(advance(ctx, 2000));
  expect(ctx.fake.failures).toEqual([]);
}

// 지금 흐르는 영상이 heldSec 에 닿는 시각.
function getVideoReachAtMs(ctx: Context, heldSec: number): number {
  const { video } = ctx.fake;
  return video.fromAtMs + secToMs(heldSec - video.fromSec);
}

function countdown(digit: 1 | 2 | 3) {
  return {
    kind: 'countdown',
    digit,
  };
}

describe('getPreRollStartMs', () => {
  it.each<[number, number | null, number]>([
    [1000, null, -2000],
    [0, null, -3000],
    [-1000, null, -3000],
    [0, -3000, -3000],
    [0, -3001, -3001],
    [0, -2999, -3000],
    // 첫 노트 781ms, 판정선까지 4600ms(느린 스크롤).
    [0, 781 - 4600, -3819],
    // 첫 노트 781ms, 판정선까지 460ms(빠른 스크롤).
    [0, 781 - 460, -3000],
  ])('starts at min(S - 3s, note entry) for start %i and entry %o', (start, entry, expected) => {
    expect(getPreRollStartMs(start, entry)).toBe(expected);
  });
});

describe('LeadInPlayback preparing', () => {
  it('warms up at 1/100 volume and keeps the clock at the pre-roll start until reports show progress', () => {
    const ctx = setup();
    ctx.fake.isReporting = false;

    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume']);
    expect(ctx.playback.status).toEqual({ kind: 'loading' });
    expect(ctx.playback.currentTime).toBe(-2);

    expectStopped(advance(ctx, 2000));
    expect(ctx.playback.currentTime).toBe(-2);
    expect(ctx.playback.status).toEqual({ kind: 'loading' });
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume']);
  });

  it('waits for the cold-start report gap and seeks to calibrate only after a steady pair', () => {
    const ctx = setup({
      playbackStartMs: 0,
      preRollStartMs: -3000,
    });
    ctx.fake.isReporting = false;
    ctx.fake.calls.length = 0;

    ctx.playback.handlePositionReport(0.023);
    expectStopped(advance(ctx, 800));
    ctx.playback.handlePositionReport(0.27);
    expectStopped(advance(ctx, REPORT_INTERVAL_MS));
    expect(ctx.fake.calls).toEqual([]);

    ctx.playback.handlePositionReport(0.54);
    expect(ctx.fake.calls).toEqual(['requestPlay(0)']);

    ctx.fake.isReporting = true;
    ctx.fake.nextReportAtMs = ctx.fake.nowMs + 100;
    expectStopped(advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown').slice(0, -1));
    expect(ctx.playback.currentTime).toBe(-3);

    const deltasMs = advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    deltasMs.push(...advance(ctx, 1000));
    expectFlowing(deltasMs);
    expect(ctx.fake.failures).toEqual([]);
  });

  it('fails to start when preparing takes longer than 10000ms', () => {
    const ctx = setup();
    ctx.fake.isReporting = false;
    const startAtMs = ctx.fake.nowMs;

    ctx.fake.nowMs = startAtMs + 10000;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual([]);

    ctx.fake.nowMs += 1;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual(['startFailed']);
  });

  // 첫 보고 뒤 intervalMs 에 deltaSec 만큼 진행한 보고가 안정 진행이면 보정 seek 가 나간다.
  it.each<[number, number, string[]]>([
    [120, 0.12, ['requestPlay(1)']],
    [119, 0.119, []],
    [625, 0.5625, ['requestPlay(1)']],
    [625, 0.5615, []],
    [625, 0.6875, ['requestPlay(1)']],
    [625, 0.6885, []],
  ])(
    'treats a report pair %ims apart advancing %ds as steady only inside 120ms and 0.9x to 1.1x',
    (intervalMs, deltaSec, expectedCalls) => {
      const ctx = setup();
      ctx.fake.isReporting = false;
      ctx.fake.calls.length = 0;

      ctx.playback.handlePositionReport(0);
      ctx.fake.nowMs += intervalMs;
      ctx.playback.handlePositionReport(deltaSec);

      expect(ctx.fake.calls).toEqual(expectedCalls);
    },
  );

  it('keeps the warm-up and the song start silent when the target volume is 0', () => {
    const ctx = setup({ volume: 0 });
    expect(ctx.fake.calls).toEqual(['setVolume(0)', 'resume']);

    advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    expect(ctx.fake.calls.slice(-2)).toEqual(['requestPlay(1)', 'setVolume(0)']);
  });
});

describe('LeadInPlayback pre-roll and song start', () => {
  it('counts down 3, 2, 1 from the pre-roll start and runs from S', () => {
    const ctx = setupPreRoll();
    expect(ctx.playback.currentTime).toBe(-2);
    expect(ctx.playback.status).toEqual(countdown(3));

    advanceUntil(ctx, () => ctx.playback.currentTime > -1);
    expect(ctx.playback.status).toEqual(countdown(2));
    advanceUntil(ctx, () => ctx.playback.currentTime > 0);
    expect(ctx.playback.status).toEqual(countdown(1));
    advanceUntil(ctx, () => ctx.playback.currentTime >= START_SEC);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
  });

  it('keeps the countdown at 3 while more than 3s remain', () => {
    const ctx = setupPreRoll({ preRollStartMs: -3819 });
    expect(ctx.playback.status).toEqual(countdown(3));

    advance(ctx, 800);
    expect(ctx.playback.status).toEqual(countdown(3));
  });

  it('seeks to S and then raises the volume once on the frame the clock reaches S - d', () => {
    const ctx = setupPreRoll();

    const deltasMs = advanceUntil(ctx, () => ctx.fake.calls.length > 0);
    expect(ctx.fake.calls).toEqual(['requestPlay(1)', 'setVolume(0.6)']);
    const seekClockSec = requireDefined(ctx.fake.seekClocks[0], 'no seek was requested');
    expect(seekClockSec).toBeGreaterThanOrEqual(START_SEC - msToSec(SEEK_DELAY_MS));
    expect(seekClockSec).toBeLessThan(START_SEC - msToSec(SEEK_DELAY_MS - FRAME_MS));

    deltasMs.push(...advance(ctx, 2000));
    expectFlowing(deltasMs);
    expect(ctx.fake.calls).toEqual(['requestPlay(1)', 'setVolume(0.6)']);
  });

  it.each([
    [30, null],
    [-30, null],
    [31, 'startFailed'],
    [-31, 'startFailed'],
  ])('verifies the song start %ims off the planned start as %o', (offsetMs, expected) => {
    const ctx = setupPreRoll();
    ctx.fake.seekDelayFor = (clockSec) => secToMs(START_SEC - clockSec) + offsetMs;

    advanceUntil(ctx, () => ctx.fake.calls.length > 0);
    advance(ctx, 2000);

    expect(ctx.fake.failures).toEqual(expected === null ? [] : [expected]);
  });

  it('keeps the clock flowing through a 0.55s stall after the song start seek and then fails', () => {
    const ctx = setupPreRoll();
    ctx.fake.seekDelayFor = () => 550;

    const deltasMs = advanceUntil(ctx, () => ctx.fake.failures.length > 0);

    expect(ctx.fake.failures).toEqual(['startFailed']);
    expect(ctx.playback.currentTime).toBeGreaterThan(START_SEC);
    expectFlowing(deltasMs.slice(0, -1));
  });

  it('fails to start when no steady progress follows the song start seek within 3000ms', () => {
    const ctx = setupPreRoll();
    advanceUntil(ctx, () => ctx.fake.calls.length > 0);
    ctx.fake.isReporting = false;
    const seekAtMs = ctx.fake.nowMs;

    ctx.fake.nowMs = seekAtMs + 3000;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual([]);
    expect(ctx.playback.status).toEqual({ kind: 'running' });

    ctx.fake.nowMs += 1;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual(['startFailed']);
  });

  it('ignores buffering and playing caused by the song start seek', () => {
    const ctx = setupPreRoll();
    advanceUntil(ctx, () => ctx.fake.calls.length > 0);

    ctx.playback.handleStateChange('buffering');
    ctx.playback.handleStateChange('playing');
    const deltasMs = advance(ctx, 2000);

    expectFlowing(deltasMs);
    expect(ctx.fake.failures).toEqual([]);
  });
});

describe('LeadInPlayback watching', () => {
  function reportDrift(ctx: Context, driftMs: number): void {
    ctx.playback.handlePositionReport(ctx.playback.currentTime + msToSec(driftMs));
  }

  // 보고 없이 afterMs 뒤로 옮겨 편차를 보고한다. 그 사이 게임 시계는 흐른다.
  function reportDriftAfter(ctx: Context, afterMs: number, driftMs: number): void {
    ctx.fake.nowMs += afterMs;
    reportDrift(ctx, driftMs);
  }

  // T = 5 근처에서 보고를 멈추고 감시 중인 상태.
  function setupWatchingAt5(): Context {
    const ctx = setupWatching();
    advanceUntil(ctx, () => ctx.playback.currentTime + msToSec(FRAME_MS) >= 5);
    moveClockTo(ctx, 5);
    ctx.fake.isReporting = false;
    ctx.fake.calls.length = 0;
    ctx.fake.statusChanges.length = 0;
    return ctx;
  }

  function expectRecoveryStarted(ctx: Context, heldSec: number, calls: readonly string[]): void {
    expect(ctx.fake.calls).toEqual(calls);
    expect(ctx.fake.statusChanges).toEqual([{ kind: 'resuming' }]);
    expect(ctx.playback.currentTime).toBe(heldSec);
    expect(ctx.fake.failures).toEqual([]);
    expect(ctx.fake.resyncFailureCount).toBe(0);
  }

  it.each([31, -31])(
    'does nothing while reports %ims off continue for 999ms and recovers at 1000ms',
    (driftMs) => {
      const ctx = setupWatchingAt5();

      reportDrift(ctx, driftMs);
      reportDriftAfter(ctx, 500, driftMs);
      reportDriftAfter(ctx, 499, driftMs);
      expect(ctx.fake.calls).toEqual([]);
      expect(ctx.fake.statusChanges).toEqual([]);

      ctx.fake.nowMs += 1;
      const heldSec = ctx.playback.currentTime;
      reportDrift(ctx, driftMs);
      expectRecoveryStarted(ctx, heldSec, ['setVolume(0.01)']);
      expectStopped(advance(ctx, 500));
    },
  );

  it('treats reports 30ms ahead as tolerated even when the seconds subtraction is inexact', () => {
    const ctx = setupWatchingAt5();
    moveClockTo(ctx, 5);
    expect(ctx.playback.currentTime).toBe(5);
    expect(secToMs(5.03 - 5)).toBeGreaterThan(30);

    ctx.playback.handlePositionReport(5.03);
    moveClockTo(ctx, 6);
    expect(ctx.playback.currentTime).toBe(6);
    ctx.playback.handlePositionReport(6.03);

    expect(ctx.fake.calls).toEqual([]);
    expect(ctx.fake.statusChanges).toEqual([]);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
  });

  it('resumes from T through the lead seek after a recovery from sustained drift', () => {
    const ctx = setupWatchingAt5();
    reportDrift(ctx, 500);
    reportDriftAfter(ctx, 1000, 500);
    const heldSec = ctx.playback.currentTime;
    ctx.fake.isReporting = true;
    ctx.fake.nextReportAtMs = ctx.fake.nowMs;

    advanceUntilCallCount(ctx, 2);
    expect(ctx.fake.calls[1]).toBe(`requestPlay(${heldSec - 3})`);
    expectResumedFrom(ctx, heldSec, getVideoReachAtMs(ctx, heldSec));
    expect(ctx.fake.calls).toHaveLength(3);
    expect(ctx.fake.calls[2]).toBe('setVolume(0.6)');
  });

  it.each([
    [29, 'a report within 30ms'],
    [30, 'a report exactly 30ms off'],
  ])('starts counting again after %ims, %s', (toleratedMs) => {
    const ctx = setupWatchingAt5();

    reportDrift(ctx, 31);
    reportDriftAfter(ctx, 500, toleratedMs);
    reportDriftAfter(ctx, 100, 31);
    reportDriftAfter(ctx, 999, 31);
    expect(ctx.fake.calls).toEqual([]);

    reportDriftAfter(ctx, 1, 31);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
  });

  it('starts counting again from a report whose sign flips', () => {
    const ctx = setupWatchingAt5();

    reportDrift(ctx, 31);
    reportDriftAfter(ctx, 500, -31);
    reportDriftAfter(ctx, 999, -31);
    expect(ctx.fake.calls).toEqual([]);

    reportDriftAfter(ctx, 1, -31);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
  });

  it('never fails or recovers on drift alone that never lasts 1000ms', () => {
    const ctx = setupWatchingAt5();

    for (let count = 0; count < 20; count += 1) {
      reportDriftAfter(ctx, 265, count % 4 === 3 ? 0 : 500);
    }

    expect(ctx.fake.calls).toEqual([]);
    expect(ctx.fake.failures).toEqual([]);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
  });

  it.each<['buffering' | 'paused', string[]]>([
    ['buffering', ['setVolume(0.01)']],
    ['paused', ['setVolume(0.01)', 'resume']],
  ])('stops the clock and recovers on %s reported while watching', (state, calls) => {
    const ctx = setupWatchingAt5();

    ctx.playback.handleStateChange(state);

    expectRecoveryStarted(ctx, 5, calls);
  });

  it('resumes at T through the two seeks to 0 after a recovery started where T − 3s is below 0', () => {
    const ctx = setupWatching({
      playbackStartMs: 0,
      preRollStartMs: -3000,
    });
    advanceUntil(ctx, () => ctx.playback.currentTime + msToSec(FRAME_MS) >= 1.5);
    moveClockTo(ctx, 1.5);
    ctx.fake.statusChanges.length = 0;

    ctx.playback.handleStateChange('buffering');
    expect(ctx.fake.statusChanges).toEqual([{ kind: 'resuming' }]);

    advanceUntilCallCount(ctx, 3);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'requestPlay(0)', 'requestPlay(0)']);
    expectResumedFrom(ctx, 1.5, getVideoReachAtMs(ctx, 1.5));
    expect(ctx.fake.calls).toEqual([
      'setVolume(0.01)',
      'requestPlay(0)',
      'requestPlay(0)',
      'setVolume(0.6)',
    ]);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
    expect(ctx.fake.resyncFailureCount).toBe(0);
  });

  it('stops watching after the video ends while the clock keeps flowing', () => {
    const ctx = setupWatching();
    ctx.fake.isReporting = false;

    ctx.playback.handleStateChange('ended');
    reportDrift(ctx, 500);
    reportDrift(ctx, 500);
    reportDrift(ctx, 500);

    expect(ctx.fake.failures).toEqual([]);
    expectFlowing(advance(ctx, 500));
    expect(ctx.playback.status).toEqual({ kind: 'running' });
  });
});

describe('LeadInPlayback pause', () => {
  it.each([
    ['preparing', (ctx: Context) => ctx],
    ['in the pre-roll', (ctx: Context) => advanceUntil(ctx, () => ctx.playback.currentTime > -1)],
    ['while watching', (ctx: Context) => advanceUntil(ctx, () => ctx.playback.currentTime > 3)],
  ])('stops the clock and the video at once while %s', (_name, reach) => {
    const ctx = setup();
    reach(ctx);
    ctx.fake.calls.length = 0;

    ctx.playback.pause();
    const heldSec = ctx.playback.currentTime;

    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.playback.status).toEqual({ kind: 'paused' });
    expectStopped(advance(ctx, 20000));
    expect(ctx.playback.currentTime).toBe(heldSec);
    expect(ctx.fake.failures).toEqual([]);
  });

  it('ignores a repeated pause and a resume while not paused', () => {
    const ctx = setupWatching();
    ctx.playback.resume();
    expect(ctx.fake.calls).toEqual([]);

    ctx.playback.pause();
    ctx.playback.pause();
    expect(ctx.fake.calls).toEqual(['pause']);
  });
});

describe('LeadInPlayback resuming before the music starts', () => {
  it('calibrates again after a pause in the pre-roll and seeks to S at S − the new delay', () => {
    const ctx = setupPreRoll();
    advance(ctx, 500);
    ctx.playback.pause();
    const heldSec = ctx.playback.currentTime;
    ctx.fake.seekDelayFor = () => 400;
    ctx.fake.calls.length = 0;

    ctx.playback.resume();
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume']);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });

    expectStopped(advanceUntilCallCount(ctx, 3));
    expect(ctx.fake.calls[2]).toBe('requestPlay(1)');
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });

    expectStopped(advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown'));
    expect(ctx.playback.currentTime).toBe(heldSec);

    const deltasMs = advanceUntilCallCount(ctx, 4);
    expect(ctx.fake.calls.slice(3)).toEqual(['requestPlay(1)', 'setVolume(0.6)']);
    const seekClockSec = requireDefined(ctx.fake.seekClocks.at(-1), 'no seek was requested');
    expect(seekClockSec).toBeGreaterThanOrEqual(START_SEC - 0.4);
    expect(seekClockSec).toBeLessThan(START_SEC - msToSec(400 - FRAME_MS));

    deltasMs.push(...advance(ctx, 2000));
    expectFlowing(deltasMs);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
    expect(ctx.fake.failures).toEqual([]);
  });

  it('calibrates again after a pause while preparing', () => {
    const ctx = setup();
    ctx.fake.calls.length = 0;

    ctx.playback.pause();
    advance(ctx, 2000);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 4);
    expect(ctx.fake.calls).toEqual(['pause', 'setVolume(0.01)', 'resume', 'requestPlay(1)']);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });

    advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown');
    expect(ctx.playback.currentTime).toBe(-2);
  });

  it('calibrates again after a pause while the warm-up video buffers', () => {
    const ctx = setupPreRoll();
    advance(ctx, 500);
    ctx.playback.handleStateChange('buffering');
    ctx.playback.pause();
    ctx.fake.calls.length = 0;

    ctx.playback.resume();
    advanceUntilCallCount(ctx, 3);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume', 'requestPlay(1)']);
  });

  it('seeks to S with the clock held when paused after the song start seek and flows at seek + d − (S − T)', () => {
    const ctx = setupPreRoll();
    advanceUntil(ctx, () => ctx.fake.calls.length > 0);
    advance(ctx, 100);
    ctx.playback.pause();
    const heldSec = ctx.playback.currentTime;
    expect(heldSec).toBeLessThan(START_SEC);
    expect(heldSec).toBeGreaterThan(START_SEC - msToSec(SEEK_DELAY_MS));
    advance(ctx, 5000);
    expect(ctx.fake.failures).toEqual([]);
    ctx.fake.calls.length = 0;

    ctx.playback.resume();
    expectStopped(advanceUntilCallCount(ctx, 4));
    const seekAtMs = ctx.fake.nowMs;
    expect(ctx.fake.calls).toEqual([
      'setVolume(0.01)',
      'resume',
      'requestPlay(1)',
      'requestPlay(1)',
      'setVolume(0.6)',
    ]);

    expectResumedFrom(ctx, heldSec, seekAtMs + SEEK_DELAY_MS - secToMs(START_SEC - heldSec));
    expect(ctx.playback.status).toEqual({ kind: 'running' });
    expect(ctx.fake.calls).toHaveLength(5);
  });

  // T < S − d 면 시계가 S − d 에 닿을 때, T ≥ S − d 면 시계를 세운 채 곧바로 곡 시작 seek 를 보낸다.
  it.each([-1, 0, 1])('sends the song start seek by the rule of T = S − d %ims', (offsetMs) => {
    const ctx = setupPreRoll();
    pauseAt(ctx, START_SEC - msToSec(500) + msToSec(offsetMs));
    const heldSec = ctx.playback.currentTime;
    ctx.fake.seekDelayFor = () => 500;
    ctx.fake.seekClocks.length = 0;

    ctx.playback.resume();
    const deltasMs = advanceUntilCallCount(ctx, 6);
    const seekAtMs = ctx.fake.nowMs;
    const songSeekClockSec = requireDefined(ctx.fake.seekClocks.at(-1), 'no seek was requested');

    expect(ctx.fake.calls).toEqual([
      'pause',
      'setVolume(0.01)',
      'resume',
      'requestPlay(1)',
      'requestPlay(1)',
      'setVolume(0.6)',
    ]);
    if (offsetMs < 0) {
      expect(songSeekClockSec).toBeGreaterThanOrEqual(START_SEC - msToSec(500));
      expectFlowing(advance(ctx, 2000));
      expect(ctx.fake.failures).toEqual([]);
    } else {
      expectStopped(deltasMs);
      expect(songSeekClockSec).toBeCloseTo(heldSec, 9);
      expectResumedFrom(ctx, heldSec, seekAtMs + offsetMs);
    }
  });

  it.each([
    [
      'resuming',
      (ctx: Context) => {
        ctx.playback.pause();
        ctx.playback.resume();
      },
    ],
    ['buffering', (ctx: Context) => ctx.playback.handleStateChange('buffering')],
  ])('fails to start when %s waits longer than 10000ms', (_name, interrupt) => {
    const ctx = setupPreRoll();
    ctx.fake.isReporting = false;
    interrupt(ctx);
    const waitFromAtMs = ctx.fake.nowMs;

    ctx.fake.nowMs = waitFromAtMs + 10000;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual([]);

    ctx.fake.nowMs += 1;
    ctx.playback.tick();
    expect(ctx.fake.failures).toEqual(['startFailed']);
  });

  it('stops the pre-roll while the warm-up video buffers and continues after steady progress', () => {
    const ctx = setupPreRoll();
    advance(ctx, 500);

    ctx.playback.handleStateChange('buffering');
    const stoppedSec = ctx.playback.currentTime;
    expect(ctx.playback.status).toEqual({ kind: 'loading' });
    ctx.fake.video = {
      fromAtMs: ctx.fake.nowMs + 1000,
      fromSec: getPositionSec(ctx.fake.video, ctx.fake.nowMs),
      isPlaying: true,
    };

    expectStopped(advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown'));
    expect(ctx.playback.currentTime).toBe(stoppedSec);
    expect(ctx.fake.calls).toEqual([]);
    expectFlowing(advance(ctx, 500));
  });

  it('ignores a repeated resume while waiting for steady progress', () => {
    const ctx = setupPreRoll();
    ctx.playback.pause();
    ctx.playback.resume();
    ctx.fake.calls.length = 0;

    ctx.playback.resume();

    expect(ctx.fake.calls).toEqual([]);
  });
});

describe('LeadInPlayback resuming from T − 3s', () => {
  it('measures the lead video from T − 3s and resumes when it reaches T, raising only the volume', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);

    ctx.playback.resume();
    expect(ctx.fake.calls).toEqual(['pause', 'setVolume(0.01)', 'resume']);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });

    expectStopped(advanceUntilCallCount(ctx, 4));
    expect(ctx.fake.calls[3]).toBe('requestPlay(2)');
    const reachAtMs = getVideoReachAtMs(ctx, 5);
    expect(reachAtMs).toBe(ctx.fake.nowMs + SEEK_DELAY_MS + 3000);

    expectResumedFrom(ctx, 5, reachAtMs);
    expect(ctx.fake.calls).toEqual([
      'pause',
      'setVolume(0.01)',
      'resume',
      'requestPlay(2)',
      'setVolume(0.6)',
    ]);
    expect(ctx.fake.statusChanges).toEqual([
      { kind: 'paused' },
      { kind: 'resuming' },
      countdown(3),
      countdown(2),
      countdown(1),
      { kind: 'running' },
    ]);
  });

  it.each([SEEK_DELAY_MS + 50, SEEK_DELAY_MS + 200, SEEK_DELAY_MS - 100, 1500])(
    'resumes when the video reaches T even if the seek now takes %ims',
    (seekDelayMs) => {
      const ctx = setupWatching();
      pauseAt(ctx, 5);
      ctx.fake.seekDelayFor = () => seekDelayMs;

      ctx.playback.resume();
      advanceUntilCallCount(ctx, 4);

      expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
      expect(ctx.fake.calls).toHaveLength(5);
    },
  );

  it('seeks to 0 once when T − 3s is exactly 0', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 3);

    ctx.playback.resume();
    advanceUntilCallCount(ctx, 4);
    expect(ctx.fake.calls[3]).toBe('requestPlay(0)');

    expectResumedFrom(ctx, 3, getVideoReachAtMs(ctx, 3));
    expect(ctx.fake.calls.filter((call) => call.startsWith('requestPlay'))).toEqual([
      'requestPlay(0)',
    ]);
  });

  it('seeks to 0 twice when T − 3s is just below 0', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 2.999);

    ctx.playback.resume();
    advanceUntilCallCount(ctx, 5);

    expect(ctx.fake.calls.filter((call) => call.startsWith('requestPlay'))).toEqual([
      'requestPlay(0)',
      'requestPlay(0)',
    ]);
  });
});

describe('LeadInPlayback resuming within 3s of the video start', () => {
  // 최초 시작 보정(250ms)과 다른 지연으로 첫 0초 seek 를 재서, 이 재개에서 잰 값을 쓰는지 본다.
  const PROBE_DELAY_MS = 320;
  // 첫 0초 seek 를 기다렸다가 그 seek 의 지연을 바꾼다. 그 실측이 끝나 카운트다운이 시작된 시각을 돌려준다.
  function advanceUntilProbed(ctx: Context, probeDelayMs: number, confirmDelayMs: number): number {
    ctx.fake.seekDelayFor = () => probeDelayMs;
    ctx.playback.resume();
    expectStopped(advanceUntilCallCount(ctx, 4));
    expect(ctx.fake.calls[3]).toBe('requestPlay(0)');
    ctx.fake.seekDelayFor = () => confirmDelayMs;
    expectStopped(advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown'));
    return ctx.fake.nowMs;
  }

  it('sends the second seek to 0 at A − d₁ − T with the delay measured in this resume', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 1.5);

    const probedAtMs = advanceUntilProbed(ctx, 400, 400);
    const resumeAtMs = probedAtMs + 3000;
    expectStopped(advanceUntilCallCount(ctx, 5));
    expect(ctx.fake.calls[4]).toBe('requestPlay(0)');
    expect(ctx.fake.nowMs).toBeGreaterThanOrEqual(resumeAtMs - 400 - 1500);
    expect(ctx.fake.nowMs).toBeLessThan(resumeAtMs - 400 - 1500 + FRAME_MS);
    expect(ctx.fake.calls).toHaveLength(5);

    expectResumedFrom(ctx, 1.5, getVideoReachAtMs(ctx, 1.5));
    expect(ctx.fake.calls.slice(5)).toEqual(['setVolume(0.6)']);
  });

  it.each([
    [1.5, 40],
    [1.5, 200],
    [1.5, 450],
    [0.6, 40],
    [0.6, 200],
    [0.6, 450],
  ])(
    'keeps the clock at T = %ds past the planned A until the second seek, %ims slower, is measured',
    (heldSec, extraDelayMs) => {
      // S = 0 이면 곡 시작 검증 중에 멈춘다. T ≥ S 면 감시 중과 같은 재동기화다.
      const ctx = setupPreRoll({
        playbackStartMs: 0,
        preRollStartMs: -3000,
      });
      pauseAt(ctx, heldSec);

      const plannedAtMs =
        advanceUntilProbed(ctx, PROBE_DELAY_MS, PROBE_DELAY_MS + extraDelayMs) + 3000;
      advanceUntilCallCount(ctx, 5);
      const reachAtMs = getVideoReachAtMs(ctx, heldSec);
      expect(reachAtMs).toBeGreaterThan(plannedAtMs);

      expectResumedFrom(ctx, heldSec, reachAtMs);
      expect(ctx.fake.calls.slice(5)).toEqual(['setVolume(0.6)']);
    },
  );

  it.each([40, -221])(
    'resumes at the planned A for T within 550ms even when the second seek is %ims off',
    (offsetMs) => {
      const ctx = setupPreRoll({
        playbackStartMs: 0,
        preRollStartMs: -3000,
      });
      pauseAt(ctx, 0.1);

      const plannedAtMs = advanceUntilProbed(ctx, PROBE_DELAY_MS, PROBE_DELAY_MS + offsetMs) + 3000;
      const deltasMs = advanceUntil(ctx, () => ctx.fake.nowMs >= plannedAtMs);
      expectStopped(deltasMs.slice(0, -1));
      expect(ctx.playback.currentTime).toBeCloseTo(0.1 + msToSec(ctx.fake.nowMs - plannedAtMs), 9);
      expect(ctx.fake.calls.slice(5)).toEqual(['setVolume(0.6)']);

      // 실측이 계획과 어긋나도 그 순간에는 게임 시계를 고치거나 복구하지 않는다.
      expectFlowing(advance(ctx, 600));
      ctx.fake.isReporting = false;
      expectFlowing(advance(ctx, 2000));
      expect(ctx.fake.calls).toHaveLength(6);
      expect(ctx.fake.failures).toEqual([]);
      expect(ctx.fake.resyncFailureCount).toBe(0);
    },
  );

  it.each([40, -221])(
    'recovers automatically when the second seek stays %ims off for 1000ms after a planned resume',
    (offsetMs) => {
      const ctx = setupPreRoll({
        playbackStartMs: 0,
        preRollStartMs: -3000,
      });
      pauseAt(ctx, 0.1);

      const plannedAtMs = advanceUntilProbed(ctx, PROBE_DELAY_MS, PROBE_DELAY_MS + offsetMs) + 3000;
      advanceUntil(ctx, () => ctx.fake.nowMs >= plannedAtMs);
      expect(ctx.fake.calls.slice(5)).toEqual(['setVolume(0.6)']);

      advanceUntil(ctx, () => ctx.fake.calls.length > 6);
      expect(ctx.fake.calls.slice(5, 7)).toEqual(['setVolume(0.6)', 'setVolume(0.01)']);
      expect(ctx.fake.nowMs - plannedAtMs).toBeGreaterThanOrEqual(1000 - REPORT_INTERVAL_MS);
      expect(ctx.playback.status).toEqual({ kind: 'resuming' });
      expect(ctx.fake.failures).toEqual([]);
      expect(ctx.fake.resyncFailureCount).toBe(0);
    },
  );

  it.each([
    [0.55, 'planned'],
    [0.551, 'measured'],
  ])('treats T = %ds as %s when the second seek is 450ms slower', (heldSec, expected) => {
    const ctx = setupPreRoll({
      playbackStartMs: 0,
      preRollStartMs: -3000,
    });
    pauseAt(ctx, heldSec);

    const plannedAtMs = advanceUntilProbed(ctx, PROBE_DELAY_MS, PROBE_DELAY_MS + 450) + 3000;
    advanceUntilCallCount(ctx, 5);
    const resumeAtMs = expected === 'planned' ? plannedAtMs : getVideoReachAtMs(ctx, heldSec);

    const deltasMs = advanceUntil(ctx, () => ctx.fake.nowMs >= resumeAtMs);
    expectStopped(deltasMs.slice(0, -1));
    expect(ctx.playback.currentTime).toBeCloseTo(heldSec + msToSec(ctx.fake.nowMs - resumeAtMs), 9);
    expect(ctx.fake.calls.slice(5)).toEqual(['setVolume(0.6)']);
  });

  it('never seeks before 0 and does not miss the note right after T', () => {
    const ctx = setupPreRoll({
      playbackStartMs: 0,
      preRollStartMs: -3000,
    });
    pauseAt(ctx, 0.1);
    const heldSec = ctx.playback.currentTime;
    advanceUntilProbed(ctx, PROBE_DELAY_MS, PROBE_DELAY_MS);

    const clockValues: number[] = [];
    advanceUntil(ctx, () => {
      clockValues.push(ctx.playback.currentTime);
      return ctx.playback.status.kind === 'running';
    });
    advance(ctx, 500);

    expect(ctx.fake.calls.filter((call) => call.startsWith('requestPlay'))).toEqual([
      'requestPlay(0)',
      'requestPlay(0)',
    ]);
    expect(Math.min(...clockValues)).toBe(heldSec);
  });
});

describe('LeadInPlayback resuming after the video ended', () => {
  it('counts down 3s without calling the player and flows from T', () => {
    const ctx = setupWatching();
    ctx.playback.handleStateChange('ended');
    advance(ctx, 500);
    ctx.playback.pause();
    const heldSec = ctx.playback.currentTime;
    expect(ctx.fake.calls).toEqual(['pause']);

    ctx.playback.resume();
    const resumeAtMs = ctx.fake.nowMs + 3000;
    expect(ctx.playback.status).toEqual(countdown(3));
    expectResumedFrom(ctx, heldSec, resumeAtMs);
    expect(ctx.playback.status).toEqual({ kind: 'running' });
    expect(ctx.fake.calls).toEqual(['pause']);
  });
});

describe('LeadInPlayback resync plan breaks', () => {
  // T − 3s seek 결과를 실측해 카운트다운 중인 상태.
  function setupMeasured(): Context {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown');
    ctx.fake.calls.length = 0;
    return ctx;
  }

  it.each<['buffering' | 'paused' | 'ended', string[]]>([
    ['buffering', ['setVolume(0.01)']],
    ['paused', ['setVolume(0.01)', 'resume']],
    ['ended', ['setVolume(0.01)']],
  ])('starts over as an automatic recovery on %s before A in a user resume', (state, calls) => {
    const ctx = setupMeasured();
    if (state === 'paused') {
      ctx.fake.video = {
        fromAtMs: ctx.fake.nowMs,
        fromSec: getPositionSec(ctx.fake.video, ctx.fake.nowMs),
        isPlaying: false,
      };
    }

    ctx.playback.handleStateChange(state);
    expect(ctx.fake.calls).toEqual(calls);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });
    expect(ctx.playback.currentTime).toBe(5);
  });

  it('resumes at T after the automatic recovery that followed a buffering before A', () => {
    const ctx = setupMeasured();
    ctx.playback.handleStateChange('buffering');

    advanceUntilCallCount(ctx, 2);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'requestPlay(2)']);
    expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
  });

  it('fails the resync on a buffering before A in an automatic recovery', () => {
    const ctx = setupMeasured();
    ctx.playback.handleStateChange('buffering');
    advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown');
    ctx.fake.calls.length = 0;
    ctx.fake.statusChanges.length = 0;

    ctx.playback.handleStateChange('buffering');

    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.fake.statusChanges).toEqual([{ kind: 'paused' }]);
    expect(ctx.fake.resyncFailureCount).toBe(1);
    expectStopped(advance(ctx, 20000));
    expect(ctx.playback.currentTime).toBe(5);
    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.fake.failures).toEqual([]);
  });

  it('treats a measurement that ends at or after A as a plan break', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 4);
    ctx.fake.isReporting = false;
    const startAtMs = getVideoReachAtMs(ctx, 2);
    ctx.fake.calls.length = 0;

    ctx.fake.nowMs = startAtMs + 3000;
    ctx.playback.handlePositionReport(5);
    ctx.fake.nowMs += REPORT_INTERVAL_MS;
    ctx.playback.handlePositionReport(5 + msToSec(REPORT_INTERVAL_MS));

    expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });
    expect(ctx.playback.currentTime).toBe(5);
  });

  it('ignores states reported before the result of its own seek is measured', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 4);

    ctx.playback.handleStateChange('buffering');
    ctx.playback.handleStateChange('playing');

    expect(ctx.fake.calls).toHaveLength(4);
    expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
  });

  it('ignores states reported before the second seek to 0 is measured', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 1.5);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 5);

    ctx.playback.handleStateChange('buffering');

    expect(ctx.fake.calls).toHaveLength(5);
    expectResumedFrom(ctx, 1.5, getVideoReachAtMs(ctx, 1.5));
  });

  it('starts over when T > 550ms and the second measurement ends after the video passed T', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 1.5);
    ctx.fake.seekDelayFor = () => 300;
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 5);
    ctx.fake.isReporting = false;
    const reachAtMs = getVideoReachAtMs(ctx, 1.5);
    ctx.fake.calls.length = 0;

    ctx.fake.nowMs = reachAtMs - 100;
    ctx.playback.handlePositionReport(getPositionSec(ctx.fake.video, ctx.fake.nowMs));
    ctx.fake.nowMs += REPORT_INTERVAL_MS;
    ctx.playback.handlePositionReport(getPositionSec(ctx.fake.video, ctx.fake.nowMs));
    ctx.playback.tick();

    expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });
    expect(ctx.playback.currentTime).toBe(1.5);
  });
});

describe('LeadInPlayback automatic recovery limit', () => {
  // T = 5 에서 버퍼링해 자동 복구로 다시 흐르기 시작한 상태.
  function setupRecovered(): Context {
    const ctx = setupWatching();
    advanceUntil(ctx, () => ctx.playback.currentTime + msToSec(FRAME_MS) >= 5);
    moveClockTo(ctx, 5);
    ctx.playback.handleStateChange('buffering');
    expect(ctx.playback.status).toEqual({ kind: 'resuming' });
    advanceUntilCallCount(ctx, 2);
    expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
    ctx.fake.calls.length = 0;
    return ctx;
  }

  it.each([
    [9999, 'fails the resync'],
    [10000, 'recovers again'],
  ])(
    'after the clock advanced %ims since the last recovery, a buffering %s',
    (advancedMs, expected) => {
      const ctx = setupRecovered();
      moveClockTo(ctx, 5 + msToSec(advancedMs));
      ctx.fake.statusChanges.length = 0;

      ctx.playback.handleStateChange('buffering');

      if (expected === 'fails the resync') {
        expect(ctx.fake.calls).toEqual(['pause']);
        expect(ctx.fake.statusChanges).toEqual([{ kind: 'paused' }]);
        expect(ctx.fake.resyncFailureCount).toBe(1);
        expectStopped(advance(ctx, 20000));
        expect(ctx.fake.calls).toEqual(['pause']);
      } else {
        expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
        expect(ctx.fake.statusChanges).toEqual([{ kind: 'resuming' }]);
        expect(ctx.fake.resyncFailureCount).toBe(0);
      }
      expect(ctx.fake.failures).toEqual([]);
    },
  );

  it('does not count the time spent in a user pause between recoveries', () => {
    const ctx = setupRecovered();
    moveClockTo(ctx, 8);
    ctx.playback.pause();
    advance(ctx, 20000);
    ctx.playback.resume();
    advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    advance(ctx, 1000);
    ctx.fake.calls.length = 0;

    ctx.playback.handleStateChange('buffering');

    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.fake.resyncFailureCount).toBe(1);
  });

  it('allows an automatic recovery right after a user resume', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    ctx.fake.calls.length = 0;

    ctx.playback.handleStateChange('buffering');

    expect(ctx.fake.calls).toEqual(['setVolume(0.01)']);
    expect(ctx.fake.resyncFailureCount).toBe(0);
  });
});

describe('LeadInPlayback resync deadlines', () => {
  function reportAt(ctx: Context, atMs: number, positionSec: number): void {
    ctx.fake.nowMs = atMs;
    ctx.playback.handlePositionReport(positionSec);
  }

  function expectResyncFailed(ctx: Context, heldSec: number): void {
    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.playback.status).toEqual({ kind: 'paused' });
    expect(ctx.fake.resyncFailureCount).toBe(1);
    expect(ctx.fake.failures).toEqual([]);
    expect(ctx.playback.currentTime).toBe(heldSec);
  }

  it('fails the resync when no steady progress follows the resume request within 10000ms', () => {
    const ctx = setupWatching();
    ctx.fake.isReporting = false;
    pauseAt(ctx, 5);
    ctx.playback.resume();
    const waitFromAtMs = ctx.fake.nowMs;
    ctx.fake.calls.length = 0;

    ctx.fake.nowMs = waitFromAtMs + 10000;
    ctx.playback.tick();
    expect(ctx.fake.resyncFailureCount).toBe(0);

    ctx.fake.nowMs += 1;
    ctx.playback.tick();
    expectResyncFailed(ctx, 5);
  });

  it('fails the resync when no steady progress follows the lead seek within 10000ms', () => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 4);
    ctx.fake.isReporting = false;
    const seekAtMs = ctx.fake.nowMs;
    ctx.fake.calls.length = 0;

    ctx.fake.nowMs = seekAtMs + 10000;
    ctx.playback.tick();
    expect(ctx.fake.resyncFailureCount).toBe(0);

    ctx.fake.nowMs += 1;
    ctx.playback.tick();
    expectResyncFailed(ctx, 5);
  });

  it('fails the resync when the steady report that would end the wait arrives after 10000ms', () => {
    const ctx = setupWatching();
    ctx.fake.isReporting = false;
    pauseAt(ctx, 5);
    ctx.playback.resume();
    const waitFromAtMs = ctx.fake.nowMs;
    ctx.fake.calls.length = 0;

    reportAt(ctx, waitFromAtMs + 100, 5);
    reportAt(ctx, waitFromAtMs + 10001, 14.901);

    expectResyncFailed(ctx, 5);
  });

  it('fails the resync when the automatic recovery waits longer than 10000ms', () => {
    const ctx = setupWatching();
    ctx.fake.isReporting = false;
    ctx.playback.handleStateChange('buffering');
    const heldSec = ctx.playback.currentTime;
    const waitFromAtMs = ctx.fake.nowMs;
    ctx.fake.calls.length = 0;

    reportAt(ctx, waitFromAtMs + 100, 0);
    reportAt(ctx, waitFromAtMs + 10001, 9.901);

    expectResyncFailed(ctx, heldSec);
  });
});

describe('LeadInPlayback resync deadlines within 3s of the video start', () => {
  function reportAt(ctx: Context, atMs: number, positionSec: number): void {
    ctx.fake.nowMs = atMs;
    ctx.playback.handlePositionReport(positionSec);
  }

  // 보고 없이 정해진 번째 0초 seek 의 결과를 기다리는 상태. seekAtMs 는 그 seek 를 보낸 시각이다.
  function setupWaitingOnSeek(
    heldSec: number,
    seekCount: 4 | 5,
  ): { readonly ctx: Context; readonly seekAtMs: number } {
    const ctx = setupPreRoll({
      playbackStartMs: 0,
      preRollStartMs: -3000,
    });
    pauseAt(ctx, heldSec);
    ctx.playback.resume();
    advanceUntilCallCount(ctx, seekCount);
    ctx.fake.isReporting = false;
    const seekAtMs = ctx.fake.nowMs;
    // T ≤ 550ms 면 둘째 seek 확인을 기다리는 채로 계획 시각에 재개한다.
    if (secToMs(heldSec) <= 550) {
      advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    }
    ctx.fake.calls.length = 0;
    return {
      ctx,
      seekAtMs,
    };
  }

  function expectResyncFailedAtNow(ctx: Context): void {
    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.playback.status).toEqual({ kind: 'paused' });
    expect(ctx.fake.resyncFailureCount).toBe(1);
    expect(ctx.fake.failures).toEqual([]);
  }

  const WAITS: [string, number, 4 | 5][] = [
    ['the first seek to 0', 1.5, 4],
    ['the second seek to 0', 1.5, 5],
    ['the second seek to 0 after resuming at the planned A', 0.1, 5],
  ];

  it.each(WAITS)(
    'fails the resync when %s has no steady progress within 10000ms',
    (_name, heldSec, seekCount) => {
      const { ctx, seekAtMs } = setupWaitingOnSeek(heldSec, seekCount);

      ctx.fake.nowMs = seekAtMs + 10000;
      ctx.playback.tick();
      expect(ctx.fake.calls).toEqual([]);
      expect(ctx.fake.resyncFailureCount).toBe(0);

      ctx.fake.nowMs += 1;
      ctx.playback.tick();
      expectResyncFailedAtNow(ctx);
    },
  );

  it.each(WAITS)(
    'accepts a steady report at 10000ms but fails on one at 10001ms while waiting for %s',
    (_name, heldSec, seekCount) => {
      const accepted = setupWaitingOnSeek(heldSec, seekCount);
      reportAt(accepted.ctx, accepted.seekAtMs + 9800, 0);
      reportAt(accepted.ctx, accepted.seekAtMs + 10000, 0.2);
      expect(accepted.ctx.fake.calls).toEqual([]);
      expect(accepted.ctx.fake.resyncFailureCount).toBe(0);

      const late = setupWaitingOnSeek(heldSec, seekCount);
      reportAt(late.ctx, late.seekAtMs + 9801, 0);
      reportAt(late.ctx, late.seekAtMs + 10001, 0.2);
      expectResyncFailedAtNow(late.ctx);
    },
  );
});

describe('LeadInPlayback pause during a resync', () => {
  it.each([
    ['waiting for steady progress', (ctx: Context) => advance(ctx, 100)],
    [
      'counting down to A',
      (ctx: Context) => advanceUntil(ctx, () => ctx.playback.status.kind === 'countdown'),
    ],
  ])('goes back to paused while %s and starts over from the same T', (_name, reach) => {
    const ctx = setupWatching();
    pauseAt(ctx, 5);
    ctx.playback.resume();
    reach(ctx);
    ctx.fake.calls.length = 0;

    ctx.playback.pause();
    expect(ctx.fake.calls).toEqual(['pause']);
    expect(ctx.playback.status).toEqual({ kind: 'paused' });
    expectStopped(advance(ctx, 20000));

    ctx.fake.calls.length = 0;
    ctx.playback.resume();
    advanceUntilCallCount(ctx, 3);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume', 'requestPlay(2)']);
    expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
  });

  it('starts a new user resync from the same T after a resync failure', () => {
    const ctx = setupWatching();
    ctx.fake.isReporting = false;
    pauseAt(ctx, 5);
    ctx.playback.resume();
    advance(ctx, 10001);
    expect(ctx.fake.resyncFailureCount).toBe(1);
    ctx.fake.isReporting = true;
    ctx.fake.calls.length = 0;

    ctx.playback.resume();
    advanceUntilCallCount(ctx, 3);
    expect(ctx.fake.calls).toEqual(['setVolume(0.01)', 'resume', 'requestPlay(2)']);
    expectResumedFrom(ctx, 5, getVideoReachAtMs(ctx, 5));
    expect(ctx.fake.resyncFailureCount).toBe(1);
  });
});

describe('LeadInPlayback deadlines against a late steady report', () => {
  function reportAt(ctx: Context, atMs: number, positionSec: number): void {
    ctx.fake.nowMs = atMs;
    ctx.playback.handlePositionReport(positionSec);
  }

  it('fails to start when the steady report that would finish preparing arrives after 10000ms', () => {
    const ctx = setup();
    ctx.fake.isReporting = false;
    ctx.fake.calls.length = 0;
    const waitFromAtMs = ctx.fake.nowMs;

    reportAt(ctx, waitFromAtMs + 5000, 0);
    reportAt(ctx, waitFromAtMs + 10001, 5.001);

    expect(ctx.fake.failures).toEqual(['startFailed']);
    expect(ctx.fake.calls).toEqual([]);
  });

  it('fails to start when the steady report that would end a pre-roll wait arrives after 10000ms', () => {
    const ctx = setupPreRoll();
    ctx.fake.isReporting = false;
    ctx.playback.handleStateChange('buffering');
    const waitFromAtMs = ctx.fake.nowMs;

    reportAt(ctx, waitFromAtMs + 100, 0);
    reportAt(ctx, waitFromAtMs + 10001, 9.901);

    expect(ctx.fake.failures).toEqual(['startFailed']);
  });

  it('fails the song start when the verifying report on plan arrives after 3000ms', () => {
    const ctx = setupPreRoll();
    ctx.fake.isReporting = false;
    ctx.playback.handlePositionReport(5);
    advanceUntil(ctx, () => ctx.fake.calls.length > 0);
    const seekAtMs = ctx.fake.nowMs;
    const startAtMs =
      seekAtMs +
      secToMs(START_SEC - requireDefined(ctx.fake.seekClocks[0], 'no seek was requested'));

    reportAt(ctx, startAtMs + 100, START_SEC + 0.1);
    reportAt(ctx, seekAtMs + 3001, START_SEC + msToSec(seekAtMs + 3001 - startAtMs));

    expect(ctx.fake.failures).toEqual(['startFailed']);
  });
});

describe('LeadInPlayback failure', () => {
  it('stops the clock and ignores later calls', () => {
    const ctx = setup();
    ctx.fake.isReporting = false;
    advance(ctx, 10001);
    expect(ctx.fake.failures).toEqual(['startFailed']);
    ctx.fake.calls.length = 0;
    ctx.fake.statusChanges.length = 0;

    ctx.playback.pause();
    ctx.playback.resume();
    ctx.playback.handleStateChange('playing');
    ctx.playback.handlePositionReport(1);
    ctx.fake.isReporting = true;
    expectStopped(advance(ctx, 1000));

    expect(ctx.fake.calls).toEqual([]);
    expect(ctx.fake.statusChanges).toEqual([]);
    expect(ctx.fake.failures).toEqual(['startFailed']);
  });
});

describe('LeadInPlayback status changes', () => {
  it('notifies each countdown digit and the run once, in order', () => {
    const ctx = setup();

    advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    advance(ctx, 1000);

    expect(ctx.fake.statusChanges).toEqual([
      countdown(3),
      countdown(2),
      countdown(1),
      { kind: 'running' },
    ]);
  });

  it('notifies a pause within the call and only once, then resuming, the countdown and the run', () => {
    const ctx = setupWatching();
    ctx.fake.statusChanges.length = 0;

    ctx.playback.pause();
    expect(ctx.fake.statusChanges).toEqual([{ kind: 'paused' }]);
    ctx.playback.pause();
    ctx.playback.resume();
    expect(ctx.fake.statusChanges).toEqual([{ kind: 'paused' }, { kind: 'resuming' }]);

    advanceUntil(ctx, () => ctx.playback.status.kind === 'running');
    expect(ctx.fake.statusChanges).toEqual([
      { kind: 'paused' },
      { kind: 'resuming' },
      countdown(3),
      countdown(2),
      countdown(1),
      { kind: 'running' },
    ]);
  });
});
