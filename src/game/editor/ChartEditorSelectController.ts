import { ALL_SONGS_QUERY, SONG_FILTERS } from '../../data/songs.js';
import type { SongFilter, SongQuery } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { ChartEditorSelectSceneData } from '../sceneRoutes.js';
import type { SongFeed, SongFeeds } from '../SongFeed.js';
import {
  createSongList,
  focusSongListRow,
  getFocusedSong,
  getSongListNotice,
  getSongListRows,
  getSongListStatus,
  isListEndVisible,
  moveSongListFocus,
  readSongListCommand,
  scrollSongList,
  withSongCount,
} from './songListState.js';
import type {
  SongListKey,
  SongListNotice,
  SongListRow,
  SongListState,
  SongListStatus,
} from './songListState.js';

export interface ChartEditorSelectView {
  readonly category: SongFilter;
  readonly rows: readonly SongListRow[];
  readonly topIndex: number;
  readonly songCount: number;
  readonly notice: SongListNotice | null;
  readonly status: SongListStatus | null;
  readonly canRetry: boolean;
}

export interface ChartEditorSelectScreen {
  render(view: ChartEditorSelectView): void;
  edit(songId: string, list: SongFeed): void;
  leave(): void;
  isSearchFocused(): boolean;
  readSearchText(): string;
  showSearchText(title: string): void;
  focusSearch(): void;
  blurSearch(): void;
}

interface SelectState {
  readonly feed: SongFeed;
  readonly list: SongListState;
  readonly unsubscribe: () => void;
}

function isSameQuery(a: SongQuery, b: SongQuery): boolean {
  return a.category === b.category && a.title === b.title;
}

export class ChartEditorSelectController {
  private current: SelectState;

  constructor(
    private readonly feeds: SongFeeds,
    private readonly screen: ChartEditorSelectScreen,
    private readonly visibleRowCount: number,
    entry: ChartEditorSelectSceneData,
  ) {
    const feed = entry.kind === 'fresh' ? feeds.catalog : entry.list;
    this.current = this.attach(feed, entry.kind === 'fresh' ? null : entry.focusedSongId);
    screen.showSearchText(feed.query.title);
    this.render();
    this.requestMoreAtListEnd();
  }

  handleKey(key: SongListKey): boolean {
    const command = readSongListCommand(key, this.screen.isSearchFocused());
    if (command === null) {
      return false;
    }
    switch (command.kind) {
      case 'move':
        this.setListFromUser(moveSongListFocus(this.current.list, command.delta));
        return true;
      case 'cycleCategory':
        this.selectCategory(
          cycleItem(SONG_FILTERS, this.current.feed.query.category, command.delta),
        );
        return true;
      case 'edit':
        this.editFocused();
        return true;
      case 'leave':
        this.screen.leave();
        return true;
      case 'retry':
        return this.retry();
      case 'focusSearch':
        this.screen.focusSearch();
        return true;
      case 'search':
        this.switchQuery({
          category: this.current.feed.query.category,
          title: this.screen.readSearchText().trim(),
        });
        return true;
      case 'blurSearch':
        this.screen.blurSearch();
        return true;
    }
  }

  selectCategory(category: SongFilter): void {
    this.switchQuery({
      category,
      title: this.current.feed.query.title,
    });
  }

  hoverRow(rowIndex: number): void {
    this.setListFromUser(focusSongListRow(this.current.list, rowIndex));
  }

  pickRow(rowIndex: number): void {
    this.setList(focusSongListRow(this.current.list, rowIndex));
    this.editFocused();
  }

  scroll(deltaRows: number): void {
    this.setListFromUser(scrollSongList(this.current.list, deltaRows));
  }

  retry(): boolean {
    if (this.current.feed.status !== 'failed') {
      return false;
    }
    void this.current.feed.requestMoreFromUser();
    return true;
  }

  close(): void {
    this.current.unsubscribe();
  }

  private switchQuery(query: SongQuery): void {
    if (isSameQuery(query, this.current.feed.query)) {
      return;
    }
    this.current.unsubscribe();
    this.current = this.attach(
      isSameQuery(query, ALL_SONGS_QUERY) ? this.feeds.catalog : this.feeds.create(query),
      null,
    );
    this.render();
    this.requestMoreAtListEnd();
  }

  private attach(feed: SongFeed, focusedSongId: string | null): SelectState {
    return {
      feed,
      list: createSongList(feed.songs, focusedSongId, this.visibleRowCount),
      unsubscribe: feed.subscribe(() => this.handleFeedChange()),
    };
  }

  private handleFeedChange(): void {
    const { feed } = this.current;
    this.current = {
      ...this.current,
      list: withSongCount(this.current.list, feed.songs.length),
    };
    this.render();
    this.requestMoreAtListEnd();
  }

  private setListFromUser(next: SongListState): void {
    if (next === this.current.list) {
      return;
    }
    this.setList(next);
    this.requestMoreAtListEnd();
  }

  private setList(next: SongListState): void {
    if (next === this.current.list) {
      return;
    }
    this.current = {
      ...this.current,
      list: next,
    };
    this.render();
  }

  private requestMoreAtListEnd(): void {
    if (isListEndVisible(this.current.list)) {
      void this.current.feed.requestMore();
    }
  }

  private editFocused(): void {
    const song = getFocusedSong(this.current.list, this.current.feed.songs);
    if (song !== undefined) {
      this.screen.edit(song.id, this.current.feed);
    }
  }

  private render(): void {
    const { feed, list } = this.current;
    this.screen.render({
      category: feed.query.category,
      rows: getSongListRows(list, feed.songs),
      topIndex: list.topIndex,
      songCount: list.songCount,
      notice: getSongListNotice(list.songCount, feed.status, feed.query),
      status: getSongListStatus(list.songCount, feed.status),
      canRetry: feed.status === 'failed',
    });
  }
}
