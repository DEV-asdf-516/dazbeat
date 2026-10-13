import { describe, expect, it } from 'vitest';
import {
  InvalidPlaySubmissionError,
  parsePlaySubmission,
  type PlaySubmission,
} from '../../src/data/playSubmission.js';
import type { Chart, InputEvent, Lane } from '../../src/rhythm/types.js';

// 재생 시작 1000ms(리드인 2000ms), 채보 offset 20ms.
const song = { gameStartMs: 3000, gameEndMs: 10000 };
const chart: Chart = {
  songId: 'test-song',
  difficulty: 'normal',
  offsetMs: 20,
  notes: [{ type: 'tap', timeMs: 3000, lane: 0 }],
};

// offset 0: 하한 1000 + 0 + 20 − 1000, 상한 10000 + max(20, 130) + 1000.
const MIN_MS = 20;
const MAX_MS = 11130;
// ceil((11130 − 20) / 1000 × 40)
const MAX_EVENTS = 445;

function press(lane: Lane, songTimeMs: number): InputEvent {
  return { lane, kind: 'press', songTimeMs };
}

function release(lane: Lane, songTimeMs: number): InputEvent {
  return { lane, kind: 'release', songTimeMs };
}

function parse(input: unknown): PlaySubmission {
  return parsePlaySubmission(input, song, chart);
}

function expectRejected(input: unknown, path: string): void {
  let caught: unknown;
  try {
    parse(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(InvalidPlaySubmissionError);
  expect(caught).toMatchObject({ path });
}

describe('parsePlaySubmission', () => {
  it('returns only the offset and events, ignoring forged result fields', () => {
    const events = [press(0, 3000), release(0, 3050), press(1, 3100), release(1, 3120)];

    const submission = parse({
      inputOffsetMs: 0,
      events,
      score: 1_000_000,
      counts: { perfect: 99 },
      cleared: true,
      user: 'someone',
    });

    expect(submission).toEqual({ inputOffsetMs: 0, events });
  });

  it.each([-300, 300])('accepts input offset %i', (inputOffsetMs) => {
    expect(parse({ inputOffsetMs, events: [] }).inputOffsetMs).toBe(inputOffsetMs);
  });

  it.each([-301, 301])('rejects input offset %i', (inputOffsetMs) => {
    expectRejected({ inputOffsetMs, events: [] }, 'submission.inputOffsetMs');
  });

  it('accepts events exactly at the lower and upper time bounds', () => {
    const events = [press(0, MIN_MS), release(0, MAX_MS)];

    expect(parse({ inputOffsetMs: 0, events }).events).toEqual(events);
  });

  it('rejects an event 1ms before the lower bound', () => {
    expectRejected(
      { inputOffsetMs: 0, events: [press(0, MIN_MS - 1)] },
      'submission.events[0].songTimeMs',
    );
  });

  it('rejects an event 1ms after the upper bound', () => {
    expectRejected(
      { inputOffsetMs: 0, events: [press(0, MIN_MS), press(0, MAX_MS + 1)] },
      'submission.events[1].songTimeMs',
    );
  });

  it('shifts the bounds by the input offset once it exceeds the bad window', () => {
    // 하한 1000 + 300 + 20 − 1000, 상한 10000 + (300 + 20) + 1000.
    const events = [press(0, 320), release(0, 11320)];

    expect(parse({ inputOffsetMs: 300, events }).events).toEqual(events);
    expectRejected(
      { inputOffsetMs: 300, events: [press(0, 319)] },
      'submission.events[0].songTimeMs',
    );
    expectRejected(
      { inputOffsetMs: 300, events: [press(0, 11321)] },
      'submission.events[0].songTimeMs',
    );
  });

  it('accepts the maximum event count and rejects one more', () => {
    const events = Array.from({ length: MAX_EVENTS }, () => press(0, 3000));

    expect(parse({ inputOffsetMs: 0, events }).events).toHaveLength(MAX_EVENTS);
    expectRejected({ inputOffsetMs: 0, events: [...events, press(0, 3000)] }, 'submission.events');
  });

  it('rejects events going back in time', () => {
    expectRejected(
      { inputOffsetMs: 0, events: [press(0, 3000), release(0, 2999)] },
      'submission.events[1].songTimeMs',
    );
  });

  it('accepts consecutive events at the same time', () => {
    const events = [press(0, 3000), press(1, 3000), release(0, 3000)];

    expect(parse({ inputOffsetMs: 0, events }).events).toEqual(events);
  });

  it('accepts a release without a press and repeated presses', () => {
    const events = [release(2, 2000), press(0, 3000), press(0, 3100), press(0, 3200)];

    expect(parse({ inputOffsetMs: 0, events }).events).toEqual(events);
  });

  it.each<[string, unknown, string]>([
    ['lane 4', { lane: 4, kind: 'press', songTimeMs: 3000 }, 'submission.events[0].lane'],
    ['lane -1', { lane: -1, kind: 'press', songTimeMs: 3000 }, 'submission.events[0].lane'],
    ['string lane', { lane: '0', kind: 'press', songTimeMs: 3000 }, 'submission.events[0].lane'],
    ['kind tap', { lane: 0, kind: 'tap', songTimeMs: 3000 }, 'submission.events[0].kind'],
    ['NaN time', { lane: 0, kind: 'press', songTimeMs: NaN }, 'submission.events[0].songTimeMs'],
    [
      'string time',
      { lane: 0, kind: 'press', songTimeMs: '3000' },
      'submission.events[0].songTimeMs',
    ],
    ['missing time', { lane: 0, kind: 'press' }, 'submission.events[0].songTimeMs'],
    [
      'extra field',
      { lane: 0, kind: 'press', songTimeMs: 3000, judged: 1 },
      'submission.events[0]',
    ],
  ])('rejects an event with %s', (_, event, path) => {
    expectRejected({ inputOffsetMs: 0, events: [event] }, path);
  });

  it('rejects events that are not an array', () => {
    expectRejected({ inputOffsetMs: 0, events: { 0: press(0, 3000) } }, 'submission.events');
  });

  it.each([null, 'submission', 42, []])('rejects a body that is not an object: %j', (input) => {
    expectRejected(input, 'submission');
  });
});
