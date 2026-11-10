import { findAchievement } from '../../../data/achievements.js';
import type { AchievementCatalog, NamedAchievementDefinition } from '../../../data/achievements.js';
import type { AuthUser } from '../../../data/account.js';
import { getButtonView, isButtonHovered, isButtonPressed } from './buttonPointer.js';
import type { ButtonView, PointerHover } from './buttonPointer.js';

export type AccountPanelButton = 'accountProfile';

export interface AccountIdentity {
  readonly nickname: string;
  readonly featuredAchievement: NamedAchievementDefinition | null;
  readonly email: string;
}

export interface AccountSource {
  getIdentity(): AccountIdentity | null;
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

/** 패널 버튼 영역의 변경 비교 값이다. 다른 버튼의 hover 로는 바뀌지 않는다. */
export function getAccountPanelPointerKey(hover: PointerHover): string {
  return `${isButtonHovered(hover, 'accountProfile')}:${isButtonPressed(hover, 'accountProfile')}`;
}

export function getAccountPanelButtonView(hover: PointerHover): ButtonView {
  return getButtonView(hover, 'accountProfile', true, false);
}
