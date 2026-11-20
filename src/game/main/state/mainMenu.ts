import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { cycleItem } from '../../../range.js';
import type { ListDirection } from '../../../range.js';
import { canOpenChartEditor } from '../../app/accountState.js';
import type { AccountState } from '../../app/accountState.js';
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
  getControlsHelpButtonView,
  isControlsEntryHovered,
  isControlsHelpShown,
  isControlsPanelOpen,
  leaveControlsButton,
} from '../../app/controlsGuide.js';
import type { ControlsButton, ControlsPanel } from '../../app/controlsGuide.js';
import type { AccelerationNotice } from './accelerationNotice.js';

export type MainMenuItem = 'play' | 'practice' | 'chartEditor' | 'settings' | 'credits';

const EDITOR_MENU_ITEMS: readonly MainMenuItem[] = [
  'play',
  'practice',
  'chartEditor',
  'settings',
  'credits',
];
const MENU_ITEMS: readonly MainMenuItem[] = ['play', 'practice', 'settings', 'credits'];

export function getMainMenuItems(account: AccountState): readonly MainMenuItem[] {
  return account.kind === 'signedIn' && canOpenChartEditor(account.user)
    ? EDITOR_MENU_ITEMS
    : MENU_ITEMS;
}

export type MainFocus = MainMenuItem | 'profile' | 'youtube';

export type MainButton =
  MainFocus | 'account' | ControlsButton | 'accelerationNoticeDismiss' | 'accelerationNoticeAccept';

export interface MainState {
  readonly account: AccountState;
  readonly focus: MainFocus;
  readonly controls: ControlsPanel;
  readonly accelerationNotice: AccelerationNotice;
  readonly hover: ButtonHover<MainButton> | null;
}

const INITIAL_FOCUS: MainFocus = 'play';

export function createMainState(
  account: AccountState,
  accelerationNotice: AccelerationNotice,
): MainState {
  return {
    account,
    focus: INITIAL_FOCUS,
    controls: 'closed',
    accelerationNotice,
    hover: null,
  };
}

// 프로필 진입은 로그인 상태에 따라 생기고 없어지므로 계정마다 포커스 순서를 다시 만든다.
// 화면 모서리에 있어도 키보드로 닿을 수 있도록 포커스 순서의 마지막에 둔다.
function getFocusOrder(account: AccountState): readonly MainFocus[] {
  return [
    ...getMainMenuItems(account),
    ...(account.kind === 'signedIn' ? (['profile'] as const) : []),
    'youtube',
  ];
}

// 지난 포커스가 새 순서에 없으면 처음으로 돌아간다.
export function withAccount(state: MainState, account: AccountState): MainState {
  if (account === state.account) {
    return state;
  }
  return {
    ...state,
    account,
    focus: getFocusOrder(account).includes(state.focus) ? state.focus : INITIAL_FOCUS,
    hover: releaseHiddenHover(state, account),
  };
}

/** 계정 시도는 객체 identity 로 식별하므로 늦게 온 결과가 지금 시도의 것인지 이 비교로 안다. */
export function isCurrentAccountAttempt(state: MainState, attempt: AccountState): boolean {
  return state.account === attempt;
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 메뉴 항목이 바뀌거나 프로필 진입, 로그인 버튼이
// 사라지는 계정 변경에서 그 버튼들의 hover 를 푼다.
function releaseHiddenHover(state: MainState, account: AccountState): MainState['hover'] {
  const menuHover =
    getMainMenuItems(account) === getMainMenuItems(state.account)
      ? state.hover
      : EDITOR_MENU_ITEMS.reduce<MainState['hover']>(
          (hover, item) => unhoverButton(hover, item),
          state.hover,
        );
  return unhoverButton(menuHover, account.kind === 'signedIn' ? 'account' : 'profile');
}

function withHover(state: MainState, hover: MainState['hover']): MainState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverMainButton(state: MainState, button: MainButton): MainState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverMainButton(state: MainState, button: MainButton): MainState {
  return leaveControlsButton(withHover(state, unhoverButton(state.hover, button)), button);
}

export function pressMainButton(state: MainState, button: MainButton): MainState {
  return withHover(state, pressButton(state.hover, button, true));
}

export function releaseMainButton(state: MainState, button: MainButton): MainState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getMainButtonView(state: MainState, button: MainFocus | 'account'): ButtonView {
  return getButtonView(state.hover, button, true, state.focus === button);
}

export function getMainControlsCloseView(state: MainState): ButtonView {
  return getControlsCloseView(state.hover);
}

export function isMainControlsEntryHovered(state: MainState): boolean {
  return isControlsEntryHovered(state.hover);
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 팝업을 닫을 때 두 버튼의 hover 를 푼다.
export function closeAccelerationNotice(state: MainState): MainState {
  if (state.accelerationNotice.kind === 'closed') {
    return state;
  }
  return {
    ...state,
    accelerationNotice: { kind: 'closed' },
    hover: unhoverButton(
      unhoverButton(state.hover, 'accelerationNoticeDismiss'),
      'accelerationNoticeAccept',
    ),
  };
}

export function getAccelerationNoticeButtonViews(state: MainState): {
  readonly dismiss: ButtonView;
  readonly accept: ButtonView;
} {
  const isOpen = state.accelerationNotice.kind === 'open';
  return {
    dismiss: getButtonView(state.hover, 'accelerationNoticeDismiss', isOpen, false),
    accept: getButtonView(state.hover, 'accelerationNoticeAccept', isOpen, false),
  };
}

export function moveMainFocus(state: MainState, direction: ListDirection): MainState {
  const focus = cycleItem(getFocusOrder(state.account), state.focus, direction);
  return focus === state.focus
    ? state
    : {
        ...state,
        focus,
      };
}

export function isMainFocused(state: MainState, focus: MainFocus): boolean {
  return state.focus === focus;
}

export type MainRegion =
  | 'account'
  | 'menu'
  | 'menuButtons'
  | 'profileButton'
  | 'accountButton'
  | 'youtubeButton'
  | 'controls'
  | 'controlsEntry'
  | 'controlsClose'
  | 'controlsHelpCard'
  | 'controlsHelpButton'
  | 'accelerationNotice'
  | 'accelerationNoticeButtons'
  | 'menuFocusMotion'
  | 'menuItemsMotion'
  | 'youtubeHearts';

type MainReader = StateReader<MainState>;

function readButton(button: MainButton): readonly MainReader[] {
  return [
    (state) => isButtonHovered(state.hover, button),
    (state) => isButtonPressed(state.hover, button),
  ];
}

const readAccount: MainReader = (state) => state.account;
const readMenuItems: MainReader = (state) => getMainMenuItems(state.account);
const readFocus: MainReader = (state) => state.focus;
const readControlsOpen: MainReader = (state) => isControlsPanelOpen(state);

const REGION_SOURCES: Readonly<
  Record<
    Exclude<MainRegion, 'menuFocusMotion' | 'menuItemsMotion' | 'youtubeHearts'>,
    readonly MainReader[]
  >
> = {
  account: [readAccount],
  menu: [readMenuItems],
  menuButtons: [readFocus, ...EDITOR_MENU_ITEMS.flatMap(readButton)],
  profileButton: [readFocus, ...readButton('profile')],
  accountButton: readButton('account'),
  youtubeButton: [readFocus, ...readButton('youtube')],
  controls: [readControlsOpen],
  controlsEntry: [(state) => isButtonHovered(state.hover, 'controlsEntry')],
  controlsClose: readButton('controlsClose'),
  controlsHelpCard: [isControlsHelpShown],
  controlsHelpButton: [(state) => getControlsHelpButtonView(state).appearance],
  accelerationNotice: [(state) => state.accelerationNotice],
  accelerationNoticeButtons: [
    (state) => state.accelerationNotice.kind,
    ...readButton('accelerationNoticeDismiss'),
    ...readButton('accelerationNoticeAccept'),
  ],
};

export function getChangedRegions(
  previous: MainState | null,
  next: MainState,
): readonly MainRegion[] {
  const regions = filterChangedRegions(REGION_SOURCES, previous, next);
  if (previous === null) {
    return [...regions, 'menuFocusMotion'];
  }
  const isFocusMoved = previous.focus !== next.focus;
  // 지금까지 메뉴 목록이 바뀌면 메뉴 버튼만 다시 만들어 반짝였으므로 유튜브·프로필 버튼은 다시 반짝이지 않는다.
  const isMenuItemsChanged =
    !isFocusMoved && getMainMenuItems(previous.account) !== getMainMenuItems(next.account);
  const isYoutubeEntered =
    (previous.focus !== 'youtube' && next.focus === 'youtube') ||
    (!isButtonHovered(previous.hover, 'youtube') && isButtonHovered(next.hover, 'youtube'));
  return [
    ...regions,
    ...(isFocusMoved ? (['menuFocusMotion'] as const) : []),
    ...(isMenuItemsChanged ? (['menuItemsMotion'] as const) : []),
    ...(isYoutubeEntered ? (['youtubeHearts'] as const) : []),
  ];
}
