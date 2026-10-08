import { readFile } from 'node:fs/promises';
import PocketBase from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChart } from '../../src/data/chartSchema.js';
import type { Song } from '../../src/data/songs.js';
import { SEED_SONGS, runSeed, seedPocketBase } from '../../pocketbase/seed/seed.js';

const SEED_DIR = new URL('../../pocketbase/seed/', import.meta.url);

interface StoredRecord {
  id: string;
  [field: string]: unknown;
}

interface WriteRequest {
  method: string;
  collection: string;
  body: Record<string, unknown>;
}

function readSeedChart(path: string): Promise<unknown> {
  return readFile(new URL(path, SEED_DIR), 'utf8').then((text): unknown => JSON.parse(text));
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

function stubPocketBase(store: Record<'songs' | 'charts', StoredRecord[]>) {
  const writes: WriteRequest[] = [];
  let nextId = 1;
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    (input, init) => {
      const url = new URL(input);
      const match = /^\/api\/collections\/(songs|charts)\/records$/.exec(url.pathname);
      const collection = match?.[1];
      if (collection !== 'songs' && collection !== 'charts') {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        const [field, value] = parseFilter(url.searchParams.get('filter'));
        const items = store[collection].filter((record) => record[field] === value);
        return Promise.resolve(
          new Response(
            JSON.stringify({ page: 1, perPage: 1000, totalItems: -1, totalPages: -1, items }),
          ),
        );
      }
      const body = parseBody(init?.body);
      writes.push({ method, collection, body });
      const record: StoredRecord = { ...body, id: `${collection}_${nextId++}` };
      store[collection].push(record);
      return Promise.resolve(new Response(JSON.stringify(record)));
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, writes };
}

const sample = SEED_SONGS[0];
if (sample === undefined) {
  throw new Error('SEED_SONGS is empty');
}

const seededSong: StoredRecord = { id: 'existing_song', key: sample.key };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SEED_SONGS', () => {
  it('defines the sample song with all four difficulties', () => {
    expect(SEED_SONGS.map((song) => song.key)).toEqual(['sample', 'karma', 'lucy']);
    expect(sample.charts.map((chart) => chart.difficulty)).toEqual([
      'easy',
      'normal',
      'hard',
      'expert',
    ]);
  });

  for (const seed of SEED_SONGS) {
    const song: Song = {
      id: seed.key,
      title: seed.title,
      category: seed.category,
      youtubeVideoId: seed.youtubeVideoId,
      jacketUrl: `http://pb.test/api/files/songs/${seed.key}/jacket.jpg`,
      accentColor: seed.accentColor,
      constellation: seed.constellation,
      gameStartMs: seed.gameStartMs,
      gameEndMs: seed.gameEndMs,
      chartIds: Object.fromEntries(
        seed.charts.map((chart) => [chart.difficulty, `${seed.key}-${chart.difficulty}`]),
      ),
    };
    for (const chart of seed.charts) {
      it(`ships a valid ${seed.key} ${chart.difficulty} chart`, async () => {
        const json = await readSeedChart(chart.path);
        expect(() => parseChart(json, song, chart.difficulty)).not.toThrow();
      });
    }
  }
});

describe('seedPocketBase', () => {
  it('creates the song with its jacket and all four charts on an empty server', async () => {
    const store = { songs: [], charts: [] };
    const { writes } = stubPocketBase(store);

    await seedPocketBase(new PocketBase('http://pb.test'));

    const songWrites = writes.filter((write) => write.collection === 'songs');
    expect(songWrites).toHaveLength(SEED_SONGS.length);
    expect(songWrites[0]?.method).toBe('POST');
    expect(songWrites[0]?.body).toMatchObject({
      key: 'sample',
      title: 'ブレインロット',
      category: 'cover',
      youtubeVideoId: '9q-o32Z72Do',
      accentColor: String(0x48d6e8),
      constellation: 'gemini',
      gameStartMs: '0',
      gameEndMs: '30000',
      credit: ['ブレインロット (東京真中) ／ダズビー COVER', 'YouTube: DAZBEE official'],
    });
    const jacket = songWrites[0]?.body['jacket'];
    expect(jacket).toBeInstanceOf(File);
    expect(jacket instanceof File ? jacket.name : undefined).toBe('jacket.jpg');

    const chartWrites = writes.filter((write) => write.collection === 'charts').slice(0, 4);
    for (const [index, chart] of sample.charts.entries()) {
      expect(chartWrites[index]).toEqual({
        method: 'POST',
        collection: 'charts',
        body: {
          song: 'songs_1',
          difficulty: chart.difficulty,
          data: await readSeedChart(chart.path),
        },
      });
    }
  });

  it('sends no write requests when the song and all charts already exist', async () => {
    const store = {
      songs: SEED_SONGS.map((seed) => ({ id: `existing_${seed.key}`, key: seed.key })),
      charts: SEED_SONGS.flatMap((seed) =>
        seed.charts.map((chart) => ({
          id: `existing_${seed.key}_${chart.difficulty}`,
          song: `existing_${seed.key}`,
          difficulty: chart.difficulty,
        })),
      ),
    };
    const { fetchMock, writes } = stubPocketBase(store);

    await seedPocketBase(new PocketBase('http://pb.test'));

    expect(writes).toEqual([]);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it('creates only the missing charts when some charts already exist', async () => {
    const store = {
      songs: [seededSong],
      charts: [
        { id: 'existing_easy', song: 'existing_song', difficulty: 'easy' },
        { id: 'existing_hard', song: 'existing_song', difficulty: 'hard' },
      ],
    };
    const { writes } = stubPocketBase(store);

    await seedPocketBase(new PocketBase('http://pb.test'));

    const sampleWrites = writes.filter((write) => write.body['song'] === 'existing_song');
    expect(sampleWrites.map((write) => [write.method, write.collection, write.body])).toEqual([
      [
        'POST',
        'charts',
        {
          song: 'existing_song',
          difficulty: 'normal',
          data: await readSeedChart('sample/charts/normal.json'),
        },
      ],
      [
        'POST',
        'charts',
        {
          song: 'existing_song',
          difficulty: 'expert',
          data: await readSeedChart('sample/charts/expert.json'),
        },
      ],
    ]);
  });
});

describe('runSeed', () => {
  it('rejects with every missing variable name without sending requests', async () => {
    const { fetchMock } = stubPocketBase({ songs: [], charts: [] });

    const error = await runSeed({}).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('VITE_POCKETBASE_URL');
    expect(message).toContain('PB_SUPERUSER_EMAIL');
    expect(message).toContain('PB_SUPERUSER_PASSWORD');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with only the missing names when some variables are set', async () => {
    const { fetchMock } = stubPocketBase({ songs: [], charts: [] });

    const error = await runSeed({
      VITE_POCKETBASE_URL: 'http://pb.test',
      PB_SUPERUSER_EMAIL: 'admin@example.com',
      PB_SUPERUSER_PASSWORD: '',
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('PB_SUPERUSER_PASSWORD');
    expect(message).not.toContain('VITE_POCKETBASE_URL');
    expect(message).not.toContain('PB_SUPERUSER_EMAIL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
