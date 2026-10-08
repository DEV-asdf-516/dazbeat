import { describe, expect, it } from 'vitest';
import {
  JUDGMENT_WINDOWS,
  countJudgments,
  judgeHoldRelease,
  judgeTap,
} from '../../src/rhythm/judgment.js';
import type { Note } from '../../src/rhythm/types.js';

describe('judgeTap', () => {
  const noteTimeMs = 10_000;

  it.each([
    [40, 'perfect'],
    [41, 'great'],
    [80, 'great'],
    [81, 'good'],
    [100, 'good'],
    [101, 'bad'],
    [130, 'bad'],
    [131, 'miss'],
  ] as const)('judges an input %ims late or early as %s', (offsetMs, expected) => {
    expect(judgeTap(noteTimeMs, noteTimeMs + offsetMs, JUDGMENT_WINDOWS)).toBe(expected);
    expect(judgeTap(noteTimeMs, noteTimeMs - offsetMs, JUDGMENT_WINDOWS)).toBe(expected);
  });
});

describe('judgeHoldRelease', () => {
  const endTimeMs = 5_000;

  it('judges a release exactly badMs before the end as perfect', () => {
    expect(judgeHoldRelease(endTimeMs, endTimeMs - 130, JUDGMENT_WINDOWS)).toBe('perfect');
  });

  it('judges a release 1ms earlier than that as miss', () => {
    expect(judgeHoldRelease(endTimeMs, endTimeMs - 131, JUDGMENT_WINDOWS)).toBe('miss');
  });

  it('judges a release after the end as perfect', () => {
    expect(judgeHoldRelease(endTimeMs, endTimeMs + 500, JUDGMENT_WINDOWS)).toBe('perfect');
  });
});

describe('countJudgments', () => {
  it('counts a tap as one judgment and a hold as two', () => {
    const notes: Note[] = [
      { type: 'tap', timeMs: 0, lane: 0 },
      { type: 'tap', timeMs: 100, lane: 1 },
      { type: 'hold', timeMs: 200, endTimeMs: 400, lane: 2 },
    ];
    expect(countJudgments(notes)).toBe(4);
  });

  it('returns 0 for an empty chart', () => {
    expect(countJudgments([])).toBe(0);
  });
});
