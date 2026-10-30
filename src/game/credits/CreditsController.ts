import { readControlsKey } from '../app/controlsGuide.js';
import type { SongFeed } from '../app/SongFeed.js';
import { IDLE_WHEEL, readWheelRows } from '../ui/state/wheelRows.js';
import {
  INITIAL_CREDITS_STATE,
  hoverCreditsButton,
  pressCreditsButton,
  releaseCreditsButton,
  scrollCredits,
  unhoverCreditsButton,
  withControlsOpen,
  withCreditSongs,
} from './state/creditsState.js';
import type { CreditsButton, CreditsGrid, CreditsState } from './state/creditsState.js';

export interface CreditsScreen {
  render(previous: CreditsState | null, next: CreditsState): void;
  leave(): void;
}

export type CreditsCatalog = Pick<SongFeed, 'songs' | 'subscribe' | 'requestRemaining'>;

// 닫힌 뒤에는 입력과 늦은 곡 목록 변경을 받지 않는다.
type ControllerState = CreditsState | { readonly kind: 'closed' };

export class CreditsController {
  private state: ControllerState;
  private wheel = IDLE_WHEEL;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly catalog: CreditsCatalog,
    private readonly screen: CreditsScreen,
    private readonly grid: CreditsGrid,
    private readonly wheelStepPx: number,
  ) {
    const first = withCreditSongs(INITIAL_CREDITS_STATE, catalog.songs);
    this.state = first;
    // 곡이 없어 state 가 그대로여도 스크롤 트랙은 보여야 하므로 처음 한 번은 전이와 무관하게 그린다.
    this.screen.render(null, first);
    this.unsubscribe = catalog.subscribe(() =>
      this.apply((state) => withCreditSongs(state, this.catalog.songs)),
    );
    void catalog.requestRemaining();
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    if ('kind' in this.state || this.state.isControlsOpen) {
      return;
    }
    const read = readWheelRows(this.wheel, deltaYPx, atMs, this.wheelStepPx);
    this.wheel = read.gesture;
    this.apply((state) => scrollCredits(state, this.grid, read.rows));
  }

  scroll(rows: 1 | -1): void {
    this.apply((state) => scrollCredits(state, this.grid, rows));
  }

  openControls(): void {
    this.apply((state) => withControlsOpen(state, true));
  }

  closeControls(): void {
    this.apply((state) => withControlsOpen(state, false));
  }

  pointerOver(button: CreditsButton): void {
    this.apply((state) => hoverCreditsButton(state, button));
  }

  pointerOut(button: CreditsButton): void {
    this.apply((state) => unhoverCreditsButton(state, button));
  }

  pointerDown(button: CreditsButton): void {
    this.apply((state) => pressCreditsButton(state, button));
  }

  pointerUp(button: CreditsButton): void {
    const previous = this.state;
    this.apply((state) => releaseCreditsButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous) {
      return;
    }
    switch (button) {
      case 'back':
        this.back();
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

  back(): void {
    if ('kind' in this.state) {
      return;
    }
    this.screen.leave();
  }

  close(): void {
    this.unsubscribe();
    this.state = { kind: 'closed' };
  }

  private apply(transition: (state: CreditsState) => CreditsState): void {
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
