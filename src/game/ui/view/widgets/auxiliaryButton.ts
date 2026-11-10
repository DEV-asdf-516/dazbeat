import type Phaser from 'phaser';
import { Button, QUIET_PADDING_PX } from './Button.js';
import { MENU_KEY_HINT_STYLE } from './keyHintView.js';
import type { QuietButtonColors } from './Button.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { CELESTIAL_COLORS, COLORS, SCREEN_LAYOUT, TYPE_SCALE, typeStyle } from '../theme.js';

const AUXILIARY_BUTTON_COLORS: Partial<QuietButtonColors> = {
  label: CELESTIAL_COLORS.textSecondary,
  emphasizedLabel: CELESTIAL_COLORS.highlight,
  hoverFill: null,
};
export const AUXILIARY_LABEL_TYPE = {
  sizePx: 14,
  weight: 400,
} as const;
const AUXILIARY_BUTTON_HEIGHT_PX = 44;
/** 화면 아래 줄 보조 버튼 왼쪽에 함께 두는 글자 진입점과의 간격이다. */
export const FOOTER_AUXILIARY_ENTRY_GAP_PX = 24;

export function createAuxiliaryButton(
  scene: Phaser.Scene,
  xPx: number,
  centerYPx: number,
  options: { label: string; pointer: PointerActions },
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

function measureTextLine(
  scene: Phaser.Scene,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): { readonly heightPx: number; readonly ascentPx: number } {
  const probe = scene.make.text(
    {
      text: ' ',
      style,
    },
    false,
  );
  const line = {
    heightPx: probe.height,
    ascentPx: probe.getTextMetrics().ascent,
  };
  probe.destroy();
  return line;
}

/** 글자 크기가 달라도 CONTROLS 글자와 기준선이 맞는 보조 글자의 세로 중심이다. */
export function getFooterAuxiliaryCenterYPx(scene: Phaser.Scene): number {
  const controls = measureTextLine(scene, typeStyle(TYPE_SCALE.meta, COLORS.textSecondary));
  const auxiliary = measureTextLine(scene, typeStyle(AUXILIARY_LABEL_TYPE, COLORS.textSecondary));
  const controlsCenterYPx = SCREEN_LAYOUT.hintYPx + MENU_KEY_HINT_STYLE.capHeightPx / 2;
  const baselineYPx = controlsCenterYPx - controls.heightPx / 2 + controls.ascentPx;
  return baselineYPx + auxiliary.heightPx / 2 - auxiliary.ascentPx;
}

/** 메뉴형 화면의 보조 버튼을 CONTROLS 진입점과 같은 줄의 오른쪽 끝에 둔다. */
export function createFooterAuxiliaryButtons(
  scene: Phaser.Scene,
  items: readonly { label: string; pointer: PointerActions }[],
): Button[] {
  const centerYPx = getFooterAuxiliaryCenterYPx(scene);
  let rightXPx = SCREEN_LAYOUT.rightXPx + QUIET_PADDING_PX.xPx;
  return items
    .toReversed()
    .map((options) => {
      const button = createAuxiliaryButton(scene, 0, centerYPx, options).alignX(rightXPx, 1);
      rightXPx = button.x;
      return button;
    })
    .reverse();
}
