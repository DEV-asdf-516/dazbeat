import type { AuthUser } from '../../data/account.js';
import {
  cancelSignIn,
  completeRefresh,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../accountState.js';
import type { AccountAuth, AccountState } from '../accountState.js';

export interface MainScreen {
  showAccount(account: AccountState): void;
}

// 닫힌 뒤에는 입력과 늦은 로그인·갱신 결과를 받지 않는다.
type ControllerState = AccountState | { readonly kind: 'closed' };

export class MainController {
  private state: ControllerState;

  constructor(
    private readonly auth: AccountAuth,
    private readonly screen: MainScreen,
  ) {
    const account = this.restoreAccount();
    this.state = account;
    this.screen.showAccount(account);
    if (account.kind === 'signedIn') {
      this.refresh(account);
    }
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  activateAccount(): void {
    switch (this.state.kind) {
      case 'closed':
        return;
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

  close(): void {
    if (this.state.kind === 'signingIn') {
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
        if (this.state === attempt) {
          console.warn('Failed to refresh signed-in user', error);
        }
      },
    );
  }

  private applyAccount(transition: (current: AccountState) => AccountState): void {
    if (this.state.kind === 'closed') {
      return;
    }
    const next = transition(this.state);
    if (next === this.state) {
      return;
    }
    this.state = next;
    this.screen.showAccount(next);
  }
}
