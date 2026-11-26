import { describe, expect, it, vi } from 'vitest';
import { AccountRejoinBlockedError } from '../../../src/data/account.js';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Song } from '../../../src/data/songs.js';
import { CreditsController } from '../../../src/game/credits/CreditsController.js';
import { getChangedRegions } from '../../../src/game/credits/state/creditsState.js';
import type {
  CreditsGrid,
  CreditsLink,
  CreditsState,
} from '../../../src/game/credits/state/creditsState.js';
import { requireDefined } from '../../../src/invariant.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';

function makeSong(index: number, credit?: readonly string[]): Song {
  return {
    id: `song-${index}`,
    title: `Title ${index}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${index}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    charts: {},
    ...(credit === undefined ? {} : { credit }),
  };
}

function creditedSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, index) => makeSong(index, [`Artist ${index}`]));
}

const GRID: CreditsGrid = {
  columnCount: 2,
  visibleRowCount: 2,
  lineCount: 2,
};
const ROW_PX = 100;
const USER: AuthUser = {
  id: 'user1',
  email: 'player@example.com',
  nickname: requireDefined(parseNickname('Star'), 'Invalid test nickname', 'Star'),
  isEditor: false,
  featuredAchievement: null,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Harness {
  readonly controller: CreditsController;
  readonly renders: { previous: CreditsState | null; next: CreditsState }[];
  setSongs(songs: readonly Song[]): void;
  requestRemainingCount(): number;
  leaveCount(): number;
  clickSoundCount(): number;
  closeSoundCount(): number;
  profileOpenCount(): number;
  signInCount(): number;
  accountRenderCount(): number;
  readonly openedLinks: CreditsLink[];
}

function createHarness(
  initialSongs: readonly Song[],
  signIn: () => Promise<AuthUser | null> = () => Promise.resolve(null),
): Harness {
  const renders: { previous: CreditsState | null; next: CreditsState }[] = [];
  const listeners = new Set<() => void>();
  let songs = initialSongs;
  let requestRemainingCount = 0;
  let leaveCount = 0;
  let profileOpenCount = 0;
  let signInCount = 0;
  let accountRenderCount = 0;
  const sounds: SoundEffect[] = [];
  const openedLinks: CreditsLink[] = [];
  const controller = new CreditsController(
    {
      get songs() {
        return songs;
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      requestRemaining: () => {
        requestRemainingCount += 1;
        return Promise.resolve();
      },
    },
    {
      render: (previous, next) =>
        renders.push({
          previous,
          next,
        }),
      playSound: (sound) => sounds.push(sound),
      leave: () => {
        leaveCount += 1;
      },
      openProfile: () => {
        profileOpenCount += 1;
      },
      renderAccount: () => {
        accountRenderCount += 1;
      },
      openLink: (link) => openedLinks.push(link),
    },
    GRID,
    ROW_PX,
    {
      signIn: () => {
        signInCount += 1;
        return signIn();
      },
    },
  );
  controller.start();
  return {
    controller,
    renders,
    setSongs: (next) => {
      songs = next;
      listeners.forEach((listener) => listener());
    },
    requestRemainingCount: () => requestRemainingCount,
    leaveCount: () => leaveCount,
    clickSoundCount: () => sounds.filter((sound) => sound === 'click').length,
    closeSoundCount: () => sounds.filter((sound) => sound === 'close').length,
    profileOpenCount: () => profileOpenCount,
    signInCount: () => signInCount,
    accountRenderCount: () => accountRenderCount,
    openedLinks,
  };
}

function lastRender(harness: Harness): { previous: CreditsState | null; next: CreditsState } {
  return requireDefined(harness.renders.at(-1), 'Missing render', harness.renders.length);
}

describe('CreditsController', () => {
  it('renders once without songs and requests the remaining songs', () => {
    const harness = createHarness([]);

    expect(harness.renders).toHaveLength(1);
    const first = lastRender(harness);
    expect(first.previous).toBeNull();
    expect(harness.requestRemainingCount()).toBe(1);
  });

  it('renders again when songs with credits arrive', () => {
    const harness = createHarness(creditedSongs(1));
    const first = lastRender(harness).next;

    harness.setSongs(creditedSongs(3));

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).previous).toBe(first);
    expect(lastRender(harness).next.entries).toHaveLength(3);
  });

  it('paints no region when only songs without credits arrive', () => {
    const harness = createHarness(creditedSongs(1));

    harness.setSongs([...creditedSongs(1), makeSong(1)]);

    const last = lastRender(harness);
    expect(getChangedRegions(last.previous, last.next)).toEqual([]);
  });

  it('advances the read position over songs without credits', () => {
    const harness = createHarness(creditedSongs(1));
    harness.setSongs([...creditedSongs(1), makeSong(1)]);

    harness.setSongs([...creditedSongs(1), makeSong(1), makeSong(2, ['Artist 2'])]);

    expect(harness.renders).toHaveLength(3);
    expect(lastRender(harness).next.entries).toHaveLength(2);
    expect(lastRender(harness).next.readSongCount).toBe(3);
  });

  it('scrolls one row for a wheel of at least one row', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(ROW_PX, 0);

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('ignores a wheel smaller than the start ratio', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);

    expect(harness.renders).toHaveLength(1);
  });

  it('accumulates wheels within the gesture gap', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);
    harness.controller.scrollByWheel(10, 100);

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('starts a new gesture after the gesture gap', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);
    harness.controller.scrollByWheel(10, 200);

    expect(harness.renders).toHaveLength(1);
  });

  it('does not scroll past the edges with keys', () => {
    // 6개 항목은 2열로 3행이고, 2행이 보이므로 마지막 시작 행은 1이다.
    const harness = createHarness(creditedSongs(6));

    harness.controller.scroll(-1);
    expect(harness.renders).toHaveLength(1);

    harness.controller.scroll(1);
    harness.controller.scroll(1);
    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('leaves on back', () => {
    const harness = createHarness([]);

    harness.controller.back();

    expect(harness.leaveCount()).toBe(1);
  });

  it('ignores songs after close', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.close();
    harness.setSongs(creditedSongs(8));

    expect(harness.renders).toHaveLength(1);
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

describe('CreditsController controls', () => {
  it('plays the click sound when H opens the controls', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.handleControlsKey(H_KEY);

    expect(harness.clickSoundCount()).toBe(1);
  });
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness(creditedSongs(6));

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(lastRender(harness).next.controls).toBe('open');
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(lastRender(harness).next.controls).toBe('closed');
    harness.controller.handleControlsKey(H_KEY);
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(lastRender(harness).next.controls).toBe('closed');
  });

  it('ignores wheels while the controls are open', () => {
    const harness = createHarness(creditedSongs(6));
    harness.controller.handleControlsKey(H_KEY);
    const renderCount = harness.renders.length;

    harness.controller.scrollByWheel(ROW_PX, 0);

    expect(harness.renders).toHaveLength(renderCount);
  });
});

describe('CreditsController button pointer', () => {
  it('runs the button once for over, down and up on it', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerUp('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(1);
  });

  it.each(['contact', 'privacy'] as const)(
    'opens the %s link once with a click sound for over, down and up on it',
    (link) => {
      const harness = createHarness([]);

      harness.controller.pointerOver(link);
      harness.controller.pointerDown(link);
      harness.controller.pointerUp(link);
      harness.controller.pointerUp(link);

      expect(harness.openedLinks).toEqual([link]);
      expect(harness.clickSoundCount()).toBe(1);
      expect(harness.leaveCount()).toBe(0);
    },
  );

  it.each(['contact', 'privacy'] as const)(
    'does not open the %s link for an up that was pressed elsewhere',
    (link) => {
      const harness = createHarness([]);

      harness.controller.pointerOver(link);
      harness.controller.pointerUp(link);

      expect(harness.openedLinks).toEqual([]);
      expect(harness.clickSoundCount()).toBe(0);
    },
  );

  it('does not run the button for an up that was pressed elsewhere', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerOut('back');
    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
    expect(lastRender(harness).next.hover).toEqual({
      kind: 'button',
      button: 'back',
      isPressed: false,
    });
  });

  it('opens with the entry and closes with the close button and the backdrop', () => {
    const harness = createHarness([]);

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(lastRender(harness).next.controls).toBe('open');

    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(lastRender(harness).next.controls).toBe('closed');

    harness.controller.handleControlsKey(H_KEY);
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(lastRender(harness).next.controls).toBe('closed');
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = createHarness([]);
    harness.controller.handleControlsKey(H_KEY);
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(lastRender(harness).next.hover).toBeNull();
  });

  it('opens the profile from the account panel', () => {
    const harness = createHarness([]);

    harness.controller.pointerDown('accountProfile');
    harness.controller.pointerUp('accountProfile');
    expect(harness.profileOpenCount()).toBe(1);
    expect(harness.leaveCount()).toBe(0);
    expect(harness.clickSoundCount()).toBe(1);
  });

  it('signs in from the guest account button and redraws the account', async () => {
    const harness = createHarness([], () => Promise.resolve(USER));

    harness.controller.pointerOver('accountSignIn');
    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    expect(harness.signInCount()).toBe(1);
    expect(harness.clickSoundCount()).toBe(1);
    await flush();

    expect(harness.accountRenderCount()).toBe(1);
    expect(lastRender(harness).next.hover).toBeNull();
  });

  it('keeps the guest account without a popup when sign-in is cancelled', async () => {
    const harness = createHarness([], () => Promise.resolve(null));

    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    await flush();

    expect(harness.signInCount()).toBe(1);
    expect(harness.accountRenderCount()).toBe(0);
    expect(lastRender(harness).next.signInFailure).toBe('none');
  });

  it('ignores a sign-in that finishes after the credits closed', async () => {
    const harness = createHarness([], () => Promise.resolve(USER));

    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    harness.controller.close();
    await flush();

    expect(harness.accountRenderCount()).toBe(0);
  });
});

const ENTER_KEY = {
  code: 'Enter',
  repeat: false,
};

describe('CreditsController sign-in failure', () => {
  interface Pending {
    readonly promise: Promise<AuthUser | null>;
    reject(error: unknown): void;
  }

  function pendingSignIns(): {
    readonly responses: Pending[];
    readonly signIn: () => Promise<AuthUser | null>;
  } {
    const responses: Pending[] = [];
    return {
      responses,
      signIn: () => {
        let reject: (error: unknown) => void = () => {};
        const promise = new Promise<AuthUser | null>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        });
        responses.push({
          promise,
          reject,
        });
        return promise;
      },
    };
  }

  function response(responses: readonly Pending[], index: number): Pending {
    return requireDefined(responses[index], 'Missing sign-in', index);
  }

  function clickSignIn(harness: Harness): void {
    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
  }

  async function failedHarness(songs: readonly Song[] = []): Promise<Harness> {
    const { responses, signIn } = pendingSignIns();
    const harness = createHarness(songs, signIn);
    clickSignIn(harness);
    response(responses, 0).reject(new Error('popup closed'));
    await flush();
    return harness;
  }

  it.each([
    ['an error', new Error('popup closed'), 'failed'],
    [
      'a deleted account',
      new AccountRejoinBlockedError(new Error('account_rejoin_blocked')),
      'rejoinBlocked',
    ],
  ] as const)(
    'opens the popup when the sign-in is rejected with %s',
    async (_name, error, kind) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { responses, signIn } = pendingSignIns();
      const harness = createHarness([], signIn);
      clickSignIn(harness);

      response(responses, 0).reject(error);
      await flush();

      expect(lastRender(harness).next.signInFailure).toBe(kind);
      expect(consoleError).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    },
  );

  it('closes with its button, releases its hover and plays the close sound', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();

    harness.controller.pointerOver('signInFailureClose');
    harness.controller.pointerDown('signInFailureClose');
    harness.controller.pointerUp('signInFailureClose');

    expect(lastRender(harness).next.signInFailure).toBe('none');
    expect(lastRender(harness).next.hover).toBeNull();
    expect(harness.closeSoundCount()).toBe(1);
    consoleError.mockRestore();
  });

  it.each([
    ['Enter', ENTER_KEY],
    ['Esc', ESCAPE_KEY],
  ] as const)('closes with %s', async (_name, key) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();

    expect(harness.controller.captureKey(key)).toBe(true);
    expect(lastRender(harness).next.signInFailure).toBe('none');
    expect(harness.controller.captureKey(key)).toBe(false);
    consoleError.mockRestore();
  });

  it('blocks other keys without changing the state', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();
    const renderCount = harness.renders.length;

    expect(harness.controller.captureKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.captureKey(H_KEY)).toBe(true);

    expect(harness.renders).toHaveLength(renderCount);
    expect(lastRender(harness).next.signInFailure).toBe('failed');
    consoleError.mockRestore();
  });

  it('ignores wheels while the popup is open', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness(creditedSongs(6));
    const renderCount = harness.renders.length;

    harness.controller.scrollByWheel(ROW_PX, 0);

    expect(harness.renders).toHaveLength(renderCount);
    expect(lastRender(harness).next.topRow).toBe(0);
    consoleError.mockRestore();
  });

  it('ignores a rejection that arrives after closing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { responses, signIn } = pendingSignIns();
    const harness = createHarness([], signIn);
    clickSignIn(harness);
    harness.controller.close();
    const renderCount = harness.renders.length;

    response(responses, 0).reject(new Error('popup closed'));
    await flush();

    expect(harness.renders).toHaveLength(renderCount);
    consoleError.mockRestore();
  });

  it('ignores a late rejection of an earlier attempt', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { responses, signIn } = pendingSignIns();
    const harness = createHarness([], signIn);
    clickSignIn(harness);
    clickSignIn(harness);

    response(responses, 0).reject(new Error('popup closed'));
    await flush();

    expect(lastRender(harness).next.signInFailure).toBe('none');

    response(responses, 1).reject(new Error('popup closed'));
    await flush();

    expect(lastRender(harness).next.signInFailure).toBe('failed');
    consoleError.mockRestore();
  });
});
