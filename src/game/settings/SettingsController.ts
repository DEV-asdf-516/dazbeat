import type { Language } from '../../i18n/language.js';
import { readControlsKey, withControlsOpen } from '../app/controlsGuide.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { Settings } from '../../storage/settings.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import type { SettingsRow } from './state/settingsAdjust.js';
import {
  adjustRow,
  applyPointer,
  cancelPrompt,
  confirmReset,
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
  startWaiting,
  unhoverRow,
  unhoverSettingsButton,
  withDisplayedLanguage,
} from './state/settingsEditorState.js';
import type {
  SettingsButton,
  SettingsEditorState,
  SettingsEffect,
} from './state/settingsEditorState.js';

export interface SettingsScreen {
  render(previous: SettingsEditorState | null, next: SettingsEditorState): void;
  playFocusSound(settings: Settings): void;
  leave(): void;
}

export interface SettingsPorts {
  readonly save: Pick<LocalSave, 'saveSettings'>;
  readonly changeLanguage: (language: Language) => Promise<unknown>;
}

type Transition = (state: SettingsEditorState) => SettingsEditorState;

// 닫힌 뒤에는 입력과 늦은 언어 변경 결과를 받지 않는다.
type ControllerState = SettingsEditorState | { readonly kind: 'closed' };

export class SettingsController {
  private state: ControllerState;

  constructor(
    private readonly ports: SettingsPorts,
    private readonly screen: SettingsScreen,
    rows: readonly SettingsRow[],
    settings: Settings,
    displayedLanguage: Language,
  ) {
    const first = createSettingsEditorState(rows, settings, displayedLanguage);
    this.state = first;
    this.screen.render(null, first);
  }

  get settings(): Settings {
    if ('kind' in this.state) {
      throw new Error('Settings controller is closed');
    }
    return this.state.settings;
  }

  hoverRow(index: number): void {
    this.apply((state) => hoverRow(state, index));
  }

  unhoverRow(index: number): void {
    this.apply((state) => unhoverRow(state, index));
  }

  pointRow(index: number): void {
    this.applyPointer((state) => focusRow(state, index));
  }

  captureKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    if ('kind' in this.state) {
      return false;
    }
    const result = readSettingsKey(this.state, event);
    switch (result.kind) {
      case 'pass':
        return false;
      case 'state':
        this.apply(() => result.state);
        return true;
    }
  }

  openControls(): void {
    this.apply((state) => withControlsOpen(state, true));
  }

  closeControls(): void {
    this.apply((state) => withControlsOpen(state, false));
  }

  pointerOver(button: SettingsButton): void {
    this.apply((state) => hoverSettingsButton(state, button));
  }

  pointerOut(button: SettingsButton): void {
    this.apply((state) => unhoverSettingsButton(state, button));
  }

  pointerDown(button: SettingsButton): void {
    this.apply((state) => pressSettingsButton(state, button));
  }

  pointerUp(button: SettingsButton): void {
    const previous = this.state;
    this.apply((state) => releaseSettingsButton(state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous) {
      return;
    }
    switch (button) {
      case 'back':
        this.back();
        return;
      case 'resetEntry':
        this.applyPointer(requestReset);
        return;
      case 'resetCancel':
        this.apply(cancelPrompt);
        return;
      case 'resetAccept':
        this.apply(confirmReset);
        return;
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      default:
        this.applyPointer((state) => pointRowButton(state, button));
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

  handleMenuKey(action: MenuAction | null): void {
    switch (action) {
      case 'up':
      case 'down':
        this.apply((state) => moveFocus(state, action === 'up' ? -1 : 1));
        return;
      case 'left':
        this.apply((state) => adjustRow(state, state.rowIndex, -1));
        return;
      case 'right':
        this.apply((state) => adjustRow(state, state.rowIndex, 1));
        return;
      case 'confirm':
        this.apply((state) => startWaiting(state, state.rowIndex));
        return;
      case 'back':
        this.back();
        return;
      case null:
        return;
    }
  }

  back(): void {
    if ('kind' in this.state) {
      return;
    }
    const outcome = pressBack(this.state);
    switch (outcome.kind) {
      case 'stay':
        this.apply(() => outcome.state);
        return;
      case 'leave':
        this.screen.leave();
        return;
    }
  }

  close(): void {
    this.state = { kind: 'closed' };
  }

  private applyPointer(transition: Transition): void {
    this.apply((state) => applyPointer(state, transition));
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
      case 'changeLanguage': {
        const { language } = effect;
        this.ports.changeLanguage(language).then(
          () => this.apply((state) => withDisplayedLanguage(state, language)),
          (error: unknown) => console.error('Failed to change language', error),
        );
        return;
      }
      case 'focusSound':
        this.screen.playFocusSound(effect.settings);
        return;
    }
  }
}
