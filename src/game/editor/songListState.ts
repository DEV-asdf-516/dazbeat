import { SONG_FILTERS, filterSongs } from '../../data/songs.js';
import type { Song, SongFilter } from '../../data/songs.js';
import { clamp, cycleItem } from '../range.js';

/** 채보 편집 곡 목록의 키보드·pointer 포커스와 보이는 범위. */
export interface SongListState {
  /** 보이는 곡의 카테고리. index 는 모두 이 카테고리로 거른 목록 기준이다. */
  readonly filter: SongFilter;
  /** 화면을 열 때의 곡 수. 범위 계산은 이 값으로 하고, 표시할 곡은 그때의 목록에서 읽는다. */
  readonly songCount: number;
  readonly visibleRowCount: number;
  /** Enter 가 고르는 곡 index */
  readonly focusedIndex: number;
  /** 맨 윗줄에 보이는 곡 index */
  readonly topIndex: number;
}

export interface SongListRow {
  /** 보이는 줄 번호. pointer 입력은 이 번호로 들어온다. */
  readonly rowIndex: number;
  readonly song: Song;
  readonly isFocused: boolean;
}

/**
 * songs 를 filter 로 거른 목록을 연다. focusedSongId 의 곡(그 카테고리에 없으면 첫 곡)에 포커스를 두고,
 * 그 곡이 보이는 범위의 가운데쯤 오게 한다.
 */
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

/** 끝에서 멈춘다. 포커스가 보이는 범위를 벗어나면 벗어난 만큼만 넘긴다. */
export function moveSongListFocus(list: SongListState, delta: number): SongListState {
  if (list.songCount === 0) {
    return list;
  }
  const focusedIndex = clamp(list.focusedIndex + delta, 0, list.songCount - 1);
  if (focusedIndex === list.focusedIndex) {
    return list;
  }
  const topIndex = clamp(list.topIndex, focusedIndex - list.visibleRowCount + 1, focusedIndex);
  return { ...list, focusedIndex, topIndex };
}

/** pointer 가 올라간 줄로 포커스를 옮긴다. 곡이 없는 빈 줄이면 그대로다. */
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
  return { ...list, focusedIndex };
}

/** 보이는 범위를 줄 단위로 넘긴다. 포커스는 보이는 범위 안으로 따라온다. */
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
  return { ...list, topIndex, focusedIndex };
}

/** 휠 한 번에 최소 한 줄은 넘기고, 큰 delta 는 줄 높이만큼씩 넘긴다. */
export function toWheelRows(deltaYPx: number, rowHeightPx: number): number {
  if (deltaYPx === 0) {
    return 0;
  }
  const rows = Math.round(deltaYPx / rowHeightPx);
  return rows === 0 ? Math.sign(deltaYPx) : rows;
}

/** 보이는 범위의 곡 줄. 화면을 연 뒤 목록이 줄었으면 없는 곡의 줄은 빠진다. */
export function getSongListRows(list: SongListState, allSongs: readonly Song[]): SongListRow[] {
  const songs = filterSongs(allSongs, list.filter);
  const rows: SongListRow[] = [];
  const endIndex = Math.min(list.topIndex + list.visibleRowCount, list.songCount);
  for (let index = list.topIndex; index < endIndex; index += 1) {
    const song = songs[index];
    if (song === undefined) {
      break;
    }
    rows.push({ rowIndex: index - list.topIndex, song, isFocused: index === list.focusedIndex });
  }
  return rows;
}

/** Enter 가 고르는 곡. 화면을 연 뒤 목록이 줄어 그 자리에 곡이 없으면 없다. */
export function getFocusedSong(list: SongListState, allSongs: readonly Song[]): Song | undefined {
  return filterSongs(allSongs, list.filter)[list.focusedIndex];
}

/** 카테고리를 바꾼다. 포커스한 곡이 새 카테고리에도 있으면 그 곡을 유지하고, 없으면 첫 곡이다. */
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

/** Q/E 로 카테고리를 돌아가며 고른다. */
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
