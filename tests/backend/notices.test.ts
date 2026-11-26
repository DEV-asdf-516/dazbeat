import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNotices } from '../../src/backend/notices.js';

const NOTICES_PATH = '/api/collections/notices/records';

function makeNoticeRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    created: '2026-11-25 08:00:00.000Z',
    titleKo: `${id} 제목`,
    titleEn: `${id} title`,
    titleJa: `${id} タイトル`,
    bodyKo: `${id} 본문`,
    bodyEn: `${id} body`,
    bodyJa: `${id} 本文`,
    ...overrides,
  };
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function listResponse(items: readonly unknown[]): Response {
  return new Response(
    JSON.stringify({
      page: 1,
      perPage: 1000,
      totalItems: items.length,
      totalPages: 1,
      items,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadNotices', () => {
  it('reads the latest 10 notices in one request, newest first, with only the shown fields', async () => {
    const fetchMock = stubFetch(listResponse([]));

    await loadNotices(new PocketBase('http://pb.test'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe(NOTICES_PATH);
    expect(url.searchParams.get('fields')?.split(',')).toEqual([
      'id',
      'created',
      'titleKo',
      'titleEn',
      'titleJa',
      'bodyKo',
      'bodyEn',
      'bodyJa',
    ]);
    expect(url.searchParams.get('sort')).toBe('-created');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('perPage')).toBe('10');
  });

  it('keeps the response order with titles and bodies in three languages', async () => {
    stubFetch(
      listResponse([
        makeNoticeRecord('notice_b', { created: '2026-11-25 09:30:00.250Z' }),
        makeNoticeRecord('notice_a'),
      ]),
    );

    const notices = await loadNotices(new PocketBase('http://pb.test'));

    expect(notices).toEqual([
      {
        id: 'notice_b',
        createdAtMs: Date.UTC(2026, 10, 25, 9, 30, 0, 250),
        title: {
          ko: 'notice_b 제목',
          ja: 'notice_b タイトル',
          en: 'notice_b title',
        },
        body: {
          ko: 'notice_b 본문',
          ja: 'notice_b 本文',
          en: 'notice_b body',
        },
      },
      {
        id: 'notice_a',
        createdAtMs: Date.UTC(2026, 10, 25, 8, 0, 0, 0),
        title: {
          ko: 'notice_a 제목',
          ja: 'notice_a タイトル',
          en: 'notice_a title',
        },
        body: {
          ko: 'notice_a 본문',
          ja: 'notice_a 本文',
          en: 'notice_a body',
        },
      },
    ]);
  });

  it.each([
    ['a language field that is not a string', { bodyJa: 3 }],
    ['a created time that cannot be read', { created: 'not a date' }],
  ])('skips a record with %s with a warning', async (_case, overrides) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(
      listResponse([makeNoticeRecord('notice_b', overrides), makeNoticeRecord('notice_a')]),
    );

    const notices = await loadNotices(new PocketBase('http://pb.test'));

    expect(notices.map((notice) => notice.id)).toEqual(['notice_a']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('rejects when the request fails', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          status: 500,
          message: 'Something went wrong.',
          data: {},
        }),
        {
          status: 500,
        },
      ),
    );

    await expect(loadNotices(new PocketBase('http://pb.test'))).rejects.toMatchObject({
      status: 500,
    });
  });
});
