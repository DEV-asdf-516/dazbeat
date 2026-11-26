import { describe, expect, it } from 'vitest';
import { GameplaySession } from '../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../src/rhythm/judgment.js';
import type { Chart, LaneCount, Note } from '../../src/rhythm/types.js';

function makeChart(notes: Note[], laneCount: LaneCount = 4): Chart {
  return {
    songId: 'test-song',
    difficulty: 'easy',
    laneCount,
    offsetMs: 0,
    notes,
  };
}

function makeSession(notes: Note[], laneCount: LaneCount = 4): GameplaySession {
  return new GameplaySession(makeChart(notes, laneCount), JUDGMENT_WINDOWS);
}

const emptyCounts = {
  perfect: 0,
  great: 0,
  good: 0,
  bad: 0,
  miss: 0,
};

describe('GameplaySession.press', () => {
  it('judges the closest pending note and leaves earlier notes pending until they auto-miss', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1100,
        lane: 0,
      },
    ]);

    expect(session.press(0, 1080)).toEqual([
      {
        noteIndex: 1,
        lane: 0,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.getNoteStatus(1)).toBe('hit');
    expect(session.getNoteStatus(0)).toBe('pending');

    expect(session.update(1131)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'miss',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
  });

  it('ignores a press before the window without changing state or other lanes', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 1,
      },
    ]);

    expect(session.press(0, 869)).toEqual([]);
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

  it('returns only the auto misses for a press after the window', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 1,
      },
    ]);

    expect(session.press(0, 1131)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'miss',
      },
      {
        noteIndex: 1,
        lane: 1,
        kind: 'tap',
        judgment: 'miss',
      },
    ]);
  });

  it('does not re-judge an already judged note', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 2,
      },
    ]);

    expect(session.press(2, 1000)).toHaveLength(1);
    expect(session.press(2, 1010)).toEqual([]);
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      perfect: 1,
    });
  });
});

describe('GameplaySession BAD judgment', () => {
  it.each([101, 130, -101, -130])('judges a press %ims from the note as bad', (offsetMs) => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);

    expect(session.press(0, 1000 + offsetMs)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'bad',
      },
    ]);
    expect(session.getState()).toEqual({
      score: 100,
      combo: 0,
      maxCombo: 0,
      counts: {
        ...emptyCounts,
        bad: 1,
      },
      hp: 98,
    });
  });

  it('resets the combo on bad', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1500,
        lane: 0,
      },
    ]);
    session.press(0, 1000);
    expect(session.getState().combo).toBe(1);

    session.press(0, 1610);
    expect(session.getState()).toMatchObject({
      combo: 0,
      maxCombo: 1,
    });
  });
});

describe('GameplaySession.update auto miss', () => {
  it('misses a tap only once the good window has passed', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 3,
      },
    ]);

    expect(session.update(1130)).toEqual([]);
    expect(session.getNoteStatus(0)).toBe('pending');
    expect(session.update(1131)).toEqual([
      {
        noteIndex: 0,
        lane: 3,
        kind: 'tap',
        judgment: 'miss',
      },
    ]);
    expect(session.getState().combo).toBe(0);
    expect(session.update(2000)).toEqual([]);
  });

  it('resets the combo on miss', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1200,
        lane: 0,
      },
    ]);
    session.press(0, 1000);
    expect(session.getState().combo).toBe(1);

    session.update(1331);
    expect(session.getState()).toMatchObject({
      combo: 0,
      maxCombo: 1,
    });
  });
});

describe('GameplaySession hold notes', () => {
  const hold: Note = {
    type: 'hold',
    timeMs: 1000,
    endTimeMs: 2000,
    lane: 1,
  };

  it('starts holding on press and misses when held past the end window', () => {
    const session = makeSession([hold]);

    expect(session.press(1, 1000)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdStart',
        judgment: 'perfect',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('holding');
    expect(session.update(2000 + 130)).toEqual([]);
    expect(session.getNoteStatus(0)).toBe('holding');
    expect(session.update(2000 + 131)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'miss',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
    expect(session.release(1, 2140)).toEqual([]);
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      perfect: 1,
      miss: 1,
    });
  });

  it.each([
    [-40, 'perfect'],
    [40, 'perfect'],
    [-41, 'great'],
    [41, 'great'],
    [-80, 'great'],
    [80, 'great'],
    [-81, 'good'],
    [81, 'good'],
    [-100, 'good'],
    [100, 'good'],
    [-101, 'bad'],
    [101, 'bad'],
    [-130, 'bad'],
    [130, 'bad'],
  ] as const)('judges a release %ims from the end as %s', (diffMs, judgment) => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.release(1, 2000 + diffMs)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment,
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('hit');
  });

  it('settles a bad release after the end and frees the lane for the next note', () => {
    const session = makeSession([
      hold,
      {
        type: 'tap',
        timeMs: 2200,
        lane: 1,
      },
    ]);
    session.press(1, 1000);

    expect(session.release(1, 2130).map((event) => event.judgment)).toEqual(['bad']);
    expect(session.getNoteStatus(0)).toBe('hit');
    expect(session.release(1, 2140)).toEqual([]);
    expect(session.press(1, 2200)).toEqual([
      {
        noteIndex: 1,
        lane: 1,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
  });

  it('judges the next note on the lane within 130ms after the end once released', () => {
    const session = makeSession([
      hold,
      {
        type: 'tap',
        timeMs: 2100,
        lane: 1,
      },
    ]);
    session.press(1, 1000);
    session.release(1, 2050);

    expect(session.press(1, 2100)).toEqual([
      {
        noteIndex: 1,
        lane: 1,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('hit');
    expect(session.getNoteStatus(1)).toBe('hit');
  });

  it.each([
    [1500, 'miss', 'missed'],
    [2050, 'great', 'hit'],
  ] as const)(
    'judges a release at the stopped clock time %i as %s',
    (stoppedTimeMs, judgment, status) => {
      const session = makeSession([hold]);
      session.press(1, 1000);
      session.update(stoppedTimeMs);

      expect(session.release(1, stoppedTimeMs)).toEqual([
        {
          noteIndex: 0,
          lane: 1,
          kind: 'holdEnd',
          judgment,
        },
      ]);
      expect(session.getNoteStatus(0)).toBe(status);
    },
  );

  it('misses an early release', () => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.release(1, 2000 - 131)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'miss',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
    expect(session.getState()).toEqual({
      score: 1000,
      combo: 0,
      maxCombo: 1,
      counts: {
        ...emptyCounts,
        perfect: 1,
        miss: 1,
      },
      hp: 95,
    });
  });

  it('misses both start and end when the hold is never pressed', () => {
    const session = makeSession([hold]);

    expect(session.update(1131)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdStart',
        judgment: 'miss',
      },
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'miss',
      },
    ]);
    expect(session.getNoteStatus(0)).toBe('missed');
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      miss: 2,
    });
  });

  it('ignores a press on the same lane while holding', () => {
    const session = makeSession([hold]);
    session.press(1, 1000);

    expect(session.press(1, 1050)).toEqual([]);
    expect(session.getNoteStatus(0)).toBe('holding');
  });

  it('returns no event when releasing without a holding note', () => {
    const session = makeSession([hold]);

    expect(session.release(1, 1000)).toEqual([]);
  });
});

describe('GameplaySession.update ordering', () => {
  it('applies judgments by judgment time then lane', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 900,
        endTimeMs: 970,
        lane: 2,
      },
      {
        type: 'tap',
        timeMs: 1050,
        lane: 3,
      },
      {
        type: 'tap',
        timeMs: 1050,
        lane: 1,
      },
    ]);
    session.press(2, 900);

    // lane 2 hold MISS at 1100, lane 0 tap MISS at 1130, lanes 1/3 tap MISS at 1180.
    expect(session.update(1200)).toEqual([
      {
        noteIndex: 1,
        lane: 2,
        kind: 'holdEnd',
        judgment: 'miss',
      },
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'miss',
      },
      {
        noteIndex: 3,
        lane: 1,
        kind: 'tap',
        judgment: 'miss',
      },
      {
        noteIndex: 2,
        lane: 3,
        kind: 'tap',
        judgment: 'miss',
      },
    ]);
    expect(session.getState()).toMatchObject({
      combo: 0,
      maxCombo: 1,
    });
  });

  it('keeps hold miss start before end when ordering across lanes', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 1500,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
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
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 2,
      },
    ]);
    session.press(0, 1000);
    session.press(1, 1060);
    session.press(2, 1100);

    const state = session.getState();
    expect(state).toEqual({
      score: 2000,
      combo: 1,
      maxCombo: 2,
      counts: {
        perfect: 1,
        great: 1,
        good: 1,
        bad: 0,
        miss: 0,
      },
      hp: 100,
    });

    state.score = 0;
    state.counts.perfect = 99;
    expect(session.getState()).toEqual({
      score: 2000,
      combo: 1,
      maxCombo: 2,
      counts: {
        perfect: 1,
        great: 1,
        good: 1,
        bad: 0,
        miss: 0,
      },
      hp: 100,
    });
  });

  it('adds a combo bonus of 1% per 50 combo up to 10% and drops it when the combo breaks', () => {
    const notes: Note[] = Array.from({ length: 602 }, (_, index) => ({
      type: 'tap',
      timeMs: 1000 + index * 1000,
      lane: 0,
    }));
    const session = makeSession(notes);
    for (const [index, note] of notes.entries()) {
      // 601번째 노트는 놓쳐 다음 노트 전에 콤보를 끊는다.
      session.update(note.timeMs);
      if (index !== 600) {
        session.press(0, note.timeMs);
      }
    }
    session.update(1000 + 602 * 1000);

    // 콤보 1~49는 1000, 50씩 1%가 붙고 500부터 1100에서 멈춘다. 끊긴 뒤 첫 노트는 다시 1000.
    expect(session.getState().score).toBe(
      49 * 1000 +
        50 * (1010 + 1020 + 1030 + 1040 + 1050 + 1060 + 1070 + 1080 + 1090) +
        101 * 1100 +
        1000,
    );
  });

  it('finishes only after every note is judged and computes the result', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 1500,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 2000,
        lane: 0,
      },
    ]);

    expect(session.getProgress()).toEqual({ outcome: 'playing' });

    session.press(0, 1000);
    session.press(1, 1000);
    expect(session.getProgress()).toEqual({ outcome: 'playing' });
    session.release(1, 1500);
    expect(session.getProgress()).toEqual({ outcome: 'playing' });

    session.update(2131);
    expect(session.getProgress()).toEqual({
      score: 3000,
      accuracy: 0.75,
      maxCombo: 3,
      counts: {
        perfect: 3,
        great: 0,
        good: 0,
        bad: 0,
        miss: 1,
      },
      outcome: 'finished',
    });
  });

  it('clears a finished play at any accuracy', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 1,
      },
    ]);
    session.press(0, 1000);
    session.update(1131);

    expect(session.getProgress()).toMatchObject({
      outcome: 'finished',
      accuracy: 0.5,
    });
  });

  it.each([
    {
      perfect: 4,
      great: 1,
      good: 0,
      miss: 1,
      accuracy: 0.8,
    },
    {
      perfect: 7,
      great: 1,
      good: 1,
      miss: 0,
      accuracy: 0.9,
    },
    {
      perfect: 31,
      great: 6,
      good: 1,
      miss: 0,
      accuracy: 0.95,
    },
  ])(
    'reaches exactly $accuracy with $perfect perfect, $great great, $good good and $miss miss',
    ({ perfect, great, good, miss, accuracy }) => {
      const pressOffsetsMs = [
        ...Array.from({ length: perfect }, () => 0),
        ...Array.from({ length: great }, () => 60),
        ...Array.from({ length: good }, () => 90),
      ];
      const noteCount = pressOffsetsMs.length + miss;
      const session = makeSession(
        Array.from({ length: noteCount }, (_, index) => ({
          type: 'tap' as const,
          timeMs: 1000 + index * 1000,
          lane: 0 as const,
        })),
      );
      pressOffsetsMs.forEach((pressOffsetMs, index) =>
        session.press(0, 1000 + index * 1000 + pressOffsetMs),
      );
      session.update(1000 + noteCount * 1000);

      expect(session.getProgress()).toMatchObject({
        outcome: 'finished',
        counts: {
          perfect,
          great,
          good,
          bad: 0,
          miss,
        },
      });
      expect(session.getProgress()).toHaveProperty('accuracy', accuracy);
    },
  );

  it('throws for an out-of-range note index', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);

    expect(() => session.getNoteStatus(-1)).toThrow(Error);
    expect(() => session.getNoteStatus(1)).toThrow(Error);
  });

  it('does not modify the original chart', () => {
    const chart = makeChart([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 1500,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 1200,
        lane: 0,
      },
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

function makeTaps(count: number, startMs = 1000): Note[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'tap' as const,
    timeMs: startMs + index * 100,
    lane: 0 as const,
  }));
}

describe('GameplaySession STARLIGHT hp', () => {
  it('starts at 100 and loses 5 on a tap miss', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);
    expect(session.getState().hp).toBe(100);

    session.update(1131);
    expect(session.getState().hp).toBe(95);
  });

  it('loses 10 for a hold that is never pressed', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2000,
        lane: 1,
      },
    ]);

    session.update(1131);
    expect(session.getState().hp).toBe(90);
  });

  it('applies the start judgment and a miss when a hold is released early', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 500,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2000,
        lane: 1,
      },
    ]);
    session.update(631);
    expect(session.getState().hp).toBe(95);

    session.press(1, 1050);
    expect(session.getState().hp).toBe(95.5);
    session.release(1, 1500);
    expect(session.getState().hp).toBe(90.5);
  });

  it('keeps hp on good', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 500,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1000,
        lane: 1,
      },
    ]);
    session.update(631);

    session.press(1, 1100);
    expect(session.getState()).toMatchObject({
      hp: 95,
      counts: {
        ...emptyCounts,
        good: 1,
        miss: 1,
      },
    });
  });
});

describe('GameplaySession failure', () => {
  it('fails on the judgment that brings hp to exactly 0 and reports that event', () => {
    const session = makeSession(makeTaps(21));

    session.update(1131 + 18 * 100);
    expect(session.getState().hp).toBe(5);
    expect(session.getProgress().outcome).toBe('playing');

    expect(session.update(1131 + 19 * 100)).toEqual([
      {
        noteIndex: 19,
        lane: 0,
        kind: 'tap',
        judgment: 'miss',
      },
    ]);
    expect(session.getProgress().outcome).toBe('failed');
    expect(session.getState()).toMatchObject({
      hp: 0,
      counts: {
        ...emptyCounts,
        miss: 20,
      },
    });
  });

  it('stops applying candidates after the failing event in one update batch', () => {
    const session = makeSession([
      ...makeTaps(19),
      {
        type: 'tap',
        timeMs: 5000,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 5000,
        lane: 2,
      },
    ]);

    const events = session.update(6000);
    expect(events).toHaveLength(20);
    expect(events.at(-1)).toEqual({
      noteIndex: 19,
      lane: 1,
      kind: 'tap',
      judgment: 'miss',
    });
    expect(session.getProgress().outcome).toBe('failed');
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      miss: 20,
    });
    expect(session.getNoteStatus(20)).toBe('pending');
  });

  it('ignores press, release and update after failing without changing state', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 500,
        endTimeMs: 10000,
        lane: 1,
      },
      ...makeTaps(20),
      {
        type: 'tap',
        timeMs: 9000,
        lane: 2,
      },
    ]);
    session.press(1, 500);
    session.update(1131 + 19 * 100);
    expect(session.getProgress().outcome).toBe('failed');
    const state = session.getState();

    expect(session.press(2, 9000)).toEqual([]);
    expect(session.release(1, 10000)).toEqual([]);
    expect(session.update(11000)).toEqual([]);
    expect(session.getState()).toEqual(state);
  });

  it('returns a failed result with the values at the moment of failure', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 500,
        lane: 1,
      },
      ...makeTaps(20),
      ...makeTaps(1, 9000),
    ]);
    session.press(1, 500);
    session.update(1131 + 19 * 100);

    expect(session.getProgress()).toEqual({
      score: 1000,
      accuracy: 1 / 21,
      maxCombo: 1,
      counts: {
        ...emptyCounts,
        perfect: 1,
        miss: 20,
      },
      outcome: 'failed',
    });
  });

  it('prefers the failed result when the last judgment brings hp to 0', () => {
    const session = makeSession(makeTaps(20));
    session.update(1131 + 19 * 100);

    expect(session.getProgress()).toMatchObject({
      outcome: 'failed',
    });
  });
});

describe('GameplaySession without failure', () => {
  function makePracticeSession(notes: Note[]): GameplaySession {
    return new GameplaySession(makeChart(notes), JUDGMENT_WINDOWS, { canFail: false });
  }

  it('keeps judging presses on the same and other lanes after hp reaches 0 and regains hp', () => {
    const session = makePracticeSession([
      ...makeTaps(20),
      {
        type: 'tap',
        timeMs: 9000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 9500,
        lane: 1,
      },
    ]);
    session.update(1131 + 19 * 100);
    expect(session.getState().hp).toBe(0);
    expect(session.getProgress().outcome).toBe('playing');

    expect(session.press(0, 9000)).toEqual([
      {
        noteIndex: 20,
        lane: 0,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.press(1, 9500)).toEqual([
      {
        noteIndex: 21,
        lane: 1,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.getState()).toEqual({
      score: 2000,
      combo: 2,
      maxCombo: 2,
      counts: {
        ...emptyCounts,
        perfect: 2,
        miss: 20,
      },
      hp: 2,
    });
  });

  it('applies every candidate in an update batch that passes hp 0', () => {
    const session = makePracticeSession([
      ...makeTaps(19),
      {
        type: 'tap',
        timeMs: 5000,
        lane: 1,
      },
      {
        type: 'tap',
        timeMs: 5000,
        lane: 2,
      },
    ]);

    const events = session.update(6000);
    expect(events).toHaveLength(21);
    expect(events.at(-1)).toEqual({
      noteIndex: 20,
      lane: 2,
      kind: 'tap',
      judgment: 'miss',
    });
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      miss: 21,
    });
    expect(session.getNoteStatus(20)).toBe('missed');
  });

  it('judges hold press and release after hp reaches 0', () => {
    const session = makePracticeSession([
      ...makeTaps(20),
      {
        type: 'hold',
        timeMs: 9000,
        endTimeMs: 10000,
        lane: 1,
      },
    ]);
    session.update(1131 + 19 * 100);

    expect(session.press(1, 9000)).toEqual([
      {
        noteIndex: 20,
        lane: 1,
        kind: 'holdStart',
        judgment: 'perfect',
      },
    ]);
    expect(session.getNoteStatus(20)).toBe('holding');
    expect(session.release(1, 10000)).toEqual([
      {
        noteIndex: 20,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'perfect',
      },
    ]);
    expect(session.getNoteStatus(20)).toBe('hit');
    expect(session.getState().hp).toBe(2);
  });

  it('records inputs after hp reaches 0', () => {
    const session = makePracticeSession([
      ...makeTaps(20),
      {
        type: 'tap',
        timeMs: 9000,
        lane: 1,
      },
    ]);
    session.update(1131 + 19 * 100);

    session.press(1, 9000);
    session.release(1, 9100);
    expect(session.getInputs()).toEqual([
      {
        lane: 1,
        kind: 'press',
        songTimeMs: 9000,
      },
      {
        lane: 1,
        kind: 'release',
        songTimeMs: 9100,
      },
    ]);
  });

  it('finishes instead of failing when the last judgment brings hp to 0', () => {
    const notes = makeTaps(20);
    const failingSession = makeSession(notes);
    const practiceSession = makePracticeSession(notes);
    failingSession.update(1131 + 19 * 100);
    practiceSession.update(1131 + 19 * 100);

    expect(failingSession.getProgress().outcome).toBe('failed');
    expect(practiceSession.getProgress()).toEqual({
      score: 0,
      accuracy: 0,
      maxCombo: 0,
      counts: {
        ...emptyCounts,
        miss: 20,
      },
      outcome: 'finished',
    });
  });
});

describe('GameplaySession deterministic judgment time', () => {
  it('records and judges an input earlier than the latest time at the latest time', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);
    session.update(1050);

    expect(session.press(0, 990)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'great',
      },
    ]);
    expect(session.getInputs()).toEqual([
      {
        lane: 0,
        kind: 'press',
        songTimeMs: 1050,
      },
    ]);
  });

  it('treats an update earlier than the latest time as the latest time', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);
    session.update(1131);
    expect(session.getNoteStatus(0)).toBe('missed');

    expect(session.update(900)).toEqual([]);
    expect(session.press(0, 1000)).toEqual([]);
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      miss: 1,
    });
  });

  it('returns and applies auto misses up to the press time before the press judgment', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 1200,
        lane: 1,
      },
    ]);

    expect(session.press(1, 1200)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'miss',
      },
      {
        noteIndex: 1,
        lane: 1,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.getState()).toMatchObject({
      combo: 1,
      maxCombo: 1,
      counts: {
        ...emptyCounts,
        perfect: 1,
        miss: 1,
      },
    });
  });

  it('judges a release just after the end by the tail window', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2000,
        lane: 1,
      },
    ]);
    session.press(1, 1000);

    expect(session.release(1, 2001)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'perfect',
      },
    ]);
    expect(session.getState().counts).toEqual({
      ...emptyCounts,
      perfect: 2,
    });
  });

  it('misses a held hold only after the end window', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2000,
        lane: 1,
      },
    ]);
    session.press(1, 1000);

    expect(session.update(2130)).toEqual([]);
    expect(session.getNoteStatus(0)).toBe('holding');
    expect(session.update(2131)).toEqual([
      {
        noteIndex: 0,
        lane: 1,
        kind: 'holdEnd',
        judgment: 'miss',
      },
    ]);
  });

  it('judges a press exactly at the end of the bad window as bad, not an auto miss', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);

    expect(session.press(0, 1000 + JUDGMENT_WINDOWS.badMs)).toEqual([
      {
        noteIndex: 0,
        lane: 0,
        kind: 'tap',
        judgment: 'bad',
      },
    ]);
  });

  it.each([[[1131]], [[1130, 1131]], [[1050, 1130, 1130, 1131]]])(
    'orders a held hold miss and a tap miss at the same judgment time by lane for updates %j',
    (updateTimesMs) => {
      const session = makeSession([
        {
          type: 'tap',
          timeMs: 1000,
          lane: 0,
        },
        {
          type: 'hold',
          timeMs: 900,
          endTimeMs: 1000,
          lane: 2,
        },
      ]);
      session.press(2, 900);

      const events = updateTimesMs.flatMap((timeMs) => session.update(timeMs));
      expect(events).toEqual([
        {
          noteIndex: 0,
          lane: 0,
          kind: 'tap',
          judgment: 'miss',
        },
        {
          noteIndex: 1,
          lane: 2,
          kind: 'holdEnd',
          judgment: 'miss',
        },
      ]);
      expect(session.getState()).toMatchObject({
        combo: 0,
        maxCombo: 1,
      });
    },
  );

  it('ignores inputs after failing but still records them', () => {
    const session = makeSession([
      ...makeTaps(20),
      {
        type: 'tap',
        timeMs: 9000,
        lane: 1,
      },
    ]);
    session.update(1131 + 19 * 100);
    expect(session.getProgress().outcome).toBe('failed');
    const state = session.getState();

    expect(session.press(1, 9000)).toEqual([]);
    expect(session.release(1, 9100)).toEqual([]);
    expect(session.getState()).toEqual(state);
    expect(session.getInputs()).toEqual([
      {
        lane: 1,
        kind: 'press',
        songTimeMs: 9000,
      },
      {
        lane: 1,
        kind: 'release',
        songTimeMs: 9100,
      },
    ]);
  });

  it('records every press and release in call order including calls without a judgment', () => {
    const session = makeSession([
      {
        type: 'hold',
        timeMs: 1000,
        endTimeMs: 2000,
        lane: 1,
      },
    ]);
    expect(session.getInputs()).toEqual([]);

    session.release(2, 500);
    session.press(1, 1000);
    session.press(1, 1100);
    session.update(1500);
    session.press(3, 1400);
    session.release(1, 1600);

    expect(session.getInputs()).toEqual([
      {
        lane: 2,
        kind: 'release',
        songTimeMs: 500,
      },
      {
        lane: 1,
        kind: 'press',
        songTimeMs: 1000,
      },
      {
        lane: 1,
        kind: 'press',
        songTimeMs: 1100,
      },
      {
        lane: 3,
        kind: 'press',
        songTimeMs: 1500,
      },
      {
        lane: 1,
        kind: 'release',
        songTimeMs: 1600,
      },
    ]);
  });

  it('does not let changes to the returned inputs alter the recorded inputs', () => {
    const session = makeSession([
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ]);
    session.press(0, 1000);

    for (const input of session.getInputs()) {
      input.songTimeMs = 0;
    }
    expect(session.getInputs()).toEqual([
      {
        lane: 0,
        kind: 'press',
        songTimeMs: 1000,
      },
    ]);
  });
});

describe('GameplaySession lane count', () => {
  it.each([4, 5, 6] as const)('judges a tap on the last lane of a %iK chart', (laneCount) => {
    const lastLane = laneCount - 1;
    const session = makeSession(
      [
        {
          type: 'tap',
          timeMs: 1000,
          lane: lastLane,
        },
      ],
      laneCount,
    );

    expect(session.press(lastLane, 1000)).toEqual([
      {
        noteIndex: 0,
        lane: lastLane,
        kind: 'tap',
        judgment: 'perfect',
      },
    ]);
    expect(session.getProgress()).toMatchObject({ outcome: 'finished' });
  });

  it.each([5, 6] as const)(
    'starts and releases a hold on the last lane of a %iK chart',
    (laneCount) => {
      const lastLane = laneCount - 1;
      const session = makeSession(
        [
          {
            type: 'hold',
            timeMs: 1000,
            endTimeMs: 2000,
            lane: lastLane,
          },
        ],
        laneCount,
      );

      expect(session.press(lastLane, 1000)).toEqual([
        {
          noteIndex: 0,
          lane: lastLane,
          kind: 'holdStart',
          judgment: 'perfect',
        },
      ]);
      expect(session.getNoteStatus(0)).toBe('holding');
      expect(session.release(lastLane, 2000)).toEqual([
        {
          noteIndex: 0,
          lane: lastLane,
          kind: 'holdEnd',
          judgment: 'perfect',
        },
      ]);
      expect(session.getNoteStatus(0)).toBe('hit');
    },
  );

  it.each([5, 6] as const)(
    'judges simultaneous notes on the first and last lanes of a %iK chart',
    (laneCount) => {
      const lastLane = laneCount - 1;
      const session = makeSession(
        [
          {
            type: 'tap',
            timeMs: 1000,
            lane: 0,
          },
          {
            type: 'tap',
            timeMs: 1000,
            lane: lastLane,
          },
        ],
        laneCount,
      );

      expect(session.press(lastLane, 1000)).toEqual([
        {
          noteIndex: 1,
          lane: lastLane,
          kind: 'tap',
          judgment: 'perfect',
        },
      ]);
      expect(session.press(0, 1000)).toEqual([
        {
          noteIndex: 0,
          lane: 0,
          kind: 'tap',
          judgment: 'perfect',
        },
      ]);
      expect(session.getState()).toMatchObject({
        combo: 2,
        maxCombo: 2,
      });
    },
  );

  it.each([5, 6] as const)(
    'auto-misses the last lane of a %iK chart in lane order',
    (laneCount) => {
      const lastLane = laneCount - 1;
      const session = makeSession(
        [
          {
            type: 'tap',
            timeMs: 1000,
            lane: lastLane,
          },
          {
            type: 'tap',
            timeMs: 1000,
            lane: 0,
          },
        ],
        laneCount,
      );

      expect(session.update(1131).map((event) => event.lane)).toEqual([0, lastLane]);
    },
  );

  it.each([4, 5, 6] as const)(
    'throws for a lane outside a %iK chart without recording the input or advancing time',
    (laneCount) => {
      const session = makeSession(
        [
          {
            type: 'tap',
            timeMs: 1000,
            lane: 0,
          },
        ],
        laneCount,
      );

      expect(() => session.press(laneCount, 5000)).toThrow('Lane out of range');
      expect(() => session.release(laneCount, 5000)).toThrow('Lane out of range');
      expect(() => session.press(-1, 5000)).toThrow('Lane out of range');
      expect(session.getInputs()).toEqual([]);
      expect(session.getNoteStatus(0)).toBe('pending');
      expect(session.press(0, 1000)).toEqual([
        {
          noteIndex: 0,
          lane: 0,
          kind: 'tap',
          judgment: 'perfect',
        },
      ]);
    },
  );
});
