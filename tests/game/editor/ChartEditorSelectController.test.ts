import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SONGS_QUERY } from '../../../src/data/songs.js';
import type {
  Song,
  SongCategory,
  SongBatch,
  SongBatchCursor,
  SongQuery,
} from '../../../src/data/songs.js';
import { ChartEditorSelectController } from '../../../src/game/editor/ChartEditorSelectController.js';
import type {
  ChartEditorSelectView,
  SongListKey,
} from '../../../src/game/editor/state/songListState.js';
import { SongFeed } from '../../../src/game/app/SongFeed.js';
import type { ChartEditorSelectSceneData } from '../../../src/game/app/sceneRoutes.js';
import { requireDefined } from '../../../src/invariant.js';

const PAGE_SIZE = 6;
const VISIBLE_ROW_COUNT = 4;
const ROW_HEIGHT_PX = 56;
const RELEASED_ON = '2026-05-01';

function makeSong(index: number, category: SongCategory = 'original'): Song {
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
    chartIds: {},
  };
}

interface PendingCall {
  readonly query: SongQuery;
  readonly after: SongBatchCursor | null;
  readonly batch: SongBatch;
  readonly resolve: () => void;
  readonly reject: () => void;
}

/** 서버처럼 조건으로 거른 곡을 커서 다음부터 잘라 주되, 응답 시점은 테스트가 정한다. 같은 게시일이라 커서는 record id 로만 갈린다. */
function createServer(songs: readonly Song[]) {
  const calls: PendingCall[] = [];
  const recordIdOf = (song: Song): string =>
    `r${String(songs.length - songs.indexOf(song)).padStart(4, '0')}`;
  const loadBatch = (query: SongQuery, after: SongBatchCursor | null): Promise<SongBatch> => {
    const inQuery = songs
      .filter((song) => query.category === 'all' || song.category === query.category)
      .filter((song) => song.title.includes(query.title));
    const matched = inQuery
      .filter((song) => after === null || recordIdOf(song) < after.recordId)
      .slice(0, PAGE_SIZE);
    const last = matched.at(-1);
    const batch: SongBatch = {
      songs: matched,
      next:
        matched.length === PAGE_SIZE && last !== undefined
          ? {
              releasedOn: RELEASED_ON,
              recordId: recordIdOf(last),
            }
          : null,
      totalCount: after === null ? inQuery.length : null,
    };
    return new Promise<SongBatch>((resolve, reject) => {
      calls.push({
        query,
        after,
        batch,
        resolve: () => resolve(batch),
        reject: () => reject(new Error('Request failed')),
      });
    });
  };
  return {
    calls,
    loadBatch,
  };
}

type Server = ReturnType<typeof createServer>;

async function settle(call: PendingCall | undefined, kind: 'resolve' | 'reject' = 'resolve') {
  requireDefined(call, 'Missing call')[kind]();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(songs: readonly Song[], catalog?: (server: Server) => SongFeed) {
  const server = createServer(songs);
  const created: SongFeed[] = [];
  const views: ChartEditorSelectView[] = [];
  const previousViews: (ChartEditorSelectView | null)[] = [];
  const edits: { songId: string; list: SongFeed }[] = [];
  let leaveCount = 0;
  const search = {
    isFocused: false,
    text: '',
    shown: [] as string[],
  };
  const feed = catalog?.(server) ?? new SongFeed(ALL_SONGS_QUERY, server.loadBatch);
  let controller: ChartEditorSelectController | undefined;
  const open = (entry: ChartEditorSelectSceneData): ChartEditorSelectController => {
    controller = new ChartEditorSelectController(
      {
        catalog: feed,
        create: (query) => {
          const next = new SongFeed(query, server.loadBatch);
          created.push(next);
          return next;
        },
      },
      {
        render: (previous, next) => {
          previousViews.push(previous);
          views.push(next);
        },
        edit: (songId, list) =>
          edits.push({
            songId,
            list,
          }),
        leave: () => {
          leaveCount += 1;
        },
        isSearchFocused: () => search.isFocused,
        readSearchText: () => search.text,
        showSearchText: (title) => {
          search.text = title;
          search.shown.push(title);
        },
        focusSearch: () => {
          search.isFocused = true;
        },
        blurSearch: () => {
          search.isFocused = false;
        },
      },
      VISIBLE_ROW_COUNT,
      entry,
      ROW_HEIGHT_PX,
    );
    return controller;
  };
  return {
    server,
    catalog: feed,
    created,
    views,
    previousViews,
    edits,
    search,
    open,
    get controller(): ChartEditorSelectController {
      return requireDefined(controller, 'Not opened');
    },
    get leaveCount() {
      return leaveCount;
    },
    get view(): ChartEditorSelectView {
      return requireDefined(views.at(-1), 'Nothing rendered');
    },
  };
}

function key(code: string, overrides: Partial<SongListKey> = {}): SongListKey {
  return {
    code,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ...overrides,
  };
}

function rowIds(view: ChartEditorSelectView): string[] {
  return view.rows.map(({ song }) => song.id);
}

function focusedId(view: ChartEditorSelectView): string | undefined {
  return view.rows.find((row) => row.isFocused)?.song.id;
}

const songs = Array.from({ length: 10 }, (_, index) =>
  makeSong(index, index % 2 === 0 ? 'original' : 'cover'),
);

/** 첫 배치를 이미 받은 전체 곡 목록. */
function loadedCatalog(server: Server): SongFeed {
  void server.loadBatch(ALL_SONGS_QUERY, null);
  return new SongFeed(ALL_SONGS_QUERY, server.loadBatch, server.calls.pop()?.batch);
}

function openLoaded() {
  const harness = createHarness(songs, loadedCatalog);
  harness.open({ kind: 'fresh' });
  return harness;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChartEditorSelectController list', () => {
  it('opens fresh with the shared catalog without a new request', () => {
    const harness = openLoaded();

    expect(harness.server.calls).toHaveLength(0);
    expect(harness.created).toHaveLength(0);
    expect(rowIds(harness.view)).toEqual(songs.slice(0, 4).map((song) => song.id));
    expect(harness.view.songCount).toBe(PAGE_SIZE);
    expect(harness.view.category).toBe('all');
    expect(harness.view.notice).toBeNull();
    expect(harness.view.status).toBeNull();
  });

  it('requests the next batch once when keyboard moves reach the end and appends it', async () => {
    const harness = openLoaded();

    for (let index = 0; index < 4; index += 1) {
      expect(harness.controller.handleKey(key('ArrowDown'))).toBe(true);
    }
    expect(harness.server.calls).toHaveLength(0);
    harness.controller.handleKey(key('ArrowDown'));
    harness.controller.handleKey(key('ArrowDown'));
    harness.controller.handleKey(key('ArrowUp'));

    expect(harness.server.calls).toHaveLength(1);
    expect(harness.server.calls[0]?.after).toEqual({
      releasedOn: RELEASED_ON,
      recordId: 'r0005',
    });
    expect(harness.view.status).toBe('loadingMore');

    await settle(harness.server.calls[0]);

    expect(harness.view.songCount).toBe(songs.length);
    expect(harness.catalog.songs).toEqual(songs);
    expect(harness.view.status).toBeNull();
  });

  it('requests the next batch when scrolling reaches the end', () => {
    const harness = openLoaded();

    harness.controller.scroll(1);
    expect(harness.server.calls).toHaveLength(0);
    harness.controller.scroll(5);
    harness.controller.scroll(5);

    expect(harness.server.calls).toHaveLength(1);
  });

  it('reopens the returned list with its focused song and title without a new request', () => {
    const harness = createHarness(songs);
    void harness.server.loadBatch(
      {
        category: 'all',
        title: 'Title',
      },
      null,
    );
    const list = new SongFeed(
      {
        category: 'all',
        title: 'Title',
      },
      harness.server.loadBatch,
      harness.server.calls.pop()?.batch,
    );

    harness.open({
      kind: 'return',
      list,
      focusedSongId: 'song-003',
    });

    expect(focusedId(harness.view)).toBe('song-003');
    expect(harness.search.shown).toEqual(['Title']);
    expect(harness.server.calls).toHaveLength(0);
    harness.controller.pickRow(0);
    expect(harness.edits[0]?.list).toBe(list);
  });

  it('keeps the category, title and focused song when returning to a category search', () => {
    const harness = createHarness(songs);
    const query: SongQuery = {
      category: 'cover',
      title: 'Title',
    };
    void harness.server.loadBatch(query, null);
    const list = new SongFeed(query, harness.server.loadBatch, harness.server.calls.pop()?.batch);

    harness.open({
      kind: 'return',
      list,
      focusedSongId: 'song-005',
    });

    expect(harness.view.category).toBe('cover');
    expect(harness.search.shown).toEqual(['Title']);
    expect(focusedId(harness.view)).toBe('song-005');
    expect(harness.server.calls).toHaveLength(0);
    expect(harness.created).toHaveLength(0);
  });

  it('edits the focused song with the current list and leaves on Escape', () => {
    const harness = openLoaded();

    harness.controller.handleKey(key('ArrowDown'));
    harness.controller.handleKey(key('Enter'));
    harness.controller.pickRow(2);
    harness.controller.handleKey(key('Escape'));

    expect(harness.edits).toEqual([
      {
        songId: 'song-001',
        list: harness.catalog,
      },
      {
        songId: 'song-002',
        list: harness.catalog,
      },
    ]);
    expect(harness.leaveCount).toBe(1);
  });
});

describe('ChartEditorSelectController query', () => {
  it('switches categories to a new feed with the current title and resets focus', async () => {
    const harness = openLoaded();
    harness.controller.scroll(1);
    harness.controller.handleKey(key('ArrowDown'));
    expect(harness.view.topIndex).toBeGreaterThan(0);

    harness.controller.selectCategory('cover');

    expect(harness.created.map((feed) => feed.query)).toEqual([
      {
        category: 'cover',
        title: '',
      },
    ]);
    expect(harness.server.calls.map((call) => call.query)).toEqual([
      {
        category: 'cover',
        title: '',
      },
    ]);
    await settle(harness.server.calls[0]);
    expect(harness.view.category).toBe('cover');
    expect(rowIds(harness.view)).toEqual(['song-001', 'song-003', 'song-005', 'song-007']);
    expect(focusedId(harness.view)).toBe('song-001');
    expect(harness.view.topIndex).toBe(0);
  });

  it('cycles categories with Q and E and returns to the shared catalog', () => {
    const harness = openLoaded();

    expect(harness.controller.handleKey(key('KeyE'))).toBe(true);
    expect(harness.view.category).toBe('original');
    harness.controller.handleKey(key('KeyQ'));

    expect(harness.view.category).toBe('all');
    expect(harness.created.map((feed) => feed.query.category)).toEqual(['original']);
    expect(rowIds(harness.view)).toEqual(songs.slice(0, 4).map((song) => song.id));
    harness.controller.pickRow(0);
    expect(harness.edits[0]?.list).toBe(harness.catalog);
  });

  it('does nothing for the current query', () => {
    const harness = openLoaded();
    const renderCount = harness.views.length;

    harness.controller.selectCategory('all');

    expect(harness.views).toHaveLength(renderCount);
    expect(harness.created).toHaveLength(0);
  });

  it('keeps showing the latest query when an earlier response arrives later', async () => {
    const harness = openLoaded();

    harness.controller.selectCategory('cover');
    harness.controller.selectCategory('original');
    const [coverCall, originalCall] = harness.server.calls;
    await settle(originalCall);
    await settle(coverCall);

    expect(harness.view.category).toBe('original');
    expect(rowIds(harness.view)).toEqual(['song-000', 'song-002', 'song-004', 'song-006']);
  });
});

describe('ChartEditorSelectController status', () => {
  it('shows loading and then a retryable failure for an empty list', async () => {
    const harness = createHarness(songs);
    harness.open({ kind: 'fresh' });

    expect(harness.view.notice).toEqual({ kind: 'loading' });
    expect(harness.view.canRetry).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await settle(harness.server.calls[0], 'reject');

    expect(harness.view.notice).toEqual({ kind: 'loadFailed' });
    expect(harness.view.status).toBeNull();
    expect(harness.view.canRetry).toBe(true);
    expect(harness.server.calls).toHaveLength(1);
  });

  it('shows loading more and a retryable failure with songs, and retries from the same cursor', async () => {
    const harness = openLoaded();
    harness.controller.scroll(5);
    expect(harness.view.status).toBe('loadingMore');
    expect(harness.view.notice).toBeNull();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await settle(harness.server.calls[0], 'reject');

    expect(harness.view.status).toBe('loadMoreFailed');
    expect(harness.view.canRetry).toBe(true);
    expect(harness.server.calls).toHaveLength(1);

    expect(harness.controller.handleKey(key('KeyR'))).toBe(true);
    expect(harness.server.calls).toHaveLength(2);
    expect(harness.server.calls[1]?.after).toEqual(harness.server.calls[0]?.after);
    await settle(harness.server.calls[1]);

    expect(harness.catalog.songs).toEqual(songs);
    expect(harness.view.songCount).toBe(songs.length);
    expect(harness.view.canRetry).toBe(false);
    expect(harness.controller.handleKey(key('KeyR'))).toBe(false);
  });

  it('requests a failed batch again only through retry, not through list input', async () => {
    const harness = openLoaded();
    harness.controller.scroll(5);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await settle(harness.server.calls[0], 'reject');

    harness.controller.scroll(5);
    harness.controller.hoverRow(0);
    harness.controller.handleKey(key('ArrowUp'));

    expect(harness.server.calls).toHaveLength(1);
    expect(harness.view.canRetry).toBe(true);
  });

  it('retries a failed request through retry()', async () => {
    const harness = createHarness(songs);
    harness.open({ kind: 'fresh' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await settle(harness.server.calls[0], 'reject');

    harness.controller.retry();
    await settle(harness.server.calls[1]);

    expect(harness.server.calls[1]?.after).toBeNull();
    expect(harness.view.songCount).toBe(PAGE_SIZE);
  });

  it('tells no songs, an empty category and no title match apart', async () => {
    const empty = createHarness([]);
    empty.open({ kind: 'fresh' });
    await settle(empty.server.calls[0]);
    expect(empty.view.notice).toEqual({ kind: 'noSongs' });

    const originalsOnly = createHarness(
      songs.filter((song) => song.category === 'original'),
      loadedCatalog,
    );
    originalsOnly.open({ kind: 'fresh' });
    originalsOnly.controller.selectCategory('cover');
    await settle(originalsOnly.server.calls.at(-1));
    expect(originalsOnly.view.notice).toEqual({ kind: 'emptyCategory' });

    const searched = createHarness(songs);
    const list = new SongFeed(
      {
        category: 'all',
        title: 'missing',
      },
      searched.server.loadBatch,
    );
    searched.open({
      kind: 'return',
      list,
      focusedSongId: null,
    });
    await settle(searched.server.calls[0]);
    expect(searched.view.notice).toEqual({
      kind: 'noMatch',
      title: 'missing',
    });
  });
});

describe('ChartEditorSelectController search', () => {
  function openSearching(text: string) {
    const harness = openLoaded();
    expect(harness.controller.handleKey(key('Slash'))).toBe(true);
    harness.search.text = text;
    return harness;
  }

  it('focuses the search input with Slash and shows the empty title on fresh open', () => {
    const harness = openLoaded();

    expect(harness.search.shown).toEqual(['']);
    expect(harness.controller.handleKey(key('Slash'))).toBe(true);
    expect(harness.search.isFocused).toBe(true);
  });

  it('ignores list shortcuts and typing while the search input is focused', () => {
    const harness = openSearching('Ti');
    const renderCount = harness.views.length;

    ['KeyT', 'ArrowDown', 'KeyS', 'KeyQ', 'KeyE', 'KeyR', 'Slash', 'Space'].forEach((code) =>
      expect(harness.controller.handleKey(key(code))).toBe(false),
    );

    expect(harness.views).toHaveLength(renderCount);
    expect(harness.server.calls).toHaveLength(0);
    expect(harness.created).toHaveLength(0);
    expect(harness.search.isFocused).toBe(true);
  });

  it('searches the trimmed title with the current category on Enter and keeps focus', async () => {
    const harness = openLoaded();
    harness.controller.selectCategory('original');
    await settle(harness.server.calls[0]);
    harness.controller.handleKey(key('Slash'));
    harness.search.text = '  Title 4 ';

    expect(harness.controller.handleKey(key('Enter'))).toBe(true);

    expect(harness.created.at(-1)?.query).toEqual({
      category: 'original',
      title: 'Title 4',
    });
    await settle(harness.server.calls[1]);
    expect(rowIds(harness.view)).toEqual(['song-004']);
    expect(harness.search.isFocused).toBe(true);
    expect(harness.edits).toHaveLength(0);
  });

  it('returns to the category-only query for a blank search', () => {
    const harness = openSearching('Title');
    harness.controller.handleKey(key('Enter'));
    expect(harness.created.map((feed) => feed.query.title)).toEqual(['Title']);

    harness.search.text = '   ';
    harness.controller.handleKey(key('Enter'));

    expect(harness.created).toHaveLength(1);
    harness.controller.pickRow(0);
    expect(harness.edits[0]?.list).toBe(harness.catalog);
  });

  it('does nothing when the confirmed title is unchanged', () => {
    const harness = openSearching('  ');
    const renderCount = harness.views.length;

    expect(harness.controller.handleKey(key('Enter'))).toBe(true);

    expect(harness.views).toHaveLength(renderCount);
    expect(harness.created).toHaveLength(0);
  });

  it('ignores Enter while composing with an IME', () => {
    const harness = openSearching('곡');

    expect(harness.controller.handleKey(key('Enter', { isComposing: true }))).toBe(false);
    expect(harness.controller.handleKey(key('Enter', { keyCode: 229 }))).toBe(false);

    expect(harness.created).toHaveLength(0);
    expect(harness.server.calls).toHaveLength(0);
  });

  it('blurs the search input on Escape without leaving, then leaves on the next Escape', () => {
    const harness = openSearching('Title');

    expect(harness.controller.handleKey(key('Escape'))).toBe(true);
    expect(harness.search.isFocused).toBe(false);
    expect(harness.leaveCount).toBe(0);

    expect(harness.controller.handleKey(key('Escape'))).toBe(true);
    expect(harness.leaveCount).toBe(1);
  });
});

describe('ChartEditorSelectController close', () => {
  it('ignores responses after closing', async () => {
    const harness = openLoaded();
    harness.controller.scroll(5);
    const renderCount = harness.views.length;
    const callCount = harness.server.calls.length;

    harness.controller.close();
    await settle(harness.server.calls[0]);

    expect(harness.views).toHaveLength(renderCount);
    expect(harness.server.calls).toHaveLength(callCount);
  });
});

describe('ChartEditorSelectController input after close', () => {
  it('ignores pointer, wheel and key input after closing', () => {
    const harness = openLoaded();
    harness.controller.pointerDown('back');
    const renderCount = harness.views.length;

    harness.controller.close();
    harness.controller.pointerUp('back');
    harness.controller.pointerOver('back');
    harness.controller.hoverFilter('original');
    harness.controller.hoverRow(1);
    harness.controller.scrollByWheel(1000, 0);
    harness.controller.handleKey(key('Escape'));

    expect(harness.views).toHaveLength(renderCount);
    expect(harness.leaveCount).toBe(0);
  });
});

describe('ChartEditorSelectController view', () => {
  it('renders the first view without a previous one and then with the last rendered one', () => {
    const harness = openLoaded();
    const first = harness.view;

    harness.controller.scroll(1);

    expect(harness.previousViews[0]).toBeNull();
    expect(harness.previousViews.at(-1)).toBe(first);
  });

  it('keeps the hovered filter in the view and renders nothing for the same hover', () => {
    const harness = openLoaded();

    harness.controller.hoverFilter('cover');
    expect(harness.view.hover).toEqual({
      kind: 'filter',
      category: 'cover',
    });
    const renderCount = harness.views.length;
    harness.controller.hoverFilter('cover');
    harness.controller.unhoverFilter('original');
    expect(harness.views).toHaveLength(renderCount);

    harness.controller.unhoverFilter('cover');
    expect(harness.view.hover).toBeNull();
  });
});

describe('ChartEditorSelectController wheel', () => {
  it('scrolls one row for a wheel of one row height', () => {
    const harness = openLoaded();

    harness.controller.scrollByWheel(ROW_HEIGHT_PX, 0);

    expect(harness.view.topIndex).toBe(1);
  });

  it('ignores a wheel smaller than the start ratio', () => {
    const harness = openLoaded();
    const renderCount = harness.views.length;

    harness.controller.scrollByWheel(10, 0);

    expect(harness.views).toHaveLength(renderCount);
  });

  it('accumulates wheels within the gesture gap', () => {
    const harness = openLoaded();

    harness.controller.scrollByWheel(10, 0);
    harness.controller.scrollByWheel(10, 100);

    expect(harness.view.topIndex).toBe(1);
  });
});

describe('ChartEditorSelectController button pointer', () => {
  it('leaves once for over, down and up on BACK', () => {
    const harness = openLoaded();

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerUp('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount).toBe(1);
  });

  it('does not leave for an up that was pressed elsewhere', () => {
    const harness = openLoaded();

    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount).toBe(0);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = openLoaded();

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerOut('back');
    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount).toBe(0);
    expect(harness.view.hover).toEqual({
      kind: 'button',
      button: 'back',
      isPressed: false,
    });
  });

  it('ignores a press on RETRY while nothing failed', () => {
    const harness = openLoaded();
    const renderCount = harness.views.length;

    harness.controller.pointerDown('retry');

    expect(harness.views).toHaveLength(renderCount);
  });

  it('retries with RETRY and releases its hover when it hides', async () => {
    const harness = createHarness(songs);
    harness.open({ kind: 'fresh' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await settle(harness.server.calls[0], 'reject');

    harness.controller.pointerOver('retry');
    harness.controller.pointerDown('retry');
    harness.controller.pointerUp('retry');
    expect(harness.server.calls).toHaveLength(2);

    await settle(harness.server.calls[1]);
    expect(harness.view.canRetry).toBe(false);
    expect(harness.view.hover).toBeNull();
  });
});
