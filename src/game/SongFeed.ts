import { withSavedChart } from '../data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongQuery } from '../data/songs.js';
import type { Difficulty } from '../rhythm/types.js';

export type SongFeedStatus = 'hasMore' | 'loading' | 'failed' | 'complete';
export type SongBatchLoader = (
  query: SongQuery,
  after: SongBatchCursor | null,
) => Promise<SongBatch>;

export class SongFeed {
  private loaded: readonly Song[];
  private cursor: SongBatchCursor | null;
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
    this.current = first !== undefined && first.next === null ? 'complete' : 'hasMore';
  }

  get songs(): readonly Song[] {
    return this.loaded;
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

  applySavedChart(songId: string, difficulty: Difficulty, chartId: string): Song | undefined {
    if (!this.loaded.some((song) => song.id === songId)) {
      return undefined;
    }
    const { songs, saved } = withSavedChart(this.loaded, songId, difficulty, chartId);
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
