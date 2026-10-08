import type { Difficulty } from '../rhythm/types.js';

export type SongCategory = 'original' | 'cover';
export type SongFilter = 'all' | SongCategory;
export type Zodiac =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export interface Song {
  id: string;
  title: string;
  category: SongCategory;
  youtubeVideoId: string;
  jacketUrl: string;
  accentColor: number;
  constellation: Zodiac;
  gameStartMs: number;
  gameEndMs: number;
  chartIds: Partial<Record<Difficulty, string>>;
  visualTheme?: string;
  credit?: readonly string[];
}

export const SONG_CATEGORIES: readonly SongCategory[] = ['original', 'cover'];
export const SONG_FILTERS: readonly SongFilter[] = ['all', ...SONG_CATEGORIES];
export const ZODIACS: readonly Zodiac[] = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

export function filterSongs(songs: readonly Song[], filter: SongFilter): Song[] {
  if (filter === 'all') {
    return [...songs];
  }
  return songs.filter((song) => song.category === filter);
}

export function getAvailableDifficulties(song: Song): Difficulty[] {
  return DIFFICULTIES.filter((difficulty) => song.chartIds[difficulty] !== undefined);
}

/** 저장으로 그 난이도의 chart id 가 정해진 곡. 이미 같은 id 면 입력 곡을 그대로 돌려준다. */
export function withChartId(song: Song, difficulty: Difficulty, chartId: string): Song {
  if (song.chartIds[difficulty] === chartId) {
    return song;
  }
  return { ...song, chartIds: { ...song.chartIds, [difficulty]: chartId } };
}
