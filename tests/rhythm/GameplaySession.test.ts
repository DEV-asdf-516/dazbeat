import { describe, expect, it } from 'vitest';
import { GameplaySession } from '../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../src/rhythm/judgment.js';
import type { Chart, Note } from '../../src/rhythm/types.js';

function makeChart(notes: Note[]): Chart {
  return { songId: 'test-song', difficulty: 'easy', offsetMs: 0, notes };
}

function makeSession(notes: Note[]): GameplaySession {
  return new GameplaySession(makeChart(notes), JUDGMENT_WINDOWS);
}

const emptyCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

describe('GameplaySession.press', () => {
  it('judges the closest pending note and leaves earlier notes pending until they auto-miss', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1100, lane: 0 },
    ]);

    expect(session.press(0, 1080)).toEqual({
      noteIndex: 1,
      lane: 0,
      kind: 'tap',
      judgment: 'perfect',
    });
    expect(session.getNoteStatus(1)).toBe('hit');
    expect(session.getNoteStatus(0)).toBe('pending');

    expect(session.update(1131)).toEqual([
      { noteIndex: 0, lane: 0, kind: 'tap', judgment: 'miss' },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
  });

  it('ignores a press outside the window without changing state or other lanes', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1000, lane: 1 },
    ]);

    expect(session.press(0, 869)).toBeNull();
    expect(session.press(0, 1131)).toBeNull();
    expect(session.getState()).toEqual({
      score: 0,
      combo: 0,
      maxCombo: 0,
      counts: emptyCounts,
      hp: 100,
    });
    expect(session.getNoteStatus(0)).toBe('pending');
    expect(session.getNoteStatus(1)).toBe('pending');
  });

  it('does not re-judge an already judged note', () => {
    const session = makeSession([{ type: 'tap', timeMs: 1000, lane: 2 }]);

    expect(session.press(2, 1000)).not.toBeNull();
    expect(session.press(2, 1010)).toBeNull();
    expect(session.getState().counts).toEqual({ ...emptyCounts, perfect: 1 });
  });
});

describe('GameplaySession BAD judgment', () => {
  it.each([101, 130, -101, -130])('judges a press %ims from the note as bad', (offsetMs) => {
    const session = makeSession([{ type: 'tap', timeMs: 1000, lane: 0 }]);

    expect(session.press(0, 1000 + offsetMs)).toEqual({
      noteIndex: 0,
      lane: 0,
      kind: 'tap',
      judgment: 'bad',
    });
    expect(session.getState()).toEqual({
      score: 100,
      combo: 0,
      maxCombo: 0,
      counts: { ...emptyCounts, bad: 1 },
      hp: 95,
    });
  });

  it('resets the combo on bad', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1500, lane: 0 },
    ]);
    session.press(0, 1000);
    expect(session.getState().combo).toBe(1);

    session.press(0, 1610);
    expect(session.getState()).toMatchObject({ combo: 0, maxCombo: 1 });
  });
});

describe('GameplaySession.update auto miss', () => {
  it('misses a tap only once the good window has passed', () => {
    const session = makeSession([{ type: 'tap', timeMs: 1000, lane: 3 }]);

    expect(session.update(1130)).toEqual([]);
    expect(session.getNoteStatus(0)).toBe('pending');
    expect(session.update(1131)).toEqual([
      { noteIndex: 0, lane: 3, kind: 'tap', judgment: 'miss' },
    ]);
    expect(session.getState().combo).toBe(0);
    expect(session.update(2000)).toEqual([]);
  });

  it('resets the combo on miss', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1200, lane: 0 },
    ]);
    session.press(0, 1000);
    expect(session.getState().combo).toBe(1);

    session.update(1331);
    expect(session.getState()).toMatchObject({ combo: 0, maxCombo: 1 });
  });
});

describe('GameplaySession hold notes', () => {
  const hold: Note = { type: 'hold', timeMs: 1000, endTimeMs: 2000, lane: 1 };

  it('starts holding on press and succeeds when update reaches the end', () => {
    const session = makeSession([hold]);

    expect(session.press(1, 1000)).toEqual({
      noteIndex: 0,
      lane: 1,
      kind: 'holdStart',
      judgment: 'perfect',
    });
    expect(session.getNoteStatus(0)).toBe('holding');
    expect(session.update(1999)).toEqual([]);
    expect(session.update(2000)).toEqual([
      { noteIndex: 0, lane: 1, kind: 'holdEnd', judgment: 'perfect' },
    ]);
    expect(session.getNoteStatus(0)).toBe('hit');
    expect(session.release(1, 2010)).toBeNull();
  });

  it('judges a release inside the end window as perfect', () => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.release(1, 2000 - 130)).toEqual({
      noteIndex: 0,
      lane: 1,
      kind: 'holdEnd',
      judgment: 'perfect',
    });
    expect(session.getNoteStatus(0)).toBe('hit');
  });

  it('misses an early release', () => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.release(1, 2000 - 131)).toEqual({
      noteIndex: 0,
      lane: 1,
      kind: 'holdEnd',
      judgment: 'miss',
    });
    expect(session.getNoteStatus(0)).toBe('missed');
    expect(session.getState()).toEqual({
      score: 1000,
      combo: 0,
      maxCombo: 1,
      counts: { ...emptyCounts, perfect: 1, miss: 1 },
      hp: 90,
    });
  });

  it('misses both start and end when the hold is never pressed', () => {
    const session = makeSession([hold]);

    expect(session.update(1131)).toEqual([
      { noteIndex: 0, lane: 1, kind: 'holdStart', judgment: 'miss' },
      { noteIndex: 0, lane: 1, kind: 'holdEnd', judgment: 'miss' },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
    expect(session.getState().counts).toEqual({ ...emptyCounts, miss: 2 });
  });

  it('ignores a press on the same lane while holding', () => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.press(1, 1050)).toBeNull();
    expect(session.getNoteStatus(0)).toBe('holding');
  });

  it('returns null when releasing without a holding note', () => {
    const session = makeSession([hold]);

    expect(session.release(1, 1000)).toBeNull();
  });
});

describe('GameplaySession.update ordering', () => {
  it('applies judgments by judgment time then lane and reflects that order in maxCombo', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'hold', timeMs: 1000, endTimeMs: 1100, lane: 2 },
      { type: 'tap', timeMs: 1050, lane: 3 },
      { type: 'tap', timeMs: 1050, lane: 1 },
    ]);
    session.press(2, 1000);

    // lane 0 tap MISS at 1130, lane 2 hold success at 1100, lanes 1/3 tap MISS at 1180.
    expect(session.update(1200)).toEqual([
      { noteIndex: 1, lane: 2, kind: 'holdEnd', judgment: 'perfect' },
      { noteIndex: 0, lane: 0, kind: 'tap', judgment: 'miss' },
      { noteIndex: 3, lane: 1, kind: 'tap', judgment: 'miss' },
      { noteIndex: 2, lane: 3, kind: 'tap', judgment: 'miss' },
    ]);
    expect(session.getState()).toMatchObject({ combo: 0, maxCombo: 2 });
  });

  it('keeps hold miss start before end when ordering across lanes', () => {
    const session = makeSession([
      { type: 'hold', timeMs: 1000, endTimeMs: 1500, lane: 1 },
      { type: 'tap', timeMs: 1000, lane: 0 },
    ]);

    expect(session.update(1131).map((event) => [event.lane, event.kind])).toEqual([
      [0, 'tap'],
      [1, 'holdStart'],
      [1, 'holdEnd'],
    ]);
  });
});

describe('GameplaySession state and result', () => {
  it('accumulates score, combo, maxCombo and counts and returns state copies', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1000, lane: 1 },
      { type: 'tap', timeMs: 1000, lane: 2 },
    ]);
    session.press(0, 1000);
    session.press(1, 1060);
    session.press(2, 1100);

    const state = session.getState();
    expect(state).toEqual({
      score: 2000,
      combo: 3,
      maxCombo: 3,
      counts: { perfect: 1, great: 1, good: 1, bad: 0, miss: 0 },
      hp: 100,
    });

    state.score = 0;
    state.counts.perfect = 99;
    expect(session.getState()).toEqual({
      score: 2000,
      combo: 3,
      maxCombo: 3,
      counts: { perfect: 1, great: 1, good: 1, bad: 0, miss: 0 },
      hp: 100,
    });
  });

  it('finishes only after every note is judged and computes the result', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'hold', timeMs: 1000, endTimeMs: 1500, lane: 1 },
      { type: 'tap', timeMs: 2000, lane: 0 },
    ]);

    expect(session.isFinished()).toBe(false);
    expect(() => session.getResult()).toThrow(Error);

    session.press(0, 1000);
    session.press(1, 1000);
    expect(session.isFinished()).toBe(false);
    session.update(1500);
    expect(session.isFinished()).toBe(false);
    expect(() => session.getResult()).toThrow(Error);

    session.update(2131);
    expect(session.isFinished()).toBe(true);
    expect(session.getResult()).toEqual({
      score: 3000,
      accuracy: 0.75,
      maxCombo: 3,
      counts: { perfect: 3, great: 0, good: 0, bad: 0, miss: 1 },
      outcome: 'finished',
      cleared: true,
    });
  });

  it('reports an uncleared result below the clear accuracy', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'tap', timeMs: 1000, lane: 1 },
    ]);
    session.press(0, 1000);
    session.update(1131);

    expect(session.getResult()).toMatchObject({
      outcome: 'finished',
      accuracy: 0.5,
      cleared: false,
    });
  });

  it('throws for an out-of-range note index', () => {
    const session = makeSession([{ type: 'tap', timeMs: 1000, lane: 0 }]);

    expect(() => session.getNoteStatus(-1)).toThrow(Error);
    expect(() => session.getNoteStatus(1)).toThrow(Error);
  });

  it('does not modify the original chart', () => {
    const chart = makeChart([
      { type: 'tap', timeMs: 1000, lane: 0 },
      { type: 'hold', timeMs: 1000, endTimeMs: 1500, lane: 1 },
      { type: 'tap', timeMs: 1200, lane: 0 },
    ]);
    const snapshot = structuredClone(chart);
    const session = new GameplaySession(chart, JUDGMENT_WINDOWS);

    session.press(0, 1000);
    session.press(1, 1000);
    session.release(1, 1200);
    session.update(2000);

    expect(chart).toEqual(snapshot);
  });
});

/** lane 0 에 100ms 간격으로 놓인 TAP 들. 누르지 않으면 각각 MISS(−10)가 된다. */
function makeTaps(count: number, startMs = 1000): Note[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'tap' as const,
    timeMs: startMs + index * 100,
    lane: 0 as const,
  }));
}

describe('GameplaySession STARLIGHT hp', () => {
  it('starts at 100 and loses 10 on a tap miss', () => {
    const session = makeSession([{ type: 'tap', timeMs: 1000, lane: 0 }]);
    expect(session.getState().hp).toBe(100);

    session.update(1131);
    expect(session.getState().hp).toBe(90);
  });

  it('loses 20 for a hold that is never pressed', () => {
    const session = makeSession([{ type: 'hold', timeMs: 1000, endTimeMs: 2000, lane: 1 }]);

    session.update(1131);
    expect(session.getState().hp).toBe(80);
  });

  it('applies the start judgment and a miss when a hold is released early', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 500, lane: 0 },
      { type: 'hold', timeMs: 1000, endTimeMs: 2000, lane: 1 },
    ]);
    session.update(631);
    expect(session.getState().hp).toBe(90);

    session.press(1, 1050);
    expect(session.getState().hp).toBe(90.5);
    session.release(1, 1500);
    expect(session.getState().hp).toBe(80.5);
  });

  it('keeps hp on good', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 500, lane: 0 },
      { type: 'tap', timeMs: 1000, lane: 1 },
    ]);
    session.update(631);

    session.press(1, 1100);
    expect(session.getState()).toMatchObject({
      hp: 90,
      counts: { ...emptyCounts, good: 1, miss: 1 },
    });
  });
});

describe('GameplaySession failure', () => {
  it('fails on the judgment that brings hp to exactly 0 and reports that event', () => {
    const session = makeSession(makeTaps(11));

    session.update(1131 + 8 * 100);
    expect(session.getState().hp).toBe(10);
    expect(session.isFailed()).toBe(false);

    expect(session.update(1131 + 9 * 100)).toEqual([
      { noteIndex: 9, lane: 0, kind: 'tap', judgment: 'miss' },
    ]);
    expect(session.isFailed()).toBe(true);
    expect(session.getState()).toMatchObject({ hp: 0, counts: { ...emptyCounts, miss: 10 } });
  });

  it('stops applying candidates after the failing event in one update batch', () => {
    const session = makeSession([
      ...makeTaps(9),
      { type: 'tap', timeMs: 2000, lane: 1 },
      { type: 'tap', timeMs: 2000, lane: 2 },
    ]);

    const events = session.update(3000);
    expect(events).toHaveLength(10);
    expect(events.at(-1)).toEqual({ noteIndex: 9, lane: 1, kind: 'tap', judgment: 'miss' });
    expect(session.isFailed()).toBe(true);
    expect(session.getState().counts).toEqual({ ...emptyCounts, miss: 10 });
    expect(session.getNoteStatus(10)).toBe('pending');
  });

  it('ignores press, release and update after failing without changing state', () => {
    const session = makeSession([
      { type: 'hold', timeMs: 500, endTimeMs: 5000, lane: 1 },
      ...makeTaps(10),
      { type: 'tap', timeMs: 3000, lane: 2 },
    ]);
    session.press(1, 500);
    session.update(1131 + 9 * 100);
    expect(session.isFailed()).toBe(true);
    const state = session.getState();

    expect(session.press(2, 3000)).toBeNull();
    expect(session.release(1, 5000)).toBeNull();
    expect(session.update(6000)).toEqual([]);
    expect(session.getState()).toEqual(state);
  });

  it('returns a failed result with the values at the moment of failure', () => {
    const session = makeSession([
      { type: 'tap', timeMs: 500, lane: 1 },
      ...makeTaps(10),
      ...makeTaps(1, 9000),
    ]);
    session.press(1, 500);
    session.update(1131 + 9 * 100);

    expect(session.isFinished()).toBe(false);
    expect(session.getResult()).toEqual({
      score: 1000,
      accuracy: 1 / 11,
      maxCombo: 1,
      counts: { ...emptyCounts, perfect: 1, miss: 10 },
      outcome: 'failed',
      cleared: false,
    });
  });

  it('prefers the failed result when the last judgment brings hp to 0', () => {
    const session = makeSession(makeTaps(10));
    session.update(1131 + 9 * 100);

    expect(session.isFinished()).toBe(true);
    expect(session.isFailed()).toBe(true);
    expect(session.getResult()).toMatchObject({ outcome: 'failed', cleared: false });
  });
});
