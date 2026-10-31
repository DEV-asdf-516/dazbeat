import Phaser from 'phaser';
import { DISABLED_CURSOR, HOVER_CURSOR } from '../input/cursor.js';
import type { ButtonAppearance, ButtonView } from '../../state/buttonPointer.js';
import { bindPointer, setContainerHitArea } from '../input/hoverTarget.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../textures/lightTextures.js';
import { COLORS, CELESTIAL_COLORS, RADIUS, TYPE_SCALE, setTextColor, typeStyle } from '../theme.js';
import { MOTION } from '../../state/motion.js';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface PrimaryButtonColors {
  fill: number;
  hoverFill: number;
  pressedFill: number;
  disabledFill: number;
  label: number;
  disabledLabel: number;
}

export interface SecondaryButtonColors {
  label: number;
  disabledLabel: number;
  border: number;
  hoverBorder: number;
  disabledBorder: number;
  pressedFill: number;
  fill: number | null;
  hoverFill: number | null;
}

export interface QuietButtonColors {
  label: number;
  emphasizedLabel: number;
  disabledLabel: number;
  hoverFill: number | null;
}

interface ButtonContentOptions {
  label: string;
  pointer: PointerActions;
  widthPx?: number;
  heightPx?: number;
  paddingXPx?: number;
}

interface LabelType {
  sizePx: number;
  weight: number;
}

export type ButtonOptions = ButtonContentOptions &
  (
    | {
        variant: 'primary';
      }
    | {
        variant: 'secondary';
        focus: 'outline' | 'glow';
        colors?: Partial<SecondaryButtonColors>;
        labelType?: LabelType;
        borderWidthPx?: number;
      }
    | {
        variant: 'quiet';
        focus: 'outline' | 'slide';
        colors?: Partial<QuietButtonColors>;
        labelType?: LabelType;
      }
  );

const DEFAULT_COLORS: {
  primary: PrimaryButtonColors;
  secondary: SecondaryButtonColors;
  quiet: QuietButtonColors;
} = {
  primary: {
    fill: COLORS.textPrimary,
    hoverFill: COLORS.primaryHover,
    pressedFill: COLORS.primaryPressed,
    disabledFill: COLORS.border,
    label: COLORS.background,
    disabledLabel: COLORS.textDisabled,
  },
  secondary: {
    label: COLORS.textPrimary,
    disabledLabel: COLORS.textDisabled,
    border: COLORS.border,
    hoverBorder: COLORS.textSecondary,
    disabledBorder: COLORS.border,
    pressedFill: COLORS.surfaceRaised,
    fill: null,
    hoverFill: null,
  },
  quiet: {
    label: COLORS.textSecondary,
    emphasizedLabel: COLORS.textPrimary,
    disabledLabel: COLORS.textDisabled,
    hoverFill: null,
  },
};

type ButtonPaint =
  | { variant: 'primary'; colors: PrimaryButtonColors }
  | { variant: 'secondary'; colors: SecondaryButtonColors; borderWidthPx: number }
  | { variant: 'quiet'; colors: QuietButtonColors };

type ButtonFocus =
  { kind: 'outline'; rect: Phaser.GameObjects.Rectangle } | { kind: 'glow' } | { kind: 'slide' };

export const QUIET_PADDING_PX = {
  xPx: 16,
  yPx: 12,
} as const;

const PADDING_PX: Record<ButtonVariant, { xPx: number; yPx: number }> = {
  primary: {
    xPx: 44,
    yPx: 20,
  },
  secondary: {
    xPx: 44,
    yPx: 20,
  },
  quiet: QUIET_PADDING_PX,
};
const PRIMARY_LABEL_WEIGHT = 700;
const SECONDARY_BORDER_PX = 2;
const QUIET_FOCUS_OFFSET_PX = 8;
const FOCUS_GLOW_ALPHA = 0.35;
const ICON_IDLE_ALPHA = 0.85;
const FOCUS_OUTLINE_GAP_PX = 3;
const FOCUS_OUTLINE_WIDTH_PX = 2;

function resolveStyle(options: ButtonOptions): {
  paint: ButtonPaint;
  labelStyle: Phaser.Types.GameObjects.Text.TextStyle;
} {
  switch (options.variant) {
    case 'primary': {
      const colors = DEFAULT_COLORS.primary;
      return {
        paint: {
          variant: 'primary',
          colors,
        },
        labelStyle: typeStyle(
          {
            sizePx: TYPE_SCALE.primary.sizePx,
            weight: PRIMARY_LABEL_WEIGHT,
          },
          colors.label,
        ),
      };
    }
    case 'secondary': {
      const colors = {
        ...DEFAULT_COLORS.secondary,
        ...options.colors,
      };
      return {
        paint: {
          variant: 'secondary',
          colors,
          borderWidthPx: options.borderWidthPx ?? SECONDARY_BORDER_PX,
        },
        labelStyle: typeStyle(options.labelType ?? TYPE_SCALE.primary, colors.label),
      };
    }
    case 'quiet': {
      const colors = {
        ...DEFAULT_COLORS.quiet,
        ...options.colors,
      };
      return {
        paint: {
          variant: 'quiet',
          colors,
        },
        labelStyle: typeStyle(options.labelType ?? TYPE_SCALE.primary, colors.emphasizedLabel),
      };
    }
  }
}

function getPrimaryPaint(
  colors: PrimaryButtonColors,
  appearance: ButtonAppearance,
): { fill: number; label: number } {
  switch (appearance) {
    case 'disabled':
      return {
        fill: colors.disabledFill,
        label: colors.disabledLabel,
      };
    case 'pressed':
      return {
        fill: colors.pressedFill,
        label: colors.label,
      };
    case 'hovered':
      return {
        fill: colors.hoverFill,
        label: colors.label,
      };
    case 'focused':
    case 'idle':
      return {
        fill: colors.fill,
        label: colors.label,
      };
  }
}

function getSecondaryPaint(
  colors: SecondaryButtonColors,
  appearance: ButtonAppearance,
): { border: number; fill: number | null; label: number } {
  switch (appearance) {
    case 'disabled':
      return {
        border: colors.disabledBorder,
        fill: null,
        label: colors.disabledLabel,
      };
    case 'pressed':
      return {
        border: colors.hoverBorder,
        fill: colors.pressedFill,
        label: colors.label,
      };
    case 'hovered':
      return {
        border: colors.hoverBorder,
        fill: colors.hoverFill,
        label: colors.label,
      };
    case 'focused':
    case 'idle':
      return {
        border: colors.border,
        fill: colors.fill,
        label: colors.label,
      };
  }
}

function getQuietPaint(
  colors: QuietButtonColors,
  appearance: ButtonAppearance,
): { fill: number | null; label: number; iconAlpha: number } {
  switch (appearance) {
    case 'disabled':
      return {
        fill: null,
        label: colors.disabledLabel,
        iconAlpha: ICON_IDLE_ALPHA,
      };
    case 'pressed':
    case 'hovered':
      return {
        fill: colors.hoverFill,
        label: colors.emphasizedLabel,
        iconAlpha: 1,
      };
    case 'focused':
      return {
        fill: null,
        label: colors.emphasizedLabel,
        iconAlpha: 1,
      };
    case 'idle':
      return {
        fill: null,
        label: colors.label,
        iconAlpha: ICON_IDLE_ALPHA,
      };
  }
}

export class Button extends Phaser.GameObjects.Container {
  private readonly options: ButtonOptions;
  private readonly paint: ButtonPaint;
  private readonly focus: ButtonFocus;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly focusGlow: Phaser.GameObjects.Image;
  private readonly labelText: Phaser.GameObjects.Text;
  // 글자와 아이콘을 늘 함께 칠해 두어, 글자·아이콘을 바꾸는 그리기와 모양 그리기의 순서에 기대지 않는다.
  private readonly icon: Phaser.GameObjects.Image;
  private readonly hitArea = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene, xPx: number, yPx: number, options: ButtonOptions) {
    super(scene, xPx, yPx);
    this.options = options;
    const { paint, labelStyle } = resolveStyle(options);
    this.paint = paint;
    ensureLightTextures(scene);
    this.background = scene.add.rectangle(0, 0, 0, 0).setOrigin(0, 0).setRounded(RADIUS.smallPx);
    this.focusGlow = addLight(scene, LIGHT_TEXTURES.glow, 0, 0).setAlpha(0);
    this.icon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.labelText = scene.add.text(0, 0, options.label, labelStyle).setOrigin(0.5);
    this.add([this.background, this.focusGlow, this.icon, this.labelText]);
    const focusKind = options.variant === 'primary' ? 'glow' : options.focus;
    if (focusKind === 'outline') {
      const rect = scene.add
        .rectangle(-FOCUS_OUTLINE_GAP_PX, -FOCUS_OUTLINE_GAP_PX, 0, 0)
        .setOrigin(0, 0)
        .setRounded(RADIUS.smallPx + FOCUS_OUTLINE_GAP_PX)
        .setStrokeStyle(FOCUS_OUTLINE_WIDTH_PX, CELESTIAL_COLORS.highlight)
        .setVisible(false);
      this.add(rect);
      this.focus = {
        kind: 'outline',
        rect,
      };
    } else {
      this.focus = {
        kind: focusKind,
      };
    }
    this.layout(options.widthPx, options.heightPx);
    bindPointer(this, options.pointer);
    scene.add.existing(this);
  }

  render(view: ButtonView): this {
    if (this.focus.kind === 'outline') {
      this.focus.rect.setVisible(view.isFocused);
    }
    this.paintAppearance(view.appearance);
    const cursor = view.appearance === 'disabled' ? DISABLED_CURSOR : HOVER_CURSOR;
    // 비활성 버튼도 입력은 받아 그 위에서 비활성 커서를 보인다. 커서가 바뀔 때만 캔버스에 옮겨야
    // 누르는 동안 캔버스에 놓인 눌림 커서(pressedCursor)를 덮어쓰지 않는다.
    if (this.input !== null && this.input.cursor !== cursor) {
      this.input.cursor = cursor;
      if (view.isPointerOver) {
        this.scene.input.setCursor(this.input);
      }
    }
    return this;
  }

  playFocus(isFocused: boolean): this {
    if (this.focus.kind === 'outline') {
      return this;
    }
    const tweens = this.scene.tweens;
    const content = this.content();
    const xPx =
      this.width / 2 + (this.focus.kind === 'slide' && isFocused ? QUIET_FOCUS_OFFSET_PX : 0);
    tweens.killTweensOf([content, this.focusGlow]);
    if (this.focus.kind === 'slide') {
      tweens.add({
        targets: content,
        x: xPx,
        duration: MOTION.fastMs,
        ease: 'Cubic.Out',
      });
    }
    if (!isFocused) {
      this.focusGlow.setAlpha(0);
      return this;
    }
    this.focusGlow.setPosition(xPx, this.height / 2).setAlpha(FOCUS_GLOW_ALPHA);
    tweens.add({
      targets: this.focusGlow,
      alpha: 0,
      duration: MOTION.fastMs,
      ease: 'Quad.Out',
    });
    return this;
  }

  alignX(xPx: number, originX: number): this {
    return this.setX(xPx - this.width * originX);
  }

  setLabel(label: string): this {
    this.icon.setVisible(false);
    this.labelText.setText(label).setVisible(true);
    this.layout(this.options.widthPx, this.options.heightPx);
    return this;
  }

  setFixedSize(widthPx: number, heightPx: number): this {
    this.layout(widthPx, heightPx);
    return this;
  }

  setIcon(textureKey: string, sizePx: number): this {
    this.icon.setTexture(textureKey).setDisplaySize(sizePx, sizePx).setVisible(true);
    this.labelText.setVisible(false);
    this.layout(this.options.widthPx, this.options.heightPx);
    return this;
  }

  private content(): Phaser.GameObjects.Text | Phaser.GameObjects.Image {
    return this.icon.visible ? this.icon : this.labelText;
  }

  private layout(fixedWidthPx: number | undefined, fixedHeightPx: number | undefined): void {
    const padding = PADDING_PX[this.paint.variant];
    const paddingXPx = this.options.paddingXPx ?? padding.xPx;
    const content = this.content();
    const widthPx = fixedWidthPx ?? content.displayWidth + paddingXPx * 2;
    const heightPx = fixedHeightPx ?? content.displayHeight + padding.yPx * 2;
    this.setSize(widthPx, heightPx);
    this.background.setSize(widthPx, heightPx);
    if (this.focus.kind === 'outline') {
      this.focus.rect.setSize(
        widthPx + FOCUS_OUTLINE_GAP_PX * 2,
        heightPx + FOCUS_OUTLINE_GAP_PX * 2,
      );
    }
    this.scene.tweens.killTweensOf(content);
    content.setPosition(widthPx / 2, heightPx / 2);
    this.focusGlow.setDisplaySize(content.displayWidth, content.displayHeight);
    setContainerHitArea(this, this.hitArea, widthPx, heightPx);
  }

  private paintAppearance(appearance: ButtonAppearance): void {
    const paint = this.paint;
    switch (paint.variant) {
      case 'primary': {
        const { fill, label } = getPrimaryPaint(paint.colors, appearance);
        this.background.setFillStyle(fill);
        setTextColor(this.labelText, label);
        return;
      }
      case 'secondary': {
        const { border, fill, label } = getSecondaryPaint(paint.colors, appearance);
        this.background.setStrokeStyle(paint.borderWidthPx, border);
        this.setBackgroundFill(fill);
        setTextColor(this.labelText, label);
        this.icon.setTint(label);
        return;
      }
      case 'quiet': {
        const { fill, label, iconAlpha } = getQuietPaint(paint.colors, appearance);
        this.setBackgroundFill(fill);
        this.icon.setAlpha(iconAlpha);
        setTextColor(this.labelText, label);
        return;
      }
    }
  }

  private setBackgroundFill(color: number | null): void {
    if (color === null) {
      this.background.setFillStyle();
    } else {
      this.background.setFillStyle(color);
    }
  }
}
