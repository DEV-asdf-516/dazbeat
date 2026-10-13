import { describe, expect, it } from 'vitest';
import { replayGameplay } from '../../src/rhythm/replay.js';
import type { Chart, InputEvent, Lane, Note } from '../../src/rhythm/types.js';
import { getLastJudgmentDeadlineMs, simulateClientPlay } from './playSimulation.js';

const FRAME_SEEDS = [1, 7, 42, 2024, 99991];
const MAX_FRAME_STEP_MS = 40;

/** mulberry32: 고정 시드로 재현 가능한 [0, 1) 난수. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 부터 판정 마감까지 1~MAX_FRAME_STEP_MS 간격의 무작위 프레임 시각. */
function makeFrameTimes(chart: Chart, seed: number): number[] {
  const random = createRandom(seed);
  const endMs = getLastJudgmentDeadlineMs(chart);
  const frameTimesMs: number[] = [];
  for (let timeMs = 0; timeMs <= endMs; timeMs += 1 + Math.floor(random() * MAX_FRAME_STEP_MS)) {
    frameTimesMs.push(timeMs);
  }
  return frameTimesMs;
}

function makeChart(notes: Note[]): Chart {
  return { songId: 'test-song', difficulty: 'easy', offsetMs: 0, notes };
}

function press(lane: Lane, songTimeMs: number): InputEvent {
  return { lane, kind: 'press', songTimeMs };
}

function release(lane: Lane, songTimeMs: number): InputEvent {
  return { lane, kind: 'release', songTimeMs };
}

function tap(lane: Lane, timeMs: number): Note {
  return { type: 'tap', timeMs, lane };
}

function hold(lane: Lane, timeMs: number, endTimeMs: number): Note {
  return { type: 'hold', timeMs, endTimeMs, lane };
}

function expectReplayMatchesClient(chart: Chart, inputs: readonly InputEvent[]): void {
  const schedules = [[], ...FRAME_SEEDS.map((seed) => makeFrameTimes(chart, seed))];
  const plays = schedules.map((frameTimesMs) => simulateClientPlay(chart, inputs, frameTimesMs));
  const [first, ...rest] = plays;
  if (first === undefined) {
    throw new Error('No client play');
  }
  for (const play of rest) {
    expect(play).toEqual(first);
  }
  for (const play of plays) {
    expect(replayGameplay(chart, play.inputs)).toEqual(play.result);
  }
}

describe('replayGameplay', () => {
  it('matches the client for a tap-only chart', () => {
    const chart = makeChart([
      tap(0, 1000),
      tap(1, 1000),
      tap(2, 1250),
      tap(3, 1500),
      tap(0, 1700),
      tap(1, 2000),
    ]);

    expectReplayMatchesClient(chart, [
      press(0, 1010),
      release(0, 1060),
      press(1, 1090),
      release(1, 1120),
      press(3, 1560),
      release(3, 1600),
      press(1, 2120),
      release(1, 2140),
    ]);
  });

  it('matches the client for a hold-only chart with held, early and end-window releases', () => {
    const chart = makeChart([
      hold(0, 1000, 2000),
      hold(1, 1200, 1800),
      hold(2, 1500, 2500),
      hold(3, 2600, 3400),
      hold(0, 3000, 3500),
    ]);

    expectReplayMatchesClient(chart, [
      press(0, 1000),
      press(1, 1230),
      release(1, 1500),
      press(2, 1460),
      release(2, 2500 - 130),
      release(0, 2100),
      press(3, 2600),
      release(3, 3400 - 131),
      press(0, 3010),
    ]);
  });

  it('matches the client for a mixed chart', () => {
    const chart = makeChart([
      tap(0, 1000),
      hold(1, 1000, 1600),
      tap(2, 1100),
      tap(0, 1300),
      hold(3, 1400, 2200),
      tap(2, 1800),
      tap(0, 2000),
    ]);

    expectReplayMatchesClient(chart, [
      press(0, 980),
      release(0, 1000),
      press(1, 1050),
      press(2, 1190),
      release(2, 1200),
      press(3, 1420),
      release(1, 1620),
      press(2, 1790),
      release(2, 1810),
      release(3, 2050),
    ]);
  });

  it('matches the client at judgment window boundaries ±1ms', () => {
    const offsetsMs = [40, 41, -80, -81, 100, 101, 130, -130, 131, -131];
    const chart = makeChart(offsetsMs.map((_, index) => tap(0, 1000 + index * 1000)));

    expectReplayMatchesClient(
      chart,
      offsetsMs.flatMap((offsetMs, index) => {
        const timeMs = 1000 + index * 1000 + offsetMs;
        return [press(0, timeMs), release(0, timeMs + 5)];
      }),
    );
  });

  it('matches the client for a hold completion and a miss at the same judgment time', () => {
    const chart = makeChart([tap(0, 970), hold(2, 1000, 1100), tap(1, 1200)]);

    expectReplayMatchesClient(chart, [press(2, 1000), press(1, 1200)]);
  });

  it('matches the client for a play that fails at hp 0', () => {
    const chart = makeChart([
      ...Array.from({ length: 12 }, (_, index) => tap(0, 1000 + index * 100)),
      tap(1, 3000),
    ]);

    expectReplayMatchesClient(chart, [press(0, 1000), release(0, 1020), press(1, 3000)]);
  });

  it('matches the client for releases without a press, repeated presses and presses during a hold', () => {
    const chart = makeChart([hold(1, 1000, 2000), tap(1, 2300), tap(2, 1500)]);

    expectReplayMatchesClient(chart, [
      release(1, 500),
      release(3, 800),
      press(1, 1000),
      press(1, 1200),
      press(2, 1490),
      press(2, 1500),
      release(1, 2100),
      press(1, 2300),
      press(1, 2310),
    ]);
  });

  it('matches the client when the clock goes backwards between inputs', () => {
    const chart = makeChart([tap(0, 1000), tap(1, 1000), tap(2, 1200)]);

    const play = simulateClientPlay(
      chart,
      [press(0, 1050), press(1, 1000), press(2, 1100)],
      makeFrameTimes(chart, 3),
    );

    expect(play.inputs).toEqual([press(0, 1050), press(1, 1050), press(2, 1100)]);
    expect(replayGameplay(chart, play.inputs)).toEqual(play.result);
  });

  it('settles notes that are still pending or held at the end of the inputs', () => {
    const chart = makeChart([hold(0, 1000, 2000), tap(1, 1500)]);

    expect(replayGameplay(chart, [press(0, 1000)])).toEqual({
      score: 2000,
      accuracy: 2 / 3,
      maxCombo: 1,
      counts: { perfect: 2, great: 0, good: 0, bad: 0, miss: 1 },
      outcome: 'finished',
      cleared: false,
    });
  });
});
