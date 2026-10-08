import type { AuthUser } from '../backend/auth.js';

export type AccountState =
  | { readonly kind: 'guest'; readonly hasSignInFailed: boolean }
  | { readonly kind: 'signingIn' }
  | { readonly kind: 'signedIn'; readonly user: AuthUser };

/** main.ts 가 같은 PocketBase client 에 묶어 주입하는 Auth 동작. */
export interface AccountAuth {
  getCurrentUser(): AuthUser | null;
  /** 사용자가 로그인 창을 닫는 등 취소되면 null 이다. */
  signIn(): Promise<AuthUser | null>;
  cancelSignIn(): void;
  signOut(): void;
}

export function createAccountState(user: AuthUser | null): AccountState {
  return user === null ? { kind: 'guest', hasSignInFailed: false } : { kind: 'signedIn', user };
}

/** 시도는 이 객체의 identity 로 식별하므로 시도마다 새로 만든다. */
export function startSignIn(): AccountState {
  return { kind: 'signingIn' };
}

/** 시도를 시작한 signingIn 상태가 아직 현재 상태일 때만 로그인 성공을 반영한다. */
export function completeSignIn(
  current: AccountState,
  attempt: AccountState,
  user: AuthUser,
): AccountState {
  return current === attempt ? { kind: 'signedIn', user } : current;
}

/** 시도를 시작한 signingIn 상태가 아직 현재 상태일 때만 취소를 반영한다. 취소는 실패가 아니므로 안내를 띄우지 않는다. */
export function cancelSignIn(current: AccountState, attempt: AccountState): AccountState {
  return current === attempt ? { kind: 'guest', hasSignInFailed: false } : current;
}

/** 시도를 시작한 signingIn 상태가 아직 현재 상태일 때만 로그인 실패를 반영한다. */
export function failSignIn(current: AccountState, attempt: AccountState): AccountState {
  return current === attempt ? { kind: 'guest', hasSignInFailed: true } : current;
}

/** Editor 메뉴 노출과 Editor 화면 진입이 함께 쓰는 유일한 권한 판정. */
export function canOpenChartEditor(user: AuthUser | null): boolean {
  return user?.isEditor === true;
}

/**
 * Editor 화면(곡 목록·편집)에 들어갈 때의 판정. 사용자를 읽지 못하면 권한 있음으로 취급하지 않는다.
 * 세션 정리는 메인 화면의 복원 경로가 맡는다.
 */
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
