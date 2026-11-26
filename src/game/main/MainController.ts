import type { AuthUser } from '../../data/account.js';
import type { Notice } from '../../data/notices.js';
import {
  cancelSignIn,
  completeRefresh,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../app/accountState.js';
import type { AccountAuth, AccountState } from '../app/accountState.js';
import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  withControlsOpen,
} from '../app/controlsGuide.js';
import { createAccelerationNotice } from './state/accelerationNotice.js';
import type { BrowserIdentity } from './state/accelerationNotice.js';
import {
  closeAccelerationNotice,
  closeMainSignInFailure,
  closeNoticeBoard,
  createMainState,
  getNoticeIds,
  hoverMainButton,
  isCurrentAccountAttempt,
  moveMainFocus,
  openNoticeBoard,
  pressMainButton,
  readMainConfirm,
  readMainPopupKey,
  receiveNotices,
  releaseMainButton,
  scrollNoticeBoard,
  unhoverMainButton,
  withAccount,
} from './state/mainMenu.js';
import type { MainButton, MainFocus, MainState } from './state/mainMenu.js';
import { NOTICE_SCROLL_STEP_PX, hasUnseenNotice } from './state/noticeBoard.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';
import { DIRECTION_STEPS } from '../../range.js';
import type { ListDirection } from '../../range.js';

export interface MainScreen {
  render(previous: MainState | null, next: MainState): void;
  playSound(sound: SoundEffect): void;
  activate(item: Exclude<MainFocus, 'notice'>): void;
  isLeaving(): boolean;
  /** 공지 창 안에 글을 배치하고 내용 높이를 돌려준다. */
  layoutNotices(items: readonly Notice[]): number;
}

export interface AccelerationNoticePorts {
  /** 부팅에서 소프트웨어 렌더링이 감지됐으면 처음 부를 때만 true 다. */
  takeBootSoftwareRendering(): boolean;
  isDismissed(): boolean;
  dismiss(): void;
  readonly browser: BrowserIdentity;
}

export interface NoticePorts {
  /** 부팅 때 시작한 불러오기. 실패는 빈 목록으로 끝나 거절하지 않는다. */
  readonly published: Promise<readonly Notice[]>;
  /** 이번 부팅에 아직 자동으로 열지 않았으면 처음 부를 때만 true 다. */
  takeAutoOpen(): boolean;
  loadDismissedIds(): ReadonlySet<string>;
  dismiss(ids: readonly string[]): void;
}

// 닫힌 뒤에는 입력과 늦은 로그인·갱신 결과를 받지 않는다.
type ControllerState = MainState | { readonly kind: 'closed' };

export class MainController {
  private state: ControllerState;

  constructor(
    private readonly auth: AccountAuth,
    private readonly screen: MainScreen,
    private readonly accelerationNotice: AccelerationNoticePorts,
    private readonly notices: NoticePorts,
  ) {
    const account = this.restoreAccount();
    const notice = createAccelerationNotice({
      isSoftwareRendering: accelerationNotice.takeBootSoftwareRendering(),
      isDismissed: accelerationNotice.isDismissed(),
      browser: accelerationNotice.browser,
    });
    this.state = createMainState(account, notice);
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.screen.render(null, state);
    if (state.account.kind === 'signedIn') {
      this.refresh(state.account);
    }
    void this.notices.published.then((items) => {
      const current = this.open;
      if (current === null || items.length === 0) {
        return;
      }
      const contentHeightPx = this.screen.layoutNotices(items);
      // 열 수 없을 때 차례를 쓰지 않도록 takeAutoOpen 을 맨 뒤에 부른다.
      const isAutoOpenDue =
        !this.screen.isLeaving() &&
        hasUnseenNotice(items, this.notices.loadDismissedIds()) &&
        this.notices.takeAutoOpen();
      this.apply(receiveNotices(current, items, contentHeightPx, isAutoOpenDue));
    });
  }

  moveFocus(direction: ListDirection): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const next = moveMainFocus(state, direction);
    if (next === state) {
      return;
    }
    this.apply(next);
    this.screen.playSound('menuFocus');
  }

  pointerOver(button: MainButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverMainButton(state, button));
  }

  pointerOut(button: MainButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverMainButton(state, button));
  }

  pointerDown(button: MainButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(pressMainButton(state, button));
  }

  /** popup 이 사용자 입력에 이어지도록 계정 버튼의 signIn 호출 앞에 await 를 두지 않는다. */
  pointerUp(button: MainButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const released = releaseMainButton(state, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === state) {
      return;
    }
    switch (button) {
      case 'controlsEntry':
        this.apply(withControlsOpen(released, true));
        this.screen.playSound('click');
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.apply(withControlsOpen(released, false));
        this.screen.playSound('close');
        return;
      case 'controlsHelp':
        this.apply(clickControlsHelp(released));
        this.screen.playSound('click');
        return;
      case 'accelerationNoticeAccept':
        this.apply(closeAccelerationNotice(released));
        this.screen.playSound('close');
        return;
      case 'accelerationNoticeDismiss':
        // 저장에 실패해도 이번 부팅의 안내는 닫는다. 다음 부팅은 실제로 저장된 값을 따른다.
        try {
          this.accelerationNotice.dismiss();
        } catch (error) {
          console.error('Failed to save acceleration notice dismissal', error);
        }
        this.apply(closeAccelerationNotice(released));
        this.screen.playSound('close');
        return;
      case 'signInFailureClose':
        this.apply(closeMainSignInFailure(released));
        this.screen.playSound('close');
        return;
      case 'notice':
        this.apply(openNoticeBoard(released));
        this.screen.playSound('click');
        return;
      case 'noticeBoardClose':
        this.apply(closeNoticeBoard(released));
        this.screen.playSound('close');
        return;
      case 'noticeBoardDismiss':
        // 저장에 실패해도 창은 닫는다. 다음 부팅은 실제로 저장된 기록을 따른다.
        try {
          this.notices.dismiss(getNoticeIds(released));
        } catch (error) {
          console.error('Failed to save notice dismissal', error);
        }
        this.apply(closeNoticeBoard(released));
        this.screen.playSound('close');
        return;
      case 'account':
        this.screen.playSound('click');
        // 씬 전환 중에는 계정 로그인·로그아웃도 시작하지 않는다.
        if (this.screen.isLeaving()) {
          this.apply(released);
          return;
        }
        switch (released.account.kind) {
          case 'guest': {
            const attempt = startSignIn();
            const signInResult = this.auth.signIn();
            this.apply(withAccount(released, attempt));
            void signInResult.then(
              (user) => {
                const current = this.open;
                if (current === null) {
                  return;
                }
                this.apply(
                  withAccount(
                    current,
                    user === null
                      ? cancelSignIn(current.account, attempt)
                      : completeSignIn(current.account, attempt, user),
                  ),
                );
              },
              (error: unknown) => {
                console.error('Failed to sign in with Google', error);
                const current = this.open;
                if (current === null) {
                  return;
                }
                this.apply(withAccount(current, failSignIn(current.account, attempt, error)));
              },
            );
            return;
          }
          case 'signingIn':
            this.auth.cancelSignIn();
            this.apply(withAccount(released, createAccountState(null)));
            return;
          case 'signedIn':
            this.apply(released);
            return;
        }
        return;
      default:
        this.apply(released);
        this.screen.playSound('click');
        this.screen.activate(button);
        return;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(state), event)) {
      case 'open':
        this.apply(withControlsOpen(state, true));
        this.screen.playSound('click');
        return true;
      case 'close':
        this.apply(withControlsOpen(state, false));
        this.screen.playSound('close');
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  captureKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    const key = readMainPopupKey(state, event);
    switch (key.kind) {
      case 'closeSignInFailure':
        this.apply(closeMainSignInFailure(state));
        this.screen.playSound('close');
        return true;
      case 'closeNoticeBoard':
        this.apply(closeNoticeBoard(state));
        this.screen.playSound('close');
        return true;
      case 'scrollNoticeBoard':
        this.apply(
          scrollNoticeBoard(state, DIRECTION_STEPS[key.direction] * NOTICE_SCROLL_STEP_PX),
        );
        return true;
      case 'closeAccelerationNotice':
        this.apply(closeAccelerationNotice(state));
        this.screen.playSound('close');
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  scrollNoticeBoard(deltaYPx: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(scrollNoticeBoard(state, deltaYPx));
  }

  confirm(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const confirmed = readMainConfirm(state);
    if (confirmed.kind === 'openNoticeBoard') {
      this.apply(confirmed.state);
      this.screen.playSound('click');
    } else {
      this.screen.playSound('click');
      this.screen.activate(confirmed.item);
    }
  }

  close(): void {
    if (this.open?.account.kind === 'signingIn') {
      this.auth.cancelSignIn();
    }
    this.state = { kind: 'closed' };
  }

  /** 저장된 세션을 해석하지 못해도 인증은 플레이에 필요 없으므로 세션을 지우고 Guest 로 둔다. */
  private restoreAccount(): AccountState {
    let user: AuthUser | null;
    try {
      user = this.auth.getCurrentUser();
    } catch (error) {
      console.error('Failed to restore signed-in user', error);
      this.auth.signOut();
      return createAccountState(null);
    }
    return createAccountState(user);
  }

  // 갱신 실패는 서버가 세션을 거절한 것이 아니므로 저장된 로그인 상태를 그대로 둔다.
  private refresh(attempt: AccountState): void {
    void this.auth.refresh().then(
      (user) => {
        const current = this.open;
        if (current === null) {
          return;
        }
        this.apply(withAccount(current, completeRefresh(current.account, attempt, user)));
      },
      (error: unknown) => {
        const current = this.open;
        if (current !== null && isCurrentAccountAttempt(current, attempt)) {
          console.warn('Failed to refresh signed-in user', error);
        }
      },
    );
  }

  private get open(): MainState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private apply(next: MainState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
