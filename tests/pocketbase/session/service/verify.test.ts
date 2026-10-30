import { describe, expect, it } from 'vitest';
import { PLAY_REJECTION_RESPONSES } from '../../../../pocketbase/lib/session/dto.js';
import type { VerificationSong } from '../../../../pocketbase/lib/session/dto.js';
import { getSessionExpiresAtMs } from '../../../../pocketbase/lib/session/service/issue.js';
import { verifyPlay } from '../../../../pocketbase/lib/session/service/verify.js';
import type {
  PlayVerification,
  PlayVerificationInput,
} from '../../../../pocketbase/lib/session/service/verify.js';
import { requireDefined } from '../../../../src/invariant.js';
import { replayGameplay } from '../../../../src/rhythm/replay.js';
import type { Chart, InputEvent, Lane, LaneCount, Note } from '../../../../src/rhythm/types.js';
import { simulateClientPlay } from '../../../rhythm/playSimulation.js';

// 재생 시작 1000ms(리드인 2000ms) → 플레이 길이 9000ms, 최소 소요 시간 8100ms.
const song: VerificationSong = {
  key: 'test-song',
  gameStartMs: 3000,
  gameEndMs: 10000,
};
const ISSUED_AT_MS = 1_800_000_000_000;
const MIN_ELAPSED_MS = 8100;
const REVISION = 'rev-1';
// 기존 케이스의 짧은 채보는 표본이 최소 수에 못 미친다. 검사 지표는 아래 autoplay 케이스가 확인한다.
const UNJUDGED_CHECK: unknown = expect.objectContaining({ kind: 'unjudged' });

function tap(lane: Lane, timeMs: number): Note {
  return {
    type: 'tap',
    timeMs,
    lane,
  };
}

function hold(lane: Lane, timeMs: number, endTimeMs: number): Note {
  return {
    type: 'hold',
    timeMs,
    endTimeMs,
    lane,
  };
}

function press(lane: Lane, songTimeMs: number): InputEvent {
  return {
    lane,
    kind: 'press',
    songTimeMs,
  };
}

function release(lane: Lane, songTimeMs: number): InputEvent {
  return {
    lane,
    kind: 'release',
    songTimeMs,
  };
}

function makeChart(notes: Note[], laneCount: LaneCount = 4): Chart {
  return {
    songId: song.key,
    difficulty: 'normal',
    laneCount,
    offsetMs: 0,
    notes,
  };
}

const chart = makeChart([tap(0, 3000), hold(1, 3500, 4500), tap(2, 4000), tap(3, 5000)]);
const events = [
  press(0, 3010),
  release(0, 3040),
  press(1, 3520),
  press(2, 3990),
  release(2, 4010),
  release(1, 4480),
  press(3, 5060),
  release(3, 5090),
];

function makeInput(overrides: Partial<PlayVerificationInput> = {}): PlayVerificationInput {
  return {
    song,
    difficulty: 'normal',
    laneCount: 4,
    chart: {
      revision: REVISION,
      data: chart,
    },
    session: {
      chartRevision: REVISION,
      issuedAtMs: ISSUED_AT_MS,
      expiresAtMs: getSessionExpiresAtMs(song, ISSUED_AT_MS),
    },
    submission: {
      inputOffsetMs: 0,
      events,
    },
    nowMs: ISSUED_AT_MS + MIN_ELAPSED_MS,
    ...overrides,
  };
}

describe('getSessionExpiresAtMs', () => {
  it('adds the play duration from the lead-in and a 12 hour grace', () => {
    expect(getSessionExpiresAtMs(song, ISSUED_AT_MS)).toBe(ISSUED_AT_MS + 9000 + 43_200_000);
  });

  it('includes the lead-in wait when gameStartMs is shorter than the lead-in', () => {
    const earlySong = {
      key: 'early',
      gameStartMs: 500,
      gameEndMs: 8000,
    };

    expect(getSessionExpiresAtMs(earlySong, ISSUED_AT_MS)).toBe(ISSUED_AT_MS + 9500 + 43_200_000);
  });
});

describe('verifyPlay', () => {
  it('returns the replayed result for a finished play', () => {
    const expected = replayGameplay(chart, events).result;

    expect(verifyPlay(makeInput())).toEqual({
      kind: 'verified',
      result: expected,
      autoplayCheck: UNJUDGED_CHECK,
    });
    expect(expected.outcome).toBe('finished');
  });

  it('matches the client simulation for releases without a press, repeated presses and presses during a hold', () => {
    const client = simulateClientPlay(
      chart,
      [
        release(2, 2900),
        press(0, 3000),
        press(0, 3200),
        press(1, 3500),
        press(1, 3800),
        release(1, 4500),
        press(3, 5000),
      ],
      [],
    );

    expect(
      verifyPlay(
        makeInput({
          submission: {
            inputOffsetMs: 0,
            events: client.inputs,
          },
        }),
      ),
    ).toEqual({
      kind: 'verified',
      result: client.result,
      autoplayCheck: UNJUDGED_CHECK,
    });
  });

  it('accepts a submission exactly at expiresAtMs and rejects 1ms later', () => {
    const expiresAtMs = getSessionExpiresAtMs(song, ISSUED_AT_MS);

    expect(verifyPlay(makeInput({ nowMs: expiresAtMs })).kind).toBe('verified');
    expect(verifyPlay(makeInput({ nowMs: expiresAtMs + 1 }))).toEqual({
      kind: 'rejected',
      code: 'session_expired',
    });
  });

  it('accepts exactly the minimum elapsed time and rejects 1ms earlier', () => {
    expect(verifyPlay(makeInput({ nowMs: ISSUED_AT_MS + MIN_ELAPSED_MS })).kind).toBe('verified');
    expect(verifyPlay(makeInput({ nowMs: ISSUED_AT_MS + MIN_ELAPSED_MS - 1 }))).toEqual({
      kind: 'rejected',
      code: 'too_short',
    });
  });

  it('rejects a chart revision that differs from the session', () => {
    expect(
      verifyPlay(
        makeInput({
          chart: {
            revision: 'rev-2',
            data: chart,
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'chart_changed',
    });
  });

  it('rejects a stored chart that does not parse', () => {
    expect(
      verifyPlay(
        makeInput({
          chart: {
            revision: REVISION,
            data: {
              ...chart,
              notes: [],
            },
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'chart_invalid',
    });
  });

  it('rejects a chart stored for another song', () => {
    expect(
      verifyPlay(
        makeInput({
          chart: {
            revision: REVISION,
            data: {
              ...chart,
              songId: 'other-song',
            },
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'chart_invalid',
    });
  });

  it('rejects malformed events', () => {
    expect(
      verifyPlay(
        makeInput({
          submission: {
            inputOffsetMs: 0,
            events: [press(0, 3000), 'x'],
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'invalid_events',
    });
  });

  it('rejects a play that fails at hp 0', () => {
    const failingChart = makeChart(
      Array.from({ length: 12 }, (_, index) => tap(0, 3000 + index * 100)),
    );

    expect(
      verifyPlay(
        makeInput({
          chart: {
            revision: REVISION,
            data: failingChart,
          },
          submission: {
            inputOffsetMs: 0,
            events: [],
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'not_finished',
    });
  });

  it('reports the earliest failing step when several conditions fail', () => {
    const broken = {
      chart: {
        revision: 'rev-2',
        data: {
          ...chart,
          notes: [],
        },
      },
      submission: 'not a submission',
      nowMs: ISSUED_AT_MS,
    };
    const expiresAtMs = getSessionExpiresAtMs(song, ISSUED_AT_MS);

    expect(
      verifyPlay(
        makeInput({
          ...broken,
          nowMs: expiresAtMs + 1,
        }),
      ),
    ).toMatchObject({
      code: 'session_expired',
    });
    expect(verifyPlay(makeInput(broken))).toMatchObject({ code: 'chart_changed' });
    expect(
      verifyPlay(
        makeInput({
          ...broken,
          chart: {
            revision: REVISION,
            data: {
              ...chart,
              notes: [],
            },
          },
        }),
      ),
    ).toMatchObject({ code: 'chart_invalid' });
    expect(
      verifyPlay(
        makeInput({
          ...broken,
          chart: {
            revision: REVISION,
            data: chart,
          },
        }),
      ),
    ).toMatchObject({ code: 'too_short' });
    expect(
      verifyPlay(
        makeInput({
          chart: {
            revision: REVISION,
            data: chart,
          },
          submission: 'not a submission',
        }),
      ),
    ).toMatchObject({ code: 'invalid_events' });
  });

  it.each([5, 6] as const)(
    'verifies a %iK play on the last lane like the client simulation',
    (laneCount) => {
      const lastLane = laneCount - 1;
      const laneChart = makeChart(
        [tap(0, 3000), hold(lastLane, 3500, 4500), tap(lastLane - 1, 4000), tap(lastLane, 5000)],
        laneCount,
      );
      const client = simulateClientPlay(
        laneChart,
        [
          press(0, 3010),
          release(0, 3040),
          press(lastLane, 3520),
          press(lastLane - 1, 3990),
          release(lastLane - 1, 4010),
          release(lastLane, 4480),
          press(lastLane, 5060),
          release(lastLane, 5090),
        ],
        [],
      );

      expect(
        verifyPlay(
          makeInput({
            laneCount,
            chart: {
              revision: REVISION,
              data: laneChart,
            },
            submission: {
              inputOffsetMs: 0,
              events: client.inputs,
            },
          }),
        ),
      ).toEqual({
        kind: 'verified',
        result: client.result,
        autoplayCheck: UNJUDGED_CHECK,
      });
      expect(client.result.counts.miss).toBe(0);
    },
  );

  it.each([4, 5, 6] as const)('rejects an event on a lane outside the %iK chart', (laneCount) => {
    expect(
      verifyPlay(
        makeInput({
          laneCount,
          chart: {
            revision: REVISION,
            data: makeChart([tap(0, 3000)], laneCount),
          },
          submission: {
            inputOffsetMs: 0,
            events: [press(laneCount, 3000)],
          },
        }),
      ),
    ).toEqual({
      kind: 'rejected',
      code: 'invalid_events',
    });
  });

  it('scales the event count limit with the lane count', () => {
    // 허용 구간 0~11130ms → 상한은 4K ceil(11.13 × 40) = 446개, 6K ceil(11.13 × 60) = 668개.
    const manyEvents = Array.from({ length: 500 }, () => release(0, 2000));
    const inputFor = (laneCount: LaneCount): PlayVerificationInput =>
      makeInput({
        laneCount,
        chart: {
          revision: REVISION,
          data: makeChart([tap(0, 3000)], laneCount),
        },
        submission: {
          inputOffsetMs: 0,
          events: manyEvents,
        },
      });

    expect(verifyPlay(inputFor(4))).toEqual({
      kind: 'rejected',
      code: 'invalid_events',
    });
    expect(verifyPlay(inputFor(6)).kind).toBe('verified');
  });

  it('rejects a stored chart whose lane count differs from the chart record', () => {
    expect(verifyPlay(makeInput({ laneCount: 5 }))).toEqual({
      kind: 'rejected',
      code: 'chart_invalid',
    });
  });

  it('maps rejection codes to HTTP statuses', () => {
    expect(
      Object.fromEntries(
        Object.entries(PLAY_REJECTION_RESPONSES).map(([code, { status }]) => [code, status]),
      ),
    ).toEqual({
      session_expired: 410,
      chart_changed: 409,
      chart_invalid: 500,
      too_short: 422,
      invalid_events: 400,
      not_finished: 422,
    });
  });
});

// 표본 50개 이상인 채보가 들어가도록 곡 구간을 늘린다. 제출은 만료 시각에 해 최소 소요 시간을 넘긴다.
const longSong: VerificationSong = {
  key: song.key,
  gameStartMs: 3000,
  gameEndMs: 14000,
};
const SLOT_START_TIME_MS = 3000;
const SLOT_GAP_MS = 200;
// 사람 수준의 흩어진 오차. ±1ms 안의 값이 없고, 연속한 두 값의 차이는 모두 1ms 를 넘는다.
const SCATTERED_OFFSETS_MS = [-23, 17, -8, 31, -15, 6, 27, -30, 12, -4];

function slotTimeMs(slot: number): number {
  return SLOT_START_TIME_MS + slot * SLOT_GAP_MS;
}

function scatteredOffsetMs(index: number): number {
  return requireDefined(
    SCATTERED_OFFSETS_MS[index % SCATTERED_OFFSETS_MS.length],
    'Missing scattered offset',
    index,
  );
}

/** 앞쪽 슬롯은 레인 0·1 의 동시 노트 묶음, 뒤쪽 슬롯은 레인 2·3 을 번갈아 쓰는 단일 tap. */
function chordsThenTaps(chordCount: number, tapCount: number): Note[] {
  return Array.from({ length: chordCount + tapCount }, (_, slot) =>
    slot < chordCount
      ? [tap(0, slotTimeMs(slot)), tap(1, slotTimeMs(slot))]
      : [tap(2 + (slot % 2), slotTimeMs(slot))],
  ).flat();
}

function pressAll(notes: readonly Note[], offsetMs: (note: Note, index: number) => number) {
  return notes
    .map((note, index) => press(note.lane, note.timeMs + offsetMs(note, index)))
    .sort((a, b) => a.songTimeMs - b.songTimeMs);
}

function verifyLongPlay(notes: Note[], playEvents: InputEvent[]): PlayVerification {
  const expiresAtMs = getSessionExpiresAtMs(longSong, ISSUED_AT_MS);
  return verifyPlay(
    makeInput({
      song: longSong,
      chart: {
        revision: REVISION,
        data: makeChart(notes),
      },
      session: {
        chartRevision: REVISION,
        issuedAtMs: ISSUED_AT_MS,
        expiresAtMs,
      },
      submission: {
        inputOffsetMs: 0,
        events: playEvents,
      },
      nowMs: expiresAtMs,
    }),
  );
}

/** 사유는 집합이라 정렬해 비교한다. */
function autoplayCheckOf(verification: PlayVerification) {
  if (verification.kind !== 'verified') {
    throw new Error(`Expected a verified play but got ${verification.code}`);
  }
  const { autoplayCheck } = verification;
  return {
    ...autoplayCheck,
    reasons: [...autoplayCheck.reasons].sort(),
  };
}

describe('verifyPlay autoplay check', () => {
  it('flags presses exactly on every note, chords included, for all three reasons', () => {
    const notes = chordsThenTaps(10, 30);

    expect(
      autoplayCheckOf(
        verifyLongPlay(
          notes,
          pressAll(notes, () => 0),
        ),
      ),
    ).toEqual({
      kind: 'suspicious',
      reasons: ['low_std_dev', 'synced_chords', 'zero_cluster'],
      stats: {
        sampleCount: 50,
        chordCount: 10,
        meanOffsetMs: 0,
        stdDevMs: 0,
        nearZeroRatio: 1,
        syncedChordRatio: 1,
      },
    });
  });

  it('clears human-like scattered presses and still records every stat', () => {
    const notes = chordsThenTaps(10, 30);
    const check = autoplayCheckOf(
      verifyLongPlay(
        notes,
        pressAll(notes, (_, index) => scatteredOffsetMs(index)),
      ),
    );

    expect(check).toMatchObject({
      kind: 'clear',
      reasons: [],
      stats: {
        sampleCount: 50,
        chordCount: 10,
        nearZeroRatio: 0,
        syncedChordRatio: 0,
      },
    });
    expect(check.stats.meanOffsetMs).toBeCloseTo(1.3, 6);
    expect(check.stats.stdDevMs).toBeCloseTo(19.687813, 5);
  });

  it('flags only low_std_dev when every press is late by the same amount without chords', () => {
    const notes = Array.from({ length: 50 }, (_, slot) => tap(slot % 4, slotTimeMs(slot)));

    expect(
      autoplayCheckOf(
        verifyLongPlay(
          notes,
          pressAll(notes, () => 5),
        ),
      ),
    ).toEqual({
      kind: 'suspicious',
      reasons: ['low_std_dev'],
      stats: {
        sampleCount: 50,
        chordCount: 0,
        meanOffsetMs: 5,
        stdDevMs: 0,
        nearZeroRatio: 0,
        syncedChordRatio: null,
      },
    });
  });

  it('leaves 49 samples unjudged and judges 50, counting neither misses nor hold ends', () => {
    // 슬롯마다 레인 0~3 을 돌고, 13 번째마다 hold 를 둔다. 뒤쪽 노트는 누르지 않아 miss 로 둔다.
    const notes = Array.from({ length: 52 }, (_, slot) =>
      slot % 13 === 0
        ? hold(slot % 4, slotTimeMs(slot), slotTimeMs(slot) + 100)
        : tap(slot % 4, slotTimeMs(slot)),
    );
    const playUpTo = (pressedCount: number) =>
      notes
        .slice(0, pressedCount)
        .flatMap((note) =>
          note.type === 'hold'
            ? [press(note.lane, note.timeMs), release(note.lane, note.endTimeMs)]
            : [press(note.lane, note.timeMs)],
        );

    const below = verifyLongPlay(notes, playUpTo(49));
    expect(below).toMatchObject({ result: { counts: { miss: 3 } } });
    expect(autoplayCheckOf(below)).toEqual({
      kind: 'unjudged',
      reasons: [],
      stats: {
        sampleCount: 49,
        chordCount: 0,
        meanOffsetMs: 0,
        stdDevMs: 0,
        nearZeroRatio: 1,
        syncedChordRatio: null,
      },
    });

    const atMinimum = autoplayCheckOf(verifyLongPlay(notes, playUpTo(50)));
    expect(atMinimum.kind).not.toBe('unjudged');
    expect(atMinimum.stats.sampleCount).toBe(50);
  });

  it('leaves a play without any pressed note unjudged with undefined stats', () => {
    const fewNotes = makeChart([tap(0, 3000), tap(1, 3500), tap(2, 4000)]);

    expect(
      autoplayCheckOf(
        verifyPlay(
          makeInput({
            chart: {
              revision: REVISION,
              data: fewNotes,
            },
            submission: {
              inputOffsetMs: 0,
              events: [],
            },
          }),
        ),
      ),
    ).toEqual({
      kind: 'unjudged',
      reasons: [],
      stats: {
        sampleCount: 0,
        chordCount: 0,
        meanOffsetMs: null,
        stdDevMs: null,
        nearZeroRatio: null,
        syncedChordRatio: null,
      },
    });
  });

  it.each([
    {
      chordCount: 9,
      expected: {
        kind: 'clear',
        reasons: [],
      },
    },
    {
      chordCount: 10,
      expected: {
        kind: 'suspicious',
        reasons: ['synced_chords'],
      },
    },
  ])('judges synced chords only from $chordCount chords', ({ chordCount, expected }) => {
    const notes = chordsThenTaps(chordCount, 50 - chordCount * 2);
    // 묶음 안 두 입력은 같은 시각이고, 슬롯끼리는 흩어진 오차를 쓴다.
    const playEvents = pressAll(notes, (note) =>
      scatteredOffsetMs((note.timeMs - SLOT_START_TIME_MS) / SLOT_GAP_MS),
    );

    expect(autoplayCheckOf(verifyLongPlay(notes, playEvents))).toMatchObject({
      ...expected,
      stats: {
        sampleCount: 50,
        chordCount,
        nearZeroRatio: 0,
        syncedChordRatio: 1,
      },
    });
  });
});
