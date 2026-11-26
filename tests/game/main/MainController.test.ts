import { describe, expect, it, vi } from 'vitest';
import { AccountRejoinBlockedError } from '../../../src/data/account.js';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import type { Notice } from '../../../src/data/notices.js';
import type { AccountState } from '../../../src/game/app/accountState.js';
import { isControlsHelpShown } from '../../../src/game/app/controlsGuide.js';
import { MainController } from '../../../src/game/main/MainController.js';
import type { MainFocus, MainState } from '../../../src/game/main/state/mainMenu.js';
import type { BrowserIdentity } from '../../../src/game/main/state/accelerationNotice.js';
import {
  NOTICE_SCROLL_STEP_PX,
  NOTICE_VIEWPORT_HEIGHT_PX,
} from '../../../src/game/main/state/noticeBoard.js';
import { requireDefined } from '../../../src/invariant.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';

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
  readonly activated: MainFocus[];
  leave(): void;
  readonly hovers: MainState['hover'][];
  readonly states: MainState[];
  focusSoundCount(): number;
  clickSoundCount(): number;
  closeSoundCount(): number;
  dismissCount(): number;
  cancelSignInCount(): number;
  signOutCount(): number;
  readonly published: Pending<readonly Notice[]>;
  readonly dismissedNoticeIds: (readonly string[])[];
  takeAutoOpenCount(): number;
}

interface NoticeOptions {
  readonly isSoftwareRendering?: boolean;
  readonly isDismissed?: boolean;
  readonly browser?: BrowserIdentity;
  readonly dismiss?: () => void;
}

interface NoticeBoardOptions {
  readonly dismissedIds?: ReadonlySet<string>;
  readonly isAutoOpenAvailable?: boolean;
  readonly contentHeightPx?: number;
  readonly dismiss?: () => void;
}

const NOTICE_CONTENT_HEIGHT_PX = 1000;

const UNKNOWN_BROWSER: BrowserIdentity = {
  userAgentData: { brands: [] },
  userAgent: 'TestAgent/1.0',
};

function createHarness(
  restore: () => AuthUser | null,
  notice: NoticeOptions = {},
  board: NoticeBoardOptions = {},
): Harness {
  const shown: AccountState[] = [];
  const signIns: Pending<AuthUser | null>[] = [];
  const refreshes: Pending<AuthUser | null>[] = [];
  const focuses: MainFocus[] = [];
  const controlsOpen: boolean[] = [];
  const activated: MainFocus[] = [];
  let isLeaving = false;
  const hovers: MainState['hover'][] = [];
  const states: MainState[] = [];
  const sounds: SoundEffect[] = [];
  let cancelSignInCount = 0;
  let signOutCount = 0;
  let dismissCount = 0;
  const published = pending<readonly Notice[]>();
  const dismissedNoticeIds: (readonly string[])[] = [];
  let takeAutoOpenCount = 0;
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
        controlsOpen.push(next.controls !== 'closed');
        hovers.push(next.hover);
        states.push(next);
      },
      playSound: (sound) => sounds.push(sound),
      activate: (item) => activated.push(item),
      isLeaving: () => isLeaving,
      layoutNotices: () => board.contentHeightPx ?? NOTICE_CONTENT_HEIGHT_PX,
    },
    {
      takeBootSoftwareRendering: () => notice.isSoftwareRendering ?? false,
      isDismissed: () => notice.isDismissed ?? false,
      dismiss: () => {
        dismissCount += 1;
        notice.dismiss?.();
      },
      browser: notice.browser ?? UNKNOWN_BROWSER,
    },
    {
      published: published.promise,
      takeAutoOpen: () => {
        takeAutoOpenCount += 1;
        return board.isAutoOpenAvailable ?? true;
      },
      loadDismissedIds: () => board.dismissedIds ?? new Set(),
      dismiss: (ids) => {
        dismissedNoticeIds.push(ids);
        board.dismiss?.();
      },
    },
  );
  controller.start();
  return {
    controller,
    leave: () => {
      isLeaving = true;
    },
    shown,
    signIns,
    refreshes,
    focuses,
    controlsOpen,
    activated,
    hovers,
    states,
    focusSoundCount: () => sounds.filter((sound) => sound === 'menuFocus').length,
    clickSoundCount: () => sounds.filter((sound) => sound === 'click').length,
    closeSoundCount: () => sounds.filter((sound) => sound === 'close').length,
    dismissCount: () => dismissCount,
    cancelSignInCount: () => cancelSignInCount,
    signOutCount: () => signOutCount,
    published,
    dismissedNoticeIds,
    takeAutoOpenCount: () => takeAutoOpenCount,
  };
}

function signedIn(user: AuthUser): AccountState {
  return {
    kind: 'signedIn',
    user,
  };
}

function clickAccount(harness: Harness): void {
  harness.controller.pointerDown('account');
  harness.controller.pointerUp('account');
}

const GUEST: AccountState = {
  kind: 'guest',
  signInFailure: 'none',
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
      clickAccount(harness);

      expect(harness.shown).toEqual([GUEST, GUEST, { kind: 'signingIn' }]);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown.at(-1)).toEqual(signedIn(USER));
    });

    it('returns to a guest without a failure notice when the sign-in is cancelled', async () => {
      const harness = createHarness(() => null);
      clickAccount(harness);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(null);
      await flush();

      expect(harness.shown).toEqual([GUEST, GUEST, { kind: 'signingIn' }, GUEST]);
    });

    it('shows a failure notice when the sign-in fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness(() => null);
      clickAccount(harness);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).reject(new Error('popup closed'));
      await flush();

      expect(harness.shown.at(-1)).toEqual({
        kind: 'guest',
        signInFailure: 'failed',
      });
      error.mockRestore();
    });

    it('shows the rejoin notice when the deleted Google account is rejected', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness(() => null);
      clickAccount(harness);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).reject(
        new AccountRejoinBlockedError(new Error('account_rejoin_blocked')),
      );
      await flush();

      expect(harness.shown.at(-1)).toEqual({
        kind: 'guest',
        signInFailure: 'rejoinBlocked',
      });
      error.mockRestore();
    });

    it('cancels the sign-in when activated again while signing in', async () => {
      const harness = createHarness(() => null);
      clickAccount(harness);
      clickAccount(harness);

      expect(harness.cancelSignInCount()).toBe(1);
      expect(harness.shown).toEqual([
        GUEST,
        GUEST,
        { kind: 'signingIn' },
        { kind: 'signingIn' },
        GUEST,
      ]);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown).toEqual([
        GUEST,
        GUEST,
        { kind: 'signingIn' },
        { kind: 'signingIn' },
        GUEST,
      ]);
    });

    it('cancels the sign-in on close and ignores its late result', async () => {
      const harness = createHarness(() => null);
      clickAccount(harness);
      harness.controller.close();

      expect(harness.cancelSignInCount()).toBe(1);

      requireDefined(harness.signIns[0], 'Missing sign-in', 0).resolve(USER);
      await flush();

      expect(harness.shown).toEqual([GUEST, GUEST, { kind: 'signingIn' }]);
    });
  });

  describe('menu focus', () => {
    function cycle(harness: Harness, count: number): MainFocus[] {
      return Array.from({ length: count }, () => {
        harness.controller.moveFocus('next');
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
      harness.controller.moveFocus('previous');

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

    it('returns the focus to play without a sound when the session ends on the profile', async () => {
      const harness = createHarness(() => USER);
      cycle(harness, 4);
      expect(harness.focuses.at(-1)).toBe('profile');

      requireDefined(harness.refreshes[0], 'Missing refresh', 0).resolve(null);
      await flush();

      expect(harness.shown.at(-1)).toEqual(GUEST);
      expect(harness.focuses.at(-1)).toBe('play');
      expect(harness.focusSoundCount()).toBe(4);
    });

    it('activates the focused item on confirm', () => {
      const harness = createHarness(() => null);
      harness.controller.moveFocus('next');

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

describe('MainController confirm', () => {
  it('plays the click sound and activates the focused button with Enter', () => {
    const harness = createHarness(() => null);
    harness.controller.moveFocus('next');

    harness.controller.confirm();

    expect(harness.activated).toEqual(['practice']);
    expect(harness.clickSoundCount()).toBe(1);
  });
});

describe('MainController controls', () => {
  it('plays the click sound when H opens the controls', () => {
    const harness = createHarness(() => null);

    harness.controller.handleControlsKey(H_KEY);

    expect(harness.clickSoundCount()).toBe(1);
  });
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness(() => null);

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
    harness.controller.handleControlsKey(H_KEY);
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
  });
});

describe('MainController controls help', () => {
  function clickHelp(harness: Harness): void {
    harness.controller.pointerDown('controlsHelp');
    harness.controller.pointerUp('controlsHelp');
  }

  function isHelpShown(harness: Harness): boolean {
    return isControlsHelpShown(requireDefined(harness.states.at(-1), 'expected a render'));
  }

  it('shows the card on (?) hover, pins it on click and hides it on the next click until the pointer comes back', async () => {
    const harness = createHarness(() => null);
    await flush();
    harness.controller.handleControlsKey(H_KEY);

    harness.controller.pointerOver('controlsHelp');
    expect(isHelpShown(harness)).toBe(true);
    clickHelp(harness);
    expect(harness.clickSoundCount()).toBe(2);
    harness.controller.pointerOut('controlsHelp');
    expect(isHelpShown(harness)).toBe(true);

    harness.controller.pointerOver('controlsHelp');
    clickHelp(harness);
    expect(isHelpShown(harness)).toBe(false);
    harness.controller.pointerOut('controlsHelp');
    expect(isHelpShown(harness)).toBe(false);
    harness.controller.pointerOver('controlsHelp');
    expect(isHelpShown(harness)).toBe(true);
  });

  it('drops the pin and the card on close and opens unpinned next time', async () => {
    const harness = createHarness(() => null);
    await flush();
    harness.controller.handleControlsKey(H_KEY);
    harness.controller.pointerOver('controlsHelp');
    clickHelp(harness);

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(harness.states.at(-1)?.controls).toBe('closed');
    expect(isHelpShown(harness)).toBe(false);
    harness.controller.handleControlsKey(H_KEY);
    expect(harness.states.at(-1)?.controls).toBe('open');
    expect(isHelpShown(harness)).toBe(false);
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

  it('releases the account press and starts the sign-in', () => {
    const harness = createHarness(() => null);

    harness.controller.pointerOver('account');
    harness.controller.pointerDown('account');
    harness.controller.pointerUp('account');

    expect(harness.signIns).toHaveLength(1);
    expect(harness.activated).toEqual([]);
    expect(harness.clickSoundCount()).toBe(1);
    expect(harness.hovers.at(-1)).toEqual({
      kind: 'button',
      button: 'account',
      isPressed: false,
    });
  });

  it('only releases the account press without signing in while leaving', () => {
    const harness = createHarness(() => null);
    harness.leave();

    harness.controller.pointerOver('account');
    harness.controller.pointerDown('account');
    harness.controller.pointerUp('account');

    expect(harness.signIns).toHaveLength(0);
    expect(harness.shown.at(-1)).toEqual(GUEST);
    expect(harness.hovers.at(-1)).toEqual({
      kind: 'button',
      button: 'account',
      isPressed: false,
    });
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

const ENTER_KEY = {
  code: 'Enter',
  repeat: false,
};

describe('MainController acceleration notice', () => {
  function firstNotice(notice: NoticeOptions): MainState['accelerationNotice'] {
    const harness = createHarness(() => null, notice);
    return requireDefined(harness.states[0], 'Missing first render', 0).accelerationNotice;
  }

  function lastState(harness: Harness): MainState {
    return requireDefined(harness.states.at(-1), 'Missing render', harness.states.length);
  }

  function openHarness(dismiss?: () => void): Harness {
    return createHarness(() => null, {
      isSoftwareRendering: true,
      ...(dismiss === undefined ? {} : { dismiss }),
    });
  }

  function brands(...names: string[]): BrowserIdentity {
    return {
      userAgentData: {
        brands: names.map((brand) => ({
          brand,
          version: '1',
        })),
      },
      userAgent: 'Mozilla/5.0 Chrome/130.0',
    };
  }

  function userAgent(value: string): BrowserIdentity {
    return {
      userAgentData: undefined,
      userAgent: value,
    };
  }

  it.each([
    ['Edge brand', brands('Chromium', 'Microsoft Edge'), 'edge'],
    ['Chrome brand', brands('Chromium', 'Google Chrome'), 'chrome'],
    ['other Chromium brand', brands('Chromium', 'Brave'), 'other'],
    ['Firefox user agent', userAgent('Mozilla/5.0 Gecko/20100101 Firefox/130.0'), 'firefox'],
    ['Edge user agent', userAgent('Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0'), 'edge'],
    ['Chrome user agent', userAgent('Mozilla/5.0 Chrome/130.0 Safari/537.36'), 'chrome'],
    ['Whale brand', brands('Chromium', 'Whale'), 'whale'],
    ['Opera brand', brands('Chromium', 'Opera'), 'opera'],
    ['Whale user agent', userAgent('Mozilla/5.0 Chrome/130.0 Whale/4.29 Safari/537.36'), 'whale'],
    ['Opera user agent', userAgent('Mozilla/5.0 Chrome/130.0 Safari/537.36 OPR/115.0'), 'opera'],
    ['Safari user agent', userAgent('Mozilla/5.0 Version/18.0 Safari/605.1.15'), 'other'],
  ] as const)('opens for the %s as %s', (_name, browser, kind) => {
    expect(
      firstNotice({
        isSoftwareRendering: true,
        browser,
      }),
    ).toEqual({
      kind: 'open',
      browser: kind,
    });
  });

  it('stays closed without software rendering or after dismissing it', () => {
    expect(firstNotice({ isSoftwareRendering: false })).toEqual({ kind: 'closed' });
    expect(
      firstNotice({
        isSoftwareRendering: true,
        isDismissed: true,
      }),
    ).toEqual({
      kind: 'closed',
    });
  });

  it.each([
    ['Enter', ENTER_KEY],
    ['Esc', ESCAPE_KEY],
  ] as const)('closes with %s without saving and passes keys afterwards', (_name, key) => {
    const harness = openHarness();

    expect(harness.controller.captureKey(key)).toBe(true);
    expect(lastState(harness).accelerationNotice).toEqual({ kind: 'closed' });
    expect(harness.closeSoundCount()).toBe(1);
    expect(harness.dismissCount()).toBe(0);
    expect(harness.controller.captureKey(key)).toBe(false);
  });

  it('blocks other keys while open without changing the focus or the controls', () => {
    const harness = openHarness();
    const first = lastState(harness);

    expect(harness.controller.captureKey(H_KEY)).toBe(true);
    expect(harness.controller.captureKey(DOWN_KEY)).toBe(true);
    expect(lastState(harness)).toBe(first);
    expect(harness.states).toHaveLength(1);
  });

  it('closes with the accept button without saving or activating', () => {
    const harness = openHarness();

    harness.controller.pointerOver('accelerationNoticeAccept');
    harness.controller.pointerDown('accelerationNoticeAccept');
    harness.controller.pointerUp('accelerationNoticeAccept');

    expect(lastState(harness).accelerationNotice).toEqual({ kind: 'closed' });
    expect(lastState(harness).hover).toBeNull();
    expect(harness.dismissCount()).toBe(0);
    expect(harness.activated).toEqual([]);
  });

  it('saves once and closes with the dismiss button without activating', () => {
    const harness = openHarness();

    harness.controller.pointerOver('accelerationNoticeDismiss');
    harness.controller.pointerDown('accelerationNoticeDismiss');
    harness.controller.pointerUp('accelerationNoticeDismiss');

    expect(harness.dismissCount()).toBe(1);
    expect(lastState(harness).accelerationNotice).toEqual({ kind: 'closed' });
    expect(lastState(harness).hover).toBeNull();
    expect(harness.activated).toEqual([]);
  });

  it('closes even when saving the dismissal fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = openHarness(() => {
      throw new Error('QuotaExceededError');
    });

    harness.controller.pointerDown('accelerationNoticeDismiss');
    harness.controller.pointerUp('accelerationNoticeDismiss');

    expect(harness.dismissCount()).toBe(1);
    expect(lastState(harness).accelerationNotice).toEqual({ kind: 'closed' });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

const UP_KEY = {
  code: 'ArrowUp',
  repeat: false,
};

function latest(harness: Harness): MainState {
  return requireDefined(harness.states.at(-1), 'Missing render', harness.states.length);
}

function makeNotice(id: string): Notice {
  return {
    id,
    createdAtMs: 0,
    title: {
      ko: `${id} 제목`,
      ja: `${id} タイトル`,
      en: `${id} title`,
    },
    body: {
      ko: `${id} 본문`,
      ja: `${id} 本文`,
      en: `${id} body`,
    },
  };
}

const NOTICES = [makeNotice('notice-b'), makeNotice('notice-a')];

async function arrive(harness: Harness, items: readonly Notice[] = NOTICES): Promise<void> {
  harness.published.resolve(items);
  await flush();
}

function click(harness: Harness, button: Parameters<MainController['pointerUp']>[0]): void {
  harness.controller.pointerOver(button);
  harness.controller.pointerDown(button);
  harness.controller.pointerUp(button);
}

async function failSignIn(harness: Harness): Promise<void> {
  clickAccount(harness);
  requireDefined(harness.signIns.at(-1), 'Missing sign-in', harness.signIns.length).reject(
    new Error('popup closed'),
  );
  await flush();
}

describe('MainController sign-in failure popup', () => {
  it('closes with its button, releases its hover and plays the close sound', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness(() => null);
    await failSignIn(harness);
    const closeSounds = harness.closeSoundCount();

    click(harness, 'signInFailureClose');

    expect(latest(harness).account).toEqual(GUEST);
    expect(latest(harness).hover).toBeNull();
    expect(harness.closeSoundCount()).toBe(closeSounds + 1);
    error.mockRestore();
  });

  it.each([
    ['Enter', ENTER_KEY],
    ['Esc', ESCAPE_KEY],
  ] as const)('closes with %s', async (_name, key) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness(() => null);
    await failSignIn(harness);

    expect(harness.controller.captureKey(key)).toBe(true);
    expect(latest(harness).account).toEqual(GUEST);
    expect(harness.controller.captureKey(key)).toBe(false);
    error.mockRestore();
  });

  it('blocks other keys without changing the state', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness(() => null);
    await failSignIn(harness);
    const failed = latest(harness);

    expect(harness.controller.captureKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.captureKey(H_KEY)).toBe(true);
    expect(latest(harness)).toBe(failed);
    error.mockRestore();
  });

  it('keeps the notice board still while it is over the board', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness(() => null);
    clickAccount(harness);
    await arrive(harness);
    requireDefined(harness.signIns[0], 'Missing sign-in', 0).reject(new Error('popup closed'));
    await flush();
    const failed = latest(harness);
    expect(failed.noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });

    expect(harness.controller.captureKey(DOWN_KEY)).toBe(true);
    harness.controller.scrollNoticeBoard(NOTICE_SCROLL_STEP_PX);

    expect(latest(harness)).toBe(failed);
    error.mockRestore();
  });
});

describe('MainController notices', () => {
  it('opens the board on arrival when a notice has not been dismissed', async () => {
    const harness = createHarness(() => null, {}, { dismissedIds: new Set(['notice-a']) });

    await arrive(harness);

    expect(latest(harness).notices).toEqual({
      kind: 'ready',
      items: NOTICES,
      contentHeightPx: NOTICE_CONTENT_HEIGHT_PX,
    });
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });
    expect(harness.takeAutoOpenCount()).toBe(1);
  });

  it('shows only the icon when every notice has been dismissed', async () => {
    const harness = createHarness(
      () => null,
      {},
      { dismissedIds: new Set(['notice-a', 'notice-b']) },
    );

    await arrive(harness);

    expect(latest(harness).notices.kind).toBe('ready');
    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(harness.takeAutoOpenCount()).toBe(0);
  });

  it('shows no icon and no board without notices', async () => {
    const harness = createHarness(() => null);

    await arrive(harness, []);

    expect(harness.states).toHaveLength(1);
    expect(latest(harness).notices).toEqual({ kind: 'none' });
    expect(harness.takeAutoOpenCount()).toBe(0);
  });

  it('waits for the acceleration notice and opens the board when it closes', async () => {
    const harness = createHarness(() => null, { isSoftwareRendering: true });

    await arrive(harness);
    expect(latest(harness).noticeBoard).toEqual({ kind: 'due' });

    click(harness, 'accelerationNoticeAccept');

    expect(latest(harness).accelerationNotice).toEqual({ kind: 'closed' });
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });
  });

  it('drops notices that arrive after closing and leaves the auto open for the next main', async () => {
    const harness = createHarness(() => null);
    harness.controller.close();

    await arrive(harness);

    expect(harness.states).toHaveLength(1);
    expect(harness.takeAutoOpenCount()).toBe(0);
  });

  it('does not open the board while leaving', async () => {
    const harness = createHarness(() => null);
    harness.leave();

    await arrive(harness);

    expect(latest(harness).notices.kind).toBe('ready');
    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(harness.takeAutoOpenCount()).toBe(0);
  });

  it('does not open the board when this boot has already opened it', async () => {
    const harness = createHarness(() => null, {}, { isAutoOpenAvailable: false });

    await arrive(harness);

    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(harness.takeAutoOpenCount()).toBe(1);
  });

  it('opens the board from the icon and from the focused icon with confirm', async () => {
    const harness = createHarness(() => null, {}, { isAutoOpenAvailable: false });
    await arrive(harness);
    const clickSounds = harness.clickSoundCount();

    click(harness, 'notice');

    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });
    expect(harness.clickSoundCount()).toBe(clickSounds + 1);

    harness.controller.captureKey(ESCAPE_KEY);
    harness.controller.moveFocus('previous');
    harness.controller.moveFocus('previous');
    expect(latest(harness).focus).toBe('notice');
    harness.controller.confirm();

    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });
    expect(harness.activated).toEqual([]);
  });

  it('puts the icon before YouTube in the focus order once notices arrive', async () => {
    const harness = createHarness(() => null, {}, { isAutoOpenAvailable: false });
    await arrive(harness);

    const focuses = Array.from({ length: 6 }, () => {
      harness.controller.moveFocus('next');
      return latest(harness).focus;
    });

    expect(focuses).toEqual(['practice', 'settings', 'credits', 'notice', 'youtube', 'play']);
  });

  it.each([
    ['close button', (harness: Harness) => click(harness, 'noticeBoardClose')],
    ['Enter', (harness: Harness) => harness.controller.captureKey(ENTER_KEY)],
    ['Esc', (harness: Harness) => harness.controller.captureKey(ESCAPE_KEY)],
  ] as const)('closes with the %s without saving', async (_name, closeBoard) => {
    const harness = createHarness(() => null);
    await arrive(harness);
    const closeSounds = harness.closeSoundCount();

    closeBoard(harness);

    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(latest(harness).hover).toBeNull();
    expect(harness.closeSoundCount()).toBe(closeSounds + 1);
    expect(harness.dismissedNoticeIds).toEqual([]);
  });

  it('saves every notice on the board once and closes with dismiss', async () => {
    const harness = createHarness(() => null);
    await arrive(harness);

    click(harness, 'noticeBoardDismiss');

    expect(harness.dismissedNoticeIds).toEqual([['notice-b', 'notice-a']]);
    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(latest(harness).hover).toBeNull();
  });

  it('closes even when saving the dismissal fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness(
      () => null,
      {},
      {
        dismiss: () => {
          throw new Error('QuotaExceededError');
        },
      },
    );
    await arrive(harness);

    click(harness, 'noticeBoardDismiss');

    expect(harness.dismissedNoticeIds).toHaveLength(1);
    expect(latest(harness).noticeBoard).toEqual({ kind: 'closed' });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('scrolls with the up and down keys and the wheel within the content', async () => {
    const harness = createHarness(() => null);
    await arrive(harness);
    const maxScrollPx = NOTICE_CONTENT_HEIGHT_PX - NOTICE_VIEWPORT_HEIGHT_PX;

    expect(harness.controller.captureKey(UP_KEY)).toBe(true);
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: 0,
    });

    expect(harness.controller.captureKey(DOWN_KEY)).toBe(true);
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: NOTICE_SCROLL_STEP_PX,
    });

    harness.controller.scrollNoticeBoard(maxScrollPx * 2);
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: maxScrollPx,
    });

    harness.controller.captureKey(UP_KEY);
    expect(latest(harness).noticeBoard).toEqual({
      kind: 'open',
      scrollPx: maxScrollPx - NOTICE_SCROLL_STEP_PX,
    });
  });

  it('does not scroll content shorter than the board', async () => {
    const harness = createHarness(() => null, {}, { contentHeightPx: NOTICE_VIEWPORT_HEIGHT_PX });
    await arrive(harness);
    const opened = latest(harness);

    harness.controller.captureKey(DOWN_KEY);
    harness.controller.scrollNoticeBoard(NOTICE_SCROLL_STEP_PX);

    expect(latest(harness)).toBe(opened);
  });
});
