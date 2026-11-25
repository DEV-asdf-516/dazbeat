import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  readControlsWheel,
  withControlsOpen,
} from '../app/controlsGuide.js';
import type { AuthUser } from '../../data/account.js';
import type { SongFeed } from '../app/SongFeed.js';
import { completeAccountSignIn } from '../ui/state/accountIdentity.js';
import { IDLE_WHEEL } from '../ui/state/wheelRows.js';
import {
  INITIAL_CREDITS_STATE,
  hoverCreditsButton,
  pressCreditsButton,
  releaseCreditsButton,
  scrollCredits,
  unhoverCreditsButton,
  withCreditSongs,
} from './state/creditsState.js';
import type {
  CreditsButton,
  CreditsGrid,
  CreditsLink,
  CreditsState,
} from './state/creditsState.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';

export interface CreditsScreen {
  openProfile(): void;
  renderAccount(): void;
  render(previous: CreditsState | null, next: CreditsState): void;
  playSound(sound: SoundEffect): void;
  leave(): void;
  openLink(link: CreditsLink): void;
}

export type CreditsCatalog = Pick<SongFeed, 'songs' | 'subscribe' | 'requestRemaining'>;

export interface CreditsPorts {
  signIn(): Promise<AuthUser | null>;
}

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
    private readonly ports: CreditsPorts,
  ) {
    this.state = withCreditSongs(INITIAL_CREDITS_STATE, catalog.songs);
    this.unsubscribe = catalog.subscribe(() => {
      const state = this.open;
      if (state === null) {
        return;
      }
      this.apply(withCreditSongs(state, this.catalog.songs));
    });
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    // 곡이 없어 state 가 그대로여도 스크롤 트랙은 보여야 하므로 처음 한 번은 전이와 무관하게 그린다.
    this.screen.render(null, state);
    void this.catalog.requestRemaining();
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
    this.apply(scrollCredits(state, this.grid, read.rows));
  }

  scroll(rows: 1 | -1): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(scrollCredits(state, this.grid, rows));
  }

  pointerOver(button: CreditsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverCreditsButton(state, button));
  }

  pointerOut(button: CreditsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverCreditsButton(state, button));
  }

  pointerDown(button: CreditsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(pressCreditsButton(state, button));
  }

  pointerUp(button: CreditsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const released = releaseCreditsButton(state, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === state) {
      return;
    }
    switch (button) {
      case 'back':
        this.apply(released);
        this.screen.playSound('close');
        this.screen.leave();
        return;
      case 'contact':
      case 'privacy':
        this.apply(released);
        this.screen.playSound('click');
        this.screen.openLink(button);
        return;
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
      case 'accountProfile':
        this.apply(released);
        this.screen.playSound('click');
        this.screen.openProfile();
        return;
      case 'accountSignIn':
        this.apply(released);
        this.signIn();
        return;
    }
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private signIn(): void {
    this.screen.playSound('click');
    void this.ports
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

  back(): void {
    this.screen.playSound('close');
    this.screen.leave();
  }

  close(): void {
    this.unsubscribe();
    this.state = { kind: 'closed' };
  }

  private get open(): CreditsState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private apply(next: CreditsState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
