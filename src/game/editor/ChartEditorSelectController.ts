import { SONG_FILTERS } from '../../data/songs.js';
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
  isLoadMoreFailureOpen,
  moveSongListFocus,
  pressEditorSelectButton,
  readSongListCommand,
  releaseEditorSelectButton,
  releaseHiddenRetryHover,
  setLoadMoreFailureCancelled,
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

export interface ChartEditorSelectPorts {
  readonly feeds: SongFeeds;
  readonly now: () => number;
}

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
    private readonly ports: ChartEditorSelectPorts,
    private readonly screen: ChartEditorSelectScreen,
    private readonly frame: { readonly visibleRowCount: number; readonly rowHeightPx: number },
    entry: ChartEditorSelectSceneData,
  ) {
    const feed = entry.kind === 'fresh' ? ports.feeds.catalog : entry.list;
    this.current = this.attach(feed, entry.kind === 'fresh' ? null : entry.focusedSongId, null);
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.screen.showSearchText(current.feed.query.title);
    this.apply(current);
    if (isListEndVisible(current.list)) {
      void current.feed.requestMore();
    }
  }

  handleKey(key: SongListKey): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    const command = readSongListCommand(
      key,
      this.screen.isSearchFocused(),
      isLoadMoreFailureOpen(
        current.list,
        getSongListStatus(current.list.songCount, current.feed.status),
      ),
    );
    if (command === null) {
      return false;
    }
    let query: SongQuery;
    switch (command.kind) {
      case 'move': {
        const list = moveSongListFocus(current.list, command.delta);
        if (list !== current.list) {
          this.apply({
            ...current,
            list,
          });
          if (isListEndVisible(list)) {
            void current.feed.requestMore();
          }
        }
        return true;
      }
      case 'cycleCategory':
        query = {
          category: cycleItem(SONG_FILTERS, current.feed.query.category, command.direction),
          title: current.feed.query.title,
          level: null,
        };
        break;
      case 'search':
        query = {
          category: current.feed.query.category,
          title: this.screen.readSearchText().trim(),
          level: null,
        };
        break;
      case 'edit': {
        const song = getFocusedSong(current.list, current.feed.songs);
        if (song !== undefined) {
          this.screen.edit(song.id, current.feed);
        }
        return true;
      }
      case 'leave':
        this.screen.leave();
        return true;
      case 'retry': {
        if (!canRetry(current)) {
          return false;
        }
        void current.feed.requestMoreFromUser();
        // 요청이 곧바로 loading 으로 바뀌므로 그 뒤에 취소를 풀어야 팝업이 잠깐 다시 열리지 않는다.
        const loading = this.open;
        if (loading !== null) {
          const list = setLoadMoreFailureCancelled(loading.list, false);
          if (list !== loading.list) {
            this.apply({
              ...loading,
              list,
            });
          }
        }
        return true;
      }
      case 'cancelLoadMoreFailure': {
        const list = setLoadMoreFailureCancelled(current.list, true);
        if (list !== current.list) {
          this.apply({
            ...current,
            list,
          });
        }
        return true;
      }
      case 'focusSearch':
        this.screen.focusSearch();
        return true;
      case 'blurSearch':
        this.screen.blurSearch();
        return true;
    }
    if (isShallowEqual(query, current.feed.query)) {
      return true;
    }
    current.unsubscribe();
    const next = this.attach(this.ports.feeds.create(query), null, current.list.hover);
    this.apply(next);
    if (isListEndVisible(next.list)) {
      void next.feed.requestMore();
    }
    return true;
  }

  selectCategory(category: SongFilter): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const query: SongQuery = {
      category,
      title: current.feed.query.title,
      level: null,
    };
    if (isShallowEqual(query, current.feed.query)) {
      return;
    }
    current.unsubscribe();
    const next = this.attach(this.ports.feeds.create(query), null, current.list.hover);
    this.apply(next);
    if (isListEndVisible(next.list)) {
      void next.feed.requestMore();
    }
  }

  hoverRow(rowIndex: number): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = focusSongListRow(current.list, rowIndex);
    if (list === current.list) {
      return;
    }
    this.apply({
      ...current,
      list,
    });
    if (isListEndVisible(list)) {
      void current.feed.requestMore();
    }
  }

  pickRow(rowIndex: number): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = focusSongListRow(current.list, rowIndex);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
    }
    const song = getFocusedSong(list, current.feed.songs);
    if (song !== undefined) {
      this.screen.edit(song.id, current.feed);
    }
  }

  scrollByWheel(deltaYPx: number): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const read = readWheelRows(this.wheel, deltaYPx, this.ports.now(), this.frame.rowHeightPx);
    this.wheel = read.gesture;
    const list = scrollSongList(current.list, read.rows);
    if (list === current.list) {
      return;
    }
    this.apply({
      ...current,
      list,
    });
    if (isListEndVisible(list)) {
      void current.feed.requestMore();
    }
  }

  hoverFilter(category: SongFilter): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = hoverEditorSelectFilter(current.list, category);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
    }
  }

  unhoverFilter(category: SongFilter): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = unhoverEditorSelectFilter(current.list, category);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
    }
  }

  pointerOver(button: EditorSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = hoverEditorSelectButton(current.list, button);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
    }
  }

  pointerOut(button: EditorSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = unhoverEditorSelectButton(current.list, button);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
    }
  }

  pointerDown(button: EditorSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = pressEditorSelectButton(current.list, button);
    if (list !== current.list) {
      this.apply({
        ...current,
        list,
      });
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
    switch (button) {
      case 'back':
        this.apply({
          ...current,
          list: released,
        });
        this.screen.leave();
        return;
      case 'failureCancel':
        this.apply({
          ...current,
          list: setLoadMoreFailureCancelled(released, true),
        });
        return;
      case 'retry':
      case 'failureRetry': {
        if (!canRetry(current)) {
          this.apply({
            ...current,
            list: released,
          });
          return;
        }
        // 요청의 동기 알림이 handleFeedChange 로 다시 들어와 목록을 바꿀 수 있어 요청 뒤에 다시 읽는다.
        void current.feed.requestMoreFromUser();
        const loading = this.open;
        if (loading === null) {
          return;
        }
        // 요청이 곧바로 loading 으로 바뀌므로 그 뒤에 취소를 풀어야 팝업이 잠깐 다시 열리지 않는다.
        const list = setLoadMoreFailureCancelled(
          releaseEditorSelectButton(loading.list, button),
          false,
        );
        if (list !== loading.list) {
          this.apply({
            ...loading,
            list,
          });
        }
        return;
      }
    }
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

  private attach(
    feed: SongFeed,
    focusedSongId: string | null,
    hover: SongListState['hover'],
  ): SelectState {
    return {
      feed,
      list: createSongList(feed.songs, focusedSongId, this.frame.visibleRowCount, hover),
      unsubscribe: feed.subscribe(() => this.handleFeedChange()),
    };
  }

  private handleFeedChange(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const list = withSongCount(current.list, current.feed.songs.length);
    this.apply({
      ...current,
      list,
    });
    if (isListEndVisible(list)) {
      void current.feed.requestMore();
    }
  }

  private apply(next: SelectState): void {
    const isRetryable = canRetry(next);
    const list = releaseHiddenRetryHover(next.list, isRetryable);
    const { feed } = next;
    this.current = {
      ...next,
      list,
    };
    const status = getSongListStatus(list.songCount, feed.status);
    const view: ChartEditorSelectView = {
      category: feed.query.category,
      hover: list.hover,
      rows: getSongListRows(list, feed.songs),
      topIndex: list.topIndex,
      songCount: list.songCount,
      notice: getSongListNotice(list.songCount, feed.status, feed.query),
      status,
      canRetry: isRetryable,
      isLoadMoreFailureOpen: isLoadMoreFailureOpen(list, status),
    };
    this.screen.render(this.shownView, view);
    this.shownView = view;
  }
}

function canRetry(current: SelectState): boolean {
  return current.feed.status === 'failed';
}
