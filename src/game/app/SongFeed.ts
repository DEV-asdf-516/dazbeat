import { ALL_SONGS_QUERY, withSavedChart } from '../data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongCategory, SongQuery } from '../data/songs.js';
import type { Difficulty, LaneCount } from '../rhythm/types.js';

export type SongBatchLoader = (
  query: SongQuery,
  after: SongBatchCursor | null,
) => Promise<SongBatch>;

// after 의 null 은 처음부터 받는다는 뜻이다.
type FeedProgress =
  | { readonly kind: 'hasMore'; readonly after: SongBatchCursor | null }
  | {
      readonly kind: 'loading';
      readonly after: SongBatchCursor | null;
      readonly request: Promise<void>;
    }
  | { readonly kind: 'failed'; readonly after: SongBatchCursor | null }
  | { readonly kind: 'complete' };

export type SongFeedStatus = FeedProgress['kind'];

export class SongFeed {
  private loaded: readonly Song[];
  private totalCount: number;
  private progress: FeedProgress;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly query: SongQuery,
    private readonly loadBatch: SongBatchLoader,
    first?: SongBatch,
  ) {
    this.loaded = first?.songs ?? [];
    this.totalCount = first?.totalCount ?? 0;
    this.progress =
      first === undefined
        ? {
            kind: 'hasMore',
            after: null,
          }
        : toProgress(first.next);
  }

  get songs(): readonly Song[] {
    return this.loaded;
  }

  get songCount(): number {
    return this.progress.kind === 'complete'
      ? this.loaded.length
      : Math.max(this.totalCount, this.loaded.length);
  }

  get status(): SongFeedStatus {
    return this.progress.kind;
  }

  async requestMore(): Promise<void> {
    if (this.progress.kind === 'failed') {
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
    } while (this.progress.kind === 'hasMore' || this.progress.kind === 'loading');
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
    switch (this.progress.kind) {
      case 'complete':
        return;
      case 'loading':
        return this.progress.request;
      case 'hasMore':
      case 'failed': {
        const { after } = this.progress;
        const request = this.loadNext(after);
        this.progress = {
          kind: 'loading',
          after,
          request,
        };
        this.notify();
        return request;
      }
    }
  }

  private async loadNext(after: SongBatchCursor | null): Promise<void> {
    try {
      const batch = await this.loadBatch(this.query, after);
      if (batch.songs.length > 0) {
        this.loaded = [...this.loaded, ...batch.songs];
      }
      if (batch.totalCount !== null) {
        this.totalCount = batch.totalCount;
      }
      this.progress = toProgress(batch.next);
    } catch (error) {
      console.warn('Failed to load song batch', error);
      this.progress = {
        kind: 'failed',
        after,
      };
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

function toProgress(next: SongBatchCursor | null): FeedProgress {
  return next === null
    ? { kind: 'complete' }
    : {
        kind: 'hasMore',
        after: next,
      };
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
