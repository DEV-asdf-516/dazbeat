import type { NamedAchievementDefinition } from '../../data/achievements.js';
import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { readControlsKey, withControlsOpen } from '../app/controlsGuide.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import {
  createResultState,
  dismissToast,
  getResultExitRequest,
  hoverDifficulty,
  hoverResultButton,
  hoverToastClose,
  moveResultFocus,
  pressResultButton,
  queueAchievements,
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
  leave(request: SceneRequest): void;
}

type Transition = (state: ResultState) => ResultState;

// 닫힌 뒤에는 입력과 늦은 업적 목록·알림 타이머를 받지 않는다.
type ControllerState = ResultState | { readonly kind: 'closed' };

export class ResultController {
  private state: ControllerState;

  constructor(
    private readonly screen: ResultScreen,
    retryChart: ChartRef,
    private readonly exit: ResultExit,
    newAchievements: Promise<readonly NamedAchievementDefinition[]>,
  ) {
    const first = createResultState(retryChart);
    this.state = first;
    this.screen.render(null, first);
    // 제출 실패는 GameplayController 가 빈 목록으로 바꿔 두므로 이 Promise 는 거절되지 않는다.
    void newAchievements.then((achievements) => {
      if (achievements.length === 0) {
        return;
      }
      this.apply((state) => queueAchievements(state, achievements));
    });
  }

  hoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => hoverDifficulty(state, difficulty));
  }

  unhoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => unhoverDifficulty(state, difficulty));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.apply((state) => selectRetryDifficulty(state, difficulty));
  }

  stepDifficulty(delta: 1 | -1): void {
    this.apply((state) => stepRetryChart(state, delta));
  }

  moveFocus(delta: 1 | -1): void {
    if ('kind' in this.state) {
      return;
    }
    const next = moveResultFocus(this.state, delta);
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
        this.activate(button);
        return;
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
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
    this.activate(this.state.focus);
  }

  back(): void {
    this.activate('songSelect');
  }

  activate(item: ResultMenuItem): void {
    if ('kind' in this.state) {
      return;
    }
    this.screen.leave(getResultExitRequest(this.state, item, this.exit));
  }

  hoverToastClose(toastId: number): void {
    this.apply((state) => hoverToastClose(state, toastId));
  }

  unhoverToastClose(toastId: number): void {
    this.apply((state) => unhoverToastClose(state, toastId));
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
