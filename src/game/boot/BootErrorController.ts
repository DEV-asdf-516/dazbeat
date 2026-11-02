import {
  INITIAL_BOOT_ERROR_STATE,
  hoverBootErrorButton,
  pressBootErrorButton,
  releaseBootErrorButton,
  unhoverBootErrorButton,
} from './state/bootErrorState.js';
import type { BootErrorButton, BootErrorState } from './state/bootErrorState.js';

export interface BootErrorScreen {
  render(previous: BootErrorState | null, next: BootErrorState): void;
}

export interface BootErrorPorts {
  retry(): void;
}

// 닫힌 뒤에는 입력을 받지 않는다.
type ControllerState = BootErrorState | { readonly kind: 'closed' };

export class BootErrorController {
  private state: ControllerState = INITIAL_BOOT_ERROR_STATE;

  constructor(
    private readonly ports: BootErrorPorts,
    private readonly screen: BootErrorScreen,
  ) {
    this.screen.render(null, INITIAL_BOOT_ERROR_STATE);
  }

  pointerOver(button: BootErrorButton): void {
    this.apply((state) => hoverBootErrorButton(state, button));
  }

  pointerOut(button: BootErrorButton): void {
    this.apply((state) => unhoverBootErrorButton(state, button));
  }

  pointerDown(button: BootErrorButton): void {
    this.apply((state) => pressBootErrorButton(state, button));
  }

  pointerUp(button: BootErrorButton): void {
    const previous = this.state;
    this.apply((state) => releaseBootErrorButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state !== previous) {
      this.retry();
    }
  }

  retry(): void {
    if ('kind' in this.state) {
      return;
    }
    this.ports.retry();
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  private apply(transition: (state: BootErrorState) => BootErrorState): void {
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
