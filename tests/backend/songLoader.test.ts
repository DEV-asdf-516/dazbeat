import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SONGS_QUERY } from '../../src/data/songs.js';
import { loadSongBatch } from '../../src/backend/songLoader.js';

const SONGS_PATH = '/api/collections/songs/records';
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
    visualTheme: '',
    credit: null,
    releasedOn: '2026-01-01',
    expand: {},
    ...overrides,
  };
}

function listResponse(items: readonly unknown[]): Response {
  return new Response(
    JSON.stringify({
      page: 1,
      perPage: 1000,
      totalItems: -1,
      totalPages: -1,
      items,
    }),
  );
}

function searchResponse(items: readonly unknown[]): Response {
  return new Response(JSON.stringify({ items }));
}

function stubFetch(response: Response, path = SONGS_PATH) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>((input) => {
    const { pathname } = new URL(input);
    if (pathname === path) {
      return Promise.resolve(response);
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
        held.push(() =>
          resolve(
            new URL(input).pathname === SEARCH_PATH
              ? searchResponse([makeSongRecord('found')])
              : listResponse([makeSongRecord('listed')]),
          ),
        );
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
  it('requests the first batch newest release first without counting or filtering', async () => {
    const fetchMock = stubFetch(listResponse([makeSongRecord('s1')]));

    await loadSongBatch(pb(), ALL_SONGS_QUERY, null);

    const url = requestUrl(fetchMock, SONGS_PATH);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('perPage')).toBe('100');
    expect(url.searchParams.get('sort')).toBe('-releasedOn,-id');
    expect(url.searchParams.get('skipTotal')).toBe('true');
    expect(url.searchParams.has('filter')).toBe(false);
  });

  it('continues after the cursor with a keyset filter on release date and record id', async () => {
    const fetchMock = stubFetch(listResponse([]));

    await loadSongBatch(pb(), ALL_SONGS_QUERY, {
      releasedOn: '2026-01-05',
      recordId: 'r42',
    });

    const url = requestUrl(fetchMock, SONGS_PATH);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('filter')).toBe(
      '(releasedOn < "2026-01-05" || (releasedOn = "2026-01-05" && id < "r42"))',
    );
  });

  it('combines category and keyset conditions with && when there is no title', async () => {
    const fetchMock = stubFetch(listResponse([]));

    await loadSongBatch(
      pb(),
      {
        category: 'cover',
        title: '',
      },
      {
        releasedOn: '2026-01-05',
        recordId: 'r42',
      },
    );

    expect(requestUrl(fetchMock, SONGS_PATH).searchParams.get('filter')).toBe(
      'category = "cover" && ' +
        '(releasedOn < "2026-01-05" || (releasedOn = "2026-01-05" && id < "r42"))',
    );
  });

  it('requests songs with their chart metadata in a single request', async () => {
    const fetchMock = stubFetch(listResponse([makeSongRecord('s1'), makeSongRecord('s2')]));

    await loadSongBatch(pb(), ALL_SONGS_QUERY, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestUrl(fetchMock, SONGS_PATH);
    expect(url.searchParams.get('expand')).toBe('charts_via_song');
    expect(url.searchParams.get('fields')).toBe(
      '*,expand.charts_via_song.id,expand.charts_via_song.difficulty',
    );
  });

  it('returns an empty last batch when no songs match', async () => {
    stubFetch(listResponse([]));

    await expect(loadSongBatch(pb(), ALL_SONGS_QUERY, null)).resolves.toEqual({
      songs: [],
      next: null,
    });
  });

  it('marks a batch shorter than 100 songs as the last one', async () => {
    stubFetch(listResponse(makeSongRecords(99)));

    const batch = await loadSongBatch(pb(), ALL_SONGS_QUERY, null);

    expect(batch.songs).toHaveLength(99);
    expect(batch.next).toBeNull();
  });

  it('continues a full batch from its last record', async () => {
    const records = makeSongRecords(100);
    stubFetch(listResponse(records));

    const batch = await loadSongBatch(pb(), ALL_SONGS_QUERY, null);

    expect(batch.songs).toHaveLength(100);
    expect(batch.next).toEqual({
      releasedOn: records[99]?.releasedOn,
      recordId: 's99',
    });
  });

  it('converts records into songs in response order with grouped chart ids', async () => {
    stubFetch(
      listResponse([
        makeSongRecord('s2', {
          category: 'cover',
          visualTheme: 'neon',
          credit: ['Song by someone', 'YouTube: channel'],
          expand: {
            charts_via_song: [
              {
                id: 'c2',
                difficulty: 'easy',
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
              },
              {
                id: 'c3',
                difficulty: 'easy',
              },
            ],
          },
        }),
        makeSongRecord('s3'),
      ]),
    );

    const { songs } = await loadSongBatch(pb(), ALL_SONGS_QUERY, null);

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
        chartIds: {
          hard: 'c1',
          easy: 'c3',
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
    stubFetch(listResponse([makeSongRecord('s1', overrides)]));

    await expect(loadSongBatch(pb(), ALL_SONGS_QUERY, null)).rejects.toThrow(
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
  ])('rejects when %s', async (_name, overrides, message) => {
    stubFetch(listResponse([makeSongRecord('s1', overrides)]));

    await expect(loadSongBatch(pb(), ALL_SONGS_QUERY, null)).rejects.toThrow(message);
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

    await expect(loadSongBatch(pb(), ALL_SONGS_QUERY, null)).rejects.toThrow();
  });
});

describe('loadSongBatch with a title', () => {
  it.each([
    ['without category or cursor', ALL_SONGS_QUERY.category, null, {}],
    [
      'with category and cursor',
      'cover' as const,
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
  ])('sends the title to the search API %s', async (_name, category, cursor, expected) => {
    const fetchMock = stubFetch(searchResponse([]), SEARCH_PATH);

    await loadSongBatch(
      pb(),
      {
        category,
        title: 'it\'s" OR 1',
      },
      cursor,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(requestUrl(fetchMock, SEARCH_PATH).searchParams)).toEqual({
      title: 'it\'s" OR 1',
      ...expected,
    });
  });

  it('converts search items into songs with their chart ids', async () => {
    stubFetch(
      searchResponse([
        makeSongRecord('s1', {
          expand: {
            charts_via_song: [
              {
                id: 'c1',
                difficulty: 'hard',
              },
            ],
          },
        }),
        makeSongRecord('s2', { expand: undefined }),
      ]),
      SEARCH_PATH,
    );

    const { songs } = await loadSongBatch(
      pb(),
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
        chartIds: { hard: 'c1' },
      }),
      expect.objectContaining({
        id: 'key-s2',
        chartIds: {},
      }),
    ]);
  });

  it('returns an empty last batch when nothing matches', async () => {
    stubFetch(searchResponse([]), SEARCH_PATH);

    await expect(
      loadSongBatch(
        pb(),
        {
          ...ALL_SONGS_QUERY,
          title: 'none',
        },
        null,
      ),
    ).resolves.toEqual({
      songs: [],
      next: null,
    });
  });

  it('marks a batch shorter than 100 songs as the last one', async () => {
    stubFetch(searchResponse(makeSongRecords(99)), SEARCH_PATH);

    const batch = await loadSongBatch(
      pb(),
      {
        ...ALL_SONGS_QUERY,
        title: 'Title',
      },
      null,
    );

    expect(batch.songs).toHaveLength(99);
    expect(batch.next).toBeNull();
  });

  it('continues a full batch from its last song with the next request', async () => {
    const records = makeSongRecords(100);
    stubFetch(searchResponse(records), SEARCH_PATH);
    const query = {
      ...ALL_SONGS_QUERY,
      title: 'Title',
    };

    const batch = await loadSongBatch(pb(), query, null);

    expect(batch.songs).toHaveLength(100);
    expect(batch.next).toEqual({
      releasedOn: records[99]?.releasedOn,
      recordId: 's99',
    });

    const fetchMock = stubFetch(searchResponse([]), SEARCH_PATH);
    await loadSongBatch(pb(), query, batch.next);
    const params = requestUrl(fetchMock, SEARCH_PATH).searchParams;
    expect(params.get('afterReleasedOn')).toBe(records[99]?.releasedOn);
    expect(params.get('afterId')).toBe('s99');
  });

  it.each([
    ['the body is not an object', [], 'Invalid songs search response: response'],
    ['items is not an array', { items: 'songs' }, 'Invalid songs search response: response.items'],
    [
      'an item has no collectionId',
      {
        items: [
          {
            ...makeSongRecord('s1'),
            collectionId: undefined,
          },
        ],
      },
      'Invalid songs search response: response.items[0].collectionId',
    ],
  ])('rejects a response where %s', async (_name, body, message) => {
    stubFetch(new Response(JSON.stringify(body)), SEARCH_PATH);

    await expect(
      loadSongBatch(
        pb(),
        {
          ...ALL_SONGS_QUERY,
          title: 'Title',
        },
        null,
      ),
    ).rejects.toThrow(message);
  });

  it('rejects when the search API responds with an HTTP error', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          status: 400,
          code: 'invalid_request',
          message: 'title must be 1 to 100 characters.',
        }),
        {
          status: 400,
        },
      ),
      SEARCH_PATH,
    );

    await expect(
      loadSongBatch(
        pb(),
        {
          ...ALL_SONGS_QUERY,
          title: 'Title',
        },
        null,
      ),
    ).rejects.toThrow();
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
      loadSongBatch(client, ALL_SONGS_QUERY, null),
      loadSongBatch(client, secondQuery, null),
    ]);
    await vi.waitFor(() => expect(held).toHaveLength(2));
    releaseAll();

    const [first, second] = await batches;
    expect(first.songs).toHaveLength(1);
    expect(second.songs).toHaveLength(1);
  });
});
