import type Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import type { ButtonColors, ButtonOptions } from '../ui/Button.js';
import { EDITOR_COLORS, EDITOR_TYPE_SCALE } from '../ui/theme.js';

const EDITOR_BUTTON_COLORS: Partial<ButtonColors> = {
  label: EDITOR_COLORS.textSecondary,
  emphasizedLabel: EDITOR_COLORS.textPrimary,
  disabledLabel: EDITOR_COLORS.border,
  border: EDITOR_COLORS.selected,
  // 쓸 수 없는 버튼이 누를 수 있어 보이지 않게 경계도 흐린 색으로 낮춘다.
  disabledBorder: EDITOR_COLORS.border,
  hoverBorder: EDITOR_COLORS.highlight,
  pressedFill: EDITOR_COLORS.surfaceHover,
  hoverFill: EDITOR_COLORS.surfaceHover,
};

/** 채보 편집 화면(곡 목록·에디터)의 버튼은 모두 같은 색과 control 라벨 서체를 쓴다. */
export function createEditorButton(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  options: Omit<ButtonOptions, 'colors' | 'labelType'>,
): Button {
  return new Button(scene, xPx, yPx, {
    ...options,
    colors: EDITOR_BUTTON_COLORS,
    labelType: EDITOR_TYPE_SCALE.control,
  });
}

/** 버튼은 위쪽 기준으로 놓이므로 바의 세로 중심에 맞추려면 높이 절반만큼 올린다. */
export function createCenteredEditorButton(
  scene: Phaser.Scene,
  xPx: number,
  centerYPx: number,
  options: Omit<ButtonOptions, 'colors' | 'labelType'>,
): Button {
  const button = createEditorButton(scene, xPx, 0, options);
  return button.setY(centerYPx - button.height / 2);
}
