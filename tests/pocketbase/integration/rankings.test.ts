import { MY_RANK_LIMIT } from '../../../src/data/ranking.js';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Leaderboard } from '../../../src/data/ranking.js';
import type { Chart, Difficulty, InputEvent, LaneCount } from '../../../src/rhythm/types.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of a 5 s song.
const ELAPSED_PLAY_MS = 10_000;
const TOP_ENTRY_KEYS = ['accuracy', 'featuredAchievement', 'isMe', 'nickname', 'rank', 'score'];
const LEADERBOARD_KEYS = [
  'chartId',
  'chartRevision',
  'hasPreviousRevisionRecord',
  'me',
  'top',
  'totalPlayers',
];
const MY_RECORD_KEYS = [
  'accuracy',
  'cleared',
  'difficulty',
  'laneCount',
  'maxCombo',
  'score',
  'songId',
];
const ANY_STRING: unknown = expect.any(String);

interface RankedChartItem {
  chartId: string;
  songId: string;
  songTitle: string;
  constellation: string;
  laneCount: number;
  difficulty: string;
  rank: number;
  score: number;
  achievedAt: string;
}

let dataDir: string;
let server: PocketBaseServer;
let editor: TestUser;
let userCount = 0;

// One tap per lane, so a play has fewer samples than the autoplay check needs and is approved.
function chartOf(songKey: string, difficulty: Difficulty, laneCount: LaneCount = 4): Chart {
  return {
    songId: songKey,
    difficulty,
    laneCount,
    offsetMs: 0,
    notes: Array.from({ length: laneCount }, (_, lane) => ({
      type: 'tap' as const,
      timeMs: 1_000 + lane * 500,
      lane,
    })),
  };
}

function perfectInputs(chart: Chart): InputEvent[] {
  return chart.notes.flatMap((note) => [
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
}

/** Hits only the first note, so it scores lower than a perfect play. */
function lowInputs(chart: Chart): InputEvent[] {
  return perfectInputs(chart).slice(0, 2);
}

interface RankedTestChart {
  data: Chart;
  record: RecordModel;
}

async function createRankedChart(
  songKey: string,
  song: { isPublished?: boolean } = {},
): Promise<RankedTestChart> {
  const songRecord = await createSong(server.superuser, songKey, GAME_END_MS, song);
  const data = chartOf(songKey, 'easy');
  return {
    data,
    record: await createChart(editor.client, songRecord.id, 'easy', data),
  };
}

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `ranker${userCount}@example.com`);
}

async function nicknameOf(player: TestUser): Promise<string> {
  return String((await server.superuser.collection('users').getOne(player.id))['nickname']);
}

async function play(
  player: TestUser,
  chart: RecordModel,
  inputs: readonly InputEvent[],
): Promise<{ score: number; accuracy: number; maxCombo: number; cleared: boolean }> {
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
  return player.client.send(`/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    body: {
      inputOffsetMs: 0,
      events: inputs,
    },
  });
}

function readLeaderboard(client: PocketBase, chartId: string): Promise<Leaderboard> {
  return client.send<Leaderboard>(`/api/dazbeat/leaderboards/${chartId}`, { method: 'GET' });
}

interface RankedChartCursorItem {
  value: number;
  chartId: string;
}

async function readMyRankingPage(
  client: PocketBase,
  cursor: RankedChartCursorItem | null = null,
  sort?: string,
): Promise<{ items: RankedChartItem[]; next: RankedChartCursorItem | null }> {
  return client.send('/api/dazbeat/profile/rankings', {
    method: 'GET',
    query: {
      ...(sort === undefined ? {} : { sort }),
      ...(cursor === null
        ? {}
        : {
            afterValue: cursor.value,
            afterChartId: cursor.chartId,
          }),
    },
  });
}

async function readMyRankings(client: PocketBase): Promise<RankedChartItem[]> {
  return (await readMyRankingPage(client)).items;
}

async function editChart(chart: RankedTestChart): Promise<void> {
  await editor.client.collection('charts').update(chart.record.id, {
    data: {
      ...chart.data,
      offsetMs: 10,
    },
    baseRevision: String(chart.record['revision']),
  });
}

beforeAll(async () => {
  dataDir = await createTempDir('rankings');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  editor = await createUser(server, 'editor@example.com', true);
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('GET /api/dazbeat/leaderboards/{chartId}', () => {
  it('keeps the lane counts and difficulties of one song apart', async () => {
    const songKey = 'mixed';
    const song = await createSong(server.superuser, songKey, GAME_END_MS);
    const charts = await Promise.all(
      (
        [
          ['easy', 4],
          ['easy', 5],
          ['normal', 4],
        ] as const
      ).map(async ([difficulty, laneCount]) => {
        const data = chartOf(songKey, difficulty, laneCount);
        return {
          data,
          record: await createChart(editor.client, song.id, difficulty, data, laneCount),
        };
      }),
    );
    const players = [];
    for (const chart of charts) {
      const player = await newPlayer();
      await play(player, chart.record, perfectInputs(chart.data));
      players.push(player);
    }

    for (const [index, chart] of charts.entries()) {
      const player = players[index]!;
      const board = await readLeaderboard(player.client, chart.record.id);
      expect(board.totalPlayers).toBe(1);
      expect(board.top).toEqual([
        expect.objectContaining({
          rank: 1,
          nickname: await nicknameOf(player),
          isMe: true,
        }),
      ]);
    }
  });

  it('lists up to 20 players and answers the rank of the 21st', async () => {
    const chart = await createRankedChart('crowd');
    const expectBoard = async (client: PocketBase, topLength: number, totalPlayers: number) => {
      const board = await readLeaderboard(client, chart.record.id);
      expect(board.top).toHaveLength(topLength);
      expect(board.top.map(({ rank }) => rank)).toEqual(
        Array.from({ length: topLength }, (_, index) => index + 1),
      );
      expect(board.totalPlayers).toBe(totalPlayers);
      return board;
    };
    const anonymous = createClient(server.url);

    await expectBoard(anonymous, 0, 0);
    for (let count = 1; count <= 20; count += 1) {
      const player = await newPlayer();
      const { score, accuracy } = await play(player, chart.record, perfectInputs(chart.data));
      if (count === 1 || count === 19 || count === 20) {
        const board = await expectBoard(player.client, count, count);
        // A record equal to every earlier one ranks after them.
        expect(board.me).toEqual({
          nickname: expect.any(String) as string,
          featuredAchievement: null,
          rank: count,
          score,
          accuracy,
        });
      }
    }
    const last = await newPlayer();
    const { score, accuracy } = await play(last, chart.record, lowInputs(chart.data));

    const board = await expectBoard(last.client, 20, 21);
    expect(board.me).toEqual({
      nickname: expect.any(String) as string,
      featuredAchievement: null,
      rank: 21,
      score,
      accuracy,
    });
    expect(board.top.some(({ isMe }) => isMe)).toBe(false);
  });

  it('ranks an equal score by accuracy and then by the earlier record', async () => {
    const chart = await createRankedChart('ties');
    const [earlier, later, accurate] = [await newPlayer(), await newPlayer(), await newPlayer()];
    const records = [
      [later, 0.95, '2026-03-02T00:00:00.000Z'],
      [earlier, 0.95, '2026-03-01T00:00:00.000Z'],
      [accurate, 0.97, '2026-03-03T00:00:00.000Z'],
    ] as const;
    // The order between equal records depends on the achievement time, so they are stored directly.
    for (const [player, accuracy, achievedAt] of records) {
      await server.superuser.collection('scores').create({
        user: player.id,
        chart: chart.record.id,
        chartRevision: String(chart.record['revision']),
        score: 900_000,
        accuracy,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt,
      });
    }

    const board = await readLeaderboard(later.client, chart.record.id);

    expect(
      board.top.map(({ rank, nickname }) => ({
        rank,
        nickname,
      })),
    ).toEqual([
      {
        rank: 1,
        nickname: await nicknameOf(accurate),
      },
      {
        rank: 2,
        nickname: await nicknameOf(earlier),
      },
      {
        rank: 3,
        nickname: await nicknameOf(later),
      },
    ]);
    expect(board.me).toMatchObject({ rank: 3 });
  });

  it('answers my rank only to me and never to a guest or a superuser', async () => {
    const chart = await createRankedChart('viewers');
    const first = await newPlayer();
    const second = await newPlayer();
    await play(first, chart.record, perfectInputs(chart.data));
    await play(second, chart.record, lowInputs(chart.data));

    for (const client of [createClient(server.url), server.superuser]) {
      const board = await readLeaderboard(client, chart.record.id);
      expect(board.me).toBeNull();
      expect(board.hasPreviousRevisionRecord).toBe(false);
      expect(board.top.map(({ isMe }) => isMe)).toEqual([false, false]);
    }
    const board = await readLeaderboard(second.client, chart.record.id);
    expect(board.top.map(({ isMe }) => isMe)).toEqual([false, true]);
    expect(board.me).toMatchObject({ rank: 2 });
  });

  it('answers the featured achievement key without private fields', async () => {
    const chart = await createRankedChart('featured');
    const featuring = await newPlayer();
    const plain = await newPlayer();
    await server.superuser
      .collection('users')
      .update(featuring.id, { featuredAchievement: 'FIRST_CLEAR' });
    await play(featuring, chart.record, perfectInputs(chart.data));
    await play(plain, chart.record, lowInputs(chart.data));

    const board = await readLeaderboard(featuring.client, chart.record.id);

    expect(Object.keys(board).sort()).toEqual(LEADERBOARD_KEYS);
    expect(board.chartId).toBe(chart.record.id);
    expect(board.chartRevision).toBe(String(chart.record['revision']));
    expect(board.top.map(({ featuredAchievement }) => featuredAchievement)).toEqual([
      'FIRST_CLEAR',
      null,
    ]);
    for (const entry of board.top) {
      expect(Object.keys(entry).sort()).toEqual(TOP_ENTRY_KEYS);
    }
    const body = JSON.stringify(board);
    for (const player of [featuring, plain]) {
      expect(body).not.toContain(player.id);
      expect(body).not.toContain(player.email);
    }
  });

  it('rejects an unpublished or missing chart alike', async () => {
    const hidden = await createRankedChart('hidden-ranking', { isPublished: false });
    const anonymous = createClient(server.url);

    for (const chartId of [hidden.record.id, 'missingchart123']) {
      await expect(readLeaderboard(anonymous, chartId)).rejects.toMatchObject({
        status: 404,
        response: {
          status: 404,
          code: 'chart_not_found',
        },
      });
    }
  });

  it('leaves out records of an earlier revision and tells their owner', async () => {
    const chart = await createRankedChart('revised');
    const player = await newPlayer();
    await play(player, chart.record, perfectInputs(chart.data));
    await editChart(chart);

    expect(await readLeaderboard(player.client, chart.record.id)).toMatchObject({
      totalPlayers: 0,
      top: [],
      me: null,
      hasPreviousRevisionRecord: true,
    });
    expect(
      (await readLeaderboard(createClient(server.url), chart.record.id)).hasPreviousRevisionRecord,
    ).toBe(false);
  });
});

describe('GET /api/dazbeat/profile/rankings', () => {
  it('lists every current record I played with its rank, inside or outside the top 20', async () => {
    const player = await newPlayer();
    const first = await createRankedChart('mine-first');
    const second = await createRankedChart('mine-second');
    const outside = await createRankedChart('mine-outside');
    const revised = await createRankedChart('mine-revised');
    const withdrawn = await createRankedChart('mine-withdrawn');
    const rival = await newPlayer();
    await play(rival, second.record, perfectInputs(second.data));
    for (let count = 0; count < 20; count += 1) {
      await play(await newPlayer(), outside.record, perfectInputs(outside.data));
    }
    // The first chart is played first, so only the rank puts it before the second one.
    const firstPlay = await play(player, first.record, perfectInputs(first.data));
    const secondPlay = await play(player, second.record, lowInputs(second.data));
    const outsidePlay = await play(player, outside.record, lowInputs(outside.data));
    await play(player, revised.record, perfectInputs(revised.data));
    await editChart(revised);
    await play(player, withdrawn.record, perfectInputs(withdrawn.data));
    await server.superuser
      .collection('songs')
      .update(String(withdrawn.record['song']), { isPublished: false });

    const itemOf = (chart: RankedTestChart, rank: number, { score }: { score: number }) => ({
      chartId: chart.record.id,
      songId: String(chart.record['song']),
      songTitle: `Song ${chart.data.songId}`,
      constellation: 'gemini',
      laneCount: 4,
      difficulty: 'easy',
      rank,
      score,
      achievedAt: ANY_STRING,
    });

    const items = await readMyRankings(player.client);
    expect(items).toHaveLength(3);
    expect(items).toEqual(
      expect.arrayContaining([
        itemOf(first, 1, firstPlay),
        itemOf(second, 2, secondPlay),
        itemOf(outside, 21, outsidePlay),
      ]),
    );
  });

  it('pages 20 records by cursor while the top ranks stay complete', async () => {
    const player = await newPlayer();
    const charts = await Promise.all(
      Array.from({ length: 21 }, (_, index) => createRankedChart(`paged${index}`)),
    );
    // 21곡을 실제로 플레이하면 세션 발급 횟수 제한에 걸려 기록을 직접 넣는다.
    for (const chart of charts) {
      await server.superuser.collection('scores').create({
        user: player.id,
        chart: chart.record.id,
        chartRevision: String(chart.record['revision']),
        score: 900_000,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: '2026-03-01T00:00:00.000Z',
      });
    }

    const first = await readMyRankingPage(player.client);
    expect(first.items).toHaveLength(20);
    const second = await readMyRankingPage(player.client, first.next);
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
    expect(new Set([...first.items, ...second.items].map(({ chartId }) => chartId)).size).toBe(21);

    const { items } = await player.client.send<{ items: unknown[] }>(
      '/api/dazbeat/profile/top-ranks',
      { method: 'GET' },
    );
    expect(items).toHaveLength(21);
  });

  it('sorts by best score by default or by the latest record across pages', async () => {
    const player = await newPlayer();
    const charts = await Promise.all(
      Array.from({ length: 21 }, (_, index) => createRankedChart(`sorted${index}`)),
    );
    const createScore = (userId: string, chart: RankedTestChart, score: number, at: string) =>
      server.superuser.collection('scores').create({
        user: userId,
        chart: chart.record.id,
        chartRevision: String(chart.record['revision']),
        score,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: at,
      });
    // 점수는 앞 차트일수록 높고 달성은 뒤 차트일수록 늦다.
    for (const [index, chart] of charts.entries()) {
      await createScore(
        player.id,
        chart,
        500_000 - index,
        `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      );
    }
    const readAll = async (sort?: string): Promise<string[]> => {
      const first = await readMyRankingPage(player.client, null, sort);
      const second = await readMyRankingPage(player.client, first.next, sort);
      expect(first.items).toHaveLength(20);
      expect(second.next).toBeNull();
      return [...first.items, ...second.items].map(({ chartId }) => chartId);
    };
    const ids = charts.map((chart) => chart.record.id);

    expect(await readAll()).toEqual(ids);
    expect(await readAll('score')).toEqual(ids);
    expect(await readAll('achieved')).toEqual([...ids].reverse());
  });

  it('leaves no next page when the records fill the page exactly', async () => {
    const player = await newPlayer();
    const charts = await Promise.all(
      Array.from({ length: 20 }, (_, index) => createRankedChart(`exact${index}`)),
    );
    for (const chart of charts) {
      await server.superuser.collection('scores').create({
        user: player.id,
        chart: chart.record.id,
        chartRevision: String(chart.record['revision']),
        score: 900_000,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: '2026-03-01T00:00:00.000Z',
      });
    }

    const { items, next } = await readMyRankingPage(player.client);

    expect(items).toHaveLength(20);
    expect(next).toBeNull();
  });

  it('copies the lane count and difficulty of the chart onto a new score', async () => {
    const player = await newPlayer();
    const chart = await createRankedChart('copied');

    const score = await server.superuser.collection('scores').create({
      user: player.id,
      chart: chart.record.id,
      chartRevision: String(chart.record['revision']),
      score: 900_000,
      accuracy: 0.95,
      maxCombo: 4,
      cleared: true,
      counts: {
        perfect: 4,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
      },
      achievedAt: '2026-03-01T00:00:00.000Z',
    });

    expect(score['laneCount']).toBe(4);
    expect(score['difficulty']).toBe('easy');
  });

  it('moves the copied difficulty of the scores when a chart is reassigned', async () => {
    const player = await newPlayer();
    const chart = await createRankedChart('reassigned');
    const created = await server.superuser.collection('scores').create({
      user: player.id,
      chart: chart.record.id,
      chartRevision: String(chart.record['revision']),
      score: 900_000,
      accuracy: 0.95,
      maxCombo: 4,
      cleared: true,
      counts: {
        perfect: 4,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
      },
      achievedAt: '2026-03-01T00:00:00.000Z',
    });

    await server.superuser.collection('charts').update(chart.record.id, {
      difficulty: 'hard',
      data: {
        ...chart.data,
        difficulty: 'hard',
      },
    });

    const score = await server.superuser.collection('scores').getOne(created.id);
    expect(score['difficulty']).toBe('hard');
    expect(score['laneCount']).toBe(4);
  });

  it('stops counting my rank past the rank limit', async () => {
    const player = await newPlayer();
    const chart = await createRankedChart('deep');
    const createScore = (userId: string, score: number) =>
      server.superuser.collection('scores').create({
        user: userId,
        chart: chart.record.id,
        chartRevision: String(chart.record['revision']),
        score,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: '2026-03-01T00:00:00.000Z',
      });
    await createScore(player.id, 1_000);
    const readRank = async () => (await readMyRankings(player.client))[0]?.rank;

    for (let count = 0; count < MY_RANK_LIMIT - 1; count += 1) {
      await createScore((await newPlayer()).id, 900_000);
    }
    expect(await readRank()).toBe(MY_RANK_LIMIT);

    const readBoard = () =>
      player.client.send<Leaderboard>(`/api/dazbeat/leaderboards/${chart.record.id}`, {
        method: 'GET',
      });
    expect((await readBoard()).me?.rank).toBe(MY_RANK_LIMIT);

    await createScore((await newPlayer()).id, 900_000);
    expect(await readRank()).toBe(MY_RANK_LIMIT + 1);

    await createScore((await newPlayer()).id, 900_000);
    expect(await readRank()).toBe(MY_RANK_LIMIT + 1);
    const board = await readBoard();
    expect(board.me?.rank).toBe(MY_RANK_LIMIT + 1);
    expect(board.me?.nickname).toBe(await nicknameOf(player));
    expect(board.totalPlayers).toBe(MY_RANK_LIMIT + 2);
  });

  it('filters my records by difficulty', async () => {
    const player = await newPlayer();
    const easy = await createRankedChart('filterEasy');
    const hardData = chartOf('filterHard', 'hard');
    const hardSong = await createSong(server.superuser, 'filterHard', GAME_END_MS, {});
    const hard = await createChart(editor.client, hardSong.id, 'hard', hardData);
    for (const chart of [easy.record, hard]) {
      await server.superuser.collection('scores').create({
        user: player.id,
        chart: chart.id,
        chartRevision: String(chart['revision']),
        score: 900_000,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: '2026-03-01T00:00:00.000Z',
      });
    }

    const { items } = await player.client.send<{ items: RankedChartItem[] }>(
      '/api/dazbeat/profile/rankings',
      {
        method: 'GET',
        query: { difficulty: 'hard' },
      },
    );

    expect(items.map(({ chartId }) => chartId)).toEqual([hard.id]);
    const readLane = async (laneCount: number) =>
      (
        await player.client.send<{ items: RankedChartItem[] }>('/api/dazbeat/profile/rankings', {
          method: 'GET',
          query: { laneCount },
        })
      ).items;
    expect(await readLane(4)).toHaveLength(2);
    expect(await readLane(5)).toHaveLength(0);
    await expect(readLane(7)).rejects.toMatchObject({ status: 400 });
    await expect(
      player.client.send('/api/dazbeat/profile/rankings', {
        method: 'GET',
        query: { difficulty: 'insane' },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown sort and a date cursor outside the date range', async () => {
    const player = await newPlayer();

    await expect(readMyRankingPage(player.client, null, 'rank')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readMyRankingPage(
        player.client,
        {
          value: Number.MAX_SAFE_INTEGER,
          chartId: 'anychart',
        },
        'achieved',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a partial cursor', async () => {
    const player = await newPlayer();

    await expect(
      player.client.send('/api/dazbeat/profile/rankings', {
        method: 'GET',
        query: { afterValue: 1 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('requires a signed-in user', async () => {
    await expect(readMyRankings(createClient(server.url))).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('GET /api/dazbeat/profile/records', () => {
  function readMyRecords(client: PocketBase): Promise<{ items: Record<string, unknown>[] }> {
    return client.send('/api/dazbeat/profile/records', { method: 'GET' });
  }

  function recordOf(
    chart: RankedTestChart,
    { score, accuracy, maxCombo, cleared }: Awaited<ReturnType<typeof play>>,
  ) {
    return {
      songId: chart.data.songId,
      laneCount: 4,
      difficulty: 'easy',
      score,
      accuracy,
      maxCombo,
      cleared,
    };
  }

  /** The revision after an edit, which a later play has to name. */
  async function editedRecord(chart: RankedTestChart): Promise<RecordModel> {
    await editChart(chart);
    return server.superuser.collection('charts').getOne(chart.record.id);
  }

  it('requires a signed-in user', async () => {
    await expect(readMyRecords(createClient(server.url))).rejects.toMatchObject({ status: 401 });
  });

  it('answers only my records, under the song key and exact fields', async () => {
    const chart = await createRankedChart('records-mine');
    const player = await newPlayer();
    const rival = await newPlayer();
    const played = await play(player, chart.record, lowInputs(chart.data));
    await play(rival, chart.record, perfectInputs(chart.data));

    const { items } = await readMyRecords(player.client);

    expect(items).toEqual([recordOf(chart, played)]);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(MY_RECORD_KEYS);
    expect((await readMyRecords((await newPlayer()).client)).items).toEqual([]);
  });

  it('keeps the record of an earlier revision', async () => {
    const chart = await createRankedChart('records-revised');
    const player = await newPlayer();
    const best = await play(player, chart.record, perfectInputs(chart.data));

    const edited = await editedRecord(chart);
    expect((await readMyRecords(player.client)).items).toEqual([recordOf(chart, best)]);

    await play(player, edited, lowInputs(chart.data));
    expect((await readMyRecords(player.client)).items).toEqual([recordOf(chart, best)]);
  });

  it('answers a better record of a later revision', async () => {
    const chart = await createRankedChart('records-improved');
    const player = await newPlayer();
    await play(player, chart.record, lowInputs(chart.data));

    const best = await play(player, await editedRecord(chart), perfectInputs(chart.data));

    expect((await readMyRecords(player.client)).items).toEqual([recordOf(chart, best)]);
  });

  it('takes the best of each field across revisions', async () => {
    const chart = await createRankedChart('records-crossed');
    const player = await newPlayer();
    const edited = await editedRecord(chart);
    // 필드마다 최고가 다른 revision 에 있는 기록은 플레이로 만들 수 없어 직접 넣는다.
    const scores = [
      {
        chartRevision: String(chart.record['revision']),
        score: 900_000,
        accuracy: 0.9,
        maxCombo: 2,
        cleared: true,
      },
      {
        chartRevision: String(edited['revision']),
        score: 800_000,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: false,
      },
    ];
    for (const score of scores) {
      await server.superuser.collection('scores').create({
        ...score,
        user: player.id,
        chart: chart.record.id,
        counts: {
          perfect: 4,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        achievedAt: '2026-03-01T00:00:00.000Z',
      });
    }

    expect((await readMyRecords(player.client)).items).toEqual([
      recordOf(chart, {
        score: 900_000,
        accuracy: 0.95,
        maxCombo: 4,
        cleared: true,
      }),
    ]);
  });

  it('leaves out unpublished songs and deleted charts', async () => {
    const withdrawn = await createRankedChart('records-withdrawn');
    const deleted = await createRankedChart('records-deleted');
    const kept = await createRankedChart('records-kept');
    const player = await newPlayer();
    await play(player, withdrawn.record, perfectInputs(withdrawn.data));
    await play(player, deleted.record, perfectInputs(deleted.data));
    const played = await play(player, kept.record, perfectInputs(kept.data));

    await server.superuser
      .collection('songs')
      .update(String(withdrawn.record['song']), { isPublished: false });
    await server.superuser.collection('charts').delete(deleted.record.id);

    expect((await readMyRecords(player.client)).items).toEqual([recordOf(kept, played)]);
  });
});
