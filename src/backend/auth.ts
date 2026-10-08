import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { isBoolean, isString, readRecordField } from './recordField.js';

// 같은 key 로 취소하고, 새 로그인이 시작되면 SDK 가 이전 로그인을 자동 취소하게 한다.
const GOOGLE_SIGN_IN_REQUEST_KEY = 'google-sign-in';
/**
 * 로그인 창이 닫혀 게임 창에 focus 가 돌아온 뒤, 이 시간 안에 로그인이 끝나지 않으면 취소한다.
 * 성공했을 때도 창이 닫히며 focus 가 오므로, 그 뒤의 code 교환 요청이 끝날 만큼 기다린다.
 */
const POPUP_CLOSE_GRACE_MS = 2000;

/** 로그인 창 닫힘을 알아채는 데 쓰는 게임 창. 테스트에서는 대역을 넘긴다. */
export type FocusTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isEditor: boolean;
}

function toAuthUser(record: RecordModel): AuthUser {
  return {
    id: readRecordField(record, 'users', 'id', isString),
    email: readRecordField(record, 'users', 'email', isString),
    name: readRecordField(record, 'users', 'name', isString),
    isEditor: readRecordField(record, 'users', 'isEditor', isBoolean),
  };
}

/**
 * Google OAuth2 로 로그인한다. 사용자가 로그인 창을 닫거나 cancelSignInWithGoogle 로 취소하면 null 이다.
 * 사용자 입력 이벤트 처리 안에서 호출해야 한다(브라우저 팝업 정책).
 */
export async function signInWithGoogle(
  pb: PocketBase,
  focusTarget: FocusTarget,
): Promise<AuthUser | null> {
  const stopWatching = cancelWhenFocusReturns(pb, focusTarget);
  try {
    const { record } = await pb
      .collection('users')
      .authWithOAuth2({ provider: 'google', requestKey: GOOGLE_SIGN_IN_REQUEST_KEY });
    return toAuthUser(record);
  } catch (error) {
    if (error instanceof ClientResponseError && error.isAbort) {
      return null;
    }
    throw error;
  } finally {
    stopWatching();
  }
}

/**
 * Google 로그인 페이지의 COOP 때문에 popup.closed 는 창이 열려 있어도 true 가 되어 닫힘을 직접 알 수 없다.
 * 대신 게임 창이 focus 를 되찾고 POPUP_CLOSE_GRACE_MS 동안 그대로면 창이 닫힌 것으로 보고 취소한다.
 * 그사이 다시 로그인 창으로 focus 가 가면(blur) 기다림을 거둔다.
 */
function cancelWhenFocusReturns(pb: PocketBase, focusTarget: FocusTarget): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const onFocus = (): void => {
    clearTimer();
    timer = setTimeout(() => cancelSignInWithGoogle(pb), POPUP_CLOSE_GRACE_MS);
  };
  focusTarget.addEventListener('focus', onFocus);
  focusTarget.addEventListener('blur', clearTimer);
  return () => {
    clearTimer();
    focusTarget.removeEventListener('focus', onFocus);
    focusTarget.removeEventListener('blur', clearTimer);
  };
}

/**
 * 진행 중인 Google 로그인을 취소한다. 진행 중인 로그인이 없으면 아무 일도 하지 않는다.
 * 취소된 signInWithGoogle 은 null 로 끝난다. 로그인 창 닫힘은 signInWithGoogle 이 스스로 이 함수로 취소한다.
 */
export function cancelSignInWithGoogle(pb: PocketBase): void {
  pb.cancelRequest(GOOGLE_SIGN_IN_REQUEST_KEY);
}

export function signOut(pb: PocketBase): void {
  pb.authStore.clear();
}

export function getCurrentUser(pb: PocketBase): AuthUser | null {
  const { record } = pb.authStore;
  if (!pb.authStore.isValid || record === null) {
    return null;
  }
  return toAuthUser(record);
}
