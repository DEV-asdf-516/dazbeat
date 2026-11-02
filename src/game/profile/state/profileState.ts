import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { ACHIEVEMENT_SETS, findAchievement } from '../../../data/achievements.js';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementMark,
  AchievementSet,
  NamedAchievementDefinition,
} from '../../../data/achievements.js';
import { parseNickname } from '../../../data/nickname.js';
import type { Nickname } from '../../../data/nickname.js';
import { ProfileRequestError } from '../../../data/profile.js';
import type { AchievementStatus, NicknameChangeFailure, Profile } from '../../../data/profile.js';
import type { Zodiac } from '../../../data/songs.js';
import { requireDefined } from '../../../invariant.js';
import { clamp, cycleItem, stepItem } from '../../../range.js';
import { isShallowEqual } from '../../../shallowEqual.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import {
  getControlsCloseView,
  isControlsButtonEnabled,
  isControlsEntryHovered,
} from '../../app/controlsGuide.js';
import type { ControlsButton } from '../../app/controlsGuide.js';
import type { TabAppearance } from '../../ui/state/tabAppearance.js';

type ProfilePage = 'summary' | 'collection';

export type NicknameEdit =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'editing';
      readonly input: string;
      readonly error: NicknameChangeFailure | null;
    }
  | { readonly kind: 'saving'; readonly input: string };

export type SummaryTab = 'stats' | 'collection';

export type SummaryFocus = 'nickname' | AchievementSet;

export type FeaturedSave = 'idle' | 'saving' | 'failed';

export type ProfileTarget =
  | { readonly kind: 'nickname' }
  | { readonly kind: 'summaryTab'; readonly tab: SummaryTab }
  | { readonly kind: 'setRow'; readonly set: AchievementSet }
  | { readonly kind: 'collectionTab'; readonly set: AchievementSet };

export type ProfileButton = 'equip' | 'unequip' | 'back' | ControlsButton;

export type ProfileHover = ProfileTarget | ButtonHover<ProfileButton>;

export interface LoadedProfileState {
  readonly kind: 'loaded';
  readonly profile: Profile;
  readonly view: ProfilePage;
  readonly summaryTab: SummaryTab;
  readonly summaryFocus: SummaryFocus;
  readonly collection: { readonly set: AchievementSet; readonly focusedId: AchievementId };
  readonly nickname: NicknameEdit;
  readonly featuredSave: FeaturedSave;
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
  | { readonly kind: 'state'; readonly state: LoadedProfileState }
  | { readonly kind: 'save'; readonly state: LoadedProfileState; readonly nickname: Nickname };

export type ProfileBack =
  { readonly kind: 'state'; readonly state: LoadedProfileState } | { readonly kind: 'leave' };

const SUMMARY_FOCUS_ORDER: Readonly<Record<SummaryTab, readonly SummaryFocus[]>> = {
  stats: ['nickname'],
  collection: ['nickname', ...ACHIEVEMENT_SETS],
};

const IDLE_NICKNAME: NicknameEdit = { kind: 'idle' };

type ScreenRegion = 'controls' | 'backButton' | 'controlsEntry' | 'controlsClose';

export type ProfileRegion = 'pages' | 'title' | 'notice' | 'nicknameInput' | ScreenRegion;

// 조작 안내와 포인터는 페이지와 상관없이 있으므로 페이지 union 을 감싼다.
export interface ProfileScreenState {
  readonly page: ProfileState;
  readonly isControlsOpen: boolean;
  readonly hover: ProfileHover | null;
}

export interface LoadedScreen {
  readonly page: LoadedProfileState;
  readonly hover: ProfileHover | null;
}

export function getLoadedScreen(screen: ProfileScreenState): LoadedScreen | null {
  const { page, hover } = screen;
  return page.kind === 'loaded'
    ? {
        page,
        hover,
      }
    : null;
}

export type SummaryRegion =
  | 'labels'
  | 'identity'
  | 'pen'
  | 'nicknameCount'
  | 'stats'
  | 'summaryTab'
  | 'tabs'
  | 'summaryFocus'
  | 'setMarkers';

export type CollectionRegion =
  | 'tabs'
  | 'tabStar'
  | 'grid'
  | 'halo'
  | 'detail'
  | 'featured'
  | 'featuredSave'
  | 'equipButton'
  | 'unequipButton';

const readPage: StateReader<ProfileState> = (state) => getProfilePage(state);
// 입력 중 글자는 입력란이 먼저 갖고 있어, 입력란은 편집 단계가 바뀔 때만 상태의 글자로 맞춘다.
const readEditKind: StateReader<ProfileState> = (state) => getNicknameEdit(state).kind;

const PROFILE_REGION_SOURCES: Readonly<
  Record<Exclude<ProfileRegion, ScreenRegion>, readonly StateReader<ProfileState>[]>
> = {
  pages: [readPage],
  title: [readPage],
  notice: [readPage],
  nicknameInput: [readEditKind],
};

type ProfileReader = StateReader<LoadedScreen>;

const readNicknameKind: ProfileReader = ({ page }) => page.nickname.kind;
const readNicknameError: ProfileReader = ({ page }) =>
  page.nickname.kind === 'editing' ? page.nickname.error : null;
const readNicknameInput: ProfileReader = ({ page }) =>
  page.nickname.kind === 'idle' ? null : page.nickname.input;
const readNickname: ProfileReader = ({ page }) => page.profile.nickname;
const readFeatured: ProfileReader = ({ page }) => page.profile.featuredAchievement;
const readStats: ProfileReader = ({ page }) => page.profile.stats;
const readAchievements: ProfileReader = ({ page }) => page.profile.achievements;
const readNewAchievements: ProfileReader = ({ page }) => page.profile.newAchievements;
const readSummaryTab: ProfileReader = ({ page }) => page.summaryTab;
const readSummaryFocus: ProfileReader = ({ page }) => page.summaryFocus;
const readSet: ProfileReader = ({ page }) => page.collection.set;
const readFocusedId: ProfileReader = ({ page }) => page.collection.focusedId;
const readFeaturedSave: ProfileReader = ({ page }) => page.featuredSave;
const readNicknameHovered: ProfileReader = ({ hover }) => hover?.kind === 'nickname';
const readHoveredSummaryTab: ProfileReader = ({ hover }) =>
  hover?.kind === 'summaryTab' ? hover.tab : null;
const readHoveredSetRow: ProfileReader = ({ hover }) =>
  hover?.kind === 'setRow' ? hover.set : null;
const readHoveredCollectionTab: ProfileReader = ({ hover }) =>
  hover?.kind === 'collectionTab' ? hover.set : null;
const readEquipHovered: ProfileReader = ({ hover }) => isButtonHovered(hover, 'equip');
const readEquipPressed: ProfileReader = ({ hover }) => isButtonPressed(hover, 'equip');
const readUnequipHovered: ProfileReader = ({ hover }) => isButtonHovered(hover, 'unequip');
const readUnequipPressed: ProfileReader = ({ hover }) => isButtonPressed(hover, 'unequip');

const SUMMARY_REGION_SOURCES: Readonly<Record<SummaryRegion, readonly ProfileReader[]>> = {
  labels: [],
  identity: [readNicknameKind, readNicknameError, readNickname, readFeatured],
  pen: [readNicknameKind, readNicknameHovered],
  nicknameCount: [readNicknameInput],
  stats: [readStats, readAchievements],
  summaryTab: [readSummaryTab],
  tabs: [readSummaryTab, readHoveredSummaryTab],
  summaryFocus: [readSummaryFocus],
  setMarkers: [readSummaryFocus, readHoveredSetRow],
};

const COLLECTION_REGION_SOURCES: Readonly<Record<CollectionRegion, readonly ProfileReader[]>> = {
  tabs: [readSet, readHoveredCollectionTab],
  tabStar: [readSet],
  grid: [readSet, readAchievements, readNewAchievements],
  halo: [readSet, readFocusedId],
  detail: [readSet, readFocusedId, readAchievements],
  featured: [readSet, readFocusedId, readAchievements, readFeatured],
  featuredSave: [readFeaturedSave],
  equipButton: [readEquipHovered, readEquipPressed],
  unequipButton: [readUnequipHovered, readUnequipPressed],
};

export function getCollectionRows(
  achievements: readonly AchievementStatus[],
  set: AchievementSet,
): readonly (readonly [NamedAchievementDefinition, ...NamedAchievementDefinition[]])[] {
  const rows: {
    key: string;
    definitions: [NamedAchievementDefinition, ...NamedAchievementDefinition[]];
  }[] = [];
  achievements
    .filter(({ definition }) => definition.set === set)
    .forEach(({ definition }) => {
      const { category, rule } = definition;
      // 디스코그래피는 카테고리가 모두 album 이라 앨범마다 한 줄이 되도록 앨범까지 같아야 묶는다.
      const key = rule.kind === 'album' ? `${category}:${rule.album}` : category;
      const last = rows.at(-1);
      if (last?.key === key) {
        last.definitions.push(definition);
      } else {
        rows.push({
          key,
          definitions: [definition],
        });
      }
    });
  return rows.map(({ definitions }) => definitions);
}

function firstAchievementOf(
  achievements: readonly AchievementStatus[],
  set: AchievementSet,
): AchievementId {
  return requireDefined(
    getCollectionRows(achievements, set)[0]?.[0],
    'Achievement set is empty',
    set,
  ).id;
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
      focusedId: firstAchievementOf(profile.achievements, set),
    },
    nickname: IDLE_NICKNAME,
    featuredSave: 'idle',
  };
}

function withCollection(
  state: LoadedProfileState,
  set: AchievementSet,
  focusedId: AchievementId,
): LoadedProfileState {
  const collection = {
    set,
    focusedId,
  };
  if (isShallowEqual(state.collection, collection)) {
    return state;
  }
  return {
    ...state,
    collection,
  };
}

function moveCollectionFocus(
  state: LoadedProfileState,
  direction: FocusDirection,
): LoadedProfileState {
  const rows = getCollectionRows(state.profile.achievements, state.collection.set);
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
  // 세트 줄은 컬렉션 탭에만 있어 탭을 바꾸면 포커스는 두 탭에 공통인 닉네임으로 돌아간다.
  return {
    ...state,
    summaryTab: tab,
    summaryFocus: 'nickname',
  };
}

export function switchSet(state: LoadedProfileState, delta: -1 | 1): LoadedProfileState {
  if (state.view !== 'collection') {
    return state;
  }
  const set = cycleItem(ACHIEVEMENT_SETS, state.collection.set, delta);
  return withCollection(state, set, firstAchievementOf(state.profile.achievements, set));
}

export function selectSet(state: LoadedProfileState, set: AchievementSet): LoadedProfileState {
  if (state.view !== 'collection' || state.collection.set === set) {
    return state;
  }
  return withCollection(state, set, firstAchievementOf(state.profile.achievements, set));
}

export function focusAchievement(state: LoadedProfileState, id: AchievementId): LoadedProfileState {
  if (
    state.view !== 'collection' ||
    !state.profile.achievements.some(
      ({ definition }) => definition.id === id && definition.set === state.collection.set,
    )
  ) {
    return state;
  }
  return withCollection(state, state.collection.set, id);
}

function openCollection(state: LoadedProfileState, set: AchievementSet): LoadedProfileState {
  return {
    ...withCollection(state, set, firstAchievementOf(state.profile.achievements, set)),
    view: 'collection',
    summaryFocus: set,
    featuredSave: 'idle',
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
  switch (getFeaturedAction(state)) {
    case 'none':
      return NO_SELECTION;
    case 'equip':
      return {
        kind: 'saveFeatured',
        id: state.collection.focusedId,
      };
    case 'unequip':
      return {
        kind: 'saveFeatured',
        id: null,
      };
  }
}

export type FeaturedAction = 'none' | 'equip' | 'unequip';

export type ProfilePageKind = 'guest' | 'loading' | 'failed' | ProfilePage;

export function getProfilePage(state: ProfileState): ProfilePageKind {
  return state.kind === 'loaded' ? state.view : state.kind;
}

export function getNicknameEdit(state: ProfileState): NicknameEdit {
  return state.kind === 'loaded' ? state.nickname : IDLE_NICKNAME;
}

export type NicknameLook =
  | { readonly kind: 'idle' }
  | { readonly kind: 'editing' }
  | { readonly kind: 'invalid'; readonly error: NicknameChangeFailure };

/** 저장 중에도 편집 칸 모양을 유지해 응답이 올 때까지 칸이 깜빡이지 않게 한다. */
export function getNicknameLook(state: LoadedProfileState): NicknameLook {
  const { nickname } = state;
  if (nickname.kind === 'idle') {
    return { kind: 'idle' };
  }
  return nickname.kind === 'editing' && nickname.error !== null
    ? {
        kind: 'invalid',
        error: nickname.error,
      }
    : { kind: 'editing' };
}

export function getPenAppearance(screen: LoadedScreen): 'hidden' | 'emphasized' | 'normal' {
  if (screen.page.nickname.kind !== 'idle') {
    return 'hidden';
  }
  return screen.hover?.kind === 'nickname' ? 'emphasized' : 'normal';
}

export type AchievementProgress =
  | { readonly kind: 'count'; readonly current: number; readonly target: number }
  | { readonly kind: 'currentSongs'; readonly current: number; readonly target: number }
  | { readonly kind: 'noAssignedSongs' };

/** 황도 완성과 앨범은 지금 배정된 곡 수가 목표라, 곡이 하나도 없으면 진행도 대신 그 사실을 보인다. */
export function getAchievementProgress({
  definition,
  current,
  target,
}: AchievementStatus): AchievementProgress {
  const { kind } = definition.rule;
  if (kind !== 'zodiacComplete' && kind !== 'album') {
    return {
      kind: 'count',
      current,
      target,
    };
  }
  return target === 0
    ? { kind: 'noAssignedSongs' }
    : {
        kind: 'currentSongs',
        current,
        target,
      };
}

export function getFeaturedAction(state: LoadedProfileState): FeaturedAction {
  if (!isEarned(state, state.collection.focusedId)) {
    return 'none';
  }
  return isFocusedFeatured(state) ? 'unequip' : 'equip';
}

export function isFocusedFeatured(state: LoadedProfileState): boolean {
  return state.profile.featuredAchievement?.id === state.collection.focusedId;
}

export function closeCollection(state: LoadedProfileState): LoadedProfileState {
  return state.view === 'summary'
    ? state
    : {
        ...state,
        view: 'summary',
      };
}

export function createProfileScreen(page: ProfileState): ProfileScreenState {
  return {
    page,
    isControlsOpen: false,
    hover: null,
  };
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로, 페이지가 바뀌어 숨는 대상의 hover 는 여기서 푼다.
function isShownHover(page: ProfileState, hover: ProfileHover): boolean {
  if (page.kind !== 'loaded') {
    return hover.kind === 'button' && hover.button !== 'equip' && hover.button !== 'unequip';
  }
  switch (hover.kind) {
    case 'nickname':
    case 'summaryTab':
      return page.view === 'summary';
    case 'setRow':
      return page.view === 'summary' && page.summaryTab === 'collection';
    case 'collectionTab':
      return page.view === 'collection';
    case 'button':
      switch (hover.button) {
        case 'equip':
        case 'unequip':
          return page.view === 'collection' && getFeaturedAction(page) === hover.button;
        default:
          return true;
      }
  }
}

function withHover(screen: ProfileScreenState, hover: ProfileHover | null): ProfileScreenState {
  return hover === screen.hover
    ? screen
    : {
        ...screen,
        hover,
      };
}

export function withPage(screen: ProfileScreenState, page: ProfileState): ProfileScreenState {
  if (page === screen.page) {
    return screen;
  }
  return {
    ...screen,
    page,
    hover: screen.hover !== null && isShownHover(page, screen.hover) ? screen.hover : null,
  };
}

export function setHover(screen: ProfileScreenState, target: ProfileTarget): ProfileScreenState {
  return isSameHover(screen.hover, target) || !isShownHover(screen.page, target)
    ? screen
    : withHover(screen, target);
}

export function clearHover(screen: ProfileScreenState, target: ProfileTarget): ProfileScreenState {
  return isSameHover(screen.hover, target) ? withHover(screen, null) : screen;
}

function isProfileButtonEnabled(screen: ProfileScreenState, button: ProfileButton): boolean {
  switch (button) {
    case 'equip':
    case 'unequip':
    case 'back':
      return true;
    default:
      return isControlsButtonEnabled(button, screen.isControlsOpen);
  }
}

export function hoverProfileButton(
  screen: ProfileScreenState,
  button: ProfileButton,
): ProfileScreenState {
  return withHover(screen, hoverButton(screen.hover, button));
}

export function unhoverProfileButton(
  screen: ProfileScreenState,
  button: ProfileButton,
): ProfileScreenState {
  return withHover(screen, unhoverButton(screen.hover, button));
}

export function pressProfileButton(
  screen: ProfileScreenState,
  button: ProfileButton,
): ProfileScreenState {
  return withHover(
    screen,
    pressButton(screen.hover, button, isProfileButtonEnabled(screen, button)),
  );
}

export function releaseProfileButton(
  screen: ProfileScreenState,
  button: ProfileButton,
): ProfileScreenState {
  return withHover(screen, releaseButton(screen.hover, button));
}

export function getProfileButtonView(
  screen: Pick<ProfileScreenState, 'hover'>,
  button: 'equip' | 'unequip' | 'back',
): ButtonView {
  return getButtonView(screen.hover, button, true, false);
}

export function getProfileControlsCloseView(screen: ProfileScreenState): ButtonView {
  return getControlsCloseView(screen.hover, screen.isControlsOpen);
}

export function isProfileControlsEntryHovered(screen: ProfileScreenState): boolean {
  return isControlsEntryHovered(screen.hover);
}

function startNicknameEdit(state: LoadedProfileState): LoadedProfileState {
  return editNickname(state, state.profile.nickname, null);
}

function editNickname(
  state: LoadedProfileState,
  input: string,
  error: NicknameChangeFailure | null,
): LoadedProfileState {
  const { nickname } = state;
  if (nickname.kind === 'editing' && nickname.input === input && nickname.error === error) {
    return state;
  }
  return {
    ...state,
    nickname: {
      kind: 'editing',
      input,
      error,
    },
  };
}

function getNicknameInput(state: LoadedProfileState): string {
  return state.nickname.kind === 'idle' ? state.profile.nickname : state.nickname.input;
}

export function cancelNicknameEdit(state: LoadedProfileState): LoadedProfileState {
  return state.nickname.kind === 'idle'
    ? state
    : {
        ...state,
        nickname: IDLE_NICKNAME,
      };
}

export function toNicknameFailure(error: unknown): NicknameChangeFailure {
  if (error instanceof ProfileRequestError) {
    if (error.kind === 'invalidNickname') {
      return 'invalid';
    }
    if (error.kind === 'nicknameTaken') {
      return 'taken';
    }
  }
  return 'failed';
}

export function toLoadFailurePage(error: unknown): ProfileState {
  // 인증 만료는 다시 로그인해야 하므로 게스트 안내로 보낸다.
  return error instanceof ProfileRequestError && error.kind === 'unauthorized'
    ? { kind: 'guest' }
    : { kind: 'failed' };
}

export function failNicknameEdit(
  state: LoadedProfileState,
  error: NicknameChangeFailure,
): LoadedProfileState {
  return editNickname(state, getNicknameInput(state), error);
}

export function saveNickname(state: LoadedProfileState, nickname: Nickname): LoadedProfileState {
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
  featuredId: AchievementId | null,
): LoadedProfileState {
  return {
    ...state,
    profile: {
      ...state.profile,
      featuredAchievement:
        featuredId === null ? null : (findAchievement(state.profile.catalog, featuredId) ?? null),
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
  return findEarnedAtMs(state, id) !== null;
}

function findEarnedAtMs(state: LoadedProfileState, id: AchievementId): number | null {
  return (
    state.profile.achievements.find(
      (status) => status.definition.id === id && status.earnedAtMs !== null,
    )?.earnedAtMs ?? null
  );
}

function isSameHover(hover: ProfileHover | null, target: ProfileTarget): boolean {
  if (hover === null) {
    return false;
  }
  switch (hover.kind) {
    case 'button':
      return false;
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
  { page: state, hover }: LoadedScreen,
  target: Exclude<ProfileTarget, { readonly kind: 'nickname' }>,
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
  return isSameHover(hover, target) ? 'emphasized' : 'normal';
}

/** 바뀐 입력은 이전 오류를 지우고, 지금 닉네임과 다른 유효한 이름일 때만 사용 여부를 묻는다. */
export function changeNicknameInput(state: LoadedProfileState, input: string): NicknameInputChange {
  if (state.nickname.kind !== 'editing') {
    return { kind: 'none' };
  }
  const edited = editNickname(state, input, null);
  const nickname = parseNickname(input);
  return nickname === undefined || nickname === state.profile.nickname
    ? {
        kind: 'state',
        state: edited,
      }
    : {
        kind: 'check',
        state: edited,
        nickname,
      };
}

/** 지금과 같은 이름은 요청 없이 편집만 끝낸다. */
export function submitNicknameInput(state: LoadedProfileState, input: string): NicknameSubmission {
  const nickname = parseNickname(input);
  if (nickname === undefined) {
    return {
      kind: 'state',
      state: editNickname(state, input, 'invalid'),
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
    state: {
      ...state,
      nickname: {
        kind: 'saving',
        input,
      },
    },
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

export interface ProfileRegions {
  readonly profile: readonly ProfileRegion[];
  readonly summary: readonly SummaryRegion[];
  readonly collection: readonly CollectionRegion[];
}

type ScreenReader = StateReader<ProfileScreenState>;

const readControlsOpen: ScreenReader = (screen) => screen.isControlsOpen;
const readCloseHovered: ScreenReader = (screen) => isButtonHovered(screen.hover, 'controlsClose');

const SCREEN_REGION_SOURCES: Readonly<Record<ScreenRegion, readonly ScreenReader[]>> = {
  controls: [readControlsOpen],
  backButton: [
    (screen) => isButtonHovered(screen.hover, 'back'),
    (screen) => isButtonPressed(screen.hover, 'back'),
  ],
  controlsEntry: [(screen) => isButtonHovered(screen.hover, 'controlsEntry')],
  controlsClose: [
    readCloseHovered,
    (screen) => isButtonPressed(screen.hover, 'controlsClose'),
    readControlsOpen,
  ],
};

export function getChangedRegions(
  previousScreen: ProfileScreenState | null,
  nextScreen: ProfileScreenState,
): ProfileRegions {
  const profile = [
    ...filterChangedRegions(PROFILE_REGION_SOURCES, previousScreen?.page ?? null, nextScreen.page),
    ...filterChangedRegions(SCREEN_REGION_SOURCES, previousScreen, nextScreen),
  ];
  const loaded = getLoadedScreen(nextScreen);
  if (loaded === null) {
    return {
      profile,
      summary: [],
      collection: [],
    };
  }
  const next = loaded.page;
  const previous = previousScreen === null ? null : getLoadedScreen(previousScreen);
  // 같은 보기를 이어 그릴 때만 이전 상태와 비교하고, 보기가 바뀌면 처음부터 그린다.
  const before = previous?.page.view === next.view ? previous : null;
  return {
    profile,
    summary:
      next.view === 'summary' ? filterChangedRegions(SUMMARY_REGION_SOURCES, before, loaded) : [],
    collection:
      next.view === 'collection'
        ? filterChangedRegions(COLLECTION_REGION_SOURCES, before, loaded)
        : [],
  };
}

type EarnedProgress = { readonly earned: number; readonly total: number };

export function getEarnedProgress(
  state: LoadedProfileState,
  definitions: readonly AchievementDefinition[],
): EarnedProgress {
  return {
    earned: definitions.filter(({ id }) => isEarned(state, id)).length,
    total: definitions.length,
  };
}

export function getEarnedSummary(state: LoadedProfileState): {
  readonly all: EarnedProgress;
  readonly bySet: Readonly<Record<AchievementSet, EarnedProgress>>;
} {
  const definitions = state.profile.achievements.map(({ definition }) => definition);
  const getSetProgress = (set: AchievementSet): EarnedProgress =>
    getEarnedProgress(
      state,
      definitions.filter((definition) => definition.set === set),
    );
  return {
    all: getEarnedProgress(state, definitions),
    bySet: {
      rhythm: getSetProgress('rhythm'),
      zodiac: getSetProgress('zodiac'),
      discography: getSetProgress('discography'),
    },
  };
}

type CountConditionKey =
  'plays' | 'songs' | 'charts' | 'expertCharts' | 'songMarks' | 'zodiacCompletions';

export type AchievementCondition =
  | {
      readonly kind: 'count';
      readonly key: CountConditionKey | `${CountConditionKey}One`;
      readonly target: number;
      readonly mark: AchievementMark | null;
    }
  | { readonly kind: 'zodiacVisits'; readonly target: number; readonly mark: AchievementMark }
  | { readonly kind: 'zodiacComplete'; readonly zodiac: Zodiac; readonly mark: AchievementMark }
  | { readonly kind: 'album'; readonly album: string; readonly mark: AchievementMark };

/** 목표가 1이면 "첫 ~"처럼 횟수 없이 읽는 문구를 따로 쓴다. */
function countCondition(
  key: CountConditionKey,
  target: number,
  mark: AchievementMark | null,
): AchievementCondition {
  return {
    kind: 'count',
    key: target === 1 ? `${key}One` : key,
    target,
    mark,
  };
}

export function getAchievementCondition({ rule }: AchievementDefinition): AchievementCondition {
  switch (rule.kind) {
    case 'plays':
    case 'songs':
    case 'zodiacCompletions':
      return countCondition(rule.kind, rule.target, null);
    case 'charts':
      return countCondition(
        rule.difficulty === 'expert' ? 'expertCharts' : 'charts',
        rule.target,
        rule.mark,
      );
    case 'songMarks':
      return countCondition('songMarks', rule.target, rule.mark);
    case 'zodiacVisits':
      return {
        kind: 'zodiacVisits',
        target: rule.target,
        mark: rule.mark,
      };
    case 'zodiacComplete':
      return {
        kind: 'zodiacComplete',
        zodiac: rule.zodiac,
        mark: rule.mark,
      };
    case 'album':
      return {
        kind: 'album',
        album: rule.album,
        mark: rule.mark,
      };
  }
}

export function getFocusedEarning(
  state: LoadedProfileState,
): { readonly kind: 'earned'; readonly earnedAtMs: number } | { readonly kind: 'locked' } {
  const earnedAtMs = findEarnedAtMs(state, state.collection.focusedId);
  return earnedAtMs === null
    ? { kind: 'locked' }
    : {
        kind: 'earned',
        earnedAtMs,
      };
}

export function getCellLook(state: LoadedProfileState, id: AchievementId): 'earned' | 'locked' {
  return isEarned(state, id) ? 'earned' : 'locked';
}

export type FeaturedIdentity =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'equipped';
      readonly achievement: NamedAchievementDefinition;
      readonly isEmblemShown: boolean;
    };

export function getFeaturedIdentity(state: LoadedProfileState): FeaturedIdentity {
  const featured = state.profile.featuredAchievement;
  return featured === null
    ? { kind: 'none' }
    : {
        kind: 'equipped',
        achievement: featured,
        isEmblemShown: state.nickname.kind === 'idle',
      };
}

export function getSummaryFocusKind(state: LoadedProfileState): 'nickname' | 'set' {
  return state.summaryFocus === 'nickname' ? 'nickname' : 'set';
}

export function getProfileNotice(page: ProfilePageKind): 'guest' | 'failed' | null {
  switch (page) {
    case 'guest':
    case 'failed':
      return page;
    case 'loading':
    case 'summary':
    case 'collection':
      return null;
  }
}

export function getNicknameCountInput(state: LoadedProfileState): string | null {
  return state.nickname.kind === 'idle' ? null : state.nickname.input;
}

export interface ProgressDisplay {
  readonly labelKey: 'collection.progress' | 'collection.currentSongs';
  readonly value:
    | { readonly kind: 'ratio'; readonly current: number; readonly target: number }
    | { readonly kind: 'noAssignedSongs' };
}

export function getProgressDisplay(state: LoadedProfileState): ProgressDisplay {
  const progress = getAchievementProgress(
    requireDefined(
      state.profile.achievements.find(
        ({ definition }) => definition.id === state.collection.focusedId,
      ),
      'Missing achievement status',
      state.collection.focusedId,
    ),
  );
  switch (progress.kind) {
    case 'count':
      return {
        labelKey: 'collection.progress',
        value: {
          kind: 'ratio',
          current: progress.current,
          target: progress.target,
        },
      };
    case 'currentSongs':
      return {
        labelKey: 'collection.currentSongs',
        value: {
          kind: 'ratio',
          current: progress.current,
          target: progress.target,
        },
      };
    case 'noAssignedSongs':
      return {
        labelKey: 'collection.currentSongs',
        value: { kind: 'noAssignedSongs' },
      };
  }
}
