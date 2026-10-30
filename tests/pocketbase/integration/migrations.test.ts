import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import type { CollectionModel, RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPO_MIGRATIONS_DIR,
  createClient,
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

const PRE_FEATURE_MIGRATIONS = [
  '1791331200_create_songs_and_charts.js',
  '1791347685_add_users_is_editor.js',
  '1791350301_updated_users.js',
  '1791436800_add_songs_constellation.js',
];

const RELEASED_ON_MIGRATION = '1792554600_add_songs_released_on.js';
const ALBUM_MIGRATION = '1793412000_add_songs_album.js';
const ACHIEVEMENT_DEFINITIONS_MIGRATION = '1793498400_create_achievements.js';
const PUBLIC_READ_RULES = {
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
};
const ALBUMS = [
  {
    key: 'remindfulOne',
    name: 'Remindful.One',
    sortOrder: 10,
  },
  {
    key: 'remindfulTwo',
    name: 'Remindful.Two',
    sortOrder: 20,
  },
  {
    key: 'orbit',
    name: 'orbit',
    sortOrder: 30,
  },
  {
    key: 'newtroWave',
    name: 'NEWTRO WAVE',
    sortOrder: 40,
  },
  {
    key: 'nemuranaiYume',
    name: '眠らない夢',
    sortOrder: 50,
  },
  {
    key: 'nostalzia',
    name: 'Nostalzia',
    sortOrder: 60,
  },
];
// 컬렉션 이전 코드 정의와 i18n 이름에서 옮긴 표본. album 은 albums 의 key 다.
const ACHIEVEMENT_SAMPLES = [
  {
    key: 'PLAY_3',
    achievementSet: 'rhythm',
    category: 'play',
    sortOrder: 70,
    kind: 'plays',
    target: 3,
    mark: '',
    difficulty: '',
    zodiac: '',
    album: '',
    retired: false,
    nameKo: '세 번의 울림',
    nameJa: '三度の響き',
    nameEn: 'Three Echoes',
  },
  {
    key: 'EXPERT_CLEAR',
    achievementSet: 'rhythm',
    category: 'skill',
    sortOrder: 220,
    kind: 'charts',
    target: 1,
    mark: 'clear',
    difficulty: 'expert',
    zodiac: '',
    album: '',
    retired: false,
    nameKo: '별 너머로',
    nameJa: '星の彼方へ',
    nameEn: 'Beyond the Stars',
  },
  {
    key: 'ZODIAC_ARIES_S',
    achievementSet: 'zodiac',
    category: 'zodiacAllS',
    sortOrder: 480,
    kind: 'zodiacComplete',
    target: 0,
    mark: 's',
    difficulty: '',
    zodiac: 'aries',
    album: '',
    retired: false,
    nameKo: '양자리의 광휘',
    nameJa: '牡羊座の光輝',
    nameEn: 'Radiance of Aries',
  },
  {
    key: 'ALBUM_NEMURANAI_YUME_FC',
    achievementSet: 'discography',
    category: 'album',
    sortOrder: 1140,
    kind: 'album',
    target: 0,
    mark: 'fc',
    difficulty: '',
    zodiac: '',
    album: 'nemuranaiYume',
    retired: false,
    nameKo: '眠らない夢의 사슬',
    nameJa: '眠らない夢の鎖',
    nameEn: 'Chain of 眠らない夢',
  },
  {
    key: 'EXPERT_FC_5_CHARTS',
    achievementSet: 'rhythm',
    category: 'expert',
    sortOrder: 1200,
    kind: 'charts',
    target: 5,
    mark: 'fc',
    difficulty: 'expert',
    zodiac: '',
    album: '',
    retired: true,
    nameKo: '빛나는 손끝',
    nameJa: '輝く指先',
    nameEn: 'Shining Fingertips',
  },
];
// The migrations not deployed yet; reverting them must restore the deployed schema.
const FEATURE_MIGRATIONS = [
  RELEASED_ON_MIGRATION,
  '1792554700_add_query_indexes.js',
  '1792641600_add_song_title_search.js',
];
const QUERY_INDEXES = [
  {
    collection: 'songs',
    name: 'idx_songs_released_on_id',
  },
  {
    collection: 'songs',
    name: 'idx_songs_title_nocase',
  },
  {
    collection: 'scores',
    name: 'idx_scores_chart_revision_score',
  },
  {
    collection: 'play_sessions',
    name: 'idx_play_sessions_chart',
  },
];
const CATEGORY_INDEX_MIGRATION = '1792901100_add_songs_category_index.js';
const ACHIEVEMENT_MIGRATIONS = [
  '1792900800_create_achievement_records.js',
  '1792900900_backfill_achievement_marks.js',
  '1792901000_add_users_profile_fields.js',
];
const ACHIEVEMENT_COLLECTIONS = [
  'play_results',
  'earned_chart_marks',
  'earned_song_marks',
  'earned_achievements',
];
const MARK_FIELDS = [
  'user',
  'kind',
  'song',
  'difficulty',
  'chart',
  'chartRevision',
  'constellation',
  'source',
];
const PROFILE_FIELDS = ['nickname', 'featuredAchievement'];
const PROFILE_UPDATE_MIGRATION = '1793152800_allow_users_profile_updates.js';
const AUTOPLAY_CHECK_MIGRATION = '1793239200_add_play_results_autoplay_check.js';
const EARNED_MARKS_RENAME_MIGRATION = '1793757600_rename_earned_marks.js';
const AUTOPLAY_CHECK_FIELDS = ['autoplayCheck', 'autoplayReasons', 'inputStats'];
const PROFILE_PASSWORD = 'profile-password';
const DEFAULT_NICKNAME = /^과즙이\d{4}$/;
const PUBLISH_MIGRATION = '1793239200_add_songs_is_published.js';
const EDITOR_RULE = '@request.auth.id != "" && @request.auth.isEditor = true';
const READ_RULES_BEFORE_PUBLISH = {
  songs: '',
  charts: '',
  scores: 'chartRevision = chart.revision',
};
const READ_RULES_AFTER_PUBLISH = {
  songs: `isPublished = true || (${EDITOR_RULE})`,
  charts: `song.isPublished = true || (${EDITOR_RULE})`,
  scores: 'chartRevision = chart.revision && chart.song.isPublished = true',
};
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

async function albumIdOf(superuser: PocketBase, key: string): Promise<string> {
  return (await superuser.collection('albums').getFirstListItem(`key = "${key}"`)).id;
}

async function hasCollection(superuser: PocketBase, name: string): Promise<boolean> {
  return (await superuser.collections.getFullList()).some((collection) => collection.name === name);
}

async function expectReadRules(
  superuser: PocketBase,
  rules: Record<string, string>,
): Promise<void> {
  for (const [name, rule] of Object.entries(rules)) {
    expect(await superuser.collections.getOne(name)).toMatchObject({
      listRule: rule,
      viewRule: rule,
    });
  }
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

    const songs = await collections.getOne('songs');
    expect(fieldSummary(songs)).toContainEqual({
      name: 'releasedOn',
      type: 'date',
      required: true,
    });
    expect(fieldSummary(songs)).toContainEqual({
      name: 'isPublished',
      type: 'bool',
      required: false,
    });
    expect(fieldSummary(songs)).toContainEqual({
      name: 'previewStartMs',
      type: 'number',
      required: false,
    });
    expect(songs.indexes).toEqual([
      'CREATE UNIQUE INDEX idx_songs_key ON songs (key)',
      'CREATE INDEX `idx_songs_released_on_id` ON `songs` (releasedOn DESC, id DESC)',
      'CREATE INDEX `idx_songs_title_nocase` ON `songs` (title COLLATE NOCASE)',
      'CREATE INDEX `idx_songs_category_released_on_id` ON `songs` (category, releasedOn DESC, id DESC)',
    ]);

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
      {
        name: 'chartData',
        type: 'json',
        required: true,
      },
    ]);
    expect(playSessions.fields.find((field) => field.name === 'chartData')?.['maxSize']).toBe(
      charts.fields.find((field) => field.name === 'data')?.['maxSize'],
    );
    expect(playSessions).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_play_sessions_user ON play_sessions (user)',
        'CREATE INDEX `idx_play_sessions_chart` ON `play_sessions` (chart)',
      ],
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
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_scores_user_chart_revision ON scores (user, chart, chartRevision)',
        'CREATE INDEX `idx_scores_chart_revision_score` ON `scores` (chart, chartRevision, score DESC)',
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
    const albums = await collections.getOne('albums');
    expect(fieldSummary(albums)).toEqual([
      {
        name: 'key',
        type: 'text',
        required: true,
      },
      {
        name: 'name',
        type: 'text',
        required: true,
      },
      {
        name: 'sortOrder',
        type: 'number',
        required: false,
      },
    ]);
    expect(albums).toMatchObject({
      ...PUBLIC_READ_RULES,
      indexes: ['CREATE UNIQUE INDEX idx_albums_key ON albums (key)'],
    });
    expect(
      (await server.superuser.collection('albums').getFullList({ sort: 'sortOrder' })).map(
        (record) => ({
          key: record['key'] as unknown,
          name: record['name'] as unknown,
          sortOrder: record['sortOrder'] as unknown,
        }),
      ),
    ).toEqual(ALBUMS);
    expect(songs.fields.find((field) => field.name === 'album')).toMatchObject({
      type: 'relation',
      required: false,
      collectionId: albums.id,
      maxSelect: 1,
      cascadeDelete: false,
    });

    const achievements = await collections.getOne('achievements');
    expect(fieldSummary(achievements)).toEqual(
      [
        ['key', 'text', true],
        ['achievementSet', 'select', true],
        ['category', 'select', true],
        ['sortOrder', 'number', false],
        ['kind', 'select', true],
        ['target', 'number', false],
        ['mark', 'select', false],
        ['difficulty', 'select', false],
        ['zodiac', 'select', false],
        ['album', 'relation', false],
        ['retired', 'bool', false],
        ['nameKo', 'text', true],
        ['nameJa', 'text', true],
        ['nameEn', 'text', true],
      ].map(([name, type, required]) => ({
        name,
        type,
        required,
      })),
    );
    expect(achievements.fields.find((field) => field.name === 'album')).toMatchObject({
      collectionId: albums.id,
      maxSelect: 1,
      cascadeDelete: false,
    });
    expect(achievements).toMatchObject({
      ...PUBLIC_READ_RULES,
      indexes: [
        'CREATE UNIQUE INDEX idx_achievements_key ON achievements (key)',
        'CREATE INDEX `idx_achievements_sort_order_key` ON `achievements` (sortOrder, key)',
      ],
    });
    const definitions = await server.superuser
      .collection('achievements')
      .getFullList({ sort: 'sortOrder,key' });
    expect(definitions).toHaveLength(135);
    expect(definitions.filter((record) => record['retired'] === false)).toHaveLength(117);
    expect(new Set(definitions.map((record) => String(record['key']))).size).toBe(135);
    expect(definitions.map((record) => record['sortOrder'] as unknown)).toEqual(
      Array.from({ length: 135 }, (_, index) => (index + 1) * 10),
    );
    for (const sample of ACHIEVEMENT_SAMPLES) {
      expect(definitions.find((record) => record['key'] === sample.key)).toMatchObject({
        ...sample,
        album: sample.album === '' ? '' : await albumIdOf(server.superuser, sample.album),
      });
    }
    await expectReadRules(server.superuser, READ_RULES_AFTER_PUBLISH);
    await expectDazbeatRules(server.superuser, 30);
  });

  // 이 피처의 laneCount 훅은 laneCount 필드가 생기기 전 revision 백필에서 저장을 거부하므로,
  // 미배포 정책대로 채보가 있는 옛 DB 는 재생성하고 여기서는 채보 없이 기존 데이터 보존만 본다.
  it('keep existing users and songs', async () => {
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
  });

  it('allow one chart per song, difficulty and lane count', async () => {
    const { superuser } = await start({ dataDir: await tempDir('migrations-lane-count') });
    await excludeLoopbackFromRateLimits(superuser);
    const charts = await superuser.collections.getOne('charts');
    expect(fieldSummary(charts)).toContainEqual({
      name: 'laneCount',
      type: 'number',
      required: true,
    });
    expect(charts.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_charts_song_difficulty_lane_count` ON `charts` (song, difficulty, laneCount)',
    );
    const song = await createSong(superuser, 'lanes');

    await createChart(superuser, song.id, 'easy', fakeChartData('lanes', 'easy'));
    const fiveLane = await createChart(
      superuser,
      song.id,
      'easy',
      fakeChartData('lanes', 'easy', 1_000, 5),
      5,
    );
    expect(fiveLane['laneCount']).toBe(5);
    await expect(
      createChart(superuser, song.id, 'easy', fakeChartData('lanes', 'easy', 1_500)),
    ).rejects.toMatchObject({ status: 400 });
    expect(await superuser.collection('charts').getFullList()).toHaveLength(2);
  });

  it('backfill the release dates of the seeded songs only', async () => {
    const dataDir = await tempDir('migrations-released-on');
    const oldMigrationsDir = await tempDir('migrations-before-released-on');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file < RELEASED_ON_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const karma = await createSong(oldServer.superuser, 'karma');
    const unknown = await createSong(oldServer.superuser, 'unknown');
    await oldServer.stop();

    const { superuser } = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect((await superuser.collection('songs').getOne(karma.id))['releasedOn']).toBe(
      '2026-05-01 00:00:00.000Z',
    );
    expect((await superuser.collection('songs').getOne(unknown.id))['releasedOn']).toBe('');
  });

  it('backfill the albums of the seeded songs only', async () => {
    const dataDir = await tempDir('migrations-album');
    const oldMigrationsDir = await tempDir('migrations-before-album');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file < ALBUM_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const albumSong = await createSong(oldServer.superuser, 'yt-5A-ei_hKwH4');
    const unknown = await createSong(oldServer.superuser, 'unknown');
    await oldServer.stop();

    const { superuser } = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect((await superuser.collection('songs').getOne(albumSong.id))['album']).toBe(
      await albumIdOf(superuser, 'nemuranaiYume'),
    );
    expect((await superuser.collection('songs').getOne(unknown.id))['album']).toBe('');
  });

  it('remove the albums and achievements on rollback and restore them again', async () => {
    const dataDir = await tempDir('migrations-achievement-definitions');
    const oldMigrationsDir = await tempDir('migrations-before-albums');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file < ALBUM_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(upgraded.superuser);
    const albumSong = await createSong(upgraded.superuser, 'yt-5A-ei_hKwH4', 5_000, {
      album: await albumIdOf(upgraded.superuser, 'nemuranaiYume'),
    });
    await upgraded.stop();

    await migrateDown(dataDir, repoMigrations.filter((file) => file >= ALBUM_MIGRATION).length);
    const rolledBack = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(await hasCollection(rolledBack.superuser, 'albums')).toBe(false);
    expect(await hasCollection(rolledBack.superuser, 'achievements')).toBe(false);
    const rolledBackSong = await rolledBack.superuser.collection('songs').getOne(albumSong.id);
    expect(rolledBackSong['key']).toBe('yt-5A-ei_hKwH4');
    expect(rolledBackSong).not.toHaveProperty('album');
    await rolledBack.stop();

    const restored = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await restored.superuser.collection('albums').getFullList()).toHaveLength(6);
    expect(await restored.superuser.collection('achievements').getFullList()).toHaveLength(135);
    expect((await restored.superuser.collection('songs').getOne(albumSong.id))['album']).toBe(
      await albumIdOf(restored.superuser, 'nemuranaiYume'),
    );
  });

  it('keep earned achievements and featured achievements through the achievements migration', async () => {
    const dataDir = await tempDir('migrations-earned-kept');
    const oldMigrationsDir = await tempDir('migrations-before-achievements');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file < ACHIEVEMENT_DEFINITIONS_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    // With empty hooks no hook fills the default nickname, so it is given here.
    const user = await oldServer.superuser.collection('users').create({
      email: 'earned@example.com',
      password: PROFILE_PASSWORD,
      passwordConfirm: PROFILE_PASSWORD,
      nickname: 'Earned',
      featuredAchievement: 'S_20_CHARTS',
    });
    const earned = await oldServer.superuser.collection('earned_achievements').create({
      user: user.id,
      achievement: 'S_20_CHARTS',
    });
    await oldServer.stop();

    const { superuser } = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await superuser.collection('achievements').getFullList()).toHaveLength(135);
    expect((await superuser.collection('users').getOne(user.id))['featuredAchievement']).toBe(
      'S_20_CHARTS',
    );
    expect(await superuser.collection('earned_achievements').getOne(earned.id)).toMatchObject({
      user: user.id,
      achievement: 'S_20_CHARTS',
      earnedAt: earned['earnedAt'] as unknown,
    });
  });

  it("apply and roll back this feature's migrations on existing data", async () => {
    // The category index is built on releasedOn, so it cannot exist before this feature either.
    const rolledBackMigrations = [...FEATURE_MIGRATIONS, CATEGORY_INDEX_MIGRATION];
    const dataDir = await tempDir('migrations-rollback');
    const oldMigrationsDir = await tempDir('migrations-before-feature');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => !rolledBackMigrations.includes(file))
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
    const song = await createSong(oldServer.superuser, 'rollback');
    await oldServer.stop();

    const hasReleasedOn = async (superuser: PocketBase): Promise<boolean> =>
      fieldSummary(await superuser.collections.getOne('songs')).some(
        (field) => field.name === 'releasedOn',
      );
    const findQueryIndexes = async (superuser: PocketBase): Promise<string[]> => {
      const found = await Promise.all(
        QUERY_INDEXES.map(async ({ collection, name }) =>
          (await superuser.collections.getOne(collection)).indexes.some((index) =>
            index.includes(name),
          )
            ? [name]
            : [],
        ),
      );
      return found.flat();
    };
    const allIndexNames = QUERY_INDEXES.map(({ name }) => name);
    const expectExistingSong = async (superuser: PocketBase): Promise<void> => {
      expect((await superuser.collection('songs').getOne(song.id))['key']).toBe('rollback');
    };

    const upgraded = await start({ dataDir });
    expect(await hasReleasedOn(upgraded.superuser)).toBe(true);
    expect(await findQueryIndexes(upgraded.superuser)).toEqual(allIndexNames);
    await expectExistingSong(upgraded.superuser);
    await upgraded.stop();

    await migrateDown(dataDir, rolledBackMigrations.length);
    // The repository directory would re-apply the reverted migrations on serve.
    const rolledBack = await startOld();
    expect(await hasReleasedOn(rolledBack.superuser)).toBe(false);
    expect(await findQueryIndexes(rolledBack.superuser)).toEqual([]);
    await expectExistingSong(rolledBack.superuser);
    await rolledBack.stop();

    const reapplied = await start({ dataDir });
    expect(await hasReleasedOn(reapplied.superuser)).toBe(true);
    expect(await findQueryIndexes(reapplied.superuser)).toEqual(allIndexNames);
  });

  it('backfill marks and default nicknames for existing data and roll them back', async () => {
    const dataDir = await tempDir('migrations-achievements');
    const oldMigrationsDir = await tempDir('migrations-before-achievements');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        // The profile update migration edits the rule the profile fields migration adds, the
        // autoplay check migration adds fields to play_results, and the rename migration renames
        // the mark collections, all of which the old server lacks.
        .filter(
          (file) =>
            ![
              ...ACHIEVEMENT_MIGRATIONS,
              PROFILE_UPDATE_MIGRATION,
              AUTOPLAY_CHECK_MIGRATION,
              EARNED_MARKS_RENAME_MIGRATION,
            ].includes(file),
        )
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });

    const oldServer = await startOld();
    const { superuser: oldSuperuser } = oldServer;
    await excludeLoopbackFromRateLimits(oldSuperuser);
    const user = await createUser(oldServer, 'scorer@example.com');
    const otherUser = await createUser(oldServer, 'other@example.com');
    const oldUsers = await oldSuperuser.collections.getOne('users');
    const song = await createSong(oldSuperuser, 'backfill');
    const easy = await createChart(
      oldSuperuser,
      song.id,
      'easy',
      fakeChartData('backfill', 'easy'),
    );
    const expert = await createChart(
      oldSuperuser,
      song.id,
      'expert',
      fakeChartData('backfill', 'expert'),
    );
    const counts = (great: number, good: number) => ({
      perfect: 10,
      great,
      good,
      bad: 0,
      miss: 0,
    });
    const scores = [
      {
        chart: easy,
        chartRevision: 'all',
        accuracy: 0.97,
        cleared: true,
        counts: counts(0, 0),
      },
      {
        chart: easy,
        chartRevision: 'fc',
        accuracy: 0.9,
        cleared: true,
        counts: counts(2, 0),
      },
      {
        chart: expert,
        chartRevision: 's',
        accuracy: 0.95,
        cleared: true,
        counts: counts(1, 1),
      },
      {
        chart: expert,
        chartRevision: 'failed',
        accuracy: 0.5,
        cleared: false,
        counts: counts(0, 0),
      },
    ];
    for (const { chart, ...score } of scores) {
      await oldSuperuser.collection('scores').create({
        user: user.id,
        chart: chart.id,
        score: 900_000,
        maxCombo: 10,
        ...score,
      });
    }
    await oldServer.stop();

    const mark = (kind: string, chart: RecordModel, chartRevision: string) => ({
      user: user.id,
      kind,
      song: song.id,
      difficulty: String(chart['difficulty']),
      chart: chart.id,
      chartRevision,
      constellation: '',
      source: 'backfill',
    });
    const expectedMarks = [
      mark('clear', easy, 'all'),
      mark('s', easy, 'all'),
      mark('fc', easy, 'all'),
      mark('ap', easy, 'all'),
      mark('clear', easy, 'fc'),
      mark('fc', easy, 'fc'),
      mark('clear', expert, 's'),
      mark('s', expert, 's'),
    ];
    // Rolling back the rename migration moves the marks back to their first collection name.
    const findMarks = async (superuser: PocketBase, collection = 'earned_chart_marks') =>
      (await superuser.collection(collection).getFullList()).map((record) =>
        Object.fromEntries(MARK_FIELDS.map((field) => [field, String(record[field])])),
      );
    const findCollectionNames = async (superuser: PocketBase): Promise<string[]> =>
      (await superuser.collections.getFullList())
        .map(({ name }) => name)
        .filter((name) => ACHIEVEMENT_COLLECTIONS.includes(name))
        .sort();

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findMarks(upgraded.superuser)).toEqual(expect.arrayContaining(expectedMarks));
    expect(await findMarks(upgraded.superuser)).toHaveLength(expectedMarks.length);
    expect(await upgraded.superuser.collection('play_results').getFullList()).toEqual([]);
    const nicknames = await Promise.all(
      [user, otherUser].map(async ({ id }) =>
        String((await upgraded.superuser.collection('users').getOne(id))['nickname']),
      ),
    );
    for (const nickname of nicknames) {
      expect(nickname).toMatch(DEFAULT_NICKNAME);
    }
    expect(new Set(nicknames).size).toBe(nicknames.length);
    const upgradedUsers = await upgraded.superuser.collections.getOne('users');
    expect(fieldSummary(upgradedUsers)).toEqual(
      expect.arrayContaining([
        {
          name: 'nickname',
          type: 'text',
          required: true,
        },
        {
          name: 'featuredAchievement',
          type: 'text',
          required: false,
        },
      ]),
    );
    expect(upgradedUsers.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_users_nickname_nocase` ON `users` (nickname COLLATE NOCASE)',
    );
    await upgraded.stop();

    await migrateDown(dataDir, 4);
    const withoutProfile = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    const rolledBackUsers = await withoutProfile.superuser.collections.getOne('users');
    expect(
      fieldSummary(rolledBackUsers).filter(({ name }) => PROFILE_FIELDS.includes(name)),
    ).toEqual([]);
    expect(rolledBackUsers.indexes).toEqual(oldUsers.indexes);
    expect(rolledBackUsers).toMatchObject({
      createRule: oldUsers.createRule,
      updateRule: oldUsers.updateRule,
    });
    await withoutProfile.stop();

    await migrateDown(dataDir, 1);
    const withoutBackfill = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findMarks(withoutBackfill.superuser, 'achievement_marks')).toEqual([]);
    await withoutBackfill.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await startOld();
    expect(await findCollectionNames(rolledBack.superuser)).toEqual([]);
    await rolledBack.stop();

    const reapplied = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findCollectionNames(reapplied.superuser)).toEqual(
      [...ACHIEVEMENT_COLLECTIONS].sort(),
    );
    expect(await findMarks(reapplied.superuser)).toHaveLength(expectedMarks.length);
  });

  it('let users change their own profile fields and forbid it again on rollback', async () => {
    const dataDir = await tempDir('migrations-profile-updates');
    const oldMigrationsDir = await tempDir('migrations-before-profile-updates');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file !== PROFILE_UPDATE_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });
    const signIn = async (server: PocketBaseServer, email: string): Promise<PocketBase> => {
      const client = createClient(server.url);
      await client.collection('users').authWithPassword(email, PROFILE_PASSWORD);
      return client;
    };

    const oldServer = await startOld();
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const createProfileUser = async (email: string, nickname: string) => {
      const record = await oldServer.superuser.collection('users').create({
        email,
        password: PROFILE_PASSWORD,
        passwordConfirm: PROFILE_PASSWORD,
        nickname,
        featuredAchievement: 'FIRST_CLEAR',
      });
      return {
        id: record.id,
        email,
      };
    };
    const owner = await createProfileUser('owner@example.com', 'Owner');
    const other = await createProfileUser('other@example.com', 'Other');
    const oldUsers = await oldServer.superuser.collections.getOne('users');
    await expect(
      (await signIn(oldServer, owner.email)).collection('users').update(owner.id, {
        nickname: 'Polaris',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await oldServer.superuser.collection('users').getOne(owner.id))['nickname']).toBe(
      'Owner',
    );
    await oldServer.stop();

    const expectSchemaKept = (users: CollectionModel): void => {
      expect(users.createRule).toBe(oldUsers.createRule);
      expect(users.indexes).toEqual(oldUsers.indexes);
      expect(fieldSummary(users)).toEqual(fieldSummary(oldUsers));
    };
    const expectUsersKept = async (superuser: PocketBase, ownerNickname: string) => {
      const stored = await Promise.all(
        [owner, other].map((user) => superuser.collection('users').getOne(user.id)),
      );
      expect(
        stored.map((record) => ({
          id: record.id,
          email: String(record['email']),
          nickname: String(record['nickname']),
          featuredAchievement: String(record['featuredAchievement']),
        })),
      ).toEqual([
        {
          id: owner.id,
          email: owner.email,
          nickname: ownerNickname,
          featuredAchievement: 'FIRST_CLEAR',
        },
        {
          id: other.id,
          email: other.email,
          nickname: 'Other',
          featuredAchievement: 'FIRST_CLEAR',
        },
      ]);
    };

    const upgraded = await start({ dataDir });
    const upgradedUsers = await upgraded.superuser.collections.getOne('users');
    expect(upgradedUsers.updateRule).toBe(
      '(id = @request.auth.id) && @request.body.isEditor:changed = false',
    );
    expectSchemaKept(upgradedUsers);
    const ownerClient = await signIn(upgraded, owner.email);
    await expect(
      ownerClient.collection('users').update(owner.id, { nickname: 'Polaris' }),
    ).resolves.toMatchObject({ nickname: 'Polaris' });
    await expect(
      ownerClient.collection('users').update(other.id, { nickname: 'Forged' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ownerClient.collection('users').update(owner.id, {
        nickname: 'Forged',
        isEditor: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expectUsersKept(upgraded.superuser, 'Polaris');
    await upgraded.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await startOld();
    const rolledBackUsers = await rolledBack.superuser.collections.getOne('users');
    expect(rolledBackUsers.updateRule).toBe(oldUsers.updateRule);
    expectSchemaKept(rolledBackUsers);
    await expect(
      (await signIn(rolledBack, owner.email)).collection('users').update(owner.id, {
        nickname: 'Vega',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expectUsersKept(rolledBack.superuser, 'Polaris');
  });

  it('add the songs category index and remove it on rollback', async () => {
    const dataDir = await tempDir('migrations-category-index');
    const oldMigrationsDir = await tempDir('migrations-before-category-index');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file !== CATEGORY_INDEX_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const hasCategoryIndex = async (superuser: PocketBase): Promise<boolean> =>
      (await superuser.collections.getOne('songs')).indexes.some((index) =>
        index.includes('idx_songs_category_released_on_id'),
      );

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await hasCategoryIndex(upgraded.superuser)).toBe(true);
    await upgraded.stop();

    // A new database applies every migration at once, so the ones after the index are reverted
    // first and reapplied by the old directory.
    const laterMigrations = repoMigrations.filter((file) => file > CATEGORY_INDEX_MIGRATION);
    await migrateDown(dataDir, laterMigrations.length + 1);
    const rolledBack = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(await hasCategoryIndex(rolledBack.superuser)).toBe(false);
  });

  it('add the play_results autoplay check fields and remove only them on rollback', async () => {
    const dataDir = await tempDir('migrations-autoplay-check');
    const oldMigrationsDir = await tempDir('migrations-before-autoplay-check');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file !== AUTOPLAY_CHECK_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const autoplayFields = (collection: CollectionModel) =>
      fieldSummary(collection).filter(({ name }) => AUTOPLAY_CHECK_FIELDS.includes(name));
    const playedFields = {
      session: 'session-1',
      song: 'song-1',
      chart: 'chart-1',
      difficulty: 'easy',
      laneCount: 4,
      chartRevision: 'rev-1',
      constellation: 'leo',
      score: 900_000,
      accuracy: 0.9,
      maxCombo: 12,
      counts: {
        perfect: 10,
        great: 2,
        good: 0,
        bad: 0,
        miss: 1,
      },
      cleared: true,
    };

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(upgraded.superuser);
    const upgradedPlayResults = await upgraded.superuser.collections.getOne('play_results');
    expect(autoplayFields(upgradedPlayResults)).toEqual([
      {
        name: 'autoplayCheck',
        type: 'select',
        required: false,
      },
      {
        name: 'autoplayReasons',
        type: 'select',
        required: false,
      },
      {
        name: 'inputStats',
        type: 'json',
        required: false,
      },
    ]);
    expect(upgradedPlayResults).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    // With empty hooks no hook fills the default nickname, so it is given here.
    const user = await upgraded.superuser.collection('users').create({
      email: 'autoplay@example.com',
      password: PROFILE_PASSWORD,
      passwordConfirm: PROFILE_PASSWORD,
      nickname: 'Autoplay',
    });
    const playResult = await upgraded.superuser.collection('play_results').create({
      user: user.id,
      ...playedFields,
      autoplayCheck: 'suspicious',
      autoplayReasons: ['low_std_dev'],
      inputStats: {
        sampleCount: 50,
        chordCount: 0,
        meanOffsetMs: 5,
        stdDevMs: 0,
        nearZeroRatio: 0,
        syncedChordRatio: null,
      },
    });
    await upgraded.stop();

    // A new database applies every migration at once, so the ones after this migration are
    // reverted first and reapplied by the old directory.
    const laterMigrations = repoMigrations.filter((file) => file > AUTOPLAY_CHECK_MIGRATION);
    await migrateDown(dataDir, laterMigrations.length + 1);
    const rolledBack = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(autoplayFields(await rolledBack.superuser.collections.getOne('play_results'))).toEqual(
      [],
    );
    const stored = await rolledBack.superuser.collection('play_results').getOne(playResult.id);
    expect(stored).toMatchObject({
      user: user.id,
      ...playedFields,
    });
    for (const field of AUTOPLAY_CHECK_FIELDS) {
      expect(stored).not.toHaveProperty(field);
    }
  });

  it('publish existing songs and restore the rules on rollback', async () => {
    const dataDir = await tempDir('migrations-publish');
    const oldMigrationsDir = await tempDir('migrations-before-publish');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file !== PUBLISH_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });
    const hasIsPublished = async (superuser: PocketBase): Promise<boolean> =>
      fieldSummary(await superuser.collections.getOne('songs')).some(
        (field) => field.name === 'isPublished',
      );

    const oldServer = await startOld();
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const existing = await createSong(oldServer.superuser, 'existing');
    await oldServer.stop();

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    const { superuser } = upgraded;
    await excludeLoopbackFromRateLimits(superuser);
    expect((await superuser.collection('songs').getOne(existing.id))['isPublished']).toBe(true);
    // createSong 은 공개 곡을 만들므로, 기본값을 보려고 isPublished 없이 만든다.
    const created = await superuser.collection('songs').create({
      key: 'created',
      title: 'Song created',
      category: 'original',
      youtubeVideoId: 'video-created',
      accentColor: 0x123456,
      constellation: 'gemini',
      releasedOn: '2026-01-01',
      gameStartMs: 0,
      gameEndMs: 5_000,
      jacket: new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        'created.png',
        { type: 'image/png' },
      ),
    });
    expect(created['isPublished']).toBe(false);
    await expectReadRules(superuser, READ_RULES_AFTER_PUBLISH);
    await upgraded.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await startOld();
    await expectReadRules(rolledBack.superuser, READ_RULES_BEFORE_PUBLISH);
    expect(await hasIsPublished(rolledBack.superuser)).toBe(false);
    const songs = await rolledBack.superuser.collection('songs').getFullList();
    expect(songs.map((record) => record.id).sort()).toEqual([existing.id, created.id].sort());
  });
});
