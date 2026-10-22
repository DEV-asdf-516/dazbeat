import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import {
  INITIAL_CREDITS_STATE,
  getCreditRowCount,
  scrollCredits,
  withCreditSongs,
} from '../../../src/game/credits/creditsState.js';
import type { CreditsGrid } from '../../../src/game/credits/creditsState.js';

function makeSong(index: number, credit?: readonly string[]): Song {
  return {
    id: `song-${index}`,
    title: `Title ${index}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${index}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds: {},
    ...(credit === undefined ? {} : { credit }),
  };
}

const GRID: CreditsGrid = {
  columnCount: 2,
  visibleRowCount: 2,
};

function creditedSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, index) => makeSong(index, [`Artist ${index}`]));
}

describe('withCreditSongs', () => {
  it('adds only songs with credits', () => {
    const songs = [makeSong(0, ['A', 'B']), makeSong(1), makeSong(2, ['C'])];

    expect(withCreditSongs(INITIAL_CREDITS_STATE, songs).entries).toEqual([
      {
        title: 'Title 0',
        credit: ['A', 'B'],
      },
      {
        title: 'Title 2',
        credit: ['C'],
      },
    ]);
  });

  it('appends songs loaded later without reading earlier songs again', () => {
    const songs = creditedSongs(3);
    const first = withCreditSongs(INITIAL_CREDITS_STATE, songs.slice(0, 2));

    expect(withCreditSongs(first, songs).entries.map(({ title }) => title)).toEqual([
      'Title 0',
      'Title 1',
      'Title 2',
    ]);
  });

  it('returns the same state when no songs were added', () => {
    const state = withCreditSongs(INITIAL_CREDITS_STATE, creditedSongs(2));

    expect(withCreditSongs(state, creditedSongs(2))).toBe(state);
  });

  it('keeps the same entries when the new songs have no credits', () => {
    const state = withCreditSongs(INITIAL_CREDITS_STATE, creditedSongs(2));
    const next = withCreditSongs(state, [...creditedSongs(2), makeSong(2)]);

    expect(next.entries).toBe(state.entries);
    expect(next.readSongCount).toBe(3);
  });
});

describe('scrollCredits', () => {
  // 5개 항목은 2열로 3행이고, 2행이 보이므로 마지막 시작 행은 1이다.
  const state = withCreditSongs(INITIAL_CREDITS_STATE, creditedSongs(5));

  it('counts rows by the column count', () => {
    expect(getCreditRowCount(state, GRID)).toBe(3);
  });

  it('moves the top row by the given rows', () => {
    expect(scrollCredits(state, GRID, 1).topRow).toBe(1);
  });

  it('stops at the last row that still fills the grid', () => {
    expect(scrollCredits(state, GRID, 5).topRow).toBe(1);
  });

  it('returns the same state when already at an edge', () => {
    expect(scrollCredits(state, GRID, -1)).toBe(state);
    const bottom = scrollCredits(state, GRID, 1);
    expect(scrollCredits(bottom, GRID, 1)).toBe(bottom);
  });

  it('does not scroll when every row fits', () => {
    const fitting = withCreditSongs(INITIAL_CREDITS_STATE, creditedSongs(4));

    expect(scrollCredits(fitting, GRID, 1)).toBe(fitting);
  });
});
