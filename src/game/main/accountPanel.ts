import type { AccountState } from '../accountState.js';

export type AccountPanel = UserPanel | CornerPanel;

export interface UserPanel {
  readonly kind: 'user';
  readonly name: string;
  readonly email: string;
  readonly actionLabel: string;
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
const SIGN_OUT_LABEL = 'SIGN OUT';

export function getAccountPanel(account: AccountState, hasGoogleIcon: boolean): AccountPanel {
  if (account.kind === 'signedIn') {
    return {
      kind: 'user',
      name: account.user.name,
      email: account.user.email,
      actionLabel: SIGN_OUT_LABEL,
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
