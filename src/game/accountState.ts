import type { AuthUser } from '../data/account.js';
import { isShallowEqual } from '../shallowEqual.js';

export type AccountState =
  | { readonly kind: 'guest'; readonly hasSignInFailed: boolean }
  | { readonly kind: 'signingIn' }
  | { readonly kind: 'signedIn'; readonly user: AuthUser };

export interface AccountAuth {
  getCurrentUser(): AuthUser | null;
  signIn(): Promise<AuthUser | null>;
  cancelSignIn(): void;
  signOut(): void;
  refresh(): Promise<AuthUser | null>;
}

function guest(hasSignInFailed: boolean): AccountState {
  return {
    kind: 'guest',
    hasSignInFailed,
  };
}

function whenCurrent(
  current: AccountState,
  attempt: AccountState,
  next: AccountState,
): AccountState {
  return current === attempt ? next : current;
}

export function createAccountState(user: AuthUser | null): AccountState {
  return user === null
    ? guest(false)
    : {
        kind: 'signedIn',
        user,
      };
}

/** 시도는 이 객체의 identity 로 식별하므로 시도마다 새로 만든다. */
export function startSignIn(): AccountState {
  return { kind: 'signingIn' };
}

export function completeSignIn(
  current: AccountState,
  attempt: AccountState,
  user: AuthUser,
): AccountState {
  return whenCurrent(current, attempt, {
    kind: 'signedIn',
    user,
  });
}

/** 취소는 실패가 아니므로 안내를 띄우지 않는다. */
export function cancelSignIn(current: AccountState, attempt: AccountState): AccountState {
  return whenCurrent(current, attempt, guest(false));
}

export function failSignIn(current: AccountState, attempt: AccountState): AccountState {
  return whenCurrent(current, attempt, guest(true));
}

/** 거절(`null`)은 저장된 세션이 무효가 된 것이라 실패 안내 없이 게스트로 둔다. */
export function completeRefresh(
  current: AccountState,
  attempt: AccountState,
  user: AuthUser | null,
): AccountState {
  if (current !== attempt) {
    return current;
  }
  if (user === null) {
    return guest(false);
  }
  if (attempt.kind === 'signedIn' && isShallowEqual(attempt.user, user)) {
    return current;
  }
  return {
    kind: 'signedIn',
    user,
  };
}

export function canOpenChartEditor(user: AuthUser | null): boolean {
  return user?.isEditor === true;
}

/** 세션 정리는 메인 화면의 복원 경로가 맡는다. */
export function canCurrentUserOpenChartEditor(auth: Pick<AccountAuth, 'getCurrentUser'>): boolean {
  let user: AuthUser | null;
  try {
    user = auth.getCurrentUser();
  } catch (error) {
    console.error('Failed to read signed-in user for chart editor', error);
    return false;
  }
  return canOpenChartEditor(user);
}
