import { ACHIEVEMENTS, ACHIEVEMENT_SETS } from '../../data/achievements.js';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementSet,
} from '../../data/achievements.js';
import { parseNickname } from '../../data/nickname.js';
import type { Nickname } from '../../data/nickname.js';
import type { NicknameChangeFailure, Profile } from '../../data/profile.js';
import { requireDefined } from '../../invariant.js';
import { clamp, cycleItem, stepItem } from '../../range.js';
import type { TabAppearance } from '../ui/TextTabs.js';

type ProfilePage = 'summary' | 'collection';

export type NicknameEdit =
  | { readonly kind: 'idle' }
  | { readonly kind: 'editing'; readonly error: NicknameChangeFailure | null }
  | { readonly kind: 'saving' };

export type SummaryTab = 'stats' | 'collection';

export type SummaryFocus = 'nickname' | AchievementSet;

export type FeaturedSave = 'idle' | 'saving' | 'failed';

export type ProfileHover =
  | { readonly kind: 'nickname' }
  | { readonly kind: 'summaryTab'; readonly tab: SummaryTab }
  | { readonly kind: 'setRow'; readonly set: AchievementSet }
  | { readonly kind: 'collectionTab'; readonly set: AchievementSet };

export interface LoadedProfileState {
  readonly kind: 'loaded';
  readonly profile: Profile;
  readonly view: ProfilePage;
  readonly summaryTab: SummaryTab;
  readonly summaryFocus: SummaryFocus;
  readonly collection: { readonly set: AchievementSet; readonly focusedId: AchievementId };
  readonly nickname: NicknameEdit;
  readonly featuredSave: FeaturedSave;
  readonly hover: ProfileHover | null;
}

export type ProfileState =
  | { readonly kind: 'guest' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | LoadedProfileState;

export type FocusDirection = 'up' | 'down' | 'left' | 'right';

export type ProfileSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'state'; readonly state: LoadedProfileState }
  | { readonly kind: 'saveFeatured'; readonly id: AchievementId | null };

export type NicknameInputChange =
  | { readonly kind: 'none' }
  | { readonly kind: 'state'; readonly state: LoadedProfileState }
  | { readonly kind: 'check'; readonly state: LoadedProfileState; readonly nickname: Nickname };

export type NicknameSubmission =
  | { readonly kind: 'none' }
  | { readonly kind: 'state'; readonly state: LoadedProfileState }
  | { readonly kind: 'save'; readonly state: LoadedProfileState; readonly nickname: Nickname };

export type ProfileBack =
  { readonly kind: 'state'; readonly state: LoadedProfileState } | { readonly kind: 'leave' };

const SUMMARY_FOCUS_ORDER: Readonly<Record<SummaryTab, readonly SummaryFocus[]>> = {
  stats: ['nickname'],
  collection: ['nickname', ...ACHIEVEMENT_SETS],
};

const IDLE_NICKNAME: NicknameEdit = { kind: 'idle' };
const SAVING_NICKNAME: NicknameEdit = { kind: 'saving' };

export function getCollectionRows(
  set: AchievementSet,
): readonly (readonly AchievementDefinition[])[] {
  const rows: AchievementDefinition[][] = [];
  ACHIEVEMENTS.filter((achievement) => achievement.set === set).forEach((achievement) => {
    const last = rows.at(-1);
    if (last?.[0]?.category === achievement.category) {
      last.push(achievement);
    } else {
      rows.push([achievement]);
    }
  });
  return rows;
}

function firstAchievementOf(set: AchievementSet): AchievementId {
  return requireDefined(getCollectionRows(set)[0]?.[0], 'Achievement set is empty', set).id;
}

export function loadedState(profile: Profile): LoadedProfileState {
  const set = requireDefined(ACHIEVEMENT_SETS[0], 'Achievement sets are empty');
  return {
    kind: 'loaded',
    profile,
    view: 'summary',
    summaryTab: 'stats',
    summaryFocus: 'nickname',
    collection: {
      set,
      focusedId: firstAchievementOf(set),
    },
    nickname: IDLE_NICKNAME,
    featuredSave: 'idle',
    hover: null,
  };
}

function withCollection(
  state: LoadedProfileState,
  set: AchievementSet,
  focusedId: AchievementId,
): LoadedProfileState {
  if (state.collection.set === set && state.collection.focusedId === focusedId) {
    return state;
  }
  return {
    ...state,
    collection: {
      set,
      focusedId,
    },
  };
}

function moveCollectionFocus(
  state: LoadedProfileState,
  direction: FocusDirection,
): LoadedProfileState {
  const rows = getCollectionRows(state.collection.set);
  const rowIndex = rows.findIndex((row) => row.some(({ id }) => id === state.collection.focusedId));
  const row = requireDefined(
    rows[rowIndex],
    'Focused achievement is not in the set',
    state.collection.focusedId,
  );
  const columnIndex = row.findIndex(({ id }) => id === state.collection.focusedId);
  if (direction === 'left' || direction === 'right') {
    const next = stepItem(
      row,
      requireDefined(row[columnIndex], 'Focused column is missing'),
      direction === 'left' ? -1 : 1,
    );
    return withCollection(state, state.collection.set, next.id);
  }
  const nextRow = cycleItem(rows, row, direction === 'up' ? -1 : 1);
  const next = requireDefined(
    nextRow[clamp(columnIndex, 0, nextRow.length - 1)],
    'Collection row is empty',
  );
  return withCollection(state, state.collection.set, next.id);
}

export function moveFocus(
  state: LoadedProfileState,
  direction: FocusDirection,
): LoadedProfileState {
  // 편집 중 화살표는 입력란 캐럿 이동이라 포커스를 옮기지 않는다.
  if (state.nickname.kind !== 'idle') {
    return state;
  }
  if (state.view === 'collection') {
    return moveCollectionFocus(state, direction);
  }
  if (direction === 'left' || direction === 'right') {
    return selectSummaryTab(state, direction === 'left' ? 'stats' : 'collection');
  }
  const summaryFocus = cycleItem(
    SUMMARY_FOCUS_ORDER[state.summaryTab],
    state.summaryFocus,
    direction === 'up' ? -1 : 1,
  );
  return summaryFocus === state.summaryFocus
    ? state
    : {
        ...state,
        summaryFocus,
      };
}

export function selectSummaryTab(state: LoadedProfileState, tab: SummaryTab): LoadedProfileState {
  if (state.view !== 'summary' || state.nickname.kind !== 'idle' || state.summaryTab === tab) {
    return state;
  }
  // 세트 줄은 컬렉션 탭에만 있어 탭을 바꾸면 포커스는 두 탭에 공통인 닉네임으로 돌아가고,
  // 숨겨진 세트 줄은 POINTER_OUT 을 받지 못해 그 hover 를 직접 푼다.
  return {
    ...state,
    summaryTab: tab,
    summaryFocus: 'nickname',
    hover: state.hover?.kind === 'setRow' ? null : state.hover,
  };
}

export function switchSet(state: LoadedProfileState, delta: -1 | 1): LoadedProfileState {
  if (state.view !== 'collection') {
    return state;
  }
  const set = cycleItem(ACHIEVEMENT_SETS, state.collection.set, delta);
  return withCollection(state, set, firstAchievementOf(set));
}

export function selectSet(state: LoadedProfileState, set: AchievementSet): LoadedProfileState {
  if (state.view !== 'collection' || state.collection.set === set) {
    return state;
  }
  return withCollection(state, set, firstAchievementOf(set));
}

export function focusAchievement(state: LoadedProfileState, id: AchievementId): LoadedProfileState {
  if (
    state.view !== 'collection' ||
    !ACHIEVEMENTS.some(
      (achievement) => achievement.id === id && achievement.set === state.collection.set,
    )
  ) {
    return state;
  }
  return withCollection(state, state.collection.set, id);
}

function openCollection(state: LoadedProfileState, set: AchievementSet): LoadedProfileState {
  return {
    ...withCollection(state, set, firstAchievementOf(set)),
    view: 'collection',
    summaryFocus: set,
    featuredSave: 'idle',
    hover: null,
  };
}

const NO_SELECTION: ProfileSelection = { kind: 'none' };

// 포인터는 가리킨 요약 항목을 넘겨 포커스 이동과 선택을 한 번에 한다.
export function selectFocused(state: LoadedProfileState, target?: SummaryFocus): ProfileSelection {
  if (state.nickname.kind !== 'idle' || state.featuredSave === 'saving') {
    return NO_SELECTION;
  }
  if (state.view === 'summary') {
    const focus = target ?? state.summaryFocus;
    return {
      kind: 'state',
      state:
        focus === 'nickname'
          ? startNicknameEdit({
              ...state,
              summaryFocus: focus,
            })
          : openCollection(state, focus),
    };
  }
  const id = state.collection.focusedId;
  if (!isEarned(state, id)) {
    return NO_SELECTION;
  }
  return {
    kind: 'saveFeatured',
    id: state.profile.featuredAchievement === id ? null : id,
  };
}

export function closeCollection(state: LoadedProfileState): LoadedProfileState {
  return state.view === 'summary'
    ? state
    : {
        ...state,
        view: 'summary',
        hover: null,
      };
}

export function setHover(state: LoadedProfileState, target: ProfileHover): LoadedProfileState {
  return isSameHover(state.hover, target)
    ? state
    : {
        ...state,
        hover: target,
      };
}

export function clearHover(state: LoadedProfileState, target: ProfileHover): LoadedProfileState {
  return isSameHover(state.hover, target)
    ? {
        ...state,
        hover: null,
      }
    : state;
}

function startNicknameEdit(state: LoadedProfileState): LoadedProfileState {
  return {
    ...state,
    nickname: {
      kind: 'editing',
      error: null,
    },
  };
}

export function cancelNicknameEdit(state: LoadedProfileState): LoadedProfileState {
  return state.nickname.kind === 'idle'
    ? state
    : {
        ...state,
        nickname: IDLE_NICKNAME,
      };
}

export function failNicknameEdit(
  state: LoadedProfileState,
  error: NicknameChangeFailure,
): LoadedProfileState {
  if (state.nickname.kind === 'editing' && state.nickname.error === error) {
    return state;
  }
  return {
    ...state,
    nickname: {
      kind: 'editing',
      error,
    },
  };
}

export function clearNicknameError(state: LoadedProfileState): LoadedProfileState {
  return state.nickname.kind === 'editing' && state.nickname.error !== null
    ? {
        ...state,
        nickname: {
          kind: 'editing',
          error: null,
        },
      }
    : state;
}

export function startNicknameSave(state: LoadedProfileState): LoadedProfileState {
  return {
    ...state,
    nickname: SAVING_NICKNAME,
  };
}

export function saveNickname(state: LoadedProfileState, nickname: string): LoadedProfileState {
  return {
    ...state,
    profile: {
      ...state.profile,
      nickname,
    },
    nickname: IDLE_NICKNAME,
  };
}

export function startFeaturedSave(state: LoadedProfileState): LoadedProfileState {
  return {
    ...state,
    featuredSave: 'saving',
  };
}

export function saveFeatured(
  state: LoadedProfileState,
  featuredAchievement: AchievementId | null,
): LoadedProfileState {
  return {
    ...state,
    profile: {
      ...state.profile,
      featuredAchievement,
    },
    featuredSave: 'idle',
  };
}

export function failFeaturedSave(state: LoadedProfileState): LoadedProfileState {
  return {
    ...state,
    featuredSave: 'failed',
  };
}

export function isEarned(state: LoadedProfileState, id: AchievementId): boolean {
  return state.profile.achievements.some(
    (status) => status.id === id && status.earnedAtMs !== null,
  );
}

function isSameHover(hover: ProfileHover | null, target: ProfileHover): boolean {
  if (hover === null) {
    return false;
  }
  switch (hover.kind) {
    case 'nickname':
      return target.kind === 'nickname';
    case 'summaryTab':
      return target.kind === 'summaryTab' && target.tab === hover.tab;
    case 'setRow':
      return target.kind === 'setRow' && target.set === hover.set;
    case 'collectionTab':
      return target.kind === 'collectionTab' && target.set === hover.set;
  }
}

/** 고른 항목은 hover 보다 먼저 본다. */
export function getChoiceAppearance(
  state: LoadedProfileState,
  target: Exclude<ProfileHover, { readonly kind: 'nickname' }>,
): Exclude<TabAppearance, 'disabled'> {
  switch (target.kind) {
    case 'summaryTab':
      if (state.summaryTab === target.tab) {
        return 'selected';
      }
      break;
    case 'setRow':
      if (state.summaryFocus === target.set) {
        return 'selected';
      }
      break;
    case 'collectionTab':
      if (state.collection.set === target.set) {
        return 'selected';
      }
      break;
  }
  return isSameHover(state.hover, target) ? 'emphasized' : 'normal';
}

/** 바뀐 입력은 이전 오류를 지우고, 지금 닉네임과 다른 유효한 이름일 때만 사용 여부를 묻는다. */
export function changeNicknameInput(state: LoadedProfileState, input: string): NicknameInputChange {
  if (state.nickname.kind !== 'editing') {
    return { kind: 'none' };
  }
  const cleared = clearNicknameError(state);
  const nickname = parseNickname(input);
  return nickname === undefined || nickname === state.profile.nickname
    ? {
        kind: 'state',
        state: cleared,
      }
    : {
        kind: 'check',
        state: cleared,
        nickname,
      };
}

/** 지금과 같은 이름은 요청 없이 편집만 끝낸다. */
export function submitNicknameInput(state: LoadedProfileState, input: string): NicknameSubmission {
  if (state.nickname.kind !== 'editing') {
    return { kind: 'none' };
  }
  const nickname = parseNickname(input);
  if (nickname === undefined) {
    return {
      kind: 'state',
      state: failNicknameEdit(state, 'invalid'),
    };
  }
  if (nickname === state.profile.nickname) {
    return {
      kind: 'state',
      state: cancelNicknameEdit(state),
    };
  }
  return {
    kind: 'save',
    state: startNicknameSave(state),
    nickname,
  };
}

/** 뒤로가기는 닉네임 편집, 컬렉션 순으로 닫고 더 닫을 게 없으면 화면을 떠난다. */
export function goBack(state: ProfileState): ProfileBack {
  if (state.kind === 'loaded') {
    if (state.nickname.kind === 'editing') {
      return {
        kind: 'state',
        state: cancelNicknameEdit(state),
      };
    }
    if (state.view === 'collection') {
      return {
        kind: 'state',
        state: closeCollection(state),
      };
    }
  }
  return { kind: 'leave' };
}

/** 요약 탭 전환은 포커스 이동이 아니라 효과음을 내지 않는다. */
export function hasMovedFocus(before: LoadedProfileState, after: LoadedProfileState): boolean {
  return after !== before && after.summaryTab === before.summaryTab;
}

/** 편집 중에는 입력란이 키를 받으므로 메뉴 단축키로 읽지 않는다. */
export function isEditingNickname(state: LoadedProfileState): boolean {
  return state.nickname.kind === 'editing';
}
