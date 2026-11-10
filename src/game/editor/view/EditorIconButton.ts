import type Phaser from 'phaser';
import { DISABLED_CURSOR, HOVER_CURSOR } from '../../ui/view/input/cursor.js';
import { bindPointer } from '../../ui/view/input/hoverTarget.js';
import type { PointerActions } from '../../ui/view/input/hoverTarget.js';
import { createLineIconTexture } from '../../ui/view/widgets/listControlIcons.js';
import { CELESTIAL_COLORS, COLORS, cssColor } from '../../ui/view/theme.js';
import type { ButtonAppearance, ButtonView } from '../../ui/state/buttonPointer.js';

export type EditorIcon = 'play' | 'pause' | 'restart' | 'previous' | 'next';

const ICON_SIZE_PX = 26;
export const EDITOR_ICON_HIT_SIZE_PX = 44;
const ICON_COLORS: Record<ButtonAppearance, number> = {
  disabled: CELESTIAL_COLORS.border,
  pressed: CELESTIAL_COLORS.highlight,
  hovered: CELESTIAL_COLORS.textPrimary,
  focused: CELESTIAL_COLORS.textPrimary,
  idle: CELESTIAL_COLORS.textSecondary,
};
const traceRightTriangle = (context: CanvasRenderingContext2D): void => {
  context.moveTo(8, 5);
  context.lineTo(19, 12);
  context.lineTo(8, 19);
  context.closePath();
};
const ICON_TRACES: Record<EditorIcon, (context: CanvasRenderingContext2D) => void> = {
  play: traceRightTriangle,
  next: traceRightTriangle,
  pause: (context) => {
    context.rect(7.5, 5, 3, 14);
    context.rect(13.5, 5, 3, 14);
  },
  restart: (context) => {
    context.moveTo(6, 5);
    context.lineTo(6, 19);
    context.moveTo(19, 5);
    context.lineTo(10, 12);
    context.lineTo(19, 19);
    context.closePath();
  },
  previous: (context) => {
    context.moveTo(16, 5);
    context.lineTo(5, 12);
    context.lineTo(16, 19);
    context.closePath();
  },
};

function getEditorIconTexture(scene: Phaser.Scene, icon: EditorIcon): string {
  return createLineIconTexture(
    scene,
    `editor-icon:${icon}:${ICON_SIZE_PX}`,
    ICON_SIZE_PX,
    (context) => {
      ICON_TRACES[icon](context);
      context.fillStyle = cssColor(COLORS.textPrimary);
      context.fill();
    },
  );
}

export class EditorIconButton {
  private readonly icon: Phaser.GameObjects.Image;
  private readonly hit: Phaser.GameObjects.Zone;

  constructor(
    private readonly scene: Phaser.Scene,
    centerXPx: number,
    centerYPx: number,
    icon: EditorIcon,
    pointer: PointerActions,
  ) {
    this.icon = scene.add.image(centerXPx, centerYPx, getEditorIconTexture(scene, icon));
    this.hit = scene.add
      .zone(centerXPx, centerYPx, EDITOR_ICON_HIT_SIZE_PX, EDITOR_ICON_HIT_SIZE_PX)
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(this.hit, pointer);
  }

  render(view: ButtonView, icon: EditorIcon): void {
    this.icon
      .setTexture(getEditorIconTexture(this.scene, icon))
      .setTint(ICON_COLORS[view.appearance]);
    if (this.hit.input !== null) {
      this.hit.input.cursor = view.appearance === 'disabled' ? DISABLED_CURSOR : HOVER_CURSOR;
    }
  }
}
