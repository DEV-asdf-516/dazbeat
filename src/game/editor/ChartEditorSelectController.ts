import { ALL_SONGS_QUERY, SONG_FILTERS } from '../../data/songs.js';
import type { SongFilter, SongQuery } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import { isShallowEqual } from '../../shallowEqual.js';
import type { ChartEditorSelectSceneData } from '../app/sceneRoutes.js';
import type { SongFeed, SongFeeds } from '../app/SongFeed.js';
import { IDLE_WHEEL, readWheelRows } from '../ui/state/wheelRows.js';
import {
  createSongList,
  focusSongListRow,
  getFocusedSong,
  getSongListNotice,
  getSongListRows,
  getSongListStatus,
  hoverEditorSelectButton,
  hoverEditorSelectFilter,
  isListEndVisible,
  moveSongListFocus,
  pressEditorSelectButton,
  readSongListCommand,
  releaseEditorSelectButton,
  releaseHiddenRetryHover,
  scrollSongList,
  unhoverEditorSelectButton,
  unhoverEditorSelectFilter,
  withSongCount,
} from './state/songListState.js';
import type {
  ChartEditorSelectView,
  EditorSelectButton,
  SongListKey,
  SongListState,
} from './state/songListState.js';

export interface ChartEditorSelectScreen {
  render(previous: ChartEditorSelectView | null, next: ChartEditorSelectView): void;
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

// 닫힌 뒤에는 입력과 늦은 결과를 받지 않는다.
type ControllerState = SelectState | { readonly kind: 'closed' };

export class ChartEditorSelectController {
  private current: ControllerState;
  private wheel = IDLE_WHEEL;
  private shownView: ChartEditorSelectView | null = null;

  constructor(
    private readonly feeds: SongFeeds,
    private readonly screen: ChartEditorSelectScreen,
    private readonly visibleRowCount: number,
    entry: ChartEditorSelectSceneData,
    private readonly rowHeightPx: number,
  ) {
    const feed = entry.kind === 'fresh' ? feeds.catalog : entry.list;
    const first = this.attach(feed, entry.kind === 'fresh' ? null : entry.focusedSongId, null);
    this.current = first;
    screen.showSearchText(feed.query.title);
    this.render(first);
    this.requestMoreAtListEnd();
  }

  handleKey(key: SongListKey): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    const command = readSongListCommand(key, this.screen.isSearchFocused());
    if (command === null) {
      return false;
    }
    switch (command.kind) {
      case 'move':
        this.setListFromUser(moveSongListFocus(current.list, command.delta));
        return true;
      case 'cycleCategory':
        this.selectCategory(cycleItem(SONG_FILTERS, current.feed.query.category, command.delta));
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
          category: current.feed.query.category,
          title: this.screen.readSearchText().trim(),
        });
        return true;
      case 'blurSearch':
        this.screen.blurSearch();
        return true;
    }
  }

  selectCategory(category: SongFilter): void {
    const current = this.open;
    if (current !== null) {
      this.switchQuery({
        category,
        title: current.feed.query.title,
      });
    }
  }

  hoverRow(rowIndex: number): void {
    const current = this.open;
    if (current !== null) {
      this.setListFromUser(focusSongListRow(current.list, rowIndex));
    }
  }

  pickRow(rowIndex: number): void {
    const current = this.open;
    if (current !== null) {
      this.setList(focusSongListRow(current.list, rowIndex));
      this.editFocused();
    }
  }

  scroll(deltaRows: number): void {
    const current = this.open;
    if (current !== null) {
      this.setListFromUser(scrollSongList(current.list, deltaRows));
    }
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    if (this.open === null) {
      return;
    }
    const read = readWheelRows(this.wheel, deltaYPx, atMs, this.rowHeightPx);
    this.wheel = read.gesture;
    this.scroll(read.rows);
  }

  hoverFilter(category: SongFilter): void {
    const current = this.open;
    if (current !== null) {
      this.setList(hoverEditorSelectFilter(current.list, category));
    }
  }

  unhoverFilter(category: SongFilter): void {
    const current = this.open;
    if (current !== null) {
      this.setList(unhoverEditorSelectFilter(current.list, category));
    }
  }

  pointerOver(button: EditorSelectButton): void {
    const current = this.open;
    if (current !== null) {
      this.setList(hoverEditorSelectButton(current.list, button));
    }
  }

  pointerOut(button: EditorSelectButton): void {
    const current = this.open;
    if (current !== null) {
      this.setList(unhoverEditorSelectButton(current.list, button));
    }
  }

  pointerDown(button: EditorSelectButton): void {
    const current = this.open;
    if (current !== null) {
      this.setList(pressEditorSelectButton(current.list, button, canRetry(current)));
    }
  }

  pointerUp(button: EditorSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const released = releaseEditorSelectButton(current.list, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 hover 가 바뀐다.
    if (released === current.list) {
      return;
    }
    this.setList(released);
    switch (button) {
      case 'back':
        this.screen.leave();
        return;
      case 'retry':
        this.retry();
        return;
    }
  }

  retry(): boolean {
    const current = this.open;
    if (current === null || !canRetry(current)) {
      return false;
    }
    void current.feed.requestMoreFromUser();
    return true;
  }

  close(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    current.unsubscribe();
    this.current = { kind: 'closed' };
  }

  private get open(): SelectState | null {
    return 'kind' in this.current ? null : this.current;
  }

  private switchQuery(query: SongQuery): void {
    const current = this.open;
    if (current === null || isShallowEqual(query, current.feed.query)) {
      return;
    }
    current.unsubscribe();
    this.commit(
      this.attach(
        isShallowEqual(query, ALL_SONGS_QUERY) ? this.feeds.catalog : this.feeds.create(query),
        null,
        current.list.hover,
      ),
    );
    this.requestMoreAtListEnd();
  }

  private attach(
    feed: SongFeed,
    focusedSongId: string | null,
    hover: SongListState['hover'],
  ): SelectState {
    return {
      feed,
      list: createSongList(feed.songs, focusedSongId, this.visibleRowCount, hover),
      unsubscribe: feed.subscribe(() => this.handleFeedChange()),
    };
  }

  private handleFeedChange(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.commit({
      ...current,
      list: withSongCount(current.list, current.feed.songs.length),
    });
    this.requestMoreAtListEnd();
  }

  private setListFromUser(next: SongListState): void {
    if (this.open === null || next === this.open.list) {
      return;
    }
    this.setList(next);
    this.requestMoreAtListEnd();
  }

  private setList(list: SongListState): void {
    const current = this.open;
    if (current === null || list === current.list) {
      return;
    }
    this.commit({
      ...current,
      list,
    });
  }

  private commit(next: SelectState): void {
    const released = {
      ...next,
      list: releaseHiddenRetryHover(next.list, canRetry(next)),
    };
    this.current = released;
    this.render(released);
  }

  private requestMoreAtListEnd(): void {
    const current = this.open;
    if (current !== null && isListEndVisible(current.list)) {
      void current.feed.requestMore();
    }
  }

  private editFocused(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const song = getFocusedSong(current.list, current.feed.songs);
    if (song !== undefined) {
      this.screen.edit(song.id, current.feed);
    }
  }

  private render(current: SelectState): void {
    const { feed, list } = current;
    const next: ChartEditorSelectView = {
      category: feed.query.category,
      hover: list.hover,
      rows: getSongListRows(list, feed.songs),
      topIndex: list.topIndex,
      songCount: list.songCount,
      notice: getSongListNotice(list.songCount, feed.status, feed.query),
      status: getSongListStatus(list.songCount, feed.status),
      canRetry: canRetry(current),
    };
    this.screen.render(this.shownView, next);
    this.shownView = next;
  }
}

function canRetry(current: SelectState): boolean {
  return current.feed.status === 'failed';
}
