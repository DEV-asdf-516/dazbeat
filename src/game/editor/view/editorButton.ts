import type Phaser from 'phaser';
import { Button } from '../../ui/view/widgets/Button.js';
import type { QuietButtonColors, SecondaryButtonColors } from '../../ui/view/widgets/Button.js';
import type { PointerActions } from '../../ui/view/input/hoverTarget.js';
import { CELESTIAL_COLORS } from '../../ui/view/theme.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';

const EDITOR_QUIET_BUTTON_COLORS: Partial<QuietButtonColors> = {
  label: CELESTIAL_COLORS.textSecondary,
  emphasizedLabel: CELESTIAL_COLORS.textPrimary,
  disabledLabel: CELESTIAL_COLORS.border,
  hoverFill: CELESTIAL_COLORS.surfaceHover,
};
const EDITOR_SECONDARY_BUTTON_COLORS: Partial<SecondaryButtonColors> = {
  label: CELESTIAL_COLORS.textPrimary,
  disabledLabel: CELESTIAL_COLORS.border,
  border: CELESTIAL_COLORS.selected,
  // 쓸 수 없는 버튼이 누를 수 있어 보이지 않게 경계도 흐린 색으로 낮춘다.
  disabledBorder: CELESTIAL_COLORS.border,
  hoverBorder: CELESTIAL_COLORS.highlight,
  pressedFill: CELESTIAL_COLORS.surfaceHover,
  hoverFill: CELESTIAL_COLORS.surfaceHover,
};

interface EditorButtonOptions {
  variant: 'quiet' | 'secondary';
  label: string;
  pointer: PointerActions;
  widthPx?: number;
  heightPx?: number;
}

export function createEditorButton(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  options: EditorButtonOptions,
): Button {
  const labelType = EDITOR_TYPE_SCALE.control;
  return new Button(
    scene,
    xPx,
    yPx,
    options.variant === 'quiet'
      ? {
          ...options,
          variant: 'quiet',
          focus: 'slide',
          colors: EDITOR_QUIET_BUTTON_COLORS,
          labelType,
        }
      : {
          ...options,
          variant: 'secondary',
          focus: 'glow',
          colors: EDITOR_SECONDARY_BUTTON_COLORS,
          labelType,
        },
  );
}

/** 버튼은 위쪽 기준으로 놓이므로 바의 세로 중심에 맞추려면 높이 절반만큼 올린다. */
export function createCenteredEditorButton(
  scene: Phaser.Scene,
  xPx: number,
  centerYPx: number,
  options: EditorButtonOptions,
): Button {
  const button = createEditorButton(scene, xPx, 0, options);
  return button.setY(centerYPx - button.height / 2);
}
