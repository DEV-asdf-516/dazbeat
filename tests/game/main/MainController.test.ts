import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import type { AccountState } from '../../../src/game/app/accountState.js';
import { MainController } from '../../../src/game/main/MainController.js';
import type { MainFocus, MainState } from '../../../src/game/main/state/mainMenu.js';
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
  readonly focuses: MainFocus[];
  readonly controlsOpen: boolean[];
  readonly activated: (MainFocus | 'account')[];
  readonly hovers: MainState['hover'][];
  focusSoundCount(): number;
  cancelSignInCount(): number;
  signOutCount(): number;
}

function createHarness(restore: () => AuthUser | null): Harness {
  const shown: AccountState[] = [];
  const signIns: Pending<AuthUser | null>[] = [];
  const refreshes: Pending<AuthUser | null>[] = [];
  const focuses: MainFocus[] = [];
  const controlsOpen: boolean[] = [];
  const activated: (MainFocus | 'account')[] = [];
  const hovers: MainState['hover'][] = [];
  let focusSoundCount = 0;
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
      render: (_previous, next) => {
        shown.push(next.account);
        focuses.push(next.focus);
        controlsOpen.push(next.isControlsOpen);
        hovers.push(next.hover);
      },
      playFocusSound: () => {
        focusSoundCount += 1;
      },
      activate: (button) => activated.push(button),
    },
  );
  return {
    controller,
    shown,
    signIns,
    refreshes,
    focuses,
    controlsOpen,
    activated,
    hovers,
    focusSoundCount: () => focusSoundCount,
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

  describe('menu focus', () => {
    function cycle(harness: Harness, count: number): MainFocus[] {
      return Array.from({ length: count }, () => {
        harness.controller.moveFocus(1);
        return requireDefined(harness.focuses.at(-1), 'Missing focus', harness.focuses.length);
      });
    }

    it('cycles the guest focus order with one sound per move', () => {
      const harness = createHarness(() => null);

      expect(cycle(harness, 5)).toEqual(['practice', 'settings', 'credits', 'youtube', 'play']);
      expect(harness.focusSoundCount()).toBe(5);
    });

    it('adds the profile before YouTube when signed in', () => {
      const harness = createHarness(() => USER);

      expect(cycle(harness, 6)).toEqual([
        'practice',
        'settings',
        'credits',
        'profile',
        'youtube',
        'play',
      ]);
    });

    it('includes the chart editor for an editor account', () => {
      const harness = createHarness(() => ({
        ...USER,
        isEditor: true,
      }));

      expect(cycle(harness, 2)).toEqual(['practice', 'chartEditor']);
    });

    it('moves backwards with wrapping', () => {
      const harness = createHarness(() => null);
      harness.controller.moveFocus(-1);

      expect(harness.focuses.at(-1)).toBe('youtube');
    });

    it('plays no sound on creation or account changes', async () => {
      const harness = createHarness(() => USER);
      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve({
        ...USER,
        nickname: nickname('Nova'),
      });
      await flush();

      expect(harness.shown).toHaveLength(2);
      expect(harness.focusSoundCount()).toBe(0);
    });

    it('returns the focus to play without a sound when signing out from the profile', () => {
      const harness = createHarness(() => USER);
      cycle(harness, 4);
      expect(harness.focuses.at(-1)).toBe('profile');

      harness.controller.activateAccount();

      expect(harness.shown.at(-1)).toEqual(GUEST);
      expect(harness.focuses.at(-1)).toBe('play');
      expect(harness.focusSoundCount()).toBe(4);
    });

    it('activates the focused item on confirm', () => {
      const harness = createHarness(() => null);
      harness.controller.moveFocus(1);

      harness.controller.confirm();

      expect(harness.activated).toEqual(['practice']);
    });
  });
});

const H_KEY = {
  code: 'KeyH',
  repeat: false,
};
const ESCAPE_KEY = {
  code: 'Escape',
  repeat: false,
};
const DOWN_KEY = {
  code: 'ArrowDown',
  repeat: false,
};

describe('MainController controls', () => {
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness(() => null);

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
  });
});

describe('MainController button pointer', () => {
  it('activates the button once for over, down and up on it', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerOver('youtube');
    harness.controller.pointerDown('youtube');
    harness.controller.pointerUp('youtube');
    harness.controller.pointerUp('youtube');

    expect(harness.activated).toEqual(['youtube']);
  });

  it('does not activate the button for an up that was pressed elsewhere', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerOver('play');
    harness.controller.pointerUp('play');

    expect(harness.activated).toEqual([]);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerOver('settings');
    harness.controller.pointerDown('settings');
    harness.controller.pointerOut('settings');
    harness.controller.pointerOver('settings');
    harness.controller.pointerUp('settings');

    expect(harness.activated).toEqual([]);
  });

  it('releases the account press and asks the screen to run the account button', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerOver('account');
    harness.controller.pointerDown('account');
    harness.controller.pointerUp('account');

    expect(harness.activated).toEqual(['account']);
    expect(harness.hovers.at(-1)).toEqual({
      kind: 'button',
      button: 'account',
      isPressed: false,
    });
  });

  it('ignores a press on the close button while the controls are closed', () => {
    const harness = createHarness(() => null);
    const renderCount = harness.controlsOpen.length;

    harness.controller.pointerDown('controlsClose');

    expect(harness.controlsOpen).toHaveLength(renderCount);
  });

  it('opens with the entry, closes with the close button and releases its hover', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(harness.controlsOpen.at(-1)).toBe(true);

    harness.controller.pointerOver('controlsClose');
    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(harness.controlsOpen.at(-1)).toBe(false);
    expect(harness.hovers.at(-1)).toBeNull();
  });
});
