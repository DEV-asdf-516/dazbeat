import type { AuthUser } from '../../data/account.js';
import type { Leaderboard } from '../../data/ranking.js';
import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  readControlsWheel,
  withControlsOpen,
} from '../app/controlsGuide.js';
import {
  closeSignInFailure,
  failAccountSignIn,
  readSignInFailureKey,
} from '../ui/state/accountIdentity.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { IDLE_WHEEL } from '../ui/state/wheelRows.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';
import {
  applyLeaderboard,
  closeRankingDialog,
  completeRankingSignIn,
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
  signIn(): Promise<AuthUser | null>;
}

export interface RankingScreen {
  render(previous: RankingState | null, next: RankingState): void;
  playSound(sound: SoundEffect): void;
  back(): void;
  openProfile(): void;
  renderAccount(): void;
}

// 닫힌 뒤에는 입력과 늦은 응답을 받지 않는다.
type ControllerState = RankingState | { readonly kind: 'closed' };

export class RankingController {
  private state: ControllerState;
  private wheel = IDLE_WHEEL;
  // 응답이 지금 요청의 것인지 가리는 토큰이다. 탭을 바꾸거나 다시 시도하면 앞 요청의 응답은 버린다.
  private request: object | null = null;
  // 앞 시도의 늦은 실패가 뒤 시도 위에 팝업을 띄우지 않도록 마지막 시도만 기억한다.
  private signInToken: object | null = null;

  constructor(
    private readonly ports: RankingPorts,
    private readonly screen: RankingScreen,
    chart: ChartRef,
    private readonly wheelStepPx: number,
  ) {
    this.state = createRankingState(chart, ports.isSignedIn(), ports.loadRevisionNotices());
  }

  start(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.screen.render(null, state);
    this.load(state);
  }

  handleMenuKey(action: MenuAction | null): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const read = readRankingKey(state, action);
    switch (read.kind) {
      case 'none':
        return;
      case 'scroll':
        this.apply(scrollRanking(state, read.rows));
        return;
      case 'difficulty':
      case 'retry': {
        const next =
          read.kind === 'retry'
            ? retryLeaderboard(state)
            : stepRankingDifficulty(state, read.direction);
        this.apply(next);
        if (next === state) {
          return;
        }
        this.screen.playSound('click');
        this.load(next);
        return;
      }
      case 'closeDialog':
        this.apply(closeRankingDialog(state));
        if (state.load.kind !== 'loaded') {
          return;
        }
        this.screen.playSound('click');
        // 확인한 뒤로는 랭킹에 다시 들어와도 같은 채보 버전의 안내를 띄우지 않는다.
        this.ports.saveRevisionNotice(state.chart.chartId, state.load.board.chartRevision);
        return;
      case 'back':
        this.screen.playSound('close');
        this.state = { kind: 'closed' };
        this.request = null;
        this.screen.back();
        return;
    }
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const read = readControlsWheel(isControlsPanelOpen(state), this.wheel, {
      deltaYPx,
      atMs,
      rowPx: this.wheelStepPx,
    });
    this.wheel = read.gesture;
    this.apply(scrollRanking(state, read.rows));
  }

  selectDifficulty(difficulty: Difficulty): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const next = selectRankingDifficulty(state, difficulty);
    this.apply(next);
    if (next === state) {
      return;
    }
    this.screen.playSound('click');
    this.load(next);
  }

  hoverDifficulty(difficulty: Difficulty): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverRankingDifficulty(state, difficulty));
  }

  unhoverDifficulty(difficulty: Difficulty): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverRankingDifficulty(state, difficulty));
  }

  pointerOver(button: RankingButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverRankingButton(state, button));
  }

  pointerOut(button: RankingButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverRankingButton(state, button));
  }

  pointerDown(button: RankingButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(pressRankingButton(state, button));
  }

  pointerUp(button: RankingButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const released = releaseRankingButton(state, button);
    if (released === state) {
      return;
    }
    switch (button) {
      case 'back':
      case 'dialogCancel':
      case 'dialogAccept': {
        const read: RankingAction | { readonly kind: 'none' } =
          button === 'back' ? { kind: 'back' } : readRankingDialogButton(released, button);
        switch (read.kind) {
          case 'none':
            this.apply(released);
            return;
          case 'scroll':
            this.apply(scrollRanking(released, read.rows));
            return;
          case 'difficulty':
          case 'retry': {
            const next =
              read.kind === 'retry'
                ? retryLeaderboard(released)
                : stepRankingDifficulty(released, read.direction);
            this.apply(next);
            if (next === released) {
              return;
            }
            this.screen.playSound('click');
            this.load(next);
            return;
          }
          case 'closeDialog':
            this.apply(closeRankingDialog(released));
            if (released.load.kind !== 'loaded') {
              return;
            }
            this.screen.playSound('click');
            // 확인한 뒤로는 랭킹에 다시 들어와도 같은 채보 버전의 안내를 띄우지 않는다.
            this.ports.saveRevisionNotice(
              released.chart.chartId,
              released.load.board.chartRevision,
            );
            return;
          case 'back':
            this.apply(released);
            this.screen.playSound('close');
            this.state = { kind: 'closed' };
            this.request = null;
            this.screen.back();
            return;
        }
        return;
      }
      case 'controlsEntry': {
        const next = openRankingControls(released);
        this.apply(next);
        if (next !== released) {
          this.screen.playSound('click');
        }
        return;
      }
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
        this.screen.openProfile();
        return;
      case 'accountSignIn':
        this.apply(released);
        this.signIn();
        return;
      case 'signInFailureClose':
        this.apply(closeSignInFailure(released));
        this.screen.playSound('close');
        return;
    }
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private signIn(): void {
    this.screen.playSound('click');
    const token = {};
    this.signInToken = token;
    void this.ports.signIn().then(
      (user) => {
        const state = this.open;
        if (user === null || state === null) {
          return;
        }
        this.screen.renderAccount();
        const next = completeRankingSignIn(state);
        this.apply(next);
        this.load(next);
      },
      (error: unknown) => {
        console.error('Failed to sign in with Google', error);
        const state = this.open;
        if (state === null || token !== this.signInToken) {
          return;
        }
        this.apply(failAccountSignIn(state, error));
      },
    );
  }

  captureKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readSignInFailureKey(state.signInFailure, event)) {
      case 'close':
        this.apply(closeSignInFailure(state));
        this.screen.playSound('close');
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(state), event)) {
      case 'open': {
        const next = openRankingControls(state);
        this.apply(next);
        if (next !== state) {
          this.screen.playSound('click');
        }
        return true;
      }
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

  close(): void {
    this.state = { kind: 'closed' };
    this.request = null;
  }

  private load(state: RankingState): void {
    const request = {};
    this.request = request;
    const { chartId } = state.chart;
    void this.ports.loadLeaderboard(chartId).then(
      (board) => {
        const current = this.open;
        if (request !== this.request || current === null) {
          return;
        }
        this.apply(applyLeaderboard(current, board));
      },
      (error: unknown) => {
        const current = this.open;
        if (request !== this.request || current === null) {
          return;
        }
        this.apply(failLeaderboard(current, error));
      },
    );
  }

  private get open(): RankingState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private apply(next: RankingState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
