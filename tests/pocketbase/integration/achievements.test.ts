import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EARNED_CHART_MARKS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  SCORES,
  EARNED_SONG_MARKS,
} from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import type { Chart, InputEvent } from '../../../src/rhythm/types.js';
import { simulateClientPlay } from '../../rhythm/playSimulation.js';
import { createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createChart,
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
  findAlbumId,
  readActiveAchievementKeys,
} from './testData.js';
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
  'ALL_DIFFICULTIES_CLEAR',
  'SONG_ALL_FC_1',
  'SONG_ALL_AP_1',
  'ZODIAC_LEO',
  'ZODIAC_LEO_S',
  'ZODIAC_LEO_FC',
  'ZODIAC_LEO_AP',
  'ZODIAC_1_COMPLETE',
];
const NEMURANAI_YUME_SONG_KEYS = ['album-song-1', 'album-song-2'];

interface ProfileResponse {
  featuredAchievement: { key: string } | null;
  achievements: { definition: { key: string } }[];
  newAchievements: string[];
}

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

async function createTapSong(
  key: string,
  constellation: string,
  isPublished = true,
): Promise<RecordModel> {
  const song = await createSong(server.superuser, key, GAME_END_MS, {
    constellation,
    isPublished,
  });
  return createChart(server.superuser, song.id, 'easy', tapChartOf(key));
}

function setPublished(chart: RecordModel, isPublished: boolean): Promise<RecordModel> {
  return server.superuser.collection('songs').update(String(chart['song']), { isPublished });
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
  listOwn(EARNED_CHART_MARKS.name, where(EARNED_CHART_MARKS, [{ user: userId }]));
const findSongMarks = async (userId: string) =>
  (await listOwn(EARNED_SONG_MARKS.name, where(EARNED_SONG_MARKS, [{ user: userId }]))).map(
    (record) => ({
      song: String(record['song']),
      kind: String(record['kind']),
    }),
  );
function getProfile(client: PocketBase): Promise<ProfileResponse> {
  return client.send<ProfileResponse>('/api/dazbeat/profile', { method: 'GET' });
}

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

  it('records a play whose song was unpublished during the play as past evidence only', async () => {
    const player = await newPlayer();
    const chart = await createTapSong('withdrawn', 'scorpio');
    const sessionId = await startRankedPlay(player, chart);
    await setPublished(chart, false);

    const response = await submitResult(player.client, sessionId, perfectInputs);

    // 과거 이력 업적만 세고, 그 곡의 황도 완성과 곡 마스터는 세지 않는다.
    expect(response.newAchievements).toEqual([
      'FIRST_CLEAR',
      'FIRST_FINISH',
      'FIRST_S',
      'FIRST_FC',
      'FIRST_AP',
    ]);
    expect(await findPlayResults(player.id)).toHaveLength(1);
    expect(await findMarks(player.id)).toHaveLength(4);
    expect(await findSongMarks(player.id)).toEqual([]);
  });

  it('completes a zodiac from its published songs only', async () => {
    const player = await newPlayer();
    const published = await createTapSong('libra-published', 'libra');
    await createTapSong('libra-unpublished', 'libra', false);

    const response = await playRanked(player, published, perfectInputs);

    expect(response.newAchievements).toContain('ZODIAC_LIBRA');
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

describe('GET /api/dazbeat/profile achievements', () => {
  let albumCharts: RecordModel[];

  beforeAll(async () => {
    albumCharts = [];
    for (const key of NEMURANAI_YUME_SONG_KEYS) {
      const albumSong = await createSong(server.superuser, key, GAME_END_MS, {
        constellation: 'aries',
        album: await findAlbumId(server.superuser, 'nemuranaiYume'),
      });
      albumCharts.push(
        await createChart(server.superuser, albumSong.id, 'easy', fakeChartData(key, 'easy')),
      );
    }
  });

  it('grants an album achievement from backfilled marks once', async () => {
    const player = await newPlayer();
    for (const chart of albumCharts) {
      await server.superuser.collection(EARNED_CHART_MARKS.name).create({
        user: player.id,
        kind: 'clear',
        song: String(chart['song']),
        difficulty: 'easy',
        chart: chart.id,
        chartRevision: String(chart['revision']),
        constellation: '',
        source: 'backfill',
      });
    }

    const first = await getProfile(player.client);

    expect(first.newAchievements).toContain('ALBUM_NEMURANAI_YUME_CLEAR');
    expect(first.newAchievements).not.toContain('ALBUM_NEMURANAI_YUME_S');
    expect(first.newAchievements).not.toContain('ALBUM_NEMURANAI_YUME_FC');
    expect(first.achievements.map(({ definition }) => definition.key)).toEqual(
      await readActiveAchievementKeys(server.superuser),
    );
    const again = await getProfile(player.client);
    expect(again.newAchievements).toEqual([]);
    expect(
      (await findEarned(player.id)).filter((id) => id === 'ALBUM_NEMURANAI_YUME_CLEAR'),
    ).toHaveLength(1);
  });

  it('counts the marks of an unpublished song again once the song is republished', async () => {
    const player = await newPlayer();
    const chart = await createTapSong('republished', 'capricorn');
    const sessionId = await startRankedPlay(player, chart);
    await setPublished(chart, false);
    await submitResult(player.client, sessionId, perfectInputs);
    expect(await findSongMarks(player.id)).toEqual([]);

    await setPublished(chart, true);
    const profile = await getProfile(player.client);

    expect(profile.newAchievements).toContain('ALL_DIFFICULTIES_CLEAR');
    expect(profile.newAchievements).toContain('ZODIAC_CAPRICORN');
    expect(await findSongMarks(player.id)).toEqual(
      expect.arrayContaining([
        {
          song: String(chart['song']),
          kind: 'clear',
        },
      ]),
    );
  });

  it('keeps a retired featured achievement and its earned row out of the catalog', async () => {
    const player = await newPlayer();
    await server.superuser.collection(EARNED_ACHIEVEMENTS.name).create({
      user: player.id,
      achievement: 'S_20_CHARTS',
    });
    await server.superuser
      .collection('users')
      .update(player.id, { featuredAchievement: 'S_20_CHARTS' });

    const profile = await getProfile(player.client);

    expect(profile.featuredAchievement?.key).toBe('S_20_CHARTS');
    expect(profile.achievements.map(({ definition }) => definition.key)).not.toContain(
      'S_20_CHARTS',
    );
    expect(await findEarned(player.id)).toContain('S_20_CHARTS');
  });

  it('ignores the earned row of a deleted definition and keeps it with the featured value', async () => {
    const player = await newPlayer();
    const definition = await server.superuser.collection('achievements').create({
      key: 'DELETED_LATER',
      achievementSet: 'rhythm',
      category: 'play',
      sortOrder: 5,
      kind: 'plays',
      target: 1000,
      retired: false,
      nameKo: '지울 업적',
      nameJa: '消す実績',
      nameEn: 'Deleted Later',
    });
    await server.superuser.collection(EARNED_ACHIEVEMENTS.name).create({
      user: player.id,
      achievement: 'DELETED_LATER',
    });
    await server.superuser
      .collection('users')
      .update(player.id, { featuredAchievement: 'DELETED_LATER' });
    await server.superuser.collection('achievements').delete(definition.id);

    const profile = await getProfile(player.client);
    const played = await playRanked(player, leoChartRecord, unclearedInputs);

    expect(profile.achievements.map(({ definition }) => definition.key)).not.toContain(
      'DELETED_LATER',
    );
    expect(played.newAchievements).toEqual(['FIRST_FINISH']);
    expect(await findEarned(player.id)).toContain('DELETED_LATER');
    expect(
      (await server.superuser.collection('users').getOne(player.id))['featuredAchievement'],
    ).toBe('DELETED_LATER');
  });

  it('drops an album achievement whose album was deleted and still answers', async () => {
    const player = await newPlayer();
    const album = await server.superuser.collection('albums').create({
      key: 'deletedLater',
      name: 'Deleted Later',
      sortOrder: 70,
    });
    const definition = await server.superuser.collection('achievements').create({
      key: 'ALBUM_DELETED_LATER_CLEAR',
      achievementSet: 'discography',
      category: 'album',
      sortOrder: 1175,
      kind: 'album',
      mark: 'clear',
      album: album.id,
      retired: false,
      nameKo: '지울 앨범',
      nameJa: '消すアルバム',
      nameEn: 'Deleted Album',
    });
    expect(
      (await getProfile(player.client)).achievements.map(({ definition }) => definition.key),
    ).toContain('ALBUM_DELETED_LATER_CLEAR');

    await server.superuser.collection('albums').delete(album.id);
    const profile = await getProfile(player.client);

    expect(profile.achievements.map(({ definition }) => definition.key)).not.toContain(
      'ALBUM_DELETED_LATER_CLEAR',
    );
    expect((await server.superuser.collection('achievements').getOne(definition.id))['album']).toBe(
      '',
    );
    await server.superuser.collection('achievements').delete(definition.id);
  });
});

describe('saving achievements from the dashboard', () => {
  function definitionBody(overrides: Record<string, unknown>) {
    return {
      achievementSet: 'rhythm',
      category: 'play',
      sortOrder: 2000,
      kind: 'plays',
      target: 1,
      retired: false,
      nameKo: '대시보드 업적',
      nameJa: 'ダッシュボード実績',
      nameEn: 'Dashboard Achievement',
      ...overrides,
    };
  }

  function expectFieldRejection(request: Promise<unknown>, field: string, code: string) {
    return expect(request).rejects.toMatchObject({
      status: 400,
      response: { data: { [field]: { code } } },
    });
  }

  async function findDefinitions(key: string): Promise<RecordModel[]> {
    return server.superuser
      .collection('achievements')
      .getFullList({ filter: server.superuser.filter('key = {:key}', { key }) });
  }

  it.each<[string, Record<string, string | number>, string, string]>([
    ['plays without a target', { target: 0 }, 'target', 'validation_required'],
    [
      'songs with an S mark',
      {
        category: 'songClear',
        kind: 'songs',
        mark: 's',
      },
      'mark',
      'validation_invalid_value',
    ],
    [
      'zodiacComplete without a zodiac',
      {
        achievementSet: 'zodiac',
        category: 'zodiacComplete',
        kind: 'zodiacComplete',
        mark: 'clear',
      },
      'zodiac',
      'validation_required',
    ],
    [
      'album without an album',
      {
        achievementSet: 'discography',
        category: 'album',
        kind: 'album',
        mark: 'clear',
      },
      'album',
      'validation_required',
    ],
    [
      'album with an AP mark',
      {
        achievementSet: 'discography',
        category: 'album',
        kind: 'album',
        mark: 'ap',
        album: 'nemuranaiYume',
      },
      'mark',
      'validation_invalid_value',
    ],
    [
      'the album category with the plays kind',
      { category: 'album' },
      'category',
      'validation_invalid_value',
    ],
  ])('rejects creating %s with a field error', async (_case, overrides, field, code) => {
    const key = `REJECTED_${field.toUpperCase()}_${code.toUpperCase()}`;
    const albumKey = overrides['album'];
    const album =
      albumKey === undefined
        ? {}
        : { album: await findAlbumId(server.superuser, String(albumKey)) };

    await expectFieldRejection(
      server.superuser.collection('achievements').create(
        definitionBody({
          ...overrides,
          ...album,
          key,
        }),
      ),
      field,
      code,
    );
    expect(await findDefinitions(key)).toEqual([]);
  });

  it('rejects updating a row into an invalid rule and keeps the stored row', async () => {
    const created = await server.superuser.collection('achievements').create(
      definitionBody({
        key: 'UPDATE_CHECKED',
        target: 500,
      }),
    );

    await expectFieldRejection(
      server.superuser.collection('achievements').update(created.id, { target: 0 }),
      'target',
      'validation_required',
    );
    expect((await server.superuser.collection('achievements').getOne(created.id))['target']).toBe(
      500,
    );
    await server.superuser.collection('achievements').delete(created.id);
  });

  it('grants added album and plays achievements on the next submission in definition order', async () => {
    const album = await server.superuser.collection('albums').create({
      key: 'dashboardAlbum',
      name: 'Dashboard Album',
      sortOrder: 70,
    });
    const emptyAlbum = await server.superuser.collection('albums').create({
      key: 'emptyAlbum',
      name: 'Empty Album',
      sortOrder: 80,
    });
    const albumSong = await createSong(server.superuser, 'dashboard-song', GAME_END_MS, {
      constellation: 'pisces',
      album: album.id,
    });
    const albumChart = await createChart(
      server.superuser,
      albumSong.id,
      'easy',
      tapChartOf('dashboard-song'),
    );
    const added = [
      await server.superuser.collection('achievements').create(
        definitionBody({
          key: 'PLAY_TWICE',
          sortOrder: 75,
          target: 2,
        }),
      ),
      await server.superuser.collection('achievements').create(
        definitionBody({
          key: 'ALBUM_DASHBOARD_CLEAR',
          achievementSet: 'discography',
          category: 'album',
          sortOrder: 1175,
          kind: 'album',
          target: 0,
          mark: 'clear',
          album: album.id,
        }),
      ),
      await server.superuser.collection('achievements').create(
        definitionBody({
          key: 'ALBUM_EMPTY_CLEAR',
          achievementSet: 'discography',
          category: 'album',
          sortOrder: 1176,
          kind: 'album',
          target: 0,
          mark: 'clear',
          album: emptyAlbum.id,
        }),
      ),
    ];
    const player = await newPlayer();

    const first = await playRanked(player, albumChart, perfectInputs);
    const second = await playRanked(player, albumChart, unclearedInputs);
    const profile = await getProfile(player.client);

    expect(first.newAchievements).toContain('ALBUM_DASHBOARD_CLEAR');
    expect(first.newAchievements).not.toContain('PLAY_TWICE');
    expect(second.newAchievements).toEqual(['PLAY_TWICE']);
    expect(profile.achievements.map(({ definition }) => definition.key)).toEqual(
      await readActiveAchievementKeys(server.superuser),
    );
    const ids = profile.achievements.map(({ definition }) => definition.key);
    expect(ids.indexOf('PLAY_TWICE')).toBe(ids.indexOf('PLAY_3') + 1);
    expect(
      profile.achievements.find(({ definition }) => definition.key === 'ALBUM_EMPTY_CLEAR'),
    ).toMatchObject({
      definition: { key: 'ALBUM_EMPTY_CLEAR' },
      earnedAt: null,
      current: 0,
      target: 0,
    });
    for (const record of added) {
      await server.superuser.collection('achievements').delete(record.id);
    }
    await server.superuser.collection('songs').delete(albumSong.id);
  });
});
