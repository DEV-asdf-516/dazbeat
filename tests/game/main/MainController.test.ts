import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import type { AccountState } from '../../../src/game/accountState.js';
import { MainController } from '../../../src/game/main/MainController.js';
import { requireDefined } from '../../../src/invariant.js';

function nickname(input: string): Nickname {
  return requireDefined(parseNickname(input), 'Invalid test nickname', input);
}

const USER: AuthUser = {
  id: 'user1',
  email: 'player@example.com',
  nickname: nickname('Star'),
  isEditor: false,
  featuredAchievement: null,
};
const OTHER_USER: AuthUser = {
  id: 'user2',
  email: 'other@example.com',
  nickname: nickname('Moon'),
  isEditor: false,
  featuredAchievement: null,
};

interface Pending<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Harness {
  readonly controller: MainController;
  readonly shown: AccountState[];
  readonly signIns: Pending<AuthUser | null>[];
  readonly refreshes: Pending<AuthUser | null>[];
  cancelSignInCount(): number;
  signOutCount(): number;
}

function createHarness(restore: () => AuthUser | null): Harness {
  const shown: AccountState[] = [];
  const signIns: Pending<AuthUser | null>[] = [];
  const refreshes: Pending<AuthUser | null>[] = [];
  let cancelSignInCount = 0;
  let signOutCount = 0;
  const controller = new MainController(
    {
      getCurrentUser: restore,
      signIn: () => {
        const response = pending<AuthUser | null>();
        signIns.push(response);
        return response.promise;
      },
      cancelSignIn: () => {
        cancelSignInCount += 1;
      },
      signOut: () => {
        signOutCount += 1;
      },
      refresh: () => {
        const response = pending<AuthUser | null>();
        refreshes.push(response);
        return response.promise;
      },
    },
    {
      showAccount: (account) => shown.push(account),
    },
  );
  return {
    controller,
    shown,
    signIns,
    refreshes,
    cancelSignInCount: () => cancelSignInCount,
    signOutCount: () => signOutCount,
  };
}

function signedIn(user: AuthUser): AccountState {
  return {
    kind: 'signedIn',
    user,
  };
}

const GUEST: AccountState = {
  kind: 'guest',
  hasSignInFailed: false,
};

describe('MainController', () => {
  describe('stored session refresh', () => {
    it('shows the stored user first and redraws with refreshed account info', async () => {
      const harness = createHarness(() => USER);

      expect(harness.shown).toEqual([signedIn(USER)]);
      expect(harness.refreshes).toHaveLength(1);

      const refreshed: AuthUser = {
        ...USER,
        nickname: nickname('Nova'),
        isEditor: true,
        featuredAchievement: 'FIRST_CLEAR',
      };
      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve(refreshed);
      await flush();

      expect(harness.shown).toEqual([signedIn(USER), signedIn(refreshed)]);
    });

    it('does not redraw when the refreshed account info is unchanged', async () => {
      const harness = createHarness(() => USER);

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve({ ...USER });
      await flush();

      expect(harness.shown).toEqual([signedIn(USER)]);
    });

    it('shows a guest without a failure notice when the session is rejected', async () => {
      const harness = createHarness(() => USER);

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve(null);
      await flush();

      expect(harness.shown).toEqual([signedIn(USER), GUEST]);
    });

    it('keeps the stored user without signing out when the refresh fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const harness = createHarness(() => USER);

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).reject(new Error('network'));
      await flush();

      expect(harness.shown).toEqual([signedIn(USER)]);
      expect(harness.signOutCount()).toBe(0);
      warn.mockRestore();
    });

    it('shows a guest without refreshing when no session is stored', () => {
      const harness = createHarness(() => null);

      expect(harness.shown).toEqual([GUEST]);
      expect(harness.refreshes).toHaveLength(0);
    });

    it('signs out and shows a guest without refreshing when restoring fails', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness(() => {
        throw new Error('Invalid users record user1: nickname');
      });

      expect(harness.signOutCount()).toBe(1);
      expect(harness.shown).toEqual([GUEST]);
      expect(harness.refreshes).toHaveLength(0);
      error.mockRestore();
    });

    it('ignores a late refresh result after signing out', async () => {
      const harness = createHarness(() => USER);
      harness.controller.activateAccount();

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve({
        ...USER,
        isEditor: true,
      });
      await flush();

      expect(harness.signOutCount()).toBe(1);
      expect(harness.shown).toEqual([signedIn(USER), GUEST]);
    });

    it('keeps another account signed in after signing out during a refresh', async () => {
      const harness = createHarness(() => USER);
      harness.controller.activateAccount();
      harness.controller.activateAccount();
      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(OTHER_USER);
      await flush();

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve(null);
      await flush();

      expect(harness.shown).toEqual([
        signedIn(USER),
        GUEST,
        { kind: 'signingIn' },
        signedIn(OTHER_USER),
      ]);
    });

    it('does not draw a late refresh result after closing', async () => {
      const harness = createHarness(() => USER);
      harness.controller.close();

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve(null);
      await flush();

      expect(harness.shown).toEqual([signedIn(USER)]);
    });
  });

  describe('sign-in flow', () => {
    it('shows the signed-in user after a successful sign-in', async () => {
      const harness = createHarness(() => null);
      harness.controller.activateAccount();

      expect(harness.shown).toEqual([GUEST, { kind: 'signingIn' }]);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown.at(-1)).toEqual(signedIn(USER));
    });

    it('returns to a guest without a failure notice when the sign-in is cancelled', async () => {
      const harness = createHarness(() => null);
      harness.controller.activateAccount();

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(null);
      await flush();

      expect(harness.shown).toEqual([GUEST, { kind: 'signingIn' }, GUEST]);
    });

    it('shows a failure notice when the sign-in fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness(() => null);
      harness.controller.activateAccount();

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).reject(new Error('popup closed'));
      await flush();

      expect(harness.shown.at(-1)).toEqual({
        kind: 'guest',
        hasSignInFailed: true,
      });
      error.mockRestore();
    });

    it('cancels the sign-in when activated again while signing in', async () => {
      const harness = createHarness(() => null);
      harness.controller.activateAccount();
      harness.controller.activateAccount();

      expect(harness.cancelSignInCount()).toBe(1);
      expect(harness.shown).toEqual([GUEST, { kind: 'signingIn' }, GUEST]);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown).toEqual([GUEST, { kind: 'signingIn' }, GUEST]);
    });

    it('cancels the sign-in on close and ignores its late result', async () => {
      const harness = createHarness(() => null);
      harness.controller.activateAccount();
      harness.controller.close();

      expect(harness.cancelSignInCount()).toBe(1);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown).toEqual([GUEST, { kind: 'signingIn' }]);
    });
  });
});
