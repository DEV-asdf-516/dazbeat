import type { Difficulty, LaneCount } from '../rhythm/types.js';
import { requireDefined } from '../invariant.js';
import { clamp } from '../range.js';

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

export type ChartIds = Partial<Record<LaneCount, Partial<Record<Difficulty, string>>>>;

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
  chartIds: ChartIds;
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

export interface SongQuery {
  readonly category: SongFilter;
  /** 확정 검색어(앞뒤 공백 제거). */
  readonly title: string;
}

export const ALL_SONGS_QUERY: SongQuery = {
  category: 'all',
  title: '',
};

export interface SongBatchCursor {
  readonly releasedOn: string;
  /** 같은 게시일 곡의 순서를 정하는 PocketBase record id. Song.id(key) 가 아니다. */
  readonly recordId: string;
}

export interface SongBatch {
  readonly songs: readonly Song[];
  readonly next: SongBatchCursor | null;
  /** 첫 배치에서만 세는 조건에 맞는 전체 곡 수. 이어 받는 배치와, 숨긴 곡이 있을 수 있어 세지 않은 검색은 null. */
  readonly totalCount: number | null;
}

/**
 * 채보가 있음이 확인된 곡·난이도와 그 chart id. 채보 유무를 판단하는 곳(getAvailableCharts, 에디터 선택)에서만
 * 만들고, 받는 쪽은 chart id 를 다시 찾지 않는다.
 */
export interface ChartRef {
  readonly song: Song;
  readonly laneCount: LaneCount;
  readonly difficulty: Difficulty;
  readonly chartId: string;
}

/** 호출마다 새 값을 만드므로 비교는 difficulty 로 한다. */
export function getAvailableCharts(song: Song, laneCount: LaneCount): ChartRef[] {
  const chartIds = song.chartIds[laneCount] ?? {};
  return DIFFICULTIES.flatMap((difficulty) => {
    const chartId = chartIds[difficulty];
    return chartId === undefined
      ? []
      : [
          {
            song,
            laneCount,
            difficulty,
            chartId,
          },
        ];
  });
}

export function getAvailableDifficulties(song: Song, laneCount: LaneCount): Difficulty[] {
  return getAvailableCharts(song, laneCount).map((chart) => chart.difficulty);
}

export function findChart(
  song: Song,
  laneCount: LaneCount,
  difficulty: Difficulty,
): ChartRef | undefined {
  return getAvailableCharts(song, laneCount).find((chart) => chart.difficulty === difficulty);
}

export function stepChart(current: ChartRef, delta: number): ChartRef {
  const charts = getAvailableCharts(current.song, current.laneCount);
  if (charts.length === 0) {
    return current;
  }
  const index = charts.findIndex((chart) => chart.difficulty === current.difficulty);
  const next = charts[clamp(index + delta, 0, charts.length - 1)];
  return next === undefined || next.difficulty === current.difficulty ? current : next;
}

export function withSavedChart(
  songs: readonly Song[],
  songId: string,
  laneCount: LaneCount,
  difficulty: Difficulty,
  chartId: string,
): { songs: readonly Song[]; saved: Song } {
  const current = requireDefined(
    songs.find((listed) => listed.id === songId),
    'Saved chart song is not in the current song list',
    songId,
  );
  if (current.chartIds[laneCount]?.[difficulty] === chartId) {
    return {
      songs,
      saved: current,
    };
  }
  const saved: Song = {
    ...current,
    chartIds: {
      ...current.chartIds,
      [laneCount]: {
        ...current.chartIds[laneCount],
        [difficulty]: chartId,
      },
    },
  };
  return {
    songs: songs.map((listed) => (listed.id === songId ? saved : listed)),
    saved,
  };
}
