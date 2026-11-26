import type Phaser from 'phaser';
import type { ButtonAppearance } from '../../state/buttonPointer.js';
import { bindPointer } from '../input/hoverTarget.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { HOVER_CURSOR } from '../input/cursor.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { rgba } from '../textures/lightTextures.js';
import { CELESTIAL_COLORS, FONT_FAMILY, MODAL, cssColor, typeStyle } from '../theme.js';
import { ModalPanel } from './ModalPanel.js';

export const HELP_BUTTON = {
  textureKey: 'controls:helpButton',
  radiusPx: 10,
  ringWidthPx: 2,
  fillAlpha: 0.16,
  glyphSizePx: 13,
  glyphWeight: 800,
} as const;

export const HELP_BUTTON_ALPHAS: Readonly<Record<ButtonAppearance, number>> = {
  disabled: 0.4,
  pressed: 0.85,
  hovered: 1,
  focused: 1,
  idle: 0.7,
};

const HELP_BUTTON_HALF_PX = HELP_BUTTON.radiusPx + HELP_BUTTON.ringWidthPx;
const PADDING_PX = 24;
const TEXT_SIZE_PX = 18;
const BODY_LINE_GAP_PX = 10;
const TITLE_BODY_GAP_PX = 14;
// 막 없이 화면 내용 위에 뜨되, 조작 안내 창과 확인 창은 판을 덮는다.
const HELP_TIP_DEPTH = MODAL.depth - 1;

export interface HelpTipPlacement {
  // (?) 중심에서 판 위끝까지. 판 왼쪽 끝은 (?) 왼쪽 끝에 맞춘다.
  readonly panelTopOffsetPx: number;
}

export interface HelpTipContent {
  readonly title: string | null;
  readonly lines: readonly string[];
}

export class HelpTip {
  // 씬은 이 컨테이너를 (?) 중심 자리로만 옮긴다. 판은 (?) 기준 고정 자리라 함께 따라간다.
  readonly container: Phaser.GameObjects.Container;
  private readonly button: Phaser.GameObjects.Image;
  private readonly panel: ModalPanel;
  private readonly panelContainer: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, pointer: PointerActions, placement: HelpTipPlacement) {
    this.button = scene.add
      .image(0, 0, ensureHelpButtonTexture(scene))
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(this.button, pointer);
    this.panel = new ModalPanel(scene);
    // ModalPanel 은 모달 안에서 막으로 클릭이 새지 않게 판이 입력을 받는다. 도움말 판은 막이 없어 뒤쪽 줄과 버튼이 입력을 받아야 한다.
    for (const object of this.panel.objects) {
      object.disableInteractive();
    }
    this.title = scene.add.text(
      PADDING_PX,
      PADDING_PX,
      '',
      typeStyle(
        {
          sizePx: TEXT_SIZE_PX,
          weight: 600,
        },
        CELESTIAL_COLORS.textPrimary,
      ),
    );
    this.body = scene.add.text(PADDING_PX, PADDING_PX, '', {
      ...typeStyle(
        {
          sizePx: TEXT_SIZE_PX,
          weight: 500,
        },
        CELESTIAL_COLORS.textSecondary,
      ),
      lineSpacing: BODY_LINE_GAP_PX,
    });
    this.panelContainer = scene.add
      .container(0, placement.panelTopOffsetPx, [...this.panel.objects, this.title, this.body])
      .setVisible(false);
    this.container = scene.add
      .container(0, 0, [this.button, this.panelContainer])
      .setDepth(HELP_TIP_DEPTH);
  }

  render(content: HelpTipContent, isShown: boolean): void {
    this.button.setAlpha(HELP_BUTTON_ALPHAS[isShown ? 'hovered' : 'idle']);
    this.panelContainer.setVisible(isShown);
    if (!isShown) {
      return;
    }
    this.title.setText(content.title ?? '').setVisible(content.title !== null);
    this.body
      .setText(content.lines.join('\n'))
      .setY(
        content.title === null ? PADDING_PX : this.title.y + this.title.height + TITLE_BODY_GAP_PX,
      );
    const widthPx =
      Math.max(content.title === null ? 0 : this.title.width, this.body.width) + PADDING_PX * 2;
    this.panel.setSize(widthPx, this.body.y + this.body.height + PADDING_PX);
    this.panelContainer.setX(-HELP_BUTTON_HALF_PX);
  }
}

export function ensureHelpButtonTexture(scene: Phaser.Scene): string {
  const { textureKey, radiusPx, ringWidthPx } = HELP_BUTTON;
  const sizePx = (radiusPx + ringWidthPx) * 2;
  createCanvasTexture(
    scene,
    {
      key: textureKey,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (context) => {
      const centerPx = sizePx / 2;
      context.beginPath();
      context.arc(centerPx, centerPx, radiusPx, 0, Math.PI * 2);
      context.fillStyle = rgba(CELESTIAL_COLORS.selected, HELP_BUTTON.fillAlpha);
      context.fill();
      context.lineWidth = ringWidthPx;
      context.strokeStyle = cssColor(CELESTIAL_COLORS.selected);
      context.stroke();
      context.fillStyle = cssColor(CELESTIAL_COLORS.selected);
      context.font = `${HELP_BUTTON.glyphWeight} ${HELP_BUTTON.glyphSizePx}px ${FONT_FAMILY}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('?', centerPx, centerPx + 1);
    },
  );
  return textureKey;
}
