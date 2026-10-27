import { ALL_SONGS_QUERY, withSavedChart } from '../data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongCategory, SongQuery } from '../data/songs.js';
import type { Difficulty, LaneCount } from '../rhythm/types.js';

export type SongFeedStatus = 'hasMore' | 'loading' | 'failed' | 'complete';
export type SongBatchLoader = (
  query: SongQuery,
  after: SongBatchCursor | null,
) => Promise<SongBatch>;

export class SongFeed {
  private loaded: readonly Song[];
  private cursor: SongBatchCursor | null;
  private totalCount: number;
  private current: SongFeedStatus;
  private request: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly query: SongQuery,
    private readonly loadBatch: SongBatchLoader,
    first?: SongBatch,
  ) {
    this.loaded = first?.songs ?? [];
    this.cursor = first?.next ?? null;
    this.totalCount = first?.totalCount ?? 0;
    this.current = first !== undefined && first.next === null ? 'complete' : 'hasMore';
  }

  get songs(): readonly Song[] {
    return this.loaded;
  }

  get songCount(): number {
    return this.current === 'complete'
      ? this.loaded.length
      : Math.max(this.totalCount, this.loaded.length);
  }

  get status(): SongFeedStatus {
    return this.current;
  }

  async requestMore(): Promise<void> {
    if (this.current === 'failed') {
      return;
    }
    return this.requestNext();
  }

  // 실패 뒤 다시 받기는 사용자 입력으로만 일어나야 실패 알림이 요청을 부르는 루프가 생기지 않는다.
  async requestMoreFromUser(): Promise<void> {
    return this.requestNext();
  }

  async requestRemaining(): Promise<void> {
    do {
      await this.requestNext();
    } while (this.current === 'hasMore' || this.current === 'loading');
  }

  applySavedChart(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    chartId: string,
  ): Song | undefined {
    if (!this.loaded.some((song) => song.id === songId)) {
      return undefined;
    }
    const { songs, saved } = withSavedChart(this.loaded, songId, laneCount, difficulty, chartId);
    if (songs !== this.loaded) {
      this.loaded = songs;
      this.notify();
    }
    return saved;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async requestNext(): Promise<void> {
    if (this.current === 'complete') {
      return;
    }
    if (this.request === null) {
      this.current = 'loading';
      this.request = this.loadNext();
      this.notify();
    }
    return this.request;
  }

  private async loadNext(): Promise<void> {
    try {
      const batch = await this.loadBatch(this.query, this.cursor);
      if (batch.songs.length > 0) {
        this.loaded = [...this.loaded, ...batch.songs];
      }
      this.cursor = batch.next;
      if (batch.totalCount !== null) {
        this.totalCount = batch.totalCount;
      }
      this.current = batch.next === null ? 'complete' : 'hasMore';
    } catch (error) {
      console.warn('Failed to load song batch', error);
      this.current = 'failed';
    } finally {
      this.request = null;
      this.notify();
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export interface SongFeeds {
  readonly catalog: SongFeed;
  create(query: SongQuery): SongFeed;
}

// 카테고리 목록은 몇 개뿐이라 앱이 켜져 있는 동안 두고 탭을 오가도 다시 받지 않는다. 제목 검색은 검색어마다 달라 매번 새로 받는다.
export class SharedSongFeeds implements SongFeeds {
  readonly catalog: SongFeed;
  private readonly categories = new Map<SongCategory, SongFeed>();

  constructor(
    private readonly loadBatch: SongBatchLoader,
    first: SongBatch,
  ) {
    this.catalog = new SongFeed(ALL_SONGS_QUERY, loadBatch, first);
  }

  create(query: SongQuery): SongFeed {
    if (query.title !== '') {
      return new SongFeed(query, this.loadBatch);
    }
    if (query.category === 'all') {
      return this.catalog;
    }
    const cached = this.categories.get(query.category);
    if (cached !== undefined) {
      return cached;
    }
    const feed = new SongFeed(query, this.loadBatch);
    this.categories.set(query.category, feed);
    return feed;
  }

  // 저장한 채보가 어느 탭으로 돌아가도 보이도록 받아 둔 목록 모두에 반영한다.
  applySavedChart(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    chartId: string,
  ): void {
    [this.catalog, ...this.categories.values()].forEach((feed) => {
      feed.applySavedChart(songId, laneCount, difficulty, chartId);
    });
  }
}
