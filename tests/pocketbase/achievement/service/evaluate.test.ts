import { describe, expect, it } from 'vitest';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementMark,
  AchievementSet,
} from '../../../../src/data/achievements.js';
import type { Zodiac } from '../../../../src/data/songs.js';
import type { Difficulty, FinishedGameplayResult } from '../../../../src/rhythm/types.js';
import type {
  AchievementMarkRecord,
  AchievementSnapshot,
  PublishedSong,
} from '../../../../pocketbase/lib/achievement/dto.js';
import {
  evaluateAchievements,
  getPlayMarks,
} from '../../../../pocketbase/lib/achievement/service/evaluate.js';

const REMINDFUL_ONE = 'albumremindful1';
const NEMURANAI_YUME = 'albumnemuranai';

type Classification<D extends AchievementDefinition = AchievementDefinition> = D extends unknown
  ? [category: D['category'], rule: D['rule'], isRetired?: boolean]
  : never;

function definitionOf(
  id: AchievementId,
  set: AchievementSet,
  ...[category, rule, isRetired = false]: Classification
): AchievementDefinition {
  return category === 'album'
    ? {
        id,
        set,
        category,
        rule,
        isRetired,
      }
    : {
        id,
        set,
        category,
        rule,
        isRetired,
      };
}

// 서버가 achievements 컬렉션에서 읽는 정의 목록 대역. 순서는 sortOrder 순으로 읽힌 결과다.
const DEFINITIONS: readonly AchievementDefinition[] = [
  definitionOf('FIRST_CLEAR', 'rhythm', 'songClear', {
    kind: 'songs',
    mark: 'clear',
    target: 1,
  }),
  definitionOf('CLEAR_5_SONGS', 'rhythm', 'songClear', {
    kind: 'songs',
    mark: 'clear',
    target: 5,
  }),
  definitionOf('FIRST_FINISH', 'rhythm', 'play', {
    kind: 'plays',
    target: 1,
  }),
  definitionOf('PLAY_3', 'rhythm', 'play', {
    kind: 'plays',
    target: 3,
  }),
  definitionOf('PLAY_10', 'rhythm', 'play', {
    kind: 'plays',
    target: 10,
  }),
  definitionOf('S_5_CHARTS', 'rhythm', 'skill', {
    kind: 'charts',
    mark: 's',
    target: 5,
    difficulty: null,
  }),
  definitionOf('FC_5_CHARTS', 'rhythm', 'skill', {
    kind: 'charts',
    mark: 'fc',
    target: 5,
    difficulty: null,
  }),
  definitionOf('FIRST_AP', 'rhythm', 'skill', {
    kind: 'charts',
    mark: 'ap',
    target: 1,
    difficulty: null,
  }),
  definitionOf('EXPERT_CLEAR', 'rhythm', 'skill', {
    kind: 'charts',
    mark: 'clear',
    target: 1,
    difficulty: 'expert',
  }),
  definitionOf('EXPERT_5_CHARTS', 'rhythm', 'skill', {
    kind: 'charts',
    mark: 'clear',
    target: 5,
    difficulty: 'expert',
  }),
  definitionOf('ALL_DIFFICULTIES_CLEAR', 'rhythm', 'skill', {
    kind: 'songMarks',
    mark: 'clear',
    target: 1,
  }),
  definitionOf('SONG_ALL_CLEAR_3', 'rhythm', 'songMaster', {
    kind: 'songMarks',
    mark: 'clear',
    target: 3,
  }),
  ...(['aries', 'taurus', 'gemini', 'leo'] as const).map((zodiac) =>
    definitionOf(`ZODIAC_${zodiac.toUpperCase()}`, 'zodiac', 'zodiacComplete', {
      kind: 'zodiacComplete',
      mark: 'clear',
      zodiac,
    }),
  ),
  definitionOf('ZODIAC_ARIES_S', 'zodiac', 'zodiacAllS', {
    kind: 'zodiacComplete',
    mark: 's',
    zodiac: 'aries',
  }),
  ...(['aries', 'leo'] as const).map((zodiac) =>
    definitionOf(`ZODIAC_${zodiac.toUpperCase()}_FC`, 'zodiac', 'zodiacAllFullCombo', {
      kind: 'zodiacComplete',
      mark: 'fc',
      zodiac,
    }),
  ),
  definitionOf('ZODIAC_ARIES_AP', 'zodiac', 'zodiacAllPerfect', {
    kind: 'zodiacComplete',
    mark: 'ap',
    zodiac: 'aries',
  }),
  definitionOf('ZODIAC_1_COMPLETE', 'zodiac', 'zodiacStage', {
    kind: 'zodiacCompletions',
    target: 1,
  }),
  definitionOf('ZODIAC_3_COMPLETE', 'zodiac', 'zodiacStage', {
    kind: 'zodiacCompletions',
    target: 3,
  }),
  definitionOf('ZODIAC_VISIT_3', 'zodiac', 'zodiacPilgrimage', {
    kind: 'zodiacVisits',
    mark: 'clear',
    target: 3,
  }),
  definitionOf('ALBUM_REMINDFUL_ONE_CLEAR', 'discography', 'album', {
    kind: 'album',
    album: REMINDFUL_ONE,
    mark: 'clear',
  }),
  ...(['clear', 's', 'fc'] as const).map((mark) =>
    definitionOf(`ALBUM_NEMURANAI_YUME_${mark.toUpperCase()}`, 'discography', 'album', {
      kind: 'album',
      album: NEMURANAI_YUME,
      mark,
    }),
  ),
  definitionOf(
    'S_20_CHARTS',
    'rhythm',
    'precision',
    {
      kind: 'charts',
      mark: 's',
      target: 20,
      difficulty: null,
    },
    true,
  ),
  definitionOf(
    'SONG_ALL_S_1',
    'rhythm',
    'songMaster',
    {
      kind: 'songMarks',
      mark: 's',
      target: 1,
    },
    true,
  ),
];
const ACTIVE_IDS = DEFINITIONS.filter(({ isRetired }) => !isRetired).map(({ id }) => id);

interface PublishedChart {
  id: string;
  song: string;
  difficulty: Difficulty;
}

function chartOf(song: string, difficulty: Difficulty, laneSuffix = '4k'): PublishedChart {
  return {
    id: `${song}-${difficulty}-${laneSuffix}`,
    song,
    difficulty,
  };
}

function publishedSongsOf(
  songs: readonly { id: string; constellation: Zodiac; album?: string }[],
  charts: readonly PublishedChart[],
): PublishedSong[] {
  // 운영 공개 곡 목록은 채보와 JOIN 해 만들므로 채보 없는 곡은 들어가지 않는다.
  return songs.flatMap((song) => {
    const [first, ...rest] = new Set(
      charts.filter((chart) => chart.song === song.id).map((chart) => chart.difficulty),
    );
    return first === undefined
      ? []
      : [
          {
            id: song.id,
            constellation: song.constellation,
            album: song.album ?? null,
            difficulties: [first, ...rest],
          },
        ];
  });
}

/** 곡마다 easy 채보 하나. */
function simpleCharts(count: number): PublishedChart[] {
  return Array.from({ length: count }, (_, index) => chartOf(`song${index}`, 'easy'));
}

function simplePublishedSongs(count: number, constellation: Zodiac = 'aries'): PublishedSong[] {
  const charts = simpleCharts(count);
  return publishedSongsOf(
    charts.map((chart) => ({
      id: chart.song,
      constellation,
    })),
    charts,
  );
}

/** 곡마다 easy·hard 채보. */
function albumSongsOf(album: string, count: number) {
  const songs = Array.from({ length: count }, (_, index) => ({
    id: `${album}${index}`,
    album,
    constellation: 'leo' as const,
  }));
  return {
    songs,
    easyCharts: songs.map((song) => chartOf(song.id, 'easy')),
    hardCharts: songs.map((song) => chartOf(song.id, 'hard')),
  };
}

function markOf(
  kind: AchievementMark,
  chart: PublishedChart,
  overrides: Partial<AchievementMarkRecord> = {},
): AchievementMarkRecord {
  return {
    kind,
    song: chart.song,
    difficulty: chart.difficulty,
    isCurrent: true,
    constellation: 'aries',
    ...overrides,
  };
}

function snapshotOf(overrides: Partial<AchievementSnapshot> = {}): AchievementSnapshot {
  return {
    playCount: 0,
    marks: [],
    songMarks: [],
    earned: new Set(),
    publishedSongs: publishedSongsOf([], []),
    definitions: DEFINITIONS,
    ...overrides,
  };
}

function progressOf(snapshot: AchievementSnapshot, id: AchievementId) {
  return evaluateAchievements(snapshot).progress.find((progress) => progress.id === id);
}

function resultOf(overrides: Partial<FinishedGameplayResult> = {}): FinishedGameplayResult {
  return {
    outcome: 'finished',
    cleared: true,
    score: 900_000,
    accuracy: 0.9,
    maxCombo: 100,
    counts: {
      perfect: 80,
      great: 10,
      good: 5,
      bad: 3,
      miss: 2,
    },
    ...overrides,
  };
}

const PERFECT_COUNTS = {
  perfect: 100,
  great: 0,
  good: 0,
  bad: 0,
  miss: 0,
};

describe('getPlayMarks', () => {
  it('gives no mark to a finished play below clear', () => {
    expect(
      getPlayMarks(
        resultOf({
          cleared: false,
          accuracy: 0.5,
        }),
      ),
    ).toEqual([]);
  });

  it('gives only clear to a cleared play without S, FULL COMBO or ALL PERFECT', () => {
    expect(getPlayMarks(resultOf())).toEqual(['clear']);
  });

  it('does not grant FULL COMBO when a GOOD remains', () => {
    expect(
      getPlayMarks(
        resultOf({
          accuracy: 0.9,
          counts: {
            perfect: 99,
            great: 0,
            good: 1,
            bad: 0,
            miss: 0,
          },
        }),
      ),
    ).toEqual(['clear']);
  });

  it('judges S, FULL COMBO and ALL PERFECT independently', () => {
    expect(getPlayMarks(resultOf({ accuracy: 0.96 }))).toEqual(['clear', 's']);
    expect(
      getPlayMarks(
        resultOf({
          accuracy: 0.9,
          counts: {
            perfect: 60,
            great: 40,
            good: 0,
            bad: 0,
            miss: 0,
          },
        }),
      ),
    ).toEqual(['clear', 'fc']);
    expect(
      getPlayMarks(
        resultOf({
          accuracy: 1,
          counts: PERFECT_COUNTS,
        }),
      ),
    ).toEqual(['clear', 's', 'fc', 'ap']);
  });
});

describe('evaluateAchievements', () => {
  describe('rule boundaries', () => {
    it.each([
      [2, false],
      [3, true],
    ])('plays: PLAY_3 with %i plays earned=%s', (playCount, isEarned) => {
      const evaluation = evaluateAchievements(snapshotOf({ playCount }));
      expect(evaluation.newAchievements.includes('PLAY_3')).toBe(isEarned);
    });

    it.each([
      [4, false],
      [5, true],
    ])('songs: CLEAR_5_SONGS with %i songs earned=%s', (count, isEarned) => {
      const publishedSongs = simplePublishedSongs(count);
      const marks = simpleCharts(count).map((chart) => markOf('clear', chart));
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs,
          marks,
        }),
      );
      expect(evaluation.newAchievements.includes('CLEAR_5_SONGS')).toBe(isEarned);
    });

    it.each([
      [4, false],
      [5, true],
    ])('charts: S_5_CHARTS with %i charts earned=%s', (count, isEarned) => {
      const publishedSongs = simplePublishedSongs(count);
      const marks = simpleCharts(count).map((chart) => markOf('s', chart));
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs,
          marks,
        }),
      );
      expect(evaluation.newAchievements.includes('S_5_CHARTS')).toBe(isEarned);
    });

    it('charts with expert count only expert charts', () => {
      const charts = [chartOf('a', 'expert'), chartOf('b', 'hard'), chartOf('c', 'hard')];
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            ['a', 'b', 'c'].map((id) => ({
              id,
              constellation: 'aries' as const,
            })),
            charts,
          ),
          marks: charts.map((chart) => markOf('clear', chart)),
        }),
      );
      expect(evaluation.newAchievements).toContain('EXPERT_CLEAR');
      expect(evaluation.progress.find(({ id }) => id === 'EXPERT_5_CHARTS')).toEqual({
        id: 'EXPERT_5_CHARTS',
        current: 1,
        target: 5,
      });
    });

    it.each([
      [2, false],
      [3, true],
    ])('songMarks: SONG_ALL_CLEAR_3 with %i song marks earned=%s', (count, isEarned) => {
      const songMarks = Array.from({ length: count }, (_, index) => ({
        song: `song${index}`,
        kind: 'clear' as const,
      }));
      const evaluation = evaluateAchievements(snapshotOf({ songMarks }));
      expect(evaluation.newAchievements.includes('SONG_ALL_CLEAR_3')).toBe(isEarned);
    });

    it.each([
      [2, false],
      [3, true],
    ])('zodiacVisits: ZODIAC_VISIT_3 with %i zodiacs earned=%s', (count, isEarned) => {
      const zodiacs: Zodiac[] = ['aries', 'taurus', 'gemini'];
      const publishedSongs = simplePublishedSongs(count);
      const marks = simpleCharts(count).map((chart, index) =>
        markOf('clear', chart, { constellation: zodiacs[index] ?? null }),
      );
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs,
          marks,
        }),
      );
      expect(evaluation.newAchievements.includes('ZODIAC_VISIT_3')).toBe(isEarned);
    });

    it.each([
      [0, false],
      [1, true],
    ])('zodiacCompletions: ZODIAC_1_COMPLETE with %i crests earned=%s', (count, isEarned) => {
      const earned = new Set<AchievementId>(count === 0 ? [] : ['ZODIAC_LEO']);
      const evaluation = evaluateAchievements(snapshotOf({ earned }));
      expect(evaluation.newAchievements.includes('ZODIAC_1_COMPLETE')).toBe(isEarned);
    });
  });

  it('counts plays below clear only for play achievements', () => {
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 1,
        publishedSongs: simplePublishedSongs(1),
      }),
    );
    expect(evaluation.newAchievements).toEqual(['FIRST_FINISH']);
  });

  it('counts a chart as song and difficulty regardless of lane count and revision', () => {
    const fourKey = chartOf('a', 'hard', '4k');
    const sixKey = chartOf('a', 'hard', '6k');
    const evaluation = evaluateAchievements(
      snapshotOf({
        publishedSongs: publishedSongsOf(
          [
            {
              id: 'a',
              constellation: 'aries',
            },
          ],
          [fourKey, sixKey],
        ),
        marks: [
          markOf('fc', fourKey),
          markOf('fc', sixKey),
          markOf('fc', fourKey, { isCurrent: false }),
        ],
      }),
    );
    expect(evaluation.stats.fullComboChartCount).toBe(1);
    expect(evaluation.progress.find(({ id }) => id === 'FC_5_CHARTS')).toEqual({
      id: 'FC_5_CHARTS',
      current: 1,
      target: 5,
    });
  });

  it('caps the progress numerator at the target', () => {
    expect(progressOf(snapshotOf({ playCount: 12 }), 'PLAY_10')).toEqual({
      id: 'PLAY_10',
      current: 10,
      target: 10,
    });
  });

  it('does not count backfilled marks without a constellation for zodiac visits', () => {
    const publishedSongs = simplePublishedSongs(3);
    const marks = simpleCharts(3).map((chart) => markOf('clear', chart, { constellation: null }));
    const evaluation = evaluateAchievements(
      snapshotOf({
        publishedSongs,
        marks,
      }),
    );
    expect(evaluation.newAchievements).toContain('FIRST_CLEAR');
    expect(evaluation.progress.find(({ id }) => id === 'ZODIAC_VISIT_3')).toEqual({
      id: 'ZODIAC_VISIT_3',
      current: 0,
      target: 3,
    });
  });

  it('does not grant achievements already earned', () => {
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 3,
        earned: new Set<AchievementId>(['FIRST_FINISH']),
      }),
    );
    expect(evaluation.newAchievements).toEqual(['PLAY_3']);
  });

  describe('zodiac completion', () => {
    it('cannot complete a zodiac without target songs', () => {
      const evaluation = evaluateAchievements(
        snapshotOf({ publishedSongs: simplePublishedSongs(1, 'leo') }),
      );
      expect(evaluation.newAchievements).not.toContain('ZODIAC_ARIES');
      expect(evaluation.progress.find(({ id }) => id === 'ZODIAC_ARIES')).toEqual({
        id: 'ZODIAC_ARIES',
        current: 0,
        target: 0,
      });
    });

    it('does not count a song without charts as a target', () => {
      const chart = chartOf('a', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
              {
                id: 'empty',
                constellation: 'aries',
              },
            ],
            [chart],
          ),
          marks: [markOf('clear', chart)],
        }),
      );
      expect(evaluation.newAchievements).toContain('ZODIAC_ARIES');
    });

    it('completes with one difficulty per song and chains the zodiac stage', () => {
      const charts = [chartOf('a', 'easy'), chartOf('b', 'expert')];
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
              {
                id: 'b',
                constellation: 'aries',
              },
            ],
            charts,
          ),
          marks: charts.map((chart) => markOf('clear', chart)),
        }),
      );
      expect(evaluation.newAchievements).toEqual(
        expect.arrayContaining(['ZODIAC_ARIES', 'ZODIAC_1_COMPLETE']),
      );
      expect(evaluation.progress.find(({ id }) => id === 'ZODIAC_3_COMPLETE')).toEqual({
        id: 'ZODIAC_3_COMPLETE',
        current: 1,
        target: 3,
      });
    });

    it('lowers the current completion when a song is added but keeps the earned achievement', () => {
      const old = chartOf('a', 'easy');
      const added = chartOf('b', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
              {
                id: 'b',
                constellation: 'aries',
              },
            ],
            [old, added],
          ),
          marks: [markOf('s', old)],
          earned: new Set<AchievementId>(['ZODIAC_ARIES_S']),
        }),
      );
      expect(evaluation.newAchievements).not.toContain('ZODIAC_ARIES_S');
      expect(evaluation.progress.find(({ id }) => id === 'ZODIAC_ARIES_S')).toEqual({
        id: 'ZODIAC_ARIES_S',
        current: 1,
        target: 2,
      });
    });

    it('judges by the current constellation after a reassignment', () => {
      const chart = chartOf('a', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'leo',
              },
            ],
            [chart],
          ),
          marks: [markOf('fc', chart, { constellation: 'aries' })],
        }),
      );
      expect(evaluation.newAchievements).toContain('ZODIAC_LEO_FC');
      expect(evaluation.newAchievements).not.toContain('ZODIAC_ARIES_FC');
    });

    it('does not count a mark on an old revision', () => {
      const chart = chartOf('a', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [chart],
          ),
          marks: [markOf('ap', chart, { isCurrent: false })],
        }),
      );
      expect(evaluation.newAchievements).not.toContain('ZODIAC_ARIES_AP');
      expect(evaluation.newAchievements).toContain('FIRST_AP');
    });

    it('chains crests granted in the same evaluation into the zodiac stage', () => {
      const zodiacs: Zodiac[] = ['aries', 'taurus', 'gemini'];
      const songs = zodiacs.map((constellation) => ({
        id: constellation,
        constellation,
      }));
      const charts = songs.map((song) => chartOf(song.id, 'easy'));
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(songs, charts),
          marks: charts.map((chart) => markOf('clear', chart)),
          earned: new Set<AchievementId>(['ZODIAC_ARIES', 'ZODIAC_1_COMPLETE']),
        }),
      );
      expect(evaluation.newAchievements).toEqual(
        expect.arrayContaining(['ZODIAC_TAURUS', 'ZODIAC_GEMINI', 'ZODIAC_3_COMPLETE']),
      );
      expect(evaluation.newAchievements).not.toContain('ZODIAC_1_COMPLETE');
    });
  });

  describe('song marks', () => {
    it('marks a song with a single offered difficulty', () => {
      const chart = chartOf('a', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [chart],
          ),
          marks: [markOf('clear', chart)],
        }),
      );
      expect(evaluation.newSongMarks).toEqual([
        {
          song: 'a',
          kind: 'clear',
        },
      ]);
    });

    it('combines lane counts to cover every offered difficulty', () => {
      const easy = chartOf('a', 'easy', '4k');
      const hard = chartOf('a', 'hard', '6k');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [easy, hard],
          ),
          marks: [markOf('clear', easy), markOf('clear', hard)],
        }),
      );
      expect(evaluation.newSongMarks).toEqual([
        {
          song: 'a',
          kind: 'clear',
        },
      ]);
      expect(evaluation.newAchievements).toContain('ALL_DIFFICULTIES_CLEAR');
    });

    it('requires a current-revision mark on every offered difficulty', () => {
      const easy = chartOf('a', 'easy');
      const hard = chartOf('a', 'hard');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [easy, hard],
          ),
          marks: [markOf('clear', easy), markOf('clear', hard, { isCurrent: false })],
        }),
      );
      expect(evaluation.newSongMarks).toEqual([]);
    });

    it('keeps recorded song marks and does not record them again', () => {
      const easy = chartOf('a', 'easy');
      const hard = chartOf('a', 'hard');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [easy, hard],
          ),
          marks: [markOf('s', easy), markOf('s', hard)],
          songMarks: [
            {
              song: 'a',
              kind: 's',
            },
            {
              song: 'gone',
              kind: 'clear',
            },
          ],
        }),
      );
      expect(evaluation.newSongMarks).toEqual([]);
      expect(evaluation.newAchievements).toContain('ALL_DIFFICULTIES_CLEAR');
    });

    it('does not grant or report a retired achievement even when its condition is met', () => {
      const easy = chartOf('a', 'easy');
      const hard = chartOf('a', 'hard');
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [easy, hard],
          ),
          marks: [markOf('s', easy), markOf('s', hard)],
          earned: new Set<AchievementId>(['S_20_CHARTS']),
        }),
      );
      expect(evaluation.newSongMarks).toEqual([
        {
          song: 'a',
          kind: 's',
        },
      ]);
      const retiredIds = ['S_20_CHARTS', 'SONG_ALL_S_1'];
      expect(evaluation.newAchievements.filter((id) => retiredIds.includes(id))).toEqual([]);
      expect(evaluation.progress.filter(({ id }) => retiredIds.includes(id))).toEqual([]);
      expect(evaluation.newAchievements).toContain('ZODIAC_ARIES_S');
    });
  });

  describe('album', () => {
    it('stays unmet until the last target song is cleared', () => {
      const { songs, easyCharts } = albumSongsOf(REMINDFUL_ONE, 6);
      const publishedSongs = publishedSongsOf(songs, easyCharts);
      const missingLast = evaluateAchievements(
        snapshotOf({
          publishedSongs,
          marks: easyCharts.slice(0, -1).map((chart) => markOf('clear', chart)),
        }),
      );
      expect(missingLast.newAchievements).not.toContain('ALBUM_REMINDFUL_ONE_CLEAR');
      expect(missingLast.progress.find(({ id }) => id === 'ALBUM_REMINDFUL_ONE_CLEAR')).toEqual({
        id: 'ALBUM_REMINDFUL_ONE_CLEAR',
        current: songs.length - 1,
        target: songs.length,
      });
      const complete = evaluateAchievements(
        snapshotOf({
          publishedSongs,
          marks: easyCharts.map((chart) => markOf('clear', chart)),
        }),
      );
      expect(complete.newAchievements).toContain('ALBUM_REMINDFUL_ONE_CLEAR');
    });

    it('counts S and FULL COMBO from different difficulties of the same song', () => {
      const { songs, easyCharts, hardCharts } = albumSongsOf(NEMURANAI_YUME, 2);
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(songs, [...easyCharts, ...hardCharts]),
          marks: [
            ...easyCharts.map((chart) => markOf('s', chart)),
            ...hardCharts.map((chart) => markOf('fc', chart)),
          ],
        }),
      );
      expect(evaluation.newAchievements).toEqual(
        expect.arrayContaining(['ALBUM_NEMURANAI_YUME_S', 'ALBUM_NEMURANAI_YUME_FC']),
      );
      expect(evaluation.newAchievements).not.toContain('ALBUM_NEMURANAI_YUME_CLEAR');
    });

    it('does not count a target song with only an old revision mark', () => {
      const { songs, easyCharts } = albumSongsOf(NEMURANAI_YUME, 2);
      const snapshot = snapshotOf({
        publishedSongs: publishedSongsOf(songs, easyCharts),
        marks: easyCharts.map((chart, index) => markOf('clear', chart, { isCurrent: index !== 0 })),
      });
      expect(evaluateAchievements(snapshot).newAchievements).not.toContain(
        'ALBUM_NEMURANAI_YUME_CLEAR',
      );
      expect(progressOf(snapshot, 'ALBUM_NEMURANAI_YUME_CLEAR')).toEqual({
        id: 'ALBUM_NEMURANAI_YUME_CLEAR',
        current: 1,
        target: 2,
      });
    });

    it('counts only the published album songs that have charts', () => {
      const { songs, easyCharts } = albumSongsOf(NEMURANAI_YUME, 3);
      const snapshot = snapshotOf({
        publishedSongs: publishedSongsOf(songs.slice(1), easyCharts.slice(2)),
        marks: easyCharts.map((chart) => markOf('clear', chart)),
      });
      expect(evaluateAchievements(snapshot).newAchievements).toContain(
        'ALBUM_NEMURANAI_YUME_CLEAR',
      );
      expect(progressOf(snapshot, 'ALBUM_NEMURANAI_YUME_CLEAR')).toEqual({
        id: 'ALBUM_NEMURANAI_YUME_CLEAR',
        current: 1,
        target: 1,
      });
    });

    it('stays unmet while no song is assigned to the album', () => {
      const snapshot = snapshotOf();
      expect(evaluateAchievements(snapshot).newAchievements).not.toContain(
        'ALBUM_NEMURANAI_YUME_CLEAR',
      );
      expect(progressOf(snapshot, 'ALBUM_NEMURANAI_YUME_CLEAR')).toEqual({
        id: 'ALBUM_NEMURANAI_YUME_CLEAR',
        current: 0,
        target: 0,
      });
    });

    it('grants rhythm, zodiac and album achievements from the same marks', () => {
      const { songs, easyCharts } = albumSongsOf(NEMURANAI_YUME, 2);
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(songs, easyCharts),
          marks: easyCharts.map((chart) => markOf('clear', chart)),
        }),
      );
      expect(evaluation.newAchievements).toEqual([
        'FIRST_CLEAR',
        'ALL_DIFFICULTIES_CLEAR',
        'ZODIAC_LEO',
        'ZODIAC_1_COMPLETE',
        'ALBUM_NEMURANAI_YUME_CLEAR',
      ]);
    });

    it('does not grant an album achievement already earned', () => {
      const { songs, easyCharts } = albumSongsOf(NEMURANAI_YUME, 2);
      const evaluation = evaluateAchievements(
        snapshotOf({
          publishedSongs: publishedSongsOf(songs, easyCharts),
          marks: easyCharts.map((chart) => markOf('clear', chart)),
          earned: new Set<AchievementId>(['ALBUM_NEMURANAI_YUME_CLEAR']),
        }),
      );
      expect(evaluation.newAchievements).not.toContain('ALBUM_NEMURANAI_YUME_CLEAR');
    });
  });

  it('reports progress for every achievement and new achievements in catalog order', () => {
    const chart = chartOf('a', 'easy');
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 1,
        publishedSongs: publishedSongsOf(
          [
            {
              id: 'a',
              constellation: 'aries',
            },
          ],
          [chart],
        ),
        marks: [markOf('clear', chart)],
      }),
    );
    expect(evaluation.progress.map(({ id }) => id)).toEqual(ACTIVE_IDS);
    expect(evaluation.newAchievements).toEqual([
      'FIRST_CLEAR',
      'FIRST_FINISH',
      'ALL_DIFFICULTIES_CLEAR',
      'ZODIAC_ARIES',
      'ZODIAC_1_COMPLETE',
    ]);
  });

  it('follows the order of the given definitions', () => {
    const chart = chartOf('a', 'easy');
    const reversed = [...DEFINITIONS].reverse();
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 1,
        publishedSongs: publishedSongsOf(
          [
            {
              id: 'a',
              constellation: 'aries',
            },
          ],
          [chart],
        ),
        marks: [markOf('clear', chart)],
        definitions: reversed,
      }),
    );
    expect(evaluation.progress.map(({ id }) => id)).toEqual([...ACTIVE_IDS].reverse());
    expect(evaluation.newAchievements).toEqual([
      'ZODIAC_1_COMPLETE',
      'ZODIAC_ARIES',
      'ALL_DIFFICULTIES_CLEAR',
      'FIRST_FINISH',
      'FIRST_CLEAR',
    ]);
  });

  it('judges only the given definitions and ignores earned ids without a definition', () => {
    const snapshot = snapshotOf({
      playCount: 3,
      definitions: [
        definitionOf('PLAY_3', 'rhythm', 'play', {
          kind: 'plays',
          target: 3,
        }),
      ],
    });
    const withUnknown = snapshotOf({
      ...snapshot,
      earned: new Set<AchievementId>(['DELETED_ACHIEVEMENT']),
    });
    expect(evaluateAchievements(snapshot)).toEqual({
      newSongMarks: [],
      newAchievements: ['PLAY_3'],
      progress: [
        {
          id: 'PLAY_3',
          current: 3,
          target: 3,
        },
      ],
      stats: {
        playCount: 3,
        clearedSongCount: 0,
        sChartCount: 0,
        fullComboChartCount: 0,
        allPerfectChartCount: 0,
      },
    });
    expect(evaluateAchievements(withUnknown)).toEqual(evaluateAchievements(snapshot));
  });

  it('counts only active zodiac completions for the zodiac stage', () => {
    const chart = chartOf('a', 'easy');
    const evaluation = evaluateAchievements(
      snapshotOf({
        publishedSongs: publishedSongsOf(
          [
            {
              id: 'a',
              constellation: 'aries',
            },
          ],
          [chart],
        ),
        marks: [markOf('clear', chart)],
        definitions: [
          definitionOf(
            'ZODIAC_ARIES',
            'zodiac',
            'zodiacComplete',
            {
              kind: 'zodiacComplete',
              mark: 'clear',
              zodiac: 'aries',
            },
            true,
          ),
          definitionOf('ZODIAC_1_COMPLETE', 'zodiac', 'zodiacStage', {
            kind: 'zodiacCompletions',
            target: 1,
          }),
        ],
      }),
    );
    expect(evaluation.progress).toEqual([
      {
        id: 'ZODIAC_1_COMPLETE',
        current: 0,
        target: 1,
      },
    ]);
  });

  it('reports stats by distinct songs and charts', () => {
    const easy = chartOf('a', 'easy');
    const hard = chartOf('a', 'hard');
    const other = chartOf('b', 'easy');
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 7,
        publishedSongs: publishedSongsOf(
          [
            {
              id: 'a',
              constellation: 'aries',
            },
            {
              id: 'b',
              constellation: 'leo',
            },
          ],
          [easy, hard, other],
        ),
        marks: [
          markOf('clear', easy),
          markOf('clear', hard),
          markOf('clear', other),
          markOf('s', easy),
          markOf('s', easy, { isCurrent: false }),
          markOf('ap', hard),
        ],
      }),
    );
    expect(evaluation.stats).toEqual({
      playCount: 7,
      clearedSongCount: 2,
      sChartCount: 1,
      fullComboChartCount: 0,
      allPerfectChartCount: 1,
    });
  });
});
