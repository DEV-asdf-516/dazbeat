import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SONGS_QUERY } from '../../src/data/songs.js';
import { loadSongBatch } from '../../src/backend/songLoader.js';
import { requireDefined } from '../../src/invariant.js';

const SEARCH_PATH = '/api/dazbeat/songs/search';

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
    previewStartMs: 0,
    credit: null,
    releasedOn: '2026-01-01',
    expand: {},
    ...overrides,
  };
}

function searchResponse(
  items: readonly unknown[],
  totalItems: number | null = items.length,
  next: { releasedOn: string; recordId: string } | null = null,
): Response {
  return new Response(
    JSON.stringify({
      items,
      totalItems,
      next,
    }),
  );
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>((input) => {
    const { pathname } = new URL(input);
    if (pathname === SEARCH_PATH) {
      return Promise.resolve(response);
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestParams(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
  const url = requireDefined(
    fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .find((candidate) => candidate.pathname === SEARCH_PATH),
    'No request',
    SEARCH_PATH,
  );
  return Object.fromEntries(url.searchParams);
}

function makeSongRecords(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeSongRecord(`s${index}`, { releasedOn: `2026-01-${String(index % 28).padStart(2, '0')}` }),
  );
}

/** Holds every response until the test releases them, and fails a request when the SDK aborts it. */
function stubHeldFetch() {
  const held: (() => void)[] = [];
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    (input, init) =>
      new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The request was aborted', 'AbortError')),
        );
        held.push(() => resolve(searchResponse([makeSongRecord(new URL(input).search)])));
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    held,
    releaseAll: () => held.forEach((release) => release()),
  };
}

const pb = () => new PocketBase('http://pb.test');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSongBatch', () => {
  it('requests the first batch of published songs in one request without parameters', async () => {
    const fetchMock = stubFetch(searchResponse([makeSongRecord('s1')], 235));

    const batch = await loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null);

    expect(batch.totalCount).toBe(235);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestParams(fetchMock)).toEqual({});
  });

  it.each([
    ['the all scope', 'all', ALL_SONGS_QUERY, null, { scope: 'all' }],
    [
      'a category and a cursor without a title',
      'published',
      {
        category: 'cover',
        title: '',
      },
      {
        releasedOn: '2026-01-05',
        recordId: 'r42',
      },
      {
        category: 'cover',
        afterReleasedOn: '2026-01-05',
        afterId: 'r42',
      },
    ],
    [
      'a title as typed',
      'published',
      {
        ...ALL_SONGS_QUERY,
        title: 'it\'s" OR 1',
      },
      null,
      { title: 'it\'s" OR 1' },
    ],
    [
      'every condition together',
      'all',
      {
        category: 'cover',
        title: 'Title',
      },
      {
        releasedOn: '2026-01-05',
        recordId: 'r42',
      },
      {
        title: 'Title',
        category: 'cover',
        scope: 'all',
        afterReleasedOn: '2026-01-05',
        afterId: 'r42',
      },
    ],
  ] as const)('sends %s to the search API', async (_name, scope, query, cursor, expected) => {
    const fetchMock = stubFetch(searchResponse([]));

    await loadSongBatch(pb(), scope, query, cursor);

    expect(requestParams(fetchMock)).toEqual(expected);
  });

  it('returns an empty last batch when no songs match', async () => {
    stubFetch(searchResponse([]));

    await expect(loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null)).resolves.toEqual({
      songs: [],
      next: null,
      totalCount: 0,
    });
  });

  it('converts records into songs in response order with grouped chart ids', async () => {
    stubFetch(
      searchResponse([
        makeSongRecord('s2', {
          category: 'cover',
          previewStartMs: 45000,
          credit: ['Song by someone', 'YouTube: channel'],
          expand: {
            charts_via_song: [
              {
                id: 'c2',
                difficulty: 'easy',
                laneCount: 4,
              },
            ],
          },
        }),
        makeSongRecord('s1', {
          expand: {
            charts_via_song: [
              {
                id: 'c1',
                difficulty: 'hard',
                laneCount: 4,
              },
              {
                id: 'c3',
                difficulty: 'easy',
                laneCount: 4,
              },
              {
                id: 'c4',
                difficulty: 'hard',
                laneCount: 5,
              },
              {
                id: 'c5',
                difficulty: 'easy',
                laneCount: 6,
              },
            ],
          },
        }),
        makeSongRecord('s3'),
      ]),
    );

    const { songs } = await loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null);

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
        chartIds: { 4: { easy: 'c2' } },
        previewStartMs: 45000,
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
        chartIds: {
          4: {
            hard: 'c1',
            easy: 'c3',
          },
          5: { hard: 'c4' },
          6: { easy: 'c5' },
        },
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
    expect(songs[1]).not.toHaveProperty('previewStartMs');
    expect(songs[1]).not.toHaveProperty('credit');
  });

  it.each([
    ['category is not in the list', { category: 'remix' }, 'category'],
    ['accentColor is a string', { accentColor: '0x48d6e8' }, 'accentColor'],
    ['credit is not a string array', { credit: ['ok', 1] }, 'credit'],
    ['constellation is not a zodiac', { constellation: 'ophiuchus' }, 'constellation'],
    ['constellation is empty', { constellation: '' }, 'constellation'],
    ['constellation is missing', { constellation: undefined }, 'constellation'],
    ['previewStartMs is missing', { previewStartMs: undefined }, 'previewStartMs'],
    ['previewStartMs is a string', { previewStartMs: '45000' }, 'previewStartMs'],
  ])('rejects when a song record %s', async (_name, overrides, field) => {
    stubFetch(searchResponse([makeSongRecord('s1', overrides)]));

    await expect(loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null)).rejects.toThrow(
      `Invalid songs record s1: ${field}`,
    );
  });

  it.each([
    ['expand is not an object', { expand: 'charts' }, 'Invalid songs record s1: expand'],
    [
      'charts_via_song is not an array',
      {
        expand: {
          charts_via_song: {
            id: 'c1',
            difficulty: 'easy',
          },
        },
      },
      'Invalid songs record s1: expand.charts_via_song',
    ],
    [
      'a chart is not an object',
      { expand: { charts_via_song: ['c1'] } },
      'Invalid songs record s1: expand.charts_via_song',
    ],
    [
      'a chart id is missing',
      { expand: { charts_via_song: [{ difficulty: 'easy' }] } },
      'Invalid songs record s1: expand.charts_via_song[0].id',
    ],
    [
      'a chart difficulty is outside the list',
      {
        expand: {
          charts_via_song: [
            {
              id: 'c1',
              difficulty: 'master',
            },
          ],
        },
      },
      'Invalid songs record s1: expand.charts_via_song[0].difficulty',
    ],
    [
      'a chart lane count is not supported',
      {
        expand: {
          charts_via_song: [
            {
              id: 'c1',
              difficulty: 'easy',
              laneCount: 7,
            },
          ],
        },
      },
      'Invalid songs record s1: expand.charts_via_song[0].laneCount',
    ],
    [
      'a chart lane count is missing',
      {
        expand: {
          charts_via_song: [
            {
              id: 'c1',
              difficulty: 'easy',
            },
          ],
        },
      },
      'Invalid songs record s1: expand.charts_via_song[0].laneCount',
    ],
  ])('rejects when %s', async (_name, overrides, message) => {
    stubFetch(searchResponse([makeSongRecord('s1', overrides)]));

    await expect(loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null)).rejects.toThrow(message);
  });

  it('rejects when the server responds with an HTTP error', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          status: 500,
          message: 'Server error',
          data: {},
        }),
        {
          status: 500,
        },
      ),
    );

    await expect(loadSongBatch(pb(), 'published', ALL_SONGS_QUERY, null)).rejects.toThrow();
  });

  it('converts search items into songs with their chart ids', async () => {
    stubFetch(
      searchResponse([
        makeSongRecord('s1', {
          previewStartMs: 45000,
          expand: {
            charts_via_song: [
              {
                id: 'c1',
                difficulty: 'hard',
                laneCount: 4,
              },
              {
                id: 'c2',
                difficulty: 'hard',
                laneCount: 6,
              },
            ],
          },
        }),
        makeSongRecord('s2', { expand: undefined }),
      ]),
    );

    const { songs } = await loadSongBatch(
      pb(),
      'published',
      {
        ...ALL_SONGS_QUERY,
        title: 'Title',
      },
      null,
    );

    expect(songs).toEqual([
      expect.objectContaining({
        id: 'key-s1',
        jacketUrl: 'http://pb.test/api/files/songs_collection/s1/jacket_s1.jpg',
        chartIds: {
          4: { hard: 'c1' },
          6: { hard: 'c2' },
        },
        previewStartMs: 45000,
      }),
      expect.objectContaining({
        id: 'key-s2',
        chartIds: {},
      }),
    ]);
    expect(songs[1]).not.toHaveProperty('previewStartMs');
  });

  it('marks a batch whose response next is null as the last one', async () => {
    stubFetch(searchResponse(makeSongRecords(100), 100, null));

    const batch = await loadSongBatch(
      pb(),
      'published',
      {
        ...ALL_SONGS_QUERY,
        title: 'Title',
      },
      null,
    );

    expect(batch.songs).toHaveLength(100);
    expect(batch.next).toBeNull();
  });

  it('sends the response next as the cursor of the next request', async () => {
    const next = {
      releasedOn: '2026-01-03',
      recordId: 'r7',
    };
    stubFetch(searchResponse(makeSongRecords(3), 250, next));
    const query = {
      ...ALL_SONGS_QUERY,
      title: 'Title',
    };

    const batch = await loadSongBatch(pb(), 'published', query, null);

    expect(batch.songs).toHaveLength(3);
    expect(batch.totalCount).toBe(250);
    expect(batch.next).toEqual(next);

    const fetchMock = stubFetch(searchResponse([], null));
    const nextBatch = await loadSongBatch(pb(), 'published', query, batch.next);
    expect(nextBatch.totalCount).toBeNull();
    expect(requestParams(fetchMock)).toMatchObject({
      afterReleasedOn: '2026-01-03',
      afterId: 'r7',
    });
  });

  it.each([
    ['the body is not an object', [], 'Invalid songs search response: response'],
    [
      'items is not an array',
      {
        items: 'songs',
        totalItems: 0,
        next: null,
      },
      'Invalid songs search response: response.items',
    ],
    [
      'totalItems is missing',
      {
        items: [],
        next: null,
      },
      'Invalid songs search response: response.totalItems',
    ],
    [
      'next is missing',
      {
        items: [],
        totalItems: 0,
      },
      'Invalid songs search response: response.next',
    ],
    [
      'next has no recordId',
      {
        items: [],
        totalItems: 0,
        next: { releasedOn: '2026-01-01' },
      },
      'Invalid songs search response: response.next.recordId',
    ],
    [
      'an item has no collectionId',
      {
        items: [
          {
            ...makeSongRecord('s1'),
            collectionId: undefined,
          },
        ],
        totalItems: 1,
        next: null,
      },
      'Invalid songs search response: response.items[0].collectionId',
    ],
  ])('rejects a response where %s', async (_name, body, message) => {
    stubFetch(new Response(JSON.stringify(body)));

    await expect(
      loadSongBatch(
        pb(),
        'published',
        {
          ...ALL_SONGS_QUERY,
          title: 'Title',
        },
        null,
      ),
    ).rejects.toThrow(message);
  });
});

describe('concurrent loadSongBatch requests', () => {
  it.each([
    [
      'two song lists',
      {
        ...ALL_SONGS_QUERY,
        category: 'cover' as const,
      },
    ],
    [
      'a song list and a search',
      {
        ...ALL_SONGS_QUERY,
        title: 'Title',
      },
    ],
  ])('on one client do not cancel each other: %s', async (_name, secondQuery) => {
    const { held, releaseAll } = stubHeldFetch();
    const client = pb();

    const batches = Promise.all([
      loadSongBatch(client, 'published', ALL_SONGS_QUERY, null),
      loadSongBatch(client, 'published', secondQuery, null),
    ]);
    await vi.waitFor(() => expect(held).toHaveLength(2));
    releaseAll();

    const [first, second] = await batches;
    expect(first.songs).toHaveLength(1);
    expect(second.songs).toHaveLength(1);
  });
});
