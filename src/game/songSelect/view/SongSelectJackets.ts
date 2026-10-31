import type { Song } from '../../../data/songs.js';
import type { JacketRange } from '../state/songSelectState.js';

export interface JacketTextures {
  loadedSongIds(): readonly string[];
  queue(songs: readonly Song[], onError: (song: Song) => void): void;
  start(): void;
  remove(songIds: readonly string[]): void;
}

type Lifecycle =
  | { readonly kind: 'unranged' }
  | { readonly kind: 'idle'; readonly range: JacketRange }
  | { readonly kind: 'loading'; readonly range: JacketRange }
  | { readonly kind: 'closed' };

function isSameSongs(next: readonly Song[], previous: readonly Song[]): boolean {
  return next.length === previous.length && next.every((song, index) => song === previous[index]);
}

export class SongSelectJackets {
  private state: Lifecycle = { kind: 'unranged' };
  private readonly failedSongIds = new Set<string>();

  constructor(private readonly textures: JacketTextures) {}

  preload(range: JacketRange): void {
    const songs = this.findUnready(range.visible);
    if (songs.length > 0) {
      this.textures.queue(songs, this.recordFailure);
    }
  }

  show(range: JacketRange, inUse: readonly string[]): void {
    const state = this.state;
    if (state.kind === 'closed') {
      return;
    }
    if (
      state.kind !== 'unranged' &&
      isSameSongs(range.visible, state.range.visible) &&
      isSameSongs(range.adjacent, state.range.adjacent)
    ) {
      return;
    }
    this.removeOutside(range, inUse);
    if (state.kind === 'loading') {
      this.state = {
        kind: 'loading',
        range,
      };
      return;
    }
    this.state = {
      kind: 'idle',
      range,
    };
    this.startNextBatch(range);
  }

  complete(inUse: readonly string[]): void {
    const state = this.state;
    if (state.kind === 'closed' || state.kind === 'unranged') {
      return;
    }
    this.state = {
      kind: 'idle',
      range: state.range,
    };
    this.removeOutside(state.range, inUse);
    this.startNextBatch(state.range);
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  private readonly recordFailure = (song: Song): void => {
    if (this.state.kind !== 'closed') {
      this.failedSongIds.add(song.id);
    }
  };

  private findUnready(songs: readonly Song[]): Song[] {
    const loaded = new Set(this.textures.loadedSongIds());
    return songs.filter((song) => !loaded.has(song.id) && !this.failedSongIds.has(song.id));
  }

  private removeOutside(range: JacketRange, inUse: readonly string[]): void {
    const keep = new Set([
      ...[...range.visible, ...range.adjacent].map((song) => song.id),
      ...inUse,
    ]);
    const songIds = this.textures.loadedSongIds().filter((songId) => !keep.has(songId));
    if (songIds.length > 0) {
      this.textures.remove(songIds);
    }
  }

  private startNextBatch(range: JacketRange): void {
    const visible = this.findUnready(range.visible);
    const batch = visible.length > 0 ? visible : this.findUnready(range.adjacent);
    if (batch.length === 0) {
      return;
    }
    this.state = {
      kind: 'loading',
      range,
    };
    this.textures.queue(batch, this.recordFailure);
    this.textures.start();
  }
}
