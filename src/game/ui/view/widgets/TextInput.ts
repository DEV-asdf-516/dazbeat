import type Phaser from 'phaser';
import { CELESTIAL_COLORS, FONT_FAMILY, MOTION, RADIUS, cssColor } from './theme.js';

const PADDING_X_PX = 16;

export interface TextInputOptions {
  readonly label: string;
  readonly maxLength: number;
  readonly type: { readonly sizePx: number; readonly weight: number };
  readonly enterKeyHint: string;
  /** 테두리와 바탕을 씬이 캔버스에 그려, 입력 전후로 같은 칸을 보여 줄 때 쓴다. */
  readonly isBare?: boolean;
}

/** IME 조합·캐럿·선택을 캔버스로 다시 만들 수 없으므로 실제 HTML input 을 캔버스 위에 띄운다. */
export class TextInput {
  private readonly input: HTMLInputElement;
  private readonly element: Phaser.GameObjects.DOMElement;

  constructor(
    scene: Phaser.Scene,
    frame: { leftPx: number; topYPx: number; widthPx: number; heightPx: number },
    options: TextInputOptions,
  ) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = options.maxLength;
    input.placeholder = options.label;
    input.setAttribute('aria-label', options.label);
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.autocapitalize = 'off';
    input.setAttribute('autocorrect', 'off');
    input.enterKeyHint = options.enterKeyHint;
    input.className = options.isBare === true ? 'text-input text-input--bare' : 'text-input';
    // :hover·:focus·::placeholder·::selection 은 inline style 로 쓸 수 없어 style.css 가 이 값으로 그린다.
    const properties: Record<string, string> = {
      '--text-input-width': `${frame.widthPx}px`,
      '--text-input-height': `${frame.heightPx}px`,
      '--text-input-padding-x': `${PADDING_X_PX}px`,
      '--text-input-radius': `${RADIUS.mediumPx}px`,
      '--text-input-font-family': FONT_FAMILY,
      '--text-input-font-size': `${options.type.sizePx}px`,
      '--text-input-font-weight': `${options.type.weight}`,
      '--text-input-transition': `${MOTION.fastMs}ms`,
      '--text-input-surface': cssColor(CELESTIAL_COLORS.surface),
      '--text-input-border': cssColor(CELESTIAL_COLORS.border),
      '--text-input-border-hover': cssColor(CELESTIAL_COLORS.textSecondary),
      '--text-input-selected': cssColor(CELESTIAL_COLORS.selected),
      '--text-input-text': cssColor(CELESTIAL_COLORS.textPrimary),
      '--text-input-placeholder': cssColor(CELESTIAL_COLORS.border),
      '--text-input-selection': cssColor(CELESTIAL_COLORS.surfaceHover),
    };
    Object.entries(properties).forEach(([name, value]) => input.style.setProperty(name, value));
    this.element = scene.add.dom(frame.leftPx, frame.topYPx, input).setOrigin(0, 0);
    this.input = input;
  }

  get isFocused(): boolean {
    return document.activeElement === this.input;
  }

  get text(): string {
    return this.input.value;
  }

  setText(text: string): void {
    this.input.value = text;
  }

  onInput(listener: (text: string) => void): void {
    this.input.addEventListener('input', () => listener(this.input.value));
  }

  focus(): void {
    this.input.focus();
  }

  blur(): void {
    this.input.blur();
  }

  setEnabled(isEnabled: boolean): void {
    this.input.disabled = !isEnabled;
  }

  setVisible(isVisible: boolean): void {
    this.element.setVisible(isVisible);
  }

  destroy(): void {
    this.element.destroy();
  }
}
