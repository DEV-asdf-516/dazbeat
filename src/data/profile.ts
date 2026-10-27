import type { AchievementId } from './achievements.js';

export interface AchievementStatus {
  readonly id: AchievementId;
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
  readonly nickname: string;
  readonly featuredAchievement: AchievementId | null;
  readonly stats: ProfileStats;
  readonly achievements: readonly AchievementStatus[];
  readonly newAchievements: ReadonlySet<AchievementId>;
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
