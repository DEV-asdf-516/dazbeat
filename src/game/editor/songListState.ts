import { SONG_FILTERS, filterSongs } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import { clamp, cycleItem } from '../../range.js';

export interface SongListState {
  readonly filter: SongFilter;
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

export function createSongList(
  songs: readonly Song[],
  focusedSongId: string | null,
  visibleRowCount: number,
  filter: SongFilter,
): SongListState {
  const filtered = filterSongs(songs, filter);
  const focusedIndex = Math.max(
    filtered.findIndex((song) => song.id === focusedSongId),
    0,
  );
  return {
    filter,
    songCount: filtered.length,
    visibleRowCount,
    focusedIndex,
    topIndex: clamp(
      focusedIndex - Math.floor(visibleRowCount / 2),
      0,
      getMaxTopIndex(filtered.length, visibleRowCount),
    ),
  };
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

export function toWheelRows(deltaYPx: number, rowHeightPx: number): number {
  if (deltaYPx === 0) {
    return 0;
  }
  const rows = Math.round(deltaYPx / rowHeightPx);
  return rows === 0 ? Math.sign(deltaYPx) : rows;
}

export function getSongListRows(list: SongListState, allSongs: readonly Song[]): SongListRow[] {
  const songs = filterSongs(allSongs, list.filter);
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

export function getFocusedSong(list: SongListState, allSongs: readonly Song[]): Song | undefined {
  return filterSongs(allSongs, list.filter)[list.focusedIndex];
}

export function selectSongListFilter(
  list: SongListState,
  allSongs: readonly Song[],
  filter: SongFilter,
): SongListState {
  if (filter === list.filter) {
    return list;
  }
  return createSongList(
    allSongs,
    getFocusedSong(list, allSongs)?.id ?? null,
    list.visibleRowCount,
    filter,
  );
}

export function cycleSongListFilter(
  list: SongListState,
  allSongs: readonly Song[],
  delta: 1 | -1,
): SongListState {
  return selectSongListFilter(list, allSongs, cycleItem(SONG_FILTERS, list.filter, delta));
}

function getMaxTopIndex(songCount: number, visibleRowCount: number): number {
  return Math.max(songCount - visibleRowCount, 0);
}
