import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAchievementCatalog } from '../../src/backend/achievements.js';

const ACHIEVEMENTS_PATH = '/api/collections/achievements/records';

function makeAchievementRecord(key: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `rec_${key.toLowerCase()}`,
    key,
    achievementSet: 'rhythm',
    category: 'play',
    kind: 'plays',
    target: 3,
    mark: '',
    difficulty: '',
    zodiac: '',
    album: '',
    retired: false,
    nameKo: `${key} 한국어`,
    nameJa: `${key} 日本語`,
    nameEn: `${key} English`,
    ...overrides,
  };
}

function stubFetch(items: readonly unknown[]) {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          page: 1,
          perPage: 1000,
          totalItems: items.length,
          totalPages: 1,
          items,
        }),
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadAchievementCatalog', () => {
  it('reads every achievement in one request with the album name', async () => {
    const fetchMock = stubFetch([]);

    await loadAchievementCatalog(new PocketBase('http://pb.test'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(url.pathname).toBe(ACHIEVEMENTS_PATH);
    expect(url.searchParams.get('expand')).toBe('album');
    expect(url.searchParams.get('fields')?.split(',')).toEqual([
      'id',
      'key',
      'achievementSet',
      'category',
      'kind',
      'target',
      'mark',
      'difficulty',
      'zodiac',
      'album',
      'retired',
      'nameKo',
      'nameJa',
      'nameEn',
      'expand.album.name',
    ]);
  });

  it('keeps the response order with names in three languages and album names', async () => {
    stubFetch([
      makeAchievementRecord('PLAY_3'),
      makeAchievementRecord('ALBUM_ORBIT_CLEAR', {
        achievementSet: 'discography',
        category: 'album',
        kind: 'album',
        target: 0,
        mark: 'clear',
        album: 'album_orbit',
        expand: { album: { name: 'orbit' } },
      }),
      makeAchievementRecord('S_20_CHARTS', {
        category: 'precision',
        kind: 'charts',
        target: 20,
        mark: 's',
        retired: true,
      }),
    ]);

    const catalog = await loadAchievementCatalog(new PocketBase('http://pb.test'));

    expect(catalog.definitions).toEqual([
      {
        id: 'PLAY_3',
        set: 'rhythm',
        category: 'play',
        rule: {
          kind: 'plays',
          target: 3,
        },
        isRetired: false,
        names: {
          ko: 'PLAY_3 한국어',
          ja: 'PLAY_3 日本語',
          en: 'PLAY_3 English',
        },
      },
      {
        id: 'ALBUM_ORBIT_CLEAR',
        set: 'discography',
        category: 'album',
        rule: {
          kind: 'album',
          album: 'album_orbit',
          mark: 'clear',
        },
        isRetired: false,
        names: {
          ko: 'ALBUM_ORBIT_CLEAR 한국어',
          ja: 'ALBUM_ORBIT_CLEAR 日本語',
          en: 'ALBUM_ORBIT_CLEAR English',
        },
      },
      {
        id: 'S_20_CHARTS',
        set: 'rhythm',
        category: 'precision',
        rule: {
          kind: 'charts',
          mark: 's',
          target: 20,
          difficulty: null,
        },
        isRetired: true,
        names: {
          ko: 'S_20_CHARTS 한국어',
          ja: 'S_20_CHARTS 日本語',
          en: 'S_20_CHARTS English',
        },
      },
    ]);
    expect(catalog.albumNames).toEqual(new Map([['album_orbit', 'orbit']]));
  });

  it.each([
    ['plays without a target', { target: 0 }],
    [
      'an album achievement whose album was deleted',
      {
        category: 'album',
        kind: 'album',
      },
    ],
    [
      'a songs achievement with an S mark',
      {
        kind: 'songs',
        mark: 's',
      },
    ],
  ])('skips %s with a warning', async (_case, overrides) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch([makeAchievementRecord('BROKEN', overrides), makeAchievementRecord('PLAY_3')]);

    const catalog = await loadAchievementCatalog(new PocketBase('http://pb.test'));

    expect(catalog.definitions.map(({ id }) => id)).toEqual(['PLAY_3']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('rejects a record with a field of the wrong type', async () => {
    stubFetch([makeAchievementRecord('PLAY_3', { target: '3' })]);

    await expect(loadAchievementCatalog(new PocketBase('http://pb.test'))).rejects.toThrow(
      'Invalid achievements record rec_play_3: target',
    );
  });
});
