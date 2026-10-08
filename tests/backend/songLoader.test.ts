import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSongs } from '../../src/backend/songLoader.js';

const SONGS_PATH = '/api/collections/songs/records';
const CHARTS_PATH = '/api/collections/charts/records';

function makeSongRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    collectionId: 'songs_collection',
    collectionName: 'songs',
    key: `key-${id}`,
    title: `Title ${id}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacket: `jacket_${id}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    visualTheme: '',
    credit: null,
    created: '2026-01-01 00:00:00.000Z',
    ...overrides,
  };
}

function listResponse(items: readonly unknown[]): Response {
  return new Response(
    JSON.stringify({ page: 1, perPage: 1000, totalItems: -1, totalPages: -1, items }),
  );
}

function stubFetch(songs: Response, charts: Response) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>((input) => {
    const { pathname } = new URL(input);
    if (pathname === SONGS_PATH) {
      return Promise.resolve(songs);
    }
    if (pathname === CHARTS_PATH) {
      return Promise.resolve(charts);
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestUrl(fetchMock: ReturnType<typeof stubFetch>, pathname: string): URL {
  const url = fetchMock.mock.calls
    .map(([input]) => new URL(input))
    .find((candidate) => candidate.pathname === pathname);
  if (url === undefined) {
    throw new Error(`No request to ${pathname}`);
  }
  return url;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSongs', () => {
  it('requests the song list sorted by created,key and chart metadata without data', async () => {
    const fetchMock = stubFetch(listResponse([]), listResponse([]));

    await expect(loadSongs(new PocketBase('http://pb.test'))).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestUrl(fetchMock, SONGS_PATH).searchParams.get('sort')).toBe('created,key');
    expect(requestUrl(fetchMock, CHARTS_PATH).searchParams.get('fields')).toBe(
      'id,song,difficulty',
    );
  });

  it('converts records into songs in response order with grouped chart ids', async () => {
    stubFetch(
      listResponse([
        makeSongRecord('s2', {
          category: 'cover',
          visualTheme: 'neon',
          credit: ['Song by someone', 'YouTube: channel'],
        }),
        makeSongRecord('s1'),
        makeSongRecord('s3'),
      ]),
      listResponse([
        { id: 'c1', song: 's1', difficulty: 'hard' },
        { id: 'c2', song: 's2', difficulty: 'easy' },
        { id: 'c3', song: 's1', difficulty: 'easy' },
        { id: 'c4', song: 'missing', difficulty: 'normal' },
      ]),
    );

    const songs = await loadSongs(new PocketBase('http://pb.test'));

    expect(songs).toEqual([
      {
        id: 'key-s2',
        title: 'Title s2',
        category: 'cover',
        youtubeVideoId: 'aaaaaaaaaaa',
        jacketUrl: 'http://pb.test/api/files/songs_collection/s2/jacket_s2.jpg',
        accentColor: 0x48d6e8,
        constellation: 'gemini',
        gameStartMs: 0,
        gameEndMs: 30000,
        chartIds: { easy: 'c2' },
        visualTheme: 'neon',
        credit: ['Song by someone', 'YouTube: channel'],
      },
      {
        id: 'key-s1',
        title: 'Title s1',
        category: 'original',
        youtubeVideoId: 'aaaaaaaaaaa',
        jacketUrl: 'http://pb.test/api/files/songs_collection/s1/jacket_s1.jpg',
        accentColor: 0x48d6e8,
        constellation: 'gemini',
        gameStartMs: 0,
        gameEndMs: 30000,
        chartIds: { hard: 'c1', easy: 'c3' },
      },
      {
        id: 'key-s3',
        title: 'Title s3',
        category: 'original',
        youtubeVideoId: 'aaaaaaaaaaa',
        jacketUrl: 'http://pb.test/api/files/songs_collection/s3/jacket_s3.jpg',
        accentColor: 0x48d6e8,
        constellation: 'gemini',
        gameStartMs: 0,
        gameEndMs: 30000,
        chartIds: {},
      },
    ]);
    expect(songs[1]).not.toHaveProperty('visualTheme');
    expect(songs[1]).not.toHaveProperty('credit');
  });

  it.each([
    ['category is not in the list', { category: 'remix' }, 'category'],
    ['accentColor is a string', { accentColor: '0x48d6e8' }, 'accentColor'],
    ['credit is not a string array', { credit: ['ok', 1] }, 'credit'],
    ['constellation is not a zodiac', { constellation: 'ophiuchus' }, 'constellation'],
    ['constellation is empty', { constellation: '' }, 'constellation'],
    ['constellation is missing', { constellation: undefined }, 'constellation'],
  ])('rejects when a song record %s', async (_name, overrides, field) => {
    stubFetch(listResponse([makeSongRecord('s1', overrides)]), listResponse([]));

    await expect(loadSongs(new PocketBase('http://pb.test'))).rejects.toThrow(
      `Invalid songs record s1: ${field}`,
    );
  });

  it('rejects when a chart record has a difficulty outside the list', async () => {
    stubFetch(
      listResponse([makeSongRecord('s1')]),
      listResponse([{ id: 'c1', song: 's1', difficulty: 'master' }]),
    );

    await expect(loadSongs(new PocketBase('http://pb.test'))).rejects.toThrow(
      'Invalid charts record c1: difficulty',
    );
  });

  it('rejects when the server responds with an HTTP error', async () => {
    stubFetch(
      new Response(JSON.stringify({ status: 500, message: 'Server error', data: {} }), {
        status: 500,
      }),
      listResponse([]),
    );

    await expect(loadSongs(new PocketBase('http://pb.test'))).rejects.toThrow();
  });
});
