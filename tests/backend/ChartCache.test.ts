import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartCache } from '../../src/backend/ChartCache.js';
import type { LoadedChart } from '../../src/backend/charts.js';
import type { ChartRef, Song } from '../../src/data/songs.js';
import type { Chart } from '../../src/rhythm/types.js';

const song: Song = {
  id: 'test-song',
  title: 'Test Song',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 0,
  gameEndMs: 10000,
  chartIds: {
    4: {
      normal: 'chart_normal',
      hard: 'chart_hard',
    },
  },
};

const normalChart: ChartRef = {
  song,
  laneCount: 4,
  difficulty: 'normal',
  chartId: 'chart_normal',
};
const hardChart: ChartRef = {
  song,
  laneCount: 4,
  difficulty: 'hard',
  chartId: 'chart_hard',
};

function chartData(difficulty: 'normal' | 'hard', timeMs: number): Chart {
  return {
    songId: 'test-song',
    difficulty,
    laneCount: 4,
    offsetMs: 0,
    notes: [
      {
        type: 'tap',
        timeMs,
        lane: 0,
      },
    ],
  };
}

const REVISION_A = 'a'.repeat(64);
const REVISION_B = 'b'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function pendingResponse(): { response: Promise<Response>; respond: (response: Response) => void } {
  let respond: (response: Response) => void = () => {
    throw new Error('response not pending');
  };
  const response = new Promise<Response>((resolve) => {
    respond = resolve;
  });
  return {
    response,
    respond,
  };
}

function stubFetch(...responses: (Response | Promise<Response>)[]) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>(() => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error('unexpected request');
    }
    return Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedPaths(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(input).pathname);
}

function createCache(): ChartCache {
  return new ChartCache(new PocketBase('http://pb.test'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChartCache', () => {
  it('requests the chart once on an empty cache and resolves the parsed chart and revision', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );

    await expect(createCache().load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    });
    expect(requestedPaths(fetchMock)).toEqual(['/api/collections/charts/records/chart_normal']);
  });

  it('resolves the same value without requesting on the second load', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();

    const first = await cache.load(normalChart);
    const second = await cache.load(normalChart);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests on reload even when cached and keeps the new revision for later loads', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
      jsonResponse({
        data: chartData('normal', 2000),
        revision: REVISION_B,
      }),
    );
    const cache = createCache();
    await cache.load(normalChart);

    const reloaded = await cache.reload(normalChart);

    expect(reloaded).toEqual({
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(cache.load(normalChart)).resolves.toBe(reloaded);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'an HTTP error',
      jsonResponse(
        {
          status: 500,
          message: 'Failed.',
          data: {},
        },
        500,
      ),
    ],
    ['a missing revision', jsonResponse({ data: chartData('normal', 1000) })],
  ])('requests again after a load failed with %s', async (_, failure) => {
    const fetchMock = stubFetch(
      failure,
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();

    await expect(cache.load(normalChart)).rejects.toThrow();
    await expect(cache.load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps no entry when a reload of a cached chart fails', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
      jsonResponse(
        {
          status: 500,
          message: 'Failed.',
          data: {},
        },
        500,
      ),
      jsonResponse({
        data: chartData('normal', 2000),
        revision: REVISION_B,
      }),
    );
    const cache = createCache();
    await cache.load(normalChart);

    await expect(cache.reload(normalChart)).rejects.toThrow();
    await expect(cache.load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps entries of different chart ids independent', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
      jsonResponse({
        data: chartData('hard', 1500),
        revision: REVISION_B,
      }),
      jsonResponse({
        data: chartData('hard', 2500),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();
    const normal = await cache.load(normalChart);
    await cache.load(hardChart);

    await cache.reload(hardChart);

    await expect(cache.load(normalChart)).resolves.toBe(normal);
    await expect(cache.load(hardChart)).resolves.toEqual({
      chart: chartData('hard', 2500),
      revision: REVISION_A,
    });
    expect(requestedPaths(fetchMock)).toEqual([
      '/api/collections/charts/records/chart_normal',
      '/api/collections/charts/records/chart_hard',
      '/api/collections/charts/records/chart_hard',
    ]);
  });

  it('resolves a frozen loaded chart, chart, notes array and notes', async () => {
    stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );

    const loaded = await createCache().load(normalChart);

    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.chart)).toBe(true);
    expect(Object.isFrozen(loaded.chart.notes)).toBe(true);
    expect(loaded.chart.notes.every((note) => Object.isFrozen(note))).toBe(true);
  });

  it('resolves a put chart on load without requesting, as a frozen copy', async () => {
    const fetchMock = stubFetch();
    const cache = createCache();
    cache.put('chart_normal', {
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    });

    const loaded = await cache.load(normalChart);

    expect(loaded).toEqual({
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    });
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.chart)).toBe(true);
    expect(Object.isFrozen(loaded.chart.notes)).toBe(true);
    expect(loaded.chart.notes.every((note) => Object.isFrozen(note))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a cached entry with the put chart for later loads', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();
    await cache.load(normalChart);

    cache.put('chart_normal', {
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });

    await expect(cache.load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests once for concurrent loads of the same chart and resolves the same value', async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();

    const [first, second] = await Promise.all([cache.load(normalChart), cache.load(normalChart)]);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests again after a load that concurrent loads shared failed', async () => {
    const fetchMock = stubFetch(
      jsonResponse(
        {
          status: 500,
          message: 'Failed.',
          data: {},
        },
        500,
      ),
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    const cache = createCache();

    const results = await Promise.allSettled([cache.load(normalChart), cache.load(normalChart)]);

    expect(results.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    await expect(cache.load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the put chart when a load started before the put resolves after it', async () => {
    const stale = pendingResponse();
    const fetchMock = stubFetch(stale.response);
    const cache = createCache();
    const staleLoad = cache.load(normalChart);

    cache.put('chart_normal', {
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });
    stale.respond(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    await staleLoad;

    await expect(cache.load(normalChart)).resolves.toEqual({
      chart: chartData('normal', 2000),
      revision: REVISION_B,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the reloaded chart when an earlier load resolves after the reload', async () => {
    const stale = pendingResponse();
    const fetchMock = stubFetch(
      stale.response,
      jsonResponse({
        data: chartData('normal', 2000),
        revision: REVISION_B,
      }),
    );
    const cache = createCache();
    const staleLoad = cache.load(normalChart);

    const reloaded = await cache.reload(normalChart);
    stale.respond(
      jsonResponse({
        data: chartData('normal', 1000),
        revision: REVISION_A,
      }),
    );
    await staleLoad;

    await expect(cache.load(normalChart)).resolves.toBe(reloaded);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not freeze the chart passed to put', () => {
    stubFetch();
    const loaded: LoadedChart = {
      chart: chartData('normal', 1000),
      revision: REVISION_A,
    };

    createCache().put('chart_normal', loaded);

    expect(Object.isFrozen(loaded)).toBe(false);
    expect(Object.isFrozen(loaded.chart)).toBe(false);
    expect(Object.isFrozen(loaded.chart.notes)).toBe(false);
    expect(loaded.chart.notes.some((note) => Object.isFrozen(note))).toBe(false);
  });
});
