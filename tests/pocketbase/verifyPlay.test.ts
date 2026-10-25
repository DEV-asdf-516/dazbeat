import { describe, expect, it } from 'vitest';
import {
  getSessionExpiresAtMs,
  PLAY_REJECTION_RESPONSES,
  verifyPlay,
  type PlayVerificationInput,
  type VerificationSong,
} from '../../pocketbase/verification/verifyPlay.js';
import { replayGameplay } from '../../src/rhythm/replay.js';
import type { Chart, InputEvent, Lane, LaneCount, Note } from '../../src/rhythm/types.js';
import { simulateClientPlay } from '../rhythm/playSimulation.js';

// 재생 시작 1000ms(리드인 2000ms) → 플레이 길이 9000ms, 최소 소요 시간 8100ms.
const song: VerificationSong = {
  key: 'test-song',
  gameStartMs: 3000,
  gameEndMs: 10000,
};
const ISSUED_AT_MS = 1_800_000_000_000;
const MIN_ELAPSED_MS = 8100;
const REVISION = 'rev-1';

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
    const expected = replayGameplay(chart, events);

    expect(verifyPlay(makeInput())).toEqual({
      kind: 'verified',
      result: expected,
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
