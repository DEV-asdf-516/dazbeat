import type { FilterValue } from '../../../src/pbQuery.js';
import { copyFile, cp, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSongSearchQuery } from '../../../pocketbase/verification/songSearch.js';
import {
  REPO_HOOKS_DIR,
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
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';

const SEARCH_MIGRATION = '1792641600_add_song_title_search.js';
const SEARCH_ROUTE = '/api/dazbeat/songs/search';
const SEARCH_BATCH_SIZE = 100;
const SQL_ROUTE = '/api/test/sql';
// Only the copied hooks directory gets this route, so the repository hooks never expose raw SQL.
const SQL_ROUTE_HOOK = `/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'POST',
  '${SQL_ROUTE}',
  (e) => {
    const { sql, params, columns } = e.requestInfo().body;
    const row = {};
    columns.forEach((name) => {
      row[name] = '';
    });
    const rows = arrayOf(new DynamicModel(row));
    $app.db().newQuery(sql).bind(params).all(rows);
    return e.json(200, rows);
  },
  $apis.requireSuperuserAuth(),
);
`;
const SEARCH_OBJECTS = [
  {
    type: 'index',
    name: 'idx_songs_title_nocase',
  },
  {
    type: 'table',
    name: 'songs_title_fts',
  },
  {
    type: 'trigger',
    name: 'songs_title_fts_after_delete',
  },
  {
    type: 'trigger',
    name: 'songs_title_fts_after_insert',
  },
  {
    type: 'trigger',
    name: 'songs_title_fts_after_update',
  },
];

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

async function createHooksDirWithSqlRoute(): Promise<string> {
  const hooksDir = await tempDir('hooks-sql');
  await cp(REPO_HOOKS_DIR, hooksDir, { recursive: true });
  await writeFile(join(hooksDir, 'testSql.pb.js'), SQL_ROUTE_HOOK);
  return hooksDir;
}

async function createMigrationsDirWithoutSearch(): Promise<string> {
  const migrationsDir = await tempDir('migrations-before-search');
  const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
  await Promise.all(
    repoMigrations
      .filter((file) => file !== SEARCH_MIGRATION)
      .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(migrationsDir, file))),
  );
  return migrationsDir;
}

/** Every column comes back as text because the route scans each one into a string. */
function querySql(
  superuser: PocketBase,
  sql: string,
  params: Record<string, FilterValue>,
  columns: readonly string[],
): Promise<Record<string, string>[]> {
  return superuser.send<Record<string, string>[]>(SQL_ROUTE, {
    method: 'POST',
    body: {
      sql,
      params,
      columns,
    },
  });
}

function findSearchObjects(superuser: PocketBase): Promise<Record<string, string>[]> {
  return querySql(
    superuser,
    `SELECT type, name FROM sqlite_master
      WHERE name IN ({:index}, {:table}, {:insert}, {:update}, {:delete})
      ORDER BY name`,
    {
      index: 'idx_songs_title_nocase',
      table: 'songs_title_fts',
      insert: 'songs_title_fts_after_insert',
      update: 'songs_title_fts_after_update',
      delete: 'songs_title_fts_after_delete',
    },
    ['type', 'name'],
  );
}

/** FTS rows matching the quoted phrase, joined back to their songs. */
function matchTitle(superuser: PocketBase, phrase: string): Promise<Record<string, string>[]> {
  return querySql(
    superuser,
    `SELECT songs_title_fts.rowid AS ftsRowid, songs_title_fts.songId AS songId,
        songs.rowid AS songRowid, songs.id AS id
      FROM songs_title_fts JOIN songs ON songs.id = songs_title_fts.songId
      WHERE songs_title_fts MATCH {:match}
      ORDER BY songs.id`,
    { match: `"${phrase}"` },
    ['ftsRowid', 'songId', 'songRowid', 'id'],
  );
}

async function matchedSongIds(superuser: PocketBase, phrase: string): Promise<string[]> {
  return (await matchTitle(superuser, phrase)).map((row) => row['songId'] ?? '');
}

async function countFtsRows(superuser: PocketBase, songId: string): Promise<number> {
  const rows = await querySql(
    superuser,
    'SELECT COUNT(*) AS count FROM songs_title_fts WHERE songId = {:songId}',
    { songId },
    ['count'],
  );
  return Number(rows[0]?.['count']);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
});

describe('song title search index', () => {
  it('backfills, follows song changes, rolls back and re-applies', async () => {
    const dataDir = await tempDir('song-search-lifecycle');
    const hooksDir = await createHooksDirWithSqlRoute();
    const oldMigrationsDir = await createMigrationsDirWithoutSearch();
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir,
      });
    const startUpgraded = () =>
      start({
        dataDir,
        hooksDir,
      });

    const oldServer = await startOld();
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const existing = await createSong(oldServer.superuser, 'existing', undefined, {
      title: 'Twinkle Starlight',
    });
    await oldServer.stop();

    const upgraded = await startUpgraded();
    const { superuser } = upgraded;
    expect(await findSearchObjects(superuser)).toEqual(SEARCH_OBJECTS);
    // A match in the middle of the title only works with the trigram tokenizer.
    const backfilled = await matchTitle(superuser, 'inkle');
    expect(backfilled).toHaveLength(1);
    expect(backfilled[0]?.['songId']).toBe(existing.id);
    expect(backfilled[0]?.['ftsRowid']).toBe(backfilled[0]?.['songRowid']);

    const created = await createSong(superuser, 'created', undefined, { title: 'Moonlit Harbor' });
    const createdRows = await matchTitle(superuser, 'nlit');
    expect(createdRows.map((row) => row['songId'])).toEqual([created.id]);
    expect(createdRows[0]?.['ftsRowid']).toBe(createdRows[0]?.['songRowid']);

    await superuser.collection('songs').update(created.id, { title: 'Sunrise Avenue' });
    expect(await matchedSongIds(superuser, 'nlit')).toEqual([]);
    expect(await matchedSongIds(superuser, 'rise')).toEqual([created.id]);

    await superuser.collection('songs').update(created.id, { gameEndMs: 6_000 });
    expect(await matchedSongIds(superuser, 'rise')).toEqual([created.id]);
    expect(await countFtsRows(superuser, created.id)).toBe(1);

    await superuser.collection('songs').delete(created.id);
    expect(await matchedSongIds(superuser, 'rise')).toEqual([]);
    expect(await countFtsRows(superuser, created.id)).toBe(0);
    await upgraded.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await startOld();
    expect(await findSearchObjects(rolledBack.superuser)).toEqual([]);
    const kept = await rolledBack.superuser.collection('songs').getOne(existing.id);
    expect(kept).toMatchObject({
      key: 'existing',
      title: 'Twinkle Starlight',
    });
    expect(kept['jacket']).toBe(existing['jacket']);
    await rolledBack.superuser.collection('songs').update(existing.id, { title: 'Crimson Tide' });
    const addedWhileRolledBack = await createSong(rolledBack.superuser, 'rolled-back', undefined, {
      title: 'Velvet Morning',
    });
    await rolledBack.stop();

    const reapplied = await startUpgraded();
    expect(await findSearchObjects(reapplied.superuser)).toEqual(SEARCH_OBJECTS);
    expect(await matchedSongIds(reapplied.superuser, 'inkle')).toEqual([]);
    expect(await matchedSongIds(reapplied.superuser, 'mson')).toEqual([existing.id]);
    expect(await matchedSongIds(reapplied.superuser, 'lvet')).toEqual([addedWhileRolledBack.id]);
  });
});

type SearchParams = Record<string, string>;

interface ChartSummary {
  readonly id: string;
  readonly difficulty: string;
  readonly laneCount: number;
}

interface SearchItem extends RecordModel {
  readonly releasedOn: string;
  readonly expand?: { readonly charts_via_song?: readonly ChartSummary[] };
}

async function startSearchServer(): Promise<PocketBaseServer> {
  // Changing collection rules makes PocketBase write automigrate files, so they go to a copy.
  const migrationsDir = await tempDir('migrations-search');
  await cp(REPO_MIGRATIONS_DIR, migrationsDir, { recursive: true });
  const server = await start({
    dataDir: await tempDir('song-search'),
    migrationsDir,
    hooksDir: await createHooksDirWithSqlRoute(),
  });
  await excludeLoopbackFromRateLimits(server.superuser);
  return server;
}

interface SearchResponse {
  items: SearchItem[];
  totalItems: number | null;
}

function search(client: PocketBase, params: SearchParams): Promise<SearchResponse> {
  return client.send<SearchResponse>(SEARCH_ROUTE, { query: params });
}

async function searchTitles(client: PocketBase, title: string): Promise<string[]> {
  const { items } = await search(client, { title });
  return items.map((item) => String(item['title'])).sort();
}

/** Follows the cursor of each full batch until a short one, like the client does. */
async function searchAll(
  client: PocketBase,
  params: SearchParams,
): Promise<{ ids: string[]; batchSizes: number[]; totals: (number | null)[] }> {
  const ids: string[] = [];
  const batchSizes: number[] = [];
  const totals: (number | null)[] = [];
  let cursor: SearchParams = {};
  for (;;) {
    const { items, totalItems } = await search(client, {
      ...params,
      ...cursor,
    });
    ids.push(...items.map((item) => item.id));
    batchSizes.push(items.length);
    totals.push(totalItems);
    const last = items.at(-1);
    if (items.length < SEARCH_BATCH_SIZE || last === undefined) {
      return {
        ids,
        batchSizes,
        totals,
      };
    }
    cursor = {
      afterReleasedOn: last.releasedOn,
      afterId: last.id,
    };
  }
}

function newestFirst(songs: readonly RecordModel[]): string[] {
  return [...songs]
    .sort(
      (a, b) =>
        String(b['releasedOn']).localeCompare(String(a['releasedOn'])) || (a.id < b.id ? 1 : -1),
    )
    .map((song) => song.id);
}

async function expectInvalidRequest(request: Promise<unknown>): Promise<void> {
  const error: unknown = await request.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ClientResponseError);
  expect(error).toMatchObject({
    status: 400,
    response: {
      status: 400,
      code: 'invalid_request',
    },
  });
}

async function explain(
  superuser: PocketBase,
  sql: string,
  bindings: Readonly<Record<string, FilterValue>>,
): Promise<string[]> {
  const rows = await querySql(superuser, `EXPLAIN QUERY PLAN ${sql}`, { ...bindings }, ['detail']);
  return rows.map((row) => row['detail'] ?? '');
}

describe('song title search API', () => {
  it('matches prefixes up to two characters and substrings from three, literally', async () => {
    const { url, superuser } = await startSearchServer();
    const titles = [
      '별빛 여행',
      '星の歌',
      'Twinkle Star',
      'Starlight',
      '100% Pure',
      '%Off Sale',
      'snake_case',
      '_Under',
      'aUdio',
      'say "hi"',
      "it's me",
      'back\\slash',
      '\\root',
      'root beer',
      'OR NEAR',
      'x*y^z:w',
      '𝄞a Clef',
    ];
    await Promise.all(
      titles.map((title, index) => createSong(superuser, `title-${index}`, undefined, { title })),
    );
    const guest = createClient(url);

    expect(await searchTitles(guest, '별')).toEqual(['별빛 여행']);
    expect(await searchTitles(guest, '빛')).toEqual([]);
    expect(await searchTitles(guest, '星の')).toEqual(['星の歌']);
    expect(await searchTitles(guest, 'の歌')).toEqual([]);
    expect(await searchTitles(guest, '빛 여')).toEqual(['별빛 여행']);
    expect(await searchTitles(guest, 'inkle')).toEqual(['Twinkle Star']);
    expect(await searchTitles(guest, 'tw')).toEqual(['Twinkle Star']);
    expect(await searchTitles(guest, 'STAR')).toEqual(['Starlight', 'Twinkle Star']);
    expect(await searchTitles(guest, '  tw  ')).toEqual(['Twinkle Star']);
    expect(await searchTitles(guest, 'e S')).toEqual(['Twinkle Star']);
    expect(await searchTitles(guest, '%O')).toEqual(['%Off Sale']);
    expect(await searchTitles(guest, '0% P')).toEqual(['100% Pure']);
    expect(await searchTitles(guest, '_U')).toEqual(['_Under']);
    expect(await searchTitles(guest, 'e_c')).toEqual(['snake_case']);
    expect(await searchTitles(guest, '"hi"')).toEqual(['say "hi"']);
    expect(await searchTitles(guest, "t's")).toEqual(["it's me"]);
    expect(await searchTitles(guest, '\\r')).toEqual(['\\root']);
    expect(await searchTitles(guest, 'k\\s')).toEqual(['back\\slash']);
    expect(await searchTitles(guest, 'OR NEAR')).toEqual(['OR NEAR']);
    expect(await searchTitles(guest, 'Star OR Twinkle')).toEqual([]);
    expect(await searchTitles(guest, 'y^z:')).toEqual(['x*y^z:w']);
    expect(await searchTitles(guest, 'x*')).toEqual(['x*y^z:w']);
    // Two code points but three UTF-16 units, so it stays a prefix search.
    expect(await searchTitles(guest, '𝄞a')).toEqual(['𝄞a Clef']);
    expect(await searchTitles(guest, 'nothing like it')).toEqual([]);
  });

  it('matches a title regardless of composed or decomposed kana', async () => {
    const { url, superuser } = await startSearchServer();
    const composed = 'いかないで';
    const decomposed = composed.normalize('NFD');
    await createSong(superuser, 'decomposed-title', undefined, { title: decomposed });
    const guest = createClient(url);

    expect(await searchTitles(guest, composed)).toEqual([composed]);
    expect(await searchTitles(guest, decomposed)).toEqual([composed]);
    expect(await searchTitles(guest, 'ないで')).toEqual([composed]);
  });

  it('rejects invalid input with 400', async () => {
    const { url } = await startSearchServer();
    const guest = createClient(url);

    await expectInvalidRequest(search(guest, {}));
    await expectInvalidRequest(search(guest, { title: '   ' }));
    await expectInvalidRequest(search(guest, { title: 'a'.repeat(101) }));
    await expectInvalidRequest(
      search(guest, {
        title: 'abc',
        category: 'remix',
      }),
    );
    await expectInvalidRequest(
      search(guest, {
        title: 'abc',
        afterReleasedOn: '2026-01-01',
      }),
    );
    await expectInvalidRequest(
      search(guest, {
        title: 'abc',
        afterReleasedOn: '2026-01-01',
        afterId: '',
      }),
    );
    await expectInvalidRequest(
      search(guest, {
        title: 'abc',
        afterReleasedOn: '2026-01-01',
        afterId: 'a'.repeat(65),
      }),
    );
    await expect(search(guest, { title: '𝄞'.repeat(100) })).resolves.toEqual({
      items: [],
      totalItems: 0,
    });
  });

  it('combines category with the title and lists each song once with chart summaries', async () => {
    const { url, superuser } = await startSearchServer();
    const cover = await createSong(superuser, 'nova-cover', undefined, {
      title: 'Nova Cover',
      category: 'cover',
    });
    const original = await createSong(superuser, 'nova-original', undefined, {
      title: 'Nova Original',
      releasedOn: '2026-02-01',
    });
    const easy = await createChart(
      superuser,
      original.id,
      'easy',
      fakeChartData('nova-original', 'easy'),
    );
    const hard = await createChart(
      superuser,
      original.id,
      'hard',
      fakeChartData('nova-original', 'hard'),
    );
    const sixLaneHard = await createChart(
      superuser,
      original.id,
      'hard',
      fakeChartData('nova-original', 'hard', 1_000, 6),
      6,
    );
    const guest = createClient(url);

    const { items } = await search(guest, { title: 'Nova' });
    expect(items.map((item) => item.id)).toEqual([original.id, cover.id]);
    expect(items[0]).toMatchObject({
      id: original.id,
      collectionId: original.collectionId,
      collectionName: 'songs',
      key: 'nova-original',
    });
    expect(items[0]?.['jacket']).toBe(original['jacket']);
    const charts = [...(items[0]?.expand?.charts_via_song ?? [])].sort((a, b) =>
      a.difficulty === b.difficulty
        ? a.laneCount - b.laneCount
        : a.difficulty.localeCompare(b.difficulty),
    );
    expect(charts).toEqual([
      {
        id: easy.id,
        difficulty: 'easy',
        laneCount: 4,
      },
      {
        id: hard.id,
        difficulty: 'hard',
        laneCount: 4,
      },
      {
        id: sixLaneHard.id,
        difficulty: 'hard',
        laneCount: 6,
      },
    ]);
    expect(items[1]).not.toHaveProperty('expand');

    const covers = await search(guest, {
      title: 'Nova',
      category: 'cover',
    });
    expect(covers.items.map((item) => item.id)).toEqual([cover.id]);
    const originals = await search(guest, {
      title: 'No',
      category: 'original',
    });
    expect(originals.items.map((item) => item.id)).toEqual([original.id]);
  });

  it('pages 99, 100, 101 and 200 matches by cursor without gaps or duplicates, counting them first', async () => {
    const { url, superuser } = await startSearchServer();
    const releaseDates = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const createGroup = (prefix: string, count: number, category: string) =>
      Promise.all(
        Array.from({ length: count }, (_, index) =>
          createSong(superuser, `${prefix}-${category}-${index}`, undefined, {
            title: `${prefix} ${index}`,
            category,
            releasedOn: releaseDates[index % releaseDates.length] ?? '2026-01-01',
          }),
        ),
      );
    const pageCovers = await createGroup('Paging', 101, 'cover');
    const pageOriginals = await createGroup('Paging', 99, 'original');
    const hundred = await createGroup('Hundred', 100, 'original');
    const guest = createClient(url);

    await expect(
      searchAll(guest, {
        title: 'Paging',
        category: 'original',
      }),
    ).resolves.toEqual({
      ids: newestFirst(pageOriginals),
      batchSizes: [99],
      totals: [99],
    });
    await expect(searchAll(guest, { title: 'Hundred' })).resolves.toEqual({
      ids: newestFirst(hundred),
      batchSizes: [100, 0],
      totals: [100, null],
    });
    await expect(
      searchAll(guest, {
        title: 'Paging',
        category: 'cover',
      }),
    ).resolves.toEqual({
      ids: newestFirst(pageCovers),
      batchSizes: [100, 1],
      totals: [101, null],
    });
    const everyPage = newestFirst([...pageCovers, ...pageOriginals]);
    await expect(searchAll(guest, { title: 'Paging' })).resolves.toEqual({
      ids: everyPage,
      batchSizes: [100, 100, 0],
      totals: [200, null, null],
    });
    await expect(searchAll(guest, { title: 'Pa' })).resolves.toEqual({
      ids: everyPage,
      batchSizes: [100, 100, 0],
      totals: [200, null, null],
    });
  });

  it('applies the songs list rule and charts view rule to the requester', async () => {
    const { url, superuser } = await startSearchServer();
    const song = await createSong(superuser, 'guarded', undefined, { title: 'Guarded Song' });
    const chart = await createChart(superuser, song.id, 'easy', fakeChartData('guarded', 'easy'));
    const guest = createClient(url);

    const open = await search(guest, { title: 'Guarded' });
    expect(open.items.map((item) => item.expand)).toEqual([
      {
        charts_via_song: [
          {
            id: chart.id,
            difficulty: 'easy',
            laneCount: 4,
          },
        ],
      },
    ]);

    await superuser.collections.update('charts', { viewRule: null });
    const hiddenCharts = await search(guest, { title: 'Guarded' });
    expect(hiddenCharts.items.map((item) => item.id)).toEqual([song.id]);
    expect(hiddenCharts.items[0]).not.toHaveProperty('expand');

    await superuser.collections.update('songs', { listRule: null });
    await expect(search(guest, { title: 'Guarded' })).resolves.toEqual({
      items: [],
      totalItems: null,
    });
    const asSuperuser = await search(superuser, { title: 'Guarded' });
    expect(asSuperuser.items.map((item) => item.id)).toEqual([song.id]);
    expect(asSuperuser.totalItems).toBe(1);
    expect(asSuperuser.items[0]?.expand).toEqual({
      charts_via_song: [
        {
          id: chart.id,
          difficulty: 'easy',
          laneCount: 4,
        },
      ],
    });
  });

  it('plans prefixes on the NOCASE index and longer titles on the FTS index, counts included', async () => {
    const { superuser } = await startSearchServer();
    const cursor = {
      afterReleasedOn: '2026-01-01',
      afterId: 'abc',
    };

    for (const title of ['St', 'Starlight']) {
      const expected =
        title.length <= 2 ? 'idx_songs_title_nocase' : 'songs_title_fts VIRTUAL TABLE INDEX';
      const searches: SearchParams[] = [
        { title },
        {
          title,
          category: 'cover',
        },
        {
          title,
          category: 'cover',
          ...cursor,
        },
      ];
      for (const params of searches) {
        const search = buildSongSearchQuery({
          title: params['title'],
          category: params['category'],
          afterReleasedOn: params['afterReleasedOn'],
          afterId: params['afterId'],
        });
        // The hook hands these parts to a songs record query and a count query, which build these statements.
        const matches =
          'FROM songs' +
          (search.join === null ? '' : ` INNER JOIN ${search.join.table} ON ${search.join.on}`) +
          ` WHERE ${search.condition}`;
        const statements = [
          `SELECT songs.* ${matches} ORDER BY ${search.orderBy.join(', ')} LIMIT ${search.limit}`,
          ...(search.shouldCount ? [`SELECT COUNT(*) AS total ${matches}`] : []),
        ];
        for (const sql of statements) {
          const plan = await explain(superuser, sql, search.params);
          expect(
            plan.some((detail) => detail.includes(expected)),
            plan.join('\n'),
          ).toBe(true);
        }
      }
    }
  });

  it('counts, lists and continues a category on its list order index', async () => {
    const { superuser } = await startSearchServer();
    const category = { category: 'cover' };
    const continuation = {
      ...category,
      afterReleasedOn: '2026-01-01',
      afterId: 'abc',
    };

    for (const [sql, bindings] of [
      ['SELECT COUNT(*) FROM songs WHERE category = {:category}', category],
      [
        'SELECT id FROM songs WHERE category = {:category} ORDER BY releasedOn DESC, id DESC LIMIT 100',
        category,
      ],
      [
        'SELECT id FROM songs WHERE category = {:category} AND ' +
          '(releasedOn < {:afterReleasedOn} OR (releasedOn = {:afterReleasedOn} AND id < {:afterId})) ' +
          'ORDER BY releasedOn DESC, id DESC LIMIT 100',
        continuation,
      ],
    ] as const) {
      const plan = await explain(superuser, sql, bindings);
      expect(
        plan.some((detail) => detail.includes('idx_songs_category_released_on_id')),
        plan.join('\n'),
      ).toBe(true);
      expect(plan.join('\n')).not.toContain('TEMP B-TREE');
    }
  });
});
