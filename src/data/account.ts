import type { AchievementId } from './achievements.js';
import type { Nickname } from './nickname.js';

export interface AuthUser {
  id: string;
  email: string;
  nickname: Nickname;
  isEditor: boolean;
  featuredAchievement: AchievementId | null;
}

export class AccountRejoinBlockedError extends Error {
  override readonly name = 'AccountRejoinBlockedError';

  constructor(cause: unknown) {
    super('Sign-in rejected: the Google account was deleted', { cause });
  }
}

export type AccountDeletionErrorKind = 'unauthorized' | 'unknown' | 'failed';

export class AccountDeletionError extends Error {
  override readonly name = 'AccountDeletionError';
  readonly kind: AccountDeletionErrorKind;

  constructor(kind: AccountDeletionErrorKind, cause: unknown) {
    super(`Account deletion failed: ${kind}`, { cause });
    this.kind = kind;
  }
}
