import type { AuthUser } from '../../data/account.js';
import type { Language } from '../../i18n/language.js';
import {
  closeSignInFailure,
  completeAccountSignIn,
  failAccountSignIn,
  readSignInFailureKey,
} from '../ui/state/accountIdentity.js';
import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  withControlsOpen,
} from '../app/controlsGuide.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { Settings } from '../../storage/settings.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import type { SettingsRow } from './state/settingsAdjust.js';
import {
  adjustRow,
  applyPointer,
  cancelPrompt,
  confirmReset,
  confirmRow,
  createSettingsEditorState,
  focusRow,
  getSettingsEffects,
  hoverRow,
  hoverSettingsButton,
  moveFocus,
  pointRowButton,
  pressBack,
  pressSettingsButton,
  readSettingsKey,
  releaseSettingsButton,
  requestReset,
  unhoverRow,
  unhoverSettingsButton,
  withDisplayedLanguage,
} from './state/settingsEditorState.js';
import type {
  SettingsButton,
  SettingsEditorState,
  SettingsEffect,
} from './state/settingsEditorState.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';

export interface SettingsScreen {
  render(previous: SettingsEditorState | null, next: SettingsEditorState): void;
  playSound(sound: SoundEffect, settings: Settings): void;
  setBackgroundVolume(settings: Settings): void;
  leave(): void;
  openProfile(): void;
  renderAccount(): void;
}

export interface SettingsPorts {
  readonly save: Pick<LocalSave, 'saveSettings'>;
  readonly changeLanguage: (language: Language) => Promise<unknown>;
  signIn(): Promise<AuthUser | null>;
}

// 닫힌 뒤에는 입력과 늦은 언어 변경 결과를 받지 않는다.
type ControllerState = SettingsEditorState | { readonly kind: 'closed' };

export class SettingsController {
  private state: ControllerState;
  // 앞 시도의 늦은 실패가 뒤 시도 위에 팝업을 띄우지 않도록 마지막 시도만 기억한다.
  private signInToken: object | null = null;

  constructor(
    private readonly ports: SettingsPorts,
    private readonly screen: SettingsScreen,
    rows: readonly SettingsRow[],
    settings: Settings,
    displayedLanguage: Language,
  ) {
    this.state = createSettingsEditorState(rows, settings, displayedLanguage);
  }

  get settings(): Settings {
    if ('kind' in this.state) {
      throw new Error('Settings controller is closed');
    }
    return this.state.settings;
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.screen.render(null, state);
  }

  hoverRow(index: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverRow(state, index));
  }

  unhoverRow(index: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverRow(state, index));
  }

  pointRow(index: number): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(applyPointer(state, (current) => focusRow(current, index)));
  }

  captureKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readSignInFailureKey(state.signInFailure, event)) {
      case 'close':
        this.apply(closeSignInFailure(state));
        this.screen.playSound('close', state.settings);
        return true;
      case 'block':
        return true;
      case 'pass':
        break;
    }
    const result = readSettingsKey(state, event);
    if (result.kind === 'pass') {
      return false;
    }
    this.apply(result.state);
    return true;
  }

  pointerOver(button: SettingsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(hoverSettingsButton(state, button));
  }

  pointerOut(button: SettingsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(unhoverSettingsButton(state, button));
  }

  pointerDown(button: SettingsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    this.apply(pressSettingsButton(state, button));
  }

  pointerUp(button: SettingsButton): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    const released = releaseSettingsButton(state, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === state) {
      return;
    }
    switch (button) {
      case 'back': {
        const outcome = pressBack(released);
        if (outcome.kind === 'stay') {
          this.apply(outcome.state);
          return;
        }
        this.apply(released);
        this.screen.playSound('close', released.settings);
        this.screen.leave();
        return;
      }
      case 'accountProfile':
        this.apply(released);
        this.screen.playSound('click', released.settings);
        this.screen.openProfile();
        return;
      case 'accountSignIn':
        this.apply(released);
        this.screen.playSound('click', released.settings);
        this.signIn();
        return;
      case 'resetEntry':
        this.apply(applyPointer(released, requestReset));
        return;
      case 'resetCancel':
        this.apply(cancelPrompt(released));
        return;
      case 'resetAccept':
        this.apply(confirmReset(released));
        return;
      case 'controlsEntry':
        this.apply(withControlsOpen(released, true));
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.apply(withControlsOpen(released, false));
        return;
      case 'controlsHelp':
        this.apply(clickControlsHelp(released));
        return;
      case 'inputOffsetHelp':
      case 'systemHelp':
        this.apply(released);
        return;
      case 'signInFailureClose':
        this.apply(closeSignInFailure(released));
        this.screen.playSound('close', released.settings);
        return;
      default:
        this.apply(applyPointer(released, (current) => pointRowButton(current, button)));
        return;
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const state = this.open;
    if (state === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(state), event)) {
      case 'open':
        this.apply(withControlsOpen(state, true));
        return true;
      case 'close':
        this.apply(withControlsOpen(state, false));
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  handleMenuKey(action: MenuAction | null): void {
    const state = this.open;
    if (state === null) {
      return;
    }
    switch (action) {
      case 'up':
      case 'down':
        this.apply(moveFocus(state, action === 'up' ? 'previous' : 'next'));
        return;
      case 'left':
        this.apply(adjustRow(state, state.rowIndex, 'previous'));
        return;
      case 'right':
        this.apply(adjustRow(state, state.rowIndex, 'next'));
        return;
      case 'confirm':
        this.apply(confirmRow(state, state.rowIndex));
        return;
      case 'back': {
        const outcome = pressBack(state);
        if (outcome.kind === 'stay') {
          this.apply(outcome.state);
          return;
        }
        this.screen.playSound('close', state.settings);
        this.screen.leave();
        return;
      }
      case null:
        return;
    }
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private signIn(): void {
    const token = {};
    this.signInToken = token;
    void this.ports.signIn().then(
      (user) => {
        const state = this.open;
        if (user === null || state === null) {
          return;
        }
        this.screen.renderAccount();
        this.apply(completeAccountSignIn(state));
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

  private get open(): SettingsEditorState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private apply(next: SettingsEditorState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    for (const effect of getSettingsEffects(previous, next)) {
      this.runEffect(effect);
    }
    this.screen.render(previous, next);
  }

  private runEffect(effect: SettingsEffect): void {
    switch (effect.kind) {
      case 'save':
        try {
          this.ports.save.saveSettings(effect.settings);
        } catch (error) {
          console.error('Failed to save settings', error);
        }
        return;
      case 'backgroundVolume':
        this.screen.setBackgroundVolume(effect.settings);
        return;
      case 'changeLanguage': {
        const { language } = effect;
        this.ports.changeLanguage(language).then(
          () => {
            const state = this.open;
            if (state === null) {
              return;
            }
            this.apply(withDisplayedLanguage(state, language));
          },
          (error: unknown) => console.error('Failed to change language', error),
        );
        return;
      }
      case 'sound':
        this.screen.playSound(effect.sound, effect.settings);
        return;
    }
  }
}
