import {
  InvalidAchievementDefinitionError,
  parseAchievementDefinition,
} from '../../../src/data/achievements.js';
import type {
  AchievementDefinition,
  AchievementFields,
  AchievementId,
  AchievementMark,
} from '../../../src/data/achievements.js';
import type { Zodiac } from '../../../src/data/songs.js';
import type { Language } from '../../../src/i18n/language.js';
import type { Difficulty } from '../../../src/rhythm/types.js';

export { InvalidAchievementDefinitionError, parseAchievementDefinition };

export interface AchievementMarkRecord {
  readonly kind: AchievementMark;
  readonly song: string;
  readonly difficulty: Difficulty;
  /** 증명한 revision 이 채보의 현재 revision 이고 곡이 지금 공개인가. 채보나 곡이 지워졌으면 false. */
  readonly isCurrent: boolean;
  /** 소급분은 당시 별자리를 몰라 null. */
  readonly constellation: Zodiac | null;
}

/** 채보가 하나 이상 있는 공개 곡과 그 곡이 제공하는 난이도. */
export interface PublishedSong {
  readonly id: string;
  readonly constellation: Zodiac;
  /** albums 레코드 id. */
  readonly album: string | null;
  readonly difficulties: readonly [Difficulty, ...Difficulty[]];
}

export interface AchievementSnapshot {
  readonly playCount: number;
  readonly marks: readonly AchievementMarkRecord[];
  readonly songMarks: readonly { song: string; kind: AchievementMark }[];
  readonly earned: ReadonlySet<AchievementId>;
  readonly publishedSongs: readonly PublishedSong[];
  readonly definitions: readonly AchievementDefinition[];
}

export interface AchievementProgress {
  readonly id: AchievementId;
  readonly current: number;
  readonly target: number;
}

export interface AchievementStats {
  readonly playCount: number;
  readonly clearedSongCount: number;
  readonly sChartCount: number;
  readonly fullComboChartCount: number;
  readonly allPerfectChartCount: number;
}

export interface AchievementEvaluation {
  readonly newSongMarks: readonly { song: string; kind: AchievementMark }[];
  readonly newAchievements: readonly AchievementId[];
  readonly progress: readonly AchievementProgress[];
  readonly stats: AchievementStats;
}

export interface StoredAchievement {
  readonly fields: AchievementFields;
  readonly names: Readonly<Record<Language, string>>;
  readonly definition: AchievementDefinition;
}

export interface UserAchievements extends AchievementEvaluation {
  /** 이번 동기화에서 새로 지급한 것을 포함한 획득 시각. */
  readonly earnedAtMsById: ReadonlyMap<AchievementId, number>;
  /** 평가에 쓴 퇴역 포함 정의. */
  readonly achievements: readonly StoredAchievement[];
}

export interface ProfileAchievements {
  readonly stats: AchievementStats;
  readonly newAchievements: readonly AchievementId[];
  readonly progress: readonly {
    readonly achievement: StoredAchievement;
    readonly earnedAtMs: number | null;
    readonly current: number;
    readonly target: number;
  }[];
  readonly retired: readonly StoredAchievement[];
  readonly featured: StoredAchievement | null;
  readonly albumNames: ReadonlyMap<string, string>;
}

export interface StoredMark extends AchievementMarkRecord {
  readonly chart: string;
  readonly chartRevision: string;
}
