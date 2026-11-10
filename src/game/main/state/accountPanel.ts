import type { AchievementCatalog } from '../../../data/achievements.js';
import type { AccountState, SignInFailure } from '../../app/accountState.js';
import { getAccountIdentity } from '../../ui/state/accountIdentity.js';
import type { AccountIdentity } from '../../ui/state/accountIdentity.js';

export type AccountPanel = UserPanel | CornerPanel;

export interface UserPanel extends AccountIdentity {
  readonly kind: 'user';
}

export interface CornerPanel {
  readonly kind: 'corner';
  readonly content: { readonly kind: 'icon' } | { readonly kind: 'label'; readonly text: string };
  readonly failureNotice: SignInFailure | 'none';
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
    return {
      kind: 'user',
      ...getAccountIdentity(account.user, catalog),
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
    failureNotice: account.kind === 'guest' ? account.signInFailure : 'none',
    // 진행 중 안내 문구는 따로 띄우지 않고 버튼 글자 옆에서 별만 돌린다.
    isSigningIn: account.kind === 'signingIn',
  };
}
