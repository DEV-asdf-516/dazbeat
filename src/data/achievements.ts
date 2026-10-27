import type { Zodiac } from './songs.js';

export type AchievementMark = 'clear' | 's' | 'fc' | 'ap';
export const ACHIEVEMENT_MARK_KINDS: readonly AchievementMark[] = ['clear', 's', 'fc', 'ap'];
export type AchievementSet =
  'starlightOrigin' | 'starJourney' | 'zodiacAscension' | 'zodiacPerfection';
export type AchievementCategory =
  | 'songClear'
  | 'play'
  | 'skill'
  | 'zodiacComplete'
  | 'zodiacStage'
  | 'chartPioneer'
  | 'expert'
  | 'precision'
  | 'songMaster'
  | 'zodiacPilgrimage'
  | 'zodiacAllS'
  | 'zodiacAllFullCombo'
  | 'zodiacAllPerfect';
export type AchievementRule =
  | { kind: 'plays'; target: number }
  | { kind: 'songs'; mark: 'clear'; target: number }
  | { kind: 'charts'; mark: AchievementMark; target: number; difficulty: 'expert' | null }
  | { kind: 'masteries'; mark: AchievementMark; target: number }
  | { kind: 'zodiacVisits'; mark: AchievementMark; target: number }
  | { kind: 'zodiacComplete'; mark: AchievementMark; zodiac: Zodiac }
  | { kind: 'zodiacCompletions'; target: number };

export const ACHIEVEMENT_IDS = [
  'FIRST_CLEAR',
  'CLEAR_5_SONGS',
  'CLEAR_10_SONGS',
  'CLEAR_15_SONGS',
  'CLEAR_20_SONGS',
  'FIRST_FINISH',
  'PLAY_3',
  'PLAY_10',
  'PLAY_50',
  'PLAY_100',
  'PLAY_200',
  'PLAY_500',
  'FIRST_S',
  'S_5_CHARTS',
  'S_10_CHARTS',
  'FIRST_FC',
  'FC_5_CHARTS',
  'FC_10_CHARTS',
  'FIRST_AP',
  'AP_3_CHARTS',
  'AP_5_CHARTS',
  'EXPERT_CLEAR',
  'EXPERT_5_CHARTS',
  'ALL_DIFFICULTIES_CLEAR',
  'ZODIAC_ARIES',
  'ZODIAC_TAURUS',
  'ZODIAC_GEMINI',
  'ZODIAC_CANCER',
  'ZODIAC_LEO',
  'ZODIAC_VIRGO',
  'ZODIAC_LIBRA',
  'ZODIAC_SCORPIO',
  'ZODIAC_SAGITTARIUS',
  'ZODIAC_CAPRICORN',
  'ZODIAC_AQUARIUS',
  'ZODIAC_PISCES',
  'ZODIAC_1_COMPLETE',
  'ZODIAC_3_COMPLETE',
  'ZODIAC_6_COMPLETE',
  'ZODIAC_12_COMPLETE',
  'CHART_CLEAR_25',
  'CHART_CLEAR_50',
  'CHART_CLEAR_75',
  'CHART_CLEAR_100',
  'EXPERT_10_CHARTS',
  'EXPERT_20_CHARTS',
  'EXPERT_S_5_CHARTS',
  'EXPERT_S_10_CHARTS',
  'EXPERT_FIRST_FC',
  'EXPERT_FC_5_CHARTS',
  'EXPERT_FC_10_CHARTS',
  'EXPERT_FIRST_AP',
  'EXPERT_AP_3_CHARTS',
  'EXPERT_AP_5_CHARTS',
  'S_20_CHARTS',
  'S_30_CHARTS',
  'FC_20_CHARTS',
  'FC_30_CHARTS',
  'FC_50_CHARTS',
  'AP_10_CHARTS',
  'AP_20_CHARTS',
  'SONG_ALL_CLEAR_3',
  'SONG_ALL_CLEAR_5',
  'SONG_ALL_S_1',
  'SONG_ALL_S_3',
  'SONG_ALL_FC_1',
  'SONG_ALL_FC_3',
  'SONG_ALL_AP_1',
  'SONG_ALL_AP_3',
  'ZODIAC_VISIT_3',
  'ZODIAC_VISIT_6',
  'ZODIAC_VISIT_9',
  'ZODIAC_VISIT_12',
  'ZODIAC_S_VISIT_3',
  'ZODIAC_S_VISIT_6',
  'ZODIAC_S_VISIT_12',
  'ZODIAC_FC_VISIT_3',
  'ZODIAC_FC_VISIT_6',
  'ZODIAC_FC_VISIT_12',
  'ZODIAC_AP_VISIT_3',
  'ZODIAC_AP_VISIT_6',
  'ZODIAC_ARIES_S',
  'ZODIAC_TAURUS_S',
  'ZODIAC_GEMINI_S',
  'ZODIAC_CANCER_S',
  'ZODIAC_LEO_S',
  'ZODIAC_VIRGO_S',
  'ZODIAC_LIBRA_S',
  'ZODIAC_SCORPIO_S',
  'ZODIAC_SAGITTARIUS_S',
  'ZODIAC_CAPRICORN_S',
  'ZODIAC_AQUARIUS_S',
  'ZODIAC_PISCES_S',
  'ZODIAC_ARIES_FC',
  'ZODIAC_TAURUS_FC',
  'ZODIAC_GEMINI_FC',
  'ZODIAC_CANCER_FC',
  'ZODIAC_LEO_FC',
  'ZODIAC_VIRGO_FC',
  'ZODIAC_LIBRA_FC',
  'ZODIAC_SCORPIO_FC',
  'ZODIAC_SAGITTARIUS_FC',
  'ZODIAC_CAPRICORN_FC',
  'ZODIAC_AQUARIUS_FC',
  'ZODIAC_PISCES_FC',
  'ZODIAC_ARIES_AP',
  'ZODIAC_TAURUS_AP',
  'ZODIAC_GEMINI_AP',
  'ZODIAC_CANCER_AP',
  'ZODIAC_LEO_AP',
  'ZODIAC_VIRGO_AP',
  'ZODIAC_LIBRA_AP',
  'ZODIAC_SCORPIO_AP',
  'ZODIAC_SAGITTARIUS_AP',
  'ZODIAC_CAPRICORN_AP',
  'ZODIAC_AQUARIUS_AP',
  'ZODIAC_PISCES_AP',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly set: AchievementSet;
  readonly category: AchievementCategory;
  readonly rule: AchievementRule;
}

export const ACHIEVEMENT_SETS: readonly AchievementSet[] = [
  'starlightOrigin',
  'starJourney',
  'zodiacAscension',
  'zodiacPerfection',
];

type AchievementEntry = Omit<AchievementDefinition, 'id'>;

function origin(category: AchievementCategory, rule: AchievementRule): AchievementEntry {
  return {
    set: 'starlightOrigin',
    category,
    rule,
  };
}

function journey(category: AchievementCategory, rule: AchievementRule): AchievementEntry {
  return {
    set: 'starJourney',
    category,
    rule,
  };
}

function plays(target: number): AchievementRule {
  return {
    kind: 'plays',
    target,
  };
}

function songs(target: number): AchievementRule {
  return {
    kind: 'songs',
    mark: 'clear',
    target,
  };
}

function charts(mark: AchievementMark, target: number): AchievementRule {
  return {
    kind: 'charts',
    mark,
    target,
    difficulty: null,
  };
}

function expertCharts(mark: AchievementMark, target: number): AchievementRule {
  return {
    kind: 'charts',
    mark,
    target,
    difficulty: 'expert',
  };
}

function masteries(mark: AchievementMark, target: number): AchievementRule {
  return {
    kind: 'masteries',
    mark,
    target,
  };
}

function zodiacVisits(mark: AchievementMark, target: number): AchievementRule {
  return {
    kind: 'zodiacVisits',
    mark,
    target,
  };
}

function zodiacCompletions(target: number): AchievementRule {
  return {
    kind: 'zodiacCompletions',
    target,
  };
}

function crest(zodiac: Zodiac): AchievementEntry {
  return origin('zodiacComplete', {
    kind: 'zodiacComplete',
    mark: 'clear',
    zodiac,
  });
}

function zodiacAllS(zodiac: Zodiac): AchievementEntry {
  return {
    set: 'zodiacAscension',
    category: 'zodiacAllS',
    rule: {
      kind: 'zodiacComplete',
      mark: 's',
      zodiac,
    },
  };
}

function zodiacAllFullCombo(zodiac: Zodiac): AchievementEntry {
  return {
    set: 'zodiacAscension',
    category: 'zodiacAllFullCombo',
    rule: {
      kind: 'zodiacComplete',
      mark: 'fc',
      zodiac,
    },
  };
}

function zodiacAllPerfect(zodiac: Zodiac): AchievementEntry {
  return {
    set: 'zodiacPerfection',
    category: 'zodiacAllPerfect',
    rule: {
      kind: 'zodiacComplete',
      mark: 'ap',
      zodiac,
    },
  };
}

// Record 로 모든 ID 의 정의를 빠짐없이 강제하고, 순서는 ACHIEVEMENT_IDS 가 정한다.
const ENTRIES: Record<AchievementId, AchievementEntry> = {
  FIRST_CLEAR: origin('songClear', songs(1)),
  CLEAR_5_SONGS: origin('songClear', songs(5)),
  CLEAR_10_SONGS: origin('songClear', songs(10)),
  CLEAR_15_SONGS: origin('songClear', songs(15)),
  CLEAR_20_SONGS: origin('songClear', songs(20)),
  FIRST_FINISH: origin('play', plays(1)),
  PLAY_3: origin('play', plays(3)),
  PLAY_10: origin('play', plays(10)),
  PLAY_50: origin('play', plays(50)),
  PLAY_100: origin('play', plays(100)),
  PLAY_200: origin('play', plays(200)),
  PLAY_500: origin('play', plays(500)),
  FIRST_S: origin('skill', charts('s', 1)),
  S_5_CHARTS: origin('skill', charts('s', 5)),
  S_10_CHARTS: origin('skill', charts('s', 10)),
  FIRST_FC: origin('skill', charts('fc', 1)),
  FC_5_CHARTS: origin('skill', charts('fc', 5)),
  FC_10_CHARTS: origin('skill', charts('fc', 10)),
  FIRST_AP: origin('skill', charts('ap', 1)),
  AP_3_CHARTS: origin('skill', charts('ap', 3)),
  AP_5_CHARTS: origin('skill', charts('ap', 5)),
  EXPERT_CLEAR: origin('skill', expertCharts('clear', 1)),
  EXPERT_5_CHARTS: origin('skill', expertCharts('clear', 5)),
  ALL_DIFFICULTIES_CLEAR: origin('skill', masteries('clear', 1)),
  ZODIAC_ARIES: crest('aries'),
  ZODIAC_TAURUS: crest('taurus'),
  ZODIAC_GEMINI: crest('gemini'),
  ZODIAC_CANCER: crest('cancer'),
  ZODIAC_LEO: crest('leo'),
  ZODIAC_VIRGO: crest('virgo'),
  ZODIAC_LIBRA: crest('libra'),
  ZODIAC_SCORPIO: crest('scorpio'),
  ZODIAC_SAGITTARIUS: crest('sagittarius'),
  ZODIAC_CAPRICORN: crest('capricorn'),
  ZODIAC_AQUARIUS: crest('aquarius'),
  ZODIAC_PISCES: crest('pisces'),
  ZODIAC_1_COMPLETE: origin('zodiacStage', zodiacCompletions(1)),
  ZODIAC_3_COMPLETE: origin('zodiacStage', zodiacCompletions(3)),
  ZODIAC_6_COMPLETE: origin('zodiacStage', zodiacCompletions(6)),
  ZODIAC_12_COMPLETE: origin('zodiacStage', zodiacCompletions(12)),
  CHART_CLEAR_25: journey('chartPioneer', charts('clear', 25)),
  CHART_CLEAR_50: journey('chartPioneer', charts('clear', 50)),
  CHART_CLEAR_75: journey('chartPioneer', charts('clear', 75)),
  CHART_CLEAR_100: journey('chartPioneer', charts('clear', 100)),
  EXPERT_10_CHARTS: journey('expert', expertCharts('clear', 10)),
  EXPERT_20_CHARTS: journey('expert', expertCharts('clear', 20)),
  EXPERT_S_5_CHARTS: journey('expert', expertCharts('s', 5)),
  EXPERT_S_10_CHARTS: journey('expert', expertCharts('s', 10)),
  EXPERT_FIRST_FC: journey('expert', expertCharts('fc', 1)),
  EXPERT_FC_5_CHARTS: journey('expert', expertCharts('fc', 5)),
  EXPERT_FC_10_CHARTS: journey('expert', expertCharts('fc', 10)),
  EXPERT_FIRST_AP: journey('expert', expertCharts('ap', 1)),
  EXPERT_AP_3_CHARTS: journey('expert', expertCharts('ap', 3)),
  EXPERT_AP_5_CHARTS: journey('expert', expertCharts('ap', 5)),
  S_20_CHARTS: journey('precision', charts('s', 20)),
  S_30_CHARTS: journey('precision', charts('s', 30)),
  FC_20_CHARTS: journey('precision', charts('fc', 20)),
  FC_30_CHARTS: journey('precision', charts('fc', 30)),
  FC_50_CHARTS: journey('precision', charts('fc', 50)),
  AP_10_CHARTS: journey('precision', charts('ap', 10)),
  AP_20_CHARTS: journey('precision', charts('ap', 20)),
  SONG_ALL_CLEAR_3: journey('songMaster', masteries('clear', 3)),
  SONG_ALL_CLEAR_5: journey('songMaster', masteries('clear', 5)),
  SONG_ALL_S_1: journey('songMaster', masteries('s', 1)),
  SONG_ALL_S_3: journey('songMaster', masteries('s', 3)),
  SONG_ALL_FC_1: journey('songMaster', masteries('fc', 1)),
  SONG_ALL_FC_3: journey('songMaster', masteries('fc', 3)),
  SONG_ALL_AP_1: journey('songMaster', masteries('ap', 1)),
  SONG_ALL_AP_3: journey('songMaster', masteries('ap', 3)),
  ZODIAC_VISIT_3: journey('zodiacPilgrimage', zodiacVisits('clear', 3)),
  ZODIAC_VISIT_6: journey('zodiacPilgrimage', zodiacVisits('clear', 6)),
  ZODIAC_VISIT_9: journey('zodiacPilgrimage', zodiacVisits('clear', 9)),
  ZODIAC_VISIT_12: journey('zodiacPilgrimage', zodiacVisits('clear', 12)),
  ZODIAC_S_VISIT_3: journey('zodiacPilgrimage', zodiacVisits('s', 3)),
  ZODIAC_S_VISIT_6: journey('zodiacPilgrimage', zodiacVisits('s', 6)),
  ZODIAC_S_VISIT_12: journey('zodiacPilgrimage', zodiacVisits('s', 12)),
  ZODIAC_FC_VISIT_3: journey('zodiacPilgrimage', zodiacVisits('fc', 3)),
  ZODIAC_FC_VISIT_6: journey('zodiacPilgrimage', zodiacVisits('fc', 6)),
  ZODIAC_FC_VISIT_12: journey('zodiacPilgrimage', zodiacVisits('fc', 12)),
  ZODIAC_AP_VISIT_3: journey('zodiacPilgrimage', zodiacVisits('ap', 3)),
  ZODIAC_AP_VISIT_6: journey('zodiacPilgrimage', zodiacVisits('ap', 6)),
  ZODIAC_ARIES_S: zodiacAllS('aries'),
  ZODIAC_TAURUS_S: zodiacAllS('taurus'),
  ZODIAC_GEMINI_S: zodiacAllS('gemini'),
  ZODIAC_CANCER_S: zodiacAllS('cancer'),
  ZODIAC_LEO_S: zodiacAllS('leo'),
  ZODIAC_VIRGO_S: zodiacAllS('virgo'),
  ZODIAC_LIBRA_S: zodiacAllS('libra'),
  ZODIAC_SCORPIO_S: zodiacAllS('scorpio'),
  ZODIAC_SAGITTARIUS_S: zodiacAllS('sagittarius'),
  ZODIAC_CAPRICORN_S: zodiacAllS('capricorn'),
  ZODIAC_AQUARIUS_S: zodiacAllS('aquarius'),
  ZODIAC_PISCES_S: zodiacAllS('pisces'),
  ZODIAC_ARIES_FC: zodiacAllFullCombo('aries'),
  ZODIAC_TAURUS_FC: zodiacAllFullCombo('taurus'),
  ZODIAC_GEMINI_FC: zodiacAllFullCombo('gemini'),
  ZODIAC_CANCER_FC: zodiacAllFullCombo('cancer'),
  ZODIAC_LEO_FC: zodiacAllFullCombo('leo'),
  ZODIAC_VIRGO_FC: zodiacAllFullCombo('virgo'),
  ZODIAC_LIBRA_FC: zodiacAllFullCombo('libra'),
  ZODIAC_SCORPIO_FC: zodiacAllFullCombo('scorpio'),
  ZODIAC_SAGITTARIUS_FC: zodiacAllFullCombo('sagittarius'),
  ZODIAC_CAPRICORN_FC: zodiacAllFullCombo('capricorn'),
  ZODIAC_AQUARIUS_FC: zodiacAllFullCombo('aquarius'),
  ZODIAC_PISCES_FC: zodiacAllFullCombo('pisces'),
  ZODIAC_ARIES_AP: zodiacAllPerfect('aries'),
  ZODIAC_TAURUS_AP: zodiacAllPerfect('taurus'),
  ZODIAC_GEMINI_AP: zodiacAllPerfect('gemini'),
  ZODIAC_CANCER_AP: zodiacAllPerfect('cancer'),
  ZODIAC_LEO_AP: zodiacAllPerfect('leo'),
  ZODIAC_VIRGO_AP: zodiacAllPerfect('virgo'),
  ZODIAC_LIBRA_AP: zodiacAllPerfect('libra'),
  ZODIAC_SCORPIO_AP: zodiacAllPerfect('scorpio'),
  ZODIAC_SAGITTARIUS_AP: zodiacAllPerfect('sagittarius'),
  ZODIAC_CAPRICORN_AP: zodiacAllPerfect('capricorn'),
  ZODIAC_AQUARIUS_AP: zodiacAllPerfect('aquarius'),
  ZODIAC_PISCES_AP: zodiacAllPerfect('pisces'),
};

export const ACHIEVEMENTS: readonly AchievementDefinition[] = ACHIEVEMENT_IDS.map((id) => ({
  id,
  ...ENTRIES[id],
}));

const ACHIEVEMENTS_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);

export function findAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS_BY_ID.get(id);
}
