import { describe, expect, it } from 'vitest';
import { ALL_SONGS_QUERY } from '../../../src/data/songs.js';
import type {
  ChartRef,
  Song,
  SongBatch,
  SongBatchCursor,
  SongCategory,
  SongQuery,
} from '../../../src/data/songs.js';
import { requireDefined } from '../../../src/invariant.js';
import type { Difficulty } from '../../../src/rhythm/types.js';
import type { SongSelectRestore } from '../../../src/game/sceneRoutes.js';
import { SongFeed } from '../../../src/game/SongFeed.js';
import { SongSelectController } from '../../../src/game/songSelect/SongSelectController.js';
import type { SongSelectView } from '../../../src/game/songSelect/SongSelectController.js';
import { getSongPage } from '../../../src/game/songSelect/songSelectState.js';
import type { SongSelectState } from '../../../src/game/songSelect/songSelectState.js';

const PAGE_SIZE = 2;
const ROWS_PER_PAGE = 3;
const CATALOG_SIZE = 6;
const RELEASED_ON = '2026-05-01';

function makeSong(
  index: number,
  category: SongCategory = 'original',
  chartIds: Song['chartIds'] = {
    easy: `easy-${index}`,
    hard: `hard-${index}`,
  },
): Song {
  return {
    id: `song-${String(index).padStart(3, '0')}`,
    title: `Title ${index}`,
    category,
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${index}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds,
  };
}

interface PendingCall {
  readonly query: SongQuery;
  readonly after: SongBatchCursor | null;
  readonly batch: SongBatch;
  readonly resolve: (batch?: SongBatch) => void;
  readonly reject: () => void;
}

/** 서버처럼 카테고리로 거른 곡을 커서 다음부터 잘라 주되, 응답 시점은 테스트가 정한다. 같은 게시일이라 커서는 record id 로만 갈린다. */
function createServer(songs: readonly Song[]) {
  const calls: PendingCall[] = [];
  const recordIdOf = (song: Song): string =>
    `r${String(songs.length - songs.indexOf(song)).padStart(4, '0')}`;
  const cursorOf = (song: Song): SongBatchCursor => ({
    releasedOn: RELEASED_ON,
    recordId: recordIdOf(song),
  });
  const loadBatch = (query: SongQuery, after: SongBatchCursor | null): Promise<SongBatch> => {
    const matched = songs
      .filter((song) => query.category === 'all' || song.category === query.category)
      .filter((song) => after === null || recordIdOf(song) < after.recordId)
      .slice(0, PAGE_SIZE);
    const last = matched.at(-1);
    const batch: SongBatch = {
      songs: matched,
      next: matched.length === PAGE_SIZE && last !== undefined ? cursorOf(last) : null,
    };
    return new Promise<SongBatch>((resolve, reject) => {
      calls.push({
        query,
        after,
        batch,
        resolve: (override) => resolve(override ?? batch),
        reject: () => reject(new Error('Request failed')),
      });
    });
  };
  return {
    calls,
    loadBatch,
    cursorOf,
  };
}

async function settle(
  call: PendingCall | undefined,
  kind: 'resolve' | 'reject' = 'resolve',
  batch?: SongBatch,
) {
  if (call === undefined) {
    throw new Error('Missing call');
  }
  if (kind === 'resolve') {
    call.resolve(batch);
  } else {
    call.reject();
  }
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** 이미 두 페이지 이상을 받아 둔 전체 곡 목록. */
function createHarness(songs: readonly Song[]) {
  const server = createServer(songs);
  const loaded = songs.slice(0, CATALOG_SIZE);
  const last = loaded.at(-1);
  const catalog = new SongFeed(ALL_SONGS_QUERY, server.loadBatch, {
    songs: loaded,
    next: songs.length > CATALOG_SIZE && last !== undefined ? server.cursorOf(last) : null,
  });
  const created: SongFeed[] = [];
  const renders: { view: SongSelectView; previous: SongSelectState | null }[] = [];
  const plays: { chart: ChartRef; restore: SongSelectRestore }[] = [];
  const settings: SongSelectRestore[] = [];
  let controller: SongSelectController | undefined;
  const open = (restore?: SongSelectRestore): SongSelectController => {
    controller = new SongSelectController(
      {
        catalog,
        create: (query) => {
          const feed = new SongFeed(query, server.loadBatch);
          created.push(feed);
          return feed;
        },
      },
      {
        render: (view, previous) =>
          renders.push({
            view,
            previous,
          }),
        play: (chart, restore) =>
          plays.push({
            chart,
            restore,
          }),
        openSettings: (restore) => settings.push(restore),
      },
      ROWS_PER_PAGE,
      restore,
    );
    return controller;
  };
  return {
    server,
    catalog,
    created,
    renders,
    plays,
    settings,
    open,
    get controller(): SongSelectController {
      if (controller === undefined) {
        throw new Error('Not opened');
      }
      return controller;
    },
    get view(): SongSelectView {
      const view = renders.at(-1)?.view;
      if (view === undefined) {
        throw new Error('Nothing rendered');
      }
      return view;
    },
  };
}

function openHarness(songs: readonly Song[]) {
  const harness = createHarness(songs);
  harness.open();
  return harness;
}

function songIds(view: SongSelectView): string[] {
  return view.state.songs.map((song) => song.id);
}

function selectedId(view: SongSelectView): string | null {
  const { current } = view.state;
  return current.kind === 'song' ? current.song.id : null;
}

function difficultyOf(view: SongSelectView): Difficulty | null {
  const { current } = view.state;
  return current.kind === 'song' ? (current.chart?.difficulty ?? null) : current.difficulty;
}

const songs = Array.from({ length: 14 }, (_, index) =>
  makeSong(index, index % 2 === 0 ? 'original' : 'cover'),
);
const covers = songs.filter((song) => song.category === 'cover');
const coverIds = covers.map((song) => song.id);

describe('SongSelectController categories', () => {
  it('opens ALL with the shared catalog and no request when it already holds two pages', () => {
    const harness = openHarness(songs);

    expect(harness.server.calls).toHaveLength(0);
    expect(harness.created).toHaveLength(0);
    expect(harness.renders).toHaveLength(1);
    expect(harness.renders[0]?.previous).toBeNull();
    expect(harness.view.state.filter).toBe('all');
    expect(songIds(harness.view)).toEqual(songs.slice(0, CATALOG_SIZE).map((song) => song.id));
    expect(selectedId(harness.view)).toBe('song-000');
    expect(harness.view.notice).toBeNull();
  });

  it('switches ORIGINAL and COVER to new category feeds and shows the server songs as they are', async () => {
    const harness = openHarness(songs);

    harness.controller.selectFilter('cover');

    expect(harness.created.map((feed) => feed.query)).toEqual([
      {
        category: 'cover',
        title: '',
      },
    ]);
    expect(
      harness.server.calls.map(({ query, after }) => ({
        query,
        after,
      })),
    ).toEqual([
      {
        query: {
          category: 'cover',
          title: '',
        },
        after: null,
      },
    ]);
    expect(harness.view.state.filter).toBe('cover');
    expect(harness.view.state.songs).toEqual([]);
    expect(harness.view.notice).toBe('loading');

    const served = [makeSong(100, 'original'), makeSong(101, 'cover')];
    await settle(harness.server.calls[0], 'resolve', {
      songs: served,
      next: null,
    });

    expect(harness.view.state.songs).toEqual(served);
    expect(selectedId(harness.view)).toBe('song-100');
    expect(harness.view.notice).toBeNull();

    harness.controller.cycleFilter(-1);

    expect(harness.created.map((feed) => feed.query)).toEqual([
      {
        category: 'cover',
        title: '',
      },
      {
        category: 'original',
        title: '',
      },
    ]);
    expect(harness.server.calls.at(-1)?.query).toEqual({
      category: 'original',
      title: '',
    });
    expect(harness.view.state.filter).toBe('original');
  });

  it('returns to the shared catalog for ALL without a new request', () => {
    const harness = openHarness(songs);
    harness.controller.cycleFilter(-1);
    const callCount = harness.server.calls.length;

    harness.controller.cycleFilter(1);

    expect(harness.view.state.filter).toBe('all');
    expect(harness.view.state.songs).toBe(harness.catalog.songs);
    expect(harness.created).toHaveLength(1);
    expect(harness.server.calls).toHaveLength(callCount);
  });

  it('does nothing when the current category is selected again', () => {
    const harness = openHarness(songs);

    harness.controller.selectFilter('all');
    expect(harness.renders).toHaveLength(1);
    expect(harness.server.calls).toHaveLength(0);

    harness.controller.selectFilter('cover');
    const renderCount = harness.renders.length;
    harness.controller.selectFilter('cover');

    expect(harness.renders).toHaveLength(renderCount);
    expect(harness.created).toHaveLength(1);
    expect(harness.server.calls).toHaveLength(1);
  });

  it('shows only the latest category when an earlier category response arrives later', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('original');
    harness.controller.selectFilter('cover');
    const renderCount = harness.renders.length;

    await settle(harness.server.calls[0]);

    expect(harness.renders).toHaveLength(renderCount);
    expect(harness.view.state.filter).toBe('cover');
    expect(harness.view.state.songs).toEqual([]);

    await settle(harness.server.calls[1]);

    expect(songIds(harness.view)).toEqual(coverIds.slice(0, PAGE_SIZE));
  });

  it('keeps the previous difficulty for the first song of the new category, even after loading', async () => {
    const harness = openHarness(songs);
    harness.controller.selectDifficulty('hard');

    harness.controller.selectFilter('cover');

    expect(difficultyOf(harness.view)).toBe('hard');
    await settle(harness.server.calls[0]);
    expect(selectedId(harness.view)).toBe(coverIds[0]);
    expect(difficultyOf(harness.view)).toBe('hard');

    harness.controller.selectFilter('all');
    expect(selectedId(harness.view)).toBe('song-000');
    expect(difficultyOf(harness.view)).toBe('hard');
  });
});

describe('SongSelectController notices', () => {
  it('shows loading, then a failure without retrying on its own, then retries on user input', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    expect(harness.view.notice).toBe('loading');

    await settle(harness.server.calls[0], 'reject');

    expect(harness.view.notice).toBe('loadFailed');
    expect(harness.server.calls).toHaveLength(1);

    harness.controller.moveSong(1);

    expect(harness.server.calls).toHaveLength(2);
    expect(harness.server.calls[1]?.after).toBeNull();
    expect(harness.view.notice).toBe('loading');

    await settle(harness.server.calls[1]);

    expect(harness.view.notice).toBeNull();
    expect(songIds(harness.view)).toEqual(coverIds.slice(0, PAGE_SIZE));
  });

  it('shows no songs for a category that completes empty', async () => {
    const harness = openHarness(songs.filter((song) => song.category === 'original'));
    harness.controller.selectFilter('cover');

    await settle(harness.server.calls[0]);

    expect(harness.view.notice).toBe('noSongs');
    expect(selectedId(harness.view)).toBeNull();
  });
});

describe('SongSelectController batches', () => {
  it('requests the next batch only when the selection reaches the last loaded page', async () => {
    const harness = openHarness(songs);

    harness.controller.moveSong(2);
    expect(harness.server.calls).toHaveLength(0);
    harness.controller.moveSong(1);

    expect(harness.server.calls).toHaveLength(1);
    expect(harness.server.calls[0]?.after).toEqual(
      harness.server.cursorOf(requireDefined(songs[5], 'Missing song', 5)),
    );

    await settle(harness.server.calls[0]);

    expect(harness.view.state.songs).toHaveLength(CATALOG_SIZE + PAGE_SIZE);
    expect(selectedId(harness.view)).toBe('song-003');
    expect(harness.server.calls).toHaveLength(1);
  });

  it('requests the next batch after a response that leaves the selection on the last page', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');

    await settle(harness.server.calls[0]);

    expect(harness.server.calls).toHaveLength(2);
    expect(harness.server.calls[1]?.after).toEqual(
      harness.server.cursorOf(requireDefined(covers[1], 'Missing cover song', 1)),
    );
  });
});

describe('SongSelectController selection', () => {
  it('selects a row of the current page', () => {
    const harness = openHarness(songs);
    harness.controller.moveSong(3);

    harness.controller.selectRow(1);

    expect(selectedId(harness.view)).toBe('song-004');
    expect(harness.renders.at(-1)?.previous?.current).toMatchObject({ index: 3 });
  });

  it('plays only a playable selection', async () => {
    const noChart = makeSong(200, 'cover', {});
    const harness = openHarness([makeSong(0), noChart]);

    harness.controller.moveDifficulty(1);
    harness.controller.play();

    expect(harness.plays.map(({ chart }) => chart)).toEqual([
      {
        song: harness.catalog.songs[0],
        difficulty: 'hard',
        chartId: 'hard-0',
      },
    ]);

    harness.controller.moveSong(1);
    harness.controller.play();
    expect(harness.plays).toHaveLength(1);

    harness.controller.selectFilter('original');
    await settle(harness.server.calls[0], 'resolve', {
      songs: [],
      next: null,
    });
    harness.controller.play();
    expect(harness.plays).toHaveLength(1);
  });
});

describe('SongSelectController close', () => {
  it('ignores responses after closing', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    const renderCount = harness.renders.length;

    harness.controller.close();
    await settle(harness.server.calls[0]);

    expect(harness.renders).toHaveLength(renderCount);
  });
});

/** 곡 선택을 닫고 받은 복원 정보로 새 컨트롤러를 열어, 그 사이 요청 수를 돌려준다. */
function reopen(harness: ReturnType<typeof createHarness>, restore: SongSelectRestore) {
  harness.controller.close();
  const callCount = harness.server.calls.length;
  const createdCount = harness.created.length;
  const renderCount = harness.renders.length;
  const controller = harness.open(restore);
  return {
    controller,
    requestCount: harness.server.calls.length - callCount,
    createdCount: harness.created.length - createdCount,
    renderCount: harness.renders.length - renderCount,
  };
}

function requireRestore(restore: SongSelectRestore | undefined): SongSelectRestore {
  return requireDefined(restore, 'Missing restore');
}

describe('SongSelectController restore', () => {
  it('restores the song, difficulty, page and row after moving past two pages without requests', async () => {
    const harness = openHarness(songs);
    harness.controller.moveSong(4);
    await settle(harness.server.calls[0]);
    harness.controller.moveSong(3);
    harness.controller.moveDifficulty(1);

    harness.controller.play();

    const restore = requireRestore(harness.plays[0]?.restore);
    expect(restore).toEqual({
      feed: harness.catalog,
      index: 7,
      songId: 'song-007',
      difficulty: 'hard',
    });

    const reopened = reopen(harness, restore);

    expect(reopened.requestCount).toBe(0);
    expect(reopened.createdCount).toBe(0);
    expect(reopened.renderCount).toBe(1);
    expect(harness.renders.at(-1)?.previous).toBeNull();
    expect(harness.view.state.filter).toBe('all');
    expect(harness.view.state.songs).toBe(harness.catalog.songs);
    expect(selectedId(harness.view)).toBe('song-007');
    expect(difficultyOf(harness.view)).toBe('hard');
    expect(getSongPage(harness.view.state, ROWS_PER_PAGE)).toMatchObject({
      pageNumber: 3,
      selectedSlot: 1,
    });
  });

  it('restores the COVER feed and its category from settings', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    await settle(harness.server.calls[0]);
    await settle(harness.server.calls[1]);
    harness.controller.moveSong(2);

    harness.controller.openSettings();

    const restore = requireRestore(harness.settings[0]);
    const coverFeed = harness.created[0];
    expect(restore).toEqual({
      feed: coverFeed,
      index: 2,
      songId: coverIds[2],
      difficulty: 'easy',
    });

    const reopened = reopen(harness, restore);

    expect(reopened.requestCount).toBe(0);
    expect(reopened.createdCount).toBe(0);
    expect(harness.view.state.filter).toBe('cover');
    expect(songIds(harness.view)).toEqual(coverIds.slice(0, 4));
    expect(selectedId(harness.view)).toBe(coverIds[2]);
  });

  it('selects the song at the nearest position when the restored song is not in the feed', () => {
    const harness = openHarness(songs);

    reopen(harness, {
      feed: harness.catalog,
      index: 99,
      songId: 'missing',
      difficulty: 'hard',
    });

    expect(selectedId(harness.view)).toBe('song-005');
    expect(difficultyOf(harness.view)).toBe('hard');
  });

  it('opens settings with no song from an empty list and shows its notice on restore', async () => {
    const harness = openHarness(songs);
    harness.controller.moveDifficulty(1);
    harness.controller.selectFilter('original');
    await settle(harness.server.calls[0], 'resolve', {
      songs: [],
      next: null,
    });

    harness.controller.openSettings();

    const restore = requireRestore(harness.settings[0]);
    expect(restore).toEqual({
      feed: harness.created[0],
      index: 0,
      songId: null,
      difficulty: 'hard',
    });

    const reopened = reopen(harness, restore);

    expect(reopened.requestCount).toBe(0);
    expect(harness.view.state.filter).toBe('original');
    expect(harness.view.state.current).toEqual({
      kind: 'none',
      difficulty: 'hard',
    });
    expect(harness.view.notice).toBe('noSongs');
  });

  it('shows the failure of a restored failed feed and retries on user input', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    await settle(harness.server.calls[0], 'reject');
    harness.controller.openSettings();

    const reopened = reopen(harness, requireRestore(harness.settings[0]));

    expect(reopened.requestCount).toBe(0);
    expect(harness.view.notice).toBe('loadFailed');

    const callCount = harness.server.calls.length;
    reopened.controller.moveSong(1);
    expect(harness.server.calls).toHaveLength(callCount + 1);
    await settle(harness.server.calls.at(-1));
    expect(songIds(harness.view)).toEqual(coverIds.slice(0, 2));
  });

  it('restores the difficulty the result screen replaced', () => {
    const harness = openHarness(songs);
    harness.controller.moveSong(1);
    harness.controller.play();
    const restore = requireRestore(harness.plays[0]?.restore);

    reopen(harness, {
      ...restore,
      difficulty: 'hard',
    });

    expect(selectedId(harness.view)).toBe('song-001');
    expect(difficultyOf(harness.view)).toBe('hard');
  });

  it('opens without a restore at ALL and the first song', () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    harness.controller.close();

    harness.open();

    expect(harness.view.state.filter).toBe('all');
    expect(selectedId(harness.view)).toBe('song-000');
  });
});
