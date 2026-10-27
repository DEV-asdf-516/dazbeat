import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  type AchievementId,
  type AchievementMark,
  findAchievement,
} from '../../src/data/achievements.js';
import type { Zodiac } from '../../src/data/songs.js';
import type { Difficulty, FinishedGameplayResult } from '../../src/rhythm/types.js';
import {
  type AchievementCatalogSnapshot,
  type AchievementMarkRecord,
  type AchievementSnapshot,
  evaluateAchievements,
  getPlayMarks,
} from '../../pocketbase/verification/achievements.js';

interface CatalogChart {
  id: string;
  song: string;
  difficulty: Difficulty;
}

function chartOf(song: string, difficulty: Difficulty, laneSuffix = '4k'): CatalogChart {
  return {
    id: `${song}-${difficulty}-${laneSuffix}`,
    song,
    difficulty,
  };
}

function catalogOf(
  songs: readonly { id: string; constellation: Zodiac }[],
  charts: readonly CatalogChart[],
): AchievementCatalogSnapshot {
  return {
    songs: songs.map((song) => ({
      ...song,
      difficulties: [
        ...new Set(
          charts.filter((chart) => chart.song === song.id).map((chart) => chart.difficulty),
        ),
      ],
    })),
  };
}

/** 곡마다 easy 채보 하나. */
function simpleCharts(count: number): CatalogChart[] {
  return Array.from({ length: count }, (_, index) => chartOf(`song${index}`, 'easy'));
}

function simpleCatalog(count: number, constellation: Zodiac = 'aries'): AchievementCatalogSnapshot {
  const charts = simpleCharts(count);
  return catalogOf(
    charts.map((chart) => ({
      id: chart.song,
      constellation,
    })),
    charts,
  );
}

function markOf(
  kind: AchievementMark,
  chart: CatalogChart,
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
    masteries: [],
    earned: new Set(),
    catalog: catalogOf([], []),
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

describe('achievement catalog', () => {
  it('has 117 unique ids in the same order as the definitions', () => {
    expect(ACHIEVEMENT_IDS).toHaveLength(117);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(117);
    expect(ACHIEVEMENTS.map(({ id }) => id)).toEqual(ACHIEVEMENT_IDS);
  });

  it('splits the sets and categories by the agreed counts', () => {
    const countBy = (key: 'set' | 'category') =>
      ACHIEVEMENTS.reduce<Record<string, number>>((counts, achievement) => {
        counts[achievement[key]] = (counts[achievement[key]] ?? 0) + 1;
        return counts;
      }, {});
    expect(countBy('set')).toEqual({
      starlightOrigin: 40,
      starJourney: 41,
      zodiacAscension: 24,
      zodiacPerfection: 12,
    });
    expect(countBy('category')).toEqual({
      songClear: 5,
      play: 7,
      skill: 12,
      zodiacComplete: 12,
      zodiacStage: 4,
      chartPioneer: 4,
      expert: 10,
      precision: 7,
      songMaster: 8,
      zodiacPilgrimage: 12,
      zodiacAllS: 12,
      zodiacAllFullCombo: 12,
      zodiacAllPerfect: 12,
    });
  });

  it.each([
    'CHART_CLEAR_5',
    'CHART_CLEAR_15',
    'CHART_CLEAR_30',
    'COMBO_500',
    'COMBO_1000',
    'PLAY_25',
  ])('excludes %s', (id) => {
    expect(findAchievement(id)).toBeUndefined();
  });

  it('has no special achievement group', () => {
    expect(ACHIEVEMENT_IDS.filter((id) => id.startsWith('F_') || id.includes('COMBO_'))).toEqual(
      [],
    );
  });
});

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
      const catalog = simpleCatalog(count);
      const marks = simpleCharts(count).map((chart) => markOf('clear', chart));
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog,
          marks,
        }),
      );
      expect(evaluation.newAchievements.includes('CLEAR_5_SONGS')).toBe(isEarned);
    });

    it.each([
      [4, false],
      [5, true],
    ])('charts: S_5_CHARTS with %i charts earned=%s', (count, isEarned) => {
      const catalog = simpleCatalog(count);
      const marks = simpleCharts(count).map((chart) => markOf('s', chart));
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog,
          marks,
        }),
      );
      expect(evaluation.newAchievements.includes('S_5_CHARTS')).toBe(isEarned);
    });

    it('charts with expert count only expert charts', () => {
      const charts = [chartOf('a', 'expert'), chartOf('b', 'hard'), chartOf('c', 'hard')];
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog: catalogOf(
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
    ])('masteries: SONG_ALL_CLEAR_3 with %i mastered songs earned=%s', (count, isEarned) => {
      const masteries = Array.from({ length: count }, (_, index) => ({
        song: `song${index}`,
        kind: 'clear' as const,
      }));
      const evaluation = evaluateAchievements(snapshotOf({ masteries }));
      expect(evaluation.newAchievements.includes('SONG_ALL_CLEAR_3')).toBe(isEarned);
    });

    it.each([
      [2, false],
      [3, true],
    ])('zodiacVisits: ZODIAC_VISIT_3 with %i zodiacs earned=%s', (count, isEarned) => {
      const zodiacs: Zodiac[] = ['aries', 'taurus', 'gemini'];
      const catalog = simpleCatalog(count);
      const marks = simpleCharts(count).map((chart, index) =>
        markOf('clear', chart, { constellation: zodiacs[index] ?? null }),
      );
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog,
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
        catalog: simpleCatalog(1),
      }),
    );
    expect(evaluation.newAchievements).toEqual(['FIRST_FINISH']);
  });

  it('counts a chart as song and difficulty regardless of lane count and revision', () => {
    const fourKey = chartOf('a', 'hard', '4k');
    const sixKey = chartOf('a', 'hard', '6k');
    const evaluation = evaluateAchievements(
      snapshotOf({
        catalog: catalogOf(
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
    const catalog = simpleCatalog(3);
    const marks = simpleCharts(3).map((chart) => markOf('clear', chart, { constellation: null }));
    const evaluation = evaluateAchievements(
      snapshotOf({
        catalog,
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
      const evaluation = evaluateAchievements(snapshotOf({ catalog: simpleCatalog(1, 'leo') }));
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
          catalog: catalogOf(
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
          catalog: catalogOf(
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
          catalog: catalogOf(
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
          catalog: catalogOf(
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
          catalog: catalogOf(
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
          catalog: catalogOf(songs, charts),
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

  describe('song mastery', () => {
    it('does not master a song with fewer than two offered difficulties', () => {
      const chart = chartOf('a', 'easy');
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog: catalogOf(
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
      expect(evaluation.newMasteries).toEqual([]);
      expect(evaluation.newAchievements).not.toContain('ALL_DIFFICULTIES_CLEAR');
    });

    it('combines lane counts to cover every offered difficulty', () => {
      const easy = chartOf('a', 'easy', '4k');
      const hard = chartOf('a', 'hard', '6k');
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog: catalogOf(
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
      expect(evaluation.newMasteries).toEqual([
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
          catalog: catalogOf(
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
      expect(evaluation.newMasteries).toEqual([]);
    });

    it('keeps recorded masteries and does not record them again', () => {
      const easy = chartOf('a', 'easy');
      const hard = chartOf('a', 'hard');
      const evaluation = evaluateAchievements(
        snapshotOf({
          catalog: catalogOf(
            [
              {
                id: 'a',
                constellation: 'aries',
              },
            ],
            [easy, hard],
          ),
          marks: [markOf('s', easy), markOf('s', hard)],
          masteries: [
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
      expect(evaluation.newMasteries).toEqual([]);
      expect(evaluation.newAchievements).toEqual(
        expect.arrayContaining(['SONG_ALL_S_1', 'ALL_DIFFICULTIES_CLEAR']),
      );
    });
  });

  it('reports progress for every achievement and new achievements in catalog order', () => {
    const chart = chartOf('a', 'easy');
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 1,
        catalog: catalogOf(
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
    expect(evaluation.progress.map(({ id }) => id)).toEqual(ACHIEVEMENT_IDS);
    expect(evaluation.newAchievements).toEqual([
      'FIRST_CLEAR',
      'FIRST_FINISH',
      'ZODIAC_ARIES',
      'ZODIAC_1_COMPLETE',
    ]);
  });

  it('reports stats by distinct songs and charts', () => {
    const easy = chartOf('a', 'easy');
    const hard = chartOf('a', 'hard');
    const other = chartOf('b', 'easy');
    const evaluation = evaluateAchievements(
      snapshotOf({
        playCount: 7,
        catalog: catalogOf(
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
