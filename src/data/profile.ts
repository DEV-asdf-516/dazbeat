import type { AchievementCatalog, NamedAchievementDefinition } from './achievements.js';
import type { Nickname } from './nickname.js';

export interface AchievementStatus {
  readonly definition: NamedAchievementDefinition;
  readonly earnedAtMs: number | null;
  readonly current: number;
  readonly target: number;
}

export interface ProfileStats {
  readonly playCount: number;
  readonly clearedSongCount: number;
  readonly sChartCount: number;
  readonly fullComboChartCount: number;
  readonly allPerfectChartCount: number;
}

export interface Profile {
  readonly nickname: Nickname;
  readonly featuredAchievement: NamedAchievementDefinition | null;
  readonly stats: ProfileStats;
  readonly achievements: readonly AchievementStatus[];
  readonly newAchievements: ReadonlySet<NamedAchievementDefinition>;
  /** 이 응답의 정의로, 프로필 화면은 부팅 때 읽은 카탈로그 대신 이것을 쓴다. */
  readonly catalog: AchievementCatalog;
}

export type NicknameChangeFailure = 'invalid' | 'taken' | 'failed';

export type ProfileRequestErrorKind =
  'unauthorized' | 'invalidNickname' | 'nicknameTaken' | 'notEarned' | 'failed';

export class ProfileRequestError extends Error {
  override readonly name = 'ProfileRequestError';
  readonly kind: ProfileRequestErrorKind;

  constructor(kind: ProfileRequestErrorKind, cause: unknown) {
    super(`Profile request failed: ${kind}`, { cause });
    this.kind = kind;
  }
}
