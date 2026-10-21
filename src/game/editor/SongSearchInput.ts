import type Phaser from 'phaser';
import { CELESTIAL_COLORS, FONT_FAMILY, MOTION, RADIUS, cssColor } from '../ui/theme.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';

const MAX_LENGTH = 100;
const PADDING_X_PX = 16;

/** IME 조합·캐럿·선택을 캔버스로 다시 만들 수 없으므로 실제 HTML input 을 캔버스 위에 띄운다. */
export class SongSearchInput {
  private readonly input: HTMLInputElement;

  constructor(
    scene: Phaser.Scene,
    frame: { leftPx: number; topYPx: number; widthPx: number; heightPx: number },
    label: string,
  ) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_LENGTH;
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.autocapitalize = 'off';
    input.setAttribute('autocorrect', 'off');
    input.enterKeyHint = 'search';
    input.className = 'song-search';
    // :hover·:focus·::placeholder·::selection 은 inline style 로 쓸 수 없어 style.css 가 이 값으로 그린다.
    const properties: Record<string, string> = {
      '--song-search-width': `${frame.widthPx}px`,
      '--song-search-height': `${frame.heightPx}px`,
      '--song-search-padding-x': `${PADDING_X_PX}px`,
      '--song-search-radius': `${RADIUS.mediumPx}px`,
      '--song-search-font-family': FONT_FAMILY,
      '--song-search-font-size': `${EDITOR_TYPE_SCALE.body.sizePx}px`,
      '--song-search-font-weight': `${EDITOR_TYPE_SCALE.body.weight}`,
      '--song-search-transition': `${MOTION.fastMs}ms`,
      '--song-search-surface': cssColor(CELESTIAL_COLORS.surface),
      '--song-search-border': cssColor(CELESTIAL_COLORS.border),
      '--song-search-border-hover': cssColor(CELESTIAL_COLORS.textSecondary),
      '--song-search-selected': cssColor(CELESTIAL_COLORS.selected),
      '--song-search-text': cssColor(CELESTIAL_COLORS.textPrimary),
      '--song-search-placeholder': cssColor(CELESTIAL_COLORS.textSecondary),
      '--song-search-selection': cssColor(CELESTIAL_COLORS.surfaceHover),
    };
    Object.entries(properties).forEach(([name, value]) => input.style.setProperty(name, value));
    scene.add.dom(frame.leftPx, frame.topYPx, input).setOrigin(0, 0);
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

  focus(): void {
    this.input.focus();
  }

  blur(): void {
    this.input.blur();
  }
}
