import type { Leaderboard } from '../../data/ranking.js';
import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { readControlsKey, readControlsWheel, withControlsOpen } from '../app/controlsGuide.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { IDLE_WHEEL } from '../ui/state/wheelRows.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';
import {
  applyLeaderboard,
  closeRankingDialog,
  createRankingState,
  failLeaderboard,
  hoverRankingButton,
  hoverRankingDifficulty,
  openRankingControls,
  pressRankingButton,
  readRankingDialogButton,
  readRankingKey,
  releaseRankingButton,
  retryLeaderboard,
  scrollRanking,
  selectRankingDifficulty,
  stepRankingDifficulty,
  unhoverRankingButton,
  unhoverRankingDifficulty,
} from './state/rankingState.js';
import type { RankingAction, RankingButton, RankingState } from './state/rankingState.js';

export interface RankingPorts {
  loadLeaderboard(chartId: string): Promise<Leaderboard>;
  isSignedIn(): boolean;
  loadRevisionNotices(): ReadonlyMap<string, string>;
  saveRevisionNotice(chartId: string, chartRevision: string): void;
}

export interface RankingScreen {
  render(previous: RankingState | null, next: RankingState): void;
  playSound(sound: SoundEffect): void;
  back(): void;
  openProfile(): void;
}

// 닫힌 뒤에는 입력과 늦은 응답을 받지 않는다.
type ControllerState = RankingState | { readonly kind: 'closed' };

export class RankingController {
  private state: ControllerState;
  private wheel = IDLE_WHEEL;
  // 응답이 지금 요청의 것인지 가리는 토큰이다. 탭을 바꾸거나 다시 시도하면 앞 요청의 응답은 버린다.
  private request: object | null = null;

  constructor(
    private readonly ports: RankingPorts,
    private readonly screen: RankingScreen,
    chart: ChartRef,
    private readonly wheelStepPx: number,
  ) {
    const first = createRankingState(chart, ports.isSignedIn(), ports.loadRevisionNotices());
    this.state = first;
    this.screen.render(null, first);
    this.load(first);
  }

  handleMenuKey(action: MenuAction | null): void {
    if ('kind' in this.state) {
      return;
    }
    const read = readRankingKey(this.state, action);
    if (read.kind !== 'none') {
      this.run(read);
    }
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    if ('kind' in this.state) {
      return;
    }
    const read = readControlsWheel(this.state.isControlsOpen, this.wheel, {
      deltaYPx,
      atMs,
      rowPx: this.wheelStepPx,
    });
    this.wheel = read.gesture;
    this.apply((state) => scrollRanking(state, read.rows));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.changeChart((state) => selectRankingDifficulty(state, difficulty));
  }

  hoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => hoverRankingDifficulty(state, difficulty));
  }

  unhoverDifficulty(difficulty: Difficulty): void {
    this.apply((state) => unhoverRankingDifficulty(state, difficulty));
  }

  pointerOver(button: RankingButton): void {
    this.apply((state) => hoverRankingButton(state, button));
  }

  pointerOut(button: RankingButton): void {
    this.apply((state) => unhoverRankingButton(state, button));
  }

  pointerDown(button: RankingButton): void {
    this.apply((state) => pressRankingButton(state, button));
  }

  pointerUp(button: RankingButton): void {
    const previous = this.state;
    this.apply((state) => releaseRankingButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous || 'kind' in this.state) {
      return;
    }
    switch (button) {
      case 'back':
        this.run({ kind: 'back' });
        return;
      case 'dialogCancel':
      case 'dialogAccept': {
        const read = readRankingDialogButton(this.state, button);
        if (read.kind !== 'none') {
          this.run(read);
        }
        return;
      }
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      case 'accountProfile':
        this.screen.playSound('click');
        this.screen.openProfile();
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

  close(): void {
    this.state = { kind: 'closed' };
    this.request = null;
  }

  private run(action: RankingAction): void {
    switch (action.kind) {
      case 'scroll':
        this.apply((state) => scrollRanking(state, action.rows));
        return;
      case 'difficulty':
        this.changeChart((state) => stepRankingDifficulty(state, action.step));
        return;
      case 'retry':
        this.changeChart(retryLeaderboard);
        return;
      case 'closeDialog': {
        const previous = this.state;
        this.apply(closeRankingDialog);
        if ('kind' in previous || previous.load.kind !== 'loaded') {
          return;
        }
        this.screen.playSound('click');
        // 확인한 뒤로는 랭킹에 다시 들어와도 같은 채보 버전의 안내를 띄우지 않는다.
        this.ports.saveRevisionNotice(previous.chart.chartId, previous.load.board.chartRevision);
        return;
      }
      case 'back':
        this.screen.playSound('close');
        this.close();
        this.screen.back();
        return;
    }
  }

  // 대화상자가 열려 있으면 열리지 않으므로 소리도 내지 않는다.
  private openControls(): void {
    const previous = this.state;
    this.apply(openRankingControls);
    if (this.state !== previous) {
      this.screen.playSound('click');
    }
  }

  private closeControls(): void {
    this.apply((state) => withControlsOpen(state, false));
    this.screen.playSound('close');
  }

  /** 다시 불러올 상태로 바뀌었을 때만 소리를 내고 지금 채보를 요청한다. */
  private changeChart(transition: (state: RankingState) => RankingState): void {
    const previous = this.state;
    this.apply(transition);
    if (this.state === previous || 'kind' in this.state) {
      return;
    }
    this.screen.playSound('click');
    this.load(this.state);
  }

  private load(state: RankingState): void {
    const request = {};
    this.request = request;
    const { chartId } = state.chart;
    void this.ports
      .loadLeaderboard(chartId)
      .then(
        (board) => (current: RankingState) => applyLeaderboard(current, board),
        (error: unknown) => (current: RankingState) => failLeaderboard(current, error),
      )
      .then((transition) => {
        if (request === this.request) {
          this.apply(transition);
        }
      });
  }

  private apply(transition: (state: RankingState) => RankingState): void {
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
