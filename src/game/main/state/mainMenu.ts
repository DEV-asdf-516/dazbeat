import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import type { Notice } from '../../../data/notices.js';
import { clamp, cycleItem } from '../../../range.js';
import type { ListDirection } from '../../../range.js';
import { canOpenChartEditor, clearSignInFailure } from '../../app/accountState.js';
import type { AccountState, SignInFailure } from '../../app/accountState.js';
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
import { readSignInFailureKey } from '../../ui/state/accountIdentity.js';
import type { SignInFailureButton } from '../../ui/state/accountIdentity.js';
import { readMenuAction } from '../../ui/state/menuAction.js';
import {
  getControlsHelpButtonView,
  isControlsHelpShown,
  isControlsPanelOpen,
  leaveControlsButton,
} from '../../app/controlsGuide.js';
import type { ControlsButton, ControlsPanel } from '../../app/controlsGuide.js';
import { readAccelerationNoticeKey } from './accelerationNotice.js';
import type { AccelerationNotice } from './accelerationNotice.js';
import { NOTICE_VIEWPORT_HEIGHT_PX } from './noticeBoard.js';
import type { NoticeBoard, NoticeFeed } from './noticeBoard.js';

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

export type MainFocus = MainMenuItem | 'profile' | 'notice' | 'youtube';

export type MainButton =
  | MainFocus
  | 'account'
  | ControlsButton
  | 'accelerationNoticeDismiss'
  | 'accelerationNoticeAccept'
  | SignInFailureButton
  | 'noticeBoardDismiss'
  | 'noticeBoardClose';

export interface MainState {
  readonly account: AccountState;
  readonly focus: MainFocus;
  readonly controls: ControlsPanel;
  readonly accelerationNotice: AccelerationNotice;
  readonly notices: NoticeFeed;
  readonly noticeBoard: NoticeBoard;
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
    notices: { kind: 'none' },
    noticeBoard: { kind: 'closed' },
    hover: null,
  };
}

// 프로필 진입은 로그인 상태에 따라, 공지 진입은 공지를 불러왔는지에 따라 생기므로 그때마다 포커스 순서를 다시 만든다.
// 화면 모서리에 있어도 키보드로 닿을 수 있도록 포커스 순서의 마지막에 둔다.
function getFocusOrder(account: AccountState, notices: NoticeFeed): readonly MainFocus[] {
  return [
    ...getMainMenuItems(account),
    ...(account.kind === 'signedIn' ? (['profile'] as const) : []),
    ...(notices.kind === 'ready' ? (['notice'] as const) : []),
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
    focus: getFocusOrder(account, state.notices).includes(state.focus)
      ? state.focus
      : INITIAL_FOCUS,
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

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 팝업을 닫을 때 두 버튼의 hover 를 푼다.
// 가속 안내를 기다리던 공지 창은 안내가 닫힐 때 연다.
export function closeAccelerationNotice(state: MainState): MainState {
  if (state.accelerationNotice.kind === 'closed') {
    return state;
  }
  return {
    ...state,
    accelerationNotice: { kind: 'closed' },
    noticeBoard: state.noticeBoard.kind === 'due' ? OPENED_NOTICE_BOARD : state.noticeBoard,
    hover: unhoverButton(
      unhoverButton(state.hover, 'accelerationNoticeDismiss'),
      'accelerationNoticeAccept',
    ),
  };
}

// 창은 어느 경로로 열든 맨 위에서 시작한다.
const OPENED_NOTICE_BOARD: NoticeBoard = {
  kind: 'open',
  scrollPx: 0,
};

export function receiveNotices(
  state: MainState,
  items: readonly Notice[],
  contentHeightPx: number,
  isAutoOpenDue: boolean,
): MainState {
  if (items.length === 0) {
    return state;
  }
  const autoOpened: NoticeBoard =
    state.accelerationNotice.kind === 'open' ? { kind: 'due' } : OPENED_NOTICE_BOARD;
  return {
    ...state,
    notices: {
      kind: 'ready',
      items,
      contentHeightPx,
    },
    noticeBoard: isAutoOpenDue ? autoOpened : state.noticeBoard,
  };
}

export function openNoticeBoard(state: MainState): MainState {
  if (state.notices.kind !== 'ready' || state.noticeBoard.kind !== 'closed') {
    return state;
  }
  return {
    ...state,
    noticeBoard: OPENED_NOTICE_BOARD,
  };
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 창을 닫을 때 두 버튼의 hover 를 푼다.
export function closeNoticeBoard(state: MainState): MainState {
  if (state.noticeBoard.kind === 'closed') {
    return state;
  }
  return {
    ...state,
    noticeBoard: { kind: 'closed' },
    hover: unhoverButton(unhoverButton(state.hover, 'noticeBoardDismiss'), 'noticeBoardClose'),
  };
}

// 실패 팝업이 공지 창 위에 있는 동안에는 창을 움직이지 않는다.
export function scrollNoticeBoard(state: MainState, deltaPx: number): MainState {
  const { notices, noticeBoard } = state;
  if (
    notices.kind !== 'ready' ||
    noticeBoard.kind !== 'open' ||
    getMainSignInFailure(state) !== 'none'
  ) {
    return state;
  }
  const scrollPx = clamp(
    noticeBoard.scrollPx + deltaPx,
    0,
    Math.max(0, notices.contentHeightPx - NOTICE_VIEWPORT_HEIGHT_PX),
  );
  return scrollPx === noticeBoard.scrollPx
    ? state
    : {
        ...state,
        noticeBoard: {
          kind: 'open',
          scrollPx,
        },
      };
}

export function getMainSignInFailure(state: MainState): SignInFailure | 'none' {
  return state.account.kind === 'guest' ? state.account.signInFailure : 'none';
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 팝업을 닫을 때 닫기 버튼의 hover 를 푼다.
export function closeMainSignInFailure(state: MainState): MainState {
  const cleared = withAccount(state, clearSignInFailure(state.account));
  return withHover(cleared, unhoverButton(cleared.hover, 'signInFailureClose'));
}

export type MainPopupKey =
  | { readonly kind: 'closeSignInFailure' }
  | { readonly kind: 'closeNoticeBoard' }
  | { readonly kind: 'scrollNoticeBoard'; readonly direction: ListDirection }
  | { readonly kind: 'closeAccelerationNotice' }
  | { readonly kind: 'block' }
  | { readonly kind: 'pass' };

// 위에 그려진 팝업부터 키를 받는다: 실패 팝업, 공지 창, 가속 안내 순서다.
export function readMainPopupKey(
  state: MainState,
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): MainPopupKey {
  switch (readSignInFailureKey(getMainSignInFailure(state), event)) {
    case 'close':
      return { kind: 'closeSignInFailure' };
    case 'block':
      return { kind: 'block' };
    case 'pass':
      break;
  }
  if (state.noticeBoard.kind === 'open') {
    switch (readMenuAction(event)) {
      case 'up':
        return {
          kind: 'scrollNoticeBoard',
          direction: 'previous',
        };
      case 'down':
        return {
          kind: 'scrollNoticeBoard',
          direction: 'next',
        };
      case 'confirm':
      case 'back':
        return { kind: 'closeNoticeBoard' };
      default:
        return { kind: 'block' };
    }
  }
  switch (readAccelerationNoticeKey(state.accelerationNotice, event)) {
    case 'close':
      return { kind: 'closeAccelerationNotice' };
    case 'block':
      return { kind: 'block' };
    case 'pass':
      return { kind: 'pass' };
  }
}

export function readMainConfirm(
  state: MainState,
):
  | { readonly kind: 'openNoticeBoard'; readonly state: MainState }
  | { readonly kind: 'activate'; readonly item: Exclude<MainFocus, 'notice'> } {
  const { focus } = state;
  if (focus === 'notice') {
    return {
      kind: 'openNoticeBoard',
      state: openNoticeBoard(state),
    };
  }
  return {
    kind: 'activate',
    item: focus,
  };
}

export function getNoticeIds(state: MainState): readonly string[] {
  return state.notices.kind === 'ready' ? state.notices.items.map((notice) => notice.id) : [];
}

export function getNoticeBoardButtonViews(state: MainState): {
  readonly dismiss: ButtonView;
  readonly close: ButtonView;
} {
  const isOpen = state.noticeBoard.kind === 'open';
  return {
    dismiss: getButtonView(state.hover, 'noticeBoardDismiss', isOpen, false),
    close: getButtonView(state.hover, 'noticeBoardClose', isOpen, false),
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
  const focus = cycleItem(getFocusOrder(state.account, state.notices), state.focus, direction);
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
  | 'signInFailure'
  | 'signInFailureButtons'
  | 'noticeButton'
  | 'noticeBoard'
  | 'noticeBoardScroll'
  | 'noticeBoardButtons'
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
  signInFailure: [getMainSignInFailure],
  signInFailureButtons: readButton('signInFailureClose'),
  noticeButton: [(state) => state.notices.kind, readFocus, ...readButton('notice')],
  noticeBoard: [(state) => state.notices, (state) => state.noticeBoard.kind],
  noticeBoardScroll: [
    (state) => state.notices,
    (state) => (state.noticeBoard.kind === 'open' ? state.noticeBoard.scrollPx : null),
  ],
  noticeBoardButtons: [
    (state) => state.noticeBoard.kind,
    ...readButton('noticeBoardDismiss'),
    ...readButton('noticeBoardClose'),
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
