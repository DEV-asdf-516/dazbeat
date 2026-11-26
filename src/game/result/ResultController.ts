import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { clickControlsHelp, withControlsOpen } from '../app/controlsGuide.js';
import { completeAccountSignIn } from '../ui/state/accountIdentity.js';
import type { PlayOrigin, ResultRanking, ResultReport, SceneRequest } from '../app/sceneRoutes.js';
import {
  applyMenuInput,
  applyRankingSubmission,
  closeGuestNotice,
  closeRankingNotice,
  createResultState,
  dismissToast,
  getProfileReturnRanking,
  getResultExitRequest,
  hoverDifficulty,
  hoverResultButton,
  hoverToastClose,
  moveResultFocus,
  pressResultButton,
  pressResultMenu,
  readGuestNoticeKey,
  readResultControlsKey,
  releaseResultButton,
  removeToast,
  selectRetryDifficulty,
  stepRetryChart,
  unhoverDifficulty,
  unhoverResultButton,
  unhoverToastClose,
} from './state/resultState.js';
import type { ResultButton, ResultState } from './state/resultState.js';
import type { AuthUser } from '../../data/account.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';
import type { ListDirection } from '../../range.js';

export interface ResultScreen {
  render(previous: ResultState | null, next: ResultState): void;
  playSound(sound: SoundEffect): void;
  leave(request: SceneRequest): void;
  openProfile(ranking: ResultRanking): void;
  renderAccount(): void;
  isLeaving(): boolean;
}

export interface GuestNoticePorts {
  isShown(): boolean;
  markShown(): void;
  signIn(): Promise<AuthUser | null>;
}

// 닫힌 뒤에는 입력과 늦은 제출 결과·알림 타이머를 받지 않는다.
type ControllerState = ResultState | { readonly kind: 'closed' };

export class ResultController {
  private state: ControllerState;

  constructor(
    private readonly screen: ResultScreen,
    private readonly played: ChartRef,
    private readonly origin: PlayOrigin,
    private readonly ranking: ResultRanking,
    report: ResultReport,
    private readonly guestNotice: GuestNoticePorts,
  ) {
    this.state = createResultState(played, ranking, guestNotice.isShown(), report);
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.screen.render(null, state);
    if (state.isGuestNoticeOpen) {
      // 저장에 실패해도 이번 안내는 띄운다. 다음 판은 실제로 저장된 값을 따른다.
      try {
        this.guestNotice.markShown();
      } catch (error) {
        console.error('Failed to save guest notice', error);
      }
    }
    if (this.ranking.kind === 'submitted') {
      // 제출 예외는 GameplayController 가 unknown 으로 바꿔 두므로 이 Promise 는 거절되지 않는다.
      void this.ranking.submission.then((submission) => {
        const current = this.open;
        if (current === null) {
          return;
        }
        this.apply(applyRankingSubmission(current, submission));
      });
    }
  }

  hoverDifficulty(difficulty: Difficulty): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverDifficulty(state, difficulty));
  }

  unhoverDifficulty(difficulty: Difficulty): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverDifficulty(state, difficulty));
  }

  selectDifficulty(difficulty: Difficulty): void {
    // 씬 전환 중에는 난이도를 바꾸지 않는다.
    if (this.screen.isLeaving()) {
      return;
    }
    const state = this.open;
    if (state === null) {
      return;
    }
    const next = applyMenuInput(state, (current) => selectRetryDifficulty(current, difficulty));
    this.apply(next);
    if (next !== state) {
      this.screen.playSound('click');
    }
  }

  stepDifficulty(direction: ListDirection): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const next = applyMenuInput(state, (current) => stepRetryChart(current, direction));
    this.apply(next);
    if (next !== state) {
      this.screen.playSound('click');
    }
  }

  moveFocus(direction: ListDirection): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const next = applyMenuInput(state, (current) => moveResultFocus(current, direction));
    if (next === state) {
      return;
    }
    this.apply(next);
    this.screen.playSound('menuFocus');
  }

  pointerOver(button: ResultButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverResultButton(state, button));
  }

  pointerOut(button: ResultButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverResultButton(state, button));
  }

  pointerDown(button: ResultButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(pressResultButton(state, button));
  }

  pointerUp(button: ResultButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const released = releaseResultButton(state, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === state) {
      return;
    }
    switch (button) {
      case 'retry':
      case 'songSelect': {
        this.screen.playSound('click');
        const outcome = pressResultMenu(released, button);
        if (outcome.kind === 'stay') {
          this.apply(outcome.state);
          return;
        }
        this.apply(released);
        this.screen.leave(getResultExitRequest(released, outcome.item, this.origin, this.played));
        return;
      }
      case 'controlsEntry':
        this.apply(applyMenuInput(released, (current) => withControlsOpen(current, true)));
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
      case 'accountProfile':
        this.apply(released);
        this.screen.playSound('click');
        this.screen.openProfile(getProfileReturnRanking(released, this.ranking));
        return;
      case 'accountSignIn':
        this.apply(released);
        this.screen.playSound('click');
        this.signIn();
        return;
      case 'noticeClose':
        this.apply(closeRankingNotice(released));
        this.screen.playSound('click');
        return;
      case 'guestNoticeLater':
        this.apply(closeGuestNotice(released));
        this.screen.playSound('close');
        return;
      case 'guestNoticeSignIn':
        this.screen.playSound('click');
        this.signIn();
        this.apply(closeGuestNotice(released));
        return;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readResultControlsKey(state, event)) {
      case 'open':
        this.apply(applyMenuInput(state, (current) => withControlsOpen(current, true)));
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

  confirm(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const guestNoticeButton = readGuestNoticeKey(state, 'confirm');
    switch (guestNoticeButton) {
      case 'guestNoticeLater':
        this.apply(closeGuestNotice(state));
        this.screen.playSound('close');
        return;
      case 'guestNoticeSignIn':
        this.screen.playSound('click');
        this.signIn();
        this.apply(closeGuestNotice(state));
        return;
      case null:
        break;
    }
    this.screen.playSound('click');
    const outcome = pressResultMenu(state, state.focus);
    if (outcome.kind === 'stay') {
      this.apply(outcome.state);
      return;
    }
    this.screen.leave(getResultExitRequest(state, outcome.item, this.origin, this.played));
  }

  back(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const guestNoticeButton = readGuestNoticeKey(state, 'back');
    switch (guestNoticeButton) {
      case 'guestNoticeLater':
        this.apply(closeGuestNotice(state));
        this.screen.playSound('close');
        return;
      case 'guestNoticeSignIn':
        this.screen.playSound('click');
        this.signIn();
        this.apply(closeGuestNotice(state));
        return;
      case null:
        break;
    }
    this.screen.playSound('close');
    const outcome = pressResultMenu(state, 'songSelect');
    if (outcome.kind === 'stay') {
      this.apply(outcome.state);
      return;
    }
    this.screen.leave(getResultExitRequest(state, outcome.item, this.origin, this.played));
  }

  hoverToastClose(toastId: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverToastClose(state, toastId));
  }

  unhoverToastClose(toastId: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverToastClose(state, toastId));
  }

  closeToast(toastId: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(dismissToast(state, toastId));
    this.screen.playSound('close');
  }

  dismissToast(toastId: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(dismissToast(state, toastId));
  }

  removeToast(toastId: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(removeToast(state, toastId));
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private signIn(): void {
    void this.guestNotice
      .signIn()
      .then((user) => {
        const state = this.open;
        if (user === null || state === null) {
          return;
        }
        this.screen.renderAccount();
        this.apply(completeAccountSignIn(state));
      })
      .catch((error: unknown) => {
        console.error('Failed to sign in with Google', error);
      });
  }

  private get open(): ResultState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private apply(next: ResultState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
