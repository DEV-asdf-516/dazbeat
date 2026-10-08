import PocketBase from 'pocketbase';
import type { RecordAuthResponse, RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSignInWithGoogle,
  getCurrentUser,
  signInWithGoogle,
  signOut,
} from '../../src/backend/auth.js';

const USER_RECORD_WITHOUT_IS_EDITOR: RecordModel = {
  id: 'user1',
  collectionId: 'users_collection',
  collectionName: 'users',
  email: 'player@example.com',
  name: 'Player',
  avatar: 'avatar.png',
  verified: true,
};

const USER_RECORD: RecordModel = { ...USER_RECORD_WITHOUT_IS_EDITOR, isEditor: false };

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(expSeconds: number): string {
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ exp: expSeconds })}.signature`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** abort 되기 전에는 끝나지 않는 fetch: 서버 없이 진행 중인 요청을 만든다. */
function pendingUntilAbortFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

function stubBrowser(): { close: () => void } {
  const popup = { close: vi.fn() };
  vi.stubGlobal('window', { open: () => popup, innerWidth: 1280, innerHeight: 720 });
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

  it('returns only id, email, name and isEditor of a valid auth record', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD);

    expect(getCurrentUser(pb)).toEqual({
      id: 'user1',
      email: 'player@example.com',
      name: 'Player',
      isEditor: false,
    });
  });

  it('returns null when the token is expired', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() - 3600), USER_RECORD);

    expect(getCurrentUser(pb)).toBeNull();
  });

  it('throws when a field of the auth record is not a string', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), { ...USER_RECORD, name: 7 });

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: name');
  });

  it('returns isEditor true when the auth record is an editor', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), { ...USER_RECORD, isEditor: true });

    expect(getCurrentUser(pb)?.isEditor).toBe(true);
  });

  it('throws when isEditor of the auth record is not a boolean', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), { ...USER_RECORD, isEditor: 'true' });

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: isEditor');
  });

  it('throws when the auth record has no isEditor', () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(makeToken(nowSeconds() + 3600), USER_RECORD_WITHOUT_IS_EDITOR);

    expect(() => getCurrentUser(pb)).toThrow('Invalid users record user1: isEditor');
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
      name: 'Player',
      isEditor: false,
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });

  it.each([true, false])('returns isEditor %s from the auth record', async (isEditor) => {
    const pb = new PocketBase('http://pb.test');
    const response: RecordAuthResponse = {
      token: makeToken(nowSeconds() + 3600),
      record: { ...USER_RECORD, isEditor },
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
