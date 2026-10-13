import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JUDGMENT_WINDOWS } from '../../../src/rhythm/judgment.js';
import type { Chart, Difficulty, InputEvent } from '../../../src/rhythm/types.js';
import { simulateClientPlay } from '../../rhythm/playSimulation.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const SONG_KEY = 'ranked';
const MUTABLE_SONG_KEY = 'mutable';
const GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of a 5 s song.
const ELAPSED_PLAY_MS = 10_000;
const FRAME_INTERVAL_MS = 17;
const FRAME_TIMES_MS = Array.from(
  { length: Math.ceil((GAME_END_MS + 1_000) / FRAME_INTERVAL_MS) },
  (_, index) => index * FRAME_INTERVAL_MS,
);

interface SessionResponse {
  sessionId: string;
  expiresAt: string;
}

interface ResultResponse {
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<string, number>;
  cleared: boolean;
  bestScore: number;
}

interface PlayBody {
  inputOffsetMs: unknown;
  events: unknown;
  [field: string]: unknown;
}

function chartOf(songKey: string, difficulty: Difficulty, notes: Chart['notes']): Chart {
  return { songId: songKey, difficulty, offsetMs: 0, notes };
}

const tapChart = chartOf(SONG_KEY, 'easy', [
  { type: 'tap', timeMs: 1_000, lane: 0 },
  { type: 'tap', timeMs: 1_500, lane: 1 },
  { type: 'tap', timeMs: 2_000, lane: 2 },
  { type: 'tap', timeMs: 2_500, lane: 3 },
]);
const holdChart = chartOf(SONG_KEY, 'normal', [
  { type: 'hold', timeMs: 1_000, endTimeMs: 2_000, lane: 0 },
  { type: 'hold', timeMs: 2_500, endTimeMs: 3_500, lane: 2 },
]);
const mixedChart = chartOf(SONG_KEY, 'hard', [
  { type: 'tap', timeMs: 1_000, lane: 0 },
  { type: 'hold', timeMs: 2_000, endTimeMs: 3_000, lane: 1 },
  { type: 'tap', timeMs: 2_500, lane: 3 },
  { type: 'tap', timeMs: 3_500, lane: 0 },
]);
// Ten misses empty the HP, so a play without inputs fails.
const failingChart = chartOf(
  SONG_KEY,
  'expert',
  Array.from({ length: 10 }, (_, index) => ({
    type: 'tap' as const,
    timeMs: 1_000 + index * 100,
    lane: 0 as const,
  })),
);
const mutableChart = chartOf(MUTABLE_SONG_KEY, 'easy', tapChart.notes);

const tapPerfectInputs: InputEvent[] = tapChart.notes.flatMap((note) => [
  { lane: note.lane, kind: 'press', songTimeMs: note.timeMs },
  { lane: note.lane, kind: 'release', songTimeMs: note.timeMs + 50 },
]);

let dataDir: string;
let server: PocketBaseServer;
let editor: TestUser;
let userCount = 0;
const chartRecords = new Map<Chart, RecordModel>();

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `player${userCount}@example.com`);
}

function recordOf(chart: Chart): RecordModel {
  const record = chartRecords.get(chart);
  if (record === undefined) {
    throw new Error(`Chart ${chart.songId}/${chart.difficulty} was not created`);
  }
  return record;
}

function issueSession(client: PocketBase, body: unknown): Promise<SessionResponse> {
  return client.send<SessionResponse>('/api/dazbeat/play-sessions', { method: 'POST', body });
}

function revisionOf(record: RecordModel): string {
  const revision: unknown = record['revision'];
  if (typeof revision !== 'string') {
    throw new Error(`Chart ${record.id} has no revision`);
  }
  return revision;
}

function sessionBodyOf(record: RecordModel): { chartId: string; chartRevision: string } {
  return { chartId: record.id, chartRevision: revisionOf(record) };
}

function submitResult(
  client: PocketBase,
  sessionId: string,
  body: PlayBody,
): Promise<ResultResponse> {
  return client.send<ResultResponse>(`/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    body,
  });
}

/** Moves issuedAt into the past so a submission is not rejected as too short without waiting. */
async function backdateSession(sessionId: string): Promise<void> {
  await server.superuser
    .collection('play_sessions')
    .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });
}

async function startRankedPlay(player: TestUser, chart: Chart): Promise<string> {
  const { sessionId } = await issueSession(player.client, sessionBodyOf(recordOf(chart)));
  await backdateSession(sessionId);
  return sessionId;
}

function findScores(userId: string, chart: Chart): Promise<RecordModel[]> {
  return server.superuser.collection('scores').getFullList({
    filter: server.superuser.filter('user = {:user} && chart = {:chart}', {
      user: userId,
      chart: recordOf(chart).id,
    }),
  });
}

function expectRejection(request: Promise<unknown>, status: number, code: string): Promise<void> {
  return expect(request).rejects.toMatchObject({ status, response: { status, code } });
}

function sessionExists(sessionId: string): Promise<boolean> {
  return server.superuser
    .collection('play_sessions')
    .getOne(sessionId)
    .then(
      () => true,
      (error: unknown) => {
        expect(error).toMatchObject({ status: 404 });
        return false;
      },
    );
}

async function expectServerMatchesClient(
  chart: Chart,
  inputs: readonly InputEvent[],
): Promise<void> {
  const player = await newPlayer();
  const play = simulateClientPlay(chart, inputs, FRAME_TIMES_MS);
  const { outcome, ...expected } = play.result;
  expect(outcome).toBe('finished');

  const sessionId = await startRankedPlay(player, chart);
  const response = await submitResult(player.client, sessionId, {
    inputOffsetMs: 0,
    events: play.inputs,
  });

  expect(response).toEqual({ ...expected, bestScore: expected.score });
  const [stored, ...others] = await findScores(player.id, chart);
  expect(others).toEqual([]);
  expect(stored).toMatchObject({ ...expected, chartRevision: revisionOf(recordOf(chart)) });
}

beforeAll(async () => {
  dataDir = await createTempDir('play-sessions');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  editor = await createUser(server, 'editor@example.com', true);
  const song = await createSong(server.superuser, SONG_KEY, GAME_END_MS);
  const mutableSong = await createSong(server.superuser, MUTABLE_SONG_KEY, GAME_END_MS);
  for (const chart of [tapChart, holdChart, mixedChart, failingChart]) {
    chartRecords.set(chart, await createChart(editor.client, song.id, chart.difficulty, chart));
  }
  chartRecords.set(
    mutableChart,
    await createChart(editor.client, mutableSong.id, mutableChart.difficulty, mutableChart),
  );
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('POST /api/dazbeat/play-sessions', () => {
  it('issues a session bound to the current chart revision', async () => {
    const player = await newPlayer();
    const record = recordOf(tapChart);
    const beforeMs = Date.now();
    const response = await issueSession(player.client, sessionBodyOf(record));

    const session = await server.superuser.collection('play_sessions').getOne(response.sessionId);
    expect(session).toMatchObject({
      user: player.id,
      chart: record.id,
      chartRevision: revisionOf(record),
    });
    // Play duration 5 s + 15 min grace.
    const expiresAtMs = Date.parse(response.expiresAt);
    expect(expiresAtMs).toBeGreaterThanOrEqual(beforeMs + GAME_END_MS + 15 * 60 * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + GAME_END_MS + 15 * 60 * 1000);
  });

  it('replaces the previous session of the same user', async () => {
    const player = await newPlayer();
    const first = await issueSession(player.client, sessionBodyOf(recordOf(tapChart)));
    const second = await issueSession(player.client, sessionBodyOf(recordOf(holdChart)));

    expect(await sessionExists(first.sessionId)).toBe(false);
    const sessions = await server.superuser.collection('play_sessions').getFullList({
      filter: server.superuser.filter('user = {:user}', { user: player.id }),
    });
    expect(sessions.map((session) => session.id)).toEqual([second.sessionId]);
    await expectRejection(
      submitResult(player.client, first.sessionId, { inputOffsetMs: 0, events: [] }),
      404,
      'session_not_found',
    );
  });

  it('rejects a malformed body, a missing chart and a stale revision', async () => {
    const player = await newPlayer();
    const record = recordOf(tapChart);
    await expectRejection(
      issueSession(player.client, { chartId: 1, chartRevision: revisionOf(record) }),
      400,
      'invalid_request',
    );
    await expectRejection(
      issueSession(player.client, { chartId: 'missingchart123', chartRevision: 'x' }),
      404,
      'chart_not_found',
    );
    await expectRejection(
      issueSession(player.client, { chartId: record.id, chartRevision: 'stale' }),
      409,
      'chart_changed',
    );
  });

  it('requires a signed-in user', async () => {
    const body = sessionBodyOf(recordOf(tapChart));
    await expect(issueSession(createClient(server.url), body)).rejects.toMatchObject({
      status: 401,
    });
    // requireAuth('users') answers 403 to an auth record of another collection.
    await expect(issueSession(server.superuser, body)).rejects.toMatchObject({ status: 403 });
  });
});

describe('POST /api/dazbeat/play-sessions/{sessionId}/result', () => {
  it('matches the client result for a TAP chart', async () => {
    await expectServerMatchesClient(tapChart, tapPerfectInputs);
  });

  it('matches the client result for a HOLD chart', async () => {
    await expectServerMatchesClient(holdChart, [
      { lane: 0, kind: 'press', songTimeMs: 1_010 },
      { lane: 0, kind: 'release', songTimeMs: 1_900 },
      { lane: 2, kind: 'press', songTimeMs: 2_480 },
      { lane: 2, kind: 'release', songTimeMs: 3_600 },
    ]);
  });

  it('matches the client result for a mixed chart', async () => {
    await expectServerMatchesClient(mixedChart, [
      { lane: 0, kind: 'press', songTimeMs: 1_060 },
      { lane: 0, kind: 'release', songTimeMs: 1_100 },
      { lane: 1, kind: 'press', songTimeMs: 2_000 },
      { lane: 3, kind: 'press', songTimeMs: 2_520 },
      { lane: 3, kind: 'release', songTimeMs: 2_560 },
      { lane: 1, kind: 'release', songTimeMs: 2_700 },
      { lane: 0, kind: 'press', songTimeMs: 3_500 },
      { lane: 0, kind: 'release', songTimeMs: 3_550 },
    ]);
  });

  it('matches the client result on judgment window boundaries', async () => {
    const { perfectMs, badMs } = JUDGMENT_WINDOWS;
    await expectServerMatchesClient(tapChart, [
      { lane: 0, kind: 'press', songTimeMs: 1_000 + badMs },
      { lane: 1, kind: 'press', songTimeMs: 1_500 - badMs },
      { lane: 2, kind: 'press', songTimeMs: 2_000 + badMs + 1 },
      { lane: 3, kind: 'press', songTimeMs: 2_500 + perfectMs },
    ]);
  });

  it('accepts a release without a press, consecutive presses and a press while holding', async () => {
    await expectServerMatchesClient(mixedChart, [
      { lane: 0, kind: 'release', songTimeMs: 500 },
      { lane: 0, kind: 'press', songTimeMs: 1_000 },
      { lane: 0, kind: 'press', songTimeMs: 1_010 },
      { lane: 1, kind: 'press', songTimeMs: 2_000 },
      { lane: 1, kind: 'press', songTimeMs: 2_100 },
      { lane: 1, kind: 'release', songTimeMs: 3_000 },
    ]);
  });

  it('ignores forged result fields and user ids in the body', async () => {
    const player = await newPlayer();
    const other = await newPlayer();
    const play = simulateClientPlay(tapChart, [tapPerfectInputs[0]!], FRAME_TIMES_MS);
    const sessionId = await startRankedPlay(player, tapChart);

    const response = await submitResult(player.client, sessionId, {
      inputOffsetMs: 0,
      events: play.inputs,
      score: 1_000_000,
      accuracy: 100,
      maxCombo: 4,
      cleared: true,
      counts: { perfect: 4, great: 0, good: 0, bad: 0, miss: 0 },
      user: other.id,
    });

    expect(response.score).toBe(play.result.score);
    expect(response.counts).toEqual(play.result.counts);
    expect(await findScores(other.id, tapChart)).toEqual([]);
    const [stored] = await findScores(player.id, tapChart);
    expect(stored).toMatchObject({ score: play.result.score, cleared: play.result.cleared });
  });

  it.each<[string, PlayBody]>([
    [
      'a corrupted event',
      { inputOffsetMs: 0, events: [{ lane: 7, kind: 'press', songTimeMs: 1_000 }] },
    ],
    [
      'events going back in time',
      {
        inputOffsetMs: 0,
        events: [
          { lane: 0, kind: 'press', songTimeMs: 1_000 },
          { lane: 0, kind: 'release', songTimeMs: 999 },
        ],
      },
    ],
    ['an input offset out of range', { inputOffsetMs: 301, events: [] }],
    [
      'an event after the allowed range',
      { inputOffsetMs: 0, events: [{ lane: 0, kind: 'press', songTimeMs: 60_000 }] },
    ],
    [
      'too many events',
      {
        inputOffsetMs: 0,
        events: Array.from({ length: 1_000 }, () => ({
          lane: 0,
          kind: 'press',
          songTimeMs: 1_000,
        })),
      },
    ],
  ])('rejects %s with 400 and stores nothing', async (_case, body) => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, tapChart);
    await expectRejection(submitResult(player.client, sessionId, body), 400, 'invalid_events');
    expect(await sessionExists(sessionId)).toBe(false);
    expect(await findScores(player.id, tapChart)).toEqual([]);
  });

  it('rejects a submission sooner than the play could finish and consumes the session', async () => {
    const player = await newPlayer();
    const { sessionId } = await issueSession(player.client, sessionBodyOf(recordOf(tapChart)));
    const body = { inputOffsetMs: 0, events: tapPerfectInputs };

    await expectRejection(submitResult(player.client, sessionId, body), 422, 'too_short');
    expect(await sessionExists(sessionId)).toBe(false);
    await expectRejection(submitResult(player.client, sessionId, body), 404, 'session_not_found');
    expect(await findScores(player.id, tapChart)).toEqual([]);
  });

  it('accepts a session only once', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, tapChart);
    const body = { inputOffsetMs: 0, events: tapPerfectInputs };

    await submitResult(player.client, sessionId, body);
    await expectRejection(submitResult(player.client, sessionId, body), 404, 'session_not_found');
  });

  it('accepts exactly one of parallel submissions of the same session', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, tapChart);
    const body = { inputOffsetMs: 0, events: tapPerfectInputs };

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => submitResult(player.client, sessionId, body)),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toMatchObject({
          status: 404,
          response: { code: 'session_not_found' },
        });
      }
    }
    expect(await findScores(player.id, tapChart)).toHaveLength(1);
  });

  it("hides another user's session and keeps it for its owner", async () => {
    const owner = await newPlayer();
    const intruder = await newPlayer();
    const sessionId = await startRankedPlay(owner, tapChart);
    const body = { inputOffsetMs: 0, events: tapPerfectInputs };

    await expectRejection(submitResult(intruder.client, sessionId, body), 404, 'session_not_found');
    expect(await sessionExists(sessionId)).toBe(true);
    await submitResult(owner.client, sessionId, body);
    expect(await findScores(intruder.id, tapChart)).toEqual([]);
    expect(await findScores(owner.id, tapChart)).toHaveLength(1);
  });

  it('rejects a submission after the chart content changed', async () => {
    const player = await newPlayer();
    const before = recordOf(mutableChart);
    const sessionId = await startRankedPlay(player, mutableChart);
    await editor.client.collection('charts').update(before.id, {
      data: { ...mutableChart, offsetMs: 10 },
    });

    await expectRejection(
      submitResult(player.client, sessionId, { inputOffsetMs: 0, events: tapPerfectInputs }),
      409,
      'chart_changed',
    );
    expect(await sessionExists(sessionId)).toBe(false);
    await expectRejection(issueSession(player.client, sessionBodyOf(before)), 409, 'chart_changed');
  });

  it('rejects an expired session', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, tapChart);
    await server.superuser
      .collection('play_sessions')
      .update(sessionId, { expiresAt: new Date(Date.now() - 1_000).toISOString() });

    await expectRejection(
      submitResult(player.client, sessionId, { inputOffsetMs: 0, events: tapPerfectInputs }),
      410,
      'session_expired',
    );
    expect(await sessionExists(sessionId)).toBe(false);
  });

  it('does not store a failed play', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, failingChart);

    await expectRejection(
      submitResult(player.client, sessionId, { inputOffsetMs: 0, events: [] }),
      422,
      'not_finished',
    );
    expect(await findScores(player.id, failingChart)).toEqual([]);
  });

  it('requires a signed-in user', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, tapChart);
    const body = { inputOffsetMs: 0, events: tapPerfectInputs };

    await expect(submitResult(createClient(server.url), sessionId, body)).rejects.toMatchObject({
      status: 401,
    });
    await expect(submitResult(server.superuser, sessionId, body)).rejects.toMatchObject({
      status: 403,
    });
    expect(await sessionExists(sessionId)).toBe(true);
  });

  it('keeps only the best result of each user and chart revision', async () => {
    const player = await newPlayer();
    const lowInputs = [tapPerfectInputs[0]!];
    const low = simulateClientPlay(tapChart, lowInputs, FRAME_TIMES_MS).result;
    const high = simulateClientPlay(tapChart, tapPerfectInputs, FRAME_TIMES_MS).result;
    expect(high.score).toBeGreaterThan(low.score);
    const play = async (inputs: readonly InputEvent[]): Promise<ResultResponse> =>
      submitResult(player.client, await startRankedPlay(player, tapChart), {
        inputOffsetMs: 0,
        events: inputs,
      });

    expect(await play(lowInputs)).toMatchObject({ score: low.score, bestScore: low.score });
    expect(await play(tapPerfectInputs)).toMatchObject({
      score: high.score,
      bestScore: high.score,
    });
    expect(await play(lowInputs)).toMatchObject({ score: low.score, bestScore: high.score });

    const [stored, ...others] = await findScores(player.id, tapChart);
    expect(others).toEqual([]);
    expect(stored).toMatchObject({
      score: high.score,
      accuracy: high.accuracy,
      maxCombo: high.maxCombo,
      cleared: high.cleared,
      counts: high.counts,
    });
  });
});
