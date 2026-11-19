import type { Difficulty, LaneCount } from '../rhythm/types.js';
import { requireDefined } from '../invariant.js';
import { clamp, DIRECTION_STEPS } from '../range.js';
import type { ListDirection } from '../range.js';
import { isShallowEqual } from '../shallowEqual.js';

export type SongCategory = 'original' | 'cover';
export type SongFilter = 'all' | SongCategory;
export type SongScope = 'published' | 'all';
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

export type ChartLevel = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export interface ChartLevelRange {
  readonly min: ChartLevel;
  readonly max: ChartLevel;
}

export interface SongLevelQuery extends ChartLevelRange {
  readonly laneCount: LaneCount;
}

export interface SongChart {
  readonly id: string;
  readonly level: ChartLevel;
}

export type SongCharts = Partial<Record<LaneCount, Partial<Record<Difficulty, SongChart>>>>;

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
  charts: SongCharts;
  previewStartMs?: number;
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
export const CHART_LEVELS: readonly ChartLevel[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
export const FULL_CHART_LEVEL_RANGE: ChartLevelRange = {
  min: 1,
  max: 5,
};

export interface SongQuery {
  readonly category: SongFilter;
  /** 확정 검색어(앞뒤 공백 제거). */
  readonly title: string;
  readonly level: SongLevelQuery | null;
}

export const ALL_SONGS_QUERY: SongQuery = {
  category: 'all',
  title: '',
  level: null,
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
  readonly level: ChartLevel;
}

/** 호출마다 새 값을 만드므로 비교는 difficulty 로 한다. */
export function getAvailableCharts(song: Song, laneCount: LaneCount): ChartRef[] {
  const charts = song.charts[laneCount] ?? {};
  return DIFFICULTIES.flatMap((difficulty) => {
    const chart = charts[difficulty];
    return chart === undefined
      ? []
      : [
          {
            song,
            laneCount,
            difficulty,
            chartId: chart.id,
            level: chart.level,
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

export function stepChart(current: ChartRef, direction: ListDirection): ChartRef {
  const charts = getAvailableCharts(current.song, current.laneCount);
  const index = charts.findIndex((chart) => chart.difficulty === current.difficulty);
  const next = charts[clamp(index + DIRECTION_STEPS[direction], 0, charts.length - 1)];
  return next === undefined || next.difficulty === current.difficulty ? current : next;
}

export function withSavedChart(
  songs: readonly Song[],
  songId: string,
  laneCount: LaneCount,
  difficulty: Difficulty,
  chart: SongChart,
): { songs: readonly Song[]; saved: Song } {
  const current = requireDefined(
    songs.find((listed) => listed.id === songId),
    'Saved chart song is not in the current song list',
    songId,
  );
  const listed = current.charts[laneCount]?.[difficulty];
  if (listed !== undefined && isShallowEqual(listed, chart)) {
    return {
      songs,
      saved: current,
    };
  }
  const saved: Song = {
    ...current,
    charts: {
      ...current.charts,
      [laneCount]: {
        ...current.charts[laneCount],
        [difficulty]: chart,
      },
    },
  };
  return {
    songs: songs.map((listed) => (listed.id === songId ? saved : listed)),
    saved,
  };
}
