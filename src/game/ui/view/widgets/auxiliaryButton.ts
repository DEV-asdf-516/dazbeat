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
// 메뉴형 화면 머리글 보조 버튼이 화면마다 같은 오른쪽 끝에 오게 한다.
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

export function createHeaderAuxiliaryButtons(
  scene: Phaser.Scene,
  items: readonly { label: string; onActivate: () => void }[],
): Button[] {
  const probe = scene.make.text(
    {
      text: ' ',
      style: textStyle('primary', 0),
    },
    false,
  );
  const centerYPx = SCREEN_LAYOUT.headerYPx + probe.height / 2;
  probe.destroy();
  let rightXPx = HEADER_AUXILIARY_RIGHT_X_PX;
  return items
    .toReversed()
    .map((options) => {
      const button = createAuxiliaryButton(scene, 0, centerYPx, options).alignX(rightXPx, 1);
      rightXPx = button.x;
      return button;
    })
    .reverse();
}
