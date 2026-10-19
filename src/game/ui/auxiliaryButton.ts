import type Phaser from 'phaser';
import { Button } from './Button.js';
import type { QuietButtonColors } from './Button.js';
import { CELESTIAL_COLORS, SCREEN_LAYOUT, textStyle } from './theme.js';

const AUXILIARY_BUTTON_COLORS: Partial<QuietButtonColors> = {
  label: CELESTIAL_COLORS.textSecondary,
  emphasizedLabel: CELESTIAL_COLORS.highlight,
  hoverFill: null,
};
const AUXILIARY_LABEL_TYPE = {
  sizePx: 14,
  weight: 500,
} as const;
const AUXILIARY_BUTTON_HEIGHT_PX = 44;
// 곡 선택 화면의 SETTINGS 자리를 메뉴형 화면 머리글 보조 버튼의 기준으로 삼는다.
const HEADER_AUXILIARY_RIGHT_X_PX = 1800;

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
    focus: 'outline',
  });
}

/** 화면마다 제목 서체가 달라도 같은 자리에 오도록 곡 선택 필터 탭과 같은 primary 한 줄의 세로 중심에 맞춘다. */
export function createHeaderAuxiliaryButton(
  scene: Phaser.Scene,
  options: { label: string; onActivate: () => void },
): Button {
  const probe = scene.make.text(
    {
      text: ' ',
      style: textStyle('primary', 0),
    },
    false,
  );
  const centerYPx = SCREEN_LAYOUT.headerYPx + probe.height / 2;
  probe.destroy();
  return createAuxiliaryButton(scene, 0, centerYPx, options).alignX(HEADER_AUXILIARY_RIGHT_X_PX, 1);
}
