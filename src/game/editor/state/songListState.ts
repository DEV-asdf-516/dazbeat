import type { Song, SongFilter, SongQuery } from '../../../data/songs.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { clamp } from '../../../range.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import type { ScrollBarScroll } from '../../ui/state/scrollBarScroll.js';
import type { SongFeedStatus } from '../../app/SongFeed.js';
import { readMenuAction } from '../../ui/state/menuAction.js';

const IME_PROCESS_KEY_CODE = 229;

export interface SongListState {
  readonly songCount: number;
  readonly visibleRowCount: number;
  readonly focusedIndex: number;
  readonly topIndex: number;
  readonly hover: ChartEditorSelectHover | null;
}

export interface SongListRow {
  readonly rowIndex: number;
  readonly song: Song;
  readonly isFocused: boolean;
}

export type SongListNotice =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loadFailed' }
  | { readonly kind: 'noSongs' }
  | { readonly kind: 'emptyCategory' }
  | { readonly kind: 'noMatch'; readonly title: string };

export type SongListStatus = 'loadingMore' | 'loadMoreFailed';

export type EditorSelectButton = 'back' | 'retry';

export type ChartEditorSelectHover =
  { readonly kind: 'filter'; readonly category: SongFilter } | ButtonHover<EditorSelectButton>;

export interface ChartEditorSelectView {
  readonly category: SongFilter;
  readonly hover: ChartEditorSelectHover | null;
  readonly rows: readonly SongListRow[];
  readonly topIndex: number;
  readonly songCount: number;
  readonly notice: SongListNotice | null;
  readonly status: SongListStatus | null;
  readonly canRetry: boolean;
}

export type SongListCommand =
  | { readonly kind: 'move'; readonly delta: 1 | -1 }
  | { readonly kind: 'cycleCategory'; readonly delta: 1 | -1 }
  | { readonly kind: 'edit' }
  | { readonly kind: 'leave' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'focusSearch' }
  | { readonly kind: 'search' }
  | { readonly kind: 'blurSearch' };

export function createSongList(
  songs: readonly Song[],
  focusedSongId: string | null,
  visibleRowCount: number,
  hover: ChartEditorSelectHover | null,
): SongListState {
  const focusedIndex = Math.max(
    songs.findIndex((song) => song.id === focusedSongId),
    0,
  );
  return {
    songCount: songs.length,
    visibleRowCount,
    focusedIndex,
    topIndex: clamp(
      focusedIndex - Math.floor(visibleRowCount / 2),
      0,
      getMaxTopIndex(songs.length, visibleRowCount),
    ),
    hover,
  };
}

export function withSongCount(list: SongListState, songCount: number): SongListState {
  if (songCount === list.songCount) {
    return list;
  }
  return {
    ...list,
    songCount,
  };
}

export function isListEndVisible(list: SongListState): boolean {
  return list.topIndex + list.visibleRowCount >= list.songCount;
}

export function moveSongListFocus(list: SongListState, delta: number): SongListState {
  if (list.songCount === 0) {
    return list;
  }
  const focusedIndex = clamp(list.focusedIndex + delta, 0, list.songCount - 1);
  if (focusedIndex === list.focusedIndex) {
    return list;
  }
  const topIndex = clamp(list.topIndex, focusedIndex - list.visibleRowCount + 1, focusedIndex);
  return {
    ...list,
    focusedIndex,
    topIndex,
  };
}

export function focusSongListRow(list: SongListState, rowIndex: number): SongListState {
  const focusedIndex = list.topIndex + rowIndex;
  if (
    rowIndex < 0 ||
    rowIndex >= list.visibleRowCount ||
    focusedIndex >= list.songCount ||
    focusedIndex === list.focusedIndex
  ) {
    return list;
  }
  return {
    ...list,
    focusedIndex,
  };
}

export function scrollSongList(list: SongListState, deltaRows: number): SongListState {
  const topIndex = clamp(
    list.topIndex + deltaRows,
    0,
    getMaxTopIndex(list.songCount, list.visibleRowCount),
  );
  if (topIndex === list.topIndex) {
    return list;
  }
  const focusedIndex = clamp(list.focusedIndex, topIndex, topIndex + list.visibleRowCount - 1);
  return {
    ...list,
    topIndex,
    focusedIndex,
  };
}

export function getSongListRows(list: SongListState, songs: readonly Song[]): SongListRow[] {
  const rows: SongListRow[] = [];
  const endIndex = Math.min(list.topIndex + list.visibleRowCount, list.songCount);
  for (let index = list.topIndex; index < endIndex; index += 1) {
    const song = songs[index];
    if (song === undefined) {
      break;
    }
    rows.push({
      rowIndex: index - list.topIndex,
      song,
      isFocused: index === list.focusedIndex,
    });
  }
  return rows;
}

export function getFocusedSong(list: SongListState, songs: readonly Song[]): Song | undefined {
  return songs[list.focusedIndex];
}

export function getSongListNotice(
  songCount: number,
  status: SongFeedStatus,
  query: SongQuery,
): SongListNotice | null {
  if (songCount > 0) {
    return null;
  }
  switch (status) {
    case 'hasMore':
    case 'loading':
      return { kind: 'loading' };
    case 'failed':
      return { kind: 'loadFailed' };
    case 'complete':
      if (query.title !== '') {
        return {
          kind: 'noMatch',
          title: query.title,
        };
      }
      return query.category === 'all' ? { kind: 'noSongs' } : { kind: 'emptyCategory' };
  }
}

export function getSongListStatus(
  songCount: number,
  status: SongFeedStatus,
): SongListStatus | null {
  if (songCount === 0) {
    return null;
  }
  switch (status) {
    case 'loading':
      return 'loadingMore';
    case 'failed':
      return 'loadMoreFailed';
    case 'hasMore':
    case 'complete':
      return null;
  }
}

export type SongListKey = Pick<KeyboardEvent, 'code' | 'repeat' | 'isComposing' | 'keyCode'>;

export function readSongListCommand(
  key: SongListKey,
  isSearchFocused: boolean,
): SongListCommand | null {
  if (isSearchFocused) {
    return readSearchCommand(key);
  }
  switch (key.code) {
    case 'Slash':
      return { kind: 'focusSearch' };
    case 'KeyR':
      return { kind: 'retry' };
  }
  switch (readMenuAction(key)) {
    case 'up':
      return {
        kind: 'move',
        delta: -1,
      };
    case 'down':
      return {
        kind: 'move',
        delta: 1,
      };
    case 'confirm':
      return { kind: 'edit' };
    case 'back':
      return { kind: 'leave' };
    case 'previousTab':
      return {
        kind: 'cycleCategory',
        delta: -1,
      };
    case 'nextTab':
      return {
        kind: 'cycleCategory',
        delta: 1,
      };
    case 'left':
    case 'right':
    case null:
      return null;
  }
}

/** 검색창 포커스 중에는 글자가 입력창에 들어가야 하므로 목록 단축키를 쓰지 않는다. */
function readSearchCommand(key: SongListKey): SongListCommand | null {
  switch (key.code) {
    case 'Enter':
      // Chrome 은 조합 중 keydown 에 isComposing 을, Safari 는 조합을 확정하는 Enter 를 keyCode 229 로 보낸다.
      return key.isComposing || key.keyCode === IME_PROCESS_KEY_CODE ? null : { kind: 'search' };
    case 'Escape':
      return { kind: 'blurSearch' };
    default:
      return null;
  }
}

function getMaxTopIndex(songCount: number, visibleRowCount: number): number {
  return Math.max(songCount - visibleRowCount, 0);
}

export function getNoticeKind(notice: SongListNotice): 'loading' | 'text' {
  return notice.kind === 'loading' ? 'loading' : 'text';
}

/**
 * 곡 수는 받아 둔 곡 수라, 보이는 행이 곡 수보다 적은 것이 곧 보이는 칸보다 곡이 많은 것이고,
 * 그때 보이는 행 수가 곧 보이는 칸 수다.
 */
export function getListFrame(view: ChartEditorSelectView): {
  readonly hasRows: boolean;
  readonly scroll: ScrollBarScroll;
} {
  const { rows, songCount, topIndex } = view;
  return {
    hasRows: rows.length > 0,
    scroll:
      rows.length < songCount
        ? {
            kind: 'thumb',
            firstIndex: topIndex,
            visibleCount: rows.length,
            totalCount: songCount,
          }
        : { kind: 'hidden' },
  };
}

export function getFocusedRowIndex(view: ChartEditorSelectView): number | null {
  return view.rows.find((row) => row.isFocused)?.rowIndex ?? null;
}

export function getHoveredFilter(view: ChartEditorSelectView): SongFilter | null {
  return view.hover?.kind === 'filter' ? view.hover.category : null;
}

function withHover(list: SongListState, hover: ChartEditorSelectHover | null): SongListState {
  return hover === list.hover
    ? list
    : {
        ...list,
        hover,
      };
}

function isFilterHovered(list: SongListState, category: SongFilter): boolean {
  return list.hover?.kind === 'filter' && list.hover.category === category;
}

export function hoverEditorSelectFilter(list: SongListState, category: SongFilter): SongListState {
  return isFilterHovered(list, category)
    ? list
    : withHover(list, {
        kind: 'filter',
        category,
      });
}

export function unhoverEditorSelectFilter(
  list: SongListState,
  category: SongFilter,
): SongListState {
  return isFilterHovered(list, category) ? withHover(list, null) : list;
}

export function hoverEditorSelectButton(
  list: SongListState,
  button: EditorSelectButton,
): SongListState {
  return withHover(list, hoverButton(list.hover, button));
}

export function unhoverEditorSelectButton(
  list: SongListState,
  button: EditorSelectButton,
): SongListState {
  return withHover(list, unhoverButton(list.hover, button));
}

export function pressEditorSelectButton(
  list: SongListState,
  button: EditorSelectButton,
  canRetry: boolean,
): SongListState {
  return withHover(
    list,
    pressButton(list.hover, button, isEditorSelectButtonEnabled(button, canRetry)),
  );
}

export function releaseEditorSelectButton(
  list: SongListState,
  button: EditorSelectButton,
): SongListState {
  return withHover(list, releaseButton(list.hover, button));
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 RETRY 가 숨을 때 그 hover 를 푼다.
export function releaseHiddenRetryHover(list: SongListState, canRetry: boolean): SongListState {
  return canRetry ? list : withHover(list, unhoverButton(list.hover, 'retry'));
}

export function isEditorSelectButtonEnabled(
  button: EditorSelectButton,
  canRetry: boolean,
): boolean {
  return button === 'back' || canRetry;
}

export function getEditorSelectButtonView(
  view: ChartEditorSelectView,
  button: EditorSelectButton,
): ButtonView {
  return getButtonView(
    view.hover,
    button,
    isEditorSelectButtonEnabled(button, view.canRetry),
    false,
  );
}

export function getFilterMotion(previous: ChartEditorSelectView | null): 'snap' | 'slide' {
  return previous === null ? 'snap' : 'slide';
}

export type EditorSelectRegion =
  | 'filterIndicator'
  | 'filterSegments'
  | 'listRows'
  | 'listFocus'
  | 'listFrame'
  | 'notice'
  | 'status'
  | 'backButton'
  | 'retryButton';

type SelectReader = StateReader<ChartEditorSelectView>;

const readCategory: SelectReader = (view) => view.category;
const readHoveredFilter: SelectReader = (view) => getHoveredFilter(view);
const readFocusedRowIndex: SelectReader = (view) => getFocusedRowIndex(view);
const readRowCount: SelectReader = (view) => view.rows.length;
const readTopIndex: SelectReader = (view) => view.topIndex;
const readSongCount: SelectReader = (view) => view.songCount;
const readNoticeKind: SelectReader = (view) => view.notice?.kind;
const readNoticeTitle: SelectReader = (view) =>
  view.notice?.kind === 'noMatch' ? view.notice.title : null;
const readStatus: SelectReader = (view) => view.status;
const readCanRetry: SelectReader = (view) => view.canRetry;
const readBackHovered: SelectReader = (view) => isButtonHovered(view.hover, 'back');
const readBackPressed: SelectReader = (view) => isButtonPressed(view.hover, 'back');
const readRetryHovered: SelectReader = (view) => isButtonHovered(view.hover, 'retry');
const readRetryPressed: SelectReader = (view) => isButtonPressed(view.hover, 'retry');

const REGION_SOURCES: Readonly<
  Record<Exclude<EditorSelectRegion, 'listRows'>, readonly SelectReader[]>
> = {
  filterIndicator: [readCategory],
  filterSegments: [readCategory, readHoveredFilter],
  listFocus: [readFocusedRowIndex],
  // 행 유무와 스크롤 여부는 행 수와 곡 수에서 정해진다.
  listFrame: [readRowCount, readTopIndex, readSongCount],
  notice: [readNoticeKind, readNoticeTitle],
  status: [readStatus],
  backButton: [readBackHovered, readBackPressed],
  retryButton: [readCanRetry, readRetryHovered, readRetryPressed],
};

// 행 view 는 그릴 때마다 새로 만들어지므로 행 영역은 곡이 바뀐 행이 있는지로 고른다.
export function getChangedRegions(
  previous: ChartEditorSelectView | null,
  next: ChartEditorSelectView,
): readonly EditorSelectRegion[] {
  const regions: EditorSelectRegion[] = [...filterChangedRegions(REGION_SOURCES, previous, next)];
  return getChangedRowIndexes(previous, next).length > 0 ? [...regions, 'listRows'] : regions;
}

export function getChangedRowIndexes(
  previous: ChartEditorSelectView | null,
  next: ChartEditorSelectView,
): readonly number[] {
  if (previous === null) {
    return next.rows.map(({ rowIndex }) => rowIndex);
  }
  const rowCount = Math.max(previous.rows.length, next.rows.length);
  return Array.from({ length: rowCount }, (_, rowIndex) => rowIndex).filter(
    (rowIndex) => previous.rows[rowIndex]?.song !== next.rows[rowIndex]?.song,
  );
}
