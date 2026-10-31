import { describe, expect, it } from 'vitest';
import type { YouTubePlayerHandlers } from '../../../src/audio/YouTubePlayer.js';
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
import { isShallowEqual } from '../../../src/shallowEqual.js';
import type { Difficulty, LaneCount } from '../../../src/rhythm/types.js';
import type { SongSelectRestore } from '../../../src/game/app/sceneRoutes.js';
import { SongFeed } from '../../../src/game/app/SongFeed.js';
import { SongSelectController } from '../../../src/game/songSelect/SongSelectController.js';
import { getSongPage } from '../../../src/game/songSelect/state/songSelectState.js';
import type { SongSelectView } from '../../../src/game/songSelect/state/songSelectState.js';
import type { ChartRecords } from '../../../src/storage/chartRecords.js';

const PAGE_SIZE = 2;
const ROWS_PER_PAGE = 3;
const CATALOG_SIZE = 6;
const RELEASED_ON = '2026-05-01';
const WHEEL_STEP_PX = 100;
const RECORDS: ChartRecords = new Map([
  [
    'song-000/4k/easy',
    {
      score: 900000,
      accuracy: 0.95,
      maxCombo: 120,
      cleared: true,
    },
  ],
]);

function makeSong(
  index: number,
  category: SongCategory = 'original',
  chartIds: Song['chartIds'] = {
    4: {
      easy: `easy-${index}`,
      hard: `hard-${index}`,
    },
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
    const inQuery = songs.filter(
      (song) => query.category === 'all' || song.category === query.category,
    );
    const matched = inQuery
      .filter((song) => after === null || recordIdOf(song) < after.recordId)
      .slice(0, PAGE_SIZE);
    const last = matched.at(-1);
    const batch: SongBatch = {
      songs: matched,
      next: matched.length === PAGE_SIZE && last !== undefined ? cursorOf(last) : null,
      totalCount: after === null ? inQuery.length : null,
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
  const pending = requireDefined(call, 'Missing call');
  if (kind === 'resolve') {
    pending.resolve(batch);
  } else {
    pending.reject();
  }
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface FakePlayer {
  readonly videoId: string;
  readonly handlers: YouTubePlayerHandlers;
  readonly playsSec: number[];
  readonly volumes: number[];
  isDestroyed: boolean;
  requestPlay(fromSec: number): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface PendingLoad {
  readonly resolve: () => void;
  readonly reject: () => void;
}

/** API 로드 완료 시점과 시계는 테스트가 정한다. */
function createPreview(volume: number) {
  const loads: PendingLoad[] = [];
  const players: FakePlayer[] = [];
  const clock = { nowMs: 0 };
  const control = { isCreateFailing: false };
  return {
    loads,
    players,
    clock,
    control,
    ports: {
      players: {
        loadApi: () =>
          new Promise<void>((resolve, reject) => {
            loads.push({
              resolve,
              reject: () => reject(new Error('Load failed')),
            });
          }),
        create: (videoId: string, handlers: YouTubePlayerHandlers): FakePlayer => {
          if (control.isCreateFailing) {
            throw new Error('Create failed');
          }
          const player: FakePlayer = {
            videoId,
            handlers,
            playsSec: [],
            volumes: [],
            isDestroyed: false,
            requestPlay: (fromSec) => player.playsSec.push(fromSec),
            setVolume: (value) => player.volumes.push(value),
            destroy: () => {
              player.isDestroyed = true;
            },
          };
          players.push(player);
          return player;
        },
      },
      now: () => clock.nowMs,
      volume,
    },
  };
}

/** 이미 두 페이지 이상을 받아 둔 전체 곡 목록. */
function createHarness(
  songs: readonly Song[],
  laneCount: LaneCount = 4,
  random: () => number = () => 0,
  volume = 0.5,
) {
  const preview = createPreview(volume);
  const server = createServer(songs);
  const loaded = songs.slice(0, CATALOG_SIZE);
  const last = loaded.at(-1);
  const catalog = new SongFeed(ALL_SONGS_QUERY, server.loadBatch, {
    songs: loaded,
    next: songs.length > CATALOG_SIZE && last !== undefined ? server.cursorOf(last) : null,
    totalCount: songs.length,
  });
  const created: SongFeed[] = [];
  const renders: { view: SongSelectView; previous: SongSelectView | null }[] = [];
  const plays: { chart: ChartRef; restore: SongSelectRestore }[] = [];
  const settings: SongSelectRestore[] = [];
  let focusSounds = 0;
  let controller: SongSelectController | undefined;
  const open = (restore?: SongSelectRestore): SongSelectController => {
    controller = new SongSelectController(
      {
        feeds: {
          catalog,
          create: (query) => {
            if (isShallowEqual(query, ALL_SONGS_QUERY)) {
              return catalog;
            }
            const feed = new SongFeed(query, server.loadBatch);
            created.push(feed);
            return feed;
          },
        },
        random,
        preview: preview.ports,
      },
      {
        render: (previous, view) =>
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
        playFocusSound: () => {
          focusSounds += 1;
        },
      },
      ROWS_PER_PAGE,
      laneCount,
      restore,
      RECORDS,
      WHEEL_STEP_PX,
    );
    return controller;
  };
  return {
    preview,
    server,
    catalog,
    created,
    renders,
    plays,
    settings,
    open,
    get focusSounds(): number {
      return focusSounds;
    },
    get controller(): SongSelectController {
      return requireDefined(controller, 'Not opened');
    },
    get view(): SongSelectView {
      return requireDefined(renders.at(-1)?.view, 'Nothing rendered');
    },
  };
}

function openHarness(songs: readonly Song[], laneCount: LaneCount = 4, random?: () => number) {
  const harness = createHarness(songs, laneCount, random);
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
      totalCount: served.length,
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

  it('reports the whole list size before every song is received', async () => {
    const harness = openHarness(songs);

    expect(harness.view.state.songs).toHaveLength(CATALOG_SIZE);
    expect(harness.view.songCount).toBe(songs.length);

    harness.controller.selectFilter('cover');
    await settle(harness.server.calls[0]);

    expect(harness.view.state.songs).toHaveLength(PAGE_SIZE);
    expect(harness.view.songCount).toBe(covers.length);
  });

  it('shows loading more only while the next batch of a listed category is on its way', async () => {
    const harness = openHarness(songs);

    expect(harness.view.isLoadingMore).toBe(false);

    harness.controller.moveSong(CATALOG_SIZE - 1);

    expect(harness.view.isLoadingMore).toBe(true);
    expect(harness.view.notice).toBeNull();

    await settle(harness.server.calls[0]);

    expect(harness.view.isLoadingMore).toBe(false);

    harness.controller.selectFilter('cover');

    expect(harness.view.notice).toBe('loading');
    expect(harness.view.isLoadingMore).toBe(false);
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
    expect(harness.renders.at(-1)?.previous?.state.current).toMatchObject({ index: 3 });
  });

  it('plays only a playable selection', async () => {
    const noChart = makeSong(200, 'cover', {});
    const harness = openHarness([makeSong(0), noChart]);

    harness.controller.moveDifficulty(1);
    harness.controller.play();

    expect(harness.plays.map(({ chart }) => chart)).toEqual([
      {
        song: harness.catalog.songs[0],
        laneCount: 4,
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
      totalCount: 0,
    });
    harness.controller.play();
    expect(harness.plays).toHaveLength(1);
  });

  it('plays the chart of the lane count it was opened with', () => {
    const mixed = makeSong(300, 'original', {
      4: { easy: 'easy-4k' },
      6: { hard: 'hard-6k' },
    });
    const harness = openHarness([mixed, makeSong(1)], 6);

    harness.controller.play();

    expect(harness.plays.map(({ chart }) => chart)).toEqual([
      {
        song: mixed,
        laneCount: 6,
        difficulty: 'hard',
        chartId: 'hard-6k',
      },
    ]);
  });

  it('ignores play for a song without charts of its lane count', () => {
    const harness = openHarness([makeSong(0)], 5);

    harness.controller.play();

    expect(selectedId(harness.view)).toBe('song-000');
    expect(harness.plays).toHaveLength(0);
  });
});

describe('SongSelectController focus sound', () => {
  it('plays the focus sound once when moveSong changes the selected song', () => {
    const harness = openHarness(songs);

    harness.controller.moveSong(1);

    expect(selectedId(harness.view)).toBe('song-001');
    expect(harness.focusSounds).toBe(1);
  });

  it('stays silent when moveSong is blocked at the start of the list', () => {
    const harness = openHarness(songs);

    harness.controller.moveSong(-1);

    expect(selectedId(harness.view)).toBe('song-000');
    expect(harness.focusSounds).toBe(0);
  });

  it('plays the focus sound when a clicked row changes the selected song', () => {
    const harness = openHarness(songs);

    harness.controller.selectRow(0);
    expect(harness.focusSounds).toBe(0);

    harness.controller.selectRow(1);
    expect(selectedId(harness.view)).toBe('song-001');
    expect(harness.focusSounds).toBe(1);
  });

  it('stays silent for selection changes other than moving or clicking a song', () => {
    const harness = openHarness(songs, 4, () => 0.5);
    const rendered = (): number => harness.renders.length;
    const changes = [
      () => harness.controller.moveDifficulty(1),
      () => harness.controller.selectDifficulty('easy'),
      () => harness.controller.selectRandomSong(),
      () => harness.controller.selectFilter('cover'),
    ];

    for (const change of changes) {
      const before = rendered();
      change();
      expect(rendered()).toBeGreaterThan(before);
    }
    expect(harness.focusSounds).toBe(0);
  });
});

describe('SongSelectController hover', () => {
  it('renders the hovered target with the previous hover', () => {
    const harness = openHarness(songs);

    harness.controller.hover({
      kind: 'filter',
      filter: 'cover',
    });

    expect(harness.view.state.hover).toEqual({
      kind: 'filter',
      filter: 'cover',
    });
    expect(harness.renders.at(-1)?.previous?.state.hover).toBeNull();

    harness.controller.hover({
      kind: 'row',
      slot: 1,
    });

    expect(harness.view.state.hover).toEqual({
      kind: 'row',
      slot: 1,
    });
    expect(harness.renders.at(-1)?.previous?.state.hover).toEqual({
      kind: 'filter',
      filter: 'cover',
    });
  });

  it('renders nothing for the same target again or an unhovered target, and clears on its own out', () => {
    const harness = openHarness(songs);
    harness.controller.hover({
      kind: 'action',
      action: 'play',
    });
    const renderCount = harness.renders.length;

    harness.controller.hover({
      kind: 'action',
      action: 'play',
    });
    harness.controller.unhover({
      kind: 'action',
      action: 'random',
    });

    expect(harness.renders).toHaveLength(renderCount);

    harness.controller.unhover({
      kind: 'action',
      action: 'play',
    });

    expect(harness.renders).toHaveLength(renderCount + 1);
    expect(harness.view.state.hover).toBeNull();
  });

  it('plays no focus sound', () => {
    const harness = openHarness(songs);

    harness.controller.hover({
      kind: 'row',
      slot: 1,
    });
    harness.controller.hover({
      kind: 'difficulty',
      difficulty: 'hard',
    });
    harness.controller.unhover({
      kind: 'difficulty',
      difficulty: 'hard',
    });

    expect(harness.renders).toHaveLength(4);
    expect(harness.focusSounds).toBe(0);
  });

  it('clears a row hover when the filter change leaves that row empty', () => {
    const harness = openHarness(songs);
    harness.controller.hover({
      kind: 'row',
      slot: 2,
    });

    harness.controller.selectFilter('cover');

    expect(harness.view.state.songs).toEqual([]);
    expect(harness.view.state.hover).toBeNull();
  });

  it('clears a PLAY hover when the selected song has no chart', () => {
    const harness = openHarness([makeSong(0), makeSong(200, 'cover', {})]);
    harness.controller.hover({
      kind: 'action',
      action: 'play',
    });

    harness.controller.moveSong(1);

    expect(selectedId(harness.view)).toBe('song-200');
    expect(harness.view.state.hover).toBeNull();
  });

  it('clears a RANDOM hover when no song is left to pick', () => {
    const harness = openHarness(songs);
    harness.controller.hover({
      kind: 'action',
      action: 'random',
    });

    harness.controller.selectFilter('cover');

    expect(harness.view.state.hover).toBeNull();
  });

  it('keeps filter and difficulty hovers across song and filter changes', () => {
    const harness = openHarness(songs);
    const hovers = [
      {
        kind: 'filter',
        filter: 'original',
      },
      {
        kind: 'difficulty',
        difficulty: 'hard',
      },
    ] as const;

    for (const hover of hovers) {
      harness.controller.hover(hover);
      harness.controller.moveSong(1);
      expect(harness.view.state.hover).toEqual(hover);
      harness.controller.cycleFilter(1);
      expect(harness.view.state.hover).toEqual(hover);
    }
  });
});

describe('SongSelectController random song', () => {
  it('selects the candidate the injected random value picks and renders it with the previous state', () => {
    const harness = openHarness(songs.slice(0, CATALOG_SIZE), 4, () => 0.5);
    harness.controller.moveSong(1);

    harness.controller.selectRandomSong();

    expect(selectedId(harness.view)).toBe('song-003');
    const picked = harness.renders.find(({ view }) => selectedId(view) === 'song-003');
    expect(picked?.previous?.state.current).toMatchObject({ index: 1 });
    expect(harness.plays).toHaveLength(0);
  });

  it('does nothing with one playable song or less', () => {
    const harness = openHarness([makeSong(0), makeSong(1, 'original', {})], 4, () => 0);
    const renderCount = harness.renders.length;

    harness.controller.selectRandomSong();

    expect(harness.renders).toHaveLength(renderCount);
    expect(selectedId(harness.view)).toBe('song-000');
    expect(harness.plays).toHaveLength(0);
  });

  it('loads the remaining songs first so every song of the filter is a candidate', async () => {
    const harness = openHarness(songs, 4, () => 0.99);

    harness.controller.selectRandomSong();
    expect(selectedId(harness.view)).toBe('song-000');
    for (let index = 0; index < harness.server.calls.length; index += 1) {
      await settle(harness.server.calls[index]);
    }

    expect(harness.catalog.status).toBe('complete');
    expect(selectedId(harness.view)).toBe('song-013');
  });

  it('drops a pending random pick when the filter changes', async () => {
    const harness = openHarness(songs, 4, () => 0.99);

    harness.controller.selectRandomSong();
    harness.controller.selectFilter('cover');
    for (let index = 0; index < harness.server.calls.length; index += 1) {
      await settle(harness.server.calls[index]);
    }

    expect(harness.view.state.filter).toBe('cover');
    expect(selectedId(harness.view)).toBe(coverIds[0]);
  });

  it('does not retry a failed empty feed', async () => {
    const harness = openHarness(songs);
    harness.controller.selectFilter('cover');
    await settle(harness.server.calls[0], 'reject');
    const renderCount = harness.renders.length;

    harness.controller.selectRandomSong();

    expect(harness.server.calls).toHaveLength(1);
    expect(harness.created[0]?.status).toBe('failed');
    expect(harness.renders).toHaveLength(renderCount);
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
      totalCount: 0,
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

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const previewSongs = songs.map((song, index): Song => ({
  ...song,
  youtubeVideoId: `video-${index}`,
  gameStartMs: 5000,
  gameEndMs: 60000,
}));

function tickAt(harness: ReturnType<typeof createHarness>, nowMs: number) {
  harness.preview.clock.nowMs = nowMs;
  harness.controller.tick();
}

function requirePlayer(harness: ReturnType<typeof createHarness>, index: number): FakePlayer {
  return requireDefined(harness.preview.players[index], 'Missing player');
}

/** 지금 포커스 곡의 시도를 nowMs 에 시작해 플레이어 준비까지 진행한다. */
async function readyPreview(harness: ReturnType<typeof createHarness>, nowMs: number) {
  tickAt(harness, nowMs);
  requireDefined(harness.preview.loads.at(-1), 'Missing load').resolve();
  await flush();
  const player = requireDefined(harness.preview.players.at(-1), 'Missing player');
  player.handlers.onReady();
  return player;
}

describe('SongSelectController preview timing', () => {
  it('creates one player for the focused song only after it stays 200ms', async () => {
    const harness = createHarness(previewSongs);
    harness.open();

    tickAt(harness, 199);
    expect(harness.preview.loads).toHaveLength(0);

    tickAt(harness, 200);
    expect(harness.preview.loads).toHaveLength(1);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();
    tickAt(harness, 1000);

    expect(harness.preview.loads).toHaveLength(1);
    expect(harness.preview.players.map((player) => player.videoId)).toEqual(['video-0']);
  });

  it('creates a player only for the song it stops at while moving quickly', async () => {
    const harness = createHarness(previewSongs);
    harness.open();

    harness.preview.clock.nowMs = 100;
    harness.controller.moveSong(1);
    tickAt(harness, 250);
    harness.controller.moveSong(1);
    tickAt(harness, 449);
    expect(harness.preview.loads).toHaveLength(0);

    tickAt(harness, 450);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();

    expect(harness.preview.players.map((player) => player.videoId)).toEqual(['video-2']);
  });

  it('destroys the playing player at once on a focus change and waits 200ms for the next song', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const first = await readyPreview(harness, 400);

    harness.preview.clock.nowMs = 2000;
    harness.controller.moveSong(1);

    expect(first.isDestroyed).toBe(true);
    tickAt(harness, 2199);
    expect(harness.preview.loads).toHaveLength(1);

    tickAt(harness, 2200);
    requireDefined(harness.preview.loads[1], 'Missing load').resolve();
    await flush();

    expect(harness.preview.players.map((player) => player.videoId)).toEqual(['video-0', 'video-1']);
  });

  it('drops a late API load of a previous focus', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    tickAt(harness, 400);

    harness.controller.moveSong(1);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();

    expect(harness.preview.players).toHaveLength(0);
  });

  it('ignores ready and state reports of a destroyed player', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    tickAt(harness, 400);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();
    const player = requirePlayer(harness, 0);

    harness.controller.moveSong(1);
    player.handlers.onReady();
    player.handlers.onStateChange('playing');
    tickAt(harness, 500);

    expect(player.isDestroyed).toBe(true);
    expect(player.playsSec).toEqual([]);
    expect(player.volumes).toEqual([]);
  });
});

describe('SongSelectController preview loop', () => {
  it('starts muted at the chart start and fades in to the target volume', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);

    expect(player.playsSec).toEqual([5]);
    expect(player.volumes).toEqual([0]);

    harness.preview.clock.nowMs = 1000;
    player.handlers.onStateChange('playing');
    tickAt(harness, 1500);
    tickAt(harness, 2000);
    tickAt(harness, 3000);

    expect(player.volumes).toEqual([0, 0.25, 0.5]);
  });

  it('fades out before the 20 second span ends and replays from the chart start', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');

    tickAt(harness, 19250);
    expect(player.volumes.at(-1)).toBe(0.25);
    tickAt(harness, 19999);
    expect(player.playsSec).toEqual([5]);

    tickAt(harness, 20000);
    expect(player.playsSec).toEqual([5, 5]);
    expect(player.volumes.at(-1)).toBe(0);

    tickAt(harness, 20500);
    expect(player.volumes.at(-1)).toBe(0.25);
  });

  it('replays at the span end from position reports while frames are stopped', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');

    harness.preview.clock.nowMs = 19999;
    player.handlers.onPositionReport?.(24.999);
    expect(player.playsSec).toEqual([5]);

    harness.preview.clock.nowMs = 20000;
    player.handlers.onPositionReport?.(25);
    expect(player.playsSec).toEqual([5, 5]);
    expect(player.volumes.at(-1)).toBe(0);

    harness.preview.clock.nowMs = 39999;
    player.handlers.onPositionReport?.(24.999);
    expect(player.playsSec).toEqual([5, 5]);
    harness.preview.clock.nowMs = 40000;
    player.handlers.onPositionReport?.(25);
    expect(player.playsSec).toEqual([5, 5, 5]);
  });

  it('replays a song shorter than 20 seconds after the full 20 second span', async () => {
    const short = previewSongs.map((song) => ({
      ...song,
      gameEndMs: 11000,
    }));
    const harness = createHarness(short);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');

    tickAt(harness, 6000);
    tickAt(harness, 19999);
    expect(player.playsSec).toEqual([5]);

    tickAt(harness, 20000);
    expect(player.playsSec).toEqual([5, 5]);
  });

  it('plays from the preview start for 20 seconds past the game end', async () => {
    const chorus = previewSongs.map((song) => ({
      ...song,
      previewStartMs: 50000,
    }));
    const harness = createHarness(chorus);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');
    expect(player.playsSec).toEqual([50]);

    tickAt(harness, 10000);
    tickAt(harness, 19999);
    expect(player.playsSec).toEqual([50]);

    tickAt(harness, 20000);
    expect(player.playsSec).toEqual([50, 50]);
  });

  it('does not count time while buffering', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');
    harness.preview.clock.nowMs = 3000;
    player.handlers.onStateChange('buffering');

    tickAt(harness, 20000);
    expect(player.playsSec).toEqual([5]);

    player.handlers.onStateChange('playing');
    tickAt(harness, 36999);
    expect(player.playsSec).toEqual([5]);
    tickAt(harness, 37000);
    expect(player.playsSec).toEqual([5, 5]);
  });

  it('replays at once when the video ends', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');
    tickAt(harness, 5000);

    player.handlers.onStateChange('ended');

    expect(player.playsSec).toEqual([5, 5]);
    expect(player.volumes.at(-1)).toBe(0);
  });

  it('plays muted when the target volume is zero', async () => {
    const harness = createHarness(previewSongs, 4, () => 0, 0);
    harness.open();
    const player = await readyPreview(harness, 400);
    harness.preview.clock.nowMs = 0;
    player.handlers.onStateChange('playing');
    tickAt(harness, 5000);

    expect(player.playsSec).toEqual([5]);
    expect(player.volumes).toEqual([0]);
  });
});

describe('SongSelectController preview focus', () => {
  it('creates no player without a focused song', () => {
    const harness = createHarness([]);
    harness.open();

    tickAt(harness, 1000);

    expect(harness.preview.loads).toHaveLength(0);
  });

  it('creates no player while the feed has failed', async () => {
    const harness = createHarness(previewSongs);
    harness.open();

    harness.controller.selectFilter('cover');
    await settle(harness.server.calls[0], 'reject');
    tickAt(harness, 5000);

    expect(harness.view.notice).toBe('loadFailed');
    expect(harness.preview.loads).toHaveLength(0);
    expect(harness.preview.players).toHaveLength(0);
  });

  it('destroys the player when the focused song disappears', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);

    harness.controller.selectFilter('cover');
    tickAt(harness, 5000);

    expect(harness.view.notice).toBe('loading');
    expect(player.isDestroyed).toBe(true);
    expect(harness.preview.loads).toHaveLength(1);
  });

  it('keeps playing the same song across a difficulty change and a feed response', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    harness.controller.moveSong(3);
    const player = await readyPreview(harness, 400);
    const renderCount = harness.renders.length;

    harness.controller.moveDifficulty(1);
    await settle(harness.server.calls[0]);
    tickAt(harness, 5000);

    expect(harness.renders.length).toBeGreaterThan(renderCount + 1);
    expect(selectedId(harness.view)).toBe('song-003');
    expect(player.isDestroyed).toBe(false);
    expect(harness.preview.loads).toHaveLength(1);
  });
});

describe('SongSelectController preview close', () => {
  it('destroys the player on close', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);

    harness.controller.close();

    expect(player.isDestroyed).toBe(true);
  });

  it('ignores a late API load and ticks after close', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    tickAt(harness, 400);

    harness.controller.close();
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();
    tickAt(harness, 5000);

    expect(harness.preview.players).toHaveLength(0);
    expect(harness.preview.loads).toHaveLength(1);
  });

  it('ignores reports of the player after close', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    tickAt(harness, 400);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();
    const player = requirePlayer(harness, 0);

    harness.controller.close();
    player.handlers.onReady();
    player.handlers.onStateChange('playing');
    tickAt(harness, 5000);

    expect(player.playsSec).toEqual([]);
  });

  it('ignores pointer, controls and wheel input after close', () => {
    const harness = openHarness(songs);
    const renderCount = harness.renders.length;

    harness.controller.close();
    harness.controller.pointerOver('settings');
    harness.controller.pointerDown('settings');
    harness.controller.pointerUp('settings');
    harness.controller.hover({
      kind: 'row',
      slot: 1,
    });
    harness.controller.openControls();
    harness.controller.handleControlsKey(ESCAPE_KEY);
    harness.controller.scrollByWheel(1000, 0);

    expect(harness.renders).toHaveLength(renderCount);
    expect(harness.settings).toHaveLength(0);
  });

  it('plays the restored song 200ms after reopening', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    harness.controller.moveSong(2);
    harness.controller.play();
    harness.controller.close();
    const restore = requireDefined(harness.plays[0], 'Missing play').restore;

    harness.preview.clock.nowMs = 1000;
    harness.open(restore);
    tickAt(harness, 1199);
    expect(harness.preview.loads).toHaveLength(0);

    tickAt(harness, 1200);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();

    expect(harness.preview.players.map((player) => player.videoId)).toEqual(['video-2']);
  });
});

describe('SongSelectController preview failures', () => {
  it('does not retry a failed API load for the same focus but tries the next song', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    tickAt(harness, 400);
    requireDefined(harness.preview.loads[0], 'Missing load').reject();
    await flush();
    tickAt(harness, 5000);

    expect(harness.preview.players).toHaveLength(0);
    expect(harness.preview.loads).toHaveLength(1);

    harness.controller.play();
    expect(harness.plays).toHaveLength(1);

    harness.controller.moveSong(1);
    tickAt(harness, 5400);
    expect(harness.preview.loads).toHaveLength(2);
  });

  it('does not retry when creating the player throws', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    harness.preview.control.isCreateFailing = true;
    tickAt(harness, 400);
    requireDefined(harness.preview.loads[0], 'Missing load').resolve();
    await flush();
    tickAt(harness, 5000);

    expect(harness.preview.players).toHaveLength(0);
    expect(harness.preview.loads).toHaveLength(1);
  });

  it('destroys the player on a player error and does not retry the same focus', async () => {
    const harness = createHarness(previewSongs);
    harness.open();
    const player = await readyPreview(harness, 400);

    player.handlers.onError('videoNotFound', 100);
    tickAt(harness, 5000);

    expect(player.isDestroyed).toBe(true);
    expect(harness.preview.loads).toHaveLength(1);

    harness.controller.moveSong(1);
    harness.controller.moveSong(-1);
    tickAt(harness, 5400);
    expect(harness.preview.loads).toHaveLength(2);
  });
});

describe('SongSelectController view', () => {
  it('passes the records it was given in every view', () => {
    const harness = openHarness(songs);
    harness.controller.moveSong(1);

    expect(harness.renders.every(({ view }) => view.records === RECORDS)).toBe(true);
  });

  it('passes the previously rendered view', () => {
    const harness = openHarness(songs);
    const first = harness.view;

    harness.controller.moveSong(1);

    expect(harness.renders.at(-1)?.previous).toBe(first);
  });
});

describe('SongSelectController wheel', () => {
  it('moves one song with a focus sound for a wheel of one step', () => {
    const harness = openHarness(songs);

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

    expect(selectedId(harness.view)).toBe('song-001');
    expect(harness.focusSounds).toBe(1);
  });

  it('ignores a wheel smaller than the start ratio', () => {
    const harness = openHarness(songs);
    const renderCount = harness.renders.length;

    harness.controller.scrollByWheel(20, 0);

    expect(harness.renders).toHaveLength(renderCount);
    expect(harness.focusSounds).toBe(0);
  });

  it('accumulates wheels within the gesture gap', () => {
    const harness = openHarness(songs);

    harness.controller.scrollByWheel(20, 0);
    harness.controller.scrollByWheel(10, 100);

    expect(selectedId(harness.view)).toBe('song-001');
  });
});

const H_KEY = {
  code: 'KeyH',
  repeat: false,
};
const ESCAPE_KEY = {
  code: 'Escape',
  repeat: false,
};
const DOWN_KEY = {
  code: 'ArrowDown',
  repeat: false,
};

describe('SongSelectController controls', () => {
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = openHarness(songs);

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.view.state.isControlsOpen).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.view.state.isControlsOpen).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.view.state.isControlsOpen).toBe(false);
  });

  it('ignores wheels while the controls are open', () => {
    const harness = openHarness(songs);
    harness.controller.openControls();
    const renderCount = harness.renders.length;

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

    expect(harness.renders).toHaveLength(renderCount);
    expect(selectedId(harness.view)).toBe('song-000');
  });
});

describe('SongSelectController button pointer', () => {
  it('opens the settings once for over, down and up on SETTINGS', () => {
    const harness = openHarness(songs);

    harness.controller.pointerOver('settings');
    harness.controller.pointerDown('settings');
    harness.controller.pointerUp('settings');
    harness.controller.pointerUp('settings');

    expect(harness.settings).toHaveLength(1);
  });

  it('does not open the settings for an up that was pressed elsewhere', () => {
    const harness = openHarness(songs);

    harness.controller.pointerOver('settings');
    harness.controller.pointerUp('settings');

    expect(harness.settings).toHaveLength(0);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = openHarness(songs);

    harness.controller.pointerOver('settings');
    harness.controller.pointerDown('settings');
    harness.controller.pointerOut('settings');
    harness.controller.pointerOver('settings');
    harness.controller.pointerUp('settings');

    expect(harness.settings).toHaveLength(0);
  });

  it('ignores a press on the close button while the controls are closed', () => {
    const harness = openHarness(songs);
    const renderCount = harness.renders.length;

    harness.controller.pointerDown('controlsClose');

    expect(harness.renders).toHaveLength(renderCount);
  });

  it('opens with the entry and closes with the close button and the backdrop', () => {
    const harness = openHarness(songs);

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(harness.view.state.isControlsOpen).toBe(true);

    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(harness.view.state.isControlsOpen).toBe(false);

    harness.controller.openControls();
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(harness.view.state.isControlsOpen).toBe(false);
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = openHarness(songs);
    harness.controller.openControls();
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(harness.view.state.hover).toBeNull();
  });
});
