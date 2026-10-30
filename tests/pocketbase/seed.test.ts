import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import PocketBase from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSeed, seedPocketBase } from '../../pocketbase/seed/seed.js';
import { InvalidSeedDataError, loadSeedManifest } from '../../pocketbase/seed/seedManifest.js';

interface StoredRecord {
  id: string;
  [field: string]: unknown;
}

interface WriteRequest {
  method: string;
  collection: string;
  recordId?: string;
  body: Record<string, unknown>;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const LOCAL_ENV = {
  VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
  PB_SUPERUSER_EMAIL: 'admin@example.com',
  PB_SUPERUSER_PASSWORD: 'secret-password',
};

function fakeChart(key: string, difficulty: string, laneCount = 4) {
  return {
    songId: key,
    difficulty,
    laneCount,
    offsetMs: 0,
    notes: [
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 2000,
        endTimeMs: 3000,
        lane: laneCount - 1,
      },
    ],
  };
}

function fakeManifestSong(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    title: `Fake ${key}`,
    category: 'original',
    youtubeVideoId: `vid-${key}`,
    accentColor: 0x123456,
    constellation: 'gemini',
    releasedOn: '2026-01-02',
    gameStartMs: 0,
    gameEndMs: 10000,
    credit: [`Fake credit for ${key}`],
    jacket: `${key}/jacket.png`,
    charts: {
      4: {
        easy: `${key}/charts/easy.json`,
        expert: `${key}/charts/expert.json`,
      },
      6: { easy: `${key}/charts/6k-easy.json` },
    },
    ...overrides,
  };
}

let dataDirPath: string;
let dataDir: URL;

async function writeDataFile(relativePath: string, content: string | Uint8Array): Promise<void> {
  const target = join(dataDirPath, relativePath);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content);
}

async function writeFakeSongFiles(key: string): Promise<void> {
  await writeDataFile(`${key}/jacket.png`, PNG_BYTES);
  for (const difficulty of ['easy', 'expert']) {
    await writeDataFile(
      `${key}/charts/${difficulty}.json`,
      JSON.stringify(fakeChart(key, difficulty)),
    );
  }
  await writeDataFile(`${key}/charts/6k-easy.json`, JSON.stringify(fakeChart(key, 'easy', 6)));
}

async function writeManifest(manifest: unknown): Promise<void> {
  await writeDataFile('manifest.json', JSON.stringify(manifest));
}

async function writeFakeData(): Promise<void> {
  await writeFakeSongFiles('fake-a');
  await writeManifest({
    version: 2,
    albums: [],
    songs: [fakeManifestSong('fake-a')],
  });
}

function parseFilter(filter: string | null): [string, string] {
  const match = /^(\w+) = "(.*)"$/.exec(filter ?? '');
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`Unsupported filter ${String(filter)}`);
  }
  return [match[1], match[2]];
}

function parseBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    for (const [name, value] of body.entries()) {
      if (name === '@jsonPayload' && typeof value === 'string') {
        Object.assign(fields, JSON.parse(value));
      } else {
        fields[name] = value;
      }
    }
    return fields;
  }
  if (typeof body === 'string') {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      return { ...parsed };
    }
  }
  throw new Error('Unsupported request body');
}

function stubPocketBase(
  initial: Record<'songs' | 'charts', StoredRecord[]> & { albums?: StoredRecord[] },
) {
  const store = {
    albums: [],
    ...initial,
  };
  const writes: WriteRequest[] = [];
  let nextId = 1;
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    (input, init) => {
      const url = new URL(input);
      if (url.pathname === '/api/collections/_superusers/auth-with-password') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              token: 'superuser-token',
              record: {
                id: 'superuser_1',
                collectionName: '_superusers',
              },
            }),
          ),
        );
      }
      const songUpdate = /^\/api\/collections\/songs\/records\/(\w+)$/.exec(url.pathname);
      const recordId = songUpdate?.[1];
      if (recordId !== undefined && init?.method === 'PATCH') {
        const body = parseBody(init.body);
        writes.push({
          method: 'PATCH',
          collection: 'songs',
          recordId,
          body,
        });
        const record = store.songs.find((stored) => stored.id === recordId);
        if (record === undefined) {
          return Promise.resolve(new Response('not found', { status: 404 }));
        }
        Object.assign(record, body);
        return Promise.resolve(new Response(JSON.stringify(record)));
      }
      const match = /^\/api\/collections\/(albums|songs|charts)\/records$/.exec(url.pathname);
      const collection = match?.[1];
      if (collection !== 'albums' && collection !== 'songs' && collection !== 'charts') {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        const [field, value] = parseFilter(url.searchParams.get('filter'));
        const items = store[collection].filter((record) => record[field] === value);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              perPage: 1000,
              totalItems: -1,
              totalPages: -1,
              items,
            }),
          ),
        );
      }
      const body = parseBody(init?.body);
      writes.push({
        method,
        collection,
        body,
      });
      const record: StoredRecord = {
        ...body,
        id: `${collection}_${nextId++}`,
      };
      store[collection].push(record);
      return Promise.resolve(new Response(JSON.stringify(record)));
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    writes,
  };
}

beforeEach(async () => {
  dataDirPath = await mkdtemp(join(tmpdir(), 'dazbeat-seed-'));
  dataDir = pathToFileURL(`${dataDirPath}/`);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dataDirPath, {
    recursive: true,
    force: true,
  });
});

async function seedError(env: Readonly<Record<string, string | undefined>>): Promise<unknown> {
  return runSeed(env, dataDir).then(
    () => undefined,
    (reason: unknown) => reason,
  );
}

describe('seedPocketBase', () => {
  it('creates the song with its jacket and charts on an empty server, then publishes it', async () => {
    await writeFakeData();
    const { writes } = stubPocketBase({
      songs: [],
      charts: [],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes.map((write) => [write.method, write.collection])).toEqual([
      ['POST', 'songs'],
      ['POST', 'charts'],
      ['POST', 'charts'],
      ['POST', 'charts'],
      ['PATCH', 'songs'],
    ]);
    const [songWrite, ...laterWrites] = writes;
    const chartWrites = laterWrites.slice(0, -1);
    expect(songWrite?.body).not.toHaveProperty('isPublished');
    expect(songWrite?.body).not.toHaveProperty('previewStartMs');
    expect(songWrite?.body).not.toHaveProperty('album');
    expect(songWrite?.body).toMatchObject({
      key: 'fake-a',
      title: 'Fake fake-a',
      category: 'original',
      youtubeVideoId: 'vid-fake-a',
      accentColor: String(0x123456),
      constellation: 'gemini',
      releasedOn: '2026-01-02',
      gameStartMs: '0',
      gameEndMs: '10000',
      credit: ['Fake credit for fake-a'],
    });
    const jacket = songWrite?.body['jacket'];
    expect(jacket).toBeInstanceOf(File);
    expect(jacket instanceof File ? [jacket.name, jacket.type] : undefined).toEqual([
      'jacket.png',
      'image/png',
    ]);
    expect(chartWrites).toEqual([
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'songs_1',
          difficulty: 'easy',
          laneCount: 4,
          data: fakeChart('fake-a', 'easy'),
        },
      },
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'songs_1',
          difficulty: 'expert',
          laneCount: 4,
          data: fakeChart('fake-a', 'expert'),
        },
      },
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'songs_1',
          difficulty: 'easy',
          laneCount: 6,
          data: fakeChart('fake-a', 'easy', 6),
        },
      },
    ]);
    expect(laterWrites.at(-1)).toEqual({
      method: 'PATCH',
      collection: 'songs',
      recordId: 'songs_1',
      body: { isPublished: true },
    });
  });

  it('creates only the missing albums and links new songs to the album records', async () => {
    await writeFakeSongFiles('fake-a');
    await writeFakeSongFiles('fake-b');
    await writeManifest({
      version: 2,
      albums: [
        {
          key: 'orbit',
          name: 'orbit (renamed in manifest)',
          sortOrder: 30,
        },
        {
          key: 'freshAlbum',
          name: 'Fresh Album',
          sortOrder: 70,
        },
      ],
      songs: [
        fakeManifestSong('fake-a', { album: 'orbit' }),
        fakeManifestSong('fake-b', { album: 'freshAlbum' }),
      ],
    });
    const { writes } = stubPocketBase({
      albums: [
        {
          id: 'album_orbit',
          key: 'orbit',
          name: 'orbit',
          sortOrder: 30,
        },
      ],
      songs: [],
      charts: [],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    const albumWrites = writes.filter((write) => write.collection === 'albums');
    expect(albumWrites).toEqual([
      {
        method: 'POST',
        collection: 'albums',
        body: {
          key: 'freshAlbum',
          name: 'Fresh Album',
          sortOrder: 70,
        },
      },
    ]);
    expect(writes[0]?.collection).toBe('albums');
    const songWrites = writes.filter(
      (write) => write.collection === 'songs' && write.method === 'POST',
    );
    expect(songWrites.map((write) => write.body['album'])).toEqual(['album_orbit', 'albums_1']);
  });

  it('creates the song with its preview start when the manifest has one', async () => {
    await writeFakeSongFiles('fake-a');
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { previewStartMs: 15000 })],
    });
    const { writes } = stubPocketBase({
      songs: [],
      charts: [],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes[0]?.body).toMatchObject({ previewStartMs: '15000' });
  });

  it('does not update an existing song even when the manifest has a preview start', async () => {
    await writeFakeSongFiles('fake-a');
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { previewStartMs: 15000 })],
    });
    const { writes } = stubPocketBase({
      songs: [
        {
          id: 'existing_song',
          key: 'fake-a',
          isPublished: true,
          previewStartMs: 0,
        },
      ],
      charts: [],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes.filter((write) => write.collection === 'songs')).toEqual([]);
  });

  it.each([-1, 1.5, '15000'])(
    'rejects a preview start of %j without sending requests',
    async (previewStartMs) => {
      await writeFakeSongFiles('fake-a');
      await writeManifest({
        version: 2,
        albums: [],
        songs: [fakeManifestSong('fake-a', { previewStartMs })],
      });
      const { fetchMock } = stubPocketBase({
        songs: [],
        charts: [],
      });

      const error = await seedError(LOCAL_ENV);

      expect(error).toBeInstanceOf(InvalidSeedDataError);
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('manifest.songs[0].previewStartMs (song "fake-a")');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('uploads the jacket under its real file name when the name has spaces or non-ASCII', async () => {
    await writeFakeSongFiles('fake-a');
    await writeDataFile('fake-a/My 재킷.png', PNG_BYTES);
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { jacket: 'fake-a/My 재킷.png' })],
    });
    const { writes } = stubPocketBase({
      songs: [],
      charts: [],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    const jacket = writes[0]?.body['jacket'];
    expect(jacket instanceof File ? jacket.name : undefined).toBe('My 재킷.png');
  });

  it('sends no write requests when the song and all charts already exist', async () => {
    await writeFakeData();
    const { fetchMock, writes } = stubPocketBase({
      songs: [
        {
          id: 'existing_song',
          key: 'fake-a',
          isPublished: true,
        },
      ],
      charts: [
        {
          id: 'existing_easy',
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 4,
        },
        {
          id: 'existing_expert',
          song: 'existing_song',
          difficulty: 'expert',
          laneCount: 4,
        },
        {
          id: 'existing_easy_6k',
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 6,
        },
      ],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes).toEqual([]);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it('creates only the charts whose difficulty and lane count do not exist yet', async () => {
    await writeFakeData();
    const { writes } = stubPocketBase({
      songs: [
        {
          id: 'existing_song',
          key: 'fake-a',
          isPublished: true,
        },
      ],
      charts: [
        {
          id: 'existing_easy',
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 4,
        },
      ],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes).toEqual([
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'existing_song',
          difficulty: 'expert',
          laneCount: 4,
          data: fakeChart('fake-a', 'expert'),
        },
      },
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 6,
          data: fakeChart('fake-a', 'easy', 6),
        },
      },
    ]);
  });

  it('publishes an unpublished song after creating its missing charts', async () => {
    await writeFakeData();
    const { writes } = stubPocketBase({
      songs: [
        {
          id: 'existing_song',
          key: 'fake-a',
          isPublished: false,
        },
      ],
      charts: [
        {
          id: 'existing_easy',
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 4,
        },
        {
          id: 'existing_expert',
          song: 'existing_song',
          difficulty: 'expert',
          laneCount: 4,
        },
      ],
    });

    await seedPocketBase(new PocketBase('http://pb.test'), await loadSeedManifest(dataDir));

    expect(writes).toEqual([
      {
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'existing_song',
          difficulty: 'easy',
          laneCount: 6,
          data: fakeChart('fake-a', 'easy', 6),
        },
      },
      {
        method: 'PATCH',
        collection: 'songs',
        recordId: 'existing_song',
        body: { isPublished: true },
      },
    ]);
  });
});

describe('runSeed', () => {
  it('authenticates and seeds a loopback PocketBase from the data directory', async () => {
    await writeFakeData();
    const { fetchMock, writes } = stubPocketBase({
      songs: [],
      charts: [],
    });

    await runSeed(LOCAL_ENV, dataDir);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8090/api/collections/_superusers/auth-with-password',
    );
    expect(writes.map((write) => write.collection)).toEqual([
      'songs',
      'charts',
      'charts',
      'charts',
      'songs',
    ]);
  });

  it('rejects with every missing variable name without sending requests', async () => {
    await writeFakeData();
    const { fetchMock } = stubPocketBase({
      songs: [],
      charts: [],
    });

    const error = await seedError({});

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('VITE_POCKETBASE_URL');
    expect(message).toContain('PB_SUPERUSER_EMAIL');
    expect(message).toContain('PB_SUPERUSER_PASSWORD');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with only the missing names when some variables are set', async () => {
    await writeFakeData();
    const { fetchMock } = stubPocketBase({
      songs: [],
      charts: [],
    });

    const error = await seedError({
      ...LOCAL_ENV,
      PB_SUPERUSER_PASSWORD: '',
    });

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('PB_SUPERUSER_PASSWORD');
    expect(message).not.toContain('VITE_POCKETBASE_URL');
    expect(message).not.toContain('PB_SUPERUSER_EMAIL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.pockethost.io',
    'http://192.168.0.10:8090',
    'ftp://localhost:8090',
    'not a url',
  ])('rejects the non-loopback target %s without sending requests', async (url) => {
    await writeFakeData();
    const { fetchMock } = stubPocketBase({
      songs: [],
      charts: [],
    });

    const error = await seedError({
      ...LOCAL_ENV,
      VITE_POCKETBASE_URL: url,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : '').toContain('admin UI');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://localhost:8090', 'http://[::1]:8090', 'https://127.0.0.1'])(
    'accepts the loopback target %s',
    async (url) => {
      await writeFakeData();
      const { fetchMock } = stubPocketBase({
        songs: [],
        charts: [],
      });

      await runSeed(
        {
          ...LOCAL_ENV,
          VITE_POCKETBASE_URL: url,
        },
        dataDir,
      );

      expect(fetchMock).toHaveBeenCalled();
    },
  );

  const invalidDataCases: readonly {
    name: string;
    prepare: () => Promise<void>;
    failedPath: string;
    location?: string;
  }[] = [
    {
      name: 'the manifest is missing',
      prepare: () => writeFakeSongFiles('fake-a'),
      failedPath: 'manifest.json',
    },
    {
      name: 'the manifest is not JSON',
      prepare: () => writeDataFile('manifest.json', '{ not json'),
      failedPath: 'manifest.json',
    },
    {
      name: 'the manifest has an unknown field',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [fakeManifestSong('fake-a', { titel: 'typo' })],
        });
      },
      failedPath: 'manifest.json',
    },
    {
      name: 'the manifest is version 1',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 1,
          songs: [
            fakeManifestSong('fake-a', {
              charts: {
                easy: 'fake-a/charts/easy.json',
                expert: 'fake-a/charts/expert.json',
              },
            }),
          ],
        });
      },
      failedPath: 'manifest.json',
    },
    {
      name: 'the manifest repeats a song key',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [fakeManifestSong('fake-a'), fakeManifestSong('fake-a')],
        });
      },
      failedPath: 'manifest.json',
    },
    {
      name: 'a song has an unknown category',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [fakeManifestSong('fake-a', { category: 'remix' })],
        });
      },
      failedPath: 'manifest.json',
    },
    {
      name: 'a song release date is not a calendar date',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [fakeManifestSong('fake-a', { releasedOn: '2026-13-01' })],
        });
      },
      failedPath: 'manifest.json',
    },
    {
      name: 'the manifest has no albums field',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          songs: [fakeManifestSong('fake-a')],
        });
      },
      failedPath: 'manifest.json',
      location: 'manifest.albums',
    },
    {
      name: 'the manifest repeats an album key',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [
            {
              key: 'orbit',
              name: 'orbit',
              sortOrder: 30,
            },
            {
              key: 'orbit',
              name: 'orbit again',
              sortOrder: 40,
            },
          ],
          songs: [fakeManifestSong('fake-a')],
        });
      },
      failedPath: 'manifest.json',
      location: 'manifest.albums[1].key',
    },
    {
      name: 'a song points to an album key missing from albums',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [
            {
              key: 'orbit',
              name: 'orbit',
              sortOrder: 30,
            },
          ],
          songs: [fakeManifestSong('fake-a', { album: 'nostalzia' })],
        });
      },
      failedPath: 'manifest.json',
      location: 'manifest.songs[0].album (song "fake-a")',
    },
    {
      name: 'the manifest has no songs',
      prepare: () =>
        writeManifest({
          version: 2,
          albums: [],
          songs: [],
        }),
      failedPath: 'manifest.json',
    },
    {
      name: 'the jacket file is missing',
      prepare: async () => {
        await writeFakeData();
        await rm(join(dataDirPath, 'fake-a/jacket.png'));
      },
      failedPath: 'fake-a/jacket.png',
    },
    {
      name: 'the jacket extension is unsupported',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeDataFile('fake-a/jacket.gif', PNG_BYTES);
        await writeManifest({
          version: 2,
          albums: [],
          songs: [fakeManifestSong('fake-a', { jacket: 'fake-a/jacket.gif' })],
        });
      },
      failedPath: 'fake-a/jacket.gif',
    },
    {
      name: 'a chart file is missing',
      prepare: async () => {
        await writeFakeData();
        await rm(join(dataDirPath, 'fake-a/charts/expert.json'));
      },
      failedPath: 'fake-a/charts/expert.json',
    },
    {
      name: 'a chart is not a valid chart',
      prepare: async () => {
        await writeFakeData();
        await writeDataFile(
          'fake-a/charts/easy.json',
          JSON.stringify({
            ...fakeChart('fake-a', 'easy'),
            notes: [],
          }),
        );
      },
      failedPath: 'fake-a/charts/easy.json',
    },
    {
      name: 'a chart laneCount differs from its manifest lane count',
      prepare: async () => {
        await writeFakeData();
        await writeDataFile(
          'fake-a/charts/6k-easy.json',
          JSON.stringify(fakeChart('fake-a', 'easy', 5)),
        );
      },
      failedPath: 'fake-a/charts/6k-easy.json',
      location: 'song "fake-a" charts.6.easy',
    },
    {
      name: 'a chart path escapes the data directory',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [
            fakeManifestSong('fake-a', {
              charts: { 4: { easy: '../outside/easy.json' } },
            }),
          ],
        });
      },
      failedPath: '../outside/easy.json',
      location: 'song "fake-a" charts.4.easy',
    },
    {
      name: 'a chart path is absolute even though it points inside the data directory',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [
            fakeManifestSong('fake-a', {
              charts: { 4: { easy: join(dataDirPath, 'fake-a/charts/easy.json') } },
            }),
          ],
        });
      },
      failedPath: 'fake-a/charts/easy.json',
      location: 'song "fake-a" charts.4.easy',
    },
    {
      name: 'a jacket path is a file URL inside the data directory',
      prepare: async () => {
        await writeFakeSongFiles('fake-a');
        await writeManifest({
          version: 2,
          albums: [],
          songs: [
            fakeManifestSong('fake-a', {
              jacket: pathToFileURL(join(dataDirPath, 'fake-a/jacket.png')).href,
            }),
          ],
        });
      },
      failedPath: 'fake-a/jacket.png',
      location: 'song "fake-a" jacket',
    },
  ];

  it.each(invalidDataCases)(
    'rejects without sending requests when $name',
    async ({ prepare, failedPath, location }) => {
      await prepare();
      const { fetchMock } = stubPocketBase({
        songs: [],
        charts: [],
      });

      const error = await seedError(LOCAL_ENV);

      expect(error).toBeInstanceOf(InvalidSeedDataError);
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain(join(dataDirPath, failedPath));
      expect(message).toContain('docs/pocketbase-operations.md');
      if (location !== undefined) {
        expect(message).toContain(location);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('reads the albums of the manifest', async () => {
    await writeFakeSongFiles('fake-a');
    const albums = [
      {
        key: 'orbit',
        name: 'orbit',
        sortOrder: 30,
      },
      {
        key: 'nemuranaiYume',
        name: '眠らない夢',
        sortOrder: 50,
      },
    ];
    await writeManifest({
      version: 2,
      albums,
      songs: [fakeManifestSong('fake-a', { album: 'nemuranaiYume' })],
    });

    const manifest = await loadSeedManifest(dataDir);

    expect(manifest.albums).toEqual(albums);
    expect(manifest.songs[0]?.album).toBe('nemuranaiYume');
  });

  it('names the song key and field when a song field is invalid', async () => {
    await writeFakeSongFiles('fake-a');
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { category: 'remix' })],
    });

    const error = await loadSeedManifest(dataDir).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(InvalidSeedDataError);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('manifest.songs[0].category (song "fake-a")');
    expect(message).toContain(join(dataDirPath, 'manifest.json'));
    expect(message).toContain('docs/pocketbase-operations.md');
  });

  it('rejects an unparsable chart path as invalid seed data', async () => {
    await writeFakeSongFiles('fake-a');
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { charts: { 4: { easy: 'http://[' } } })],
    });

    const error = await loadSeedManifest(dataDir).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(InvalidSeedDataError);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('http://[');
    expect(message).toContain('song "fake-a" charts.4.easy');
    expect(message).toContain('docs/pocketbase-operations.md');
  });

  it('rejects a file URL that cannot be converted to a file path without sending requests', async () => {
    const unconvertibleUrl = 'file:///tmp/a%2Fb';
    await writeFakeSongFiles('fake-a');
    await writeManifest({
      version: 2,
      albums: [],
      songs: [fakeManifestSong('fake-a', { charts: { 4: { easy: unconvertibleUrl } } })],
    });
    const { fetchMock } = stubPocketBase({
      songs: [],
      charts: [],
    });

    const error = await seedError(LOCAL_ENV);

    expect(error).toBeInstanceOf(InvalidSeedDataError);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain(unconvertibleUrl);
    expect(message).toContain('song "fake-a" charts.4.easy');
    expect(message).toContain('docs/pocketbase-operations.md');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('seed CLI', () => {
  it('resolves the TypeScript sources and exits non-zero on missing variables', async () => {
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = execFile(
        process.execPath,
        ['--import', './pocketbase/seed/resolveTsImports.mjs', 'pocketbase/seed/seed.ts'],
        {
          cwd: repoRoot,
          env: {},
        },
        (_error, _stdout, stderr) =>
          resolve({
            code: child.exitCode,
            stderr,
          }),
      );
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.stderr).toContain(
      'Missing environment variables: VITE_POCKETBASE_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD',
    );
  });
});
