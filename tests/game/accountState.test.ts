import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../src/backend/auth.js';
import {
  cancelSignIn,
  canCurrentUserOpenChartEditor,
  canOpenChartEditor,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../../src/game/accountState.js';

const USER: AuthUser = {
  id: 'user-1',
  email: 'player@example.com',
  name: 'Player',
  isEditor: false,
};

describe('createAccountState', () => {
  it('starts signed in with the given user', () => {
    const state = createAccountState(USER);

    if (state.kind !== 'signedIn') {
      throw new Error(`Expected signedIn, got ${state.kind}`);
    }
    expect(state.user).toBe(USER);
  });

  it('starts as guest without a failed sign-in when there is no user', () => {
    expect(createAccountState(null)).toEqual({ kind: 'guest', hasSignInFailed: false });
  });
});

describe('startSignIn', () => {
  it('returns a signingIn state', () => {
    expect(startSignIn().kind).toBe('signingIn');
  });

  it('returns a different object for every attempt', () => {
    expect(startSignIn()).not.toBe(startSignIn());
  });
});

describe('completeSignIn', () => {
  it('signs in with the user while the attempt is the current state', () => {
    const attempt = startSignIn();

    const state = completeSignIn(attempt, attempt, USER);

    if (state.kind !== 'signedIn') {
      throw new Error(`Expected signedIn, got ${state.kind}`);
    }
    expect(state.user).toBe(USER);
  });

  it('keeps the current state when the attempt was cancelled', () => {
    const attempt = startSignIn();
    const cancelled = createAccountState(null);

    expect(completeSignIn(cancelled, attempt, USER)).toBe(cancelled);
  });

  it('keeps a later attempt pending when an earlier attempt succeeds', () => {
    const first = startSignIn();
    const second = startSignIn();

    expect(completeSignIn(second, first, USER)).toBe(second);
  });
});

describe('cancelSignIn', () => {
  it('returns guest without a failed sign-in while the attempt is the current state', () => {
    const attempt = startSignIn();
    expect(cancelSignIn(attempt, attempt)).toEqual({ kind: 'guest', hasSignInFailed: false });
  });

  it('keeps the current state when another state replaced the attempt', () => {
    const attempt = startSignIn();
    const later = startSignIn();
    expect(cancelSignIn(later, attempt)).toBe(later);
  });
});

describe('failSignIn', () => {
  it('returns guest with a failed sign-in while the attempt is the current state', () => {
    const attempt = startSignIn();

    expect(failSignIn(attempt, attempt)).toEqual({ kind: 'guest', hasSignInFailed: true });
  });

  it('keeps the current state when the attempt was cancelled', () => {
    const attempt = startSignIn();
    const cancelled = createAccountState(null);

    expect(failSignIn(cancelled, attempt)).toBe(cancelled);
  });

  it('keeps a later attempt pending when an earlier attempt fails', () => {
    const first = startSignIn();
    const second = startSignIn();

    expect(failSignIn(second, first)).toBe(second);
  });
});

describe('canOpenChartEditor', () => {
  it('denies when there is no user', () => {
    expect(canOpenChartEditor(null)).toBe(false);
  });

  it('denies a user who is not an editor', () => {
    expect(canOpenChartEditor(USER)).toBe(false);
  });

  it('allows an editor', () => {
    expect(canOpenChartEditor({ ...USER, isEditor: true })).toBe(true);
  });
});

describe('canCurrentUserOpenChartEditor', () => {
  it('follows the signed-in user permission', () => {
    expect(canCurrentUserOpenChartEditor({ getCurrentUser: () => null })).toBe(false);
    expect(canCurrentUserOpenChartEditor({ getCurrentUser: () => USER })).toBe(false);
    expect(
      canCurrentUserOpenChartEditor({ getCurrentUser: () => ({ ...USER, isEditor: true }) }),
    ).toBe(true);
  });

  it('denies when the user cannot be read', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        canCurrentUserOpenChartEditor({
          getCurrentUser: () => {
            throw new Error('broken session');
          },
        }),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
