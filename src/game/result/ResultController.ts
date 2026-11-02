import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { withControlsOpen } from '../app/controlsGuide.js';
import type { ResultRanking, SceneRequest } from '../app/sceneRoutes.js';
import {
  applyMenuInput,
  applyRankingSubmission,
  closeRankingNotice,
  createResultState,
  dismissToast,
  getResultExitRequest,
  hoverDifficulty,
  hoverResultButton,
  hoverToastClose,
  moveResultFocus,
  pressResultButton,
  pressResultMenu,
  readResultControlsKey,
  releaseResultButton,
  removeToast,
  selectRetryDifficulty,
  stepRetryChart,
  unhoverDifficulty,
  unhoverResultButton,
  unhoverToastClose,
} from './state/resultState.js';
import type { ResultButton, ResultExit, ResultMenuItem, ResultState } from './state/resultState.js';

export interface ResultScreen {
  render(previous: ResultState | null, next: ResultState): void;
  playFocusSound(): void;
  playCloseSound(): void;
  playClickSound(): void;
  leave(request: SceneRequest): void;
}

type Transition = (state: ResultState) => ResultState;

// 닫힌 뒤에는 입력과 늦은 제출 결과·알림 타이머를 받지 않는다.
type ControllerState = ResultState | { readonly kind: 'closed' };

export class ResultController {
  private state: ControllerState;

  constructor(
    private readonly screen: ResultScreen,
    retryChart: ChartRef,
    private readonly exit: ResultExit,
    ranking: ResultRanking,
  ) {
    const first = createResultState(retryChart, ranking);
    this.state = first;
    this.screen.render(null, first);
    if (ranking.kind === 'submitted') {
      // 제출 예외는 GameplayController 가 unknown 으로 바꿔 두므로 이 Promise 는 거절되지 않는다.
      void ranking.submission.then((submission) =>
        this.apply((state) => applyRankingSubmission(state, submission)),
      );
    }
  }

  hoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => hoverDifficulty(state, difficulty));
  }

  unhoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => unhoverDifficulty(state, difficulty));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.applyMenu((state) => selectRetryDifficulty(state, difficulty));
  }

  stepDifficulty(delta: 1 | -1): void {
    this.applyMenu((state) => stepRetryChart(state, delta));
  }

  moveFocus(delta: 1 | -1): void {
    if ('kind' in this.state) {
      return;
    }
    const next = applyMenuInput(this.state, (state) => moveResultFocus(state, delta));
    if (next === this.state) {
      return;
    }
    this.apply(() => next);
    this.screen.playFocusSound();
  }

  openControls(): void {
    this.applyMenu((state) => withControlsOpen(state, true));
  }

  closeControls(): void {
    this.apply((state) => withControlsOpen(state, false));
    this.screen.playCloseSound();
  }

  pointerOver(button: ResultButton): void {
    this.apply((state) => hoverResultButton(state, button));
  }

  pointerOut(button: ResultButton): void {
    this.apply((state) => unhoverResultButton(state, button));
  }

  pointerDown(button: ResultButton): void {
    this.apply((state) => pressResultButton(state, button));
  }

  pointerUp(button: ResultButton): void {
    const previous = this.state;
    this.apply((state) => releaseResultButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous) {
      return;
    }
    switch (button) {
      case 'retry':
      case 'songSelect':
        this.screen.playClickSound();
        this.activate(button);
        return;
      case 'controlsEntry':
        this.screen.playClickSound();
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      case 'noticeClose':
        this.screen.playClickSound();
        this.apply(closeRankingNotice);
        return;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    if ('kind' in this.state) {
      return false;
    }
    switch (readResultControlsKey(this.state, event)) {
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
    this.activate(this.state.focus);
  }

  back(): void {
    this.activate('songSelect');
  }

  hoverToastClose(toastId: number): void {
    this.apply((state) => hoverToastClose(state, toastId));
  }

  unhoverToastClose(toastId: number): void {
    this.apply((state) => unhoverToastClose(state, toastId));
  }

  closeToast(toastId: number): void {
    this.dismissToast(toastId);
    this.screen.playCloseSound();
  }

  dismissToast(toastId: number): void {
    this.apply((state) => dismissToast(state, toastId));
  }

  removeToast(toastId: number): void {
    this.apply((state) => removeToast(state, toastId));
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  private activate(item: ResultMenuItem): void {
    if ('kind' in this.state) {
      return;
    }
    const outcome = pressResultMenu(this.state, item);
    switch (outcome.kind) {
      case 'stay':
        this.apply(() => outcome.state);
        return;
      case 'leave':
        this.screen.leave(getResultExitRequest(this.state, outcome.item, this.exit));
        return;
    }
  }

  private applyMenu(transition: Transition): void {
    this.apply((state) => applyMenuInput(state, transition));
  }

  private apply(transition: Transition): void {
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
