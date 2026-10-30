import type { AuthUser } from '../../data/account.js';
import {
  cancelSignIn,
  completeRefresh,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../app/accountState.js';
import type { AccountAuth, AccountState } from '../app/accountState.js';
import { readControlsKey } from '../app/controlsGuide.js';
import {
  createMainState,
  hoverMainButton,
  isCurrentAccountAttempt,
  moveMainFocus,
  pressMainButton,
  releaseMainButton,
  unhoverMainButton,
  withAccount,
  withControlsOpen,
} from './state/mainMenu.js';
import type { MainButton, MainFocus, MainState } from './state/mainMenu.js';

export interface MainScreen {
  render(previous: MainState | null, next: MainState): void;
  playFocusSound(): void;
  activate(button: MainFocus | 'account'): void;
}

// 닫힌 뒤에는 입력과 늦은 로그인·갱신 결과를 받지 않는다.
type ControllerState = MainState | { readonly kind: 'closed' };

export class MainController {
  private state: ControllerState;

  constructor(
    private readonly auth: AccountAuth,
    private readonly screen: MainScreen,
  ) {
    const account = this.restoreAccount();
    const first = createMainState(account);
    this.state = first;
    this.screen.render(null, first);
    if (account.kind === 'signedIn') {
      this.refresh(account);
    }
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  activateAccount(): void {
    if ('kind' in this.state) {
      return;
    }
    switch (this.state.account.kind) {
      case 'guest': {
        const attempt = startSignIn();
        const signInResult = this.auth.signIn();
        this.applyAccount(() => attempt);
        void signInResult.then(
          (user) =>
            this.applyAccount((current) =>
              user === null
                ? cancelSignIn(current, attempt)
                : completeSignIn(current, attempt, user),
            ),
          (error: unknown) => {
            console.error('Failed to sign in with Google', error);
            this.applyAccount((current) => failSignIn(current, attempt));
          },
        );
        return;
      }
      case 'signingIn':
        this.auth.cancelSignIn();
        this.applyAccount(() => createAccountState(null));
        return;
      case 'signedIn':
        this.auth.signOut();
        this.applyAccount(() => createAccountState(null));
        return;
    }
  }

  moveFocus(delta: 1 | -1): void {
    if ('kind' in this.state) {
      return;
    }
    const next = moveMainFocus(this.state, delta);
    if (next === this.state) {
      return;
    }
    this.apply(() => next);
    this.screen.playFocusSound();
  }

  openControls(): void {
    this.apply((state) => withControlsOpen(state, true));
  }

  closeControls(): void {
    this.apply((state) => withControlsOpen(state, false));
  }

  pointerOver(button: MainButton): void {
    this.apply((state) => hoverMainButton(state, button));
  }

  pointerOut(button: MainButton): void {
    this.apply((state) => unhoverMainButton(state, button));
  }

  pointerDown(button: MainButton): void {
    this.apply((state) => pressMainButton(state, button));
  }

  pointerUp(button: MainButton): void {
    const previous = this.state;
    this.apply((state) => releaseMainButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous) {
      return;
    }
    switch (button) {
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      default:
        this.screen.activate(button);
        return;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    if ('kind' in this.state) {
      return false;
    }
    switch (readControlsKey(this.state.isControlsOpen, event)) {
      case 'open':
        this.openControls();
        return true;
      case 'close':
        this.closeControls();
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  confirm(): void {
    if ('kind' in this.state) {
      return;
    }
    this.screen.activate(this.state.focus);
  }

  close(): void {
    if (!('kind' in this.state) && this.state.account.kind === 'signingIn') {
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
      (user) => this.applyAccount((current) => completeRefresh(current, attempt, user)),
      (error: unknown) => {
        if (!('kind' in this.state) && isCurrentAccountAttempt(this.state, attempt)) {
          console.warn('Failed to refresh signed-in user', error);
        }
      },
    );
  }

  private applyAccount(transition: (current: AccountState) => AccountState): void {
    this.apply((state) => withAccount(state, transition(state.account)));
  }

  private apply(transition: (state: MainState) => MainState): void {
    if ('kind' in this.state) {
      return;
    }
    const previous = this.state;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
