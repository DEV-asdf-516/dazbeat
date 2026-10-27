import PocketBase from 'pocketbase';
import type { RecordAuthResponse, RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSignInWithGoogle,
  getCurrentUser,
  refreshCurrentUser,
  signInWithGoogle,
  signOut,
} from '../../src/backend/auth.js';

const USER_RECORD_WITHOUT_IS_EDITOR: RecordModel = {
  id: 'user1',
  collectionId: 'users_collection',
  collectionName: 'users',
  email: 'player@example.com',
  name: 'Player',
  nickname: 'Star',
  featuredAchievement: '',
  avatar: 'avatar.png',
  verified: true,
};

const USER_RECORD: RecordModel = {
  ...USER_RECORD_WITHOUT_IS_EDITOR,
  isEditor: false,
};

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(expSeconds: number): string {
  return `${base64Url({
    alg: 'HS256',
    typ: 'JWT',
  })}.${base64Url({ exp: expSeconds })}.signature`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function pendingUntilAbortFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

function stubBrowser(): { close: () => void } {
  const popup = { close: vi.fn() };
  vi.stubGlobal('window', {
    open: () => popup,
    innerWidth: 1280,
    innerHeight: 720,
  });
  vi.stubGlobal('fetch', pendingUntilAbortFetch);
  return popup;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getCurrentUser', () => {
  it('returns null without auth state', () => {
    const pb = new PocketBase('http://pb.test');

    expect(getCurrentUser(pb)).toBeNull();
  });

  it('returns only id, email, nickname, isEditor and the featured achievement of a valid auth record', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);

    expect(getCurrentUser(pb)).toEqual({
      id: 'user1',
      email: 'player@example.com',
      nickname: 'Star',
      isEditor: false,
      featuredAchievement: null,
    });
  });

  it('reads an unknown featured achievement as none and warns', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), {
      ...USER_RECORD,
      featuredAchievement: 'RETIRED_ACHIEVEMENT',
    });

    expect(getCurrentUser(pb)?.featuredAchievement).toBeNull();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it('returns null when the token is expired', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() - 3600), USER_RECORD);

    expect(getCurrentUser(pb)).toBeNull();
  });

  it('throws when a field of the auth record is not a string', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), {
      ...USER_RECORD,
      nickname: 7,
    });

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: nickname');
  });

  it('throws when the auth record has no nickname', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), {
      ...USER_RECORD,
      nickname: undefined,
    });

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: nickname');
  });

  it('returns isEditor true when the auth record is an editor', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), {
      ...USER_RECORD,
      isEditor: true,
    });

    expect(getCurrentUser(pb)?.isEditor).toBe(true);
  });

  it('throws when isEditor of the auth record is not a boolean', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), {
      ...USER_RECORD,
      isEditor: 'true',
    });

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: isEditor');
  });

  it('throws when the auth record has no isEditor', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD_WITHOUT_IS_EDITOR);

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: isEditor');
  });
});

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshCurrentUser', () => {
  it('sends the stored token to auth-refresh, stores the new session and returns its user', async () => {
    const pb = new PocketBase('http://pb.test');
    const storedToken = makeToken(nowSeconds() + 3600);
    const refreshedToken = makeToken(nowSeconds() + 7200);
    pb.authStore.save(storedToken, USER_RECORD);
    const fetchSpy = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          token: refreshedToken,
          record: {
            ...USER_RECORD,
            nickname: 'Nova',
            isEditor: true,
            featuredAchievement: 'FIRST_CLEAR',
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const user = await refreshCurrentUser(pb);

    const expectedUser = {
      id: 'user1',
      email: 'player@example.com',
      nickname: 'Nova',
      isEditor: true,
      featuredAchievement: 'FIRST_CLEAR',
    };
    expect(user).toEqual(expectedUser);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toEqual(
      expect.stringContaining('http://pb.test/api/collections/users/auth-refresh'),
    );
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe(storedToken);
    expect(pb.authStore.token).toBe(refreshedToken);
    expect(getCurrentUser(pb)).toEqual(expectedUser);
  });

  it.each([401, 403])('clears the stored session and returns null on %s', async (status) => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse(status, { message: 'rejected' })));

    await expect(refreshCurrentUser(pb)).resolves.toBeNull();
    expect(getCurrentUser(pb)).toBeNull();
  });

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => Promise.resolve(jsonResponse(500, { message: 'oops' }))],
  ])('rejects and keeps the stored session on %s', async (_label, fetchStub) => {
    const pb = new PocketBase('http://pb.test');
    const storedToken = makeToken(nowSeconds() + 3600);
    pb.authStore.save(storedToken, USER_RECORD);
    const user = getCurrentUser(pb);
    vi.stubGlobal('fetch', fetchStub);

    await expect(refreshCurrentUser(pb)).rejects.toThrow();
    expect(pb.authStore.token).toBe(storedToken);
    expect(getCurrentUser(pb)).toEqual(user);
  });

  it('rejects when the refreshed record cannot be parsed', async () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);
    const invalidRecord = { ...USER_RECORD };
    invalidRecord.nickname = 42;
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        jsonResponse(200, {
          token: makeToken(nowSeconds() + 7200),
          record: invalidRecord,
        }),
      ),
    );

    await expect(refreshCurrentUser(pb)).rejects.toThrow();
  });

  it('rejects and leaves the store empty when signing out during the refresh', async () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);
    vi.stubGlobal('fetch', pendingUntilAbortFetch);
    const refresh = refreshCurrentUser(pb);

    signOut(pb);

    await expect(refresh).rejects.toThrow();
    expect(pb.authStore.token).toBe('');
    expect(getCurrentUser(pb)).toBeNull();
  });

  it('rejects when a Google sign-in starts during the refresh', async () => {
    stubBrowser();
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);
    const refresh = refreshCurrentUser(pb);

    const signIn = signInWithGoogle(pb, new EventTarget());

    await expect(refresh).rejects.toThrow();
    cancelSignInWithGoogle(pb);
    await signIn;
  });
});

describe('signOut', () => {
  it('clears the current user', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);

    signOut(pb);

    expect(getCurrentUser(pb)).toBeNull();
  });
});

describe('signInWithGoogle', () => {
  it('authenticates with the google provider and returns the auth user', async () => {
    const pb = new PocketBase('http://pb.test');
    const response: RecordAuthResponse = {
      token: makeToken(nowSeconds() + 3600),
      record: USER_RECORD,
    };
    const spy = vi.spyOn(pb.collection('users'), 'authWithOAuth2').mockResolvedValue(response);

    await expect(signInWithGoogle(pb, new EventTarget())).resolves.toEqual({
      id: 'user1',
      email: 'player@example.com',
      nickname: 'Star',
      isEditor: false,
      featuredAchievement: null,
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });

  it.each([true, false])('returns isEditor %s from the auth record', async (isEditor) => {
    const pb = new PocketBase('http://pb.test');
    const response: RecordAuthResponse = {
      token: makeToken(nowSeconds() + 3600),
      record: {
        ...USER_RECORD,
        isEditor,
      },
    };
    vi.spyOn(pb.collection('users'), 'authWithOAuth2').mockResolvedValue(response);

    const user = await signInWithGoogle(pb, new EventTarget());

    expect(user?.isEditor).toBe(isEditor);
  });

  it('rejects when the SDK rejects', async () => {
    const pb = new PocketBase('http://pb.test');
    vi.spyOn(pb.collection('users'), 'authWithOAuth2').mockRejectedValue(
      new Error('popup blocked'),
    );

    await expect(signInWithGoogle(pb, new EventTarget())).rejects.toThrow('popup blocked');
  });
});

describe('signInWithGoogle after the sign-in window closes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels when the game window keeps focus for the grace period', async () => {
    vi.useFakeTimers();
    stubBrowser();
    const pb = new PocketBase('http://pb.test');
    const gameWindow = new EventTarget();
    const signIn = signInWithGoogle(pb, gameWindow);

    gameWindow.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(2000);

    await expect(signIn).resolves.toBeNull();
  });

  it('keeps waiting while the grace period has not passed', async () => {
    vi.useFakeTimers();
    stubBrowser();
    const pb = new PocketBase('http://pb.test');
    const gameWindow = new EventTarget();
    let isSettled = false;
    const signIn = signInWithGoogle(pb, gameWindow).finally(() => {
      isSettled = true;
    });

    gameWindow.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1999);

    expect(isSettled).toBe(false);
    cancelSignInWithGoogle(pb);
    await signIn;
  });

  it('keeps waiting when focus goes back to the sign-in window before the grace period ends', async () => {
    vi.useFakeTimers();
    stubBrowser();
    const pb = new PocketBase('http://pb.test');
    const gameWindow = new EventTarget();
    let isSettled = false;
    const signIn = signInWithGoogle(pb, gameWindow).finally(() => {
      isSettled = true;
    });

    gameWindow.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1000);
    gameWindow.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(isSettled).toBe(false);
    cancelSignInWithGoogle(pb);
    await signIn;
  });

  it('stops watching focus once the sign-in has finished', async () => {
    const pb = new PocketBase('http://pb.test');
    const response: RecordAuthResponse = {
      token: makeToken(nowSeconds() + 3600),
      record: USER_RECORD,
    };
    vi.spyOn(pb.collection('users'), 'authWithOAuth2').mockResolvedValue(response);
    const gameWindow = new EventTarget();
    const removeSpy = vi.spyOn(gameWindow, 'removeEventListener');

    await signInWithGoogle(pb, gameWindow);

    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
  });
});

describe('cancelSignInWithGoogle', () => {
  it('ends the pending sign-in with null, closes the popup and leaves no current user', async () => {
    const popup = stubBrowser();
    const pb = new PocketBase('http://pb.test');
    const signIn = signInWithGoogle(pb, new EventTarget());

    cancelSignInWithGoogle(pb);

    await expect(signIn).resolves.toBeNull();
    expect(popup.close).toHaveBeenCalled();
    expect(getCurrentUser(pb)).toBeNull();
  });

  it('keeps the current user when no sign-in is pending', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);
    const user = getCurrentUser(pb);

    expect(() => cancelSignInWithGoogle(pb)).not.toThrow();
    expect(getCurrentUser(pb)).toEqual(user);
  });
});
