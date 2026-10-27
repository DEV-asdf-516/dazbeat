import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_MARKS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  SCORES,
} from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import type { Chart, InputEvent } from '../../../src/rhythm/types.js';
import { simulateClientPlay } from '../../rhythm/playSimulation.js';
import { createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const LEO_SONG_KEY = 'leo';
const VIRGO_SONG_KEY = 'virgo';
const GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of a 5 s song.
const ELAPSED_PLAY_MS = 10_000;
const FRAME_INTERVAL_MS = 17;
const FRAME_TIMES_MS = Array.from(
  { length: Math.ceil((GAME_END_MS + 1_000) / FRAME_INTERVAL_MS) },
  (_, index) => index * FRAME_INTERVAL_MS,
);
// The first play of a fresh user on the only chart of the only leo song, played perfectly.
const FIRST_PERFECT_LEO_ACHIEVEMENTS = [
  'FIRST_CLEAR',
  'FIRST_FINISH',
  'FIRST_S',
  'FIRST_FC',
  'FIRST_AP',
  'ZODIAC_LEO',
  'ZODIAC_1_COMPLETE',
  'ZODIAC_LEO_S',
  'ZODIAC_LEO_FC',
  'ZODIAC_LEO_AP',
];

interface ResultResponse {
  score: number;
  bestScore: number;
  newAchievements: string[];
}

function tapChartOf(songKey: string): Chart {
  return {
    songId: songKey,
    difficulty: 'easy',
    laneCount: 4,
    offsetMs: 0,
    notes: ([0, 1, 2, 3] as const).map((lane) => ({
      type: 'tap' as const,
      timeMs: 1_000 + lane * 500,
      lane,
    })),
  };
}

const leoChart = tapChartOf(LEO_SONG_KEY);
const virgoChart = tapChartOf(VIRGO_SONG_KEY);
const perfectInputs: InputEvent[] = leoChart.notes.flatMap((note) => [
  {
    lane: note.lane,
    kind: 'press',
    songTimeMs: note.timeMs,
  },
  {
    lane: note.lane,
    kind: 'release',
    songTimeMs: note.timeMs + 50,
  },
]);
// One perfect and three misses: the play finishes but stays below the clear accuracy.
const unclearedInputs = perfectInputs.slice(0, 2);

let dataDir: string;
let server: PocketBaseServer;
let editor: TestUser;
let leoSong: RecordModel;
let leoChartRecord: RecordModel;
let virgoChartRecord: RecordModel;
let userCount = 0;

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `achiever${userCount}@example.com`);
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

function submitResult(
  client: PocketBase,
  sessionId: string,
  inputs: readonly InputEvent[],
): Promise<ResultResponse> {
  return client.send<ResultResponse>(`/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    body: {
      inputOffsetMs: 0,
      events: inputs,
    },
  });
}

async function playRanked(
  player: TestUser,
  chart: RecordModel,
  inputs: readonly InputEvent[],
): Promise<ResultResponse> {
  return submitResult(player.client, await startRankedPlay(player, chart), inputs);
}

function listOwn(
  collection: string,
  filter: { expression: string; params: Record<string, string | number | boolean> },
): Promise<RecordModel[]> {
  return server.superuser.collection(collection).getFullList({
    filter: server.superuser.filter(filter.expression, filter.params),
  });
}

const findPlayResults = (userId: string) =>
  listOwn(PLAY_RESULTS.name, where(PLAY_RESULTS, [{ user: userId }]));
const findMarks = (userId: string) =>
  listOwn(ACHIEVEMENT_MARKS.name, where(ACHIEVEMENT_MARKS, [{ user: userId }]));
const findEarned = async (userId: string): Promise<string[]> =>
  (await listOwn(EARNED_ACHIEVEMENTS.name, where(EARNED_ACHIEVEMENTS, [{ user: userId }]))).map(
    (record) => String(record['achievement']),
  );

beforeAll(async () => {
  dataDir = await createTempDir('achievements');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  editor = await createUser(server, 'editor@example.com', true);
  leoSong = await createSong(server.superuser, LEO_SONG_KEY, GAME_END_MS, {
    constellation: 'leo',
  });
  const virgoSong = await createSong(server.superuser, VIRGO_SONG_KEY, GAME_END_MS, {
    constellation: 'virgo',
  });
  leoChartRecord = await createChart(editor.client, leoSong.id, 'easy', leoChart);
  virgoChartRecord = await createChart(editor.client, virgoSong.id, 'easy', virgoChart);
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('POST /api/dazbeat/play-sessions/{sessionId}/result achievements', () => {
  it('records the play, its marks and the new achievements and answers them', async () => {
    const player = await newPlayer();
    const play = simulateClientPlay(leoChart, perfectInputs, FRAME_TIMES_MS);
    const { outcome, ...expected } = play.result;
    expect(outcome).toBe('finished');
    const sessionId = await startRankedPlay(player, leoChartRecord);

    const response = await submitResult(player.client, sessionId, play.inputs);

    expect(response.newAchievements).toEqual(FIRST_PERFECT_LEO_ACHIEVEMENTS);
    const revision = String(leoChartRecord['revision']);
    expect(await findPlayResults(player.id)).toEqual([
      expect.objectContaining({
        session: sessionId,
        song: leoSong.id,
        chart: leoChartRecord.id,
        difficulty: 'easy',
        laneCount: 4,
        chartRevision: revision,
        constellation: 'leo',
        ...expected,
      }),
    ]);
    const marks = await findMarks(player.id);
    expect(marks.map((mark) => String(mark['kind'])).sort()).toEqual(['ap', 'clear', 'fc', 's']);
    for (const mark of marks) {
      expect(mark).toMatchObject({
        song: leoSong.id,
        difficulty: 'easy',
        chart: leoChartRecord.id,
        chartRevision: revision,
        constellation: 'leo',
        source: 'play',
      });
    }
    expect((await findEarned(player.id)).sort()).toEqual(
      [...FIRST_PERFECT_LEO_ACHIEVEMENTS].sort(),
    );

    const repeated = await playRanked(player, leoChartRecord, play.inputs);
    expect(repeated.newAchievements).toEqual([]);
    expect(await findPlayResults(player.id)).toHaveLength(2);
    expect(await findMarks(player.id)).toHaveLength(4);
    expect(await findEarned(player.id)).toHaveLength(FIRST_PERFECT_LEO_ACHIEVEMENTS.length);
  });

  it('records a play that does not beat the best score', async () => {
    const player = await newPlayer();
    const best = await playRanked(player, leoChartRecord, perfectInputs);
    await playRanked(player, leoChartRecord, unclearedInputs);

    const third = await playRanked(player, leoChartRecord, unclearedInputs);

    expect(third.bestScore).toBe(best.score);
    expect(third.score).toBeLessThan(best.score);
    expect(third.newAchievements).toEqual(['PLAY_3']);
    expect(await findPlayResults(player.id)).toHaveLength(3);
    expect(await findEarned(player.id)).toContain('PLAY_3');
  });

  it('counts a play below the clear accuracy only as a play', async () => {
    const player = await newPlayer();
    const response = await playRanked(player, leoChartRecord, unclearedInputs);

    expect(response.newAchievements).toEqual(['FIRST_FINISH']);
    expect(await findPlayResults(player.id)).toEqual([expect.objectContaining({ cleared: false })]);
    expect(await findMarks(player.id)).toEqual([]);
    expect(await findEarned(player.id)).toEqual(['FIRST_FINISH']);
  });

  it('proves marks on the issued revision only when the chart changed during the play', async () => {
    const player = await newPlayer();
    const issuedRevision = String(virgoChartRecord['revision']);
    const sessionId = await startRankedPlay(player, virgoChartRecord);
    const changed = await editor.client.collection('charts').update(virgoChartRecord.id, {
      data: {
        ...virgoChart,
        offsetMs: 10,
      },
    });
    expect(changed['revision']).not.toBe(issuedRevision);

    const response = await submitResult(player.client, sessionId, perfectInputs);

    // Past-wide achievements count the mark, but the current completion of virgo does not.
    expect(response.newAchievements).toEqual([
      'FIRST_CLEAR',
      'FIRST_FINISH',
      'FIRST_S',
      'FIRST_FC',
      'FIRST_AP',
    ]);
    expect(await findPlayResults(player.id)).toEqual([
      expect.objectContaining({ chartRevision: issuedRevision }),
    ]);
    const marks = await findMarks(player.id);
    expect(marks).toHaveLength(4);
    for (const mark of marks) {
      expect(mark['chartRevision']).toBe(issuedRevision);
    }
    const scoreFilter = where(SCORES, [{ user: player.id }]);
    const [score] = await listOwn(SCORES.name, scoreFilter);
    expect(score?.['chartRevision']).toBe(changed['revision']);
  });

  it('records one play and grants once for duplicate and parallel submissions of a session', async () => {
    const player = await newPlayer();
    const sessionId = await startRankedPlay(player, leoChartRecord);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => submitResult(player.client, sessionId, perfectInputs)),
    );
    await expect(submitResult(player.client, sessionId, perfectInputs)).rejects.toMatchObject({
      status: 404,
    });

    const accepted = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value] : [],
    );
    expect(accepted.map((response) => response.newAchievements)).toEqual([
      FIRST_PERFECT_LEO_ACHIEVEMENTS,
    ]);
    expect(await findPlayResults(player.id)).toHaveLength(1);
    expect(await findMarks(player.id)).toHaveLength(4);
    expect((await findEarned(player.id)).sort()).toEqual(
      [...FIRST_PERFECT_LEO_ACHIEVEMENTS].sort(),
    );
  });
});
