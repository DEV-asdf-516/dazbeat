import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../src/data/account.js';
import { createAccountState, failSignIn, startSignIn } from '../../../src/game/accountState.js';
import { getAccountPanel } from '../../../src/game/main/accountPanel.js';

const PLAYER: AuthUser = {
  id: 'user-1',
  email: 'player@example.com',
  name: 'Player',
  isEditor: false,
};

describe('getAccountPanel', () => {
  it('shows the user card with a sign-out action when signed in, regardless of the icon', () => {
    const expected = {
      kind: 'user',
      name: 'Player',
      email: 'player@example.com',
      actionLabel: 'SIGN OUT',
    };
    expect(getAccountPanel(createAccountState(PLAYER), true)).toEqual(expected);
    expect(getAccountPanel(createAccountState(PLAYER), false)).toEqual(expected);
  });

  it('shows the Google icon to a guest when the icon is loaded', () => {
    expect(getAccountPanel(createAccountState(null), true)).toEqual({
      kind: 'corner',
      content: { kind: 'icon' },
      hasFailureNotice: false,
    });
  });

  it('falls back to the sign-in label for a guest when the icon is missing', () => {
    expect(getAccountPanel(createAccountState(null), false)).toEqual({
      kind: 'corner',
      content: {
        kind: 'label',
        text: 'SIGN IN WITH GOOGLE',
      },
      hasFailureNotice: false,
    });
  });

  it('keeps the icon while signing in', () => {
    expect(getAccountPanel(startSignIn(), true)).toEqual({
      kind: 'corner',
      content: { kind: 'icon' },
      hasFailureNotice: false,
    });
  });

  it('falls back to the cancel label while signing in when the icon is missing', () => {
    expect(getAccountPanel(startSignIn(), false)).toEqual({
      kind: 'corner',
      content: {
        kind: 'label',
        text: 'CANCEL',
      },
      hasFailureNotice: false,
    });
  });

  it('adds the failure notice only to a guest whose sign-in failed', () => {
    const attempt = startSignIn();
    const failed = failSignIn(attempt, attempt);
    expect(getAccountPanel(failed, true)).toEqual({
      kind: 'corner',
      content: { kind: 'icon' },
      hasFailureNotice: true,
    });
    expect(getAccountPanel(failed, false)).toEqual({
      kind: 'corner',
      content: {
        kind: 'label',
        text: 'SIGN IN WITH GOOGLE',
      },
      hasFailureNotice: true,
    });
  });
});
