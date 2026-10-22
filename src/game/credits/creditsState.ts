import type { Song } from '../../data/songs.js';
import { clamp } from '../../range.js';

export interface CreditEntry {
  readonly title: string;
  readonly credit: readonly string[];
}

export interface CreditsGrid {
  readonly columnCount: number;
  readonly visibleRowCount: number;
}

export interface CreditsState {
  readonly entries: readonly CreditEntry[];
  readonly readSongCount: number;
  readonly topRow: number;
}

export const INITIAL_CREDITS_STATE: CreditsState = {
  entries: [],
  readSongCount: 0,
  topRow: 0,
};

export function withCreditSongs(state: CreditsState, songs: readonly Song[]): CreditsState {
  if (songs.length === state.readSongCount) {
    return state;
  }
  const newEntries = songs.slice(state.readSongCount).flatMap((song) =>
    song.credit === undefined
      ? []
      : [
          {
            title: song.title,
            credit: song.credit,
          },
        ],
  );
  return {
    ...state,
    entries: newEntries.length === 0 ? state.entries : [...state.entries, ...newEntries],
    readSongCount: songs.length,
  };
}

export function getCreditRowCount(state: CreditsState, grid: CreditsGrid): number {
  return Math.ceil(state.entries.length / grid.columnCount);
}

export function scrollCredits(state: CreditsState, grid: CreditsGrid, rows: number): CreditsState {
  const maxTopRow = Math.max(0, getCreditRowCount(state, grid) - grid.visibleRowCount);
  const topRow = clamp(state.topRow + rows, 0, maxTopRow);
  if (topRow === state.topRow) {
    return state;
  }
  return {
    ...state,
    topRow,
  };
}
