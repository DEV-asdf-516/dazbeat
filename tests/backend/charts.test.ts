import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadChart, saveChart } from '../../src/backend/charts.js';
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
    4: { normal: 'chart_normal' },
    5: { hard: 'chart_hard_5k' },
  },
};

const normalChart: ChartRef = {
  song,
  laneCount: 4,
  difficulty: 'normal',
  chartId: 'chart_normal',
};

const validChart = {
  songId: 'test-song',
  difficulty: 'normal',
  laneCount: 4,
  offsetMs: 0,
  notes: [
    {
      type: 'tap',
      timeMs: 1000,
      lane: 0,
    },
  ],
};

const REVISION = 'a'.repeat(64);

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadChart', () => {
  it('requests the chart record data and revision once and resolves both', async () => {
    const fetchMock = stubFetch(
      new Response(
        JSON.stringify({
          data: validChart,
          revision: REVISION,
        }),
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).resolves.toEqual({
      chart: validChart,
      revision: REVISION,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input] = fetchMock.mock.calls[0] ?? [''];
    const url = new URL(input);
    expect(url.pathname).toBe('/api/collections/charts/records/chart_normal');
    expect(url.searchParams.get('fields')).toBe('data,revision');
  });

  it('rejects when the revision is missing', async () => {
    stubFetch(new Response(JSON.stringify({ data: validChart })));

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow(
      'revision',
    );
  });

  it('rejects when the revision is not a string', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: validChart,
          revision: 1,
        }),
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow(
      'revision',
    );
  });

  it('rejects when the server responds with HTTP 404', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          status: 404,
          message: 'Not found',
          data: {},
        }),
        {
          status: 404,
        },
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow();
  });

  it('rejects with the validation message when songId does not match', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: {
            ...validChart,
            songId: 'other',
          },
          revision: REVISION,
        }),
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow(
      'songId',
    );
  });

  it('rejects data whose laneCount differs from the chart ref lane count', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: {
            ...validChart,
            laneCount: 5,
          },
          revision: REVISION,
        }),
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow(
      'laneCount',
    );
  });

  it('rejects when data is not a chart object', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: 'chart',
          revision: REVISION,
        }),
      ),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), normalChart)).rejects.toThrow(Error);
  });
});

describe('saveChart', () => {
  type FetchCall = [input: string, init?: RequestInit];

  function stubFetchSequence(responses: readonly Response[]) {
    let index = 0;
    const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>(() => {
      const response = responses[index];
      index += 1;
      if (response === undefined) {
        throw new Error('unexpected request');
      }
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function getCall(fetchMock: ReturnType<typeof stubFetchSequence>, index: number) {
    const call = fetchMock.mock.calls[index];
    if (call === undefined) {
      throw new Error(`missing request ${index}`);
    }
    const [input, init] = call;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return {
      url: new URL(input),
      method: init?.method,
      body,
    };
  }

  function errorResponse(status: number): Response {
    return new Response(
      JSON.stringify({
        status,
        message: 'error',
        data: {},
      }),
      { status },
    );
  }

  const normalChart: Chart = {
    songId: 'test-song',
    difficulty: 'normal',
    laneCount: 4,
    offsetMs: 0,
    notes: [
      {
        type: 'tap',
        timeMs: 1000,
        lane: 0,
      },
    ],
  };
  const hardChart: Chart = {
    ...normalChart,
    difficulty: 'hard',
  };
  const hardChart5k: Chart = {
    ...hardChart,
    laneCount: 5,
    notes: [
      {
        type: 'tap',
        timeMs: 1000,
        lane: 4,
      },
    ],
  };

  it('updates the existing chart record once and resolves its id with the saved chart and revision', async () => {
    const fetchMock = stubFetchSequence([
      new Response(
        JSON.stringify({
          id: 'chart_normal',
          data: normalChart,
          revision: REVISION,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).resolves.toEqual({
      chartId: 'chart_normal',
      loaded: {
        chart: normalChart,
        revision: REVISION,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = getCall(fetchMock, 0);
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/api/collections/charts/records/chart_normal');
    expect(request.body).toEqual({ data: normalChart });
  });

  it('updates only the chart id of the chart lane count and difficulty', async () => {
    const fetchMock = stubFetchSequence([
      new Response(
        JSON.stringify({
          id: 'chart_hard_5k',
          data: hardChart5k,
          revision: REVISION,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart5k)).resolves.toEqual({
      chartId: 'chart_hard_5k',
      loaded: {
        chart: hardChart5k,
        revision: REVISION,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = getCall(fetchMock, 0);
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/api/collections/charts/records/chart_hard_5k');
    expect(request.body).toEqual({ data: hardChart5k });
  });

  it('finds the song record by key and creates the chart with its lane count when only another lane count has that difficulty', async () => {
    const fetchMock = stubFetchSequence([
      new Response(
        JSON.stringify({
          page: 1,
          perPage: 1,
          items: [{ id: 'song_record' }],
        }),
      ),
      new Response(
        JSON.stringify({
          id: 'chart_hard',
          data: hardChart,
          revision: REVISION,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).resolves.toEqual({
      chartId: 'chart_hard',
      loaded: {
        chart: hardChart,
        revision: REVISION,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lookup = getCall(fetchMock, 0);
    expect(lookup.url.pathname).toBe('/api/collections/songs/records');
    expect(lookup.url.searchParams.get('filter')).toBe('key = "test-song"');
    const create = getCall(fetchMock, 1);
    expect(create.method).toBe('POST');
    expect(create.url.pathname).toBe('/api/collections/charts/records');
    expect(create.body).toEqual({
      song: 'song_record',
      difficulty: 'hard',
      laneCount: 4,
      data: hardChart,
    });
  });

  it('rejects when the save response has no revision', async () => {
    stubFetchSequence([
      new Response(
        JSON.stringify({
          id: 'chart_normal',
          data: normalChart,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).rejects.toThrow(
      'revision',
    );
  });

  it('rejects when the save response data is not a chart', async () => {
    stubFetchSequence([
      new Response(
        JSON.stringify({
          id: 'chart_normal',
          data: { notes: 'x' },
          revision: REVISION,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).rejects.toThrow();
  });

  it('rejects when the created chart response has no revision', async () => {
    stubFetchSequence([
      new Response(
        JSON.stringify({
          page: 1,
          perPage: 1,
          items: [{ id: 'song_record' }],
        }),
      ),
      new Response(
        JSON.stringify({
          id: 'chart_hard',
          data: hardChart,
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).rejects.toThrow(
      'revision',
    );
  });

  it('rejects when the update responds with HTTP 403', async () => {
    stubFetchSequence([errorResponse(403)]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).rejects.toThrow();
  });

  it('rejects when the create responds with HTTP 400', async () => {
    stubFetchSequence([
      new Response(
        JSON.stringify({
          page: 1,
          perPage: 1,
          items: [{ id: 'song_record' }],
        }),
      ),
      errorResponse(400),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).rejects.toThrow();
  });

  it('rejects without creating when no song record has the key', async () => {
    const fetchMock = stubFetchSequence([
      new Response(
        JSON.stringify({
          page: 1,
          perPage: 1,
          items: [],
        }),
      ),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
