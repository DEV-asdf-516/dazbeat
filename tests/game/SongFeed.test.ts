import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SONGS_QUERY } from '../../src/data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongQuery } from '../../src/data/songs.js';
import { SongFeed } from '../../src/game/SongFeed.js';

const PAGE_SIZE = 100;

interface ServerSong {
  readonly song: Song;
  readonly releasedOn: string;
  readonly recordId: string;
}

function makeSong(id: string, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: `Title ${id}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${id}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds: {},
    ...overrides,
  };
}

function makeServerSongs(count: number): ServerSong[] {
  return Array.from({ length: count }, (_, index) => {
    const order = String(count - index).padStart(4, '0');
    return {
      song: makeSong(`song-${order}`),
      releasedOn: `2026-${order}`,
      recordId: `r${order}`,
    };
  });
}

function isAfter(entry: ServerSong, cursor: SongBatchCursor): boolean {
  return (
    entry.releasedOn < cursor.releasedOn ||
    (entry.releasedOn === cursor.releasedOn && entry.recordId < cursor.recordId)
  );
}

function createServer(entries: readonly ServerSong[]) {
  const calls: { query: SongQuery; after: SongBatchCursor | null }[] = [];
  const loadBatch = (query: SongQuery, after: SongBatchCursor | null): Promise<SongBatch> => {
    calls.push({
      query,
      after,
    });
    const matched = entries
      .filter((entry) => after === null || isAfter(entry, after))
      .slice(0, PAGE_SIZE);
    const last = matched.at(-1);
    const batch: SongBatch = {
      songs: matched.map((entry) => entry.song),
      next:
        matched.length === PAGE_SIZE && last !== undefined
          ? {
              releasedOn: last.releasedOn,
              recordId: last.recordId,
            }
          : null,
    };
    return Promise.resolve(batch);
  };
  return {
    calls,
    loadBatch,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongFeed', () => {
  it.each([
    [99, 1],
    [100, 2],
    [101, 2],
    [200, 3],
  ])(
    'receives all %i songs once in server order in batches of at most 100',
    async (count, calls) => {
      const entries = makeServerSongs(count);
      const server = createServer(entries);
      const feed = new SongFeed(ALL_SONGS_QUERY, server.loadBatch);

      await feed.requestRemaining();

      expect(feed.songs).toEqual(entries.map((entry) => entry.song));
      expect(feed.status).toBe('complete');
      expect(server.calls).toHaveLength(calls);
    },
  );

  it('passes its query to the loader', async () => {
    const server = createServer([]);
    const query: SongQuery = {
      category: 'cover',
      title: 'star',
    };
    const feed = new SongFeed(query, server.loadBatch);

    await feed.requestMore();

    expect(feed.query).toBe(query);
    expect(server.calls).toEqual([
      {
        query,
        after: null,
      },
    ]);
  });

  it('starts empty with more to load when no first batch is given', () => {
    const feed = new SongFeed(ALL_SONGS_QUERY, createServer([]).loadBatch);

    expect(feed.songs).toEqual([]);
    expect(feed.status).toBe('hasMore');
  });

  it('continues after a full first batch', async () => {
    const entries = makeServerSongs(150);
    const server = createServer(entries);
    const first = await server.loadBatch(ALL_SONGS_QUERY, null);
    server.calls.length = 0;
    const feed = new SongFeed(ALL_SONGS_QUERY, server.loadBatch, first);

    expect(feed.songs).toBe(first.songs);
    expect(feed.status).toBe('hasMore');

    await feed.requestMore();

    expect(server.calls).toEqual([
      {
        query: ALL_SONGS_QUERY,
        after: first.next,
      },
    ]);
    expect(feed.songs).toEqual(entries.map((entry) => entry.song));
  });

  it('does not request again after a last first batch', async () => {
    const server = createServer(makeServerSongs(3));
    const first = await server.loadBatch(ALL_SONGS_QUERY, null);
    server.calls.length = 0;
    const feed = new SongFeed(ALL_SONGS_QUERY, server.loadBatch, first);

    expect(feed.status).toBe('complete');

    await feed.requestMore();
    await feed.requestRemaining();

    expect(server.calls).toEqual([]);
    expect(feed.songs).toBe(first.songs);
  });

  it('shares the in-flight request instead of loading again', async () => {
    const pending = deferred<SongBatch>();
    const loadBatch = vi.fn(() => pending.promise);
    const feed = new SongFeed(ALL_SONGS_QUERY, loadBatch);

    const firstRequest = feed.requestMore();
    expect(feed.status).toBe('loading');
    const secondRequest = feed.requestMore();
    pending.resolve({
      songs: [makeSong('a')],
      next: null,
    });
    await Promise.all([firstRequest, secondRequest]);

    expect(loadBatch).toHaveBeenCalledTimes(1);
    expect(feed.songs).toEqual([makeSong('a')]);
  });

  it('keeps songs and cursor on failure and resumes from the same cursor only when asked by the user', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const entries = makeServerSongs(250);
    const server = createServer(entries);
    let isFailing = false;
    const calls: (SongBatchCursor | null)[] = [];
    const feed = new SongFeed(ALL_SONGS_QUERY, (query, after) => {
      calls.push(after);
      return isFailing ? Promise.reject(new Error('offline')) : server.loadBatch(query, after);
    });

    await feed.requestMore();
    const loaded = feed.songs;
    isFailing = true;
    await expect(feed.requestMore()).resolves.toBeUndefined();

    expect(feed.status).toBe('failed');
    expect(feed.songs).toBe(loaded);
    expect(warn).toHaveBeenCalledTimes(1);

    isFailing = false;
    await feed.requestMore();
    expect(calls).toHaveLength(2);
    await feed.requestRemaining();

    expect(calls[1]).toEqual(calls[2]);
    expect(feed.songs).toEqual(entries.map((entry) => entry.song));
  });

  it('stops requesting the remaining songs at a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createServer(makeServerSongs(300));
    let calls = 0;
    const feed = new SongFeed(ALL_SONGS_QUERY, (query, after) => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error('offline')) : server.loadBatch(query, after);
    });

    await feed.requestRemaining();

    expect(calls).toBe(2);
    expect(feed.status).toBe('failed');
    expect(feed.songs).toHaveLength(PAGE_SIZE);
  });

  it('applies a saved chart id to its lane count and difficulty of a listed song', () => {
    const song = makeSong('a', {
      chartIds: {
        4: { easy: 'c1' },
        6: { hard: 'c6' },
      },
    });
    const other = makeSong('b');
    const feed = new SongFeed(ALL_SONGS_QUERY, createServer([]).loadBatch, {
      songs: [song, other],
      next: null,
    });
    const listener = vi.fn();
    feed.subscribe(listener);

    const saved = feed.applySavedChart('a', 4, 'hard', 'c2');

    expect(saved).toEqual({
      ...song,
      chartIds: {
        4: {
          easy: 'c1',
          hard: 'c2',
        },
        6: { hard: 'c6' },
      },
    });
    expect(saved?.chartIds[6]).toBe(song.chartIds[6]);
    expect(feed.songs).toEqual([saved, other]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the list when the saved chart id is already listed', () => {
    const song = makeSong('a', { chartIds: { 4: { easy: 'c1' } } });
    const feed = new SongFeed(ALL_SONGS_QUERY, createServer([]).loadBatch, {
      songs: [song],
      next: null,
    });
    const songs = feed.songs;
    const listener = vi.fn();
    feed.subscribe(listener);

    expect(feed.applySavedChart('a', 4, 'easy', 'c1')).toBe(song);
    expect(feed.songs).toBe(songs);
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores a saved chart for a song it has not loaded', () => {
    const feed = new SongFeed(ALL_SONGS_QUERY, createServer([]).loadBatch, {
      songs: [makeSong('a')],
      next: null,
    });
    const songs = feed.songs;
    const listener = vi.fn();
    feed.subscribe(listener);

    expect(feed.applySavedChart('missing', 4, 'easy', 'c1')).toBeUndefined();
    expect(feed.songs).toBe(songs);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers when a request starts and ends until they unsubscribe', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = createServer(makeServerSongs(150));
    let isFailing = false;
    const feed = new SongFeed(ALL_SONGS_QUERY, (query, after) =>
      isFailing ? Promise.reject(new Error('offline')) : server.loadBatch(query, after),
    );
    const statuses: string[] = [];
    const unsubscribe = feed.subscribe(() => statuses.push(feed.status));

    await feed.requestMore();
    isFailing = true;
    await feed.requestMore();

    expect(statuses).toEqual(['loading', 'hasMore', 'loading', 'failed']);

    unsubscribe();
    isFailing = false;
    await feed.requestMoreFromUser();

    expect(statuses).toHaveLength(4);
    expect(feed.status).toBe('complete');
  });
});
