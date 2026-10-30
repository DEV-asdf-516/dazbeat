import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USERS } from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createChart,
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';
import type { TestUser } from './testData.js';
import { requireDefined } from '../../../src/invariant.js';

// PocketBase answers a null rule with 403, a failed create rule with 400 and a failed update or
// view rule with 404.
const SUPERUSER_ONLY = 403;
const CREATE_RULE_FAILED = 400;
const UPDATE_RULE_FAILED = 404;
const VIEW_RULE_FAILED = 404;

const PUBLIC_SCORE_FIELDS = [
  'id',
  'collectionId',
  'collectionName',
  'user',
  'chart',
  'chartRevision',
  'score',
  'accuracy',
  'maxCombo',
  'cleared',
  'counts',
  'created',
  'updated',
];

type Role = 'guest' | 'user' | 'editor';

interface ServerOnlyRecord {
  collection: string;
  record: RecordModel;
  forgedField: string;
}

let dataDir: string;
let server: PocketBaseServer;
let song: RecordModel;
const chartData = fakeChartData('perm', 'easy');
let chart: RecordModel;
let scoredChart: RecordModel;
let currentScore: RecordModel;
let hiddenSong: RecordModel;
let hiddenChart: RecordModel;
let hiddenScore: RecordModel;
let playSession: RecordModel;
let playSessionQuota: RecordModel;
const achievementRecords: ServerOnlyRecord[] = [];
let user: TestUser;
let editor: TestUser;
// Owns the public score, so no tested role is the owner who may view the expanded profile.
let scorer: TestUser;

function clientFor(role: Role): PocketBase {
  switch (role) {
    case 'guest':
      return createClient(server.url);
    case 'user':
      return user.client;
    case 'editor':
      return editor.client;
  }
}

function expectStatus(request: Promise<unknown>, status: number): Promise<void> {
  return expect(request).rejects.toMatchObject({ status });
}

// One valid body per server-only achievement collection; forgedField is what a client would most
// want to rewrite.
function achievementRecordBodies(userId: string) {
  return [
    {
      collection: 'play_results',
      forgedField: 'score',
      body: {
        user: userId,
        session: `session-${userId}`,
        song: song.id,
        chart: chart.id,
        difficulty: 'easy',
        laneCount: 4,
        chartRevision: String(chart['revision']),
        constellation: 'gemini',
        score: 900_000,
        accuracy: 0.95,
        maxCombo: 2,
        counts: {
          perfect: 2,
          great: 0,
          good: 0,
          bad: 0,
          miss: 0,
        },
        cleared: true,
      },
    },
    {
      collection: 'earned_chart_marks',
      forgedField: 'chartRevision',
      body: {
        user: userId,
        kind: 'ap',
        song: song.id,
        difficulty: 'easy',
        chart: chart.id,
        chartRevision: String(chart['revision']),
        constellation: 'gemini',
        source: 'play',
      },
    },
    {
      collection: 'earned_song_marks',
      forgedField: 'song',
      body: {
        user: userId,
        song: song.id,
        kind: 'ap',
      },
    },
    {
      collection: 'earned_achievements',
      forgedField: 'achievement',
      body: {
        user: userId,
        achievement: 'FIRST_CLEAR',
      },
    },
  ];
}

function scoreBody(userId: string, chartRevision: string, chartId = scoredChart.id) {
  return {
    user: userId,
    chart: chartId,
    chartRevision,
    score: 900_000,
    accuracy: 95,
    maxCombo: 2,
    cleared: true,
    counts: {
      perfect: 1,
      great: 1,
      good: 0,
      bad: 0,
      miss: 0,
    },
  };
}

beforeAll(async () => {
  dataDir = await createTempDir('permissions');
  server = await startPocketBase({ dataDir });
  const { superuser } = server;
  await excludeLoopbackFromRateLimits(superuser);
  user = await createUser(server, 'user@example.com');
  editor = await createUser(server, 'editor@example.com', true);
  scorer = await createUser(server, 'scorer@example.com');
  song = await createSong(superuser, 'perm', 5_000, { previewStartMs: 2_000 });
  chart = await createChart(superuser, song.id, 'easy', chartData);
  scoredChart = await createChart(superuser, song.id, 'normal', fakeChartData('perm', 'normal'));
  currentScore = await superuser
    .collection('scores')
    .create(scoreBody(scorer.id, String(scoredChart['revision'])));
  await superuser.collection('scores').create(scoreBody(scorer.id, 'stale-revision'));
  hiddenSong = await createSong(superuser, 'hidden', 5_000, { isPublished: false });
  hiddenChart = await createChart(
    superuser,
    hiddenSong.id,
    'easy',
    fakeChartData('hidden', 'easy'),
  );
  hiddenScore = await superuser
    .collection('scores')
    .create(scoreBody(scorer.id, String(hiddenChart['revision']), hiddenChart.id));
  const nowMs = Date.now();
  playSession = await superuser.collection('play_sessions').create({
    user: user.id,
    chart: chart.id,
    chartRevision: String(chart['revision']),
    chartData,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  });
  playSessionQuota = await superuser.collection('play_session_quotas').create({
    user: user.id,
    windowStartedAt: new Date(nowMs).toISOString(),
    issuedCount: 1,
  });
  for (const { collection, forgedField, body } of achievementRecordBodies(user.id)) {
    achievementRecords.push({
      collection,
      record: await superuser.collection(collection).create(body),
      forgedField,
    });
  }
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe.each<Role>(['guest', 'user', 'editor'])('%s', (role) => {
  it('lists songs but cannot create, update or delete them', async () => {
    const pb = clientFor(role);
    const songs = await pb.collection('songs').getFullList();
    expect(songs.find((record) => record.id === song.id)?.['previewStartMs']).toBe(2_000);
    await expectStatus(pb.collection('songs').create({ key: `new-${role}` }), SUPERUSER_ONLY);
    await expectStatus(pb.collection('songs').update(song.id, { title: role }), SUPERUSER_ONLY);
    await expectStatus(pb.collection('songs').delete(song.id), SUPERUSER_ONLY);
    const stored = await server.superuser.collection('songs').getOne(song.id);
    expect(stored['title']).toBe(song['title']);
  });

  it.each(['albums', 'achievements'])(
    'lists and views %s but cannot create, update or delete them',
    async (collection) => {
      const pb = clientFor(role);
      const records = await pb.collection(collection).getFullList();
      const stored = await server.superuser.collection(collection).getFullList();
      expect(records.map(({ id }) => id)).toEqual(stored.map(({ id }) => id));
      const first = requireDefined(stored[0], 'Collection has no records', collection);
      await expect(pb.collection(collection).getOne(first.id)).resolves.toMatchObject({
        id: first.id,
      });
      await expectStatus(pb.collection(collection).create({ key: 'forged' }), SUPERUSER_ONLY);
      await expectStatus(
        pb.collection(collection).update(first.id, { key: 'forged' }),
        SUPERUSER_ONLY,
      );
      await expectStatus(pb.collection(collection).delete(first.id), SUPERUSER_ONLY);
      expect(await server.superuser.collection(collection).getOne(first.id)).toEqual(first);
      expect(await server.superuser.collection(collection).getFullList()).toHaveLength(
        stored.length,
      );
    },
  );

  it('lists charts and cannot delete them', async () => {
    const pb = clientFor(role);
    const charts = await pb.collection('charts').getFullList();
    expect(charts.map((record) => record.id)).toEqual(
      expect.arrayContaining([chart.id, scoredChart.id]),
    );
    await expectStatus(pb.collection('charts').delete(chart.id), SUPERUSER_ONLY);
    await expect(server.superuser.collection('charts').getOne(chart.id)).resolves.toBeDefined();
  });

  it('cannot write scores directly', async () => {
    const pb = clientFor(role);
    const ownerId = role === 'editor' ? editor.id : user.id;
    await expectStatus(
      pb.collection('scores').create(scoreBody(ownerId, String(scoredChart['revision']))),
      SUPERUSER_ONLY,
    );
    await expectStatus(
      pb.collection('scores').update(currentScore.id, { score: 1 }),
      SUPERUSER_ONLY,
    );
    await expectStatus(pb.collection('scores').delete(currentScore.id), SUPERUSER_ONLY);
    const stored = await server.superuser.collection('scores').getOne(currentScore.id);
    expect(stored['score']).toBe(currentScore['score']);
  });

  it('cannot reach play_sessions at all', async () => {
    const pb = clientFor(role);
    const sessions = pb.collection('play_sessions');
    await expectStatus(sessions.getList(), SUPERUSER_ONLY);
    await expectStatus(sessions.getOne(playSession.id), SUPERUSER_ONLY);
    await expectStatus(
      sessions.create({
        user: user.id,
        chart: chart.id,
        chartRevision: 'x',
        chartData,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }),
      SUPERUSER_ONLY,
    );
    await expectStatus(
      sessions.update(playSession.id, {
        chartRevision: 'x',
        chartData: { forged: true },
      }),
      SUPERUSER_ONLY,
    );
    await expectStatus(sessions.delete(playSession.id), SUPERUSER_ONLY);
    const stored = await server.superuser.collection('play_sessions').getOne(playSession.id);
    expect(stored['chartRevision']).toBe(playSession['chartRevision']);
    expect(stored['chartData']).toEqual(chartData);
  });

  it('cannot reach play_session_quotas at all', async () => {
    const pb = clientFor(role);
    const quotas = pb.collection('play_session_quotas');
    await expectStatus(quotas.getList(), SUPERUSER_ONLY);
    await expectStatus(quotas.getOne(playSessionQuota.id), SUPERUSER_ONLY);
    await expectStatus(
      quotas.create({
        user: user.id,
        windowStartedAt: new Date().toISOString(),
        issuedCount: 1,
      }),
      SUPERUSER_ONLY,
    );
    await expectStatus(quotas.update(playSessionQuota.id, { issuedCount: 20 }), SUPERUSER_ONLY);
    await expectStatus(quotas.delete(playSessionQuota.id), SUPERUSER_ONLY);
    const stored = await server.superuser
      .collection('play_session_quotas')
      .getOne(playSessionQuota.id);
    expect(stored['issuedCount']).toBe(playSessionQuota['issuedCount']);
    expect(stored['windowStartedAt']).toBe(playSessionQuota['windowStartedAt']);
  });

  it('cannot reach the achievement record collections at all', async () => {
    const pb = clientFor(role);
    const ownerId = role === 'editor' ? editor.id : user.id;
    const bodies = achievementRecordBodies(ownerId);
    for (const [index, { collection, record, forgedField }] of achievementRecords.entries()) {
      const records = pb.collection(collection);
      await expectStatus(records.getList(), SUPERUSER_ONLY);
      await expectStatus(records.getOne(record.id), SUPERUSER_ONLY);
      await expectStatus(records.create(bodies[index]?.body), SUPERUSER_ONLY);
      await expectStatus(records.update(record.id, { [forgedField]: 'forged' }), SUPERUSER_ONLY);
      await expectStatus(records.delete(record.id), SUPERUSER_ONLY);
      const stored = await server.superuser.collection(collection).getOne(record.id);
      expect(stored[forgedField]).toEqual(record[forgedField]);
      expect(await server.superuser.collection(collection).getFullList()).toHaveLength(1);
    }
  });

  it('sees only current-revision scores without sensitive fields', async () => {
    const pb = clientFor(role);
    const scores = await pb.collection('scores').getFullList({ expand: 'user' });
    expect(scores.map((record) => record.id)).toEqual([currentScore.id]);
    const { expand, ...fields } = scores[0] ?? {};
    expect(Object.keys(fields).sort()).toEqual([...PUBLIC_SCORE_FIELDS].sort());
    // users stays owner-only, so expanding the relation must not reveal the profile.
    expect(expand ?? {}).toEqual({});
  });
});

describe('chart writes', () => {
  it.each<Role>(['guest', 'user'])('rejects chart create and update by %s', async (role) => {
    const pb = clientFor(role);
    await expectStatus(
      createChart(pb, song.id, 'hard', fakeChartData('perm', 'hard')),
      CREATE_RULE_FAILED,
    );
    await expectStatus(
      pb.collection('charts').update(chart.id, { data: fakeChartData('perm', 'easy', 1_500) }),
      UPDATE_RULE_FAILED,
    );
    const charts = await server.superuser.collection('charts').getFullList();
    expect(charts.map((record) => record.id).sort()).toEqual(
      [chart.id, scoredChart.id, hiddenChart.id].sort(),
    );
    const stored = await server.superuser.collection('charts').getOne(chart.id);
    expect(stored['data']).toEqual(chart['data']);
  });

  it('lets an editor create and update charts', async () => {
    const created = await createChart(
      editor.client,
      song.id,
      'expert',
      fakeChartData('perm', 'expert'),
    );
    expect(created['difficulty']).toBe('expert');
    const data = fakeChartData('perm', 'easy', 1_500);
    const updated = await editor.client.collection('charts').update(chart.id, { data });
    expect(updated['data']).toEqual(data);
  });
});

describe('unpublished songs', () => {
  const listIds = async (pb: PocketBase, collection: string): Promise<string[]> =>
    (await pb.collection(collection).getFullList()).map((record) => record.id);

  const expectPublishLocked = async (pb: PocketBase): Promise<void> => {
    await expectStatus(
      pb.collection('songs').update(hiddenSong.id, { isPublished: true }),
      SUPERUSER_ONLY,
    );
    const stored = await server.superuser.collection('songs').getOne(hiddenSong.id);
    expect(stored['isPublished']).toBe(false);
  };

  it.each<Role>(['guest', 'user'])(
    'are hidden from the %s with their charts and scores',
    async (role) => {
      const pb = clientFor(role);
      expect(await listIds(pb, 'songs')).toEqual([song.id]);
      expect(await listIds(pb, 'charts')).not.toContain(hiddenChart.id);
      expect(await listIds(pb, 'scores')).not.toContain(hiddenScore.id);
      await expectStatus(pb.collection('songs').getOne(hiddenSong.id), VIEW_RULE_FAILED);
      await expectStatus(pb.collection('charts').getOne(hiddenChart.id), VIEW_RULE_FAILED);
      await expectStatus(pb.collection('scores').getOne(hiddenScore.id), VIEW_RULE_FAILED);
      await expectPublishLocked(pb);
    },
  );

  it('are visible to an editor with their charts but not their scores', async () => {
    const pb = editor.client;
    expect(await listIds(pb, 'songs')).toEqual(expect.arrayContaining([song.id, hiddenSong.id]));
    expect(await listIds(pb, 'charts')).toContain(hiddenChart.id);
    await expect(pb.collection('songs').getOne(hiddenSong.id)).resolves.toMatchObject({
      isPublished: false,
    });
    await expect(pb.collection('charts').getOne(hiddenChart.id)).resolves.toBeDefined();
    expect(await listIds(pb, 'scores')).not.toContain(hiddenScore.id);
    await expectPublishLocked(pb);
  });
});

describe('isEditor', () => {
  it('cannot be set on sign-up', async () => {
    await expectStatus(
      createClient(server.url).collection('users').create({
        email: 'signup@example.com',
        password: 'signup-password',
        passwordConfirm: 'signup-password',
        isEditor: true,
      }),
      CREATE_RULE_FAILED,
    );
    const filter = where(USERS, [{ email: 'signup@example.com' }]);
    const users = await server.superuser.collection(USERS.name).getFullList({
      filter: server.superuser.filter(filter.expression, filter.params),
    });
    expect(users).toEqual([]);
  });

  it.each([
    ['user', true],
    ['editor', false],
  ] as const)('cannot be changed by the %s on their own account', async (role, isEditor) => {
    const account = role === 'user' ? user : editor;
    await expectStatus(
      account.client.collection('users').update(account.id, { isEditor }),
      UPDATE_RULE_FAILED,
    );
    const stored = await server.superuser.collection('users').getOne(account.id);
    expect(stored['isEditor']).toBe(!isEditor);
  });
});

describe('profile fields', () => {
  it.each([
    ['nickname', 'Forged'],
    ['featuredAchievement', 'FIRST_CLEAR'],
  ])('cannot set %s on sign-up', async (field, value) => {
    const email = `signup-${field.toLowerCase()}@example.com`;
    await expectStatus(
      createClient(server.url)
        .collection('users')
        .create({
          email,
          password: 'signup-password',
          passwordConfirm: 'signup-password',
          [field]: value,
        }),
      CREATE_RULE_FAILED,
    );
    const filter = where(USERS, [{ email }]);
    const users = await server.superuser.collection(USERS.name).getFullList({
      filter: server.superuser.filter(filter.expression, filter.params),
    });
    expect(users).toEqual([]);
  });

  it.each(['guest', 'editor'] as const)(
    'cannot be changed on another account by the %s',
    async (role) => {
      const before = await server.superuser.collection('users').getOne(user.id);
      await expectStatus(
        clientFor(role).collection('users').update(user.id, {
          nickname: 'Forged',
          featuredAchievement: 'FIRST_CLEAR',
        }),
        UPDATE_RULE_FAILED,
      );
      const stored = await server.superuser.collection('users').getOne(user.id);
      expect(stored['nickname']).toBe(before['nickname']);
      expect(stored['featuredAchievement']).toBe(before['featuredAchievement']);
    },
  );

  it('cannot be saved together with a forged isEditor', async () => {
    const before = await server.superuser.collection('users').getOne(user.id);
    await expectStatus(
      user.client.collection('users').update(user.id, {
        nickname: 'Forged',
        isEditor: true,
      }),
      UPDATE_RULE_FAILED,
    );
    const stored = await server.superuser.collection('users').getOne(user.id);
    expect(stored['nickname']).toBe(before['nickname']);
    expect(stored['isEditor']).toBe(false);
  });
});

// 비공개 곡을 공개하면 다른 describe 의 정확한 목록 비교가 바뀌므로 마지막에 둔다.
describe('publishing a song', () => {
  it('shows the song, its charts and its scores to players', async () => {
    await server.superuser.collection('songs').update(hiddenSong.id, { isPublished: true });

    const songs = await user.client.collection('songs').getFullList();
    expect(songs.map((record) => record.id)).toContain(hiddenSong.id);
    const charts = await user.client.collection('charts').getFullList();
    expect(charts.map((record) => record.id)).toContain(hiddenChart.id);
    const scores = await user.client.collection('scores').getFullList();
    expect(scores.map((record) => record.id)).toContain(hiddenScore.id);
  });
});
