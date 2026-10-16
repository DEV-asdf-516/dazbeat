import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import type { CollectionModel } from 'pocketbase';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPO_MIGRATIONS_DIR,
  createTempDir,
  migrateDown,
  removeTempDir,
  startPocketBase,
} from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createChart,
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';

// The schema as it was before this feature, i.e. what existing deployments already applied.
const PRE_FEATURE_MIGRATIONS = [
  '1791331200_create_songs_and_charts.js',
  '1791347685_add_users_is_editor.js',
  '1791350301_updated_users.js',
  '1791436800_add_songs_constellation.js',
];

// The migrations this feature adds; reverting them must restore the schema and rules before it.
const FEATURE_MIGRATIONS = [
  '1792121800_create_play_session_quotas.js',
  '1792121900_relax_play_session_ip_rate_limits.js',
];
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];

const tempDirs: string[] = [];
const servers: PocketBaseServer[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

async function start(...args: Parameters<typeof startPocketBase>): Promise<PocketBaseServer> {
  const server = await startPocketBase(...args);
  servers.push(server);
  return server;
}

function fieldSummary(collection: CollectionModel) {
  return collection.fields
    .filter((field) => !field.system)
    .map((field) => ({
      name: field.name,
      type: field.type,
      required: field.required === true,
    }));
}

async function expectDazbeatRules(superuser: PocketBase, maxRequests: number): Promise<void> {
  const settings: unknown = await superuser.settings.getAll();
  expect(settings).toHaveProperty(
    'rateLimits.rules',
    expect.arrayContaining(
      DAZBEAT_LABELS.map((label) => ({
        label,
        audience: '',
        maxRequests,
        duration: 60,
      })),
    ),
  );
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
});

describe('migrations', () => {
  it('apply to an empty database', async () => {
    const server = await start({ dataDir: await tempDir('migrations-empty') });
    await excludeLoopbackFromRateLimits(server.superuser);
    const collections = server.superuser.collections;

    const charts = await collections.getOne('charts');
    expect(fieldSummary(charts)).toContainEqual({
      name: 'revision',
      type: 'text',
      required: false,
    });

    const playSessions = await collections.getOne('play_sessions');
    expect(fieldSummary(playSessions)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'chart',
        type: 'relation',
        required: true,
      },
      {
        name: 'chartRevision',
        type: 'text',
        required: true,
      },
      {
        name: 'issuedAt',
        type: 'date',
        required: true,
      },
      {
        name: 'expiresAt',
        type: 'date',
        required: true,
      },
    ]);
    expect(playSessions).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ['CREATE UNIQUE INDEX idx_play_sessions_user ON play_sessions (user)'],
    });

    const scores = await collections.getOne('scores');
    expect(fieldSummary(scores)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'chart',
        type: 'relation',
        required: true,
      },
      {
        name: 'chartRevision',
        type: 'text',
        required: true,
      },
      {
        name: 'score',
        type: 'number',
        required: false,
      },
      {
        name: 'accuracy',
        type: 'number',
        required: false,
      },
      {
        name: 'maxCombo',
        type: 'number',
        required: false,
      },
      {
        name: 'cleared',
        type: 'bool',
        required: false,
      },
      {
        name: 'counts',
        type: 'json',
        required: false,
      },
      {
        name: 'created',
        type: 'autodate',
        required: false,
      },
      {
        name: 'updated',
        type: 'autodate',
        required: false,
      },
    ]);
    expect(scores).toMatchObject({
      listRule: 'chartRevision = chart.revision',
      viewRule: 'chartRevision = chart.revision',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_scores_user_chart_revision ON scores (user, chart, chartRevision)',
      ],
    });

    const quotas = await collections.getOne('play_session_quotas');
    expect(fieldSummary(quotas)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'windowStartedAt',
        type: 'date',
        required: true,
      },
      {
        name: 'issuedCount',
        type: 'number',
        required: true,
      },
    ]);
    expect(quotas).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ['CREATE UNIQUE INDEX idx_play_session_quotas_user ON play_session_quotas (user)'],
    });
    await expectDazbeatRules(server.superuser, 30);
  });

  it('keep existing data and backfill chart revisions', async () => {
    const dataDir = await tempDir('migrations-existing');
    const oldMigrationsDir = await tempDir('migrations-old');
    const emptyHooksDir = await tempDir('hooks-empty');
    await Promise.all(
      PRE_FEATURE_MIGRATIONS.map((file) =>
        copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file)),
      ),
    );

    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const user = await createUser(oldServer, 'existing@example.com', true);
    const song = await createSong(oldServer.superuser, 'existing');
    const data = fakeChartData('existing', 'easy');
    const chart = await createChart(oldServer.superuser, song.id, 'easy', data);
    expect(chart['revision']).toBeUndefined();
    await oldServer.stop();

    const server = await start({ dataDir });
    const { superuser } = server;
    await excludeLoopbackFromRateLimits(superuser);
    const storedUser = await superuser.collection('users').getOne(user.id);
    expect(storedUser).toMatchObject({
      email: 'existing@example.com',
      isEditor: true,
    });
    const storedSong = await superuser.collection('songs').getOne(song.id);
    expect(storedSong.id).toBe(song.id);
    expect(storedSong['key']).toBe('existing');
    expect(storedSong['jacket']).toBe(song['jacket']);
    const storedChart = await superuser.collection('charts').getOne(chart.id);
    expect(storedChart['data']).toEqual(data);
    expect(storedChart['revision']).toMatch(/^[0-9a-f]{64}$/);

    const resaved = await superuser.collection('charts').update(chart.id, { data });
    expect(resaved['revision']).toBe(storedChart['revision']);
  });

  it("apply and roll back this feature's migrations on existing data", async () => {
    const dataDir = await tempDir('migrations-rollback');
    const oldMigrationsDir = await tempDir('migrations-before-feature');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => !FEATURE_MIGRATIONS.includes(file))
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });

    const oldServer = await startOld();
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    await expectDazbeatRules(oldServer.superuser, 10);
    const user = await createUser(oldServer, 'rollback@example.com');
    const song = await createSong(oldServer.superuser, 'rollback');
    // The empty hooks directory has no charts hook to fill the revision, so the chart gets one here.
    const chartRevision = 'rollback-revision';
    const chart = await oldServer.superuser.collection('charts').create({
      song: song.id,
      difficulty: 'easy',
      data: fakeChartData('rollback', 'easy'),
      revision: chartRevision,
    });
    const issuedAtMs = Date.now();
    const session = await oldServer.superuser.collection('play_sessions').create({
      user: user.id,
      chart: chart.id,
      chartRevision,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + 60_000).toISOString(),
    });
    const score = await oldServer.superuser.collection('scores').create({
      user: user.id,
      chart: chart.id,
      chartRevision,
      score: 900_000,
    });
    await oldServer.stop();

    const expectExistingData = async (superuser: PocketBase): Promise<void> => {
      expect((await superuser.collection('users').getOne(user.id))['email']).toBe(
        'rollback@example.com',
      );
      expect((await superuser.collection('songs').getOne(song.id))['key']).toBe('rollback');
      expect((await superuser.collection('charts').getOne(chart.id))['revision']).toBe(
        chartRevision,
      );
      expect(await superuser.collection('play_sessions').getOne(session.id)).toMatchObject({
        user: user.id,
        chart: chart.id,
      });
      expect((await superuser.collection('scores').getOne(score.id))['score']).toBe(900_000);
    };

    const upgraded = await start({ dataDir });
    await expectExistingData(upgraded.superuser);
    await upgraded.superuser.collections.getOne('play_session_quotas');
    await expectDazbeatRules(upgraded.superuser, 30);
    await upgraded.stop();

    await migrateDown(dataDir, FEATURE_MIGRATIONS.length);
    // The repository directory would re-apply the reverted migrations on serve.
    const rolledBack = await startOld();
    await expect(
      rolledBack.superuser.collections.getOne('play_session_quotas'),
    ).rejects.toMatchObject({ status: 404 });
    await expectDazbeatRules(rolledBack.superuser, 10);
    await expectExistingData(rolledBack.superuser);
    await rolledBack.stop();

    const reapplied = await start({ dataDir });
    await reapplied.superuser.collections.getOne('play_session_quotas');
    await expectDazbeatRules(reapplied.superuser, 30);
  });
});
