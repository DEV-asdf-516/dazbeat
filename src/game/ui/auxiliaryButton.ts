import type Phaser from 'phaser';
import { Button } from './Button.js';
import type { ButtonColors } from './Button.js';
import { EDITOR_COLORS } from './theme.js';

const AUXILIARY_BUTTON_COLORS: Partial<ButtonColors> = {
  label: EDITOR_COLORS.textSecondary,
  emphasizedLabel: EDITOR_COLORS.highlight,
  hoverFill: null,
};
const AUXILIARY_LABEL_TYPE = { sizePx: 14, weight: 500 } as const;
const AUXILIARY_BUTTON_HEIGHT_PX = 44;

/**
 * SETTINGS·BACK 처럼 화면의 주된 흐름 밖에 있는 보조 조작이 함께 쓰는 모양.
 * 버튼은 위쪽 기준으로 놓이므로 세로 중심에 맞추려면 높이 절반만큼 올린다.
 */
export function createAuxiliaryButton(
  scene: Phaser.Scene,
  xPx: number,
  centerYPx: number,
  options: { label: string; onActivate: () => void },
): Button {
  return new Button(scene, xPx, centerYPx - AUXILIARY_BUTTON_HEIGHT_PX / 2, {
    ...options,
    variant: 'quiet',
    heightPx: AUXILIARY_BUTTON_HEIGHT_PX,
    colors: AUXILIARY_BUTTON_COLORS,
    labelType: AUXILIARY_LABEL_TYPE,
    hasFocusOutline: true,
  });
}
