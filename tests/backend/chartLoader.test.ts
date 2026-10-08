import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadChart, saveChart } from '../../src/backend/chartLoader.js';
import type { Song } from '../../src/data/songs.js';
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
  chartIds: { normal: 'chart_normal' },
};

const validChart = {
  songId: 'test-song',
  difficulty: 'normal',
  offsetMs: 0,
  notes: [{ type: 'tap', timeMs: 1000, lane: 0 }],
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadChart', () => {
  it('requests the chart record data once and resolves the validated chart', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ data: validChart })));

    await expect(loadChart(new PocketBase('http://pb.test'), song, 'normal')).resolves.toEqual(
      validChart,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input] = fetchMock.mock.calls[0] ?? [''];
    const url = new URL(input);
    expect(url.pathname).toBe('/api/collections/charts/records/chart_normal');
    expect(url.searchParams.get('fields')).toBe('data');
  });

  it('rejects without requesting when the difficulty has no chart id', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ data: validChart })));

    await expect(loadChart(new PocketBase('http://pb.test'), song, 'hard')).rejects.toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the server responds with HTTP 404', async () => {
    stubFetch(
      new Response(JSON.stringify({ status: 404, message: 'Not found', data: {} }), {
        status: 404,
      }),
    );

    await expect(loadChart(new PocketBase('http://pb.test'), song, 'normal')).rejects.toThrow();
  });

  it('rejects with the validation message when songId does not match', async () => {
    stubFetch(new Response(JSON.stringify({ data: { ...validChart, songId: 'other' } })));

    await expect(loadChart(new PocketBase('http://pb.test'), song, 'normal')).rejects.toThrow(
      'songId',
    );
  });

  it('rejects when data is not a chart object', async () => {
    stubFetch(new Response(JSON.stringify({ data: 'chart' })));

    await expect(loadChart(new PocketBase('http://pb.test'), song, 'normal')).rejects.toThrow(
      Error,
    );
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
    return { url: new URL(input), method: init?.method, body };
  }

  function errorResponse(status: number): Response {
    return new Response(JSON.stringify({ status, message: 'error', data: {} }), { status });
  }

  const normalChart: Chart = {
    songId: 'test-song',
    difficulty: 'normal',
    offsetMs: 0,
    notes: [{ type: 'tap', timeMs: 1000, lane: 0 }],
  };
  const hardChart: Chart = { ...normalChart, difficulty: 'hard' };

  it('updates the existing chart record once and resolves its id', async () => {
    const fetchMock = stubFetchSequence([
      new Response(JSON.stringify({ id: 'chart_normal', data: normalChart })),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).resolves.toBe(
      'chart_normal',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = getCall(fetchMock, 0);
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/api/collections/charts/records/chart_normal');
    expect(request.body).toEqual({ data: normalChart });
  });

  it('finds the song record by key and creates the chart when the difficulty has no chart id', async () => {
    const fetchMock = stubFetchSequence([
      new Response(JSON.stringify({ page: 1, perPage: 1, items: [{ id: 'song_record' }] })),
      new Response(JSON.stringify({ id: 'chart_hard' })),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).resolves.toBe(
      'chart_hard',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lookup = getCall(fetchMock, 0);
    expect(lookup.url.pathname).toBe('/api/collections/songs/records');
    expect(lookup.url.searchParams.get('filter')).toBe('key = "test-song"');
    const create = getCall(fetchMock, 1);
    expect(create.method).toBe('POST');
    expect(create.url.pathname).toBe('/api/collections/charts/records');
    expect(create.body).toEqual({ song: 'song_record', difficulty: 'hard', data: hardChart });
  });

  it('rejects when the update responds with HTTP 403', async () => {
    stubFetchSequence([errorResponse(403)]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, normalChart)).rejects.toThrow();
  });

  it('rejects when the create responds with HTTP 400', async () => {
    stubFetchSequence([
      new Response(JSON.stringify({ page: 1, perPage: 1, items: [{ id: 'song_record' }] })),
      errorResponse(400),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).rejects.toThrow();
  });

  it('rejects without creating when no song record has the key', async () => {
    const fetchMock = stubFetchSequence([
      new Response(JSON.stringify({ page: 1, perPage: 1, items: [] })),
    ]);

    await expect(saveChart(new PocketBase('http://pb.test'), song, hardChart)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
