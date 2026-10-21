import type { Song, SongQuery } from '../../data/songs.js';
import { clamp } from '../../range.js';
import type { SongFeedStatus } from '../SongFeed.js';
import { readMenuAction } from '../ui/menuInput.js';

const IME_PROCESS_KEY_CODE = 229;

export interface SongListState {
  readonly songCount: number;
  readonly visibleRowCount: number;
  readonly focusedIndex: number;
  readonly topIndex: number;
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
    case 'KeyQ':
      return {
        kind: 'cycleCategory',
        delta: -1,
      };
    case 'KeyE':
      return {
        kind: 'cycleCategory',
        delta: 1,
      };
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
