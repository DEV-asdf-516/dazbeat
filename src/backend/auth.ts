import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import type { AuthUser } from '../data/account.js';
import { isNickname } from '../data/nickname.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { isBoolean, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

// 같은 key 로 취소하고, 새 로그인이 시작되면 SDK 가 이전 로그인을 자동 취소하게 한다.
const GOOGLE_SIGN_IN_REQUEST_KEY = 'google-sign-in';
// 로그아웃·새 로그인이 진행 중인 갱신을 취소해 늦은 응답이 저장소를 덮어쓰지 못하게 한다.
const SESSION_REFRESH_REQUEST_KEY = 'session-refresh';
// 성공했을 때도 창이 닫히며 focus 가 오므로, 그 뒤의 code 교환 요청이 끝날 만큼 기다린다.
const POPUP_CLOSE_GRACE_MS = 2000;

export type FocusTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

function toAuthUser(record: RecordModel): AuthUser {
  const featuredAchievement = readRecordField(record, 'users', 'featuredAchievement', isString);
  return {
    id: readRecordField(record, 'users', 'id', isString),
    email: readRecordField(record, 'users', 'email', isString),
    nickname: readRecordField(record, 'users', 'nickname', isNickname),
    isEditor: readRecordField(record, 'users', 'isEditor', isBoolean),
    featuredAchievement: featuredAchievement === '' ? null : featuredAchievement,
  };
}

// 사용자 입력 이벤트 처리 안에서 호출해야 한다(브라우저 팝업 정책).
export async function signInWithGoogle(
  pb: PocketBase,
  focusTarget: FocusTarget,
): Promise<AuthUser | null> {
  pb.cancelRequest(SESSION_REFRESH_REQUEST_KEY);
  const stopWatching = cancelWhenFocusReturns(pb, focusTarget);
  try {
    const { record } = await pb.collection('users').authWithOAuth2({
      provider: 'google',
      requestKey: GOOGLE_SIGN_IN_REQUEST_KEY,
    });
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

export function cancelSignInWithGoogle(pb: PocketBase): void {
  pb.cancelRequest(GOOGLE_SIGN_IN_REQUEST_KEY);
}

export async function refreshCurrentUser(pb: PocketBase): Promise<AuthUser | null> {
  try {
    const { record } = await pb.collection('users').authRefresh({
      requestKey: SESSION_REFRESH_REQUEST_KEY,
    });
    return toAuthUser(record);
  } catch (error) {
    if (
      error instanceof ClientResponseError &&
      (error.status === HTTP_STATUS.unauthorized || error.status === HTTP_STATUS.forbidden)
    ) {
      pb.authStore.clear();
      return null;
    }
    throw error;
  }
}

export function signOut(pb: PocketBase): void {
  pb.cancelRequest(SESSION_REFRESH_REQUEST_KEY);
  pb.authStore.clear();
}

export function getCurrentUser(pb: PocketBase): AuthUser | null {
  const { record } = pb.authStore;
  if (!pb.authStore.isValid || record === null) {
    return null;
  }
  return toAuthUser(record);
}
