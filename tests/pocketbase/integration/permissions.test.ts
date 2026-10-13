import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// PocketBase answers a null rule with 403, a failed create rule with 400 and a failed update rule with 404.
const SUPERUSER_ONLY = 403;
const CREATE_RULE_FAILED = 400;
const UPDATE_RULE_FAILED = 404;

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

let dataDir: string;
let server: PocketBaseServer;
let song: RecordModel;
let chart: RecordModel;
let scoredChart: RecordModel;
let currentScore: RecordModel;
let playSession: RecordModel;
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

function scoreBody(userId: string, chartRevision: string) {
  return {
    user: userId,
    chart: scoredChart.id,
    chartRevision,
    score: 900_000,
    accuracy: 95,
    maxCombo: 2,
    cleared: true,
    counts: { perfect: 1, great: 1, good: 0, bad: 0, miss: 0 },
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
  song = await createSong(superuser, 'perm');
  chart = await createChart(superuser, song.id, 'easy', fakeChartData('perm', 'easy'));
  scoredChart = await createChart(superuser, song.id, 'normal', fakeChartData('perm', 'normal'));
  currentScore = await superuser
    .collection('scores')
    .create(scoreBody(scorer.id, String(scoredChart['revision'])));
  await superuser.collection('scores').create(scoreBody(scorer.id, 'stale-revision'));
  const nowMs = Date.now();
  playSession = await superuser.collection('play_sessions').create({
    user: user.id,
    chart: chart.id,
    chartRevision: String(chart['revision']),
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  });
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe.each<Role>(['guest', 'user', 'editor'])('%s', (role) => {
  it('lists songs but cannot create, update or delete them', async () => {
    const pb = clientFor(role);
    const songs = await pb.collection('songs').getFullList();
    expect(songs.map((record) => record.id)).toContain(song.id);
    await expectStatus(pb.collection('songs').create({ key: `new-${role}` }), SUPERUSER_ONLY);
    await expectStatus(pb.collection('songs').update(song.id, { title: role }), SUPERUSER_ONLY);
    await expectStatus(pb.collection('songs').delete(song.id), SUPERUSER_ONLY);
    const stored = await server.superuser.collection('songs').getOne(song.id);
    expect(stored['title']).toBe(song['title']);
  });

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
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }),
      SUPERUSER_ONLY,
    );
    await expectStatus(sessions.update(playSession.id, { chartRevision: 'x' }), SUPERUSER_ONLY);
    await expectStatus(sessions.delete(playSession.id), SUPERUSER_ONLY);
    const stored = await server.superuser.collection('play_sessions').getOne(playSession.id);
    expect(stored['chartRevision']).toBe(playSession['chartRevision']);
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
    expect(charts.map((record) => record.id).sort()).toEqual([chart.id, scoredChart.id].sort());
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
    const users = await server.superuser.collection('users').getFullList({
      filter: server.superuser.filter('email = {:email}', { email: 'signup@example.com' }),
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
