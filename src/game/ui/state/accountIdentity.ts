import { findAchievement } from '../../../data/achievements.js';
import type { AchievementCatalog, NamedAchievementDefinition } from '../../../data/achievements.js';
import type { AuthUser } from '../../../data/account.js';
import { getButtonView, isButtonHovered, isButtonPressed, unhoverButton } from './buttonPointer.js';
import type { ButtonView, PointerHover } from './buttonPointer.js';
import { readMenuAction } from './menuAction.js';
import { readSignInFailure } from '../../app/accountState.js';
import type { SignInFailure } from '../../app/accountState.js';

export type AccountPanelButton = 'accountProfile' | 'accountSignIn';

export type AccountPanelButtonViews = Readonly<Record<AccountPanelButton, ButtonView>>;

/** Google 아이콘을 불러오지 못했을 때 아이콘 대신 쓰는 버튼 글자. */
export const GOOGLE_SIGN_IN_LABEL = 'SIGN IN WITH GOOGLE';

export interface AccountIdentity {
  readonly nickname: string;
  readonly featuredAchievement: NamedAchievementDefinition | null;
  readonly email: string;
}

export interface AccountSource {
  getIdentity(): AccountIdentity | null;
  signIn(): Promise<AuthUser | null>;
  readonly catalog: AchievementCatalog;
}

export function getAccountIdentity(user: AuthUser, catalog: AchievementCatalog): AccountIdentity {
  const { nickname, featuredAchievement, email } = user;
  return {
    nickname,
    // 계정 레코드는 카탈로그를 거치지 않아, 부팅 뒤 지워진 업적이면 장착 없음으로 그린다.
    featuredAchievement:
      featuredAchievement === null ? null : (findAchievement(catalog, featuredAchievement) ?? null),
    email,
  };
}

const ACCOUNT_PANEL_BUTTONS: readonly AccountPanelButton[] = ['accountProfile', 'accountSignIn'];

/** 패널 버튼 영역의 변경 비교 값이다. 다른 버튼의 hover 로는 바뀌지 않는다. */
export function getAccountPanelPointerKey(hover: PointerHover): string {
  return ACCOUNT_PANEL_BUTTONS.map(
    (button) => `${isButtonHovered(hover, button)}:${isButtonPressed(hover, button)}`,
  ).join('|');
}

export function getAccountPanelButtonView(hover: PointerHover): AccountPanelButtonViews {
  return {
    accountProfile: getButtonView(hover, 'accountProfile', true, false),
    accountSignIn: getButtonView(hover, 'accountSignIn', true, false),
  };
}

/** 로그인하면 Google 버튼이 숨어 Phaser 가 POINTER_OUT 을 보내지 않으므로 그 hover 를 푼다. */
export function completeAccountSignIn<S extends { readonly hover: PointerHover }>(state: S): S {
  return {
    ...state,
    hover: unhoverButton(state.hover, 'accountSignIn'),
  };
}

export type SignInFailureButton = 'signInFailureClose';

export interface SignInFailureFields {
  readonly signInFailure: SignInFailure | 'none';
  readonly hover: PointerHover;
}

export function failAccountSignIn<S extends SignInFailureFields>(state: S, error: unknown): S {
  return {
    ...state,
    signInFailure: readSignInFailure(error),
  };
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 팝업을 닫을 때 닫기 버튼의 hover 를 푼다.
export function closeSignInFailure<S extends SignInFailureFields>(state: S): S {
  if (state.signInFailure === 'none') {
    return state;
  }
  return {
    ...state,
    signInFailure: 'none',
    hover: unhoverButton(state.hover, 'signInFailureClose'),
  };
}

export function readSignInFailureKey(
  failure: SignInFailure | 'none',
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): 'close' | 'block' | 'pass' {
  if (failure === 'none') {
    return 'pass';
  }
  switch (readMenuAction(event)) {
    case 'confirm':
    case 'back':
      return 'close';
    default:
      return 'block';
  }
}

export function getSignInFailureButtonView(hover: PointerHover): ButtonView {
  return getButtonView(hover, 'signInFailureClose', true, false);
}
