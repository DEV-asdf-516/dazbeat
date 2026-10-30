import { findAchievement } from '../../../data/achievements.js';
import type { AchievementCatalog, NamedAchievementDefinition } from '../../../data/achievements.js';
import type { AccountState } from '../../app/accountState.js';

export type AccountPanel = UserPanel | CornerPanel;

export interface UserPanel {
  readonly kind: 'user';
  readonly nickname: string;
  readonly featuredAchievement: NamedAchievementDefinition | null;
  readonly email: string;
}

export interface CornerPanel {
  readonly kind: 'corner';
  readonly content: { readonly kind: 'icon' } | { readonly kind: 'label'; readonly text: string };
  readonly hasFailureNotice: boolean;
  readonly isSigningIn: boolean;
}

const CORNER_LABELS = {
  guest: 'SIGN IN WITH GOOGLE',
  signingIn: 'CANCEL',
} as const;

export function getAccountPanel(
  account: AccountState,
  hasGoogleIcon: boolean,
  catalog: AchievementCatalog,
): AccountPanel {
  if (account.kind === 'signedIn') {
    const { featuredAchievement } = account.user;
    return {
      kind: 'user',
      nickname: account.user.nickname,
      // 계정 레코드는 카탈로그를 거치지 않아, 부팅 뒤 지워진 업적이면 장착 없음으로 그린다.
      featuredAchievement:
        featuredAchievement === null
          ? null
          : (findAchievement(catalog, featuredAchievement) ?? null),
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
    // 진행 중 안내 문구는 따로 띄우지 않고 버튼 글자 옆에서 별만 돌린다.
    isSigningIn: account.kind === 'signingIn',
  };
}
