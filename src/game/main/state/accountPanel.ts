import type { AchievementId } from '../../data/achievements.js';
import type { AccountState } from '../accountState.js';

export type AccountPanel = UserPanel | CornerPanel;

export interface UserPanel {
  readonly kind: 'user';
  readonly nickname: string;
  readonly featuredAchievement: AchievementId | null;
  readonly email: string;
}

export interface CornerPanel {
  readonly kind: 'corner';
  readonly content: { readonly kind: 'icon' } | { readonly kind: 'label'; readonly text: string };
  readonly hasFailureNotice: boolean;
}

const CORNER_LABELS = {
  guest: 'SIGN IN WITH GOOGLE',
  signingIn: 'CANCEL',
} as const;

export function getAccountPanel(account: AccountState, hasGoogleIcon: boolean): AccountPanel {
  if (account.kind === 'signedIn') {
    return {
      kind: 'user',
      nickname: account.user.nickname,
      featuredAchievement: account.user.featuredAchievement,
      email: account.user.email,
    };
  }
  return {
    kind: 'corner',
    content: hasGoogleIcon
      ? { kind: 'icon' }
      : {
          kind: 'label',
          text: CORNER_LABELS[account.kind],
        },
    hasFailureNotice: account.kind === 'guest' && account.hasSignInFailed,
  };
}
