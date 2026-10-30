import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDefined } from '../../../src/invariant.js';
import { PLAY_RESULTS, SCORES } from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { replayGameplay } from '../../../src/rhythm/replay.js';
import type { Chart, InputEvent, Lane, Note } from '../../../src/rhythm/types.js';
import { isRecord } from '../../../src/typeGuards.js';
import { createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const LONG_SONG_KEY = 'autoplay-long';
const SHORT_SONG_KEY = 'autoplay-short';
const LONG_GAME_END_MS = 10_000;
const SHORT_GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of the long song.
const ELAPSED_PLAY_MS = 30_000;
const SLOT_START_TIME_MS = 1_000;
const SLOT_GAP_MS = 200;
// Human-like offsets: none within ±1ms, and consecutive values differ by more than 1ms.
const SCATTERED_OFFSETS_MS = [-23, 17, -8, 31, -15, 6, 27, -30, 12, -4];
const RESPONSE_KEYS = [
  'accuracy',
  'bestScore',
  'cleared',
  'counts',
  'maxCombo',
  'newAchievements',
  'score',
];

function tap(lane: Lane, timeMs: number): Note {
  return {
    type: 'tap',
    timeMs,
    lane,
  };
}

function chartOf(songKey: string, notes: Note[]): Chart {
  return {
    songId: songKey,
    difficulty: 'easy',
    laneCount: 4,
    offsetMs: 0,
    notes,
  };
}

// 10 chords on lanes 0 and 1 followed by 30 single taps alternating lanes 2 and 3: 50 samples.
const longChart = chartOf(
  LONG_SONG_KEY,
  Array.from({ length: 40 }, (_, slot) => {
    const timeMs = SLOT_START_TIME_MS + slot * SLOT_GAP_MS;
    return slot < 10 ? [tap(0, timeMs), tap(1, timeMs)] : [tap(2 + (slot % 2), timeMs)];
  }).flat(),
);
const shortChart = chartOf(
  SHORT_SONG_KEY,
  ([0, 1, 2, 3] as const).map((lane) => tap(lane, 1_000 + lane * 500)),
);

function pressAll(chart: Chart, offsetMs: (index: number) => number): InputEvent[] {
  return chart.notes
    .map((note, index): InputEvent => ({
      lane: note.lane,
      kind: 'press',
      songTimeMs: note.timeMs + offsetMs(index),
    }))
    .sort((a, b) => a.songTimeMs - b.songTimeMs);
}

let dataDir: string;
let server: PocketBaseServer;
let longChartRecord: RecordModel;
let shortChartRecord: RecordModel;
let userCount = 0;

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `autoplay${userCount}@example.com`);
}

async function startRankedPlay(player: TestUser, chart: RecordModel): Promise<string> {
  const { sessionId } = await player.client.send<{ sessionId: string }>(
    '/api/dazbeat/play-sessions',
    {
      method: 'POST',
      body: {
        chartId: chart.id,
        chartRevision: String(chart['revision']),
      },
    },
  );
  // Moves issuedAt into the past so a submission is not rejected as too short without waiting.
  await server.superuser
    .collection('play_sessions')
    .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });
  return sessionId;
}

/** SDK 의 send 는 응답 상태 코드를 주지 않아 상태 코드를 확인하는 제출은 fetch 로 보낸다. */
async function submitResult(
  client: PocketBase,
  sessionId: string,
  inputs: readonly InputEvent[],
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${server.url}/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    headers: {
      Authorization: client.authStore.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputOffsetMs: 0,
      events: inputs,
    }),
  });
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error('Result response is not an object');
  }
  return {
    status: response.status,
    body,
  };
}

async function findPlayResult(sessionId: string): Promise<RecordModel> {
  const { expression, params } = where(PLAY_RESULTS, [{ session: sessionId }]);
  return server.superuser
    .collection(PLAY_RESULTS.name)
    .getFirstListItem(server.superuser.filter(expression, params));
}

beforeAll(async () => {
  dataDir = await createTempDir('autoplay-check');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  const editor = await createUser(server, 'editor@example.com', true);
  const longSong = await createSong(server.superuser, LONG_SONG_KEY, LONG_GAME_END_MS);
  const shortSong = await createSong(server.superuser, SHORT_SONG_KEY, SHORT_GAME_END_MS);
  longChartRecord = await createChart(editor.client, longSong.id, 'easy', longChart);
  shortChartRecord = await createChart(editor.client, shortSong.id, 'easy', shortChart);
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('POST /api/dazbeat/play-sessions/{sessionId}/result autoplay check', () => {
  it('records an exact play as suspicious without changing the response or the best score', async () => {
    const player = await newPlayer();
    const inputs = pressAll(longChart, () => 0);
    const { outcome, ...expected } = replayGameplay(longChart, inputs).result;
    expect(outcome).toBe('finished');
    const sessionId = await startRankedPlay(player, longChartRecord);

    const { status, body: response } = await submitResult(player.client, sessionId, inputs);

    expect(status).toBe(200);
    expect(Object.keys(response).sort()).toEqual(RESPONSE_KEYS);
    expect(response).toMatchObject({
      ...expected,
      bestScore: expected.score,
    });
    const { expression, params } = where(SCORES, [{ user: player.id }]);
    expect(
      await server.superuser
        .collection(SCORES.name)
        .getFullList({ filter: server.superuser.filter(expression, params) }),
    ).toEqual([
      expect.objectContaining({
        chart: longChartRecord.id,
        score: expected.score,
      }),
    ]);
    const playResult = await findPlayResult(sessionId);
    expect(playResult['autoplayCheck']).toBe('suspicious');
    // The reasons are a set, so their order is not checked.
    expect(playResult['autoplayReasons']).toHaveLength(3);
    expect(playResult['autoplayReasons']).toEqual(
      expect.arrayContaining(['low_std_dev', 'synced_chords', 'zero_cluster']),
    );
    expect(playResult['inputStats']).toEqual({
      sampleCount: 50,
      chordCount: 10,
      meanOffsetMs: 0,
      stdDevMs: 0,
      nearZeroRatio: 1,
      syncedChordRatio: 1,
    });
  });

  it('records a human-like play as clear with every stat', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, longChartRecord);

    await submitResult(
      player.client,
      sessionId,
      pressAll(longChart, (index) =>
        requireDefined(
          SCATTERED_OFFSETS_MS[index % SCATTERED_OFFSETS_MS.length],
          'Missing scattered offset',
          index,
        ),
      ),
    );

    const playResult = await findPlayResult(sessionId);
    expect(playResult).toMatchObject({
      autoplayCheck: 'clear',
      autoplayReasons: [],
      inputStats: {
        sampleCount: 50,
        chordCount: 10,
        nearZeroRatio: 0,
        syncedChordRatio: 0,
      },
    });
    expect(playResult['inputStats']).toHaveProperty('meanOffsetMs', expect.closeTo(1.3, 6));
    expect(playResult['inputStats']).toHaveProperty('stdDevMs', expect.closeTo(19.687813, 5));
  });

  it('leaves a play with fewer samples than the minimum unjudged', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, shortChartRecord);

    await submitResult(
      player.client,
      sessionId,
      pressAll(shortChart, () => 0),
    );

    expect(await findPlayResult(sessionId)).toMatchObject({
      autoplayCheck: 'unjudged',
      autoplayReasons: [],
      inputStats: {
        sampleCount: 4,
        chordCount: 0,
        meanOffsetMs: 0,
        stdDevMs: 0,
        nearZeroRatio: 1,
        syncedChordRatio: null,
      },
    });
  });

  it('keeps the check out of the player API', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, longChartRecord);
    const { body: response } = await submitResult(
      player.client,
      sessionId,
      pressAll(longChart, () => 0),
    );
    const playResult = await findPlayResult(sessionId);

    expect(Object.keys(response).sort()).toEqual(RESPONSE_KEYS);
    const records = player.client.collection(PLAY_RESULTS.name);
    await expect(records.getList()).rejects.toMatchObject({ status: 403 });
    await expect(records.getOne(playResult.id)).rejects.toMatchObject({ status: 403 });
  });
});
